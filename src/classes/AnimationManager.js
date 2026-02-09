// src/classes/AnimationManager.js
export class AnimationManager {
  constructor() {
    this.object = null;

    this.rotate = {
      enabled: false,
      axis: "y",   // "x" | "y" | "z"
      speed: 1.0,  // radianos por segundo
    };

    this.float = {
      enabled: false,
      amplitude: 0.25,
      speed: 2.0,
      phase: 0,
      baseY: null,
    };
  }

  setTargetObject(obj) {
    this.object = obj || null;

    if (this.object) {
      this.float.baseY = this.object.position.y;
      this.float.phase = 0;
    } else {
      this.float.baseY = null;
      this.float.phase = 0;
    }
  }

  setRotateOptions({ enabled, axis, speed } = {}) {
    if (typeof enabled === "boolean") this.rotate.enabled = enabled;
    if (axis) this.rotate.axis = axis;
    if (typeof speed === "number") this.rotate.speed = speed;
  }

  setFloatOptions({ enabled, amplitude, speed } = {}) {
    if (typeof enabled === "boolean") this.float.enabled = enabled;
    if (typeof amplitude === "number") this.float.amplitude = amplitude;
    if (typeof speed === "number") this.float.speed = speed;
  }

  resetAnimationState() {
    if (this.object && this.float.baseY != null) {
      this.object.position.y = this.float.baseY;
    }
    this.float.phase = 0;
  }

  update(delta) {
    if (!this.object || !delta) return;

    // Rotação contínua
    if (this.rotate.enabled) {
      const axis = this.rotate.axis || "y";
      const speed = this.rotate.speed || 0;
      const d = speed * delta;
      if (axis === "x") this.object.rotation.x += d;
      else if (axis === "y") this.object.rotation.y += d;
      else if (axis === "z") this.object.rotation.z += d;
    }

    // Floating (sobe/desce)
    if (this.float.enabled) {
      const cfg = this.float;
      if (cfg.baseY == null) cfg.baseY = this.object.position.y;

      cfg.phase += cfg.speed * delta;
      const offset = Math.sin(cfg.phase) * cfg.amplitude;
      this.object.position.y = cfg.baseY + offset;
    }
  }
}
