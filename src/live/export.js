// export.js — a cena fora do VisuGraph: uma página HTML que roda sozinha, ou um projeto Vite
// para rodar com Node.js no computador.
//
// Só monta textos, sem importar nada: os passos "no seu computador" dos projetos mostram estes
// mesmos arquivos, linha por linha (src/live/projects/galaxia.js).

export const THREE_VERSION = "0.186.1";
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;

/** As versões que o package.json de um projeto exportado pede: o three.js e o Vite são os deste site. */
export const VERSIONS = { three: `^${THREE_VERSION}`, vite: "^8.3.4", "lil-gui": "^0.21.0" };

const DEFAULT_TITLE = "Cena feita no VisuGraph 3D";

/**
 * Página HTML com o código do aluno, o Three.js de um CDN e o mesmo laço de desenho
 * do visor (sombras ligadas, animar(tempo, delta) a cada quadro).
 * Retorna { html } ou { error } se o código não tem uma cena com nome.
 */
export function exportHtml(analysis, title = DEFAULT_TITLE) {
  const options = sceneOptions(analysis);
  if (options.error) return options;
  const scene = options.scene;
  const camera = options.camera;
  // "</script" dentro do código fecharia a tag antes da hora, e "<!--" mudaria o jeito
  // como o navegador procura o fim dela; a barra invertida não muda o texto de uma string.
  const code = analysis.code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--").replace(/\s+$/, "");
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #15171c; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
<script type="importmap">
{ "imports": { "three": "${THREE_URL}" } }
</script>
</head>
<body>
<canvas id="visor"></canvas>
<script type="module">
import * as THREE from "three";

// ----- código da cena -----
const visugraph = (() => {
${code}
  return { cena: ${scene}, camera: ${camera || "null"}, animar: typeof animar === "function" ? animar : null };
})();
// --------------------------

const canvas = document.getElementById("visor");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x15171c);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

let camera = visugraph.camera;
if (!camera) {
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);
}

function resize() {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener("resize", resize);
resize();

const timer = new THREE.Timer();
let tempo = 0;
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const delta = Math.min(timer.getDelta(), 0.1);
  tempo += delta;
  if (visugraph.animar) visugraph.animar(tempo, delta);
  renderer.render(visugraph.cena, camera);
});
</script>
</body>
</html>
`;
  return { html };
}

// ---------------------------------------------------------------------------
// Projeto Vite: package.json, index.html, src/cena.js (o código do aluno), src/main.js (o que o
// visor do VisuGraph faz: renderer, tamanho, controles do mouse e laço), README.md e .gitignore

/**
 * O que o main.js de um projeto precisa saber do código: os nomes da cena e da câmera, se há
 * animar(), se a câmera tem perspectiva, se a cena tem fundo e sombras, e o ponto para onde a
 * câmera olha (null se é a origem, o centro dos controles do mouse). { error } sem cena com nome.
 */
export function sceneOptions(analysis) {
  if (!analysis.ok) return { error: "Corrija o erro no código antes de exportar." };
  if (!analysis.scene?.name) return { error: "Guarde a cena numa variável (const cena = new THREE.Scene();) para exportar." };
  const code = analysis.code;
  const camera = analysis.camera?.name ?? null;
  return {
    scene: analysis.scene.name,
    camera,
    perspective: !camera || analysis.objects[analysis.camera.id]?.className === "PerspectiveCamera",
    animar: !!analysis.animar,
    background: /\.background\s*=/.test(code),
    shadows: /\bcastShadow\b/.test(code),
    target: camera ? lookAtOf(code, camera) : ["0", "0.5", "0"],
  };
}

/** Os números do último camera.lookAt(x, y, z) do código, como estão escritos; null se não há, ou se é a origem. */
function lookAtOf(code, camera) {
  const number = "\\s*(-?\\d+(?:\\.\\d+)?)\\s*";
  const pattern = new RegExp(`(?<![\\w$.])${camera.replace(/\$/g, "\\$")}\\.lookAt\\(${number},${number},${number}\\)`, "g");
  const point = [...code.matchAll(pattern)].at(-1)?.slice(1, 4);
  return point?.some((n) => Number(n) !== 0) ? point : null;
}

/** "a, b e c" */
const joinAnd = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : items[0]);

/** src/cena.js: o código da cena, com o import do three.js no começo e o export do que o main.js usa no fim. */
export function cenaJs(code, { scene, camera, animar }) {
  const names = [[scene, "cena"], camera && [camera, "camera"], animar && ["animar", "animar"]].filter(Boolean);
  const list = names.map(([name, as]) => (name === as ? name : `${name} as ${as}`)).join(", ");
  const what = joinAnd(["a cena", camera && "a câmera", animar && "a função animar()"].filter(Boolean));
  return `import * as THREE from "three";\n\n${code.replace(/\s+$/, "")}\n\n// O main.js importa daqui ${what}\nexport { ${list} };\n`;
}

