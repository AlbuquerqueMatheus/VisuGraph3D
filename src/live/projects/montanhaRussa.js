// montanhaRussa.js — o projeto "Montanha-russa": um trilho por uma curva suave, com viga, trilhos,
// dormentes e pilares, e um carrinho que despenca da subida com a velocidade que a altura dá, em 11
// passos no VisuGraph e 1 no seu computador. O assunto é a curva (CatmullRomCurve3), o que se
// constrói em volta dela (TubeGeometry, o lado pelo produto vetorial, a direção pelo lookAt) e a
// animação ao longo dela, com a conservação da energia.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js); as bolinhas
// e a linha dos passos 2 e 3 são andaimes, que saem no passo 4. A conferência mede o trilho pela
// curva da viga (os pontos dela vêm nos fatos, em `geometry.curve`) e o passeio pelo rastro do
// carrinho (`trail`, os lugares por onde ele passou enquanto a animação rodava): os passos que
// medem o movimento (`motion`) conferem de novo a cada segundo, enquanto o rastro cresce.

import {
  all,
  apply,
  axisOf,
  check,
  curveOf,
  deg,
  depthOf,
  dist,
  dot,
  extent,
  fitLine,
  fmt,
  fogAt,
  lengthOf,
  luminance,
  nearest,
  pct,
  placesOf,
  shadowOf,
  speedsOf,
  toWorld,
  toward,
  wait,
} from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, during, from } from "./source.js";

/** Várias linhas de código como um texto só, para uma versão de `by` que troca um bloco. */
const block = (...lines) => lines.join("\n");

const SOURCE = [
  from(0, "// Montanha-russa"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#9fd8ff");',
    'cena.fog = new THREE.Fog("#9fd8ff", 50, 150);',
    "",
    "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);",
  ),
  // no passo 11 a câmera vai para o carrinho, e o lugar dela no alto do parque sai
  by({ 1: "camera.position.set(34, 18, 26);", 11: null }),
  by({ 1: "camera.lookAt(0, 4, 0);", 11: null }),
  from(
    1,
    "",
    "// A luz do céu: azulada de cima, da cor da grama de baixo",
    'const ceu = new THREE.HemisphereLight("#d8f0ff", "#5a7a3a", 1.2);',
    "cena.add(ceu);",
    "",
    "// O sol: alto, de um lado do parque",
    'const sol = new THREE.DirectionalLight("#fff2d6", 2.2);',
    "sol.position.set(15, 30, 20);",
  ),
  from(
    8,
    "sol.castShadow = true;",
    "// a câmera da sombra: uma caixa que cobre a montanha-russa inteira, vista do sol",
    "sol.shadow.camera.left = -18;",
    "sol.shadow.camera.right = 18;",
    "sol.shadow.camera.top = 18;",
    "sol.shadow.camera.bottom = -18;",
    "sol.shadow.camera.far = 60;",
    "sol.shadow.mapSize.set(2048, 2048);",
  ),
  from(
    1,
    "cena.add(sol);",
    "",
    "// O chão: uma placa enorme de grama, que a neblina apaga no horizonte",
    "const chao = new THREE.Mesh(",
    "  new THREE.PlaneGeometry(400, 400),",
    '  new THREE.MeshStandardMaterial({ color: "#7cbf5a" })',
    ");",
    "chao.rotation.x = -Math.PI / 2;",
  ),
  from(8, "chao.receiveShadow = true;"),
  from(1, "cena.add(chao);"),
  from(
    2,
    "",
    "// Os pontos por onde o trilho passa, na ordem em que o carrinho anda",
    "const pontos = [",
    "  new THREE.Vector3(8.5, 12, -5), // o alto da subida: o carrinho parte daqui",
    "  new THREE.Vector3(7, 6, -10), // a queda",
    "  new THREE.Vector3(3, 1.5, -14.5), // o fundo da queda",
    "  new THREE.Vector3(-4, 4, -15), // a curva",
    "  new THREE.Vector3(-9, 8, -9), // um morro",
    "  new THREE.Vector3(-9.5, 2, -3), // um vale",
    "  new THREE.Vector3(-9, 6, 3), // outro morro",
    "  new THREE.Vector3(-8, 2, 8),",
    "  new THREE.Vector3(-3, 3.5, 14), // a curva da volta",
    "  new THREE.Vector3(4, 2, 14.5),",
    "  new THREE.Vector3(8, 1.5, 12), // a estação",
    "  new THREE.Vector3(8.5, 1.5, 6), // o começo da subida",
    "  new THREE.Vector3(9, 7.5, 0),",
    "];",
  ),
  during(
    2,
    4,
    "",
    "// Uma bolinha em cada ponto, para ver onde eles ficam",
    "const geometriaMarca = new THREE.SphereGeometry(0.4, 16, 8);",
    'const materialMarca = new THREE.MeshStandardMaterial({ color: "#ffd23f" });',
    "for (const ponto of pontos) {",
    "  const marca = new THREE.Mesh(geometriaMarca, materialMarca);",
    "  marca.position.copy(ponto);",
    "  cena.add(marca);",
    "}",
  ),
  from(3, "", "// A curva: passa por todos os pontos e volta ao primeiro", "const curva = new THREE.CatmullRomCurve3(pontos, true);"),
  during(
    3,
    4,
    "",
    "// Uma linha pela curva, ligando 300 pontos dela",
    "const pontosDaCurva = curva.getPoints(300);",
    "const geometriaLinha = new THREE.BufferGeometry().setFromPoints(pontosDaCurva);",
    'const linha = new THREE.Line(geometriaLinha, new THREE.LineBasicMaterial({ color: "#ffffff" }));',
    "cena.add(linha);",
  ),
  from(
    4,
    "",
    "// A viga: um tubo vermelho em volta da curva",
    'const materialViga = new THREE.MeshStandardMaterial({ color: "#e63946" });',
    "const viga = new THREE.Mesh(new THREE.TubeGeometry(curva, 800, 0.2, 12, true), materialViga);",
  ),
  from(8, "viga.castShadow = true;"),
  from(4, "cena.add(viga);"),
  from(
    5,
    "",
    "// Os trilhos: dois tubos finos, um de cada lado da viga",
    "const cima = new THREE.Vector3(0, 1, 0);",
    "const esquerda = [];",
    "const direita = [];",
    "for (let i = 0; i < 300; i++) {",
    "  const u = i / 300;",
    "  const ponto = curva.getPointAt(u);",
    "  const frente = curva.getTangentAt(u);",
    "  const lado = new THREE.Vector3().crossVectors(frente, cima).normalize().multiplyScalar(0.55);",
    "  esquerda.push(ponto.clone().sub(lado));",
    "  direita.push(ponto.clone().add(lado));",
    "}",
    "",
    'const materialTrilho = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.5, roughness: 0.3 });',
    "const curvaEsquerda = new THREE.CatmullRomCurve3(esquerda, true);",
    "const curvaDireita = new THREE.CatmullRomCurve3(direita, true);",
    "const trilhoEsquerdo = new THREE.Mesh(new THREE.TubeGeometry(curvaEsquerda, 800, 0.07, 8, true), materialTrilho);",
    "const trilhoDireito = new THREE.Mesh(new THREE.TubeGeometry(curvaDireita, 800, 0.07, 8, true), materialTrilho);",
  ),
  from(8, "trilhoEsquerdo.castShadow = true;", "trilhoDireito.castShadow = true;"),
  from(5, "cena.add(trilhoEsquerdo);", "cena.add(trilhoDireito);"),
  from(
    6,
    "",
    "// Os dormentes: uma travessa a cada pedaço do caminho, de um trilho ao outro",
    "const geometriaDormente = new THREE.BoxGeometry(1.3, 0.1, 0.2);",
    "for (let i = 0; i < 160; i++) {",
    "  const u = i / 160;",
    "  const ponto = curva.getPointAt(u);",
    "  const dormente = new THREE.Mesh(geometriaDormente, materialViga);",
    "  dormente.position.copy(ponto);",
    "  dormente.lookAt(ponto.clone().add(curva.getTangentAt(u)));",
  ),
  from(8, "  dormente.castShadow = true;"),
  from(6, "  cena.add(dormente);", "}"),
  from(
    7,
    "",
    "// Os pilares: do chão até a viga, espalhados pelo caminho",
    "const geometriaPilar = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);",
    "geometriaPilar.translate(0, 0.5, 0); // a base no chão: a escala estica só para cima",
    'const materialPilar = new THREE.MeshStandardMaterial({ color: "#f4f1ea" });',
    "for (let i = 0; i < 30; i++) {",
    "  const ponto = curva.getPointAt(i / 30);",
    "  const pilar = new THREE.Mesh(geometriaPilar, materialPilar);",
    "  pilar.position.set(ponto.x, 0, ponto.z);",
    "  pilar.scale.y = ponto.y;",
  ),
  from(8, "  pilar.castShadow = true;"),
  from(7, "  cena.add(pilar);", "}"),
  from(
    9,
    "",
    "// O carrinho: uma caixa com a base na curva, em cima da viga",
    "const geometriaCarrinho = new THREE.BoxGeometry(1.1, 0.7, 1.8);",
    "geometriaCarrinho.translate(0, 0.55, 0);",
    'const carrinho = new THREE.Mesh(geometriaCarrinho, new THREE.MeshStandardMaterial({ color: "#ffd23f" }));',
    "carrinho.castShadow = true;",
    "cena.add(carrinho);",
  ),
  from(
    11,
    "",
    "// A câmera vai no carrinho: filha dele, ela anda e vira junto",
    "carrinho.add(camera);",
    "camera.position.set(0, 1.2, 0.3);",
    "camera.rotation.y = Math.PI; // a câmera olha para o −z dela, e o carrinho anda para o +z dele",
  ),
  from(9, ""),
  by({
    9: "// O passeio: o carrinho anda pela curva, sempre com a mesma velocidade",
    10: "// O passeio: a velocidade vem da altura, como numa montanha-russa de verdade",
  }),
  from(9, "const comprimento = curva.getLength();"),
  by({
    9: "const velocidade = 8; // unidades por segundo",
    10: block("const gravidade = 9.8;", "const topo = Math.max(...curva.getSpacedPoints(500).map((p) => p.y));", "const velocidadeNoTopo = 2;", "let distancia = 0;"),
  }),
  from(9, ""),
  by({ 9: "function animar(tempo) {", 10: "function animar(tempo, delta) {" }),
  by({ 9: "  const u = ((tempo * velocidade) / comprimento) % 1;", 10: "  const u = (distancia / comprimento) % 1;" }),
  from(9, "  const ponto = curva.getPointAt(u);"),
  from(10, "  const velocidade = Math.sqrt(velocidadeNoTopo ** 2 + 2 * gravidade * (topo - ponto.y));", "  distancia += velocidade * delta;"),
  from(9, "  carrinho.position.copy(ponto);", "  carrinho.lookAt(ponto.clone().add(curva.getTangentAt(u)));", "}"),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: o trilho é medido pela curva da viga (os pontos dela, no mundo), as peças que saem
// de um laço pelas cópias, e o passeio pelo rastro do carrinho

/** O ponto para onde a câmera do alto olha: o meio do parque, a meia altura dos morros. */
const CENTER = [0, 4, 0];

/** Um ponto [x, y, z] escrito como nos textos: (8,50; 12,00; −5,00). */
const vec = (p) => `(${p.map((c) => fmt(c)).join("; ")})`;

/** O ângulo, em graus, entre duas direções com comprimento 1, sem ligar para o sentido. */
const angleBetween = (a, b) => deg(Math.acos(Math.min(1, Math.abs(dot(a, b)))));

/** Uma direção sem o y (vista de cima), com comprimento 1. */
function flat([x, , z]) {
  const n = Math.hypot(x, z) || 1;
  return [x / n, 0, z / n];
}

/** O raio de um tubo no mundo: o raio da geometria vezes a escala do objeto. */
const tubeRadius = (obj) => obj.geometry.parameters.radius * Math.hypot(obj.world[0][0], obj.world[1][0], obj.world[2][0]);

/** "a viga" → "da viga", "o trilho esquerdo" → "do trilho esquerdo". */
const ofName = (name) => name.replace(/^a /, "da ").replace(/^o /, "do ");

/** Confere que o objeto é um tubo fechado: TubeGeometry com closed e a curva voltando ao começo. */
function closedTube(name, obj) {
  const type = obj.geometry?.type ?? null;
  if (type !== "TubeGeometry") return check(false, `${name} é ${type ?? "um objeto sem geometria"}, e não uma TubeGeometry`);
  const curve = curveOf(obj);
  if (dist(curve[0], curve.at(-1)) > 0.01) return check(false, `a curva ${ofName(name)} não fecha: falta o true no fim da CatmullRomCurve3`);
  return check(obj.geometry.parameters.closed === true, `o tubo ${ofName(name)} não fecha: falta o true no fim da TubeGeometry`);
}

/** O comprimento acumulado até cada ponto da curva: a posição de cada ponto pelo caminho. */
function arcLengths(curve) {
  const out = [0];
  for (let i = 1; i < curve.length; i++) out.push(out[i - 1] + dist(curve[i - 1], curve[i]));
  return out;
}

/**
 * O maior vão, pelo caminho, entre peças espalhadas por uma curva fechada (dormentes, pilares),
 * contando o da última de volta à primeira; e onde ele fica. Com `flat`, cada peça vai para o ponto
 * do caminho visto de cima, como os pilares, que ficam no chão: o trilho nunca passa por cima de si.
 */
function biggestGap(curve, places, { flat = false } = {}) {
  const arcs = arcLengths(curve);
  const total = arcs.at(-1);
  const ground = ([x, y, z]) => (flat ? [x, 0, z] : [x, y, z]);
  const path = curve.map(ground);
  const at = places
    .map((p) => {
      const n = nearest(path, ground(p));
      return arcs[n.index] + n.t * (arcs[n.index + 1] - arcs[n.index]);
    })
    .sort((a, b) => a - b);
  let gap = at[0] + total - at.at(-1);
  let from = at.at(-1);
  for (let i = 1; i < at.length; i++) {
    if (at[i] - at[i - 1] > gap) {
      gap = at[i] - at[i - 1];
      from = at[i - 1];
    }
  }
  return { gap, from, total };
}

/** O ponto do caminho a uma distância s do começo dele (pelo comprimento). */
function pointAlong(curve, s) {
  const arcs = arcLengths(curve);
  const target = ((s % arcs.at(-1)) + arcs.at(-1)) % arcs.at(-1);
  const i = Math.max(0, arcs.findIndex((a) => a > target) - 1);
  const t = (target - arcs[i]) / (arcs[i + 1] - arcs[i] || 1);
  return [0, 1, 2].map((k) => curve[i][k] + (curve[i + 1][k] - curve[i][k]) * t);
}

/** Uma geometria só para todas as cópias de um objeto (as bolinhas, os dormentes, os pilares). */
function shared(name, objs) {
  const uuids = new Set(objs.map((o) => o.geometry?.uuid));
  return check(uuids.size === 1, `${uuids.size} ${name} diferentes: uma por volta do laço`);
}

/** A animação parada antes de o carrinho andar: ele ainda está onde nasceu, e não onde animar o põe. */
const STOPPED = "a animação está parada: aperte ▶ na barra de cima para o carrinho andar";

/**
 * O rastro do carrinho, ou o resultado da conferência enquanto não há rastro: esperando (a
 * animação parada ou começando) ou falhando (o carrinho não sai do lugar).
 */
function trailOf({ objects, hasAnimar, playing, recorded }) {
  const trail = objects.carrinho.trail;
  if (trail?.length >= 2) return { trail };
  if (!hasAnimar) return { result: check(false, "não achei a função animar(tempo)") };
  if (!playing) return { result: wait(STOPPED) };
  if (recorded < 1) return { result: wait("esperando o carrinho andar") };
  return { result: check(false, "o carrinho não sai do lugar") };
}

/**
 * Se animar já pôs o carrinho no trilho: a animação roda, ou ele andou antes de ela parar. Senão,
 * o resultado da conferência (null quando dá para conferir onde ele está).
 */
function unplaced({ objects, hasAnimar, playing }) {
  if (!hasAnimar) return check(false, "não achei a função animar(tempo)");
  if (!playing && !(objects.carrinho.trail?.length >= 2)) return wait(STOPPED);
  return null;
}

/** Confere que o carrinho anda pela curva da viga: o rastro inteiro em cima dela, e já andou um tanto. */
function rides(facts) {
  const { trail, result } = trailOf(facts);
  if (!trail) return result;
  const curve = curveOf(facts.objects.viga);
  const places = placesOf(trail);
  const off = places.reduce((worst, p) => Math.max(worst, nearest(curve, p).distance), 0);
  if (off > 0.2) return check(false, `o carrinho sai da curva: ele passa a ${fmt(off)} dela`);
  const walked = lengthOf(places);
  return walked >= 3 ? check(true) : wait(`o carrinho andou ${fmt(walked)} até agora`);
}

/**
 * As velocidades do carrinho em janelas de meio segundo e a reta de v² pela altura, a da conta da
 * energia (v² = v₀² + 2·g·(h₀ − y)). Num computador, cada quadro leva um tempo diferente, e um
 * código que anda depois de pôr o carrinho no lugar mede cada pedaço com o delta do quadro anterior:
 * das duas contas da velocidade (speedsOf, com e sem `lag`), vale a que fica mais perto da reta.
 */
function energyOf(trail) {
  return [false, true]
    .map((lag) => {
      const speeds = speedsOf(trail, { window: 0.5, lag });
      const fit = fitLine(
        speeds.map((s) => s.y),
        speeds.map((s) => s.v ** 2),
      );
      const misfit = speeds.reduce((sum, s) => sum + (s.v ** 2 - fit.a - fit.b * s.y) ** 2, 0) / (speeds.length || 1);
      return { speeds, fit, misfit };
    })
    .reduce((best, other) => (other.misfit < best.misfit ? other : best));
}

/** O mesmo carrinho visto por perto: o ponto da curva mais perto dele e a direção do caminho ali. */
function cartOnCurve(objects) {
  const curve = curveOf(objects.viga);
  return { curve, near: nearest(curve, objects.carrinho.worldPosition) };
}

// ---------------------------------------------------------------------------
// No seu computador: o projeto Vite com o código do fim do passo 11 em src/cena.js, sem os
// controles do mouse (a câmera vai no carrinho)

const END = codeAt(11);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: true, target: null, controls: false };

