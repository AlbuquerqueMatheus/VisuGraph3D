// viewport.js — o visor do modo 3D. Roda dentro de um iframe (viewport.html).
//
// Recebe do editor o código já instrumentado, executa, desenha a cena e devolve o que
// acontece no visor (clique, arraste do gizmo, erros). O iframe isola as falhas e dá ao
// código do aluno um `window` e um `document` próprios; não é uma barreira de segurança.
//
// Editor → visor: run, apply, select, highlight, inspect, mode, view, play, math, marker, glass, probe
// Visor → editor: ready, ran, error, pick, hover, transform, inspect, mode, math, probe, facts

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { scriptPosition } from "../engine/instrument.js";
import { columnMajor, fromColumnMajor, multiply, normalMatrix } from "../../lib/transform3d.js";
import { normalize, dot } from "../../lib/phong.js";
import { shadePoint } from "../../lib/phong3d.js";
import { localMatrix, objectMath, projectionMatrix, viewOf, worldMatrix } from "../mathModel.js";
import { collectLights, createGlassMaterial, glassTerms, setLightUniforms, syncGlass } from "./glass.js";
import { sceneFacts, trailPoint } from "./facts.js";
import { belongsTo, failureInfo, samplePixels, sampleSurface } from "./shaders.js";

const LOOP_LIMIT_MS = { run: 2000, frame: 1000 };
// O navegador aceita uns 16 contextos WebGL por página e derruba o mais antigo (o do visor)
// quando passa disso; cada WebGLRenderer criado pelo código ocupa um.
const MAX_CODE_RENDERERS = 4;

// O rastro de cada objeto: quantos segundos o visor guarda e de quanto em quanto tempo anota.
const TRAIL_SECONDS = 20;
const TRAIL_STEP = 1 / 30;
const MODE_PROP = { translate: "position", rotate: "rotation", scale: "scale" };

const post = (msg) => window.parent.postMessage({ source: "visugraph-viewport", ...msg }, "*");
/** Primeira notícia do visor (ready ou fatal): fica guardada para o editor que carregar depois. */
function announce(msg) {
  window.__vgEarly = msg;
  post(msg);
}

// Temporizadores do navegador, guardados antes de o código do aluno ganhar versões rastreadas.
const nativeTimers = {
  setTimeout: window.setTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  clearInterval: window.clearInterval.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};
const raf = nativeTimers.requestAnimationFrame;

const canvas = document.getElementById("vg-canvas");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  announce({
    type: "fatal",
    message: "O visor 3D precisa de WebGL, e este navegador não conseguiu ligá-lo. Tente outro navegador ou ative a aceleração por hardware.",
  });
  throw err;
}
// O contexto do visor pode ser perdido (código que cria muitos WebGLRenderer, falha da GPU):
// o editor recarrega o visor.
canvas.addEventListener("webglcontextlost", () => post({ type: "contextlost" }));
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

// Contornos tracejados do alvo de um desafio, por cima de tudo: aparecem mesmo com o objeto
// dentro deles.
const ghosts = new THREE.Group();
overlay.add(ghosts);

const gizmo = new TransformControls(editorCamera, canvas);
gizmo.setTranslationSnap(0.1);
gizmo.setRotationSnap(THREE.MathUtils.degToRad(5));
gizmo.setScaleSnap(0.1);
gizmo.setSize(0.9);
overlay.add(gizmo.getHelper());
// O gizmo só move objetos que estão numa cena. Um objeto sem pai (a câmera do código, que
// não precisa de cena.add, ou um objeto que ainda não foi adicionado) é movido por este
// substituto, copiado para o objeto a cada mudança.
const handle = new THREE.Object3D();
overlay.add(handle);

