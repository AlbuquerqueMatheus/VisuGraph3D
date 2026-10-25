// floresta.js — o projeto "Floresta de 10 mil árvores": um terreno de morros feito vértice por
// vértice, dez mil árvores em duas InstancedMesh, cada uma de um tamanho e de um verde, lagos nos
// vales e o vento passando, em 11 passos no VisuGraph e 1 no seu computador. O assunto é a geometria
// editada à mão (as alturas e as normais), as cópias numa malha só (a matriz de cada uma) e como
// espalhar milhares delas sem bolos nem fileiras.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js). A
// conferência mede o terreno pela grade de vértices da placa (`geometry.grid`, nos fatos), com a
// altura do chão em qualquer ponto pelos mesmos triângulos do desenho, e as árvores pelas cópias
// (`instanced`: a posição de todas, a matriz e a cor de uma amostra). O vento é medido pelo rastro
// da primeira cópia (`trail`) e pela versão das matrizes, que só cresce com o needsUpdate.

import {
  all,
  axisOf,
  check,
  columnOf,
  deg,
  depthOf,
  dist,
  dot,
  extent,
  fmt,
  fogAt,
  hslOf,
  instanceMatrices,
  instancePlaces,
  int,
  lit,
  luminance,
  pct,
  quantile,
  toWorld,
  toward,
  wait,
} from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, during, from } from "./source.js";

/** Várias linhas de código como um texto só, para uma versão de `by` que troca um bloco. */
const block = (...lines) => lines.join("\n");

const SOURCE = [
  from(0, "// Floresta de 10 mil árvores"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#a9cfe8");',
    'cena.fog = new THREE.Fog("#a9cfe8", 60, 190);',
    "",
    "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);",
    "camera.position.set(0, 28, 100);",
    "camera.lookAt(0, 0, 20);",
    "",
    "// A luz do céu: azulada de cima, da cor do mato de baixo",
    'const ceu = new THREE.HemisphereLight("#dcefff", "#4a5f35", 1.3);',
    "cena.add(ceu);",
    "",
    "// O sol: alto, do lado esquerdo",
    'const sol = new THREE.DirectionalLight("#fff0d0", 2.4);',
    "sol.position.set(-40, 50, 30);",
    "cena.add(sol);",
  ),
  from(
    2,
    "",
    "// A altura do chão em cada ponto (x, z): três ondas somadas",
    "function altura(x, z) {",
    "  const grande = 3 * Math.sin(x * 0.04) * Math.cos(z * 0.05);",
    "  const media = 1.5 * Math.sin(x * 0.09 + 1) * Math.sin(z * 0.08);",
    "  const pequena = 0.6 * Math.sin(x * 0.21 + z * 0.17);",
    "  return grande + media + pequena;",
    "}",
  ),
  from(
    1,
    "",
    "// O terreno: uma placa de 200 × 200, deitada, com 160 × 160 pedaços",
    "const geometriaTerreno = new THREE.PlaneGeometry(200, 200, 160, 160);",
    "geometriaTerreno.rotateX(-Math.PI / 2);",
  ),
  from(
    2,
    "",
    "// Cada vértice sobe ou desce até a altura do chão naquele ponto",
    "const posicoes = geometriaTerreno.attributes.position;",
    "for (let i = 0; i < posicoes.count; i++) {",
    "  posicoes.setY(i, altura(posicoes.getX(i), posicoes.getZ(i)));",
    "}",
  ),
  from(3, "geometriaTerreno.computeVertexNormals(); // as normais seguem os morros, para a luz"),
  from(1, "", 'const terreno = new THREE.Mesh(geometriaTerreno, new THREE.MeshStandardMaterial({ color: "#7a9a50" }));', "cena.add(terreno);"),
  from(
    10,
    "",
    "// Os lagos: uma placa de água na altura do fundo dos vales",
    "const nivelDaAgua = -2.4;",
    "const agua = new THREE.Mesh(",
    "  new THREE.PlaneGeometry(200, 200),",
    '  new THREE.MeshStandardMaterial({ color: "#4f8fc0", transparent: true, opacity: 0.85, roughness: 0.2 })',
    ");",
    "agua.rotation.x = -Math.PI / 2;",
    "agua.position.y = nivelDaAgua;",
    "cena.add(agua);",
  ),
  from(
    4,
    "",
    "// Uma árvore: um tronco e uma copa, com a base na origem de cada geometria",
    "const geometriaTronco = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);",
    "geometriaTronco.translate(0, 0.5, 0);",
    "const geometriaCopa = new THREE.ConeGeometry(0.9, 2.4, 7);",
    "geometriaCopa.translate(0, 2, 0);",
    'const materialTronco = new THREE.MeshStandardMaterial({ color: "#6b4a2b" });',
  ),
  by({
    4: 'const materialCopa = new THREE.MeshStandardMaterial({ color: "#4f7a3a" });',
    9: 'const materialCopa = new THREE.MeshStandardMaterial({ color: "#ffffff" }); // a cor de cada copa vem do setColorAt',
  }),
  during(
    4,
    5,
    "",
    "// A árvore num ponto do terreno, na altura do chão ali",
    "const tronco = new THREE.Mesh(geometriaTronco, materialTronco);",
    "tronco.position.set(0, altura(0, 60), 60);",
    "cena.add(tronco);",
    "const copa = new THREE.Mesh(geometriaCopa, materialCopa);",
    "copa.position.copy(tronco.position);",
    "cena.add(copa);",
  ),
  from(
    5,
    "",
    "// Um sorteio com semente: os mesmos números a cada vez que o código roda",
    "let semente = 7;",
    "function sorteio() {",
    "  semente = (semente * 16807) % 2147483647;",
    "  return (semente - 1) / 2147483646;",
    "}",
  ),
  during(
    5,
    6,
    "",
    "// Cem árvores, cada uma num ponto sorteado do terreno",
    "for (let i = 0; i < 100; i++) {",
    "  const x = (sorteio() - 0.5) * 200;",
    "  const z = (sorteio() - 0.5) * 200;",
    "  const tronco = new THREE.Mesh(geometriaTronco, materialTronco);",
    "  tronco.position.set(x, altura(x, z), z);",
    "  cena.add(tronco);",
    "  const copa = new THREE.Mesh(geometriaCopa, materialCopa);",
    "  copa.position.copy(tronco.position);",
    "  cena.add(copa);",
    "}",
  ),
  from(6, ""),
  by({
    6: "// Dez mil árvores em duas malhas: uma com todos os troncos, outra com todas as copas",
    7: "// Dez mil árvores em duas malhas, numa grade de 100 × 100 quadrados: uma árvore em cada",
  }),
  by({ 6: "const quantas = 10000;", 7: block("const lado = 100;", "const passo = 200 / lado; // cada quadrado tem 2 de lado") }),
  by({
    6: "const troncos = new THREE.InstancedMesh(geometriaTronco, materialTronco, quantas);",
    7: "const troncos = new THREE.InstancedMesh(geometriaTronco, materialTronco, lado * lado);",
  }),
  by({
    6: "const copas = new THREE.InstancedMesh(geometriaCopa, materialCopa, quantas);",
    7: "const copas = new THREE.InstancedMesh(geometriaCopa, materialCopa, lado * lado);",
  }),
  from(6, "const molde = new THREE.Object3D(); // só para montar a matriz de cada árvore"),
  from(9, "const cor = new THREE.Color();"),
  from(11, "const arvores = []; // o lugar e o tamanho de cada árvore, para o vento"),
  during(
    6,
    7,
    "for (let i = 0; i < quantas; i++) {",
    "  const x = (sorteio() - 0.5) * 200;",
    "  const z = (sorteio() - 0.5) * 200;",
    "  molde.position.set(x, altura(x, z), z);",
    "  molde.updateMatrix();",
    "  troncos.setMatrixAt(i, molde.matrix);",
    "  copas.setMatrixAt(i, molde.matrix);",
    "}",
  ),
  from(
    7,
    "",
    "let n = 0; // quantas árvores já foram plantadas: o índice da próxima",
    "for (let linha = 0; linha < lado; linha++) {",
    "  for (let coluna = 0; coluna < lado; coluna++) {",
    "    const x = -100 + (coluna + sorteio()) * passo;",
    "    const z = -100 + (linha + sorteio()) * passo;",
    "    const y = altura(x, z);",
  ),
  from(10, "    if (y < nivelDaAgua + 0.3) continue; // na água ou na beira: sem árvore"),
  from(8, "    const largura = 0.7 + sorteio() * 0.6;", "    const alto = 0.7 + sorteio() * 0.8;"),
  from(7, "    molde.position.set(x, y, z);"),
  from(8, "    molde.scale.set(largura, alto, largura);"),
  from(7, "    molde.updateMatrix();", "    troncos.setMatrixAt(n, molde.matrix);", "    copas.setMatrixAt(n, molde.matrix);"),
  from(9, "    cor.setHSL(0.25 + sorteio() * 0.1, 0.5, 0.22 + sorteio() * 0.15);", "    copas.setColorAt(n, cor);"),
  from(11, "    arvores.push({ x, y, z, largura, alto });"),
  from(7, "    n++;", "  }", "}"),
  from(10, "troncos.count = n; // só as árvores plantadas são desenhadas", "copas.count = n;"),
  from(6, "cena.add(troncos);", "cena.add(copas);"),
  from(
    11,
    "",
    "// O vento: cada árvore se inclina para um lado e para o outro, numa onda que atravessa a floresta",
    "function animar(tempo) {",
    "  for (let i = 0; i < arvores.length; i++) {",
    "    const arvore = arvores[i];",
    "    molde.position.set(arvore.x, arvore.y, arvore.z);",
    "    molde.scale.set(arvore.largura, arvore.alto, arvore.largura);",
    "    molde.rotation.z = Math.sin(tempo * 1.5 - arvore.x * 0.1) * 0.06;",
    "    molde.updateMatrix();",
    "    troncos.setMatrixAt(i, molde.matrix);",
    "    copas.setMatrixAt(i, molde.matrix);",
    "  }",
    "  troncos.instanceMatrix.needsUpdate = true;",
    "  copas.instanceMatrix.needsUpdate = true;",
    "}",
  ),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: o terreno é medido pela grade de vértices da placa, levada ao mundo, e as árvores
// pelas cópias das duas InstancedMesh (a posição de todas, a matriz e a cor de uma amostra)

/** Quanto uma árvore pode ficar acima ou abaixo do chão e ainda estar nele. */
const GROUND_TOLERANCE = 0.1;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A mesma direção, com comprimento 1. */
function unit(v) {
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

/** O ângulo, em graus, entre duas direções de qualquer comprimento. */
const angleOf = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));

/** Uma direção levada ao mundo pela matriz (por linhas), sem a translação. */
const rotate = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);

/** Um ponto do chão (x, z) escrito como nos textos: (12,3; −45,6). */
const spot = ([x, , z]) => `(${fmt(x, 1)}; ${fmt(z, 1)})`;

/** "1 árvore está" ou "320 árvores estão": quantas, com o verbo. */
const treesAre = (n) => `${int(n)} ${n === 1 ? "árvore está" : "árvores estão"}`;

/** Uma medida sem casas quando é inteira: 2 em vez de 2,0. */
const size = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? int(v) : fmt(v, 1));

const grounds = new WeakMap();

/**
 * O terreno medido pelos vértices da placa (`geometry.grid`, nos fatos), levados ao mundo: a altura
 * de cada vértice, os passos da grade (`du`, de uma coluna para a seguinte, e `dv`, de uma linha
 * para a seguinte), para onde a frente da placa aponta, os limites em x e z e a altura do chão em
 * qualquer ponto (x, z), pelos mesmos dois triângulos por quadrado que a PlaneGeometry desenha
 * (heightAt, null fora do terreno ou com a placa em pé). null se a placa não tem mais a grade.
 */
