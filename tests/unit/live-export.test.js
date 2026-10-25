import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/live/engine/analyze.js";
import { STARTER_CODE } from "../../src/live/engine/snippets.js";
import { THREE_VERSION, VERSIONS, exportHtml, exportProject } from "../../src/live/export.js";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const fileOf = (files, path) => files.find((f) => f.path === path)?.content;

describe("exportar a cena", () => {
  it("usa o three.js e o Vite deste site", () => {
    const pkg = json("../../package.json");
    expect(THREE_VERSION).toBe(json("../../node_modules/three/package.json").version);
    expect(pkg.dependencies.three).toBe(VERSIONS.three);
    expect(pkg.devDependencies.vite).toBe(VERSIONS.vite);
  });

  it("não exporta código com erro, nem cena sem nome", () => {
    expect(exportProject(analyze("const x = ;")).error).toMatch(/^Corrija o erro/);
    expect(exportProject(analyze("new THREE.Scene();")).error).toMatch(/^Guarde a cena numa variável/);
    expect(exportHtml(analyze("new THREE.Scene();")).error).toMatch(/^Guarde a cena numa variável/);
  });

  it("o projeto tem os arquivos de um projeto Vite, e o package.json pede o three.js e o Vite", () => {
    const { files } = exportProject(analyze(STARTER_CODE), { site: "https://exemplo.org/visugraph/" });
    expect(files.map((f) => f.path)).toEqual(["README.md", "package.json", "vite.config.js", "index.html", "src/main.js", "src/cena.js", ".gitignore"]);
    expect(JSON.parse(fileOf(files, "package.json"))).toEqual({
      name: "cena-visugraph",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { three: VERSIONS.three },
      devDependencies: { vite: VERSIONS.vite },
    });
    expect(fileOf(files, "index.html")).toContain('<canvas id="visor"></canvas>\n    <script type="module" src="/src/main.js"></script>');
    expect(fileOf(files, "vite.config.js")).toContain('base: "./",');
    expect(fileOf(files, "README.md")).toContain("[Seu computador](https://exemplo.org/visugraph/computador.html)");
    expect(fileOf(files, ".gitignore")).toBe("node_modules\ndist\n");
  });

  it("o cena.js é o código com o import do three.js e o export, e o main.js segue o código", () => {
    const { files } = exportProject(analyze(STARTER_CODE));
    const cena = fileOf(files, "src/cena.js");
    expect(cena.startsWith('import * as THREE from "three";\n\n// Tudo o que aparece no visor')).toBe(true);
    expect(cena.endsWith("// O main.js importa daqui a cena, a câmera e a função animar()\nexport { cena, camera, animar };\n")).toBe(true);
    const main = fileOf(files, "src/main.js");
    expect(main).toContain('import { cena, camera, animar } from "./cena.js";');
    expect(main, "o exemplo tem castShadow").toContain("renderizador.shadowMap.enabled = true;");
    expect(main, "o camera.lookAt do exemplo").toContain("controles.target.set(0, 0.5, 0);");
    expect(main, "a cena tem fundo").not.toContain("setClearColor");
    expect(main).toContain("  animar(tempo, delta);\n  controles.update();\n  renderizador.render(cena, camera);");
  });

  it("dá os nomes certos no export, cria uma câmera quando o código não tem e só anima com animar()", () => {
    const code = [
      "const mundo = new THREE.Scene();",
      "const olho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 10);",
      "olho.position.set(0, 0, 5);",
      "const caixa = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());",
      "mundo.add(caixa);",
      "",
    ].join("\n");
    const { files } = exportProject(analyze(code));
    expect(fileOf(files, "src/cena.js").endsWith("// O main.js importa daqui a cena e a câmera\nexport { mundo as cena, olho as camera };\n")).toBe(true);
    const main = fileOf(files, "src/main.js");
    expect(main).toContain('import { cena, camera } from "./cena.js";');
    expect(main, "ortográfica: a proporção é a do código").not.toContain("camera.aspect");
    expect(main, "sem fundo na cena").toContain('renderizador.setClearColor("#15171c");');
    expect(main).not.toContain("animar");
    expect(main, "sem lookAt, o centro é a origem").not.toContain("controles.target");

    const alone = fileOf(exportProject(analyze("const cena = new THREE.Scene();\n")).files, "src/main.js");
    expect(alone).toContain('import { cena } from "./cena.js";');
    expect(alone).toContain("const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);");
    expect(alone).toContain("controles.target.set(0, 0.5, 0);");
  });

  it("sem os controles do mouse quando o código move a câmera: presa a outro objeto ou mudada em animar()", () => {
    const base = [
      "const cena = new THREE.Scene();",
      "const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);",
      "camera.position.set(0, 2, 5);",
      "camera.lookAt(0, 1, 0);",
      "const carrinho = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());",
      "cena.add(carrinho);",
      "",
    ].join("\n");
    const main = (extra) => fileOf(exportProject(analyze(base + extra)).files, "src/main.js");
    const riding = main("carrinho.add(camera);\nfunction animar(tempo) {\n  carrinho.position.x = Math.sin(tempo);\n}\n");
    expect(riding).not.toContain("OrbitControls");
    expect(riding).not.toMatch(/controles\.|const controles/);
    expect(riding).toContain("redimensionar();\n\n// O código move a câmera: sem controles do mouse, que a tirariam do lugar a cada quadro\n\n");
    expect(riding).toContain("  animar(tempo, delta);\n  renderizador.render(cena, camera);\n});");
    expect(main("function animar(tempo) {\n  camera.position.x = Math.sin(tempo);\n}\n")).not.toContain("OrbitControls");
    // na cena, a câmera fica parada: os controles continuam
    const still = main("cena.add(camera);\n");
    expect(still).toContain('import { OrbitControls } from "three/addons/controls/OrbitControls.js";');
    expect(still).toContain("controles.target.set(0, 1, 0);");
  });

  it("o relógio lê a hora do navegador a cada quadro, e o primeiro delta não sai negativo", () => {
    // o instante que o setAnimationLoop passa é o do começo do quadro: no primeiro, ele pode ser de
    // antes de o relógio existir, e um delta negativo poria o carrinho da montanha-russa antes do
    // começo da curva, onde getPointAt não tem ponto
    const main = fileOf(exportProject(analyze(STARTER_CODE)).files, "src/main.js");
    expect(main).toContain("renderizador.setAnimationLoop(() => {\n  relogio.update();\n  const delta = Math.min(relogio.getDelta(), 0.1);");
    expect(exportHtml(analyze(STARTER_CODE)).html).toContain("renderer.setAnimationLoop(() => {\n  timer.update();\n");
  });

  it("o centro dos controles é o último lookAt da câmera, só com números", () => {
    const main = (lookAt) => fileOf(exportProject(analyze(`const cena = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);\n${lookAt}\n`)).files, "src/main.js");
    expect(main("camera.lookAt(1, 2, 3);\ncamera.lookAt(0, -1.5, 2);")).toContain("controles.target.set(0, -1.5, 2);");
    expect(main("camera.lookAt(0, 0, 0);")).not.toContain("controles.target");
    expect(main("camera.lookAt(cena.position);")).not.toContain("controles.target");
  });
});
