// src/classes/GeometryManager.js
import * as THREE from "three";
import { debugObject } from "./Constants.js";

/**
 * Owns the demo mesh and a ground plane. Provides helpers to change
 * geometry, material style and an instanced "array modifier".
 */
export class GeometryManager {
  constructor(scene) {
    this.scene = scene;

    // default material – PBR friendly
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(debugObject.color),
      metalness: 0.2,
      roughness: 0.7
    });

    // default geometry & mesh
    this._buildMesh();
    this.scene.add(this.mesh);

    // ground
    const groundGeo = new THREE.PlaneGeometry(20, 20, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 1,
      metalness: 0
    });
    this.plane = new THREE.Mesh(groundGeo, groundMat);
    this.plane.rotateX(-Math.PI / 2);
    this.plane.position.y = -0.5;
    this.plane.receiveShadow = true;
    scene.add(this.plane);

    // instancing state
    this._instanced = null;
    this._clones = [];
  }

  getDefaultObject() { return this.mesh; }

  _buildMesh() {
    const geo = this._createGeometry(debugObject.selectedGeometry, debugObject.subdivisions);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = debugObject.shadows;
    this.mesh.receiveShadow = false;
  }

  _createGeometry(kind, subdiv = 2) {
    switch ((kind || "Box").toLowerCase()) {
      case "box":
        return new THREE.BoxGeometry(1, 1, 1, subdiv, subdiv, subdiv);
      case "uv sphere":
        return new THREE.SphereGeometry(0.6, subdiv * 8, subdiv * 6);
      case "cylinder":
        return new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(8, subdiv * 6), subdiv * 2);
      case "cone":
        return new THREE.ConeGeometry(0.5, 1, Math.max(8, subdiv * 6), subdiv * 2);
      case "ico sphere":
        return new THREE.IcosahedronGeometry(0.7, Math.max(0, Math.min(3, Math.round(subdiv / 2))));
      case "torus":
        return new THREE.TorusGeometry(0.5, 0.18, Math.max(6, subdiv * 4), Math.max(10, subdiv * 8));
      default:
        return new THREE.BoxGeometry(1, 1, 1, subdiv, subdiv, subdiv);
    }
  }

  setGeometry(kind) {
    // remove instancing/clones quando muda a geometria
    this._disposeInstancing();

    const geo = this._createGeometry(kind, debugObject.subdivisions);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.visible = true;
    debugObject.selectedGeometry = kind;
    return this.mesh;
  }

  setSubdivisions(n) {
    debugObject.subdivisions = n;
    return this.setGeometry(debugObject.selectedGeometry);
  }

  setRenderStyle(obj, value) {
    const mesh = obj || this.mesh;
    mesh.traverse?.((child) => {
      if (!child.isMesh) return;
      child.material.wireframe = value === "wireframe";
      child.material.flatShading = value === "flat";
      child.material.needsUpdate = true;
    });
  }

  setColor(obj, hex) {
    (obj || this.mesh).traverse?.((c) => {
      if (c.isMesh && c.material && "color" in c.material) {
        c.material.color = new THREE.Color(hex);
      }
    });
  }

  setOpacity(obj, v) {
    (obj || this.mesh).traverse?.((c) => {
      if (c.isMesh && c.material) {
        c.material.transparent = v < 1;
        c.material.opacity = v;
        c.material.needsUpdate = true;
      }
    });
  }

  setExtrudeAmount() {
    // compat com UI antiga; noop aqui
  }

  /**
   * Instanced "array modifier" (performático). count=1 desliga instancing.
   */
  setArrayModifier({ count = 1, offX = 1, offY = 0, offZ = 0 } = {}) {
    debugObject.arrayModifier = { count, offsetX: offX, offsetY: offY, offsetZ: offZ };

    // limpar estado anterior
    this._disposeInstancing();

    if (count <= 1) {
      this.mesh.visible = true;
      return;
    }

    const inst = new THREE.InstancedMesh(this.mesh.geometry, this.mesh.material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(i * offX, i * offY, i * offZ);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = this.mesh.castShadow;
    inst.receiveShadow = this.mesh.receiveShadow;

    this._instanced = inst;
    this.mesh.visible = false;
    this.scene.add(inst);
  }

  // compat com UIController antigo
  applyArrayModifier() {
    const a = debugObject.arrayModifier || {};
    return this.setArrayModifier({
      count: a.count || 1,
      offX: a.offsetX || 1,
      offY: a.offsetY || 0,
      offZ: a.offsetZ || 0
    });
  }

  updateMaterial(mat) {
    this.material = mat;
    this.mesh.material = mat;
    if (this._instanced) this._instanced.material = mat;
  }

  _disposeInstancing() {
    if (this._instanced) {
      this.scene.remove(this._instanced);
      this._instanced.dispose?.();
      this._instanced = null;
    }
    for (const c of this._clones) this.scene.remove(c);
    this._clones = [];
    this.mesh.visible = true;
  }
}
