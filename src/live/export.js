// export.js — a cena como uma página HTML que roda sozinha, fora do VisuGraph.

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";

/**
 * Página HTML com o código do aluno, o Three.js de um CDN e o mesmo laço de desenho
 * do visor (sombras ligadas, animar(tempo, delta) a cada quadro).
 * Retorna { html } ou { error } se o código não tem uma cena com nome.
 */
export function exportHtml(analysis, title = "Cena feita no VisuGraph 3D") {
  if (!analysis.ok) return { error: "Corrija o erro no código antes de exportar." };
  if (!analysis.scene || !analysis.scene.name) return { error: "Guarde a cena numa variável (const cena = new THREE.Scene();) para exportar." };
  const scene = analysis.scene.name;
  const camera = analysis.camera && analysis.camera.name;
  // "</script" dentro do código fecharia a tag antes da hora, e "<!--" mudaria o jeito
  // como o navegador procura o fim dela; a barra invertida não muda o texto de uma string.
  const code = analysis.code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--").replace(/\s+$/, "");
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #15171c; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
<script type="importmap">
{ "imports": { "three": "${THREE_URL}" } }
</script>
</head>
<body>
<canvas id="visor"></canvas>
<script type="module">
import * as THREE from "three";

// ----- código da cena -----
const visugraph = (() => {
${code}
  return { cena: ${scene}, camera: ${camera || "null"}, animar: typeof animar === "function" ? animar : null };
})();
// --------------------------

const canvas = document.getElementById("visor");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x15171c);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

let camera = visugraph.camera;
if (!camera) {
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);
}

function resize() {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener("resize", resize);
resize();

const timer = new THREE.Timer();
let tempo = 0;
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const delta = Math.min(timer.getDelta(), 0.1);
  tempo += delta;
  if (visugraph.animar) visugraph.animar(tempo, delta);
  renderer.render(visugraph.cena, camera);
});
</script>
</body>
</html>
`;
  return { html };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
