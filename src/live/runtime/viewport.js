// viewport.js — o visor do modo 3D. Roda dentro de um iframe (viewport.html).
//
// Recebe do editor o código já instrumentado, executa, desenha a cena e devolve o que
// acontece no visor (clique, arraste do gizmo, erros). O iframe isola as falhas e dá ao
// código do aluno um `window` e um `document` próprios; não é uma barreira de segurança.
//
// Editor → visor: run, apply, select, highlight, inspect, mode, view, play
// Visor → editor: ready, ran, error, pick, hover, transform, inspect, mode

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { scriptPosition } from "../engine/instrument.js";

const LOOP_LIMIT_MS = { run: 2000, frame: 1000 };
const MODE_PROP = { translate: "position", rotate: "rotation", scale: "scale" };

const canvas = document.getElementById("vg-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x15171c); // fundo quando a cena não define cena.background

const editorCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
editorCamera.position.set(6, 4.5, 8);
const orbit = new OrbitControls(editorCamera, canvas);
orbit.target.set(0, 0.5, 0);
orbit.enableDamping = true;
orbit.update();

// Tudo o que é do editor (grade, eixos, ajudantes, seleção, gizmo) fica numa cena à parte,
// desenhada por cima da cena do aluno sem fazer parte dela.
const overlay = new THREE.Scene();
const grid = new THREE.GridHelper(20, 20, 0x4a5163, 0x2a2f3a);
grid.material.transparent = true;
grid.material.opacity = 0.6;
overlay.add(grid);
const axes = new THREE.AxesHelper(1);
axes.material.depthTest = false;
axes.renderOrder = 1;
overlay.add(axes);

const selectBox = new THREE.BoxHelper(undefined, 0xffc94d);
const hoverBox = new THREE.BoxHelper(undefined, 0x41c5ff);
for (const box of [selectBox, hoverBox]) {
  box.material.depthTest = false;
  box.material.transparent = true;
  box.renderOrder = 2;
  box.visible = false;
  overlay.add(box);
}
hoverBox.material.opacity = 0.7;

const gizmo = new TransformControls(editorCamera, canvas);
gizmo.setTranslationSnap(0.1);
gizmo.setRotationSnap(THREE.MathUtils.degToRad(5));
gizmo.setScaleSnap(0.1);
gizmo.setSize(0.9);
overlay.add(gizmo.getHelper());

const raycaster = new THREE.Raycaster();
const PROXY_GEOMETRY = new THREE.SphereGeometry(0.3, 12, 8);
const PROXY_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

const state = {
  current: null, // execução que está na tela
  view: "editor",
  mode: "translate",
  playing: true,
  elapsed: 0,
  selected: null, // { id, axes }
  hovered: null, // id vindo do mouse no visor
  highlighted: null, // id vindo do cursor no editor
};
let loopDeadline = Infinity;
let loopCount = 0;
let userRun = null; // execução cujo código está rodando agora (para rastrear eventos)

const post = (msg) => window.parent.postMessage({ source: "visugraph-viewport", ...msg }, "*");

// ---------------------------------------------------------------------------
// Execução do código

class Run {
  constructor(msg) {
    this.id = msg.runId;
    this.sceneId = msg.sceneId;
    this.cameraId = msg.cameraId;
    this.registry = new Map(); // id → instâncias criadas naquele trecho
    this.counts = new Map();
    this.idOf = new WeakMap();
    this.timers = new Set();
    this.listeners = [];
    this.helpers = [];
    this.proxies = [];
    this.animar = null;
    this.done = false;
    this.error = null;
    this.animError = false;
  }

  track(id, obj) {
    let list = this.registry.get(id);
    if (!list) this.registry.set(id, (list = []));
    if (list.length < 200) list.push(obj);
    this.counts.set(id, (this.counts.get(id) || 0) + 1);
    if (obj && typeof obj === "object") this.idOf.set(obj, id);
    return obj;
  }

  first(id) {
    return id == null ? null : this.registry.get(id)?.[0] ?? null;
  }

  /** Embrulha uma função do aluno (temporizador, evento): conta como código dele e relata erros. */
  wrap(fn, phase) {
    const run = this;
    return function (...args) {
      if (run !== state.current && run !== pending) return undefined;
      const prev = userRun;
      userRun = run;
      startGuard(LOOP_LIMIT_MS.frame);
      try {
        return fn.apply(this, args);
      } catch (err) {
        reportError(run, err, phase);
        return undefined;
      } finally {
        userRun = prev;
      }
    };
  }

  makeTimers() {
    const run = this;
    const add = (id, clear) => (run.timers.add({ id, clear }), id);
    return {
      setTimeout: (fn, ms, ...a) => add(window.setTimeout(run.wrap(fn, "timer"), ms, ...a), window.clearTimeout),
      setInterval: (fn, ms, ...a) => add(window.setInterval(run.wrap(fn, "timer"), ms, ...a), window.clearInterval),
      requestAnimationFrame: (fn) => add(window.requestAnimationFrame(run.wrap(fn, "timer")), window.cancelAnimationFrame),
      clearTimeout: (id) => window.clearTimeout(id),
      clearInterval: (id) => window.clearInterval(id),
      cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    };
  }

  /** Para tudo o que o código deixou rodando e libera a memória de vídeo. */
  stop(keep = new Set()) {
    for (const t of this.timers) t.clear(t.id);
    this.timers.clear();
    for (const l of this.listeners) nativeRemove.call(l.target, l.type, l.wrapped, l.options);
    this.listeners = [];
    for (const h of this.helpers) {
      overlay.remove(h);
      h.dispose?.();
    }
    for (const p of this.proxies) overlay.remove(p);
    this.helpers = [];
    this.proxies = [];
    const resources = new Set();
    const collect = (obj) => {
      if (!obj || typeof obj !== "object") return;
      if (obj.isBufferGeometry || obj.isMaterial || obj.isTexture) resources.add(obj);
      if (obj.isObject3D) {
        obj.traverse((child) => {
          if (child.geometry) resources.add(child.geometry);
          for (const m of [].concat(child.material || [])) resources.add(m);
          if (child.isLight) child.dispose?.();
        });
      }
    };
    for (const list of this.registry.values()) list.forEach(collect);
    collect(this.scene);
    for (const r of resources) {
      if (keep.has(r)) continue;
      if (r.isMaterial) for (const v of Object.values(r)) if (v && v.isTexture && !keep.has(v)) v.dispose();
      r.dispose();
    }
  }

  resources() {
    const set = new Set();
    for (const list of this.registry.values()) {
      for (const obj of list) {
        if (obj && (obj.isBufferGeometry || obj.isMaterial || obj.isTexture)) set.add(obj);
      }
    }
    return set;
  }
}

let pending = null;

function startGuard(ms) {
  loopDeadline = performance.now() + ms;
  loopCount = 0;
}

const vg = {
  THREE,
  t: (id, obj) => (userRun || pending || state.current).track(id, obj),
  l() {
    if ((++loopCount & 255) === 0 && performance.now() > loopDeadline) {
      loopDeadline = 0; // continua estourando até sair do laço
      throw new LoopLimitError();
    }
  },
  end(animar) {
    pending.done = true;
    pending.animar = animar;
  },
  fail(err) {
    pending.done = true;
    pending.error = err;
  },
  timers: null,
};
window.__vg = vg;

class LoopLimitError extends Error {
  constructor() {
    super("O laço não terminou a tempo: talvez a condição de parada nunca fique falsa.");
    this.name = "LoopLimitError";
  }
}

// Eventos registrados pelo código do aluno são removidos na execução seguinte.
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options) {
  const run = userRun;
  if (!run || typeof listener !== "function") return nativeAdd.call(this, type, listener, options);
  const wrapped = run.wrap(listener, "evento");
  run.listeners.push({ target: this, type, listener, wrapped, options });
  return nativeAdd.call(this, type, wrapped, options);
};
EventTarget.prototype.removeEventListener = function (type, listener, options) {
  for (const run of [state.current, pending]) {
    if (!run) continue;
    const i = run.listeners.findIndex((l) => l.target === this && l.type === type && l.listener === listener);
    if (i >= 0) {
      nativeRemove.call(this, type, run.listeners[i].wrapped, options);
      run.listeners.splice(i, 1);
      return undefined;
    }
  }
  return nativeRemove.call(this, type, listener, options);
};

