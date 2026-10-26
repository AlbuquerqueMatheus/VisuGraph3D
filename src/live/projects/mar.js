// mar.js — o projeto "Mar com ondas na GPU": um mar inteiro num shader de vértices, em 12 passos
// no VisuGraph e 1 no seu computador. O assunto é o shader de vértices: uma placa plana que sobe e
// desce em ondas calculadas na placa de vídeo, com o tempo vindo do JavaScript num uniform, a
// velocidade das ondas de verdade, as ondas de Gerstner, a normal calculada pelos vizinhos, o céu e
// o sol refletidos e a neblina no horizonte.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js). A
// conferência olha a superfície que o shader desenhou (`shader.surface`, nos fatos: o visor desenha
// o mar de novo pela câmera do código, guarda a profundidade de cada pixel e devolve o ponto da
// superfície ali, com a cor que o shader pintou) e refaz a conta de cada passo nos mesmos
// triângulos que a placa de vídeo desenha. Quando a forma ou a cor não batem, ela tenta os erros
// comuns (a onda andando para trás, o empurrão de Gerstner ao contrário, uma onda esquecida) para
// dizer qual foi.

import { add, bytes, check, deg, dot, extent, fmt, gap, hex, quantile, scale, srgbBytes, sub, toWorld, toward, unit, wait } from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, during, from } from "./source.js";

const SOURCE = [
  from(0, "// Mar com ondas na GPU"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#8fc1e3");',
    "",
    "const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 4, 22);",
    "camera.lookAt(0, 0, 0);",
    "",
    "// O mar: uma placa de 60 × 60, deitada, com 128 × 128 quadradinhos",
    "const geometria = new THREE.PlaneGeometry(60, 60, 128, 128);",
    "geometria.rotateX(-Math.PI / 2);",
    "",
  ),
  during(1, 2, 'const material = new THREE.MeshBasicMaterial({ color: "#0b4268", wireframe: true });'),
  // o shader de vértices
  from(2, "const vertexShader = /* glsl */ `"),
  from(4, "  uniform float uTempo;"),
  during(5, 10, "  uniform float uAltura;", "  uniform float uComprimento;"),
  during(9, 10, "  uniform vec2 uDirecao;"),
  from(10, "  uniform vec4 uOnda1;", "  uniform vec4 uOnda2;", "  uniform vec4 uOnda3;"),
  from(6, "", "  varying vec3 vNormal;"),
  from(7, "  varying vec3 vPosicao;"),
  from(5, "", "  const float PI = 3.14159265;"),
  from(
    10,
    "",
    "  // O que uma onda faz com o ponto p. o = (direção em x, direção em z, altura, comprimento)",
    "  vec3 onda(vec4 o, vec3 p) {",
    "    vec2 d = normalize(o.xy);",
    "    float k = 2.0 * PI / o.w;",
    "    float c = sqrt(9.8 / k);",
    "    float f = k * (dot(d, p.xz) - c * uTempo);",
    "    return vec3(d.x * o.z * cos(f), o.z * sin(f), d.y * o.z * cos(f));",
    "  }",
  ),
  from(6, ""),
  by({ 6: "  // Onde está agora o ponto p do plano parado", 10: "  // Onde está agora o ponto p do plano parado: com as três ondas somadas" }),
  from(6, "  vec3 superficie(vec3 p) {"),
  during(9, 10, "    vec2 d = normalize(uDirecao);"),
  during(6, 10, "    float k = 2.0 * PI / uComprimento;", "    float c = sqrt(9.8 / k);"),
  by({ 8: "    float f = k * (p.x - c * uTempo);", 9: "    float f = k * (dot(d, p.xz) - c * uTempo);", 10: null }),
  by({ 8: "    p.x += uAltura * cos(f);", 9: "    p.x += d.x * uAltura * cos(f);", 10: null }),
  by({ 6: "    p.y += uAltura * sin(k * (p.x - c * uTempo));", 8: "    p.y += uAltura * sin(f);", 10: null }),
  during(9, 10, "    p.z += d.y * uAltura * cos(f);"),
  by({ 6: "    return p;", 10: "    return p + onda(uOnda1, p) + onda(uOnda2, p) + onda(uOnda3, p);" }),
  from(6, "  }"),
  from(2, "", "  void main() {", "    vec4 mundo = modelMatrix * vec4(position, 1.0);"),
  during(5, 6, "    float k = 2.0 * PI / uComprimento;", "    float c = sqrt(9.8 / k);"),
  by({
    3: "    mundo.y += sin(mundo.x);",
    4: "    mundo.y += sin(mundo.x - uTempo);",
    5: "    mundo.y += uAltura * sin(k * (mundo.x - c * uTempo));",
    6: "    vec3 p = superficie(mundo.xyz);",
  }),
  from(
    6,
    "    // A normal: dois vizinhos em x e dois em z, um pouquinho para cada lado",
    "    vec3 dx = vec3(0.01, 0.0, 0.0);",
    "    vec3 dz = vec3(0.0, 0.0, 0.01);",
    "    vec3 tangente = superficie(mundo.xyz + dx) - superficie(mundo.xyz - dx);",
    "    vec3 binormal = superficie(mundo.xyz + dz) - superficie(mundo.xyz - dz);",
    "    vNormal = normalize(cross(binormal, tangente));",
  ),
  from(7, "    vPosicao = p;"),
  by({ 2: "    gl_Position = projectionMatrix * viewMatrix * mundo;", 6: "    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);" }),
  from(2, "  }", "`;", ""),
  // o shader de fragmentos
  from(2, "const fragmentShader = /* glsl */ `", "  uniform vec3 uCorDaAgua;"),
  from(7, "  uniform vec3 uCorDoCeu;"),
  from(11, "  uniform vec3 uDirecaoDoSol;", "  uniform float uBrilho;"),
  from(12, "  uniform float uNeblinaPerto;", "  uniform float uNeblinaLonge;"),
  from(6, "", "  varying vec3 vNormal;"),
  from(7, "  varying vec3 vPosicao;"),
  from(
    2,
    "",
    "  // Do espaço linear para o sRGB, como o three.js faz no fim de cada pixel",
    "  vec3 paraSRGB(vec3 c) {",
    "    c = clamp(c, 0.0, 1.0);",
    "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
    "  }",
    "",
    "  void main() {",
  ),
  from(6, "    vec3 n = normalize(vNormal);"),
  from(
    7,
    "    vec3 v = normalize(cameraPosition - vPosicao);",
    "    // O céu refletido: quase nada olhando de cima, quase tudo olhando de lado",
    "    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);",
    "    vec3 cor = mix(uCorDaAgua, uCorDoCeu, fresnel);",
  ),
  from(
    11,
    "    // O sol refletido: um brilho pequeno e forte",
    "    vec3 h = normalize(uDirecaoDoSol + v);",
    "    cor += pow(max(dot(n, h), 0.0), uBrilho);",
  ),
  from(
    12,
    "    // O horizonte: de longe, o mar some na cor do céu",
    "    float distancia = length(cameraPosition - vPosicao);",
    "    float neblina = smoothstep(uNeblinaPerto, uNeblinaLonge, distancia);",
    "    cor = mix(cor, uCorDoCeu, neblina);",
  ),
  by({
    2: "    gl_FragColor = vec4(paraSRGB(uCorDaAgua), 1.0);",
    6: "    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);",
    7: "    gl_FragColor = vec4(paraSRGB(cor), 1.0);",
  }),
  from(2, "  }", "`;", ""),
  // o material
  from(2, "const material = new THREE.ShaderMaterial({", "  uniforms: {"),
  from(4, "    uTempo: { value: 0 },"),
  during(5, 10, "    uAltura: { value: 0.5 },"),
  during(5, 10, "    uComprimento: { value: 10 },"),
  during(9, 10, "    uDirecao: { value: new THREE.Vector2(1, 0.5) },"),
  from(10, "    uOnda1: { value: new THREE.Vector4(1, 0, 0.35, 10) },", "    uOnda2: { value: new THREE.Vector4(1, 0.7, 0.18, 6) },", "    uOnda3: { value: new THREE.Vector4(-0.4, 1, 0.08, 3.5) },"),
  from(2, '    uCorDaAgua: { value: new THREE.Color("#0b4268") },'),
  from(7, "    uCorDoCeu: { value: cena.background },"),
  from(11, "    uDirecaoDoSol: { value: new THREE.Vector3(0, 0.25, -1).normalize() },", "    uBrilho: { value: 500 },"),
  from(12, "    uNeblinaPerto: { value: 15 },", "    uNeblinaLonge: { value: 40 },"),
  from(2, "  },", "  vertexShader,", "  fragmentShader,"),
  during(2, 6, "  wireframe: true,"),
  from(2, "});"),
  from(1, "const mar = new THREE.Mesh(geometria, material);", "cena.add(mar);"),
  from(4, "", "// A cada quadro, o shader fica sabendo o tempo", "function animar(tempo) {", "  material.uniforms.uTempo.value = tempo;", "}"),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// O mar da conta: as ondas de cada passo, com os uniforms do material

/**
 * Uma onda: a direção d em que ela corre no chão ([x, z]), a altura a, o número de onda k (2π ÷ o
 * comprimento) e o quanto a fase anda por segundo, w (k × c, com c a velocidade da onda). `push` é
 * o empurrão para o lado, [em x, em z], que vai com o cosseno da fase (com o seno, em `sinPush`):
 * nas ondas de Gerstner, a altura vezes a direção; nas que só sobem e descem, nada.
 */
const wave = ({ d = [1, 0], a = 1, k = 1, w = 0, push = [0, 0], sinPush = false }) => ({ d, a, k, w, push, sinPush });

/** Quanto a fase de uma onda de número k anda por segundo em águas fundas: k × √(9,8 ÷ k). */
const omega = (k) => k * Math.sqrt(9.8 / k);

/**
 * A onda de Gerstner de um vec4 [direção em x, direção em z, altura, comprimento], como a função
 * `onda` do shader. As opções são os erros comuns: `raw`, a direção sem o normalize; `flat`, sem o
 * empurrão para o lado; `still`, sem o tempo.
 */
function gerstner([x, z, a, length], { raw = false, flat = false, still = false } = {}) {
  const n = Math.hypot(x, z) || 1;
  const d = raw ? [x, z] : [x / n, z / n];
  const k = (2 * Math.PI) / length;
  return wave({ d, a, k, w: still ? 0 : omega(k), push: flat ? [0, 0] : [d[0] * a, d[1] * a] });
}

/**
 * Onde está, no tempo t, o ponto q do plano parado, com as ondas do mar `model` ({ waves }) somadas.
 * Com `chained` (um erro comum), cada onda é calculada no ponto que as anteriores já moveram.
 */
function displaced({ waves, chained = false }, t, q) {
  let [x, y, z] = q;
  for (const o of waves) {
    const f = o.k * (o.d[0] * (chained ? x : q[0]) + o.d[1] * (chained ? z : q[2])) - o.w * t;
    const side = o.sinPush ? Math.sin(f) : Math.cos(f);
    x += o.push[0] * side;
    y += o.a * Math.sin(f);
    z += o.push[1] * side;
  }
  return [x, y, z];
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A normal no ponto q do plano parado, como o shader calcula: com dois vizinhos em x e dois em z, a 0,01 para cada lado. */
function normalAt(model, t, [x, y, z]) {
  const tangente = sub(displaced(model, t, [x + 0.01, y, z]), displaced(model, t, [x - 0.01, y, z]));
  const binormal = sub(displaced(model, t, [x, y, z + 0.01]), displaced(model, t, [x, y, z - 0.01]));
  return unit(cross(binormal, tangente));
}

/** As coordenadas baricêntricas de p no triângulo [a, b, c], vistos de cima; null se, de cima, o triângulo é uma linha. */
function barycentric(p, [a, b, c]) {
  const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(det) < 1e-12) return null;
  const l1 = ((b[2] - c[2]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[2] - c[2])) / det;
  const l2 = ((c[2] - a[2]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[2] - c[2])) / det;
  return [l1, l2, 1 - l1 - l2];
}

/**
 * Acha, pela conta das ondas, o ponto do plano parado que elas levam até p, olhando só o chão (x e
 * z), pelo método de Newton: parte do ponto do plano embaixo de p e corrige pelo quanto o ponto
 * levado erra, com a derivada da conta em cada direção. Perto de uma crista íngreme, a derivada é
 * pequena e o passo inteiro pode passar longe: aí ele anda a metade, ou a metade da metade, até
 * chegar mais perto. `toPlane(dx, dz)` passa um deslocamento no chão para as coordenadas do plano,
 * e `restAt(u, v)` faz o caminho de volta. null se a conta não chega (ondas tão íngremes que as
 * cristas se dobram).
 */
function findRest(p, model, t, toPlane, restAt) {
  const error = (u, v) => {
    const s = displaced(model, t, restAt(u, v));
    return toPlane(p[0] - s[0], p[2] - s[2]);
  };
  const origin = restAt(0, 0);
  let [u, v] = toPlane(p[0] - origin[0], p[2] - origin[2]);
  let e = error(u, v);
  for (let i = 0; i < 50; i++) {
    const size = Math.hypot(...e);
    if (size < 1e-8) return [u, v];
    // o quanto o erro muda andando um pouquinho em u e em v
    const h = 1e-5;
    const [au, av] = error(u + h, v);
    const [bu, bv] = error(u, v + h);
    const [j11, j21, j12, j22] = [(e[0] - au) / h, (e[1] - av) / h, (e[0] - bu) / h, (e[1] - bv) / h];
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-9) return null;
    const du = (e[0] * j22 - e[1] * j12) / det;
    const dv = (e[1] * j11 - e[0] * j21) / det;
    let step = 1;
    for (;;) {
      const next = error(u + step * du, v + step * dv);
      if (Math.hypot(...next) < size) {
        u += step * du;
        v += step * dv;
        e = next;
        break;
      }
      step /= 2;
      if (step < 1e-3) return null;
    }
  }
  return null;
}

