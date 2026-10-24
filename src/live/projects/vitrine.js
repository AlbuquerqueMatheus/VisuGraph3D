// vitrine.js — o projeto "Vitrine de materiais": a mesma esfera três vezes, sob as mesmas luzes,
// com Lambert, Phong e Standard, em 8 passos no VisuGraph e 1 no seu computador. O assunto é a
// conta da luz que cada material faz: a difusa, o brilho especular, a aspereza e o metal.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js), e os textos
// seguem os outros projetos: `assim` é código, e `lines` aponta trechos do código do passo (o
// primeiro depois de `after`, quando o trecho se repete). Os pedestais e as amostras saem de laços:
// a conferência mede todos eles pelas cópias (`copies`) dos fatos.

import { axisOf, check, dist, fmt, isRound, luminance, sphereRadius, toWorld } from "./checks.js";
import { distanceAttenuation } from "../../lib/phong3d.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, from } from "./source.js";

/** O material das três esferas no passo 2, antes de cada uma ganhar o seu. */
const BASIC = '  new THREE.MeshBasicMaterial({ color: "#e0533d" })';

const SOURCE = [
  from(0, "// Vitrine de materiais"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#111317");',
    "",
    "const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 5, 16);",
    "camera.lookAt(0, 1, 0);",
  ),
  from(
    3,
    "",
    "// As luzes, as mesmas para todas: o sol, que vem de cima, e o céu, que clareia a sombra",
    'const sol = new THREE.DirectionalLight("#ffffff", 2.2);',
    "sol.position.set(-4, 6, 5);",
    "cena.add(sol);",
    "",
    'const ceu = new THREE.HemisphereLight("#cfe0ff", "#4a3b2f", 1);',
    "cena.add(ceu);",
  ),
  from(2, "", "// Uma geometria só para as três esferas: muda só o material", "const forma = new THREE.SphereGeometry(1, 64, 32);", "", "const lambert = new THREE.Mesh(", "  forma,"),
  by({ 2: BASIC, 3: '  new THREE.MeshLambertMaterial({ color: "#e0533d" })' }),
  from(2, ");", "lambert.position.set(-2.6, 1.6, 0);", "cena.add(lambert);", "", "const phong = new THREE.Mesh(", "  forma,"),
  by({ 2: BASIC, 4: '  new THREE.MeshPhongMaterial({ color: "#e0533d", specular: "#ffffff", shininess: 60 })' }),
  from(2, ");", "phong.position.set(0, 1.6, 0);", "cena.add(phong);", "", "const standard = new THREE.Mesh(", "  forma,"),
  by({ 2: BASIC, 5: '  new THREE.MeshStandardMaterial({ color: "#e0533d", roughness: 0.35, metalness: 0 })' }),
  from(2, ");", "standard.position.set(2.6, 1.6, 0);", "cena.add(standard);"),
  from(
    6,
    "",
    "// O chão e um pedestal debaixo de cada esfera, todos da mesma pedra",
    'const pedra = new THREE.MeshStandardMaterial({ color: "#30333b", roughness: 0.6 });',
    "",
    "const chao = new THREE.Mesh(new THREE.CircleGeometry(8, 64), pedra);",
    "chao.rotation.x = -Math.PI / 2;",
    "cena.add(chao);",
    "",
    "const formaPedestal = new THREE.CylinderGeometry(0.7, 0.85, 0.6, 48);",
    "for (const esfera of [lambert, phong, standard]) {",
    "  const pedestal = new THREE.Mesh(formaPedestal, pedra);",
    "  pedestal.position.set(esfera.position.x, 0.3, 0);",
    "  cena.add(pedestal);",
    "}",
  ),
  from(
    7,
    "",
    "// A escala de aspereza: da esquerda, lisa, para a direita, fosca",
    "const formaAmostra = new THREE.SphereGeometry(0.4, 48, 24);",
    "for (let i = 0; i < 5; i++) {",
    "  const amostra = new THREE.Mesh(",
    "    formaAmostra,",
    '    new THREE.MeshStandardMaterial({ color: "#e0533d", roughness: i / 4 })',
    "  );",
    "  amostra.position.set(-2.4 + i * 1.2, 0.4, 3.6);",
    "  cena.add(amostra);",
    "}",
  ),
  from(
    8,
    "",
    "// Uma lâmpada que dá voltas em cima da vitrine",
    'const lampada = new THREE.PointLight("#ffd9a0", 12);',
    "lampada.position.set(4, 3.5, 0);",
    "cena.add(lampada);",
    "",
    "const bulbo = new THREE.Mesh(",
    "  new THREE.SphereGeometry(0.08, 16, 8),",
    '  new THREE.MeshBasicMaterial({ color: "#ffd9a0" })',
    ");",
    "lampada.add(bulbo);",
    "",
    "function animar(tempo) {",
    "  lampada.position.x = Math.cos(tempo) * 4;",
    "  lampada.position.z = Math.sin(tempo) * 4;",
    "}",
  ),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: as esferas são medidas pela amostra de vértices, e os pedestais e as amostras,
// que saem de laços, pelas cópias de cada um

/** As três esferas grandes, da esquerda para a direita. */
const SPHERES = ["lambert", "phong", "standard"];

/** Metade da largura da vitrine, das esferas das pontas (centro em ±2,6 e raio 1), com uma folga. */
const HALF_WIDTH = 3.8;

/**
 * O visor mais estreito em que a vitrine tem de caber, largura / altura: o do VisuGraph com o
 * painel do projeto aberto, numa tela de 1440 × 900.
 */
const NARROW = 0.7;

/**
 * A que distância do centro a câmera precisa ficar para a vitrine caber de ponta a ponta no visor
 * mais estreito. O campo de visão `fov` (em graus) é o vertical; o horizontal sai da proporção.
 */
const fitDistance = (fov) => HALF_WIDTH / (Math.tan((fov * Math.PI) / 360) * NARROW);

/** Materiais que calculam a luz que chega a cada ponto. */
const LIT = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial"];

/** "a, b e c" */
const joinAnd = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : items[0]);

/** O objeto e os outros que a mesma linha do código criou, num laço. */
const all = (obj) => [obj, ...(obj.copies ?? [])];

/** Centro de uma caixa { min, max }. */
const centerOf = (box) => [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2);

