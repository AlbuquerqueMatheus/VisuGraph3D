// src/classes/Controls.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.orbit = new OrbitControls(camera, domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;

    this.transform = new TransformControls(camera, domElement);
    this.transform.setSize(1.0);
    this.transform.enabled = true;

    this.transform.addEventListener("dragging-changed", (e) => {
      this.orbit.enabled = !e.value;
    });

    this.current = null;
    this._spinEnabled = false;
    this._spinSpeed = 0.02;
    this._initialTRS = new WeakMap();
  }

  mount(scene) {
    if (!this.transform.parent) scene.add(this.transform);
  }

  setControlledObject(object3D) {
    this.current = object3D || null;

    if (!this.current) {
      this.transform.detach();
      return;
    }

    if (!this._initialTRS.has(this.current)) {
      this._initialTRS.set(this.current, {
        position: this.current.position.clone(),
        rotation: this.current.rotation.clone(),
        scale: this.current.scale.clone(),
      });
    }

    if (this.transform.getMode && this.transform.getMode() !== "none") {
      this.transform.attach(this.current);
    }
  }

  /** <- adicionado para facilitar leituras externas */
  getControlledObject() {
    return this.current;
  }

  setMode(mode) {
    if (!this.transform) return;

    if (!mode || mode === "none") {
      this.transform.detach();
      return;
    }

    this.transform.setMode(mode);
    if (this.current) this.transform.attach(this.current);
  }

  spin(toggle = true) {
    if (typeof toggle === "boolean") this._spinEnabled = toggle;
    else this._spinEnabled = !this._spinEnabled;
  }

  reset() {
    if (!this.current) return;
    const init = this._initialTRS.get(this.current);
    if (!init) {
      this.current.position.set(0, 0, 0);
      this.current.rotation.set(0, 0, 0);
      this.current.scale.set(1, 1, 1);
    } else {
      this.current.position.copy(init.position);
      this.current.rotation.copy(init.rotation);
      this.current.scale.copy(init.scale);
    }
  }

  update() {
    if (this._spinEnabled && this.current) {
      this.current.rotation.y += this._spinSpeed;
    }
    this.orbit?.update?.();
  }
}
