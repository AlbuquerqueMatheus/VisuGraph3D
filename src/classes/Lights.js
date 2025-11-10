// src/classes/Lights.js
import * as THREE from "three";

export class Lights {
  constructor(scene) {
    this.scene = scene;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(5, 5, 5);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.bias = -0.00015;
    scene.add(this.directionalLight);

    this.helpers = { dir: null };
  }

  toggleShadows(enabled, renderer) {
    if (renderer) renderer.shadowMap.enabled = !!enabled;
    this.directionalLight.castShadow = !!enabled;
  }

  setAmbientIntensity(v) {
    this.ambientLight.intensity = v;
  }
  setDirectionalIntensity(v) {
    this.directionalLight.intensity = v;
  }
  setDirectionalPosition(x, y, z) {
    this.directionalLight.position.set(x, y, z);
  }
  setDirectionalColor(hex) {
    this.directionalLight.color.set(hex);
  }
}
