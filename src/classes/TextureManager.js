import * as THREE from "three";

export class TextureManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.aniso = renderer?.capabilities.getMaxAnisotropy?.() || 8;

    // textura atualmente escolhida pela UI
    this.currentKey = "none";

    // Só “none” + espaço para um set custom que será preenchido em runtime
    this.sets = {
      none: null,
      custom: {
        // color, normal, roughness, metalness, ao, displacement
      },
    };

    // para controlar os objectURLs criados a partir dos Files
    this._customObjectURLs = {};
  }

  /* --------------------------- loaders util --------------------------- */
  _load(url, srgb = false) {
    if (!url) return null;
    const tex = this.loader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.aniso;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  loadColor(url) {
    return this._load(url, true);
  }
  loadLinear(url) {
    return this._load(url, false);
  }

  /* -------------------- helpers: UV2 para aoMap ---------------------- */
  _ensureUV2(mesh) {
    if (!mesh?.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (!geo.attributes.uv2 && geo.attributes.uv) {
      geo.setAttribute("uv2", geo.attributes.uv);
      geo.attributes.uv2.needsUpdate = true;
    }
  }

  /* ---------------------- API: upload de PBR ------------------------- */
  /**
   * Recebe um File (input type="file") e registra dentro do set "custom".
   * mapName: "color" | "normal" | "roughness" | "metalness" | "ao" | "displacement"
   */
  setCustomMapFromFile(mapName, file) {
    if (!file || !mapName) return;
    if (!this.sets.custom) this.sets.custom = {};
    if (!this._customObjectURLs) this._customObjectURLs = {};

    // libera o objectURL anterior, se existir
    if (this._customObjectURLs[mapName]) {
      try {
        URL.revokeObjectURL(this._customObjectURLs[mapName]);
      } catch {}
    }

    const url = URL.createObjectURL(file);
    this._customObjectURLs[mapName] = url;
    this.sets.custom[mapName] = url;
  }

  clearCustomMaps() {
    if (this._customObjectURLs) {
      Object.values(this._customObjectURLs).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    }
    this._customObjectURLs = {};
    this.sets.custom = {};
  }

  /* --------------------------- API principal ------------------------- */
  applyTextureToObject(object, key) {
    if (!object) return;

    // se não vier key, reaplica a textura atualmente selecionada
    if (!key) {
      key = this.currentKey || "none";
    } else {
      this.currentKey = key;
    }

    // Remover texturas
    if (!key || key === "none") {
      object.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material.map = null;
          c.material.normalMap = null;
          c.material.roughnessMap = null;
          c.material.metalnessMap = null;
          c.material.aoMap = null;
          c.material.displacementMap = null;
          c.material.alphaMap = null;
          c.material.transparent = false;
          c.material.alphaTest = 0;
          c.material.color?.set(0xff0000); // volta pro padrão (UI depois sobrescreve)
          c.material.needsUpdate = true;
        }
      });
      return;
    }

    const set = this.sets[key];
    if (!set) return;

    object.traverse((mesh) => {
      if (!mesh.isMesh) return;

      this._ensureUV2(mesh);

      // Garante material PBR
      let mat = mesh.material;
      if (Array.isArray(mat) || !(mat instanceof THREE.MeshStandardMaterial)) {
        mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      }

      // Encodings corretos
      mat.map = set.color ? this.loadColor(set.color) : null;
      mat.normalMap = set.normal ? this.loadLinear(set.normal) : null;
      mat.roughnessMap = set.roughness ? this.loadLinear(set.roughness) : null;
      mat.metalnessMap = set.metalness ? this.loadLinear(set.metalness) : null;
      mat.aoMap = set.ao ? this.loadLinear(set.ao) : null;

      // displacement desabilitado por padrão para não abrir quinas
      mat.displacementMap = set.displacement
        ? this.loadLinear(set.displacement)
        : null;
      mat.displacementScale = 0;
      mat.displacementBias = 0;

      // Sem alpha/cutout por padrão
      mat.alphaMap = null;
      mat.transparent = false;
      mat.alphaTest = 0;

      // Visual estável
      mat.flatShading = false;
      mat.side = THREE.FrontSide;
      mat.metalness = 0.0;
      mat.roughness = 1.0;

      // Branco neutro para não “tingir” a textura
      mat.color.set(0xffffff);

      mat.needsUpdate = true;
      mesh.material = mat;
    });
  }

  // Compat com versões antigas / reaplicar textura atual
  applyTextures(object, opts) {
    if (!opts) return this.applyTextureToObject(object, this.currentKey);
    if (typeof opts === "string") return this.applyTextureToObject(object, opts);
    if (opts?.kind) return this.applyTextureToObject(object, opts.kind);
  }

  preloadAll() {
    // hoje não há sets prontos, mas deixo compatível se você quiser adicionar no futuro
    Object.entries(this.sets).forEach(([key, set]) => {
      if (!set || key === "custom") return; // "custom" é em runtime
      ["color", "normal", "roughness", "metalness", "ao", "displacement"].forEach(
        (k) => {
          if (set[k]) this._load(set[k], k === "color");
        }
      );
    });
  }
}
