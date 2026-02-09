// src/classes/ChangeDetector.js

export class ChangeDetector {
  constructor() {
    this.lastUpdate = Date.now();
    this.debounceTimer = null;
    this.debounceDelay = 500; // Aumentado para 500ms
  }

  /**
   * Inicia monitoramento simples
   */
  startWatching(scene, camera, lights, geometryManager, animationManager, onChangeCallback) {
    let lastState = this.captureSimpleState(geometryManager, camera, lights, animationManager);

    const checkChanges = () => {
      const newState = this.captureSimpleState(geometryManager, camera, lights, animationManager);
      
      if (JSON.stringify(lastState) !== JSON.stringify(newState)) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          lastState = newState;
          onChangeCallback({ hasChanges: true, changes: ['update'] }, newState);
        }, this.debounceDelay);
      }

      requestAnimationFrame(checkChanges);
    };

    checkChanges();
  }

  /**
   * Captura apenas o estado essencial
   */
  captureSimpleState(geometryManager, camera, lights, animationManager) {
    const obj = geometryManager?.object || geometryManager?.getDefaultObject?.();
    
    return {
      timestamp: Date.now(),
      object: obj ? {
        geometry: obj.geometry?.type,
        position: { ...obj.position },
        rotation: { ...obj.rotation },
        scale: { ...obj.scale },
        material: {
          color: obj.material?.color?.getHex?.(),
          roughness: obj.material?.roughness,
          metalness: obj.material?.metalness,
          wireframe: obj.material?.wireframe,
          opacity: obj.material?.opacity,
        }
      } : null,
      camera: camera ? {
        position: { ...camera.position }
      } : null,
      lights: lights ? {
        ambient: lights.ambientLight?.intensity,
        directional: lights.directionalLight?.intensity,
      } : null,
      animations: {
        rotate: animationManager?.rotateOptions,
        float: animationManager?.floatOptions,
      }
    };
  }

  captureSceneState(scene, camera, lights, geometryManager, animationManager) {
    return this.captureSimpleState(geometryManager, camera, lights, animationManager);
  }

  stopWatching() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