/** Direção, com comprimento 1, do ponto a para o ponto b. */
function toward(a, b) {
  const v = [0, 1, 2].map((i) => b[i] - a[i]);
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

/** Brilho (0 a 1) de uma cor [r, g, b] em sRGB, como a luminance() de "#rrggbb". */
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Uma cor [r, g, b] (0 a 1) escrita como no código: "#rrggbb". */
const hexOf = (rgb) => "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

/** Nome do pai do objeto no código: "a cena" se está direto nela. */
const parentName = (obj, nameOf) => (obj.parent == null ? "a cena" : (nameOf(obj.parent) ?? "outro objeto"));

/** Confere que o material da malha é de um dos tipos. */
function materialIs(obj, ...types) {
  const type = obj.material?.type ?? null;
  if (types.includes(type)) return check(true);
  return check(false, type === "MeshBasicMaterial" ? "é MeshBasicMaterial, que ignora a luz" : `é ${type ?? "outro material"}`);
}

/** Confere que as esferas `names` têm a cor da primeira delas. */
function sameColor(objects, names) {
  const [first, ...rest] = names;
  const hex = objects[first].material?.hex ?? "sem cor";
  const odd = rest.find((n) => (objects[n].material?.hex ?? "sem cor") !== hex);
  return check(!odd, odd && `${odd} é ${objects[odd].material?.hex ?? "sem cor"}, e ${first}, ${hex}`);
}

/** Uma luz acesa do tipo, na cena. */
const litOf = (lights, type) => lights.filter((l) => l.type === type);

/** Confere que todas as malhas são de materiais que reagem à luz. */
function allLit(entries) {
  const odd = entries.find(([, obj]) => !LIT.includes(obj.material?.type));
  return check(!odd, odd && `${odd[0]} é ${odd[1].material?.type ?? "outro material"}, que não reage à luz`);
}

// ---------------------------------------------------------------------------
// No seu computador: o projeto Vite com o código do fim do passo 8 em src/cena.js

const END = codeAt(8);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: ["0", "1", "0"] };