const COMPUTER = [
  computerStep({
    id: "montanha-russa",
    title: "Montanha-russa",
    end: END,
    options: OPTIONS,
    words: {
      yours: "a sua montanha-russa",
      browser: "o código da montanha-russa precisa dele no navegador",
      privates: "`curva`, `carrinho` e o resto",
      stretched: "o parque sai esticado ou achatado",
      jump: "o carrinho pularia para outro ponto do trilho",
      animarStep: 10,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor e chamava `animar` a cada quadro. Neste passo, a montanha-russa vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, e o que o VisuGraph fazia fica escrito no `src/main.js`. Desta vez sem os controles do mouse: a câmera vai no carrinho, e a página abre com você andando nele.",
    why: [
      {
        title: "Por que o projeto não tem os controles do mouse?",
        text: "Os OrbitControls, que os outros projetos levam, giram a câmera em volta de um centro: a cada quadro, eles põem a câmera no lugar deles e a viram para esse centro. Com a câmera presa ao carrinho, isso a tiraria do passeio. Para poder olhar de fora, um projeto teria duas câmeras, uma no carrinho e outra com os controles, e trocaria a do `render` com uma tecla.",
      },
    ],
    try: [
      "No `src/cena.js`, mude a `gravidade` para `20` e salve: a página recarrega sozinha, e o carrinho despenca mais rápido.",
      "Ponha o navegador em tela cheia (F11): o `redimensionar` ajusta o desenho e a proporção da câmera ao tamanho novo.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a página abre com a câmera no carrinho, andando pelo trilho",
      "O carrinho desce a queda acelerando e chega devagar ao alto da subida",
      "Mudar um número no `src/cena.js` e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const MONTANHA_RUSSA = {
  id: "montanha-russa",
  title: "Montanha-russa",
  level: "intermediario",
  summary: "Um trilho por uma curva suave, com dormentes e pilares, e um carrinho que despenca da subida com a velocidade que a altura dá. No fim, você anda nele.",
  concepts: [
    "Curvas de Catmull-Rom",
    "TubeGeometry",
    "Produto vetorial",
    "Orientação com lookAt",
    "Comprimento de arco",
    "Animação com delta",
    "Conservação de energia",
    "A câmera presa a um objeto",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Uma montanha-russa precisa de um parque: um céu, um chão de grama e luz. A cena guarda os objetos, a câmera diz de onde se olha, e o renderer, que o VisuGraph já cria, transforma tudo em pixels. A câmera fica alta, num canto do parque, de onde vai ver o trilho inteiro. Duas luzes iluminam o parque, a do céu e a do sol, e uma neblina da cor do céu apaga a borda do chão, lá no horizonte.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "A cena: a raiz de uma árvore de objetos. Só o que for adicionado a ela com `cena.add` é desenhado.",
        },
        {
          code: 'cena.background = new THREE.Color("#9fd8ff");',
          text: "O céu: um azul-claro de dia de sol, pintado atrás de tudo a cada quadro.",
        },
        {
          code: 'cena.fog = new THREE.Fog("#9fd8ff", 50, 150);',
          text: "A neblina, da mesma cor do céu. Até 50 unidades da câmera, não há neblina; de 50 a 150, cada ponto vai ficando da cor dela, e depois de 150 some de vez. O chão vai até 200 do centro, e a borda dele desaparece no céu, em vez de aparecer como uma linha reta.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);",
          text: "Uma câmera com perspectiva: o campo de visão vertical (60°), a proporção (o visor troca o 16/9 pela dele) e as distâncias perto (0,1) e longe (300), entre as quais as coisas são desenhadas. Os 300 alcançam a borda do chão, que a neblina já cobriu.",
        },
        {
          code: "camera.position.set(34, 18, 26);",
          text: "Alta e num canto do parque. O trilho vai ocupar uns 20 por 30 no meio, e daqui a câmera vê tudo, até num visor estreito.",
        },
        {
          code: "camera.lookAt(0, 4, 0);",
          text: "Gira a câmera para olhar um ponto 4 acima do centro, na meia altura dos morros do trilho.",
        },
        {
          code: 'const ceu = new THREE.HemisphereLight("#d8f0ff", "#5a7a3a", 1.2);',
          text: "A luz do céu vem de todas as direções: azulada de cima e esverdeada de baixo, como a luz que a grama rebate. Ela clareia o lado que o sol não pega.",
        },
        {
          code: 'const sol = new THREE.DirectionalLight("#fff2d6", 2.2);',
          text: "O sol: uma luz direcional, de raios paralelos, todos na mesma direção, como os de um sol tão longe que parece estar em todo lugar. Ela é levemente amarelada e mais forte que a do céu.",
        },
        {
          code: "sol.position.set(15, 30, 20);",
          text: "Numa luz direcional, a posição só diz de onde vêm os raios: deste ponto para o alvo da luz, que fica na origem. É um sol alto, 50° acima do horizonte.",
        },
        {
          code: "new THREE.PlaneGeometry(400, 400),",
          text: "Uma placa de 400 por 400: o chão vai além do que a câmera vê, até onde a neblina o apaga.",
        },
        {
          code: 'new THREE.MeshStandardMaterial({ color: "#7cbf5a" })',
          text: "Um verde de grama. O `MeshStandardMaterial` calcula a luz que chega a cada ponto: sem luz nenhuma, ele seria preto.",
        },
        {
          code: "chao.rotation.x = -Math.PI / 2;",
          text: "A `PlaneGeometry` nasce em pé, de frente para o +z. Girar −90° (−π/2) em torno do x deita a placa, com a frente para cima.",
        },
      ],
      why: [
        {
          title: "Por que neblina num dia de sol?",
          text: "Sem ela, o chão terminaria numa linha reta contra o céu, e o parque pareceria uma maquete em cima de uma mesa. Com a neblina da cor do céu, o chão some aos poucos, como a paisagem fica clara ao longe num dia de sol. Ela só começa a 50 da câmera, depois do fundo do trilho, então a montanha-russa fica nítida.",
        },
        {
          title: "Por que duas luzes?",
          text: "Só com o sol, o lado de cada peça que não pega os raios ficaria preto, porque nenhuma luz chegaria lá. A luz do céu vem de todo lado e clareia esse lado, como o céu de verdade faz. Só com ela, tudo ficaria iluminado por igual, sem um lado claro e outro escuro, e o trilho perderia o volume.",
        },
      ],
      try: [
        "Mude o `150` da neblina para `400`: a borda do chão aparece, uma linha reta contra o céu. Depois volte para 150.",
        'Troque a cor do chão por `"#e0c98f"`, de areia: o mesmo parque, num deserto.',
        "Mude a intensidade do sol, o `2.2`, para `0`: sobra só a luz do céu, e o chão fica mais escuro, por igual. Depois volte para 2.2.",
      ],
      needs: ["chao", "sol"],
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
          text: "A neblina tem a cor do céu e apaga a borda do chão",
          test: ({ fog, background, camera }) => {
            if (!fog) return check(false, "a cena não tem neblina: falta cena.fog");
            if (fog.color !== background) return check(false, `a neblina é ${fog.color}, e o céu é ${background}`);
            if (!camera) return check(false, "não achei a câmera do código");
            if (fogAt(fog, depthOf(camera, CENTER)) > 0.05) return check(false, `a neblina já cobre ${pct(fogAt(fog, depthOf(camera, CENTER)))} do meio do parque`);
            // a borda do chão (a 200 do centro) para onde a câmera olha, vista de cima
            const ahead = flat(camera.direction);
            const edge = [ahead[0] * 200, 0, ahead[2] * 200];
            const covered = fogAt(fog, depthOf(camera, edge));
            return check(covered >= 0.95, `a neblina cobre só ${pct(covered)} da borda do chão: ela aparece contra o céu`);
          },
        },
        {
          text: "O chão é uma placa de grama grande e deitada",
          test: ({ objects }) => {
            const chao = objects.chao;
            if (chao.geometry?.type !== "PlaneGeometry") return check(false, `o chão é ${chao.geometry?.type ?? "um objeto sem geometria"}, e não uma PlaneGeometry`);
            const up = axisOf(chao, 2)[1];
            if (up < -0.99) return check(false, "o chão está virado para baixo: de cima, a câmera vê o verso, que não é desenhado");
            if (up < 0.99) return check(false, `o chão está inclinado ${fmt(deg(Math.acos(Math.max(-1, Math.min(1, up)))), 0)}°: ele precisa ficar deitado`);
            const size = Math.min(chao.box.max[0] - chao.box.min[0], chao.box.max[2] - chao.box.min[2]);
            if (size < 300) return check(false, `o chão tem ${fmt(size, 0)} de lado: a borda dele aparece perto do trilho`);
            return check(Math.abs(chao.worldPosition[1]) < 0.01, `o chão está na altura ${fmt(chao.worldPosition[1])}, e não no y = 0`);
          },
        },
        {
          text: "A câmera vê o parque do alto, de um canto",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const p = camera.worldPosition;
            const d = dist(p, CENTER);
            if (d < 25) return check(false, `a câmera está a ${fmt(d)} do meio do parque: perto demais para ver o trilho inteiro`);
            if (d > 80) return check(false, `a câmera está a ${fmt(d)} do meio do parque: o trilho ficaria pequeno`);
            if (p[1] < 8) return check(false, `a câmera está na altura ${fmt(p[1])}: baixa demais para ver o trilho de cima`);
            const off = deg(Math.acos(Math.min(1, dot(camera.direction, toward(p, CENTER)))));
            return check(off < 5, `a câmera olha ${fmt(off, 0)}° para fora do meio do parque`);
          },
        },
        {
          text: "O parque tem a luz do céu e um sol alto",
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
      id: "pontos",
      title: "Os pontos do traçado",
      view: "camera",
      goal:
        "Uma montanha-russa começa no papel: alguns pontos por onde o trilho tem que passar, o alto da subida, o fundo da queda, os morros, as curvas. Aqui eles ficam numa lista de vetores, na ordem em que o carrinho vai andar, e uma bolinha amarela marca cada um, para você ver o desenho do trilho antes de existir trilho.",
      lines: [
        {
          code: "const pontos = [",
          text: "Uma lista (um array), entre colchetes. A ordem importa: a curva do próximo passo vai ligar cada ponto ao seguinte, e o carrinho vai andar nessa ordem.",
        },
        {
          code: "new THREE.Vector3(8.5, 12, -5), // o alto da subida: o carrinho parte daqui",
          text: "Um `THREE.Vector3` guarda três números, x, y e z: aqui, um ponto 12 acima do chão, o mais alto do trilho. O que vem depois de `//` é um comentário, só para quem lê: o JavaScript ignora.",
        },
        {
          code: "new THREE.Vector3(3, 1.5, -14.5), // o fundo da queda",
          text: "O fundo da queda, a 1,5 do chão: do alto até aqui, o carrinho desce 10,5. Nenhum ponto fica rente ao chão, para sobrar lugar para o carrinho passar por cima da viga.",
        },
        {
          code: "new THREE.Vector3(9, 7.5, 0),",
          text: "O último ponto fica no meio da subida. Depois dele a lista acaba, e a curva vai voltar ao primeiro, fechando o circuito.",
        },
        {
          code: "const geometriaMarca = new THREE.SphereGeometry(0.4, 16, 8);",
          text: "Uma esfera de raio 0,4 para todas as bolinhas. Ela fica fora do laço: é uma geometria só, dividida pelas 13 bolinhas.",
        },
        {
          code: "for (const ponto of pontos) {",
          text: "O `for...of` passa por cada item da lista, um de cada vez, com o nome `ponto`. O corpo do laço roda 13 vezes, uma por ponto.",
        },
        {
          code: "marca.position.copy(ponto);",
          text: "Copia o x, o y e o z do ponto para a posição da bolinha. São só os números: mudar um depois não muda o outro.",
        },
      ],
      why: [
        {
          title: "Por que marcar os pontos?",
          text: "Os pontos são só números até aparecerem na cena. Com as bolinhas, dá para ver se o circuito faz sentido antes de construir: se um morro ficou alto demais, se uma curva ficou apertada. Elas são um andaime: quando o trilho estiver no lugar, saem.",
        },
        {
          title: "Por que tão poucos pontos?",
          text: "A curva do próximo passo passa por todos eles e preenche sozinha o caminho entre um e outro, de um jeito suave. Treze pontos bastam para uma volta inteira, com subida, queda, morros e curvas. Com muito mais pontos, cada um teria que ser posto no lugar à mão, e qualquer descuido viraria uma ondulação no trilho.",
        },
      ],
      try: [
        "Mude o y do primeiro ponto de `12` para `16`: a bolinha mais alta sobe. Depois volte para 12.",
        "Mude o x do ponto `(-9, 6, 3)`, o outro morro, para `-15`: a bolinha se afasta do parque, para o fundo e para a esquerda. No próximo passo, a curva vai se esticar para passar por ela. Depois volte para −9.",
      ],
      needs: ["marca"],
      checks: [
        {
          text: "Há uma bolinha em cada ponto, pelo menos 8",
          test: ({ objects }) => {
            const n = all(objects.marca).length;
            return check(n >= 8, `há ${n} ${n === 1 ? "bolinha" : "bolinhas"}: poucos pontos para uma volta com subida, queda e morros`);
          },
        },
        {
          text: "Os pontos ficam acima do chão, a mais de 1 dele",
          test: ({ objects }) => {
            const low = all(objects.marca).reduce((m, o) => (o.worldPosition[1] < m.worldPosition[1] ? o : m));
            return check(low.worldPosition[1] >= 1, `o ponto ${vec(low.worldPosition)} fica a menos de 1 do chão: não sobra lugar para o carrinho`);
          },
        },
        {
          text: "Os pontos se espalham pelo parque, com morros e vales",
          test: ({ objects }) => {
            const places = all(objects.marca).map((o) => o.worldPosition);
            const [x, y, z] = [0, 1, 2].map((k) => extent(places, k).size);
            if (Math.min(x, z) < 10) return check(false, `os pontos ocupam só ${fmt(x, 1)} por ${fmt(z, 1)}: o trilho ficaria apertado`);
            return check(y >= 5, `do mais baixo ao mais alto, os pontos variam só ${fmt(y, 1)}: sem morros, o carrinho não teria por que acelerar`);
          },
        },
        {
          text: "As bolinhas dividem uma geometria",
          test: ({ objects }) => shared("geometrias", all(objects.marca)),
        },
      ],
    },
    {
      id: "curva",
      title: "A curva",
      view: "camera",
      goal:
        "Agora a curva: uma linha suave que passa por todos os pontos, na ordem, e volta ao primeiro. O three.js faz a conta com a `CatmullRomCurve3`: entre cada dois pontos, ela calcula um pedaço de curva que já chega ao ponto seguinte na direção certa, sem quina. A curva em si é só matemática e não aparece na cena. Para vê-la, você pede pontos dela e liga esses pontos com uma linha.",
      lines: [
        {
          code: "const curva = new THREE.CatmullRomCurve3(pontos, true);",
          text: "A curva pelos pontos. O `true` a fecha: depois do último ponto, ela volta ao primeiro, como um circuito. A `curva` não é um objeto da cena: ela é uma função que diz onde fica cada ponto do caminho.",
        },
        {
          code: "const pontosDaCurva = curva.getPoints(300);",
          text: "Pede 301 pontos da curva, o primeiro e mais 300, do começo ao fim dela. Numa curva fechada, o último é igual ao primeiro, e a linha fecha a volta.",
        },
        {
          code: "const geometriaLinha = new THREE.BufferGeometry().setFromPoints(pontosDaCurva);",
          text: "Uma geometria vazia que recebe os pontos como vértices: o `setFromPoints` escreve o x, o y e o z de cada um na lista de posições dela.",
        },
        {
          code: 'const linha = new THREE.Line(geometriaLinha, new THREE.LineBasicMaterial({ color: "#ffffff" }));',
          text: "A `THREE.Line` liga cada vértice ao seguinte com um traço reto. Com 300 traços curtos, a linha parece curva. O `LineBasicMaterial` pinta a linha de uma cor só, sem luz.",
        },
      ],
      why: [
        {
          title: "Por que Catmull-Rom?",
          text: "Há muitas curvas suaves. A de Bézier, a mais famosa, passa só pelas duas pontas: os pontos do meio puxam a curva, mas ela não passa por eles. A de Catmull-Rom passa por todos, o que é o certo para um trilho: você diz por onde o carrinho tem que passar, e a curva liga os pontos. Em cada ponto, ela segue a direção que vai do ponto anterior para o seguinte, e por isso não faz quina.",
        },
        {
          title: "Por que 300 pontos na linha?",
          text: "A linha é feita de traços retos, então ela só parece curva com traços curtos. Com os 13 pontos de controle, seria a linha quebrada que liga as bolinhas; com 300, cada traço tem uns 0,3 de comprimento (o trilho tem 97), e as quinas entre eles não se veem. Com muito mais que isso, a placa de vídeo desenharia pontos que ninguém nota.",
        },
        {
          title: "E as curvas que dão laço?",
          text: "A `CatmullRomCurve3` tem três jeitos de fazer a conta, pelo `curveType`: o padrão, `\"centripetal\"`, leva em conta a distância entre os pontos e nunca faz laços nem pontas, mesmo com dois pontos muito perto um do outro. O jeito original, `\"catmullrom\"`, pode dar uma volta a mais entre pontos de distâncias muito diferentes, e um trilho com um nó no meio não serve para ninguém.",
        },
      ],
      try: [
        "Mude o `true` para `false`: a curva para no último ponto, no meio da subida, sem fechar a volta. Depois volte para true.",
        "Mude o `300` para `13`: a linha liga só as bolinhas, com traços retos e uma quina em cada uma. É a curva que faz o caminho suave. Depois volte para 300.",
        "Mude o x do ponto `(-9, 6, 3)` para `-15`: o morro se afasta, e a curva se estica para passar por ele, sem quina. Depois volte para −9.",
      ],
      needs: ["linha", "marca"],
      checks: [
        {
          text: "A linha passa por todos os pontos",
          test: ({ objects }) => {
            const line = (objects.linha.geometry?.sample ?? []).map((p) => toWorld(objects.linha, p));
            if (line.length < 2) return check(false, "a linha não tem pontos");
            for (const marca of all(objects.marca)) {
              const d = nearest(line, marca.worldPosition).distance;
              if (d > 0.05) return check(false, `a linha passa a ${fmt(d)} da bolinha em ${vec(marca.worldPosition)}`);
            }
            return check(true);
          },
        },
        {
          text: "A linha é suave, sem quinas",
          test: ({ objects }) => {
            const line = (objects.linha.geometry?.sample ?? []).map((p) => toWorld(objects.linha, p));
            let worst = { angle: 0, at: null };
            for (let i = 1; i + 1 < line.length; i++) {
              const a = toward(line[i - 1], line[i]);
              const b = toward(line[i], line[i + 1]);
              const angle = deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))));
              if (angle > worst.angle) worst = { angle, at: line[i] };
            }
            // com 300 traços, a curva mais fechada do trilho vira 11° de um traço para o seguinte
            return check(worst.angle < 20, `a linha faz uma quina de ${fmt(worst.angle, 0)}° em ${vec(worst.at ?? [0, 0, 0])}`);
          },
        },
        {
          text: "A linha fecha a volta",
          test: ({ objects }) => {
            const line = (objects.linha.geometry?.sample ?? []).map((p) => toWorld(objects.linha, p));
            if (line.length < 2) return check(false, "a linha não tem pontos");
            const gap = dist(line[0], line.at(-1));
            return check(gap < 0.01, `a linha começa em ${vec(line[0])} e termina em ${vec(line.at(-1))}: falta o true que fecha a curva`);
          },
        },
      ],
    },
    {
      id: "viga",
      title: "A viga",
      view: "camera",
      goal:
        "Hora de dar corpo à curva: um tubo vermelho em volta dela, a viga que vai segurar os trilhos. A `TubeGeometry` faz isso sozinha. Ela anda pela curva e, a cada pedacinho, põe um anel de vértices em volta dela; os anéis ligados formam o tubo. A linha e as bolinhas eram andaimes, para ver a curva antes do trilho: com o tubo no lugar, elas saem.",
      lines: [
        {
          code: 'const materialViga = new THREE.MeshStandardMaterial({ color: "#e63946" });',
          text: "Um vermelho de montanha-russa, num material com nome: os dormentes do passo 6 vão usar o mesmo.",
        },
        {
          code: "new THREE.TubeGeometry(curva, 800, 0.2, 12, true)",
          text: "O tubo em volta da `curva`, com 800 pedaços ao longo dela, raio 0,2 e 12 lados em cada anel. O `true` o fecha: o último anel se liga ao primeiro, como a curva.",
        },
      ],
      why: [
        {
          title: "Por que 800 pedaços e 12 lados?",
          text: "O tubo é feito de anéis ligados por retângulos, então ele só parece liso com pedaços curtos. São 97 de trilho: com 800 pedaços, cada um tem 0,12, e nem as curvas mais fechadas mostram as emendas. Em volta, 12 lados já parecem redondos num tubo fino visto de longe. São 801 anéis de 13 vértices, 10.413 vértices no total (o primeiro vértice de cada anel se repete no fim); dobrar os dois números daria quatro vezes isso, sem diferença que se veja.",
        },
        {
          title: "Como o tubo sabe para que lado vai cada anel?",
          text: "Em cada ponto, a `TubeGeometry` pede à curva a direção do caminho, a tangente, e monta o anel no plano perpendicular a ela. Para os anéis não girarem à toa de um ponto para o seguinte, a curva calcula, com as `computeFrenetFrames`, duas direções perpendiculares ao caminho que giram o mínimo possível ao longo dele. Saber para que lado é o lado vai ser o problema dos trilhos, no próximo passo.",
        },
      ],
      try: [
        "Clique em `viga` na lista de objetos: o painel Propriedades tem o raio e os segmentos do tubo. Arraste o raio até `1`, e a viga vira um tubo gordo, de brinquedo. Depois volte para 0.2.",
        "Mude o `800` para `40`: o tubo vira uma fileira de canos retos, com quinas nas curvas. Depois volte para 800.",
        "Mude o `12` para `3`: cada anel vira um triângulo, e a viga fica com três faces planas. Depois volte para 12.",
      ],
      needs: ["viga"],
      checks: [
        {
          text: "A viga é um tubo pela curva, e fecha a volta",
          test: ({ objects }) => closedTube("a viga", objects.viga),
        },
        {
          text: "O tubo é fino: o raio fica entre 0,1 e 0,4",
          test: ({ objects }) => {
            if (objects.viga.geometry?.type !== "TubeGeometry") return check(false, "a viga não é um tubo");
            const r = tubeRadius(objects.viga);
            return check(r >= 0.1 && r <= 0.4, `o raio é ${fmt(r)}: ${r < 0.1 ? "fino demais para segurar os trilhos" : "grosso demais para a viga de uma montanha-russa"}`);
          },
        },
        {
          text: "O tubo é liso, sem quinas nem faces planas",
          test: ({ objects }) => {
            if (objects.viga.geometry?.type !== "TubeGeometry") return check(false, "a viga não é um tubo");
            const { tubularSegments, radialSegments } = objects.viga.geometry.parameters;
            const length = lengthOf(curveOf(objects.viga));
            const piece = length / tubularSegments;
            if (piece > 0.25) return check(false, `com ${tubularSegments} pedaços para ${fmt(length, 0)} de trilho, cada um tem ${fmt(piece)}: as curvas ficam com quinas`);
            return check(radialSegments >= 8, `com ${radialSegments} lados, a viga fica com faces planas`);
          },
        },
      ],
    },
    {
      id: "trilhos",
      title: "Os trilhos",
      view: "camera",
      goal:
        'O carrinho não anda na viga: anda em dois trilhos, um de cada lado dela. Cada trilho é outro tubo, por uma curva paralela à do meio, a 0,55 dela. O problema é saber para que lado é o lado, já que o caminho vira o tempo todo. A resposta é o produto vetorial: ele recebe duas direções e dá uma terceira, perpendicular às duas. A direção do caminho com o "para cima" dá o lado.',
      lines: [
        {
          code: "const cima = new THREE.Vector3(0, 1, 0);",
          text: 'O "para cima" do mundo: o eixo y.',
        },
        {
          code: "const esquerda = [];",
          text: "A lista, ainda vazia, dos pontos do trilho esquerdo. A de baixo é a do direito.",
        },
        {
          code: "for (let i = 0; i < 300; i++) {",
          text: "300 pontos por trilho, um a cada 0,3 do caminho. O `<` para no 299: numa curva fechada, o ponto 300 seria o ponto 0 de novo, e dois pontos iguais em seguida dariam uma divisão por zero na conta da curva do trilho.",
        },
        {
          code: "const u = i / 300;",
          text: "A fração do caminho: de 0, o começo, até quase 1, a volta inteira.",
        },
        {
          code: "const ponto = curva.getPointAt(u);",
          after: "const u = i / 300;",
          text: 'O ponto da curva a essa fração do comprimento: com `u = 0.5`, o ponto na metade do caminho. O "At" conta pelo comprimento, então os 300 pontos ficam igualmente espaçados, mesmo onde os pontos de controle estão longe uns dos outros.',
        },
        {
          code: "const frente = curva.getTangentAt(u);",
          text: "A tangente: a direção em que a curva segue naquele ponto, com comprimento 1. É para onde o carrinho vai estar indo quando passar por ali.",
        },
        {
          code: "const lado = new THREE.Vector3().crossVectors(frente, cima).normalize().multiplyScalar(0.55);",
          text: "O produto vetorial da frente com o para cima dá uma direção perpendicular às duas: a direita de quem vai pela curva. O `normalize` deixa o comprimento em 1 (na subida, a frente e o para cima não são perpendiculares, e o produto sai mais curto), e o `multiplyScalar(0.55)` o leva a 0,55, a distância de cada trilho até o meio.",
        },
        {
          code: "esquerda.push(ponto.clone().sub(lado));",
          text: "O ponto do trilho esquerdo: o ponto da curva menos o lado. O `clone` faz uma cópia antes, porque o `sub` muda o próprio vetor, e sem a cópia o ponto da curva mudaria junto. O `push` põe o ponto no fim da lista.",
        },
        {
          code: "direita.push(ponto.clone().add(lado));",
          text: "O do trilho direito: o ponto da curva mais o lado.",
        },
        {
          code: 'const materialTrilho = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.5, roughness: 0.3 });',
          text: "Um cinza-claro de aço, metálico pela metade e quase liso: o brilho do sol corre pelo trilho.",
        },
        {
          code: "const curvaEsquerda = new THREE.CatmullRomCurve3(esquerda, true);",
          text: "Uma curva pelos 300 pontos do trilho esquerdo, fechada como a do meio. A de baixo é a do direito.",
        },
        {
          code: "new THREE.TubeGeometry(curvaEsquerda, 800, 0.07, 8, true)",
          text: "O trilho: um tubo fino, de raio 0,07, com 8 lados, que de longe já parecem redondos.",
        },
      ],
      why: [
        {
          title: "O que é o produto vetorial?",
          text: "Para duas direções a e b, o produto vetorial a × b é uma direção perpendicular às duas, com o comprimento igual à área do paralelogramo que elas formam. A ordem importa: b × a aponta para o lado contrário. Com a frente e o para cima, nessa ordem, ele aponta para a direita de quem anda. É a mesma conta que acha a normal de um triângulo, a direção para onde a face dele aponta, e que diz se a face está de frente para a câmera.",
        },
        {
          title: "Por que não usar as direções da TubeGeometry?",
          text: "As direções com que a `TubeGeometry` monta os anéis não sabem onde fica o chão: elas só giram o mínimo possível ao longo do caminho. Nos morros e nas curvas, o lado delas sai inclinado, e um trilho ficaria mais alto que o outro. Com o para cima do mundo, os dois trilhos ficam sempre na mesma altura. A conta só falha num trecho vertical, em que a frente e o para cima são a mesma direção e o produto vetorial dá zero: é por isso que este trilho não tem loops.",
        },
      ],
      try: [
        "Mude o `0.55` para `1.5`: os trilhos se afastam da viga, e a montanha-russa fica larga como uma estrada. A conferência avisa. Depois volte para 0.55.",
        "Apague o `.normalize()`: na queda e na subida, os trilhos chegam mais perto da viga, porque ali a frente e o para cima ficam mais perto um do outro, e o produto vetorial sai mais curto. A conferência avisa. Depois ponha de volta.",
      ],
      needs: ["viga", "trilhoEsquerdo", "trilhoDireito"],
      checks: [
        {
          text: "Há um trilho de cada lado da viga, a uns 0,55 dela",
          test: ({ objects }) => {
            for (const [name, obj] of [["o trilho esquerdo", objects.trilhoEsquerdo], ["o trilho direito", objects.trilhoDireito]]) {
              if (obj.geometry?.type !== "TubeGeometry") return check(false, `${name} não é um tubo`);
            }
            const middle = curveOf(objects.viga);
            const left = curveOf(objects.trilhoEsquerdo);
            const right = curveOf(objects.trilhoDireito);
            for (let i = 0; i < middle.length; i += 8) {
              const p = middle[i];
              const l = nearest(left, p).point;
              const r = nearest(right, p).point;
              const dl = dist(p, l);
              const dr = dist(p, r);
              const close = Math.min(dl, dr);
              if (close < 0.4) return check(false, `em ${vec(p)}, ${dl < dr ? "o trilho esquerdo" : "o trilho direito"} passa a ${fmt(close)} da viga`);
              const far = Math.max(dl, dr);
              if (far > 1) return check(false, `em ${vec(p)}, ${dl > dr ? "o trilho esquerdo" : "o trilho direito"} passa a ${fmt(far)} da viga, longe demais`);
              if (dot(toward(p, l), toward(p, r)) > -0.9) return check(false, `em ${vec(p)}, os dois trilhos ficam do mesmo lado da viga`);
            }
            return check(true);
          },
        },
        {
          text: "Os trilhos ficam lado a lado, na mesma altura",
          test: ({ objects }) => {
            const middle = curveOf(objects.viga);
            const left = curveOf(objects.trilhoEsquerdo);
            const right = curveOf(objects.trilhoDireito);
            let worst = { dy: 0, at: null };
            for (let i = 0; i < middle.length; i += 8) {
              const dy = Math.abs(nearest(left, middle[i]).point[1] - nearest(right, middle[i]).point[1]);
              if (dy > worst.dy) worst = { dy, at: middle[i] };
            }
            return check(worst.dy < 0.1, `em ${vec(worst.at ?? [0, 0, 0])}, um trilho fica ${fmt(worst.dy)} mais alto que o outro`);
          },
        },
        {
          text: "Os trilhos são tubos fechados, mais finos que a viga",
          test: ({ objects }) => {
            for (const [name, obj] of [["o trilho esquerdo", objects.trilhoEsquerdo], ["o trilho direito", objects.trilhoDireito]]) {
              const closed = closedTube(name, obj);
              if (!closed.ok) return closed;
              if (tubeRadius(obj) >= tubeRadius(objects.viga)) return check(false, `${name} tem raio ${fmt(tubeRadius(obj))}, e a viga, ${fmt(tubeRadius(objects.viga))}`);
            }
            return check(true);
          },
        },
      ],
    },
    {
      id: "dormentes",
      title: "Os dormentes",
      view: "camera",
      goal:
        "Os trilhos precisam de travessas que os prendam à viga: os dormentes. São 160 caixas finas, uma a cada 0,6 do caminho, cada uma atravessada no trilho. Pôr uma caixa no lugar é fácil, com o `getPointAt`; o difícil é girá-la para ficar de través, seguindo as curvas. Quem faz isso é o `lookAt`: ele vira o objeto para olhar um ponto, e o ponto fica logo à frente, na direção do caminho.",
      lines: [
        {
          code: "const geometriaDormente = new THREE.BoxGeometry(1.3, 0.1, 0.2);",
          text: "Uma caixa de 1,3 de largura (os trilhos estão a 0,55 do meio, com 0,07 de raio, e sobra um pouco de cada lado), 0,1 de altura e 0,2 de profundidade. A profundidade, no z da caixa, vai ao longo do trilho.",
        },
        {
          code: "for (let i = 0; i < 160; i++) {",
          text: "160 dormentes: 97 de trilho divididos por 160 dá um a cada 0,6.",
        },
        {
          code: "const dormente = new THREE.Mesh(geometriaDormente, materialViga);",
          text: "Todos com a mesma geometria e o mesmo material vermelho da viga: são 160 malhas, mas só uma geometria e um material na memória.",
        },
        {
          code: "dormente.position.copy(ponto);",
          text: "O centro do dormente vai para o ponto da curva, no meio da viga.",
        },
        {
          code: "dormente.lookAt(ponto.clone().add(curva.getTangentAt(u)));",
          text: "Vira o dormente para olhar um ponto à frente dele, na direção da curva. O `lookAt` aponta o eixo z do objeto para o ponto e mantém o y dele o mais perto possível do para cima: a profundidade da caixa (o z) fica ao longo do caminho, e a largura (o x), deitada, de um trilho ao outro.",
        },
      ],
      why: [
        {
          title: "Por que o lookAt, e não a rotação em x, y e z?",
          text: "Para girar a caixa com `rotation`, seria preciso calcular três ângulos a partir da direção do caminho, com arcotangentes, e aplicar na ordem certa. O `lookAt` faz essa conta: você diz para onde o objeto olha, e ele acha a rotação. Ele aponta o +z do objeto para o ponto, o que vale para malhas e luzes; numa câmera, é o −z que aponta, porque a câmera olha para o −z dela.",
        },
        {
          title: "160 malhas não pesam?",
          text: "Cada malha é uma chamada de desenho para a placa de vídeo, e 160 ainda é pouco: dá para passar de mil sem a página engasgar. A geometria e o material ficam na memória uma vez só, divididos pelas malhas. Para dezenas de milhares de cópias, o three.js tem a `InstancedMesh`, que desenha todas numa chamada só: é o assunto do projeto da floresta.",
        },
      ],
      try: [
        "Mude o `160` (as duas vezes) para `40`: os dormentes ficam espaçados, a cada 2,4. A conferência avisa. Depois volte para 160.",
        "Apague a linha do `lookAt`: todos os dormentes ficam virados para o mesmo lado, como saem da caixa. Nas laterais do trilho eles ainda o atravessam, mas nas curvas das pontas ficam ao longo dele. Depois ponha a linha de volta.",
      ],
      needs: ["dormente", "viga", "trilhoEsquerdo", "trilhoDireito"],
      checks: [
        {
          text: "Há dormentes pelo caminho todo, a menos de 1 um do outro",
          test: ({ objects }) => {
            const sleepers = all(objects.dormente);
            if (sleepers.length < 80) return check(false, `há ${sleepers.length} dormentes: poucos para ${fmt(lengthOf(curveOf(objects.viga)), 0)} de trilho`);
            const curve = curveOf(objects.viga);
            const { gap, from } = biggestGap(curve, sleepers.map((d) => d.worldPosition));
            return check(gap <= 1, `há um vão de ${fmt(gap)} sem dormente, a partir de ${vec(pointAlong(curve, from))}`);
          },
        },
        {
          text: "Cada dormente fica na viga, atravessado no trilho",
          test: ({ objects }) => {
            const curve = curveOf(objects.viga);
            for (const d of all(objects.dormente)) {
              const near = nearest(curve, d.worldPosition);
              if (near.distance > 0.15) return check(false, `o dormente em ${vec(d.worldPosition)} fica a ${fmt(near.distance)} da viga`);
              const angle = angleBetween(axisOf(d, 2), near.direction);
              if (angle > 15) return check(false, `o dormente em ${vec(d.worldPosition)} fica ${fmt(angle, 0)}° fora da direção do caminho: ele não atravessa o trilho`);
            }
            return check(true);
          },
        },
        {
          text: "Os dormentes ficam deitados, sem tombar para um lado",
          test: ({ objects }) => {
            for (const d of all(objects.dormente)) {
              const tilt = deg(Math.asin(Math.min(1, Math.abs(axisOf(d, 0)[1]))));
              if (tilt > 3) return check(false, `o dormente em ${vec(d.worldPosition)} tomba ${fmt(tilt, 0)}° para um lado`);
            }
            return check(true);
          },
        },
        {
          text: "Os dormentes alcançam os dois trilhos e dividem uma geometria",
          test: ({ objects }) => {
            const sleepers = all(objects.dormente);
            const middle = curveOf(objects.viga);
            const gauge = dist(nearest(curveOf(objects.trilhoEsquerdo), middle[0]).point, nearest(curveOf(objects.trilhoDireito), middle[0]).point);
            const reach = gauge + tubeRadius(objects.trilhoEsquerdo) + tubeRadius(objects.trilhoDireito);
            for (const d of sleepers) {
              const width = (d.geometry?.parameters?.width ?? 0) * Math.hypot(d.world[0][0], d.world[1][0], d.world[2][0]);
              if (width < reach) return check(false, `o dormente tem ${fmt(width)} de largura, e de fora a fora os trilhos ocupam ${fmt(reach)}`);
            }
            return shared("geometrias", sleepers);
          },
        },
      ],
    },
    {
      id: "pilares",
      title: "Os pilares",
      view: "camera",
      goal:
        "Um trilho no ar precisa de apoio: pilares brancos, do chão até a viga, espalhados pelo caminho. Cada pilar é um cilindro de altura 1, esticado pela escala até a altura da curva naquele ponto. Para esticar só para cima, a base do cilindro tem que estar no chão, no y = 0, e a geometria é empurrada meia altura para cima antes.",
      lines: [
        {
          code: "const geometriaPilar = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);",
          text: "Um cilindro com raio 0,15 em cima e embaixo, altura 1 e 8 lados. A altura 1 é de propósito: assim a escala em y vira a altura do pilar.",
        },
        {
          code: "geometriaPilar.translate(0, 0.5, 0);",
          text: "A `CylinderGeometry` nasce com o centro na origem, metade para baixo. O `translate` empurra todos os vértices 0,5 para cima, uma vez só: a base vai para o y = 0, e a escala, que estica a partir da origem, passa a esticar só para cima.",
        },
        {
          code: "for (let i = 0; i < 30; i++) {",
          text: "30 pilares, um a cada 3,2 do caminho.",
        },
        {
          code: "const ponto = curva.getPointAt(i / 30);",
          text: "O ponto da curva onde vai cada pilar, com o mesmo `getPointAt` dos trilhos e dos dormentes.",
        },
        {
          code: "pilar.position.set(ponto.x, 0, ponto.z);",
          text: "O pilar fica embaixo do ponto: o mesmo x e o mesmo z, mas no chão, com y = 0.",
        },
        {
          code: "pilar.scale.y = ponto.y;",
          text: "E fica com a altura do ponto: com a base no chão, a escala estica o pilar de 0 até o y da curva, o meio da viga.",
        },
      ],
      why: [
        {
          title: "Por que esticar pela escala, e não criar um cilindro de cada altura?",
          text: "Cada `new THREE.CylinderGeometry` com outra altura seria outra geometria na memória da placa de vídeo, com os vértices dela. Com um cilindro de altura 1 e a escala, os 30 pilares dividem uma geometria, e a altura de cada um é só um número na matriz dele. A escala estica os vértices a partir da origem do objeto, e por isso a base tem que estar na origem.",
        },
        {
          title: "E se um pilar atravessar o trilho?",
          text: "Este trilho nunca passa por cima de si mesmo, então nenhum pilar encontra outro pedaço de trilho no caminho. Num traçado em oito, com um trecho por cima do outro, os pilares do trecho de cima atravessariam o de baixo, e seria preciso pular esses pontos ou pôr os pilares de lado.",
        },
      ],
      try: [
        "Apague a linha do `translate`: os pilares ficam com metade dentro do chão, e a ponta de cada um para na metade do caminho até a viga. A conferência avisa. Depois ponha a linha de volta.",
        "Mude o `30` (as duas vezes) para `60`: o dobro de pilares, um a cada 1,6. Depois volte para 30.",
      ],
      needs: ["pilar", "viga"],
      checks: [
        {
          text: "Há pilares pelo caminho todo",
          test: ({ objects }) => {
            const pillars = all(objects.pilar);
            if (pillars.length < 20) return check(false, `há ${pillars.length} pilares: poucos para segurar o trilho todo`);
            const curve = curveOf(objects.viga);
            const { gap, from } = biggestGap(
              curve,
              pillars.map((p) => p.worldPosition),
              { flat: true },
            );
            return check(gap <= 6, `há ${fmt(gap, 1)} de trilho sem pilar, a partir de ${vec(pointAlong(curve, from))}`);
          },
        },
        {
          text: "Cada pilar vai do chão até a viga",
          test: ({ objects }) => {
            const curve = curveOf(objects.viga);
            for (const p of all(objects.pilar).filter((o) => o.box)) {
              if (Math.abs(p.box.min[1]) > 0.05) return check(false, `um pilar começa em y = ${fmt(p.box.min[1])}, ${p.box.min[1] < 0 ? "dentro do chão" : "no ar"}`);
              const top = [(p.box.min[0] + p.box.max[0]) / 2, p.box.max[1], (p.box.min[2] + p.box.max[2]) / 2];
              const d = nearest(curve, top).distance;
              if (d > 0.25) return check(false, `o pilar em ${vec(top)} para a ${fmt(d)} da viga`);
            }
            return check(true);
          },
        },
        {
          text: "Os pilares ficam em pé e dividem uma geometria",
          test: ({ objects }) => {
            const pillars = all(objects.pilar);
            for (const p of pillars) {
              const tilt = deg(Math.acos(Math.min(1, axisOf(p, 1)[1])));
              if (tilt > 1) return check(false, `um pilar está inclinado ${fmt(tilt, 0)}°`);
            }
            return shared("geometrias", pillars);
          },
        },
      ],
    },
    {
      id: "sombras",
      title: "As sombras",
      view: "camera",
      goal:
        "O trilho ainda parece flutuar, porque nada no chão diz onde ele está. A sombra diz: com ela, cada pilar encosta na grama, e a curva do trilho aparece desenhada no chão. No three.js, a sombra precisa da luz que a faz (`castShadow` no sol), dos objetos que a fazem (`castShadow` em cada peça) e dos que a recebem (`receiveShadow` no chão). E a câmera da sombra, a caixa que o sol enxerga, tem que cobrir o trilho inteiro.",
      lines: [
        {
          code: "sol.castShadow = true;",
          text: "Liga a sombra do sol. A cada quadro, o three.js desenha a cena vista do sol num mapa de profundidade, o mapa de sombra: um ponto que, para o sol, fica atrás de outro está na sombra.",
        },
        {
          code: "sol.shadow.camera.left = -18;",
          text: "A câmera da sombra de uma luz direcional é ortográfica: uma caixa, e só o que está dentro dela faz e recebe sombra. Visto do sol, o trilho ocupa uns 25 por 27; a caixa de 36 por 36 (de −18 a 18) cobre tudo, com sobra. A padrão, de −5 a 5, só cobriria o meio do parque.",
        },
        {
          code: "sol.shadow.camera.far = 60;",
          text: "O fundo da caixa, a 60 do sol. O sol está a 39 do centro, e o chão mais longe dele que recebe sombra, debaixo do trilho, fica a uns 48.",
        },
        {
          code: "sol.shadow.mapSize.set(2048, 2048);",
          text: "O mapa de sombra com 2048 × 2048 pixels, em vez dos 512 da padrão. Na caixa de 36, cada pixel do mapa cobre 0,02 do chão, e a sombra dos trilhos, que têm 0,14 de largura, sai inteira.",
        },
        {
          code: "chao.receiveShadow = true;",
          text: "O chão recebe as sombras: sem isso, o three.js nem confere se a grama está na sombra.",
        },
        {
          code: "viga.castShadow = true;",
          text: "A viga faz sombra no chão.",
        },
        {
          code: "trilhoEsquerdo.castShadow = true;",
          text: "Os trilhos também: são as duas linhas finas que aparecem na grama, dos lados da sombra da viga.",
        },
        {
          code: "dormente.castShadow = true;",
          text: "Cada dormente, dentro do laço: a sombra do trilho vira uma escada.",
        },
        {
          code: "pilar.castShadow = true;",
          text: "E cada pilar, com a sombra comprida saindo da base.",
        },
      ],
      why: [
        {
          title: "Por que cada objeto precisa dizer que faz sombra?",
          text: "Calcular sombras custa caro: a cena é desenhada de novo, vista do sol, a cada quadro. Por isso tudo vem desligado, e você liga só onde importa. Aqui, o chão recebe e não faz sombra, porque nada fica embaixo dele, e as peças do trilho fazem e não recebem: a sombra de um trilho no outro quase não se veria.",
        },
        {
          title: "Por que a caixa tem que ser do tamanho certo?",
          text: "O mapa de sombra tem um número fixo de pixels, espalhados pela caixa. Uma caixa pequena deixa parte do trilho de fora, sem sombra; uma caixa enorme espalha os pixels por uma área grande, e a sombra dos trilhos, que são finos, se desfaz em borrões. A melhor caixa é a menor que cobre tudo o que faz e recebe sombra.",
        },
      ],
      try: [
        "Mude os `18` das quatro bordas para `5`, o tamanho padrão: a caixa cobre só o meio do parque, onde não há trilho, e quase todas as sombras somem. A conferência avisa. Depois volte para 18.",
        "Mude o `2048` (as duas vezes) para `256`: a sombra vira uma faixa borrada, sem os trilhos e os dormentes. A conferência avisa. Depois volte para 2048.",
      ],
      needs: ["sol", "chao", "viga", "trilhoEsquerdo", "trilhoDireito", "dormente", "pilar"],
      checks: [
        {
          text: "O sol faz sombra",
          test: ({ objects }) => check(objects.sol.castShadow === true, "falta sol.castShadow = true"),
        },
        {
          text: "O chão recebe as sombras",
          test: ({ objects }) => check(objects.chao.receiveShadow === true, "falta chao.receiveShadow = true"),
        },
        {
          text: "A viga, os trilhos, os dormentes e os pilares fazem sombra",
          test: ({ objects }) => {
            const parts = [
              ["a viga", [objects.viga]],
              ["o trilho esquerdo", [objects.trilhoEsquerdo]],
              ["o trilho direito", [objects.trilhoDireito]],
              ["os dormentes", all(objects.dormente)],
              ["os pilares", all(objects.pilar)],
            ];
            const missing = parts.filter(([, objs]) => objs.some((o) => !o.castShadow)).map(([name]) => name);
            if (!missing.length) return check(true);
            const list = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing.at(-1)}` : missing[0];
            return check(false, `${list} não ${missing.length > 1 || missing[0].startsWith("os") ? "fazem" : "faz"} sombra`);
          },
        },
        {
          text: "A caixa da sombra cobre a montanha-russa inteira",
          test: ({ objects }) => {
            const shadow = shadowOf(objects.sol);
            if (!shadow) return check(false, "o sol não tem a câmera da sombra de uma luz direcional");
            const { box, view } = shadow;
            const curve = curveOf(objects.viga);
            const rays = toward(objects.sol.target ?? [0, 0, 0], objects.sol.worldPosition);
            let outside = 0;
            let deepest = 0;
            for (const p of curve) {
              // o ponto do trilho e o lugar do chão onde cai a sombra dele, na mesma linha do sol
              const ground = [p[0] - (rays[0] * p[1]) / rays[1], 0, p[2] - (rays[2] * p[1]) / rays[1]];
              const [x, y] = apply(view, p);
              if (x < box.left || x > box.right || y < box.bottom || y > box.top) outside++;
              deepest = Math.max(deepest, -apply(view, ground)[2]);
            }
            if (outside) {
              return check(false, `a caixa, de ${fmt(box.left, 1)} a ${fmt(box.right, 1)}, deixa de fora ${pct(outside / curve.length)} do trilho`);
            }
            return check(deepest <= box.far, `o fundo da caixa fica a ${fmt(box.far, 0)} do sol, e a sombra do trilho cai no chão a até ${fmt(deepest, 0)}`);
          },
        },
        {
          text: "Os pixels do mapa de sombra são pequenos para a sombra fina dos trilhos",
          test: ({ objects }) => {
            const shadow = shadowOf(objects.sol);
            if (!shadow) return check(false, "o sol não tem a câmera da sombra de uma luz direcional");
            const [w, h] = shadow.mapSize;
            const { box } = shadow;
            const [width, height] = [box.right - box.left, box.top - box.bottom];
            // o pedaço do chão que cada pixel do mapa cobre: os trilhos, com 0,14 de largura, pedem uns 4 pixels
            const pixel = Math.max(width / w, height / h);
            return check(pixel <= 0.04, `com ${w} × ${h} numa caixa de ${fmt(width, 0)} por ${fmt(height, 0)}, cada pixel do mapa cobre ${fmt(pixel)}: a sombra dos trilhos, que têm 0,14 de largura, vira um borrão`);
          },
        },
      ],
    },
    {
      id: "passeio",
      title: "O passeio",
      view: "camera",
      motion: true,
      goal:
        "Agora o carrinho: uma caixa amarela que a função `animar` põe num ponto da curva a cada quadro, um ponto mais adiante conforme o tempo passa. Para a velocidade ser a mesma no caminho todo, a posição sai do comprimento: em t segundos, a 8 por segundo, o carrinho andou 8 × t pela curva, e a fração do caminho é isso dividido pelo comprimento total. A conferência olha o carrinho andar por uns segundos antes de dizer se ele vai bem.",
      lines: [
        {
          code: "const geometriaCarrinho = new THREE.BoxGeometry(1.1, 0.7, 1.8);",
          text: "Uma caixa de 1,1 de largura, 0,7 de altura e 1,8 de comprimento, no z, que vai ser a frente.",
        },
        {
          code: "geometriaCarrinho.translate(0, 0.55, 0);",
          text: "Sobe a caixa 0,55, de uma vez por todas: a origem do carrinho fica 0,2 abaixo do fundo dele, no meio da viga. Assim, quando a posição do carrinho for um ponto da curva, ele fica apoiado em cima da viga, e não atravessado nela.",
        },
        {
          code: 'const carrinho = new THREE.Mesh(geometriaCarrinho, new THREE.MeshStandardMaterial({ color: "#ffd23f" }));',
          text: "O carrinho, amarelo para se destacar do vermelho do trilho.",
        },
        {
          code: "carrinho.castShadow = true;",
          text: "Ele também faz sombra, que corre pela grama junto com ele.",
        },
        {
          code: "const comprimento = curva.getLength();",
          text: "O comprimento da curva, uns 97: o three.js mede somando muitos pedacinhos dela. A conta fica fora de `animar`, porque o comprimento não muda: refazer a cada quadro seria trabalho jogado fora.",
        },
        {
          code: "const velocidade = 8; // unidades por segundo",
          text: "A velocidade do carrinho: 8 unidades por segundo, uma volta a cada 12 segundos.",
        },
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama `animar` a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou.",
        },
        {
          code: "const u = ((tempo * velocidade) / comprimento) % 1;",
          text: "A distância andada (tempo × velocidade) dividida pelo comprimento é a fração do caminho: 0,5 é meia volta, 1 é uma volta inteira. O `% 1` é o resto da divisão por 1, que tira as voltas inteiras: 2,3 voltas viram 0,3, e o carrinho segue rodando.",
        },
        {
          code: "const ponto = curva.getPointAt(u);",
          after: "function animar",
          text: "O ponto da curva a essa fração do comprimento.",
        },
        {
          code: "carrinho.position.copy(ponto);",
          text: "Leva o carrinho até lá.",
        },
        {
          code: "carrinho.lookAt(ponto.clone().add(curva.getTangentAt(u)));",
          text: "E o vira para a frente, como os dormentes: o z do carrinho, o comprimento da caixa, aponta na direção da curva. Na queda, a frente aponta para baixo, e o carrinho inclina junto.",
        },
      ],
      why: [
        {
          title: "Por que getPointAt, e não getPoint?",
          text: "A curva tem dois jeitos de achar um ponto. O `getPoint(t)` divide o caminho em partes iguais entre os pontos de controle: de 0 a 1/13, vai do primeiro ao segundo; de 1/13 a 2/13, do segundo ao terceiro, estejam eles perto ou longe um do outro, e nem dentro de cada parte o passo é igual. Com t crescendo por igual, o carrinho correria em uns trechos e se arrastaria em outros. O `getPointAt(u)` conta pelo comprimento do caminho, e o mesmo tempo vira a mesma distância.",
        },
        {
          title: "Por que pelo tempo, e não somar um pouquinho a cada quadro?",
          text: "Pelo tempo, a posição não depende de quantos quadros por segundo a tela desenha: num computador lento ou rápido, depois de 3 segundos o carrinho está no mesmo lugar. Somar 0,001 a cada quadro faria o carrinho andar o dobro numa tela de 120 quadros por segundo. No próximo passo a velocidade vai mudar, e aí a soma volta, multiplicada pelo tempo de cada quadro.",
        },
      ],
      try: [
        "Dentro de `animar`, troque o `getPointAt` por `getPoint`: o carrinho passa a acelerar e frear sem motivo, conforme a distância entre os pontos de controle. A conferência avisa. Depois volte para getPointAt.",
        "Mude a velocidade para `30`: o carrinho dispara pelo trilho. Depois volte para 8.",
        "Para ver o carrinho de perto, mude a posição da câmera para `(14, 9, -18)`: ela vai para o lado da queda, e o carrinho passa inclinado, de frente para o caminho. Depois volte para (34, 18, 26).",
      ],
      needs: ["carrinho", "viga"],
      checks: [
        {
          text: "O carrinho fica em cima da viga, com a base na curva",
          test: (facts) => {
            const { objects } = facts;
            const pending = unplaced(facts);
            if (pending) return pending;
            const { near } = cartOnCurve(objects);
            if (near.distance > 0.15) return check(false, `o carrinho está a ${fmt(near.distance)} da viga`);
            const bottom = extent(objects.carrinho.geometry?.sample ?? [[0, 0, 0]], 1).min;
            return check(bottom >= 0.15, `o fundo do carrinho fica ${bottom < 0 ? `${fmt(-bottom)} abaixo` : `só ${fmt(bottom)} acima`} da origem dele: o carrinho atravessa a viga`);
          },
        },
        {
          text: "O carrinho aponta para a frente, ao longo da curva",
          test: (facts) => {
            const { objects } = facts;
            const pending = unplaced(facts);
            if (pending) return pending;
            const { near } = cartOnCurve(objects);
            const angle = angleBetween(axisOf(objects.carrinho, 2), near.direction);
            return check(angle < 15, `o carrinho fica ${fmt(angle, 0)}° fora da direção da curva`);
          },
        },
        {
          text: "O carrinho anda pela curva",
          test: (facts) => rides(facts),
        },
        {
          text: "O carrinho anda sempre na mesma velocidade",
          test: (facts) => {
            const { trail, result } = trailOf(facts);
            if (!trail) return result;
            if (trail.at(-1)[0] - trail[0][0] < 2) return wait("medindo a velocidade");
            const speeds = speedsOf(trail, { window: 0.25 }).map((s) => s.v);
            const [low, high] = [Math.min(...speeds), Math.max(...speeds)];
            return check(high <= 1.3 * low, `a velocidade vai de ${fmt(low, 1)} a ${fmt(high, 1)} por segundo`);
          },
        },
      ],
    },
    {
      id: "gravidade",
      title: "A gravidade",
      view: "camera",
      motion: true,
      goal:
        "Numa montanha-russa de verdade, ninguém empurra o carrinho na descida: a gravidade faz isso. Ele desce acelerando e sobe perdendo velocidade, porque a energia se conserva: a altura que ele perde vira velocidade, e a que ganha custa velocidade. A conta é curta: v = √(v₀² + 2·g·(h₀ − y)), com h₀ e v₀ a altura e a velocidade no topo. Como a velocidade agora muda, a posição não sai mais de tempo × velocidade: a cada quadro, o carrinho anda velocidade × delta, em que delta é o tempo desde o quadro anterior.",
      lines: [
        {
          code: "const gravidade = 9.8;",
          text: "A aceleração da gravidade na Terra: 9,8 metros por segundo a cada segundo. Pensando numa unidade da cena como um metro, o trilho tem 12 metros de altura.",
        },
        {
          code: "const topo = Math.max(...curva.getSpacedPoints(500).map((p) => p.y));",
          text: "A altura do ponto mais alto da curva. O `getSpacedPoints(500)` dá 501 pontos igualmente espaçados, o `map` pega o y de cada um, e o `Math.max` fica com o maior. Os `...` espalham a lista em argumentos, porque o `Math.max` recebe números soltos, e não uma lista. Medir na curva, e não nos pontos de controle, garante que nenhum trecho passa do topo.",
        },
        {
          code: "const velocidadeNoTopo = 2;",
          text: "A velocidade lá em cima, onde ela é a menor de todas: 2 por segundo. Com 0, o carrinho ficaria parado no alto para sempre.",
        },
        {
          code: "let distancia = 0;",
          text: "Quanto o carrinho já andou pela curva. É `let`, e não `const`, porque muda a cada quadro, e fica fora de `animar` para guardar o valor de um quadro para o seguinte.",
        },
        {
          code: "function animar(tempo, delta) {",
          text: "Agora `animar` usa o segundo argumento, `delta`: os segundos desde o quadro anterior, uns 0,017 a 60 quadros por segundo.",
        },
        {
          code: "const u = (distancia / comprimento) % 1;",
          text: "A fração do caminho sai da distância andada, somada quadro a quadro.",
        },
        {
          code: "const velocidade = Math.sqrt(velocidadeNoTopo ** 2 + 2 * gravidade * (topo - ponto.y));",
          text: "A conservação da energia. `topo - ponto.y` é o quanto o carrinho está abaixo do topo, e o `**` é a potência: `2 ** 2` é 4. No fundo da queda, 10,9 abaixo do topo, a conta dá 14,7 por segundo, mais de 50 km/h.",
        },
        {
          code: "distancia += velocidade * delta;",
          text: "Anda o que a velocidade manda em `delta` segundos: distância = velocidade × tempo, um pouquinho a cada quadro. Multiplicar pelo `delta`, e não somar um número fixo, deixa o passeio igual em qualquer tela.",
        },
      ],
      why: [
        {
          title: "De onde vem a conta?",
          text: "A energia do movimento é ½·m·v², e a da altura, m·g·y. Sem atrito, a soma das duas não muda: ½·m·v² + m·g·y = ½·m·v₀² + m·g·h₀. A massa aparece em todos os termos e sai da conta, e isolando o v sobra v = √(v₀² + 2·g·(h₀ − y)). Por isso um carrinho cheio e um vazio descem igual: a montanha-russa não depende do peso de quem vai nela.",
        },
        {
          title: "Por que somar a cada quadro, se antes bastava o tempo?",
          text: "Com a velocidade fixa, a distância era velocidade × tempo, uma multiplicação só. Com a velocidade mudando, a distância é a soma de cada pedacinho andado, a integral da velocidade no tempo. O código faz essa soma em passos de `delta`, o método de Euler. Com 60 passos por segundo, o erro é pequeno, e o carrinho nunca sai do trilho, porque a posição sempre vem da curva.",
        },
        {
          title: "E o atrito?",
          text: "Num carrinho de verdade, o atrito e o ar tiram um pouco de energia a cada metro, e ele não voltaria sozinho ao topo: é por isso que as montanhas-russas têm a corrente que puxa o carrinho na subida. Aqui, sem atrito, a energia se conserva, e o carrinho volta ao topo e passa por ele com os mesmos 2 por segundo de antes.",
        },
      ],
      try: [
        "Mude a `gravidade` para `1.6`, a da Lua: o passeio fica em câmera lenta. Depois volte para 9.8.",
        "Mude `velocidadeNoTopo` para `0`: o carrinho fica parado lá em cima, porque ali a velocidade dá zero, e ele nunca sai do lugar. A conferência avisa. Depois volte para 2.",
        "Troque o `ponto.y` da conta da velocidade por `5`: a velocidade deixa de depender da altura, e o carrinho anda de novo sempre igual, a 11,9 por segundo. A conferência avisa. Depois volte para ponto.y.",
      ],
      needs: ["carrinho", "viga"],
      checks: [
        {
          text: "O carrinho anda pela curva",
          test: (facts) => rides(facts),
        },
        {
          text: "O carrinho ganha velocidade na descida e perde na subida",
          test: (facts) => {
            const { trail, result } = trailOf(facts);
            if (!trail) return result;
            const { speeds, fit } = energyOf(trail);
            if (extent(placesOf(trail), 1).size < 3 || speeds.length < 10) return wait("esperando o carrinho subir ou descer mais um pouco");
            // de 10% a 90% das medidas: um quadro que demorou demais não conta como mudança de velocidade
            const sorted = speeds.map((s) => s.v).sort((a, b) => a - b);
            const [low, high] = [sorted[Math.floor(sorted.length * 0.1)], sorted[Math.ceil(sorted.length * 0.9) - 1]];
            if (high <= 1.15 * low) {
              const range = fmt(low, 1) === fmt(high, 1) ? `fica em ${fmt(low, 1)}` : `fica entre ${fmt(low, 1)} e ${fmt(high, 1)}`;
              return check(false, `a velocidade não muda com a altura: ${range} por segundo`);
            }
            if (fit.b > 0) return check(false, "o carrinho anda mais rápido no alto do que embaixo");
            return check(fit.b < -2 && fit.r2 > 0.9, "a velocidade muda, mas não acompanha a altura: ela não vem da conta da energia");
          },
        },
        {
          text: "O carrinho dá a volta inteira, sem parar no alto",
          test: (facts) => {
            const { trail, result } = trailOf(facts);
            if (!trail) return result;
            const total = lengthOf(curveOf(facts.objects.viga));
            const places = placesOf(trail);
            if (lengthOf(places) >= 0.98 * total) return check(true);
            // parado: o último segundo do rastro sem sair do lugar
            const recent = trail.filter(([t]) => t >= trail.at(-1)[0] - 1);
            if (trail.at(-1)[0] - trail[0][0] > 2 && lengthOf(placesOf(recent)) < 0.1) {
              return check(false, `o carrinho parou em ${vec(places.at(-1))}: ali, a velocidade dá zero`);
            }
            return wait(`o carrinho já andou ${pct(lengthOf(places) / total)} da volta`);
          },
        },
      ],
    },
    {
      id: "camera",
      title: "A câmera no carrinho",
      view: "camera",
      goal:
        "O passeio de verdade é visto de dentro do carrinho. Em vez de calcular a posição da câmera a cada quadro, você a põe no carrinho: com `carrinho.add(camera)`, ela vira filha dele, e a posição e a rotação dela passam a ser medidas a partir do carrinho. Ele anda e inclina, e a câmera vai junto, sem uma linha a mais em `animar`. As linhas do começo, que deixavam a câmera no alto do parque, saem.",
      lines: [
        {
          code: "carrinho.add(camera);",
          text: "Põe a câmera dentro do carrinho, como um objeto filho. A matriz de mundo da câmera passa a ser a do carrinho vezes a dela: a cada quadro, o three.js faz essa conta, e a câmera vai aonde o carrinho for.",
        },
        {
          code: "camera.position.set(0, 1.2, 0.3);",
          text: "A posição agora é medida no carrinho, e não no mundo: 1,2 acima da origem dele, 0,3 acima da tampa da caixa, onde iria a cabeça de quem está sentado, e 0,3 para a frente.",
        },
        {
          code: "camera.rotation.y = Math.PI;",
          text: "Meia-volta, π radianos (180°), em torno do y do carrinho. A câmera olha para o −z dela, e o `lookAt` aponta o +z do carrinho para a frente: sem a meia-volta, você andaria de costas.",
        },
      ],
      why: [
        {
          title: "Por que filha do carrinho, e não copiar a posição em animar?",
          text: "Também daria certo: a cada quadro, copiar a posição do carrinho, somar a altura da cabeça e virar a câmera para um ponto à frente. Mas seria repetir em `animar` a conta que o carrinho já faz. Na árvore da cena, o filho herda o movimento do pai, como uma lua que gira em volta de um planeta que gira em volta do Sol. Se o carrinho ganhar um balanço, ou se inclinar nas curvas, a câmera acompanha sem mudar nada.",
        },
        {
          title: "Por que a câmera olha para o −z?",
          text: "É a convenção do OpenGL, que o WebGL e o three.js seguem: a câmera fica na origem do espaço dela olhando para o −z, com o x para a direita e o y para cima. Já o `lookAt` de um objeto comum aponta o +z dele para o alvo, para que a frente de um modelo, que costuma olhar para o +z, vire para lá. Por isso a câmera, presa a um objeto virado pelo `lookAt`, precisa da meia-volta.",
        },
      ],
      try: [
        "Desligue a Câmera do código, na barra de cima, e afaste a vista com a roda do mouse: dá para ver o carrinho dando a volta pelo trilho. Ligue de novo para voltar ao passeio.",
        "Mude a posição da câmera para `(0, 2.2, -4)`: ela vai para trás e para cima do carrinho, como num jogo de corrida, e você vê o carrinho na frente. A conferência avisa que ela saiu do carrinho. Depois volte para (0, 1.2, 0.3).",
        "Mude o `60` da linha da câmera, o campo de visão, para `90`: o trilho parece mais longe, e o passeio, mais rápido, como numa câmera de ação. Depois volte para 60.",
      ],
      needs: ["carrinho"],
      checks: [
        {
          text: "A câmera vai no carrinho, como filha dele",
          test: ({ objects, nameOf }) => {
            const parent = objects.camera?.parent ?? null;
            if (parent == null) return check(false, "a câmera não está no carrinho: falta carrinho.add(camera)");
            const name = nameOf(parent);
            return check(name === "carrinho", `a câmera é filha de ${name ?? "outro objeto"}, e não do carrinho`);
          },
        },
        {
          text: "A câmera olha para a frente do carrinho",
          test: ({ objects, camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const c = dot(camera.direction, axisOf(objects.carrinho, 2));
            if (c < -0.9) return check(false, "a câmera olha para trás: falta a meia-volta em y");
            return check(c > 0.9, `a câmera olha ${fmt(deg(Math.acos(Math.max(-1, Math.min(1, c)))), 0)}° para fora da frente do carrinho`);
          },
        },
        {
          text: "A câmera fica em cima do carrinho, onde iria a cabeça",
          test: ({ objects, camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const cart = objects.carrinho;
            const sample = cart.geometry?.sample ?? [[0, 0, 0]];
            // o lugar da câmera medido no carrinho: para o lado (x), para cima (y) e para a frente (z)
            const offset = [0, 1, 2].map((k) => camera.worldPosition[k] - cart.worldPosition[k]);
            const [side, up, ahead] = [0, 1, 2].map((k) => dot(axisOf(cart, k), offset));
            const top = extent(sample, 1).max;
            if (up < top) return check(false, `a câmera está ${fmt(up)} acima da origem do carrinho, e a tampa dele, a ${fmt(top)}: ela fica dentro da caixa`);
            if (up > 3) return check(false, `a câmera está ${fmt(up)} acima do carrinho: alto demais para quem vai sentado nele`);
            if (Math.abs(ahead) > extent(sample, 2).max) return check(false, `a câmera fica ${fmt(Math.abs(ahead))} ${ahead < 0 ? "atrás" : "à frente"} do meio do carrinho, fora dele`);
            return check(Math.abs(side) <= extent(sample, 0).max, `a câmera fica ${fmt(Math.abs(side))} para o lado do meio do carrinho, fora dele`);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
