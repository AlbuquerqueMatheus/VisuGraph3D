// src/js/logo.js
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

const canvas = document.getElementById("logo-canvas");
const container = document.getElementById("logo-container");

const scene = new THREE.Scene(); // canvas transparente (CSS faz o fundo)
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
camera.position.z = 8;
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

function resize() {
  const w = container?.clientWidth || 500;
  const h = container?.clientHeight || 500;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Environment (usando arquivo em public/images)
new THREE.TextureLoader().load(
  "/images/6193220.jpg",
  (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = tex; // só env; não setamos background
  },
  undefined,
  (err) => console.warn("Erro ao carregar environment da logo:", err)
);

// Luzes
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);
const rim = new THREE.DirectionalLight(0xffffff, 0.3);
rim.position.set(-5, 5, -5);
scene.add(rim);

// Objetos
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.1, envMapIntensity: 0.2 })
);
scene.add(cube);

const orbit = new THREE.Mesh(
  new THREE.TorusGeometry(2.5, 0.05, 16, 100),
  new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.3, envMapIntensity: 0.2 })
);
orbit.rotation.x = Math.PI / 3;
scene.add(orbit);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.1, envMapIntensity: 0.2 })
);
orbit.add(ball);

// Texto
const fontLoader = new FontLoader();
fontLoader.load(
  "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
  (font) => {
    const geo = new TextGeometry("VisuGraph", { font, size: 0.8, depth: 0.05, curveSegments: 12 });
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.1, envMapIntensity: 0.2 });
    const text = new THREE.Mesh(geo, mat);
    geo.computeBoundingBox();
    const cx = -0.5 * (geo.boundingBox.max.x - geo.boundingBox.min.x);
    text.position.set(cx, -2.5, 0);
    scene.add(text);
  }
);

function tick(t) {
  cube.rotation.y += 0.002;
  const a = (t || 0) * 0.001, r = 2.5;
  ball.position.set(r * Math.cos(a), r * Math.sin(a), 0);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