const raycaster = new THREE.Raycaster();
// Pontos e linhas não têm superfície: o raio acerta o que passa a esta folga (em pixels) deles.
const PICK_SLACK_PX = 6;
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
  glass: null, // "phong" ou "blinn": a cena é desenhada pelo shader caixa de vidro
  marker: null, // { id, vertex }: vértice cujo caminho até o pixel o painel mostra
  probe: null, // { bx, by, at, seq }: pixel (do buffer) onde a sonda mede a iluminação
};
let loopDeadline = Infinity;
let loopCount = 0;
let loopTripped = false; // o prazo estourou: todo laço para até a próxima chamada do aluno
let freeGuard = false; // há um prazo valendo para código fora de um contexto conhecido
let userRun = null; // execução cujo código está rodando agora (para rastrear eventos e temporizadores)

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
    this.timers = new Map(); // "t:id" (setTimeout/setInterval) ou "r:id" (requestAnimationFrame) → tipo
    this.renderers = []; // WebGLRenderer criados pelo código, do mais antigo ao mais novo
    this.listeners = [];
    this.helpers = [];
    this.proxies = [];
    this.animar = null;
    this.done = false;
    this.error = null;
    this.animError = false;
    this.halted = false; // um laço infinito num temporizador ou evento: o resto deles para
    this.loopError = null; // laço interrompido cujo erro o código do aluno pode ter engolido
    this.glass = new Map(); // malha → materiais da caixa de vidro (um por material dela)
    this.shaders = false; // a cena tem ShaderMaterial: o visor confere se os shaders compilam
    this.shaderErrors = new Set(); // shaders cujo erro esta execução já relatou (keyOf)
    // id → [[tempo, x, y, z], …] dos que já saíram do lugar, e id → [tempo, x, y, z] dos parados (recordTrail)
    this.trail = { first: null, last: -Infinity, points: new Map(), still: new Map() };
  }

  track(id, obj) {
    let list = this.registry.get(id);
    if (!list) this.registry.set(id, (list = []));
    if (list.length < 200) list.push(obj);
    this.counts.set(id, (this.counts.get(id) || 0) + 1);
    if (obj && typeof obj === "object") this.idOf.set(obj, id);
    if (obj && obj.isWebGLRenderer) {
      // um renderizador criado a cada quadro em animar() esgotaria os contextos em segundos
      this.renderers.push(obj);
      while (this.renderers.length > MAX_CODE_RENDERERS) disposeRenderer(this.renderers.shift());
    }
    return obj;
  }

  first(id) {
    return id == null ? null : this.registry.get(id)?.[0] ?? null;
  }

  /** Embrulha uma função do aluno (temporizador, evento): conta como código dele e relata erros. */
  wrap(fn, phase) {
    const run = this;
    return function (...args) {
      if (run.halted || (run !== state.current && run !== pending)) return undefined;
      const prev = userRun;
      userRun = run;
      // Chamada de dentro do próprio código (evento disparado num laço): vale o prazo de fora.
      if (!prev) startGuard(LOOP_LIMIT_MS.frame);
      let escaped = false;
      try {
        return fn.apply(this, args);
      } catch (err) {
        escaped = true;
        reportError(run, loopAware(run, err), phase);
        return undefined;
      } finally {
        userRun = prev;
        if (!prev && !escaped) reportSwallowedLoop(run, phase);
      }
    };
  }

  /** Agenda `fn` com o temporizador `kind` do navegador; a execução seguinte cancela. */
  schedule(kind, fn, args) {
    const run = this;
    const group = kind === "requestAnimationFrame" ? "r" : "t";
    const wrapped = run.wrap(fn, "timer");
    let id;
    const callback =
      kind === "setInterval"
        ? wrapped
        : function (...a) {
          run.timers.delete(`${group}:${id}`);
          return wrapped.apply(this, a);
        };
    id = nativeTimers[kind](callback, ...args);
    run.timers.set(`${group}:${id}`, kind);
    return id;
  }

  /** Versões dos temporizadores que o código do aluno recebe no lugar das do navegador. */
  makeTimers() {
    const run = this;
    const timer = (kind) => (fn, ...args) => (typeof fn === "function" ? run.schedule(kind, fn, args) : nativeTimers[kind](fn, ...args));
    return {
      setTimeout: timer("setTimeout"),
      setInterval: timer("setInterval"),
      requestAnimationFrame: timer("requestAnimationFrame"),
      clearTimeout,
      clearInterval,
      cancelAnimationFrame,
    };
  }

  /** Para tudo o que o código deixou rodando e libera a memória de vídeo. */
  stop(keep = new Set()) {
    const clear = { setTimeout: "clearTimeout", setInterval: "clearInterval", requestAnimationFrame: "cancelAnimationFrame" };
    for (const [key, kind] of this.timers) nativeTimers[clear[kind]](Number(key.slice(2)));
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
    this.disposeRenderers();
    for (const list of this.glass.values()) for (const m of list) m?.dispose();
    this.glass.clear();
    for (const r of resources) {
      if (keep.has(r)) continue;
      if (r.isMaterial) for (const v of Object.values(r)) if (v && v.isTexture && !keep.has(v)) v.dispose();
      r.dispose();
    }
  }

  /** Libera os contextos WebGL dos renderizadores criados pelo código (o VisuGraph já desenha a cena). */
  disposeRenderers() {
    this.renderers.forEach(disposeRenderer);
    this.renderers = [];
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

// O código também chega aos temporizadores por window (window.setTimeout, e o
// renderer.setAnimationLoop do Three usa self.requestAnimationFrame): enquanto ele roda,
// passam pelas versões rastreadas.
for (const kind of ["setTimeout", "setInterval", "requestAnimationFrame"]) {
  window[kind] = function (fn, ...args) {
    const run = userRun;
    return run && typeof fn === "function" ? run.schedule(kind, fn, args) : nativeTimers[kind](fn, ...args);
  };
}
function forgetTimer(group, id) {
  for (const run of [state.current, pending, userRun]) run?.timers.delete(`${group}:${id}`);
}
window.clearTimeout = (id) => (forgetTimer("t", id), nativeTimers.clearTimeout(id));
window.clearInterval = (id) => (forgetTimer("t", id), nativeTimers.clearInterval(id));
window.cancelAnimationFrame = (id) => (forgetTimer("r", id), nativeTimers.cancelAnimationFrame(id));

// Valores globais do Three que o código pode mudar (THREE.Object3D.DEFAULT_UP.set(0, 0, 1)):
// cada execução começa dos originais, senão o efeito de uma linha apagada continuaria valendo.
const DEFAULTS = {
  up: THREE.Object3D.DEFAULT_UP.clone(),
  matrixAutoUpdate: THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE,
  matrixWorldAutoUpdate: THREE.Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,
  colorManagement: THREE.ColorManagement.enabled,
  workingColorSpace: THREE.ColorManagement.workingColorSpace,
  cache: THREE.Cache.enabled,
};

function restoreDefaults() {
  THREE.Object3D.DEFAULT_UP = DEFAULTS.up.clone();
  THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE = DEFAULTS.matrixAutoUpdate;
  THREE.Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = DEFAULTS.matrixWorldAutoUpdate;
  THREE.ColorManagement.enabled = DEFAULTS.colorManagement;
  THREE.ColorManagement.workingColorSpace = DEFAULTS.workingColorSpace;
  THREE.Cache.enabled = DEFAULTS.cache;
}

const disposedRenderers = new WeakSet();

function disposeRenderer(r) {
  if (disposedRenderers.has(r)) return;
  disposedRenderers.add(r);
  r.setAnimationLoop(null);
  r.dispose();
  if (r.domElement && r.domElement !== canvas) {
    if (!r.getContext().isContextLost()) r.forceContextLoss();
    r.domElement.remove();
  }
}

function startGuard(ms) {
  loopDeadline = performance.now() + ms;
  loopCount = 0;
  loopTripped = false;
}

/**
 * Erro a relatar depois de um trecho do código: o do primeiro laço interrompido, se houve um.
 * Com try/catch o código pode ter engolido esse erro, e os laços seguintes param no começo.
 */
function loopAware(run, err) {
  const first = run.loopError;
  run.loopError = null;
  return first && (!err || err instanceof LoopLimitError) ? first : err;
}

/** O código engoliu (com try/catch) o erro de um laço interrompido: avisa assim mesmo. */
function reportSwallowedLoop(run, phase) {
  const err = loopAware(run, null);
  if (err) reportError(run, err, phase);
}

const vg = {
  THREE,
  t: (id, obj) => (userRun || pending || state.current).track(id, obj),
  l() {
    if (!userRun && !freeGuard) {
      // Código do aluno fora de um contexto conhecido (depois de um await, num then):
      // o prazo vale até o fim desta tarefa do navegador.
      freeGuard = true;
      startGuard(LOOP_LIMIT_MS.frame);
      nativeTimers.setTimeout(() => (freeGuard = false), 0);
    }
    if (loopTripped || ((++loopCount & 255) === 0 && performance.now() > loopDeadline)) {
      loopTripped = true; // continua estourando até sair de todos os laços, mesmo com try/catch
      const err = new LoopLimitError();
      if (userRun && !userRun.loopError) userRun.loopError = err;
      throw err;
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
const captureOf = (options) => (typeof options === "boolean" ? options : !!(options && options.capture));
const sameListener = (l, target, type, listener, capture) =>
  l.target === target && l.type === type && l.listener === listener && l.capture === capture;

EventTarget.prototype.addEventListener = function (type, listener, options) {
  const run = userRun;
  if (!run || typeof listener !== "function") return nativeAdd.call(this, type, listener, options);
  const capture = captureOf(options);
  // como no navegador, registrar a mesma função de novo não faz nada
  if (run.listeners.some((l) => sameListener(l, this, type, listener, capture))) return undefined;
  const entry = { target: this, type, listener, capture, options, wrapped: null };
  const forget = () => {
    const i = run.listeners.indexOf(entry);
    if (i >= 0) run.listeners.splice(i, 1);
  };
  const inner = run.wrap(listener, "evento");
  entry.wrapped = options && options.once ? function (...a) {
    forget();
    return inner.apply(this, a);
  } : inner;
  if (options && options.signal) nativeAdd.call(options.signal, "abort", forget, { once: true });
  run.listeners.push(entry);
  return nativeAdd.call(this, type, entry.wrapped, options);
};
EventTarget.prototype.removeEventListener = function (type, listener, options) {
  const capture = captureOf(options);
  for (const run of [state.current, pending]) {
    if (!run) continue;
    const i = run.listeners.findIndex((l) => sameListener(l, this, type, listener, capture));
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
  restoreDefaults();
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
  run.error = loopAware(run, run.error);
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
  run.shaders = [...run.registry.values()].some((list) => list.some((obj) => obj?.isShaderMaterial));
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
  state.marker = null; // os ids podem ter mudado: o editor manda o marcador de novo
  if (state.probe) state.probe.at = 0;
  detachGizmo();
  updateGizmoCamera();

  const objects = [];
  for (const [id, list] of run.registry) objects.push({ id, count: run.counts.get(id), kind: kindOf(list[0]) });
  post({ type: "ran", runId: run.id, ok: true, objects, hasAnimar: typeof run.animar === "function", hasCodeCamera: !!run.camera });

  if (old) {
    // Os contextos WebGL do código anterior saem já; o resto sai depois de desenhar a cena
    // nova, para os shaders iguais serem reaproveitados.
    old.disposeRenderers();
    const keep = run.resources();
    raf(() => raf(() => old.stop(keep)));
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
  if (obj.isPoints) return "points";
  if (obj.isLine) return "line";
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
    if (obj.isDirectionalLight) addShadowBox(run, obj);
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

/** As 12 arestas de uma caixa, pelos números dos cantos (bit 0: x, bit 1: y, bit 2: z). */
const BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * A caixa que a câmera da sombra de uma luz direcional enxerga: só o que está dentro dela faz e
 * recebe sombra. Aparece com a luz selecionada, se ela faz sombra (castShadow), e acompanha a
 * câmera da sombra, que o desenho põe na luz, olhando para o alvo, a cada quadro.
 */
function addShadowBox(run, light) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BOX_EDGES.length * 6), 3));
  const material = new THREE.LineBasicMaterial({ color: 0xffc94d, depthTest: false, transparent: true, opacity: 0.85 });
  const box = new THREE.LineSegments(geometry, material);
  box.matrixAutoUpdate = false;
  box.renderOrder = 1;
  box.userData.target = light;
  box.userData.shadow = true;
  box.update = () => syncShadowBox(box);
  box.dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  run.helpers.push(box);
  overlay.add(box);
}

function syncShadowBox(box) {
  const camera = box.userData.target.shadow.camera;
  // as bordas como a câmera ortográfica as usa na projeção, com o zoom
  const cx = (camera.left + camera.right) / 2;
  const cy = (camera.top + camera.bottom) / 2;
  const dx = (camera.right - camera.left) / (2 * camera.zoom);
  const dy = (camera.top - camera.bottom) / (2 * camera.zoom);
  const corner = (i) => [i & 1 ? cx + dx : cx - dx, i & 2 ? cy + dy : cy - dy, i & 4 ? -camera.far : -camera.near];
  const position = box.geometry.attributes.position;
  BOX_EDGES.forEach(([a, b], k) => {
    position.setXYZ(2 * k, ...corner(a));
    position.setXYZ(2 * k + 1, ...corner(b));
  });
  position.needsUpdate = true;
  box.geometry.computeBoundingSphere();
  box.matrix.copy(camera.matrixWorld);
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
  // num setInterval, por exemplo, cada chamada travaria a página por 1 s
  else if (phase !== "run" && error instanceof LoopLimitError) run.halted = true;
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

// Shaders que não compilam. O three.js só confere um programa no primeiro desenho dele, e guarda o
// programa para os materiais seguintes com os mesmos textos: a execução seguinte, com o mesmo erro,
// ganharia o programa quebrado em silêncio. Por isso o erro fica guardado pelos textos dos dois
// shaders, e cada execução o relata de novo (src/live/runtime/shaders.js diz a linha).
const MAX_SHADER_FAILURES = 64;
const shaderFailures = new Map(); // textos dos dois shaders → failureInfo
const newShaderFailures = []; // o que o WebGL disse dos programas que falharam desde o último desenho
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  const stage = (name, shader) => ({ stage: name, log: gl.getShaderInfoLog(shader) || "", source: gl.getShaderSource(shader) || "" });
  newShaderFailures.push({ stages: [stage("vertex", vertex), stage("fragment", fragment)], programLog: gl.getProgramInfoLog(program) || "" });
};

const shaderKeys = new WeakMap(); // material → { vertex, fragment, key }

/** A chave de um ShaderMaterial: os textos dos dois shaders. */
function keyOf(material) {
  let k = shaderKeys.get(material);
  if (!k || k.vertex !== material.vertexShader || k.fragment !== material.fragmentShader) {
    k = { vertex: material.vertexShader, fragment: material.fragmentShader, key: `${material.vertexShader}\u0000${material.fragmentShader}` };
    shaderKeys.set(material, k);
  }
  return k.key;
}

const shaderFailureOf = (material) => (material?.isShaderMaterial ? shaderFailures.get(keyOf(material)) ?? null : null);

function reportShader(run, info, key = null) {
  if (key != null) {
    if (run.shaderErrors.has(key)) return;
    run.shaderErrors.add(key);
  }
  post({
    type: "error",
    runId: run.id,
    phase: "shader",
    name: "ShaderError",
    stage: info.stage,
    message: info.message,
    glsl: info.source != null ? { line: info.line, source: info.source } : null,
    line: null,
    column: null,
    loop: false,
  });
}

// No lugar de um shader que não compila, um magenta chapado: o sinal de "shader quebrado" dos
// editores de jogos. Sem ele, a malha sumiria e o WebGL reclamaria a cada quadro.
const BROKEN_SHADER = {
  mesh: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  points: new THREE.PointsMaterial({ color: 0xff00ff, size: 3, sizeAttenuation: false }),
  line: new THREE.LineBasicMaterial({ color: 0xff00ff }),
};

/**
 * Antes de desenhar: troca cada material cujo shader não compila pelo magenta (e relata o erro, uma
 * vez por execução). Devolve como desfazer a troca, ou null se não trocou nada.
 */
function coverBrokenShaders(run) {
  const swapped = [];
  run.scene.traverse((obj) => {
    if (!obj.material) return;
    let changed = false;
    const replaced = [].concat(obj.material).map((material) => {
      const info = shaderFailureOf(material);
      if (!info) return material;
      reportShader(run, info, keyOf(material));
      changed = true;
      return obj.isPoints ? BROKEN_SHADER.points : obj.isLine ? BROKEN_SHADER.line : BROKEN_SHADER.mesh;
    });
    if (!changed) return;
    swapped.push([obj, obj.material]);
    obj.material = Array.isArray(obj.material) ? replaced : replaced[0];
  });
  return swapped.length ? () => swapped.forEach(([obj, material]) => (obj.material = material)) : null;
}

/** Depois de desenhar: cada programa que acabou de falhar vira o erro dos materiais dele. */
function resolveShaderFailures(run) {
  for (const failure of newShaderFailures.splice(0)) {
    let found = false;
    run.scene.traverse((obj) => {
      for (const material of [].concat(obj.material ?? [])) {
        if (!material?.isShaderMaterial || !belongsTo(failure, material)) continue;
        found = true;
        run.shaders = true;
        const key = keyOf(material);
        if (!shaderFailures.has(key)) {
          shaderFailures.set(key, failureInfo(failure, material));
          if (shaderFailures.size > MAX_SHADER_FAILURES) shaderFailures.delete(shaderFailures.keys().next().value);
        }
        reportShader(run, shaderFailures.get(key), key);
      }
    });
    // um programa que não é de um material da cena (montado com #include, por exemplo): sem a linha
    if (!found) reportShader(run, failureInfo(failure, {}));
  }
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
  // olhando pela própria câmera do código, o gizmo dela ficaria dentro da lente
  if (!obj || obj === activeCamera() || !axes || !axes.some(Boolean)) {
    detachGizmo();
    return;
  }
  gizmo.setMode(state.mode);
  gizmo.showX = axes[0];
  gizmo.showY = axes[1];
  gizmo.showZ = axes[2];
  // planos e a esfera livre só quando todos os eixos podem mudar
  const all = axes.every(Boolean);
  gizmo.showXY = gizmo.showYZ = gizmo.showXZ = gizmo.showXYZE = all;
  handle.userData.target = obj.parent ? null : obj;
  if (obj.parent) gizmo.attach(obj);
  else {
    syncHandle(obj);
    gizmo.attach(handle);
  }
}

function detachGizmo() {
  gizmo.detach();
  handle.userData.target = null;
}

function syncHandle(obj) {
  handle.position.copy(obj.position);
  handle.rotation.order = obj.rotation.order;
  handle.quaternion.copy(obj.quaternion);
  handle.scale.copy(obj.scale);
  handle.updateMatrixWorld();
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
  const obj = targetOf(state.selected.id);
  const prop = MODE_PROP[state.mode];
  dragStart = { id: state.selected.id, prop, start: vectorOf(obj, prop), touched: [false, false, false] };
});
let transformQueued = false;
gizmo.addEventListener("objectChange", () => {
  const obj = handle.userData.target;
  if (obj && gizmo.object === handle) {
    obj.position.copy(handle.position);
    obj.quaternion.copy(handle.quaternion);
    obj.scale.copy(handle.scale);
    obj.updateMatrixWorld();
  }
  if (!dragStart || transformQueued) return;
  transformQueued = true;
  raf(() => {
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
  const { id, prop, start, touched } = dragStart;
  const values = vectorOf(obj, prop);
  // só os eixos que o arraste mudou vão para o código
  values.forEach((v, i) => (touched[i] ||= Math.abs(v - start[i]) > 1e-6));
  post({ type: "transform", id, prop, values, start, touched: [...touched], final });
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
  if (state.glass) setProbeAt(e.clientX, e.clientY);
});
let hoverQueued = null;
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons || gizmo.dragging) return;
  if (!hoverQueued) {
    raf(() => {
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

/**
 * Aponta o raio para `ndc` (coordenadas de -1 a 1 na tela). A folga de pontos e linhas é medida
 * em unidades da cena na distância para onde a câmera olha: o alvo da órbita, ou a origem na
 * câmera do código.
 */
function aimRay(ndc, camera) {
  raycaster.setFromCamera(ndc, camera);
  const height = canvas.clientHeight || 1;
  let seen; // altura da cena que cabe na tela, na distância do foco
  if (camera.isOrthographicCamera) seen = (camera.top - camera.bottom) / camera.zoom;
  else {
    const focus = camera === editorCamera ? orbit.target : new THREE.Vector3();
    const distance = Math.max(1, camera.getWorldPosition(new THREE.Vector3()).distanceTo(focus));
    seen = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 50) / 2)) / (camera.zoom || 1);
  }
  raycaster.params.Points.threshold = raycaster.params.Line.threshold = (PICK_SLACK_PX * seen) / height;
}

function pickAt(clientX, clientY) {
  const run = state.current;
  if (!run) return null;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  aimRay(pointer, activeCamera());
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
  "metalness", "opacity", "transparent", "wireframe", "flatShading", "size", "sizeAttenuation", "vertexColors", "depthWrite",
  "groundColor", "intensity", "distance", "decay", "angle", "penumbra", "fov", "near", "far", "background",
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
  if (obj.isBufferGeometry) {
    if (obj.parameters) Object.assign(values, obj.parameters);
    // o tamanho da geometria, para o painel: quantos vértices e com quais atributos
    values.vertices = obj.getAttribute("position")?.count ?? 0;
    values.attributes = Object.keys(obj.attributes);
  }
  if (obj.isInstancedMesh) values.instances = obj.count;
  return values;
}

function inspect(msg) {
  const values = {};
  for (const id of msg.ids || []) values[id] = readValues(id);
  post({ type: "inspect", ids: msg.ids, values });
}

// ---------------------------------------------------------------------------
// Matemática: os dados do painel, o marcador do vértice e a caixa de vidro

/** Transformação local de um objeto, como em src/live/mathModel.js. */
function trsOf(obj) {
  if (!obj.matrixAutoUpdate) return { matrix: fromColumnMajor(obj.matrix.elements) };
  const r = obj.rotation;
  return { position: obj.position.toArray(), rotation: [r.x, r.y, r.z], order: r.order, scale: obj.scale.toArray() };
}

/** Da raiz até o objeto, cada elo com a transformação local e quem é ele no código. */
function chainOf(obj) {
  const chain = [];
  for (let o = obj; o; o = o.parent) chain.unshift({ ...trsOf(o), id: state.current?.idOf.get(o) ?? null, name: o.name || null, type: o.type });
  return chain;
}

function cameraInfo(camera) {
  const info = {
    source: camera === editorCamera ? "editor" : "code",
    id: state.current?.idOf.get(camera) ?? null,
    name: camera.name || null,
    chain: chainOf(camera),
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
  };
  const offset = !!(camera.view && camera.view.enabled);
  if (camera.isPerspectiveCamera && !offset && !camera.filmOffset) return { ...info, type: "perspective", fov: camera.fov, aspect: camera.aspect };
  if (camera.isOrthographicCamera && !offset) {
    return { ...info, type: "orthographic", left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };
  }
  return { ...info, type: "other", projection: fromColumnMajor(camera.projectionMatrix.elements) };
}

const viewportSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });

/**
 * Vértice `index` da geometria, no espaço do objeto; a origem para quem não tem geometria. Numa
 * malha instanciada cada cópia tem a sua matriz, que a cadeia do painel não mostra: fica a origem.
 */
function vertexOf(obj, index = 0) {
  const drawn = (obj.isMesh && !obj.isInstancedMesh) || obj.isPoints || obj.isLine;
  const position = drawn ? obj.geometry?.attributes?.position : null;
  const count = position ? position.count : 0;
  if (!count) return { index: 0, count: 0, local: [0, 0, 0] };
  const i = ((Math.round(index) % count) + count) % count;
  const local = obj.isMesh ? obj.getVertexPosition(i, new THREE.Vector3()) : new THREE.Vector3().fromBufferAttribute(position, i);
  return { index: i, count, local: local.toArray() };
}

/** Dados do painel "Matemática": a cadeia do objeto, a câmera ativa e o vértice escolhido. */
function mathInfo(msg) {
  const obj = targetOf(msg.id);
  if (!obj || !obj.isObject3D) return { type: "math", id: msg.id, missing: true };
  const camera = activeCamera();
  const vertex = vertexOf(obj, msg.vertex);
  // os mesmos números calculados pelo Three.js, para o painel conferir as próprias contas
  obj.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  const view = camera.matrixWorld.clone().invert();
  const screen = toScreen(new THREE.Vector3(...vertex.local).applyMatrix4(obj.matrixWorld));
  return {
    type: "math",
    id: msg.id,
    chain: chainOf(obj),
    camera: cameraInfo(camera),
    viewport: viewportSize(),
    vertex,
    three: {
      world: fromColumnMajor(obj.matrixWorld.elements),
      view: fromColumnMajor(view.elements),
      projection: fromColumnMajor(camera.projectionMatrix.elements),
      screen: [screen.x, screen.y],
    },
  };
}

// O marcador fica no pixel que as contas do painel dão para o vértice, não onde o Three.js
// desenhou: se as contas estivessem erradas, ele sairia de cima do vértice.
const markerEl = document.createElement("div");
markerEl.id = "vg-marker";
Object.assign(markerEl.style, {
  position: "fixed", left: "0", top: "0", width: "12px", height: "12px", margin: "-8px 0 0 -8px",
  border: "2px solid #ff5fd2", borderRadius: "50%", boxShadow: "0 0 0 2px #000a", pointerEvents: "none", display: "none",
});
document.body.append(markerEl);

function updateMarker(camera) {
  const m = state.marker;
  const obj = m && targetOf(m.id);
  const path = obj && obj.isObject3D ? objectMath({ chain: chainOf(obj), camera: cameraInfo(camera), viewport: viewportSize(), vertex: vertexOf(obj, m.vertex).local }).path : null;
  if (!path || !path.visible) {
    markerEl.style.display = "none";
    return;
  }
  if (!markerEl.isConnected) document.body.append(markerEl);
  markerEl.style.display = "block";
  markerEl.style.transform = `translate(${path.screen[0]}px, ${path.screen[1]}px)`;
}

/** Matriz de mundo pelas nossas contas (com memória por quadro, para os pais em comum). */
function ourWorld(obj, memo) {
  let m = memo.get(obj);
  if (!m) {
    const local = localMatrix(trsOf(obj));
    m = obj.parent ? multiply(ourWorld(obj.parent, memo), local) : local;
    memo.set(obj, m);
  }
  return m;
}

const isGlassMesh = (obj) => obj.isMesh && !obj.isInstancedMesh && !obj.isSkinnedMesh && !obj.isBatchedMesh && !!obj.material;
const mat3Columns = (n) => [n[0][0], n[1][0], n[2][0], n[0][1], n[1][1], n[2][1], n[0][2], n[1][2], n[2][2]];

/**
 * Troca o material de cada malha pelo da caixa de vidro, com as nossas matrizes e as luzes
 * da cena. Devolve as luzes e a posição da câmera usadas, e como desfazer a troca.
 */
function applyGlass(run, camera) {
  run.scene.updateMatrixWorld();
  if (!camera.parent) camera.updateMatrixWorld();
  const cam = cameraInfo(camera);
  const view = viewOf(cam);
  const projection = projectionMatrix(cam);
  if (!view || !projection) return null;
  const lights = collectLights(run.scene, camera);
  const camWorld = worldMatrix(cam.chain);
  const eye = [camWorld[0][3], camWorld[1][3], camWorld[2][3]];
  const viewM = new THREE.Matrix4().fromArray(columnMajor(view));
  const projM = new THREE.Matrix4().fromArray(columnMajor(projection));
  const memo = new Map();
  const swapped = [];
  run.scene.traverseVisible((obj) => {
    if (!isGlassMesh(obj)) return;
    const world = ourWorld(obj, memo);
    const normal = normalMatrix(world);
    if (!normal) return; // escala zero: não há superfície para iluminar
    const originals = [].concat(obj.material);
    let list = run.glass.get(obj);
    if (!list) run.glass.set(obj, (list = []));
    let changed = false;
    const replaced = originals.map((material, i) => {
      const info = glassTerms(material);
      if (!info) return material;
      const glass = (list[i] ||= createGlassMaterial());
      syncGlass(glass, material, info, state.glass);
      const u = glass.uniforms;
      u.uModel.value.fromArray(columnMajor(world));
      u.uView.value.copy(viewM);
      u.uProj.value.copy(projM);
      u.uNormalMatrix.value.fromArray(mat3Columns(normal));
      u.uEye.value.fromArray(eye);
      setLightUniforms(glass, lights);
      glass.uniformsNeedUpdate = true;
      changed = true;
      return glass;
    });
    if (!changed) return;
    swapped.push([obj, obj.material]);
    obj.material = Array.isArray(obj.material) ? replaced : replaced[0];
  });
  return { lights, eye, restore: () => swapped.forEach(([obj, material]) => (obj.material = material)) };
}

// Sonda: mede a iluminação no pixel clicado e lê a cor que a tela tem nele.
const PROBE_MS = 250;
const probePixel = new Uint8Array(4);
const probeArrows = new THREE.Group();
overlay.add(probeArrows);
let lastProbe = null;
let probeSeq = 0;

function setProbeAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const bx = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
  const by = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
  state.probe = { bx, by, at: 0, seq: ++probeSeq }; // seq: cada clique é uma medida nova
}

