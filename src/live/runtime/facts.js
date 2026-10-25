// facts.js — o que o visor conta da cena para a correção dos desafios (src/live/challenges.js).
//
// Os fatos são números da cena como ela está, não do texto do código: posições de mundo,
// matrizes, caixas, materiais, geometrias (quantos vértices, quais atributos e os parâmetros),
// as cópias de uma InstancedMesh, luzes e sombras, a câmera e a neblina, e o rastro de quem a
// animação moveu. As cores vão como estão no código (sRGB), menos as dos uniforms de um
// ShaderMaterial, que vão como o shader as recebe (no espaço linear).

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
  return spread(attribute.count, SAMPLE_SIZE).map((i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]);
}

/** Até `max` índices de 0 a count − 1: todos, ou espalhados pela razão áurea (sampleOf). */
function spread(count, max) {
  const n = Math.min(count, max);
  return Array.from({ length: n }, (_, j) => (n === count ? j : Math.floor(((j * 0.6180339887498949) % 1) * count)));
}

/** Nome da constante de mistura do material, como no código (THREE.AdditiveBlending → "AdditiveBlending"). */
const BLENDING_NAMES = Object.fromEntries(
  ["NoBlending", "NormalBlending", "AdditiveBlending", "SubtractiveBlending", "MultiplyBlending", "CustomBlending"].map((name) => [THREE[name], name]),
);

/** Qual lado dos triângulos o material pinta, como no código (THREE.DoubleSide → "DoubleSide"). */
const SIDE_NAMES = { [THREE.FrontSide]: "FrontSide", [THREE.BackSide]: "BackSide", [THREE.DoubleSide]: "DoubleSide" };

/** Quantos pontos da curva de um tubo (TubeGeometry) vão nos fatos, espaçados por igual. */
const CURVE_POINTS = 400;

/** Até quantos vértices uma placa (PlaneGeometry) manda inteira, para medir um terreno. */
const GRID_VERTICES = 70000;

/** Os valores x, y, z de um atributo de 3 em 3, numa lista só de números (Float32Array). */
function copyOf(attribute) {
  if (!attribute.isInterleavedBufferAttribute && !attribute.normalized) return new Float32Array(attribute.array.subarray(0, attribute.count * 3));
  return Float32Array.from({ length: attribute.count * 3 }, (_, k) => attribute.getComponent(Math.floor(k / 3), k % 3));
}

/**
 * Os vértices de uma placa (PlaneGeometry) na grade dela, com as normais: `cols` × `rows` pedaços,
 * e o vértice da coluna c e da linha r em (r × (cols + 1) + c) × 3, no espaço do objeto. Num
 * terreno de morros, é o que a conferência precisa para saber a altura do chão em qualquer ponto,
 * pelos mesmos triângulos que o desenho usa. null se a placa não tem mais a grade (ou é grande demais).
 */
function gridOf(geometry) {
  const { widthSegments: cols, heightSegments: rows } = geometry.parameters ?? {};
  const position = geometry.getAttribute("position");
  if (!position || !Number.isInteger(cols) || !Number.isInteger(rows)) return null;
  if (position.count !== (cols + 1) * (rows + 1) || position.count > GRID_VERTICES || position.itemSize !== 3) return null;
  const normal = geometry.getAttribute("normal");
  return { cols, rows, positions: copyOf(position), normals: normal?.itemSize === 3 && normal.count === position.count ? copyOf(normal) : null };
}

/**
 * Os parâmetros com que a geometria foi criada que são números ou sim/não (a largura de uma
 * caixa, o raio e os segmentos de um tubo); a curva de um tubo vai à parte, como `curve`.
 */
