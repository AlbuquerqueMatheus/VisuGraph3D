// src/classes/ModelLoader.js

import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ModelLoader {
  /**
   * @param {HTMLInputElement} fileInput
   * @param {HTMLButtonElement} uploadButton
   * @param {THREE.Scene} scene
   * @param {function(THREE.Object3D)} onModelLoaded callback (receber o objeto carregado)
   */
  constructor(fileInput, uploadButton, scene, onModelLoaded) {
    this.fileInput = fileInput;
    this.uploadButton = uploadButton;
    this.scene = scene;
    this.onModelLoaded = onModelLoaded;

    this.uploadButton.addEventListener("click", () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const fileType = file.name.split(".").pop().toLowerCase();
      const reader = new FileReader();

      reader.onload = (e) => {
        const contents = e.target.result;
        if (fileType === "obj") {
          const objLoader = new OBJLoader();
          const object = objLoader.parse(contents);
          this._handleNewObject(object);
        } else if (fileType === "glb" || fileType === "gltf") {
          const gltfLoader = new GLTFLoader();
          gltfLoader.parse(contents, "", (gltf) => {
            const object = gltf.scene;
            this._handleNewObject(object);
          });
        } else {
          alert("Unsupported file type");
        }
      };

      if (fileType === "obj") {
        reader.readAsText(file);
      } else if (fileType === "glb" || fileType === "gltf") {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  _handleNewObject(object) {
    // Remove antigo (caso queira remover o default)
    // Por convenção, o callback poderá remover/tratar meshes antigos
    this.onModelLoaded(object);
  }
}
