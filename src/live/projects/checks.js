// checks.js — o que os passos de um projeto medem na cena para conferir se o passo foi feito.
//
// Como nos desafios, a conferência olha a cena que está rodando (os fatos do visor, em
// src/live/runtime/facts.js), não o texto: qualquer código que chegue ao resultado vale. A
// geometria chega como uma amostra de até 1.024 vértices, no espaço do objeto (sem a posição, a
// rotação e a escala dele), com a cor de cada vértice da amostra no espaço linear do Three.js; a
// matriz de mundo (`world`, por linhas) leva a amostra para o lugar dela na cena.

export { check, fmt } from "../challenges.js";

/** Número inteiro com ponto de milhar, como nos textos: 50.000. */
export const int = (n) => Math.round(n).toLocaleString("pt-BR");

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
