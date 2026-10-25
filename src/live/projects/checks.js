// checks.js — o que os passos de um projeto medem na cena para conferir se o passo foi feito.
//
// Como nos desafios, a conferência olha a cena que está rodando (os fatos do visor, em
// src/live/runtime/facts.js), não o texto: qualquer código que chegue ao resultado vale. A
// geometria chega como uma amostra de até 1.024 vértices, no espaço do objeto (sem a posição, a
// rotação e a escala dele), com a cor de cada vértice da amostra no espaço linear do Three.js; a
// matriz de mundo (`world`, por linhas) leva a amostra para o lugar dela na cena.

import { check } from "../challenges.js";

export { check, fmt } from "../challenges.js";

/** Resultado de uma conferência que ainda espera a cena (a animação andar mais): nem ✓ nem ✗. */
export const wait = (seen) => ({ ok: null, seen });

/** Número inteiro com ponto de milhar, como nos textos: 50.000. */
export const int = (n) => Math.round(n).toLocaleString("pt-BR");

/** Uma fração (0 a 1) em porcentagem: "35%". */
export const pct = (f) => `${Math.round(f * 100)}%`;

/** O objeto e os outros que a mesma linha do código criou, num laço. */
export const all = (obj) => [obj, ...(obj.copies ?? [])];

/** Materiais que calculam a luz que chega a cada ponto. */
const LIT = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial"];

/** Confere que a malha é de um material que reage à luz. */
export function lit(name, obj) {
  const type = obj.material?.type ?? null;
  if (LIT.includes(type)) return check(true);
  return check(false, type === "MeshBasicMaterial" ? `${name} é MeshBasicMaterial, que ignora a luz` : `${name} é ${type ?? "outro material"}`);
}

/** Distância de um ponto ao eixo y: o raio, visto de cima. */
export const radius = ([x, , z]) => Math.hypot(x, z);

/** Maior raio da amostra (0 se vazia). */
export const maxRadius = (sample) => sample.reduce((m, p) => Math.max(m, radius(p)), 0);

/** Menor e maior valor de uma coordenada (0 = x, 1 = y, 2 = z) na amostra, e a diferença. */
export function extent(sample, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of sample) {
    min = Math.min(min, p[axis]);
    max = Math.max(max, p[axis]);
  }
  return { min, max, size: max - min };
}

/** Graus de um ângulo em radianos. */
export const deg = (rad) => (rad * 180) / Math.PI;