function clearProbe() {
  state.probe = null;
  lastProbe = null;
  showArrows(null);
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const apply3 = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const applyPoint = (m, v) => m.slice(0, 3).map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2] + row[3]);

/** A normal que o shader usa nesse ponto, no mundo, já do lado de quem olha. */
function probeNormal(mesh, hit, world, params, v, side) {
  const normals = mesh.geometry.attributes.normal;
  let n;
  if (normals && !params.flatShading) {
    const local = THREE.Triangle.getInterpolatedAttribute(normals, hit.face.a, hit.face.b, hit.face.c, hit.barycoord, new THREE.Vector3());
    n = normalize(apply3(normalMatrix(world), local.toArray()));
  }
  if (!n || n.every((c) => c === 0)) {
    // sombreamento chapado: a normal do triângulo, virada para a câmera
    const [a, b, c] = [hit.face.a, hit.face.b, hit.face.c].map((i) => applyPoint(world, mesh.getVertexPosition(i, new THREE.Vector3()).toArray()));
    n = normalize(cross3(sub3(b, a), sub3(c, a)));
    if (dot(n, v) < 0) n = n.map((x) => -x);
  } else if (side !== THREE.FrontSide && dot(n, v) < 0) n = n.map((x) => -x);
  return n;
}

function idOfObject(run, obj) {
  for (let o = obj; o; o = o.parent) {
    const id = run.idOf.get(o);
    if (id != null && !o.isScene) return id;
  }
  return null;
}

