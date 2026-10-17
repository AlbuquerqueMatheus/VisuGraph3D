// phong.js — Sistema Didático do Modelo Phong / Blinn–Phong
//
// O objeto é desenhado por um shader próprio (src/lib/phongShader.js) que aplica a
// mesma fórmula do painel (src/lib/phong.js). Assim, o que a pessoa vê na tela e os
// números do ponto de inspeção vêm do mesmo cálculo.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { hexToRgb, shade } from "../lib/phong.js";
import { phongFragmentShader, phongVertexShader } from "../lib/phongShader.js";
import { isShown, onReady, onShownChange } from "../lib/dom.js";

const LIGHT_RADIUS = 3.2;
const LIGHT_HEIGHT = 2.0;

const toVec = (v) => [v.x, v.y, v.z];

class PhongApp {
  constructor() {
    // ===== Estado geométrico / cena =====
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.labelRenderer = null;
    this.controls = null;
    this.grid = null;
    this.axes = null;

    // objetos
    this.lightPosition = new THREE.Vector3(LIGHT_RADIUS, LIGHT_HEIGHT, 0);
    this.bulb = null;
    this.mesh = null;
    this.mat = null;

    // inspeção: ponto e normal guardados no espaço do objeto
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.inspect = {
      localPoint: null,
      localNormal: null,
      marker: null,
      arrows: {},
    };

    // UI refs
    this.el = {};
    this.term = {};
    this.params = null;

    // auxiliar de render
    this._raf = null;
    this._running = false;
    this._onResize = null;
    this._shown = {};
    this._formulaKey = "";
    this._formulaScale = 1;
    this._lightAngle = 0;
    this._lastFrame = undefined;

    // fluxo
    this._bindUI();
    this._initThree();
    this._initSceneObjects();
    this._initInspectPoint();
    this._initEvents();
    this._syncFromUI();
    this._inspectDefault();
    this.start();
  }

  /* ================= UI ================= */
  _bindUI() {
    const byId = (id) => document.getElementById(id);

    this.el = {
      // seletor de modelo/geo e toggles
      modelType: byId("model-type"), // 'phong' | 'blinn'
      geometry: byId("geometry-selector"),
      autoLight: byId("auto-light"),
      showGrid: byId("show-grid"),
      showWire: byId("show-wire"),
      showVectors: byId("show-vectors"),

      // sliders de luz
      La: byId("ambient-light"),
      Ld: byId("diffuse-light"),
      Ls: byId("specular-light"),

      // sliders de material
      Ka: byId("ambient-material"),
      Kd: byId("diffuse-material"),
      Ks: byId("specular-material"),
      n: byId("shininess-slider"),

      // espelhos dos valores
      LaV: byId("ambient-intensity-value"),
      LdV: byId("diffuse-intensity-value"),
      LsV: byId("specular-intensity-value"),
      KaV: byId("ka-value"),
      KdV: byId("kd-value"),
      KsV: byId("ks-value"),
      nV: byId("shininess-value"),

      // cores
      lightColor: byId("light-color"),
      objectColor: byId("object-color"),

      // fórmula e números
      formula: byId("phong-formula-canvas"),
      dotNL: byId("dot-nl"),
      dotNLc: byId("dot-nl-clamped"),
      dotRV: byId("dot-rv"),
      dotHN: byId("dot-hn"),
      rvLine: byId("rv-line"),
      hnLine: byId("hn-line"),
      specPow: byId("specular-term"),
      intensity: byId("intensity"),
      rgb: byId("phong-rgb"),
      swatch: byId("phong-swatch"),
    };

    this.term = {
      ambient: byId("term-ambient"),
      diffuse: byId("term-diffuse"),
      specular: byId("term-specular"),
    };
  }

  /* ================ THREE ================ */
  _initThree() {
    this.container = document.getElementById("phong-viewer");
    if (!this.container) {
      throw new Error("Elemento #phong-viewer não encontrado.");
    }
    this.container.innerHTML = "";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0b);

    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 460;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.camera.position.set(0, 1.8, 4.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, {
      position: "absolute",
      top: "0",
      left: "0",
      pointerEvents: "none",
    });
    this.container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    this.axes = new THREE.AxesHelper(1.5);
    this.scene.add(this.grid, this.axes);