/** src/main.js: liga a cena à página, como o visor do VisuGraph faz. */
export function mainJs({ camera, perspective, animar, background, shadows, target }) {
  const lines = [
    'import * as THREE from "three";',
    'import { OrbitControls } from "three/addons/controls/OrbitControls.js";',
    `import { ${["cena", camera && "camera", animar && "animar"].filter(Boolean).join(", ")} } from "./cena.js";`,
    "",
  ];
  if (!camera) {
    lines.push(
      "// O código não cria uma câmera: esta é a do exemplo do VisuGraph",
      "const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);",
      "camera.position.set(4, 3, 6);",
      "camera.lookAt(0, 0.5, 0);",
      "",
    );
  }
  lines.push(
    "// O renderer desenha a cena no <canvas> da página",
    'const canvas = document.querySelector("#visor");',
    "const renderizador = new THREE.WebGLRenderer({ canvas, antialias: true });",
    "renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));",
  );
  if (!background) lines.push('renderizador.setClearColor("#15171c"); // o fundo, já que a cena não tem cor de fundo');
  if (shadows) lines.push("renderizador.shadowMap.enabled = true; // as sombras de castShadow e receiveShadow");
  lines.push(
    "",
    perspective ? "// O desenho acompanha o tamanho da janela, e a câmera, a proporção dela" : "// O desenho acompanha o tamanho da janela",
    "function redimensionar() {",
    "  const largura = canvas.clientWidth;",
    "  const altura = canvas.clientHeight;",
    "  renderizador.setSize(largura, altura, false);",
  );
  if (perspective) lines.push("  camera.aspect = largura / altura;", "  camera.updateProjectionMatrix();");
  lines.push(
    "}",
    'window.addEventListener("resize", redimensionar);',
    "redimensionar();",
    "",
    "// Arrastar gira a câmera em volta do centro, a roda aproxima e o botão direito arrasta a vista",
    "const controles = new OrbitControls(camera, canvas);",
    "controles.enableDamping = true;",
  );
  if (target) lines.push(`controles.target.set(${target.join(", ")}); // o centro: o ponto para onde a câmera olha`);
  lines.push("");
  if (animar) {
    lines.push(
      "// A cada quadro: o tempo anda, a cena se mexe e é desenhada de novo",
      "const relogio = new THREE.Timer();",
      "let tempo = 0;",
      "",
      "renderizador.setAnimationLoop((agora) => {",
      "  relogio.update(agora);",
      "  const delta = Math.min(relogio.getDelta(), 0.1);",
      "  tempo += delta;",
      "  animar(tempo, delta);",
    );
  } else {
    lines.push("// A cada quadro, a cena é desenhada de novo", "renderizador.setAnimationLoop(() => {");
  }
  lines.push("  controles.update();", "  renderizador.render(cena, camera);", "});");
  return lines.join("\n") + "\n";
}