/** Logo depois de desenhar a cena (antes do que é do editor): lê o pixel e refaz a conta. */
function measureProbe(run, camera, glass) {
  const p = state.probe;
  const now = performance.now();
  if (now - p.at < PROBE_MS) return;
  p.at = now;
  const W = canvas.width;
  const H = canvas.height;
  if (p.bx < 0 || p.by < 0 || p.bx >= W || p.by >= H) return;
  const gl = renderer.getContext();
  gl.readPixels(p.bx, H - 1 - p.by, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probePixel);
  const msg = {
    type: "probe",
    seq: p.seq,
    model: state.glass,
    pixel: [probePixel[0], probePixel[1], probePixel[2]],
    screen: [((p.bx + 0.5) * canvas.clientWidth) / W, ((p.by + 0.5) * canvas.clientHeight) / H],
  };
  // o raio passa pelo centro do pixel, onde a placa de vídeo calculou a cor
  aimRay(new THREE.Vector2(((p.bx + 0.5) / W) * 2 - 1, 1 - ((p.by + 0.5) / H) * 2), camera);
  const hit = raycaster.intersectObject(run.scene, true).find((h) => h.object.isMesh && isShown(h.object));
  const mesh = hit && hit.face ? hit.object : null;
  const material = mesh && [].concat(mesh.material)[Array.isArray(mesh.material) ? hit.face.materialIndex : 0];
  const info = mesh && isGlassMesh(mesh) ? glassTerms(material) : null;
  if (!info) {
    showArrows(null);
    lastProbe = { ...msg, hit: !!mesh, supported: false, id: mesh ? idOfObject(run, mesh) : null, materialType: material?.type ?? null };
    post(lastProbe);
    return;
  }
  const world = ourWorld(mesh, new Map());
  const point = hit.point.toArray();
  const eye = glass.eye;
  const v = normalize(sub3(eye, point));
  const normal = probeNormal(mesh, hit, world, info.params, v, material.side);
  const result = shadePoint({ point, normal, eye, material: info.terms, lights: glass.lights.list, model: state.glass });
  showArrows(point, result);
  lastProbe = {
    ...msg,
    hit: true,
    supported: true,
    id: idOfObject(run, mesh),
    point,
    normal,
    eye,
    params: info.params,
    terms: info.terms,
    lights: glass.lights.list,
    lightIds: glass.lights.objects.map((o) => run.idOf.get(o) ?? null),
    ignored: glass.lights.ignored,
    result,
    transparent: !!material.transparent,
  };
  post(lastProbe);
}