    const legend = document.createElement("div");
    legend.className = "phong-legend";
    legend.innerHTML = `
      <div><span style="background:#00ff00"></span> n̂ — normal</div>
      <div><span style="background:#ffff66"></span> l̂ — direção da luz</div>
      <div><span style="background:#4488ff"></span> v̂ — direção do observador</div>
      <div><span style="background:#ffee55"></span> r̂ — reflexão</div>
      <div><span style="background:#ff88ff"></span> ĥ — half-vector</div>
    `;
    this.container.appendChild(legend);
  }

  _makeGeometry() {
    return this.el.geometry?.value === "torus"
      ? new THREE.TorusGeometry(1, 0.34, 48, 96)
      : new THREE.SphereGeometry(1, 48, 32);
  }

  _initSceneObjects() {
    // A "lâmpada" só marca a posição da luz; a iluminação é feita no shader.
    this.bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffaa })
    );
    this.bulb.position.copy(this.lightPosition);
    this.scene.add(this.bulb);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: phongVertexShader,
      fragmentShader: phongFragmentShader,
      uniforms: {
        uLightPosition: { value: this.lightPosition },
        uObjectColor: { value: new THREE.Vector3(...hexToRgb("#6699ff")) },
        uLightColor: { value: new THREE.Vector3(1, 1, 1) },
        uLa: { value: 0.2 },
        uLd: { value: 0.8 },
        uLs: { value: 0.8 },
        uKa: { value: 0.2 },
        uKd: { value: 0.7 },
        uKs: { value: 0.5 },
        uShininess: { value: 32 },
        uBlinn: { value: false },
        uAmbientOn: { value: true },
        uDiffuseOn: { value: true },
        uSpecularOn: { value: true },
      },
    });

    this.mesh = new THREE.Mesh(this._makeGeometry(), this.mat);
    this.scene.add(this.mesh);
  }

  _setGeometryFromSelect() {
    this.mesh.geometry.dispose();
    this.mesh.geometry = this._makeGeometry();
    this._inspectDefault();
  }

  _makeArrow(colorHex, name) {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, colorHex, 0.14, 0.08);
    arrow.name = name;

    const labelEl = document.createElement("div");
    labelEl.className = "phong-label";
    labelEl.textContent = name;
    const label = new CSS2DObject(labelEl);

    this.scene.add(arrow, label);
    return { arrow, label };
  }

  _initInspectPoint() {
    this.inspect.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(this.inspect.marker);

    this.inspect.arrows.n = this._makeArrow(0x00ff00, "n̂ (normal)");
    this.inspect.arrows.l = this._makeArrow(0xffff66, "l̂ (luz)");
    this.inspect.arrows.v = this._makeArrow(0x4488ff, "v̂ (visor)");
    this.inspect.arrows.r = this._makeArrow(0xffee55, "r̂ (reflex)");
    this.inspect.arrows.h = this._makeArrow(0xff88ff, "ĥ (half)");
  }

  /* ================ Eventos & UI ================ */
  _initEvents() {
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);

    [this.el.La, this.el.Ld, this.el.Ls, this.el.Ka, this.el.Kd, this.el.Ks, this.el.n].forEach((inp) =>
      inp?.addEventListener("input", () => this._syncFromUI())
    );

    [this.el.modelType, this.el.autoLight, this.el.showGrid, this.el.showWire, this.el.showVectors].forEach((el) =>
      el?.addEventListener("change", () => this._syncFromUI())
    );
    this.el.geometry?.addEventListener("change", () => this._setGeometryFromSelect());

    this.el.lightColor?.addEventListener("input", () => this._syncFromUI());
    this.el.objectColor?.addEventListener("input", () => this._syncFromUI());

    Object.values(this.term).forEach((c) => c?.addEventListener("change", () => this._syncFromUI()));

    // clique/arrasto para escolher o ponto de inspeção
    const onPointer = (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this._inspectAt(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
    };
    this.container.addEventListener("pointerdown", onPointer);
    this.container.addEventListener("pointermove", (e) => {
      if (e.buttons) onPointer(e);
    });
  }

  /** Lê a interface uma vez e repassa os valores ao shader e ao painel. */
  _syncFromUI() {
    const num = (el, def) => {
      const v = parseFloat(el?.value);
      return Number.isFinite(v) ? v : def;
    };
    const on = (el) => el?.checked ?? true;

    const p = {
      model: this.el.modelType?.value === "blinn" ? "blinn" : "phong",
      La: num(this.el.La, 0.2),
      Ld: num(this.el.Ld, 0.8),
      Ls: num(this.el.Ls, 0.8),
      Ka: num(this.el.Ka, 0.2),
      Kd: num(this.el.Kd, 0.7),
      Ks: num(this.el.Ks, 0.5),
      shininess: num(this.el.n, 32),
      terms: { ambient: on(this.term.ambient), diffuse: on(this.term.diffuse), specular: on(this.term.specular) },
      objectColor: hexToRgb(this.el.objectColor?.value ?? "#6699ff"),
      lightColor: hexToRgb(this.el.lightColor?.value ?? "#ffffff"),
    };
    this.params = p;

    // refletir valores nos spans
    const show = (el, v, digits = 2) => el && (el.textContent = v.toFixed(digits));
    show(this.el.LaV, p.La);
    show(this.el.LdV, p.Ld);
    show(this.el.LsV, p.Ls);
    show(this.el.KaV, p.Ka);
    show(this.el.KdV, p.Kd);
    show(this.el.KsV, p.Ks);
    show(this.el.nV, p.shininess, 0);

    // shader
    const u = this.mat.uniforms;
    u.uLa.value = p.La;
    u.uLd.value = p.Ld;
    u.uLs.value = p.Ls;
    u.uKa.value = p.Ka;
    u.uKd.value = p.Kd;
    u.uKs.value = p.Ks;
    u.uShininess.value = p.shininess;
    u.uBlinn.value = p.model === "blinn";
    u.uAmbientOn.value = p.terms.ambient;
    u.uDiffuseOn.value = p.terms.diffuse;
    u.uSpecularOn.value = p.terms.specular;
    u.uObjectColor.value.set(...p.objectColor);
    u.uLightColor.value.set(...p.lightColor);
    this.mat.wireframe = !!this.el.showWire?.checked;

    // painel: mostra r·v ou h·n conforme o modelo
    this.el.rvLine?.classList.toggle("hidden", p.model === "blinn");
    this.el.hnLine?.classList.toggle("hidden", p.model !== "blinn");

    // grade/eixos
    const showG = !!this.el.showGrid?.checked;
    this.grid.visible = showG;
    this.axes.visible = showG;

    // vetores, rótulos e marcador do ponto
    this._applyVectorVisibility();
  }

  _applyVectorVisibility() {
    const showV = !!this.el.showVectors?.checked && !!this.inspect.localPoint;
    this.inspect.marker.visible = showV;
    Object.values(this.inspect.arrows).forEach(({ arrow, label }) => {
      arrow.visible = showV;
      label.visible = showV;
    });
  }

  /**
   * Ponto inicial: entre os pontos visíveis perto do centro da tela, o mais
   * iluminado. Assim a pessoa já começa vendo os três termos diferentes de zero.
   */
  _inspectDefault() {
    this.inspect.localPoint = null;
    let best = null;
    const search = (cx, cy, half, step) => {
      for (let y = cy - half; y <= cy + half + 1e-9; y += step) {
        for (let x = cx - half; x <= cx + half + 1e-9; x += step) {
          const hit = this._raycast(x, y);
          if (!hit) continue;
          const { I } = this._shadeAt(hit.point, this._worldNormal(hit.normal ?? hit.face.normal));
          if (!best || I > best.I) best = { hit, I, x, y };
        }
      }
    };
    search(0, 0, 0.5, 0.1); // varredura grossa
    if (best) search(best.x, best.y, 0.1, 0.02); // refinamento em volta do melhor
    if (best) this._setInspection(best.hit);
    else this._applyVectorVisibility();
  }

  /** Escolhe o ponto de inspeção pelo raio que passa por (x, y) em NDC. */
  _inspectAt(x, y) {
    const hit = this._raycast(x, y);
    if (hit) this._setInspection(hit);
    return !!hit;
  }

  _raycast(x, y) {
    this.pointer.set(x, y);
    this.camera.updateMatrixWorld();
    this.mesh.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.mesh, false)[0] ?? null;
  }

  _setInspection(hit) {
    // A normal interpolada do raycast é a mesma que o shader recebe no pixel.
    this.inspect.localPoint = this.mesh.worldToLocal(hit.point.clone());
    this.inspect.localNormal = (hit.normal ?? hit.face.normal).clone();
    this._applyVectorVisibility();
    this._updateInspection();
  }

  _worldNormal(localNormal) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.mesh.matrixWorld);
    return localNormal.clone().applyMatrix3(normalMatrix).normalize();
  }

  /** A fórmula (src/lib/phong.js) no ponto P com normal n, ambos no mundo. */
  _shadeAt(P, n) {
    const L = this.lightPosition.clone().sub(P).normalize();
    const V = this.camera.position.clone().sub(P).normalize();
    return { L, V, ...shade({ ...this.params, n: toVec(n), l: toVec(L), v: toVec(V) }) };
  }

  /** Recalcula vetores e números do ponto (a luz e a câmera podem ter mudado). */
  _updateInspection() {
    if (!this.inspect.localPoint || !this.params) return;

    const P = this.mesh.localToWorld(this.inspect.localPoint.clone());
    const n = this._worldNormal(this.inspect.localNormal);
    const res = this._shadeAt(P, n);
    const { L, V } = res;
    const R = new THREE.Vector3(...res.r).normalize();
    const H = new THREE.Vector3(...res.h);

    this.inspect.marker.position.copy(P);
    const setArrow = ({ arrow, label }, dir, dy = 0.06) => {
      arrow.position.copy(P);
      arrow.setDirection(dir);
      label.position.copy(P).addScaledVector(dir, 0.9).add(new THREE.Vector3(0, dy, 0));
    };
    setArrow(this.inspect.arrows.n, n, 0.04);
    setArrow(this.inspect.arrows.l, L);
    setArrow(this.inspect.arrows.v, V);
    setArrow(this.inspect.arrows.r, R);
    setArrow(this.inspect.arrows.h, H);

    const rgb255 = res.rgb.map((c) => Math.round(c * 255));
    this._setText(this.el.dotNL, res.nl.toFixed(2));
    this._setText(this.el.dotNLc, res.nlClamped.toFixed(2));
    this._setText(this.el.dotRV, res.rv.toFixed(2));
    this._setText(this.el.dotHN, res.hn.toFixed(2));
    this._setText(this.el.specPow, res.specPow.toFixed(3));
    this._setText(this.el.intensity, res.I.toFixed(3));
    this._setText(this.el.rgb, `(${rgb255.join(", ")})`);
    if (this.el.swatch) this.el.swatch.style.background = `rgb(${rgb255.join(",")})`;

    this._drawFormula(res.Ia, res.Id, res.Is, this.params.model === "blinn" ? "h·n" : "r·v");
  }

  _setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  /* ====== Canvas da fórmula (tamanho governado pelo CSS) ====== */
  _sizeFormulaCanvas() {
    const cv = this.el.formula;
    if (!cv) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(Math.max(1, cv.clientWidth) * dpr);
    const H = Math.round(Math.max(1, cv.clientHeight) * dpr);
    this._formulaScale = dpr;
    if (cv.width === W && cv.height === H) return false;
    cv.width = W;
    cv.height = H;
    return true;
  }

  _drawFormula(Ia, Id, Is, specSymbol) {
    const cv = this.el.formula;
    if (!cv) return;
    const resized = this._sizeFormulaCanvas();
    const key = [Ia.toFixed(3), Id.toFixed(3), Is.toFixed(3), specSymbol].join("|");
    if (!resized && key === this._formulaKey) return; // nada mudou
    this._formulaKey = key;

    const ctx = cv.getContext("2d");
    ctx.setTransform(this._formulaScale, 0, 0, this._formulaScale, 0, 0);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const top = 22;
    const step = Math.max(18, (h - top - 10) / 4);

    ctx.clearRect(0, 0, w, h);
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText(`I = La·Ka  +  Ld·Kd·max(0,n·l)  +  Ls·Ks·max(0,${specSymbol})^n`, 12, top);
    ctx.fillStyle = "#aaa";
    ctx.fillText("Ambiente  = " + Ia.toFixed(3), 14, top + step);
    ctx.fillText("Difusa    = " + Id.toFixed(3), 14, top + 2 * step);
    ctx.fillText("Especular = " + Is.toFixed(3) + "   (zero quando n·l ≤ 0)", 14, top + 3 * step);
    ctx.fillStyle = "#41c5ff";
    ctx.fillText("Clique no objeto para escolher o ponto de inspeção.", 12, top + 4 * step);
  }

  /** A luz gira em volta do objeto a 1 rad/s, partindo da posição inicial. */
  _animateLight(dt) {
    if (!this.el.autoLight?.checked) return;
    this._lightAngle += dt;
    const a = this._lightAngle;
    this.lightPosition.set(Math.cos(a) * LIGHT_RADIUS, LIGHT_HEIGHT, Math.sin(a) * LIGHT_RADIUS);
    this.bulb.position.copy(this.lightPosition);
  }

  _frame(now = performance.now()) {
    this._raf = requestAnimationFrame((t) => this._frame(t));
    const dt = Math.min(0.1, Math.max(0, (now - (this._lastFrame ?? now)) / 1000));
    this._lastFrame = now;
    this._animateLight(dt);
    this.controls.update();
    this._updateInspection();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this._formulaKey = "";
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrame = undefined; // sem salto da luz depois de uma pausa
    this.resize();
    this._frame();
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }
}

/* ===== Inicialização: a cena nasce na primeira vez que a seção aparece ===== */
onReady(() => {
  const section = document.getElementById("phong-section");
  if (!section) return;
  let app = null;
  const sync = (shown) => {
    if (!shown) return app?.stop();
    if (!app) app = new PhongApp();
    else app.start();
  };
  onShownChange(section, sync);
  if (isShown(section)) sync(true);
});
