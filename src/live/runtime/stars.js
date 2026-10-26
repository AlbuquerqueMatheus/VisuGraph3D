// stars.js — as estrelas de um shader: o que um ShaderMaterial faz com os pontos de um THREE.Points,
// medido na placa de vídeo para a conferência dos projetos.
//
// Num THREE.Points, o shader de vértices roda uma vez para cada ponto e diz onde ele aparece na
// tela (gl_Position) e de que tamanho, em pixels (gl_PointSize); o de fragmentos pinta cada pixel
// do quadrado do ponto. Para medir isso, o visor desenha de novo uma amostra dos pontos (os mesmos
// vértices da amostra da geometria nos fatos) com o shader do código embrulhado: um `#define main`
// dá outro nome ao main do código, que roda inteiro, com os mesmos uniforms e atributos, e o main
// do embrulho usa o que ele escreveu. A medida tem três desenhos, cada um numa imagem pequena:
//
// - os números: cada ponto escreve, num pixel só dele, um dos cinco números que o main calculou (x,
//   y, z e w do gl_Position e o gl_PointSize), bit a bit nos quatro bytes do pixel
//   (floatBitsToUint): o número sai da placa de vídeo exatamente como ela calculou;
// - a cor do meio: cada ponto vira um pixel só dele, de tamanho 1, pintado pelo shader de
//   fragmentos do código, com a mistura do material, sobre o preto. É a cor do centro da estrela,
//   onde o gl_PointCoord vale (0,5; 0,5);
// - os quadrados inteiros de alguns pontos, os maiores, cada um sozinho num quadrado da imagem,
//   com o tamanho que o código deu: o desenho de cada estrela, pixel a pixel.

import * as THREE from "three";
import { sampleIndices } from "./facts.js";

/** Quantos números de cada ponto a medida lê, cada um num pixel: x, y, z e w do gl_Position e o gl_PointSize. */
const VALUES = 5;
/** A largura das imagens dos números e das cores. */
const COLUMNS = 64;
/** Quantos pontos vão inteiros, e o maior lado do quadrado de cada um, em pixels. */
const TILES = 8;
const MAX_TILE = 64;

/** O shader de vértices do código com outro main depois dele: o do código roda inteiro, chamado pelo do embrulho. */
const wrap = (source, main) => `#define main vgMainDoCodigo\n${source}\n#undef main\n${main}`;

// O ponto vai para o centro de um pixel da imagem: o k-ésimo, contando da esquerda para a direita
// e de baixo para cima.
const TO_PIXEL = /* glsl */ `
  vec4 vgPixel(float k) {
    vec2 pixel = vec2(mod(k, vgImagem.x), floor(k / vgImagem.x)) + 0.5;
    return vec4(pixel / vgImagem * 2.0 - 1.0, 0.0, 1.0);
  }
`;

// Os números: antes do main do código, um gl_PointSize de −1 e um gl_Position zerado, que ficam
// assim se o código não escrever neles. O `highp` vale mesmo depois de um `precision mediump` no
// código, que num celular guardaria o número com metade dos bits.
const NUMBERS_MAIN = /* glsl */ `
  attribute float vgIndice;
  uniform float vgParte;
  uniform vec2 vgImagem;
  varying vec4 vgBytes;
  ${TO_PIXEL}
  void main() {
    gl_Position = vec4(0.0);
    gl_PointSize = -1.0;
    vgMainDoCodigo();
    highp float v = vgParte < 0.5 ? gl_Position.x : vgParte < 1.5 ? gl_Position.y : vgParte < 2.5 ? gl_Position.z : vgParte < 3.5 ? gl_Position.w : gl_PointSize;
    highp uint bits = floatBitsToUint(v);
    vgBytes = vec4(float(bits >> 24u), float((bits >> 16u) & 255u), float((bits >> 8u) & 255u), float(bits & 255u)) / 255.0;
    gl_Position = vgPixel(vgIndice * ${VALUES}.0 + vgParte);
    gl_PointSize = 1.0;
  }
`;
const NUMBERS_FRAGMENT = /* glsl */ `
  varying vec4 vgBytes;
  void main() {
    gl_FragColor = vgBytes;
  }
`;