/** Setas da sonda: normal (verde), observador (azul) e, por luz, l (amarela) e r ou h (rosa). */
function showArrows(point, result) {
  for (const child of [...probeArrows.children]) {
    probeArrows.remove(child);
    child.dispose();
  }
  if (!point) return;
  const origin = new THREE.Vector3(...point);
  const len = Math.max(0.3, origin.distanceTo(activeCamera().position) * 0.1);
  const arrow = (dir, color) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(...dir), origin, len, color, len * 0.25, len * 0.12);
    a.traverse((o) => {
      if (o.material) o.material.depthTest = false;
      o.renderOrder = 3;
    });
    probeArrows.add(a);
  };
  arrow(result.n, 0x7ee07e);
  arrow(result.v, 0x41c5ff);
  for (const t of result.direct) {
    arrow(t.l, 0xffc94d);
    if (t.nl > 0) arrow(state.glass === "blinn" ? t.h : t.r, 0xff5fd2);
  }
}

// ---------------------------------------------------------------------------
// Desafios: os fatos que a correção confere e o contorno do alvo

/**
 * Fatos dos objetos da execução na tela (os de um laço também), da câmera do código e das luzes
 * acesas, com o rastro de quem se moveu, se a animação está andando e o tempo dela (`elapsed`, o
 * que animar() recebe). Com `msg.surface`, os fatos de um shader trazem também a superfície que o
 * shader de vértices desenhou.
 */