/** Distância entre dois pontos [x, y, z]. */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Direção, com comprimento 1, do ponto a para o ponto b. */
export function toward(a, b) {
  const v = [0, 1, 2].map((i) => b[i] - a[i]);
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

/** Um ponto [x, y, z] levado por uma matriz 4 × 4, escrita por linhas. */
export const apply = (m, [x, y, z]) => [0, 1, 2].map((i) => m[i][0] * x + m[i][1] * y + m[i][2] * z + m[i][3]);

/** Um ponto do espaço do objeto levado ao mundo pela matriz de mundo dele. */
export function toWorld(obj, [x, y, z]) {
  const m = obj.world;
  return [0, 1, 2].map((i) => m[i][0] * x + m[i][1] * y + m[i][2] * z + m[i][3]);
}

/** Para onde aponta no mundo o eixo local k do objeto (0 = x, 1 = y, 2 = z), com comprimento 1. */
export function axisOf(obj, k) {
  const v = [0, 1, 2].map((i) => obj.world[i][k]);
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

/** Menor e maior distância de um vértice da amostra ao centro do objeto, no mundo. */
function centerDistances(obj) {
  const sample = obj.geometry?.sample ?? [];
  const scale = Math.hypot(obj.world[0][0], obj.world[1][0], obj.world[2][0]);
  let min = Infinity;
  let max = 0;
  for (const p of sample) {
    const d = Math.hypot(...p) * scale;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return sample.length ? { min, max } : null;
}

/** Raio de uma esfera no mundo (0 se a geometria não tem posições). */
export const sphereRadius = (obj) => centerDistances(obj)?.max ?? 0;

/**
 * Se o objeto é uma esfera: todos os vértices à mesma distância do centro, e em muitas direções.
 * Os 8 cantos de um cubo também ficam à mesma distância do centro; uma esfera, mesmo das mais
 * grosseiras, tem pelo menos uns 20 vértices em lugares diferentes.
 */
export function isRound(obj) {
  const d = centerDistances(obj);
  if (!d || d.max <= 0 || (d.max - d.min) / d.max >= 0.02) return false;
  const places = new Set(obj.geometry.sample.map((p) => p.map((c) => Math.round(c * 1e4)).join()));
  return places.size >= 20;
}

/**
 * As bordas da caixa da câmera da sombra como a projeção as usa: com zoom, a caixa encolhe em
 * volta do meio dela.
 */
function shadowBox({ left, right, top, bottom, near, far, zoom = 1 }) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = (right - left) / (2 * zoom);
  const dy = (top - bottom) / (2 * zoom);
  return { left: cx - dx, right: cx + dx, bottom: cy - dy, top: cy + dy, near, far };
}

/**
 * A câmera da sombra de uma luz direcional: a caixa (`box`), a matriz que leva um ponto da cena
 * para o espaço dela (`view`) e o tamanho do mapa; null se a luz não tem essa câmera.
 */
export function shadowOf(light) {
  const shadow = light.shadow;
  if (!shadow?.view || shadow.camera.left == null) return null;
  return { box: shadowBox(shadow.camera), view: shadow.view, mapSize: shadow.mapSize };
}

/** Profundidade de um ponto: o quanto ele fica à frente da câmera, na direção em que ela olha. */
export const depthOf = (camera, p) => dot(camera.direction, [0, 1, 2].map((i) => p[i] - camera.worldPosition[i]));

/**
 * Quanto de neblina (0 a 1) cobre um ponto à profundidade `depth`, como o shader do Three.js
 * calcula: na Fog, uma curva suave (smoothstep) de near a far; na FogExp2, 1 − e^−(densidade × d)².
 */
export function fogAt(fog, depth) {
  if (fog.type === "FogExp2") return 1 - Math.exp(-((fog.density * depth) ** 2));
  if (fog.far <= fog.near) return depth >= fog.far ? 1 : 0;
  const t = Math.min(1, Math.max(0, (depth - fog.near) / (fog.far - fog.near)));
  return t * t * (3 - 2 * t);
}

/** Brilho (0 a 1) de uma cor "#rrggbb", pela luminância de Rec. 709 sobre os canais sRGB. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * Braços de uma nuvem de pontos vista de cima. Cada ponto é "desenrolado" pela espiral
 * θ = θ₀ + k·r (o ângulo menos k vezes o raio) e, para m braços, mede-se o quanto os ângulos
 * desenrolados se repetem a cada 1/m de volta: a força |média de e^(i·m·(θ − k·r))| é 1 quando
 * todos os pontos caem em m linhas igualmente espaçadas e fica perto de 0 num disco sem braços.
 * Procura a curvatura k (até 30 radianos de giro na borda, para os dois lados) e o número de
 * braços m (de 1 a 12); m braços também têm força em 2m, 3m…, então fica o menor m com quase a
 * força máxima. Os pontos a menos de `inner` × (raio máximo) do centro ficam de fora: lá os braços
 * se encontram.
 */
export function armsOf(sample, { inner = 0.1 } = {}) {
  const M = 12;
  const rMax = maxRadius(sample);
  const rs = [];
  const as = [];
  for (const [x, , z] of sample) {
    const r = Math.hypot(x, z);
    if (r > 0 && r >= inner * rMax) {
      rs.push(r);
      as.push(Math.atan2(z, x));
    }
  }
  const n = rs.length;
  if (n < 20) return { arms: 0, k: 0, strength: 0 };
  const top = Array.from({ length: M + 1 }, (_, m) => ({ arms: m, k: 0, strength: -1 }));
  const re = new Float64Array(M + 1);
  const im = new Float64Array(M + 1);
  // um k de cada vez, todos os m juntos: e^(i·m·φ) sai de multiplicar e^(iφ) por ele mesmo
  const scan = (k) => {
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < n; j++) {
      const phase = as[j] - k * rs[j];
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      let zr = c;
      let zi = s;
      for (let m = 1; m <= M; m++) {
        re[m] += zr;
        im[m] += zi;
        const t = zr * c - zi * s;
        zi = zr * s + zi * c;
        zr = t;
      }
    }
    for (let m = 1; m <= M; m++) {
      const f = Math.hypot(re[m], im[m]) / n;
      if (f > top[m].strength) top[m] = { arms: m, k, strength: f };
    }
  };
  const kMax = 30 / rMax;
  const step = Math.PI / (2 * M * rMax); // na borda, meio passo erra no máximo π/4 com 12 braços
  for (let k = -kMax; k <= kMax + step / 2; k += step) scan(k);
  // refina o k só dos números de braços que chegaram perto do mais forte
  const coarse = Math.max(...top.slice(1).map((t) => t.strength));
  for (const t of top.slice(1).filter((t) => t.strength >= 0.5 * coarse)) {
    for (let k = t.k - step; k <= t.k + step; k += step / 8) scan(k);
  }
  const strongest = Math.max(...top.slice(1).map((t) => t.strength));
  return top.slice(1).find((t) => t.strength >= 0.9 * strongest);
}


/** Propriedades que animar() muda, pelo nome da variável: "galaxia.rotation.y". */
export function animatedKeys(analysis) {
  const keys = new Set();
  for (const obj of analysis?.objects ?? []) {
    if (!obj.name) continue;
    for (const [key, prop] of Object.entries(obj.props)) if (prop.reason === "animated") keys.add(`${obj.name}.${key}`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Cópias de uma InstancedMesh: nos fatos, `instanced` traz a posição de cada cópia (de 3 em 3
// números, no espaço da malha), a matriz (por linhas) e a cor de uma amostra de até 1.024 cópias e
// a versão das matrizes, que cresce a cada `instanceMatrix.needsUpdate = true`

/** Uma matriz 4 × 4 vezes outra, as duas escritas por linhas. */
export const multiply = (a, b) => a.map((row) => [0, 1, 2, 3].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j] + row[3] * b[3][j]));

/** A coluna k (0 = x, 1 = y, 2 = z) de uma matriz por linhas: para onde vai o eixo k, com o comprimento da escala. */
export const columnOf = (m, k) => [m[0][k], m[1][k], m[2][k]];

/** As posições, no mundo, das cópias que a InstancedMesh desenha (todas, até 20 mil). */
export function instancePlaces(obj) {
  const p = obj?.instanced?.positions ?? [];
  const out = [];
  for (let k = 0; k + 2 < p.length; k += 3) out.push(apply(obj.world, [p[k], p[k + 1], p[k + 2]]));
  return out;
}

/** As matrizes, no mundo, da amostra de cópias da InstancedMesh: a da malha vezes a de cada cópia. */
export const instanceMatrices = (obj) => (obj?.instanced?.sample ?? []).map((m) => multiply(obj.world, m));

/** Matiz (0 a 360), saturação e luminosidade (0 a 1) de uma cor [r, g, b], de 0 a 1. */
export function hslOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l };
}

/** O valor abaixo do qual fica a fração q (de 0 a 1) dos valores: 0,5 é a mediana. */
export function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

// ---------------------------------------------------------------------------
// Curvas e rastros: a curva que um tubo segue (`geometry.curve`, nos fatos) e o caminho que um
// objeto fez enquanto a animação rodava (`trail`: [[tempo, x, y, z], …])

/** Os pontos da curva de um tubo (TubeGeometry), levados ao mundo; [] se não é um tubo. */
export const curveOf = (obj) => (obj?.geometry?.curve ?? []).map((p) => toWorld(obj, p));

/** O comprimento de uma linha de pontos ligados em sequência. */
export function lengthOf(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/**
 * O ponto da linha (pontos ligados em sequência) mais perto de p: a distância, o trecho (de
 * points[index] a points[index + 1]), quanto do trecho até o ponto (t, de 0 a 1), o ponto e a
 * direção do trecho, com comprimento 1.
 */
export function nearest(points, p) {
  let best = { distance: Infinity, index: -1, t: 0, point: null, direction: null };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const ab = [0, 1, 2].map((k) => points[i + 1][k] - a[k]);
    const len2 = dot(ab, ab);
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, dot([0, 1, 2].map((k) => p[k] - a[k]), ab) / len2));
    const q = [0, 1, 2].map((k) => a[k] + ab[k] * t);
    const d = dist(p, q);
    if (d < best.distance) {
      const len = Math.sqrt(len2);
      best = { distance: d, index: i, t, point: q, direction: ab.map((c) => c / len) };
    }
  }
  return best;
}