const CENTER_MAIN = /* glsl */ `
  attribute float vgIndice;
  uniform vec2 vgImagem;
  ${TO_PIXEL}
  void main() {
    vgMainDoCodigo();
    gl_Position = vgPixel(vgIndice);
    gl_PointSize = 1.0;
  }
`;

// O quadrado inteiro: o ponto vai para o meio do quadrado dele, e o tamanho fica o do código.
const TILE_MAIN = /* glsl */ `
  attribute float vgIndice;
  uniform vec2 vgImagem;
  uniform float vgLado;
  void main() {
    vgMainDoCodigo();
    vec2 centro = vec2((vgIndice + 0.5) * vgLado, 0.5 * vgLado);
    gl_Position = vec4(centro / vgImagem * 2.0 - 1.0, 0.0, 1.0);
  }
`;

/** O que a mistura do material decide, copiado para os desenhos que usam o shader de fragmentos do código. */
const BLEND_KEYS = ["blending", "blendSrc", "blendDst", "blendEquation", "blendSrcAlpha", "blendDstAlpha", "blendEquationAlpha", "premultipliedAlpha", "transparent"];

// ---------------------------------------------------------------------------
// A amostra e os materiais da medida, guardados enquanto não mudam

const samples = new WeakMap(); // geometria do código → { key, geometry, index, attributes }

/**
 * A amostra da geometria numa geometria só dela: os vértices de sampleIndices (os da amostra dos
 * fatos, na mesma ordem), com todos os atributos copiados e, em `vgIndice`, o número de cada ponto
 * na amostra. `attributes` tem os valores da amostra dos atributos que não são position nem color
 * (um número por ponto, ou uma lista, se o atributo tem mais de um), para a conferência.
 */
function sampleOf(geometry) {
  const key = Object.entries(geometry.attributes)
    .map(([name, a]) => `${name}:${a.id}.${a.version}`)
    .join("|");
  let sample = samples.get(geometry);
  if (sample?.key === key) return sample;
  sample?.geometry.dispose();
  const index = sampleIndices(geometry.getAttribute("position")?.count ?? 0);
  const copy = new THREE.BufferGeometry();
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const array = new Float32Array(index.length * size);
    index.forEach((i, j) => {
      for (let k = 0; k < size; k++) array[j * size + k] = attribute.getComponent(i, k);
    });
    copy.setAttribute(name, new THREE.BufferAttribute(array, size));
    if (name !== "position" && name !== "color") attributes[name] = size === 1 ? array : Array.from({ length: index.length }, (_, j) => Array.from(array.subarray(j * size, j * size + size)));
  }
  copy.setAttribute("vgIndice", new THREE.BufferAttribute(Float32Array.from(index, (_, j) => j), 1));
  sample = { key, geometry: copy, index, attributes };
  samples.set(geometry, sample);
  return sample;
}

const MAX_MATERIALS = 4;
const materials = new Map(); // ShaderMaterial do código → os três da medida, dos últimos usados

