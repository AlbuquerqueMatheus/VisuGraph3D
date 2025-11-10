// src/classes/ModelLoader.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export class ModelLoader {
  constructor(fileInputEl, triggerButtonEl, scene, onLoaded) {
    this.fileInputEl = fileInputEl;
    this.triggerButtonEl = triggerButtonEl;
    this.scene = scene;
    this.onLoaded = onLoaded;

    if (this.fileInputEl && this.triggerButtonEl) {
      this._bind();
    }
  }

  _bind() {
    this.triggerButtonEl.addEventListener("click", () => this.fileInputEl.click());
    this.fileInputEl.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const object = await this._loadFile(file);
        this._finalize(object);
        this.onLoaded?.(object);
      } catch (err) {
        console.error("Erro ao carregar modelo:", err);
      } finally {
        this.fileInputEl.value = "";
      }
    });
  }

  async _loadFile(file) {
    const url = URL.createObjectURL(file);
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
      const gltfLoader = new GLTFLoader();
      const draco = new DRACOLoader().setDecoderPath("/draco/"); // public/draco/
      gltfLoader.setDRACOLoader(draco);
      const gltf = await gltfLoader.loadAsync(url);
      return gltf.scene || gltf.scenes?.[0];
    }
    if (lower.endsWith(".obj")) {
      return await new OBJLoader().loadAsync(url);
    }
    throw new Error("Formato não suportado: " + file.name);
  }

  _finalize(object) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Garanta PBR
        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.8,
          });
        }
        if (child.material.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
      }
    });
    this._centerAndScale(object, 1.2);
  }

  _centerAndScale(object, targetSize = 1.2) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    object.scale.setScalar(scale);
  }
}
