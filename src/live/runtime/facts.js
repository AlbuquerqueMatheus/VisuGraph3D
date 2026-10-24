// facts.js — o que o visor conta da cena para a correção dos desafios (src/live/challenges.js).
//
// Os fatos são números da cena como ela está, não do texto do código: posições de mundo,
// matrizes, caixas, materiais, geometrias (quantos vértices e quais atributos), luzes e a câmera.
// As cores vão como estão no código (sRGB).

import * as THREE from "three";
import { fromColumnMajor } from "../../lib/transform3d.js";
import { rgbArray } from "./glass.js";

const worldPositionOf = (obj) => new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).toArray();

/** Quantos vértices de cada geometria vão como amostra, para conferir a forma de uma nuvem de pontos. */
const SAMPLE_SIZE = 1024;

/**
 * Até SAMPLE_SIZE valores do atributo (x, y, z ou r, g, b), espalhados entre os vértices pela
 * razão áurea. Um passo fixo cairia sempre no mesmo braço de uma galáxia que reparte os pontos
 * com `i % bracos`: com 25.600 pontos e 4 braços, de 100 em 100 só se veem os do braço 0.
 * As mesmas contagens dão os mesmos índices, então a cor j da amostra é a do ponto j.
 */
function sampleOf(attribute) {
  if (!attribute || attribute.itemSize < 3) return null;
  const count = attribute.count;
  const n = Math.min(count, SAMPLE_SIZE);
  return Array.from({ length: n }, (_, j) => {
    const i = n === count ? j : Math.floor(((j * 0.6180339887498949) % 1) * count);
    return [attribute.getX(i), attribute.getY(i), attribute.getZ(i)];
  });
}

/** Nome da constante de mistura do material, como no código (THREE.AdditiveBlending → "AdditiveBlending"). */
const BLENDING_NAMES = Object.fromEntries(
  ["NoBlending", "NormalBlending", "AdditiveBlending", "SubtractiveBlending", "MultiplyBlending", "CustomBlending"].map((name) => [THREE[name], name]),
);

/** Qual lado dos triângulos o material pinta, como no código (THREE.DoubleSide → "DoubleSide"). */
const SIDE_NAMES = { [THREE.FrontSide]: "FrontSide", [THREE.BackSide]: "BackSide", [THREE.DoubleSide]: "DoubleSide" };

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
      sizeAttenuation: typeof material.sizeAttenuation === "boolean" ? material.sizeAttenuation : null,
      vertexColors: !!material.vertexColors,
      transparent: !!material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
      blending: BLENDING_NAMES[material.blending] ?? null,
      side: SIDE_NAMES[material.side] ?? null,
    };
  }
  const geometry = drawn && obj.geometry?.isBufferGeometry ? obj.geometry : null;
  if (geometry) {
    // vértices: em THREE.Points, cada vértice é um ponto desenhado; a amostra fica no espaço do objeto
    const position = geometry.getAttribute("position");
    facts.geometry = {
      type: geometry.type,
      vertices: position?.count ?? 0,
      attributes: Object.keys(geometry.attributes),
      sample: sampleOf(position),
      colors: sampleOf(geometry.getAttribute("color")),
    };
  }
  if (obj.isInstancedMesh) facts.instances = obj.count;
  if (obj.isLight) {
    // decay e distance: como a luz pontual e o holofote enfraquecem com a distância
    facts.light = { color: rgbArray(obj.color), intensity: obj.intensity, decay: obj.decay ?? null, distance: obj.distance ?? null };
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
 * Fatos da cena: os objetos do código (`entries`, pares [id, objeto]), as luzes acesas, a
 * câmera do código e a cor de fundo.
 */
export function sceneFacts({ scene, camera, entries, idOf }) {
  scene.updateMatrixWorld(); // como o desenho faz a cada quadro: alvos de luz na cena inclusive
  const objects = {};
  for (const [id, obj] of entries) if (obj && obj.isObject3D && !obj.isScene) objects[id] = objectFacts(obj, idOf);
  const background = scene.background?.isColor ? "#" + scene.background.getHexString() : null;
  return { objects, lights: sceneLights(scene), camera: camera ? cameraFacts(camera) : null, background };
}
