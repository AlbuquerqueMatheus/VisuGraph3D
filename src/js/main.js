// src/js/main.js
import * as THREE from "three";

// ==== Classes do projeto ====
import { Camera } from "../classes/Camera.js";
import { Renderer } from "../classes/Renderer.js";
import { Controls } from "../classes/Controls.js";
import { Lights } from "../classes/Lights.js";
import { GeometryManager } from "../classes/GeometryManager.js";
import { TextureManager } from "../classes/TextureManager.js";
import { ModelLoader } from "../classes/ModelLoader.js";
import { CodeGenerator } from "../classes/CodeGenerator.js";
import { EditorManager } from "../classes/EditorManager.js";
import { sizes } from "../classes/Constants.js";

/* ------------------------------------------------------------------ */
/* util DOM                                                           */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------------------------------------------------------------ */
/* Seletores                                                          */
/* ------------------------------------------------------------------ */
const canvas = $(".webgl");
const screenMenu = $("#menu-screen");
const screen3D = $("#screen-3d");

// Botões globais
const btnBack = $("#back-to-menu-3d");
const btnToggleEditor = $("#toggleEditorBtn");
const btnGenerateCode = $("#generateCodeBtn");
const btnUpload = $("#upload-button");
const fileInput = $("#file-input");

// Sidebar
const sidebar = $("#sidebar");
const navButtons = $$("nav button[data-section]", sidebar);
const sections = $$(".section", sidebar);

// Aparência
const selGeometry = $("#geometry-select");
const selTexture = $("#texture-select");
const selRenderStyle = $("#renderStyle-select");
const rngSubdivisions = $("#subdivisions-range");
const colorPicker = $("#color-picker");
const rngOpacity = $("#opacity-range");

// Upload PBR
const pbrGroup = $("#pbr-group");
const inpPbrColor = $("#pbr-color");
const inpPbrNormal = $("#pbr-normal");
const inpPbrRoughness = $("#pbr-roughness");
const inpPbrMetalness = $("#pbr-metalness");
const inpPbrAo = $("#pbr-ao");
const inpPbrDisplacement = $("#pbr-displacement");


// Sombras
const chkShadows = $("#shadows-checkbox");

// Câmera
const rngCameraZ = $("#cameraZ-range");

// Animações
const btnSpin = $("#spin-btn");
const btnReset = $("#reset-btn");
const rngExtrude = $("#extrude-range");

// Transform modes
const radiosMode = $$("input[name='mode']");

// Array
const rngArrayCount = $("#array-count");
const rngArrayX = $("#array-offsetX");
const rngArrayY = $("#array-offsetY");
const rngArrayZ = $("#array-offsetZ");

// Luzes
const rngAmbient = $("#ambient-range");
const rngDirectional = $("#directional-range");
const rngDirX = $("#dirPosX-range");
const rngDirY = $("#dirPosY-range");
const rngDirZ = $("#dirPosZ-range");
const colorDir = $("#dirColor-picker");

/* ------------------------------------------------------------------ */
/* Cena / Render / Câmera                                             */
/* ------------------------------------------------------------------ */
const scene = new THREE.Scene();
scene.background = null;

const cameraManager = new Camera(sizes);
const camera = cameraManager.camera || cameraManager.instance || cameraManager;

const rendererManager = new Renderer(canvas, sizes);
const renderer =
  rendererManager.renderer || rendererManager.instance || rendererManager;

const controlsManager = new Controls(
  camera,
  renderer.domElement || canvas || document.body
);
controlsManager.mount(scene);

const lightsManager = new Lights(scene);
const geometryManager = new GeometryManager(scene);
const textureManager = new TextureManager(renderer);

/* ------------------------------------------------------------------ */
/* Inicializa o OBJETO ATIVO logo no começo!                          */
/* ------------------------------------------------------------------ */
const defaultObj =
  (geometryManager.getDefaultObject && geometryManager.getDefaultObject()) ||
  geometryManager.object ||
  null;