function execute(msg) {
  if (msg.resetTime) state.elapsed = 0;
  const run = new Run(msg);
  pending = run;
  vg.timers = run.makeTimers();
  userRun = run;
  startGuard(LOOP_LIMIT_MS.run);
  const script = document.createElement("script");
  script.textContent = msg.script;
  try {
    document.head.appendChild(script); // executa na hora
  } finally {
    script.remove();
    userRun = null;
    pending = null;
  }
  if (!run.done && !run.error) run.error = runtimeSyntaxError || new Error("O código não terminou de rodar.");
  runtimeSyntaxError = null;
  if (run.error) {
    reportError(run, run.error, "run");
    run.stop();
    post({ type: "ran", runId: run.id, ok: false });
    return;
  }
  activate(run);
}

let runtimeSyntaxError = null;
window.addEventListener("error", (event) => {
  // Erro de sintaxe que o navegador encontrou (o Acorn deixou passar) ou erro fora do try.
  if (pending && !pending.done) {
    const err = event.error instanceof Error ? event.error : new SyntaxError(event.message);
    err.scriptLine = event.lineno;
    err.scriptColumn = Math.max(0, (event.colno || 1) - 1);
    runtimeSyntaxError = err;
    event.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (event) => {
  // Promessa rejeitada no código do aluno (função async que lançou erro).
  const err = event.reason;
  if (state.current && err instanceof Error && scriptPosition(err.stack)) {
    reportError(state.current, err, "async");
    event.preventDefault();
  }
});

function activate(run) {
  const old = state.current;
  run.scene = findScene(run);
  run.camera = run.first(run.cameraId)?.isCamera ? run.first(run.cameraId) : null;
  state.current = run;
  if (!run.scene) {
    reportError(run, new Error("Nenhuma cena foi criada: comece com const cena = new THREE.Scene();"), "run");
    run.scene = new THREE.Scene();
  }
  buildHelpers(run);
  if (!canvas.isConnected) document.body.prepend(canvas);
  state.selected = null;
  state.hovered = null;
  state.highlighted = null;
  gizmo.detach();
  updateGizmoCamera();

  const objects = [];
  for (const [id, list] of run.registry) objects.push({ id, count: run.counts.get(id), kind: kindOf(list[0]) });
  post({ type: "ran", runId: run.id, ok: true, objects, hasAnimar: typeof run.animar === "function", hasCodeCamera: !!run.camera });

  if (old) {
    // Libera a execução anterior depois de desenhar a nova: os shaders iguais são reaproveitados.
    const keep = run.resources();
    requestAnimationFrame(() => requestAnimationFrame(() => old.stop(keep)));
  }
}

function findScene(run) {
  const byId = run.first(run.sceneId);
  if (byId && byId.isScene) return byId;
  for (const list of run.registry.values()) for (const obj of list) if (obj && obj.isScene) return obj;
  return null;
}

function kindOf(obj) {
  if (!obj) return "other";
  if (obj.isScene) return "scene";
  if (obj.isMesh) return "mesh";
  if (obj.isLight) return "light";
  if (obj.isCamera) return "camera";
  if (obj.isMaterial) return "material";
  if (obj.isBufferGeometry) return "geometry";
  if (obj.isObject3D) return "object";
  return "other";
}

function buildHelpers(run) {
  run.scene.traverse((obj) => {
    let helper = null;
    if (obj.isDirectionalLight) helper = new THREE.DirectionalLightHelper(obj, 0.5);
    else if (obj.isSpotLight) helper = new THREE.SpotLightHelper(obj);
    else if (obj.isPointLight) helper = new THREE.PointLightHelper(obj, 0.15);
    else if (obj.isHemisphereLight) helper = new THREE.HemisphereLightHelper(obj, 0.3);
    if (helper) addHelper(run, helper, obj);
  });
  if (run.camera) {
    // Um CameraHelper da câmera do código iria até o plano distante e cruzaria a cena toda:
    // desenha uma cópia curta dela, que acompanha a original a cada quadro.
    const icon = new THREE.PerspectiveCamera();
    const helper = new THREE.CameraHelper(icon);
    const c = (hex) => new THREE.Color(hex);
    helper.setColors(c(0xffc94d), c(0xffc94d), c(0x41c5ff), c(0xffffff), c(0x8a8f99));
    helper.userData.icon = icon;
    addHelper(run, helper, run.camera);
  }
}

function syncCameraIcon(helper) {
  const camera = helper.userData.target;
  const icon = helper.userData.icon;
  camera.updateWorldMatrix(true, false);
  camera.matrixWorld.decompose(icon.position, icon.quaternion, icon.scale);
  icon.fov = camera.fov ?? 50;
  icon.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  icon.near = 0.05;
  icon.far = 0.6;
  icon.updateProjectionMatrix();
  icon.updateMatrixWorld();
}

function addHelper(run, helper, target) {
  helper.userData.target = target;
  run.helpers.push(helper);
  overlay.add(helper);
  // esfera invisível para clicar em luzes e câmeras, que não têm geometria
  const proxy = new THREE.Mesh(PROXY_GEOMETRY, PROXY_MATERIAL);
  proxy.userData.target = target;
  run.proxies.push(proxy);
  overlay.add(proxy);
}

// ---------------------------------------------------------------------------
// Erros

function reportError(run, err, phase) {
  const error = err instanceof Error ? err : new Error(String(err));
  if (phase === "animar") run.animError = true;
  const pos =
    scriptPosition(error.stack) ||
    (error.scriptLine ? { line: error.scriptLine, column: error.scriptColumn } : null) ||
    (error.lineNumber ? { line: error.lineNumber, column: Math.max(0, (error.columnNumber || 1) - 1) } : null);
  post({
    type: "error",
    runId: run.id,
    phase,
    name: error.name,
    message: error.message,
    line: pos ? pos.line : null,
    column: pos ? pos.column : null,
    loop: error instanceof LoopLimitError,
  });
}

// ---------------------------------------------------------------------------
// Seleção, destaque e gizmo

function targetOf(id) {
  return state.current ? state.current.first(id) : null;
}

function boxTarget(obj) {
  if (!obj || !obj.isObject3D) return null;
  if (obj.isLight || obj.isCamera) return state.current.proxies.find((p) => p.userData.target === obj) || null;
  return obj;
}

function select(msg) {
  const obj = targetOf(msg.id);
  state.selected = obj && obj.isObject3D && !obj.isScene ? { id: msg.id, axes: msg.axes || {} } : null;
  attachGizmo();
}

function attachGizmo() {
  const sel = state.selected;
  const obj = sel && targetOf(sel.id);
  const axes = sel && sel.axes[MODE_PROP[state.mode]];
  if (!obj || !axes || !axes.some(Boolean)) {
    gizmo.detach();
    return;
  }
  gizmo.setMode(state.mode);
  gizmo.showX = axes[0];
  gizmo.showY = axes[1];
  gizmo.showZ = axes[2];
  // planos e a esfera livre só quando todos os eixos podem mudar
  const all = axes.every(Boolean);
  gizmo.showXY = gizmo.showYZ = gizmo.showXZ = gizmo.showXYZE = all;
  gizmo.attach(obj);
}

function updateBoxes() {
  const sel = state.selected && boxTarget(targetOf(state.selected.id));
  setBox(selectBox, sel);
  const hoverId = state.hovered ?? state.highlighted;
  const hov = hoverId != null && hoverId !== state.selected?.id ? boxTarget(targetOf(hoverId)) : null;
  setBox(hoverBox, hov);
}

function setBox(box, obj) {
  if (!obj) {
    box.visible = false;
    return;
  }
  box.setFromObject(obj);
  box.visible = true;
}

let dragStart = null;
gizmo.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
});
gizmo.addEventListener("mouseDown", () => {
  const obj = gizmo.object;
  const prop = MODE_PROP[state.mode];
  dragStart = { id: state.selected.id, prop, start: vectorOf(obj, prop) };
});
let transformQueued = false;
gizmo.addEventListener("objectChange", () => {
  if (!dragStart || transformQueued) return;
  transformQueued = true;
  requestAnimationFrame(() => {
    transformQueued = false;
    sendTransform(false);
  });
});
gizmo.addEventListener("mouseUp", () => {
  if (!dragStart) return;
  sendTransform(true);
  dragStart = null;
});