function groundOf(terreno) {
  if (grounds.has(terreno)) return grounds.get(terreno);
  const grid = terreno?.geometry?.grid;
  let ground = null;
  if (grid) {
    const { cols, rows, positions } = grid;
    const W = cols + 1;
    const count = W * (rows + 1);
    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    const zs = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const p = toWorld(terreno, [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
      xs[i] = p[0];
      ys[i] = p[1];
      zs[i] = p[2];
    }
    const at = (i) => [xs[i], ys[i], zs[i]];
    const du = sub(at(cols), at(0)).map((c) => c / cols);
    const dv = sub(at(rows * W), at(0)).map((c) => c / rows);
    // a frente da PlaneGeometry é dv × du: o +z dela, antes de qualquer giro
    const front = unit(cross(dv, du));
    // a área de um quadrado da grade visto de cima: 0 com a placa em pé
    const det = du[0] * dv[2] - dv[0] * du[2];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const y of ys) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const corners = [0, cols, rows * W, count - 1].map(at);
    const bounds = {
      minX: Math.min(...corners.map((p) => p[0])),
      maxX: Math.max(...corners.map((p) => p[0])),
      minZ: Math.min(...corners.map((p) => p[2])),
      maxZ: Math.max(...corners.map((p) => p[2])),
    };
    const lying = Math.abs(det) > 1e-6 * Math.hypot(...du) * Math.hypot(...dv);
    const heightAt = (x, z) => {
      if (!lying) return null;
      // (s, t): a coluna e a linha da grade, com a fração, onde fica o ponto
      const dx = x - xs[0];
      const dz = z - zs[0];
      const s = (dx * dv[2] - dv[0] * dz) / det;
      const t = (du[0] * dz - dx * du[2]) / det;
      if (!(s >= -1e-6 && t >= -1e-6 && s <= cols + 1e-6 && t <= rows + 1e-6)) return null;
      const ix = Math.min(cols - 1, Math.max(0, Math.floor(s)));
      const iy = Math.min(rows - 1, Math.max(0, Math.floor(t)));
      const fs = s - ix;
      const ft = t - iy;
      // os cantos do quadrado: a e d na linha iy, b e c na seguinte; os triângulos são (a, b, d) e (b, c, d)
      const a = ys[iy * W + ix];
      const b = ys[(iy + 1) * W + ix];
      const c = ys[(iy + 1) * W + ix + 1];
      const d = ys[iy * W + ix + 1];
      return fs + ft <= 1 ? a + fs * (d - a) + ft * (b - a) : c + (1 - fs) * (b - c) + (1 - ft) * (d - c);
    };
    ground = { cols, rows, W, xs, ys, zs, du, dv, front, lying, minY, maxY, bounds, width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ, heightAt };
  }
  grounds.set(terreno, ground);
  return ground;
}

/** O que dizer quando não dá para ler a grade de vértices do terreno. */
function unreadable(terreno) {
  const type = terreno.geometry?.type ?? null;
  if (type !== "PlaneGeometry") return `o terreno é ${type ?? "um objeto sem geometria"}, e não uma PlaneGeometry`;
  if (terreno.geometry.vertices > 70000) return `o terreno tem ${int(terreno.geometry.vertices)} vértices, e a conferência mede até 70 mil, uns 260 × 260 pedaços`;
  return "não deu para ler a grade de vértices do terreno";
}

/** O terreno medido ({ ground }), ou o resultado da conferência quando não dá para medir ({ result }). */
function groundFor(terreno) {
  const ground = groundOf(terreno);
  if (!ground) return { result: check(false, unreadable(terreno)) };
  if (!ground.lying) return { result: check(false, "o terreno está em pé: falta deitar a placa, com geometriaTerreno.rotateX(-Math.PI / 2)") };
  return { ground };
}

/** Confere que o terreno tem morros: o chão sobe e desce pelo menos 4. */
function hilly(terreno) {
  const { ground, result } = groundFor(terreno);
  if (!ground) return result;
  const range = ground.maxY - ground.minY;
  if (range < 0.01) return check(false, "o terreno continua plano: os vértices não saíram da altura em que estavam");
  return check(range >= 4, `o terreno vai da altura ${fmt(ground.minY)} a ${fmt(ground.maxY)}: quase plano`);
}

/** O degrau mais íngreme entre dois vértices vizinhos da grade: quanto sobe, em quanto anda, e onde. */
function steepest({ cols, rows, W, xs, ys, zs }) {
  let worst = { slope: 0, rise: 0, run: 1, at: [xs[0], ys[0], zs[0]] };
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = r * W + c;
      for (const j of [c < cols ? i + 1 : -1, r < rows ? i + W : -1]) {
        if (j < 0) continue;
        const run = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]);
        const rise = Math.abs(ys[j] - ys[i]);
        if (run > 0 && rise / run > worst.slope) worst = { slope: rise / run, rise, run, at: [xs[i], ys[i], zs[i]] };
      }
    }
  }
  return worst;
}

/**
 * Confere as normais do terreno: em cada vértice, a normal (levada ao mundo) tem de seguir a direção
 * da superfície ali, que sai dos vértices vizinhos (o produto vetorial dos dois lados). Com
 * flatShading, o desenho usa a inclinação de cada triângulo, e as normais não importam.
 */
function followsHills(terreno) {
  const shading = lit("o terreno", terreno);
  if (!shading.ok) return shading;
  if (terreno.material.flatShading) return check(true);
  const { ground, result } = groundFor(terreno);
  if (!ground) return result;
  const normals = terreno.geometry.grid.normals;
  if (!normals) return check(false, "a geometria do terreno não tem normais");
  const { cols, rows, W, xs, ys, zs } = ground;
  const point = (c, r) => {
    const k = Math.min(rows, Math.max(0, r)) * W + Math.min(cols, Math.max(0, c));
    return [xs[k], ys[k], zs[k]];
  };
  const normalAt = (i) => rotate(terreno.world, [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
  const first = normalAt(0);
  let same = true;
  let sum = 0;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const normal = normalAt(r * W + c);
      const across = sub(point(c + 1, r), point(c - 1, r));
      const along = sub(point(c, r + 1), point(c, r - 1));
      sum += angleOf(normal, cross(along, across));
      if (same && angleOf(normal, first) > 0.1) same = false;
    }
  }
  if (same) return check(false, "as normais apontam todas para cima, como na placa plana: a luz não vê os morros. Falta geometriaTerreno.computeVertexNormals(), depois do laço das alturas");
  const mean = sum / ((cols + 1) * (rows + 1));
  return check(mean <= 2, `as normais ficam, em média, ${fmt(mean, 1)}° fora da inclinação do chão`);
}

/** O ponto do chão para onde a câmera olha (o raio do meio da vista encontra y = 0), ou null se ela olha para cima. */
function aimOf(camera) {
  const [dx, dy, dz] = camera.direction;
  if (dy > -1e-6) return null;
  const t = -camera.worldPosition[1] / dy;
  return [camera.worldPosition[0] + dx * t, 0, camera.worldPosition[2] + dz * t];
}

/** O ponto da borda do terreno à frente da câmera, vista de cima: até onde o chão vai. */
function edgeAhead(camera, { bounds }) {
  const [hx, , hz] = unit([camera.direction[0], 0, camera.direction[2]]);
  const [px, , pz] = camera.worldPosition;
  const exits = [];
  if (hx > 1e-9) exits.push((bounds.maxX - px) / hx);
  if (hx < -1e-9) exits.push((bounds.minX - px) / hx);
  if (hz > 1e-9) exits.push((bounds.maxZ - pz) / hz);
  if (hz < -1e-9) exits.push((bounds.minZ - pz) / hz);
  const t = Math.min(...exits);
  return [px + hx * t, 0, pz + hz * t];
}

/** Se o ponto aparece na câmera: à frente dela e dentro do campo de visão (na horizontal, como num visor quadrado). */
function inView(camera, p) {
  const d = sub(p, camera.worldPosition);
  const depth = dot(camera.direction, d);
  if (depth <= camera.near) return false;
  const half = Math.tan(((camera.fov ?? 50) * Math.PI) / 360) * depth;
  return Math.abs(dot(unit(columnOf(camera.world, 1)), d)) <= half && Math.abs(dot(unit(columnOf(camera.world, 0)), d)) <= half;
}

/** Uma peça da árvore no mundo, pela amostra da geometria: a altura da base e a do alto. */
function partOf(obj) {
  const { min, max } = extent((obj.geometry?.sample ?? [[0, 0, 0]]).map((p) => toWorld(obj, p)), 1);
  return { bottom: min, top: max };
}

const places = new WeakMap();

/** As posições, no mundo, das árvores de uma InstancedMesh (a base de cada cópia). */
function placesOf(obj) {
  if (!places.has(obj)) places.set(obj, instancePlaces(obj));
  return places.get(obj);
}

/** O maior grupo de árvores no mesmo ponto: quantas e onde. */
function biggestGroup(points) {
  const groups = new Map();
  let best = { size: 0, at: null };
  for (const p of points) {
    const key = `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(p[2] * 1000)}`;
    const n = (groups.get(key) ?? 0) + 1;
    groups.set(key, n);
    if (n > best.size) best = { size: n, at: p };
  }
  return best;
}

/** Quantas cópias da malha estão exatamente na origem dela: as que ficaram com a matriz identidade. */
function atOrigin(obj) {
  const p = obj.instanced?.positions ?? [];
  let n = 0;
  for (let k = 0; k + 2 < p.length; k += 3) if (p[k] === 0 && p[k + 1] === 0 && p[k + 2] === 0) n++;
  return n;
}

