// sistemaSolar.js — o projeto "Sistema solar": o Sol, a Terra com a Lua e Saturno com o anel, em 8
// passos no VisuGraph e 1 no seu computador. O assunto é o grafo de cena: cada órbita é um grupo que
// gira, e o que está dentro dele vai junto.
//
// O código de cada passo sai de codeAt(n), que monta o texto linha a linha (source.js), e os textos
// seguem o Gerador de galáxias (galaxia.js): `assim` é código, e `lines` aponta trechos do código
// do passo (o primeiro depois de `after`, quando o trecho se repete).

import { axisOf, check, deg, dist, fmt, isRound, luminance, sphereRadius, toWorld } from "./checks.js";
import { distanceAttenuation } from "../../lib/phong3d.js";
import { computerStep } from "./computador.js";
import { by, codeAt as sourceAt, from } from "./source.js";

const SOURCE = [
  from(0, "// Sistema solar"),
  from(
    1,
    "",
    "const cena = new THREE.Scene();",
    'cena.background = new THREE.Color("#0b1022");',
    "",
    "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);",
    "camera.position.set(0, 16, 16);",
    "camera.lookAt(0, 0, 0);",
  ),
  from(
    2,
    "",
    "// O Sol: uma esfera que brilha com a própria cor",
    "const sol = new THREE.Mesh(",
    "  new THREE.SphereGeometry(1.5, 48, 24),",
    '  new THREE.MeshBasicMaterial({ color: "#ffc83d" })',
    ");",
    "cena.add(sol);",
  ),
  from(
    4,
    "",
    "// A luz sai do centro do Sol; a ambiente, fraca, clareia o lado da noite",
    'const luzDoSol = new THREE.PointLight("#ffffff", 80);',
    "cena.add(luzDoSol);",
    "",
    'const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.2);',
    "cena.add(luzAmbiente);",
  ),
  from(5, "", "// A órbita da Terra: um grupo no centro do Sol que gira e leva a Terra junto", "const orbitaTerra = new THREE.Group();", "cena.add(orbitaTerra);"),
  from(
    3,
    "",
    "// A Terra: o material dela reage à luz",
    "const terra = new THREE.Mesh(",
    "  new THREE.SphereGeometry(0.45, 32, 16),",
    '  new THREE.MeshStandardMaterial({ color: "#3d7bff" })',
    ");",
    "terra.position.set(4.5, 0, 0);",
  ),
  by({ 3: "cena.add(terra);", 5: "orbitaTerra.add(terra);" }),
  from(
    6,
    "",
    "// A Lua: a órbita dela fica dentro da Terra e vai aonde a Terra for",
    "const orbitaLua = new THREE.Group();",
    "terra.add(orbitaLua);",
    "",
    "const lua = new THREE.Mesh(",
    "  new THREE.SphereGeometry(0.12, 24, 12),",
    '  new THREE.MeshStandardMaterial({ color: "#c8c8c8" })',
    ");",
    "lua.position.set(0.8, 0, 0);",
    "orbitaLua.add(lua);",
  ),
  from(
    7,
    "",
    "// Saturno, mais longe, com o eixo inclinado e o anel em volta do equador",
    "const orbitaSaturno = new THREE.Group();",
    "cena.add(orbitaSaturno);",
    "",
    "const saturno = new THREE.Mesh(",
    "  new THREE.SphereGeometry(0.7, 32, 16),",
    '  new THREE.MeshStandardMaterial({ color: "#e0c38c" })',
    ");",
    "saturno.position.set(7.5, 0, 0);",
    "saturno.rotation.z = THREE.MathUtils.degToRad(27);",
    "orbitaSaturno.add(saturno);",
    "",
    "const anel = new THREE.Mesh(",
    "  new THREE.RingGeometry(0.95, 1.5, 64),",
    '  new THREE.MeshStandardMaterial({ color: "#cdb98f", side: THREE.DoubleSide })',
    ");",
    "anel.rotation.x = -Math.PI / 2;",
    "saturno.add(anel);",
  ),
  from(
    8,
    "",
    "// Os caminhos das órbitas: roscas finas e transparentes, deitadas no plano das órbitas",
    "const materialCaminho = new THREE.MeshBasicMaterial({",
    '  color: "#8090b0",',
    "  transparent: true,",
    "  opacity: 0.35,",
    "});",
    "",
    "const caminhoTerra = new THREE.Mesh(",
    "  new THREE.TorusGeometry(4.5, 0.02, 8, 160),",
    "  materialCaminho",
    ");",
    "caminhoTerra.rotation.x = Math.PI / 2;",
    "cena.add(caminhoTerra);",
    "",
    "const caminhoSaturno = new THREE.Mesh(",
    "  new THREE.TorusGeometry(7.5, 0.02, 8, 160),",
    "  materialCaminho",
    ");",
    "caminhoSaturno.rotation.x = Math.PI / 2;",
    "cena.add(caminhoSaturno);",
  ),
  from(5, "", "function animar(tempo) {", "  orbitaTerra.rotation.y = tempo * 0.5;"),
  from(6, "  orbitaLua.rotation.y = tempo * 2;"),
  from(7, "  orbitaSaturno.rotation.y = tempo * 0.2;"),
  from(5, "}"),
];

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
const codeAt = (n) => sourceAt(SOURCE, n);

// ---------------------------------------------------------------------------
// Conferências: as esferas são medidas pela amostra de vértices, e as distâncias, no mundo

/** Materiais que calculam a luz que chega a cada ponto. */
const LIT = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial"];

/** Nome do pai do objeto no código: "a cena" se está direto nela. */
const parentName = (obj, nameOf) => (obj.parent == null ? "a cena" : (nameOf(obj.parent) ?? "outro objeto"));

/** Confere que `obj` está dentro do grupo chamado `name`. */
function inside(obj, name, nameOf) {
  const parent = parentName(obj, nameOf);
  return check(parent === name, parent === "a cena" ? "está direto na cena" : `o pai é ${parent}`);
}

/** Confere que um planeta dá a volta longe do Sol, sem encostar nele. */
function farFromSun(planet, sun) {
  const d = dist(planet.worldPosition, sun.worldPosition);
  const gap = d - sphereRadius(sun) - sphereRadius(planet);
  if (gap < 0) return check(false, "encosta no Sol");
  return check(gap >= 1, `sobra só ${fmt(gap)} entre as duas superfícies`);
}

