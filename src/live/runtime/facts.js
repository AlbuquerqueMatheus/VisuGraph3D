// facts.js — o que o visor conta da cena para a correção dos desafios (src/live/challenges.js).
//
// Os fatos são números da cena como ela está, não do texto do código: posições de mundo,
// matrizes, caixas, materiais, geometrias (quantos vértices e quais atributos), luzes e sombras,
// a câmera e a neblina. As cores vão como estão no código (sRGB).

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
 * A amostra das posições e das cores de uma geometria, calculada uma vez só por geometria: as
 * malhas que dividem uma geometria (os prédios de uma cidade, num laço) levam a mesma lista, e a
 * mensagem do visor, que guarda as referências repetidas, leva essa lista uma vez só.
 */
function samplesOf(geometry, cache) {
  let samples = cache.get(geometry);
  if (!samples) {
    samples = { sample: sampleOf(geometry.getAttribute("position")), colors: sampleOf(geometry.getAttribute("color")) };
    cache.set(geometry, samples);
  }
  return samples;
}

/**
 * A sombra de uma luz: o tamanho do mapa, os desvios e a câmera da sombra, com a matriz que leva
 * um ponto do mundo para o espaço dela (`view`, por linhas). A matriz sai como o desenho a monta,
 * com a câmera na luz olhando para o alvo; a luz pontual olha para os seis lados, sem uma só.
 */
function shadowFacts(light) {
  const { camera, mapSize } = light.shadow;
  const facts = {
    mapSize: [mapSize.x, mapSize.y],
    bias: light.shadow.bias,
    normalBias: light.shadow.normalBias,
    camera: {
      type: camera.type,
      // só a câmera ortográfica (a da luz direcional) tem as bordas
      left: camera.left ?? null,
      right: camera.right ?? null,
      top: camera.top ?? null,
      bottom: camera.bottom ?? null,
      near: camera.near,
      far: camera.far,
      zoom: camera.zoom,
    },
    view: null,
  };
  if (!light.isPointLight && light.target?.isObject3D) {
    const eye = new THREE.Camera();
    eye.up.copy(camera.up);
    eye.position.setFromMatrixPosition(light.matrixWorld);
    eye.lookAt(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
    eye.updateMatrixWorld();
    facts.view = fromColumnMajor(eye.matrixWorldInverse.elements);
  }
  return facts;
}

/**
 * Fatos de um objeto. `idOf(obj)` diz quem é o pai no código: o `parent` dos fatos é esse id,
 * null se o objeto está direto na cena (ou fora dela) e -1 se o pai não veio do código.
 * `cache` guarda as amostras de cada geometria (samplesOf).
 */
function objectFacts(obj, idOf, cache) {
  obj.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(obj);
  const facts = {
    type: obj.isInstancedMesh ? "InstancedMesh" : obj.type, // a InstancedMesh herda type = "Mesh"
    worldPosition: worldPositionOf(obj),
    world: fromColumnMajor(obj.matrixWorld.elements),
    box: box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() },
    parent: obj.parent && !obj.parent.isScene ? idOf(obj.parent) ?? -1 : null,
    castShadow: obj.castShadow,
    receiveShadow: obj.receiveShadow,
  };
  const drawn = obj.isMesh || obj.isPoints || obj.isLine;
  const material = drawn ? [].concat(obj.material)[0] : null;
  if (material && material.isMaterial) {
    facts.material = {
      type: material.type,
      hex: material.color?.isColor ? "#" + material.color.getHexString() : null,
      shininess: typeof material.shininess === "number" ? material.shininess : null,
      specular: rgbArray(material.specular) ?? null,
      // só os materiais com base física (Standard e Physical) têm
      roughness: typeof material.roughness === "number" ? material.roughness : null,
      metalness: typeof material.metalness === "number" ? material.metalness : null,
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
    const { sample, colors } = samplesOf(geometry, cache);
    facts.geometry = {
      // o id é o do trecho do código que criou a geometria (num laço, o mesmo para todas as que
      // ele criou), e o uuid é o da própria geometria: malhas que dividem uma têm o mesmo uuid
      id: idOf(geometry) ?? null,
      uuid: geometry.uuid,
      type: geometry.type,
      vertices: geometry.getAttribute("position")?.count ?? 0,
      attributes: Object.keys(geometry.attributes),
      sample,
      colors,
    };
  }
  if (obj.isInstancedMesh) facts.instances = obj.count;
  if (obj.isLight) {
    // decay e distance: como a luz pontual e o holofote enfraquecem com a distância
    facts.light = { color: rgbArray(obj.color), intensity: obj.intensity, decay: obj.decay ?? null, distance: obj.distance ?? null };
    // o alvo só se atualiza se estiver na cena, como no desenho do Three.js
    if (obj.target?.isObject3D) facts.target = worldPositionOf(obj.target);
    if (obj.shadow) facts.shadow = shadowFacts(obj);
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

/** Neblina da cena: a linear (Fog), com o começo e o fim, ou a exponencial (FogExp2), com a densidade. */
function fogFacts(fog) {
  if (!fog?.color?.isColor) return null;
  return { type: fog.isFogExp2 ? "FogExp2" : "Fog", color: "#" + fog.color.getHexString(), near: fog.near ?? null, far: fog.far ?? null, density: fog.density ?? null };
}

/**
 * Quantos objetos a mais de uma mesma linha do código (criados num laço) vão nos fatos, como
 * `copies`: com o primeiro, os 200 que o visor guarda de cada linha.
 */
const MAX_COPIES = 199;

/**
 * Fatos da cena: os objetos do código (`entries`, pares [id, objeto] ou [id, objetos], os que
 * aquela linha criou, na ordem), as luzes acesas, a câmera do código, a cor de fundo e a neblina.
 * Os fatos de um id são os do primeiro objeto, e os dos outros vão em `copies`.
 */
export function sceneFacts({ scene, camera, entries, idOf }) {
  scene.updateMatrixWorld(); // como o desenho faz a cada quadro: alvos de luz na cena inclusive
  const objects = {};
  const cache = new Map();
  const object3D = (obj) => obj && obj.isObject3D && !obj.isScene;
  for (const [id, value] of entries) {
    const [first, ...rest] = [].concat(value).filter(object3D);
    if (!first) continue;
    objects[id] = objectFacts(first, idOf, cache);
    if (rest.length) objects[id].copies = rest.slice(0, MAX_COPIES).map((obj) => objectFacts(obj, idOf, cache));
  }
  const background = scene.background?.isColor ? "#" + scene.background.getHexString() : null;
  return { objects, lights: sceneLights(scene), camera: camera ? cameraFacts(camera) : null, background, fog: fogFacts(scene.fog) };
}
