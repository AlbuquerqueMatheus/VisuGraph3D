// shaders.js — os ShaderMaterial do código no visor: o erro de um shader que não compilou, na
// linha do texto que o código escreveu, e as amostras de pixels com que a conferência dos projetos
// de shader compara a cor que o shader pintou com a conta que ele devia fazer.
//
// O three.js compila o texto do material com umas cem linhas na frente (a versão do GLSL, as
// matrizes e os atributos que ele declara), e o WebGL conta as linhas do erro a partir da primeira
// delas: a linha 112 do que foi compilado pode ser a linha 9 do texto do material.

import * as THREE from "three";

/**
 * O primeiro erro de um registro de compilação do GLSL, como o WebGL escreve:
 * "ERROR: 0:112: 'difusa' : undeclared identifier" vira { line: 112, message: "'difusa' : undeclared identifier" }.
 * Um erro costuma puxar outros na mesma linha (um nome que não existe faz a função que o recebe
 * não servir mais), e o primeiro é a causa; só "dimension mismatch" diz menos que o seguinte, que
 * traz os tipos. Sem esse formato, a primeira linha que diz alguma coisa, sem a linha; null num
 * registro vazio.
 */
export function firstError(log) {
  const lines = String(log || "").split("\n");
  const errors = [];
  for (const raw of lines) {
    const m = /^\s*ERROR:\s*\d+:(\d+):\s*(.*)$/.exec(raw);
    if (m) errors.push({ line: Number(m[1]), message: m[2].trim() });
  }
  if (errors.length) {
    const same = errors.filter((e) => e.line === errors[0].line);
    return same.find((e) => !/dimension mismatch/.test(e.message)) ?? same[0];
  }
  const text = lines.map((s) => s.replace(/^\s*ERROR:\s*/, "").trim()).find(Boolean);
  return text ? { line: null, message: text } : null;
}

/** Quantas quebras de linha há no texto, até a posição `end`. */
function newlines(text, end = text.length) {
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < end; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

const ownSource = (material, stage) => (stage === "vertex" ? material.vertexShader : material.fragmentShader);

/**
 * Se um programa que falhou é o do material: o que o three.js compilou termina com os textos
 * dele. `failure.stages` tem, para cada shader ("vertex" e "fragment"), o registro da compilação
 * (`log`) e o texto inteiro que o WebGL recebeu (`source`).
 */
export const belongsTo = (failure, material) =>
  failure.stages.every(({ stage, source }) => typeof ownSource(material, stage) === "string" && source.endsWith(ownSource(material, stage)));

/**
 * O erro de um programa que não compilou, contado no texto do material: `stage` ("vertex",
 * "fragment" ou "link", quando cada shader compila mas os dois não se encaixam), a mensagem do
 * WebGL, a linha dentro do texto do material (1 é a primeira, a que vem logo depois da crase) e o
 * próprio texto, com que o editor acha a linha no código. `line` e `source` são null quando o erro
 * não cai no texto do material (um erro de encaixe, que não tem linha).
 */
export function failureInfo(failure, material) {
  for (const { stage, log, source } of failure.stages) {
    const error = firstError(log);
    if (!error) continue;
    const own = ownSource(material, stage);
    const mine = typeof own === "string" && own && source.endsWith(own);
    let line = null;
    if (mine && error.line != null) {
      const k = error.line - newlines(source, source.length - own.length);
      if (k >= 1 && k <= newlines(own) + 1) line = k;
    }
    return { stage, message: error.message, line, source: line != null ? own : null };
  }
  const error = firstError(failure.programLog);
  return { stage: "link", message: error?.message ?? "", line: null, source: null };
}

// ---------------------------------------------------------------------------
// Amostras de pixels

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const corner = new THREE.Vector3();
const toNormal = new THREE.Matrix3();
const local = new THREE.Vector3();

/** Se o objeto e todos os pais estão visíveis. */
const shown = (obj) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
};

/** O material com que o triângulo atingido é desenhado. */
const materialOf = (hit) => (Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material);

/**
 * O retângulo da tela (de −1 a 1, como o WebGL) onde a malha aparece, com uma folga de `margin`
 * do tamanho dele em cada lado; a tela inteira se a malha passa para trás da câmera.
 */
function screenBox(mesh, camera, margin) {
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const view = camera.matrixWorldInverse;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    // um canto atrás da câmera não tem lugar na tela
    if (camera.isPerspectiveCamera && corner.clone().applyMatrix4(view).z > -camera.near) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    corner.project(camera);
    minX = Math.min(minX, corner.x);
    minY = Math.min(minY, corner.y);
    maxX = Math.max(maxX, corner.x);
    maxY = Math.max(maxY, corner.y);
  }
  const dx = (maxX - minX) * margin;
  const dy = (maxY - minY) * margin;
  return { minX: Math.max(-1, minX - dx), minY: Math.max(-1, minY - dy), maxX: Math.min(1, maxX + dx), maxY: Math.min(1, maxY + dy) };
}

/**
 * Os pixels de uma imagem da cena, `width` × `height`, desenhada pela câmera: os de uma grade de
 * `grid` × `grid` pontos sobre o retângulo onde a malha aparece, com uma folga em volta. O raio que
 * sai da câmera pelo centro de cada pixel diz o que ele mostra:
 *
 * - `inside`: os pixels que mostram a malha, cada um com o ponto da superfície no mundo (`p`), a
 *   normal ali, no mundo e interpolada entre as dos vértices, como o shader recebe (`n`, sem virar
 *   para a câmera), e a cor (`c`, de 0 a 255). Os pixels quase na borda da silhueta ficam de fora:
 *   neles, o raio e o desenho podem discordar sobre o que o pixel mostra.
 * - `outside`: os pixels da folga que não mostram a malha, com a cor e se mostram outro objeto (`other`).
 *
 * `read(x, y)` dá a cor [r, g, b] do pixel (x, y), contado de baixo para cima, como o WebGL lê.
 * Só malhas comuns (sem InstancedMesh): a normal de cada cópia teria a matriz dela.
 */
