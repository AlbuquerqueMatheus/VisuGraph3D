// src/classes/Camera.js

import * as THREE from "three";
import { debugObject } from "./Constants.js";

export class Camera {
  constructor(sizes) {
    this.sizes = sizes;

    // FOV inicial mais "neutro"
    const initialFov = 60;

    this.camera = new THREE.PerspectiveCamera(
      initialFov,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );

    // alvo (ponto que a câmera "olha")
    this.target = new THREE.Vector3(0, 0, 0);

    const defaultDistance = debugObject.cameraPositionZ ?? 5;
    this.camera.position.set(0, 0, defaultDistance);
    this.camera.lookAt(this.target);

    // estado padrão para o botão de reset
    this.defaultState = {
      position: this.camera.position.clone(),
      fov: this.camera.fov,
      target: this.target.clone(),
    };
  }

  // Mantém compatibilidade
  getInstance() {
    return this.camera;
  }

  // Atualiza tamanho/aspeto no resize
  onResize(newSizes) {
    this.sizes = newSizes;
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
  }

  // --------- Helpers de câmera "inteligente" ---------

  /**
   * Define o alvo (target) a partir de um objeto 3D.
   */
  setTargetFromObject(object) {
    if (!object) {
      this.target.set(0, 0, 0);
      return;
    }

    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      this.target.set(0, 0, 0);
      return;
    }

    box.getCenter(this.target);
  }

  /**
   * Enquadra o objeto no campo de visão atual da câmera.
   * Aceita opcionalmente OrbitControls para sincronizar o target.
   */
  fitToObject(object, orbitControls, padding = 1.3) {
    if (!object) return;

    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.target.copy(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);

    let distance = (maxDim * padding) / Math.tan(fov / 2);
    if (!isFinite(distance) || distance <= 0) {
      distance = 5;
    }

    let dir = this.camera.position.clone().sub(this.target);
    if (dir.lengthSq() === 0) {
      dir.set(0, 0, 1);
    } else {
      dir.normalize();
    }

    this.camera.position.copy(this.target).add(dir.multiplyScalar(distance));
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();

    if (orbitControls && orbitControls.target) {
      orbitControls.target.copy(this.target);
      orbitControls.update?.();
    }
  }

  /**
   * Seta uma vista predefinida (front, back, left, right, top, iso...).
   */
  setPresetView(preset, distance, orbitControls) {
    const currentDist =
      distance ||
      this.camera.position.distanceTo(this.target) ||
      (debugObject.cameraPositionZ ?? 5);

    const t = this.target;

    switch (preset) {
      case "front":
        this.camera.position.set(t.x, t.y, t.z + currentDist);
        break;
      case "back":
        this.camera.position.set(t.x, t.y, t.z - currentDist);
        break;
      case "left":
        this.camera.position.set(t.x - currentDist, t.y, t.z);
        break;
      case "right":
        this.camera.position.set(t.x + currentDist, t.y, t.z);
        break;
      case "top":
        this.camera.position.set(t.x, t.y + currentDist, t.z);
        break;
      case "bottom":
        this.camera.position.set(t.x, t.y - currentDist, t.z);
        break;
      case "iso":
      default: {
        const iso = currentDist / Math.sqrt(3);
        this.camera.position.set(t.x + iso, t.y + iso, t.z + iso);
        break;
      }
    }

    this.camera.lookAt(this.target);

    if (orbitControls && orbitControls.target) {
      orbitControls.target.copy(this.target);
      orbitControls.update?.();
    }
  }

  /**
   * Move a câmera para mais perto/longe mantendo a direção atual.
   */
  setDistance(distance, orbitControls) {
    if (typeof distance !== "number") return;

    const t = this.target;
    let dir = this.camera.position.clone().sub(t);

    if (dir.lengthSq() === 0) {
      dir.set(0, 0, 1);
    } else {
      dir.normalize();
    }

    this.camera.position.copy(t).add(dir.multiplyScalar(distance));
    this.camera.lookAt(t);

    if (orbitControls && orbitControls.target) {
      orbitControls.update?.();
    }
  }

  /**
   * Ajusta o campo de visão.
   */
  setFov(fovDeg) {
    this.camera.fov = fovDeg;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Volta para o estado inicial da câmera.
   */
  reset(orbitControls) {
    this.camera.position.copy(this.defaultState.position);
    this.camera.fov = this.defaultState.fov;
    this.camera.updateProjectionMatrix();
    this.target.copy(this.defaultState.target);
    this.camera.lookAt(this.target);

    if (orbitControls && orbitControls.target) {
      orbitControls.target.copy(this.target);
      orbitControls.update?.();
    }
  }
}