function factsInfo(msg) {
  const run = state.current;
  if (!run) return { type: "facts", seq: msg.seq, runId: null };
  const entries = [...run.registry];
  const { trail } = run;
  const facts = sceneFacts({ scene: run.scene, camera: run.camera, entries, idOf: (obj) => run.idOf.get(obj), trails: trail.points });
  if (run.shaders) shaderFacts(run, entries, facts.objects, { surface: !!msg.surface });
  // `recorded`: quantos segundos de animação o rastro já cobre (quem não saiu do lugar nesse tempo, não anda)
  const recorded = trail.first == null ? 0 : trail.last - trail.first;
  return { type: "facts", seq: msg.seq, runId: run.id, ...facts, playing: state.playing && !!run.animar && !run.animError, recorded, elapsed: state.elapsed };
}

// Os pixels de um shader: a cena desenhada pela câmera do código numa imagem de 256 de largura, na
// proporção da câmera, sem antisserrilhado (cada pixel é a conta do shader no centro dele).
// O fundo da imagem fica de uma cor que nenhum shader dos projetos pinta (nem o magenta de um
// shader quebrado): os pixels dessa cor são os que nenhum objeto cobriu.
const SAMPLE_WIDTH = 256;
const SAMPLE_BACKGROUND = new THREE.Color().setRGB(1, 0, 0.4, THREE.LinearSRGBColorSpace);
let sampleTarget = null;
let sampleBuffer = null;
const sampleBackdrop = new THREE.Scene();
sampleBackdrop.background = SAMPLE_BACKGROUND;
let sampleBackground = null; // { key, pixel }: o fundo como sai na imagem, para cada jeito de tratar as cores

/**
 * Os fatos de cada malha desenhada por um ShaderMaterial (`shader`): o erro de compilação, se
 * houve, a posição da câmera (o cameraPosition do shader), o tamanho da imagem, a cor do fundo nela
 * (SAMPLE_BACKGROUND, como saiu) e os pixels que o shader pintou, com o ponto da superfície e a
 * normal que cada um mostra (samplePixels, em src/live/runtime/shaders.js). A conferência dos
 * projetos de shader refaz a conta e compara. Os objetos do three.js saem no espaço linear nesta
 * imagem (o three.js só converte para sRGB na tela); o shader do aluno sai como ele escreve.
 * Com `surface`, os pixels vêm de outro jeito: em vez dos raios contra a geometria, que um shader de
 * vértices pode deixar para trás (as ondas de um mar sobem e descem, e a placa do JavaScript fica
 * parada), `surface` traz os pontos da superfície que o shader desenhou, pela profundidade de cada
 * pixel (surfaceDepth), com a cor (sampleSurface).
 */