/** Luzes pontuais com nome, que a conferência sabe onde estão. */
const pointLights = (objects) => Object.values(objects).filter((o) => o.type === "PointLight");

/** O caminho é um círculo deitado no plano das órbitas, em volta do Sol, com o raio da órbita do planeta. */
function pathCheck(path, planet, sun) {
  const sample = path.geometry?.sample ?? [];
  if (!sample.length) return check(false, "a geometria não tem posições");
  const c = sun.worldPosition;
  const points = sample.map((p) => toWorld(path, p));
  const height = Math.max(...points.map((p) => Math.abs(p[1] - c[1])));
  if (height > 0.1) return check(false, `ele sai ${fmt(height)} do plano das órbitas: está em pé ou inclinado`);
  const center = [0, 2].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  const off = Math.hypot(center[0] - c[0], center[1] - c[2]);
  if (off > 0.15) return check(false, `o centro dele está a ${fmt(off)} do Sol`);
  const r = points.reduce((sum, p) => sum + Math.hypot(p[0] - c[0], p[2] - c[2]), 0) / points.length;
  const d = Math.hypot(planet.worldPosition[0] - c[0], planet.worldPosition[2] - c[2]);
  return check(Math.abs(r - d) <= 0.15, `o raio dele é ${fmt(r)}, e o planeta está a ${fmt(d)} do Sol`);
}

// ---------------------------------------------------------------------------
// No seu computador: o projeto Vite com o código do fim do passo 8 em src/cena.js

const END = codeAt(8);
const OPTIONS = { scene: "cena", camera: "camera", perspective: true, animar: true, background: true, shadows: false, target: null };

const COMPUTER = [
  computerStep({
    id: "sistema-solar",
    title: "Sistema solar",
    end: END,
    options: OPTIONS,
    words: {
      yours: "o seu sistema solar",
      browser: "o código do sistema solar precisa dele no navegador",
      privates: "`sol`, `terra`, `lua` e o resto",
      stretched: "o Sol sai esticado ou achatado",
      jump: "os planetas dariam um salto",
      animarStep: 5,
    },
    goal:
      "Até aqui, o VisuGraph fazia uma parte do trabalho por você: criava o renderer, ajustava o desenho ao tamanho do visor, girava a vista com o mouse e chamava `animar` a cada quadro. Neste passo, o sistema solar vira um projeto no seu computador, com o Node.js e o Vite, as ferramentas de quem faz sites com three.js. O código da cena vai quase igual para o arquivo `src/cena.js`, e o que o VisuGraph fazia fica escrito no `src/main.js`, junto com os OrbitControls, que giram a câmera com o mouse. Se você já levou a galáxia para o computador, os arquivos são os mesmos: só o `cena.js` muda.",
    why: [
      {
        title: "Por que os controles mexem na câmera, e não no sistema solar?",
        text: "Girar a câmera em volta do Sol e girar o sistema inteiro na frente da câmera dão a mesma imagem. Os OrbitControls mudam só a câmera, então a cena continua do jeito que o seu código deixou: os planetas ainda giram pelo `animar`, enquanto o mouse leva a câmera para onde você quiser.",
      },
    ],
    try: [
      "No `main.js`, depois do `enableDamping`, acrescente `controles.autoRotate = true;`: a câmera passa a dar voltas sozinha, e o mouse continua funcionando.",
      "Limite a distância da câmera com `controles.minDistance = 8;` e `controles.maxDistance = 40;`: ela não entra no Sol nem se perde longe dele.",
      "Mude a velocidade da Lua (o `2` do `animar`) no `src/cena.js` e salve: a página recarrega sozinha, sem rodar nada no terminal.",
      "Desligue o servidor (Ctrl+C) e rode `npm run build` e depois `npm run preview`: é o site pronto para publicar, na pasta `dist`.",
    ],
    confirm: [
      "O terminal mostra o endereço http://localhost:5173, e o sistema solar aparece nele, com os planetas girando",
      "Arrastar com o mouse gira a câmera em volta do Sol, e a roda aproxima",
      "Mudar um número no `src/cena.js` e salvar atualiza a página sozinho",
    ],
  }),
];

// ---------------------------------------------------------------------------

