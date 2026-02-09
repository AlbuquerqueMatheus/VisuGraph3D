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
import { AnimationManager } from "../classes/AnimationManager.js";
import { ChangeDetector } from "../classes/ChangeDetector.js";

// ===== NOVO: Sincronização Bidirecional =====
import { CodeSyncEngine } from "../classes/CodeSyncEngine.js";
import { DiffViewer } from "../classes/DiffViewer.js";
import { TooltipSystem } from "../classes/TooltipSystem.js";

/* util DOM */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* Seletores */
const canvas = $(".webgl");
const screenMenu = $("#menu-screen");
const screen3D = $("#screen-3d");
const btnBack = $("#back-to-menu-3d");
const btnToggleEditor = $("#toggleEditorBtn");
const btnGenerateCode = $("#generateCodeBtn");
const btnUpload = $("#upload-button");
const fileInput = $("#file-input");
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
const btnCamFront = $("#cam-front");
const btnCamBack = $("#cam-back");
const btnCamLeft = $("#cam-left");
const btnCamRight = $("#cam-right");
const btnCamTop = $("#cam-top");
const btnCamIso = $("#cam-iso");
const btnCamFit = $("#cam-fit");
const btnCamReset = $("#cam-reset");
const rngCamDistance = $("#cam-distance");
const rngCamFov = $("#cam-fov");
// Animações
const btnSpin = $("#spin-btn");
const btnReset = $("#reset-btn");
const rngExtrude = $("#extrude-range");
// Nova UI de animação
const chkAnimRotate = $("#anim-rotate-enabled");
const selAnimAxis = $("#anim-rotate-axis");
const rngAnimRotateSpeed = $("#anim-rotate-speed");
const chkAnimFloat = $("#anim-float-enabled");
const rngAnimFloatAmp = $("#anim-float-amp");
const rngAnimFloatSpeed = $("#anim-float-speed");
const btnAnimReset = $("#anim-reset");
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

/* Cena / Render / Câmera */
const scene = new THREE.Scene();
scene.background = null;

const cameraManager = new Camera(sizes);
const camera = cameraManager.camera || cameraManager.instance || cameraManager;
const rendererManager = new Renderer(canvas, sizes);
const renderer = rendererManager.renderer || rendererManager.instance || rendererManager;
const controlsManager = new Controls(camera, renderer.domElement || canvas || document.body);
controlsManager.mount(scene);

const lightsManager = new Lights(scene);
const geometryManager = new GeometryManager(scene);
const textureManager = new TextureManager(renderer);
const animationManager = new AnimationManager();
const changeDetector = new ChangeDetector();

let currentSceneState = null;
let autoUpdateEnabled = false; // Controla atualização automática

/* Inicializa o OBJETO ATIVO logo no começo! */
const defaultObj = (geometryManager.getDefaultObject && geometryManager.getDefaultObject()) || geometryManager.object || null;
if (defaultObj) {
  controlsManager.setControlledObject(defaultObj);
  const startMode = (() => {
    const r = radiosMode.find((n) => n.checked);
    return r ? r.value : "none";
  })();
  if (startMode && startMode !== "none") controlsManager.setMode(startMode);

  cameraManager.setTargetFromObject?.(defaultObj);
  cameraManager.setPresetView?.("iso", null, controlsManager.orbit);
  animationManager.setTargetObject(defaultObj);
  syncCameraUI();
}

/* Helpers */
function getActiveObject() {
  return (
    controlsManager.getControlledObject?.() ||
    geometryManager.getDefaultObject?.() ||
    null
  );
}

function getCameraDistanceToTarget() {
  const t = cameraManager.target || new THREE.Vector3();
  return camera.position.distanceTo(t);
}

