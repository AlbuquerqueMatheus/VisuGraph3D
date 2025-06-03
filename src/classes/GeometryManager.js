// src/classes/GeometryManager.js

import * as THREE from "three";
import { debugObject } from "./Constants.js";

export class GeometryManager {
  constructor(scene) {
    this.scene = scene;

    // Geometry e material padrão para o objeto principal
    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.5,
      transparent: true,
      opacity: 1,
    });
    this.geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.originalVertices = this.geometry.attributes.position.array.slice();
    this.currentObject = this.mesh;

    // Adiciona o cubo
    this.scene.add(this.mesh);

    // Cria e adiciona o plano reutilizável
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x808080 })
    );
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.position.y = -1;
    this.plane.receiveShadow = true;
    this.scene.add(this.plane);
  }

  // Retorna o objeto que será controlado pelos TransformControls
  getDefaultObject() {
    return this.currentObject;
  }

  // Função para atualizar a geometria com base no debugObject.selectedGeometry
  updateGeometry() {
    this.mesh.geometry.dispose();
    switch (debugObject.selectedGeometry) {
      case "Box":
        this.geometry = new THREE.BoxGeometry(
          1,
          1,
          1,
          debugObject.subdivisions,
          debugObject.subdivisions,
          debugObject.subdivisions
        );
        break;
      case "UV Sphere":
        this.geometry = new THREE.SphereGeometry(
          1,
          debugObject.subdivisions * 10,
          debugObject.subdivisions * 10
        );
        break;
      case "Cylinder":
        this.geometry = new THREE.CylinderGeometry(
          0.5,
          0.5,
          1,
          debugObject.subdivisions * 10
        );
        break;
      case "Cone":
        this.geometry = new THREE.ConeGeometry(0.5, 1, debugObject.subdivisions * 10);
        break;
      case "Ico Sphere":
        this.geometry = new THREE.IcosahedronGeometry(1, debugObject.subdivisions);
        break;
      case "Torus":
        this.geometry = new THREE.TorusGeometry(
          0.7,
          0.2,
          debugObject.subdivisions * 10,
          debugObject.subdivisions * 10
        );
        break;
    }
    this.mesh.geometry = this.geometry;
    this.originalVertices = this.geometry.attributes.position.array.slice();
  }

  // Função que aplica o “extrude”
  extrudeVertices() {
    const vertices = this.geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const originalX = this.originalVertices[i];
      const originalY = this.originalVertices[i + 1];
      const originalZ = this.originalVertices[i + 2];

      vertices[i] = originalX + Math.sign(originalX) * debugObject.extrudeAmount;
      vertices[i + 1] = originalY + Math.sign(originalY) * debugObject.extrudeAmount;
      vertices[i + 2] = originalZ + Math.sign(originalZ) * debugObject.extrudeAmount;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  // Aplica array modifier (duplicação em grid simples)
  applyArrayModifier() {
    // Remove meshes extras
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const child = this.scene.children[i];
      if (child.isMesh && child !== this.mesh && child !== this.plane) {
        child.geometry.dispose();
        this.scene.remove(child);
      }
    }

    // Cria clones
    for (let i = 1; i < debugObject.arrayModifier?.count; i++) {
      const newMesh = this.mesh.clone();
      newMesh.position.set(
        debugObject.arrayModifier.offsetX * i,
        debugObject.arrayModifier.offsetY * i,
        debugObject.arrayModifier.offsetZ * i
      );
      this.scene.add(newMesh);
    }
  }

  // Função para atualizar o material (caso texturas mudem)
  updateMaterial(newMaterial) {
    this.material = newMaterial;
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        child.material = this.material;
      }
    });
    this.material.needsUpdate = true;
  }
}
