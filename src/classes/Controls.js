// src/classes/Controls.js

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export class Controls {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLCanvasElement} canvas
   * @param {THREE.Object3D} defaultObject (por padrão, o cubo inicial)
   * @param {function} onTransformChange callback para ativar/desativar orbit
   */
  constructor(camera, canvas, defaultObject) {
    this.camera = camera;
    this.canvas = canvas;
    this.currentObject = defaultObject;

    // OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.enableDamping = true;

    // TransformControls
    this.transformControls = new TransformControls(this.camera, this.canvas);
    this.transformControls.attach(this.currentObject);
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.orbitControls.enabled = !event.value;
    });
  }

  // Atualiza o objeto que está sendo manipulado pelos TransformControls
  setControlledObject(object) {
    this.currentObject = object;
    this.transformControls.attach(this.currentObject);
  }

  // Converte a string de modo em transformControls.setMode
  updateTransformMode(mode) {
    if (mode === "none") {
      this.transformControls.detach();
    } else {
      this.transformControls.attach(this.currentObject);
      this.transformControls.setMode(mode);
    }
  }

  // Devolve as instâncias para adicionar na cena
  getOrbitControls() {
    return this.orbitControls;
  }
  getTransformControls() {
    return this.transformControls;
  }

  // Chamado no loop de animação para atualizar damping
  update() {
    this.orbitControls.update();
  }
}
