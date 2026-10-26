// phong.js — o projeto "Phong escrito à mão": a iluminação de Phong num ShaderMaterial, em GLSL,
// ao lado de um gabarito com o MeshPhongMaterial do three.js, em 12 passos no VisuGraph e 1 no seu
// computador. O assunto são os shaders: o de vértices e o de fragmentos, os uniforms e os varyings,
// o espaço linear e o sRGB, e as contas de Phong e de Blinn–Phong para o sol e para uma lâmpada,
// até a nossa esfera ficar igual ao gabarito, com a conta que o three.js faz.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js). A
// conferência olha os pixels que o shader pintou (`shader`, nos fatos: o visor desenha a cena numa
// imagem pequena e diz, para cada pixel da esfera, o ponto da superfície, a normal ali e a cor) e
// refaz a conta de cada passo com os uniforms do material, no espaço linear e em sRGB. Quando a cor
// não bate, ela tenta os erros comuns (o sinal da luz, o sRGB esquecido, o brilho de outro passo)
// para dizer qual foi.

import { add, bytes, check, deg, dist, dot, fmt, gap, hex, pct, quantile, scale, srgbBytes, sub, unit, wait } from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, during, from } from "./source.js";

const SOURCE = [
  from(0, "// Phong escrito à mão"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#101418");',
    "",
    "const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 1.5, 10);",
    "camera.lookAt(0, 0, 0);",
    "",
    "// As luzes da cena, que o three.js usa no gabarito",
    'const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.15 * Math.PI);',
    "cena.add(luzAmbiente);",
    'const sol = new THREE.DirectionalLight("#ffffff", Math.PI);',
    "sol.position.set(3, 4, 5);",
    "cena.add(sol);",
  ),
  from(
    11,
    "",
    "// Uma lâmpada laranja, com uma bolinha que mostra onde ela está",
    'const lampada = new THREE.PointLight("#ffaa55", 4 * Math.PI);',
    "lampada.position.set(0, 0.6, 3);",
    "cena.add(lampada);",
    'const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8), new THREE.MeshBasicMaterial({ color: "#ffaa55" }));',
    "lampada.add(bulbo);",
  ),
  from(
    1,
    "",
    "// As duas esferas usam a mesma geometria",
    "const geometria = new THREE.SphereGeometry(1, 64, 32);",
    "",
    "// O gabarito, à direita: o Phong do three.js",
    "const gabarito = new THREE.Mesh(",
    "  geometria,",
    '  new THREE.MeshPhongMaterial({ color: "#3f7fd9", specular: "#ffffff", shininess: 30 })',
    ");",
    "gabarito.position.x = 1.4;",
    "cena.add(gabarito);",
    "",
  ),
  by({ 1: "// A esfera, à esquerda: por enquanto, igual ao gabarito", 2: "// A esfera, à esquerda: o nosso Phong, num shader escrito à mão" }),
  during(1, 2, "const esfera = new THREE.Mesh(", "  geometria,", '  new THREE.MeshPhongMaterial({ color: "#3f7fd9", specular: "#ffffff", shininess: 30 })', ");"),
  // o shader de vértices
  from(2, "const vertexShader = /* glsl */ `"),
  from(5, "  varying vec3 vNormal;"),
  from(8, "  varying vec3 vPosicao;"),
  from(5, ""),
  from(2, "  void main() {"),
  from(8, "    vec4 mundo = modelMatrix * vec4(position, 1.0);", "    vPosicao = mundo.xyz;"),
  from(5, "    vNormal = mat3(modelMatrix) * normal;"),
  by({ 2: "    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);", 8: "    gl_Position = projectionMatrix * viewMatrix * mundo;" }),
  from(2, "  }", "`;", ""),
  // o shader de fragmentos
  from(2, "const fragmentShader = /* glsl */ `"),
  from(3, "  uniform vec3 uCor;"),
  from(7, "  uniform float uAmbiente;"),
  from(6, "  uniform vec3 uDirecaoDoSol;"),
  from(8, "  uniform vec3 uCorEspecular;", "  uniform float uBrilho;"),
  from(11, "  uniform vec3 uPosicaoDaLampada;", "  uniform vec3 uCorDaLampada;"),
  from(5, "  varying vec3 vNormal;"),
  from(8, "  varying vec3 vPosicao;"),
  from(3, ""),
  from(
    4,
    "  // Do espaço linear para o sRGB, como o three.js faz no fim de cada pixel",
    "  vec3 paraSRGB(vec3 c) {",
    "    c = clamp(c, 0.0, 1.0);",
    "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
    "  }",
    "",
  ),
  from(
    11,
    "  // A luz que chega pela direção l, com a cor e a força corDaLuz: a difusa e o brilho",
    "  vec3 luz(vec3 l, vec3 corDaLuz, vec3 n, vec3 v) {",
    "    float difusa = max(dot(n, l), 0.0);",
    "    vec3 h = normalize(l + v);",
    "    float brilho = pow(max(dot(n, h), 0.0), uBrilho) * (uBrilho + 2.0) / 8.0 * difusa;",
    "    return corDaLuz * (uCor * difusa + uCorEspecular * brilho);",
    "  }",
    "",
  ),
  from(2, "  void main() {"),
  from(5, "    vec3 n = normalize(vNormal);"),
  from(8, "    vec3 v = normalize(cameraPosition - vPosicao);"),
  during(6, 11, "    float difusa = max(dot(n, uDirecaoDoSol), 0.0);"),
  during(8, 9, "    vec3 r = reflect(-uDirecaoDoSol, n);"),
  during(9, 11, "    vec3 h = normalize(uDirecaoDoSol + v);"),
  by({
    8: "    float brilho = difusa > 0.0 ? pow(max(dot(r, v), 0.0), uBrilho) : 0.0;",
    9: "    float brilho = difusa > 0.0 ? pow(max(dot(n, h), 0.0), uBrilho) : 0.0;",
    10: "    float brilho = pow(max(dot(n, h), 0.0), uBrilho) * (uBrilho + 2.0) / 8.0 * difusa;",
    11: null,
  }),
  by({
    6: "    vec3 cor = uCor * difusa;",
    7: "    vec3 cor = uCor * (uAmbiente + difusa);",
    8: "    vec3 cor = uCor * (uAmbiente + difusa) + uCorEspecular * brilho;",
    11: "    vec3 cor = uCor * uAmbiente; // a luz ambiente",
  }),
  from(
    11,
    "    cor += luz(uDirecaoDoSol, vec3(1.0), n, v); // o sol: branco, de força 1",
    "    vec3 paraLampada = uPosicaoDaLampada - vPosicao;",
    "    float distancia = length(paraLampada);",
    "    cor += luz(paraLampada / distancia, uCorDaLampada / max(distancia * distancia, 0.01), n, v);",
  ),
  by({
    2: "    gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);",
    3: "    gl_FragColor = vec4(uCor, 1.0);",
    4: "    gl_FragColor = vec4(paraSRGB(uCor), 1.0);",
    5: "    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);",
    6: "    gl_FragColor = vec4(paraSRGB(cor), 1.0);",
  }),
  from(2, "  }", "`;", ""),
  // o material e a esfera
  from(2, "const material = new THREE.ShaderMaterial({"),
  from(3, "  uniforms: {", '    uCor: { value: new THREE.Color("#3f7fd9") },'),
  from(7, "    uAmbiente: { value: 0.15 },"),
  from(6, "    uDirecaoDoSol: { value: sol.position.clone().normalize() },"),
  from(8, '    uCorEspecular: { value: new THREE.Color("#ffffff") },', "    uBrilho: { value: 30 },"),
  from(11, "    uPosicaoDaLampada: { value: lampada.position.clone() },", '    uCorDaLampada: { value: new THREE.Color("#ffaa55").multiplyScalar(4) },'),
  from(3, "  },"),
  from(2, "  vertexShader,", "  fragmentShader,", "});", "const esfera = new THREE.Mesh(geometria, material);"),
  from(1, "esfera.position.x = -1.4;", "cena.add(esfera);"),
  from(
    12,
    "",
    "// A lâmpada dá a volta nas esferas, e o shader fica sabendo onde ela está",
    "function animar(tempo) {",
    "  lampada.position.set(Math.sin(tempo) * 3, 0.6, Math.cos(tempo) * 3);",
    "  material.uniforms.uPosicaoDaLampada.value.copy(lampada.position);",
    "}",
  ),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: os pixels da esfera (`shader`, nos fatos) contra a conta de cada passo

const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** O reflect do GLSL: a direção i espelhada na normal n, i − 2(n·i)n. */
const reflect = (i, n) => sub(i, scale(n, 2 * dot(n, i)));

/** Um número em sRGB (de 0 a 1, como na cor do código) no espaço linear. */
const toLinear = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** Uma cor do espaço linear (a de um uniform) escrita como no código, em sRGB. */
const hexOf = (rgb) => hex(srgbBytes(rgb));

/** Um número escrito como nos textos, sem casas decimais se é inteiro: 30, 0,15. */
const number = (x) => fmt(x, Number.isInteger(x) ? 0 : 2);

/** Um vetor escrito como nos textos: (0,60; 0,80; 0,00). */
const vec = (v, d = 2) => `(${v.map((c) => fmt(c, d)).join("; ")})`;

const STAGE = { vertex: "shader de vértices", fragment: "shader de fragmentos" };

/**
 * Os pixels da esfera, se dá para conferir a cor: ela é desenhada por um ShaderMaterial, o shader
 * compila, ela aparece na imagem e no lugar dela (sem o fundo onde ela está, e sem pintar o fundo em
 * volta). Senão, `result` diz o que impede.
 */
function pixelsOf(esfera) {
  const type = esfera.material?.type ?? null;
  if (type !== "ShaderMaterial" && type !== "RawShaderMaterial") return { result: check(false, `a esfera é ${type ?? "um objeto sem material"}, e não um ShaderMaterial`) };
  const shader = esfera.shader;
  if (!shader) return { result: check(false, "não deu para medir os pixels da esfera") };
  if (shader.error?.stage === "link") return { result: check(false, "os dois shaders compilam, mas não se encaixam: a barra embaixo do código diz o que falta") };
  if (shader.error) return { result: check(false, `o ${STAGE[shader.error.stage] ?? "shader"} não compila: a barra embaixo do código diz o erro e a linha`) };
  const { inside, outside, background } = shader;
  if (inside.length < 20) return { result: check(false, "a esfera quase não aparece na câmera") };
  const blank = inside.filter((s) => gap(s.c, background) <= 2).length / inside.length;
  if (blank > 0.3) return { result: check(false, `${pct(blank)} da esfera não aparece: o fundo continua onde ela está. Confira o gl_Position do shader de vértices`) };
  const empty = outside.filter((s) => !s.other);
  const spill = empty.filter((s) => gap(s.c, background) > 2).length / Math.max(1, empty.length);
  if (empty.length >= 10 && spill > 0.3) {
    return { result: check(false, "a esfera aparece fora do lugar dela: confira o gl_Position do shader de vértices, que leva cada vértice pela câmera com as matrizes") };
  }
  return { shader };
}

/**
 * O valor de um uniform do material da esfera (`kind`: "float", um número, ou "vec3", três números:
 * uma THREE.Color, no espaço linear, ou um THREE.Vector3). Senão, `result` diz o que falta.
 */
function uniformOf(esfera, name, kind) {
  const u = esfera.material?.uniforms?.[name];
  if (!u) return { result: check(false, `o material da esfera não tem o uniform ${name}`) };
  if (kind === "float" && u.type !== "number") return { result: check(false, `o uniform ${name} não é um número`) };
  if (kind === "vec3" && !((u.type === "color" || u.type === "vector") && u.value.length === 3)) {
    return { result: check(false, `o uniform ${name} não tem três números (uma THREE.Color ou um THREE.Vector3)`) };
  }
  return { value: u.value };
}

/** Os valores de vários uniforms ({ nome: tipo }), ou o `result` do primeiro que falta. */
function uniformsOf(esfera, kinds) {
  const values = {};
  for (const [name, kind] of Object.entries(kinds)) {
    const u = uniformOf(esfera, name, kind);
    if (u.result) return u;
    values[name] = u.value;
  }
  return { values };
}

/** O desvio de cada pixel da esfera em relação à cor esperada para ele (`expected(s)`, de 0 a 255). */
const deviations = (inside, expected) => inside.map((s) => gap(s.c, expected(s)));

/**
 * Se a cor bate com a conta: 90% dos pixels a até 3 níveis (de 255) da cor esperada, e nenhum a
 * mais de 8. A folga é a do arredondamento da placa de vídeo, que faz as contas com menos casas.
 * A mancha do brilho cobre poucos pixels da esfera: um só fora da conta já é um erro nela.
 */
const fits = (d) => quantile(d, 0.9) <= 3 && Math.max(...d) <= 8;

/**
 * Confere a cor dos pixels com a conta `expected`. Se não bate, tenta as variantes [conta, o que
 * dizer], os erros comuns, e diz o da que bate melhor: duas podem dar quase a mesma cor (o brilho
 * de Blinn–Phong com o expoente 4 vezes maior imita o de Phong). Se nenhuma bate, mostra o pixel
 * mais diferente.
 */
function compare(inside, expected, variants = []) {
  const d = deviations(inside, expected);
  if (fits(d)) return check(true);
  let best = null;
  for (const [color, seen] of variants) {
    const dv = deviations(inside, color);
    const total = dv.reduce((sum, x) => sum + x, 0);
    if (fits(dv) && !(best?.total <= total)) best = { total, seen };
  }
  if (best) return check(false, best.seen);
  const k = d.indexOf(Math.max(...d));
  return check(false, `a cor da esfera não bate com a conta: num ponto, o shader pinta ${hex(inside[k].c)}, e a conta dá ${hex(expected(inside[k]))}`);
}

/** A cor do meio dos pixels (a mediana de cada canal). */
const middleOf = (inside) => [0, 1, 2].map((k) => quantile(inside.map((s) => s.c[k]), 0.5));

/** A normal no espaço da câmera: a rotação da câmera (as colunas da matriz de mundo dela) desfeita. */
function inView(camera, n) {
  const w = camera.world;
  return [0, 1, 2].map((k) => w[0][k] * n[0] + w[1][k] * n[1] + w[2][k] * n[2]);
}

/**
 * A luz de uma direção l (do ponto para a luz, de comprimento 1) com a cor e a força `color`, como
 * a função `luz` do shader: a difusa, com a cor da esfera, e o brilho, com a cor do brilho.
 * `o.model` é o brilho: "phong" (o reflexo r contra v), "blinn" (a normal contra o vetor do meio h)
 * ou "three" (o de Blinn vezes (uBrilho + 2) ÷ 8 e vezes a difusa, como o three.js faz no
 * MeshPhongMaterial); sem ele, só a difusa. As outras opções são os erros comuns.
 */
function lightOf(l, color, n, v, u, o) {
  const nl = dot(n, l);
  const difusa = o.noMax ? nl : Math.max(nl, 0);
  let brilho = 0;
  if (o.model && nl > 0) {
    const exponent = o.times4 ? u.uBrilho * 4 : u.uBrilho;
    if (o.model === "phong") {
      const r = o.flipReflect ? reflect(l, n) : reflect(scale(l, -1), n);
      brilho = Math.max(dot(r, v), 0) ** exponent;
    } else {
      const h = o.rawHalf ? add(l, v) : unit(add(l, v));
      brilho = Math.max(dot(n, h), 0) ** exponent;
      if (o.model === "three") brilho *= ((u.uBrilho + 2) / 8) * difusa;
      else if (o.diffuse) brilho *= difusa;
    }
  }
  const specular = o.tinted ? mul(u.uCor, u.uCorEspecular) : u.uCorEspecular ?? [0, 0, 0];
  return mul(color, add(scale(u.uCor, difusa), scale(specular, brilho)));
}

/**
 * A cor que a conta do passo dá para o pixel s, de 0 a 255, com os uniforms `u` e a câmera em
 * `eye`: a luz ambiente (sem ela com `ambient: false`), o sol e, com `lamp`, a lâmpada, que enfraquece
 * com o quadrado da distância; tudo convertido para sRGB, menos com `linear`.
 */
function colorOf(s, eye, u, o) {
  const n = o.view ? unit(inView(o.view, unit(s.n))) : unit(s.n);
  const v = unit(sub(eye, s.p));
  let cor = o.ambient === false ? [0, 0, 0] : o.ambientApart ? [u.uAmbiente, u.uAmbiente, u.uAmbiente] : scale(u.uCor, u.uAmbiente);
  if (!o.noSun) cor = add(cor, lightOf(o.flipSun ? scale(u.uDirecaoDoSol, -1) : u.uDirecaoDoSol, [1, 1, 1], n, v, u, o));
  if (o.lamp) {
    const toLamp = sub(u.uPosicaoDaLampada, s.p);
    const d = Math.hypot(...toLamp);
    const l = o.flipLamp ? scale(toLamp, -1 / d) : o.rawLamp ? toLamp : scale(toLamp, 1 / d);
    const fade = o.noFade ? 1 : o.linearFade ? 1 / Math.max(d, 0.01) : 1 / Math.max(d * d, 0.01);
    cor = add(cor, lightOf(l, scale(u.uCorDaLampada, fade), n, v, u, o));
  }
  return o.linear ? bytes(cor) : srgbBytes(cor);
}

/** Os uniforms que cada conta usa. */
const UNIFORMS = {
  difusa: { uCor: "vec3", uDirecaoDoSol: "vec3" },
  ambiente: { uCor: "vec3", uAmbiente: "float", uDirecaoDoSol: "vec3" },
  brilho: { uCor: "vec3", uAmbiente: "float", uDirecaoDoSol: "vec3", uCorEspecular: "vec3", uBrilho: "float" },
  lampada: { uCor: "vec3", uAmbiente: "float", uDirecaoDoSol: "vec3", uCorEspecular: "vec3", uBrilho: "float", uPosicaoDaLampada: "vec3", uCorDaLampada: "vec3" },
};

const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura: falta passar a cor pela paraSRGB no gl_FragColor";
const TINTED = "o brilho ficou da cor da esfera: ele tem a cor da luz, uCorEspecular * brilho, fora da conta com o uCor";
const NO_FACTOR = "a mancha ainda está mais fraca que a do gabarito: falta multiplicar o brilho por (uBrilho + 2.0) / 8.0";
const VIEW_NORMAL = "a normal está no espaço da câmera (é o que o normalMatrix faz), e as contas deste projeto são no mundo: use mat3(modelMatrix) * normal";

/**
 * Confere a luz da esfera: a conta `model` (as opções de colorOf) com os uniforms de `uniforms`,
 * e, se a cor não bate, as variantes [opções a mais, o que dizer].
 */
function lighting({ objects, camera }, uniforms, model, variants) {
  const { shader, result } = pixelsOf(objects.esfera);
  if (result) return result;
  const u = uniformsOf(objects.esfera, uniforms);
  if (u.result) return u.result;
  const color = (o) => (s) => colorOf(s, shader.eye, u.values, { ...model, ...o });
  const tries = variants.filter(([o]) => !o.view || camera).map(([o, seen]) => [color(o.view ? { view: camera } : o), seen]);
  return compare(shader.inside, color({}), tries);
}

/** Se a animação está andando, para conferir o que ela faz; senão, o que esperar. */
function stopped({ hasAnimar, playing }) {
  if (!hasAnimar) return check(false, "não achei a função animar(tempo)");
  return playing ? null : wait("a animação está parada: aperte ▶ na barra de cima para a lâmpada andar");
}

// ---------------------------------------------------------------------------
// O passo no computador

const END = codeAt(12);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: null, controls: true };