function sendTransform(final) {
  if (!dragStart) return;
  const obj = targetOf(dragStart.id);
  if (!obj) return;
  post({ type: "transform", id: dragStart.id, prop: dragStart.prop, values: vectorOf(obj, dragStart.prop), start: dragStart.start, final });
}

function vectorOf(obj, prop) {
  const v = obj[prop];
  return [v.x, v.y, v.z];
}

// Clique (sem arrastar) seleciona; passar o mouse destaca.
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, onGizmo: gizmo.axis !== null && !!gizmo.object };
});
canvas.addEventListener("pointerup", (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const onGizmo = down.onGizmo;
  down = null;
  if (moved > 4 || onGizmo || e.button !== 0) return;
  post({ type: "pick", id: pickAt(e.clientX, e.clientY) });
});
let hoverQueued = null;
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons || gizmo.dragging) return;
  if (!hoverQueued) {
    requestAnimationFrame(() => {
      const { x, y } = hoverQueued;
      hoverQueued = null;
      const id = gizmo.axis ? null : pickAt(x, y);
      if (id !== state.hovered) {
        state.hovered = id;
        post({ type: "hover", id });
      }
    });
  }
  hoverQueued = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerleave", () => {
  if (state.hovered != null) {
    state.hovered = null;
    post({ type: "hover", id: null });
  }
});