/**
 * O mar da conta `model` no tempo t como a placa de vídeo desenha: cada vértice da placa (a grade
 * da PlaneGeometry, nos fatos) levado pelas ondas e, entre os vértices, triângulos retos. `at(p)`
 * acha o triângulo que passa por cima ou por baixo do ponto p e diz a altura dele ali (`y`) e, com
 * `withNormal`, a normal (`n`), misturada das normais dos três vértices como o varying chega ao
 * pixel; null se nenhum passa. Sem a grade (outra geometria, ou uma placa grande demais), a conta
 * vale direto no ponto, sem os triângulos.
 */
function seaOf(mar, model, t) {
  const grid = mar.geometry?.grid;
  if (!grid) return smoothSea(model, t, mar.worldPosition[1]);
  const { cols, rows, positions } = grid;
  const rest = (c, r) => {
    const i = 3 * (r * (cols + 1) + c);
    return toWorld(mar, [positions[i], positions[i + 1], positions[i + 2]]);
  };
  // o plano parado: o primeiro vértice (O) e o passo de uma coluna (U) e de uma linha (V)
  const O = rest(0, 0);
  const U = sub(rest(1, 0), O);
  const V = sub(rest(0, 1), O);
  const det = U[0] * V[2] - U[2] * V[0];
  if (Math.abs(det) < 1e-12) return smoothSea(model, t, mar.worldPosition[1]);
  const toPlane = (dx, dz) => [(dx * V[2] - dz * V[0]) / det, (U[0] * dz - U[2] * dx) / det];
  const restAt = (u, v) => [O[0] + u * U[0] + v * V[0], O[1] + u * U[1] + v * V[1], O[2] + u * U[2] + v * V[2]];
  const vertices = new Map();
  const vertex = (c, r) => {
    const key = r * (cols + 1) + c;
    let v = vertices.get(key);
    if (!v) {
      const q = rest(c, r);
      v = { q, p: displaced(model, t, q), n: null };
      vertices.set(key, v);
    }
    return v;
  };
  const normalOf = (v) => (v.n ??= normalAt(model, t, v.q));
  return {
    at(p, { withNormal = false } = {}) {
      const found = findRest(p, model, t, toPlane, (u, v) => restAt(u, v));
      if (!found) return null;
      // os dois triângulos de cada quadradinho em volta, como a PlaneGeometry os monta. Numa crista
      // íngreme, os quadradinhos ficam finos, e o triângulo reto pode estar a alguns da conta: aí a
      // busca vai mais longe.
      const [c0, r0] = found.map(Math.floor);
      let best = null;
      for (const reach of [1, 4]) {
        for (let r = Math.max(0, r0 - reach); r <= Math.min(rows - 1, r0 + reach); r++) {
          for (let c = Math.max(0, c0 - reach); c <= Math.min(cols - 1, c0 + reach); c++) {
            for (const corners of [[[c, r], [c, r + 1], [c + 1, r]], [[c, r + 1], [c + 1, r + 1], [c + 1, r]]]) {
              const tri = corners.map(([cc, rr]) => vertex(cc, rr));
              const b = barycentric(p, tri.map((v) => v.p));
              if (b && !(best?.inside >= Math.min(...b))) best = { inside: Math.min(...b), b, tri };
            }
          }
        }
        if (best?.inside >= 0) break;
      }
      if (!best || best.inside < -1e-3) return null;
      const { b, tri } = best;
      const y = b[0] * tri[0].p[1] + b[1] * tri[1].p[1] + b[2] * tri[2].p[1];
      if (!withNormal) return { y };
      return { y, n: unit(add(add(scale(normalOf(tri[0]), b[0]), scale(normalOf(tri[1]), b[1])), scale(normalOf(tri[2]), b[2]))) };
    },
  };
}

/** O mar sem os triângulos: a conta das ondas direto em cada ponto, com o plano parado deitado na altura `base`. */
function smoothSea(model, t, base) {
  const restAt = (x, z) => [x, base, z];
  return {
    at(p, { withNormal = false } = {}) {
      const found = findRest(p, model, t, (dx, dz) => [dx, dz], restAt);
      if (!found) return null;
      const q = restAt(...found);
      const y = displaced(model, t, q)[1];
      return withNormal ? { y, n: normalAt(model, t, q) } : { y };
    },
  };
}

// ---------------------------------------------------------------------------
// Conferências: a superfície que o shader desenhou (`shader.surface`, nos fatos) contra a conta

const STAGE = { vertex: "shader de vértices", fragment: "shader de fragmentos" };
const PAUSED = "a animação está parada: aperte ▶ na barra de cima para as ondas andarem";
const WAITING = "esperando as ondas andarem um pouco";

/**
 * O valor de um uniform do material do mar: um número (`float`) ou um vetor (`vec2`, `vec3` ou
 * `vec4`; o vec3 aceita também uma THREE.Color, no espaço linear). Senão, `result` diz o que falta.
 */
function uniformOf(mar, name, kind) {
  const u = mar.material?.uniforms?.[name];
  if (!u) return { result: check(false, `o material do mar não tem o uniform ${name}`) };
  if (kind === "float") return u.type === "number" ? { value: u.value } : { result: check(false, `o uniform ${name} não é um número`) };
  const n = Number(kind.slice(3));
  if ((u.type === "vector" || (n === 3 && u.type === "color")) && u.value.length === n) return { value: u.value };
  const what = { 2: "um THREE.Vector2", 3: "uma THREE.Color ou um THREE.Vector3", 4: "um THREE.Vector4" }[n];
  return { result: check(false, `o uniform ${name} não tem ${n} números (${what})`) };
}

/** Os valores de vários uniforms ({ nome: tipo }), ou o `result` do primeiro que falta. */
function uniformsOf(mar, kinds) {
  const values = {};
  for (const [name, kind] of Object.entries(kinds)) {
    const u = uniformOf(mar, name, kind);
    if (u.result) return u;
    values[name] = u.value;
  }
  return { values };
}

/**
 * O tempo das ondas: o uTempo do material, se ele acompanha o tempo da animação (o que animar
 * recebe). Senão, `result` diz o que falta ou o que esperar: no começo, e logo depois de o código
 * rodar de novo, o uTempo só recebe o tempo no quadro seguinte.
 */
