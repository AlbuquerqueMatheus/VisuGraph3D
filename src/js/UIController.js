// src/UIController.js

import { debugObject } from "./classes/Constants.js";

export function setupUI(
  geometryManager,
  textureManager,
  controlsManager,
  camera,
  lightsManager
) {
  // 1) alterna abas
  document.querySelectorAll("#sidebar nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#sidebar nav button").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");
      document
        .querySelectorAll("#sidebar .section")
        .forEach((sec) => sec.classList.remove("active"));
      document
        .getElementById("section-" + btn.dataset.section)
        .classList.add("active");
    });
  });
  // aba inicial
  document
    .querySelector("#sidebar nav button[data-section='cube']")
    .click();

  // ============== Cube Appearance ==============
  document
    .getElementById("geometry-select")
    .addEventListener("change", (e) => {
      debugObject.selectedGeometry = e.target.value;
      geometryManager.updateGeometry();
    });

  document
    .getElementById("texture-select")
    .addEventListener("change", async (e) => {
      const v = e.target.value;
      debugObject.selectedTexture = v;
      if (v !== "none" && !textureManager.texturesLoaded?.[v]) {
        await textureManager.loadTexturesForMaterial(v);
      }
      textureManager.applyTextures(geometryManager.getDefaultObject());
    });

  document
    .getElementById("renderStyle-select")
    .addEventListener("change", (e) => {
      debugObject.renderStyle = e.target.value;
      const mat = geometryManager.material;
      mat.wireframe = debugObject.renderStyle === "wireframe";
      mat.flatShading = debugObject.renderStyle === "flat";
      geometryManager.updateMaterial(mat);
    });

  document
    .getElementById("subdivisions-range")
    .addEventListener("input", (e) => {
      debugObject.subdivisions = +e.target.value;
      geometryManager.updateGeometry();
    });

  document
    .getElementById("color-picker")
    .addEventListener("input", (e) => {
      debugObject.color = e.target.value;
      geometryManager.material.color.set(e.target.value);
      geometryManager.material.needsUpdate = true;
    });

  document
    .getElementById("opacity-range")
    .addEventListener("input", (e) => {
      debugObject.opacity = +e.target.value;
      const mat = geometryManager.material;
      mat.opacity = debugObject.opacity;
      mat.transparent = debugObject.opacity < 1;
      mat.needsUpdate = true;
      geometryManager.getDefaultObject().castShadow =
        debugObject.opacity > 0;
    });

  // ============== Shadows ==============
  document
    .getElementById("shadows-checkbox")
    .addEventListener("change", (e) => {
      debugObject.shadows = e.target.checked;
      const mesh = geometryManager.getDefaultObject();
      mesh.castShadow = debugObject.shadows;
      geometryManager.plane.receiveShadow = debugObject.shadows;
    });

  // ============== Camera ==============
  document
    .getElementById("cameraZ-range")
    .addEventListener("input", (e) => {
      debugObject.cameraPositionZ = +e.target.value;
      camera.position.z = debugObject.cameraPositionZ;
    });

  // ============== Animations ==============
  document.getElementById("spin-btn").addEventListener("click", () =>
    debugObject.spin()
  );
  document.getElementById("reset-btn").addEventListener("click", () =>
    debugObject.resetTransform()
  );
  document
    .getElementById("extrude-range")
    .addEventListener("input", (e) => {
      debugObject.extrudeAmount = +e.target.value;
      geometryManager.extrudeVertices();
    });

  // ============== Transform Modes ==============
  document.querySelectorAll("input[name='mode']").forEach((r) =>
    r.addEventListener("change", (e) => {
      debugObject.mode = e.target.value;
      controlsManager.updateTransformMode(debugObject.mode);
    })
  );

  // ============== Array Modifier ==============
  document
    .getElementById("array-count")
    .addEventListener("input", (e) => {
      debugObject.arrayModifier.count = +e.target.value;
      geometryManager.applyArrayModifier();
    });
  ["offsetX", "offsetY", "offsetZ"].forEach((axis) => {
    document
      .getElementById("array-" + axis)
      .addEventListener("input", (e) => {
        debugObject.arrayModifier[axis] = +e.target.value;
        geometryManager.applyArrayModifier();
      });
  });

  // ============== Lights ==============
  document
    .getElementById("ambient-range")
    .addEventListener("input", (e) => {
      lightsManager.ambientLight.intensity = +e.target.value;
    });
  document
    .getElementById("directional-range")
    .addEventListener("input", (e) => {
      lightsManager.directionalLight.intensity = +e.target.value;
    });
  document
    .getElementById("dirPosX-range")
    .addEventListener("input", (e) => {
      lightsManager.directionalLight.position.x = +e.target.value;
    });
  document
    .getElementById("dirPosY-range")
    .addEventListener("input", (e) => {
      lightsManager.directionalLight.position.y = +e.target.value;
    });
  document
    .getElementById("dirPosZ-range")
    .addEventListener("input", (e) => {
      lightsManager.directionalLight.position.z = +e.target.value;
    });
  document
    .getElementById("dirColor-picker")
    .addEventListener("input", (e) => {
      lightsManager.directionalLight.color.set(e.target.value);
    });
}