export const SISTEMA_SOLAR = {
  id: "sistema-solar",
  title: "Sistema solar",
  level: "facil",
  summary: "O Sol, a Terra com a Lua e Saturno com o anel, cada um na sua órbita: grupos dentro de grupos, girando juntos.",
  concepts: [
    "Malha: geometria e material",
    "Material com e sem luz",
    "Luz pontual e ambiente",
    "Grafo de cena",
    "Rotação em radianos",
    "Animação pelo tempo",
    "Transparência",
    "Node.js e Vite",
    "OrbitControls",
  ],
  start: codeAt(0),
  steps: [
    {
      id: "palco",
      title: "O palco",
      view: "camera",
      goal:
        "Toda cena do Three.js tem três peças: a cena, que guarda os objetos; a câmera, que diz de onde se olha; e o renderer, que transforma a cena em pixels. Aqui no código vivo, o VisuGraph já cria o renderer e o laço que redesenha o visor, então você escreve a cena e a câmera. Os planetas vão girar num plano deitado, como discos sobre uma mesa, e a câmera olha esse plano de cima e de lado. Por enquanto, o visor mostra só o fundo.",
      lines: [
        {
          code: "const cena = new THREE.Scene();",
          text: "`THREE` é o three.js, a biblioteca deste projeto. Ela conversa com o WebGL, a interface do navegador para a placa de vídeo, para você não escrever shaders e buffers à mão. `new THREE.Scene()` cria a cena, a raiz de uma árvore de objetos. Neste projeto, a árvore é o assunto: a Lua vai ser filha da Terra, e a Terra, filha da órbita dela.",
        },
        {
          code: 'cena.background = new THREE.Color("#0b1022");',
          text: "A cor de fundo, pintada antes de tudo a cada quadro: um azul-marinho bem escuro. `THREE.Color` entende cores como o CSS.",
        },
        {
          code: "const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);",
          text: "Uma câmera com perspectiva: o que está longe parece menor. Os números são o campo de visão vertical (60°), a proporção largura/altura (o visor troca o 16/9 pela dele) e as distâncias perto (0,1) e longe (100): fora dessa faixa, nada é desenhado.",
        },
        {
          code: "camera.position.set(0, 16, 16);",
          text: "Põe a câmera 16 unidades acima e 16 à frente do centro, a uns 23 de distância dele. No Three.js, o eixo y aponta para cima e o z aponta para fora da tela, na direção de quem olha. Os planetas vão girar no plano de x e z, o chão da cena.",
        },
        {
          code: "camera.lookAt(0, 0, 0);",
          text: "Gira a câmera para olhar o centro, onde vai ficar o Sol. Como a câmera está tão alta quanto está à frente (16 e 16), ela vê o plano das órbitas de cima, a 45°.",
        },
      ],
      why: [
        {
          title: "Por que olhar de cima e de lado?",
          text: "De lado, na altura do plano, as órbitas viram traços retos, e os planetas passam uns na frente dos outros. Bem de cima, as órbitas são círculos perfeitos, mas tudo fica chato, como um mapa. A 45°, os círculos aparecem como elipses, e ainda se vê o volume de cada planeta.",
        },
        {
          title: "Por que azul-marinho, e não preto?",
          text: "O espaço é preto, mas num fundo preto um objeto apagado desaparece. Num azul bem escuro, dá para ver o contorno de qualquer objeto, mesmo sem luz nenhuma nele, o que vai ser útil no passo 3.",
        },
      ],
      try: [
        "Ponha a câmera na altura do plano, com `camera.position.set(0, 0, 25);`: a conferência avisa que, assim, as órbitas viram traços. Depois volte.",
        "Desligue a Câmera do código, na barra de cima, e gire a vista arrastando o visor: a câmera do código aparece como um ícone, olhando para o centro.",
      ],
      needs: [],
      checks: [
        {
          text: "A cena tem um fundo escuro",
          test: ({ background }) =>
            background ? check(luminance(background) < 0.15, `o fundo é ${background}, claro demais para o espaço`) : check(false, "a cena não tem cor de fundo"),
        },
        {
          text: "A câmera está longe do centro e olha para ele",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const p = camera.worldPosition;
            const d = Math.hypot(...p);
            if (d < 10) return check(false, `a câmera está a ${fmt(d)} do centro, e Saturno vai ficar a 7,5 dele`);
            const cos = p.reduce((sum, c, i) => sum - (c / d) * camera.direction[i], 0);
            return check(cos > 0.995, `a câmera olha ${fmt(deg(Math.acos(Math.min(1, cos))), 0)}° para fora do centro`);
          },
        },
        {
          text: "Ela vê o plano das órbitas de cima, a pelo menos 20°",
          test: ({ camera }) => {
            if (!camera) return check(false, "não achei a câmera do código");
            const p = camera.worldPosition;
            const angle = deg(Math.asin(p[1] / (Math.hypot(...p) || 1)));
            return check(angle >= 20, angle < 0 ? "a câmera está abaixo do plano" : `a câmera está só ${fmt(angle, 0)}° acima do plano`);
          },
        },
      ],
    },
    {
      id: "sol",
      title: "O Sol",
      view: "camera",
      goal:
        "O primeiro objeto é o Sol. Um objeto que aparece no Three.js é uma malha (`THREE.Mesh`): a junção de uma geometria, a forma, feita de triângulos, com um material, que diz a cor de cada pixel dela. O Sol é uma esfera, e o material dele não depende de luz nenhuma: ele mesmo é a fonte de luz.",
      lines: [
        {
          code: "const sol = new THREE.Mesh(",
          text: "Cria a malha, com a geometria e o material das duas linhas de dentro. Cada malha tem a sua posição, rotação e escala; a mesma geometria ou o mesmo material podem servir a várias malhas.",
        },
        {
          code: "new THREE.SphereGeometry(1.5, 48, 24),",
          text: "Uma esfera de raio 1,5, feita de 48 fatias em volta, como os gomos de uma laranja, e 24 faixas de um polo ao outro: uns 2.200 triângulos planos que, juntos, parecem redondos.",
        },
        {
          code: 'new THREE.MeshBasicMaterial({ color: "#ffc83d" })',
          text: "O material mais simples: pinta todos os pixels da malha com a mesma cor, sem conta de luz. Por isso o Sol aparece como um disco chapado, sem lado claro nem escuro, como se espera de algo que emite luz.",
        },
        {
          code: "cena.add(sol);",
          text: "Põe o Sol na cena. Sem `position`, ele fica na origem, o ponto (0; 0; 0), no centro de tudo.",
        },
      ],
      why: [
        {
          title: "Por que o MeshBasicMaterial?",
          text: "Os outros materiais calculam quanta luz chega a cada ponto e escurecem o lado que fica de costas para ela. O Sol é a lâmpada do sistema solar: nada ilumina o Sol, então o certo é o material que ignora a luz. É o mesmo truque de telas, lâmpadas e letreiros em qualquer cena 3D.",
        },
        {
          title: "Por que 48 e 24?",
          text: "A esfera é um poliedro: com poucos triângulos, a borda fica quebrada em retas. Mais triângulos custam pouco para a placa de vídeo, mas não são de graça. O Sol é o maior objeto da tela, onde as quinas mais apareceriam, então ganha mais divisões que os planetas.",
        },
      ],
      try: [
        "Troque `48, 24` por `8, 4` e veja a borda do Sol virar um polígono.",
        'Troque a cor por `"#ff7a1a"`, a de uma estrela mais fria que o Sol.',
        "Clique em `sol` na lista de objetos e abra a aba Propriedades: dá para mudar ali o raio e os segmentos da esfera, e ver o material dele.",
      ],
      needs: ["sol"],
      checks: [
        {
          text: "O Sol é uma esfera no centro da cena",
          test: ({ objects }) => {
            const { sol } = objects;
            if (sol.type !== "Mesh") return check(false, `sol é um ${sol.type}`);
            if (!isRound(sol)) return check(false, "sol não é redondo");
            const d = Math.hypot(...sol.worldPosition);
            return check(d < 0.05, `o Sol está a ${fmt(d)} do centro`);
          },
        },
        {
          text: "Ele brilha com a própria cor, sem depender de luz (MeshBasicMaterial)",
          test: ({ objects }) => {
            const type = objects.sol.material?.type;
            return check(type === "MeshBasicMaterial", `o material é ${type ?? "outro"}`);
          },
        },
        {
          text: "A cor dele é clara, de estrela",
          test: ({ objects }) => {
            const hex = objects.sol.material?.hex;
            return hex ? check(luminance(hex) >= 0.2, `o Sol é ${hex}, escuro demais para uma estrela`) : check(false, "o material não tem cor");
          },
        },
      ],
    },
    {
      id: "terra",
      title: "A Terra",
      view: "camera",
      goal:
        "Agora um planeta: a Terra, uma esfera menor, ao lado do Sol. Ela é feita de outro material, um que reage à luz, como quase tudo numa cena 3D. Rode o código e repare: a Terra aparece preta, só um contorno no fundo azul. Não é um erro. Ainda não há luz nenhuma na cena, e um material que depende de luz, sem luz, fica preto, como um objeto num quarto escuro.",
      lines: [
        {
          code: "const terra = new THREE.Mesh(",
          text: "Outra malha, com a mesma receita do Sol: geometria e material.",
        },
        {
          code: "new THREE.SphereGeometry(0.45, 32, 16),",
          text: "Uma esfera de raio 0,45, menos de um terço do Sol. Ela ocupa menos espaço na tela, então menos divisões já bastam para parecer redonda.",
        },
        {
          code: 'new THREE.MeshStandardMaterial({ color: "#3d7bff" })',
          text: "O material padrão do Three.js para objetos iluminados. Em cada pixel, ele calcula quanta luz chega e quanto volta para a câmera, imitando materiais de verdade. O azul é a cor que a superfície reflete; sem luz, não há o que refletir.",
        },
        {
          code: "terra.position.set(4.5, 0, 0);",
          text: "Põe a Terra 4,5 unidades à direita do Sol, no eixo x, e no plano das órbitas (y = 0).",
        },
        {
          code: "cena.add(terra);",
          text: "Por enquanto, a Terra fica direto na cena, como o Sol. No passo 5, ela muda de lugar na árvore.",
        },
      ],
      why: [
        {
          title: "Por que a Terra está preta, se o Sol brilha?",
          text: "No Three.js, um objeto que parece brilhar não ilumina os outros. O Sol parece aceso porque o material dele ignora a luz, mas ele não manda luz nenhuma para a cena. Quem ilumina são as luzes, objetos feitos para isso, e a cena ainda não tem nenhuma: é o próximo passo.",
        },
        {
          title: "Por que o MeshStandardMaterial?",
          text: "É o material de renderização baseada em física (PBR) do Three.js: além da cor, ele tem rugosidade (`roughness`) e metal (`metalness`), e reage à luz como os objetos reais, sob qualquer iluminação. Os materiais Lambert e Phong, mais antigos, fazem contas mais simples e mais baratas, mas cada um imita bem só alguns tipos de superfície.",
        },
        {
          title: "Por que tamanhos e distâncias fora de escala?",
          text: "Na escala de verdade, o raio do Sol é 109 vezes o da Terra, e a Terra fica a 215 raios do Sol. Com o Sol de raio 1,5, a Terra teria raio 0,014 e ficaria a 322 unidades: um ponto invisível, fora da câmera. Por isso quase todo desenho do sistema solar aumenta os planetas e aproxima as órbitas, como aqui.",
        },
      ],
      try: [
        "Troque o `MeshStandardMaterial` da Terra por `MeshBasicMaterial`: ela fica azul e chapada, como o Sol. Depois volte, porque a conferência pede um material que reaja à luz.",
        'Mude a cor da Terra para `"#ff4040"`: sem luz, qualquer cor dá preto.',
        "Clique na Terra no visor e arraste a seta vermelha: o `4.5` do código muda enquanto você arrasta.",
      ],
      needs: ["sol", "terra"],
      checks: [
        {
          text: "A Terra é uma esfera menor que o Sol",
          test: ({ objects }) => {
            const { sol, terra } = objects;
            if (!isRound(terra)) return check(false, "terra não é redonda");
            return check(sphereRadius(terra) < sphereRadius(sol), `o raio da Terra é ${fmt(sphereRadius(terra))}, e o do Sol, ${fmt(sphereRadius(sol))}`);
          },
        },
        {
          text: "Ela fica longe do Sol, com espaço entre os dois",
          test: ({ objects }) => farFromSun(objects.terra, objects.sol),
        },
        {
          text: "O material dela reage à luz",
          test: ({ objects }) => {
            const type = objects.terra.material?.type;
            return check(LIT.includes(type), `a Terra usa ${type ?? "outro material"}, que não reage à luz`);
          },
        },
      ],
    },
    {
      id: "luz",
      title: "A luz do Sol",
      view: "camera",
      goal:
        "A Terra precisa de luz, e a luz do sistema solar sai do Sol. Uma luz pontual (`PointLight`) parte de um ponto e ilumina em todas as direções, como uma lâmpada sem cúpula. Posta no centro do Sol, ela acende a metade da Terra virada para ele: é o dia, e o outro lado é a noite. Uma luz ambiente bem fraca clareia um pouco a noite, para ela não sumir no fundo.",
      lines: [
        {
          code: 'const luzDoSol = new THREE.PointLight("#ffffff", 80);',
          text: "Uma luz pontual branca, com intensidade 80. Sem `position`, ela fica na origem, no centro do Sol. A luz atravessa a esfera do Sol sem problema: no Three.js, a luz não para nos objetos, a não ser que as sombras estejam ligadas, e elas vêm desligadas.",
        },
        {
          code: "cena.add(luzDoSol);",
          text: "Uma luz também é um objeto da cena: só ilumina depois de adicionada.",
        },
        {
          code: 'const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.2);',
          text: "A luz ambiente chega igual a todos os pontos, de todas as direções: não tem posição nem lado. Com 0,2, ela clareia a noite da Terra só o bastante para o contorno aparecer.",
        },
      ],
      why: [
        {
          title: "Por que intensidade 80?",
          text: "O Three.js mede a luz em unidades da física: a intensidade da `PointLight` é em candelas, e a luz que chega a um objeto cai com o quadrado da distância, como na vida real. A 4,5 unidades do Sol, chegam 80 / 4,5² ≈ 4, o bastante para a Terra aparecer bem. Com intensidade 1, chegaria 80 vezes menos, e a Terra continuaria quase preta: é o que acontece com muito código antigo da internet, escrito quando o Three.js fazia outra conta.",
        },
        {
          title: "Por que só metade da Terra acende?",
          text: "O brilho de cada ponto depende do ângulo entre a superfície e a direção da luz: de frente para o Sol, o ponto recebe tudo; inclinado, menos; de costas, nada. É a lei do cosseno de Lambert, e é por ela que uma bola iluminada de um lado parece redonda. Na Terra de verdade, a linha entre o dia e a noite nasce do mesmo jeito.",
        },
        {
          title: "Por que uma luz ambiente, se no espaço a noite é escura?",
          text: "No espaço, sem ar para espalhar a luz, o lado da noite é preto mesmo. A luz ambiente é uma licença: ela faz o papel da luz que, numa sala, bate nas paredes e chega a todo canto, uma conta que o Three.js não faz. Fraca, ela mostra a forma do planeta sem apagar a diferença entre o dia e a noite.",
        },
      ],
      try: [
        "Mude a intensidade para 30 e depois para 300.",
        "Afaste a Terra para `x = 9`: com o dobro da distância, chega um quarto da luz.",
        "Ponha `//` no começo da linha `cena.add(luzAmbiente);`: a noite fica preta, como no espaço de verdade.",
      ],
      needs: ["sol", "terra"],
      checks: [
        {
          text: "Uma luz pontual sai do centro do Sol",
          test: ({ objects, lights }) => {
            const named = pointLights(objects);
            if (!lights.some((l) => l.type === "PointLight")) return check(false, named.length ? "a luz pontual não foi adicionada à cena" : "a cena não tem uma PointLight");
            if (!named.length) return check(false, "guarde a luz pontual numa variável, para a conferência achar onde ela está");
            const d = Math.min(...named.map((l) => dist(l.worldPosition, objects.sol.worldPosition)));
            return check(d <= sphereRadius(objects.sol), `a luz pontual está a ${fmt(d)} do centro do Sol, fora dele`);
          },
        },
        {
          text: "Chega luz bastante na Terra",
          test: ({ objects }) => {
            const named = pointLights(objects);
            if (!named.length) return check(false, "não há luz pontual");
            const e = named.reduce((sum, l) => {
              const d = dist(l.worldPosition, objects.terra.worldPosition);
              return sum + l.light.intensity * distanceAttenuation(d, l.light.distance ?? 0, l.light.decay ?? 2);
            }, 0);
            return check(e >= 0.5, `chega ${fmt(e)} de luz na Terra, quase nada: a luz enfraquece com o quadrado da distância`);
          },
        },
        {
          text: "Uma luz ambiente fraca clareia o lado da noite",
          test: ({ lights }) => {
            const ambient = lights.filter((l) => l.type === "AmbientLight" || l.type === "HemisphereLight");
            if (!ambient.length) return check(false, "não há luz ambiente");
            const total = ambient.reduce((sum, l) => sum + l.intensity, 0);
            if (total <= 0) return check(false, "a luz ambiente está apagada");
            return check(total <= 1, `a intensidade é ${fmt(total)}, forte demais: a noite fica quase tão clara quanto o dia`);
          },
        },
      ],
    },
    {
      id: "orbita",
      title: "Em órbita",
      view: "camera",
      goal:
        "Hora de pôr a Terra em órbita. Em vez de calcular a posição dela a cada quadro, você usa a árvore da cena, o grafo de cena: um grupo vazio no centro do Sol, com a Terra dentro. A posição da Terra passa a ser medida a partir do grupo, então, quando o grupo gira no lugar, a Terra vai junto, num círculo, como uma bola presa na ponta de um barbante.",
      lines: [
        {
          code: "const orbitaTerra = new THREE.Group();",
          text: "Um grupo é um objeto vazio: não desenha nada, mas tem posição, rotação e escala, e pode ter filhos. Ele nasce na origem, o centro do Sol.",
        },
        {
          code: "orbitaTerra.add(terra);",
          text: "A Terra entra no grupo, no lugar do `cena.add(terra)`: agora o pai dela é `orbitaTerra`. A posição (4,5; 0; 0) continua a mesma, mas passa a ser medida a partir do centro do grupo. Um objeto tem um pai só: o `add` tira o objeto de onde ele estava.",
        },
        {
          code: "function animar(tempo) {",
          text: "O VisuGraph chama esta função a cada quadro, umas 60 vezes por segundo, com o tempo em segundos desde que a animação começou.",
        },
        {
          code: "orbitaTerra.rotation.y = tempo * 0.5;",
          text: "O ângulo do grupo em volta do eixo y, o vertical, cresce 0,5 radiano por segundo: uma volta a cada 12,6 segundos (2π / 0,5). Visto de cima, o ângulo positivo gira no sentido anti-horário, o mesmo dos planetas de verdade vistos do norte.",
        },
      ],
      why: [
        {
          title: "Por que um grupo, e não seno e cosseno?",
          text: "Dá para fazer a órbita com trigonometria: `terra.position.x = Math.cos(tempo * 0.5) * 4.5` e `terra.position.z = -Math.sin(tempo * 0.5) * 4.5`. Para um nível, funciona. Mas a Lua gira em volta de uma Terra que também gira, e as contas se empilham. Com grupos, cada nível só gira, e o Three.js junta os movimentos: no próximo passo, a Lua entra na Terra e vai com ela, sem conta nenhuma.",
        },
        {
          title: "Como o Three.js sabe onde a Terra está?",
          text: "Cada objeto guarda a posição, a rotação e a escala em relação ao pai, numa matriz. A cada quadro, o Three.js desce a árvore a partir da cena e multiplica: a matriz de mundo da Terra é a do grupo vezes a dela, Mundo = M_pai · M. Clique em `terra` na lista de objetos e abra a aba Matemática para ver essa conta com os números de agora.",
        },
        {
          title: "Por que radianos?",
          text: "Um ângulo em radianos é o comprimento do arco que ele marca num círculo de raio 1: uma volta inteira mede 2π, uns 6,28. O Three.js, o `Math.sin` e o `Math.cos` medem ângulos assim. Com tempo × velocidade, a velocidade fica em radianos por segundo, e uma volta leva 2π dividido por ela.",
        },
      ],
      try: [
        "Afaste a Terra mudando o `4.5`: a órbita cresce, e uma volta continua levando 12,6 segundos, porque quem gira é o grupo. Depois volte para 4.5.",
        "Troque `rotation.y` por `rotation.z` no `animar`: a órbita fica em pé, girando em volta do eixo que sai da tela.",
        "Troque `0.5` por `-0.5`: a Terra passa a girar no sentido horário.",
      ],
      needs: ["sol", "terra", "orbitaTerra"],
      checks: [
        {
          text: "A Terra está dentro do grupo orbitaTerra",
          test: ({ objects, nameOf }) => inside(objects.terra, "orbitaTerra", nameOf),
        },
        {
          text: "O grupo fica no centro do Sol",
          test: ({ objects }) => {
            const d = dist(objects.orbitaTerra.worldPosition, objects.sol.worldPosition);
            return check(d < 0.05, `o grupo está a ${fmt(d)} do centro do Sol`);
          },
        },
        {
          text: "A Terra dá a volta longe do Sol, sem encostar nele",
          test: ({ objects }) => farFromSun(objects.terra, objects.sol),
        },
        {
          text: "animar() gira o grupo em volta do eixo y",
          test: ({ animated, hasAnimar }) =>
            hasAnimar ? check(animated.has("orbitaTerra.rotation.y"), "animar() não muda orbitaTerra.rotation.y") : check(false, "não achei a função animar(tempo)"),
        },
      ],
    },
    {
      id: "lua",
      title: "A Lua",
      view: "camera",
      goal:
        "A Lua gira em volta da Terra enquanto a Terra gira em volta do Sol. Com a árvore da cena, é a receita do passo 5 um andar abaixo: um grupo no centro da Terra, filho dela, com a Lua dentro. Como o grupo é filho da Terra, ele vai aonde a Terra for, e a Lua dá a sua volta em torno de um centro que também anda.",
      lines: [
        {
          code: "const orbitaLua = new THREE.Group();",
          text: "A órbita da Lua: outro grupo vazio.",
        },
        {
          code: "terra.add(orbitaLua);",
          text: "O grupo entra na Terra, e não na cena. A posição dele, (0; 0; 0), passa a ser o centro da Terra, esteja ela onde estiver. Não são só os grupos que têm filhos: qualquer objeto do Three.js pode ter, até uma malha.",
        },
        {
          code: "new THREE.SphereGeometry(0.12, 24, 12),",
          text: "A Lua tem 0,12 de raio, uns 27% do raio da Terra: quase a proporção de verdade, que é de 27,3%.",
        },
        {
          code: "lua.position.set(0.8, 0, 0);",
          text: "A Lua fica a 0,8 do centro da Terra, medido a partir do grupo. Na escala de verdade, seriam 30 diâmetros da Terra; aqui, menos de um, para a Lua caber perto dela.",
        },
        {
          code: "orbitaLua.add(lua);",
          text: "A Lua entra no grupo. Da cena até ela, a árvore tem quatro andares: `orbitaTerra`, `terra`, `orbitaLua` e `lua`.",
        },
        {
          code: "orbitaLua.rotation.y = tempo * 2;",
          text: "A Lua dá uma volta a cada 3,1 segundos (2π / 2), quatro vezes mais rápido que a Terra em volta do Sol. Na vida real, são umas 13 voltas por ano.",
        },
      ],
      why: [
        {
          title: "Por que a órbita da Lua dentro da Terra?",
          text: "Se o grupo ficasse na cena, no lugar onde a Terra começa, a Terra iria embora, e a Lua continuaria girando em volta do lugar vazio. Dentro da Terra, o centro da órbita é sempre o centro da Terra. Outro jeito que funciona é pôr o grupo dentro de `orbitaTerra`, na mesma posição da Terra: ele gira junto do mesmo jeito.",
        },
        {
          title: "As rotações se somam?",
          text: "Sim. Vista da cena, a órbita da Lua gira 2,5 radianos por segundo: os 2 do grupo dela mais os 0,5 da órbita da Terra, que ela herda. Na vida real acontece o mesmo: a Lua leva 27,3 dias para dar a volta vista das estrelas, mas 29,5 de uma lua cheia à outra, porque nesse meio-tempo a Terra andou na órbita, e a Lua precisa andar mais um pouco para ficar de novo do lado oposto ao Sol.",
        },
      ],
      try: [
        "Troque `terra.add(orbitaLua)` por `cena.add(orbitaLua)`: o centro da órbita da Lua vira a origem da cena, e a Lua some dentro do Sol.",
        "Faça a Terra girar em volta do próprio eixo, com `terra.rotation.y = tempo * 3;` no `animar`: a Lua acelera, porque o grupo dela está dentro da Terra e herda o giro.",
        "Selecione `lua` na lista de objetos e abra a aba Matemática: a matriz Mundo do pai, a de `orbitaLua`, já junta o giro da órbita da Terra, a distância da Terra ao Sol e o giro da órbita da Lua.",
      ],
      needs: ["terra", "orbitaLua", "lua"],
      checks: [
        {
          text: "A órbita da Lua fica no centro da Terra e vai com ela",
          test: ({ objects, nameOf }) => {
            const { terra, orbitaLua } = objects;
            const parent = parentName(orbitaLua, nameOf);
            if (parent !== "terra" && parent !== "orbitaTerra") return check(false, parent === "a cena" ? "orbitaLua está direto na cena e não vai com a Terra" : `o pai de orbitaLua é ${parent}`);
            const d = dist(orbitaLua.worldPosition, terra.worldPosition);
            return check(d < 0.05, `orbitaLua está a ${fmt(d)} do centro da Terra`);
          },
        },
        {
          text: "A Lua está dentro do grupo orbitaLua",
          test: ({ objects, nameOf }) => inside(objects.lua, "orbitaLua", nameOf),
        },
        {
          text: "A Lua é menor que a Terra e fica perto dela, sem encostar",
          test: ({ objects }) => {
            const { terra, lua } = objects;
            const rT = sphereRadius(terra);
            const rL = sphereRadius(lua);
            if (!isRound(lua) || rL >= rT) return check(false, isRound(lua) ? `o raio da Lua é ${fmt(rL)}, e o da Terra, ${fmt(rT)}` : "lua não é redonda");
            const d = dist(lua.worldPosition, terra.worldPosition);
            if (d < rT + rL + 0.1) return check(false, `a Lua está a ${fmt(d)} do centro da Terra: encosta nela`);
            return check(d <= 3, `a Lua está a ${fmt(d)} da Terra, longe demais`);
          },
        },
        {
          text: "animar() gira a órbita da Lua",
          test: ({ animated, hasAnimar }) =>
            hasAnimar ? check(animated.has("orbitaLua.rotation.y"), "animar() não muda orbitaLua.rotation.y") : check(false, "não achei a função animar(tempo)"),
        },
      ],
    },
    {
      id: "saturno",
      title: "Saturno e o anel",
      view: "camera",
      goal:
        "O último planeta é Saturno, mais longe e mais devagar, com o seu anel. Ele traz duas ideias novas. A inclinação: o eixo de Saturno é inclinado em relação à órbita, e um ângulo pensado em graus vira radianos com `THREE.MathUtils.degToRad`. E a árvore de novo: o anel é filho de Saturno, então fica no centro dele e herda a inclinação, sem conta nenhuma.",
      lines: [
        {
          code: "const orbitaSaturno = new THREE.Group();",
          text: "A órbita de Saturno, com a receita da Terra: um grupo no centro do Sol, que vai girar no `animar`.",
        },
        {
          code: "new THREE.SphereGeometry(0.7, 32, 16),",
          text: "Saturno é maior que a Terra: aqui, 1,6 vez o raio dela; na vida real, 9 vezes.",
        },
        {
          code: "saturno.position.set(7.5, 0, 0);",
          text: "Mais longe do Sol que a Terra, a 7,5. Na vida real, Saturno fica quase 10 vezes mais longe do Sol que a Terra.",
        },
        {
          code: "saturno.rotation.z = THREE.MathUtils.degToRad(27);",
          text: "Inclina Saturno 27° em volta do eixo z, o que sai da tela. `degToRad` converte graus em radianos: 27 × π / 180 ≈ 0,47. O eixo de Saturno de verdade é inclinado 26,7°.",
        },
        {
          code: "new THREE.RingGeometry(0.95, 1.5, 64),",
          text: "Um anel chato: um disco de raio 1,5 com um furo de raio 0,95, feito de 64 fatias. Como toda geometria plana do Three.js, ele nasce em pé, no plano de x e y.",
        },
        {
          code: "side: THREE.DoubleSide",
          text: "Pinta os dois lados de cada triângulo. Por padrão, o Three.js pinta só a frente, e o anel sumiria visto por baixo.",
        },
        {
          code: "anel.rotation.x = -Math.PI / 2;",
          text: "Deita o anel: −90° em volta do eixo x, com a frente virada para cima. Agora ele fica no plano do equador de Saturno.",
        },
        {
          code: "saturno.add(anel);",
          text: "O anel é filho de Saturno: fica no centro dele, vai junto na órbita e herda a inclinação de 27°.",
        },
        {
          code: "orbitaSaturno.rotation.y = tempo * 0.2;",
          text: "Uma volta a cada 31 segundos (2π / 0,2), 2,5 vezes o tempo da Terra. Na vida real, Saturno leva 29 anos para dar uma volta no Sol.",
        },
      ],
      why: [
        {
          title: "Por que o anel nasce em pé?",
          text: "As geometrias planas do Three.js (`PlaneGeometry`, `CircleGeometry`, `RingGeometry`) nascem em pé, no plano de x e y, viradas para o lado de z positivo, como uma tela vista de frente. Para um chão, uma água ou um anel deitado, gira-se 90° em x: é uma das linhas mais comuns do Three.js.",
        },
        {
          title: "Por que DoubleSide?",
          text: "Cada triângulo tem frente e verso, pela ordem dos vértices. Para economizar, o Three.js pinta só a frente (`FrontSide`): numa esfera, o verso dos triângulos fica do lado de dentro, onde nunca aparece. Um anel chato é visto dos dois lados, então os dois precisam ser pintados.",
        },
        {
          title: "Por que a inclinação de Saturno dá a volta junto?",
          text: "Saturno está preso ao grupo da órbita, e o grupo gira: a inclinação gira junto, e o eixo de Saturno muda de direção ao longo da volta. Na vida real, o eixo aponta sempre para o mesmo lado das estrelas, e é por isso que, da Terra, o anel é visto ora aberto, ora de lado. O Experimente corrige com uma linha.",
        },
      ],
      try: [
        "Para o eixo apontar sempre para o mesmo lado, acrescente `saturno.rotation.y = -tempo * 0.2;` no `animar`: Saturno gira para trás o que o grupo gira para a frente, e só a inclinação fica.",
        "Tire o `side: THREE.DoubleSide`, desligue a Câmera do código e gire a vista para olhar o anel por baixo.",
        "Troque o 27 por 98, a inclinação de Urano, o planeta que gira deitado: a conferência avisa que Saturno não é tão inclinado.",
      ],
      needs: ["sol", "terra", "orbitaSaturno", "saturno", "anel"],
      checks: [
        {
          text: "Saturno fica mais longe do Sol que a Terra",
          test: ({ objects }) => {
            const { sol, terra, saturno } = objects;
            const dT = dist(terra.worldPosition, sol.worldPosition);
            const dS = dist(saturno.worldPosition, sol.worldPosition);
            return check(dS >= dT + 1, `Saturno está a ${fmt(dS)} do Sol, e a Terra, a ${fmt(dT)}`);
          },
        },
        {
          text: "Saturno dá a volta no Sol dentro do grupo orbitaSaturno",
          test: ({ objects, nameOf, animated, hasAnimar }) => {
            const { sol, saturno, orbitaSaturno } = objects;
            const parent = inside(saturno, "orbitaSaturno", nameOf);
            if (!parent.ok) return parent;
            const d = dist(orbitaSaturno.worldPosition, sol.worldPosition);
            if (d >= 0.05) return check(false, `o grupo está a ${fmt(d)} do centro do Sol`);
            if (!hasAnimar) return check(false, "não achei a função animar(tempo)");
            return check(animated.has("orbitaSaturno.rotation.y"), "animar() não muda orbitaSaturno.rotation.y");
          },
        },
        {
          text: "O eixo de Saturno é inclinado, entre 10° e 45°",
          test: ({ objects }) => {
            const tilt = deg(Math.acos(Math.max(-1, Math.min(1, axisOf(objects.saturno, 1)[1]))));
            return check(tilt >= 10 && tilt <= 45, `o eixo está inclinado ${fmt(tilt, 0)}°`);
          },
        },
        {
          text: "O anel é filho de Saturno e fica em volta do equador dele",
          test: ({ objects, nameOf }) => {
            const { saturno, anel } = objects;
            const parent = inside(anel, "saturno", nameOf);
            if (!parent.ok) return parent;
            const c = saturno.worldPosition;
            const d = dist(anel.worldPosition, c);
            if (d >= 0.05) return check(false, `o anel está a ${fmt(d)} do centro de Saturno`);
            const sample = anel.geometry?.sample ?? [];
            if (!sample.length) return check(false, "a geometria do anel não tem posições");
            const axis = axisOf(saturno, 1);
            const out = Math.max(...sample.map((p) => Math.abs(toWorld(anel, p).reduce((sum, x, i) => sum + (x - c[i]) * axis[i], 0))));
            return check(out < 0.05, `o anel sai ${fmt(out)} do plano do equador: falta deitar o anel`);
          },
        },
        {
          text: "O anel aparece dos dois lados (side: THREE.DoubleSide)",
          test: ({ objects }) => check(objects.anel.material?.side === "DoubleSide", `o anel pinta só ${objects.anel.material?.side === "BackSide" ? "o verso" : "a frente"}`),
        },
      ],
    },
    {
      id: "caminhos",
      title: "Os caminhos",
      view: "camera",
      goal:
        "Para terminar, os caminhos das órbitas: dois círculos finos que mostram por onde a Terra e Saturno passam. Cada caminho é uma rosca bem fina (`TorusGeometry`), deitada no plano das órbitas. Os dois usam o mesmo material, meio transparente, para ficarem discretos: são uma linha guia, não uma coisa do espaço.",
      lines: [
        {
          code: "const materialCaminho = new THREE.MeshBasicMaterial({",
          text: "Um material só, guardado numa variável, para os dois caminhos. É um `MeshBasicMaterial` porque o caminho é um desenho, que não precisa de luz nem tem lado escuro.",
        },
        {
          code: "transparent: true,",
          text: "Liga a transparência: sem esta linha, o `opacity` é ignorado.",
        },
        {
          code: "opacity: 0.35,",
          text: "Cada pixel do caminho mistura 35% da cor dele com 65% da cor que já estava ali.",
        },
        {
          code: "new THREE.TorusGeometry(4.5, 0.02, 8, 160),",
          text: "Uma rosca (um toro) de raio 4,5, o da órbita da Terra, com um tubo de 0,02 de raio, bem fino. O tubo tem 8 lados, e a volta, 160 segmentos: com poucos, o círculo viraria um polígono.",
        },
        {
          code: "  materialCaminho",
          after: "const caminhoTerra",
          text: "O mesmo material nos dois caminhos: mudar a cor dele muda os dois de uma vez. Malhas podem dividir materiais e geometrias à vontade, porque cada malha guarda só uma referência a eles.",
        },
        {
          code: "caminhoTerra.rotation.x = Math.PI / 2;",
          text: "Como o anel, o toro nasce em pé, no plano de x e y. Os 90° em x deitam o caminho no plano das órbitas.",
        },
        {
          code: "cena.add(caminhoTerra);",
          text: "O caminho fica direto na cena, fora do grupo da órbita: a Terra anda, o caminho não.",
        },
      ],
      why: [
        {
          title: "Por que uma rosca, e não uma linha?",
          text: "O Three.js tem linhas (`THREE.Line`), mas o WebGL desenha linhas com 1 pixel de largura em quase todos os computadores: o `linewidth` do material é ignorado. Uma rosca fina é um objeto 3D de verdade, com espessura e perspectiva: mais grossa perto da câmera, mais fina longe. Para linhas grossas na tela, os complementos do Three.js têm a `Line2`.",
        },
        {
          title: "Por que a transparência tem ordem?",
          text: "A placa de vídeo mistura a cor nova com a que já está no pixel. Se um caminho fosse desenhado antes do planeta que está atrás dele, ele se misturaria com o fundo, e o planeta, desenhado depois, não apareceria através dele. Por isso o Three.js desenha primeiro os opacos e depois os transparentes, do mais longe para o mais perto.",
        },
        {
          title: "Por que o caminho fica na cena, e não no grupo?",
          text: "Dentro de `orbitaTerra`, o caminho giraria junto com o grupo, e num círculo girando em volta do próprio centro ninguém nota a diferença. Mas o caminho não se move, e na cena ele fica parado de verdade. O lugar de um objeto na árvore é uma decisão: ele diz quem vai junto com quem.",
        },
      ],
      try: [
        "Mude `opacity` para 1 e depois para 0.1.",
        "Troque a cor do material: os dois caminhos mudam juntos.",
        "Faça o caminho da Lua: uma rosca de raio 0,8 e tubo 0,01, deitada como as outras e adicionada com `terra.add(...)`, para ir junto com a Terra.",
      ],
      needs: ["sol", "terra", "saturno", "caminhoTerra", "caminhoSaturno"],
      checks: [
        {
          text: "O caminho da Terra é um círculo deitado em volta do Sol, por onde a Terra passa",
          test: ({ objects }) => pathCheck(objects.caminhoTerra, objects.terra, objects.sol),
        },
        {
          text: "O caminho de Saturno é um círculo deitado em volta do Sol, por onde Saturno passa",
          test: ({ objects }) => pathCheck(objects.caminhoSaturno, objects.saturno, objects.sol),
        },
        {
          text: "Os caminhos são transparentes (transparent: true e opacity menor que 1)",
          test: ({ objects }) => {
            const opaque = ["caminhoTerra", "caminhoSaturno"].filter((name) => {
              const m = objects[name].material;
              return !(m?.transparent && m.opacity < 1);
            });
            if (!opaque.length) return check(true);
            const m = objects[opaque[0]].material;
            return check(false, `${opaque.join(" e ")} ${m?.transparent ? `com opacity ${fmt(m.opacity)}` : "sem transparent: true"}`);
          },
        },
      ],
    },
  ]
    .map((step, i) => ({ ...step, code: codeAt(i + 1) }))
    .concat(COMPUTER.map((step) => ({ ...step, code: END }))),
};
