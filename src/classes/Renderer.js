// src/classes/Renderer.js
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export class Renderer {
  constructor(canvas, sizes) {
    this.canvas = canvas;
    this.sizes = sizes || { width: window.innerWidth, height: window.innerHeight };

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });

    // Color management / tonemapping for PBR
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = true;

    // Shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Size / DPR
    renderer.setSize(this.sizes.width, this.sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Transparent clear so the CSS background can be seen
    renderer.setClearColor(0x000000, 0);

    this.renderer = renderer;

    // PMREM for IBL (neutral, no HDR files required)
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
  }

  /**
   * Creates a neutral environment map using RoomEnvironment and assigns it
   * to the given scene (good default for PBR when you don't have an HDR).
   */
  initEnvironment(scene, { intensity = 1 } = {}) {
    if (!scene) return;
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
  }

  onResize(newSizes) {
    this.sizes = newSizes || this.sizes;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