/** As posições [x, y, z] de um rastro. */
export const placesOf = (trail) => trail.map(([, x, y, z]) => [x, y, z]);

/**
 * A velocidade ao longo de um rastro: [{ y, v }], o caminho andado em cada janela de pelo menos
 * `window` segundos (de cada ponto ao seguinte, sem janela) dividido pelo tempo, com a altura média.
 * Com `lag`, o tempo da janela começa e termina um ponto antes: é a conta certa para um código que
 * anda depois de pôr o objeto no lugar (`distancia += velocidade * delta` no fim de animar), em
 * que o pedaço entre dois pontos do rastro foi andado com o delta do quadro anterior.
 */
export function speedsOf(trail, { window = 0, lag = false } = {}) {
  const out = [];
  for (let i = lag ? 1 : 0; i + 1 < trail.length; i++) {
    let length = 0;
    let j = i;
    do {
      length += dist(trail[j].slice(1), trail[j + 1].slice(1));
      j++;
    } while (j + 1 < trail.length && trail[j][0] - trail[i][0] < window);
    if (trail[j][0] - trail[i][0] < window) break;
    const time = lag ? trail[j - 1][0] - trail[i - 1][0] : trail[j][0] - trail[i][0];
    if (time <= 0) continue;
    let y = 0;
    for (let k = i; k <= j; k++) y += trail[k][2];
    out.push({ y: y / (j - i + 1), v: length / time });
  }
  return out;
}

/**
 * A reta y = a + b·x que passa mais perto dos pontos (pelos mínimos quadrados), com o r² (de 0 a
 * 1): quanto da variação de y a reta explica.
 */
export function fitLine(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0 };
}
