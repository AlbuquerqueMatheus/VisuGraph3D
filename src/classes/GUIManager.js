// src/classes/GUIManager.js

import GUI from "lil-gui";
import gsap from "gsap";
import { debugObject } from "./Constants.js";

export class GUIManager {
  constructor({ geometryManager, textureManager, controls, camera }) {
    this.geometryManager = geometryManager;
    this.textureManager = textureManager;
    this.controls = controls;
    this.camera = camera;

    this.gui = new GUI({ width: 300, title: "Debug", closeFolders: true });
    this.gui.hide();

    // Tecla "d" esconde/exibe o painel
    window.addEventListener("keydown", (event) => {
      if (event.key === "d") {
        this.gui._hidden ? this.gui.show() : this.gui.hide();
      }
    });

    this._setupCubeAppearanceFolder();
    this._setupShadowsFolder();
    this._setupCameraFolder();
    this._setupAnimationsFolder();
    this._setupTransformModesFolder();
    this._setupArrayModifierFolder();

    // Inicia o pré-carregamento de texturas
    this.textureManager.preloadAll();
  }

  _setupCubeAppearanceFolder() {
    const folder = this.gui.addFolder("Cube Appearance");

    folder
      .add(debugObject, "selectedGeometry", [
        "Box",
        "UV Sphere",
        "Cylinder",
        "Cone",
        "Ico Sphere",
        "Torus",
      ])
      .name("Geometry")
      .onChange(() => {
        this.geometryManager.updateGeometry();
      });

    folder
      .add(debugObject, "selectedTexture", [
        "none",
        "metal",
        "wood",
        "pedra",
        "moss",
      ])
      .name("Texture")
      .onChange(async (value) => {
        if (value !== "none" && !this.textureManager.texturesLoaded?.[value]) {
          await this.textureManager.loadTexturesForMaterial(value);
        }
        this.textureManager.applyTextures(this.geometryManager.getDefaultObject());
      });

    folder
      .add(debugObject, "renderStyle", ["normal", "wireframe", "flat"])
      .name("Render Style")
      .onChange(() => {
        const mat = this.geometryManager.material;
        mat.wireframe = debugObject.renderStyle === "wireframe";
        mat.flatShading = debugObject.renderStyle === "flat";
        this.geometryManager.updateMaterial(mat);
      });

    folder
      .addColor(debugObject, "color")
      .name("Color")
      .onChange(() => {
        this.geometryManager.material.color.set(debugObject.color);
        this.geometryManager.material.needsUpdate = true;
      });

    folder
      .add(debugObject, "opacity")
      .min(0)
      .max(1)
      .step(0.01)
      .name("Opacity")
      .onChange(() => {
        const mat = this.geometryManager.material;
        mat.opacity = debugObject.opacity;
        mat.transparent = debugObject.opacity < 1;
        mat.needsUpdate = true;
        this.geometryManager.getDefaultObject().castShadow = debugObject.opacity > 0;
      });
  }

  _setupShadowsFolder() {
    const folder = this.gui.addFolder("Shadows");
    folder
      .add(debugObject, "shadows")
      .name("Enable Shadows")
      .onChange(() => {
        const mesh = this.geometryManager.getDefaultObject();
        mesh.castShadow = debugObject.shadows;
        this.geometryManager.plane.receiveShadow = debugObject.shadows;
      });
  }

  _setupCameraFolder() {
    const folder = this.gui.addFolder("Camera");
    folder
      .add(debugObject, "cameraPositionZ", 1, 10, 0.1)
      .name("Camera Position Z")
      .onChange((value) => {
        this.camera.position.z = value;
      });
  }

  _setupAnimationsFolder() {
    const folder = this.gui.addFolder("Animations");

    // 1) Sobrescreve as funções em debugObject antes de registrá-las
    debugObject.spin = () => {
      const mesh = this.geometryManager.getDefaultObject();
      gsap.to(mesh.rotation, {
        duration: 1,
        x: mesh.rotation.x + Math.PI * 2,
        y: mesh.rotation.y + Math.PI * 2,
      });
    };

    debugObject.resetTransform = () => {
      const mesh = this.geometryManager.getDefaultObject();
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
    };

    // 2) Registra-as no lil-gui
    folder.add(debugObject, "spin").name("Spin");
    folder.add(debugObject, "resetTransform").name("Reset Transform");

    // 3) Subdivisions e Extrude
    folder
      .add(debugObject, "subdivisions")
      .min(1)
      .max(5)
      .step(1)
      .name("Subdivisions")
      .onChange(() => {
        this.geometryManager.updateGeometry();
      });

    folder
      .add(debugObject, "extrudeAmount")
      .min(0)
      .max(1)
      .step(0.01)
      .name("Extrude")
      .onChange(() => {
        this.geometryManager.extrudeVertices();
      });
  }

  _setupTransformModesFolder() {
    const folder = this.gui.addFolder("Transform Modes");
    folder
      .add(debugObject, "mode", ["none", "translate", "rotate", "scale"])
      .name("Mode")
      .onChange((value) => {
        this.controls.updateTransformMode(value);
      });
  }

  _setupArrayModifierFolder() {
    const folder = this.gui.addFolder("Array Modifier");

    // Agora que debugObject.arrayModifier existe, não dará undefined
    folder
      .add(debugObject.arrayModifier, "count")
      .min(1)
      .max(10)
      .step(1)
      .name("Count")
      .onChange(() => {
        this.geometryManager.applyArrayModifier();
      });

    folder
      .add(debugObject.arrayModifier, "offsetX")
      .min(-2)
      .max(2)
      .step(0.1)
      .name("Offset X")
      .onChange(() => {
        this.geometryManager.applyArrayModifier();
      });

    folder
      .add(debugObject.arrayModifier, "offsetY")
      .min(-2)
      .max(2)
      .step(0.1)
      .name("Offset Y")
      .onChange(() => {
        this.geometryManager.applyArrayModifier();
      });

    folder
      .add(debugObject.arrayModifier, "offsetZ")
      .min(-2)
      .max(2)
      .step(0.1)
      .name("Offset Z")
      .onChange(() => {
        this.geometryManager.applyArrayModifier();
      });
  }

  getGUIInstance() {
    return this.gui;
  }
}
