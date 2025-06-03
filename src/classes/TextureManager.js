// src/classes/TextureManager.js

import * as THREE from "three";
import { textures, debugObject } from "./Constants.js";

export class TextureManager {
  constructor(material) {
    this.material = material;
    this.loadingManager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);

    this.loadingManager.onStart = () => console.log("Texture loading started");
    this.loadingManager.onLoad = () => console.log("Texture loading finished");
    this.loadingManager.onProgress = () => console.log("Texture loading progressing");
    this.loadingManager.onError = () => console.log("Texture loading error");
  }

  // Carrega uma textura genérica
  loadTextureAsync(url) {
    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          // Garante sRGB encoding
          texture.encoding = THREE.sRGBEncoding;
          resolve(texture);
        },
        undefined,
        () => {
          console.error(`Falha ao carregar textura: ${url}`);
          resolve(null);
        }
      );
    });
  }

  // Carrega todas as texturas de um tipo (“metal”, “wood”, “pedra”, “moss”)
  async loadTexturesForMaterial(type) {
    if (type === "metal") {
      const [color, displacement, metalness, normal, roughness] = await Promise.all([
        this.loadTextureAsync("./texturas/metal/Metal_Color.png"),
        this.loadTextureAsync("./texturas/metal/Metal_Displacement.png"),
        this.loadTextureAsync("./texturas/metal/Metal_Metalness.png"),
        this.loadTextureAsync("./texturas/metal/Metal_NormalGL.png"),
        this.loadTextureAsync("./texturas/metal/Metal_Roughness.png"),
      ]);
      textures.metal.color = color;
      textures.metal.displacement = displacement;
      textures.metal.metalness = metalness;
      textures.metal.normal = normal;
      textures.metal.roughness = roughness;
    } else if (type === "wood") {
      const [color, displacement, normal, roughness] = await Promise.all([
        this.loadTextureAsync("./texturas/madeira/Wood_Color.png"),
        this.loadTextureAsync("./texturas/madeira/Wood_Displacement.png"),
        this.loadTextureAsync("./texturas/madeira/Wood_NormalGL.png"),
        this.loadTextureAsync("./texturas/madeira/Wood_Roughness.png"),
      ]);
      textures.wood.color = color;
      textures.wood.displacement = displacement;
      textures.wood.normal = normal;
      textures.wood.roughness = roughness;
    } else if (type === "pedra") {
      const [color, displacement, normal, roughness, ambientOcclusion] = await Promise.all([
        this.loadTextureAsync("./texturas/pedra/pedra_Color.png"),
        this.loadTextureAsync("./texturas/pedra/pedra_Displacement.png"),
        this.loadTextureAsync("./texturas/pedra/pedra_NormalGL.png"),
        this.loadTextureAsync("./texturas/pedra/pedra_Roughness.png"),
        this.loadTextureAsync("./texturas/pedra/pedra_AO.png"),
      ]);
      textures.pedra.color = color;
      textures.pedra.displacement = displacement;
      textures.pedra.normal = normal;
      textures.pedra.roughness = roughness;
      textures.pedra.ambientOcclusion = ambientOcclusion;
    } else if (type === "moss") {
      const [color, displacement, normal, ambientOcclusion, roughness] = await Promise.all([
        this.loadTextureAsync("./texturas/moss/moss_Color.png"),
        this.loadTextureAsync("./texturas/moss/moss_Displacement.png"),
        this.loadTextureAsync("./texturas/moss/moss_NormalGL.png"),
        this.loadTextureAsync("./texturas/moss/moss_Roughness.png"),
        this.loadTextureAsync("./texturas/moss/moss_AO.png"),
      ]);
      textures.moss.color = color;
      textures.moss.displacement = displacement;
      textures.moss.normal = normal;
      textures.moss.ambientOcclusion = ambientOcclusion;
      textures.moss.roughness = roughness;
    }
  }

  // Aplica as texturas carregadas no material atual
  applyTextures(currentObject) {
    const selected = textures[debugObject.selectedTexture];
    if (selected && debugObject.selectedTexture !== "none") {
      this.material.map = selected.color;
      this.material.displacementMap = selected.displacement;
      this.material.metalnessMap = selected.metalness;
      this.material.normalMap = selected.normal;
      this.material.roughnessMap = selected.roughness;
      this.material.aoMap = selected.ambientOcclusion;

      this.material.metalness = 0.5;
      this.material.roughness = 0.15;
      this.material.normalScale.set(2, 2);
      this.material.displacementScale = 0;
    } else {
      // Remove texturas
      this.material.map = null;
      this.material.displacementMap = null;
      this.material.metalnessMap = null;
      this.material.normalMap = null;
      this.material.roughnessMap = null;
      this.material.aoMap = null;

      // Valores padrões
      this.material.metalness = 0.5;
      this.material.roughness = 0.5;
      this.material.displacementScale = 0;
    }

    // Aplica ao objeto inteiro
    currentObject.traverse((child) => {
      if (child.isMesh) {
        child.material = this.material;
      }
    });

    this.material.needsUpdate = true;
  }

  // Pré-carregamento inicial (no load da página)
  preloadAll() {
    ["metal", "wood", "pedra", "moss"].forEach(async (type) => {
      if (!textures[type].color) {
        await this.loadTexturesForMaterial(type);
        console.log(`${type} preloaded`);
      }
    });
  }
}
