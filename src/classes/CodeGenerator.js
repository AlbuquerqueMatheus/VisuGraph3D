// src/classes/CodeGenerator.js

import * as THREE from "three";

export class CodeGenerator {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.Renderer} renderer
   * @param {CodeMirror.Editor} codeEditorInstance
   * @param {HTMLButtonElement} generateBtn
   */
  constructor(scene, camera, renderer, codeEditorInstance, generateBtn) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.codeEditor = codeEditorInstance;
    this.generateBtn = generateBtn;

    this.generateBtn.addEventListener("click", () => {
      const code = this.generateSceneCode();
      this.codeEditor.setValue(code);
    });
  }

  generateSceneCode() {
    let code = `// Configuração básica da cena
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(${this.camera.fov}, ${this.camera.aspect}, ${this.camera.near}, ${this.camera.far});
camera.position.set(${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z});

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Adicionar objetos à cena
`;

    this.scene.children.forEach((object) => {
      if (object.isMesh) {
        code += `
const geometry = new THREE.${object.geometry.type}(${Object.values(object.geometry.parameters).join(", ")});
const material = new THREE.MeshStandardMaterial({
  color: ${object.material.color.getHex()},
  metalness: ${object.material.metalness || 0},
  roughness: ${object.material.roughness || 0}
});
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(${object.position.x}, ${object.position.y}, ${object.position.z});
scene.add(mesh);
`;
      } else if (object.isLight) {
        code += `
const light = new THREE.${object.type}(${object.color.getHex()}, ${object.intensity});
light.position.set(${object.position.x}, ${object.position.y}, ${object.position.z});
scene.add(light);
`;
      }
    });

    code += `
// Loop de animação
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
`;

    return code;
  }
}