function pickAt(clientX, clientY) {
  const run = state.current;
  if (!run) return null;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, activeCamera());
  const hits = [];
  if (state.view === "editor") {
    for (const h of raycaster.intersectObjects(run.proxies, false)) hits.push({ distance: h.distance, object: h.object.userData.target });
  }
  for (const h of raycaster.intersectObject(run.scene, true)) {
    if (isShown(h.object)) hits.push({ distance: h.distance, object: h.object });
  }
  hits.sort((a, b) => a.distance - b.distance);
  for (const hit of hits) {
    for (let o = hit.object; o; o = o.parent) {
      const id = run.idOf.get(o);
      if (id != null && !o.isScene) return id;
    }
  }
  return null;
}

function isShown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Atalhos no visor: W/E/R trocam o modo do gizmo, Esc tira a seleção, F centraliza.
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const mode = { w: "translate", e: "rotate", r: "scale" }[e.key.toLowerCase()];
  if (mode) {
    setMode(mode);
    post({ type: "mode", mode });
  } else if (e.key === "Escape") {
    post({ type: "pick", id: null });
  } else if (e.key.toLowerCase() === "f" && state.selected) {
    const obj = targetOf(state.selected.id);
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.isEmpty() ? obj.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
      editorCamera.position.add(center.clone().sub(orbit.target));
      orbit.target.copy(center);
    }
  }
});

