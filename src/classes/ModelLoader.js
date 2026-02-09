// src/classes/ModelLoader.js
import * as THREE from "three";
// 👇 MANTÉM o caminho igual ao que você já tem hoje nesse import
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export class ModelLoader {
  constructor(fileInput, button, scene, onLoaded) {
    this.fileInput = fileInput;
    this.button = button;
    this.scene = scene;
    this.onLoaded = onLoaded;
    this.loader = new OBJLoader();

    if (this.fileInput) {
      this.fileInput.addEventListener("change", (e) =>
        this.handleFileChange(e)
      );
    }
  }

  handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "obj") {
      alert("Por enquanto o carregador suporta apenas arquivos .obj");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const object = this.loader.parse(text);

        // Normaliza posição/escala/normais
        this.normalizeObject(object);

        // Habilita sombras e garante materiais “ok”
        object.traverse((child) => {
          if (!child.isMesh) return;

          child.castShadow = true;
          child.receiveShadow = true;

          // Recalcula normais pra evitar shading bizarro
          if (child.geometry && child.geometry.isBufferGeometry) {
            child.geometry.computeVertexNormals();
          }

          // Se o material não for PBR, troca pra MeshStandardMaterial
          if (
            !(
              child.material &&
              child.material instanceof THREE.MeshStandardMaterial
            )
          ) {
            const baseColor =
              child.material && child.material.color
                ? child.material.color
                : new THREE.Color(0xffffff);

            child.material = new THREE.MeshStandardMaterial({
              color: baseColor,
            });
          }
        });

        // Devolve o objeto pronto pro callback definido no main.js
        if (this.onLoaded) this.onLoaded(object);
      } catch (err) {
        console.error("Erro ao carregar modelo OBJ:", err);
        alert("Não foi possível carregar o modelo. O arquivo OBJ é válido?");
      }
    };

    // Lê o arquivo como texto (OBJ é texto)
    reader.readAsText(file);
  }

  normalizeObject(object) {
    if (!object) return;

    // Zera transformações do grupo principal
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // 1) Centraliza na origem
    // (leva o centro do bounding box para (0,0,0))
    object.position.sub(center);
    object.updateMatrixWorld(true);

    // 2) Ajusta escala para ficar num tamanho “padrão”
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 5; // tamanho final em unidades de mundo
      const scale = targetSize / maxDim;
      object.scale.setScalar(scale);
      object.updateMatrixWorld(true);
    }

  }
}
