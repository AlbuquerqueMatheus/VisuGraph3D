// phong.js — o modelo de iluminação de Phong / Blinn–Phong escrito uma única vez.
//
// O painel didático usa estas funções, e o shader do visor (phongShader.js)
// implementa exatamente as mesmas contas, para que o pixel na tela e os números
// do painel sejam o mesmo cálculo.
//
//   I = La·Ka + Ld·Kd·max(0, n·l) + Ls·Ks·max(0, r·v)^n        (Phong)
//   I = La·Ka + Ld·Kd·max(0, n·l) + Ls·Ks·max(0, h·n)^n        (Blinn–Phong)
//
// com r = 2(n·l)n − l e h = (l + v)/|l + v|. O termo especular vale zero quando
// n·l ≤ 0 (luz atrás da superfície). Na versão colorida, ambiente e difusa usam a
// cor do objeto, a difusa e a especular usam a cor da luz:
//
//   cor = Ia·Cobj + Id·(Cobj ⊙ Cluz) + Is·Cluz, limitada a [0, 1].

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

/** Reflexão de l em torno da normal n: r = 2(n·l)n − l (l aponta para a luz). */
export function reflect(l, n) {
  const k = 2 * dot(n, l);
  return [k * n[0] - l[0], k * n[1] - l[1], k * n[2] - l[2]];
}

/** Vetor meio-caminho entre a luz e o observador. */
export function halfVector(l, v) {
  return normalize([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Calcula todos os termos do modelo em um ponto.
 * n, l e v são vetores unitários; cores são [r, g, b] em 0..1.
 */
export function shade({
  n,
  l,
  v,
  model = "phong",
  La = 0.2,
  Ld = 0.8,
  Ls = 0.8,
  Ka = 0.2,
  Kd = 0.7,
  Ks = 0.5,
  shininess = 32,
  terms = { ambient: true, diffuse: true, specular: true },
  objectColor = [1, 1, 1],
  lightColor = [1, 1, 1],
}) {
  const nl = dot(n, l);
  const nlClamped = Math.max(0, nl);
  const r = reflect(l, n);
  const h = halfVector(l, v);
  const rv = Math.max(0, dot(r, v));
  const hn = Math.max(0, dot(h, n));
  const specBase = model === "blinn" ? hn : rv;
  const specPow = nl > 0 ? specBase ** shininess : 0;

  const Ia = terms.ambient ? La * Ka : 0;
  const Id = terms.diffuse ? Ld * Kd * nlClamped : 0;
  const Is = terms.specular ? Ls * Ks * specPow : 0;

  const rgb = [0, 1, 2].map((i) =>
    clamp01(Ia * objectColor[i] + Id * objectColor[i] * lightColor[i] + Is * lightColor[i])
  );

  return { nl, nlClamped, r, h, rv, hn, specBase, specPow, Ia, Id, Is, I: Ia + Id + Is, rgb };
}

/** "#6699ff" → [0.4, 0.6, 1] (valores exibidos, sem conversão de espaço de cor). */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
}
