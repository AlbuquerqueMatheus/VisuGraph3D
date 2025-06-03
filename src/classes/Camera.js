// src/classes/Camera.js

import * as THREE from "three";
import { debugObject } from "./Constants.js";

export class Camera {
  constructor(sizes) {
    this.sizes = sizes;
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );
    this.camera.position.z = debugObject.cameraPositionZ;
  }

  // Retorna a instância para ser adicionada à cena (caso queira)
  getInstance() {
    return this.camera;
  }

  // Método de resize
  onResize(newSizes) {
    this.sizes = newSizes;
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
  }
}