function clockOf(facts, mar) {
  const u = uniformOf(mar, "uTempo", "float");
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

/**
 * O que as conferências do mar medem: o mar, os pontos da superfície que o shader desenhou, os
 * uniforms `kinds` e, com `timed`, o tempo das ondas (o uTempo). Senão, `result` diz o que falta ou
 * o que esperar; `hidden` é o que dizer se o mar quase não aparece na câmera.
 */
function measure(facts, kinds = {}, { timed = true, hidden = "o mar quase não aparece na câmera" } = {}) {
  const mar = facts.objects.mar;
  const type = mar.material?.type ?? null;
  if (type !== "ShaderMaterial") return { result: check(false, `o mar é ${type ?? "um objeto sem material"}, e não um ShaderMaterial`) };
  const shader = mar.shader;
  if (shader?.error?.stage === "link") return { result: check(false, "os dois shaders compilam, mas não se encaixam: a barra embaixo do código diz o que falta") };
  if (shader?.error) return { result: check(false, `o ${STAGE[shader.error.stage] ?? "shader"} não compila: a barra embaixo do código diz o erro e a linha`) };
  const u = uniformsOf(mar, kinds);
  if (u.result) return u;
  let t = 0;
  if (timed) {
    const clock = clockOf(facts, mar);
    if (clock.result) return clock;
    t = clock.t;
  }
  if (!shader?.surface) return { result: check(false, "não deu para medir a superfície do mar") };
  if (shader.surface.points.length < 50) return { result: check(false, hidden) };
  return { mar, shader, points: shader.surface.points, u: u.values, t, playing: facts.playing };
}

/** O quanto cada ponto medido está acima ou abaixo do mar da conta (Infinity onde a conta não acha o mar). */
function heightErrors(points, sea) {
  return points.map(({ p }) => {
    const s = sea.at(p);
    return s ? Math.abs(p[1] - s.y) : Infinity;
  });
}

/**
 * Se a superfície bate com a conta: 90% dos pontos a até 0,01 da altura dela, e 99% a até 0,03.
 * A folga é a da medida, que lê a profundidade de cada pixel em 24 bits, e a de uma placa que
 * faça as contas com menos casas.
 */
const fitsShape = (errors) => quantile(errors, 0.9) <= 0.01 && quantile(errors, 0.99) <= 0.03;

/**
 * Se as ondas do mar `model` são íngremes a ponto de as cristas se dobrarem: com a soma de k vezes
 * o empurrão para o lado de 1 para cima, os pontos de uma crista passam uns pelos outros, e a
 * superfície se cruza numa laçada que a conta não acompanha.
 */
const folds = (model) => model.waves.reduce((sum, o) => sum + o.k * Math.hypot(...o.push), 0) >= 1;
const FOLDED = "as cristas se dobram em laçadas: as ondas estão íngremes demais, com a altura vezes o k (somada, se são várias) passando de 1. Diminua a altura ou aumente o comprimento";

/**
 * Confere a altura da superfície medida (`m`, de measure) com a do mar `model`. Se não bate, tenta
 * as variantes [conta, o que dizer, timed], os erros comuns, e diz o da que bate melhor; senão,
 * diz que as cristas se dobram (se a conta mesmo dobra), `otherwise` ou o ponto mais longe dela. Uma variante `timed` só erra no tempo (a onda
 * parada, andando para trás): no tempo 0, ou quando a fase dela fica uma volta inteira à frente ou
 * atrás da certa, as duas desenham o mesmo mar, e a conferência espera a onda andar mais.
 */
function compareShape(m, model, variants = [], otherwise = null) {
  const sea = seaOf(m.mar, model, m.t);
  const errors = heightErrors(m.points, sea);
  if (fitsShape(errors)) {
    if (!variants.some(([other, , timed]) => timed && fitsShape(heightErrors(m.points, seaOf(m.mar, other, m.t))))) return check(true);
    return wait(m.playing ? "esperando as ondas andarem mais um pouco para conferir" : PAUSED);
  }
  let best = null;
  for (const [other, seen] of variants) {
    const e = heightErrors(m.points, seaOf(m.mar, other, m.t));
    const score = quantile(e, 0.9);
    if (fitsShape(e) && !(best?.score <= score)) best = { score, seen };
  }
  if (best) return check(false, best.seen);
  if (folds(model)) return check(false, FOLDED);
  if (otherwise) return check(false, otherwise);
  const finite = errors.filter(Number.isFinite);
  if (!finite.length) return check(false, "a superfície do mar não tem a forma da conta do passo");
  const { p } = m.points[errors.indexOf(Math.max(...finite))];
  return check(false, `a superfície não bate com a conta: em x = ${fmt(p[0])}, z = ${fmt(p[2])}, o mar está em y = ${fmt(p[1])}, e a conta dá ${fmt(sea.at(p).y)}`);
}

/**
 * O seno ao longo do x que passa mais perto dos pontos medidos, com o número de onda k: a altura
 * dele (`a`) e o quanto 90% dos pontos ficam fora dele (`off`), pelos mínimos quadrados, com a
 * água parada na altura `base`. A fase fica livre: serve para medir a forma da onda, qualquer que
 * seja a velocidade.
 */
function sineFit(points, base, k) {
  let ss = 0;
  let sc = 0;
  let cc = 0;
  let ys = 0;
  let yc = 0;
  for (const { p } of points) {
    const s = Math.sin(k * p[0]);
    const c = Math.cos(k * p[0]);
    const y = p[1] - base;
    ss += s * s;
    sc += s * c;
    cc += c * c;
    ys += y * s;
    yc += y * c;
  }
  const det = ss * cc - sc * sc;
  const alpha = (ys * cc - yc * sc) / det;
  const beta = (yc * ss - ys * sc) / det;
  const off = points.map(({ p }) => Math.abs(p[1] - base - alpha * Math.sin(k * p[0]) - beta * Math.cos(k * p[0])));
  return { a: Math.hypot(alpha, beta), off: quantile(off, 0.9) };
}

/**
 * Se a onda medida (`m`, de measure) tem a altura uAltura e o comprimento uComprimento, pelo seno
 * que passa mais perto dos pontos, com a fase livre. A comparação é com a mesma onda como os
 * triângulos da placa a desenham: numa onda curta, com poucos quadradinhos de uma crista à outra,
 * os triângulos cortam as cristas e os vales, e ela parece mais baixa do que é.
 */
function waveSize(m) {
  const { uAltura: a, uComprimento: length } = m.u;
  const base = m.mar.worldPosition[1];
  const k = (2 * Math.PI) / length;
  const fit = sineFit(m.points, base, k);
  const sea = seaOf(m.mar, sineSea(m.u), m.t);
  const drawn = sineFit(m.points.map(({ p }) => ({ p: [p[0], sea.at(p)?.y ?? base, p[2]] })), base, k);
  // o quanto a placa encolhe a onda: a altura desenhada de uma onda de altura 1
  const shrink = a > 0 ? drawn.a / a : 1;
  if (fit.off <= drawn.off + 0.02) {
    if (Math.abs(fit.a - drawn.a) <= 0.02 + 0.03 * a) return check(true);
    if (Math.abs(fit.a - shrink) <= 0.03) return check(false, "a onda tem altura 1: falta multiplicar o seno por uAltura");
    return check(false, `a onda tem ${fmt(fit.a / shrink)} de altura, e o uAltura é ${fmt(a)}`);
  }
  if (sineFit(m.points, base, 1).off <= 0.02) return check(false, "a onda tem o comprimento do seno puro, 2π: falta o k multiplicando dentro do seno, sin(k * (mundo.x - c * uTempo))");
  if (sineFit(m.points, base, 1 / length).off <= 0.02) return check(false, "as ondas saíram compridas demais: o k é 2.0 * PI / uComprimento, com o 2π de uma volta inteira");
  return check(false, `a superfície não é uma onda de ${fmt(length)} de comprimento: confira o k = 2.0 * PI / uComprimento dentro do seno`);
}

const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** O smoothstep do GLSL: 0 antes de e0, 1 depois de e1 e, no meio, uma curva suave em S. */
function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * A cor que a conta do passo dá para o ponto s do mar (de 0 a 255), com a normal ali (`s.at.n`), a
 * câmera em `eye` e os uniforms `u`. `o` diz o que entra: `normal` (a normal como cor) ou o céu
 * refletido pelo Fresnel, com o sol (`sun`) e a neblina (`fog`). As outras opções são os erros comuns.
 */
function colorOf(s, eye, u, o) {
  if (o.normal) {
    const n = o.up ? [0, 1, 0] : o.zero ? [0, 0, 0] : o.flip ? scale(s.at.n, -1) : s.at.n;
    const c = n.map((x) => x * 0.5 + 0.5);
    return o.srgb ? srgbBytes(c) : bytes(c);
  }
  const n = s.at.n;
  const v = unit(o.flipView ? sub(s.p, eye) : sub(eye, s.p));
  const fresnel = 0.02 + 0.98 * (1 - Math.max(dot(n, v), 0)) ** 5;
  let cor = o.swapMix ? mix(u.uCorDoCeu, u.uCorDaAgua, fresnel) : mix(u.uCorDaAgua, u.uCorDoCeu, fresnel);
  if (o.sun) {
    const sun = o.flipSun ? scale(u.uDirecaoDoSol, -1) : u.uDirecaoDoSol;
    const h = o.rawHalf ? add(sun, v) : unit(add(sun, v));
    const brilho = Math.max(dot(n, h), 0) ** u.uBrilho;
    cor = add(cor, [brilho, brilho, brilho]);
  }
  if (o.fog) {
    const d = o.fromOrigin ? Math.hypot(...s.p) : Math.hypot(...sub(eye, s.p));
    const neblina = smoothstep(u.uNeblinaPerto, u.uNeblinaLonge, d);
    cor = o.swapFog ? mix(u.uCorDoCeu, cor, neblina) : mix(cor, u.uCorDoCeu, neblina);
  }
  return o.linear ? bytes(cor) : srgbBytes(cor);
}

/**
 * Se a cor bate com a conta: 90% dos pixels a até 3 níveis (de 255) da cor esperada, e 99% a até 8.
 * A folga é a do arredondamento da placa de vídeo, que faz as contas com menos casas: no brilho do
 * sol, com o expoente 500, uma diferença mínima na normal já muda o pixel.
 */
const fitsColor = (d) => quantile(d, 0.9) <= 3 && quantile(d, 0.99) <= 8;

const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura: falta passar a cor pela paraSRGB no gl_FragColor";

/**
 * Confere a cor dos pixels do mar (`m`, de measure) com a conta de cor `o` (as opções de colorOf),
 * com a normal do mar `model` em cada ponto. Se não bate, tenta as variantes [opções a mais, o que
 * dizer] e diz a que bate melhor; senão, mostra o pixel mais diferente. A cor depende da normal, e
 * a normal, da forma: onde a forma não bate, ela é o que falta.
 */
function shading(m, model, o, variants = []) {
  const sea = seaOf(m.mar, model, m.t);
  const samples = m.points.map((s) => ({ ...s, at: sea.at(s.p, { withNormal: true }) }));
  if (!fitsShape(samples.map((s) => (s.at ? Math.abs(s.p[1] - s.at.y) : Infinity)))) {
    return check(false, folds(model) ? FOLDED : "a forma das ondas não bate com a do passo, e a cor depende dela: confira a função superficie");
  }
  const found = samples.filter((s) => s.at);
  const deviations = (extra) => found.map((s) => gap(s.c, colorOf(s, m.shader.eye, m.u, { ...o, ...extra })));
  const d = deviations({});
  if (fitsColor(d)) return check(true);
  let best = null;
  for (const [extra, seen] of variants) {
    const dv = deviations(extra);
    const total = dv.reduce((sum, x) => sum + x, 0);
    if (fitsColor(dv) && !(best?.total <= total)) best = { total, seen };
  }
  if (best) return check(false, best.seen);
  const s = found[d.indexOf(Math.max(...d))];
  return check(false, `a cor do mar não bate com a conta: num ponto, o shader pinta ${hex(s.c)}, e a conta dá ${hex(colorOf(s, m.shader.eye, m.u, o))}`);
}

// ---------------------------------------------------------------------------
// O mar de cada passo, pelos uniforms

/** A onda que só sobe e desce, dos passos 5 a 7: altura e comprimento dos uniforms, na velocidade das ondas de verdade. */
const SINE = { uAltura: "float", uComprimento: "float" };
function sineSea({ uAltura: a, uComprimento: length }, speed = (k) => omega(k)) {
  const k = (2 * Math.PI) / length;
  return { waves: [wave({ a, k, w: speed(k) })] };
}

/** As variantes de tempo de um mar: as ondas paradas e andando para trás, com o que dizer de cada uma. */
const timeSlips = (model, still, backwards) => [
  [{ ...model, waves: model.waves.map((o) => ({ ...o, w: 0 })) }, still, true],
  [{ ...model, waves: model.waves.map((o) => ({ ...o, w: -o.w })) }, backwards, true],
];

/** A onda de Gerstner do passo 9: a direção do uDirecao. */
const DIRECTION = { ...SINE, uDirecao: "vec2" };
const directionWave = (u, o) => gerstner([u.uDirecao[0], u.uDirecao[1], u.uAltura, u.uComprimento], o);

/** As três ondas dos passos 10 a 12. */
const WAVES = { uOnda1: "vec4", uOnda2: "vec4", uOnda3: "vec4" };
const NAMES = Object.keys(WAVES);
const threeWaves = (u, o) => ({ waves: NAMES.map((name) => gerstner(u[name], o)) });

const COLORS = { uCorDaAgua: "vec3", uCorDoCeu: "vec3" };
const SUN = { ...COLORS, uDirecaoDoSol: "vec3", uBrilho: "float" };
const FOG = { uNeblinaPerto: "float", uNeblinaLonge: "float" };

/** A soma de altura × k das ondas: de 1 para cima, os pontos de uma crista se cruzam, e ela se dobra numa laçada. */
const steepness = (waves) => waves.reduce((sum, [, , a, length]) => sum + (a * 2 * Math.PI) / length, 0);

/** Os vértices do mar no mundo: todos os da grade da placa, ou a amostra da geometria. */
function restPoints(mar) {
  const grid = mar.geometry?.grid;
  if (!grid) return (mar.geometry?.sample ?? []).map((p) => toWorld(mar, p));
  const out = [];
  for (let i = 0; i < grid.positions.length; i += 3) out.push(toWorld(mar, [grid.positions[i], grid.positions[i + 1], grid.positions[i + 2]]));
  return out;
}

/** Um pixel "#rrggbb" em níveis de 0 a 255. */
const pixelOf = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

// ---------------------------------------------------------------------------
// O passo no computador

const END = codeAt(12);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: null, controls: true };

