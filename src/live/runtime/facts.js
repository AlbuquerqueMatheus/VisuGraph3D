// facts.js — o que o visor conta da cena para a correção dos desafios (src/live/challenges.js).
//
// Os fatos são números da cena como ela está, não do texto do código: posições de mundo,
// matrizes, caixas, materiais, geometrias (quantos vértices e quais atributos), luzes e a câmera.
// As cores vão como estão no código (sRGB).

import * as THREE from "three";
import { fromColumnMajor } from "../../lib/transform3d.js";
import { rgbArray } from "./glass.js";

const worldPositionOf = (obj) => new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).toArray();

/** Nome da constante de mistura do material, como no código (THREE.AdditiveBlending → "AdditiveBlending"). */
const BLENDING_NAMES = Object.fromEntries(
  ["NoBlending", "NormalBlending", "AdditiveBlending", "SubtractiveBlending", "MultiplyBlending", "CustomBlending"].map((name) => [THREE[name], name]),
);

/**
 * Fatos de um objeto. `idOf(obj)` diz quem é o pai no código: o `parent` dos fatos é esse id,
 * null se o objeto está direto na cena (ou fora dela) e -1 se o pai não veio do código.
 */
function objectFacts(obj, idOf) {
  obj.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(obj);
  const facts = {
    type: obj.isInstancedMesh ? "InstancedMesh" : obj.type, // a InstancedMesh herda type = "Mesh"
    worldPosition: worldPositionOf(obj),
    world: fromColumnMajor(obj.matrixWorld.elements),
    box: box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() },
    parent: obj.parent && !obj.parent.isScene ? idOf(obj.parent) ?? -1 : null,
  };
  const drawn = obj.isMesh || obj.isPoints || obj.isLine;
  const material = drawn ? [].concat(obj.material)[0] : null;
  if (material && material.isMaterial) {
    facts.material = {
      type: material.type,
      hex: material.color?.isColor ? "#" + material.color.getHexString() : null,
      shininess: typeof material.shininess === "number" ? material.shininess : null,
      specular: rgbArray(material.specular) ?? null,
      size: typeof material.size === "number" ? material.size : null, // só PointsMaterial tem
      vertexColors: !!material.vertexColors,
      transparent: !!material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
      blending: BLENDING_NAMES[material.blending] ?? null,
    };
  }
  const geometry = drawn && obj.geometry?.isBufferGeometry ? obj.geometry : null;
  if (geometry) {
    // vértices: em THREE.Points, cada vértice é um ponto desenhado
    facts.geometry = { type: geometry.type, vertices: geometry.getAttribute("position")?.count ?? 0, attributes: Object.keys(geometry.attributes) };
  }
  if (obj.isInstancedMesh) facts.instances = obj.count;
  if (obj.isLight) {
    facts.light = { color: rgbArray(obj.color), intensity: obj.intensity };
    // o alvo só se atualiza se estiver na cena, como no desenho do Three.js
    if (obj.target?.isObject3D) facts.target = worldPositionOf(obj.target);
  }
  return facts;
}

/** Luzes acesas (visíveis) da cena. */
function sceneLights(scene) {
  const lights = [];
  scene.traverseVisible((obj) => {
    if (obj.isLight) lights.push({ type: obj.type, color: rgbArray(obj.color), ground: rgbArray(obj.groundColor) ?? null, intensity: obj.intensity });
  });
  return lights;
}

/** Fatos da câmera do código. */
function cameraFacts(camera) {
  camera.updateWorldMatrix(true, false);
  return {
    worldPosition: worldPositionOf(camera),
    direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
    world: fromColumnMajor(camera.matrixWorld.elements),
    fov: camera.isPerspectiveCamera ? camera.fov : null,
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
  };
}

/**
 * Fatos da cena: os objetos do código (`entries`, pares [id, objeto]), as luzes acesas e a
 * câmera do código.
 */
export function sceneFacts({ scene, camera, entries, idOf }) {
  scene.updateMatrixWorld(); // como o desenho faz a cada quadro: alvos de luz na cena inclusive
  const objects = {};
  for (const [id, obj] of entries) if (obj && obj.isObject3D && !obj.isScene) objects[id] = objectFacts(obj, idOf);
  return { objects, lights: sceneLights(scene), camera: camera ? cameraFacts(camera) : null };
}
