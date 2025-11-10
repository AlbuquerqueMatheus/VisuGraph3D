import * as THREE from "three";

export class TextureManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.aniso = renderer?.capabilities.getMaxAnisotropy?.() || 8;

    // Ajuste estes paths conforme sua estrutura em /texturas
    this.sets = {
      none: null,
      metal: {
        color: "/texturas/metal/metal_Color.png",
        roughness: "/texturas/metal/metal_Roughness.png",
        normal: "/texturas/metal/metal_NormalGL.png",
        ao: "/texturas/metal/metal_AO.png",
        displacement: "/texturas/metal/metal_Displacement.png",
      },
      wood: {
        color: "/texturas/madeira/madeira_Color.png",
        roughness: "/texturas/madeira/madeira_Roughness.png",
        normal: "/texturas/madeira/madeira_NormalGL.png",
        ao: "/texturas/madeira/madeira_AO.png",
        displacement: "/texturas/madeira/madeira_Displacement.png",
      },
      pedra: {
        color: "/texturas/pedra/pedra_Color.png",
        roughness: "/texturas/pedra/pedra_Roughness.png",
        normal: "/texturas/pedra/pedra_NormalGL.png",
        ao: "/texturas/pedra/pedra_AO.png",
        displacement: "/texturas/pedra/pedra_Displacement.png",
      },
      moss: {
        color: "/texturas/moss/moss_Color.png",
        roughness: "/texturas/moss/moss_Roughness.png",
        normal: "/texturas/moss/moss_NormalGL.png",
        ao: "/texturas/moss/moss_AO.png",
        displacement: "/texturas/moss/moss_Displacement.png",
      },
    };
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
  loadColor(url) { return this._load(url, true); }
  loadLinear(url) { return this._load(url, false); }

  /* -------------------- helpers: UV2 para aoMap ---------------------- */
  _ensureUV2(mesh) {
    if (!mesh?.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (!geo.attributes.uv2 && geo.attributes.uv) {
      geo.setAttribute("uv2", geo.attributes.uv);
      geo.attributes.uv2.needsUpdate = true;
    }
  }

  /* --------------------------- API principal ------------------------- */
  applyTextureToObject(object, key) {
    if (!object) return;

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
          c.material.color?.set(0xff0000); // deixa a cor atual (UI que manda)
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

      // IMPORTANTE: displacement desabilitado por padrão para evitar “frestas” em BoxGeometry
      mat.displacementMap = set.displacement ? this.loadLinear(set.displacement) : null;
      mat.displacementScale = 0; // <- evita abrir as quinas do cubo
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

      // Textura não deve ser “tingida”: branco neutro
      mat.color.set(0xffffff);

      mat.needsUpdate = true;
      mesh.material = mat;
    });
  }

  // Compat com versões antigas
  applyTextures(object, opts) {
    if (typeof opts === "string") return this.applyTextureToObject(object, opts);
    if (opts?.kind) return this.applyTextureToObject(object, opts.kind);
  }

  preloadAll() {
    Object.values(this.sets).forEach((set) => {
      if (!set) return;
      ["color", "normal", "roughness", "metalness", "ao", "displacement"].forEach((k) => {
        if (set[k]) this._load(set[k], k === "color");
      });
    });
  }
}