/** Um ShaderMaterial da medida: o shader de vértices do código embrulhado, com os uniforms do código (os mesmos objetos) e os da medida. */
function measuring(material, main, fragmentShader, own, blend) {
  const out = new THREE.ShaderMaterial({
    vertexShader: wrap(material.vertexShader, main),
    fragmentShader,
    uniforms: { ...material.uniforms, ...own },
    defines: { ...material.defines },
    vertexColors: material.vertexColors,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  if (blend) for (const key of BLEND_KEYS) out[key] = material[key];
  return out;
}

/** Os materiais da medida de um ShaderMaterial do código, refeitos se os textos dos shaders mudaram. */
function materialsOf(material) {
  const key = `${material.vertexShader}\u0000${material.fragmentShader}\u0000${material.vertexColors}\u0000${BLEND_KEYS.map((k) => material[k]).join()}`;
  let set = materials.get(material);
  materials.delete(material);
  if (set?.key !== key) {
    if (set) for (const m of [set.numbers, set.center, set.tile]) m.dispose();
    const numbers = { vgParte: { value: 0 }, vgImagem: { value: new THREE.Vector2() } };
    const center = { vgImagem: { value: new THREE.Vector2() } };
    const tile = { vgImagem: { value: new THREE.Vector2() }, vgLado: { value: 1 } };
    set = {
      key,
      numbers: measuring(material, NUMBERS_MAIN, NUMBERS_FRAGMENT, numbers, false),
      center: measuring(material, CENTER_MAIN, material.fragmentShader, center, true),
      tile: measuring(material, TILE_MAIN, material.fragmentShader, tile, true),
    };
  }
  materials.set(material, set);
  if (materials.size > MAX_MATERIALS) {
    const [old, oldSet] = materials.entries().next().value;
    for (const m of [oldSet.numbers, oldSet.center, oldSet.tile]) m.dispose();
    materials.delete(old);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Os desenhos

const scene = new THREE.Scene();
const EMPTY = new THREE.BufferGeometry();
const stand = new THREE.Points(EMPTY);
stand.matrixAutoUpdate = false;
stand.matrixWorldAutoUpdate = false;
stand.frustumCulled = false;
scene.add(stand);
const targets = new Map(); // nome → WebGLRenderTarget

/** Uma imagem da medida, do tamanho pedido, e o lugar para ler os pixels dela. */
function targetOf(name, width, height) {
  let target = targets.get(name);
  if (!target) {
    target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    targets.set(name, target);
  } else if (target.width !== width || target.height !== height) target.setSize(width, height);
  return target;
}

/** Desenha o ponto de medida com o material na imagem `name` (zerada antes) e devolve os pixels dela. */
function drawInto(renderer, camera, name, width, height, material, passes = [null]) {
  const target = targetOf(name, width, height);
  stand.material = material;
  renderer.setRenderTarget(target);
  renderer.clear();
  for (const pass of passes) {
    pass?.();
    renderer.render(scene, camera);
  }
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  return pixels;
}

/**
 * Se o programa de um material da medida não compilou. O three.js só confere um programa no
 * primeiro desenho dele (é quando o visor ouve o erro) e o guarda para os materiais seguintes com
 * os mesmos textos; o que fica, nos desenhos seguintes, é o diagnóstico guardado no programa.
 */
const broken = (renderer, material) => renderer.properties.get(material).currentProgram?.diagnostics?.runnable === false;

/** As linhas de uma matriz 4 × 4 do three.js (que guarda por colunas). */
const rows = (m) => [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => m.elements[j * 4 + i]));

/**
 * As estrelas de um THREE.Points desenhado por um ShaderMaterial, vistas pela câmera: para cada
 * ponto da amostra da geometria (`count`, na ordem da amostra dos fatos), o gl_Position (`clip`,
 * de 4 em 4 números) e o gl_PointSize (`size`) que o shader de vértices calculou; um gl_PointSize
 * de −1 é o de um código que não escreve nele. `color` tem, de 4 em 4 bytes, a cor do meio de cada
 * estrela como ela soma na imagem (sobre o preto, com a mistura do material), e `attributes`, os
 * valores da amostra dos outros atributos (sampleOf). `projection` e `view` são as matrizes da
 * câmera (por linhas), com que o gl_Position volta para o mundo. `tiles` tem o quadrado inteiro de
 * até TILES estrelas, as maiores: `side` (o lado de cada quadrado, em pixels), `stars` (o número de
 * cada uma na amostra) e `pixels` (os quadrados lado a lado, numa imagem de `side` × TILES de
 * largura, contada de baixo para cima), com o centro de cada estrela no meio do quadrado dela.
 * null se a geometria não tem posições, se o código é de GLSL 3 ou se o embrulho não compila.
 */
export function measureStars({ renderer, points, camera }) {
  const geometry = points.geometry;
  const material = points.material;
  // o GLSL 3 do código (in e out no lugar de attribute e varying) pediria outro embrulho
  if (!geometry?.getAttribute("position") || material.glslVersion === THREE.GLSL3) return null;
  const sample = sampleOf(geometry);
  const set = materialsOf(material);
  const count = sample.index.length;
  if (!count) return null;
  points.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  stand.matrixWorld.copy(points.matrixWorld);
  stand.geometry = sample.geometry;

  const autoClear = renderer.autoClear;
  const target = renderer.getRenderTarget();
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  try {
    // os números, cinco desenhos na mesma imagem
    const rowsOf = (n) => Math.max(1, Math.ceil(n / COLUMNS));
    const numbersHeight = rowsOf(count * VALUES);
    set.numbers.uniforms.vgImagem.value.set(COLUMNS, numbersHeight);
    const parts = Array.from({ length: VALUES }, (_, part) => () => (set.numbers.uniforms.vgParte.value = part));
    const bytes = drawInto(renderer, camera, "numbers", COLUMNS, numbersHeight, set.numbers, parts);
    if (broken(renderer, set.numbers)) return null;
    const view = new DataView(bytes.buffer);
    const clip = new Float32Array(count * 4);
    const size = new Float32Array(count);
    for (let j = 0; j < count; j++) {
      for (let k = 0; k < 4; k++) clip[j * 4 + k] = view.getFloat32((j * VALUES + k) * 4, false);
      size[j] = view.getFloat32((j * VALUES + 4) * 4, false);
    }

    // a cor do meio de cada estrela
    const colorHeight = rowsOf(count);
    set.center.uniforms.vgImagem.value.set(COLUMNS, colorHeight);
    const color = drawInto(renderer, camera, "center", COLUMNS, colorHeight, set.center).slice(0, count * 4);
    if (broken(renderer, set.center)) return null;

    // os quadrados inteiros das maiores estrelas que aparecem na frente da câmera
    const chosen = Array.from({ length: count }, (_, j) => j)
      .filter((j) => clip[j * 4 + 3] > 0 && Number.isFinite(size[j]) && size[j] > 0)
      .sort((a, b) => size[b] - size[a])
      .slice(0, TILES);
    let tiles = null;
    if (chosen.length) {
      const side = Math.min(MAX_TILE, Math.max(4, Math.ceil(size[chosen[0]]) + 2));
      const tileGeometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(sample.geometry.attributes)) {
        const n = attribute.itemSize;
        const array = name === "vgIndice" ? Float32Array.from(chosen, (_, k) => k) : new Float32Array(chosen.length * n);
        if (name !== "vgIndice") chosen.forEach((j, k) => array.set(attribute.array.subarray(j * n, j * n + n), k * n));
        tileGeometry.setAttribute(name, new THREE.BufferAttribute(array, n));
      }
      stand.geometry = tileGeometry;
      set.tile.uniforms.vgImagem.value.set(side * TILES, side);
      set.tile.uniforms.vgLado.value = side;
      const pixels = drawInto(renderer, camera, "tiles", side * TILES, side, set.tile);
      tileGeometry.dispose();
      if (broken(renderer, set.tile)) return null;
      tiles = { side, stars: chosen, pixels };
    }
    return {
      count,
      clip,
      size,
      color,
      attributes: sample.attributes,
      projection: rows(camera.projectionMatrix),
      view: rows(camera.matrixWorldInverse),
      tiles,
    };
  } finally {
    stand.geometry = EMPTY;
    renderer.setRenderTarget(target);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
  }
}
