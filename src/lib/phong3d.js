// phong3d.js — o modelo de Phong / Blinn–Phong da "caixa de vidro" do modo 3D, com as
// luzes e os materiais do Three.js.
//
// Para cada luz j que chega ao ponto, com Lⱼ = cor × intensidade ÷ π (vezes a atenuação):
//
//   I = Ke + Σ Kd ⊙ L_ambiente + Σⱼ [ Kd ⊙ Lⱼ · max(0, n·lⱼ) + Ks ⊙ Lⱼ · max(0, rⱼ·v)^n ]
//
// com r = 2(n·l)n − l (Phong) ou, no Blinn–Phong, max(0, n·h)^n com h = (l + v)/|l + v|.
// O Three.js divide por π para a intensidade ser física: uma luz de intensidade π equivale
// à intensidade 1 dos livros. As cores entram como estão no código (0 a 1), sem correção de
// gama, e o resultado é limitado a [0, 1]. O shader glassShader.js faz exatamente estas
// contas, pixel a pixel; os testes comparam os dois.

import { dot, halfVector, normalize, reflect } from "./phong.js";

/** Luzes que o shader recebe (fora as ambientes, que são somadas numa só). */
export const MAX_LIGHTS = 8;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const BLACK = [0, 0, 0];

/**
 * Coeficientes do modelo para um material do Three.js. Cores em 0..1, como no código.
 * MeshBasicMaterial não é iluminado; Lambert não tem brilho; Standard e Physical usam outro
 * modelo (PBR) e entram como um Phong aproximado.
 */
export function materialTerms({ className, color = [1, 1, 1], specular = [0.067, 0.067, 0.067], shininess = 30, emissive = BLACK, emissiveIntensity = 1, metalness = 0, roughness = 1 }) {
  const Ke = scale(emissive, emissiveIntensity);
  switch (className) {
    case "MeshBasicMaterial":
      return { lit: false, Kd: color, Ks: BLACK, n: 1, Ke: BLACK, approx: false };
    case "MeshLambertMaterial":
      return { lit: true, Kd: color, Ks: BLACK, n: 1, Ke, approx: false };
    case "MeshPhongMaterial":
      return { lit: true, Kd: color, Ks: specular, n: Math.max(shininess, 1e-4), Ke, approx: false };
    case "MeshStandardMaterial":
    case "MeshPhysicalMaterial": {
      // metal: sem difusa, brilho da cor do metal; rugosidade alta: brilho espalhado
      const r = Math.max(roughness, 0.04);
      return {
        lit: true,
        Kd: scale(color, 1 - metalness),
        Ks: mix([0.04, 0.04, 0.04], color, metalness),
        n: Math.min(2048, Math.max(1, 2 / r ** 4 - 2)),
        Ke,
        approx: true,
      };
    }
    default:
      return null; // fica com o shader do Three.js
  }
}

/**
 * Atenuação com a distância, como no Three.js: 1 / max(dᵈᵉᶜᵃʸ, 0,01), e, com `distance` > 0,
 * vezes (1 − (d/distance)⁴)² para a luz acabar de vez nesse raio.
 */
export function distanceAttenuation(d, distance, decay) {
  let k = 1 / Math.max(d ** decay, 0.01);
  if (distance > 0) k *= clamp01(1 - (d / distance) ** 4) ** 2;
  return k;
}

/** Fator do cone de um holofote: 0 fora do ângulo, 1 no miolo, suave na penumbra. */
export function spotFactor(l, spotDir, angle, penumbra) {
  const outer = Math.cos(angle);
  const inner = Math.cos(angle * (1 - penumbra));
  const c = dot(l, spotDir);
  // sem penumbra, a borda é um degrau (o smoothstep do GLSL não vale com as duas bordas iguais)
  if (inner - outer < 1e-6) return c >= outer ? 1 : 0;
  return smoothstep(outer, inner, c);
}

/**
 * O que uma luz entrega no ponto. `light`: { type, color, intensity, position, target,
 * groundColor, distance, decay, angle, penumbra }, com posições no mundo.
 * Ambiente e hemisfério não têm direção: só a parte "ambiente" (L).
 */
export function lightAt(light, point, normal) {
  const L0 = scale(light.color, light.intensity / Math.PI);
  switch (light.type) {
    case "ambient":
      return { type: "ambient", L: L0 };
    case "hemisphere": {
      const up = normalize(light.position);
      const w = 0.5 * dot(normal, up) + 0.5;
      return { type: "hemisphere", L: scale(mix(light.groundColor, light.color, w), light.intensity / Math.PI), w };
    }
    case "directional":
      return { type: "directional", l: normalize(sub(light.position, light.target)), L: L0, attenuation: 1 };
    case "point":
    case "spot": {
      const toLight = sub(light.position, point);
      const d = Math.hypot(...toLight);
      const l = normalize(toLight);
      let attenuation = distanceAttenuation(d, light.distance ?? 0, light.decay ?? 2);
      let cone = null;
      if (light.type === "spot") {
        cone = spotFactor(l, normalize(sub(light.position, light.target)), light.angle, light.penumbra ?? 0);
        attenuation *= cone;
      }
      return { type: light.type, l, L: scale(L0, attenuation), attenuation, cone, d };
    }
    default:
      return null;
  }
}

/**
 * Cor de um ponto: `point` e `eye` (posição da câmera) no mundo, `normal` unitária já do lado
 * de quem olha, `material` = materialTerms(...), `lights` como em lightAt, `model` "phong"
 * ou "blinn". Devolve cada termo da soma para o painel mostrar.
 */
export function shadePoint({ point, normal, eye, material, lights, model = "phong" }) {
  const v = normalize(sub(eye, point));
  const n = normal;
  if (!material.lit) return { v, n, ambient: [], direct: [], emissive: BLACK, sum: material.Kd, rgb: material.Kd.map(clamp01) };

  const ambient = [];
  const direct = [];
  let sum = material.Ke;
  let count = 0;
  for (const light of lights) {
    const at = lightAt(light, point, n);
    if (!at) continue;
    // como no shader: as ambientes se somam numa só, as outras ocupam até MAX_LIGHTS lugares
    if (at.type !== "ambient" && count++ >= MAX_LIGHTS) continue;
    if (at.type === "ambient" || at.type === "hemisphere") {
      const I = mul(material.Kd, at.L);
      ambient.push({ ...at, light, I });
      sum = add(sum, I);
      continue;
    }
    const nl = dot(n, at.l);
    const r = reflect(at.l, n);
    const h = halfVector(at.l, v);
    const base = model === "blinn" ? Math.max(0, dot(n, h)) : Math.max(0, dot(r, v));
    const pow = nl > 0 ? base ** material.n : 0;
    const diffuse = scale(mul(material.Kd, at.L), Math.max(0, nl));
    const specular = scale(mul(material.Ks, at.L), pow);
    direct.push({ ...at, light, nl, r, h, base, pow, diffuse, specular });
    sum = add(sum, add(diffuse, specular));
  }
  return { v, n, ambient, direct, emissive: material.Ke, sum, rgb: sum.map(clamp01) };
}

/** Cor de 0 a 1 → bytes de 0 a 255, como a tela guarda cada pixel. */
export const toBytes = (rgb) => rgb.map((c) => Math.round(clamp01(c) * 255));
