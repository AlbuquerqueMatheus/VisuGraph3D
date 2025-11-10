// phong.js — Sistema Didático do Modelo Phong / Blinn–Phong
// Requer: three.js + OrbitControls + CSS2DRenderer
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

let __phongAppInstance = null; // singleton para evitar múltiplas cenas

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
    this.ambient = null;
    this.light = null;
    this.bulb = null;
    this.mesh = null;
    this.mat = null;

    // inspeção
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.inspect = {
      point: new THREE.Vector3(),
      marker: null,
      arrows: {},
      labels: {},
    };

    // UI refs
    this.el = {};
    this.term = {};

    // auxiliar de render
    this._raf = null;
    this._onResize = null;

    // últimos valores da fórmula (para redimensionamento)
    this._Ia = 0;
    this._Id = 0;
    this._Is = 0;
    this._specSymbol = "r·v";
    this._formulaScale = 1;

    // fluxo
    this._bindUI();
    this._initThree();
    this._initSceneObjects();
    this._initInspectPoint();
    this._initEvents();
    this._syncFromUI();
    this._sizeFormulaCanvas();
    this._drawFormula(0, 0, 0, this._specSymbol);
    this._renderLoop();
  }

  /* ================= UI ================= */
  _bindUI() {
    // Mapeia todos os elementos usados (falha segura com ?.)
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

      // espelhos dos valores (se existirem)
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
      specPow: byId("specular-term"),
      intensity: byId("intensity"),

      // botão explicações
      explain: byId("btn-phong-explain"),
    };

    // checkboxes para termos (se existirem)
    this.term = {
      ambient: document.getElementById("term-ambient") || { checked: true },
      diffuse: document.getElementById("term-diffuse") || { checked: true },
      specular: document.getElementById("term-specular") || { checked: true },
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
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.top = "0";
    this.labelRenderer.domElement.style.left = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    this.container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    this.axes = new THREE.AxesHelper(1.5);
    this.scene.add(this.grid, this.axes);

    // legendinha (DOM) — opcional
    const legend = document.createElement("div");
    legend.className = "phong-legend";
    legend.innerHTML = `
      <div><span style="background:#00ff00"></span> n̂ — normal</div>
      <div><span style="background:#ffff66"></span> l̂ — direção da luz</div>
      <div><span style="background:#4488ff"></span> v̂ — direção do observador</div>
      <div><span style="background:#ffee55"></span> r̂ — reflexão</div>
      <div><span style="background:#ff88ff"></span> ĥ — half-vector</div>
    `;
    this.container.appendChild(legend);
  }

  _setGeometryFromSelect() {
    // geometrias simples/robustas
    const g = this.el.geometry?.value || "sphere";
    let geom;
    switch (g) {
      case "torus":
      case "Torus":
      case "Toroide":
        geom = new THREE.TorusGeometry(1, 0.34, 48, 96);
        break;
      case "esfera":
      case "sphere":
      default:
        geom = new THREE.SphereGeometry(1, 48, 32);
    }
    if (this.mesh) {
      this.mesh.geometry.dispose?.();
      this.mesh.geometry = geom;
    }
  }

  _initSceneObjects() {
    // luzes
    this.ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(this.ambient);

    this.light = new THREE.PointLight(0xffffff, 1, 0);
    this.light.position.set(3.2, 2.0, 0);
    this.scene.add(this.light);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffaa })
    );
    bulb.position.copy(this.light.position);
    bulb.name = "bulb";
    this.scene.add(bulb);
    this.bulb = bulb;

    // material/objeto
    this.mat = new THREE.MeshPhongMaterial({
      color: 0x6699ff,
      shininess: 32,
      specular: 0xffffff,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.mat);
    this.mesh.castShadow = false;
    this.scene.add(this.mesh);

    this._setGeometryFromSelect();
  }

  _makeArrow(colorHex, name) {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      0.9,
      colorHex,
      0.14,
      0.08
    );
    arrow.name = name;

    const labelEl = document.createElement("div");
    labelEl.className = "phong-label";
    labelEl.textContent = name;
    const label = new CSS2DObject(labelEl);

    this.scene.add(arrow);
    this.scene.add(label);

    return { arrow, label, el: labelEl };
  }

  _initInspectPoint() {
    this.inspect.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(this.inspect.marker);

    // setas + rótulos
    this.inspect.arrows.n = this._makeArrow(0x00ff00, "n̂ (normal)");
    this.inspect.arrows.l = this._makeArrow(0xffff66, "l̂ (luz)");
    this.inspect.arrows.v = this._makeArrow(0x4488ff, "v̂ (visor)");
    this.inspect.arrows.r = this._makeArrow(0xffee55, "r̂ (reflex)");
    this.inspect.arrows.h = this._makeArrow(0xff88ff, "ĥ (half)");
  }

  /* ================ Eventos & UI ================ */
  _initEvents() {
    // resize
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.labelRenderer?.setSize(w, h);

      this._sizeFormulaCanvas();
      this._redrawFormulaLast();
    };
    window.addEventListener("resize", this._onResize);

    // escuta inputs
    const inputs = [
      this.el.La,
      this.el.Ld,
      this.el.Ls,
      this.el.Ka,
      this.el.Kd,
      this.el.Ks,
      this.el.n,
    ];
    inputs.forEach((inp) =>
      inp?.addEventListener("input", () => this._syncFromUI())
    );

    [
      this.el.modelType,
      this.el.geometry,
      this.el.autoLight,
      this.el.showGrid,
      this.el.showWire,
      this.el.showVectors,
    ].forEach((el) =>
      el?.addEventListener("change", () => {
        if (el === this.el.geometry) this._setGeometryFromSelect();
        this._syncFromUI();
      })
    );

    this.el.lightColor?.addEventListener("input", () => this._syncFromUI());
    this.el.objectColor?.addEventListener("input", () => this._syncFromUI());

    // termos
    Object.values(this.term).forEach((c) =>
      c?.addEventListener("change", () => this._syncFromUI())
    );

    // clique/arrasto para ponto de inspeção
    const onPointer = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._updateInspectPoint();
    };
    this.container.addEventListener("pointerdown", onPointer);
    this.container.addEventListener("pointermove", (e) => {
      if (e.buttons) onPointer(e);
    });
  }

  _syncFromUI() {
    const get = (el, def) => parseFloat(el?.value ?? def);

    const La = get(this.el.La, 0.2);
    const Ld = get(this.el.Ld, 0.8);
    const Ls = get(this.el.Ls, 0.8);

    const Ka = get(this.el.Ka, 0.2);
    const Kd = get(this.el.Kd, 0.7);
    const Ks = get(this.el.Ks, 0.5);
    const nExp = get(this.el.n, 32);

    // refletir valores nos spans (se existirem)
    if (this.el.LaV) this.el.LaV.textContent = La.toFixed(2);
    if (this.el.LdV) this.el.LdV.textContent = Ld.toFixed(2);
    if (this.el.LsV) this.el.LsV.textContent = Ls.toFixed(2);
    if (this.el.KaV) this.el.KaV.textContent = Ka.toFixed(2);
    if (this.el.KdV) this.el.KdV.textContent = Kd.toFixed(2);
    if (this.el.KsV) this.el.KsV.textContent = Ks.toFixed(2);
    if (this.el.nV) this.el.nV.textContent = nExp.toFixed(0);

    // material/luz
    if (this.el.objectColor?.value)
      this.mat.color.set(this.el.objectColor.value);
    if (this.el.lightColor?.value)
      this.light.color.set(this.el.lightColor.value);

    // intensidade baseada nos termos ativados
    const ambOn = !!this.term.ambient?.checked;
    const difOn = !!this.term.diffuse?.checked;
    const speOn = !!this.term.specular?.checked;

    this.ambient.intensity = (ambOn ? 1 : 0) * La * Ka * 2; // ganho didático
    this.light.intensity = ((difOn ? Ld * Kd : 0) + (speOn ? Ls * Ks : 0)) * 2;

    this.mat.shininess = nExp;
    this.mat.wireframe = !!this.el.showWire?.checked;

    // grade/eixos
    const showG = !!this.el.showGrid?.checked;
    this.grid.visible = showG;
    this.axes.visible = showG;

    // vetores: setas + rótulos
    const showV = !!this.el.showVectors?.checked;
    Object.values(this.inspect.arrows).forEach((obj) => {
      obj.arrow.visible = showV;
      obj.label.visible = showV;
    });

    // geometry
    this._setGeometryFromSelect();

    // redesenha fórmula mantendo última escolha
    this._redrawFormulaLast();
  }

  _updateInspectPoint() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, true)[0];
    if (!hit) return;

    const P = hit.point.clone();
    this.inspect.point.copy(P);
    this.inspect.marker.position.copy(P);

    const n =
      hit.face?.normal
        .clone()
        .transformDirection(this.mesh.matrixWorld)
        .normalize() || new THREE.Vector3(0, 1, 0);
    const L = this.light.position.clone().sub(P).normalize();
    const V = this.camera.position.clone().sub(P).normalize();
    const R = L.clone().reflect(n).normalize();
    const H = L.clone().add(V).normalize();

    // helper p/ setas e rótulos
    const setArrow = ({ arrow, label }, dir, name, dy = 0.06) => {
      arrow.position.copy(P);
      arrow.setDirection(dir.clone().normalize());
      label.position.copy(
        P.clone().addScaledVector(dir, 0.9).add(new THREE.Vector3(0, dy, 0))
      );
      label.element && (label.element.textContent = name);
    };

    setArrow(this.inspect.arrows.n, n, "n̂ (normal)", 0.04);
    setArrow(this.inspect.arrows.l, L, "l̂ (luz)");
    setArrow(this.inspect.arrows.v, V, "v̂ (visor)");
    setArrow(this.inspect.arrows.r, R, "r̂ (reflex)");
    setArrow(this.inspect.arrows.h, H, "ĥ (half)");

    // produtos escalares
    const nl = n.dot(L);
    const nlClamped = Math.max(0, nl);
    const rv = Math.max(0, R.dot(V));
    const hn = Math.max(0, H.dot(n));

    // UI (se existir)
    if (this.el.dotNL) this.el.dotNL.textContent = nl.toFixed(2);
    if (this.el.dotNLc) this.el.dotNLc.textContent = nlClamped.toFixed(2);
    if (this.el.dotRV) this.el.dotRV.textContent = rv.toFixed(2);
    if (this.el.dotHN) this.el.dotHN.textContent = hn.toFixed(2);

    const La = parseFloat(this.el.La?.value ?? 0.2);
    const Ld = parseFloat(this.el.Ld?.value ?? 0.8);
    const Ls = parseFloat(this.el.Ls?.value ?? 0.8);
    const Ka = parseFloat(this.el.Ka?.value ?? 0.2);
    const Kd = parseFloat(this.el.Kd?.value ?? 0.7);
    const Ks = parseFloat(this.el.Ks?.value ?? 0.5);
    const nExp = parseFloat(this.el.n?.value ?? 32);

    const usePhong =
      (this.el.modelType?.value ?? "phong").toLowerCase().includes("phong") &&
      !(this.el.modelType?.value ?? "").toLowerCase().includes("blinn");
    const specBase = usePhong ? rv : hn;
    const specPow = Math.pow(specBase, nExp);

    const ambOn = !!this.term.ambient?.checked;
    const difOn = !!this.term.diffuse?.checked;
    const speOn = !!this.term.specular?.checked;

    const Ia = ambOn ? La * Ka : 0;
    const Id = difOn ? Ld * Kd * nlClamped : 0;
    const Is = speOn ? Ls * Ks * specPow : 0;
    const I = Ia + Id + Is;

    if (this.el.specPow) this.el.specPow.textContent = specPow.toFixed(3);
    if (this.el.intensity) this.el.intensity.textContent = I.toFixed(3);

    this._Ia = Ia;
    this._Id = Id;
    this._Is = Is;
    this._specSymbol = usePhong ? "r·v" : "h·n";
    this._drawFormula(Ia, Id, Is, this._specSymbol);
  }

  /* ====== Canvas da fórmula (tamanho governado pelo CSS) ====== */
  _sizeFormulaCanvas() {
    const cv = this.el.formula;
    if (!cv) return;

    // mede tamanho visível do card
    const wCss = Math.max(1, cv.clientWidth);
    const hCss = Math.max(1, cv.clientHeight);

    // retina friendly sem exagero
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(wCss * dpr);
    const H = Math.round(hCss * dpr);

    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    this._formulaScale = dpr;
  }

  _redrawFormulaLast() {
    this._drawFormula(
      this._Ia ?? 0,
      this._Id ?? 0,
      this._Is ?? 0,
      this._specSymbol ?? "r·v"
    );
  }

  _drawFormula(Ia, Id, Is, specSymbol) {
    const cv = this.el.formula;
    if (!cv) return;
    this._sizeFormulaCanvas();

    const ctx = cv.getContext("2d");
    // usa escala para HiDPI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = this._formulaScale || 1;
    ctx.scale(scale, scale);

    const w = cv.clientWidth;
    const h = cv.clientHeight;

    ctx.clearRect(0, 0, w, h);
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText(
      "I = La·Ka  +  Ld·Kd·max(0,n·l)  +  Ls·Ks·max(0," + specSymbol + ")^n",
      12,
      26
    );
    ctx.fillStyle = "#aaa";
    ctx.fillText("Ambiente  = " + Ia.toFixed(3), 14, 60);
    ctx.fillText("Difusa    = " + Id.toFixed(3), 14, 85);
    ctx.fillText("Especular = " + Is.toFixed(3), 14, 110);
    ctx.fillStyle = "#41c5ff";
    ctx.fillText(
      "Clique no objeto para escolher o ponto de inspeção.",
      12,
      144
    );

    // persistir p/ resize
    this._Ia = Ia;
    this._Id = Id;
    this._Is = Is;
    this._specSymbol = specSymbol;
  }

  _animateLight() {
    if (!this.el.autoLight?.checked) return;
    const t = Date.now() * 0.001;
    const r = 3.2;
    this.light.position.set(Math.cos(t) * r, 1.8, Math.sin(t) * r);
    this.bulb.position.copy(this.light.position);
  }

  _renderLoop() {
    this._raf = requestAnimationFrame(() => this._renderLoop());
    this._animateLight();
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer?.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);

    try {
      this.controls?.dispose?.();
    } catch {}
    try {
      this.renderer?.dispose?.();
    } catch {}

    // CSS2DRenderer nem sempre implementa dispose()
    if (this.labelRenderer) {
      try {
        this.labelRenderer.dispose?.();
      } catch {}
      try {
        this.labelRenderer.domElement?.remove();
      } catch {}
      this.labelRenderer = null;
    }

    // remove o conteúdo do viewer
    try {
      this.container.innerHTML = "";
    } catch {}
  }
}

/* ===== Inicialização única ao abrir a aba “Modelo Phong” ===== */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-phong"); // botão da navegação lateral
  if (btn) {
    btn.addEventListener("click", () => {
      // troca de seção (se você usa esse padrão no app)
      document
        .querySelectorAll(".section")
        .forEach((s) => s.classList.add("hidden"));
      document.getElementById("phong-section")?.classList.remove("hidden");

      if (__phongAppInstance) {
        __phongAppInstance.dispose();
        __phongAppInstance = null;
      }
      __phongAppInstance = new PhongApp();
    });
  }

  // fallback: se a seção já estiver visível no carregamento, inicia direto
  const isVisible =
    document.getElementById("phong-section") &&
    !document.getElementById("phong-section").classList.contains("hidden");
  if (isVisible && !__phongAppInstance) {
    __phongAppInstance = new PhongApp();
  }
});