function setMode(mode) {
  state.mode = mode;
  attachGizmo();
}

// ---------------------------------------------------------------------------
// Propriedades: edição rápida (sem rodar o código de novo) e leitura para o painel

function applyProp(msg) {
  const list = state.current?.registry.get(msg.id) || [];
  for (const obj of list) setProp(obj, msg.key, msg.value);
}

function setProp(obj, key, value) {
  const [p0, axis] = key.split(".");
  if (axis && obj[p0] && typeof obj[p0][axis] === "number") {
    obj[p0][axis] = value;
    return;
  }
  const current = obj[key];
  if (current && current.isColor) current.set(value);
  else if (key === "background") obj.background = new THREE.Color(value);
  else obj[key] = value;
  if (obj.isMaterial && typeof value === "boolean") obj.needsUpdate = true;
  if (obj.isCamera) obj.updateProjectionMatrix();
}

const READ_KEYS = [
  "visible", "castShadow", "receiveShadow", "color", "emissive", "emissiveIntensity", "specular", "shininess", "roughness",
  "metalness", "opacity", "transparent", "wireframe", "flatShading", "groundColor", "intensity", "distance", "decay", "angle",
  "penumbra", "fov", "near", "far", "background",
];

function readValues(id) {
  const obj = targetOf(id);
  if (!obj) return null;
  const values = {};
  if (obj.isObject3D) {
    for (const p of ["position", "rotation", "scale"]) ["x", "y", "z"].forEach((a) => (values[`${p}.${a}`] = obj[p][a]));
  }
  for (const key of READ_KEYS) {
    if (!(key in obj)) continue;
    const v = obj[key];
    if (v && v.isColor) values[key] = "#" + v.getHexString();
    else if (typeof v === "number" || typeof v === "boolean") values[key] = v;
  }
  if (obj.isBufferGeometry && obj.parameters) Object.assign(values, obj.parameters);
  return values;
}