export function samplePixels({ scene, camera, mesh, width, height, read, grid = 20, margin = 0.15 }) {
  scene.updateMatrixWorld();
  camera.updateWorldMatrix(true, false); // a câmera do código pode não estar na cena
  const key = raysKey(mesh, camera, [width, height, grid, margin]);
  let cached = cachedRays.get(mesh);
  if (cached?.key !== key) {
    cached = { key, rays: castRays(mesh, camera, width, height, grid, margin) };
    cachedRays.set(mesh, cached);
  }
  const inside = [];
  const outside = [];
  // o que pode passar na frente da malha: as outras malhas, conferidas a cada amostra
  const others = [];
  scene.traverse((obj) => {
    if (obj.isMesh && obj !== mesh) others.push(obj);
  });
  const visible = shown(mesh);
  for (const r of cached.rays ?? []) {
    const own = visible ? r.hits.find((h) => materialAt(mesh, h.materialIndex)?.visible !== false) : null;
    ndc.set(r.x, r.y);
    ray.setFromCamera(ndc, camera);
    ray.far = own ? own.distance : Infinity;
    const other = others.length ? ray.intersectObjects(others, false).find((h) => shown(h.object) && materialOf(h)?.visible !== false) : null;
    ray.far = Infinity;
    const c = read(r.px, r.py);
    if (other || !own?.p) {
      outside.push({ c, other: !!(other || own) });
      continue;
    }
    if (own.edge) continue; // quase na borda da silhueta
    inside.push({ p: own.p, n: own.n, c });
  }
  return { inside, outside };
}

// Os raios da malha ficam guardados enquanto a câmera, o lugar da malha, a geometria e a imagem
// são os mesmos: num passo com animação, a conferência pede os pixels a cada segundo, e refazer
// os 400 raios contra os milhares de triângulos de uma esfera levaria um décimo de segundo, com a
// animação parada. As outras malhas, que podem andar na frente dela (uma lâmpada), são conferidas
// a cada vez, e quase sempre só pela esfera em volta de cada uma.
const cachedRays = new WeakMap(); // malha → { key, rays }
const ids = new WeakMap();
let nextId = 1;

/** Um número para cada objeto, para a chave dos raios saber quando a geometria trocou. */
function idOf(obj) {
  if (obj == null) return 0;
  if (!ids.has(obj)) ids.set(obj, nextId++);
  return ids.get(obj);
}

/** O que decide os raios da malha: a câmera, a malha, a geometria, o lado de cada material e a imagem. */
function raysKey(mesh, camera, image) {
  const { attributes, index, drawRange, groups } = mesh.geometry;
  const version = (attribute) => (attribute ? `${idOf(attribute)}.${attribute.version}` : "-");
  return [
    camera.matrixWorld.elements.join(),
    camera.projectionMatrix.elements.join(),
    mesh.matrixWorld.elements.join(),
    idOf(mesh.geometry),
    version(attributes.position),
    version(attributes.normal),
    version(index),
    drawRange.start,
    drawRange.count,
    groups.map((g) => `${g.start}.${g.count}.${g.materialIndex}`).join(),
    [].concat(mesh.material).map((m) => m?.side).join(),
    mesh.morphTargetInfluences?.join() ?? "",
    image.join(),
  ].join("|");
}

/** O material de um triângulo da malha. */
const materialAt = (mesh, materialIndex) => (Array.isArray(mesh.material) ? mesh.material[materialIndex ?? 0] : mesh.material);

/**
 * Os raios da grade, cada um com o pixel por onde passa e onde ele acerta a malha, sem olhar o
 * resto da cena: a distância, o material, o ponto e a normal, e se o ponto está quase na borda da
 * silhueta. null se a malha não aparece na tela.
 */
function castRays(mesh, camera, width, height, grid, margin) {
  const area = screenBox(mesh, camera, margin);
  if (!area) return null;
  const normals = mesh.geometry.attributes.normal;
  toNormal.getNormalMatrix(mesh.matrixWorld);
  const rays = [];
  const seen = new Set();
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const x = area.minX + ((i + 0.5) / grid) * (area.maxX - area.minX);
      const y = area.minY + ((j + 0.5) / grid) * (area.maxY - area.minY);
      const px = Math.min(width - 1, Math.max(0, Math.floor(((x + 1) / 2) * width)));
      const py = Math.min(height - 1, Math.max(0, Math.floor(((y + 1) / 2) * height)));
      if (seen.has(py * width + px)) continue;
      seen.add(py * width + px);
      // o raio passa pelo centro do pixel, onde a placa de vídeo fez a conta
      ndc.set(((px + 0.5) / width) * 2 - 1, ((py + 0.5) / height) * 2 - 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(mesh, false).map((hit) => {
        const out = { distance: hit.distance, materialIndex: hit.face?.materialIndex ?? 0 };
        if (!hit.face) return out;
        const face = hit.face.normal.clone().applyMatrix3(toNormal).normalize();
        let n = face;
        if (normals) {
          THREE.Triangle.getInterpolatedAttribute(normals, hit.face.a, hit.face.b, hit.face.c, hit.barycoord, local);
          n = local.applyMatrix3(toNormal).normalize();
        }
        return { ...out, p: hit.point.toArray(), n: n.toArray(), edge: Math.abs(face.dot(ray.ray.direction)) < 0.25 };
      });
      rays.push({ px, py, x: ndc.x, y: ndc.y, hits });
    }
  }
  return rays;
}
