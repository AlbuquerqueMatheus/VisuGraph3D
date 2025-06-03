// src/main.js

import "./style.css";
import * as THREE from "three";

import { Camera } from "./classes/camera.js";
import { Renderer } from "./classes/Renderer.js";
import { Controls } from "./classes/Controls.js";
import { Lights } from "./classes/Lights.js";
import { GeometryManager } from "./classes/GeometryManager.js";
import { TextureManager } from "./classes/TextureManager.js";
import { GUIManager } from "./classes/GUIManager.js";
import { ModelLoader } from "./classes/ModelLoader.js";
import { CodeGenerator } from "./classes/CodeGenerator.js";
import { EditorManager } from "./classes/EditorManager.js";
import { sizes } from "./classes/Constants.js";

// 1) Seletor de canvas + cena
const canvas = document.querySelector(".webgl");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// 2) Câmera
const cameraManager = new Camera(sizes);
const camera = cameraManager.getInstance();
scene.add(camera);

// 3) Renderer
const rendererManager = new Renderer(canvas, scene);
const renderer = rendererManager.getInstance();

// 4) Gerenciador de geometria (cria cubo e plano)
const geometryManager = new GeometryManager(scene);

// 5) Gerenciador de texturas (usa material do GeometryManager)
const textureManager = new TextureManager(geometryManager.material);

// 6) Controles (Orbit + Transform)
const controlsManager = new Controls(camera, canvas, geometryManager.getDefaultObject());
scene.add(controlsManager.getTransformControls());

// 7) Luzes
const lightsManager = new Lights(scene);

// 8) GUI (liga GeometryManager, TextureManager, Controls e Camera ao lil-gui)
const guiManager = new GUIManager({
  geometryManager,
  textureManager,
  controls: controlsManager,
  camera,
});

// 9) Model Loader (botão + input[file])
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
const modelLoader = new ModelLoader(
  fileInput,
  uploadButton,
  scene,
  (object) => {
    scene.remove(geometryManager.getDefaultObject());
    scene.add(object);
    controlsManager.setControlledObject(object);
    textureManager.applyTextures(object);
  }
);

// 10) Editor de código (CodeMirror)
const editorContainer = document.getElementById("code-editor");
const toggleEditorBtn = document.getElementById("toggleEditorBtn");
const generateCodeBtn = document.getElementById("generateCodeBtn");
const editorManager = new EditorManager(editorContainer, toggleEditorBtn, generateCodeBtn);
const codeEditorInstance = editorManager.getEditorInstance();

// 11) Gerador de código
const codeGenerator = new CodeGenerator(
  scene,
  camera,
  renderer,
  codeEditorInstance,
  generateCodeBtn
);

// 12) Responsivo
window.addEventListener("resize", () => {
  const newSizes = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  cameraManager.onResize(newSizes);
  rendererManager.onResize(newSizes);
});

// 13) Loop de animação
const tick = () => {
  controlsManager.update();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
};
tick();

// 14) Pré-carrega texturas (se ainda não for chamado dentro do GUIManager)
textureManager.preloadAll();
