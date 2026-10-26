// galaxiaViva.js — o projeto "Galáxia viva": a galáxia do Gerador de galáxias desenhada por um
// shader, em 11 passos no VisuGraph e 1 no seu computador. O assunto são os shaders de pontos: o
// gl_PointSize e o gl_PointCoord, os atributos de cada ponto, a cor por vértice no shader e o
// movimento calculado na placa de vídeo, em que cada estrela gira na sua própria velocidade, como
// nas galáxias de verdade, e os braços são uma onda por onde as estrelas passam.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js). A
// conferência olha o que o shader fez com as estrelas (`shader.stars`, nos fatos: o visor desenha
// de novo uma amostra das estrelas com o shader do código e lê, de cada uma, o gl_Position, o
// gl_PointSize e a cor do meio, e os pixels inteiros das maiores) e refaz a conta de cada passo
// com os uniforms do material. Quando a conta não bate, ela tenta os erros comuns (o giro para o
// outro lado, a velocidade que cresce com o raio, os braços parados) para dizer qual foi.

import { armsOf, check, dist, fmt, gap, hex, int, maxRadius, multiply, quantile, radius, srgbBytes, toSRGB, toWorld, wait } from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, during, from } from "./source.js";

const SOURCE = [
  from(0, "// Galáxia viva"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#05060a");',
    "",
    "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 8, 14);",
    "camera.lookAt(0, 0, 0);",
    "",
    "// Parâmetros da galáxia",
    "const quantidade = 50000;",
    "const raio = 5;",
    "const bracos = 3;",
    "const curvatura = 1;",
    "const dispersao = 0.3;",
    'const corNucleo = new THREE.Color("#ffb46b");',
    'const corBorda = new THREE.Color("#4b6bff");',
    "",
    "const posicoes = new Float32Array(quantidade * 3);",
    "const cores = new Float32Array(quantidade * 3);",
  ),
  from(5, "const escalas = new Float32Array(quantidade);"),
  from(
    1,
    "const cor = new THREE.Color();",
    "",
    "// Um número sorteado em torno de 0, com a distribuição normal (a curva do sino)",
    "function gaussiana() {",
    "  const u = 1 - Math.random(); // nunca 0: o logaritmo de 0 não existe",
    "  const v = Math.random();",
    "  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);",
    "}",
    "",
    "for (let i = 0; i < quantidade; i++) {",
    "  const i3 = i * 3;",
    "  const r = Math.random() * raio;",
  ),
  during(1, 10, "  const braco = i % bracos;"),
  by({ 1: "  const angulo = (braco / bracos) * Math.PI * 2 + r * curvatura;", 10: "  const angulo = Math.random() * Math.PI * 2;" }),
  from(1, ""),
  by({ 1: "  posicoes[i3] = Math.cos(angulo) * r + gaussiana() * dispersao;", 10: "  posicoes[i3] = Math.cos(angulo) * r;" }),
  from(1, "  posicoes[i3 + 1] = gaussiana() * dispersao * 0.3;"),
  by({ 1: "  posicoes[i3 + 2] = Math.sin(angulo) * r + gaussiana() * dispersao;", 10: "  posicoes[i3 + 2] = Math.sin(angulo) * r;" }),
  from(1, "", "  cor.lerpColors(corNucleo, corBorda, r / raio);", "  cores[i3] = cor.r;", "  cores[i3 + 1] = cor.g;", "  cores[i3 + 2] = cor.b;"),
  from(5, "", "  // A maioria pequena, poucas grandes", "  escalas[i] = 0.5 + 2 * Math.random() ** 3;"),
  from(
    1,
    "}",
    "",
    "const geometria = new THREE.BufferGeometry();",
    'geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));',
    'geometria.setAttribute("color", new THREE.BufferAttribute(cores, 3));',
  ),
  from(5, 'geometria.setAttribute("aEscala", new THREE.BufferAttribute(escalas, 1));'),
  from(1, ""),
  during(
    1,
    2,
    "const material = new THREE.PointsMaterial({",
    "  size: 0.03,",
    "  sizeAttenuation: true,",
    "  depthWrite: false,",
    "  blending: THREE.AdditiveBlending,",
    "  vertexColors: true,",
    "});",
  ),
  // o shader de vértices
  from(2, "// O shader de vértices: roda uma vez para cada estrela", "const vertexShader = /* glsl */ `"),
  from(7, "  uniform float uTempo;"),
  from(4, "  uniform float uTamanho;"),
  from(8, "  uniform float uVelocidade;"),
  from(9, "  uniform float uNucleo;"),
  from(10, "  uniform float uBracos;", "  uniform float uCurvatura;", "  uniform float uVelocidadeDosBracos;"),
  from(11, "  uniform vec3 uCorJovem;"),
  from(5, "", "  attribute float aEscala;"),
  from(4, ""),
  from(3, "  varying vec3 vCor;", ""),
  from(2, "  void main() {"),
  from(
    7,
    "    vec3 p = position;",
    "    // Em coordenadas polares: a distância ao centro e o ângulo, no chão da galáxia",
    "    float r = length(p.xz);",
    "    float angulo = atan(p.z, p.x);",
  ),
  by({
    7: "    // A galáxia inteira gira 0,1 radiano por segundo",
    8: "    // Cada estrela gira na sua velocidade: perto do centro, a volta é mais curta",
    9: "    // Cada estrela gira na sua velocidade, e o núcleo gira junto, como um disco",
  }),
  by({
    7: "    angulo -= uTempo * 0.1;",
    8: "    angulo -= uTempo * uVelocidade / r;",
    9: "    angulo -= uTempo * uVelocidade / sqrt(r * r + uNucleo * uNucleo);",
  }),
  from(7, "    p.x = cos(angulo) * r;", "    p.z = sin(angulo) * r;"),
  from(
    10,
    "    // Os braços: uma espiral que gira inteira, devagar; quem passa por ela brilha",
    "    float onda = cos(uBracos * (angulo - uCurvatura * r + uTempo * uVelocidadeDosBracos));",
    "    float brilho = pow(0.5 + 0.5 * onda, 3.0);",
  ),
  by({
    2: "    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    4: "    vec4 visto = modelViewMatrix * vec4(position, 1.0);",
    7: "    vec4 visto = modelViewMatrix * vec4(p, 1.0);",
  }),
  from(4, "    gl_Position = projectionMatrix * visto;"),
  by({
    2: "    gl_PointSize = 2.0;",
    4: "    gl_PointSize = uTamanho / -visto.z;",
    5: "    gl_PointSize = uTamanho * aEscala / -visto.z;",
  }),
  by({
    3: "    vCor = color;",
    10: "    vCor = color * mix(0.08, 1.0, brilho);",
    11: "    vCor = mix(color, uCorJovem, brilho) * mix(0.08, 1.0, brilho);",
  }),
  from(2, "  }", "`;", ""),
  // o shader de fragmentos
  from(2, "// O shader de fragmentos: roda para cada pixel de cada estrela", "const fragmentShader = /* glsl */ `"),
  from(
    3,
    "  varying vec3 vCor;",
    "",
    "  // Do espaço linear para o sRGB, como o three.js faz no fim de cada pixel",
    "  vec3 paraSRGB(vec3 c) {",
    "    c = clamp(c, 0.0, 1.0);",
    "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
    "  }",
    "",
  ),
  from(2, "  void main() {"),
  from(
    6,
    "    // A distância do pixel ao centro da estrela: 0 no meio, 0,5 na borda do círculo",
    "    float d = distance(gl_PointCoord, vec2(0.5));",
    "    // Forte no meio, caindo rápido até a borda, e nada fora do círculo",
    "    float forca = pow(max(1.0 - 2.0 * d, 0.0), 6.0);",
  ),
  by({
    2: "    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);",
    3: "    gl_FragColor = vec4(paraSRGB(vCor), 1.0);",
    6: "    gl_FragColor = vec4(paraSRGB(vCor) * forca, 1.0);",
  }),
  from(2, "  }", "`;", ""),
  // o material
  from(4, "// Quantos pixels da imagem cabem em cada pixel da tela: 2 numa tela de alta densidade", "const densidade = Math.min(window.devicePixelRatio, 2);", ""),
  from(2, "const material = new THREE.ShaderMaterial({"),
  from(4, "  uniforms: {"),
  from(7, "    uTempo: { value: 0 },"),
  by({ 4: "    uTamanho: { value: 30 * densidade },", 6: "    uTamanho: { value: 60 * densidade }," }),
  from(8, "    uVelocidade: { value: 0.5 },"),
  from(9, "    uNucleo: { value: 0.5 },"),
  from(10, "    uBracos: { value: bracos },", "    uCurvatura: { value: curvatura },", "    uVelocidadeDosBracos: { value: 0.15 },"),
  from(11, '    uCorJovem: { value: new THREE.Color("#a8c8ff") },'),
  from(4, "  },"),
  from(2, "  vertexShader,", "  fragmentShader,"),
  from(6, "  depthWrite: false,", "  blending: THREE.AdditiveBlending,"),
  from(3, "  vertexColors: true,"),
  from(2, "});", ""),
  from(1, "const galaxia = new THREE.Points(geometria, material);", "cena.add(galaxia);"),
  from(7, "", "// A cada quadro, o shader fica sabendo o tempo", "function animar(tempo) {", "  material.uniforms.uTempo.value = tempo;", "}"),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// As estrelas da conta: onde cada estrela da amostra está no tempo t e de que cor, com os uniforms
// do material. A amostra da geometria (`geometry.sample`, no espaço do objeto) e as estrelas que o
// shader desenhou (`shader.stars`) vêm na mesma ordem: a estrela j da medida é o ponto j da amostra.

/** O raio e o ângulo de um ponto no chão da galáxia (o plano xz), como o length(p.xz) e o atan(p.z, p.x) do shader. */
const polar = ([x, , z]) => [Math.hypot(x, z), Math.atan2(z, x)];

/** O giro de cada passo: quanto o ângulo de uma estrela a r do centro diminuiu no tempo t. */
const SPIN = {
  still: () => 0,
  rigid: (u, r, t) => 0.1 * t,
  flat: (u, r, t) => (t * u.uVelocidade) / r,
  linear: (u, r, t) => t * u.uVelocidade * r,
  free: (u, r, t) => t / r,
  core: (u, r, t) => (t * u.uVelocidade) / Math.hypot(r, u.uNucleo),
  plus: (u, r, t) => (t * u.uVelocidade) / (r + u.uNucleo),
};

/**
 * A estrela que começou em p (no espaço do objeto) no tempo t, girada em volta do eixo y pelo giro
 * `spin`, no sentido do `angulo -=` do shader (ao contrário, com `backwards`; com `swapped`, o
 * ângulo vem de um atan com os argumentos trocados, medido a partir do z). `p` é o ponto, `r` o raio
 * e `a` o ângulo depois do giro, o `angulo` do shader.
 */
function starAt(p, u, t, { spin = SPIN.still, backwards = false, swapped = false } = {}) {
  const [r, start] = polar(p);
  const a = (swapped ? Math.atan2(p[0], p[2]) : start) + (backwards ? 1 : -1) * spin(u, r, t);
  return { p: [Math.cos(a) * r, p[1], Math.sin(a) * r], r, a };
}

/**
 * A luz da espiral numa estrela de ângulo `a` e raio r, no tempo t: 1 na linha de um braço, quase 0
 * no meio entre dois. Com `still`, a espiral não gira; com `backwards`, gira ao contrário; com
 * `wide`, fica sem o pow do passo.
 */
function armLight(u, a, r, t, { still = false, backwards = false, wide = false } = {}) {
  const turn = still ? 0 : (backwards ? -1 : 1) * t * u.uVelocidadeDosBracos;
  const base = 0.5 + 0.5 * Math.cos(u.uBracos * (a - u.uCurvatura * r + turn));
  return wide ? base : base ** 3;
}

/** O mix(a, b, f) do GLSL, para cores. */
const mixColor = (a, b, f) => a.map((x, k) => x + (b[k] - x) * f);
/** Um número de 0 a 1 em sRGB de volta para o espaço linear: o contrário da paraSRGB. */
const fromSRGB = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
/** A força do brilho do passo 6, na distância d do pixel ao meio da estrela (0,5 na borda do círculo). */
const glow = (d) => Math.max(1 - 2 * d, 0) ** 6;
/** Um número como nos textos: sem casas se é inteiro (30), com duas se não é (2,50). */
const num = (v) => fmt(v, Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2);

// ---------------------------------------------------------------------------
// Conferências: as estrelas que o shader desenhou (`shader.stars`, nos fatos) contra a conta

const STAGE = { vertex: "shader de vértices", fragment: "shader de fragmentos" };
const PAUSED = "a animação está parada: aperte ▶ na barra de cima para a galáxia girar";
const WAITING = "esperando a galáxia girar um pouco";
const HIDDEN = "as estrelas não aparecem na frente da câmera: confira o gl_Position";
const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura e carregada: falta passar a cor pela paraSRGB no gl_FragColor";

/**
 * O valor de um uniform do material da galáxia: um número (`float`) ou um vetor (`vec3`, que aceita
 * também uma THREE.Color, no espaço linear). Senão, `result` diz o que falta.
 */
function uniformOf(galaxia, name, kind) {
  const u = galaxia.material?.uniforms?.[name];
  if (!u) return { result: check(false, `o material da galáxia não tem o uniform ${name}`) };
  if (kind === "float") return u.type === "number" ? { value: u.value } : { result: check(false, `o uniform ${name} não é um número`) };
  if ((u.type === "vector" || u.type === "color") && u.value.length === 3) return { value: u.value };
  return { result: check(false, `o uniform ${name} não tem 3 números (uma THREE.Color ou um THREE.Vector3)`) };
}

/** Os valores de vários uniforms ({ nome: tipo }), ou o `result` do primeiro que falta. */
function uniformsOf(galaxia, kinds) {
  const values = {};
  for (const [name, kind] of Object.entries(kinds)) {
    const u = uniformOf(galaxia, name, kind);
    if (u.result) return u;
    values[name] = u.value;
  }
  return { values };
}

/**
 * O tempo da galáxia: o uTempo do material, se ele acompanha o tempo da animação (o que animar
 * recebe). Senão, `result` diz o que falta ou o que esperar: no começo, e logo depois de o código
 * rodar de novo, o uTempo só recebe o tempo no quadro seguinte.
 */
function clockOf(facts, galaxia) {
  const u = uniformOf(galaxia, "uTempo", "float");
  if (u.result) return u;
  if (!facts.hasAnimar) return { result: check(false, "não achei a função animar(tempo)") };
  const t = u.value;
  const synced = Math.abs(t - facts.elapsed) <= 0.01;
  if (!facts.playing && (!synced || facts.elapsed < 0.5)) return { result: wait(PAUSED) };
  if (facts.elapsed < 0.5 || (!synced && facts.recorded < 0.5)) return { result: wait(WAITING) };
  if (synced) return { t };
  if (t === 0) return { result: check(false, "o uTempo continua em 0: falta o animar copiar o tempo para ele, material.uniforms.uTempo.value = tempo") };
  return { result: check(false, `o uTempo está em ${fmt(t)}, e a animação, em ${fmt(facts.elapsed)} segundos: o animar copia o tempo, material.uniforms.uTempo.value = tempo`) };
}

/** A inversa de uma matriz 4 × 4 (por linhas), pela eliminação de Gauss-Jordan; null se ela não tem inversa. */
function inverse(m) {
  const a = m.map((row, i) => [...row, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const k = a[c][c];
    for (let j = 0; j < 8; j++) a[c][j] /= k;
    for (let r = 0; r < 4; r++) {
      const f = a[r][c];
      if (r !== c) for (let j = 0; j < 8; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(4));
}

/** Um ponto [x, y, z, w] da tela (como o gl_Position) de volta para o mundo, pela inversa da projeção vezes a vista (`back`). */
function unproject(back, c) {
  const h = back.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2] + row[3] * c[3]);
  return [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
}

/**
 * O que as conferências da galáxia medem: a galáxia, as estrelas que o shader desenhou, a amostra
 * da geometria com a cor de cada ponto, os uniforms `kinds`, com `timed` o tempo (o uTempo), e
 * `places`, onde cada estrela apareceu no mundo: o gl_Position levado de volta pela câmera (null
 * para as que ficaram sem gl_Position ou atrás da câmera). Senão, `result` diz o que falta ou o que esperar.
 */
function measure(facts, kinds = {}, { timed = false } = {}) {
  const galaxia = facts.objects.galaxia;
  const type = galaxia.material?.type ?? null;
  if (type !== "ShaderMaterial") return { result: check(false, `a galáxia é desenhada por ${type ? `um ${type}` : "um objeto sem material"}, e não por um ShaderMaterial`) };
  const shader = galaxia.shader;
  if (shader?.error?.stage === "link") return { result: check(false, "os dois shaders compilam, mas não se encaixam: a barra embaixo do código diz o que falta") };
  if (shader?.error) return { result: check(false, `o ${STAGE[shader.error.stage] ?? "shader"} não compila: a barra embaixo do código diz o erro e a linha`) };
  const u = uniformsOf(galaxia, kinds);
  if (u.result) return u;
  let t = 0;
  if (timed) {
    const clock = clockOf(facts, galaxia);
    if (clock.result) return clock;
    t = clock.t;
  }
  const stars = shader?.stars;
  const sample = galaxia.geometry?.sample ?? [];
  if (!stars || !sample.length || stars.count !== sample.length) return { result: check(false, "não deu para medir as estrelas da galáxia") };
  const back = inverse(multiply(stars.projection, stars.view));
  const places = Array.from({ length: stars.count }, (_, j) => {
    const c = stars.clip.slice(j * 4, j * 4 + 4);
    return back && c[3] > 1e-6 && c.every(Number.isFinite) ? unproject(back, c) : null;
  });
  return { galaxia, stars, sample, colors: galaxia.geometry.colors, u: u.values, t, playing: facts.playing, back, places };
}

/** As estrelas a menos disso do centro ficam fora da comparação das posições: lá, uma estrela dá voltas depressa demais para comparar. */
const CENTER = 0.2;

/** A distância entre onde cada estrela apareceu e onde `place(p)` a põe no mundo, sem as do centro. */
function placeErrors(m, place) {
  const errors = [];
  m.places.forEach((q, j) => {
    const p = m.sample[j];
    if (q && radius(p) >= CENTER) errors.push(dist(q, place(p)));
  });
  return errors;
}

/**
 * Se as estrelas estão onde a conta põe: 90% a até 0,005 do lugar, e 99% a até 0,02. A folga é a
 * das contas da placa de vídeo, com menos casas que as do JavaScript (o seno, o cosseno e o atan
 * de uma placa de vídeo erram na quarta casa).
 */
const fitsPlaces = (errors) => errors.length > 0 && quantile(errors, 0.9) <= 0.005 && quantile(errors, 0.99) <= 0.02;

/** A conta de onde fica cada estrela no mundo no tempo t (o da medida, se não for dado), girada como `starAt` diz (opções do giro em `o`). */
const moving = (m, o = {}) => (p, t = m.t) => toWorld(m.galaxia, starAt(p, m.u, t, o).p);

/** Se as contas `a` e `b` põem as estrelas da amostra no mesmo lugar no tempo t: uma não se distingue da outra. */
const samePlaces = (m, a, b, t) => fitsPlaces(m.sample.filter((p) => radius(p) >= CENTER).map((p) => dist(a(p, t), b(p, t))));

/** Quanto depois da medida uma variante `timed` ainda tem de ser diferente da conta certa para valer a pena esperar por ela. */
const LATER = 10;

/**
 * Confere onde as estrelas apareceram (`m`, de measure) com a conta `place` (p, t → ponto no
 * mundo), com pelo menos metade delas na frente da câmera. Se não bate, tenta as variantes [conta,
 * o que dizer, timed], os erros comuns, e diz o da que bate melhor (uma variante vale mesmo com
 * metade das estrelas atrás da câmera, como a do gl_Position sem a câmera); senão, `otherwise` ou
 * a estrela mais longe da conta. Como no mar, uma variante `timed` só erra no tempo (a galáxia
 * girando ao contrário): no começo, ela e a certa põem as estrelas no mesmo lugar, e a conferência
 * espera a galáxia girar mais, se mais tarde as duas se separam (com o giro zerado por um uniform,
 * elas nunca se separam, e não há o que esperar).
 */
function comparePlaces(m, place, variants = [], otherwise = null) {
  const shown = m.places.filter(Boolean).length >= m.places.length / 2;
  const errors = placeErrors(m, place);
  if (shown && fitsPlaces(errors)) {
    const twin = ([other, , timed]) => timed && fitsPlaces(placeErrors(m, other)) && !samePlaces(m, place, other, m.t + LATER);
    if (!variants.some(twin)) return check(true);
    return wait(m.playing ? "esperando a galáxia girar mais um pouco para conferir" : PAUSED);
  }
  let best = null;
  for (const [other, seen] of variants) {
    const e = placeErrors(m, other);
    const score = quantile(e, 0.9);
    if (fitsPlaces(e) && !(best?.score <= score)) best = { score, seen };
  }
  if (best) return check(false, best.seen);
  if (!shown) return check(false, HIDDEN);
  if (otherwise) return check(false, otherwise);
  let worst = null;
  m.places.forEach((q, j) => {
    const p = m.sample[j];
    if (!q || radius(p) < CENTER) return;
    const e = place(p);
    const d = dist(q, e);
    if (!(worst?.d >= d)) worst = { d, q, e };
  });
  return check(false, `uma estrela que a conta põe em x = ${fmt(worst.e[0])}, z = ${fmt(worst.e[2])} apareceu em x = ${fmt(worst.q[0])}, z = ${fmt(worst.q[2])}`);
}

/** O quanto o gl_PointSize de cada estrela na frente da câmera se afasta do tamanho `size(j, w)` da conta (w é a profundidade dela), em fração dele. */
function sizeErrors(m, size) {
  const errors = [];
  for (let j = 0; j < m.stars.count; j++) {
    const w = m.stars.clip[j * 4 + 3];
    if (!(w > 1e-6)) continue;
    const e = size(j, w);
    errors.push(Math.abs(m.stars.size[j] - e) / Math.max(Math.abs(e), 1));
  }
  return errors;
}

/** Se os tamanhos batem: 90% a até 0,5% do tamanho da conta, e 99% a até 2%. */
const fitsSizes = (errors) => errors.length > 0 && quantile(errors, 0.9) <= 0.005 && quantile(errors, 0.99) <= 0.02;

/**
 * Confere o tamanho de cada estrela (o gl_PointSize) com a conta `size(j, w)`, a estrela j na
 * profundidade w: o −visto.z do shader, que é o w do gl_Position. Senão, tenta as variantes
 * [conta, o que dizer] e diz o da primeira que bate, ou a estrela mais longe da conta.
 */
function compareSizes(m, size, variants = []) {
  if (m.stars.size.every((s) => s === -1)) return check(false, "o shader de vértices não escreve o gl_PointSize: sem ele, o tamanho das estrelas fica indefinido");
  const errors = sizeErrors(m, size);
  if (fitsSizes(errors)) return check(true);
  const found = variants.find(([other]) => fitsSizes(sizeErrors(m, other)));
  if (found) return check(false, found[1]);
  const at = errors.indexOf(Math.max(...errors));
  let j = -1;
  for (let k = 0, seen = -1; k < m.stars.count && seen < at; k++) if (m.stars.clip[k * 4 + 3] > 1e-6 && ++seen === at) j = k;
  const w = m.stars.clip[j * 4 + 3];
  return check(false, `uma estrela a ${fmt(w)} de profundidade tem ${fmt(m.stars.size[j])} pixels, e a conta dá ${fmt(size(j, w))}`);
}

/** O quanto a cor do meio de cada estrela se afasta da cor `color(j)` da conta ([r, g, b], de 0 a 255): o maior desvio entre r, g e b. */
function colorErrors(m, color) {
  return Array.from({ length: m.stars.count }, (_, j) => gap(Array.from(m.stars.color.subarray(j * 4, j * 4 + 3)), color(j)));
}

/** Se as cores batem: 90% a até 3 níveis de 255, e 99% a até 8. */
const fitsColors = (d) => d.length > 0 && quantile(d, 0.9) <= 3 && quantile(d, 0.99) <= 8;

/**
 * Confere a cor do meio de cada estrela com a conta `color(j, t)`. Se não bate, tenta as variantes
 * [conta, o que dizer, timed], como comparePlaces: uma variante `timed` (a espiral parada ou
 * girando ao contrário) pinta como a certa em alguns instantes, e a conferência espera.
 */
function compareColors(m, color, variants = [], otherwise = null) {
  const errors = colorErrors(m, color);
  if (fitsColors(errors)) {
    const later = m.t + LATER;
    const twin = ([other, , timed]) =>
      timed && fitsColors(colorErrors(m, other)) && !fitsColors(Array.from({ length: m.stars.count }, (_, j) => gap(color(j, later), other(j, later))));
    if (!variants.some(twin)) return check(true);
    return wait(m.playing ? "esperando os braços girarem mais um pouco para conferir" : PAUSED);
  }
  let best = null;
  for (const [other, seen] of variants) {
    const e = colorErrors(m, other);
    const score = quantile(e, 0.9);
    if (fitsColors(e) && !(best?.score <= score)) best = { score, seen };
  }
  if (best) return check(false, best.seen);
  if (otherwise) return check(false, otherwise);
  const j = errors.indexOf(Math.max(...errors));
  return check(false, `o meio de uma estrela saiu ${hex(Array.from(m.stars.color.subarray(j * 4, j * 4 + 3)))}, e a conta dá ${hex(color(j))}`);
}

/**
 * O desenho inteiro das maiores estrelas (`tiles`, nos fatos) contra a conta: em cada pixel do
 * quadrado de cada uma, `paint(meio, d)`, a cor que a conta dá a partir da cor do meio da estrela
 * na medida ([r, g, b], de 0 a 255) e da distância d do pixel ao meio, contada pelo gl_PointCoord
 * (0,5 na borda do círculo). Devolve o maior desvio entre r, g e b de cada pixel.
 */
function glowErrors(m, paint) {
  const { side, stars: chosen, pixels } = m.stars.tiles;
  const width = pixels.length / 4 / side;
  const errors = [];
  chosen.forEach((j, k) => {
    const s = m.stars.size[j];
    const middle = Array.from(m.stars.color.subarray(j * 4, j * 4 + 3));
    const [cx, cy] = [(k + 0.5) * side, 0.5 * side];
    for (let y = 0; y < side; y++) {
      for (let x = k * side; x < (k + 1) * side; x++) {
        const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
        if (Math.abs(dx) >= s / 2 || Math.abs(dy) >= s / 2) continue;
        const i = (y * width + x) * 4;
        errors.push(gap([pixels[i], pixels[i + 1], pixels[i + 2]], paint(middle, Math.hypot(dx, dy) / s)));
      }
    }
  });
  return errors;
}

/** Confere o desenho das maiores estrelas com a conta `paint` (glowErrors); senão, tenta as variantes [conta, o que dizer] e diz o da que bate melhor. */
function compareGlow(m, paint, variants = [], otherwise) {
  if (!m.stars.tiles) return check(false, HIDDEN);
  if (fitsColors(glowErrors(m, paint))) return check(true);
  let best = null;
  for (const [other, seen] of variants) {
    const e = glowErrors(m, other);
    const score = quantile(e, 0.9);
    if (fitsColors(e) && !(best?.score <= score)) best = { score, seen };
  }
  return check(false, best?.seen ?? otherwise);
}

/**
 * Confere o uTamanho: `base` vezes a densidade da tela (`pixelRatio`, nos fatos: quantos pixels da
 * imagem cabem em cada pixel da tela, como o devicePixelRatio, até 2).
 */
function sizeUniform(facts, base) {
  const u = uniformOf(facts.objects.galaxia, "uTamanho", "float");
  if (u.result) return u.result;
  const ratio = facts.pixelRatio ?? 1;
  const want = base * ratio;
  if (Math.abs(u.value - want) <= 0.01) return check(true);
  if (ratio > 1 && Math.abs(u.value - base) <= 0.01) {
    return check(false, `o uTamanho está em ${base}, e a sua tela tem ${num(ratio)} pixels da imagem em cada pixel: falta multiplicar pela densidade, ${base} * densidade`);
  }
  return check(false, `o uTamanho está em ${num(u.value)}: o passo usa ${base} * densidade, que dá ${num(want)} na sua tela`);
}

/**
 * Se o uniform `name` do giro está em 0: aí a galáxia (ou a espiral) não gira, e a conta certa é a
 * da galáxia parada, que nenhuma variante distingue. `what` é o que acontece.
 */
const stopped = (m, name, what) => (m.u[name] === 0 ? check(false, `o ${name} está em 0, e ${what}`) : null);

/** A cor de cada vértice da amostra em sRGB, de 0 a 255: a cor do meio de cada estrela dos passos 3 a 9. */
const vertexColor = (m) => (j) => srgbBytes(m.colors[j]);

/**
 * A cor do meio da estrela j nos passos 10 e 11, no tempo t: a cor dela (com `young`, misturada à cor jovem;
 * com `swapped`, na ordem trocada) vezes a luz da espiral, de 8% a 100%. `light` vai para o
 * armLight; com `start`, a espiral usa o ângulo de partida da estrela, sem o giro.
 */
function waveColor(m, { light = {}, young = false, swapped = false, start = false } = {}) {
  return (j, t = m.t) => {
    const p = m.sample[j];
    const s = starAt(p, m.u, t, { spin: SPIN.core });
    const b = armLight(m.u, start ? polar(p)[1] : s.a, s.r, t, light);
    const c = m.colors[j];
    const tint = !young ? c : swapped ? mixColor(m.u.uCorJovem, c, b) : mixColor(c, m.u.uCorJovem, b);
    return srgbBytes(tint.map((x) => x * (0.08 + 0.92 * b)));
  };
}

/** A cor média dos pontos da amostra cujo raio, em fração do maior, passa em `pick`; null se forem poucos. */
function meanColor(galaxia, pick) {
  const sample = galaxia.geometry?.sample ?? [];
  const colors = galaxia.geometry?.colors ?? [];
  const rMax = maxRadius(sample);
  const chosen = colors.filter((_, j) => pick(radius(sample[j]) / rMax));
  if (chosen.length < 5) return null;
  return [0, 1, 2].map((c) => chosen.reduce((sum, color) => sum + color[c], 0) / chosen.length);
}

/** Os uniforms de cada passo, com o tipo de cada um. */
const SIZE = { uTamanho: "float" };
const SPEED = { uVelocidade: "float" };
const CORE = { ...SPEED, uNucleo: "float" };
const WAVE = { ...CORE, uBracos: "float", uCurvatura: "float", uVelocidadeDosBracos: "float" };
const YOUNG = { ...WAVE, uCorJovem: "vec3" };

// ---------------------------------------------------------------------------
// O passo no computador

const END = codeAt(11);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: null, controls: true };

const COMPUTER = [
  computerStep({
    id: "galaxia-viva",
    title: "Galáxia viva",
    end: END,
    options: OPTIONS,
    words: {
      yours: "a sua galáxia",
      browser: "o código da galáxia precisa dele no navegador",
      privates: "`geometria`, `material` e o resto",
      stretched: "a galáxia sai esticada ou achatada",
      jump: "a galáxia daria um salto",
      animarStep: 7,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor e chamava `animar` a cada quadro. Neste passo, a galáxia vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, com os dois shaders dentro, e o que o VisuGraph fazia fica escrito no `src/main.js`, com os controles do mouse para olhar a galáxia de outros ângulos.",
    why: [
      {
        title: "E num celular?",
        text: "A galáxia roda em qualquer placa de vídeo com WebGL, as de celular inclusive. O shader de vértices faz poucas contas por estrela; o que pesa são os pixels, porque cada estrela pinta um quadrado de até uns 25 pixels de lado, e o shader de fragmentos roda em cada um deles, para as 50 mil estrelas. Se a página ficar lenta, diminua o `quantidade` ou o `uTamanho`.",
      },
      {
        title: "Dá para ter os shaders em arquivos .glsl?",
        text: "Dá, e é o jeito dos projetos maiores: cada shader num arquivo, com as cores do GLSL no editor. O Vite carrega qualquer arquivo como texto com um `?raw` no fim do caminho do import, e o texto chega ao `cena.js` como a constante de antes. No Experimente, os dois shaders vão para arquivos.",
      },
    ],
    try: [
      'Passe os shaders para arquivos: crie `src/galaxia.vert` e `src/galaxia.frag` com o texto de dentro das crases, apague as duas constantes do `src/cena.js` e importe os arquivos no começo dele, com `import vertexShader from "./galaxia.vert?raw";` e `import fragmentShader from "./galaxia.frag?raw";`.',
      "Gire a câmera com o mouse até olhar a galáxia de lado: ela é um disco fino, e a espiral quase some. De cima, a espiral aparece inteira, com as estrelas passando pelos braços.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a página abre com a galáxia girando",
      "Arrastar com o mouse gira a câmera em volta da galáxia",
      "Mudar um número no `src/cena.js` (o `uVelocidadeDosBracos`, por exemplo) e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const GALAXIA_VIVA = {
  id: "galaxia-viva",
  title: "Galáxia viva",
  level: "avancado",
  summary:
    "A galáxia do Gerador num shader de pontos: o tamanho, a cor e o brilho de cada estrela calculados na placa de vídeo, cada estrela girando na sua própria velocidade, como nas galáxias de verdade, e os braços como uma onda por onde as estrelas passam.",
  concepts: [
    "Shader de pontos",
    "gl_PointSize e gl_PointCoord",
    "Atributos no shader",
    "Cor por vértice",
    "Mistura aditiva",
    "Coordenadas polares",
    "Curva de rotação",
    "Ondas de densidade",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "partida",
      title: "A galáxia de partida",
      view: "camera",
      goal:
        "Neste projeto, a galáxia do Gerador de galáxias vai para a placa de vídeo. Um shader escrito por você decide o tamanho, a cor e o brilho de cada estrela e, no fim, faz cada uma girar na sua própria velocidade, como numa galáxia de verdade, com braços que não se desmancham. O ponto de partida é a galáxia do Gerador, sem o céu: 50 mil estrelas num `THREE.Points`, com três braços em espiral, o disco fino e a cor passando do laranja do núcleo ao azul da borda.",
      lines: [
        {
          code: "const quantidade = 50000;",
          text: "50 mil estrelas, todas num objeto só. Um `THREE.Points` desenha cada vértice da geometria como um ponto, e a galáxia inteira vai para a placa de vídeo num pedido só.",
        },
        {
          code: "function gaussiana() {",
          text: "Sorteia um número com a distribuição normal, pelo método de Box–Muller: quase sempre perto de 0, de vez em quando longe. É o que espalha as estrelas em volta da linha de cada braço, mais juntas no meio dele.",
        },
        {
          code: "  const angulo = (braco / bracos) * Math.PI * 2 + r * curvatura;",
          text: "O braço da estrela (`i % bracos`, um de cada vez) dá o ângulo de partida, e o `r * curvatura` gira a estrela mais quanto mais longe ela está do centro: é o que curva os braços em espiral.",
        },
        {
          code: "  posicoes[i3 + 1] = gaussiana() * dispersao * 0.3;",
          text: "A altura, com 30% da dispersão dos lados: o disco fica fino, como o das galáxias espirais.",
        },
        {
          code: "  cor.lerpColors(corNucleo, corBorda, r / raio);",
          text: "A cor passa do laranja ao azul conforme a distância ao centro. A `THREE.Color` guarda os números no espaço linear, o das contas de luz, e é assim que o shader vai recebê-los.",
        },
        {
          code: 'geometria.setAttribute("color", new THREE.BufferAttribute(cores, 3));',
          text: "A cor de cada estrela num atributo de 3 números por vértice. O nome `color` importa: é o atributo que o `vertexColors: true` usa, e o shader vai lê-lo com esse nome.",
        },
        {
          code: "  size: 0.03,",
          text: "O lado de cada ponto em unidades da cena. Com o `sizeAttenuation`, o `PointsMaterial` calcula quantos pixels cada estrela ocupa pela distância à câmera: daqui a três passos, essa conta vai para o seu shader.",
        },
        {
          code: "  blending: THREE.AdditiveBlending,",
          text: "A luz de cada estrela soma com a que já está no pixel, e o `depthWrite: false` de cima deixa todas somarem. A soma sai no próximo passo e volta no passo 6, com o brilho das estrelas.",
        },
      ],
      why: [
        {
          title: "Por que passar a galáxia para um shader?",
          text: "O `PointsMaterial` faz bem o que faz: um quadradinho de uma cor em cada vértice. Para cada estrela brilhar como um ponto de luz, forte no meio e apagada na borda, alguém precisa calcular a cor de cada pixel dela, e quem faz isso é o shader de fragmentos. E para cada estrela girar na sua velocidade, as 50 mil posições mudam a cada quadro: no JavaScript, seriam 50 mil senos e cossenos e a geometria inteira mandada de novo para a placa de vídeo, 60 vezes por segundo. No shader de vértices, cada estrela calcula o seu lugar na placa de vídeo, todas ao mesmo tempo, e o JavaScript só manda o tempo.",
        },
        {
          title: "Como é uma galáxia espiral de verdade?",
          text: "Um disco de bilhões de estrelas, gás e poeira girando em volta do centro, com um núcleo de estrelas velhas e alaranjadas e braços onde nascem as estrelas novas, quentes e azuladas, que brilham muito. A Via Láctea é assim: o Sol fica no disco, a uns 26 mil anos-luz do centro, e leva uns 230 milhões de anos para dar uma volta.",
        },
      ],
      try: [
        "Troque o `50000` por `5000`: a galáxia fica rala, e dá para ver cada estrela. A conferência avisa. Depois volte.",
        "Troque o `size: 0.03` por `size: 0.1`: as estrelas viram quadrados maiores, e a soma da luz estoura o núcleo em branco. Depois volte.",
        "Desligue a Câmera do código e gire a vista: de lado, a galáxia é um disco fino.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A galáxia é um THREE.Points com 50 mil estrelas",
          test: ({ objects }) => {
            const g = objects.galaxia;
            if (g.type !== "Points") return check(false, `a galáxia é um ${g.type}, e não um THREE.Points`);
            const n = g.geometry?.vertices ?? 0;
            return check(n >= 50000, `a galáxia tem ${int(n)} estrelas: são 50.000`);
          },
        },
        {
          text: "As estrelas formam 3 braços em espiral",
          test: ({ objects }) => {
            const sample = objects.galaxia.geometry?.sample ?? [];
            if (!sample.length) return check(false, "a geometria não tem posições");
            const arms = armsOf(sample, { inner: 0.3 });
            if (arms.strength < 0.25) return check(false, "as estrelas não formam braços");
            if (arms.arms !== 3) return check(false, `achei ${arms.arms} ${arms.arms === 1 ? "braço" : "braços"}: são 3`);
            return check(Math.abs(arms.k) >= 0.3, "os braços são retos: falta a curvatura, o r * curvatura no ângulo");
          },
        },
        {
          text: "A cor vai do laranja do núcleo ao azul da borda (vertexColors: true)",
          test: ({ objects }) => {
            const g = objects.galaxia;
            if (!g.material?.vertexColors) return check(false, "vertexColors está desligado");
            const inside = meanColor(g, (f) => f < 0.3);
            const outside = meanColor(g, (f) => f > 0.7);
            if (!inside || !outside) return check(false, "a geometria não tem uma cor para cada estrela");
            return check(inside[0] > inside[2] && outside[2] > outside[0], "o núcleo e a borda não têm as cores do Gerador: laranja no meio, azul na borda");
          },
        },
        {
          text: "As estrelas somam a luz, sem gravar a profundidade",
          test: ({ objects }) => {
            const m = objects.galaxia.material;
            if (m?.blending !== "AdditiveBlending") return check(false, "a mistura não é a aditiva: falta o blending: THREE.AdditiveBlending");
            return check(m.depthWrite === false, "o material grava a profundidade: falta o depthWrite: false");
          },
        },
      ],
    },
    {
      id: "shader",
      title: "O primeiro shader de pontos",
      view: "camera",
      goal:
        "O `PointsMaterial` sai, e entra um `ShaderMaterial`, com os dois programas em GLSL que a placa de vídeo roda para desenhar as estrelas. O shader de vértices roda uma vez para cada estrela e diz duas coisas: onde ela aparece na tela, no `gl_Position`, e quantos pixels tem o lado do quadrado dela, no `gl_PointSize`. O de fragmentos roda para cada pixel desse quadrado e diz a cor. Por enquanto, cada estrela é um quadrado branco de 2 pixels, e a mistura volta a ser a normal: cada estrela cobre o que está atrás dela.",
      lines: [
        {
          code: "const vertexShader = /* glsl */ `",
          text: "O shader de vértices, num texto entre crases. O three.js manda o texto para a placa de vídeo, que o compila e o roda uma vez para cada estrela, as 50 mil, a cada quadro. O comentário `/* glsl */` avisa editores como o VS Code, com uma extensão de GLSL, para colorir o texto como GLSL.",
        },
        {
          code: "    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          text: "O lugar da estrela na tela. `position` é o vértice da geometria, um `vec3`; com o 1.0 no fim, vira um `vec4`, que é o que as matrizes 4 × 4 pedem. A `modelViewMatrix` leva o ponto para o espaço da câmera, juntando o lugar da galáxia na cena e o da câmera, e a `projectionMatrix` aplica a perspectiva. O three.js declara as duas e o `position` antes do seu código, e as preenche a cada desenho.",
        },
        {
          code: "    gl_PointSize = 2.0;",
          text: "O lado do quadrado da estrela, em pixels da imagem. Só os pontos têm essa saída: num triângulo, quem decide o tamanho são os três vértices. É `2.0`, e não `2`: no GLSL, um número inteiro não vira `float` sozinho.",
        },
        {
          code: "const fragmentShader = /* glsl */ `",
          text: "O shader de fragmentos, que roda para cada pixel de cada estrela: com 2 × 2 pixels por estrela, umas 200 mil vezes por quadro.",
        },
        {
          code: "    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);",
          text: "A cor do pixel: vermelho, verde, azul e opacidade, de 0 a 1. Branco, por enquanto.",
        },
        {
          code: "const material = new THREE.ShaderMaterial({",
          text: "O material com os dois shaders. Sem o `blending` e o `depthWrite`, ele fica com a mistura normal: o pixel da estrela cobre o que estava ali, e a profundidade é gravada, então a estrela da frente esconde a de trás.",
        },
      ],
      why: [
        {
          title: "O que a placa de vídeo faz com um ponto?",
          text: "Para cada vértice, ela roda o shader de vértices e pega o `gl_Position` e o `gl_PointSize`. Depois divide o `gl_Position` pelo quarto número dele, o `w`, e é essa divisão que faz a perspectiva: o que está longe chega mais perto do meio da tela. Em volta desse lugar, ela monta um quadrado com `gl_PointSize` pixels de lado e roda o shader de fragmentos em cada pixel dele. Um ponto é sempre um quadrado na tela, de frente para a câmera; uma estrela redonda vai ser conta do shader de fragmentos.",
        },
        {
          title: "Por que tirar a mistura aditiva?",
          text: "Com 50 mil quadrados de 2 × 2 pixels somando luz, o meio da galáxia estoura em branco, e nos próximos passos não daria para ver as cores e os tamanhos das estrelas. Com a mistura normal, cada pixel mostra uma estrela só, a da frente. A soma volta no passo 6, quando cada estrela ganhar o seu brilho.",
        },
      ],
      try: [
        "Troque o `2.0` do `gl_PointSize` por `6.0`: as estrelas viram quadrados grandes, que se cobrem. Depois volte.",
        "Troque o `2.0` por `2`: o GLSL não aceita, e a barra embaixo do código mostra o erro na linha. Depois volte.",
        "Troque a cor do `gl_FragColor` por `vec4(1.0, 0.8, 0.2, 1.0)`: todas as estrelas ficam amarelas. Depois volte.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A galáxia é desenhada por um ShaderMaterial",
          test: ({ objects }) => {
            const type = objects.galaxia.material?.type ?? null;
            return check(type === "ShaderMaterial", `a galáxia é desenhada por ${type ? `um ${type}` : "um objeto sem material"}, e não por um ShaderMaterial`);
          },
        },
        {
          text: "Cada estrela aparece no seu lugar: projectionMatrix * modelViewMatrix * vec4(position, 1.0)",
          test: (facts) => {
            const m = measure(facts);
            if (m.result) return m.result;
            // sem a câmera, o gl_Position é a projeção do ponto como se a câmera estivesse na
            // origem; sem a projeção, é o ponto no espaço da câmera, com w = 1
            const view = m.stars.view;
            const camera = inverse(view);
            const world = (p) => [...toWorld(m.galaxia, p), 1];
            return comparePlaces(m, moving(m), [
              [(p) => unproject(camera, world(p)), "a câmera ficou de fora: o ponto passa pela modelViewMatrix, projectionMatrix * modelViewMatrix * vec4(position, 1.0)"],
              [(p) => unproject(m.back, [...unproject(view, world(p)), 1]), "falta a perspectiva: o ponto passa pela projectionMatrix, projectionMatrix * modelViewMatrix * vec4(position, 1.0)"],
            ]);
          },
        },
        {
          text: "Cada estrela é um quadrado de 2 pixels",
          test: (facts) => {
            const m = measure(facts);
            if (m.result) return m.result;
            const first = m.stars.size[0];
            if (first !== 2 && m.stars.size.every((s) => s === first) && first !== -1) return check(false, `as estrelas têm ${num(first)} pixels: o passo usa gl_PointSize = 2.0`);
            return compareSizes(m, () => 2);
          },
        },
        {
          text: "As estrelas são brancas",
          test: (facts) => {
            const m = measure(facts);
            if (m.result) return m.result;
            return compareColors(m, () => [255, 255, 255]);
          },
        },
      ],
    },
    {
      id: "cor",
      title: "A cor de cada estrela",
      view: "camera",
      goal:
        "Cada estrela volta a ter a sua cor, agora pelo shader. O shader de vértices lê a cor do vértice no atributo `color` e a passa adiante num varying, o `vCor`. O shader de fragmentos recebe o `vCor` e pinta a estrela com ele, convertido para sRGB, o espaço de cor da tela. Com a mistura normal, as cores aparecem como são: o laranja no núcleo, o azul na borda e, entre os dois, o violeta da mistura.",
      lines: [
        {
          code: "  varying vec3 vCor;",
          after: "const vertexShader",
          text: "Um varying: um valor que o shader de vértices escreve e o de fragmentos lê. Ele é declarado igual nos dois shaders, com o mesmo nome e o mesmo tipo, e é pelo nome que a placa de vídeo liga um ao outro.",
        },
        {
          code: "    vCor = color;",
          text: "`color` é o atributo com a cor do vértice, que o three.js declara no shader quando o material tem `vertexColors: true`. Cada estrela guarda a sua cor no `vCor`.",
        },
        {
          code: "  varying vec3 vCor;",
          after: "const fragmentShader",
          text: "O mesmo varying, agora do lado de quem recebe.",
        },
        {
          code: "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
          text: "A conversão do espaço linear para o sRGB, com a fórmula do padrão: o `THREE.Color` guarda as cores no espaço linear, e a tela espera sRGB. É a função `paraSRGB` do projeto do Phong, que explica cada pedaço dela.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(vCor), 1.0);",
          text: "Cada pixel da estrela recebe a cor dela, em sRGB.",
        },
        {
          code: "  vertexColors: true,",
          text: "Liga a cor por vértice: o three.js declara `attribute vec3 color;` no começo do shader de vértices, e o atributo `color` da geometria chega lá. Sem esta linha, o `color` não existe no shader, e ele não compila.",
        },
      ],
      why: [
        {
          title: "Por que um varying, e não o color direto no shader de fragmentos?",
          text: "Os atributos só existem no shader de vértices: o de fragmentos roda por pixel, e um pixel não é um vértice. O que um pixel sabe chega pelo varying, que a placa de vídeo leva do vértice até ele. Num triângulo, ela mistura os valores dos três vértices conforme a distância do pixel a cada um; num ponto, todos os pixels do quadrado recebem o valor do único vértice.",
        },
        {
          title: "Por que converter para sRGB?",
          text: "As contas de luz são feitas no espaço linear, em que o dobro do número é o dobro da luz. A tela não funciona assim: ela espera números em sRGB, que guarda mais tons escuros, onde o olho percebe mais diferença. Os materiais do three.js convertem no fim de cada pixel; num `ShaderMaterial`, a conversão é por nossa conta. Sem ela, as cores saem mais escuras e carregadas.",
        },
      ],
      try: [
        "Troque o `paraSRGB(vCor)` por `vCor`: as cores ficam mais escuras e carregadas, e a conferência avisa. Depois volte.",
        "Apague a linha do `vertexColors: true`: o shader não compila, porque o `color` deixa de existir. Depois desfaça.",
        "Troque o `vCor = color;` por `vCor = vec3(color.b, color.g, color.r);`: o núcleo fica azulado, e a borda, alaranjada. Depois volte.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O material usa a cor de cada vértice (vertexColors: true)",
          test: ({ objects }) => check(!!objects.galaxia.material?.vertexColors, "vertexColors está desligado"),
        },
        {
          text: "Cada estrela tem a cor do seu vértice, em sRGB",
          test: (facts) => {
            const m = measure(facts);
            if (m.result) return m.result;
            if (!m.colors) return check(false, "a geometria não tem o atributo color");
            return compareColors(m, vertexColor(m), [
              [() => [255, 255, 255], "as estrelas ainda são brancas: o gl_FragColor pinta com o vCor, vec4(paraSRGB(vCor), 1.0)"],
              [(j) => m.colors[j].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)), NO_SRGB],
            ]);
          },
        },
      ],
    },
    {
      id: "distancia",
      title: "Perto, maior; longe, menor",
      view: "camera",
      goal:
        "No `PointsMaterial`, as estrelas de perto eram maiores que as de longe, como tudo na perspectiva. Com o `gl_PointSize` fixo em 2, todas têm o mesmo tamanho. O tamanho certo cai com a distância: o dobro da distância, metade do tamanho. O shader calcula onde a estrela fica no espaço da câmera, em que o −z é a profundidade, a distância à frente dela, e divide um tamanho de base, o uniform `uTamanho`, por essa profundidade.",
      lines: [
        {
          code: "  uniform float uTamanho;",
          text: "O tamanho de base, que chega do JavaScript, igual para todas as estrelas.",
        },
        {
          code: "    vec4 visto = modelViewMatrix * vec4(position, 1.0);",
          text: "A estrela no espaço da câmera, com a câmera na origem olhando para o −z. O `visto.z` é negativo para tudo o que está na frente dela, e o −visto.z é a profundidade.",
        },
        {
          code: "    gl_Position = projectionMatrix * visto;",
          text: "A mesma conta de antes, em dois pedaços: a projeção aplicada ao ponto já no espaço da câmera.",
        },
        {
          code: "    gl_PointSize = uTamanho / -visto.z;",
          text: "O tamanho de base dividido pela profundidade. Uma estrela na borda da frente da galáxia, a 12 de profundidade, fica com 2,5 pixels; uma na borda do fundo, a 20,5, com 1,5.",
        },
        {
          code: "const densidade = Math.min(window.devicePixelRatio, 2);",
          text: "Quantos pixels da imagem cabem em cada pixel da tela: 1 numa tela comum, 2 ou 3 numa de alta densidade, como a de um celular. O visor do VisuGraph desenha com no máximo 2, e o `Math.min` acompanha.",
        },
        {
          code: "    uTamanho: { value: 30 * densidade },",
          text: "30 pixels a 1 de profundidade, vezes a densidade, para a estrela ter o mesmo tamanho em qualquer tela. A galáxia fica a uns 16 da câmera, e as estrelas, com uns 2 pixels, como antes.",
        },
      ],
      why: [
        {
          title: "Por que dividir pela profundidade?",
          text: "É a regra da perspectiva: o tamanho na tela é o tamanho de verdade dividido pela distância. A placa de vídeo faz essa divisão para as posições, pelo `w` do `gl_Position`, que é justamente o −visto.z; o `gl_PointSize` não passa por ela, então a divisão fica por nossa conta. O `PointsMaterial` faz a mesma conta no shader dele: o `size` vezes a densidade, vezes a metade da altura do visor, dividido pela profundidade.",
        },
        {
          title: "Por que a densidade?",
          text: "O `gl_PointSize` é contado em pixels da imagem, e não da tela. Numa tela de alta densidade, o three.js desenha a imagem com 2 pixels para cada pixel da tela, e uma estrela de 2 pixels da imagem fica com a metade do tamanho que teria numa tela comum. Multiplicando pela densidade, ela ocupa o mesmo espaço nas duas.",
        },
      ],
      try: [
        "Troque o `-visto.z` por `visto.z`: o tamanho fica negativo, e as estrelas somem. A conferência avisa. Depois volte.",
        "Troque o `30 * densidade` por `90 * densidade`: as estrelas ficam com o triplo do tamanho e se cobrem. Depois volte.",
        "Desligue a Câmera do código e aproxime a vista da galáxia: as estrelas crescem conforme a vista chega perto.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uTamanho é 30 vezes a densidade da tela",
          test: (facts) => sizeUniform(facts, 30),
        },
        {
          text: "Cada estrela continua no seu lugar",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            return comparePlaces(m, moving(m));
          },
        },
        {
          text: "O tamanho cai com a profundidade: gl_PointSize = uTamanho / -visto.z",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            const u = m.u.uTamanho;
            return compareSizes(m, (j, w) => u / w, [
              [() => 2, "as estrelas ainda têm 2 pixels: o tamanho é o uTamanho dividido pela profundidade, uTamanho / -visto.z"],
              [() => u, "o tamanho não muda com a profundidade: falta dividir pelo -visto.z, uTamanho / -visto.z"],
              [(j, w) => u * w, "as estrelas crescem com a profundidade: o uTamanho é dividido pelo -visto.z, e não multiplicado"],
              [(j, w) => -u / w, "o tamanho saiu negativo, e as estrelas sumiram: na frente da câmera, o visto.z é negativo, e a profundidade é o -visto.z"],
            ]);
          },
        },
      ],
    },
    {
      id: "tamanhos",
      title: "Estrelas de vários tamanhos",
      view: "camera",
      goal:
        "No céu, poucas estrelas são muito brilhantes, e a maioria é fraca. Cada estrela ganha um número só dela, a escala, guardado num atributo novo da geometria, o `aEscala`. O sorteio deixa a maioria pequena, perto de 0,5, e poucas grandes, até 2,5. No shader, o tamanho de cada estrela é multiplicado pela escala dela.",
      lines: [
        {
          code: "const escalas = new Float32Array(quantidade);",
          text: "Uma lista com um número por estrela, e não três: a escala é um número só.",
        },
        {
          code: "  escalas[i] = 0.5 + 2 * Math.random() ** 3;",
          text: "O sorteio elevado ao cubo, `Math.random() ** 3`, junta os números perto de 0: metade fica abaixo de 0,125 (0,5³). Vezes 2, mais 0,5, a escala vai de 0,5 a 2,5, e metade das estrelas fica abaixo de 0,75.",
        },
        {
          code: 'geometria.setAttribute("aEscala", new THREE.BufferAttribute(escalas, 1));',
          text: "O atributo novo, com 1 número por vértice. O nome é escolha nossa; o `a` na frente é um costume para lembrar que é um atributo, como o `u` dos uniforms e o `v` dos varyings.",
        },
        {
          code: "  attribute float aEscala;",
          text: "No shader, o atributo é declarado com o mesmo nome, e o tipo `float`. O three.js liga cada atributo da geometria ao do shader pelo nome; o `position` e o `color` não precisam ser declarados porque o three.js já os declara.",
        },
        {
          code: "    gl_PointSize = uTamanho * aEscala / -visto.z;",
          text: "O tamanho pela profundidade, vezes a escala da estrela.",
        },
      ],
      why: [
        {
          title: "Uniform ou atributo?",
          text: "Um uniform tem um valor só para todas as estrelas, que o JavaScript muda quando quiser, como o `uTamanho`. Um atributo tem um valor por vértice, guardado na geometria e mandado uma vez para a placa de vídeo, como a posição e a cor. A escala é de cada estrela, então é atributo.",
        },
        {
          title: "Por que tão poucas grandes?",
          text: "Nas galáxias, as estrelas grandes e brilhantes são raras: a maioria das estrelas da Via Láctea são anãs vermelhas, menores e mais fracas que o Sol. Com todas do mesmo tamanho, a galáxia parece uma névoa uniforme; com poucas grandes espalhadas, o olho lê estrelas.",
        },
      ],
      try: [
        "Troque o `Math.random() ** 3` por `Math.random()`: os tamanhos se espalham por igual, e metade das estrelas fica grande. A conferência avisa. Depois volte.",
        "Troque o `0.5 + 2 *` por `0.5 + 6 *`: algumas estrelas ficam enormes. Depois volte.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A geometria tem o atributo aEscala, de 0,5 a 2,5, com a maioria das estrelas pequenas",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            const scales = m.stars.attributes.aEscala;
            if (!scales) return check(false, `a geometria não tem o atributo aEscala, só ${facts.objects.galaxia.geometry.attributes.join(", ")}`);
            if (!(scales instanceof Float32Array)) return check(false, "o aEscala tem mais de um número por estrela: é BufferAttribute(escalas, 1)");
            const [low, high] = [Math.min(...scales), Math.max(...scales)];
            if (low < 0.49 || high > 2.51) return check(false, `as escalas vão de ${fmt(low)} a ${fmt(high)}: são de 0,5 a 2,5`);
            const middle = quantile(scales, 0.5);
            return check(middle < 1, `metade das estrelas tem escala acima de ${fmt(middle)}: com o Math.random() ** 3, a maioria fica pequena, perto de 0,5`);
          },
        },
        {
          text: "Cada estrela tem o tamanho da sua escala: gl_PointSize = uTamanho * aEscala / -visto.z",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            const u = m.u.uTamanho;
            const scales = m.stars.attributes.aEscala;
            if (!(scales instanceof Float32Array)) return check(false, "a geometria não tem o atributo aEscala, com um número por estrela");
            return compareSizes(m, (j, w) => (u * scales[j]) / w, [
              [(j, w) => u / w, "as estrelas à mesma profundidade ainda têm o mesmo tamanho: falta multiplicar pelo aEscala, uTamanho * aEscala / -visto.z"],
            ]);
          },
        },
      ],
    },
    {
      id: "brilho",
      title: "O brilho das estrelas",
      view: "camera",
      goal:
        "Até aqui, cada estrela é um quadrado chapado. Uma estrela de verdade é um ponto de luz, forte no meio e se apagando em volta. Quem sabe onde cada pixel está dentro do quadrado é o `gl_PointCoord`, que vai de (0, 0) num canto a (1, 1) no outro. O shader de fragmentos mede a distância do pixel ao meio e faz a luz cair rápido até a borda do círculo. A luz das estrelas volta a se somar, e os quadrados dobram de lado, para o brilho ter onde se espalhar.",
      lines: [
        {
          code: "    float d = distance(gl_PointCoord, vec2(0.5));",
          text: "A distância do pixel ao meio do quadrado, que fica em (0,5; 0,5). Vale 0 no meio, 0,5 no meio de cada lado e uns 0,71 nos cantos.",
        },
        {
          code: "    float forca = pow(max(1.0 - 2.0 * d, 0.0), 6.0);",
          text: "O `1.0 - 2.0 * d` vai de 1, no meio, a 0, na borda do círculo, e fica negativo fora dele; o `max` corta o negativo em 0, porque o `pow` de um número negativo não tem valor no GLSL. Elevado a 6, ele cai rápido: na metade do caminho até a borda, a força já é 1/64.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(vCor) * forca, 1.0);",
          text: "A cor da estrela vezes a força. A força multiplica a cor já em sRGB: se entrasse antes, a conversão, que clareia os tons escuros, espalharia o brilho pelo quadrado inteiro, e as estrelas virariam bolas borradas.",
        },
        {
          code: "    uTamanho: { value: 60 * densidade },",
          text: "O dobro do tamanho de antes. Com o brilho, só o meio da estrela tem luz forte; o resto do quadrado é a luz se apagando.",
        },
        {
          code: "  depthWrite: false,",
          text: "Sem gravar a profundidade: senão, o quadrado de uma estrela de perto esconderia as de trás, até nos cantos pretos, e elas não somariam a sua luz.",
        },
        {
          code: "  blending: THREE.AdditiveBlending,",
          text: "A mistura aditiva de volta: a cor de cada pixel da estrela soma com a que já está ali. Os cantos do quadrado, pretos, somam zero e não escondem nada.",
        },
      ],
      why: [
        {
          title: "O que é o gl_PointCoord?",
          text: "Uma entrada do shader de fragmentos que só existe nos pontos: a posição do pixel dentro do quadrado da estrela, de 0 a 1 em cada direção, com o (0, 0) no canto de cima, à esquerda. Com ele, o mesmo shader desenha qualquer coisa dentro do quadrado: um círculo, um brilho, um anel.",
        },
        {
          title: "Por que a luz cai tão rápido?",
          text: "Uma estrela de verdade está tão longe que é um ponto só; o brilho em volta é a luz que se espalha no olho e na lente. Ele é forte bem no meio e cai rápido, e é isso que o expoente 6 imita. Com uma queda reta, sem o `pow`, as estrelas viram bolas embaçadas que se misturam umas com as outras.",
        },
        {
          title: "Por que a soma não estoura mais em branco?",
          text: "Cada estrela agora manda bem menos luz: só o meio brilha forte, e o resto é quase preto. Somadas, as 50 mil estrelas clareiam o núcleo, onde estão juntas, sem apagar as cores da borda.",
        },
      ],
      try: [
        "Troque o `6.0` do `pow` por `1.0`: a luz cai em linha reta, e as estrelas viram bolas embaçadas. A conferência avisa. Depois volte.",
        "Troque a linha do `forca` por `float forca = d < 0.5 ? 1.0 : 0.0;`: as estrelas viram bolinhas chapadas, sem brilho. Depois volte.",
        "Apague a linha do `blending`: o quadrado preto de cada estrela cobre as que foram desenhadas antes, e a galáxia quase some. A conferência avisa. Depois desfaça.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uTamanho é 60 vezes a densidade da tela",
          test: (facts) => sizeUniform(facts, 60),
        },
        {
          text: "As estrelas somam a luz, sem gravar a profundidade",
          test: ({ objects }) => {
            const m = objects.galaxia.material;
            if (m?.blending !== "AdditiveBlending") return check(false, "a mistura não é a aditiva: falta o blending: THREE.AdditiveBlending, que soma a luz das estrelas");
            return check(m.depthWrite === false, "o material grava a profundidade: falta o depthWrite: false, senão os cantos de uma estrela escondem as de trás");
          },
        },
        {
          text: "O meio de cada estrela tem a cor dela",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            if (!m.colors) return check(false, "a geometria não tem o atributo color");
            return compareColors(m, vertexColor(m));
          },
        },
        {
          text: "A luz de cada estrela cai rápido do meio até a borda do círculo",
          test: (facts) => {
            const m = measure(facts, SIZE);
            if (m.result) return m.result;
            const times = (f) => (c, d) => c.map((x) => x * f(d));
            return compareGlow(
              m,
              times(glow),
              [
                [times(() => 1), "as estrelas ainda são quadrados chapados: falta a força cair do meio para a borda, com o gl_PointCoord"],
                [times((d) => (d <= 0.5 ? 1 : 0)), "as estrelas são bolinhas chapadas: a força cai do meio para a borda, pow(max(1.0 - 2.0 * d, 0.0), 6.0)"],
                [times((d) => Math.max(1 - 2 * d, 0)), "a luz cai devagar demais, e as estrelas viram bolas embaçadas: falta elevar a 6, pow(max(1.0 - 2.0 * d, 0.0), 6.0)"],
                [times((d) => Math.max(1 - d, 0) ** 6), "a luz não chega a zero na borda do círculo: o d vai até 0,5 na borda, por isso o 2.0 em 1.0 - 2.0 * d"],
                [(c, d) => c.map((x) => 255 * toSRGB(fromSRGB(x / 255) * glow(d))), "a força entrou antes da paraSRGB, que clareia os tons fracos e espalha o brilho: é paraSRGB(vCor) * forca"],
              ],
              "o brilho das estrelas não cai como a conta do passo: forte no meio, se apagando até a borda do círculo, com pow(max(1.0 - 2.0 * d, 0.0), 6.0)",
            );
          },
        },
      ],
    },
    {
      id: "giro",
      title: "A galáxia gira no shader",
      view: "camera",
      motion: true,
      goal:
        "No Gerador, a galáxia girava inteira, com o `galaxia.rotation.y` no `animar`. Agora quem gira cada estrela é o shader de vértices, com o tempo que chega do JavaScript no uniform `uTempo`. Para girar um ponto em volta do centro, o jeito mais simples é pensar em coordenadas polares: a distância ao centro, que não muda, e o ângulo, que diminui com o tempo. Por enquanto, todas as estrelas giram juntas, 0,1 radiano por segundo, como no Gerador; o próximo passo muda isso.",
      lines: [
        {
          code: "  uniform float uTempo;",
          text: "O tempo, em segundos, igual para todas as estrelas.",
        },
        {
          code: "    vec3 p = position;",
          text: "Uma cópia da posição, para mudar: o `position` é um atributo, e o shader não pode escrever nele.",
        },
        {
          code: "    float r = length(p.xz);",
          text: "A distância ao centro no chão da galáxia, o plano xz. O `p.xz` monta um `vec2` com o x e o z do ponto, e o `length` dá o comprimento dele.",
        },
        {
          code: "    float angulo = atan(p.z, p.x);",
          text: "O ângulo do ponto no chão, medido a partir do eixo x. O `atan` com dois números é o `Math.atan2` do JavaScript, com o z primeiro, e dá de −π a π.",
        },
        {
          code: "    angulo -= uTempo * 0.1;",
          text: "O giro: 0,1 radiano a menos por segundo. É o mesmo sentido do `galaxia.rotation.y = tempo * 0.1` do Gerador: girar em volta do y com um ângulo positivo diminui o ângulo medido do x para o z.",
        },
        {
          code: "    p.x = cos(angulo) * r;",
          text: "De volta das polares para x e z, com esta linha e a de baixo: o ponto na mesma distância do centro, no ângulo novo. O y fica como estava.",
        },
        {
          code: "    vec4 visto = modelViewMatrix * vec4(p, 1.0);",
          text: "A câmera agora vê o ponto girado, o `p`, e não mais o `position`.",
        },
        {
          code: "  material.uniforms.uTempo.value = tempo;",
          text: "A cada quadro, o tempo vai para o uniform. O three.js manda os uniforms para a placa de vídeo antes de cada desenho.",
        },
      ],
      why: [
        {
          title: "Por que girar no shader, se o rotation.y fazia o mesmo?",
          text: "Para girar a galáxia inteira, o `rotation.y` é mesmo o melhor caminho: o three.js muda uma matriz, e pronto. Só que ele gira tudo junto, como um disco duro, e uma galáxia não gira assim. No shader, cada estrela calcula o seu ângulo, e no próximo passo cada uma vai girar na sua velocidade, o que nenhuma matriz da malha consegue fazer.",
        },
        {
          title: "Por que coordenadas polares?",
          text: "Girar em volta do centro é mudar o ângulo e deixar a distância igual. Em x e z, isso pede senos e cossenos de qualquer jeito; escrevendo o ângulo e a distância de cada estrela, o giro vira uma linha só. E o que vem depois, a velocidade de cada estrela pelo raio e os braços em espiral, fica na mesma linguagem.",
        },
      ],
      try: [
        "Troque o `-=` por `+=`: a galáxia gira para o outro lado, com as pontas dos braços indo na frente. A conferência avisa. Depois volte.",
        "Troque o `0.1` por `1.0`: uma volta a cada 6 segundos e pouco. Depois volte.",
        "Pause a animação com o botão da barra de cima: o tempo para, e a galáxia congela.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.galaxia).result ?? check(true),
        },
        {
          text: "A galáxia gira 0,1 radiano por segundo, no sentido do Gerador",
          test: (facts) => {
            const m = measure(facts, {}, { timed: true });
            if (m.result) return m.result;
            return comparePlaces(m, moving(m, { spin: SPIN.rigid }), [
              [moving(m), "a galáxia não gira: falta diminuir o ângulo, angulo -= uTempo * 0.1, e a câmera ver o ponto girado, modelViewMatrix * vec4(p, 1.0)", true],
              [moving(m, { spin: SPIN.rigid, backwards: true }), "a galáxia gira para o outro lado, com as pontas dos braços na frente: o ângulo diminui, angulo -= uTempo * 0.1", true],
              [moving(m, { spin: SPIN.rigid, swapped: true }), "a galáxia ficou espelhada: no atan, o z vem primeiro, atan(p.z, p.x)"],
            ]);
          },
        },
      ],
    },
    {
      id: "velocidade",
      title: "Cada estrela na sua velocidade",
      view: "camera",
      motion: true,
      goal:
        "Numa galáxia de verdade, as estrelas não giram todas juntas. Longe do centro, elas andam mais ou menos na mesma velocidade, uns 230 km/s no caso do Sol. Com a mesma velocidade, a volta de quem está perto do centro é mais curta e termina antes: o ângulo de cada estrela muda a velocidade dividida pela distância ao centro. Com o tempo, os braços se enrolam, cada vez mais apertados, e em um minuto a espiral vira um novelo: é o problema do enrolamento, que os astrônomos conhecem bem.",
      lines: [
        {
          code: "  uniform float uVelocidade;",
          text: "A velocidade das estrelas, em unidades da cena por segundo, igual para todas.",
        },
        {
          code: "    angulo -= uTempo * uVelocidade / r;",
          text: "Andando a `uVelocidade` numa volta de raio r, a estrela gira `uVelocidade / r` radianos por segundo: a 1 do centro, 0,5 por segundo, uma volta a cada 12,6 segundos; na borda, a 5, 0,1 por segundo, uma volta a cada 63.",
        },
        {
          code: "    uVelocidade: { value: 0.5 },",
          text: "0,5 por segundo: na borda, as estrelas giram como antes, a 0,1 radiano por segundo; mais para dentro, mais rápido.",
        },
      ],
      why: [
        {
          title: "Por que a mesma velocidade, e não o mesmo giro?",
          text: "Se só as estrelas que vemos puxassem umas às outras, as de fora andariam mais devagar, como os planetas longe do Sol. Nos anos 1970, Vera Rubin mediu a velocidade das estrelas em várias galáxias e achou outra coisa: longe do centro, a velocidade quase não cai. Há mais massa do que a que brilha, espalhada em volta de cada galáxia: a matéria escura. A conta com a velocidade igual é a de uma galáxia com matéria escura.",
        },
        {
          title: "O que é o problema do enrolamento?",
          text: "Um braço é uma fila de estrelas, do centro à borda. Se cada estrela gira na sua velocidade, as de dentro dão mais voltas, e a fila se enrola: depois de algumas voltas, os braços viram uma espiral apertadíssima, um novelo. A Via Láctea já deu umas 50 voltas, e os braços dela deviam estar assim, mas não estão. Então os braços de verdade não podem ser filas fixas de estrelas: o passo 10 mostra o que eles são.",
        },
      ],
      try: [
        "Deixe a animação rodar um minuto e veja os braços se enrolarem.",
        "Troque o `/ r` por `* r`: as estrelas de fora giram mais rápido, e a espiral se enrola para o outro lado. A conferência avisa. Depois volte.",
        "Troque o `0.5` do `uVelocidade` por `2.0`: tudo acontece quatro vezes mais rápido. Depois volte.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.galaxia).result ?? check(true),
        },
        {
          text: "Cada estrela gira uVelocidade / r radianos por segundo",
          test: (facts) => {
            const m = measure(facts, SPEED, { timed: true });
            if (m.result) return m.result;
            const zero = stopped(m, "uVelocidade", "as estrelas ficam paradas");
            if (zero) return zero;
            return comparePlaces(m, moving(m, { spin: SPIN.flat }), [
              [moving(m, { spin: SPIN.rigid }), "a galáxia ainda gira inteira, como um disco: cada estrela gira na sua velocidade, angulo -= uTempo * uVelocidade / r"],
              [moving(m, { spin: SPIN.linear }), "as estrelas de fora giram mais rápido: a velocidade é dividida pelo raio, uVelocidade / r"],
              [moving(m, { spin: SPIN.free }), "as estrelas giram rápido demais: falta o uVelocidade, angulo -= uTempo * uVelocidade / r"],
              [moving(m, { spin: SPIN.flat, backwards: true }), "a galáxia gira para o outro lado: o ângulo diminui, angulo -= uTempo * uVelocidade / r", true],
            ]);
          },
        },
      ],
    },
    {
      id: "nucleo",
      title: "O núcleo gira como um disco",
      view: "camera",
      motion: true,
      goal:
        "Com a velocidade dividida pelo raio, uma estrela bem perto do centro gira depressa demais: a 0,05 do centro, 10 radianos por segundo, mais de uma volta e meia por segundo, e no centro a conta divide por zero. Nas galáxias de verdade, o núcleo gira como um disco, todo junto, e só mais para fora a velocidade fica constante. Uma troca na conta faz as duas coisas: dividir pela raiz de r² + uNucleo², que é quase o r longe do centro e quase o uNucleo perto dele.",
      lines: [
        {
          code: "  uniform float uNucleo;",
          text: "O tamanho do núcleo, em unidades da cena.",
        },
        {
          code: "    angulo -= uTempo * uVelocidade / sqrt(r * r + uNucleo * uNucleo);",
          text: "Longe do centro, o r² é bem maior que o uNucleo², e a raiz fica quase igual ao r: o giro de antes. Perto, a raiz fica quase igual ao uNucleo, e as estrelas giram todas a `uVelocidade / uNucleo`, 1 radiano por segundo: o núcleo gira inteiro, como um disco.",
        },
        {
          code: "    uNucleo: { value: 0.5 },",
          text: "Um núcleo de 0,5, um décimo do raio da galáxia.",
        },
      ],
      why: [
        {
          title: "Por que o núcleo gira como um disco?",
          text: "Dentro de uma bola de matéria espalhada por igual, a força que puxa uma estrela para o centro cresce com a distância, e a velocidade também: o giro fica o mesmo para todas, como num disco. Fora do núcleo, a força diminui com a distância, e a velocidade para de crescer. É a curva de rotação das galáxias: sobe em linha reta no núcleo e depois fica quase plana.",
        },
        {
          title: "Os braços ainda se enrolam?",
          text: "Sim: fora do núcleo, cada estrela continua com a sua velocidade, e a espiral se aperta do mesmo jeito. O núcleo só deixou de ser um borrão girando depressa. Nenhuma conta de velocidade resolve o enrolamento enquanto os braços forem feitos sempre das mesmas estrelas: é a vez de mudar o que é um braço.",
        },
      ],
      try: [
        "Troque o `0.5` do `uNucleo` por `2.0`: o disco que gira inteiro fica maior, e a espiral demora mais para se enrolar. Depois volte.",
        "Troque a conta por `angulo -= uTempo * uVelocidade / (r + uNucleo);`: o núcleo também gira como um disco, mas longe do centro as estrelas ficam mais lentas que antes. A conferência avisa. Depois volte.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.galaxia).result ?? check(true),
        },
        {
          text: "O núcleo gira junto, como um disco: uVelocidade / √(r² + uNucleo²)",
          test: (facts) => {
            const m = measure(facts, CORE, { timed: true });
            if (m.result) return m.result;
            const zero = stopped(m, "uVelocidade", "as estrelas ficam paradas");
            if (zero) return zero;
            return comparePlaces(m, moving(m, { spin: SPIN.core }), [
              [moving(m, { spin: SPIN.flat }), "perto do centro, as estrelas ainda giram depressa demais: divida pela raiz, uVelocidade / sqrt(r * r + uNucleo * uNucleo)"],
              [moving(m, { spin: SPIN.plus }), "longe do centro, as estrelas ficaram lentas demais: é a raiz de r² + uNucleo², sqrt(r * r + uNucleo * uNucleo), que fica quase igual ao r longe do centro"],
              [moving(m, { spin: SPIN.core, backwards: true }), "a galáxia gira para o outro lado: o ângulo diminui, angulo -= ...", true],
            ]);
          },
        },
      ],
    },
    {
      id: "onda",
      title: "Os braços são uma onda",
      view: "camera",
      motion: true,
      goal:
        "A saída para o enrolamento veio nos anos 1960, com Chia-Chiao Lin e Frank Shu: os braços não são feitos sempre das mesmas estrelas. São uma onda de densidade, uma região onde as estrelas se juntam um pouco ao passar, como um engarrafamento numa estrada: os carros entram e saem, e o engarrafamento continua lá. A onda gira inteira, devagar, e as estrelas passam por ela. Neste passo, as estrelas se espalham pelo disco todo, sem braços, e o shader faz brilhar mais as que estão passando pela espiral.",
      lines: [
        {
          code: "  const angulo = Math.random() * Math.PI * 2;",
          text: "O ângulo de cada estrela agora é sorteado por igual, sem braço, e as estrelas se espalham pelo disco todo. A dispersão dos lados sai: sem braço, não há em volta do que espalhar.",
        },
        {
          code: "  uniform float uBracos;",
          text: "O número de braços, que chega do JavaScript com os outros dois parâmetros da espiral: a curvatura e a velocidade com que ela gira.",
        },
        {
          code: "    float onda = cos(uBracos * (angulo - uCurvatura * r + uTempo * uVelocidadeDosBracos));",
          text: "A espiral como uma onda: o cosseno vale 1 na linha de cada braço e −1 no meio entre dois. O `angulo - uCurvatura * r` é a espiral do Gerador, θ = θ₀ + k · r, escrita ao contrário; vezes `uBracos`, ela se repete 3 vezes na volta. O `+ uTempo * uVelocidadeDosBracos` gira a espiral inteira, toda junta, 0,15 radiano por segundo, no mesmo sentido das estrelas.",
        },
        {
          code: "    float brilho = pow(0.5 + 0.5 * onda, 3.0);",
          text: "De −1 a 1 para 0 a 1, elevado ao cubo: o brilho só é forte perto da linha do braço. Sem o cubo, metade do disco ficaria clara, e os braços, largos e borrados.",
        },
        {
          code: "    vCor = color * mix(0.08, 1.0, brilho);",
          text: "Fora dos braços, a estrela fica com 8% da luz; na linha do braço, com toda. O `mix(a, b, t)` mistura de a até b: a + (b − a) · t.",
        },
        {
          code: "    uVelocidadeDosBracos: { value: 0.15 },",
          text: "A espiral gira a 0,15 radiano por segundo, uma volta a cada 42 segundos. Até uns 3,3 do centro, as estrelas giram mais rápido que ela e alcançam os braços por trás; mais para fora, são os braços que alcançam as estrelas.",
        },
      ],
      why: [
        {
          title: "Se as estrelas passam, por que o braço continua lá?",
          text: "Porque o braço é um lugar, e não um grupo de estrelas. Cada estrela entra no braço, fica um tempo e sai do outro lado, enquanto outras entram. Na galáxia de verdade, ao passar pelo braço o gás se comprime, e é ali que nascem as estrelas novas, por isso os braços brilham. A onda gira com um giro só, como um disco, e a espiral nunca se enrola.",
        },
        {
          title: "Por que tirar os braços das posições?",
          text: "Os braços das posições eram filas fixas de estrelas, e o giro de cada uma as enrolava. Com as estrelas espalhadas por igual e o brilho calculado no shader, o braço é desenhado onde a onda está agora, a cada quadro, qualquer que seja o caminho de cada estrela. Na galáxia de verdade, a onda também junta um pouco as estrelas; aqui, ela só as faz brilhar, o que já engana bem o olho.",
        },
      ],
      try: [
        "Troque o `0.15` do `uVelocidadeDosBracos` por `0.0`: a espiral para, e as estrelas continuam passando por ela. A conferência avisa. Depois volte.",
        "Troque o `3.0` do `pow` por `1.0`: os braços ficam largos e borrados. A conferência avisa. Depois volte.",
        "Troque o `const bracos = 3;` por `const bracos = 5;`: cinco braços, sem mexer nas estrelas, só na onda.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "As estrelas se espalham por igual pelo disco, sem braços",
          test: ({ objects }) => {
            const sample = objects.galaxia.geometry?.sample ?? [];
            if (!sample.length) return check(false, "a geometria não tem posições");
            return check(armsOf(sample, { inner: 0.3 }).strength < 0.25, "as estrelas ainda estão nos braços: o ângulo agora é sorteado por igual, Math.random() * Math.PI * 2, e quem desenha os braços é o shader");
          },
        },
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.galaxia).result ?? check(true),
        },
        {
          text: "As estrelas continuam girando como no passo anterior",
          test: (facts) => {
            const m = measure(facts, CORE, { timed: true });
            if (m.result) return m.result;
            return stopped(m, "uVelocidade", "as estrelas ficam paradas") ?? comparePlaces(m, moving(m, { spin: SPIN.core }));
          },
        },
        {
          text: "Quem passa pela espiral brilha, e a espiral gira inteira, devagar",
          test: (facts) => {
            const m = measure(facts, WAVE, { timed: true });
            if (m.result) return m.result;
            if (!m.colors) return check(false, "a geometria não tem o atributo color");
            const zero = stopped(m, "uVelocidadeDosBracos", "a espiral fica parada: ela gira devagar, a 0,15 radiano por segundo");
            if (zero) return zero;
            return compareColors(m, waveColor(m), [
              [vertexColor(m), "as estrelas não mudam de brilho: falta multiplicar a cor pela luz da espiral, color * mix(0.08, 1.0, brilho)"],
              [waveColor(m, { light: { still: true } }), "a espiral está parada: ela gira com o tempo, + uTempo * uVelocidadeDosBracos", true],
              [waveColor(m, { light: { backwards: true } }), "a espiral gira ao contrário das estrelas: o tempo entra com mais, + uTempo * uVelocidadeDosBracos", true],
              [waveColor(m, { start: true }), "a espiral gira junto com as estrelas e vai se enrolar como antes: a conta da onda vem depois do angulo -= ..., com o ângulo de agora"],
              [waveColor(m, { light: { wide: true } }), "os braços ficaram largos e borrados: falta elevar ao cubo, pow(0.5 + 0.5 * onda, 3.0)"],
            ]);
          },
        },
      ],
    },
    {
      id: "jovens",
      title: "Estrelas jovens nos braços",
      view: "camera",
      motion: true,
      goal:
        "Nos braços das galáxias de verdade, o gás comprimido pela onda forma estrelas novas. As maiores são azuis, muito quentes e brilhantes, e duram pouco: morrem antes de sair do braço. Por isso os braços são azulados, e o espaço entre eles tem as estrelas mais velhas e amareladas. No shader, a cor de cada estrela vai para um azul bem claro, o `uCorJovem`, conforme o brilho da onda: na linha do braço, ela é toda jovem.",
      lines: [
        {
          code: "  uniform vec3 uCorJovem;",
          text: "A cor das estrelas jovens, um `vec3`, como chega a cor de uma `THREE.Color`.",
        },
        {
          code: "    vCor = mix(color, uCorJovem, brilho) * mix(0.08, 1.0, brilho);",
          text: "Duas misturas pelo mesmo brilho: a cor vai da cor da estrela ao azul jovem, e a luz, de 8% a toda. Fora dos braços, a estrela tem a sua cor, fraca; na linha do braço, ela é azul e forte.",
        },
        {
          code: '    uCorJovem: { value: new THREE.Color("#a8c8ff") },',
          text: "Um azul bem claro, quase branco, como as estrelas mais quentes. A `THREE.Color` chega ao shader no espaço linear, como a cor dos vértices.",
        },
      ],
      why: [
        {
          title: "Por que as estrelas jovens são azuis?",
          text: "A cor de uma estrela vem da temperatura da superfície dela, como um ferro em brasa, que passa do vermelho ao branco quando esquenta. As estrelas grandes são as mais quentes, passam dos 20 mil graus e brilham em azul; o Sol, com uns 5.500, é branco-amarelado. As grandes queimam o combustível tão depressa que vivem poucos milhões de anos, e quase todas morrem perto de onde nasceram: nos braços.",
        },
        {
          title: "Por que dois mix, e não um só?",
          text: "Um faz a cor, e o outro, a luz, e cada um tem a sua faixa: a cor vai de uma cor à outra, e a luz, de 8% a 100%. Com os dois pelo mesmo brilho, a estrela fica azul e forte ao mesmo tempo, no braço. Separados, dá para mudar um sem mexer no outro: deixar as estrelas de fora mais fracas, ou o azul mais intenso.",
        },
      ],
      try: [
        "Troque o `#a8c8ff` por `#ff6b9a`: os braços ficam cor-de-rosa, como as nuvens de hidrogênio nas fotos de galáxias. Depois volte.",
        "Troque o `mix(color, uCorJovem, brilho)` por `mix(uCorJovem, color, brilho)`: o azul vai para fora dos braços. A conferência avisa. Depois volte.",
        "Desligue a Câmera do código e veja a galáxia de cima: a espiral azul gira devagar, e as estrelas passam por ela.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.galaxia).result ?? check(true),
        },
        {
          text: "Na espiral, as estrelas ficam azuladas: mix(color, uCorJovem, brilho)",
          test: (facts) => {
            const m = measure(facts, YOUNG, { timed: true });
            if (m.result) return m.result;
            if (!m.colors) return check(false, "a geometria não tem o atributo color");
            return compareColors(m, waveColor(m, { young: true }), [
              [waveColor(m), "as estrelas dos braços ainda têm a cor de antes: falta misturar a cor com a jovem, mix(color, uCorJovem, brilho)"],
              [waveColor(m, { young: true, swapped: true }), "a cor jovem ficou fora dos braços: no mix, ela vem em segundo, mix(color, uCorJovem, brilho)"],
            ]);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