if (defaultObj) {
  controlsManager.setControlledObject(defaultObj);
  // Se o usuário já estiver com algum modo marcado (não "none"), anexa gizmo
  const startMode = (function () {
    const r = radiosMode.find((n) => n.checked);
    return r ? r.value : "none";
  })();
  if (startMode && startMode !== "none") controlsManager.setMode(startMode);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function getActiveObject() {
  return (
    controlsManager.getControlledObject?.() ||
    geometryManager.getDefaultObject?.() ||
    null
  );
}

function setSectionActive(key) {
  sections.forEach((sec) => sec.classList.remove("active"));
  navButtons.forEach((b) => b.classList.remove("active"));
  $(`#section-${key}`)?.classList.add("active");
  sidebar.querySelector(`nav button[data-section="${key}"]`)?.classList.add("active");
}

/* Navegação lateral */
navButtons.forEach((btn) =>
  btn.addEventListener("click", () => setSectionActive(btn.dataset.section))
);
setSectionActive("cube");

/* ------------------------------------------------------------------ */
/* Eventos dos controles                                              */
/* ------------------------------------------------------------------ */
// Aparência
selGeometry?.addEventListener("change", (e) => {
  const type = e.target.value;
  if (geometryManager?.setGeometry) {
    const obj = geometryManager.setGeometry(type);
    controlsManager.setControlledObject(obj);
    textureManager?.applyTextures?.(obj);
  }
});

selTexture?.addEventListener("change", (e) => {
  const tex = e.target.value;
  const obj = getActiveObject();

  // Mostra/esconde o grupo de upload PBR
  if (pbrGroup) {
    pbrGroup.classList.toggle("hidden", tex !== "custom");
  }

  textureManager?.applyTextureToObject?.(obj, tex);
});

function bindPbrInput(input, mapName) {
  if (!input) return;
  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Atualiza o set "custom" dentro do TextureManager
    textureManager?.setCustomMapFromFile?.(mapName, file);

    // Garante que o select esteja em "custom"
    if (selTexture && selTexture.value !== "custom") {
      selTexture.value = "custom";
      if (pbrGroup) pbrGroup.classList.remove("hidden");
    }

    const obj = getActiveObject();
    textureManager?.applyTextureToObject?.(obj, "custom");
  });
}

bindPbrInput(inpPbrColor, "color");
bindPbrInput(inpPbrNormal, "normal");
bindPbrInput(inpPbrRoughness, "roughness");
bindPbrInput(inpPbrMetalness, "metalness");
bindPbrInput(inpPbrAo, "ao");
bindPbrInput(inpPbrDisplacement, "displacement");


selRenderStyle?.addEventListener("change", (e) => {
  const value = e.target.value; // normal|wireframe|flat
  const obj = getActiveObject();
  if (geometryManager?.setRenderStyle) {
    geometryManager.setRenderStyle(obj, value);
  } else if (obj) {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material) {
        c.material.wireframe = value === "wireframe";
        c.material.flatShading = value === "flat";
        c.material.needsUpdate = true;
      }
    });
  }
});

rngSubdivisions?.addEventListener("input", (e) => {
  const v = +e.target.value;
  const obj = geometryManager?.setSubdivisions?.(v);
  if (obj) controlsManager.setControlledObject(obj);
});

colorPicker?.addEventListener("input", (e) => {
  const hex = e.target.value;
  const obj = getActiveObject();
  if (!obj) return;
  if (geometryManager?.setColor) {
    geometryManager.setColor(obj, hex);
  } else {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material && c.material.color) {
        c.material.color = new THREE.Color(hex);
      }
    });
  }
});

rngOpacity?.addEventListener("input", (e) => {
  const v = +e.target.value;
  const obj = getActiveObject();
  if (!obj) return;
  if (geometryManager?.setOpacity) {
    geometryManager.setOpacity(obj, v);
  } else {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material) {
        c.material.transparent = v < 1;
        c.material.opacity = v;
        c.material.needsUpdate = true;
      }
    });
  }
});

