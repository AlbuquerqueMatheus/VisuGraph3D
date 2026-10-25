// cidade.js — o projeto "Cidade ao entardecer": 81 prédios num fim de tarde, com o sol baixo, as
// sombras compridas e a neblina que apaga o horizonte, em 8 passos no VisuGraph e 1 no seu
// computador. O assunto é a luz direcional, o mapa de sombra (com a câmera da sombra) e a neblina.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js), e os textos
// seguem os outros projetos: `assim` é código, e `lines` aponta trechos do código do passo. Os
// prédios saem de dois laços: a conferência mede todos eles pelas cópias (`copies`) dos fatos, e a
// sombra pela câmera da sombra do sol (`shadow`), vista dele.

import { axisOf, check, deg, dist, extent, fmt, int, luminance, toWorld } from "./checks.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, from } from "./source.js";

/** Várias linhas de código como um texto só, para uma versão de `by` que troca um bloco. */
const block = (...lines) => lines.join("\n");

/** Os laços da cidade: um prédio em cada quadra, com ou sem as sombras (passo 6). */
const city = (shadows) =>
  block(
    "// Um prédio em cada quadra: 9 × 9 quadras, mais altas perto do centro",
    "for (let i = 0; i < 9; i++) {",
    "  for (let j = 0; j < 9; j++) {",
    "    const sorte = Math.abs(Math.sin(i * 17 + j * 31) * 1000) % 1;",
    "    const centro = Math.hypot(i - 4, j - 4);",
    "    const altura = 1 + sorte * (12 - 2 * centro);",
    "",
    "    const predio = new THREE.Mesh(forma, concreto);",
    "    predio.position.set((i - 4) * 3.6, 0, (j - 4) * 3.6);",
    "    predio.scale.set(2, altura, 2);",
    ...(shadows ? ["    predio.castShadow = true;", "    predio.receiveShadow = true;"] : []),
    "    cena.add(predio);",
    "  }",
    "}",
  );

