// src/classes/CodeGenerator.js

/**
 * Gerador de Código Simplificado
 * Gera código Three.js limpo e funcional, pronto para usar
 */
export const CodeGenerator = {
  
  /**
   * Helper para acessar propriedades com segurança
   */
  safeGet(obj, path, defaultValue) {
    try {
      const keys = path.split('.');
      let result = obj;
      for (const key of keys) {
        if (result == null) return defaultValue;
        result = result[key];
      }
      return result ?? defaultValue;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Formata número com segurança
   */
  safeFixed(value, decimals = 2) {
    if (value == null || isNaN(value)) return '0.00';
    return Number(value).toFixed(decimals);
  },

  /**
   * Gera código completo baseado no objeto principal
   */
  generate({ scene, camera, object, lights, sceneState, animationManager }) {
    try {
      // Se não houver objeto, usa fallback
      if (!object && !sceneState) {
        return this.generateBasicFallback();
      }

      // Gera código a partir do objeto principal
      return this.generateFromObject({ 
        object, 
        camera, 
        lights, 
        animationManager 
      });
      
    } catch (error) {
      console.error('Erro ao gerar código:', error);
      return `// Erro ao gerar código: ${error.message}\n// Por favor, tente novamente.`;
    }
  },

  /**
   * Gera código a partir do objeto principal (SIMPLIFICADO)
   */
  generateFromObject({ object, camera, lights, animationManager }) {
    const parts = [];

    // Header
    parts.push(this.generateHeader());

    // Setup básico (canvas + renderer)
    parts.push(this.generateBasicSetup());

    // Cena
    parts.push(this.generateScene());

    // Câmera
    parts.push(this.generateCameraSimple(camera));

    // Luzes
    parts.push(this.generateLightsSimple(lights));

    // Objeto principal
    parts.push(this.generateMainObject(object));

    // Plano de chão
    parts.push(this.generateGround());

    // Animações (se existirem)
    if (animationManager && this.hasActiveAnimations(animationManager)) {
      parts.push(this.generateAnimationsSimple(animationManager));
    }

    // Resize handler
    parts.push(this.generateResizeHandler());

    // Render loop
    parts.push(this.generateRenderLoop(animationManager));

    return parts.join('\n\n');
  },

  /**
   * Verifica se há animações ativas
   */
  hasActiveAnimations(animationManager) {
    if (!animationManager) return false;
    const rotate = animationManager.rotateOptions || {};
    const float = animationManager.floatOptions || {};
    return rotate.enabled || float.enabled;
  },

  generateHeader() {
    return `// ===================================================
// Código gerado pelo VisuGraph3D
// ${new Date().toLocaleString('pt-BR')}
// ===================================================

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";`;
  },

  generateBasicSetup() {
    return `// Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);`;
  },

  generateScene() {
    return `// Configuração da cena
scene.fog = new THREE.Fog(0x1a1a1a, 10, 50);`;
  },

  generateCameraSimple(camera) {
    const pos = camera?.position || { x: 3, y: 2, z: 3 };
    
    return `// Câmera
camera.position.set(${this.safeFixed(pos.x)}, ${this.safeFixed(pos.y)}, ${this.safeFixed(pos.z)});

// Controles
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;`;
  },

  generateLightsSimple(lights) {
    const ambIntensity = this.safeGet(lights, 'ambientLight.intensity', 0.5);
    const dirIntensity = this.safeGet(lights, 'directionalLight.intensity', 1);
    const dirPos = this.safeGet(lights, 'directionalLight.position', { x: 5, y: 5, z: 5 });
    
    return `// Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, ${this.safeFixed(ambIntensity)});
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, ${this.safeFixed(dirIntensity)});
directionalLight.position.set(${this.safeFixed(dirPos.x)}, ${this.safeFixed(dirPos.y)}, ${this.safeFixed(dirPos.z)});
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);`;
  },

  generateMainObject(object) {
    if (!object) {
      return this.generateDefaultCube();
    }

    // Captura propriedades do objeto
    const geomType = this.safeGet(object, 'geometry.type', 'BoxGeometry');
    const geomParams = this.extractGeometryParams(object.geometry);
    const pos = object.position || { x: 0, y: 0, z: 0 };
    const rot = object.rotation || { x: 0, y: 0, z: 0 };
    const scale = object.scale || { x: 1, y: 1, z: 1 };
    
    // Material
    const mat = object.material || {};
    const color = mat.color ? mat.color.getHex() : 0xcccccc;
    const roughness = mat.roughness ?? 0.7;
    const metalness = mat.metalness ?? 0.2;
    const wireframe = mat.wireframe ?? false;
    const transparent = mat.transparent ?? false;
    const opacity = mat.opacity ?? 1;

    return `// Objeto Principal
const geometry = new THREE.${geomType}(${geomParams});
const material = new THREE.MeshStandardMaterial({
  color: 0x${color.toString(16).padStart(6, '0')},
  roughness: ${this.safeFixed(roughness)},
  metalness: ${this.safeFixed(metalness)},
  wireframe: ${wireframe},
  transparent: ${transparent},
  opacity: ${this.safeFixed(opacity)}
});

const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(${this.safeFixed(pos.x)}, ${this.safeFixed(pos.y)}, ${this.safeFixed(pos.z)});
mesh.rotation.set(${this.safeFixed(rot.x)}, ${this.safeFixed(rot.y)}, ${this.safeFixed(rot.z)});
mesh.scale.set(${this.safeFixed(scale.x)}, ${this.safeFixed(scale.y)}, ${this.safeFixed(scale.z)});
mesh.castShadow = true;
mesh.receiveShadow = true;
scene.add(mesh);`;
  },

  extractGeometryParams(geometry) {
    if (!geometry || !geometry.parameters) {
      return '1, 1, 1';
    }

    const params = geometry.parameters;
    const type = geometry.type;

    // Mapeia os parâmetros comuns de cada geometria
    const paramMap = {
      'BoxGeometry': ['width', 'height', 'depth'],
      'SphereGeometry': ['radius', 'widthSegments', 'heightSegments'],
      'CylinderGeometry': ['radiusTop', 'radiusBottom', 'height', 'radialSegments'],
      'ConeGeometry': ['radius', 'height', 'radialSegments'],
      'TorusGeometry': ['radius', 'tube', 'radialSegments', 'tubularSegments'],
      'PlaneGeometry': ['width', 'height'],
    };

    const keys = paramMap[type] || Object.keys(params).slice(0, 3);
    const values = keys.map(key => {
      const val = params[key];
      return typeof val === 'number' ? this.safeFixed(val) : val;
    });

    return values.length > 0 ? values.join(', ') : '1, 1, 1';
  },

  generateDefaultCube() {
    return `// Objeto Principal (Cubo Padrão)
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.7,
  metalness: 0.2
});

const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
mesh.receiveShadow = true;
scene.add(mesh);`;
  },

  generateGround() {
    return `// Plano de Chão
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x333333,
  roughness: 0.9,
  metalness: 0.1
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);`;
  },

  generateAnimationsSimple(animationManager) {
    const rotate = animationManager.rotateOptions || {};
    const float = animationManager.floatOptions || {};
    
    const parts = ['// Configuração de Animações'];
    
    if (rotate.enabled) {
      parts.push(`const rotateAxis = '${rotate.axis || 'y'}';`);
      parts.push(`const rotateSpeed = ${this.safeFixed(rotate.speed || 1)};`);
    }

    if (float.enabled) {
      parts.push(`const floatAmplitude = ${this.safeFixed(float.amplitude || 0.5)};`);
      parts.push(`const floatSpeed = ${this.safeFixed(float.speed || 1)};`);
      parts.push(`let floatTime = 0;`);
    }

    return parts.join('\n');
  },

  generateResizeHandler() {
    return `// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});`;
  },

  generateRenderLoop(animationManager) {
    const rotate = animationManager?.rotateOptions || {};
    const float = animationManager?.floatOptions || {};
    
    let animationCode = '';

    if (rotate.enabled) {
      const axis = rotate.axis || 'y';
      animationCode += `\n  // Rotação\n  mesh.rotation.${axis} += rotateSpeed * 0.01;`;
    }

    if (float.enabled) {
      animationCode += `\n  // Flutuação\n  floatTime += 0.01 * floatSpeed;\n  mesh.position.y = Math.sin(floatTime) * floatAmplitude;`;
    }

    return `// Loop de Animação
function animate() {
  requestAnimationFrame(animate);${animationCode}
  
  controls.update();
  renderer.render(scene, camera);
}

animate();`;
  },

  generateBasicFallback() {
    return `// ===================================================
// Código gerado pelo VisuGraph3D
// ${new Date().toLocaleString('pt-BR')}
// ===================================================

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 2, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Cubo
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
scene.add(mesh);

// Plano
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x333333 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animação
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();`;
  },

};