// Sombras
chkShadows?.addEventListener("change", (e) => {
  const enabled = e.target.checked;
  if (lightsManager?.toggleShadows) lightsManager.toggleShadows(enabled, renderer);
  else renderer.shadowMap.enabled = !!enabled;
});

// Câmera
rngCameraZ?.addEventListener("input", (e) => {
  camera.position.z = +e.target.value;
});

// Animações
btnSpin?.addEventListener("click", () => {
  controlsManager.spin(); // alterna on/off
  btnSpin.textContent = btnSpin.textContent === "Spin" ? "Stop" : "Spin";
});

btnReset?.addEventListener("click", () => {
  controlsManager.reset();
});

rngExtrude?.addEventListener("input", (e) => {
  const amount = +e.target.value;
  geometryManager?.setExtrudeAmount?.(amount);
});

// Transform modes
function applyModeFromUI() {
  const mode = radiosMode.find((n) => n.checked)?.value || "none";
  controlsManager.setMode(mode);
}
radiosMode.forEach((r) => r.addEventListener("change", applyModeFromUI));
applyModeFromUI(); // garante estado inicial coerente

// Array modifier
function onArrayChange() {
  const count = +rngArrayCount.value;
  const offX = +rngArrayX.value;
  const offY = +rngArrayY.value;
  const offZ = +rngArrayZ.value;
  geometryManager?.setArrayModifier?.({ count, offX, offY, offZ });
}
[rngArrayCount, rngArrayX, rngArrayY, rngArrayZ].forEach((el) =>
  el?.addEventListener("input", onArrayChange)
);

// Luzes
rngAmbient?.addEventListener("input", (e) => {
  lightsManager?.setAmbientIntensity?.(+e.target.value);
});
rngDirectional?.addEventListener("input", (e) => {
  lightsManager?.setDirectionalIntensity?.(+e.target.value);
});
[rngDirX, rngDirY, rngDirZ].forEach((el) =>
  el?.addEventListener("input", () => {
    lightsManager?.setDirectionalPosition?.(
      +rngDirX.value,
      +rngDirY.value,
      +rngDirZ.value
    );
  })
);
colorDir?.addEventListener("input", (e) => {
  lightsManager?.setDirectionalColor?.(e.target.value);
});

// Upload de modelo
if (btnUpload && fileInput) {
  btnUpload.addEventListener("click", () => fileInput.click());
  new ModelLoader(fileInput, btnUpload, scene, (object) => {
    const def = geometryManager?.getDefaultObject?.();
    if (def) scene.remove(def);
    scene.add(object);
    controlsManager.setControlledObject(object);
    textureManager?.applyTextures?.(object);
  });
}

// Editor / CodeGen
let editor = null;
if (EditorManager && $("#code-editor")) {
  try {
    editor = new EditorManager("#code-editor", {
      theme: "dracula",
      language: "javascript",
    });
  } catch {}
}
btnToggleEditor?.addEventListener("click", () => {
  $("#code-editor")?.classList.toggle("hidden");
  btnGenerateCode?.classList.toggle("hidden");
});
btnGenerateCode?.addEventListener("click", () => {
  const code = CodeGenerator.generate?.({
    scene,
    camera,
    object: getActiveObject(),
    lights: lightsManager,
  });
  if (editor?.setValue) editor.setValue(code || "// Gerador não implementado.");
  else $("#code-editor").textContent = code || "// Gerador não implementado.";
});

// Voltar
btnBack?.addEventListener("click", () => {
  document.body.classList.remove("page-3d");
  document.body.classList.add("page-home");
  screen3D?.classList.add("hidden");
  screen3D?.setAttribute("aria-hidden", "true");
  screenMenu?.classList.remove("hidden");
});

// Resize
window.addEventListener("resize", () => {
  const newSizes = { width: window.innerWidth, height: window.innerHeight };
  cameraManager?.onResize?.(newSizes);
  rendererManager?.onResize?.(newSizes);
});

// Loop
function tick() {
  controlsManager.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// Preload
textureManager?.preloadAll?.();
