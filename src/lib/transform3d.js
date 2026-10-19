// transform3d.js — as matrizes 4×4 do pipeline 3D, escritas do zero.
//
// O painel de matrizes do modo 3D mostra estas contas, e o shader "caixa de vidro" do
// visor recebe as matrizes calculadas aqui, não as do Three.js: o que o painel mostra é
// o que desenha a cena. Os testes conferem que elas são as mesmas do Three.js.
//
// Convenções do Three.js: vetores coluna (p' = M · p), y para cima, a câmera olha para −z
// e os ângulos de rotação estão em radianos. Matrizes são listas de linhas: m[linha][coluna].
// A ordem de rotação "XYZ" dá R = Rx · Ry · Rz, então o ponto gira primeiro em torno de z.

export function identity() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

export function multiply(a, b) {
  const r = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) r[i][j] += a[i][k] * b[k][j];
  return r;
}

/** Produto de várias matrizes, da esquerda para a direita. */
export const product = (...ms) => ms.reduce((acc, m) => multiply(acc, m), identity());

export function translation(x, y, z) {
  return [
    [1, 0, 0, x],
    [0, 1, 0, y],
    [0, 0, 1, z],
    [0, 0, 0, 1],
  ];
}

export function scaling(x, y, z) {
  return [
    [x, 0, 0, 0],
    [0, y, 0, 0],
    [0, 0, z, 0],
    [0, 0, 0, 1],
  ];
}

export function rotationX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ];
}

export function rotationY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ];
}

export function rotationZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

const ORDERS = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];

/** As três rotações na ordem do produto: "XYZ" → [Rx, Ry, Rz], e R = Rx · Ry · Rz. */
export function rotationFactors([x, y, z], order = "XYZ") {
  if (!ORDERS.includes(order)) throw new Error(`Ordem de rotação inválida: ${order}`);
  const byAxis = { X: rotationX(x), Y: rotationY(y), Z: rotationZ(z) };
  return [...order].map((axis) => ({ axis, matrix: byAxis[axis] }));
}

export function rotation(angles, order = "XYZ") {
  return product(...rotationFactors(angles, order).map((f) => f.matrix));
}

/**
 * Matriz de modelo de um objeto: M = T · R · S (o ponto é escalado, depois girado e por
 * último transladado). Com `parent`, a matriz de mundo do pai entra à esquerda.
 */
export function modelMatrix({ position = [0, 0, 0], rotation: angles = [0, 0, 0], order = "XYZ", scale = [1, 1, 1], parent = null }) {
  const local = product(translation(...position), rotation(angles, order), scaling(...scale));
  return parent ? multiply(parent, local) : local;
}

/** Inversa por cofatores; null se a matriz for singular. */
export function invert(m) {
  const a = m.flat();
  const inv = new Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (Math.abs(det) < 1e-12) return null;
  return [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => inv[i * 4 + j] / det));
}

/**
 * Matriz das normais: a inversa transposta da parte 3×3 de M. Com escala não uniforme, girar
 * a normal com M a entortaria; esta matriz a mantém perpendicular à superfície.
 */
export function normalMatrix(m) {
  const inv = invert([[...m[0].slice(0, 3), 0], [...m[1].slice(0, 3), 0], [...m[2].slice(0, 3), 0], [0, 0, 0, 1]]);
  if (!inv) return null;
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => inv[j][i]));
}

/** Matriz de visão: leva o mundo para o espaço da câmera, V = (matriz de mundo da câmera)⁻¹. */
export const viewMatrix = (cameraWorld) => invert(cameraWorld);

/**
 * Projeção perspectiva do Three.js (PerspectiveCamera), com `fov` vertical em graus:
 * f = zoom / tan(fov/2), e x e y saem divididos por −z (o w do resultado).
 */
export function perspective({ fov, aspect, near, far, zoom = 1 }) {
  const f = zoom / Math.tan(((fov * Math.PI) / 180) / 2);
  return [
    [f / aspect, 0, 0, 0],
    [0, f, 0, 0],
    [0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near)],
    [0, 0, -1, 0],
  ];
}

/** Projeção ortográfica do Three.js (OrthographicCamera): uma caixa vira o cubo [−1, 1]³. */
export function orthographic({ left, right, top, bottom, near, far, zoom = 1 }) {
  const dx = (right - left) / (2 * zoom);
  const dy = (top - bottom) / (2 * zoom);
  const cx = (right + left) / 2;
  const cy = (top + bottom) / 2;
  const [l, r, t, b] = [cx - dx, cx + dx, cy + dy, cy - dy];
  return [
    [2 / (r - l), 0, 0, -(r + l) / (r - l)],
    [0, 2 / (t - b), 0, -(t + b) / (t - b)],
    [0, 0, -2 / (far - near), -(far + near) / (far - near)],
    [0, 0, 0, 1],
  ];
}

/** Aplica M a um ponto em coordenadas homogêneas: [x, y, z] vale [x, y, z, 1]. */
export function transform(m, [x, y, z, w = 1]) {
  return m.map((row) => row[0] * x + row[1] * y + row[2] * z + row[3] * w);
}

/** Divisão perspectiva: coordenadas de recorte → coordenadas normalizadas do dispositivo. */
export const toNdc = ([x, y, z, w]) => [x / w, y / w, z / w];

/** NDC → pixel na tela, com a origem no canto de cima à esquerda (y para baixo). */
export const toScreen = ([x, y], width, height) => [((x + 1) / 2) * width, ((1 - y) / 2) * height];

/** O caminho de um ponto do objeto até o pixel: modelo, visão, projeção e divisão por w. */
export function pipeline(point, { model, view, projection, width, height }) {
  const world = transform(model, point);
  const eye = transform(view, world);
  const clip = transform(projection, eye);
  const ndc = toNdc(clip);
  return { point: [...point.slice(0, 3), 1], world, eye, clip, ndc, screen: toScreen(ndc, width, height), visible: clip[3] > 0 && ndc.every((v) => v >= -1 && v <= 1) };
}

/** Lista de 16 números em ordem de coluna, como o WebGL (e o Matrix4.fromArray) recebe. */
export const columnMajor = (m) => [0, 1, 2, 3].flatMap((j) => [0, 1, 2, 3].map((i) => m[i][j]));

/** Inverso de columnMajor: os `elements` de um Matrix4 viram linhas. */
export const fromColumnMajor = (e) => [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => e[j * 4 + i]));