const COMPUTER = [
  computerStep({
    id: "vitrine",
    title: "Vitrine de materiais",
    end: END,
    options: OPTIONS,
    words: {
      yours: "a sua vitrine",
      browser: "o código da vitrine precisa dele no navegador",
      privates: "`forma`, `pedra`, `bulbo` e o resto",
      stretched: "as esferas saem esticadas ou achatadas",
      jump: "a lâmpada daria um salto",
      animarStep: 8,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor, girava a vista com o mouse e chamava `animar` a cada quadro. Neste passo, a vitrine vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, e o que o VisuGraph fazia fica escrito no `src/main.js`, junto com os OrbitControls, que giram a câmera com o mouse. Se você já levou outro projeto para o computador, os arquivos são os mesmos: só o `cena.js` muda.",
    why: [
      {
        title: "Por que andar em volta da vitrine?",
        text: "Com os OrbitControls, a câmera anda e as luzes ficam paradas, e essa é a melhor prova do que cada material faz. O brilho da `phong` e o da `standard` mudam de lugar conforme você gira, porque dependem de onde está o olho. O claro e o escuro da `lambert` continuam iguais de qualquer lado, porque a difusa não depende do olho.",
      },
    ],
    try: [
      "No `main.js`, depois do `enableDamping`, acrescente `controles.maxPolarAngle = Math.PI / 2;`: a câmera para quando chega à altura do centro e nunca vê o chão por baixo.",
      "Acrescente também `controles.autoRotate = true;`: a câmera passa a dar voltas sozinha, e os brilhos andam pelas esferas.",
      'No `src/cena.js`, troque o material da `phong` por `new THREE.MeshToonMaterial({ color: "#e0533d" })` e salve: um material de desenho animado, com o claro e o escuro em duas faixas.',
      "A janela do navegador é mais larga que o visor do VisuGraph, então a vitrine sobra no meio da tela: role a roda do mouse para aproximar a câmera.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a vitrine aparece nele, com a lâmpada dando voltas",
      "Arrastar com o mouse gira a câmera em volta das esferas: o brilho da `phong` muda de lugar, e a `lambert` continua igual",
      "Mudar um número no `src/cena.js` e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const VITRINE = {
  id: "vitrine",
  title: "Vitrine de materiais",
  level: "facil",
  summary: "Três esferas iguais, sob as mesmas luzes: Lambert, Phong e Standard lado a lado mostram como cada material faz a conta da luz.",
  concepts: [
    "Luz direcional e luz do céu",
    "Lambert: a luz difusa",
    "Phong: o brilho especular",
    "Standard: aspereza e metal",
    "Normais",
    "Geometria compartilhada",
    "Laços que criam objetos",
    "Seno e cosseno",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "A vitrine vai mostrar a mesma esfera três vezes, lado a lado e sob as mesmas luzes, cada uma com um material do Three.js: Lambert, Phong e Standard. A forma, a cor e a luz são iguais nas três; muda só a conta que o material faz para decidir a cor de cada pixel. Primeiro, o palco: a cena, com um fundo escuro, e a câmera, de frente para a vitrine e longe o bastante para ela caber no visor. O VisuGraph já cria o renderer e o laço que redesenha o visor, então, por enquanto, o visor mostra só o fundo.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "Cria a cena, a raiz da árvore de objetos que o renderer desenha a cada quadro. As esferas, o chão e as luzes vão entrar nela com `cena.add`.",
        },
        {
          code: 'cena.background = new THREE.Color("#111317");',
          text: "Um fundo quase preto, como o de uma vitrine à noite. Os brilhos são o assunto deste projeto, e um brilho aparece pelo contraste: sobre o escuro, até o mais fraco se vê.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);",
          text: "Uma câmera com perspectiva. O primeiro número é o campo de visão vertical: 40°, mais fechado que os 50° a 75° de costume. Depois vêm a proporção da imagem (o visor troca o 16/9 pela dele) e as distâncias perto (0,1) e longe (100), fora das quais nada é desenhado.",
        },
        {
          code: "camera.position.set(0, 5, 16);",
          text: "Põe a câmera 16 unidades à frente da vitrine e 5 acima do chão. No Three.js, o y aponta para cima e o z, para fora da tela: com x = 0, a câmera fica bem no meio, de frente. Parece longe, e é de propósito: o visor do VisuGraph é mais alto que largo, e daqui a vitrine cabe nele de ponta a ponta.",
        },
        {
          code: "camera.lookAt(0, 1, 0);",
          text: "Gira a câmera para o ponto (0; 1; 0), no meio da vitrine, um pouco abaixo do centro das esferas, que vai ficar a 1,6 do chão. Ela olha de cima para baixo, uns 14°, e vê as esferas e o chão na frente delas.",
        },
      ],
      why: [
        {
          title: "Por que um campo de visão tão fechado?",
          text: "Na perspectiva, o que fica perto da borda da imagem sai esticado: uma esfera no canto vira um ovo, e quanto mais aberto o ângulo, maior o efeito. Com 40° e a câmera mais longe, a vitrine cabe na imagem quase sem deformação, como na lente comprida de um fotógrafo de produtos. Numa vitrine, em que se comparam formas iguais, uma esfera oval atrapalharia.",
        },
        {
          title: "Por que a câmera tão longe?",
          text: "O campo de visão da PerspectiveCamera é o vertical: os 40° vão de baixo até em cima da imagem. A largura sai da proporção do visor: num visor largo, vê-se mais dos lados; num estreito, menos. Com o painel do projeto aberto, numa tela de notebook, o visor do VisuGraph tem uns 0,7 de largura para 1 de altura, e a vitrine, com 7,2 de uma ponta à outra, só cabe nele com a câmera a uns 15 do centro. A conferência faz essa conta com o seu campo de visão: com um ângulo menor, a câmera precisa ir mais longe.",
        },
        {
          title: "Por que um fundo escuro?",
          text: "O olho julga o claro pelo que está em volta: a mesma mancha parece mais forte num fundo escuro. Como este projeto é sobre brilhos, o fundo escuro deixa ver até os mais fracos, e um cinza neutro não briga com o vermelho das esferas.",
        },
      ],
      try: [
        "Troque o `40` por `90`: a conferência avisa que, assim, as esferas das pontas sairiam ovais. Depois volte para 40.",
        "Desligue a Câmera do código, na barra de cima, e gire a vista arrastando o visor: a câmera do código aparece como um ícone, e a abertura dele é o campo de visão de 40°.",
      ],
      needs: [],
      checks: [
        {
          text: "A cena tem um fundo escuro",
          test: ({ background }) =>
            background ? check(luminance(background) < 0.15, `o fundo é ${background}, claro demais para uma vitrine à noite`) : check(false, "a cena não tem cor de fundo"),
        },
        {
          text: "A câmera fica de frente para a vitrine, longe o bastante para ela caber no visor",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const [x, y, z] = camera.worldPosition;
            if (z <= 0) return check(false, "a câmera está atrás da vitrine, ou ao lado dela");
            const side = (Math.atan2(Math.abs(x), z) * 180) / Math.PI;
            if (side > 15) return check(false, `a câmera está ${fmt(side, 0)}° para o lado: as esferas ficariam umas atrás das outras`);
            if (y <= 0) return check(false, "a câmera está abaixo do chão");
            if (!camera.fov) return check(false, "a câmera do código não é uma PerspectiveCamera");
            const d = dist(camera.worldPosition, [0, 1, 0]);
            const need = fitDistance(camera.fov);
            return check(d >= need, `a câmera está a ${fmt(d, 1)} do centro: com ${fmt(camera.fov, 0)}° de campo de visão, as esferas das pontas só cabem num visor estreito de ${fmt(need, 1)} para trás`);
          },
        },
        {
          text: "Ela olha para o centro da vitrine, de um pouco acima (5° a 35°)",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const to = toward(camera.worldPosition, [0, 1, 0]);
            const cos = to.reduce((sum, c, i) => sum + c * camera.direction[i], 0);
            if (cos < 0.995) return check(false, `a câmera olha ${fmt((Math.acos(Math.min(1, cos)) * 180) / Math.PI, 0)}° para fora do centro`);
            const angle = (Math.asin(-to[1]) * 180) / Math.PI;
            if (angle < 5) return check(false, angle < 0 ? "a câmera olha de baixo para cima" : `a câmera olha quase na horizontal, só ${fmt(angle, 0)}° para baixo`);
            return check(angle <= 35, `a câmera olha ${fmt(angle, 0)}° para baixo: quase de cima, as esferas viram círculos sem volume`);
          },
        },
        {
          text: "O campo de visão é fechado, de no máximo 50°",
          test: ({ camera }) => {
            if (!camera?.fov) return check(false, "a câmera do código não é uma PerspectiveCamera");
            return check(camera.fov <= 50, `o campo de visão é de ${fmt(camera.fov, 0)}°: as esferas das pontas sairiam ovais`);
          },
        },
      ],
    },
    {
      id: "esferas",
      title: "Três esferas, sem luz",
      view: "camera",
      goal:
        "As três esferas da vitrine usam a mesma geometria e, por enquanto, o mesmo material: o `MeshBasicMaterial`, que pinta todos os pixels da malha com a cor dele, sem conta de luz nenhuma. O resultado são três discos vermelhos chapados, sem lado claro nem escuro. É o ponto de partida: nos próximos passos, cada esfera troca de material, e o volume aparece quando a luz entra na conta.",
      lines: [
        {
          code: "const forma = new THREE.SphereGeometry(1, 64, 32);",
          text: "Uma esfera de raio 1, com 64 fatias em volta e 32 faixas de um polo ao outro: uns 4 mil triângulos, para o contorno ficar redondo e o brilho correr liso pela superfície. A geometria fica numa variável porque as três esferas vão usar a mesma.",
        },
        {
          code: "const lambert = new THREE.Mesh(",
          text: "A primeira malha junta a geometria `forma` com um material. Os nomes já dizem o material que cada esfera vai ganhar: `lambert`, `phong` e `standard`.",
        },
        {
          code: BASIC.trim(),
          after: "const lambert",
          text: "O material sem luz: todos os pixels saem da mesma cor, um vermelho-tomate. Sem diferença entre claro e escuro, a esfera parece um disco.",
        },
        {
          code: "lambert.position.set(-2.6, 1.6, 0);",
          text: "2,6 para a esquerda e 1,6 para cima: no passo 6, a esfera vai ficar em cima de um pedestal de 0,6 de altura. De um centro ao outro, são 2,6; entre as superfícies, sobra 0,6.",
        },
        {
          code: "phong.position.set(0, 1.6, 0);",
          text: "A do meio fica bem no centro, na frente da câmera.",
        },
        {
          code: "standard.position.set(2.6, 1.6, 0);",
          text: "E a terceira vai para a direita, à mesma distância da do meio.",
        },
      ],
      why: [
        {
          title: "Por que uma geometria só para as três?",
          text: "A geometria é a parte pesada de uma malha: a lista de vértices, com a posição e a normal de cada um, que vai para a memória da placa de vídeo. Várias malhas podem usar a mesma, cada uma com a sua posição e o seu material. Aqui, ela ainda garante uma comparação justa: as três esferas têm exatamente os mesmos triângulos.",
        },
        {
          title: "Por que a mesma cor?",
          text: "Para que a única diferença entre as três seja o material. Se uma fosse azul e a outra vermelha, não daria para saber se um brilho veio do material ou da cor.",
        },
        {
          title: "Por que tantos triângulos?",
          text: "Com poucos, o contorno fica quebrado em retas e o brilho sai torto: a normal de cada ponto, que diz para onde ele aponta, é uma média das normais dos vértices do triângulo, e num triângulo grande essa média erra. O brilho é pequeno e cai bem nos lugares onde o erro mais aparece.",
        },
      ],
      try: [
        "Troque o material da `lambert` por `new THREE.MeshNormalMaterial()`: as cores mostram para onde aponta cada ponto da superfície, a normal, vista da câmera. Mais vermelho é para a direita, mais verde é para cima, e mais azul é para quem olha. Depois volte para o vermelho.",
        "Clique numa das esferas no visor e olhe Propriedades: a geometria é a `forma`, usada também pelas outras duas. Mude ali os segmentos verticais para 4: as três viram octógonos de uma vez, porque a geometria é uma só. Depois volte para 32.",
      ],
      needs: ["lambert", "phong", "standard"],
      checks: [
        {
          text: "As três são esferas do mesmo tamanho, lado a lado, à mesma altura",
          test: ({ objects }) => {
            const flat = SPHERES.find((n) => !isRound(objects[n]));
            if (flat) return check(false, `${flat} não é redonda`);
            const [l, ...others] = SPHERES.map((n) => objects[n]);
            const r = sphereRadius(l);
            const bigger = SPHERES.slice(1).find((n, i) => Math.abs(sphereRadius(others[i]) - r) > 0.01);
            if (bigger) return check(false, `${bigger} tem raio ${fmt(sphereRadius(objects[bigger]))}, e lambert, ${fmt(r)}`);
            const y = l.worldPosition[1];
            const higher = SPHERES.slice(1).find((n, i) => Math.abs(others[i].worldPosition[1] - y) > 0.05);
            if (higher) return check(false, `${higher} está a ${fmt(objects[higher].worldPosition[1])} de altura, e lambert, a ${fmt(y)}`);
            const z = l.worldPosition[2];
            const ahead = SPHERES.slice(1).find((n, i) => Math.abs(others[i].worldPosition[2] - z) > 0.05);
            return check(!ahead, ahead && `${ahead} está mais para a frente ou para trás que lambert`);
          },
        },
        {
          text: "Da esquerda para a direita: lambert, phong e standard, sem encostar uma na outra",
          test: ({ objects }) => {
            const order = [...SPHERES].sort((a, b) => objects[a].worldPosition[0] - objects[b].worldPosition[0]);
            if (order.join() !== SPHERES.join()) return check(false, `da esquerda para a direita, estão ${joinAnd(order)}`);
            for (const [a, b] of [["lambert", "phong"], ["phong", "standard"]]) {
              // pelas caixas, para valer também quando uma delas não é redonda
              const [left, right] = [objects[a].box, objects[b].box];
              const gap = left && right ? right.min[0] - left.max[0] : Infinity;
              if (gap < 0.3) return check(false, gap < 0 ? `${a} e ${b} se encostam` : `sobra só ${fmt(gap)} entre ${a} e ${b}`);
            }
            return check(true);
          },
        },
        {
          text: "As três usam a mesma geometria",
          test: ({ objects }) => {
            const ids = SPHERES.map((n) => objects[n].geometry?.id ?? null);
            if (ids[0] != null && ids.every((id) => id === ids[0])) return check(true);
            const shared = ids.find((id, i) => id != null && ids.indexOf(id) !== i);
            if (shared == null) return check(false, "cada esfera tem a sua geometria");
            const alone = SPHERES.filter((n, i) => ids[i] !== shared);
            return check(false, `${joinAnd(alone)} tem uma geometria só dela`);
          },
        },
        {
          text: "As três têm a mesma cor",
          test: ({ objects }) => sameColor(objects, SPHERES),
        },
      ],
    },
    {
      id: "luz",
      title: "A luz e o Lambert",
      view: "camera",
      goal:
        "Agora entram as luzes, as mesmas para as três esferas até o fim do projeto: uma direcional, que faz o papel do sol, e uma luz do céu, que clareia o lado da sombra. A esfera da esquerda troca de material e vira `MeshLambertMaterial`, o mais simples que faz conta de luz: cada ponto fica mais claro quanto mais de frente estiver para a luz. As outras duas continuam chapadas, porque o `MeshBasicMaterial` ignora as luzes.",
      lines: [
        {
          code: 'const sol = new THREE.DirectionalLight("#ffffff", 2.2);',
          text: "Uma luz direcional: os raios chegam todos paralelos, como os do Sol, que está tão longe que a direção dele é a mesma em toda a cena. Branca, com intensidade 2,2. Numa superfície virada de frente para ela, a intensidade π (3,14) daria a cor cheia do material; 2,2 dá uns 70% dela, e a luz do céu completa.",
        },
        {
          code: "sol.position.set(-4, 6, 5);",
          text: "A luz direcional não tem lugar, só direção: ela vem da posição em direção ao alvo, que fica na origem. Daqui, vem de cima, da esquerda e da frente, e ilumina o lado das esferas que a câmera vê.",
        },
        {
          code: 'const ceu = new THREE.HemisphereLight("#cfe0ff", "#4a3b2f", 1);',
          text: "A luz do céu: vem de cima com a primeira cor, um azul bem claro, e de baixo com a segunda, um marrom de chão. Cada ponto recebe uma mistura das duas, conforme o lado para onde aponta: o alto das esferas puxa para o azul, e a base, para o marrom. Ela não faz brilho nem sombra, só clareia o que o sol não alcança.",
        },
        {
          code: 'new THREE.MeshLambertMaterial({ color: "#e0533d" })',
          text: "O material de Lambert: a mesma cor, agora com a conta da luz difusa. Cada ponto recebe a luz conforme o ângulo entre a normal dele e a direção da luz: de frente, tudo; de lado, nada.",
        },
      ],
      why: [
        {
          title: "Por que o claro vai virando escuro?",
          text: "Uma lanterna apontada de frente faz um círculo pequeno e forte; inclinada, a mesma luz se espalha numa mancha maior e mais fraca. Cada ponto da esfera está inclinado de um jeito, e recebe a luz na proporção do cosseno do ângulo entre a normal (a direção para onde o ponto aponta) e a direção da luz, o n·l. No ponto virado para o sol, o cosseno é 1; na borda, onde a luz passa de raspão, é 0. Johann Lambert descreveu essa lei em 1760. E a superfície de Lambert espalha a luz igual para todos os lados: por isso a cor de um ponto não muda quando a câmera anda.",
        },
        {
          title: "Por que uma luz direcional, e não uma pontual?",
          text: "Uma luz pontual enfraquece com a distância e chegaria mais forte na esfera mais perto dela. Na vitrine, as três têm de receber a mesma luz, e a direcional ilumina tudo por igual: a mesma direção e a mesma intensidade em qualquer ponto da cena.",
        },
        {
          title: "Por que uma luz do céu, e não uma ambiente?",
          text: "A `AmbientLight` soma a mesma luz em todos os pontos, e o lado da sombra volta a ficar chapado. A `HemisphereLight` muda com a direção: de cima vem o céu, de baixo vem o chão. É um jeito barato de imitar a luz que, na vida real, chega rebatida de tudo em volta.",
        },
      ],
      try: [
        "Desligue a Câmera do código e afaste a vista com a roda do mouse até aparecer, no alto, o ajudante do `sol`: um quadrado com uma linha que aponta para a origem, o alvo da luz. Clique em `sol` na lista de objetos e arraste a luz pelo gizmo: a parte clara da `lambert` acompanha.",
        "Abra a aba Matemática, ligue a caixa de vidro em Phong e clique num ponto da `lambert`: a sonda mostra a normal daquele ponto, o n·l e a parte de cada luz na cor do pixel.",
        'Troque a cor do `sol` por `"#4080ff"`, um azul: a esfera escurece, porque o material vermelho quase não reflete azul. Depois volte para o branco.',
      ],
      needs: ["lambert", "sol"],
      checks: [
        {
          text: "O sol é uma luz direcional, na cena, que vem de cima e da frente",
          test: ({ objects, lights }) => {
            const sol = objects.sol;
            if (sol.type !== "DirectionalLight") return check(false, `sol é ${sol.type}, não DirectionalLight`);
            if (!litOf(lights, "DirectionalLight").length) return check(false, "o sol não foi adicionado à cena");
            const l = toward(sol.target ?? [0, 0, 0], sol.worldPosition);
            if (l[1] < 0.3) return check(false, l[1] < 0 ? "a luz vem de baixo" : "a luz vem quase da altura das esferas: falta subir o sol");
            return check(l[2] > 0.2, "a luz vem de trás das esferas: o lado que a câmera vê fica no escuro");
          },
        },
        {
          text: "Ele ilumina sem estourar: intensidade entre 1 e 5",
          test: ({ objects }) => {
            const i = objects.sol.light?.intensity ?? 0;
            if (i < 1) return check(false, `a intensidade é ${fmt(i)}: fraca demais, as esferas ficam escuras`);
            return check(i <= 5, `a intensidade é ${fmt(i)}: forte demais, o lado claro estoura`);
          },
        },
        {
          text: "Uma luz do céu (HemisphereLight) clareia o lado da sombra",
          test: ({ lights }) => {
            const sky = litOf(lights, "HemisphereLight");
            if (!sky.length) return check(false, "não há HemisphereLight acesa na cena");
            const total = sky.reduce((sum, l) => sum + l.intensity, 0);
            if (total < 0.2) return check(false, `a intensidade é ${fmt(total)}: o lado da sombra fica preto`);
            if (total > 3) return check(false, `a intensidade é ${fmt(total)}: o lado da sombra fica tão claro quanto o do sol`);
            return check(lum(sky[0].color) > lum(sky[0].ground ?? [0, 0, 0]), "o chão (a segunda cor) está mais claro que o céu");
          },
        },
        {
          text: "A esfera da esquerda é de MeshLambertMaterial",
          test: ({ objects }) => materialIs(objects.lambert, "MeshLambertMaterial"),
        },
      ],
    },
    {
      id: "phong",
      title: "Phong: o brilho",
      view: "camera",
      goal:
        "A esfera do meio vira `MeshPhongMaterial`. Além da luz difusa, a do Lambert, ele soma o brilho especular: a mancha clara onde a luz se reflete na direção de quem olha, como numa bola de bilhar. A difusa é igual de qualquer lugar; o brilho depende de onde a câmera está. Bui Tuong Phong propôs essa conta em 1975, e ela é, até hoje, a primeira que se aprende em computação gráfica.",
      lines: [
        {
          code: "new THREE.MeshPhongMaterial(",
          text: "O material de Phong, com a mesma cor das outras para a parte difusa e duas opções a mais para o brilho.",
        },
        {
          code: 'specular: "#ffffff"',
          text: "A cor do brilho. Branca: o reflexo sai com a cor da luz, como num plástico ou numa tinta envernizada. O padrão é `#111111`, um cinza tão escuro que o brilho quase não aparece.",
        },
        {
          code: "shininess: 60",
          text: "O expoente do brilho: quanto maior, menor e mais concentrada a mancha. Com 5, ela se espalha como num tecido acetinado; com 200, vira um ponto, como numa bola de vidro. O padrão é 30.",
        },
      ],
      why: [
        {
          title: "Por que o brilho muda com a câmera?",
          text: "A difusa espalha a luz igual para todos os lados. A especular, não: quase toda a luz vai numa direção só, a do reflexo, como num espelho embaçado. O brilho aparece onde essa direção aponta para o olho, e por isso ele anda quando a câmera anda. Na conta, entra um vetor que a difusa não tem: o v, do ponto para a câmera.",
        },
        {
          title: "Phong ou Blinn-Phong?",
          text: "No Phong original, o brilho é (r·v)ⁿ: r é a direção do reflexo da luz, v a do olho, e n é o `shininess`. Em 1977, Jim Blinn trocou o r pelo vetor do meio, h, entre a luz e o olho: (n·h)ⁿ, mais barato de calcular e mais parecido com as fotos. O `MeshPhongMaterial` usa a versão de Blinn e ainda multiplica o brilho por um fator que cresce com o `shininess`, para a mancha menor sair também mais forte. No nível avançado, o projeto Phong escrito à mão faz essa conta num shader.",
        },
      ],
      try: [
        "Desligue a Câmera do código e gire a vista: o brilho da `phong` muda de lugar, e o claro da `lambert` fica onde estava.",
        "Mude o `shininess` para 5 e depois para 1000: a conferência avisa nos dois casos. Depois volte para 60.",
        "Na aba Matemática, ligue a caixa de vidro e clique no brilho da `phong`: a sonda mostra a parte especular. Troque entre Phong e Blinn-Phong: com o mesmo expoente, a mancha do Blinn-Phong sai mais larga.",
      ],
      needs: ["lambert", "phong"],
      checks: [
        {
          text: "A esfera do meio é de MeshPhongMaterial",
          test: ({ objects }) => materialIs(objects.phong, "MeshPhongMaterial"),
        },
        {
          text: "A cor do brilho (specular) é clara",
          test: ({ objects }) => {
            const s = objects.phong.material?.specular;
            if (!s) return check(false, "o material não tem cor de brilho");
            const hex = hexOf(s);
            return check(Math.max(...s) >= 0.5, `specular é ${hex}${hex === "#111111" ? ", o padrão" : ""}: o brilho quase não aparece`);
          },
        },
        {
          text: "O shininess fica entre 20 e 300",
          test: ({ objects }) => {
            const n = objects.phong.material?.shininess;
            if (typeof n !== "number") return check(false, "o material não tem shininess");
            if (n < 20) return check(false, `shininess ${fmt(n, 0)}: a mancha se espalha pela esfera inteira`);
            return check(n <= 300, `shininess ${fmt(n, 0)}: a mancha vira um ponto`);
          },
        },
        {
          text: "Ela tem a mesma cor da lambert",
          test: ({ objects }) => sameColor(objects, ["lambert", "phong"]),
        },
      ],
    },
    {
      id: "standard",
      title: "Standard: aspereza e metal",
      view: "camera",
      goal:
        "A esfera da direita vira `MeshStandardMaterial`, o material que o Three.js recomenda para quase tudo. Em vez de cor do brilho e expoente, ele descreve a superfície como ela é: lisa ou áspera (`roughness`), metal ou não (`metalness`). As contas seguem a física da luz (PBR, de physically based rendering, desenho com base física): um ponto nunca devolve mais luz do que recebeu, e a luz que vira brilho não vai para a cor.",
      lines: [
        {
          code: "new THREE.MeshStandardMaterial(",
          text: "O material com base física, com a mesma cor das outras duas.",
        },
        {
          code: "roughness: 0.35",
          text: "A aspereza, de 0 a 1. Toda superfície tem riscos e rugas pequenos demais para ver, e cada um reflete a luz para um lado. Lisa, perto de 0, quase tudo reflete na mesma direção, e o brilho sai pequeno e forte; áspera, perto de 1, a luz se espalha, e o brilho fica largo e fraco. Com 0,35, ele aparece, mas macio, como num plástico. O padrão é 1.",
        },
        {
          code: "metalness: 0",
          text: "Não é metal. Plástico, madeira, pedra e tinta devolvem como brilho só uns 4% da luz que chega de frente, sem cor; o resto entra no material e volta com a cor dele, como difusa. O 0 já é o padrão, mas fica escrito para lembrar que o número existe.",
        },
      ],
      why: [
        {
          title: "Qual a diferença para o Phong?",
          text: "No Phong, a força e o tamanho do brilho são números soltos, e nada impede uma superfície de devolver mais luz do que recebe. No Standard, a luz que vira brilho deixa de ir para a difusa, e um brilho mais largo é também mais fraco, como na vida real. Por isso os mesmos valores funcionam sob qualquer luz, e programas como o Blender e os motores de jogos falam a mesma língua: aspereza e metal.",
        },
        {
          title: "Por que não um metal?",
          text: "Um metal não tem difusa: reflete quase toda a luz como brilho, e o brilho sai da cor dele. Ou seja, um metal mostra o que está em volta, como um espelho colorido. Aqui em volta só há o fundo escuro e as luzes, que são pontos, então uma esfera de metal fica quase preta, com os brilhos. Para metais, o Three.js precisa de uma imagem do ambiente em volta (`cena.environment`), que esta vitrine não tem.",
        },
      ],
      try: [
        "Mude o `metalness` para 1: a esfera fica quase preta, só com os brilhos, agora da cor do metal. A conferência avisa. Depois volte para 0.",
        "Mude o `roughness` para 0.05 e depois para 1: o brilho vira um ponto e depois some na cor.",
        "Desligue a Câmera do código e gire a vista em volta das três esferas: o brilho da `standard` anda como o da `phong`, só que mais macio.",
      ],
      needs: ["lambert", "standard"],
      checks: [
        {
          text: "A esfera da direita é de MeshStandardMaterial",
          test: ({ objects }) => materialIs(objects.standard, "MeshStandardMaterial", "MeshPhysicalMaterial"),
        },
        {
          text: "A aspereza (roughness) fica entre 0,2 e 0,6",
          test: ({ objects }) => {
            const r = objects.standard.material?.roughness;
            if (typeof r !== "number") return check(false, "o material não tem roughness");
            if (r < 0.2) return check(false, `roughness ${fmt(r)}: o brilho vira um ponto`);
            return check(r <= 0.6, `roughness ${fmt(r)}${r === 1 ? ", o padrão" : ""}: o brilho se espalha tanto que some`);
          },
        },
        {
          text: "Ela não é metal (metalness perto de 0)",
          test: ({ objects }) => {
            const m = objects.standard.material?.metalness;
            if (typeof m !== "number") return check(false, "o material não tem metalness");
            return check(m <= 0.1, `metalness ${fmt(m)}: sem nada em volta para refletir, o metal fica escuro`);
          },
        },
        {
          text: "Ela tem a mesma cor da lambert",
          test: ({ objects }) => sameColor(objects, ["lambert", "standard"]),
        },
      ],
    },
    {
      id: "chao",
      title: "O chão e os pedestais",
      view: "camera",
      goal:
        "Uma vitrine precisa de onde apoiar as peças: um chão redondo e um pedestal debaixo de cada esfera, todos da mesma pedra escura. O chão também mostra a luz: o sol o ilumina por igual, e, no passo 8, a lâmpada vai acender uma mancha por onde passar. Os três pedestais saem de um laço, que repete as mesmas linhas para cada esfera.",
      lines: [
        {
          code: 'const pedra = new THREE.MeshStandardMaterial({ color: "#30333b", roughness: 0.6 });',
          text: "Um material só, guardado numa variável, para o chão e os três pedestais: um cinza-azulado escuro e meio áspero, que não rouba a atenção das esferas.",
        },
        {
          code: "const chao = new THREE.Mesh(new THREE.CircleGeometry(8, 64), pedra);",
          text: "Um disco de raio 8, feito de 64 fatias, com o material `pedra`. A geometria vai direto dentro do `new THREE.Mesh`: como ela não serve para mais nada, não precisa de nome.",
        },
        {
          code: "chao.rotation.x = -Math.PI / 2;",
          text: "O disco nasce em pé, no plano de x e y, com a frente virada para o z positivo. Girar −90° em x deita o disco com a frente para cima. Com +90°, ele deitaria de costas, e a câmera, de cima, veria o verso, que o Three.js não pinta.",
        },
        {
          code: "const formaPedestal = new THREE.CylinderGeometry(0.7, 0.85, 0.6, 48);",
          text: "Um cilindro com o topo de raio 0,7, a base de 0,85 e 0,6 de altura: um tronco de cone, mais largo embaixo, como um pedestal de museu. Os 48 lados deixam a volta redonda.",
        },
        {
          code: "for (const esfera of [lambert, phong, standard]) {",
          text: "Um laço que passa pelas três esferas da lista, uma de cada vez: na primeira volta, `esfera` é a `lambert`; na segunda, a `phong`; na terceira, a `standard`. As linhas de dentro rodam três vezes.",
        },
        {
          code: "  const pedestal = new THREE.Mesh(formaPedestal, pedra);",
          text: "A cada volta, uma malha nova, com a mesma geometria e o mesmo material: três objetos diferentes, cada um com a sua posição.",
        },
        {
          code: "  pedestal.position.set(esfera.position.x, 0.3, 0);",
          text: "O pedestal fica no x da esfera da vez, com o centro a 0,3 do chão, metade da altura dele: vai do chão até 0,6, onde a esfera começa.",
        },
      ],
      why: [
        {
          title: "Por que um laço, e não três blocos iguais?",
          text: "Os três blocos seriam iguais, menos o x. Com o laço, a regra fica escrita uma vez só: um pedestal debaixo de cada esfera. Para mudar a altura dos pedestais, ou para pôr uma quarta esfera na lista, basta mexer num lugar.",
        },
        {
          title: "Por que o pedestal fica a 0,3, e não a 0?",
          text: "A posição de uma malha é a do centro da geometria, e o cilindro do Three.js nasce com o centro no meio da altura. Com o centro em 0, metade do pedestal ficaria enterrada no chão.",
        },
        {
          title: "Por que o material vai numa variável?",
          text: "Quatro malhas, um material: mudar a cor da `pedra` muda o chão e os pedestais juntos, e o Three.js guarda um material só, em vez de quatro iguais.",
        },
      ],
      try: [
        "Troque o `-Math.PI / 2` do chão por `Math.PI / 2`: o chão some, porque fica de costas para a câmera. A conferência avisa. Depois volte.",
        'Mude a cor da `pedra` para `"#d9d4c7"`, um mármore claro: o chão e os três pedestais mudam juntos.',
        "Clique num pedestal no visor: o editor marca a linha, dentro do laço, que cria os três, e Propriedades avisa que ele só se move pelo código. A geometria, `formaPedestal`, fica fora do laço e muda pelo painel: ponha `0.9` no raio do topo, e os três pedestais se abrem juntos. Depois volte para `0.7`.",
      ],
      needs: ["lambert", "phong", "standard", "chao", "pedestal"],
      checks: [
        {
          text: "O chão é plano, deitado na altura 0 e virado para cima",
          test: ({ objects }) => {
            const chao = objects.chao;
            const sample = chao.geometry?.sample ?? [];
            if (!sample.length) return check(false, "a geometria do chão não tem posições");
            const ys = sample.map((p) => toWorld(chao, p)[1]);
            if (Math.max(...ys) - Math.min(...ys) > 0.02) return check(false, "o chão não está deitado: falta girar 90° em x");
            if (Math.abs(ys[0]) > 0.02) return check(false, `o chão está a ${fmt(ys[0])} de altura`);
            return check(axisOf(chao, 2)[1] > 0.99, "o chão está de costas: a câmera, de cima, vê o verso, que não é pintado");
          },
        },
        {
          text: "O chão cobre a vitrine, com pelo menos 5 de raio",
          test: ({ objects }) => {
            const chao = objects.chao;
            const r = Math.max(0, ...(chao.geometry?.sample ?? []).map((p) => Math.hypot(...[0, 2].map((i) => toWorld(chao, p)[i]))));
            return check(r >= 5, `o chão tem ${fmt(r)} de raio: a fileira da frente, no passo 7, ficaria fora dele`);
          },
        },
        {
          text: "Cada esfera está em cima de um pedestal, encostada nele",
          test: ({ objects }) => {
            const pedestals = all(objects.pedestal).filter((p) => p.box);
            for (const name of SPHERES) {
              const ball = objects[name];
              const [x, y, z] = ball.worldPosition;
              const under = pedestals.find((p) => Math.hypot(centerOf(p.box)[0] - x, centerOf(p.box)[2] - z) < 0.1);
              if (!under) return check(false, `${name} não tem pedestal embaixo`);
              const gap = y - sphereRadius(ball) - under.box.max[1];
              if (gap > 0.05) return check(false, `${name} flutua ${fmt(gap)} acima do pedestal`);
              if (gap < -0.05) return check(false, `${name} afunda ${fmt(-gap)} no pedestal`);
            }
            return check(true);
          },
        },
        {
          text: "Os pedestais ficam apoiados no chão",
          test: ({ objects }) => {
            const off = all(objects.pedestal).find((p) => !p.box || Math.abs(p.box.min[1]) > 0.05);
            return check(!off, off && (off.box ? `um pedestal começa a ${fmt(off.box.min[1])} do chão` : "um pedestal não tem geometria"));
          },
        },
        {
          text: "O chão e os pedestais reagem à luz",
          test: ({ objects }) => allLit([["o chão", objects.chao], ...all(objects.pedestal).map((p) => ["um pedestal", p])]),
        },
      ],
    },
    {
      id: "aspereza",
      title: "A escala de aspereza",
      view: "camera",
      goal:
        "Na frente da vitrine, uma fileira de cinco esferas pequenas de `MeshStandardMaterial`, da mesma cor, com a aspereza indo de 0 a 1, da esquerda para a direita. É o jeito mais rápido de ver o que o `roughness` faz: o brilho começa como um ponto e vai se abrindo até sumir. Desta vez, o laço conta de 0 a 4, e uma conta com o número da volta dá a posição e a aspereza de cada amostra.",
      lines: [
        {
          code: "const formaAmostra = new THREE.SphereGeometry(0.4, 48, 24);",
          text: "Uma esfera menor, de raio 0,4, que as cinco amostras vão dividir.",
        },
        {
          code: "for (let i = 0; i < 5; i++) {",
          text: "O laço clássico: `i` começa em 0 e, enquanto for menor que 5, as linhas de dentro rodam e o `i` sobe 1 (o `i++`). São cinco voltas, com o `i` valendo 0, 1, 2, 3 e 4.",
        },
        {
          code: 'new THREE.MeshStandardMaterial({ color: "#e0533d", roughness: i / 4 })',
          text: "Cada amostra ganha o seu material, porque a aspereza muda. O `i / 4` dá 0; 0,25; 0,5; 0,75 e 1: a primeira é a mais lisa, e a última, a mais áspera.",
        },
        {
          code: "  amostra.position.set(-2.4 + i * 1.2, 0.4, 3.6);",
          text: "O x começa em −2,4 e anda 1,2 a cada volta, até 2,4: cinco esferas espaçadas por igual. A altura de 0,4, o raio, apoia cada uma no chão, e o z de 3,6 traz a fileira para a frente dos pedestais.",
        },
      ],
      why: [
        {
          title: "Por que o brilho some, em vez de crescer?",
          text: "A luz que vira brilho é quase a mesma nas cinco: o que muda é para onde ela vai. Na lisa, ela vai toda numa direção e faz um ponto forte; na áspera, ela se espalha por todos os lados, e cada direção recebe tão pouco que o brilho se perde na cor. É a conservação de energia do Standard: o brilho se abre, mas não cresce.",
        },
        {
          title: "Por que um material para cada amostra?",
          text: "As cinco podem dividir a geometria, mas não o material: o `roughness` é do material, e um material só teria uma aspereza só. Se elas dividissem um material, mudar a aspereza de uma mudaria a de todas.",
        },
        {
          title: "Por que o i / 4?",
          text: "Para ir de 0 a 1 em passos iguais, divide-se o número da volta pelo da última, 4. Com 11 amostras, seria `i / 10`. É a conta de uma régua: o começo, o fim e quantos passos há no meio.",
        },
      ],
      try: [
        "Troque `roughness: i / 4` por `roughness: 0.3, metalness: i / 4`: a fileira vira uma escala de metal, com a aspereza fixa. Da esquerda para a direita, o corpo escurece e o brilho ganha o vermelho, até a última, de metal puro, quase preta. A conferência avisa, porque pede a escala de aspereza; depois volte.",
        "Desligue a Câmera do código e aproxime a vista da amostra da esquerda: o brilho do sol é um ponto bem pequeno, quase um pixel.",
      ],
      needs: ["amostra"],
      checks: [
        {
          text: "São 5 amostras redondas, numa fila na frente dos pedestais",
          test: ({ objects }) => {
            const row = all(objects.amostra);
            if (row.length !== 5) return check(false, `há ${row.length} amostra${row.length > 1 ? "s" : ""}`);
            if (row.some((o) => !isRound(o))) return check(false, "uma das amostras não é redonda");
            const spread = (i) => Math.max(...row.map((o) => o.worldPosition[i])) - Math.min(...row.map((o) => o.worldPosition[i]));
            if (spread(1) > 0.05 || spread(2) > 0.05) return check(false, "as amostras não estão alinhadas numa fila");
            const z = row[0].worldPosition[2];
            return check(z >= 2, `a fila está em z = ${fmt(z)}: precisa ficar na frente dos pedestais, de z = 2 para a câmera`);
          },
        },
        {
          text: "As amostras são de MeshStandardMaterial",
          test: ({ objects }) => {
            const odd = all(objects.amostra).find((o) => !["MeshStandardMaterial", "MeshPhysicalMaterial"].includes(o.material?.type));
            return check(!odd, odd && `uma amostra é ${odd.material?.type ?? "outro material"}`);
          },
        },
        {
          text: "Da esquerda para a direita, a aspereza vai de 0 a 1, subindo",
          test: ({ objects }) => {
            const row = all(objects.amostra).sort((a, b) => a.worldPosition[0] - b.worldPosition[0]);
            const rs = row.map((o) => o.material?.roughness);
            if (rs.some((r) => typeof r !== "number")) return check(false, "uma amostra não tem roughness");
            if (rs.some((r, i) => i > 0 && r <= rs[i - 1])) return check(false, `da esquerda para a direita, a aspereza é ${rs.map((r) => fmt(r)).join("; ")}`);
            return check(rs[0] <= 0.05 && rs.at(-1) >= 0.95, `a aspereza vai de ${fmt(rs[0])} a ${fmt(rs.at(-1))}`);
          },
        },
        {
          text: "Elas ficam apoiadas no chão",
          test: ({ objects }) => {
            const off = all(objects.amostra).find((o) => !o.box || Math.abs(o.box.min[1]) > 0.05);
            return check(!off, off && (off.box ? `uma amostra começa a ${fmt(off.box.min[1])} do chão` : "uma amostra não tem geometria"));
          },
        },
      ],
    },
    {
      id: "lampada",
      title: "A lâmpada que passeia",
      view: "camera",
      goal:
        "Para terminar, uma lâmpada que dá voltas por cima da vitrine. Com a luz em movimento, cada material mostra o que faz: na `lambert`, o lado claro acompanha a lâmpada; na `phong`, um brilho forte corre pela superfície; na `standard` e nas amostras, o brilho corre também, mais aberto conforme a aspereza. A volta é um círculo, e o círculo sai do cosseno e do seno do tempo.",
      lines: [
        {
          code: 'const lampada = new THREE.PointLight("#ffd9a0", 12);',
          text: "Uma luz pontual, que sai de um ponto para todos os lados, com a cor quente de uma lâmpada incandescente. Ela enfraquece com o quadrado da distância: a 4 de distância, a intensidade 12 chega como 12 / 16 = 0,75, menos que o sol, que chega com 2,2 em toda parte.",
        },
        {
          code: "lampada.position.set(4, 3.5, 0);",
          text: "O ponto de partida: 4 à direita do centro e 3,5 de altura, acima das esferas, que vão até 2,6. É onde o `animar` põe a lâmpada no tempo 0, então ela já começa no lugar, mesmo com a animação parada.",
        },
        {
          code: "const bulbo = new THREE.Mesh(",
          text: "Uma esfera pequena para mostrar onde a lâmpada está: a luz em si não aparece na imagem, só o que ela ilumina.",
        },
        {
          code: 'new THREE.MeshBasicMaterial({ color: "#ffd9a0" })',
          text: "Sem luz, da cor da lâmpada. Um material com luz ficaria escuro: a lâmpada está dentro do bulbo, e cada ponto dele aponta para fora, de costas para ela.",
        },
        {
          code: "lampada.add(bulbo);",
          text: "O bulbo vira filho da lâmpada: fica no centro dela e vai junto aonde ela for.",
        },
        {
          code: "  lampada.position.x = Math.cos(tempo) * 4;",
          text: "A cada quadro, o x da lâmpada é o cosseno do tempo vezes 4, e o z, na linha de baixo, o seno vezes 4.",
        },
        {
          code: "  lampada.position.z = Math.sin(tempo) * 4;",
          text: "Para qualquer ângulo, o ponto (cosseno; seno) fica no círculo de raio 1; vezes 4, no de raio 4. O tempo cresce sem parar, então o ângulo gira, e a lâmpada dá uma volta a cada 2π segundos, uns 6,3. A altura continua a de partida, 3,5.",
        },
      ],
      why: [
        {
          title: "Por que cosseno e seno?",
          text: "Num círculo de raio 1, o ponto no ângulo θ está em x = cos θ e, no outro eixo, em sen θ: é a definição das duas funções. Multiplicar pelo raio aumenta o círculo, e multiplicar o tempo muda a velocidade: `Math.cos(tempo * 2)` dá a volta duas vezes mais rápido. Para um círculo em pé, como uma roda-gigante, troca-se o z pelo y.",
        },
        {
          title: "Por que mover a luz, e não as esferas?",
          text: "Girar as esferas não mudaria nada na imagem: elas são redondas e iguais em toda a volta. A cor de cada ponto depende da posição da luz, da superfície e do olho; mover a luz é o jeito de ver o brilho andar com a câmera parada.",
        },
        {
          title: "Por que a lâmpada não faz sombra?",
          text: "Sombras dão trabalho à placa de vídeo, e o Three.js só faz quando se pede: `castShadow` na luz e nos objetos, e `receiveShadow` em quem recebe a sombra. É o assunto do projeto Cidade ao entardecer.",
        },
      ],
      try: [
        "Acrescente `lampada.position.y = 3.5 + Math.sin(tempo * 3) * 0.5;` no `animar`: a lâmpada sobe e desce enquanto dá a volta.",
        'Troque a cor da lâmpada (as duas, a da luz e a do bulbo) por `"#40c0ff"`: o brilho da lâmpada na `phong` fica azul, e o do sol continua branco.',
        "Troque o `4` das duas linhas do `animar` por `5.5`: a lâmpada passa mais longe das esferas, e a luz dela chega com pouco mais da metade da força, porque enfraquece com o quadrado da distância.",
      ],
      needs: ["lampada", "bulbo", "phong"],
      checks: [
        {
          text: "A lâmpada é uma luz pontual, na cena, acima das esferas",
          test: ({ objects, lights }) => {
            const lamp = objects.lampada;
            if (lamp.type !== "PointLight") return check(false, `lampada é ${lamp.type}, não PointLight`);
            if (!litOf(lights, "PointLight").length) return check(false, "a lâmpada não foi adicionada à cena");
            const y = lamp.worldPosition[1];
            return check(y >= 2.8, `a lâmpada está a ${fmt(y)} do chão: tem de passar acima das esferas, que vão até 2,6`);
          },
        },
        {
          text: "Ela dá voltas em torno do centro, a uns 4 dele",
          test: ({ objects, animated, hasAnimar }) => {
            const [x, , z] = objects.lampada.worldPosition;
            const r = Math.hypot(x, z);
            if (r < 3 || r > 6) return check(false, `a lâmpada está a ${fmt(r)} do centro: a volta tem de passar por fora das esferas, a uns 4`);
            if (!hasAnimar) return check(false, "não achei a função animar(tempo)");
            return check(animated.has("lampada.position.x") && animated.has("lampada.position.z"), "animar() não muda o x e o z da lâmpada");
          },
        },
        {
          text: "O bulbo vai junto com a lâmpada e brilha com a própria cor",
          test: ({ objects, nameOf }) => {
            const bulbo = objects.bulbo;
            const parent = parentName(bulbo, nameOf);
            if (parent !== "lampada") return check(false, parent === "a cena" ? "o bulbo está direto na cena e não vai com a lâmpada" : `o pai do bulbo é ${parent}`);
            const type = bulbo.material?.type;
            return check(type === "MeshBasicMaterial", `o bulbo é ${type ?? "outro material"}: com a luz dentro dele, ele fica escuro`);
          },
        },
        {
          text: "A luz da lâmpada chega à esfera do meio",
          test: ({ objects }) => {
            const lamp = objects.lampada;
            const l = lamp.light;
            if (!l) return check(false, "a lâmpada não é uma luz");
            const d = dist(lamp.worldPosition, objects.phong.worldPosition);
            const e = l.intensity * distanceAttenuation(d, l.distance ?? 0, l.decay ?? 2);
            return check(e >= 0.3, `chega ${fmt(e)} de luz na esfera do meio, quase nada: a luz pontual enfraquece com o quadrado da distância`);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