const COMPUTER = [
  computerStep({
    id: "phong",
    title: "Phong escrito à mão",
    end: END,
    options: OPTIONS,
    words: {
      yours: "o seu Phong",
      browser: "o código do Phong precisa dele no navegador",
      privates: "`esfera`, `gabarito` e o resto",
      stretched: "as esferas saem esticadas ou achatadas",
      jump: "a lâmpada pularia para outro ponto da volta",
      animarStep: 12,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor e chamava `animar` a cada quadro. Neste passo, o Phong vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, com os dois shaders dentro, e o que o VisuGraph fazia fica escrito no `src/main.js`, com os controles do mouse para girar em volta das esferas.",
    why: [
      {
        title: "Dá para ter os shaders em arquivos .glsl?",
        text: "Dá, e é o jeito dos projetos maiores: cada shader num arquivo, com as cores do GLSL no editor. O Vite carrega qualquer arquivo como texto com um `?raw` no fim do caminho do import, e o texto chega ao `cena.js` como a constante de antes. No Experimente, os dois shaders vão para arquivos.",
      },
    ],
    try: [
      'Passe os shaders para arquivos: crie `src/phong.vert` e `src/phong.frag` com o texto de dentro das crases, apague as duas constantes do `src/cena.js` e importe os arquivos no começo dele, com `import vertexShader from "./phong.vert?raw";` e `import fragmentShader from "./phong.frag?raw";`. Para ver as cores do GLSL no VS Code, instale uma extensão de GLSL.',
      "Gire a câmera com o mouse até ver as esferas por trás: o brilho do sol some das duas, e a luz da lâmpada aparece quando ela passa por trás delas.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a página abre com as duas esferas e a lâmpada dando a volta",
      "Arrastar com o mouse gira a câmera em volta das esferas, e o brilho do sol anda nas duas",
      "Mudar um número no `src/cena.js` (o `uBrilho`, por exemplo) e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const PHONG = {
  id: "phong",
  title: "Phong escrito à mão",
  level: "avancado",
  summary: "A iluminação de Phong num shader escrito à mão, em GLSL, pixel a pixel, ao lado do MeshPhongMaterial do three.js para comparar: a cor, a luz difusa, o brilho e uma lâmpada que dá a volta.",
  concepts: [
    "ShaderMaterial",
    "Shader de vértices e de fragmentos",
    "GLSL",
    "Uniforms e varyings",
    "Linear e sRGB",
    "Difusa de Lambert",
    "Brilho de Phong e Blinn–Phong",
    "Conservação de energia",
    "Luz pontual e atenuação",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Neste projeto, você vai escrever a iluminação de Phong do zero, num shader: o programa que a placa de vídeo roda para cada vértice e para cada pixel. Para saber se a conta está certa, o palco tem duas esferas iguais, com o `MeshPhongMaterial` do three.js. A da direita é o gabarito e fica como está até o fim. A da esquerda vai ser refeita por nós, passo a passo, até ficar igual à outra. As luzes são as que o three.js usa no gabarito: um sol branco e uma luz ambiente fraca.",
      lines: [
        {
          code: 'cena.background = new THREE.Color("#101418");',
          text: "Um fundo quase preto: as esferas e o brilho aparecem melhor no escuro.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);",
          text: "45° de campo de visão, uma lente mais fechada que a de costume: pouca deformação nas bordas, para as duas esferas saírem redondas e iguais.",
        },
        {
          code: "camera.position.set(0, 1.5, 10);",
          text: "No meio, à frente das esferas e um pouco acima, longe o bastante para as duas caberem lado a lado mesmo num visor estreito, vistas do mesmo jeito.",
        },
        {
          code: 'const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.15 * Math.PI);',
          text: "Uma luz ambiente fraca, que chega igual a todo ponto, de todo lado: sem ela, o lado das esferas que não vê o sol ficaria preto. O `0.15 * Math.PI` é de propósito: o three.js divide a luz que chega a cada ponto por π, e com esse π ela vale 0,15 nas contas dos livros, que o nosso shader vai fazer.",
        },
        {
          code: 'const sol = new THREE.DirectionalLight("#ffffff", Math.PI);',
          text: "O sol: uma luz direcional, que vem de uma direção só, com os raios paralelos. Pela mesma divisão, a intensidade π vale 1 nas contas dos livros.",
        },
        {
          code: "sol.position.set(3, 4, 5);",
          text: "Numa luz direcional, a posição só diz de onde a luz vem: da direita, de cima e da frente, na direção do ponto (3, 4, 5) visto do centro.",
        },
        {
          code: "const geometria = new THREE.SphereGeometry(1, 64, 32);",
          text: "Uma esfera de raio 1, com 64 fatias em volta e 32 de cima a baixo. As duas esferas usam a mesma geometria: o que muda entre elas é só o material, e é ele que o projeto vai escrever.",
        },
        {
          code: '  new THREE.MeshPhongMaterial({ color: "#3f7fd9", specular: "#ffffff", shininess: 30 })',
          after: "const gabarito",
          text: "O Phong do three.js: azul, com o brilho branco e o expoente 30. Os três números vão aparecer de novo no nosso shader.",
        },
        {
          code: "gabarito.position.x = 1.4;",
          text: "O gabarito fica à direita, e a esfera, em −1,4, à esquerda: 0,8 de folga entre as duas.",
        },
        {
          code: "const esfera = new THREE.Mesh(",
          text: "A esfera que vai ser nossa. Por enquanto, com o mesmo material do gabarito: as duas saem idênticas.",
        },
      ],
      why: [
        {
          title: "Por que o three.js divide por π?",
          text: "Uma superfície fosca espalha a luz que recebe por todo o meio espaço à frente dela, e a conta dessa espalhada, na física, traz um π. O three.js segue a física e divide por π. Os livros de computação gráfica, e o laboratório de Phong do VisuGraph, contam a luz sem o π. Com as intensidades multiplicadas por π, as duas contas dão o mesmo número, e a nossa esfera pode ficar igual ao gabarito.",
        },
        {
          title: "Por que um gabarito?",
          text: "Num shader, quase todo erro dá uma imagem, e não uma mensagem: uma esfera escura demais, um brilho no lugar errado. Com a resposta certa ao lado, cada diferença aparece na hora. A conferência de cada passo faz o mesmo com números: mede a cor de centenas de pixels da nossa esfera e compara com a conta que o passo pede.",
        },
      ],
      try: [
        "Mude o `shininess` do gabarito para 100: o brilho dele fica menor e mais concentrado. Depois volte para 30.",
        "Desligue a Câmera do código e gire a vista: as duas esferas são iguais de qualquer lado, e o brilho anda com a câmera nas duas.",
      ],
      needs: ["esfera", "gabarito", "sol", "luzAmbiente"],
      checks: [
        {
          text: "As duas esferas estão lado a lado: o gabarito à direita, a nossa à esquerda",
          test: ({ objects }) => {
            const [gx] = objects.gabarito.worldPosition;
            const [ex] = objects.esfera.worldPosition;
            if (gx < 0.5) return check(false, `o gabarito está em x = ${fmt(gx)}: ele fica à direita, em 1,4`);
            if (ex > -0.5) return check(false, `a esfera está em x = ${fmt(ex)}: ela fica à esquerda, em −1,4`);
            return check(gx - ex >= 2.2, `os centros estão a ${fmt(gx - ex)} um do outro: com raio 1, as esferas se encostam`);
          },
        },
        {
          text: "As duas têm o MeshPhongMaterial, da mesma cor",
          test: ({ objects }) => {
            for (const name of ["gabarito", "esfera"]) {
              const type = objects[name].material?.type ?? null;
              if (type !== "MeshPhongMaterial") return check(false, `${name} é ${type ?? "um objeto sem material"}, e não MeshPhongMaterial`);
            }
            const [a, b] = [objects.gabarito.material.hex, objects.esfera.material.hex];
            return check(a === b, `o gabarito é ${a}, e a esfera, ${b}`);
          },
        },
        {
          text: "O sol tem intensidade π, e a luz ambiente, 0,15 × π",
          test: ({ objects, lights }) => {
            const { sol, luzAmbiente } = objects;
            if (sol.type !== "DirectionalLight") return check(false, `sol é ${sol.type}, e não DirectionalLight`);
            if (luzAmbiente.type !== "AmbientLight") return check(false, `luzAmbiente é ${luzAmbiente.type}, e não AmbientLight`);
            for (const [type, name] of [["DirectionalLight", "o sol"], ["AmbientLight", "a luz ambiente"]]) {
              if (!lights.some((l) => l.type === type)) return check(false, `${name} não foi adicionado à cena`);
            }
            const sun = sol.light.intensity;
            if (Math.abs(sun - Math.PI) > 0.01) return check(false, `o sol tem intensidade ${fmt(sun)}: com Math.PI, ele vale 1 nas contas dos livros, que o shader vai fazer`);
            const ambient = luzAmbiente.light.intensity;
            return check(Math.abs(ambient - 0.15 * Math.PI) <= 0.01, `a luz ambiente tem intensidade ${fmt(ambient)}: com 0.15 * Math.PI, ela vale 0,15 nas contas dos livros`);
          },
        },
      ],
    },
    {
      id: "shader",
      title: "O primeiro shader",
      view: "camera",
      goal:
        "A esfera da esquerda ganha um material escrito por nós: um `ShaderMaterial`. Ele leva dois programas em GLSL, a linguagem dos shaders. O shader de vértices roda uma vez para cada vértice e diz onde ele cai na tela. O shader de fragmentos roda uma vez para cada pixel que a esfera cobre e diz a cor dele. Para começar, a cor mais simples: um laranja igual em todo pixel. A esfera vira um disco laranja, sem luz nem volume, porque nenhuma conta de luz foi escrita ainda.",
      lines: [
        {
          code: "const vertexShader = /* glsl */ `",
          text: "O shader de vértices, num texto entre crases, que pode ter várias linhas. O JavaScript não roda esse código: ele vai para o three.js, que o manda para a placa de vídeo compilar. O comentário `/* glsl */` avisa editores como o VS Code, com uma extensão de GLSL, para colorir o texto como GLSL.",
        },
        {
          code: "  void main() {",
          after: "const vertexShader",
          text: "Todo shader começa pela função `main`, que não recebe nem devolve nada: o resultado vai em variáveis especiais, como o `gl_Position`.",
        },
        {
          code: "    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          text: "O vértice vai para a tela. `position` é a posição dele na geometria, um `vec3`: três números. `vec4(position, 1.0)` acrescenta o 1 que as matrizes 4 × 4 pedem. A `modelViewMatrix` leva o vértice da esfera para o espaço da câmera, com a posição da esfera e a da câmera juntas, e a `projectionMatrix` aplica a perspectiva. O three.js declara as três e as preenche para cada objeto, a cada quadro.",
        },
        {
          code: "const fragmentShader = /* glsl */ `",
          text: "O shader de fragmentos. Um fragmento é um pixel que um triângulo cobre: a placa de vídeo roda este `main` uma vez para cada um, milhares de vezes por quadro, muitos ao mesmo tempo.",
        },
        {
          code: "    gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);",
          text: "A cor do pixel: vermelho, verde, azul e opacidade, de 0 a 1. No GLSL, um número com casa decimal precisa do ponto: `1.0`, e não `1`, que é um inteiro, de outro tipo.",
        },
        {
          code: "const material = new THREE.ShaderMaterial({",
          text: "O material com os dois shaders. `vertexShader,` sozinho é um atalho para `vertexShader: vertexShader,`: a chave com o nome da constante.",
        },
        {
          code: "const esfera = new THREE.Mesh(geometria, material);",
          text: "A esfera, com a mesma geometria do gabarito e o nosso material.",
        },
      ],
      why: [
        {
          title: "Por que dois shaders?",
          text: "A placa de vídeo desenha triângulos em duas etapas. Primeiro, cada vértice vai para a tela, pelo shader de vértices: são 2.145 vértices nesta esfera. Depois, cada triângulo é preenchido, e o shader de fragmentos dá a cor de cada pixel coberto, umas dezenas de milhares nesta esfera. As duas etapas rodam em milhares de núcleos ao mesmo tempo, e é por isso que a placa de vídeo dá conta de milhões de pixels por quadro.",
        },
        {
          title: "E se o GLSL tiver um erro?",
          text: "O shader é compilado pela placa de vídeo quando a esfera vai ser desenhada, e não pelo JavaScript. Se o compilador encontra um erro, o VisuGraph mostra a mensagem em português, na linha do shader, e pinta a esfera de magenta: é o sinal de shader quebrado dos editores de jogos.",
        },
      ],
      try: [
        "Apague o `;` do fim da linha do `gl_FragColor`: a esfera fica magenta, e a barra embaixo do código diz o que faltou e em que linha. Depois desfaça.",
        "Troque a linha do `gl_Position` por `gl_Position = vec4(position, 1.0);`: sem as matrizes, a esfera vai direto para a tela, enorme e esticada no meio do visor, e a conferência avisa. Depois desfaça.",
        "Mude a cor para `vec4(0.2, 0.8, 0.4, 1.0)`: verde.",
      ],
      needs: ["esfera"],
      checks: [
        {
          text: "A esfera é desenhada por um ShaderMaterial",
          test: ({ objects }) => {
            const type = objects.esfera.material?.type ?? null;
            return check(type === "ShaderMaterial" || type === "RawShaderMaterial", `a esfera é ${type ?? "um objeto sem material"}, e não um ShaderMaterial`);
          },
        },
        {
          text: "Ela aparece no lugar dela, do tamanho dela",
          test: ({ objects }) => pixelsOf(objects.esfera).result ?? check(true),
        },
        {
          text: "O shader pinta a esfera inteira de uma cor só",
          test: ({ objects }) => {
            const { shader, result } = pixelsOf(objects.esfera);
            if (result) return result;
            const middle = middleOf(shader.inside);
            const d = shader.inside.map((s) => gap(s.c, middle));
            return check(quantile(d, 0.9) <= 3, "a cor muda de um pixel para outro: neste passo, o gl_FragColor é uma cor só, a mesma em todo pixel");
          },
        },
      ],
    },
    {
      id: "uniform",
      title: "A cor vem do JavaScript",
      view: "camera",
      goal:
        "O laranja estava escrito dentro do shader: para mudar a cor, só mudando o GLSL. Um uniform resolve isso. É um valor que o JavaScript manda ao shader e que vale igual para todos os pixels. A cor vai num `THREE.Color`, a mesma do gabarito, e o shader declara um `uniform vec3 uCor` para recebê-la. Repare que a esfera fica azul, mas bem mais escura que o gabarito, mesmo no lado onde o sol bate nele: o próximo passo explica por quê.",
      lines: [
        {
          code: '    uCor: { value: new THREE.Color("#3f7fd9") },',
          text: "O uniform `uCor`: o nome que o shader vai usar e o valor. Todo uniform vai num objeto com `value`, que o JavaScript pode trocar depois: o three.js manda o valor à placa de vídeo antes de cada desenho. O `u` na frente do nome é um costume, para saber de onde o valor vem.",
        },
        {
          code: "  uniform vec3 uCor;",
          text: "No shader de fragmentos, a declaração: um uniform do tipo `vec3` (três números: o vermelho, o verde e o azul), com o mesmo nome do JavaScript. O three.js liga os dois pelo nome, e sem a declaração o compilador não sabe o que é `uCor`.",
        },
        {
          code: "    gl_FragColor = vec4(uCor, 1.0);",
          text: "A cor do pixel é a do uniform, com opacidade 1: `vec4(uCor, 1.0)` monta um vetor de quatro números com os três do `uCor` e mais um.",
        },
      ],
      why: [
        {
          title: "Por que a esfera ficou mais escura?",
          text: "Porque o `THREE.Color` não guarda os números do código. A cor #3f7fd9 vale (0,25; 0,50; 0,85) em sRGB, o espaço de cores das telas e do CSS. O three.js converte para o espaço linear, onde as contas de luz funcionam, e guarda (0,05; 0,21; 0,69). O shader recebe esses números e os escreve direto no pixel, e a tela os mostra como se fossem sRGB: mais escuros.",
        },
        {
          title: "Por que não escrever a cor no GLSL?",
          text: "Dá, mas cada mudança no texto obriga a placa de vídeo a compilar o shader de novo, e isso demora. Um uniform muda sem compilar nada: é assim que o three.js troca a cor de um material, a posição de uma luz ou o tempo de uma animação a cada quadro. Os próximos passos mandam por uniforms a direção do sol, a força da luz ambiente e a posição de uma lâmpada.",
        },
      ],
      try: [
        'Troque a cor do uniform por `"#ff3366"`: a esfera muda de cor, e o shader é o mesmo. Depois volte para "#3f7fd9".',
        "Apague a linha `uniform vec3 uCor;`: o compilador não sabe o que é `uCor`, a esfera fica magenta e a barra embaixo do código explica. Depois desfaça.",
      ],
      needs: ["esfera"],
      checks: [
        {
          text: "O material da esfera tem o uniform uCor, com uma cor",
          test: ({ objects }) => uniformOf(objects.esfera, "uCor", "vec3").result ?? check(true),
        },
        {
          text: "A esfera tem a cor do uCor",
          test: ({ objects }) => {
            const { shader, result } = pixelsOf(objects.esfera);
            if (result) return result;
            const u = uniformOf(objects.esfera, "uCor", "vec3");
            if (u.result) return u.result;
            // a cor como chega, no espaço linear, ou já convertida (o próximo passo)
            if (fits(deviations(shader.inside, () => bytes(u.value))) || fits(deviations(shader.inside, () => srgbBytes(u.value)))) return check(true);
            const middle = middleOf(shader.inside);
            if (gap(middle, [255, 128, 51]) <= 3) return check(false, "a esfera continua laranja: o gl_FragColor ainda não usa o uCor");
            return check(false, `a esfera tem ${hex(middle)}, e o uCor chega ao shader como ${hex(bytes(u.value))}`);
          },
        },
      ],
    },
    {
      id: "srgb",
      title: "Linear e sRGB",
      view: "camera",
      goal:
        "As contas de luz são feitas no espaço linear, onde o dobro do número é o dobro da luz. A tela espera cores em sRGB, um espaço que gasta mais números com os tons escuros, onde o olho percebe mais diferença. Os materiais do three.js convertem cada pixel para sRGB no fim do shader, e o nosso precisa fazer o mesmo. Uma função `paraSRGB`, com a fórmula do padrão sRGB, faz a conversão, e a esfera fica exatamente com o azul do código.",
      lines: [
        {
          code: "  vec3 paraSRGB(vec3 c) {",
          text: "Uma função do GLSL: recebe um `vec3` e devolve um `vec3`. Ela vem antes do `main`, porque no GLSL uma função só pode ser usada depois de escrita.",
        },
        {
          code: "    c = clamp(c, 0.0, 1.0);",
          text: "Prende cada número entre 0 e 1. A luz pode passar de 1 (num brilho forte), e a tela não mostra mais que 1; abaixo de 0, a potência da linha de baixo nem existe.",
        },
        {
          code: "    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));",
          text: "A fórmula do sRGB, em dois pedaços. Nos tons quase pretos, até 0,0031308, uma reta: c × 12,92. No resto, uma potência: 1,055 × c^(1/2,4) − 0,055. O `step` dá 0 abaixo do limite e 1 acima, para cada número do vetor, e o `mix` escolhe o pedaço com ele. É um `if` para os três números de uma vez.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(uCor), 1.0);",
          text: "A cor passa pela conversão antes de ir para o pixel.",
        },
      ],
      why: [
        {
          title: "Por que existe o espaço linear?",
          text: "Porque a luz soma. Duas lâmpadas iguais dão o dobro de luz, e no espaço linear o dobro de luz é o dobro do número. Em sRGB, não: 0,5 em sRGB é só uns 21% da luz de 1,0. As contas dos próximos passos (somar o sol e a lâmpada, multiplicar pela cor) só dão certo no linear, e a conversão para sRGB fica para o fim, uma vez só, em cada pixel.",
        },
        {
          title: "Não dava para usar pow(c, 1.0 / 2.2)?",
          text: "Dava: é a aproximação mais conhecida da curva do sRGB, e muitos shaders usam. A diferença aparece nos tons bem escuros, de uns poucos níveis de cor (de 255). A fórmula exata é a que o three.js usa, e com ela a nossa esfera pode ficar igual ao gabarito pixel a pixel.",
        },
      ],
      try: [
        "Troque o `paraSRGB(uCor)` por `pow(uCor, vec3(1.0 / 2.2))`: a esfera fica quase igual, e a conferência aceita. Depois desfaça.",
        "Apague o `paraSRGB` do `gl_FragColor` (fica `vec4(uCor, 1.0)`): a esfera volta a ficar escura, e a conferência avisa. Depois desfaça.",
      ],
      needs: ["esfera"],
      checks: [
        {
          text: "A esfera tem a cor do código, convertida para sRGB",
          test: ({ objects }) => {
            const { shader, result } = pixelsOf(objects.esfera);
            if (result) return result;
            const u = uniformOf(objects.esfera, "uCor", "vec3");
            if (u.result) return u.result;
            return compare(shader.inside, () => srgbBytes(u.value), [[() => bytes(u.value), "a cor saiu do shader no espaço linear, mais escura: falta passar o uCor pela paraSRGB no gl_FragColor"]]);
          },
        },
      ],
    },
    {
      id: "normal",
      title: "A normal de cada ponto",
      view: "camera",
      goal:
        "Para a luz, cada ponto da esfera precisa saber para onde está virado: a normal, a direção perpendicular à superfície ali. A geometria guarda uma normal em cada vértice, mas a cor é calculada nos pixels. Um varying faz a ponte: o shader de vértices escreve a normal, e a placa de vídeo entrega a cada pixel uma mistura das normais dos três vértices do triângulo, pesadas pela distância até cada um. Para ver os números, a normal vira a cor do pixel: o x no vermelho, o y no verde e o z no azul.",
      lines: [
        {
          code: "  varying vec3 vNormal;",
          after: "const vertexShader",
          text: "O varying, declarado nos dois shaders com o mesmo nome e o mesmo tipo: o de vértices escreve, o de fragmentos lê. O `v` na frente é o costume para varyings.",
        },
        {
          code: "    vNormal = mat3(modelMatrix) * normal;",
          text: "`normal` é a normal do vértice na geometria, um atributo que o three.js declara, como o `position`. A `modelMatrix` leva da esfera para o mundo, e o `mat3` dela fica só com o giro e a escala, sem a translação, que não muda uma direção. As contas de luz deste projeto são no mundo, onde estão o sol e a câmera.",
        },
        {
          code: "    vec3 n = normalize(vNormal);",
          text: "A normal que chega ao pixel é uma mistura das dos três vértices, e a mistura de vetores de comprimento 1 sai um pouco mais curta. O `normalize` devolve o comprimento 1, que as contas de luz pedem.",
        },
        {
          code: "    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);",
          text: "Cada número da normal vai de −1 a 1, e os de uma cor, de 0 a 1: vezes 0,5 mais 0,5 leva um no outro. O lado que olha para a direita (x = 1) fica avermelhado; o de cima (y = 1), esverdeado; o da frente (z = 1), azulado. Sem a `paraSRGB`: aqui a cor é só um jeito de ver os números.",
        },
      ],
      why: [
        {
          title: "Atributo, uniform ou varying?",
          text: "São as três maneiras de um valor chegar a um shader. O atributo vem da geometria e muda de vértice para vértice: `position`, `normal`. O uniform vem do JavaScript e vale igual para todos: `uCor`. O varying sai do shader de vértices e chega ao de fragmentos misturado entre os vértices do triângulo, um valor diferente em cada pixel.",
        },
        {
          title: "Por que não o normalMatrix do three.js?",
          text: "O three.js declara um `normalMatrix`, mas ele leva a normal para o espaço da câmera, e não para o do mundo. Daria para fazer toda a conta no espaço da câmera, levando para lá também o sol e a lâmpada; no mundo, é mais fácil de conferir. E o `mat3(modelMatrix)` só serve porque a esfera não está esticada: com uma escala diferente em cada eixo, a normal entortaria, e precisaria da inversa transposta da matriz, que é o que o `normalMatrix` usa.",
        },
      ],
      try: [
        "Troque o `n * 0.5 + 0.5` por só `n`: os números negativos viram preto, e só os lados de cima, da direita e da frente ficam coloridos. A conferência avisa. Depois desfaça.",
        "Troque o `mat3(modelMatrix)` por `normalMatrix`: as cores mudam um pouco, porque a normal passa a ser a do espaço da câmera, e a conferência avisa. Depois desfaça.",
      ],
      needs: ["esfera"],
      checks: [
        {
          text: "A esfera mostra a normal de cada ponto, em cores",
          test: ({ objects, camera }) => {
            const { shader, result } = pixelsOf(objects.esfera);
            if (result) return result;
            const color = (n) => add(scale(n, 0.5), [0.5, 0.5, 0.5]);
            const expected = (s) => bytes(color(unit(s.n)));
            // a cor convertida para sRGB também vale: é só um jeito de ver os números
            if (fits(deviations(shader.inside, (s) => srgbBytes(color(unit(s.n)))))) return check(true);
            const variants = [[(s) => bytes(unit(s.n)), "faltou o * 0.5 + 0.5: os números da normal vão de −1 a 1, e os negativos viram preto"]];
            if (camera) variants.push([(s) => bytes(color(unit(inView(camera, unit(s.n))))), VIEW_NORMAL]);
            return compare(shader.inside, expected, variants);
          },
        },
      ],
    },
    {
      id: "difusa",
      title: "A luz difusa",
      view: "camera",
      goal:
        "A primeira luz. Uma superfície fosca recebe mais luz quando está de frente para ela e menos quando está de lado: a luz que chega é o cosseno do ângulo entre a normal e a direção da luz, a lei de Lambert. Com vetores de comprimento 1, o cosseno é o produto escalar, `dot(n, l)`. A direção do sol vai num uniform, e a esfera ganha volume: clara do lado do sol, apagada do outro. Por enquanto, sem a luz ambiente, o lado que não vê o sol fica preto.",
      lines: [
        {
          code: "    uDirecaoDoSol: { value: sol.position.clone().normalize() },",
          text: "A direção do ponto para o sol, com comprimento 1. A luz de um `DirectionalLight` vai da posição dele para o alvo, que fica no centro; o caminho de volta, do ponto para o sol, é a direção de `sol.position`. O `clone` copia o vetor, para o `normalize` não encolher a posição do próprio sol. Um `Vector3` vira um `vec3` no shader.",
        },
        {
          code: "  uniform vec3 uDirecaoDoSol;",
          text: "A declaração do uniform no shader de fragmentos.",
        },
        {
          code: "    float difusa = max(dot(n, uDirecaoDoSol), 0.0);",
          text: "A lei de Lambert: o produto escalar da normal com a direção do sol é o cosseno do ângulo entre as duas. Vale 1 onde a superfície está de frente para o sol, 0 de lado, e fica negativo de costas; o `max` troca o negativo por 0, porque luz negativa não existe.",
        },
        {
          code: "    vec3 cor = uCor * difusa;",
          text: "A cor da esfera vezes a luz que chega. O `uCor` é um `vec3` e a `difusa` é um `float`: o GLSL multiplica cada um dos três números pela difusa.",
        },
        {
          code: "    gl_FragColor = vec4(paraSRGB(cor), 1.0);",
          text: "A cor iluminada, convertida para sRGB no fim.",
        },
      ],
      why: [
        {
          title: "Por que o cosseno?",
          text: "Um feixe de luz que chega inclinado se espalha por uma área maior da superfície, como a sombra de um lápis, que fica comprida no fim da tarde. A mesma luz em mais área: cada ponto recebe menos. A área cresce com 1 ÷ cos θ, e a luz em cada ponto cai com cos θ. Johann Lambert escreveu essa lei em 1760.",
        },
        {
          title: "Por que a nossa esfera está mais escura que o gabarito?",
          text: "No lado que vê o sol, as duas já estão iguais. No outro, o gabarito recebe a luz ambiente da cena, e a nossa esfera ainda não: é o próximo passo.",
        },
      ],
      try: [
        "Tire o `.normalize()` do uniform: o vetor fica com o comprimento da posição do sol, 7,07, e quase a esfera inteira fica clara. A conferência avisa. Depois desfaça.",
        "Mude a posição do sol para `(-3, 4, 5)`: a luz passa para o lado esquerdo nas duas esferas, porque o uniform é calculado da posição do sol. Depois volte para (3, 4, 5).",
      ],
      needs: ["esfera", "sol"],
      checks: [
        {
          text: "O uniform uDirecaoDoSol aponta para o sol, com comprimento 1",
          test: ({ objects }) => {
            const u = uniformOf(objects.esfera, "uDirecaoDoSol", "vec3");
            if (u.result) return u.result;
            const length = Math.hypot(...u.value);
            if (Math.abs(length - 1) > 0.01) return check(false, `uDirecaoDoSol tem comprimento ${fmt(length)}: falta o normalize()`);
            const { sol } = objects;
            const sun = unit(sub(sol.worldPosition, sol.target ?? [0, 0, 0]));
            const angle = deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(u.value), sun)))));
            return check(angle <= 1, `uDirecaoDoSol aponta ${fmt(angle, 0)}° longe do sol: ela vai do ponto para o sol, na direção de sol.position`);
          },
        },
        {
          text: "A luz do sol cai na esfera pela lei de Lambert",
          test: (facts) =>
            lighting(facts, UNIFORMS.difusa, { ambient: false }, [
              [{ linear: true }, NO_SRGB],
              [{ flipSun: true }, "a luz chega pelo lado oposto ao do sol: no dot, a direção é a do ponto para o sol, uDirecaoDoSol, sem o menos"],
              [{ view: true }, VIEW_NORMAL],
            ]),
        },
      ],
    },
    {
      id: "ambiente",
      title: "A luz ambiente",
      view: "camera",
      goal:
        "Na vida real, o lado de uma bola que não vê o sol não fica preto: a luz que bate nas paredes, no chão e no céu chega a ele por todos os lados. O modelo de Phong resume essa luz num número só, a luz ambiente, que chega igual a todo ponto. É o 0,15 da `luzAmbiente` da cena, que o gabarito já recebe. Com ele, o lado escuro da nossa esfera fica igual ao do gabarito.",
      lines: [
        {
          code: "    uAmbiente: { value: 0.15 },",
          text: "A força da luz ambiente: 0,15, a intensidade da `luzAmbiente` (0,15 × π) já dividida por π, como o three.js faz. Um número vira um `float` no shader.",
        },
        {
          code: "  uniform float uAmbiente;",
          text: "A declaração do uniform.",
        },
        {
          code: "    vec3 cor = uCor * (uAmbiente + difusa);",
          text: "A luz que chega ao ponto é a ambiente mais a difusa, e a cor da esfera multiplica as duas: de costas para o sol, sobra 0,15 da cor; de frente, 1,15.",
        },
      ],
      why: [
        {
          title: "Por que somar as luzes e multiplicar pela cor?",
          text: "As luzes somam: a ambiente e a do sol chegam ao ponto ao mesmo tempo, e o ponto devolve uma parte de cada. A cor multiplica a soma porque ela diz quanto de cada cor a superfície devolve: um azul devolve muito azul e pouco vermelho, de qualquer luz.",
        },
        {
          title: "A luz ambiente é de verdade?",
          text: "É uma aproximação, e das grossas: a luz que rebate chega mais de um lado que de outro, e menos nos cantos. Os jogos de hoje calculam essa luz, a iluminação global, com muito mais conta. Para o Phong de 1975, um número só bastava.",
        },
      ],
      try: [
        "Tire o `max` da difusa (fica `float difusa = dot(n, uDirecaoDoSol);`): de costas para o sol, o produto escalar é negativo e apaga a luz ambiente, e o lado escuro volta a ficar preto. A conferência avisa. Depois desfaça.",
        "Mude o `uAmbiente` para 0.5: o lado escuro da nossa esfera fica mais claro que o do gabarito, e a conferência avisa. Depois volte para 0.15.",
      ],
      needs: ["esfera", "sol", "luzAmbiente"],
      checks: [
        {
          text: "O uniform uAmbiente tem a luz ambiente da cena, 0,15",
          test: ({ objects }) => {
            const u = uniformOf(objects.esfera, "uAmbiente", "float");
            if (u.result) return u.result;
            const light = objects.luzAmbiente.light;
            const ambient = ((light?.intensity ?? 0) / Math.PI) * (light?.color ?? [1, 1, 1]).reduce((s, c) => s + toLinear(c), 0) / 3;
            return check(Math.abs(u.value - ambient) <= 0.005, `uAmbiente é ${fmt(u.value)}, e a luz ambiente da cena vale ${fmt(ambient)}: a intensidade dela dividida por π`);
          },
        },
        {
          text: "A luz ambiente acende o lado escuro, como no gabarito",
          test: (facts) =>
            lighting(facts, UNIFORMS.ambiente, {}, [
              [{ noMax: true }, "o lado escuro ficou mais escuro que a luz ambiente: falta o max(…, 0.0) na difusa, porque de costas para o sol o produto escalar é negativo e apaga o ambiente"],
              [{ ambientApart: true }, "a luz ambiente precisa passar pela cor da esfera, como a do sol: uCor * (uAmbiente + difusa)"],
              [{ linear: true }, NO_SRGB],
              [{ flipSun: true }, "a luz chega pelo lado oposto ao do sol: no dot, a direção é a do ponto para o sol, uDirecaoDoSol, sem o menos"],
              [{ view: true }, VIEW_NORMAL],
            ]),
        },
      ],
    },
    {
      id: "phong",
      title: "O brilho de Phong",
      view: "camera",
      goal:
        "Falta o brilho: a mancha clara onde o sol se reflete na direção de quem olha. Bui Tuong Phong calculou assim, em 1975: r é a direção em que a luz do sol sai refletida, como num espelho, e v é a direção do ponto para a câmera. Quanto mais perto r aponta de v, mais forte o brilho, e um expoente decide quão rápido ele cai: (r·v)³⁰. Para saber onde fica cada ponto no mundo, o shader de vértices passa a mandar também a posição, em outro varying.",
      lines: [
        {
          code: "    vec4 mundo = modelMatrix * vec4(position, 1.0);",
          text: "A posição do vértice no mundo: só a `modelMatrix`, sem a câmera.",
        },
        {
          code: "    vPosicao = mundo.xyz;",
          text: "O varying leva a posição aos pixels, misturada entre os vértices como a normal. O `.xyz` pega os três primeiros números do `vec4`.",
        },
        {
          code: "    gl_Position = projectionMatrix * viewMatrix * mundo;",
          text: "O mesmo de antes, em duas partes: a `viewMatrix` leva do mundo para o espaço da câmera, e a `modelViewMatrix` do passo 2 era a `viewMatrix` vezes a `modelMatrix`. Assim, a conta do mundo é feita uma vez só.",
        },
        {
          code: '    uCorEspecular: { value: new THREE.Color("#ffffff") },',
          text: "A cor do brilho, a mesma `specular` do gabarito: branca, a cor da luz.",
        },
        {
          code: "    uBrilho: { value: 30 },",
          text: "O expoente, o `shininess` do gabarito.",
        },
        {
          code: "    vec3 v = normalize(cameraPosition - vPosicao);",
          text: "Do ponto para a câmera, com comprimento 1. O `cameraPosition` é mais um uniform que o three.js declara e preenche: a posição da câmera no mundo.",
        },
        {
          code: "    vec3 r = reflect(-uDirecaoDoSol, n);",
          text: "O reflexo. O `reflect` recebe a direção em que a luz anda, do sol para o ponto (por isso o menos), e a devolve espelhada na normal, como uma bola de bilhar que bate na tabela.",
        },
        {
          code: "    float brilho = difusa > 0.0 ? pow(max(dot(r, v), 0.0), uBrilho) : 0.0;",
          text: "O brilho de Phong: o cosseno entre r e v, elevado ao expoente. Com 30, ele cai pela metade a só 12° do centro da mancha. O `? :` escolhe um de dois valores: onde o sol não bate (difusa 0), brilho nenhum.",
        },
        {
          code: "    vec3 cor = uCor * (uAmbiente + difusa) + uCorEspecular * brilho;",
          text: "O brilho soma na cor com a cor dele, e não com a da esfera: num plástico ou numa tinta envernizada, o reflexo tem a cor da luz.",
        },
      ],
      why: [
        {
          title: "Por que o brilho depende da câmera?",
          text: "A difusa espalha a luz igual para todos os lados, e a mesma parte chega a qualquer olho. O brilho vai quase todo numa direção, a do reflexo, e só aparece para quem está nela. Por isso a conta usa o v, a direção da câmera, e o brilho anda quando a câmera anda.",
        },
        {
          title: "O brilho não saiu igual ao do gabarito?",
          text: "Saiu no mesmo canto, mas não igual. O brilho do `MeshPhongMaterial`, apesar do nome, não é o de Phong: é o de Blinn, o assunto do próximo passo.",
        },
      ],
      try: [
        "Troque o `-uDirecaoDoSol` por `uDirecaoDoSol` no `reflect`: o reflexo vira para o outro lado, e o brilho some da frente da esfera. A conferência avisa. Depois desfaça.",
        "Mude o `uBrilho` para 5 e depois para 200: a mancha se espalha ou vira um ponto. Depois volte para 30.",
        "Desligue a Câmera do código e gire a vista: o brilho da nossa esfera anda com a câmera, como o do gabarito.",
      ],
      needs: ["esfera", "sol", "luzAmbiente"],
      checks: [
        {
          text: "O material tem os uniforms do brilho: uCorEspecular e uBrilho",
          test: ({ objects }) => {
            const u = uniformsOf(objects.esfera, { uCorEspecular: "vec3", uBrilho: "float" });
            if (u.result) return u.result;
            return check(u.values.uBrilho > 0, `uBrilho é ${number(u.values.uBrilho)}: o expoente precisa ser maior que 0`);
          },
        },
        {
          text: "O brilho de Phong aparece onde o reflexo do sol aponta para a câmera",
          test: (facts) =>
            lighting(facts, UNIFORMS.brilho, { model: "phong" }, [
              // trocar o sinal do reflect ou o do v dá a mesma conta
              [{ flipReflect: true }, "o brilho está no lugar errado: confira os sinais. O reflect recebe a direção em que a luz anda, do sol para o ponto, -uDirecaoDoSol, e o v vai do ponto para a câmera, cameraPosition - vPosicao"],
              [{ tinted: true }, TINTED],
              [{ model: "blinn" }, "esse é o brilho de Blinn–Phong, do próximo passo: aqui, o brilho é o do reflexo, dot(r, v)"],
              [{ linear: true }, NO_SRGB],
            ]),
        },
      ],
    },
    {
      id: "blinn",
      title: "Blinn–Phong",
      view: "camera",
      goal:
        "Em 1977, Jim Blinn propôs um atalho: em vez do reflexo r, o vetor do meio, h, a direção exatamente entre a do sol e a da câmera. O brilho é forte onde a normal aponta para h. É o modelo que o `MeshPhongMaterial` do three.js usa, apesar do nome. Com o mesmo expoente, a mancha sai mais larga que a de Phong: agora ela tem o tamanho da do gabarito, mas ainda é mais fraca.",
      lines: [
        {
          code: "    vec3 h = normalize(uDirecaoDoSol + v);",
          text: "O vetor do meio: a soma de duas direções de comprimento 1 fica no meio das duas, e o `normalize` volta o comprimento a 1.",
        },
        {
          code: "    float brilho = difusa > 0.0 ? pow(max(dot(n, h), 0.0), uBrilho) : 0.0;",
          text: "O brilho de Blinn–Phong: o cosseno entre a normal e h, elevado ao expoente, o mesmo 30. A mancha sai com o dobro da largura da de Phong: o brilho cai pela metade quando a normal se afasta 12° de h, e no de Phong bastavam 6°, porque girar a normal gira o reflexo em dobro.",
        },
      ],
      why: [
        {
          title: "Por que o brilho do gabarito ainda é mais forte?",
          text: "Porque o three.js multiplica o brilho por um número que cresce com o expoente: com 30, a mancha sai 4 vezes mais forte no centro. É o próximo passo, o último para a nossa esfera ficar igual ao gabarito.",
        },
        {
          title: "Por que o h é mais barato?",
          text: "Com o sol e a câmera longe, o h quase não muda de um ponto para outro, e as placas de vídeo antigas calculavam um h só para a esfera inteira; o reflexo precisava de uma conta por ponto. Hoje a diferença é pequena, mas o Blinn–Phong ficou: a forma do brilho dele é mais parecida com a de objetos reais.",
        },
      ],
      try: [
        "Troque o `uBrilho` do `pow` por `uBrilho * 4.0`: a mancha volta ao tamanho da de Phong, do passo anterior. É o expoente que muitos livros usam para o Blinn–Phong imitar o Phong; o three.js usa o expoente como está. A conferência avisa. Depois desfaça.",
        "Mude o `uBrilho` do material e o `shininess` do gabarito para 100: as duas manchas encolhem juntas. Depois volte os dois para 30.",
      ],
      needs: ["esfera", "sol", "luzAmbiente"],
      checks: [
        {
          text: "O brilho usa o vetor do meio, com o expoente do gabarito",
          test: (facts) =>
            lighting(facts, UNIFORMS.brilho, { model: "blinn" }, [
              [{ times4: true }, "a mancha ficou do tamanho da de Phong: com o h, o three.js usa o expoente como está, uBrilho, sem o * 4.0"],
              [{ model: "three" }, "esse já é o brilho do próximo passo, com o fator do three.js: aqui, só o pow(max(dot(n, h), 0.0), uBrilho)"],
              [{ model: "phong" }, "o brilho ainda é o de Phong: troque o r pelo h, normalize(uDirecaoDoSol + v), e o dot(r, v) pelo dot(n, h)"],
              [{ rawHalf: true }, "falta normalizar o h: a soma de duas direções de comprimento 1 é mais comprida que 1"],
              [{ tinted: true }, TINTED],
              [{ linear: true }, NO_SRGB],
            ]),
        },
      ],
    },
    {
      id: "energia",
      title: "Igual ao gabarito",
      view: "camera",
      goal:
        "A mancha do gabarito ainda é mais forte que a nossa. O three.js multiplica o brilho por (s + 2) ÷ 8, com s, o expoente, e também pela difusa, como a cor. É a conservação de energia: uma mancha mais estreita, de expoente maior, fica mais forte, e a luz que a esfera devolve nunca passa da que ela recebe. Com essa conta, a nossa esfera fica igual ao gabarito, pixel a pixel.",
      lines: [
        {
          code: "    float brilho = pow(max(dot(n, h), 0.0), uBrilho) * (uBrilho + 2.0) / 8.0 * difusa;",
          text: "O brilho de Blinn–Phong vezes o fator do three.js: com o expoente 30, (30 + 2) ÷ 8 = 4, e a mancha fica 4 vezes mais forte. A difusa também multiplica: onde o sol não bate, ela é 0, e o brilho também, por isso o `? :` saiu.",
        },
      ],
      why: [
        {
          title: "De onde vem o (s + 2) ÷ 8?",
          text: "Da física das superfícies, que o three.js segue. Uma superfície brilhante é coberta de facetas microscópicas, cada uma virada para um lado, e o expoente diz quantas estão viradas quase para h: com ele maior, mais facetas alinhadas, a mancha mais estreita e a mesma luz concentrada nela. O (s + 2) ÷ 2π faz essa conta, para o total de luz não mudar com o expoente; o three.js ainda divide por 4, uma parte da conta das facetas, e o π some com o π das nossas intensidades: sobra (s + 2) ÷ 8.",
        },
        {
          title: "Por que o brilho vezes a difusa?",
          text: "Porque as duas partes recebem a mesma luz. O three.js calcula primeiro quanta luz chega a um ponto (o cosseno de Lambert, a nossa difusa) e depois quanto dela sai como cor e quanto como brilho. No Phong dos livros, o brilho vem sem o cosseno, e precisava do `? :` para não acender o lado escuro.",
        },
      ],
      try: [
        "Mude o `uBrilho` do material e o `shininess` do gabarito para 100: as duas manchas encolhem, ficam mais fortes e continuam iguais. Depois volte os dois para 30.",
        "Mude só o `uBrilho` do material para 100: a nossa mancha encolhe, a do gabarito não, e a conferência avisa que os números das duas esferas não batem. Depois volte para 30.",
        "Troque o `(uBrilho + 2.0) / 8.0` por `1.0`: a mancha volta a ficar fraca, como no passo anterior. A conferência avisa. Depois desfaça.",
      ],
      needs: ["esfera", "gabarito", "sol", "luzAmbiente"],
      checks: [
        {
          text: "Os uniforms têm os números do gabarito: a cor, a cor do brilho e o expoente",
          test: ({ objects }) => {
            const u = uniformsOf(objects.esfera, { uCor: "vec3", uCorEspecular: "vec3", uBrilho: "float" });
            if (u.result) return u.result;
            const g = objects.gabarito.material;
            if (g?.type !== "MeshPhongMaterial") return check(false, `o gabarito é ${g?.type ?? "um objeto sem material"}, e não MeshPhongMaterial`);
            // as cores do gabarito estão como no código (sRGB); as dos uniforms, no espaço linear
            const color = hexOf(u.values.uCor);
            if (color !== g.hex) return check(false, `o uCor é ${color}, e a cor do gabarito, ${g.hex}`);
            const specular = hexOf(u.values.uCorEspecular);
            if (g.specular && specular !== hex(bytes(g.specular))) return check(false, `o uCorEspecular é ${specular}, e o specular do gabarito, ${hex(bytes(g.specular))}`);
            return check(u.values.uBrilho === g.shininess, `o uBrilho é ${number(u.values.uBrilho)}, e o shininess do gabarito, ${number(g.shininess)}: para as manchas ficarem iguais, os dois números precisam ser iguais`);
          },
        },
        {
          text: "A nossa esfera fica igual ao gabarito: o brilho vezes (uBrilho + 2) ÷ 8 e vezes a difusa",
          test: (facts) =>
            lighting(facts, UNIFORMS.brilho, { model: "three" }, [
              [{ model: "blinn" }, NO_FACTOR],
              [{ model: "blinn", diffuse: true }, NO_FACTOR],
              [{ tinted: true }, TINTED],
              [{ linear: true }, NO_SRGB],
            ]),
        },
      ],
    },
    {
      id: "lampada",
      title: "Uma lâmpada",
      view: "camera",
      goal:
        "Uma luz só é pouco. Este passo acende uma lâmpada laranja na frente das esferas: uma luz pontual, que sai de um ponto para todos os lados e enfraquece com o quadrado da distância. A conta da luz é a mesma para o sol e para a lâmpada, então ela vira uma função do GLSL, `luz`, chamada uma vez para cada uma. Mudam só a direção, que na lâmpada vai de cada ponto até ela, e a força, que na lâmpada cai com a distância.",
      lines: [
        {
          code: 'const lampada = new THREE.PointLight("#ffaa55", 4 * Math.PI);',
          text: "Uma luz pontual laranja. A intensidade 4π vale 4 nas contas dos livros: a 2 de distância, chega com 4 ÷ 2² = 1, a força do sol.",
        },
        {
          code: "lampada.position.set(0, 0.6, 3);",
          text: "Na frente das esferas, entre as duas e um pouco acima do centro delas.",
        },
        {
          code: "const bulbo = new THREE.Mesh(",
          text: "Uma bolinha que mostra onde a lâmpada está, da cor dela e sem luz (`MeshBasicMaterial`). Como na Vitrine de materiais, ela é filha da lâmpada e vai junto aonde ela for.",
        },
        {
          code: "    uPosicaoDaLampada: { value: lampada.position.clone() },",
          text: "A posição da lâmpada. O `clone` faz um vetor novo para o uniform: mudar a lâmpada depois não muda o uniform sozinho, e o último passo cuida disso.",
        },
        {
          code: '    uCorDaLampada: { value: new THREE.Color("#ffaa55").multiplyScalar(4) },',
          text: "A cor da lâmpada vezes a força dela, 4, a intensidade dividida por π. O `multiplyScalar` multiplica os três números da cor, já no espaço linear.",
        },
        {
          code: "  vec3 luz(vec3 l, vec3 corDaLuz, vec3 n, vec3 v) {",
          text: "A conta de uma luz, numa função: recebe a direção l do ponto para a luz, a cor e a força com que ela chega, a normal e a direção da câmera, e devolve a difusa e o brilho dessa luz, com a conta do three.js do passo anterior. Ela vem antes do `main`, que a usa.",
        },
        {
          code: "    return corDaLuz * (uCor * difusa + uCorEspecular * brilho);",
          text: "A difusa, com a cor da esfera, e o brilho, com a cor do brilho, as duas vezes a cor da luz: uma luz laranja deixa laranja o que ilumina, e o brilho também.",
        },
        {
          code: "    vec3 cor = uCor * uAmbiente; // a luz ambiente",
          text: "A cor começa pela luz ambiente, e cada luz soma a parte dela com o `+=`.",
        },
        {
          code: "    cor += luz(uDirecaoDoSol, vec3(1.0), n, v); // o sol: branco, de força 1",
          text: "O sol, com a direção de sempre. `vec3(1.0)` é o vetor (1, 1, 1): um número só no construtor vale para os três.",
        },
        {
          code: "    vec3 paraLampada = uPosicaoDaLampada - vPosicao;",
          text: "Do ponto até a lâmpada: diferente em cada ponto, ao contrário da direção do sol.",
        },
        {
          code: "    float distancia = length(paraLampada);",
          text: "O comprimento desse vetor: a distância do ponto à lâmpada.",
        },
        {
          code: "    cor += luz(paraLampada / distancia, uCorDaLampada / max(distancia * distancia, 0.01), n, v);",
          text: "A lâmpada: a direção com comprimento 1 (o vetor dividido pelo próprio comprimento) e a cor dividida pelo quadrado da distância. O `max` com 0,01 evita dividir por quase zero com a lâmpada encostada num ponto. É a mesma conta que o three.js faz no gabarito.",
        },
      ],
      why: [
        {
          title: "Por que o quadrado da distância?",
          text: "A luz de uma lâmpada se espalha em todas as direções, por uma esfera que cresce. A área de uma esfera cresce com o quadrado do raio: a 2 de distância, a mesma luz cobre 4 vezes a área que cobre a 1; a 3, 9 vezes. Cada ponto recebe a luz dividida por essa área.",
        },
        {
          title: "Por que uma função?",
          text: "Para escrever a conta uma vez só. Com três ou quatro luzes, cada uma é mais uma linha no `main`. Os shaders do three.js fazem assim: um laço passa pelas luzes da cena, e a mesma conta soma cada uma.",
        },
      ],
      try: [
        "Tire a atenuação: troque o `uCorDaLampada / max(distancia * distancia, 0.01)` por só `uCorDaLampada`. A lâmpada passa a iluminar igual de perto e de longe, como um sol laranja, e a conferência avisa. Depois desfaça.",
        "Mude a posição da lâmpada para `(-2.6, 0.6, 1.2)`, perto da nossa esfera: a luz dela fica forte de um lado só, e o gabarito quase não a recebe. Depois volte para (0, 0.6, 3).",
      ],
      needs: ["esfera", "sol", "luzAmbiente", "lampada", "bulbo"],
      checks: [
        {
          text: "A lâmpada é uma luz pontual na cena, com a bolinha dentro",
          test: ({ objects, lights, nameOf }) => {
            const { lampada, bulbo } = objects;
            if (lampada.type !== "PointLight") return check(false, `lampada é ${lampada.type}, e não PointLight`);
            if (!lights.some((l) => l.type === "PointLight")) return check(false, "a lâmpada não foi adicionada à cena");
            const parent = bulbo.parent == null ? null : nameOf(bulbo.parent);
            return check(parent === "lampada", parent ? `o pai do bulbo é ${parent}` : "o bulbo não está dentro da lâmpada: falta lampada.add(bulbo)");
          },
        },
        {
          text: "Os uniforms da lâmpada têm a posição e a cor dela",
          test: ({ objects }) => lampUniforms(objects),
        },
        {
          text: "A esfera recebe a luz da lâmpada, que enfraquece com a distância",
          test: (facts) => lampLighting(facts),
        },
      ],
    },
    {
      id: "volta",
      title: "A lâmpada dá a volta",
      view: "camera",
      motion: true,
      goal:
        "Por último, a lâmpada se move: a cada quadro, a função `animar` a põe num ponto de um círculo de raio 3 em volta das esferas. O gabarito acompanha sozinho, porque o three.js lê a posição das luzes da cena a cada quadro. O nosso shader, não: ele só conhece a lâmpada pelo uniform, e o uniform guardou a posição de quando o material foi criado. Por isso, o `animar` também copia a posição nova para o uniform.",
      lines: [
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama `animar` a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou.",
        },
        {
          code: "  lampada.position.set(Math.sin(tempo) * 3, 0.6, Math.cos(tempo) * 3);",
          text: "Um círculo de raio 3, deitado, a 0,6 de altura: o seno e o cosseno do tempo dão um ponto do círculo de raio 1, e vezes 3, um do de raio 3. No tempo 0, a lâmpada está em (0; 0,6; 3), onde o passo anterior a pôs, e ela dá uma volta a cada 2π segundos, uns 6,3.",
        },
        {
          code: "  material.uniforms.uPosicaoDaLampada.value.copy(lampada.position);",
          text: "Copia a posição da lâmpada para o vetor do uniform. O three.js manda os uniforms à placa de vídeo antes de cada desenho, e o shader recebe a posição nova no mesmo quadro.",
        },
      ],
      why: [
        {
          title: "Por que o uniform não acompanha a lâmpada sozinho?",
          text: "Porque o `clone` do passo anterior fez um vetor novo, separado do da lâmpada. Sem o `clone`, o uniform e a lâmpada teriam o mesmo vetor, e mover uma moveria a outra. Mas é um vínculo escondido, que quebra na primeira vez que alguém troca o vetor (`lampada.position = …`) ou põe a lâmpada dentro de um grupo que anda. Copiar no `animar` deixa claro de onde vem o valor.",
        },
        {
          title: "Como o three.js faz com as luzes do gabarito?",
          text: "Do mesmo jeito, por uniforms: a cada quadro, antes de desenhar, ele junta a cor, a intensidade e a posição de cada luz da cena e manda tudo para os shaders dos materiais, em listas de uniforms. É o trabalho que fizemos à mão para uma lâmpada.",
        },
      ],
      try: [
        "Apague a linha do `copy`: a lâmpada anda, e a luz dela fica parada na nossa esfera, onde a lâmpada começou. A conferência avisa. Depois desfaça.",
        "Troque o `3` das duas contas por `2.5`: a lâmpada passa raspando nas esferas, e a luz dela fica muito forte quando chega perto.",
        "Troque o `tempo` das duas contas por `tempo * 3`: a lâmpada dá uma volta a cada 2 segundos.",
      ],
      needs: ["esfera", "sol", "luzAmbiente", "lampada", "bulbo"],
      checks: [
        {
          text: "A lâmpada dá voltas em torno das esferas",
          test: (facts) => {
            const pending = stopped(facts);
            if (pending) return pending;
            const trail = facts.objects.lampada.trail;
            if (!(trail?.length >= 2)) return facts.recorded < 1 ? wait("esperando a lâmpada andar") : check(false, "a lâmpada não sai do lugar: animar não muda a posição dela");
            const radii = trail.map(([, x, , z]) => Math.hypot(x, z));
            const [low, high] = [Math.min(...radii), Math.max(...radii)];
            if (low < 2.4) return check(false, `a lâmpada passa a ${fmt(low)} do centro: a volta tem de passar por fora das esferas`);
            return check(high <= 6, `a lâmpada vai até ${fmt(high)} do centro: longe demais para iluminar as esferas`);
          },
        },
        {
          text: "O uniform da posição acompanha a lâmpada",
          test: (facts) => {
            const pending = stopped(facts);
            if (pending) return pending;
            const { objects } = facts;
            const u = uniformOf(objects.esfera, "uPosicaoDaLampada", "vec3");
            if (u.result) return u.result;
            const where = objects.lampada.worldPosition;
            return check(dist(u.value, where) <= 0.01, `a lâmpada está em ${vec(where)}, e a luz no shader ficou em ${vec(u.value)}: falta copiar a posição dela para material.uniforms.uPosicaoDaLampada.value no animar`);
          },
        },
        {
          text: "A esfera recebe a luz do sol e da lâmpada",
          test: (facts) => lampLighting(facts),
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};

/** Confere os uniforms da lâmpada: a posição dela no mundo e a cor, no espaço linear, vezes a intensidade ÷ π. */
function lampUniforms(objects) {
  const u = uniformsOf(objects.esfera, { uPosicaoDaLampada: "vec3", uCorDaLampada: "vec3" });
  if (u.result) return u.result;
  const where = objects.lampada.worldPosition;
  if (dist(u.values.uPosicaoDaLampada, where) > 0.01) return check(false, `uPosicaoDaLampada é ${vec(u.values.uPosicaoDaLampada)}, e a lâmpada está em ${vec(where)}`);
  const light = objects.lampada.light;
  const expected = light.color.map((c) => (toLinear(c) * light.intensity) / Math.PI);
  return check(gap(u.values.uCorDaLampada, expected) <= 0.02, `uCorDaLampada é ${vec(u.values.uCorDaLampada)}, e a luz da lâmpada chega com ${vec(expected)}: a cor dela, no espaço linear, vezes a intensidade dividida por π`);
}

/** Confere a luz do sol e da lâmpada na esfera, com os erros comuns da lâmpada. */
const lampLighting = (facts) =>
  lighting(facts, UNIFORMS.lampada, { model: "three", lamp: true }, [
    [{ noFade: true }, "a luz da lâmpada não enfraquece com a distância: divida a cor dela pelo quadrado da distância"],
    [{ linearFade: true }, "a luz da lâmpada enfraquece com a distância, e não com o quadrado dela: divida por distancia * distancia"],
    [{ lamp: false }, "a luz da lâmpada não chega à esfera: falta somar a luz(…) da lâmpada no main"],
    [{ flipLamp: true }, "a luz da lâmpada chega pelo lado oposto: a direção vai do ponto para a lâmpada, uPosicaoDaLampada - vPosicao"],
    [{ rawLamp: true }, "a direção da lâmpada precisa de comprimento 1: divida paraLampada pela distância"],
    [{ noSun: true }, "a luz do sol sumiu: falta somar a luz(…) do sol no main"],
    [{ linear: true }, NO_SRGB],
  ]);