function inspect(msg) {
  const values = {};
  for (const id of msg.ids || []) values[id] = readValues(id);
  post({ type: "inspect", ids: msg.ids, values });
}

// ---------------------------------------------------------------------------
// Desenho

function activeCamera() {
  return state.view === "camera" && state.current?.camera ? state.current.camera : editorCamera;
}

function updateGizmoCamera() {
  gizmo.camera = activeCamera();
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  editorCamera.aspect = w / h;
  editorCamera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const clock = new THREE.Timer();
const background = new THREE.Color("#15171c");

function frame(time) {
  requestAnimationFrame(frame);
  clock.update(time);
  const dt = Math.min(clock.getDelta(), 0.1);
  const run = state.current;
  if (run && state.playing && run.animar && !run.animError) {
    state.elapsed += dt;
    const prev = userRun;
    userRun = run;
    startGuard(LOOP_LIMIT_MS.frame);
    try {
      run.animar(state.elapsed, dt);
    } catch (err) {
      reportError(run, err, "animar");
    } finally {
      userRun = prev;
    }
  }
  orbit.update();

  const camera = activeCamera();
  const editorView = camera === editorCamera;
  if (!editorView && camera.isPerspectiveCamera) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }
  renderer.autoClear = true;
  if (run) renderer.render(run.scene, camera);
  else {
    renderer.setClearColor(background);
    renderer.clear();
  }

  if (run) {
    for (const h of run.helpers) {
      h.visible = editorView && isShown(h.userData.target);
      if (h.userData.icon) syncCameraIcon(h);
      h.update?.();
    }
    for (const p of run.proxies) p.userData.target.getWorldPosition(p.position);
  }
  grid.visible = axes.visible = editorView;
  updateBoxes();
  renderer.autoClear = false;
  renderer.render(overlay, camera);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Mensagens do editor

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.source !== "visugraph-editor") return;
  switch (msg.type) {
    case "run":
      execute(msg);
      break;
    case "apply":
      applyProp(msg);
      break;
    case "select":
      select(msg);
      break;
    case "highlight":
      state.highlighted = msg.id;
      break;
    case "inspect":
      inspect(msg);
      break;
    case "mode":
      setMode(msg.mode);
      break;
    case "view":
      state.view = msg.view === "camera" ? "camera" : "editor";
      updateGizmoCamera();
      break;
    case "play":
      state.playing = !!msg.playing;
      break;
  }
});

// Ganchos para os testes de ponta a ponta: onde cada objeto aparece na tela.
window.__vgDebug = {
  project(id) {
    const obj = targetOf(id);
    if (!obj || !obj.isObject3D) return null;
    const box = new THREE.Box3().setFromObject(obj);
    const p = box.isEmpty() ? obj.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    return toScreen(p);
  },
  /** Ponto da seta do gizmo no eixo dado ("x", "y" ou "z"), em coordenadas da janela do iframe. */
  gizmoHandle(axis) {
    const obj = gizmo.object;
    if (!obj) return null;
    const origin = obj.getWorldPosition(new THREE.Vector3());
    const camera = activeCamera();
    const factor = origin.distanceTo(camera.position) * Math.min((1.9 * Math.tan((Math.PI * camera.fov) / 360)) / camera.zoom, 7);
    const dir = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
    // a seta e a área de clique do eixo vão de 0 a 0,6 na escala do gizmo
    return toScreen(origin.add(dir.multiplyScalar(((factor * gizmo.size) / 4) * 0.5)));
  },
  info() {
    return {
      runId: state.current?.id ?? null,
      selected: state.selected?.id ?? null,
      gizmo: gizmo.object ? state.mode : null,
      view: state.view,
      elapsed: state.elapsed,
      objects: state.current ? [...state.current.counts.entries()] : [],
    };
  },
  value(id, path) {
    let v = targetOf(id);
    for (const k of path.split(".")) v = v == null ? v : v[k];
    return v && v.isColor ? "#" + v.getHexString() : v;
  },
};

function toScreen(p) {
  const v = p.clone().project(activeCamera());
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

post({ type: "ready" });
