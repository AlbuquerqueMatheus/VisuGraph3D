// computador.js — o passo "No seu computador", com que os projetos terminam: o projeto Vite que o
// Baixar monta (src/live/export.js), os comandos para rodar e cada arquivo explicado linha por
// linha. O que vale para todo projeto fica aqui; cada projeto dá o objetivo, os porquês dele, as
// sugestões, o que conferir e os trechos de texto com os nomes das coisas dele (`words`).

import { VERSIONS, cenaJs, indexHtml, mainJs, packageJson, viteConfig } from "../export.js";

/**
 * O passo inteiro. `id` é o do projeto (o nome do .zip, da pasta e do package.json), `end` é o
 * código do último passo no VisuGraph e `options`, o que o main.js precisa saber dele
 * (sceneOptions, em src/live/export.js). `words`: `yours` (o que o projeto leva, "a sua galáxia"),
 * `browser` (por que o three.js vai para o navegador), `privates` (o que o cena.js não exporta),
 * `stretched` (o que sai deformado sem o aspect), `jump` (o que saltaria sem o teto do delta) e
 * `animarStep` (o passo que escreveu o animar).
 */
export function computerStep({ id, title, end, options, words, goal, why, try: tries, confirm }) {
  return {
    id: "computador",
    title: "No seu computador",
    kind: "computador",
    view: "camera",
    goal,
    setup: setupOf(id, words),
    files: filesOf({ id, title, end, options, words }),
    why: [...WHY, ...why],
    try: tries,
    confirm,
  };
}

function setupOf(id, { yours }) {
  return [
    {
      text: "Instale o Node.js, versão 22.12 ou mais nova (a LTS do site nodejs.org serve). Ele roda JavaScript fora do navegador e traz o npm, que baixa as bibliotecas. Para conferir, abra um terminal e rode os dois comandos: cada um responde com um número de versão.",
      commands: ["node -v", "npm -v"],
      link: { href: "./computador.html#node", text: "Como instalar o Node.js e abrir o terminal" },
    },
    {
      text: `Baixe o projeto. Ele leva o código que está no editor, ${yours}, com os arquivos de um projeto Vite em volta.`,
      download: { file: `${id}.zip` },
    },
    {
      text: `Descompacte o arquivo: sai a pasta \`${id}\`. Abra essa pasta no VS Code (Arquivo → Abrir Pasta) e abra o terminal dele (Terminal → Novo Terminal), que já começa dentro da pasta. Num terminal fora do VS Code, entre na pasta com \`cd\`, o comando que troca a pasta onde os outros rodam:`,
      commands: [`cd Downloads/${id}`],
    },
    {
      text: "Instale as bibliotecas que o `package.json` pede, o three.js e o Vite. Elas vão para uma pasta nova, `node_modules`; na primeira vez, leva um minuto.",
      commands: ["npm install"],
    },
    {
      text: "Ligue o servidor do Vite. Ele mostra o endereço da página, http://localhost:5173: abra no navegador. O terminal fica ocupado com o servidor enquanto ele roda; para desligar, aperte Ctrl+C.",
      commands: ["npm run dev"],
    },
  ];
}