function syncCameraUI() {
  if (rngCamDistance) {
    const dist = getCameraDistanceToTarget();
    const min = parseFloat(rngCamDistance.min || "0");
    const max = parseFloat(rngCamDistance.max || "100");
    const clamped = Math.min(max, Math.max(min, dist));
    rngCamDistance.value = String(clamped.toFixed(2));
  }
  if (rngCamFov) {
    rngCamFov.value = String(Math.round(camera.fov));
  }
}

function setSectionActive(key) {
  sections.forEach((sec) => sec.classList.remove("active"));
  navButtons.forEach((b) => b.classList.remove("active"));
  $(`#section-${key}`)?.classList.add("active");
  sidebar.querySelector(`nav button[data-section="${key}"]`)?.classList.add("active");
}

navButtons.forEach((btn) =>
  btn.addEventListener("click", () => setSectionActive(btn.dataset.section))
);
setSectionActive("cube");

/* ===== NOVO: Sistema de Sincronização Bidirecional ===== */
let editor = null;
let codeSyncEngine = null;
let diffViewer = null;
let tooltipSystem = null;

if (EditorManager && $("#code-editor")) {
  try {
    editor = new EditorManager("#code-editor", {
      theme: "dracula",
      language: "javascript",
    });
  } catch {}
}

// Instancia os sistemas de sync e UI educacional
if (editor) {
  codeSyncEngine = new CodeSyncEngine({
    codeGenerator: CodeGenerator,
    editor: editor,
    scene: scene,
    camera: camera,
    lights: lightsManager,
    geometryManager: geometryManager,
    animationManager: animationManager,
  });

  diffViewer = new DiffViewer('#diff-viewer');
  tooltipSystem = new TooltipSystem(editor);
  tooltipSystem.enable();

  codeSyncEngine.onCodeChange((data) => {
    if (diffViewer) diffViewer.show(data);
  });

  createSyncControls();
}

/* Sincronização UI → Código */
function generateAndDisplayCode() {
  const mainObject = getActiveObject();
  if (!mainObject) {
    console.warn('Nenhum objeto ativo encontrado');
  }
  // Gera código usando APENAS o objeto principal
  const code = CodeGenerator.generate({
    scene: scene,
    camera: camera,
    object: mainObject,
    lights: lightsManager,
    animationManager: animationManager,
  });

  const editorEl = $("#code-editor");
  if (editorEl) {
    editorEl.classList.add("updating");
    setTimeout(() => editorEl.classList.remove("updating"), 300);
  }

  if (editor?.setValue) {
    editor.setValue(code || "// Erro ao gerar código.");
  } else if (editorEl) {
    editorEl.textContent = code || "// Erro ao gerar código.";
  }

  const status = $("#code-status");
  if (status) {
    const lines = code.split('\n').length;
    status.textContent = `✅ Código gerado - ${lines} linhas - ${new Date().toLocaleTimeString()}`;
    setTimeout(() => {
      status.textContent = "Pronto para gerar código";
    }, 3000);
  }
}

/* NOVO: Função helper para notificar mudanças e ativar sync */
function notifyChange(changeType = "unknown", changeData = {}) {
  if (autoUpdateEnabled) {
    setTimeout(() => {
      generateAndDisplayCode();
    }, 100);
  }

  // Notifica sync engine
  if (codeSyncEngine && codeSyncEngine.syncEnabled) {
    codeSyncEngine.updateCodeFromUI(changeType, changeData);
  }
}

/* NOVO: Controles de Sincronização Bidirecional */
function createSyncControls() {
  const checkbox = $("#sync-bidirectional");
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      codeSyncEngine?.enableSync();
    } else {
      codeSyncEngine?.disableSync();
    }
  });
}

/* ==== Sistema de Auto-Atualização ==== */
function startAutoUpdate() {
  changeDetector.startWatching(
    scene,
    camera,
    lightsManager,
    geometryManager,
    animationManager,
    (changeResult, newState) => {
      const editorVisible = !$("#code-editor-container")?.classList.contains("hidden");
      if (editorVisible && autoUpdateEnabled) generateAndDisplayCode();
    }
  );
}

