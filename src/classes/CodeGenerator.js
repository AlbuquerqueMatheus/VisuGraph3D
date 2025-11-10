// src/classes/CodeGenerator.js
export const CodeGenerator = {
  generate({ scene, camera, object, lights }) {
    const geomName = (object && object.geometry && object.geometry.type) || "BoxGeometry";

    return `// --- VisuGraph Export (Three.js) ---
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const sizes = { w: window.innerWidth, h: window.innerHeight };
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(sizes.w, sizes.h);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scn = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(45, sizes.w / sizes.h, 0.1, 100);
cam.position.set(${camera?.position?.x?.toFixed(2) || 3}, ${camera?.position?.y?.toFixed(2) || 2}, ${camera?.position?.z?.toFixed(2) || 3});
scn.add(cam);

// IBL (neutro)
const pmrem = new THREE.PMREMGenerator(renderer);
scn.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Luzes
const amb = new THREE.AmbientLight(0xffffff, ${(lights?.ambientLight?.intensity ?? 0.5).toFixed(2)});
scn.add(amb);
const dir = new THREE.DirectionalLight(0xffffff, ${(lights?.directionalLight?.intensity ?? 1).toFixed(2)});
dir.position.set(${(lights?.directionalLight?.position?.x ?? 5).toFixed(2)}, ${(lights?.directionalLight?.position?.y ?? 5).toFixed(2)}, ${(lights?.directionalLight?.position?.z ?? 5).toFixed(2)});
dir.castShadow = true;
scn.add(dir);

// Geometria simples (ajuste como quiser)
const geo = new THREE.${geomName}(1,1,1);
const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.2 });
const mesh = new THREE.Mesh(geo, mat);
mesh.castShadow = true;
scn.add(mesh);

// chão
const plane = new THREE.Mesh(new THREE.PlaneGeometry(20,20), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 }));
plane.rotation.x = -Math.PI/2; plane.position.y = -0.5; plane.receiveShadow = true;
scn.add(plane);

// resize
window.addEventListener("resize", () => {
  sizes.w = window.innerWidth; sizes.h = window.innerHeight;
  cam.aspect = sizes.w / sizes.h; cam.updateProjectionMatrix();
  renderer.setSize(sizes.w, sizes.h);
});

(function tick() {
  renderer.render(scn, cam);
  requestAnimationFrame(tick);
})();
`;
  },
};
