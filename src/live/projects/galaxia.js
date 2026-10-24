// galaxia.js — o projeto "Gerador de galáxias": 50 mil estrelas num objeto só, em 10 passos.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha: cada linha diz a
// partir de qual passo aparece (`from`) ou como muda de um passo para outro (`by`). Assim o
// código do passo 6 é o do passo 5 com as mudanças do 6, e a aba Projetos mostra só a diferença.
// Nos textos, `assim` é código; `lines` aponta trechos do código do passo (o primeiro depois de
// `after`, quando o trecho se repete).

import { armsOf, check, extent, fmt, int, luminance, maxRadius, radius } from "./checks.js";

/** Linhas que existem a partir do passo n. */
const from = (n, ...lines) => ({ from: n, lines });
/** Uma linha que muda: { passo: texto }, valendo o texto do último passo até aqui. */
const by = (versions) => ({ by: versions });

const SOURCE = [
  from(0, "// Gerador de galáxias"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#05060a");',
    "",
    "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 8, 14);",
    "camera.lookAt(0, 0, 0);",
  ),
  from(2, "", "// Parâmetros da galáxia"),
  by({ 2: "const quantidade = 1000;", 3: "const quantidade = 50000;" }),
  from(4, "const raio = 5;"),
  from(5, "const bracos = 3;"),
  from(6, "const curvatura = 1;"),
  from(7, "const dispersao = 0.3;"),
  from(8, 'const corNucleo = new THREE.Color("#ffb46b");', 'const corBorda = new THREE.Color("#4b6bff");'),
  from(2, "", "const posicoes = new Float32Array(quantidade * 3);"),
  from(8, "const cores = new Float32Array(quantidade * 3);", "const cor = new THREE.Color();"),
  from(
    7,
    "",
    "// Um número sorteado em torno de 0, com a distribuição normal (a curva do sino)",
    "function gaussiana() {",
    "  const u = 1 - Math.random(); // nunca 0: o logaritmo de 0 não existe",
    "  const v = Math.random();",
    "  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);",
    "}",
  ),
  from(2, "", "for (let i = 0; i < quantidade; i++) {", "  const i3 = i * 3;"),
  from(4, "  const r = Math.random() * raio;"),
  from(5, "  const braco = i % bracos;"),
  by({
    4: "  const angulo = Math.random() * Math.PI * 2;",
    5: "  const angulo = (braco / bracos) * Math.PI * 2;",
    6: "  const angulo = (braco / bracos) * Math.PI * 2 + r * curvatura;",
  }),
  from(4, ""),
  by({
    2: "  posicoes[i3] = (Math.random() - 0.5) * 6;",
    4: "  posicoes[i3] = Math.cos(angulo) * r;",
    7: "  posicoes[i3] = Math.cos(angulo) * r + gaussiana() * dispersao;",
  }),
  by({
    2: "  posicoes[i3 + 1] = (Math.random() - 0.5) * 6;",
    4: "  posicoes[i3 + 1] = 0;",
    7: "  posicoes[i3 + 1] = gaussiana() * dispersao * 0.3;",
  }),
  by({
    2: "  posicoes[i3 + 2] = (Math.random() - 0.5) * 6;",
    4: "  posicoes[i3 + 2] = Math.sin(angulo) * r;",
    7: "  posicoes[i3 + 2] = Math.sin(angulo) * r + gaussiana() * dispersao;",
  }),
  from(8, "", "  cor.lerpColors(corNucleo, corBorda, r / raio);", "  cores[i3] = cor.r;", "  cores[i3 + 1] = cor.g;", "  cores[i3 + 2] = cor.b;"),
  from(2, "}", "", "const geometria = new THREE.BufferGeometry();", 'geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));'),
  from(8, 'geometria.setAttribute("color", new THREE.BufferAttribute(cores, 3));'),
  from(2, ""),
  by({ 2: "const material = new THREE.PointsMaterial({ size: 0.05 });", 3: "const material = new THREE.PointsMaterial({" }),
  from(3, "  size: 0.03,", "  sizeAttenuation: true,", "  depthWrite: false,", "  blending: THREE.AdditiveBlending,"),
  from(8, "  vertexColors: true,"),
  from(3, "});"),
  from(2, "", "const galaxia = new THREE.Points(geometria, material);", "cena.add(galaxia);"),
  from(
    10,
    "",
    "// O céu: estrelas longe, espalhadas por igual em todas as direções",
    "const quantidadeEstrelas = 2000;",
    "const posicoesCeu = new Float32Array(quantidadeEstrelas * 3);",
    "const direcao = new THREE.Vector3();",
    "",
    "for (let i = 0; i < quantidadeEstrelas; i++) {",
    "  direcao.set(gaussiana(), gaussiana(), gaussiana()).normalize().multiplyScalar(40);",
    "  direcao.toArray(posicoesCeu, i * 3);",
    "}",
    "",
    "const geometriaCeu = new THREE.BufferGeometry();",
    'geometriaCeu.setAttribute("position", new THREE.BufferAttribute(posicoesCeu, 3));',
    "",
    "const materialCeu = new THREE.PointsMaterial({",
    '  color: "#9aa4c7",',
    "  size: 1.5,",
    "  sizeAttenuation: false,",
    "  blending: THREE.AdditiveBlending,",
    "});",
    "",
    "const ceu = new THREE.Points(geometriaCeu, materialCeu);",
    "cena.add(ceu);",
  ),
  from(9, "", "function animar(tempo) {", "  galaxia.rotation.y = tempo * 0.1;", "}"),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
export function codeAt(n) {
  const out = [];
  for (const part of SOURCE) {
    if (part.lines) {
      if (n >= part.from) out.push(...part.lines);
      continue;
    }
    const steps = Object.keys(part.by).map(Number).filter((k) => k <= n);
    if (steps.length) out.push(part.by[Math.max(...steps)]);
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Conferências: os pontos da galáxia chegam como uma amostra, no espaço do objeto

const cloudOf = (obj) => obj.geometry?.sample ?? [];
const deg = (rad) => (rad * 180) / Math.PI;

function noPoints(obj) {
  return cloudOf(obj).length ? null : check(false, "a geometria não tem posições");
}

/** Cor média dos pontos cujo raio, em fração do maior, passa em `pick`; null se forem poucos. */
function meanColor(obj, pick) {
  const sample = cloudOf(obj);
  const colors = obj.geometry?.colors ?? [];
  const rMax = maxRadius(sample);
  const chosen = colors.filter((_, j) => pick(radius(sample[j]) / rMax));
  if (chosen.length < 5) return null;
  return [0, 1, 2].map((c) => chosen.reduce((sum, color) => sum + color[c], 0) / chosen.length);
}

// ---------------------------------------------------------------------------

export const GALAXIA = {
  id: "galaxia",
  title: "Gerador de galáxias",
  level: "intermediario",
  summary: "50 mil estrelas num objeto só, girando em espiral, com o núcleo alaranjado e os braços azuis.",
  concepts: ["THREE.Points e BufferGeometry", "Coordenadas polares", "Espiral de Arquimedes", "Distribuição normal", "Mistura aditiva", "Cor por vértice", "Animação pelo tempo"],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Toda cena do Three.js tem três peças: a cena, que guarda os objetos; a câmera, que diz de onde se olha; e o renderer, que transforma a cena em pixels. Aqui no código vivo, o VisuGraph já cria o renderer e o laço que redesenha o visor, então você escreve a cena e a câmera. Por enquanto, o visor mostra só o fundo: ainda não há nada na frente da câmera.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "`THREE` é o three.js, a biblioteca deste projeto. Ela conversa com o WebGL, a interface do navegador para a placa de vídeo, para você não escrever shaders e buffers à mão. `new THREE.Scene()` cria a cena: a raiz de uma árvore de objetos, e só o que for adicionado a ela com `cena.add` é desenhado.",
        },
        {
          code: 'cena.background = new THREE.Color("#05060a");',
          text: "A cor de fundo, pintada antes de tudo a cada quadro. `THREE.Color` entende cores como o CSS. É um preto levemente azulado, que combina com as estrelas.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);",
          text: "Uma câmera com perspectiva: o que está longe parece menor. Os números são o campo de visão vertical (60°), a proporção largura/altura (o visor troca o 16/9 pela dele) e as distâncias perto (0,1) e longe (100): fora dessa faixa, nada é desenhado.",
        },
        {
          code: "camera.position.set(0, 8, 14);",
          text: "Põe a câmera 8 unidades acima e 14 à frente do centro. No Three.js, o eixo y aponta para cima e o z aponta para fora da tela, na direção de quem olha.",
        },
        {
          code: "camera.lookAt(0, 0, 0);",
          text: "Gira a câmera para olhar o centro, onde vai ficar a galáxia. Vista de cima e um pouco de lado, a espiral aparece inteira, mesmo num visor estreito, e ainda dá para ver a espessura do disco.",
        },
      ],
      why: [
        {
          title: "Por que perspectiva, e não uma câmera ortográfica?",
          text: "A `OrthographicCamera` desenha tudo do mesmo tamanho a qualquer distância, como numa planta baixa. Numa galáxia, é a perspectiva que dá profundidade: os pontos do fundo ficam menores e mais juntos que os da frente.",
        },
        {
          title: "Por que perto = 0,1 e longe = 100?",
          text: "A profundidade de cada pixel é guardada com precisão limitada, e quase toda ela fica perto do plano de perto. Por isso não se usa perto = 0,0001 por garantia: com uma razão longe/perto enorme, falta precisão para o resto da cena, e superfícies vizinhas começam a piscar uma sobre a outra. De 0,1 a 100 cabem a galáxia e o céu do passo 10, que fica a 40 de distância.",
        },
      ],
      try: [
        'Troque a cor de fundo por `"#203040"` e veja o visor mudar.',
        "Desligue a Câmera do código, na barra de cima, e gire a vista arrastando o visor: a câmera do código aparece como um ícone, olhando para o centro.",
      ],
      needs: [],
      checks: [
        {
          text: "A cena tem um fundo escuro",
          test: ({ background }) =>
            background ? check(luminance(background) < 0.15, `o fundo é ${background}, claro demais para estrelas`) : check(false, "a cena não tem cor de fundo"),
        },
        {
          text: "A câmera está longe do centro e olha para ele",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const p = camera.worldPosition;
            const d = Math.hypot(...p);
            if (d < 2) return check(false, `a câmera está a ${fmt(d)} do centro, perto demais`);
            const cos = p.reduce((sum, c, i) => sum - (c / d) * camera.direction[i], 0);
            return check(cos > 0.995, `a câmera olha ${fmt(deg(Math.acos(Math.min(1, cos))), 0)}° para fora do centro`);
          },
        },
      ],
    },
    {
      id: "pontos",
      title: "Mil pontos",
      view: "camera",
      goal:
        "Cada estrela vai ser um ponto. Em vez de mil objetos, cada um com a sua posição, você cria um objeto só, `THREE.Points`, que desenha um ponto em cada vértice de uma geometria. As posições ficam numa lista de números que vai inteira para a placa de vídeo. Por enquanto, os pontos são sorteados dentro de um cubo.",
      lines: [
        {
          code: "const quantidade = 1000;",
          text: "Quantas estrelas a galáxia tem. Fica numa constante no alto do código porque a lista e o laço dependem dela: mude aqui e o resto acompanha.",
        },
        {
          code: "const posicoes = new Float32Array(quantidade * 3);",
          text: "A lista das posições, com três números por ponto, um atrás do outro: x₀, y₀, z₀, x₁, y₁, z₁… `Float32Array` é uma lista de tamanho fixo de números de 32 bits, o formato que a placa de vídeo lê. Ela já começa cheia de zeros.",
        },
        {
          code: "for (let i = 0; i < quantidade; i++) {",
          text: "Um laço que passa por cada ponto, de 0 até quantidade − 1.",
        },
        {
          code: "const i3 = i * 3;",
          text: "Onde o ponto i começa na lista: o ponto 0 ocupa as casas 0, 1 e 2; o ponto 1, as casas 3, 4 e 5; e assim por diante.",
        },
        {
          code: "posicoes[i3] = (Math.random() - 0.5) * 6;",
          text: "`Math.random()` sorteia um número de 0 a 1. Menos 0,5, ele fica entre −0,5 e 0,5; vezes 6, entre −3 e 3. As três linhas fazem isso para x, y e z: um ponto sorteado num cubo de lado 6.",
        },
        {
          code: "const geometria = new THREE.BufferGeometry();",
          text: "Uma geometria vazia. A `BufferGeometry` guarda os dados de cada vértice em atributos: posição, cor, normal… As geometrias prontas, como a `BoxGeometry`, são `BufferGeometry` com os atributos já preenchidos.",
        },
        {
          code: 'geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));',
          text: "Entrega a lista à geometria como o atributo `position`. O `3` diz que cada vértice usa três números seguidos. O nome importa: `position` é o atributo que o Three.js usa para pôr cada vértice no lugar.",
        },
        {
          code: "const material = new THREE.PointsMaterial({ size: 0.05 });",
          text: "O material diz como cada ponto é pintado. O `PointsMaterial` desenha um quadradinho em cada vértice, com lado `size` em unidades da cena, branco se você não disser a cor.",
        },
        {
          code: "const galaxia = new THREE.Points(geometria, material);",
          text: "Junta geometria e material num objeto da cena. Uma `THREE.Mesh` ligaria os vértices em triângulos; a `THREE.Points` desenha só os vértices.",
        },
        {
          code: "cena.add(galaxia);",
          text: "Põe a galáxia na cena. Sem esta linha, o objeto existe, mas não é desenhado.",
        },
      ],
      why: [
        {
          title: "Por que um objeto com mil pontos, e não mil objetos?",
          text: "Cada objeto custa uma chamada de desenho: o processador prepara e envia um pedido à placa de vídeo. Mil esferas seriam mil pedidos por quadro; um `Points` com mil ou cinquenta mil vértices é um pedido só, e a placa desenha os pontos em paralelo. É essa conta que deixa a galáxia ter tantas estrelas.",
        },
        {
          title: "Por que Float32Array, e não uma lista comum?",
          text: "Uma lista comum do JavaScript aceita qualquer coisa em cada casa e não fica guardada do jeito que a placa de vídeo lê. A `Float32Array` é um bloco contínuo de números de 32 bits, que o WebGL envia à placa sem conversão. 32 bits dão uns 7 algarismos de precisão, de sobra para posições.",
        },
        {
          title: "Por que sortear num cubo, se o projeto é uma galáxia?",
          text: "Para ver os pontos funcionando antes de pensar na forma. Daqui em diante, quase tudo o que muda é a conta dentro do laço: a geometria, o material e o objeto continuam os mesmos.",
        },
      ],
      try: [
        "Mude `quantidade` para 10000 e depois para 100: o laço e a lista acompanham.",
        "Troque `size: 0.05` por `size: 0.3` e repare que os pontos são quadrados.",
        "Clique em `galaxia` na lista de objetos: o painel mostra quantos pontos a geometria tem.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "Há um objeto THREE.Points chamado galaxia",
          test: ({ objects }) => check(objects.galaxia.type === "Points", `galaxia é um ${objects.galaxia.type}`),
        },
        {
          text: "Ele tem pelo menos 1.000 pontos",
          test: ({ objects }) => {
            const n = objects.galaxia.geometry?.vertices ?? 0;
            return check(n >= 1000, `tem ${int(n)}`);
          },
        },
      ],
    },
    {
      id: "brilho",
      title: "Brilho de estrela",
      view: "camera",
      goal:
        "Mil pontos brancos parecem neve. Agora são 50 mil pontos pequenos, e muda o jeito como eles se misturam com o que já está na tela: em vez de um ponto cobrir o outro, as cores se somam. Onde muitos pontos se juntam, a luz se acumula e brilha, como numa foto de longa exposição.",
      lines: [
        {
          code: "const quantidade = 50000;",
          text: "Cinquenta vezes mais pontos. Como a galáxia continua um objeto só, o número de chamadas de desenho não muda: aumenta só o trabalho da placa, que desenha os pontos em paralelo.",
        },
        {
          code: "size: 0.03,",
          text: "Pontos menores: com 50 mil, pontos grandes viram uma massa branca.",
        },
        {
          code: "sizeAttenuation: true,",
          text: "O tamanho diminui com a distância, como tudo na perspectiva, porque `size` está em unidades da cena. Já é o padrão; fica escrito porque o céu do passo 10 vai usar `false`.",
        },
        {
          code: "depthWrite: false,",
          text: "Os pontos não gravam a profundidade. Normalmente a placa guarda, em cada pixel, a distância do que foi desenhado ali, e deixa de desenhar o que vier atrás. Com isso desligado, um ponto não esconde os outros.",
        },
        {
          code: "blending: THREE.AdditiveBlending,",
          text: "A mistura aditiva: a cor do ponto é somada à cor que já está no pixel. Dois pontos no mesmo pixel dão uma cor mais clara; muitos chegam ao branco.",
        },
      ],
      why: [
        {
          title: "Por que somar as cores?",
          text: "Estrelas emitem luz, e luz se soma: duas lanternas no mesmo lugar iluminam mais que uma. Na mistura normal, o último ponto cobre o de baixo, como tinta. Com a aditiva, as regiões cheias de estrelas clareiam sozinhas, sem nenhuma conta a mais no código.",
        },
        {
          title: "Por que desligar a gravação da profundidade?",
          text: "Com `depthWrite` ligado, o primeiro ponto desenhado num pixel bloqueia os que estão atrás dele, e esses deixam de somar a sua luz. A placa não desenha os pontos do mais longe para o mais perto, então o brilho ficaria irregular e mudaria ao girar a câmera. Desligado, todo ponto soma, e na soma a ordem não importa: a + b = b + a.",
        },
        {
          title: "50 mil pontos não deixam tudo lento?",
          text: "Para uma placa de vídeo, 50 mil vértices são pouco: ela processa milhões por quadro. O que mais pesa num quadro é a quantidade de pixels pintados, e pontos pequenos pintam poucos. O laço que sorteia as posições roda uma vez só, no processador, quando o código roda.",
        },
      ],
      try: [
        "Troque `THREE.AdditiveBlending` por `THREE.NormalBlending`: o brilho onde os pontos se juntam some.",
        "Aumente `size` para 0.1 e veja a soma estourar no branco.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A galáxia tem pelo menos 20.000 pontos",
          test: ({ objects }) => {
            const n = objects.galaxia.geometry?.vertices ?? 0;
            return check(n >= 20000, `tem ${int(n)}`);
          },
        },
        {
          text: "As cores dos pontos se somam (THREE.AdditiveBlending)",
          test: ({ objects }) => {
            const blending = objects.galaxia.material?.blending;
            return check(blending === "AdditiveBlending", `a mistura é ${blending ?? "outra"}`);
          },
        },
        {
          text: "Os pontos não gravam a profundidade (depthWrite: false)",
          test: ({ objects }) => check(objects.galaxia.material?.depthWrite === false, "depthWrite está ligado"),
        },
      ],
    },
    {
      id: "disco",
      title: "Um disco",
      view: "camera",
      goal:
        "Galáxias espirais são discos achatados. Para sortear um ponto num disco, em vez de x e z você sorteia um raio (a distância ao centro) e um ângulo (a direção), e converte os dois em x e z com cosseno e seno. São as coordenadas polares.",
      lines: [
        {
          code: "const raio = 5;",
          text: "O raio da galáxia, em unidades da cena: mais um parâmetro no alto do código.",
        },
        {
          code: "const r = Math.random() * raio;",
          text: "A distância deste ponto ao centro, sorteada entre 0 e o raio.",
        },
        {
          code: "const angulo = Math.random() * Math.PI * 2;",
          text: "A direção do ponto, sorteada entre 0 e 2π radianos, uma volta inteira (360°). O JavaScript e o Three.js medem ângulos em radianos.",
        },
        {
          code: "posicoes[i3] = Math.cos(angulo) * r;",
          text: "Polares para cartesianas: andar r na direção do ângulo leva a x = cos(ângulo) · r e z = sen(ângulo) · r. É o círculo trigonométrico com raio r em vez de 1.",
        },
        {
          code: "posicoes[i3 + 1] = 0;",
          text: "Altura zero: um disco plano, deitado no plano xz. A lista já começa com zeros, mas a linha deixa claro onde a espessura vai entrar, no passo 7.",
        },
        {
          code: "posicoes[i3 + 2] = Math.sin(angulo) * r;",
          text: "O z, com o seno. São x e z, e não x e y, porque y é a altura: assim o disco fica deitado.",
        },
      ],
      why: [
        {
          title: "Por que sortear raio e ângulo, e não x e z?",
          text: "Sorteando x e z, sai um quadrado. Dá para descartar os pontos fora do círculo, mas aí uns 21% dos sorteios vão fora (1 − π/4). Com raio e ângulo, todo ponto cai no disco, e os braços e a espiral dos próximos passos viram contas simples com o ângulo.",
        },
        {
          title: "Por que o centro ficou mais cheio?",
          text: "Cada faixa de raio recebe a mesma quantidade de pontos, mas as faixas de fora são maiores (uma volta mede 2πr). Então os pontos se apertam no centro: a densidade cresce como 1/r. Um disco uniforme pediria `r = raio * Math.sqrt(Math.random())`. Aqui o aperto é bem-vindo: com a mistura aditiva, ele vira o núcleo brilhante da galáxia.",
        },
      ],
      try: [
        "Troque `Math.random() * raio` por `raio * Math.sqrt(Math.random())` e compare o centro.",
        "Use `Math.random() * Math.PI` no ângulo: só meia volta do disco se enche.",
        "Desligue a Câmera do código, na barra de cima, e gire a vista arrastando o visor: o disco não tem espessura nenhuma.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "Os pontos estão num plano: todos com y = 0",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const sample = cloudOf(objects.galaxia);
            const y = extent(sample, 1);
            const flat = Math.max(Math.abs(y.min), Math.abs(y.max)) <= 0.01 * Math.max(maxRadius(sample), 1);
            return check(flat, `y vai de ${fmt(y.min)} a ${fmt(y.max)}`);
          },
        },
        {
          text: "O contorno é redondo, não quadrado",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const sample = cloudOf(objects.galaxia);
            const far = maxRadius(sample);
            const edge = Math.max(...sample.map(([x, , z]) => Math.max(Math.abs(x), Math.abs(z))));
            return check(far <= 1.2 * edge, `o ponto mais longe está a ${fmt(far)} do centro, mas x e z só vão até ${fmt(edge)}: são os cantos de um quadrado`);
          },
        },
      ],
    },
    {
      id: "bracos",
      title: "Braços",
      view: "camera",
      goal:
        "Uma galáxia espiral tem braços. Primeiro, braços retos: em vez de sortear o ângulo, cada ponto recebe o ângulo de um dos braços. Com 3 braços, os ângulos são 0°, 120° e 240°, a volta dividida em três.",
      lines: [
        {
          code: "const bracos = 3;",
          text: "Quantos braços a galáxia tem.",
        },
        {
          code: "const braco = i % bracos;",
          text: "O resto da divisão de i por 3: 0, 1, 2, 0, 1, 2… O operador `%` reparte os pontos entre os braços em rodízio, sem sortear nada.",
        },
        {
          code: "const angulo = (braco / bracos) * Math.PI * 2;",
          text: "O ângulo do braço: a fração da volta (0, 1/3 ou 2/3) vezes a volta inteira, 2π. Os pontos de um braço têm todos o mesmo ângulo, e só o raio muda: uma reta saindo do centro.",
        },
      ],
      why: [
        {
          title: "Por que `i % bracos`, e não sortear o braço?",
          text: "Com o resto, cada braço recebe exatamente a mesma quantidade de pontos. Sortear com `Math.floor(Math.random() * bracos)` daria braços quase iguais, com um sorteio a mais por ponto. Os dois funcionam; o resto é mais simples.",
        },
      ],
      try: ["Mude `bracos` para 2, 5 e 8.", "Que tal `bracos = 1`?"],
      needs: ["galaxia"],
      checks: [
        {
          text: "Os pontos formam braços retos saindo do centro",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const arms = armsOf(cloudOf(objects.galaxia));
            if (arms.strength < 0.8) return check(false, "os pontos ainda estão espalhados em todas as direções");
            return check(Math.abs(arms.k) < 0.1, `achei ${arms.arms} ${arms.arms === 1 ? "braço" : "braços"}, mas eles se curvam`);
          },
        },
      ],
    },
    {
      id: "espiral",
      title: "A espiral",
      view: "camera",
      goal:
        "Para os braços virarem espiral, cada ponto gira mais quanto mais longe do centro estiver: some ao ângulo o raio vezes uma curvatura. Perto do centro, o braço quase não gira; na borda, gira muito.",
      lines: [
        {
          code: "const curvatura = 1;",
          text: "Quanto o braço gira por unidade de distância, em radianos. Com curvatura 1 e raio 5, a ponta do braço gira 5 radianos, uns 286°.",
        },
        {
          code: "const angulo = (braco / bracos) * Math.PI * 2 + r * curvatura;",
          text: "O ângulo do braço mais r · curvatura. É a espiral de Arquimedes, θ = θ₀ + k · r: o ângulo cresce com a distância, e a cada volta o braço se afasta a mesma distância do centro.",
        },
      ],
      why: [
        {
          title: "Por que uma conta tão simples?",
          text: "Os braços das galáxias de verdade lembram mais espirais logarítmicas, em que a distância ao centro é multiplicada pelo mesmo fator a cada volta. A de Arquimedes é uma soma só e já engana bem o olho. Trocar a conta é um bom exercício quando o projeto estiver pronto.",
        },
        {
          title: "Por que a espiral é feita no sorteio, e não girando o objeto?",
          text: "Girar o objeto gira todos os pontos juntos, como um disco rígido. A espiral precisa que cada ponto gire um ângulo diferente, que depende do raio dele, e isso só dá para fazer ponto a ponto, na hora de calcular a posição.",
        },
      ],
      try: ["Mude `curvatura` para 0.3 e depois para 3.", "Use uma curvatura negativa: a espiral gira para o outro lado."],
      needs: ["galaxia"],
      checks: [
        {
          text: "Os braços se curvam em espiral",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const arms = armsOf(cloudOf(objects.galaxia));
            if (arms.strength < 0.8) return check(false, "não achei braços: os pontos estão espalhados");
            return check(Math.abs(arms.k) >= 0.2, "os braços ainda são retos");
          },
        },
      ],
    },
    {
      id: "dispersao",
      title: "Dispersão",
      view: "camera",
      goal:
        "Estrelas não ficam em fila. Cada ponto sai um pouco do lugar, com um desvio sorteado em torno de zero: quase sempre pequeno, às vezes grande. É a distribuição normal (a curva do sino), que deixa o braço cheio no meio e com as bordas se desfazendo. Na altura, o desvio é menor, para o disco continuar achatado.",
      lines: [
        {
          code: "const dispersao = 0.3;",
          text: "O tamanho típico do desvio, em unidades da cena: o desvio padrão. Uns dois terços dos pontos ficam a menos de 0,3 do braço, e quase todos a menos de 0,9 (três desvios).",
        },
        {
          code: "function gaussiana() {",
          text: "Uma função nossa, porque o JavaScript só sorteia números por igual entre 0 e 1. Ela transforma dois desses sorteios num número com distribuição normal, de média 0 e desvio padrão 1.",
        },
        {
          code: "const u = 1 - Math.random();",
          text: "Um sorteio entre 0 e 1 que nunca dá 0: `Math.random()` pode dar 0, mas nunca 1, então `1 - Math.random()` pode dar 1, mas nunca 0. Importa porque o logaritmo de 0 é −∞.",
        },
        {
          code: "return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);",
          text: "A transformação de Box–Muller: `v` vira um ângulo e `u` vira uma distância (o logaritmo de um número até 1 é negativo ou zero, então `-2 * Math.log(u)` nunca é negativo). O cosseno projeta esse ponto num eixo.",
        },
        {
          code: "posicoes[i3] = Math.cos(angulo) * r + gaussiana() * dispersao;",
          text: "A posição no braço mais um desvio. Um sorteio para x e outro para z: o ponto sai do braço para qualquer lado.",
        },
        {
          code: "posicoes[i3 + 1] = gaussiana() * dispersao * 0.3;",
          text: "A altura, com 30% da dispersão: a galáxia ganha espessura, mas continua um disco fino.",
        },
      ],
      why: [
        {
          title: "Por que a distribuição normal, e não Math.random()?",
          text: "Com `(Math.random() - 0.5) * dispersao`, todo desvio até um limite é igualmente provável, e o braço vira uma faixa de bordas retas. Na normal, desvios pequenos são comuns e grandes são raros: o braço fica denso no meio e se desfaz aos poucos, como uma nuvem de estrelas.",
        },
        {
          title: "De onde vem a fórmula de Box–Muller?",
          text: "Dois números normais independentes, vistos como um ponto (x, y), formam uma nuvem redonda: a chance só depende da distância ao centro. Essa nuvem é fácil de sortear por ângulo e distância. O ângulo é uniforme (2πv); a distância sai de inverter a chance de cair fora de um raio r, que é e^(−r²/2), e dá √(−2 ln u). O cosseno pega o x do ponto; o seno daria um segundo número normal de graça.",
        },
        {
          title: "Por que um sorteio para cada eixo?",
          text: "Com o mesmo número em x, y e z, todo desvio apontaria na mesma diagonal, e os braços ficariam esticados numa direção só. Sorteios independentes espalham os pontos em volta do braço por igual.",
        },
      ],
      try: [
        "Mude `dispersao` para 0.1 e depois para 1. Com 1, os braços se desfazem, e a conferência avisa.",
        "Troque o `0.3` da altura por `1`: a galáxia engorda.",
        "Troque `gaussiana()` por `(Math.random() - 0.5) * 2` em x e z e compare as bordas dos braços.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A galáxia ganhou espessura",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const sample = cloudOf(objects.galaxia);
            const height = extent(sample, 1).size;
            return check(height > 0.02 * maxRadius(sample), height === 0 ? "todos os pontos têm y = 0" : `tem só ${fmt(height, 3)} de altura`);
          },
        },
        {
          text: "E continua achatada, bem mais larga que alta",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            const sample = cloudOf(objects.galaxia);
            const height = extent(sample, 1).size;
            const width = Math.max(extent(sample, 0).size, extent(sample, 2).size);
            return check(height < 0.2 * width, `tem ${fmt(height)} de altura para ${fmt(width)} de largura`);
          },
        },
        {
          text: "Os braços ainda aparecem",
          test: ({ objects }) => {
            const empty = noPoints(objects.galaxia);
            if (empty) return empty;
            return check(armsOf(cloudOf(objects.galaxia), { inner: 0.3 }).strength >= 0.25, "a dispersão desfez os braços");
          },
        },
      ],
    },
    {
      id: "cores",
      title: "Cores",
      view: "camera",
      goal:
        "No centro das galáxias há mais estrelas velhas, alaranjadas; nos braços, estrelas jovens e azuladas. Cada ponto ganha uma cor entre o laranja do núcleo e o azul da borda, conforme a distância ao centro. A cor de cada vértice fica num segundo atributo da geometria, como as posições.",
      lines: [
        {
          code: 'const corNucleo = new THREE.Color("#ffb46b");',
          text: "A cor do centro, um laranja claro.",
        },
        {
          code: 'const corBorda = new THREE.Color("#4b6bff");',
          text: "A cor da borda, um azul.",
        },
        {
          code: "const cores = new Float32Array(quantidade * 3);",
          text: "Outra lista do mesmo tamanho: agora os três números de cada ponto são o vermelho, o verde e o azul, de 0 a 1.",
        },
        {
          code: "const cor = new THREE.Color();",
          text: "Uma cor de rascunho, criada uma vez fora do laço e reaproveitada em todos os pontos.",
        },
        {
          code: "cor.lerpColors(corNucleo, corBorda, r / raio);",
          text: "Interpolação linear (lerp) entre as duas cores: com 0, a cor do núcleo; com 1, a da borda; com 0,5, a do meio do caminho. `r / raio` vai de 0 no centro a 1 na borda.",
        },
        {
          code: "cores[i3] = cor.r;",
          text: "Copia o vermelho, o verde e o azul da cor para a lista, nas mesmas casas que a posição do ponto ocupa na outra.",
        },
        {
          code: 'geometria.setAttribute("color", new THREE.BufferAttribute(cores, 3));',
          text: "A lista vira o atributo `color` da geometria. O vértice i tem a posição nas casas 3i a 3i + 2 de uma lista e a cor nas mesmas casas da outra.",
        },
        {
          code: "vertexColors: true,",
          text: "Manda o material usar o atributo `color` de cada vértice. Sem isso, o atributo fica na geometria, mas tudo é pintado com a cor do material.",
        },
      ],
      why: [
        {
          title: "Por que criar a cor de rascunho fora do laço?",
          text: "`new THREE.Color()` dentro do laço criaria 50 mil objetos que viram lixo logo em seguida, e o navegador gastaria tempo recolhendo. Uma cor reaproveitada não cria nada. O hábito vale para vetores, matrizes e cores em qualquer laço do Three.js.",
        },
        {
          title: "Por que a cor vai de 0 a 1, e não de 0 a 255?",
          text: "A placa de vídeo trabalha com cada canal de 0 a 1. O Three.js também guarda as cores em espaço linear, onde somar e interpolar luz dá o resultado fisicamente certo: o `\"#ffb46b\"` do código foi convertido quando a cor foi criada. É nesse espaço que a mistura aditiva soma a luz dos pontos.",
        },
        {
          title: "Por que a cor depende do raio?",
          text: "Para contar a história da galáxia: estrelas velhas no centro, jovens nos braços. E é uma conta por ponto, como a espiral, que usa o r já sorteado.",
        },
      ],
      try: [
        'Troque as cores. Que tal `"#ff3d7f"` no núcleo?',
        "Use `(r / raio) ** 2` no lugar de `r / raio`: o laranja ocupa mais do disco.",
        "Desligue `vertexColors` e veja a galáxia voltar ao branco.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A geometria tem o atributo color",
          test: ({ objects }) => check(!!objects.galaxia.geometry?.attributes.includes("color"), "a geometria só tem " + (objects.galaxia.geometry?.attributes.join(", ") || "nada")),
        },
        {
          text: "O material usa a cor de cada vértice (vertexColors: true)",
          test: ({ objects }) => check(!!objects.galaxia.material?.vertexColors, "vertexColors está desligado"),
        },
        {
          text: "O centro e a borda têm cores diferentes",
          test: ({ objects }) => {
            const inside = meanColor(objects.galaxia, (t) => t < 0.3);
            const outside = meanColor(objects.galaxia, (t) => t > 0.7);
            if (!inside || !outside) return check(false, "não há uma cor para cada ponto");
            return check(Math.hypot(...inside.map((c, i) => c - outside[i])) > 0.15, "o centro e a borda têm quase a mesma cor");
          },
        },
      ],
    },
    {
      id: "movimento",
      title: "Movimento",
      view: "camera",
      goal:
        "Agora a galáxia gira. No código vivo, a função `animar(tempo)` roda a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou. Basta dizer qual é o ângulo da galáxia em cada instante.",
      lines: [
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama esta função antes de desenhar cada quadro. No seu computador, quem faz isso é você: `renderer.setAnimationLoop` chama a sua função a cada quadro da tela.",
        },
        {
          code: "galaxia.rotation.y = tempo * 0.1;",
          text: "O ângulo em torno do eixo y (o vertical) cresce com o tempo: 0,1 radiano por segundo, uma volta a cada 63 segundos (2π / 0,1). Como depende do tempo, e não de quantos quadros passaram, a velocidade é a mesma numa tela de 60 ou de 144 quadros por segundo.",
        },
      ],
      why: [
        {
          title: "Por que girar o objeto, e não os pontos?",
          text: "Girar o objeto muda poucos números: a matriz da galáxia, que vai para a placa de vídeo, onde os 50 mil vértices são girados em paralelo. Mudar as posições na lista pediria refazer 150 mil números no processador e enviar tudo de novo à placa a cada quadro.",
        },
        {
          title: "Por que calcular pelo tempo, e não somar um pouco a cada quadro?",
          text: "`galaxia.rotation.y += 0.002` também gira, mas a velocidade passa a depender de quantos quadros a tela desenha por segundo. Pelo tempo, o resultado é o mesmo em qualquer computador. O segundo argumento de `animar`, `delta`, é o tempo desde o quadro anterior, para quando somar for preciso.",
        },
        {
          title: "E se o centro girasse mais rápido que a borda?",
          text: "Nas galáxias de verdade é assim: cada estrela tem a sua velocidade. Para isso, cada ponto giraria um ângulo diferente a cada quadro. No processador, isso custa caro; num shader, na placa de vídeo, é barato. É o projeto avançado Galáxia viva.",
        },
      ],
      try: [
        "Troque `0.1` por `-0.3`.",
        "Acrescente `galaxia.rotation.x = Math.sin(tempo) * 0.2;` dentro de `animar`: a galáxia balança.",
        "Use o botão ⏸ Pausar: o tempo para, e a galáxia também.",
      ],
      needs: ["galaxia"],
      checks: [
        {
          text: "A galáxia gira em torno do eixo y em animar()",
          test: ({ animated, hasAnimar }) =>
            hasAnimar ? check(animated.has("galaxia.rotation.y"), "animar() não muda galaxia.rotation.y") : check(false, "não achei a função animar(tempo)"),
        },
      ],
    },
    {
      id: "ceu",
      title: "Céu estrelado",
      view: "camera",
      goal:
        "Para terminar, um céu ao fundo: 2.000 estrelas distantes, numa esfera grande em volta da galáxia, espalhadas por igual em todas as direções. Sortear direções por igual numa esfera tem uma armadilha, e o jeito certo usa a mesma `gaussiana()` do passo 7.",
      lines: [
        {
          code: "const quantidadeEstrelas = 2000;",
          text: "As estrelas do fundo: poucas, porque são só um pano de fundo.",
        },
        {
          code: "const direcao = new THREE.Vector3();",
          text: "Um vetor de rascunho, reaproveitado como a cor do passo 8.",
        },
        {
          code: "direcao.set(gaussiana(), gaussiana(), gaussiana()).normalize().multiplyScalar(40);",
          text: "Três números normais formam um ponto numa nuvem redonda em volta da origem. `normalize()` estica ou encolhe o vetor até o comprimento 1, levando o ponto para a superfície de uma esfera, e `multiplyScalar(40)` empurra o ponto para o raio 40, longe da galáxia.",
        },
        {
          code: "direcao.toArray(posicoesCeu, i * 3);",
          text: "Escreve x, y e z do vetor na lista, a partir da casa i · 3.",
        },
        {
          code: "sizeAttenuation: false,",
          after: "const materialCeu",
          text: "Sem a atenuação, `size` passa a ser em pixels, e não em unidades da cena: toda estrela do fundo tem 1,5 pixel, a qualquer distância.",
        },
        {
          code: "blending: THREE.AdditiveBlending,",
          after: "const materialCeu",
          text: "Também soma: uma estrela do fundo atrás da galáxia soma a sua luz à dela, em qualquer ordem que a placa desenhe os dois objetos.",
        },
        {
          code: "const ceu = new THREE.Points(geometriaCeu, materialCeu);",
          text: "Um segundo objeto `Points`, com geometria e material próprios: outras estrelas, desenhadas de outro jeito.",
        },
      ],
      why: [
        {
          title: "Por que três gaussianas, e não dois ângulos sorteados?",
          text: "Sortear longitude e latitude por igual parece certo, mas junta estrelas nos polos: os paralelos perto dos polos são voltas pequenas e recebem tantas estrelas quanto o equador. A nuvem de três normais é redonda, sem direção preferida, então as direções saem por igual. Outro jeito clássico é sortear y por igual entre −1 e 1, além do ângulo: pelo teorema de Arquimedes, faixas de mesma altura numa esfera têm a mesma área.",
        },
        {
          title: "Por que o tamanho em pixels?",
          text: "Em unidades da cena, o tamanho depende da distância: a 40 de distância, um `size` de 1,5 vira uma bolinha de uns 10 pixels. Em pixels, todas as estrelas do fundo têm o mesmo tamanho na tela, que é o que se espera de algo muito longe. A distância de 40 é só para elas ficarem atrás de tudo.",
        },
        {
          title: "Por que não uma imagem de fundo?",
          text: "Uma textura em volta da cena (um skybox) também funciona e permite céus fotográficos. Os pontos ocupam quase nada de memória, ficam nítidos em qualquer resolução e reaproveitam tudo o que você já escreveu.",
        },
      ],
      try: [
        "Troque o `40` por `8`: as estrelas entram na galáxia.",
        "Mude `sizeAttenuation` do céu para `true` e veja as estrelas do fundo virarem bolinhas.",
        "Para ver a armadilha, troque a linha do `direcao.set` por `direcao.setFromSphericalCoords(40, Math.random() * Math.PI, Math.random() * Math.PI * 2);` e olhe para cima: a conferência avisa.",
      ],
      needs: ["ceu"],
      checks: [
        {
          text: "Há um segundo objeto THREE.Points chamado ceu",
          test: ({ objects }) => check(objects.ceu.type === "Points", `ceu é um ${objects.ceu.type}`),
        },
        {
          text: "Todas as estrelas do céu estão à mesma distância do centro",
          test: ({ objects }) => {
            const empty = noPoints(objects.ceu);
            if (empty) return empty;
            const d = cloudOf(objects.ceu).map((p) => Math.hypot(...p));
            const mean = d.reduce((a, b) => a + b, 0) / d.length;
            return check(mean > 0 && (Math.max(...d) - Math.min(...d)) / mean < 0.05, `as distâncias vão de ${fmt(Math.min(...d))} a ${fmt(Math.max(...d))}`);
          },
        },
        {
          text: "Elas ficam longe, depois da borda da galáxia",
          test: ({ objects }) => {
            const empty = noPoints(objects.ceu);
            if (empty) return empty;
            const d = cloudOf(objects.ceu).map((p) => Math.hypot(...p));
            const mean = d.reduce((a, b) => a + b, 0) / d.length;
            const edge = objects.galaxia ? maxRadius(cloudOf(objects.galaxia)) : 5;
            return check(mean >= 2 * edge, `estão a ${fmt(mean)} do centro, e a galáxia vai até ${fmt(edge)}`);
          },
        },
        {
          text: "Elas se espalham por igual, sem se juntar nos polos",
          test: ({ objects }) => {
            const empty = noPoints(objects.ceu);
            if (empty) return empty;
            const sample = cloudOf(objects.ceu);
            const up = sample.map((p) => p[1] / (Math.hypot(...p) || 1));
            const poles = up.filter((u) => Math.abs(u) > 0.9).length / up.length;
            const north = up.filter((u) => u > 0).length / up.length;
            if (poles >= 0.2) return check(false, `${Math.round(poles * 100)}% das estrelas estão perto dos polos; por igual seriam 10%`);
            return check(north >= 0.3 && north <= 0.7, `${Math.round(north * 100)}% das estrelas estão acima do horizonte`);
          },
        },
        {
          text: "O tamanho delas é em pixels (sizeAttenuation: false)",
          test: ({ objects }) => check(objects.ceu.material?.sizeAttenuation === false, "sizeAttenuation está ligado"),
        },
      ],
    },
  ].map((step, i) => ({ ...step, code: codeAt(i + 1) })),
};
