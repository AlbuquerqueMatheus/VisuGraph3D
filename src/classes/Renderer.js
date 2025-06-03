// src/classes/Renderer.js

import * as THREE from "three";
import { sizes } from "./Constants.js";

export class Renderer {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.scene = scene;
    this.sizes = { ...sizes };

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.setSize(this.sizes.width, this.sizes.height);
    this.setPixelRatio();
  }

  setSize(width, height) {
    this.renderer.setSize(width, height);
  }

  setPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // Método de resize
  onResize(newSizes) {
    this.sizes = newSizes;
    this.setSize(this.sizes.width, this.sizes.height);
    this.setPixelRatio();
  }

  // Renderiza a cena com a câmera informada
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  getInstance() {
    return this.renderer;
  }
}