function createAutoUpdateToggle() {
  const checkbox = $("#auto-update-code");
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    autoUpdateEnabled = e.target.checked;
    if (autoUpdateEnabled) {
      startAutoUpdate();
      generateAndDisplayCode();
    } else {
      changeDetector.stopWatching();
    }
  });
}

/* =================== Eventos dos controles =================== */
// Aparência
selGeometry?.addEventListener("change", (e) => {
  if (geometryManager?.setGeometry) {
    const obj = geometryManager.setGeometry(e.target.value);
    controlsManager.setControlledObject(obj);
    animationManager.setTargetObject(obj);
    cameraManager.setTargetFromObject?.(obj);
    textureManager?.applyTextures?.(obj);
    notifyChange("geometry", { type: e.target.value });
  }
});

selTexture?.addEventListener("change", (e) => {
  const obj = getActiveObject();
  if (pbrGroup) pbrGroup.classList.toggle("hidden", e.target.value !== "custom");
  textureManager?.applyTextureToObject?.(obj, e.target.value);
  notifyChange("texture", { texture: e.target.value });
});

function bindPbrInput(input, mapName) {
  if (!input) return;
  input.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    textureManager?.setCustomMapFromFile?.(mapName, file);
    if (selTexture && selTexture.value !== "custom") {
      selTexture.value = "custom"; if (pbrGroup) pbrGroup.classList.remove("hidden");
    }
    const obj = getActiveObject();
    textureManager?.applyTextureToObject?.(obj, "custom");
    notifyChange("texture", { map: mapName });
  });
}
bindPbrInput(inpPbrColor, "color");
bindPbrInput(inpPbrNormal, "normal");
bindPbrInput(inpPbrRoughness, "roughness");
bindPbrInput(inpPbrMetalness, "metalness");
bindPbrInput(inpPbrAo, "ao");
bindPbrInput(inpPbrDisplacement, "displacement");

selRenderStyle?.addEventListener("change", (e) => {
  const obj = getActiveObject();
  if (geometryManager?.setRenderStyle) {
    geometryManager.setRenderStyle(obj, e.target.value);
  } else if (obj) {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material) {
        c.material.wireframe = e.target.value === "wireframe";
        c.material.flatShading = e.target.value === "flat";
        c.material.needsUpdate = true;
      }
    });
  }
  notifyChange("renderStyle", { style: e.target.value });
});

rngSubdivisions?.addEventListener("input", (e) => {
  const obj = geometryManager?.setSubdivisions?.(+e.target.value);
  if (obj) {
    controlsManager.setControlledObject(obj);
    animationManager.setTargetObject(obj);
    cameraManager.setTargetFromObject?.(obj);
    notifyChange("subdivisions", { subdivisions: +e.target.value });
  }
});

colorPicker?.addEventListener("input", (e) => {
  const obj = getActiveObject();
  if (!obj) return;
  if (geometryManager?.setColor) {
    geometryManager.setColor(obj, e.target.value);
  } else {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material && c.material.color) {
        c.material.color = new THREE.Color(e.target.value);
      }
    });
  }
  notifyChange("color", { hex: e.target.value });
});

rngOpacity?.addEventListener("input", (e) => {
  const obj = getActiveObject();
  if (!obj) return;
  if (geometryManager?.setOpacity) {
    geometryManager.setOpacity(obj, +e.target.value);
  } else {
    obj.traverse?.((c) => {
      if (c.isMesh && c.material) {
        c.material.transparent = +e.target.value < 1;
        c.material.opacity = +e.target.value;
        c.material.needsUpdate = true;
      }
    });
  }
  notifyChange("opacity", { opacity: +e.target.value });
});

// Sombras
chkShadows?.addEventListener("change", (e) => {
  if (lightsManager?.toggleShadows) lightsManager.toggleShadows(e.target.checked, renderer);
  else renderer.shadowMap.enabled = !!e.target.checked;
  notifyChange("shadows", { enabled: e.target.checked });
});