/** O menor e o maior valor de uma lista longa (sem espalhar a lista como argumentos). */
function rangeOf(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

/** Confere que as árvores (os pontos) estão no chão: nem acima, nem abaixo, nem fora do terreno. */
function onGround(points, terreno) {
  const { ground, result } = groundFor(terreno);
  if (!ground) return result;
  let off = 0;
  let outside = 0;
  let worst = null;
  let gap = 0;
  for (const p of points) {
    const h = ground.heightAt(p[0], p[2]);
    if (h == null) {
      outside++;
      continue;
    }
    const g = p[1] - h;
    if (Math.abs(g) > GROUND_TOLERANCE) {
      off++;
      if (Math.abs(g) > Math.abs(gap)) {
        gap = g;
        worst = p;
      }
    }
  }
  if (outside) return check(false, `${treesAre(outside)} fora do terreno, no ar`);
  return check(off === 0, `${treesAre(off)} fora do chão: a do ponto ${spot(worst ?? [0, 0, 0])} fica ${fmt(Math.abs(gap))} ${gap > 0 ? "acima" : "abaixo"} dele`);
}

/** Confere que as árvores (os pontos) se espalham pelo terreno: nenhuma no mesmo ponto que outra, e de uma borda a outra. */
function spreadOut(points, terreno) {
  const { ground, result } = groundFor(terreno);
  if (!ground) return result;
  const group = biggestGroup(points);
  if (group.size > 1) {
    const origin = Math.hypot(...group.at) < 1e-9;
    return check(false, `${int(group.size)} árvores estão no mesmo ponto, ${spot(group.at)}${origin ? ", a origem: a matriz de quando a malha foi criada" : ": cada árvore precisa de um ponto sorteado só dela"}`);
  }
  const x = rangeOf(points.map((p) => p[0]));
  const z = rangeOf(points.map((p) => p[2]));
  const fx = (x.max - x.min) / ground.width;
  const fz = (z.max - z.min) / ground.depth;
  return check(Math.min(fx, fz) >= 0.6, `as árvores ocupam só ${pct(fx)} do terreno em x e ${pct(fz)} em z`);
}

/** Confere que os troncos e as copas são duas InstancedMesh, cada uma com a geometria da sua peça. */
function instanced({ troncos, copas }) {
  for (const [obj, label] of [
    [troncos, "os troncos"],
    [copas, "as copas"],
  ]) {
    if (obj.type !== "InstancedMesh") return check(false, `${label} não são uma InstancedMesh: são ${obj.type}`);
  }
  if (troncos.geometry?.type !== "CylinderGeometry") return check(false, `a malha dos troncos usa a ${troncos.geometry?.type}, e não a geometria do tronco`);
  return check(copas.geometry?.type === "ConeGeometry", `a malha das copas usa a ${copas.geometry?.type}, e não a geometria da copa`);
}

/** Confere que cada copa tem a matriz do seu tronco: as duas malhas desenham as mesmas árvores. */
function paired({ troncos, copas }) {
  if (troncos.instances !== copas.instances) return check(false, `a malha dos troncos desenha ${int(troncos.instances)} cópias, e a das copas, ${int(copas.instances)}`);
  for (const [obj, name] of [
    [copas, "copas"],
    [troncos, "troncos"],
  ]) {
    const n = atOrigin(obj);
    const other = obj === copas ? troncos : copas;
    if (n > atOrigin(other)) return check(false, `${int(n)} ${name === "copas" ? "copas estão" : "troncos estão"} na origem, com a matriz de quando a malha foi criada: falta ${name}.setMatrixAt`);
  }
  const a = instanceMatrices(troncos);
  const b = instanceMatrices(copas);
  const loose = a.filter((m, k) => m.some((row, i) => row.some((v, j) => Math.abs(v - b[k][i][j]) > 1e-4))).length;
  return check(loose === 0, `há copas fora dos troncos: a cópia de cada árvore tem de receber a mesma matriz nas duas malhas`);
}

/** O tamanho de cada cópia da amostra, no mundo: a escala em x, y e z (o comprimento de cada eixo da matriz). */
const scalesOf = (obj) => instanceMatrices(obj).map((m) => [0, 1, 2].map((k) => Math.hypot(...columnOf(m, k))));

/** Quanto cada cópia da amostra se inclina, em graus: o ângulo entre o eixo y dela e o y do mundo. */
const tiltsOf = (obj) => instanceMatrices(obj).map((m) => angleOf(columnOf(m, 1), [0, 1, 0]));

/** A altura da água: a dos vértices da placa, no mundo. */
const levelOf = (agua) => {
  const sample = (agua.geometry?.sample ?? [[0, 0, 0]]).map((p) => toWorld(agua, p));
  return sample.reduce((s, p) => s + p[1], 0) / sample.length;
};

/** Para onde a frente de uma placa (PlaneGeometry) aponta no mundo, pelos três primeiros vértices dela. */
function plateFront(obj) {
  const [a, b, c] = (obj.geometry?.sample ?? []).slice(0, 3).map((p) => toWorld(obj, p));
  return c ? unit(cross(sub(c, a), sub(b, a))) : [0, 0, 1];
}

/** O nome de uma cor pelo matiz (0 a 360), como se diz de uma copa ou da água: "verde", "amarela"… */
function hueName({ h, s }) {
  if (s < 0.12) return "cinza";
  if (h < 20 || h >= 330) return "vermelha";
  if (h < 45) return "laranja";
  if (h < 65) return "amarela";
  if (h < 170) return "verde";
  if (h < 260) return "azul";
  return "roxa";
}

/** A animação parada antes de o vento soprar: as árvores ainda estão como o laço as plantou. */
const STOPPED = "a animação está parada: aperte ▶ na barra de cima para o vento soprar";

/**
 * Se o vento já soprou: o rastro da primeira cópia dos troncos ou das copas saiu do lugar. Senão, o
 * resultado da conferência (esperando a animação rodar, ou falhando); null quando dá para conferir.
 */
function calm({ objects, hasAnimar, playing, recorded }) {
  if (!hasAnimar) return check(false, "não achei a função animar(tempo)");
  const moved = objects.troncos.trail?.length >= 2 || objects.copas.trail?.length >= 2;
  if (moved) return null;
  if (!playing) return wait(STOPPED);
  if (recorded < 2) return wait("esperando o vento soprar");
  if (Math.max(...tiltsOf(objects.troncos)) > 0.1) return check(false, "as árvores estão inclinadas, mas paradas: a inclinação não muda com o tempo");
  return check(false, "as árvores não se mexem: animar não muda as matrizes delas");
}

/** A malha que o vento mexe: a dos troncos, ou a das copas, se só ela anda. */
const swaying = ({ troncos, copas }) => (troncos.trail?.length >= 2 || !(copas.trail?.length >= 2) ? troncos : copas);

/** O ponto do meio da vista da câmera e o meio do terreno, para conferir de onde ela olha. */
const CENTER = [0, 0, 20];

// ---------------------------------------------------------------------------
// No seu computador: o projeto Vite com o código do fim do passo 11 em src/cena.js

const END = codeAt(11);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: ["0", "0", "20"], controls: true };