function shaderFacts(run, entries, objects, { surface = false } = {}) {
  const meshes = [];
  for (const [id, list] of entries) {
    const obj = list[0];
    const material = obj?.isMesh && !obj.isInstancedMesh ? [].concat(obj.material)[0] : null;
    if (material?.isShaderMaterial && objects[id]) meshes.push([id, obj, material]);
  }
  if (!meshes.length) return;
  const camera = run.camera ?? editorCamera;
  const aspect = camera.isPerspectiveCamera ? camera.aspect : canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const width = SAMPLE_WIDTH;
  const height = Math.min(512, Math.max(32, Math.round(width / (aspect || 1))));
  if (!sampleTarget) sampleTarget = new THREE.WebGLRenderTarget(width, height);
  else if (sampleTarget.width !== width || sampleTarget.height !== height) sampleTarget.setSize(width, height);
  if (sampleBuffer?.length !== width * height * 4) sampleBuffer = new Uint8Array(width * height * 4);
  const read = (x, y) => {
    const i = (y * width + x) * 4;
    return [sampleBuffer[i], sampleBuffer[i + 1], sampleBuffer[i + 2]];
  };
  const autoClear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(sampleTarget);
  // o fundo como ele sai nesta imagem, medido numa cena vazia (cada leitura espera a placa de vídeo terminar)
  const colors = `${THREE.ColorManagement.enabled}|${THREE.ColorManagement.workingColorSpace}|${renderer.outputColorSpace}|${renderer.toneMapping}`;
  if (sampleBackground?.key !== colors) {
    renderer.render(sampleBackdrop, camera);
    renderer.readRenderTargetPixels(sampleTarget, 0, 0, 1, 1, sampleBuffer);
    sampleBackground = { key: colors, pixel: read(0, 0) };
  }
  const backgroundPixel = sampleBackground.pixel;
  const background = run.scene.background;
  run.scene.background = SAMPLE_BACKGROUND;
  const uncover = coverBrokenShaders(run);
  try {
    renderer.render(run.scene, camera);
  } finally {
    uncover?.();
    run.scene.background = background;
    renderer.setRenderTarget(null);
    renderer.autoClear = autoClear;
  }
  if (newShaderFailures.length) resolveShaderFailures(run);
  renderer.readRenderTargetPixels(sampleTarget, 0, 0, width, height, sampleBuffer);
  const eye = camera.getWorldPosition(new THREE.Vector3()).toArray();
  for (const [id, mesh, material] of meshes) {
    const failure = shaderFailureOf(material);
    objects[id].shader = {
      error: failure && { stage: failure.stage, message: failure.message, line: failure.line },
      eye,
      size: [width, height],
      background: backgroundPixel,
      ...(surface ? {} : samplePixels({ scene: run.scene, camera, mesh, width, height, read })),
    };
    // um shader que não compila não desenha superfície nenhuma (e o GLSL 3 pediria outro shader de profundidade)
    if (!surface || failure || material.glslVersion === THREE.GLSL3) continue;
    const depth = surfaceDepth(run, camera, mesh, material, width, height);
    if (depth) objects[id].shader.surface = sampleSurface({ camera, mesh, width, height, read, depth });
  }
}

// A superfície que um shader de vértices desenhou: a malha desenhada de novo pela câmera do
// código, com o mesmo shader de vértices e os mesmos uniforms, e um shader de fragmentos que
// escreve na cor a profundidade de cada pixel (o gl_FragCoord.z, de 0 a 1), em três bytes. As
// outras malhas entram só na profundidade (sem pintar nada), para tapar o que passa atrás delas,
// e os pontos, as linhas e os sprites ficam de fora. A malha vem por último, e onde ela aparece a
// opacidade fica em 1 (a imagem começa toda em 0).
const SURFACE_FRAGMENT = /* glsl */ `
  void main() {
    float z = gl_FragCoord.z * 255.0;
    float r = floor(z);
    z = (z - r) * 255.0;
    float g = floor(z);
    gl_FragColor = vec4(r, g, floor((z - g) * 255.0), 255.0) / 255.0;
  }
`;
const SURFACE_OCCLUDER = new THREE.MeshBasicMaterial({ colorWrite: false });
const MAX_SURFACE_MATERIALS = 4;
const surfaceMaterials = new Map(); // ShaderMaterial do código → o da profundidade, dos últimos usados
let surfaceTarget = null;
let surfaceBuffer = null;

/** O material da profundidade de um ShaderMaterial do código, guardado enquanto o shader de vértices e o lado são os mesmos. */
function surfaceMaterialOf(material) {
  let depth = surfaceMaterials.get(material);
  surfaceMaterials.delete(material);
  if (depth?.vertexShader !== material.vertexShader || depth.side !== material.side) {
    depth?.dispose();
    depth = new THREE.ShaderMaterial({
      vertexShader: material.vertexShader,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: material.uniforms,
      defines: material.defines,
      side: material.side,
      vertexColors: material.vertexColors,
    });
  }
  surfaceMaterials.set(material, depth);
  if (surfaceMaterials.size > MAX_SURFACE_MATERIALS) {
    const [old, oldDepth] = surfaceMaterials.entries().next().value;
    oldDepth.dispose();
    surfaceMaterials.delete(old);
  }
  return depth;
}

/**
 * A profundidade da malha em cada pixel da imagem de `width` × `height`: (x, y) → de 0 a 1, como o
 * gl_FragCoord.z, ou null onde a malha não aparece. null se o shader de vértices não compilou com o
 * de fragmentos da profundidade (o erro não é do código, e não vai para a barra de status).
 */
function surfaceDepth(run, camera, mesh, material, width, height) {
  if (!surfaceTarget) surfaceTarget = new THREE.WebGLRenderTarget(width, height);
  else if (surfaceTarget.width !== width || surfaceTarget.height !== height) surfaceTarget.setSize(width, height);
  if (surfaceBuffer?.length !== width * height * 4) surfaceBuffer = new Uint8Array(width * height * 4);
  const depthMaterial = surfaceMaterialOf(material);
  const swapped = []; // [objeto, propriedade, valor de antes]
  run.scene.traverse((obj) => {
    if (obj === mesh) {
      swapped.push([obj, "material", obj.material], [obj, "renderOrder", obj.renderOrder]);
      obj.material = depthMaterial;
      obj.renderOrder = Number.MAX_SAFE_INTEGER;
    } else if (obj.isMesh) {
      swapped.push([obj, "material", obj.material]);
      obj.material = SURFACE_OCCLUDER;
    } else if ((obj.isPoints || obj.isLine || obj.isSprite) && obj.visible) {
      swapped.push([obj, "visible", true]);
      obj.visible = false;
    }
  });
  const background = run.scene.background;
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  const failures = newShaderFailures.length;
  run.scene.background = null;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.setRenderTarget(surfaceTarget);
  try {
    renderer.render(run.scene, camera);
  } finally {
    for (const [obj, key, value] of swapped.reverse()) obj[key] = value;
    run.scene.background = background;
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
  }
  if (newShaderFailures.splice(failures).length) return null;
  renderer.readRenderTargetPixels(surfaceTarget, 0, 0, width, height, surfaceBuffer);
  return (x, y) => {
    const i = (y * width + x) * 4;
    if (surfaceBuffer[i + 3] < 128) return null;
    return (surfaceBuffer[i] + (surfaceBuffer[i + 1] + surfaceBuffer[i + 2] / 255) / 255) / 255;
  };
}