function parametersOf(geometry) {
  const out = {};
  for (const [key, value] of Object.entries(geometry.parameters ?? {})) {
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * A amostra das posições e das cores de uma geometria, calculada uma vez só por geometria: as
 * malhas que dividem uma geometria (os prédios de uma cidade, num laço) levam a mesma lista, e a
 * mensagem do visor, que guarda as referências repetidas, leva essa lista uma vez só. Num tubo,
 * também os pontos da curva que ele segue, no espaço do objeto, como a amostra (CURVE_POINTS + 1,
 * de ponta a ponta: numa curva fechada, o último é o primeiro).
 */
function samplesOf(geometry, cache) {
  let samples = cache.get(geometry);
  if (!samples) {
    const path = geometry.parameters?.path;
    samples = {
      sample: sampleOf(geometry.getAttribute("position")),
      colors: sampleOf(geometry.getAttribute("color")),
      curve: path instanceof THREE.Curve ? path.getSpacedPoints(CURVE_POINTS).map((p) => p.toArray()) : null,
      grid: geometry.type === "PlaneGeometry" ? gridOf(geometry) : null,
    };
    cache.set(geometry, samples);
  }
  return samples;
}

/** Quantas cópias de uma InstancedMesh mandam a posição: todas, numa floresta de 10 mil árvores. */
const MAX_INSTANCES = 20000;

/**
 * As cópias que uma InstancedMesh desenha (as `count` primeiras): a posição de cada uma no espaço do
 * objeto, de 3 em 3 números (até MAX_INSTANCES, espalhadas pela razão áurea se forem mais), a
 * matriz (por linhas) e a cor de uma amostra de até SAMPLE_SIZE, e a versão das matrizes, que
 * cresce a cada `instanceMatrix.needsUpdate = true`.
 */
function instancedFacts(obj) {
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const placed = spread(obj.count, MAX_INSTANCES);
  const positions = new Float32Array(placed.length * 3);
  placed.forEach((i, k) => {
    obj.getMatrixAt(i, matrix);
    positions[k * 3] = matrix.elements[12];
    positions[k * 3 + 1] = matrix.elements[13];
    positions[k * 3 + 2] = matrix.elements[14];
  });
  const sampled = spread(obj.count, SAMPLE_SIZE);
  return {
    positions,
    sample: sampled.map((i) => {
      obj.getMatrixAt(i, matrix);
      return fromColumnMajor(matrix.elements);
    }),
    colors: obj.instanceColor ? sampled.map((i) => rgbArray(obj.getColorAt(i, color))) : null,
    version: obj.instanceMatrix.version,
  };
}

/**
 * Os uniforms de um ShaderMaterial, como o shader os recebe: { nome: { type, value } }, com `type`
 * "number", "boolean", "vector" (Vector2, Vector3 ou Vector4, como lista), "color" (no espaço linear,
 * como chega ao shader, e não como está no código), "matrix" (por linhas) ou "other" (uma textura,
 * por exemplo, sem o valor).
 */
function uniformsOf(uniforms) {
  const out = {};
  for (const [name, uniform] of Object.entries(uniforms ?? {})) {
    const v = uniform?.value;
    if (typeof v === "number" || typeof v === "boolean") out[name] = { type: typeof v, value: v };
    else if (v?.isColor) out[name] = { type: "color", value: [v.r, v.g, v.b] };
    else if (v?.isVector2 || v?.isVector3 || v?.isVector4) out[name] = { type: "vector", value: v.toArray() };
    else if (v?.isMatrix4) out[name] = { type: "matrix", value: fromColumnMajor(v.elements) };
    else if (v?.isMatrix3) out[name] = { type: "matrix", value: [0, 1, 2].map((i) => [0, 1, 2].map((j) => v.elements[j * 3 + i])) };
    else out[name] = { type: "other", value: null };
  }
  return out;
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
      flatShading: !!material.flatShading,
    };
    if (material.isShaderMaterial) facts.material.uniforms = uniformsOf(material.uniforms);
  }
  const geometry = drawn && obj.geometry?.isBufferGeometry ? obj.geometry : null;
  if (geometry) {
    // vértices: em THREE.Points, cada vértice é um ponto desenhado; a amostra fica no espaço do objeto
    const { sample, colors, curve, grid } = samplesOf(geometry, cache);
    facts.geometry = {
      // o id é o do trecho do código que criou a geometria (num laço, o mesmo para todas as que
      // ele criou), e o uuid é o da própria geometria: malhas que dividem uma têm o mesmo uuid
      id: idOf(geometry) ?? null,
      uuid: geometry.uuid,
      type: geometry.type,
      vertices: geometry.getAttribute("position")?.count ?? 0,
      attributes: Object.keys(geometry.attributes),
      parameters: parametersOf(geometry),
      sample,
      colors,
    };
    if (curve) facts.geometry.curve = curve;
    if (grid) facts.geometry.grid = grid;
  }
  if (obj.isInstancedMesh) {
    facts.instances = obj.count;
    facts.instanced = instancedFacts(obj);
  }
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

const trailMatrix = new THREE.Matrix4();
const trailVector = new THREE.Vector3();

/**
 * O ponto que o rastro de um objeto acompanha, com as matrizes de mundo em dia: a posição dele no
 * mundo. Numa InstancedMesh, é o ponto (1, 1, 1) da primeira cópia, que sai do lugar quando ela
 * anda, gira, cresce ou se inclina: o vento de uma floresta mexe as cópias, e não a malha.
 */
export function trailPoint(obj) {
  if (obj.isInstancedMesh && obj.count > 0) {
    obj.getMatrixAt(0, trailMatrix);
    return trailVector.set(1, 1, 1).applyMatrix4(trailMatrix).applyMatrix4(obj.matrixWorld).toArray();
  }
  return trailVector.setFromMatrixPosition(obj.matrixWorld).toArray();
}

/** Se o rastro saiu do lugar: algum ponto a mais de um décimo de milésimo do primeiro. */
function moved(trail) {
  const [, x, y, z] = trail[0];
  return trail.some(([, a, b, c]) => Math.hypot(a - x, b - y, c - z) > 1e-4);
}

/**
 * Fatos da cena: os objetos do código (`entries`, pares [id, objeto] ou [id, objetos], os que
 * aquela linha criou, na ordem), as luzes acesas, a câmera do código, a cor de fundo e a neblina.
 * Os fatos de um id são os do primeiro objeto, e os dos outros vão em `copies`. `trails` (id →
 * [[tempo, x, y, z], …], os lugares por onde o primeiro objeto passou enquanto a animação rodava,
 * pelo trailPoint) vira o `trail` de quem saiu do lugar.
 */
export function sceneFacts({ scene, camera, entries, idOf, trails = null }) {
  scene.updateMatrixWorld(); // como o desenho faz a cada quadro: alvos de luz na cena inclusive
  const objects = {};
  const cache = new Map();
  const object3D = (obj) => obj && obj.isObject3D && !obj.isScene;
  for (const [id, value] of entries) {
    const [first, ...rest] = [].concat(value).filter(object3D);
    if (!first) continue;
    objects[id] = objectFacts(first, idOf, cache);
    if (rest.length) objects[id].copies = rest.slice(0, MAX_COPIES).map((obj) => objectFacts(obj, idOf, cache));
    const trail = trails?.get(id);
    if (trail?.length && moved(trail)) objects[id].trail = trail.slice();
  }
  const background = scene.background?.isColor ? "#" + scene.background.getHexString() : null;
  return { objects, lights: sceneLights(scene), camera: camera ? cameraFacts(camera) : null, background, fog: fogFacts(scene.fog) };
}