/** package.json: o nome, os comandos e as bibliotecas (o three.js e as de `extra`), na ordem em que o npm guarda. */
export function packageJson(name, extra = []) {
  const pkg = {
    name,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: Object.fromEntries(["three", ...extra].sort().map((lib) => [lib, VERSIONS[lib]])),
    devDependencies: { vite: VERSIONS.vite },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

/** vite.config.js: caminhos relativos no build, e sem o aviso de arquivo grande que o three.js sozinho já dá. */
export function viteConfig() {
  return `import { defineConfig } from "vite";

export default defineConfig({
  // Caminhos relativos: a pasta dist funciona em qualquer endereço, até numa subpasta
  base: "./",
  build: {
    // O three.js sozinho passa dos 500 kB do aviso do Vite
    chunkSizeWarningLimit: 1000,
  },
});
`;
}

/** index.html: a página, com o canvas onde a cena aparece e o main.js. */
export function indexHtml(title = DEFAULT_TITLE) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #15171c; }
      canvas { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <canvas id="visor"></canvas>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`;
}

const LIBRARY = { three: "o three.js", "lil-gui": "o lil-gui" };

/** README.md: como rodar, o que é cada arquivo e como publicar. `site`: o endereço do VisuGraph, para o capítulo Seu computador. */
export function readme({ title = DEFAULT_TITLE, extra = [], site = null } = {}) {
  const libraries = joinAnd([...["three", ...extra].sort().map((lib) => LIBRARY[lib] ?? lib), "o Vite"]);
  const made = site ? `Feito no [VisuGraph 3D](${site}index.html)` : "Feito no VisuGraph 3D";
  const help = site ? `\nPrimeira vez com Node.js e terminal? O capítulo [Seu computador](${site}computador.html) mostra como instalar e o que fazer quando algo dá errado.\n` : "";
  return `# ${title}

${made}: um projeto [Vite](https://vite.dev) com [three.js](https://threejs.org).

## Como rodar

Você precisa do [Node.js](https://nodejs.org), versão 22.12 ou mais nova. Num terminal, dentro desta pasta:

\`\`\`
npm install
npm run dev
\`\`\`

O \`npm install\` baixa ${libraries} para a pasta \`node_modules\`. O \`npm run dev\` liga o servidor do Vite e mostra o endereço da página, http://localhost:5173: abra no navegador. Cada arquivo salvo atualiza a página sozinho; para desligar o servidor, aperte Ctrl+C no terminal.
${help}
## Os arquivos

- \`index.html\`: a página, com o \`<canvas>\` onde a cena aparece.
- \`src/cena.js\`: a cena, com o código escrito no VisuGraph.
- \`src/main.js\`: liga a cena à página: o renderer, o tamanho da janela, os controles do mouse e o laço que desenha cada quadro.
- \`package.json\`: o nome do projeto, os comandos (\`dev\`, \`build\` e \`preview\`) e as bibliotecas, com as versões.
- \`vite.config.js\`: a configuração do Vite para o \`npm run build\`.

## Publicar

\`\`\`
npm run build
\`\`\`

O \`npm run build\` gera a pasta \`dist\`, com a página pronta para qualquer hospedagem de sites estáticos (GitHub Pages, Netlify). O \`npm run preview\` mostra essa versão antes de publicar.
`;
}

/**
 * Os arquivos de um projeto Vite com a cena: { files } ([{ path, content }]) ou { error }.
 * `cena` troca o src/cena.js gerado do código por outro texto (o projeto pronto de um passo), e
 * `extra` são as bibliotecas além do three.js que ele usa.
 */
export function exportProject(analysis, { name = "cena-visugraph", title = DEFAULT_TITLE, site = null, cena = null, extra = [] } = {}) {
  const options = sceneOptions(analysis);
  if (options.error) return options;
  const files = [
    { path: "README.md", content: readme({ title, extra, site }) },
    { path: "package.json", content: packageJson(name, extra) },
    { path: "vite.config.js", content: viteConfig() },
    { path: "index.html", content: indexHtml(title) },
    { path: "src/main.js", content: mainJs(options) },
    { path: "src/cena.js", content: cena ?? cenaJs(analysis.code, options) },
    { path: ".gitignore", content: "node_modules\ndist\n" },
  ];
  return { files };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