const SOURCE = [
  from(0, "// Cidade ao entardecer"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#f6a26b");',
    "",
    "const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);",
    "camera.position.set(22, 19, 33);",
    "camera.lookAt(0, 1, 0);",
  ),
  from(
    2,
    "",
    "// O chão: uma placa enorme, que vai até o horizonte",
    "const chao = new THREE.Mesh(",
    "  new THREE.PlaneGeometry(200, 200),",
    '  new THREE.MeshStandardMaterial({ color: "#9a8f86" })',
    ");",
    "chao.rotation.x = -Math.PI / 2;",
  ),
  from(6, "chao.receiveShadow = true;"),
  from(2, "cena.add(chao);", "", "// A luz do céu: azulada de cima, cor de terra de baixo", 'const ceu = new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 1);', "cena.add(ceu);"),
  from(5, "", "// O sol: baixo, perto do horizonte, e alaranjado", 'const sol = new THREE.DirectionalLight("#ffc27a", 3.5);', "sol.position.set(-22, 12, 26);"),
  from(6, "sol.castShadow = true;"),
  from(5, "cena.add(sol);"),
  from(
    7,
    "",
    "// A câmera da sombra: a caixa que o sol enxerga, do tamanho da cidade",
    "sol.shadow.camera.left = -22;",
    "sol.shadow.camera.right = 22;",
    "sol.shadow.camera.top = 22;",
    "sol.shadow.camera.bottom = -22;",
    "sol.shadow.camera.near = 10;",
    "sol.shadow.camera.far = 80;",
    "sol.shadow.mapSize.set(2048, 2048);",
  ),
  from(3, ""),
  by({ 3: "// Um prédio: uma caixa com a base no chão", 4: "// A forma e o material, os mesmos para todos os prédios" }),
  from(3, "const forma = new THREE.BoxGeometry(1, 1, 1);", "forma.translate(0, 0.5, 0);", 'const concreto = new THREE.MeshStandardMaterial({ color: "#e8dfd2" });', ""),
  by({ 3: block("const predio = new THREE.Mesh(forma, concreto);", "predio.scale.set(2, 6, 2);", "cena.add(predio);"), 4: city(false), 6: city(true) }),
  from(8, "", "// A neblina, da cor do céu: o que está longe some nele", 'cena.fog = new THREE.Fog("#f6a26b", 25, 70);'),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: os prédios, que saem de um laço, são medidos pelas cópias, e a sombra, pela câmera
// da sombra do sol, com a matriz que leva um ponto da cena para o espaço dela (`shadow.view`)

/** O centro da cidade, para onde a câmera olha. */
const CENTER = [0, 1, 0];

/** Materiais que calculam a luz que chega a cada ponto. */
const LIT = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial"];

/** O objeto e os outros que a mesma linha do código criou, num laço. */
const all = (obj) => [obj, ...(obj.copies ?? [])];

/** Os prédios com geometria (os que têm caixa). */
const buildings = (objects) => all(objects.predio).filter((p) => p.box);

/** Centro de uma caixa { min, max }. */
const centerOf = (box) => [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2);

/** Os 8 cantos de uma caixa { min, max }. */
const cornersOf = ({ min, max }) => Array.from({ length: 8 }, (_, i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);

/** Direção, com comprimento 1, do ponto a para o ponto b. */
function toward(a, b) {
  const v = [0, 1, 2].map((i) => b[i] - a[i]);
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Um ponto [x, y, z] levado por uma matriz 4 × 4, escrita por linhas. */
const apply = (m, [x, y, z]) => [0, 1, 2].map((i) => m[i][0] * x + m[i][1] * y + m[i][2] * z + m[i][3]);

/** Brilho (0 a 1) de uma cor [r, g, b] em sRGB, como a luminance() de "#rrggbb". */
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Uma cor [r, g, b] (0 a 1) escrita como no código: "#rrggbb". */
const hexOf = (rgb) => "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

/** Uma cor "#rrggbb" em [r, g, b], de 0 a 1. */
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Uma fração (0 a 1) em porcentagem: "35%". */
const pct = (f) => `${Math.round(f * 100)}%`;

/** Altura de um prédio, pela caixa. */
const heightOf = (b) => b.box.max[1] - b.box.min[1];

/** A distância do prédio ao eixo do centro da cidade, vista de cima. */
const fromCenter = (b) => Math.hypot(...[0, 2].map((i) => centerOf(b.box)[i]));

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

/** A câmera da sombra do sol, se ele é uma luz direcional: { box, view }. */
function shadowOf(sol) {
  const shadow = sol.shadow;
  if (!shadow?.view || shadow.camera.left == null) return null;
  return { box: shadowBox(shadow.camera), view: shadow.view, mapSize: shadow.mapSize };
}

/** Profundidade de um ponto: o quanto ele fica à frente da câmera, na direção em que ela olha. */
const depthOf = (camera, p) => dot(camera.direction, [0, 1, 2].map((i) => p[i] - camera.worldPosition[i]));

/**
 * Quanto de neblina (0 a 1) cobre um ponto à profundidade `depth`, como o shader do Three.js
 * calcula: na Fog, uma curva suave (smoothstep) de near a far; na FogExp2, 1 − e^−(densidade × d)².
 */
function fogAt(fog, depth) {
  if (fog.type === "FogExp2") return 1 - Math.exp(-((fog.density * depth) ** 2));
  if (fog.far <= fog.near) return depth >= fog.far ? 1 : 0;
  const t = Math.min(1, Math.max(0, (depth - fog.near) / (fog.far - fog.near)));
  return t * t * (3 - 2 * t);
}

/** Confere que a malha é de um material que reage à luz. */
function lit(name, obj) {
  const type = obj.material?.type ?? null;
  if (LIT.includes(type)) return check(true);
  return check(false, type === "MeshBasicMaterial" ? `${name} é MeshBasicMaterial, que ignora a luz` : `${name} é ${type ?? "outro material"}`);
}

// ---------------------------------------------------------------------------
// No seu computador: o projeto Vite com o código do fim do passo 8 em src/cena.js

const END = codeAt(8);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: false, background: true, shadows: true, target: ["0", "1", "0"] };

const COMPUTER = [
  computerStep({
    id: "cidade",
    title: "Cidade ao entardecer",
    end: END,
    options: OPTIONS,
    words: {
      yours: "a sua cidade",
      browser: "o código da cidade precisa dele no navegador",
      privates: "`forma`, `concreto`, `sol` e o resto",
      stretched: "os prédios saem esticados ou achatados",
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ligava as sombras nele, ajustava o desenho ao tamanho do visor e girava a vista com o mouse. Neste passo, a cidade vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, e o que o VisuGraph fazia fica escrito no `src/main.js`, junto com os OrbitControls, que giram a câmera com o mouse. Se você já levou outro projeto para o computador, os arquivos são os mesmos; o `main.js` só muda um pouco: ganha a linha que liga as sombras e, como a cidade não tem `animar`, perde as do tempo.",
    why: [
      {
        title: "Por que andar pela cidade?",
        text: "Com os OrbitControls, a câmera anda e o sol fica parado: de qualquer lado, as sombras continuam caindo para o mesmo lado, e o claro fica sempre nas mesmas paredes. A neblina, não: ela é medida a partir da câmera e anda com ela. Chegue perto da torre do centro, e ela perde a névoa e ganha cor; afaste a vista, e a cidade inteira some no laranja.",
      },
    ],
    try: [
      "No `main.js`, depois do `enableDamping`, acrescente `controles.maxPolarAngle = Math.PI / 2.2;`: a câmera para pouco antes de chegar ao chão e nunca vê a cidade por baixo.",
      "Acrescente também `controles.autoRotate = true;`: a câmera dá voltas sozinha em torno da cidade, e as sombras ficam onde estão, presas ao sol.",
      "A janela do navegador é mais larga que o visor do VisuGraph: a cidade aparece inteira, com a neblina dos dois lados. Role a roda do mouse para aproximar a câmera do centro.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e a cidade aparece nele, com as sombras e a neblina",
      "Arrastar com o mouse gira a câmera em volta da cidade, e as sombras continuam caindo para o mesmo lado",
      "Mudar um número no `src/cena.js` e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const CIDADE = {
  id: "cidade",
  title: "Cidade ao entardecer",
  level: "facil",
  summary: "81 prédios num fim de tarde: o sol baixo deita sombras compridas, a luz do céu azula o lado da sombra e a neblina apaga o horizonte.",
  concepts: [
    "Luz direcional: o sol",
    "Luz do céu (HemisphereLight)",
    "Sombras: castShadow e receiveShadow",
    "O mapa de sombra e a câmera da sombra",
    "Neblina (Fog)",
    "Laços dentro de laços",
    "Um sorteio que se repete",
    "Geometria com a base no chão",
    "Node.js e Vite",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "A cidade vai ter 81 prédios num fim de tarde: um sol baixo e alaranjado, sombras compridas e uma neblina que apaga o horizonte. Primeiro, o palco: a cena, com um céu de entardecer, e a câmera, no alto e longe, olhando a cidade na diagonal. O VisuGraph já cria o renderer e o laço que redesenha o visor, então, por enquanto, o visor mostra só o céu.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "Cria a cena, a raiz da árvore de objetos que o renderer desenha a cada quadro. O chão, os prédios e as luzes vão entrar nela com `cena.add`.",
        },
        {
          code: 'cena.background = new THREE.Color("#f6a26b");',
          text: "O céu: um laranja claro, de fim de tarde. Por enquanto, é só a cor que pinta o fundo do visor; no passo 8, a neblina vai usar a mesma cor, e a cidade, lá longe, vai sumir nele.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);",
          text: "Uma câmera com perspectiva e 45° de campo de visão vertical. O último número, 200, é a distância mais longe que ela desenha: o chão vai ter 200 de lado, e a borda dele, do outro lado da cidade, fica a mais de 100 da câmera.",
        },
        {
          code: "camera.position.set(22, 19, 33);",
          text: "Põe a câmera 19 acima do chão, 22 para a direita e 33 para a frente do centro: a uns 44 dele, do lado de fora da cidade, que vai ter uns 31 de largura. Ela fica na diagonal, entre o eixo x e o eixo z, e assim vê duas faces de cada prédio.",
        },
        {
          code: "camera.lookAt(0, 1, 0);",
          text: "Vira a câmera para o centro da cidade, um pouco acima do chão. Ela olha uns 24° para baixo: vê os telhados, as ruas e, no alto da imagem, o céu.",
        },
      ],
      why: [
        {
          title: "Por que a câmera na diagonal?",
          text: "De frente, de cima de um eixo, a câmera veria uma face só de cada prédio, e os prédios virariam retângulos chapados, uns atrás dos outros. Na diagonal, ela vê duas faces e o telhado: no passo 5, uma face vai pegar o sol, e a outra vai ficar na sombra, e é esse contraste que dá volume aos prédios. Os desenhistas chamam de vista de três quartos.",
        },
        {
          title: "Por que um céu laranja?",
          text: "No fim da tarde, a luz do sol vem rente ao horizonte e atravessa muito mais ar até chegar aqui. O ar espalha mais o azul que o vermelho, e o azul fica pelo caminho: o sol chega laranja, e o céu perto dele fica dessa cor. O azul espalhado não some: ele volta do céu inteiro, e é a luz do céu do passo 2, que pinta as sombras de azul.",
        },
      ],
      try: [
        'Troque a cor do céu por `"#1b2a4a"`, um azul de noite: a conferência avisa, porque pede um céu de fim de tarde. Depois volte para o laranja.',
        "Mude a posição da câmera para `(0, 19, 40)`, bem em frente ao centro: a conferência avisa, porque, de frente para a grade, a câmera veria uma face só de cada prédio. Depois volte para (22, 19, 33).",
      ],
      needs: [],
      checks: [
        {
          text: "O céu é de fim de tarde: uma cor clara e quente",
          test: ({ background }) => {
            if (!background) return check(false, "a cena não tem cor de fundo");
            if (luminance(background) < 0.45) return check(false, `o fundo é ${background}, escuro demais para o fim da tarde`);
            const [r, , b] = rgbOf(background);
            return check(r - b >= 0.15, `o fundo é ${background}, uma cor fria: o céu do fim da tarde puxa para o laranja`);
          },
        },
        {
          text: "A câmera fica do lado de fora da cidade, a uns 30 a 60 do centro",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const d = dist(camera.worldPosition, CENTER);
            if (d < 30) return check(false, `a câmera está a ${fmt(d, 1)} do centro: perto demais, no meio dos prédios`);
            return check(d <= 60, `a câmera está a ${fmt(d, 1)} do centro: a cidade fica pequena, e a neblina do passo 8 a apaga`);
          },
        },
        {
          text: "Ela vê a cidade na diagonal e de cima, de 15° a 45°",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const [x, y, z] = camera.worldPosition;
            const side = deg(Math.atan2(Math.abs(x), Math.abs(z)));
            if (side < 20 || side > 70) {
              const axis = side < 45 ? "z" : "x";
              return check(false, `a câmera está só ${fmt(Math.min(side, 90 - side), 0)}° fora do eixo ${axis}: quase de frente para a grade, ela vê uma face só de cada prédio`);
            }
            const up = deg(Math.atan2(y - CENTER[1], Math.hypot(x, z)));
            if (up < 15) return check(false, up < 0 ? "a câmera está abaixo do centro da cidade" : `a câmera está só ${fmt(up, 0)}° acima do centro: os prédios da frente escondem a cidade`);
            return check(up <= 45, `a câmera está ${fmt(up, 0)}° acima do centro, quase em cima: os prédios viram quadrados, vistos do alto`);
          },
        },
        {
          text: "Ela olha para o centro da cidade",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const cos = dot(toward(camera.worldPosition, CENTER), camera.direction);
            return check(cos >= 0.99, `a câmera olha ${fmt(deg(Math.acos(Math.min(1, cos))), 0)}° para fora do centro da cidade`);
          },
        },
      ],
    },
    {
      id: "chao",
      title: "O chão e a luz do céu",
      view: "camera",
      goal:
        "A cidade precisa de chão: uma placa enorme, de um cinza quente de asfalto, que vai até o horizonte. Para o chão aparecer, ele precisa de luz, e a primeira é a luz do céu, a `HemisphereLight`: azulada de cima e cor de terra de baixo. Ela não vem de um ponto: chega do céu inteiro, sem fazer sombra. Sozinha, deixa tudo numa penumbra azul, como logo depois que o sol se põe; o sol entra no passo 5. Lá no fundo, a borda do chão corta o céu numa linha reta, que a neblina do passo 8 vai apagar.",
      lines: [
        {
          code: "new THREE.PlaneGeometry(200, 200),",
          text: "Um quadrado de 200 por 200, muito maior que a cidade, que vai ter uns 31 de lado: daqui, a borda dele fica quase no horizonte. São só dois triângulos: o chão é plano, e mais triângulos não mudariam nada.",
        },
        {
          code: 'new THREE.MeshStandardMaterial({ color: "#9a8f86" })',
          text: "Um cinza puxado para o marrom, de asfalto e calçada. Precisa ser claro o bastante para as sombras do passo 6 aparecerem: num chão preto, a sombra não teria o que escurecer.",
        },
        {
          code: "chao.rotation.x = -Math.PI / 2;",
          text: "O plano nasce em pé, de frente para o z. Girar −90° em x deita o chão com a frente para cima, de onde a câmera olha; com +90°, ele deitaria de costas, e o verso não é pintado.",
        },
        {
          code: 'const ceu = new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 1);',
          text: "A luz do céu: vem de cima com a primeira cor, um azul-lilás, e de baixo com a segunda, um marrom de terra. Cada ponto recebe uma mistura das duas conforme o lado para onde aponta: o chão e os telhados, virados para cima, ficam com o azul; as paredes, de lado, com metade de cada.",
        },
      ],
      why: [
        {
          title: "Por que uma luz que vem do céu inteiro?",
          text: "Na vida real, a sombra não é preta: o lugar onde o sol não bate recebe a luz do céu inteiro, que é azul. A `HemisphereLight` imita isso de um jeito barato, com duas cores, a de cima e a de baixo, e sem sombra nenhuma. No fim do projeto, é ela que pinta de azul o lado dos prédios que o sol não alcança.",
        },
        {
          title: "Por que um chão tão grande?",
          text: "Para não ter fim à vista. Com a câmera a 44 do centro, um chão de 40 acabaria logo atrás da cidade; com 200, a borda fica tão longe que vira uma linha no horizonte, e a neblina do passo 8 a esconde. O chão continua sendo uma placa de dois triângulos: ser grande não custa nada para a placa de vídeo.",
        },
      ],
      try: [
        "Mude a intensidade da luz do céu de `1` para `3`: o chão clareia, e a conferência avisa, porque o lado da sombra dos prédios ficaria quase tão claro quanto o do sol. Depois volte para 1.",
        "Troque as duas cores da luz do céu de lugar: o chão, virado para cima, fica marrom, e a conferência avisa. Depois volte.",
        "Mude o `200` do fim da linha da câmera para `60`: o chão termina bem mais perto, numa linha reta, e o céu aparece atrás dela, porque a câmera não desenha nada a mais de 60 dela. Depois volte para 200.",
      ],
      needs: ["chao"],
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
          text: "Ele é grande: vai pelo menos 60 para cada lado do centro",
          test: ({ objects }) => {
            const box = objects.chao.box;
            if (!box) return check(false, "o chão não tem geometria");
            const reach = Math.min(-box.min[0], box.max[0], -box.min[2], box.max[2]);
            return check(reach >= 60, `o chão vai só até ${fmt(reach, 0)} do centro: a borda dele aparece logo atrás da cidade`);
          },
        },
        {
          text: "Ele reage à luz",
          test: ({ objects }) => lit("o chão", objects.chao),
        },
        {
          text: "Uma luz do céu (HemisphereLight) clareia a cena, azulada de cima",
          test: ({ lights }) => {
            const sky = lights.filter((l) => l.type === "HemisphereLight");
            if (!sky.length) return check(false, "não há HemisphereLight acesa na cena");
            const total = sky.reduce((sum, l) => sum + l.intensity, 0);
            if (total < 0.3) return check(false, `a intensidade é ${fmt(total)}: o lado da sombra fica preto`);
            if (total > 2) return check(false, `a intensidade é ${fmt(total)}: forte demais, o lado da sombra ficaria quase tão claro quanto o do sol`);
            const [r, , b] = sky[0].color;
            if (lum(sky[0].ground ?? [0, 0, 0]) >= lum(sky[0].color)) return check(false, "o chão (a segunda cor) está mais claro que o céu");
            return check(b > r, `a cor de cima é ${hexOf(sky[0].color)}: a luz do céu, a que vai pintar as sombras, é azulada`);
          },
        },
      ],
    },
    {
      id: "predio",
      title: "Um prédio",
      view: "camera",
      goal:
        "Antes da cidade, um prédio só, no centro: uma caixa esticada para cima. A caixa do Three.js nasce com o centro no meio, e esticar a caixa assim faria o prédio crescer para cima e para baixo, enterrando metade dele no chão. O truque é mover a forma uma vez, para a base dela ficar na altura 0: daí em diante, a altura de qualquer prédio é só uma escala.",
      lines: [
        {
          code: "const forma = new THREE.BoxGeometry(1, 1, 1);",
          text: "Uma caixa de 1 × 1 × 1, um cubo, com o centro na origem: em y, ela vai de −0,5 a 0,5. É a forma de todos os prédios da cidade: cada um vai esticar essa mesma caixa do seu jeito.",
        },
        {
          code: "forma.translate(0, 0.5, 0);",
          text: "Sobe todos os vértices da forma 0,5: agora ela vai de 0 a 1 em y, com a base na origem. O `translate` muda a própria geometria, não a posição de uma malha: toda malha que usar a `forma` já nasce com a base no chão.",
        },
        {
          code: 'const concreto = new THREE.MeshStandardMaterial({ color: "#e8dfd2" });',
          text: "Um concreto bem claro, quase branco. Uma parede clara mostra a cor da luz que bate nela: no fim do projeto, o lado do sol fica laranja, e o lado da sombra, azulado, e quem pinta essas cores é a luz, não o material.",
        },
        {
          code: "predio.scale.set(2, 6, 2);",
          text: "Estica a forma: 2 de largura, 6 de altura e 2 de fundo. Como a base da forma está na altura 0, a escala estica tudo para cima, e o prédio continua apoiado no chão, na posição (0; 0; 0).",
        },
      ],
      why: [
        {
          title: "Por que mover a forma, e não o prédio?",
          text: "Daria para deixar a forma com o centro no meio e subir o prédio metade da altura, com `predio.position.y = 3`. Mas aí cada prédio precisaria dessa conta, e mudar a altura de um prédio pediria mudar a posição junto. Com a base da forma no chão, a altura vira um número só, a escala em y. É a ideia do pivô dos programas de 3D: o ponto em volta do qual o objeto cresce e gira.",
        },
        {
          title: "Por que uma caixa de 1 × 1 × 1?",
          text: "Com o tamanho 1, a escala é o próprio tamanho: `scale.set(2, 6, 2)` dá um prédio de 2 × 6 × 2. Com uma caixa de outro tamanho, cada medida seria uma conta.",
        },
      ],
      try: [
        "Apague a linha do `translate`: metade do prédio fica enterrada no chão, e a conferência avisa. Depois volte com a linha.",
        "Clique no prédio no visor e, em Propriedades, mude a escala em y: ele cresce e encolhe sem sair do chão.",
        "Desligue a Câmera do código e gire a vista em volta do prédio: sem o sol, as quatro paredes têm a mesma cor, uma mistura do azul e do marrom da luz do céu, e o telhado puxa para o azul.",
      ],
      needs: ["predio"],
      checks: [
        {
          text: "O prédio fica no centro, de pé no chão",
          test: ({ objects }) => {
            const box = objects.predio.box;
            if (!box) return check(false, "o prédio não tem geometria");
            const bottom = box.min[1];
            if (bottom < -0.02) return check(false, `o prédio afunda ${fmt(-bottom)} no chão`);
            if (bottom > 0.02) return check(false, `o prédio flutua ${fmt(bottom)} acima do chão`);
            const off = Math.hypot(centerOf(box)[0], centerOf(box)[2]);
            return check(off <= 1, `o prédio está a ${fmt(off, 1)} do centro`);
          },
        },
        {
          text: "A forma tem a base no chão: começa na altura 0",
          test: ({ objects }) => {
            const sample = objects.predio.geometry?.sample ?? [];
            if (!sample.length) return check(false, "a geometria do prédio não tem posições");
            const { min, max } = extent(sample, 1);
            return check(Math.abs(min) <= 0.01, `a forma vai de ${fmt(min)} a ${fmt(max)} em y: com o centro no meio, a escala estica o prédio para baixo também`);
          },
        },
        {
          text: "Ele é um prédio: mais alto que largo",
          test: ({ objects }) => {
            const { min, max } = objects.predio.box;
            const height = max[1] - min[1];
            const width = Math.max(max[0] - min[0], max[2] - min[2]);
            return check(height >= 1.5 * width, `o prédio tem ${fmt(height, 1)} de altura e ${fmt(width, 1)} de largura: parece mais um bloco`);
          },
        },
        {
          text: "O concreto reage à luz",
          test: ({ objects }) => lit("o prédio", objects.predio),
        },
      ],
    },
    {
      id: "cidade",
      title: "A cidade",
      view: "camera",
      goal:
        "Agora, um prédio em cada quadra de uma grade de 9 por 9: 81 prédios, todos com a mesma forma e o mesmo concreto. A grade sai de dois laços, um dentro do outro. A altura de cada prédio sai de uma conta com o número da quadra: um sorteio que dá sempre o mesmo resultado, para a cidade não mudar a cada vez que o código roda, e que deixa os prédios mais altos perto do centro.",
      lines: [
        {
          code: "for (let i = 0; i < 9; i++) {",
          text: "O laço de fora conta as fileiras: `i` vai de 0 a 8.",
        },
        {
          code: "  for (let j = 0; j < 9; j++) {",
          text: "O de dentro conta as quadras de cada fileira: `j` também vai de 0 a 8. Para cada volta do laço de fora, o de dentro dá 9 voltas: as linhas de dentro rodam 9 × 9 = 81 vezes, uma para cada par (i; j).",
        },
        {
          code: "    const sorte = Math.abs(Math.sin(i * 17 + j * 31) * 1000) % 1;",
          text: "Um número de 0 a 1 que parece sorteado. O seno de i × 17 + j × 31 fica entre −1 e 1; vezes 1.000, o que vem depois da vírgula muda sem padrão nenhum de uma quadra para a vizinha. O `Math.abs` tira o sinal, e o `% 1`, o resto da divisão por 1, fica só com a parte depois da vírgula. O mesmo `i` e o mesmo `j` dão sempre o mesmo número.",
        },
        {
          code: "    const centro = Math.hypot(i - 4, j - 4);",
          text: "Quantas quadras há até a do meio, a (4; 4). O `Math.hypot` faz a conta de Pitágoras: a raiz de (i − 4)² + (j − 4)². Dá 0 no centro e uns 5,7 nos cantos.",
        },
        {
          code: "    const altura = 1 + sorte * (12 - 2 * centro);",
          text: "A altura: 1, no mínimo, mais a sorte vezes um teto que baixa 2 a cada quadra de distância do centro. No meio, um prédio pode chegar a 13; nos cantos, a menos de 2. A sorte decide quanto do teto cada prédio usa.",
        },
        {
          code: "    predio.position.set((i - 4) * 3.6, 0, (j - 4) * 3.6);",
          text: "Cada quadra mede 3,6, e o `− 4` põe a do meio na origem: o x vai de −14,4 a 14,4, e o z também. Com 2 de largura, os prédios deixam 1,6 de rua entre eles.",
        },
        {
          code: "    predio.scale.set(2, altura, 2);",
          text: "A largura e o fundo de todos são 2; a altura é a da conta. A base continua no chão, graças ao `translate` do passo 3.",
        },
      ],
      why: [
        {
          title: "Por que não Math.random()?",
          text: "O `Math.random()` dá um número novo a cada chamada, e o VisuGraph roda o código de novo a cada mudança: a cada letra digitada, a cidade seria outra. Com a conta do seno, o sorteio depende só de `i` e `j`, e a cidade fica sempre a mesma. É um truque muito usado nos shaders, onde não existe sorteio nenhum.",
        },
        {
          title: "Por que um laço dentro do outro?",
          text: "Uma grade tem duas direções: as fileiras e, em cada fileira, as quadras. O laço de dentro percorre uma fileira inteira a cada volta do de fora, e cada par (i; j) aparece uma vez só. Cada laço cuida de uma direção: com `j < 3` no de dentro, sairia uma faixa de 9 fileiras de 3 quadras.",
        },
        {
          title: "Por que todos dividem a forma e o material?",
          text: "São 81 malhas, mas uma geometria e um material só: o Three.js guarda uma caixa de 24 vértices em vez de 81, e um programa de shader para todas. Cada prédio guarda só o que é dele: a posição e a escala.",
        },
      ],
      try: [
        "Troque o `17` por `18`: o sorteio muda, e sai outra cidade, com outras alturas. Depois volte para 17.",
        "Troque `(12 - 2 * centro)` por `12`: a altura deixa de depender do centro, e aparecem prédios altos até nas bordas. A conferência avisa. Depois volte.",
        "Clique num prédio no visor: o editor marca a linha, dentro do laço, que cria os 81, e Propriedades avisa que ele só muda pelo código.",
      ],
      needs: ["predio"],
      checks: [
        {
          text: "A cidade tem pelo menos 25 prédios",
          test: ({ objects }) => {
            const n = buildings(objects).length;
            return check(n >= 25, `há ${int(n)} prédio${n === 1 ? "" : "s"}`);
          },
        },
        {
          text: "Todos ficam de pé no chão, com ruas entre eles",
          test: ({ objects }) => {
            const list = buildings(objects);
            const off = list.find((b) => Math.abs(b.box.min[1]) > 0.02);
            if (off) return check(false, `um prédio começa a ${fmt(off.box.min[1])} do chão`);
            for (let a = 0; a < list.length; a++) {
              for (let b = a + 1; b < list.length; b++) {
                const [p, q] = [list[a].box, list[b].box];
                // a rua entre duas caixas é a folga no eixo em que elas se separam mais
                const gap = Math.max(q.min[0] - p.max[0], p.min[0] - q.max[0], q.min[2] - p.max[2], p.min[2] - q.max[2]);
                if (gap < 0.5) {
                  const [x, , z] = centerOf(p);
                  return check(false, `${gap < 0 ? "dois prédios se encostam" : `sobra só ${fmt(gap)} de rua entre dois prédios`} perto de (${fmt(x, 1)}; ${fmt(z, 1)})`);
                }
              }
            }
            return check(true);
          },
        },
        {
          text: "As alturas variam: há prédios baixos e altos",
          test: ({ objects }) => {
            const hs = buildings(objects).map(heightOf);
            const [low, high] = [Math.min(...hs), Math.max(...hs)];
            return check(high - low >= 3, `os prédios vão de ${fmt(low, 1)} a ${fmt(high, 1)} de altura: quase todos iguais`);
          },
        },
        {
          text: "Os mais altos ficam perto do centro",
          test: ({ objects }) => {
            const list = buildings(objects).sort((a, b) => fromCenter(a) - fromCenter(b));
            const half = Math.floor(list.length / 2);
            const mean = (part) => part.reduce((sum, b) => sum + heightOf(b), 0) / part.length;
            const [inner, outer] = [mean(list.slice(0, half)), mean(list.slice(half))];
            return check(inner >= 1.15 * outer, `perto do centro, a altura média é ${fmt(inner, 1)}; mais longe, ${fmt(outer, 1)}`);
          },
        },
        {
          text: "Todos usam a mesma forma",
          test: ({ objects }) => {
            const ids = buildings(objects).map((b) => b.geometry?.uuid ?? null);
            return check(ids[0] != null && ids.every((id) => id === ids[0]), "cada prédio tem uma geometria só dele");
          },
        },
      ],
    },
    {
      id: "sol",
      title: "O sol baixo",
      view: "camera",
      goal:
        "Agora o sol: uma luz direcional, baixa, perto do horizonte, e alaranjada. Os raios dele chegam todos paralelos, de um lado só, e cada parede fica mais clara quanto mais estiver de frente para ele: o lado do sol fica laranja, e o lado de lá continua só com a luz do céu, azulada. Por enquanto, sem sombras: a luz atravessa os prédios e bate no chão do outro lado. Elas entram no passo 6.",
      lines: [
        {
          code: 'const sol = new THREE.DirectionalLight("#ffc27a", 3.5);',
          text: "Uma luz direcional: os raios chegam paralelos, como os do Sol, que está tão longe que a direção dele é a mesma na cidade inteira. A cor é um laranja claro, e a intensidade, 3,5, um pouco mais que π (3,14): o valor que, numa parede de frente para a luz, dá a cor cheia do material.",
        },
        {
          code: "sol.position.set(-22, 12, 26);",
          text: "A luz direcional vem da posição em direção ao alvo, que fica na origem: daqui, vem da esquerda e da frente da cidade, e baixa, uns 19° acima do horizonte. Para a câmera, o sol fica à esquerda e um pouco para trás: a face esquerda de cada prédio pega o sol, e a direita fica na sombra.",
        },
      ],
      why: [
        {
          title: "Por que o sol baixo?",
          text: "Ao meio-dia, com o sol lá em cima, a luz cai nos telhados, e as paredes ficam todas parecidas. No fim da tarde, a luz vem de lado: a parede de frente para o sol recebe a luz quase inteira, e a de trás, nenhuma. É o contraste que dá volume aos prédios. E as sombras de um sol baixo, no passo 6, ficam compridas: um prédio de altura 6 deita uma sombra de uns 17 no chão.",
        },
        {
          title: "Por que laranja de um lado e azul do outro?",
          text: "As duas luzes vêm do mesmo Sol. A que chega direto atravessou muito ar, rente ao horizonte, e perdeu o azul pelo caminho: chega laranja. O azul que o ar espalhou volta do céu inteiro: é a luz do céu. Onde o sol bate, ganha o laranja; onde não bate, sobra o azul do céu. Os pintores usam essa regra há séculos: luz quente, sombra fria.",
        },
        {
          title: "A luz direcional tem lugar?",
          text: "Para a luz, só a direção importa: a do alvo para a posição. Com `sol.position.set(-44, 24, 52)`, o dobro, a cidade fica exatamente igual. A posição só passa a importar no passo 7, porque a câmera da sombra fica nela.",
        },
      ],
      try: [
        "Mude a posição do sol para `(-22, 40, 26)`, bem mais alto: as paredes do lado do sol escurecem, e os telhados clareiam, porque agora a luz cai de cima. A conferência avisa que o sol saiu do fim da tarde. Depois volte o 40 para 12.",
        'Troque a cor do sol por `"#ffffff"`: as paredes do lado do sol ficam brancas, como ao meio-dia, e a conferência avisa. Depois volte para o laranja.',
        "Mude o `-22` da posição do sol para `22`: a luz passa a vir do lado da câmera, e as duas faces de cada prédio que ela vê pegam o sol. Sem um lado na sombra, os prédios perdem o volume. Depois volte para −22.",
      ],
      needs: ["sol"],
      checks: [
        {
          text: "O sol é uma luz direcional, na cena",
          test: ({ objects, lights }) => {
            const sol = objects.sol;
            if (sol.type !== "DirectionalLight") return check(false, `sol é ${sol.type}, não DirectionalLight`);
            return check(lights.some((l) => l.type === "DirectionalLight"), "o sol não foi adicionado à cena");
          },
        },
        {
          text: "Ele está baixo: de 10° a 30° acima do horizonte",
          test: ({ objects }) => {
            const sol = objects.sol;
            const height = deg(Math.asin(toward(sol.target ?? [0, 0, 0], sol.worldPosition)[1]));
            if (height < 0) return check(false, "o sol está abaixo do horizonte");
            if (height < 10) return check(false, `o sol está só ${fmt(height, 0)}° acima do horizonte: quase deitado, a luz só raspa nas paredes`);
            return check(height <= 30, `o sol está ${fmt(height, 0)}° acima do horizonte: alto demais para o fim da tarde, e as sombras ficariam curtas`);
          },
        },
        {
          text: "A luz dele é quente, mais vermelha que azul",
          test: ({ objects }) => {
            const color = objects.sol.light?.color;
            if (!color) return check(false, "o sol não tem cor");
            return check(color[0] - color[2] >= 0.2, `a cor do sol é ${hexOf(color)}: no fim da tarde, a luz do sol chega alaranjada`);
          },
        },
        {
          text: "Ele ilumina o lado dos prédios que a câmera vê",
          test: ({ objects, camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const sol = objects.sol;
            const [lx, , lz] = toward(sol.target ?? [0, 0, 0], sol.worldPosition);
            const n = Math.hypot(lx, lz) || 1;
            // as faces que a câmera vê olham para o lado dela, em x e em z
            const [cx, , cz] = camera.worldPosition;
            const facing = Math.max((Math.sign(cx) * lx) / n, (Math.sign(cz) * lz) / n);
            return check(facing > 0.3, "o sol está atrás dos prédios: a câmera só vê o lado da sombra");
          },
        },
        {
          text: "Ele é a luz mais forte: intensidade de 2 a 6",
          test: ({ objects }) => {
            const i = objects.sol.light?.intensity ?? 0;
            if (i < 2) return check(false, `a intensidade é ${fmt(i)}: fraca demais, a luz do céu ganha dele`);
            return check(i <= 6, `a intensidade é ${fmt(i)}: forte demais, o lado do sol estoura em branco`);
          },
        },
      ],
    },
    {
      id: "sombras",
      title: "As sombras",
      view: "camera",
      goal:
        "Sombras dão trabalho à placa de vídeo, e o Three.js só faz quando se pede, em três lugares: no renderer, que o VisuGraph já liga; na luz que faz a sombra; e em cada objeto, que pode fazer sombra (`castShadow`) e receber sombra (`receiveShadow`). Ligadas as três, os prédios escurecem o chão e uns aos outros. Mas repare: só os prédios perto do centro fazem sombra. O porquê é o assunto do próximo passo.",
      lines: [
        {
          code: "chao.receiveShadow = true;",
          text: "O chão recebe sombra: em cada ponto dele, o Three.js confere se algo fica entre o ponto e o sol.",
        },
        {
          code: "sol.castShadow = true;",
          text: "O sol faz sombra. Cada luz com sombra custa, a cada quadro, um desenho a mais da cena, visto de onde a luz está: por isso, vem desligado.",
        },
        {
          code: "    predio.castShadow = true;",
          text: "Cada prédio faz sombra: ele entra no desenho visto do sol e tapa a luz do que está atrás dele.",
        },
        {
          code: "    predio.receiveShadow = true;",
          text: "E cada prédio também recebe sombra: a sombra de um prédio alto sobe pela parede do vizinho mais baixo. Fazer e receber são separados porque nem sempre se quer os dois: o chão só recebe, e uma nuvem lá no alto só faria.",
        },
      ],
      why: [
        {
          title: "Como o Three.js sabe o que está na sombra?",
          text: "Antes de desenhar a cena, ele tira uma foto dela vista do sol, mas, em vez das cores, guarda em cada pixel a distância até o que está mais perto da luz: é o mapa de sombra. Depois, ao pintar cada ponto da cena, ele confere: o ponto está mais longe do sol do que a foto guardou naquela direção? Então há algo na frente dele, e ele fica na sombra. Lance Williams inventou esse truque em 1978, e quase todo jogo ainda faz assim.",
        },
        {
          title: "Por que só o meio da cidade tem sombra?",
          text: "A foto do sol é tirada por uma câmera, e essa câmera, como qualquer outra, só vê o que cabe no quadro dela. A câmera da sombra de uma luz direcional vem com um quadro de 10 por 10, de −5 a 5 em volta do alvo, e a cidade tem uns 31 de largura: o que fica fora do quadro não faz sombra. O passo 7 aumenta o quadro.",
        },
      ],
      try: [
        "Apague a linha `chao.receiveShadow = true;`: as sombras somem do chão e ficam só nas paredes dos prédios. A conferência avisa. Depois volte com a linha.",
        "Troque `predio.receiveShadow = true;` por `false`: o chão continua com as sombras, mas elas não sobem mais pelas paredes dos vizinhos. A conferência avisa. Depois volte para `true`.",
      ],
      needs: ["sol", "chao", "predio"],
      checks: [
        {
          text: "O sol faz sombra (castShadow)",
          test: ({ objects }) => check(!!objects.sol.castShadow, "o sol não faz sombra: falta sol.castShadow = true"),
        },
        {
          text: "Todos os prédios fazem sombra",
          test: ({ objects }) => {
            const list = buildings(objects);
            const off = list.filter((b) => !b.castShadow).length;
            if (off === list.length) return check(false, "os prédios não fazem sombra: falta castShadow no laço");
            return check(off === 0, `${int(off)} prédio${off === 1 ? " não faz" : "s não fazem"} sombra`);
          },
        },
        {
          text: "O chão e os prédios recebem sombra (receiveShadow)",
          test: ({ objects }) => {
            if (!objects.chao.receiveShadow) return check(false, "o chão não recebe sombra: falta chao.receiveShadow = true");
            const off = buildings(objects).filter((b) => !b.receiveShadow).length;
            return check(off === 0, `${int(off)} prédio${off === 1 ? " não recebe" : "s não recebem"} sombra: a sombra de um não aparece no outro`);
          },
        },
      ],
    },
    {
      id: "camera-sombra",
      title: "A câmera da sombra",
      view: "camera",
      goal:
        "A foto que o sol tira para fazer as sombras é de uma câmera ortográfica, sem perspectiva: o quadro dela é uma caixa, e só o que está dentro da caixa faz e recebe sombra. A caixa padrão tem 10 de lado, e a cidade, uns 31. Neste passo, a caixa cresce até cobrir a cidade inteira, como o sol a vê, e ganha a profundidade certa, da frente da cidade até a ponta da sombra mais comprida. E, como a foto agora se estica sobre uma área muito maior, ela ganha mais pixels.",
      lines: [
        {
          code: "sol.shadow.camera.left = -22;",
          text: "A borda esquerda da caixa, 22 à esquerda do centro, como o sol vê a cidade: a câmera da sombra fica na posição do sol, olhando para o alvo. De qualquer lado que o sol venha, a cidade cabe em 22, porque é a distância do centro ao canto mais longe, a metade da diagonal.",
        },
        {
          code: "sol.shadow.camera.top = 22;",
          text: "As bordas de cima e de baixo, `top` e `bottom`, seguem a mesma conta: a caixa fica com 44 por 44.",
        },
        {
          code: "sol.shadow.camera.near = 10;",
          text: "A frente da caixa, a 10 do sol. O sol está a uns 36 do centro, e o ponto da cidade mais perto dele, a uns 15.",
        },
        {
          code: "sol.shadow.camera.far = 80;",
          text: "O fundo da caixa, a 80 do sol. O lado da cidade mais longe dele fica a uns 57, mas as sombras desse lado caem para fora da cidade, e a mais comprida termina a uns 70: a ponta dela também precisa estar na caixa.",
        },
        {
          code: "sol.shadow.mapSize.set(2048, 2048);",
          text: "O tamanho da foto: 2048 × 2048 pixels, em vez dos 512 × 512 do padrão. A caixa tem 44 de largura: com 512 pixels, cada pixel cobriria 0,09 da cidade, e a borda das sombras sairia em degraus; com 2048, cobre 0,02.",
        },
      ],
      why: [
        {
          title: "Por que uma câmera ortográfica?",
          text: "Os raios do sol chegam paralelos, e a câmera ortográfica também vê em linhas paralelas: o que está longe não fica menor. Por isso o quadro dela é uma caixa, e não uma pirâmide. Uma lâmpada (`PointLight`) ou um holofote (`SpotLight`), cujos raios saem de um ponto, fazem a foto com câmeras de perspectiva.",
        },
        {
          title: "Por que não uma caixa enorme de uma vez?",
          text: "A foto tem um número fixo de pixels. Esticada sobre uma caixa maior, cada pixel cobre um pedaço maior da cidade, e a borda da sombra vira escadinha. Mais pixels resolvem, mas a foto é tirada a cada quadro: 2048 × 2048 são 4 milhões de pixels, 16 vezes os do padrão. O certo é a caixa justa, do tamanho do que precisa de sombra, e é por isso que o padrão é pequeno.",
        },
        {
          title: "E a frente e o fundo, o near e o far?",
          text: "A foto guarda distâncias, e cada pixel tem um número limitado de degraus para elas. Uma caixa de 0,5 a 500, o padrão, gasta os degraus numa profundidade que a cidade nem alcança; de 10 a 80, eles ficam onde a cidade está. Só não pode ficar curta: o que passa do fundo da caixa deixa de receber sombra.",
        },
      ],
      try: [
        "Desligue a Câmera do código, clique em `sol` na lista de objetos e afaste bastante a vista com a roda do mouse: o visor desenha a caixa da câmera da sombra, em amarelo, com a cidade dentro. Mude o `22` das quatro bordas para `10`: a caixa encolhe, e os prédios de fora dela param de fazer sombra. A conferência avisa. Depois volte para 22.",
        "Mude os dois `2048` para `256`: a borda das sombras vira uma escadinha de pixels, e a conferência avisa. Depois volte para 2048.",
        "Mude o `far` para `40`: os prédios do fundo, à direita, os mais longe do sol, perdem as sombras que os vizinhos jogavam neles, porque passam do fundo da caixa. A conferência avisa. Depois volte para 80.",
        "Acrescente no fim do código `function animar(tempo) { sol.position.set(Math.cos(tempo * 0.3) * 34, 12, Math.sin(tempo * 0.3) * 34); }`: o sol dá voltas em torno da cidade, e as sombras giram com ele. A caixa vai junto e continua cobrindo a cidade, porque 22 é a metade da diagonal. Depois apague a função.",
      ],
      needs: ["sol", "predio"],
      checks: [
        {
          text: "A caixa da sombra cobre a cidade inteira, vista do sol",
          test: ({ objects }) => {
            const shadow = shadowOf(objects.sol);
            if (!shadow) return check(false, "o sol não é uma luz direcional");
            const { box, view } = shadow;
            const points = buildings(objects).flatMap((b) => cornersOf(b.box).map((p) => apply(view, p)));
            const xs = points.map((v) => v[0]);
            const ys = points.map((v) => v[1]);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            const slack = 0.01;
            if (x0 < box.left - slack || x1 > box.right + slack) {
              return check(false, `vista do sol, a cidade vai de ${fmt(x0, 1)} a ${fmt(x1, 1)} de um lado ao outro, e a caixa, de ${fmt(box.left, 1)} a ${fmt(box.right, 1)}`);
            }
            const fits = y0 >= box.bottom - slack && y1 <= box.top + slack;
            return check(fits, `vista do sol, a cidade vai de ${fmt(y0, 1)} a ${fmt(y1, 1)} de baixo para cima, e a caixa, de ${fmt(box.bottom, 1)} a ${fmt(box.top, 1)}`);
          },
        },
        {
          text: "Ela vai da frente da cidade até a ponta da sombra mais comprida",
          test: ({ objects }) => {
            const sol = objects.sol;
            const shadow = shadowOf(sol);
            if (!shadow) return check(false, "o sol não é uma luz direcional");
            const { box, view } = shadow;
            // a direção em que a luz anda: do sol para o alvo
            const down = -toward(sol.worldPosition, sol.target ?? [0, 0, 0])[1];
            if (down <= 0.01) return check(false, "o sol não está acima da cidade");
            let nearest = Infinity;
            let farthest = -Infinity;
            for (const b of buildings(objects)) {
              for (const p of cornersOf(b.box)) {
                const depth = -apply(view, p)[2];
                nearest = Math.min(nearest, depth);
                // a sombra de um canto do telhado cai no chão mais adiante, no mesmo raio de luz
                farthest = Math.max(farthest, depth + Math.max(0, p[1]) / down);
              }
            }
            if (box.near > nearest) return check(false, `a frente da caixa (near) está a ${fmt(box.near, 1)} do sol, e a cidade começa a ${fmt(nearest, 1)} dele: a caixa corta os prédios mais perto do sol`);
            return check(box.far >= farthest, `o fundo da caixa (far) está a ${fmt(box.far, 1)} do sol, e a sombra mais comprida termina a ${fmt(farthest, 1)} dele`);
          },
        },
        {
          text: "A foto da sombra tem detalhe: cada pixel dela cobre no máximo 0,05",
          test: ({ objects }) => {
            const shadow = shadowOf(objects.sol);
            if (!shadow) return check(false, "o sol não é uma luz direcional");
            const { box, mapSize } = shadow;
            const texel = Math.max((box.right - box.left) / mapSize[0], (box.top - box.bottom) / mapSize[1]);
            return check(texel <= 0.05, `com a caixa de ${fmt(box.right - box.left, 0)} de largura e ${int(mapSize[0])} pixels, cada pixel cobre ${fmt(texel)}: a borda da sombra sai em degraus`);
          },
        },
      ],
    },
    {
      id: "neblina",
      title: "A neblina",
      view: "camera",
      goal:
        "Para terminar, a neblina. Ela mistura a cor de cada ponto com a cor dela, mais quanto mais longe da câmera ele estiver: a frente da cidade fica nítida, o fundo vai sumindo, e a borda do chão desaparece. Com a neblina da mesma cor do céu, o que está longe se desfaz no céu, como no fim de tarde de uma cidade grande, com o ar cheio de poeira e umidade.",
      lines: [
        {
          code: 'cena.fog = new THREE.Fog("#f6a26b", 25, 70);',
          text: "Uma neblina linear, da cor do céu. Até 25 da câmera, nada muda; de 25 a 70, a cor de cada ponto vai virando a da neblina; depois de 70, só sobra a neblina. Os prédios da frente estão a uns 24 da câmera, e os do fundo, a uns 62: os da frente ficam nítidos, e os do fundo, quase da cor do céu.",
        },
      ],
      why: [
        {
          title: "Por que a neblina da cor do céu?",
          text: "O ar entre o olho e uma coisa distante espalha luz: quanto mais ar, mais a coisa se parece com o próprio céu. Os pintores chamam de perspectiva atmosférica, e é um dos jeitos que o olho tem de saber o que está longe. Com a neblina de outra cor, os prédios do fundo virariam uma mancha que não combina com o céu, e a borda do chão continuaria marcada.",
        },
        {
          title: "Como a conta é feita?",
          text: "Em cada pixel, o shader mede a profundidade do ponto, o quanto ele fica à frente da câmera, e calcula quanto de neblina entra: nada antes do `near`, tudo depois do `far`, e uma curva suave no meio (a função smoothstep). A cor final é a mistura da cor do material com a da neblina, nessa proporção. Todo material do Three.js faz essa conta sozinho, a não ser que tenha `fog: false`.",
        },
        {
          title: "Fog ou FogExp2?",
          text: "A `FogExp2` não tem começo nem fim: tem uma densidade, e a neblina cresce desde a câmera, como numa névoa de verdade. A `Fog` linear é mais fácil de controlar: ela deixa a frente da cidade intocada e esconde por inteiro o que passa do `far`.",
        },
      ],
      try: [
        'Troque a cor da neblina por `"#ffffff"`: o fundo da cidade vira uma névoa branca, que não combina com o céu laranja, e a borda do chão volta a aparecer. A conferência avisa. Depois volte para a cor do céu.',
        "Mude o `70` para `40`: a neblina engrossa, e a metade de trás da cidade some no céu. Depois volte para 70.",
        'Troque a linha pela neblina exponencial, `cena.fog = new THREE.FogExp2("#f6a26b", 0.02);`: até a frente da cidade fica um pouco apagada, e o fundo some aos poucos.',
      ],
      needs: ["chao", "predio"],
      checks: [
        {
          text: "A cena tem neblina",
          test: ({ fog }) => check(!!fog, "a cena não tem neblina: falta cena.fog"),
        },
        {
          text: "A neblina tem a cor do céu",
          test: ({ fog, background }) => {
            if (!fog) return check(false, "a cena não tem neblina");
            if (!background) return check(false, "a cena não tem cor de fundo");
            return check(fog.color === background, `a neblina é ${fog.color}, e o céu, ${background}: o que está longe vira uma mancha de outra cor`);
          },
        },
        {
          text: "A frente da cidade fica nítida, e o fundo quase some",
          test: ({ fog, camera, objects }) => {
            if (!fog) return check(false, "a cena não tem neblina");
            if (!camera) return check(false, "não achei a câmera do código");
            const list = buildings(objects);
            const front = Math.min(...list.flatMap((b) => cornersOf(b.box).map((p) => depthOf(camera, p))));
            const back = Math.max(...list.map((b) => depthOf(camera, centerOf(b.box))));
            const [near, far] = [fogAt(fog, front), fogAt(fog, back)];
            if (near > 0.25) return check(false, `o prédio mais perto já fica ${pct(near)} coberto pela neblina: ela começa perto demais da câmera`);
            return check(far >= 0.5, `o prédio mais longe fica só ${pct(far)} coberto: a neblina quase não aparece`);
          },
        },
        {
          text: "A borda do chão some na neblina",
          test: ({ fog, camera, objects }) => {
            if (!fog) return check(false, "a cena não tem neblina");
            if (!camera) return check(false, "não achei a câmera do código");
            const box = objects.chao.box;
            if (!box) return check(false, "o chão não tem geometria");
            // pontos da borda do chão que a câmera pode ver: até 40° da direção em que ela olha
            const y = (box.min[1] + box.max[1]) / 2;
            const edge = [];
            for (let k = 0; k <= 200; k++) {
              const x = box.min[0] + ((box.max[0] - box.min[0]) * k) / 200;
              const z = box.min[2] + ((box.max[2] - box.min[2]) * k) / 200;
              edge.push([x, y, box.min[2]], [x, y, box.max[2]], [box.min[0], y, z], [box.max[0], y, z]);
            }
            const seen = edge.filter((p) => dot(toward(camera.worldPosition, p), camera.direction) >= Math.cos(Math.PI / 4.5));
            if (!seen.length) return check(true);
            const depth = Math.min(...seen.map((p) => depthOf(camera, p)));
            const covered = fogAt(fog, depth);
            return check(covered >= 0.98, `a borda do chão fica a ${fmt(depth, 0)} da câmera, e só ${pct(covered)} coberta pela neblina`);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