const COMPUTER = [
  computerStep({
    id: "mar",
    title: "Mar com ondas na GPU",
    end: END,
    options: OPTIONS,
    words: {
      yours: "o seu mar",
      browser: "o código do mar precisa dele no navegador",
      privates: "`geometria`, `material` e o resto",
      stretched: "o mar sai esticado ou achatado",
      jump: "as ondas dariam um salto",
      animarStep: 4,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor e chamava `animar` a cada quadro. Neste passo, o mar vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, com os dois shaders dentro, e o que o VisuGraph fazia fica escrito no `src/main.js`, com os controles do mouse para olhar o mar de outros ângulos.",
    why: [
      {
        title: "E num celular?",
        text: "O mar roda em qualquer placa de vídeo com WebGL, as de celular inclusive. O shader de vértices chama a `superficie` cinco vezes para cada um dos 16.641 vértices, e o de fragmentos faz poucas contas por pixel: é pouco para uma placa de vídeo. Numa tela de alta densidade, o `setPixelRatio` do `main.js` limita o desenho a 2 pixels por ponto, o que segura o trabalho do shader de fragmentos.",
      },
      {
        title: "Dá para ter os shaders em arquivos .glsl?",
        text: "Dá, e é o jeito dos projetos maiores: cada shader num arquivo, com as cores do GLSL no editor. O Vite carrega qualquer arquivo como texto com um `?raw` no fim do caminho do import, e o texto chega ao `cena.js` como a constante de antes. No Experimente, os dois shaders vão para arquivos.",
      },
    ],
    try: [
      'Passe os shaders para arquivos: crie `src/mar.vert` e `src/mar.frag` com o texto de dentro das crases, apague as duas constantes do `src/cena.js` e importe os arquivos no começo dele, com `import vertexShader from "./mar.vert?raw";` e `import fragmentShader from "./mar.frag?raw";`.',
      "Gire a câmera com o mouse até olhar o mar de cima: o céu quase não aparece refletido, e a água fica escura. Rente à água, ela fica da cor do céu. E abaixo dela o mar some: o three.js só desenha a frente de cada triângulo, e de baixo se vê o verso.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a página abre com o mar e as ondas andando",
      "Arrastar com o mouse gira a câmera em volta do mar, e as manchas do sol mudam de lugar",
      "Mudar um número no `src/cena.js` (a altura da `uOnda1`, por exemplo) e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const MAR = {
  id: "mar",
  title: "Mar com ondas na GPU",
  level: "avancado",
  // as conferências medem a superfície que o shader de vértices desenhou (`shader.surface`)
  surface: true,
  summary: "Um mar inteiro num shader de vértices: ondas que andam na velocidade das de verdade, as ondas de Gerstner, a normal calculada pelos vizinhos, o céu e o sol refletidos na água e a neblina no horizonte.",
  concepts: [
    "Shader de vértices",
    "Uniforms e varyings",
    "Ondas senoidais",
    "Tempo no shader",
    "Velocidade das ondas",
    "Ondas de Gerstner",
    "Normais pelos vizinhos",
    "Fresnel de Schlick",
    "Neblina no shader",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Neste projeto, um mar inteiro vai ser calculado na placa de vídeo: as ondas sobem, descem e andam, e o JavaScript só conta o tempo. O mar começa como uma placa plana de 60 × 60, deitada no chão da cena e dividida em 128 × 128 quadradinhos. Por enquanto, ela tem um material simples em wireframe, que desenha só as linhas dos triângulos: assim dá para ver cada vértice, e são os vértices que o shader vai mover.",
      lines: [
        {
          code: 'cena.background = new THREE.Color("#8fc1e3");',
          text: "Um céu azul-claro, de dia. A cor volta mais adiante: a água reflete o céu, e o horizonte se mistura com ele.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);",
          text: "50° de campo de visão, e o `far` em 100: a borda mais distante do mar, a uns 52 da câmera, cabe com folga.",
        },
        {
          code: "camera.position.set(0, 4, 22);",
          text: "A 4 de altura e perto da borda da frente do mar, que vai até z = 30: como alguém olhando o mar de cima de uma pedra.",
        },
        {
          code: "camera.lookAt(0, 0, 0);",
          text: "Olha para o meio do mar. Com a câmera baixa, o mar vai até o horizonte, que fica acima do meio do visor.",
        },
        {
          code: "const geometria = new THREE.PlaneGeometry(60, 60, 128, 128);",
          text: "Uma placa de 60 por 60, com 128 divisões em cada direção: 129 × 129 = 16.641 vértices, a 0,47 um do outro.",
        },
        {
          code: "geometria.rotateX(-Math.PI / 2);",
          text: "A `PlaneGeometry` nasce em pé, no plano xy, de frente para a câmera. Girar −90° em volta do eixo x a deita no chão, no plano xz, com a frente para cima. Girar a geometria, e não a malha, muda as posições dos próprios vértices: a malha fica sem rotação, e o y de cada vértice já é a altura dele.",
        },
        {
          code: 'const material = new THREE.MeshBasicMaterial({ color: "#0b4268", wireframe: true });',
          text: "Um azul-marinho, a cor da água funda. O `wireframe: true` desenha só as arestas dos triângulos, sem o preenchimento: dá para ver a grade, e qualquer vértice que sair do lugar.",
        },
        {
          code: "const mar = new THREE.Mesh(geometria, material);",
          text: "O mar: a placa com o material.",
        },
      ],
      why: [
        {
          title: "Por que tantos vértices?",
          text: "O shader de vértices só move vértices: entre eles, a placa de vídeo estica triângulos retos. Para uma onda parecer curva, ela precisa de vários vértices de uma crista à outra. A onda mais curta deste projeto tem 3,5 de comprimento, e com um vértice a cada 0,47 ela ganha uns 7 por onda. São 16.641 vértices e 32.768 triângulos: muito para o JavaScript mover a cada quadro, e pouco para a placa de vídeo.",
        },
        {
          title: "Por que não mover os vértices no JavaScript?",
          text: "Daria: a cada quadro, um laço por todos os vértices, mudando a posição de cada um, e a geometria inteira mandada de novo para a placa de vídeo. São 16.641 vértices, 60 vezes por segundo, num núcleo só do processador, e mais a cópia. Com o shader, a geometria vai uma vez só para a placa de vídeo, e cada quadro manda um número, o tempo: milhares de núcleos calculam os vértices ao mesmo tempo.",
        },
      ],
      try: [
        "Troque o `128, 128` por `16, 16`: os quadradinhos ficam enormes. Depois volte.",
        "Desligue a Câmera do código e afaste a vista: o mar é um quadrado no meio do nada, e a câmera fica perto da borda da frente.",
        "Troque o `wireframe: true` por `wireframe: false`: o mar vira uma mancha azul lisa, sem nada que mostre a forma. Depois volte.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O mar é uma placa de 60 × 60, deitada no chão",
          test: ({ objects }) => {
            const points = restPoints(objects.mar);
            if (!points.length) return check(false, "o mar não tem vértices");
            const [x, y, z] = [0, 1, 2].map((k) => extent(points, k));
            if (y.size > 1 && z.size < 0.01) return check(false, "a placa está em pé, de frente para a câmera: falta deitá-la com geometria.rotateX(-Math.PI / 2)");
            if (y.size > 0.01) return check(false, `a placa não está deitada: os vértices vão de y = ${fmt(y.min)} a y = ${fmt(y.max)}`);
            if (Math.abs(x.size - 60) > 0.5 || Math.abs(z.size - 60) > 0.5) return check(false, `a placa tem ${fmt(x.size, 1)} × ${fmt(z.size, 1)}: o mar tem 60 × 60`);
            const center = [(x.min + x.max) / 2, y.min, (z.min + z.max) / 2];
            return check(Math.hypot(...center) <= 0.5, `o meio da placa está em (${center.map((c) => fmt(c)).join("; ")}): ele fica na origem, (0, 0, 0)`);
          },
        },
        {
          text: "A placa tem 128 × 128 quadradinhos",
          test: ({ objects }) => {
            const g = objects.mar.geometry;
            if (g?.type !== "PlaneGeometry") return check(false, `o mar é ${g?.type ?? "um objeto sem geometria"}, e não uma PlaneGeometry`);
            const { widthSegments: w = 1, heightSegments: h = 1 } = g.parameters;
            return check(w >= 128 && h >= 128, `a placa tem ${w} × ${h} quadradinhos: as ondas mais curtas do projeto pedem 128 × 128`);
          },
        },
        {
          text: "A câmera está acima da água, olhando para o meio do mar",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const y = camera.worldPosition[1];
            if (y < 1 || y > 10) return check(false, `a câmera está a ${fmt(y)} de altura: ela fica a 4, acima da água e perto dela`);
            const angle = deg(Math.acos(Math.min(1, dot(camera.direction, toward(camera.worldPosition, [0, 0, 0])))));
            return check(angle <= 3, "a câmera não olha para o meio do mar: falta o camera.lookAt(0, 0, 0)");
          },
        },
        {
          text: "O material desenha só as linhas (wireframe)",
          test: ({ objects }) => check(objects.mar.material?.wireframe === true, "o material não está em wireframe: falta o wireframe: true"),
        },
      ],
    },
    {
      id: "shader",
      title: "O primeiro shader",
      view: "camera",
      goal:
        "O mar ganha um material escrito por nós, um `ShaderMaterial`, com os dois programas em GLSL que a placa de vídeo roda. O de vértices, por enquanto, só leva cada vértice para o lugar dele na tela, sem mexer em nada. O de fragmentos pinta as linhas com o azul do uniform `uCorDaAgua`, convertido para sRGB. Na tela, nada muda: a mesma grade azul. A diferença é que agora a conta de cada vértice está nas nossas mãos, e o próximo passo já a muda.",
      lines: [
        {
          code: "const vertexShader = /* glsl */ `",
          text: "O shader de vértices, num texto entre crases. O three.js o manda para a placa de vídeo, que o compila e o roda uma vez para cada vértice da placa, os 16.641, a cada quadro. O comentário `/* glsl */` avisa editores como o VS Code, com uma extensão de GLSL, para colorir o texto como GLSL.",
        },
        {
          code: "    vec4 mundo = modelMatrix * vec4(position, 1.0);",
          text: "A posição do vértice no mundo. `position` é a posição dele na geometria, e a `modelMatrix`, que o three.js declara e preenche, leva a geometria para o lugar da malha na cena. Aqui a malha está na origem, sem girar, e o mundo é igual à geometria; mas as ondas vão ser calculadas no mundo, e continuam certas se a malha mudar de lugar.",
        },
        {
          code: "    gl_Position = projectionMatrix * viewMatrix * mundo;",
          text: "Do mundo para a tela: a `viewMatrix` põe o ponto no espaço da câmera, e a `projectionMatrix` aplica a perspectiva. A `modelViewMatrix` junta a do modelo e a da câmera numa só; separadas, dá para mexer no ponto no meio do caminho, no mundo.",
        },
        {
          code: "  uniform vec3 uCorDaAgua;",
          text: "A cor da água, que vem do JavaScript num uniform: o mesmo azul do passo anterior.",
        },
        {
          code: "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
          text: "A conversão para sRGB, com a fórmula do padrão: o `THREE.Color` guarda a cor no espaço linear, e a tela espera sRGB. É a função `paraSRGB` do projeto do Phong, que explica cada pedaço dela.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(uCorDaAgua), 1.0);",
          text: "Cada pixel das linhas recebe a cor da água.",
        },
        {
          code: "  wireframe: true,",
          text: "O `ShaderMaterial` também desenha em wireframe: o shader de fragmentos só roda nos pixels das linhas.",
        },
      ],
      why: [
        {
          title: "Por que calcular no mundo, e não na geometria?",
          text: "As ondas são do mar, e não da placa: uma onda que corre na direção x da cena precisa continuar correndo em x se a placa for girada ou mudar de lugar. Calculando depois da `modelMatrix`, o shader trabalha nas coordenadas da cena, as mesmas do JavaScript, e o x do GLSL é o x que você vê no visor.",
        },
        {
          title: "O que mudou na tela?",
          text: "Nada, e é de propósito: antes de mexer nos vértices, é bom ter certeza de que o shader desenha a placa onde o three.js desenhava. Daqui em diante, cada passo muda uma coisa só, e a diferença aparece na hora.",
        },
      ],
      try: [
        "Troque a linha do `gl_Position` por `gl_Position = projectionMatrix * mundo;`: sem a câmera no caminho, a placa é desenhada como se a câmera estivesse na origem, rente à água, e quase some. A conferência avisa. Depois desfaça.",
        'Troque o `"#0b4268"` do uniform por `"#ffffff"`: as linhas ficam brancas, e o shader é o mesmo.',
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O mar é desenhado por um ShaderMaterial",
          test: ({ objects }) => {
            const type = objects.mar.material?.type ?? null;
            return check(type === "ShaderMaterial", `o mar é ${type ?? "um objeto sem material"}, e não um ShaderMaterial`);
          },
        },
        {
          text: "O shader de vértices desenha a placa no lugar dela, plana",
          test: (facts) => {
            const position = "confira o gl_Position, que leva o ponto do mundo pela câmera, projectionMatrix * viewMatrix * mundo";
            const m = measure(facts, {}, { timed: false, hidden: `a placa quase não aparece na câmera: ${position}` });
            if (m.result) return m.result;
            return compareShape(m, { waves: [] }, [], `a placa não aparece onde ela está: ${position}`);
          },
        },
        {
          text: "As linhas têm a cor do uCorDaAgua, em sRGB",
          test: (facts) => {
            const m = measure(facts, { uCorDaAgua: "vec3" }, { timed: false });
            if (m.result) return m.result;
            if (!m.mar.material.wireframe) return check(false, "o material não está em wireframe: falta o wireframe: true no ShaderMaterial");
            const lines = m.points.filter((s) => gap(s.c, m.shader.background) > 2);
            if (lines.length < 10) return check(false, "não achei as linhas do mar na imagem");
            const want = srgbBytes(m.u.uCorDaAgua);
            if (fitsColor(lines.map((s) => gap(s.c, want)))) return check(true);
            if (fitsColor(lines.map((s) => gap(s.c, bytes(m.u.uCorDaAgua))))) return check(false, NO_SRGB);
            const middle = [0, 1, 2].map((k) => quantile(lines.map((s) => s.c[k]), 0.5));
            return check(false, `as linhas têm ${hex(middle)}, e o uCorDaAgua em sRGB é ${hex(want)}`);
          },
        },
      ],
    },
    {
      id: "onda",
      title: "Uma onda",
      view: "camera",
      goal:
        "Agora o shader de vértices mexe na placa: antes de ir para a tela, cada vértice sobe ou desce pelo seno do x dele. O seno vai de −1 a 1 e se repete a cada 2π, uns 6,28: a placa vira uma onda, com as cristas e os vales em fila ao longo do x. Os 16.641 vértices fazem a mesma conta, cada um com o seu x, e a placa de vídeo faz todas ao mesmo tempo.",
      lines: [
        {
          code: "    mundo.y += sin(mundo.x);",
          text: "A altura do vértice ganha o seno do x dele. O `+=` soma ao que já estava, a altura da placa, 0. O `sin` é do GLSL e trabalha em radianos, como o `Math.sin` do JavaScript.",
        },
      ],
      why: [
        {
          title: "Por que o seno?",
          text: "Porque ele sobe e desce suave e se repete sozinho: é a forma mais simples de onda. Na física, quase toda onda pequena, de luz, de som ou de água, é uma soma de senos. Os próximos passos fazem exatamente isso: ajustam este seno até ele ser uma onda do mar, e depois somam vários.",
        },
        {
          title: "O JavaScript ficou sabendo da onda?",
          text: "Não. A geometria continua plana na memória do JavaScript: o `geometria.attributes.position` não mudou, e o three.js acha que a placa é plana. A onda existe só no caminho de cada vértice para a tela, dentro da placa de vídeo. Uma conta do JavaScript que dependa da altura do mar, como um barco que boia, precisa repetir a conta do shader.",
        },
      ],
      try: [
        "Troque `sin(mundo.x)` por `sin(mundo.z)`: a onda passa a correr em z, de frente para a câmera. Depois volte.",
        "Troque por `2.0 * sin(mundo.x)`: as ondas ficam com o dobro da altura. E com `sin(mundo.x * 2.0)`, com metade do comprimento. A conferência avisa, porque o passo pede sin(x). Depois volte.",
        "Escreva `2 * sin(mundo.x)`, sem o `.0`: o GLSL não multiplica um inteiro por um número com casas decimais, e a barra embaixo do código explica. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "A placa vira uma onda: cada ponto sobe ou desce sin(x)",
          test: (facts) => {
            const m = measure(facts, {}, { timed: false });
            if (m.result) return m.result;
            return compareShape(m, { waves: [wave({})] }, [
              [{ waves: [wave({ d: [0, 1] })] }, "a onda corre em z: o seno usa o x, sin(mundo.x)"],
              [{ waves: [] }, "a placa continua plana: falta somar o sin(mundo.x) ao mundo.y"],
            ]);
          },
        },
      ],
    },
    {
      id: "tempo",
      title: "As ondas andam",
      view: "camera",
      motion: true,
      goal:
        "Uma onda parada não é mar. Para andar, a onda precisa do tempo, e o tempo só o JavaScript conhece: o shader recebe o tempo num uniform, o `uTempo`, que a função `animar` atualiza a cada quadro. Dentro do seno, o tempo subtraído do x empurra a onda para a frente: a crista que estava em x = π/2 no começo está em x = π/2 + 1 depois de um segundo. É o único número que o JavaScript manda por quadro; os 16.641 vértices fazem o resto na placa de vídeo.",
      lines: [
        {
          code: "  uniform float uTempo;",
          text: "O tempo, em segundos: um `float`, um número com casas decimais, igual para todos os vértices.",
        },
        {
          code: "    mundo.y += sin(mundo.x - uTempo);",
          text: "A crista do seno está onde `mundo.x - uTempo` vale π/2. Com o tempo crescendo, o x da crista cresce junto: a onda anda no sentido do x, 1 por segundo.",
        },
        {
          code: "    uTempo: { value: 0 },",
          text: "O uniform no JavaScript, começando em 0.",
        },
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama `animar` a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou.",
        },
        {
          code: "  material.uniforms.uTempo.value = tempo;",
          text: "Guarda o tempo no uniform. O three.js manda os uniforms para a placa de vídeo antes de cada desenho, e o shader recebe o tempo novo no mesmo quadro.",
        },
      ],
      why: [
        {
          title: "Por que x − tempo, e não x + tempo?",
          text: "Para a onda andar para o lado do x positivo. Um ponto da forma da onda, a crista, por exemplo, fica onde x − tempo tem um valor fixo; se o tempo cresce, o x da crista precisa crescer junto. Com x + tempo, ela andaria para trás, para o −x.",
        },
        {
          title: "A água anda com a onda?",
          text: "Não: mover a malha, com `mar.position.x`, arrastaria a placa inteira, borda e tudo. Aqui cada vértice só sobe e desce no lugar dele, e quem anda é a forma. Repare num vértice qualquer da grade: ele não sai da sua coluna. É como a ola num estádio, em que cada pessoa só levanta e senta, e a onda dá a volta.",
        },
      ],
      try: [
        "Troque o `- uTempo` por `+ uTempo`: a onda anda para o outro lado. A conferência avisa. Depois volte.",
        "Troque o `uTempo` do seno por `uTempo * 3.0`: a onda anda 3 vezes mais rápido, e a conferência avisa, porque o passo pede sin(x − uTempo). Depois volte.",
        "Pause a animação com o botão da barra de cima: o tempo para, e a onda congela onde estava.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O uniform uTempo recebe o tempo da animação a cada quadro",
          test: (facts) => clockOf(facts, facts.objects.mar).result ?? check(true),
        },
        {
          text: "A onda anda: a superfície é sin(x − uTempo)",
          test: (facts) => {
            const m = measure(facts);
            if (m.result) return m.result;
            return compareShape(m, { waves: [wave({ w: 1 })] }, [
              [{ waves: [wave({})] }, "a onda não anda: falta o uTempo dentro do seno, sin(mundo.x - uTempo)", true],
              [{ waves: [wave({ w: -1 })] }, "a onda anda para trás, para o −x: o tempo entra com menos, sin(mundo.x - uTempo)", true],
            ]);
          },
        },
      ],
    },
    {
      id: "fisica",
      title: "Ondas de verdade",
      view: "camera",
      motion: true,
      goal:
        "As ondas do passo anterior têm 1 de altura e 6,28 de comprimento e andam 1 por segundo: números que não vieram de lugar nenhum. Uma onda do mar tem uma altura e um comprimento, e a velocidade não é escolha nossa: em águas fundas, uma onda mais comprida anda mais rápido, e a física dá a conta, c = √(g / k), com g = 9,8, a gravidade. Dois uniforms novos, a altura e o comprimento, e o resto o shader calcula.",
      lines: [
        {
          code: "  uniform float uAltura;",
          text: "A altura da onda: o quanto a crista sobe acima da água parada, e o vale desce abaixo dela.",
        },
        {
          code: "  uniform float uComprimento;",
          text: "O comprimento da onda: a distância de uma crista à seguinte.",
        },
        {
          code: "  const float PI = 3.14159265;",
          text: "O GLSL não tem o π pronto. Um `const` é um valor que não muda, e o compilador o troca pelo número em cada conta.",
        },
        {
          code: "    float k = 2.0 * PI / uComprimento;",
          text: "O número de onda: o quanto a fase do seno anda por unidade de distância. O seno se repete a cada 2π, e com k = 2π / comprimento ele se repete a cada `uComprimento`.",
        },
        {
          code: "    float c = sqrt(9.8 / k);",
          text: "A velocidade da onda em águas fundas: √(g / k). Com 10 de comprimento, k ≈ 0,63 e c ≈ 3,95 por segundo; uma onda 4 vezes mais curta anda na metade da velocidade.",
        },
        {
          code: "    mundo.y += uAltura * sin(k * (mundo.x - c * uTempo));",
          text: "O mesmo seno, agora com a altura multiplicando e o k esticando a onda. O tempo vai multiplicado pela velocidade: em `uTempo` segundos, a onda anda `c * uTempo`.",
        },
        {
          code: "    uAltura: { value: 0.5 },",
          text: "0,5 de altura e, na linha de baixo, 10 de comprimento. Pensando em metros, é uma onda de mar aberto num dia calmo, que anda a uns 14 km/h.",
        },
      ],
      why: [
        {
          title: "De onde vem c = √(g / k)?",
          text: "Da física das ondas na água: a gravidade puxa as cristas para baixo, e a água em volta empurra os vales para cima. Em águas fundas, mais fundas que meio comprimento de onda, a conta dá ω² = g·k, em que ω é o quanto a fase anda por segundo, e a velocidade da onda é ω / k = √(g / k). É a mesma conta do oceano: uma onda de 100 m de comprimento anda uns 45 km/h.",
        },
        {
          title: "Por que a altura e o comprimento em uniforms?",
          text: "Para mudar a onda sem compilar o shader de novo: o JavaScript troca o valor, e a placa de vídeo recebe no próximo quadro. No passo 10, cada onda vira um uniform só, com quatro números.",
        },
      ],
      try: [
        "Mude o `uComprimento` para 40: a onda fica longa e rápida. Para 3: curta e lenta. Depois volte para 10.",
        "Troque o `9.8` por `1.6`, a gravidade da Lua: as ondas andam bem mais devagar, e a conferência avisa. Depois volte.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "A onda tem a altura uAltura e o comprimento uComprimento",
          test: (facts) => {
            const m = measure(facts, SINE, { timed: false });
            return m.result ?? waveSize(m);
          },
        },
        {
          text: "Ela anda na velocidade das ondas do mar, c = √(9,8 / k)",
          test: (facts) => {
            const m = measure(facts, SINE);
            if (m.result) return m.result;
            if (!waveSize(m).ok) return check(false, "a altura e o comprimento da onda ainda não batem: a conferência de cima diz o que falta");
            const at = (speed) => sineSea(m.u, speed);
            return compareShape(
              m,
              at(omega),
              [
                [at(() => 0), "a onda parou: falta o tempo na fase, k * (mundo.x - c * uTempo)", true],
                [at((k) => -omega(k)), "a onda anda para trás, para o −x: o tempo entra com menos, k * (mundo.x - c * uTempo)", true],
                [at((k) => k), "a onda anda devagar demais: falta multiplicar o tempo pela velocidade, c * uTempo", true],
                [at((k) => Math.sqrt(9.8 / k)), "o tempo também vai multiplicado pelo k: k * (mundo.x - c * uTempo), com o parêntese", true],
              ],
              "a onda não anda na velocidade c = √(9,8 / k): a fase é k * (mundo.x - c * uTempo)",
            );
          },
        },
      ],
    },
    {
      id: "normal",
      title: "A normal de cada ponto",
      view: "camera",
      motion: true,
      goal:
        "Sem o wireframe, a placa inteira fica de uma cor só, e as ondas somem: falta luz, e a luz depende da normal, a direção para onde a superfície está virada em cada ponto. A placa tem normais, mas são as da placa parada, todas para cima: o shader moveu os vértices, e a normal não acompanhou. A saída é calcular a normal no próprio shader. A conta da onda vai para uma função, e chamando a função em dois vizinhos de cada lado do vértice, dá para saber a inclinação. Para conferir, a cor de cada ponto mostra a normal dele.",
      lines: [
        {
          code: "  varying vec3 vNormal;",
          after: "const vertexShader",
          text: "Um varying: um valor que o shader de vértices calcula e o de fragmentos recebe, misturado entre os três vértices de cada triângulo. Os dois shaders o declaram, com o mesmo nome e o mesmo tipo.",
        },
        {
          code: "  vec3 superficie(vec3 p) {",
          text: "A conta da onda numa função: recebe um ponto da placa parada e devolve onde ele está agora. Com ela, o shader pode perguntar onde está qualquer ponto, e não só o do vértice.",
        },
        {
          code: "    p.y += uAltura * sin(k * (p.x - c * uTempo));",
          text: "A mesma onda do passo anterior, no `p` da função. O `p` é uma cópia: mudar o `p` aqui dentro não muda o ponto de quem chamou.",
        },
        {
          code: "    vec3 p = superficie(mundo.xyz);",
          text: "O vértice no lugar da onda. O `.xyz` pega os três primeiros números do `vec4`.",
        },
        {
          code: "    vec3 dx = vec3(0.01, 0.0, 0.0);",
          text: "Um passo pequeno no x, de 0,01: pequeno para acompanhar a curva da onda, sem ser tão pequeno que a diferença se perca nos arredondamentos da placa de vídeo.",
        },
        {
          code: "    vec3 tangente = superficie(mundo.xyz + dx) - superficie(mundo.xyz - dx);",
          text: "Dois vizinhos do vértice, um pouco antes e um pouco depois no x, já no lugar da onda. A diferença entre eles é uma seta que acompanha a superfície na direção do x: se a onda sobe ali, a seta sobe junto.",
        },
        {
          code: "    vec3 binormal = superficie(mundo.xyz + dz) - superficie(mundo.xyz - dz);",
          text: "O mesmo na direção do z. As duas setas ficam deitadas na superfície, cada uma num sentido.",
        },
        {
          code: "    vNormal = normalize(cross(binormal, tangente));",
          text: "O produto vetorial (`cross`) de duas setas dá uma terceira, em pé sobre as duas: a normal. A ordem importa: `cross(binormal, tangente)` aponta para cima, e ao contrário, para baixo. O `normalize` deixa o comprimento em 1.",
        },
        {
          code: "    vec3 n = normalize(vNormal);",
          text: "No pixel, a normal chega misturada das dos três vértices, e a mistura encurta um pouco o vetor: normaliza de novo.",
        },
        {
          code: "    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);",
          text: "A normal como cor: cada número vai de −1 a 1, e vezes 0,5 mais 0,5 fica de 0 a 1. Para cima, (0, 1, 0), dá um verde claro; inclinada para +x, mais vermelho; para +z, mais azul.",
        },
      ],
      why: [
        {
          title: "Por que não usar a normal da geometria?",
          text: "A `PlaneGeometry` traz uma normal por vértice, no atributo `normal`, mas ela foi calculada para a placa plana: (0, 1, 0) em todo lugar. O shader move o vértice, e o three.js nem fica sabendo; a normal guardada continua apontando para cima. Quem move os vértices no shader também calcula a normal no shader.",
        },
        {
          title: "Dá para calcular a normal sem os vizinhos?",
          text: "Dá, com a derivada da onda: a inclinação de A·sin(k·x) é A·k·cos(k·x). É a conta mais rápida, mas ela precisa ser refeita à mão a cada mudança na onda, e erra fácil. Com os vizinhos, a função `superficie` é a única conta: o passo 10 troca a onda por três, e a normal continua certa sem mudar uma linha. O preço são quatro chamadas a mais por vértice, que a placa de vídeo faz sem sentir.",
        },
      ],
      try: [
        "Troque a ordem do `cross` para `cross(tangente, binormal)`: a normal aponta para baixo, e o mar fica roxo. A conferência avisa. Depois desfaça.",
        "Troque `vNormal = normalize(cross(binormal, tangente));` por `vNormal = normal;`: a normal da geometria, a da placa parada. O mar fica verde por igual, e as ondas somem. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "A onda continua a mesma, agora na função superficie",
          test: (facts) => {
            const m = measure(facts, SINE);
            if (m.result) return m.result;
            const model = sineSea(m.u);
            return compareShape(m, model, timeSlips(model, "a onda parou: a função superficie precisa do tempo, k * (p.x - c * uTempo)", "a onda anda para trás: o tempo entra com menos, k * (p.x - c * uTempo)"));
          },
        },
        {
          text: "A cor de cada ponto mostra a normal dele",
          test: (facts) => {
            const m = measure(facts, SINE);
            if (m.result) return m.result;
            if (m.mar.material.wireframe) return check(false, "o mar ainda está em wireframe: tire o wireframe: true do material para ver a cor de cada ponto");
            return shading(m, sineSea(m.u), { normal: true }, [
              [{ flip: true }, "a normal aponta para baixo: no cross, a ordem é cross(binormal, tangente)"],
              [{ up: true }, "o mar inteiro tem a cor da normal da placa parada, (0, 1, 0): a normal precisa vir dos vizinhos, que sobem e descem com a onda"],
              [{ zero: true }, "a normal está quase zerada, e o mar sai cinza: falta o normalize, normalize(cross(binormal, tangente))"],
              [{ srgb: true }, "neste passo, a cor é a normal direto, sem a paraSRGB: gl_FragColor = vec4(n * 0.5 + 0.5, 1.0)"],
            ]);
          },
        },
      ],
    },
    {
      id: "ceu",
      title: "O céu refletido",
      view: "camera",
      motion: true,
      goal:
        "A água quase não tem cor própria: o que se vê no mar é, quase todo, o céu refletido. O quanto o céu reflete depende do ângulo. Olhando de cima, quase nada, e a água mostra o azul escuro do fundo; olhando rente à superfície, quase tudo, e a água fica da cor do céu. É o efeito de Fresnel, e a conta de Schlick dá uma boa aproximação dele. Com o reflexo, as ondas ganham volume: o lado de cada onda virado para a câmera fica escuro, e o lado que foge dela, claro.",
      lines: [
        {
          code: "  varying vec3 vPosicao;",
          after: "const vertexShader",
          text: "Um varying novo, com o ponto da superfície no mundo: o shader de fragmentos precisa dele para saber de onde a câmera vê cada pixel.",
        },
        {
          code: "    vPosicao = p;",
          text: "O ponto do vértice, já no lugar da onda. Entre os vértices, o varying chega a cada pixel misturado: é o ponto do triângulo naquele pixel.",
        },
        {
          code: "  uniform vec3 uCorDoCeu;",
          text: "A cor do céu, num uniform.",
        },
        {
          code: "    vec3 v = normalize(cameraPosition - vPosicao);",
          text: "A direção do ponto para a câmera, com comprimento 1. O `cameraPosition` é um uniform que o three.js declara e preenche: a posição da câmera no mundo.",
        },
        {
          code: "    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);",
          text: "A conta de Schlick. O `dot(n, v)` é 1 quando a câmera olha a superfície de frente e 0 quando olha rente a ela. O `1.0 - …` inverte, e a quinta potência deixa o reflexo fraco na maior parte dos ângulos e forte só perto do rente. O 0,02 é o quanto a água reflete olhando de frente: 2%.",
        },
        {
          code: "    vec3 cor = mix(uCorDaAgua, uCorDoCeu, fresnel);",
          text: "Mistura a cor da água e a do céu pelo Fresnel: 0 dá a água, 1 dá o céu.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(cor), 1.0);",
          text: "A cor misturada, em sRGB.",
        },
        {
          code: "    uCorDoCeu: { value: cena.background },",
          text: "O uniform recebe o próprio `THREE.Color` do fundo da cena: o céu refletido é o céu do fundo, e mudar a cor do fundo muda os dois.",
        },
      ],
      why: [
        {
          title: "Por que o reflexo depende do ângulo?",
          text: "Quando a luz chega à superfície da água, uma parte reflete e outra entra. As equações de Fresnel dizem quanto: 2% olhando de frente e quase 100% rente à superfície. É por isso que um lago parece transparente perto dos pés e um espelho lá longe. A conta exata é comprida; a de Schlick, com a quinta potência, erra pouco, e é a que os jogos usam.",
        },
        {
          title: "Por que não iluminar com a luz difusa?",
          text: "A luz difusa é a das superfícies foscas, que espalham a luz para todo lado. A água é lisa: ela não espalha, reflete, como um espelho, e o que ela reflete é o céu inteiro. Com a luz difusa, o mar pareceria de plástico.",
        },
      ],
      try: [
        "Troque o `5.0` da potência por `1.0`: o reflexo cresce aos poucos com o ângulo, e o mar fica claro e sem contraste. A conferência avisa. Depois volte.",
        'Mude a cor do fundo da cena para `"#ffb37a"`, um céu de fim de tarde: o mar acompanha, porque o uniform é o mesmo `THREE.Color` do fundo.',
        "Troque `cameraPosition - vPosicao` por `vPosicao - cameraPosition`: a direção fica ao contrário, o Fresnel dá 1 em todo lugar, e o mar inteiro fica da cor do céu. A conferência avisa. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O céu refletido é a cor do fundo da cena",
          test: ({ objects, background }) => {
            const u = uniformOf(objects.mar, "uCorDoCeu", "vec3");
            if (u.result) return u.result;
            if (!background) return check(false, "a cena não tem cor de fundo");
            const sky = srgbBytes(u.value);
            return check(gap(sky, pixelOf(background)) <= 1, `o uCorDoCeu é ${hex(sky)}, e o fundo da cena é ${background}: o céu refletido é o do fundo, uCorDoCeu: { value: cena.background }`);
          },
        },
        {
          text: "O mar reflete o céu pelo Fresnel de Schlick",
          test: (facts) => {
            const m = measure(facts, { ...SINE, ...COLORS });
            if (m.result) return m.result;
            return shading(m, sineSea(m.u), {}, [
              [{ linear: true }, NO_SRGB],
              [{ swapMix: true }, "a água e o céu trocaram de lugar no mix: com fresnel 0 (olhando de cima), a cor é a da água, mix(uCorDaAgua, uCorDoCeu, fresnel)"],
              [{ flipView: true }, "a direção v vai do ponto para a câmera: cameraPosition - vPosicao"],
            ]);
          },
        },
      ],
    },
    {
      id: "gerstner",
      title: "Ondas de Gerstner",
      view: "camera",
      motion: true,
      goal:
        "As ondas do seno são redondas em cima e embaixo, e as do mar não: as cristas são estreitas e pontudas, e os vales, largos e rasos. Gerstner explicou por quê, em 1802: na água, cada ponto não só sobe e desce, ele anda num círculo, para a frente na crista e para trás no vale. É uma linha a mais no shader: o x do ponto anda com o cosseno da mesma fase do seno. Os vértices se juntam nas cristas e se afastam nos vales, e a onda fica com a forma das de verdade.",
      lines: [
        {
          code: "    float f = k * (p.x - c * uTempo);",
          text: "A fase da onda numa variável, `f`, porque agora ela é usada duas vezes.",
        },
        {
          code: "    p.x += uAltura * cos(f);",
          text: "O empurrão para o lado: o cosseno da mesma fase, com a mesma altura. Com o seno subindo e descendo e o cosseno indo para os lados, cada ponto anda num círculo de raio `uAltura`.",
        },
        {
          code: "    p.y += uAltura * sin(f);",
          text: "A subida de antes, com a fase da variável.",
        },
      ],
      why: [
        {
          title: "Por que os pontos andam em círculo?",
          text: "Uma onda leva energia, e não água: a água fica onde está, girando. Um barco parado no mar sobe e vai um pouco para a frente na crista, desce e volta no vale, e termina onde começou. Gerstner escreveu essa conta em 1802, e ela voltou com os jogos: é a conta do capítulo sobre água do livro GPU Gems, de 2004, que está por trás do mar de muitos deles.",
        },
        {
          title: "E se a onda for alta demais?",
          text: "Os pontos da crista chegam tão perto que se cruzam: com a altura vezes o k acima de 1, o círculo de cada ponto fica maior que o espaço até o vizinho, e a crista vira uma laçada, virada do avesso. Na natureza, é perto daí que a onda quebra. Com 0,5 de altura e 10 de comprimento, o produto é 0,31: longe disso.",
        },
      ],
      try: [
        "Mude o `uAltura` do JavaScript para 1.5: as cristas ficam bem pontudas. Com 1.7, a altura vezes o k passa de 1, as cristas se dobram numa laçada, e a conferência avisa. Depois volte para 0.5.",
        "Troque o `+=` do `p.x` por `-=`: tudo ao contrário, cristas largas e vales pontudos. A conferência avisa. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "Os pontos andam em círculo: as cristas ficam pontudas, e os vales, largos",
          test: (facts) => {
            const m = measure(facts, SINE);
            if (m.result) return m.result;
            const source = [1, 0, m.u.uAltura, m.u.uComprimento];
            const model = { waves: [gerstner(source)] };
            const [g] = model.waves;
            return compareShape(m, model, [
              [{ waves: [gerstner(source, { flat: true })] }, "os pontos ainda só sobem e descem: falta empurrar o x, p.x += uAltura * cos(f)"],
              [{ waves: [{ ...g, sinPush: true }] }, "o x vai com o cosseno, e o y com o seno: p.x += uAltura * cos(f). Com os dois iguais, os pontos andam numa linha, e não num círculo"],
              [{ waves: [{ ...g, push: [-g.a, 0] }] }, "o empurrão está ao contrário, e as cristas ficaram largas: p.x += uAltura * cos(f), com +"],
              ...timeSlips(model, "a onda parou: a fase precisa do tempo, k * (p.x - c * uTempo)", "a onda anda para trás: o tempo entra com menos, k * (p.x - c * uTempo)"),
            ]);
          },
        },
        {
          text: "A crista não se dobra: a altura vezes o k fica abaixo de 1",
          test: ({ objects }) => {
            const u = uniformsOf(objects.mar, SINE);
            if (u.result) return u.result;
            const { uAltura: a, uComprimento: length } = u.values;
            const q = steepness([[1, 0, a, length]]);
            return check(q < 1, `com ${fmt(a)} de altura e ${fmt(length)} de comprimento, a altura vezes o k dá ${fmt(q)}: de 1 para cima, as cristas se dobram em laçadas`);
          },
        },
      ],
    },
    {
      id: "direcao",
      title: "Para qualquer lado",
      view: "camera",
      motion: true,
      goal:
        "Até aqui, a onda só corre ao longo do x. Para correr para qualquer lado, ela ganha um uniform com a direção, um `vec2` com o x e o z, e a fase passa a medir a distância nessa direção, com o produto escalar. O empurrão de Gerstner vai junto: cada ponto anda num círculo em pé na direção da onda. Com a direção (1; 0,5), a onda atravessa o mar na diagonal, da esquerda para a direita e vindo na direção da câmera.",
      lines: [
        {
          code: "  uniform vec2 uDirecao;",
          text: "A direção da onda no chão: um `vec2`, com o x e o z.",
        },
        {
          code: "    vec2 d = normalize(uDirecao);",
          text: "Com comprimento 1: assim a direção não muda a distância medida, e (2; 1) vale o mesmo que (1; 0,5).",
        },
        {
          code: "    float f = k * (dot(d, p.xz) - c * uTempo);",
          text: "O `p.xz` monta um `vec2` com o x e o z do ponto, e o `dot` com a direção dá a distância andada nela: é o que o `p.x` era quando a direção era o próprio x. Os pontos de uma mesma crista são os que têm o mesmo `dot`, numa linha perpendicular à direção.",
        },
        {
          code: "    p.x += d.x * uAltura * cos(f);",
          text: "O empurrão de Gerstner, agora na direção da onda: a parte dele no x…",
        },
        {
          code: "    p.z += d.y * uAltura * cos(f);",
          text: "… e a parte no z. O `d.y` é o segundo número do `vec2`, que aqui guarda o z: o GLSL chama os números de um vetor de x, y, z e w, seja lá o que eles representem.",
        },
        {
          code: "    uDirecao: { value: new THREE.Vector2(1, 0.5) },",
          text: "A direção (1; 0,5): mais para +x que para +z. O `Vector2` do three.js vira o `vec2` do shader.",
        },
      ],
      why: [
        {
          title: "O que o dot faz aqui?",
          text: "O produto escalar de dois vetores, quando um deles tem comprimento 1, é o quanto o outro anda na direção dele: a sombra de um sobre o outro. Para a onda, só importa o quanto cada ponto está à frente na direção em que ela corre. O quanto ele está para o lado não muda nada, e todos os pontos de uma linha perpendicular à direção ficam na mesma fase.",
        },
        {
          title: "Por que o mesmo uAltura no empurrão e na subida?",
          text: "Para o círculo ser redondo: o empurrão vai para os lados com o cosseno, e a subida com o seno, os dois com o mesmo raio. Com raios diferentes, os pontos andariam em elipses, que é o que acontece em águas rasas, onde o fundo achata o movimento.",
        },
      ],
      try: [
        "Mude a direção para `(0, 1)`: a onda vem direto na direção da câmera. E `(-1, 0)`: corre para a esquerda.",
        "Troque `normalize(uDirecao)` por `uDirecao`: com a direção mais comprida que 1, a onda fica mais curta e mais lenta do que deveria. A conferência avisa. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "A onda corre na direção do uDirecao, com o empurrão junto",
          test: (facts) => {
            const m = measure(facts, DIRECTION);
            if (m.result) return m.result;
            const g = directionWave(m.u);
            const model = { waves: [g] };
            return compareShape(m, model, [
              [{ waves: [gerstner([1, 0, m.u.uAltura, m.u.uComprimento])] }, "a onda ainda corre em x: a fase usa a direção, dot(d, p.xz)"],
              [{ waves: [directionWave(m.u, { raw: true })] }, "a direção precisa de comprimento 1: vec2 d = normalize(uDirecao)"],
              [{ waves: [{ ...g, push: [g.push[0], 0] }] }, "falta empurrar o z também: p.z += d.y * uAltura * cos(f)"],
              [{ waves: [{ ...g, push: [g.a, g.push[1]] }] }, "o empurrão vai na direção da onda: p.x += d.x * uAltura * cos(f)"],
              ...timeSlips(model, "a onda parou: a fase precisa do tempo, k * (dot(d, p.xz) - c * uTempo)", "a onda anda para trás: o tempo entra com menos, k * (dot(d, p.xz) - c * uTempo)"),
            ]);
          },
        },
      ],
    },
    {
      id: "ondas",
      title: "Três ondas juntas",
      view: "camera",
      motion: true,
      goal:
        "Um mar de verdade não tem uma onda só: tem ondas compridas que vêm de longe e outras mais curtas, de outros lados, todas somadas. A conta de uma onda vai para uma função, `onda`, e cada onda vira um uniform com quatro números: a direção, a altura e o comprimento. A superfície soma três, uma comprida, de 10, uma média, de 6, e uma curta, de 3,5, cada uma de um lado e na velocidade do seu comprimento. Elas se cruzam, se somam e se desfazem, e o mar deixa de parecer um padrão.",
      lines: [
        {
          code: "  uniform vec4 uOnda1;",
          text: "Uma onda inteira num `vec4`: a direção em x e em z, a altura e o comprimento. As três ondas usam o mesmo tipo, e a função recebe qualquer uma delas.",
        },
        {
          code: "  vec3 onda(vec4 o, vec3 p) {",
          text: "A onda de Gerstner do passo anterior, numa função que recebe a onda e o ponto e devolve só o deslocamento: o quanto o ponto anda por causa daquela onda.",
        },
        {
          code: "    vec2 d = normalize(o.xy);",
          text: "A direção são os dois primeiros números do `vec4`, `o.xy`.",
        },
        {
          code: "    float k = 2.0 * PI / o.w;",
          text: "O comprimento é o quarto, `o.w`.",
        },
        {
          code: "    return vec3(d.x * o.z * cos(f), o.z * sin(f), d.y * o.z * cos(f));",
          text: "O deslocamento: o empurrão na direção da onda e a subida, com a altura no terceiro número, `o.z`. São as contas do passo anterior, devolvidas em vez de somadas ao `p`.",
        },
        {
          code: "    return p + onda(uOnda1, p) + onda(uOnda2, p) + onda(uOnda3, p);",
          text: "O ponto mais os três deslocamentos. As três ondas são calculadas no mesmo ponto parado `p`, e só no fim tudo se soma: uma onda não sabe das outras, como na água.",
        },
        {
          code: "    uOnda1: { value: new THREE.Vector4(1, 0, 0.35, 10) },",
          text: "A onda maior: 10 de comprimento e 0,35 de altura, correndo para +x.",
        },
        {
          code: "    uOnda2: { value: new THREE.Vector4(1, 0.7, 0.18, 6) },",
          text: "Uma média, de 6, na diagonal, com metade da altura.",
        },
        {
          code: "    uOnda3: { value: new THREE.Vector4(-0.4, 1, 0.08, 3.5) },",
          text: "E uma curta, de 3,5, vindo quase na direção da câmera e um pouco para a esquerda: baixa, como as ondinhas que o vento faz em cima das grandes.",
        },
      ],
      why: [
        {
          title: "Por que somar ondas?",
          text: "Na água funda, ondas pequenas passam umas pelas outras sem se atrapalhar: o deslocamento de duas juntas é a soma do de cada uma. E qualquer forma de mar, por mais bagunçada, pode ser escrita como uma soma de ondas simples, de muitos comprimentos e direções. Os mares de filmes e jogos somam milhares, com uma conta chamada transformada de Fourier; três já bastam para o mar deixar de parecer um padrão.",
        },
        {
          title: "Por que as ondas curtas são mais baixas?",
          text: "Para nenhuma crista se dobrar: na soma, os pontos chegam perto pelas três ondas juntas, e o que conta é a soma de altura vezes k de todas, que precisa ficar abaixo de 1. Aqui ela dá 0,22 + 0,19 + 0,14 = 0,55. No mar é parecido: as ondas curtas ficam baixas, porque quebram antes de crescer.",
        },
      ],
      try: [
        "Mude a altura da `uOnda1` (o terceiro número) para 0: sobram as duas ondas menores, e o mar fica picado, sem as ondas longas. Depois volte para 0.35.",
        "Mude a direção da `uOnda2` para `(-1, 0.3)`: ela passa a vir do outro lado e cruza a maior de frente.",
        "Apague o `+ onda(uOnda3, p)`: o mar perde as ondas curtas. A conferência diz qual onda falta. Depois desfaça.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O mar soma as três ondas, cada uma com a sua direção, altura e comprimento",
          test: (facts) => {
            const m = measure(facts, WAVES);
            if (m.result) return m.result;
            const model = threeWaves(m.u);
            return compareShape(m, model, [
              ...NAMES.map((name, i) => [{ waves: model.waves.filter((_, j) => j !== i) }, `falta somar a onda ${name}: p + onda(uOnda1, p) + onda(uOnda2, p) + onda(uOnda3, p)`]),
              [{ ...model, chained: true }, "cada onda é calculada no ponto parado p, e só no fim tudo se soma: p + onda(uOnda1, p) + onda(uOnda2, p) + onda(uOnda3, p)"],
              [threeWaves(m.u, { flat: true }), "a função onda também empurra o ponto para o lado: d.x * o.z * cos(f) e d.y * o.z * cos(f)"],
              [threeWaves(m.u, { raw: true }), "a direção de cada onda precisa de comprimento 1: vec2 d = normalize(o.xy)"],
              ...timeSlips(model, "as ondas pararam: a função onda precisa do tempo, k * (dot(d, p.xz) - c * uTempo)", "as ondas andam para trás: o tempo entra com menos, k * (dot(d, p.xz) - c * uTempo)"),
            ]);
          },
        },
        {
          text: "Nenhuma crista se dobra: a soma de altura × k fica abaixo de 1",
          test: ({ objects }) => {
            const u = uniformsOf(objects.mar, WAVES);
            if (u.result) return u.result;
            const q = steepness(NAMES.map((name) => u.values[name]));
            return check(q < 1, `a soma de altura × k das três ondas dá ${fmt(q)}: de 1 para cima, as cristas se dobram em laçadas`);
          },
        },
      ],
    },
    {
      id: "sol",
      title: "O sol nas ondas",
      view: "camera",
      motion: true,
      goal:
        "Falta o sol. A água reflete o céu inteiro, e o sol é a parte mais forte dele: um ponto tão brilhante que o reflexo dele vira uma mancha branca em cada onda inclinada do jeito certo. A conta é o brilho de Blinn–Phong, com um expoente bem alto, 500, para a mancha sair pequena e forte, como o reflexo num espelho d'água. O sol fica baixo, atrás do mar, e o reflexo dele aparece nas ondas entre a câmera e o horizonte.",
      lines: [
        {
          code: "  uniform vec3 uDirecaoDoSol;",
          text: "A direção de onde o sol vem, com comprimento 1.",
        },
        {
          code: "  uniform float uBrilho;",
          text: "O expoente do brilho: quanto maior, menor e mais concentrada a mancha.",
        },
        {
          code: "    vec3 h = normalize(uDirecaoDoSol + v);",
          text: "O vetor do meio, de Blinn: a direção entre a do sol e a da câmera. Uma superfície espelha o sol na câmera quando a normal dela aponta exatamente para essa direção do meio.",
        },
        {
          code: "    cor += pow(max(dot(n, h), 0.0), uBrilho);",
          text: "O `dot(n, h)` é 1 quando a normal aponta para o meio e cai quando ela se afasta. Elevado a 500, ele só fica longe de 0 muito perto de 1: a mancha aparece só nos pedaços de onda com a inclinação certa. O brilho entra somado, branco, depois da mistura com o céu: o sol é mais forte que todo o resto, e a mancha pode passar de 1, o branco máximo da tela.",
        },
        {
          code: "    uDirecaoDoSol: { value: new THREE.Vector3(0, 0.25, -1).normalize() },",
          text: "O sol vem de trás do mar (−z), um pouco acima do horizonte: uns 14° de altura. O `normalize` do three.js deixa o vetor com comprimento 1, como o shader espera.",
        },
        {
          code: "    uBrilho: { value: 500 },",
          text: "500: uma mancha pequena e forte. Quanto mais lisa a superfície, maior o expoente, e a água é das mais lisas; um plástico fica perto de 30.",
        },
      ],
      why: [
        {
          title: "Por que o reflexo vira tantas manchas?",
          text: "Num espelho plano, o sol aparece num ponto só. No mar, cada pedaço de onda é um espelho inclinado, e os que têm a inclinação certa jogam o sol na câmera. Com as ondas andando, as inclinações mudam a cada quadro, e as manchas piscam: é o brilho do mar num dia de sol.",
        },
        {
          title: "Por que o sol fica atrás do mar?",
          text: "O reflexo de uma luz aparece entre a câmera e a luz: para ver o sol refletido na água, é preciso olhar na direção dele. Com o sol atrás da câmera, a água refletiria o céu do outro lado, e as manchas cairiam fora da vista.",
        },
      ],
      try: [
        "Mude o `uBrilho` para 50: as manchas ficam grandes e fracas, e o mar parece de plástico. Depois volte para 500.",
        "Mude a direção do sol para `(0, 0.25, 1)`: o sol vai para trás da câmera, e as manchas somem da vista. A conferência avisa. Depois volte.",
        "Troque o `0.25` por `0.8`: o sol sobe no céu, e o reflexo desce para as ondas perto da câmera.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "O sol vem de trás do mar, acima do horizonte",
          test: ({ objects }) => {
            const u = uniformOf(objects.mar, "uDirecaoDoSol", "vec3");
            if (u.result) return u.result;
            const sun = u.value;
            const length = Math.hypot(...sun);
            if (Math.abs(length - 1) > 0.01) return check(false, `a direção do sol tem comprimento ${fmt(length)}: falta o .normalize(), que deixa em 1`);
            if (sun[2] > -0.3) return check(false, "o sol não está atrás do mar: ele vem de −z, do lado oposto ao da câmera, para o reflexo cair na água à frente dela");
            return check(sun[1] > 0, "o sol está abaixo do horizonte: o y da direção dele precisa ser positivo");
          },
        },
        {
          text: "O sol brilha nas ondas, com o expoente uBrilho",
          test: (facts) => {
            const m = measure(facts, { ...WAVES, ...SUN });
            if (m.result) return m.result;
            // sem o normalize do h, ou com o sol do outro lado, o brilho some como se a linha não existisse
            return shading(m, threeWaves(m.u), { sun: true }, [
              [{ sun: false }, "o sol não brilha nas ondas: falta somar o brilho à cor, cor += pow(max(dot(n, h), 0.0), uBrilho), com o h = normalize(uDirecaoDoSol + v)"],
              [{ linear: true }, NO_SRGB],
            ]);
          },
        },
      ],
    },
    {
      id: "horizonte",
      title: "O horizonte",
      view: "camera",
      motion: true,
      goal:
        "Lá no fundo, o mar acaba numa linha reta contra o céu: é a borda da placa, a uns 52 da câmera. No mar de verdade, o horizonte fica muito mais longe, e o ar entre a câmera e ele vai apagando as ondas aos poucos, até a água se misturar com o céu. Uma neblina no shader faz o mesmo: a cor de cada pixel vai para a do céu conforme a distância, de 15 a 40. A borda da placa fica escondida, e o mar parece não ter fim.",
      lines: [
        {
          code: "  uniform float uNeblinaPerto;",
          text: "A distância em que a neblina começa: até ela, a cor fica como está.",
        },
        {
          code: "  uniform float uNeblinaLonge;",
          text: "A distância em que a neblina cobre tudo: dali em diante, só o céu.",
        },
        {
          code: "    float distancia = length(cameraPosition - vPosicao);",
          text: "A distância do ponto à câmera: o comprimento da seta entre os dois.",
        },
        {
          code: "    float neblina = smoothstep(uNeblinaPerto, uNeblinaLonge, distancia);",
          text: "O `smoothstep` dá 0 antes da primeira distância, 1 depois da segunda e, no meio, uma curva suave em S. É a curva da `THREE.Fog`, a neblina do three.js.",
        },
        {
          code: "    cor = mix(cor, uCorDoCeu, neblina);",
          text: "Mistura a cor do mar com a do céu pela neblina. Como ela vem depois do brilho, apaga também as manchas do sol lá longe.",
        },
        {
          code: "    uNeblinaPerto: { value: 15 },",
          text: "Até 15, nada de neblina: as ondas da frente ficam nítidas. E a 40, na linha de baixo, um pouco antes da borda da placa, o mar já virou céu.",
        },
      ],
      why: [
        {
          title: "Por que não usar a THREE.Fog da cena?",
          text: "Ela só vale para os materiais do three.js, que trazem a conta da neblina dentro do shader deles. Num `ShaderMaterial`, quem escreve o shader escreve a neblina: com `fog: true`, o three.js até manda os uniforms da neblina da cena, mas a conta continua por nossa conta. Com a cor do céu e as duas distâncias em uniforms, a neblina fica do jeito que o mar pede.",
        },
        {
          title: "Por que a distância, e não a profundidade?",
          text: "A `THREE.Fog` usa a profundidade, o quanto o ponto está à frente da câmera, que é uma conta mais barata. Nas bordas da imagem, a profundidade é menor que a distância, e girando a câmera a neblina muda de lugar no mar. Com a distância de verdade, um ponto do mar fica igualmente apagado olhando de frente ou de canto.",
        },
      ],
      try: [
        "Mude o `uNeblinaLonge` para 100: a neblina fica fraca demais para esconder a borda da placa, e a conferência avisa. Depois volte para 40.",
        'Mude a cor do fundo para `"#ffb37a"` de novo: o céu, o reflexo e a neblina mudam juntos, e o mar vira um mar de fim de tarde.',
        "Mude o `uNeblinaPerto` para 0: a neblina começa no pé da câmera, e até as ondas da frente ficam apagadas.",
      ],
      needs: ["mar"],
      checks: [
        {
          text: "A neblina cobre o mar antes da borda da placa",
          test: (facts) => {
            const m = measure(facts, FOG, { timed: false });
            if (m.result) return m.result;
            const { uNeblinaPerto: near, uNeblinaLonge: far } = m.u;
            if (near >= far) return check(false, `a neblina começa em ${fmt(near)} e termina em ${fmt(far)}: o começo (uNeblinaPerto) vem antes do fim (uNeblinaLonge)`);
            const edge = Math.max(...m.points.map((s) => Math.hypot(...sub(s.p, m.shader.eye))));
            return check(far <= edge, `a neblina só cobre tudo a ${fmt(far, 0)} da câmera, e o mar acaba a ${fmt(edge, 0)}: a borda da placa aparece contra o céu`);
          },
        },
        {
          text: "De longe, o mar some no céu: a neblina vai de uNeblinaPerto a uNeblinaLonge",
          test: (facts) => {
            const m = measure(facts, { ...WAVES, ...SUN, ...FOG });
            if (m.result) return m.result;
            return shading(m, threeWaves(m.u), { sun: true, fog: true }, [
              [{ fog: false }, "o mar ainda não some no horizonte: falta misturar a cor com o céu pela neblina, mix(cor, uCorDoCeu, neblina)"],
              [{ fromOrigin: true }, "a distância é até a câmera: length(cameraPosition - vPosicao)"],
              [{ swapFog: true }, "a neblina ficou ao contrário, forte perto e fraca longe: smoothstep(uNeblinaPerto, uNeblinaLonge, distancia) e mix(cor, uCorDoCeu, neblina)"],
            ]);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