// Câmera
function applyCameraDistanceFromUI() {
  cameraManager.setDistance?.(parseFloat(rngCamDistance.value || "0"), controlsManager.orbit);
  notifyChange("cameraDistance", { distance: parseFloat(rngCamDistance.value || "0") });
}

function applyCameraFovFromUI() {
  cameraManager.setFov?.(parseFloat(rngCamFov.value || "60"));
  notifyChange("cameraFov", { fov: parseFloat(rngCamFov.value || "60") });
}

rngCamDistance?.addEventListener("input", applyCameraDistanceFromUI);
rngCamFov?.addEventListener("input", applyCameraFovFromUI);

btnCamFront?.addEventListener("click", () => {
  cameraManager.setPresetView?.("front", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "front" });
});
btnCamBack?.addEventListener("click", () => {
  cameraManager.setPresetView?.("back", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "back" });
});
btnCamLeft?.addEventListener("click", () => {
  cameraManager.setPresetView?.("left", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "left" });
});
btnCamRight?.addEventListener("click", () => {
  cameraManager.setPresetView?.("right", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "right" });
});
btnCamTop?.addEventListener("click", () => {
  cameraManager.setPresetView?.("top", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "top" });
});
btnCamIso?.addEventListener("click", () => {
  cameraManager.setPresetView?.("iso", getCameraDistanceToTarget(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraPreset", { preset: "iso" });
});
btnCamFit?.addEventListener("click", () => {
  cameraManager.fitToObject?.(getActiveObject(), controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraFit", {});
});
btnCamReset?.addEventListener("click", () => {
  cameraManager.reset?.(controlsManager.orbit);
  syncCameraUI(); notifyChange("cameraReset", {});
});
btnReset?.addEventListener("click", () => {
  controlsManager.reset(); notifyChange("controlsReset", {});
});

// === Nova seção de animação ===
function updateRotateFromUI() {
  animationManager.setRotateOptions({
    enabled: !!chkAnimRotate?.checked,
    axis: selAnimAxis?.value || "y",
    speed: parseFloat(rngAnimRotateSpeed?.value || "0")
  });
  notifyChange("animationRotate", {});
}
function updateFloatFromUI() {
  animationManager.setFloatOptions({
    enabled: !!chkAnimFloat?.checked,
    amplitude: parseFloat(rngAnimFloatAmp?.value || "0"),
    speed: parseFloat(rngAnimFloatSpeed?.value || "0")
  });
  notifyChange("animationFloat", {});
}

chkAnimRotate?.addEventListener("change", updateRotateFromUI);
selAnimAxis?.addEventListener("change", updateRotateFromUI);
rngAnimRotateSpeed?.addEventListener("input", updateRotateFromUI);
chkAnimFloat?.addEventListener("change", updateFloatFromUI);
rngAnimFloatAmp?.addEventListener("input", updateFloatFromUI);
rngAnimFloatSpeed?.addEventListener("input", updateFloatFromUI);
btnAnimReset?.addEventListener("click", () => {
  animationManager?.resetAnimationState?.(); notifyChange("animationReset", {});
});

updateRotateFromUI(); updateFloatFromUI();

// Transform modes
function applyModeFromUI() {
  controlsManager.setMode(radiosMode.find((n) => n.checked)?.value || "none");
  notifyChange("transformMode", {});
}
radiosMode.forEach((r) => r.addEventListener("change", applyModeFromUI));
applyModeFromUI();

// Array modifier
function onArrayChange() {
  geometryManager?.setArrayModifier?.({
    count: +rngArrayCount.value,
    offX: +rngArrayX.value,
    offY: +rngArrayY.value,
    offZ: +rngArrayZ.value,
  });
  notifyChange("arrayModifier", {
    count: +rngArrayCount.value,
    offX: +rngArrayX.value,
    offY: +rngArrayY.value,
    offZ: +rngArrayZ.value,
  });
}
[rngArrayCount, rngArrayX, rngArrayY, rngArrayZ].forEach((el) => el?.addEventListener("input", onArrayChange));

// Luzes
rngAmbient?.addEventListener("input", (e) => {
  lightsManager?.setAmbientIntensity?.(+e.target.value);
  notifyChange("ambientLight", { intensity: +e.target.value });
});
rngDirectional?.addEventListener("input", (e) => {
  lightsManager?.setDirectionalIntensity?.(+e.target.value);
  notifyChange("directionalLight", { intensity: +e.target.value });
});
[rngDirX, rngDirY, rngDirZ].forEach((el) => el?.addEventListener("input", () => {
  lightsManager?.setDirectionalPosition?.(
    +rngDirX.value,
    +rngDirY.value,
    +rngDirZ.value
  );
  notifyChange("directionalLightPosition", {
    x: +rngDirX.value,
    y: +rngDirY.value,
    z: +rngDirZ.value,
  });
}));
colorDir?.addEventListener("input", (e) => {
  lightsManager?.setDirectionalColor?.(e.target.value);
  notifyChange("directionalLightColor", { color: e.target.value });
});

// Upload de modelo
if (btnUpload && fileInput) {
  btnUpload.addEventListener("click", () => fileInput.click());
  new ModelLoader(fileInput, btnUpload, scene, (object) => {
    let old = geometryManager?.getDefaultObject?.() || geometryManager.object || null;
    if (old && old.parent) old.parent.remove(old);
    geometryManager.object = object;
    scene.add(object);
    controlsManager.setControlledObject(object);
    animationManager.setTargetObject(object);
    cameraManager.setTargetFromObject?.(object);
    cameraManager.fitToObject?.(object, controlsManager.orbit);
    textureManager?.applyTextures?.(object);
    syncCameraUI();
    notifyChange("modelUpload", {});
  });
}

/* ===== Editor / CodeGen ===== */
// Copiar, Download, Toggle, etc
$("#copy-code-btn")?.addEventListener("click", () => {
  const code = editor?.getValue() || $("#code-editor")?.textContent || "";
  navigator.clipboard.writeText(code).then(() => {
    const status = $("#code-status");
    if (status) {
      status.textContent = "✅ Código copiado para área de transferência!";
      setTimeout(() => {
        status.textContent = "Pronto para gerar código";
      }, 2000);
    }
  });
});
$("#download-code-btn")?.addEventListener("click", () => {
  const code = editor?.getValue() || $("#code-editor")?.textContent || "";
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `visugraph-export-${Date.now()}.js`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const status = $("#code-status");
  if (status) {
    status.textContent = "💾 Arquivo baixado com sucesso!";
    setTimeout(() => {
      status.textContent = "Pronto para gerar código";
    }, 2000);
  }
});

btnToggleEditor?.addEventListener("click", () => {
  $("#code-editor-container")?.classList.toggle("hidden");
  btnGenerateCode?.classList.toggle("hidden");
});
btnGenerateCode?.addEventListener("click", () => {
  generateAndDisplayCode();
});

/* Voltar ao Menu */
btnBack?.addEventListener("click", () => {
  document.body.classList.remove("page-3d");
  document.body.classList.add("page-home");
  screen3D?.classList.add("hidden");
  screen3D?.setAttribute("aria-hidden", "true");
  screenMenu?.classList.remove("hidden");
});

/* Resize */
window.addEventListener("resize", () => {
  const newSizes = { width: window.innerWidth, height: window.innerHeight };
  cameraManager?.onResize?.(newSizes);
  rendererManager?.onResize?.(newSizes);
});

/* Loop */
const clock = new THREE.Clock();
function tick() {
  const delta = clock.getDelta();
  animationManager?.update?.(delta);
  controlsManager.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

/* Preload */
textureManager?.preloadAll?.();