/**
 * Anota onde está, no mundo, o primeiro objeto de cada trecho do código, no tempo da animação: a
 * correção dos projetos mede por esse rastro se um objeto anda e com que velocidade (o carrinho
 * da montanha-russa), ou se as cópias de uma InstancedMesh se mexem (o vento da floresta). Roda depois do desenho, que deixa as matrizes de mundo em dia, e só nos
 * quadros em que animar() rodou; cada execução começa um rastro novo. O rastro de um objeto só
 * começa quando ele sai do lugar (a partir da última vez em que foi visto parado): numa cena com
 * centenas de peças paradas, só o que anda ocupa memória.
 */
function recordTrail(run) {
  const trail = run.trail;
  const now = state.elapsed;
  if (now - trail.last < TRAIL_STEP) return;
  trail.first ??= now;
  trail.last = now;
  for (const [id, list] of run.registry) {
    const obj = list[0];
    if (!obj?.isObject3D || obj.isScene) continue;
    const [x, y, z] = trailPoint(obj);
    let points = trail.points.get(id);
    if (!points) {
      const still = trail.still.get(id);
      if (!still) {
        trail.still.set(id, [now, x, y, z]);
        continue;
      }
      if (Math.abs(x - still[1]) + Math.abs(y - still[2]) + Math.abs(z - still[3]) < 1e-4) {
        still[0] = now;
        continue;
      }
      trail.points.set(id, (points = [still]));
      trail.still.delete(id);
    }
    points.push([now, x, y, z]);
    if (points.length > TRAIL_SECONDS / TRAIL_STEP) points.shift();
  }
}

function setGhosts(shapes) {
  for (const line of [...ghosts.children]) {
    line.geometry.dispose();
    line.material.dispose();
    ghosts.remove(line);
  }
  for (const shape of shapes || []) {
    let geometry = null;
    if (shape.kind === "box") {
      const box = new THREE.BoxGeometry(...shape.size);
      geometry = new THREE.EdgesGeometry(box);
      box.dispose();
    } else if (shape.kind === "ring") {
      const points = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * shape.radius, 0, Math.sin(a) * shape.radius));
      }
      geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
    if (!geometry) continue;
    const material = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85, depthTest: false });
    const line = shape.kind === "box" ? new THREE.LineSegments(geometry, material) : new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.matrixAutoUpdate = false;
    if (shape.matrix) line.matrix.fromArray(columnMajor(shape.matrix));
    else if (shape.center) line.matrix.makeTranslation(...shape.center);
    line.renderOrder = 3;
    ghosts.add(line);
  }
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
  raf(frame);
  clock.update(time);
  const dt = Math.min(clock.getDelta(), 0.1);
  const run = state.current;
  // durante um arraste a animação espera: o que muda na cena é só o que o gizmo faz
  const animating = run && state.playing && !gizmo.dragging && run.animar && !run.animError;
  if (animating) {
    state.elapsed += dt;
    const prev = userRun;
    userRun = run;
    startGuard(LOOP_LIMIT_MS.frame);
    try {
      run.animar(state.elapsed, dt);
      reportSwallowedLoop(run, "animar");
    } catch (err) {
      reportError(run, loopAware(run, err), "animar");
    } finally {
      userRun = prev;
    }
  }
  if (handle.userData.target && !gizmo.dragging) syncHandle(handle.userData.target);
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
  if (run) {
    const glass = state.glass ? applyGlass(run, camera) : null;
    const uncover = run.shaders ? coverBrokenShaders(run) : null;
    renderer.render(run.scene, camera);
    uncover?.();
    if (newShaderFailures.length) resolveShaderFailures(run);
    if (glass) {
      glass.restore();
      if (state.probe) measureProbe(run, camera, glass);
    }
    if (animating && !run.animError) recordTrail(run);
  } else {
    renderer.setClearColor(background);
    renderer.clear();
  }
  updateMarker(camera);

  if (run) {
    const selected = state.selected ? targetOf(state.selected.id) : null;
    for (const h of run.helpers) {
      const target = h.userData.target;
      // a caixa da sombra, só com a luz selecionada e se ela faz sombra
      h.visible = editorView && isShown(target) && (!h.userData.shadow || (target.castShadow && target === selected));
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
raf(frame);

// ---------------------------------------------------------------------------
// Mensagens do editor

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.source !== "visugraph-editor") return;
  switch (msg.type) {
    case "run":
      // Durante um arraste o visor já mostra o resultado, e rodar agora soltaria o gizmo:
      // o editor roda o código de novo quando o arraste termina.
      if (gizmo.dragging) post({ type: "ran", runId: msg.runId, ok: false, skipped: true });
      else execute(msg);
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
      attachGizmo();
      break;
    case "play":
      state.playing = !!msg.playing;
      break;
    case "math":
      post(mathInfo(msg));
      break;
    case "marker":
      state.marker = msg.id != null ? { id: msg.id, vertex: msg.vertex ?? 0 } : null;
      break;
    case "glass":
      state.glass = msg.model === "phong" || msg.model === "blinn" ? msg.model : null;
      if (!state.glass) clearProbe();
      else if (state.probe) state.probe.at = 0;
      break;
    case "probe":
      if (msg.clear) clearProbe();
      else if (msg.x != null) setProbeAt(msg.x, msg.y);
      break;
    case "facts":
      post(factsInfo(msg));
      break;
    case "ghost":
      setGhosts(msg.shapes);
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
  /** Onde o Three.js projeta o vértice `index` do objeto, em coordenadas da janela do iframe. */
  vertexScreen(id, index = 0) {
    const obj = targetOf(id);
    if (!obj || !obj.isObject3D) return null;
    obj.updateWorldMatrix(true, false);
    return toScreen(new THREE.Vector3(...vertexOf(obj, index).local).applyMatrix4(obj.matrixWorld));
  },
  /** Onde o Three.js projeta um ponto do mundo, em coordenadas da janela do iframe. */
  toScreen: (point) => toScreen(new THREE.Vector3(...point)),
  marker() {
    if (markerEl.style.display === "none") return null;
    const r = markerEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  probe: () => lastProbe,
  glass: () => state.glass,
  /** Os contornos de alvo na tela: tipo e matriz de mundo (linha a linha) de cada um. */
  ghosts: () => ghosts.children.map((g) => ({ kind: g.isLineSegments ? "box" : "ring", matrix: fromColumnMajor(g.matrixWorld.elements) })),
};

function toScreen(p) {
  const v = p.clone().project(activeCamera());
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

announce({ type: "ready" });