function filesOf({ id, title, end, options, words }) {
  const main = mainJs(options);
  return [
    {
      path: "package.json",
      about: "A ficha do projeto: o nome, os comandos e as bibliotecas. É o arquivo que o npm lê.",
      code: packageJson(id),
      lines: [
        {
          code: '"type": "module",',
          text: "Os arquivos `.js` do projeto são módulos: usam `import` e `export` para um arquivo usar o que outro oferece.",
        },
        {
          code: '"dev": "vite",',
          text: "`npm run dev` roda o comando `vite`, que liga o servidor. `build` e `preview` são para publicar o site, no Experimente.",
        },
        {
          code: `"three": "${VERSIONS.three}"`,
          text: "O three.js, na versão em que o projeto foi testado. O `^` aceita as correções (0.186.2, 0.186.3), mas não a 0.187: no three.js, cada versão nova pode mudar coisas, e uma atualização sem querer quebraria o código.",
        },
        {
          code: `"vite": "${VERSIONS.vite}"`,
          text: `O Vite fica em \`devDependencies\`: é uma ferramenta para desenvolver e não vai para a página publicada. O three.js fica em \`dependencies\` porque vai: ${words.browser}.`,
        },
      ],
    },
    {
      path: "vite.config.js",
      about: "A configuração do Vite. Para o servidor, nada precisa mudar; as duas opções são para o `npm run build`.",
      code: viteConfig(),
      lines: [
        {
          code: 'base: "./",',
          text: `Os caminhos dos arquivos ficam relativos à página. Sem isso, a página publicada procura os arquivos na raiz do site e fica em branco numa subpasta, como a do GitHub Pages (\`seu-nome.github.io/${id}/\`).`,
        },
        {
          code: "chunkSizeWarningLimit: 1000,",
          text: "O Vite avisa quando um arquivo passa de 500 kB, porque um site pesado demora a abrir. O three.js sozinho tem uns 550 kB (uns 140 kB, comprimido pelo servidor), e aqui isso é esperado.",
        },
      ],
    },
    {
      path: "index.html",
      about: "A página que o navegador abre. Ela só tem o canvas, onde a cena aparece, e chama o `main.js`.",
      code: indexHtml(title),
      lines: [
        {
          code: '<canvas id="visor"></canvas>',
          text: "A tela de desenho. O CSS do `<style>` faz o canvas ocupar a janela inteira, e o `id` é como o `main.js` encontra ele.",
        },
        {
          code: '<script type="module" src="/src/main.js"></script>',
          text: 'Carrega o `main.js` como módulo, o que permite `import`. O Vite entrega esse arquivo ao navegador já trocando o `"three"` dos imports pelo caminho do three.js na `node_modules`, o que o navegador sozinho não sabe fazer.',
        },
      ],
    },
    {
      path: "src/cena.js",
      about: "O código do editor, com duas linhas a mais no começo e duas no fim.",
      from: end,
      code: cenaJs(end, options),
      lines: [
        {
          code: 'import * as THREE from "three";',
          text: "No VisuGraph, `THREE` já existia. Aqui, o arquivo importa o three.js com esse nome: `* as THREE` junta tudo o que a biblioteca exporta num objeto só, e o resto do código continua igual.",
        },
        {
          code: "export { cena, camera, animar };",
          text: `Deixa o \`main.js\` usar a cena, a câmera e a função \`animar\`. O que um módulo não exporta fica só dele: ${words.privates} continuam visíveis só aqui dentro.`,
        },
      ],
    },
    {
      path: "src/main.js",
      about: "O que o visor do VisuGraph fazia por você, agora escrito.",
      code: main,
      // o main.js muda com a cena (sem animar, sem câmera em perspectiva…): ficam as linhas que ele tem
      lines: mainLines(words).filter((line) => main.includes(line.code)),
    },
  ];
}