const COMPUTER = [
  computerStep({
    id: "floresta",
    title: "Floresta de 10 mil árvores",
    end: END,
    options: OPTIONS,
    words: {
      yours: "a sua floresta",
      browser: "o código da floresta precisa dele no navegador",
      privates: "`terreno`, `troncos` e o resto",
      stretched: "a floresta sai esticada ou achatada",
      jump: "o vento pularia para outro ponto da onda",
      animarStep: 11,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor e chamava `animar` a cada quadro. Neste passo, a floresta vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, e o que o VisuGraph fazia fica escrito no `src/main.js`, com os controles do mouse para passear por cima da floresta.",
    why: [
      {
        title: "O que pesa numa floresta de 9 mil árvores?",
        text: "Não é o desenho: são duas InstancedMesh, duas chamadas de desenho por quadro, mais o terreno e a água. O que pesa é o vento, que refaz 9 mil matrizes por quadro no processador e manda todas para a placa de vídeo. Para ver quanto tempo isso leva, abra as ferramentas do navegador (F12), vá à aba Performance e grave alguns segundos: cada quadro aparece como um bloco, com o tempo do `animar` dentro dele.",
      },
    ],
    try: [
      "No `src/cena.js`, mude o `lado` para `200`: quadrados de 1 de lado, umas 36 mil árvores, e o vento refazendo 36 mil matrizes por quadro. Veja se a página continua lisa, e depois volte para 100.",
      "Ponha o navegador em tela cheia (F11): o `redimensionar` ajusta o desenho e a proporção da câmera ao tamanho novo.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a página abre com a floresta, os lagos e o vento balançando as árvores",
      "Arrastar com o mouse gira a câmera em volta do meio da floresta, e a roda aproxima",
      "Mudar um número no `src/cena.js` e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const FLORESTA = {
  id: "floresta",
  title: "Floresta de 10 mil árvores",
  level: "intermediario",
  summary: "Morros feitos vértice por vértice e dez mil árvores numa malha só, cada uma de um tamanho e de um verde, com lagos nos vales e o vento passando por elas.",
  concepts: [
    "Geometria editada vértice por vértice",
    "Normais",
    "InstancedMesh",
    "A matriz de cada cópia",
    "Sorteio com semente",
    "Amostragem estratificada",
    "Cor por cópia em HSL",
    "Transparência",
    "Animar milhares de objetos",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Uma floresta começa pelo chão. Neste passo, o céu, a luz e um terreno ainda plano: uma placa de 200 por 200 dividida em 160 × 160 pedaços. Os pedaços não mudam nada por enquanto, mas no próximo passo cada vértice vai subir ou descer, e deles vão sair os morros. A câmera fica alta, na beira do terreno, olhando para o meio, e uma neblina da cor do céu apaga o fundo: de lá, ela vai ver a floresta inteira sumindo no horizonte.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "A cena: a raiz de uma árvore de objetos. Só o que for adicionado a ela com `cena.add` é desenhado.",
        },
        {
          code: 'cena.background = new THREE.Color("#a9cfe8");',
          text: "O céu: um azul-claro e suave, pintado atrás de tudo a cada quadro.",
        },
        {
          code: 'cena.fog = new THREE.Fog("#a9cfe8", 60, 190);',
          text: "A neblina, da cor do céu. Até 60 da câmera, não há neblina; de 60 a 190, cada ponto vai ficando da cor dela. O fundo do terreno fica a uns 200 da câmera, já todo coberto: a borda some no céu, e a floresta parece não ter fim.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);",
          text: "Uma câmera com perspectiva: 60° de campo de visão na vertical, a proporção (o visor troca o 16/9 pela dele) e as distâncias perto (0,1) e longe (400), entre as quais as coisas são desenhadas.",
        },
        {
          code: "camera.position.set(0, 28, 100);",
          text: "Na beira da frente do terreno, que vai de −100 a 100 em x e em z, e 28 acima do chão: alto o bastante para ver por cima das árvores mais perto.",
        },
        {
          code: "camera.lookAt(0, 0, 20);",
          text: "Olha para um ponto do chão um pouco à frente do meio do terreno: a vista desce uns 19° e pega da beira até o fundo.",
        },
        {
          code: 'const ceu = new THREE.HemisphereLight("#dcefff", "#4a5f35", 1.3);',
          text: "A luz do céu, que vem de todas as direções: azulada de cima e verde-oliva de baixo, a cor que o mato rebate. Ela clareia o lado dos morros e das árvores que o sol não pega.",
        },
        {
          code: 'const sol = new THREE.DirectionalLight("#fff0d0", 2.4);',
          text: "O sol: uma luz direcional, de raios paralelos, levemente amarelada e mais forte que a do céu.",
        },
        {
          code: "sol.position.set(-40, 50, 30);",
          text: "Numa luz direcional, a posição só diz de onde vêm os raios: deste ponto para a origem. É um sol 45° acima do horizonte, do lado esquerdo e um pouco à frente.",
        },
        {
          code: "const geometriaTerreno = new THREE.PlaneGeometry(200, 200, 160, 160);",
          text: "Uma placa de 200 por 200, dividida em 160 pedaços em cada direção: 161 × 161 = 25.921 vértices, com 1,25 entre um e outro. Cada pedaço é um quadrado feito de dois triângulos, 51.200 no total.",
        },
        {
          code: "geometriaTerreno.rotateX(-Math.PI / 2);",
          text: "A placa nasce em pé, de frente para o +z. O `rotateX` gira os próprios vértices −90° (−π/2) em torno do eixo x, e ela deita com a frente para cima. Na montanha-russa, o chão deitou com `chao.rotation.x`, que gira a malha e deixa os vértices como estavam; aqui, depois do giro, o y de cada vértice é a altura dele, e o próximo passo só precisa mexer no y.",
        },
        {
          code: 'const terreno = new THREE.Mesh(geometriaTerreno, new THREE.MeshStandardMaterial({ color: "#7a9a50" }));',
          text: "A malha do terreno, de um verde de mato meio amarelado, que vai aparecer entre as árvores e na beira dos lagos. O `MeshStandardMaterial` calcula a luz que chega a cada ponto.",
        },
      ],
      why: [
        {
          title: "Por que tantos pedaços numa placa plana?",
          text: "Uma placa sem divisões tem 4 vértices, um em cada canto, e com 4 pontos não se faz um morro. A forma do terreno vai sair dos vértices: cada um vai subir ou descer, e quanto mais vértices, mais detalhes cabem. Com 1,25 entre um e outro, um morro de 30 de largura ganha umas 24 fileiras de vértices, o bastante para parecer redondo. E 51.200 triângulos são pouco para a placa de vídeo.",
        },
        {
          title: "Por que a neblina?",
          text: "Sem ela, a borda do terreno apareceria como uma linha reta contra o céu, e a floresta acabaria ali. Com a neblina da cor do céu, as árvores de longe vão clareando até sumir, como numa paisagem de verdade, e não dá para ver onde o terreno termina. Ela também ajuda a perceber a distância: quanto mais clara a árvore, mais longe ela está.",
        },
      ],
      try: [
        'No material do terreno, acrescente `wireframe: true` depois da cor (`{ color: "#7a9a50", wireframe: true }`): aparecem as linhas dos triângulos, tão juntas que de longe formam uma trama. Depois tire.',
        "Mude o `190` da neblina para `400`: a borda do fundo do terreno aparece, uma linha reta contra o céu, e a conferência avisa. Depois volte para 190.",
        'Troque as duas cores `"#a9cfe8"`, a do céu e a da neblina, por `"#f4c8a8"`: um céu de fim de tarde, e o horizonte continua sumindo nele. A conferência do céu reclama, porque espera um azul. Depois volte.',
      ],
      needs: ["terreno", "sol"],
      checks: [
        {
          text: "O céu é azul-claro",
          test: ({ background }) => {
            if (!background) return check(false, "a cena não tem cor de fundo");
            if (luminance(background) < 0.5) return check(false, `o fundo é ${background}, escuro demais para um dia de sol`);
            const n = parseInt(background.slice(1), 16);
            return check((n & 255) > ((n >> 16) & 255), `o fundo é ${background}, que não é azul`);
          },
        },
        {
          text: "A neblina tem a cor do céu e apaga o fundo do terreno",
          test: ({ fog, background, camera, objects }) => {
            if (!fog) return check(false, "a cena não tem neblina: falta cena.fog");
            if (fog.color !== background) return check(false, `a neblina é ${fog.color}, e o céu é ${background}`);
            if (!camera) return check(false, "não achei a câmera do código");
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const middle = fogAt(fog, depthOf(camera, aimOf(camera) ?? CENTER));
            if (middle > 0.25) return check(false, `a neblina já cobre ${pct(middle)} do meio da floresta`);
            const covered = fogAt(fog, depthOf(camera, edgeAhead(camera, ground)));
            return check(covered >= 0.95, `a neblina cobre só ${pct(covered)} da borda do fundo do terreno: ela aparece contra o céu`);
          },
        },
        {
          text: "O terreno é uma placa deitada, grande e com muitos pedaços",
          test: ({ objects }) => {
            const terreno = objects.terreno;
            const type = terreno.geometry?.type ?? null;
            if (type !== "PlaneGeometry") return check(false, `o terreno é ${type ?? "um objeto sem geometria"}, e não uma PlaneGeometry`);
            if (axisOf(terreno, 1)[1] < 0.99) return check(false, "a placa foi deitada com terreno.rotation, que gira a malha: gire a geometria, com geometriaTerreno.rotateX, para o y dos vértices ser a altura deles no próximo passo");
            const { ground, result } = groundFor(terreno);
            if (!ground) return result;
            if (ground.front[1] < -0.99) return check(false, "o terreno está de costas: de cima, a câmera vê o verso, que não é desenhado. O giro do rotateX é −Math.PI / 2");
            if (ground.front[1] < 0.99) return check(false, `o terreno está inclinado ${fmt(angleOf(ground.front, [0, 1, 0]), 0)}°: ele precisa ficar deitado`);
            if (Math.min(ground.cols, ground.rows) < 100) return check(false, `a placa tem ${ground.cols} × ${ground.rows} pedaços: poucos vértices para os morros do próximo passo`);
            const side = Math.min(ground.width, ground.depth);
            return check(side >= 150, `o terreno tem ${fmt(side, 0)} de lado: pequeno para dez mil árvores`);
          },
        },
        {
          text: "A câmera vê o terreno do alto, da beira",
          test: ({ camera, objects }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const p = camera.worldPosition;
            if (p[1] < 12) return check(false, `a câmera está na altura ${fmt(p[1])}: baixa demais para ver a floresta por cima das árvores`);
            const aim = aimOf(camera);
            if (!aim) return check(false, "a câmera olha para o céu: o terreno fica fora da vista");
            const { bounds } = ground;
            if (aim[0] < bounds.minX || aim[0] > bounds.maxX || aim[2] < bounds.minZ || aim[2] > bounds.maxZ) return check(false, `a câmera olha para o ponto ${spot(aim)}, fora do terreno`);
            const d = dist(p, aim);
            if (d < 40) return check(false, `a câmera está a ${fmt(d, 0)} do ponto para onde olha: perto demais para ver a floresta inteira`);
            return check(d <= 150, `a câmera está a ${fmt(d, 0)} do ponto para onde olha: as árvores ficariam pequenas demais`);
          },
        },
        {
          text: "Há a luz do céu e um sol alto",
          test: ({ lights, objects }) => {
            if (!lights.some((l) => l.type === "HemisphereLight" && l.intensity > 0)) return check(false, "falta a luz do céu, a HemisphereLight");
            const sol = objects.sol;
            if (!sol.light || sol.type !== "DirectionalLight") return check(false, "o sol não é uma DirectionalLight");
            if (sol.light.intensity <= 0) return check(false, "o sol está apagado: a intensidade dele é 0");
            const rays = toward(sol.target ?? [0, 0, 0], sol.worldPosition);
            const height = deg(Math.asin(rays[1]));
            return check(height >= 30, `o sol está ${fmt(height, 0)}° acima do horizonte: baixo demais para um dia de sol`);
          },
        },
      ],
    },
    {
      id: "morros",
      title: "Os morros",
      view: "camera",
      goal:
        "Agora os morros. Cada vértice da placa tem um x e um z, o lugar dele no chão, e um y, a altura, que até aqui era 0. Uma função calcula a altura do chão em qualquer ponto somando três ondas de senos, de tamanhos diferentes, e um laço passa pelos 25.921 vértices, pondo cada um na altura do seu ponto. Os morros estão lá, mas a luz ainda não sabe deles: o terreno continua de uma cor só, e quase nada parece mudar. Para ver a diferença, ligue o wireframe do Experimente. A luz é o assunto do próximo passo.",
      lines: [
        {
          code: "function altura(x, z) {",
          text: "Uma função que recebe um ponto do chão e devolve a altura dele. Ela vai servir duas vezes: agora, para os vértices, e depois, para pôr cada árvore no chão.",
        },
        {
          code: "const grande = 3 * Math.sin(x * 0.04) * Math.cos(z * 0.05);",
          text: "A onda grande: o seno de x vezes o cosseno de z sobe e desce nas duas direções, como uma caixa de ovos. Com 0,04, a onda em x se repete a cada 157 de comprimento (2π ÷ 0,04); vezes 3, ela vai de −3 a 3.",
        },
        {
          code: "const media = 1.5 * Math.sin(x * 0.09 + 1) * Math.sin(z * 0.08);",
          text: "Uma onda mais curta e mais baixa, de −1,5 a 1,5. As frequências diferentes desencontram as duas ondas, e os morros não se repetem como as casas de um tabuleiro. O `+ 1` desloca esta onda, para ela não começar junto com a grande.",
        },
        {
          code: "const pequena = 0.6 * Math.sin(x * 0.21 + z * 0.17);",
          text: "Ondulações pequenas, de −0,6 a 0,6, na diagonal (o x e o z juntos no mesmo seno): o detalhe que tira do terreno a cara de conta.",
        },
        {
          code: "return grande + media + pequena;",
          text: "A soma das três: o chão fica entre uns −5 e 4,5.",
        },
        {
          code: "const posicoes = geometriaTerreno.attributes.position;",
          text: "O atributo de posições da geometria: os x, y e z de todos os vértices, numa lista só de números, de três em três.",
        },
        {
          code: "for (let i = 0; i < posicoes.count; i++) {",
          text: "Um laço por todos os vértices: `posicoes.count` diz quantos são, 25.921.",
        },
        {
          code: "posicoes.setY(i, altura(posicoes.getX(i), posicoes.getZ(i)));",
          text: "O `getX` e o `getZ` leem onde o vértice i está no chão, a função calcula a altura ali, e o `setY` troca o y dele. O laço roda antes do primeiro desenho, então não é preciso avisar o three.js de que as posições mudaram.",
        },
      ],
      why: [
        {
          title: "Por que somar ondas?",
          text: "Uma onda só daria morros todos iguais, enfileirados como numa caixa de ovos. Somando ondas de tamanhos e direções diferentes, o desenho demora muito para se repetir, e o terreno parece natural. É a ideia dos ruídos que os jogos usam para criar paisagens, como o ruído de Perlin, numa versão que cabe em três linhas.",
        },
        {
          title: "Por que a luz não vê os morros?",
          text: "A luz de cada ponto depende da direção para onde a superfície aponta ali, a normal, e não da altura. A PlaneGeometry guarda uma normal por vértice, todas para cima, e trocar o y não muda as normais: para a luz, o chão continua plano, e cada ponto recebe a mesma luz. Sem diferença de claro e escuro, o olho não vê o relevo.",
        },
      ],
      try: [
        "Acrescente `wireframe: true` no material do terreno: as linhas dos triângulos sobem e descem pelos morros. Depois tire.",
        "Mude o `3` da onda grande para `8`: os morros viram montanhas, e as do fundo aparecem contra o céu. Depois volte para 3.",
        "Troque o `return` da função por `return Math.random() * 2;` e ponha `wireframe: true` no material: cada vértice sorteia uma altura sem olhar os vizinhos, e as linhas viram um serrote. A conferência avisa. Depois volte.",
      ],
      needs: ["terreno"],
      checks: [
        {
          text: "O terreno tem morros e vales",
          test: ({ objects }) => hilly(objects.terreno),
        },
        {
          text: "O chão sobe e desce aos poucos",
          test: ({ objects }) => {
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const worst = steepest(ground);
            const angle = deg(Math.atan(worst.slope));
            return check(angle <= 40, `perto do ponto ${spot(worst.at)}, o chão sobe ${fmt(worst.rise)} de um vértice para o vizinho, a ${fmt(worst.run)} dele: um degrau de ${fmt(angle, 0)}°, e não um morro`);
          },
        },
      ],
    },
    {
      id: "normais",
      title: "A luz nos morros",
      view: "camera",
      goal:
        "A luz calcula o brilho de cada ponto pelo ângulo entre a superfície e o sol, e a direção da superfície vem das normais, uma por vértice, que ainda apontam todas para cima. Uma linha resolve: o `computeVertexNormals` recalcula cada normal pelos triângulos em volta do vértice, e os morros aparecem, claros do lado do sol e escuros do outro.",
      lines: [
        {
          code: "geometriaTerreno.computeVertexNormals();",
          text: "Para cada triângulo, o three.js calcula a direção perpendicular a ele, pelo produto vetorial de dois lados; a normal de cada vértice é a média das normais dos triângulos que o tocam. A linha vem depois do laço: antes dele, a conta veria a placa ainda plana.",
        },
      ],
      why: [
        {
          title: "Por que uma normal por vértice, e não por triângulo?",
          text: "Com uma normal por triângulo, cada triângulo teria uma cor só, e o terreno ficaria facetado, como um origami. Com uma por vértice, a placa de vídeo mistura as normais dos três cantos em cada ponto do triângulo, e a luz muda aos poucos: o morro parece redondo, com os mesmos triângulos.",
        },
        {
          title: "Por que o three.js não recalcula sozinho?",
          text: "Recalcular as normais é uma passada por todos os triângulos, e o three.js não tem como saber quando você terminou de mexer nos vértices. Por isso quem muda a forma avisa. A mesma ideia volta no passo do vento, com o `needsUpdate`.",
        },
      ],
      try: [
        "Ponha `flatShading: true` no material do terreno e mude os `160, 160` da placa para `30, 30`: cada triângulo usa a inclinação dele, e o terreno fica facetado, no estilo low poly. Com 160 × 160, os triângulos são pequenos demais para as facetas aparecerem de longe. Depois desfaça.",
        "Mude a posição do sol para `(40, 50, 30)`: a luz passa a vir da direita, e o lado claro dos morros troca de lado. Depois volte para (−40, 50, 30).",
      ],
      needs: ["terreno"],
      checks: [
        {
          text: "O terreno tem morros e vales",
          test: ({ objects }) => hilly(objects.terreno),
        },
        {
          text: "As normais seguem a inclinação dos morros",
          test: ({ objects }) => followsHills(objects.terreno),
        },
      ],
    },
    {
      id: "arvore",
      title: "Uma árvore",
      view: "camera",
      goal:
        "A primeira árvore, do jeito mais simples: um cilindro de tronco e um cone de copa, com 6 e 7 lados, 38 triângulos ao todo. De longe ninguém conta os lados, e com dez mil árvores cada triângulo a menos conta. As duas geometrias sobem para ficar com a base na origem: assim, a posição da árvore é o ponto do chão onde ela nasce, e a altura desse ponto sai da mesma função dos morros. Ela fica perto da câmera, mas pequena: de onde a câmera está, cabem dez mil.",
      lines: [
        {
          code: "const geometriaTronco = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);",
          text: "Um cilindro com raio 0,15 em cima e 0,2 embaixo (um tronco que afina para cima), altura 1 e 6 lados.",
        },
        {
          code: "geometriaTronco.translate(0, 0.5, 0);",
          text: "O cilindro nasce com o centro na origem, de −0,5 a 0,5 na altura. Subir os vértices 0,5 deixa a base na origem e o alto em 1: posto num ponto do chão, o tronco fica em pé em cima dele, e não com metade enterrada.",
        },
        {
          code: "const geometriaCopa = new THREE.ConeGeometry(0.9, 2.4, 7);",
          text: "Um cone de raio 0,9 na base, 2,4 de altura e 7 lados.",
        },
        {
          code: "geometriaCopa.translate(0, 2, 0);",
          text: "O cone vai de −1,2 a 1,2; subir 2 o leva para 0,8 a 3,2. A base da copa fica 0,2 abaixo do alto do tronco: sem essa sobra, apareceria uma fresta entre os dois.",
        },
        {
          code: 'const materialTronco = new THREE.MeshStandardMaterial({ color: "#6b4a2b" });',
          text: "Um marrom de casca de árvore.",
        },
        {
          code: 'const materialCopa = new THREE.MeshStandardMaterial({ color: "#4f7a3a" });',
          text: "Um verde de pinheiro. No passo 9, cada copa vai ganhar o seu verde.",
        },
        {
          code: "tronco.position.set(0, altura(0, 60), 60);",
          text: "A árvore vai para x = 0 e z = 60, entre a câmera e o meio do terreno. O y é a altura do chão ali, pela mesma função que moldou os morros: −1,68.",
        },
        {
          code: "copa.position.copy(tronco.position);",
          text: "A copa no mesmo lugar do tronco. Como cada geometria já subiu o quanto precisava, a mesma posição monta a árvore.",
        },
      ],
      why: [
        {
          title: "Por que subir as geometrias, e não as posições?",
          text: "Dava para pôr o tronco em `altura + 0,5` e a copa em `altura + 2`. Mas com a base na origem, as duas peças têm a mesma posição, e daqui a pouco a mesma matriz: a árvore inteira vai ser um lugar, um tamanho e uma inclinação. A escala vai esticar a árvore para cima, e o vento vai incliná-la pela base, como uma árvore de verdade.",
        },
        {
          title: "Por que tão poucos lados?",
          text: "O cilindro de 6 lados tem 24 triângulos, e o cone de 7, 14: são 38 por árvore, 380 mil para dez mil árvores, o que a placa de vídeo desenha com folga. Com 32 lados em cada um, seriam quase 2 milhões, e de longe ninguém veria a diferença.",
        },
      ],
      try: [
        "Apague a linha do `geometriaTronco.translate`: o tronco desce até a metade para dentro do chão, e a conferência avisa. Depois desfaça.",
        "Para ver a árvore de perto, mude a câmera para `camera.position.set(3, 1, 66)` e `camera.lookAt(0, 0, 60)`. Depois volte para (0, 28, 100) e (0, 0, 20).",
      ],
      needs: ["terreno", "tronco", "copa"],
      checks: [
        {
          text: "O tronco é um cilindro em pé, com a base no chão",
          test: ({ objects }) => {
            const tronco = objects.tronco;
            const type = tronco.geometry?.type ?? null;
            if (type !== "CylinderGeometry") return check(false, `o tronco é ${type ?? "um objeto sem geometria"}, e não uma CylinderGeometry`);
            const local = extent(tronco.geometry.sample, 1);
            if (local.min < -0.05 * local.size) {
              if (Math.abs(local.max + local.min) < 0.05 * local.size) return check(false, "metade do tronco está enterrada: o cilindro tem o centro na origem, e falta o translate da geometriaTronco");
              return check(false, `a base do tronco fica ${fmt(-local.min)} abaixo da origem dele: ela tem de ficar na origem`);
            }
            if (local.min > 0.05 * local.size) return check(false, `a base do tronco fica ${fmt(local.min)} acima da origem dele: a árvore flutua`);
            if (axisOf(tronco, 1)[1] < 0.99) return check(false, "o tronco está inclinado: a árvore tem de ficar em pé");
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const p = tronco.worldPosition;
            const h = ground.heightAt(p[0], p[2]);
            if (h == null) return check(false, `o tronco está no ponto ${spot(p)}, fora do terreno`);
            const gap = p[1] - h;
            return check(Math.abs(gap) <= GROUND_TOLERANCE, `o tronco está ${fmt(Math.abs(gap))} ${gap > 0 ? "acima" : "abaixo"} do chão: o y dele tem de ser a altura do chão ali, altura(x, z)`);
          },
        },
        {
          text: "A copa é um cone, em cima do tronco",
          test: ({ objects }) => {
            const { tronco, copa } = objects;
            const type = copa.geometry?.type ?? null;
            if (type !== "ConeGeometry") return check(false, `a copa é ${type ?? "um objeto sem geometria"}, e não uma ConeGeometry`);
            const trunk = partOf(tronco);
            const crown = partOf(copa);
            const off = Math.hypot(copa.worldPosition[0] - tronco.worldPosition[0], copa.worldPosition[2] - tronco.worldPosition[2]);
            if (off > 0.05) return check(false, `a copa está ${fmt(off)} para o lado do tronco: as duas peças têm de ficar no mesmo lugar`);
            if (crown.bottom > trunk.top + 0.001) return check(false, `há uma fresta de ${fmt(crown.bottom - trunk.top)} entre o alto do tronco e a copa`);
            if (crown.bottom < trunk.bottom) return check(false, `a copa começa ${fmt(trunk.bottom - crown.bottom)} abaixo do pé do tronco, dentro do chão: falta o translate da geometriaCopa, que a sobe`);
            if (crown.bottom < trunk.bottom + 0.3 * (trunk.top - trunk.bottom)) return check(false, "a copa cobre quase o tronco inteiro: ela tem de começar perto do alto dele");
            return check(crown.top > trunk.top, "a copa não passa do alto do tronco");
          },
        },
        {
          text: "A árvore aparece na câmera",
          test: ({ objects, camera, fog }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const [x, , z] = objects.tronco.worldPosition;
            const middle = [x, (partOf(objects.tronco).bottom + partOf(objects.copa).top) / 2, z];
            if (!inView(camera, middle)) return check(false, "a árvore fica fora da vista da câmera");
            const covered = fog ? fogAt(fog, depthOf(camera, middle)) : 0;
            return check(covered <= 0.3, `a neblina cobre ${pct(covered)} da árvore: ela está longe demais`);
          },
        },
      ],
    },
    {
      id: "cem",
      title: "Cem árvores",
      view: "camera",
      goal:
        "Cem árvores, cada uma num ponto sorteado do terreno. O laço cria um tronco e uma copa por volta, todos com a mesma geometria e o mesmo material, cada um com a sua posição. O sorteio sai de uma função com semente: os números parecem aleatórios, mas saem sempre os mesmos, e a floresta não muda de lugar a cada letra que você digita.",
      lines: [
        {
          code: "let semente = 7;",
          text: "A semente: o número de onde a sequência parte. Cada semente dá uma sequência diferente, e sempre a mesma.",
        },
        {
          code: "semente = (semente * 16807) % 2147483647;",
          text: "O passo do sorteio: multiplica pela constante 16.807 e fica com o resto da divisão por 2.147.483.647 (2³¹ − 1, um número primo). O resultado salta de um jeito que parece aleatório por quase todos os números até lá, antes de se repetir. É o gerador de Park e Miller, de 1988, um dos mais simples que funcionam bem.",
        },
        {
          code: "return (semente - 1) / 2147483646;",
          text: "Divide para o número caber entre 0 e 1, como o do `Math.random()`.",
        },
        {
          code: "for (let i = 0; i < 100; i++) {",
          text: "Cem voltas, uma árvore por volta.",
        },
        {
          code: "const x = (sorteio() - 0.5) * 200;",
          text: "Um número de 0 a 1, menos 0,5, vezes 200: de −100 a 100, de uma borda do terreno à outra. A linha de baixo faz o mesmo para o z.",
        },
        {
          code: "const tronco = new THREE.Mesh(geometriaTronco, materialTronco);",
          text: "Uma malha nova a cada volta, mas com a geometria e o material de antes: os vértices do tronco ficam na memória uma vez só, divididos pelas cem malhas.",
        },
        {
          code: "tronco.position.set(x, altura(x, z), z);",
          text: "O ponto sorteado, na altura do chão ali.",
        },
      ],
      why: [
        {
          title: "Por que não Math.random()?",
          text: "O VisuGraph roda o código de novo a cada mudança. Com o `Math.random()`, as cem árvores pulariam para outros lugares a cada letra digitada. A cidade resolveu isso com uma conta de seno do número da quadra; aqui, cada árvore vai pedir vários números (onde, de que tamanho, de que verde), e um gerador com semente é mais simples: cada chamada dá o próximo número da sequência.",
        },
        {
          title: "Por que não fazer logo dez mil assim?",
          text: "Cada malha é uma chamada de desenho: a cada quadro, o three.js avisa a placa de vídeo qual geometria, qual material e qual matriz usar, uma malha de cada vez. Duzentas malhas é pouco. Vinte mil (dez mil troncos e dez mil copas) deixariam o processador ocupado só com esses avisos, e a página travaria. O próximo passo resolve isso.",
        },
      ],
      try: [
        "Mude a semente para `8`: sai outra floresta, que também não muda mais. Depois volte para 7.",
        "Mude o `100` do laço para `1000`: mil árvores, duas mil malhas, e o visor já pode ficar mais lento para girar com o mouse. Depois volte para 100.",
      ],
      needs: ["terreno", "tronco", "copa"],
      checks: [
        {
          text: "Há pelo menos cem árvores, cada uma com tronco e copa",
          test: ({ objects }) => {
            const trunks = all(objects.tronco);
            const crowns = all(objects.copa);
            if (trunks.length !== crowns.length) return check(false, `há ${int(trunks.length)} troncos e ${int(crowns.length)} copas`);
            if (trunks.length < 100) return check(false, `há ${int(trunks.length)} ${trunks.length === 1 ? "árvore" : "árvores"}: poucas para uma floresta`);
            const loose = trunks.findIndex((t, i) => dist(t.worldPosition, crowns[i].worldPosition) > 0.01);
            return check(loose < 0, `a copa da árvore ${loose + 1} está a ${fmt(loose < 0 ? 0 : dist(trunks[loose].worldPosition, crowns[loose].worldPosition))} do tronco dela`);
          },
        },
        {
          text: "As árvores estão em pé no chão",
          test: ({ objects }) => onGround(all(objects.tronco).map((t) => t.worldPosition), objects.terreno),
        },
        {
          text: "As árvores se espalham pelo terreno",
          test: ({ objects }) => spreadOut(all(objects.tronco).map((t) => t.worldPosition), objects.terreno),
        },
        {
          text: "Os troncos dividem uma geometria, e as copas, outra",
          test: ({ objects }) => {
            for (const [name, label] of [
              ["tronco", "de tronco"],
              ["copa", "de copa"],
            ]) {
              const n = new Set(all(objects[name]).map((o) => o.geometry?.uuid)).size;
              if (n > 1) return check(false, `${n} geometrias ${label} diferentes: uma por volta do laço`);
            }
            return check(true);
          },
        },
      ],
    },
    {
      id: "instancias",
      title: "Dez mil árvores numa malha só",
      view: "camera",
      goal:
        "Dez mil árvores, com duas chamadas de desenho por quadro. A `InstancedMesh` é uma malha com muitas cópias: uma geometria, um material e uma lista de matrizes, uma por cópia, que vão juntas para a placa de vídeo, e ela desenha todas de uma vez, cada uma onde a sua matriz manda. Uma malha guarda os troncos, outra as copas, e as duas recebem a mesma matriz para cada árvore. As cem malhas do passo anterior saem.",
      lines: [
        {
          code: "const quantas = 10000;",
          text: "Quantas árvores: dez mil.",
        },
        {
          code: "const troncos = new THREE.InstancedMesh(geometriaTronco, materialTronco, quantas);",
          text: "Uma malha com dez mil cópias do tronco: a geometria, o material e quantas cópias. O three.js reserva lugar para dez mil matrizes, de 16 números cada, e começa todas com a matriz identidade, que deixa a cópia na origem, do tamanho da geometria.",
        },
        {
          code: "const molde = new THREE.Object3D();",
          text: "Um objeto que nunca vai para a cena: ele só serve para montar matrizes. Dá para escrever os 16 números de cada matriz à mão, mas com o molde basta dar a posição, a rotação e a escala, como em qualquer objeto.",
        },
        {
          code: "molde.position.set(x, altura(x, z), z);",
          text: "O molde vai para o ponto sorteado, na altura do chão.",
        },
        {
          code: "molde.updateMatrix();",
          text: "Junta a posição, a rotação e a escala do molde numa matriz 4 × 4, a `molde.matrix`. Num objeto da cena, o three.js faz essa conta sozinho antes de desenhar; o molde não está na cena, então a conta é pedida à mão.",
        },
        {
          code: "troncos.setMatrixAt(i, molde.matrix);",
          text: "Copia a matriz para a cópia i dos troncos. A linha de baixo copia a mesma matriz para a copa i: o tronco e a copa da mesma árvore ficam juntos.",
        },
        {
          code: "cena.add(troncos);",
          text: "Duas malhas na cena, com dez mil cópias cada.",
        },
      ],
      why: [
        {
          title: "Por que a InstancedMesh é tão mais rápida?",
          text: "O caro não é desenhar triângulos, que a placa de vídeo faz aos milhões, e sim preparar cada desenho: escolher a geometria e o material, mandar a matriz. Com malhas separadas, isso acontece 20 mil vezes por quadro. Com a InstancedMesh, duas vezes: as dez mil matrizes já estão na placa de vídeo, e ela mesma repete o tronco para cada uma.",
        },
        {
          title: "O que todas as cópias dividem?",
          text: "Todas as cópias têm a mesma geometria e o mesmo material: não dá para uma ser cone e outra esfera, nem uma de metal e outra de madeira. Por isso a árvore virou duas malhas, uma por geometria. O que muda de uma cópia para outra é a matriz (o lugar, a rotação e o tamanho) e, no passo 9, a cor.",
        },
      ],
      try: [
        "Mude o `quantas` para `50000`: cinco vezes mais árvores, e continuam sendo duas chamadas de desenho. Os triângulos passam de 1,9 milhão, e a placa de vídeo dá conta deles. Depois volte para 10000.",
        "Ponha `//` no começo da linha `copas.setMatrixAt`: as dez mil copas ficam com a matriz identidade, todas juntas no meio do terreno, e sobra uma floresta de troncos. A conferência avisa. Depois tire o //.",
      ],
      needs: ["terreno", "troncos", "copas"],
      checks: [
        {
          text: "Os troncos e as copas são duas InstancedMesh, com 10 mil cópias cada",
          test: ({ objects }) => {
            const kind = instanced(objects);
            if (!kind.ok) return kind;
            const few = ["troncos", "copas"].find((name) => (objects[name].instances ?? 0) < 10000);
            return check(!few, `${few === "troncos" ? "os troncos têm" : "as copas têm"} ${int(objects[few]?.instances ?? 0)} cópias: poucas para dez mil árvores`);
          },
        },
        {
          text: "Cada copa fica em cima do seu tronco",
          test: ({ objects }) => paired(objects),
        },
        {
          text: "As árvores estão em pé no chão",
          test: ({ objects }) => onGround(placesOf(objects.troncos), objects.terreno),
        },
        {
          text: "As árvores se espalham pelo terreno inteiro",
          test: ({ objects }) => spreadOut(placesOf(objects.troncos), objects.terreno),
        },
      ],
    },
    {
      id: "grade",
      title: "Uma em cada quadrado",
      view: "camera",
      goal:
        "Olhe as árvores sorteadas: em uns lugares elas se amontoam, em outros abrem clareiras. Num sorteio solto, cada árvore cai onde calhar, sem saber das outras, e uma floresta de verdade é mais regular, porque as árvores disputam a luz e o espaço. O truque é dividir o terreno numa grade de 100 × 100 quadrados, de 2 de lado, e sortear um ponto dentro de cada quadrado: o sorteio ainda desfaz as fileiras, mas nenhum quadrado fica vazio, e nenhum fica com duas árvores.",
      lines: [
        {
          code: "const lado = 100;",
          text: "100 quadrados em cada direção: 100 × 100, dez mil árvores, como antes.",
        },
        {
          code: "const passo = 200 / lado;",
          text: "O lado de cada quadrado: os 200 do terreno divididos em 100, 2.",
        },
        {
          code: "let n = 0;",
          text: "Um contador de árvores plantadas, que é também o índice da próxima cópia: a primeira árvore vai na cópia 0, a segunda na 1. Por enquanto, ele anda junto com os laços; no passo dos lagos, algumas voltas vão pular a árvore, e aí o contador faz falta.",
        },
        {
          code: "for (let linha = 0; linha < lado; linha++) {",
          text: "Dois laços, um dentro do outro: as linhas da grade, em z, e, em cada linha, as colunas, em x. O de dentro roda 100 vezes para cada volta do de fora: 10 mil voltas.",
        },
        {
          code: "const x = -100 + (coluna + sorteio()) * passo;",
          text: "A coluna mais um número de 0 a 1 é um ponto sorteado dentro da coluna; vezes o passo, ele vai para as unidades da cena; e o −100 o leva para a borda do terreno. A coluna 0 vai de −100 a −98, e a 99, de 98 a 100. A linha de baixo faz o mesmo com a linha da grade, em z.",
        },
        {
          code: "const y = altura(x, z);",
          text: "A altura do chão no ponto sorteado, guardada numa variável: no passo dos lagos, ela vai decidir se ali cabe uma árvore.",
        },
        {
          code: "n++;",
          text: "Mais uma árvore plantada.",
        },
      ],
      why: [
        {
          title: "Por que o sorteio solto faz clareiras?",
          text: "Com dez mil árvores para dez mil quadrados, cada quadrado recebe, em média, uma. Mas num sorteio solto, cada árvore escolhe o lugar sem saber das outras, e a probabilidade diz que uns 37% dos quadrados ficam vazios (1/e, com e = 2,718…), enquanto outros recebem duas, três ou quatro árvores. É o mesmo motivo de as gotas de chuva não caírem em fileiras.",
        },
        {
          title: "Por que não uma grade certinha?",
          text: "Com uma árvore no meio de cada quadrado, a floresta vira uma plantação, e as fileiras aparecem de longe, em linhas retas. O sorteio dentro do quadrado desfaz as linhas e mantém a distância entre as árvores mais ou menos igual. Os gráficos chamam isso de amostragem estratificada (em inglês, jittering), e o mesmo truque espalha os raios de luz dentro de cada pixel num renderizador de fotos.",
        },
      ],
      try: [
        "Troque os dois `sorteio()` dos laços por `0.5`: cada árvore vai para o meio do seu quadrado, e a floresta vira uma plantação, com fileiras retas. Depois volte.",
        "Mude o `lado` para `60`: 3.600 árvores, em quadrados de 3,3, e a floresta fica rala. Depois volte para 100.",
      ],
      needs: ["terreno", "troncos", "copas"],
      checks: [
        {
          text: "Há uma árvore em cada quadrado de 2 × 2",
          test: ({ objects }) => {
            const points = placesOf(objects.troncos);
            const spread = spreadOut(points, objects.terreno);
            if (!spread.ok) return spread;
            const { ground } = groundFor(objects.terreno);
            const k = Math.round(Math.sqrt(points.length));
            if (k < 10) return check(false, `há ${int(points.length)} árvores: poucas para uma grade`);
            const [sx, sz] = [ground.width / k, ground.depth / k];
            const counts = new Int32Array(k * k);
            for (const p of points) {
              const cx = Math.floor((p[0] - ground.bounds.minX) / sx);
              const cz = Math.floor((p[2] - ground.bounds.minZ) / sz);
              if (cx >= 0 && cz >= 0 && cx < k && cz < k) counts[cz * k + cx]++;
            }
            let empty = 0;
            let crowded = 0;
            for (const n of counts) {
              if (n === 0) empty++;
              else if (n > 1) crowded++;
            }
            const [fe, fc] = [empty / counts.length, crowded / counts.length];
            return check(fe <= 0.02 && fc <= 0.02, `${pct(fe)} dos quadrados de ${size(sx)} × ${size(sz)} estão vazios, e ${pct(fc)} têm duas árvores ou mais: o sorteio solto faz clareiras e bolos`);
          },
        },
        {
          text: "As árvores estão em pé no chão, dentro do terreno",
          test: ({ objects }) => onGround(placesOf(objects.troncos), objects.terreno),
        },
        {
          text: "Cada copa fica em cima do seu tronco",
          test: ({ objects }) => paired(objects),
        },
      ],
    },
    {
      id: "tamanhos",
      title: "Cada árvore de um tamanho",
      view: "camera",
      goal:
        "Dez mil árvores iguais denunciam o computador: na natureza, nenhuma tem o tamanho da vizinha. A escala do molde muda o tamanho de cada cópia: uma largura sorteada para x e z, os dois lados do chão, e uma altura sorteada à parte, para y. Umas ficam baixas e largas, outras altas e finas. E como as geometrias têm a base na origem, a escala estica a árvore para cima, sem tirar o pé dela do chão.",
      lines: [
        {
          code: "const largura = 0.7 + sorteio() * 0.6;",
          text: "De 0,7 a 1,3: a árvore mais larga tem quase o dobro da largura da mais fina.",
        },
        {
          code: "const alto = 0.7 + sorteio() * 0.8;",
          text: "De 0,7 a 1,5, sorteada à parte da largura: a altura não depende da largura, e a proporção de cada árvore também muda.",
        },
        {
          code: "molde.scale.set(largura, alto, largura);",
          text: "A mesma largura em x e em z, para o tronco e a copa continuarem redondos vistos de cima, e a altura em y. A escala vai para a matriz, junto com a posição.",
        },
      ],
      why: [
        {
          title: "Por que a árvore não afunda quando cresce?",
          text: "A escala estica tudo a partir da origem do objeto. Como o tronco e a copa passaram pelo `translate` e têm a base na origem, a base fica parada e o resto cresce para cima. Se o tronco tivesse o centro na origem, metade do que ele cresce iria para baixo do chão: é o motivo do `translate` do passo 4.",
        },
        {
          title: "Os sorteios a mais mudam a floresta?",
          text: "Mudam: o gerador dá uma sequência só, e agora cada árvore gasta quatro números em vez de dois. A primeira árvore continua com os dois primeiros, mas a segunda já recebe outros. As árvores trocam de lugar dentro dos quadrados, e a floresta continua a mesma cada vez que o código roda.",
        },
      ],
      try: [
        "Na escala, troque o `alto` por `largura`: as árvores mudam de tamanho, mas todas com a mesma proporção, como cópias ampliadas umas das outras. A conferência avisa. Depois desfaça.",
        "Mude o `0.8` da altura para `2.5`: algumas árvores passam do dobro da altura das outras, como pinheiros velhos no meio da mata. Depois volte para 0.8.",
      ],
      needs: ["terreno", "troncos", "copas"],
      checks: [
        {
          text: "As árvores têm alturas diferentes",
          test: ({ objects }) => {
            const top = extent(objects.copas.geometry?.sample ?? [[0, 1, 0]], 1).max;
            const heights = scalesOf(objects.troncos).map((s) => s[1] * top);
            const [low, high] = [quantile(heights, 0.1), quantile(heights, 0.9)];
            if (high - low < 1e-6) return check(false, `as árvores têm todas a mesma altura: ${fmt(low)}`);
            return check(high >= 1.25 * low, `as alturas mudam pouco: 80% das árvores têm de ${fmt(low)} a ${fmt(high)}`);
          },
        },
        {
          text: "As larguras também mudam, e a proporção muda de uma árvore para outra",
          test: ({ objects }) => {
            const scales = scalesOf(objects.troncos);
            const widths = scales.map((s) => s[0]);
            if (quantile(widths, 0.9) < 1.15 * quantile(widths, 0.1)) return check(false, "as árvores têm quase todas a mesma largura");
            const ratios = scales.map((s) => s[1] / s[0]);
            return check(quantile(ratios, 0.9) >= 1.15 * quantile(ratios, 0.1), "a altura cresce junto com a largura: as árvores são cópias ampliadas umas das outras. Sorteie as duas separadas");
          },
        },
        {
          text: "Vistas de cima, as árvores continuam redondas",
          test: ({ objects }) => {
            const flat = scalesOf(objects.troncos).filter(([x, , z]) => Math.abs(x - z) > 0.01 * Math.max(x, z)).length;
            return check(flat === 0, "há árvores achatadas: a escala em x e em z tem de ser a mesma, a largura");
          },
        },
        {
          text: "As árvores continuam em pé, com o pé no chão",
          test: ({ objects }) => {
            const tilt = Math.max(...tiltsOf(objects.troncos));
            if (tilt > 1) return check(false, `há árvores inclinadas, até ${fmt(tilt, 0)}°: o molde não gira neste passo`);
            const ground = onGround(placesOf(objects.troncos), objects.terreno);
            return ground.ok ? paired(objects) : ground;
          },
        },
      ],
    },
    {
      id: "cores",
      title: "Um verde para cada copa",
      view: "camera",
      goal:
        "Agora as cores. A `InstancedMesh` aceita uma cor por cópia, com o `setColorAt`, e a cor de cada copa sai de um sorteio em HSL: o matiz anda um pouco entre o verde-amarelado e o verde, e a luminosidade, entre um verde mais fechado e um mais claro. A cor da cópia multiplica a do material, então o material das copas fica branco: branco vezes uma cor é a própria cor.",
      lines: [
        {
          code: 'const materialCopa = new THREE.MeshStandardMaterial({ color: "#ffffff" });',
          text: "O material das copas agora é branco. A cor de cada cópia multiplica a do material, canal por canal: com o verde de antes, cada verde sorteado sairia escurecido.",
        },
        {
          code: "const cor = new THREE.Color();",
          text: "Uma cor reaproveitada em todas as voltas, como o molde: o `setColorAt` copia os números dela para a lista de cores da malha.",
        },
        {
          code: "cor.setHSL(0.25 + sorteio() * 0.1, 0.5, 0.22 + sorteio() * 0.15);",
          text: "HSL descreve a cor por matiz, saturação e luminosidade, de 0 a 1. O matiz dá a volta nas cores: 0 é o vermelho, e a volta passa pelo amarelo, pelo verde e pelo azul até voltar ao vermelho; de 0,25 a 0,35, fica entre o verde-amarelado e o verde. A saturação 0,5 é uma cor nem viva nem cinza, e a luminosidade vai de 0,22 a 0,37.",
        },
        {
          code: "copas.setColorAt(n, cor);",
          text: "A cor da copa n. Na primeira chamada, o three.js cria a lista de cores da malha, com lugar para as dez mil.",
        },
      ],
      why: [
        {
          title: "Por que sortear em HSL, e não em RGB?",
          text: "Em RGB, para variar um verde é preciso mexer nos três canais juntos, na proporção certa, senão sai um cinza ou um roxo. Em HSL, cada número tem um sentido só: o matiz decide que verde, e a luminosidade, se ele é mais claro ou mais escuro. Sortear dois números em faixas estreitas dá sempre um verde.",
        },
        {
          title: "Por que os troncos não ganham cor?",
          text: "A malha dos troncos não tem lista de cores e usa a cor do material para todos, o marrom. De longe, quase não se vê tronco, e mil tons de marrom não fariam diferença.",
        },
      ],
      try: [
        "Mude o matiz para `0.03 + sorteio() * 0.1`: as copas ficam alaranjadas e avermelhadas, uma floresta de outono, e a conferência do verde reclama. Depois volte para 0.25.",
        'Volte o material das copas para `"#4f7a3a"`: as cores sorteadas saem todas escuras, multiplicadas pelo verde. A conferência avisa. Depois volte para branco.',
      ],
      needs: ["terreno", "troncos", "copas"],
      checks: [
        {
          text: "Cada copa tem a sua cor",
          test: ({ objects }) => {
            const colors = objects.copas.instanced?.colors;
            if (!colors) return check(false, "as copas não têm cor por cópia: falta copas.setColorAt");
            const hsl = colors.map(hslOf);
            const light = hsl.map((c) => c.l);
            const hue = hsl.map((c) => c.h);
            const varied = quantile(light, 0.9) - quantile(light, 0.1) >= 0.04 || quantile(hue, 0.9) - quantile(hue, 0.1) >= 6;
            return check(varied, "as copas têm todas a mesma cor");
          },
        },
        {
          text: "As copas são verdes",
          test: ({ objects }) => {
            const colors = objects.copas.instanced?.colors;
            if (!colors) return check(false, "as copas não têm cor por cópia: falta copas.setColorAt");
            const hsl = colors.map(hslOf);
            const green = hsl.filter((c) => hueName(c) === "verde").length / hsl.length;
            if (green >= 0.9) return check(true);
            const middle = { h: quantile(hsl.map((c) => c.h), 0.5), s: quantile(hsl.map((c) => c.s), 0.5) };
            return check(false, `${green < 0.005 ? "as copas não são verdes" : `só ${pct(green)} das copas são verdes`}: a maioria é ${hueName(middle)}`);
          },
        },
        {
          text: "O material das copas é branco",
          test: ({ objects }) => {
            const hex = objects.copas.material?.hex;
            if (!hex) return check(false, "não achei a cor do material das copas");
            return check(luminance(hex) >= 0.95, `o material das copas é ${hex}: a cor de cada cópia multiplica a dele, e as copas saem escurecidas`);
          },
        },
      ],
    },
    {
      id: "lagos",
      title: "Os lagos",
      view: "camera",
      goal:
        "Os vales mais fundos viram lagos. A água é uma placa só, do tamanho do terreno, numa altura fixa: onde o chão fica abaixo dela, aparece a água; onde fica acima, o chão a esconde. As árvores do fundo dos vales ficariam submersas, então o laço pula os pontos abaixo da água, e no fim as duas malhas ficam sabendo quantas árvores foram plantadas de verdade: quase 9 mil.",
      lines: [
        {
          code: "const nivelDaAgua = -2.4;",
          text: "A altura da água. O chão vai de uns −5 a 4,5, e só o fundo dos vales mais fundos fica abaixo de −2,4: uns 7% do terreno.",
        },
        {
          code: "new THREE.PlaneGeometry(200, 200),",
          text: "Uma placa do tamanho do terreno, sem divisões: a água é plana, e os 4 cantos bastam.",
        },
        {
          code: 'new THREE.MeshStandardMaterial({ color: "#4f8fc0", transparent: true, opacity: 0.85, roughness: 0.2 })',
          text: "Azul e um pouco transparente: com `opacity` 0,85, passa 15% do que está atrás, e o fundo do lago aparece de leve. O `roughness` 0,2 deixa a superfície lisa, e o reflexo do sol brilha na água.",
        },
        {
          code: "agua.rotation.x = -Math.PI / 2;",
          text: "Deitada, desta vez girando a malha: a água não tem vértices para mexer depois, então tanto faz girar a malha ou a geometria.",
        },
        {
          code: "if (y < nivelDaAgua + 0.3) continue;",
          text: "Se o chão ali fica abaixo da água, ou menos de 0,3 acima dela, o `continue` pula o resto da volta: nem matriz, nem `n++`. A margem de 0,3 deixa uma beira sem árvores em volta de cada lago.",
        },
        {
          code: "troncos.count = n;",
          text: "As malhas foram criadas com lugar para dez mil cópias, mas só as `n` primeiras ganharam matriz. O `count` diz quantas desenhar. Sem ele, as que sobraram iriam para o desenho com a matriz identidade, todas empilhadas na origem, no meio do terreno.",
        },
      ],
      why: [
        {
          title: "Por que uma placa só para todos os lagos?",
          text: "Cada lago poderia ser uma forma recortada no contorno dele, mas esse contorno é difícil de calcular. A placa plana resolve sozinha: em cada pixel, a placa de vídeo desenha o que estiver mais perto da câmera (o teste de profundidade). Onde o chão passa por cima da água, ele cobre a placa; onde fica embaixo, a água aparece, e a margem fica exatamente onde os dois se cruzam.",
        },
        {
          title: "Por que a transparência pede cuidado?",
          text: "Um objeto transparente mistura a cor dele com a do que já foi desenhado atrás. Por isso, o three.js desenha primeiro os opacos e só depois os transparentes, do mais longe para o mais perto. Com uma placa só, isso funciona bem; com muitos objetos transparentes se cruzando, a ordem nem sempre dá certo, e pedaços de um somem atrás do outro.",
        },
      ],
      try: [
        "Mude o `nivelDaAgua` para `0`: metade do terreno fica embaixo d'água, e a floresta fica nas ilhas e nos morros. A conferência avisa que isso já é um mar. Depois volte para −2,4.",
        "Apague as duas linhas do `count`: as árvores que o laço pulou vão todas para o mesmo ponto, a origem, uma dentro da outra, e parecem uma só. A conferência avisa. Depois desfaça.",
      ],
      needs: ["terreno", "troncos", "copas", "agua"],
      checks: [
        {
          text: "A água é uma placa azul, deitada e um pouco transparente",
          test: ({ objects }) => {
            const agua = objects.agua;
            const type = agua.geometry?.type ?? null;
            if (type !== "PlaneGeometry") return check(false, `a água é ${type ?? "um objeto sem geometria"}, e não uma PlaneGeometry`);
            const up = plateFront(agua)[1];
            if (up < -0.99) return check(false, "a água está de costas: de cima, a câmera vê o verso, que não é desenhado");
            if (up < 0.99) return check(false, `a água está inclinada ${fmt(deg(Math.acos(Math.max(-1, Math.min(1, up)))), 0)}°: ela precisa ficar deitada`);
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const side = agua.box ? Math.min(agua.box.max[0] - agua.box.min[0], agua.box.max[2] - agua.box.min[2]) : 0;
            if (side < 0.9 * Math.min(ground.width, ground.depth)) return check(false, `a água tem ${fmt(side, 0)} de lado, e o terreno, ${fmt(Math.min(ground.width, ground.depth), 0)}: os vales fora dela ficam secos`);
            const hex = agua.material?.hex ?? "#000000";
            const color = hslOf([0, 2, 4].map((k) => parseInt(hex.slice(1 + k, 3 + k), 16) / 255));
            if (hueName(color) !== "azul") return check(false, `a água é ${hex}, que não é azul`);
            if (!agua.material.transparent) return check(false, "a água não é transparente: falta transparent: true no material");
            if (agua.material.opacity >= 1) return check(false, "a água tem opacity 1: com ela, nada do fundo aparece");
            return check(agua.material.opacity >= 0.4, `a água tem opacity ${fmt(agua.material.opacity)}: quase não aparece`);
          },
        },
        {
          text: "A água cobre só o fundo dos vales",
          test: ({ objects }) => {
            const { ground, result } = groundFor(objects.terreno);
            if (!ground) return result;
            const level = levelOf(objects.agua);
            let below = 0;
            for (const y of ground.ys) if (y < level) below++;
            const f = below / ground.ys.length;
            if (f === 0) return check(false, `a água, na altura ${fmt(level)}, fica abaixo do vale mais fundo, que chega a ${fmt(ground.minY)}: nenhum lago aparece`);
            if (f < 0.02) return check(false, `a água cobre só ${pct(f)} do terreno: os lagos quase não aparecem`);
            return check(f <= 0.3, `a água cobre ${pct(f)} do terreno: um mar, e não lagos`);
          },
        },
        {
          text: "Nenhuma árvore fica dentro d'água",
          test: ({ objects }) => {
            const level = levelOf(objects.agua);
            const wet = placesOf(objects.troncos).filter((p) => p[1] < level + 0.05).length;
            return check(wet === 0, `${treesAre(wet)} dentro d'água: falta o continue que pula os pontos abaixo do nível da água`);
          },
        },
        {
          text: "Só as árvores plantadas são desenhadas",
          test: ({ objects }) => {
            const { troncos, copas } = objects;
            if (troncos.instances !== copas.instances) {
              const name = troncos.instances > copas.instances ? "troncos" : "copas";
              return check(false, `a malha dos troncos desenha ${int(troncos.instances)} cópias, e a das copas, ${int(copas.instances)}: falta ${name}.count = n`);
            }
            const stray = atOrigin(troncos);
            return check(stray <= 1, `${int(stray)} árvores estão todas no mesmo ponto, a origem: são as cópias que o laço pulou, com a matriz de quando a malha foi criada. Faltam troncos.count = n e copas.count = n`);
          },
        },
      ],
    },
    {
      id: "vento",
      title: "O vento",
      view: "camera",
      motion: true,
      goal:
        "Por último, o vento. A cada quadro, a função `animar` refaz a matriz de cada árvore com uma pequena inclinação, que vai e volta com o tempo. O ângulo depende também do x da árvore: as de um lado balançam antes das do outro, e a inclinação atravessa a floresta numa onda. As matrizes mudam na lista do three.js, e um aviso, o `needsUpdate`, manda a lista nova para a placa de vídeo. A conferência olha as árvores balançarem por uns segundos antes de dizer se o vento vai bem.",
      lines: [
        {
          code: "const arvores = [];",
          text: "Uma lista com o lugar e o tamanho de cada árvore plantada. A animação precisa deles para refazer as matrizes, e sortear de novo daria outros números.",
        },
        {
          code: "arvores.push({ x, y, z, largura, alto });",
          text: "Guarda a árvore na lista, na mesma ordem das cópias: `arvores[i]` é a cópia i das duas malhas. `{ x, y, z }` é um atalho para `{ x: x, y: y, z: z }`.",
        },
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama `animar` a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou.",
        },
        {
          code: "for (let i = 0; i < arvores.length; i++) {",
          text: "Uma volta por árvore plantada: quase 9 mil por quadro.",
        },
        {
          code: "molde.position.set(arvore.x, arvore.y, arvore.z);",
          text: "O molde volta ao lugar da árvore i, e a linha de baixo, ao tamanho dela. Os dois nunca mudam, mas o molde é um só para todas as árvores, e guarda o que a árvore anterior deixou.",
        },
        {
          code: "molde.rotation.z = Math.sin(tempo * 1.5 - arvore.x * 0.1) * 0.06;",
          text: "A inclinação: um giro em torno do z, que deita a árvore para um lado do x. O seno vai e volta de −1 a 1; vezes 0,06 (radianos), são até 3,4° para cada lado. O `tempo * 1.5` faz cada árvore ir e voltar a cada 4,2 segundos (2π ÷ 1,5), e o `- arvore.x * 0.1` atrasa as árvores conforme o x: a mesma inclinação chega 10 unidades adiante 0,67 s depois (0,1 × 10 ÷ 1,5). É a onda do vento atravessando a floresta.",
        },
        {
          code: "troncos.setMatrixAt(i, molde.matrix);",
          text: "A matriz nova vai para a cópia i das duas malhas, como no laço que plantou as árvores.",
        },
        {
          code: "troncos.instanceMatrix.needsUpdate = true;",
          text: "As matrizes mudaram na lista do three.js, mas a placa de vídeo guarda a cópia dela, mandada no primeiro desenho. O `needsUpdate` avisa que a lista mudou, e o three.js manda tudo de novo no próximo desenho: as matrizes das duas malhas, a cada quadro.",
        },
      ],
      why: [
        {
          title: "Por que o vento inclina a árvore pela base?",
          text: "A rotação gira em torno da origem do objeto, e a origem das duas geometrias está na base do tronco, desde o passo 4. Por isso a árvore se inclina presa ao chão, como uma de verdade. Com o centro do tronco na origem, ela giraria pelo meio, e o pé sairia do chão.",
        },
        {
          title: "Dá para fazer isso sem refazer 9 mil matrizes por quadro?",
          text: "Dá, e é o jeito dos jogos: um shader de vértices pode inclinar cada árvore direto na placa de vídeo, que tem milhares de núcleos fazendo a conta ao mesmo tempo, sem mandar nada a cada quadro. Aqui, 9 mil matrizes por quadro ainda cabem com folga no processador. O projeto do mar, no nível avançado, move uma superfície inteira assim, num shader.",
        },
      ],
      try: [
        "Apague as duas linhas do `needsUpdate`: as matrizes continuam mudando na lista, mas a placa de vídeo não fica sabendo, e a floresta para. A conferência avisa. Depois desfaça.",
        "Tire o `- arvore.x * 0.1`: todas as árvores balançam juntas, como um bloco, e a conferência avisa. Depois desfaça.",
        "Mude o `0.06` para `0.3`: um vendaval, com as árvores deitando até 17°, e a conferência avisa. Depois volte para 0.06.",
      ],
      needs: ["terreno", "troncos", "copas"],
      checks: [
        {
          text: "As árvores balançam com o vento",
          test: (facts) => {
            const pending = calm(facts);
            if (pending) return pending;
            const { objects, recorded } = facts;
            if (recorded < 1) return wait("esperando o vento soprar");
            for (const name of ["troncos", "copas"]) {
              const obj = objects[name];
              if (!(obj.trail?.length >= 2)) continue;
              if ((obj.instanced?.version ?? 0) < 5 * recorded) return check(false, `as matrizes ${name === "troncos" ? "dos troncos" : "das copas"} mudam, mas a placa de vídeo não fica sabendo: falta ${name}.instanceMatrix.needsUpdate = true`);
            }
            return check(true);
          },
        },
        {
          text: "As árvores se inclinam pouco, como num vento forte",
          test: (facts) => {
            const pending = calm(facts);
            if (pending) return pending;
            const tilt = Math.max(...tiltsOf(swaying(facts.objects)));
            if (tilt < 0.5) return check(false, `as árvores se inclinam só ${fmt(tilt, 1)}°: ninguém vê o vento`);
            return check(tilt <= 10, `as árvores se inclinam até ${fmt(tilt, 0)}°: é um vendaval`);
          },
        },
        {
          text: "O vento passa como uma onda, e não em todas juntas",
          test: (facts) => {
            const pending = calm(facts);
            if (pending) return pending;
            const ups = instanceMatrices(swaying(facts.objects)).map((m) => unit(columnOf(m, 1)));
            const mean = unit([0, 1, 2].map((k) => ups.reduce((s, u) => s + u[k], 0)));
            const spread = ups.reduce((s, u) => s + angleOf(u, mean), 0) / ups.length;
            return check(spread >= 0.3, "todas as árvores se inclinam juntas, como um bloco: o ângulo tem de depender também do lugar da árvore");
          },
        },
        {
          text: "Cada árvore balança inteira, no lugar e do tamanho dela",
          test: (facts) => {
            const pending = calm(facts);
            if (pending) return pending;
            const { objects } = facts;
            const [trunks, crowns] = [objects.troncos.trail?.length >= 2, objects.copas.trail?.length >= 2];
            if (trunks !== crowns) {
              return check(false, trunks ? "os troncos balançam, e as copas ficam paradas: falta copas.setMatrixAt(i, molde.matrix) no animar" : "as copas balançam, e os troncos ficam parados: falta troncos.setMatrixAt(i, molde.matrix) no animar");
            }
            const together = paired(objects);
            if (!together.ok) return together;
            const points = placesOf(objects.troncos);
            const group = biggestGroup(points);
            if (group.size > 1) return check(false, `as árvores saíram do lugar: ${int(group.size)} estão no mesmo ponto, ${spot(group.at)}. Falta pôr o molde no lugar de cada árvore no animar`);
            const ground = onGround(points, objects.terreno);
            if (!ground.ok) return ground;
            const heights = scalesOf(objects.troncos).map((s) => s[1]);
            return check(quantile(heights, 0.9) >= 1.25 * quantile(heights, 0.1), "as árvores ficaram todas do mesmo tamanho: falta molde.scale.set no animar");
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
