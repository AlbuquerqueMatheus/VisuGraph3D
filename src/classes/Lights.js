// src/classes/Lights.js

import * as THREE from "three";

export class Lights {
  constructor(scene, gui) {
    this.scene = scene;
    this.gui = gui;

    // Cria luzes
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.pointLight = new THREE.PointLight(0xffffff, 1);

    // Configura sombras para a directional
    this.directionalLight.position.set(5, 5, 5);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;

    // Posições iniciais
    this.pointLight.position.set(0, 3, 0);

    // Adiciona à cena
    this.scene.add(this.ambientLight, this.directionalLight, this.pointLight);

    // Se gui estiver definido, adiciona controles de intensidade/cor
    if (this.gui) {
      const lightsFolder = this.gui.addFolder("Lights");
      lightsFolder.add(this.ambientLight, "intensity", 0, 2, 0.01).name("Ambient Light Intensity");
      lightsFolder.add(this.directionalLight, "intensity", 0, 2, 0.01).name("Directional Light Intensity");
      lightsFolder
        .add(this.directionalLight.position, "x", -10, 10, 0.1)
        .name("Directional Light X");
      lightsFolder
        .add(this.directionalLight.position, "y", -10, 10, 0.1)
        .name("Directional Light Y");
      lightsFolder
        .add(this.directionalLight.position, "z", -10, 10, 0.1)
        .name("Directional Light Z");
      lightsFolder
        .addColor({ color: 0xffffff }, "color")
        .name("Directional Light Color")
        .onChange((value) => {
          this.directionalLight.color.set(value);
        });
    }
  }

  // Retorna array com as luzes (caso queira iterar)
  getLights() {
    return [this.ambientLight, this.directionalLight, this.pointLight];
  }
}