function mainLines({ stretched, jump, animarStep }) {
  return [
    {
      code: 'import { OrbitControls } from "three/addons/controls/OrbitControls.js";',
      text: "Os OrbitControls não vêm no `THREE`: ficam nos complementos (addons) do three.js, com carregadores de modelos, efeitos e outros controles. Cada complemento é importado do seu arquivo, e só o que é importado vai para a página.",
    },
    {
      code: 'import { cena, camera, animar } from "./cena.js";',
      text: 'Pega o que o `cena.js` exporta. O `./` diz que é um arquivo do projeto, na mesma pasta; sem ele, como em `"three"`, o nome é de uma biblioteca da `node_modules`.',
    },
    {
      code: "const renderizador = new THREE.WebGLRenderer({ canvas, antialias: true });",
      text: "O renderer do passo 1, que o VisuGraph criava: transforma a cena em pixels no canvas, pelo WebGL. `antialias` suaviza as bordas serrilhadas.",
    },
    {
      code: "renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));",
      text: "Em telas de alta densidade, cada ponto da página tem 2 ou 3 pixels de verdade. O desenho acompanha até 2: fica nítido sem pintar 9 pixels por ponto numa tela de celular.",
    },
    {
      code: 'renderizador.setClearColor("#15171c");',
      text: "A cor que pinta o canvas antes da cena. O seu código não dá um `cena.background`, então fica o cinza escuro do visor do VisuGraph.",
    },
    {
      code: "renderizador.shadowMap.enabled = true;",
      text: "Liga as sombras no renderer, como o VisuGraph deixava: sem esta linha, o `castShadow` e o `receiveShadow` do seu código não fazem nada.",
    },
    {
      code: "renderizador.setSize(largura, altura, false);",
      text: "Ajusta o número de pixels do desenho ao tamanho do canvas na página. O `false` deixa o tamanho na tela por conta do CSS.",
    },
    {
      code: "camera.aspect = largura / altura;",
      text: `A proporção da câmera acompanha a da janela, senão ${stretched}. É o que o visor fazia com o \`16 / 9\` do passo 1.`,
    },
    {
      code: "camera.updateProjectionMatrix();",
      text: "A câmera guarda a matriz de projeção já calculada. Depois de mudar `aspect`, `fov`, `near` ou `far`, é preciso pedir a conta de novo.",
    },
    {
      code: 'window.addEventListener("resize", redimensionar);',
      text: "Chama `redimensionar` sempre que a janela muda de tamanho. A linha de baixo chama uma vez já no começo.",
    },
    {
      code: "const controles = new OrbitControls(camera, canvas);",
      text: "Liga os controles à câmera e ao canvas: arrastar gira a câmera em volta de um centro, a roda aproxima e o botão direito desloca a vista. Eles mudam a posição da câmera, como o seu `camera.position.set` fazia.",
    },
    {
      code: "controles.enableDamping = true;",
      text: "Dá inércia: ao soltar o mouse, a câmera ainda anda um pouco e para devagar.",
    },
    {
      code: "controles.target.set(",
      text: "O centro em volta do qual os controles giram a câmera: o ponto do seu `camera.lookAt`. Sem isso, eles girariam em volta da origem, e a câmera viraria para ela logo no primeiro quadro.",
    },
    {
      code: "const relogio = new THREE.Timer();",
      text: "Mede o tempo que passa entre um quadro e o seguinte.",
    },
    {
      code: "renderizador.setAnimationLoop((agora) => {",
      text: "Chama a função a cada quadro da tela, em geral 60 vezes por segundo, e para enquanto a aba está escondida. `agora` é o instante do quadro, em milissegundos.",
    },
    {
      code: "const delta = Math.min(relogio.getDelta(), 0.1);",
      text: `Os segundos desde o quadro anterior, com um teto de 0,1. Com a aba escondida, o laço para; na volta, sem o teto, o primeiro \`delta\` seria de minutos, e ${jump}.`,
    },
    {
      code: "animar(tempo, delta);",
      text: `A sua função do passo ${animarStep}, chamada como o VisuGraph chamava: com o tempo em segundos e o \`delta\`.`,
    },
    {
      code: "controles.update();",
      text: "Com a inércia ligada, os controles precisam andar um pouco a cada quadro, mesmo com o mouse parado.",
    },
    {
      code: "renderizador.render(cena, camera);",
      text: "Desenha a cena vista pela câmera: é esta linha que faz a imagem aparecer, a cada quadro.",
    },
  ];
}

/** Os porquês que valem para todo projeto; os de cada um vêm depois. */
const WHY = [
  {
    title: "Por que um servidor, e não abrir o index.html com dois cliques?",
    text: 'Aberta direto do disco (um endereço `file://`), a página não carrega módulos: o navegador bloqueia por segurança. E ele não saberia o que é `"three"` num `import`, porque o nome de uma biblioteca não é um endereço. O Vite serve a página por `http://localhost`, como um site de verdade, e troca esses nomes pelo arquivo certo na `node_modules`. A página do Baixar HTML resolve isso de outro jeito: um mapa de imports aponta `"three"` para um endereço na internet.',
  },
  {
    title: "Por que o Vite?",
    text: "Ele faz duas coisas. No desenvolvimento, serve os arquivos e recarrega a página a cada arquivo salvo. Para publicar, o `npm run build` junta o seu código e a parte do three.js que ele usa num arquivo só, menor, na pasta `dist`. É a ferramenta que o manual de instalação do three.js usa; outras, como o webpack e o Parcel, fazem o mesmo papel.",
  },
  {
    title: "Por que a cena num arquivo e o resto noutro?",
    text: "O `cena.js` é a cena, que muda o tempo todo; o `main.js` é a máquina em volta dela, que quase nunca muda. Separados, dá para colar ali outro código vindo do VisuGraph sem mexer no resto, e o mesmo `main.js` serve para outras cenas.",
  },
];
