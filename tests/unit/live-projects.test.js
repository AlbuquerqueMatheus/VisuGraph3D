import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { grade } from "../../src/live/challenges.js";
import { sceneFacts } from "../../src/live/runtime/facts.js";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";
import { LEVELS, PROJECTS, behind, codeState, diffLines, findSnippet, guideStep, hunks, isComputer, liveSteps, projectById, startCode, stepIndex } from "../../src/live/projects/index.js";
import { animatedKeys, armsOf } from "../../src/live/projects/checks.js";
import { exportProject } from "../../src/live/export.js";

// Roda o código com o Three.js de verdade e monta os fatos como o app monta para um projeto:
// os objetos pelo nome da variável, o fundo, e o que animar() muda, pela análise do código.
// Sem cena no código, o visor usa uma vazia (e avisa na barra de status).
function factsOf(code) {
  const names = [...code.matchAll(/^(?:const|let|var)\s+(\w+)\s*=/gm)].map((m) => m[1]);
  const scope = new Function("THREE", `${code}\nreturn { ${names.join(", ")} };`)(THREE);
  const idOf = (obj) => names.find((n) => scope[n] === obj);
  const entries = names.map((n) => [n, scope[n]]);
  const facts = sceneFacts({ scene: scope.cena ?? new THREE.Scene(), camera: scope.camera, entries, idOf });
  const analysis = analyze(code);
  return { ...facts, nameOf: (id) => id, animated: animatedKeys(analysis), hasAnimar: !!analysis.animar };
}

const galaxia = projectById("galaxia");
const solar = projectById("sistema-solar");
const computer = galaxia.steps.filter(isComputer);
const failing = (result) => result.results.filter((r) => !r.ok).map((r) => `${r.text} (${r.seen})`);
const fileOf = (files, path) => files.find((f) => f.path === path);
/** Para describe.each: [título, projeto]. */
const EACH = PROJECTS.map((p) => [p.title, p]);

/** Confere o código de um passo com trocas [de, para], pelas conferências do próprio passo. */
function variantOf(project) {
  return (id, ...swaps) => {
    const step = project.steps[stepIndex(project, id)];
    let code = step.code;
    for (const [from, to] of swaps) {
      expect(code, `${id}: ${from}`).toContain(from);
      code = code.replace(from, to);
    }
    return grade(step, factsOf(code));
  };
}

describe("guia de projetos: o catálogo", () => {
  it("tem os três níveis, e cada projeto está num deles", () => {
    expect(LEVELS.map((l) => l.id)).toEqual(["facil", "intermediario", "avancado"]);
    for (const p of PROJECTS) expect(LEVELS.map((l) => l.id)).toContain(p.level);
    expect(LEVELS.flatMap((l) => l.soon)).toHaveLength(7);
    const soon = LEVELS.flatMap((l) => l.soon.map((s) => s.title));
    for (const p of PROJECTS) expect(soon, `${p.title} já existe`).not.toContain(p.title);
  });

  it("o Sistema solar vem primeiro, com 8 passos no VisuGraph e 1 no computador; o Gerador de galáxias tem 10 e 2", () => {
    expect(PROJECTS.map((p) => [p.id, liveSteps(p).length, p.steps.filter(isComputer).length])).toEqual([
      ["sistema-solar", 8, 1],
      ["galaxia", 10, 2],
    ]);
  });

  it("acha o passo pelo número ou pelo id", () => {
    expect(stepIndex(galaxia, "1")).toBe(0);
    expect(stepIndex(galaxia, 10)).toBe(9);
    expect(stepIndex(galaxia, "espiral")).toBe(5);
    expect(stepIndex(galaxia, "painel")).toBe(11);
    expect(stepIndex(galaxia, "13")).toBe(-1);
    expect(stepIndex(galaxia, "nada")).toBe(-1);
    expect(stepIndex(solar, "lua")).toBe(5);
    expect(stepIndex(solar, "computador")).toBe(8);
  });
});

describe.each(EACH)("%s", (_, project) => {
  const live = liveSteps(project);

  it("cada passo no VisuGraph tem objetivo, linhas, porquês, sugestões e conferências, e os do computador vêm no fim", () => {
    expect(new Set(project.steps.map((s) => s.id)).size).toBe(project.steps.length);
    expect(project.steps.slice(live.length).every(isComputer)).toBe(true);
    for (const s of live) {
      expect(s.goal.length, s.id).toBeGreaterThan(80);
      expect(s.lines.length, s.id).toBeGreaterThan(0);
      expect(s.why.length, s.id).toBeGreaterThan(0);
      expect(s.try.length, s.id).toBeGreaterThan(0);
      expect(s.checks.length, s.id).toBeGreaterThan(0);
      expect(["editor", "camera"], s.id).toContain(s.view);
    }
  });

  it("o código de cada passo roda sem erro e é o do passo anterior com mudanças", () => {
    live.forEach((s, i) => {
      const a = analyze(s.code);
      expect(hasBlockingError(a), s.id).toBe(false);
      expect(a.diagnostics.filter((d) => d.severity === "error"), s.id).toEqual([]);
      expect(diffLines(startCode(project, i), s.code).some((d) => d.op !== "same"), s.id).toBe(true);
    });
  });

  it("cada trecho explicado está no código do passo, uma vez só (ou depois do marcador)", () => {
    for (const s of live) {
      for (const line of s.lines) {
        const at = findSnippet(s.code, line);
        expect(at, `${s.id}: ${line.code}`).not.toBeNull();
        if (!line.after) expect(s.code.indexOf(line.code, at.to), `${s.id}: ${line.code} repete`).toBe(-1);
      }
    }
  });

  it("o código de cada passo passa nas conferências do passo", () => {
    for (const s of live) expect(failing(grade(s, factsOf(s.code))), s.id).toEqual([]);
  });

  it("o código do começo de cada passo ainda não passa: o passo tem o que fazer", () => {
    live.forEach((s, i) => {
      expect(grade(s, factsOf(startCode(project, i))).ok, s.id).toBe(false);
    });
  });
});

describe("conferências da galáxia", () => {
  const stepOf = (id) => galaxia.steps[stepIndex(galaxia, id)];
  const variant = variantOf(galaxia);

  it("um disco quadrado não passa por redondo", () => {
    const result = variant(
      "disco",
      ["  posicoes[i3] = Math.cos(angulo) * r;", "  posicoes[i3] = (Math.random() - 0.5) * 10;"],
      ["  posicoes[i3 + 2] = Math.sin(angulo) * r;", "  posicoes[i3 + 2] = (Math.random() - 0.5) * 10;"],
    );
    expect(failing(result)).toHaveLength(1);
    expect(failing(result)[0]).toMatch(/^O contorno é redondo, não quadrado \(o ponto mais longe está a [67],\d\d do centro, mas x e z só vão até [45],\d\d: são os cantos de um quadrado\)$/);
  });

  it("acha o número de braços e a curvatura, para os dois lados", () => {
    const arms = (bracos, curvatura) => {
      const code = stepOf("espiral").code.replace("const bracos = 3;", `const bracos = ${bracos};`).replace("const curvatura = 1;", `const curvatura = ${curvatura};`);
      return armsOf(factsOf(code).objects.galaxia.geometry.sample);
    };
    expect(arms(3, 1)).toMatchObject({ arms: 3, strength: expect.closeTo(1, 2) });
    expect(arms(5, -2).arms).toBe(5);
    expect(arms(5, -2).k).toBeCloseTo(-2, 1);
    expect(arms(1, 0).arms).toBe(1);
  });

  it("dispersão demais desfaz os braços, e a conferência avisa", () => {
    const result = variant("dispersao", ["const dispersao = 0.3;", "const dispersao = 1;"]);
    expect(failing(result)).toEqual(["Os braços ainda aparecem (a dispersão desfez os braços)"]);
  });

  it("sem vertexColors, a galáxia não tem cor por ponto", () => {
    expect(failing(variant("cores", ["  vertexColors: true,\n", ""]))).toEqual(["O material usa a cor de cada vértice (vertexColors: true) (vertexColors está desligado)"]);
  });

  it("ângulos sorteados por igual juntam estrelas nos polos", () => {
    const result = variant("ceu", [
      "  direcao.set(gaussiana(), gaussiana(), gaussiana()).normalize().multiplyScalar(40);",
      "  direcao.setFromSphericalCoords(40, Math.random() * Math.PI, Math.random() * Math.PI * 2);",
    ]);
    expect(failing(result)).toHaveLength(1);
    expect(failing(result)[0]).toMatch(/^Elas se espalham por igual, sem se juntar nos polos \(\d+% das estrelas estão perto dos polos; por igual seriam 10%\)$/);
  });

  it("girar a galáxia em x não conta como girar em y", () => {
    expect(failing(variant("movimento", ["galaxia.rotation.y = tempo * 0.1;", "galaxia.rotation.x = tempo * 0.1;"]))).toEqual([
      "A galáxia gira em torno do eixo y em animar() (animar() não muda galaxia.rotation.y)",
    ]);
  });
});

describe("conferências do sistema solar", () => {
  const variant = variantOf(solar);

  it("um cubo não passa por esfera, mesmo com os cantos à mesma distância do centro", () => {
    expect(failing(variant("sol", ["new THREE.SphereGeometry(1.5, 48, 24)", "new THREE.BoxGeometry(2, 2, 2)"]))).toEqual(["O Sol é uma esfera no centro da cena (sol não é redondo)"]);
    expect(failing(variant("sol", ["new THREE.SphereGeometry(1.5, 48, 24)", "new THREE.SphereGeometry(1.5, 8, 4)"])), "uma esfera grosseira ainda é esfera").toEqual([]);
  });

  it("a Terra pede um material que reaja à luz", () => {
    const result = variant("terra", ['new THREE.MeshStandardMaterial({ color: "#3d7bff" })', 'new THREE.MeshBasicMaterial({ color: "#3d7bff" })']);
    expect(failing(result)).toEqual(["O material dela reage à luz (a Terra usa MeshBasicMaterial, que não reage à luz)"]);
  });

  it("a luz de código antigo, com intensidade 1, quase não chega à Terra; com 30 ou com a Terra a 9, chega", () => {
    expect(failing(variant("luz", ['new THREE.PointLight("#ffffff", 80)', 'new THREE.PointLight("#ffffff", 1)']))).toEqual([
      "Chega luz bastante na Terra (chega 0,05 de luz na Terra, quase nada: a luz enfraquece com o quadrado da distância)",
    ]);
    expect(failing(variant("luz", ['new THREE.PointLight("#ffffff", 80)', 'new THREE.PointLight("#ffffff", 30)']))).toEqual([]);
    expect(failing(variant("luz", ["terra.position.set(4.5, 0, 0);", "terra.position.set(9, 0, 0);"]))).toEqual([]);
    expect(failing(variant("luz", ['new THREE.PointLight("#ffffff", 80)', 'new THREE.PointLight("#ffffff", 80, 4)'])), "o distance corta a luz antes da Terra").toEqual([
      "Chega luz bastante na Terra (chega 0,00 de luz na Terra, quase nada: a luz enfraquece com o quadrado da distância)",
    ]);
  });

  it("a luz pontual tem de estar no Sol e na cena, e a ambiente, fraca", () => {
    expect(failing(variant("luz", ["cena.add(luzDoSol);", "luzDoSol.position.set(3, 0, 0);\ncena.add(luzDoSol);"]))).toEqual([
      "Uma luz pontual sai do centro do Sol (a luz pontual está a 3,00 do centro do Sol, fora dele)",
    ]);
    expect(failing(variant("luz", ["cena.add(luzDoSol);", ""]))[0]).toBe("Uma luz pontual sai do centro do Sol (a luz pontual não foi adicionada à cena)");
    expect(failing(variant("luz", ['new THREE.AmbientLight("#ffffff", 0.2)', 'new THREE.AmbientLight("#ffffff", 3)']))).toEqual([
      "Uma luz ambiente fraca clareia o lado da noite (a intensidade é 3,00, forte demais: a noite fica quase tão clara quanto o dia)",
    ]);
  });

  it("a Terra fora do grupo não está em órbita, e girar o grupo em z não conta", () => {
    expect(failing(variant("orbita", ["orbitaTerra.add(terra);", "cena.add(terra);"]))).toEqual(["A Terra está dentro do grupo orbitaTerra (está direto na cena)"]);
    expect(failing(variant("orbita", ["orbitaTerra.rotation.y = tempo * 0.5;", "orbitaTerra.rotation.z = tempo * 0.5;"]))).toEqual([
      "animar() gira o grupo em volta do eixo y (animar() não muda orbitaTerra.rotation.y)",
    ]);
  });

  it("a órbita da Lua na cena não vai com a Terra; dentro de orbitaTerra, na posição da Terra, vai", () => {
    expect(failing(variant("lua", ["terra.add(orbitaLua);", "cena.add(orbitaLua);"]))[0]).toBe(
      "A órbita da Lua fica no centro da Terra e vai com ela (orbitaLua está direto na cena e não vai com a Terra)",
    );
    expect(failing(variant("lua", ["terra.add(orbitaLua);", "orbitaLua.position.set(4.5, 0, 0);\norbitaTerra.add(orbitaLua);"]))).toEqual([]);
    expect(failing(variant("lua", ["lua.position.set(0.8, 0, 0);", "lua.position.set(0.5, 0, 0);"]))).toEqual([
      "A Lua é menor que a Terra e fica perto dela, sem encostar (a Lua está a 0,50 do centro da Terra: encosta nela)",
    ]);
  });

  it("o anel em pé, sem DoubleSide ou fora de Saturno, e Saturno deitado, a conferência avisa", () => {
    expect(failing(variant("saturno", ["anel.rotation.x = -Math.PI / 2;\n", ""]))).toEqual([
      "O anel é filho de Saturno e fica em volta do equador dele (o anel sai 1,50 do plano do equador: falta deitar o anel)",
    ]);
    expect(failing(variant("saturno", ["side: THREE.DoubleSide ", ""]))).toEqual(["O anel aparece dos dois lados (side: THREE.DoubleSide) (o anel pinta só a frente)"]);
    expect(failing(variant("saturno", ["saturno.add(anel);", "anel.position.set(7.5, 0, 0);\norbitaSaturno.add(anel);"]))).toEqual([
      "O anel é filho de Saturno e fica em volta do equador dele (o pai é orbitaSaturno)",
    ]);
    expect(failing(variant("saturno", ["THREE.MathUtils.degToRad(27)", "THREE.MathUtils.degToRad(98)"]))).toEqual([
      "O eixo de Saturno é inclinado, entre 10° e 45° (o eixo está inclinado 98°)",
    ]);
    expect(failing(variant("saturno", ["THREE.MathUtils.degToRad(27)", "THREE.MathUtils.degToRad(-27)"])), "inclinado para o outro lado vale").toEqual([]);
  });

  it("o eixo fixo do Experimente continua inclinado", () => {
    expect(failing(variant("saturno", ["  orbitaSaturno.rotation.y = tempo * 0.2;", "  orbitaSaturno.rotation.y = tempo * 0.2;\n  saturno.rotation.y = -tempo * 0.2;"]))).toEqual([]);
  });

  it("o caminho em pé ou com outro raio não passa, e um anel fino no lugar do toro vale", () => {
    expect(failing(variant("caminhos", ["caminhoTerra.rotation.x = Math.PI / 2;\n", ""]))).toEqual([
      "O caminho da Terra é um círculo deitado em volta do Sol, por onde a Terra passa (ele sai 4,52 do plano das órbitas: está em pé ou inclinado)",
    ]);
    expect(failing(variant("caminhos", ["new THREE.TorusGeometry(4.5, 0.02, 8, 160)", "new THREE.TorusGeometry(5, 0.02, 8, 160)"]))).toEqual([
      "O caminho da Terra é um círculo deitado em volta do Sol, por onde a Terra passa (o raio dele é 5,00, e o planeta está a 4,50 do Sol)",
    ]);
    expect(failing(variant("caminhos", ["new THREE.TorusGeometry(4.5, 0.02, 8, 160)", "new THREE.RingGeometry(4.45, 4.55, 128)"]))).toEqual([]);
    expect(failing(variant("caminhos", ["  transparent: true,\n", ""]))).toEqual([
      "Os caminhos são transparentes (transparent: true e opacity menor que 1) (caminhoTerra e caminhoSaturno sem transparent: true)",
    ]);
  });
});

describe("a diferença entre os passos", () => {
  it("mostra o que entra e o que sai, com duas linhas de contexto", () => {
    const diff = diffLines("a\nb\nc\nd\ne\nf\ng\n", "a\nb\nc\nX\ne\nf\ng\nh\n");
    expect(diff.filter((d) => d.op !== "same")).toEqual([
      { op: "del", text: "d" },
      { op: "add", text: "X" },
      { op: "add", text: "h" },
    ]);
    expect(hunks(diffLines("1\n2\n3\n4\n5\n6\n7\n8\n", "1\n2\n3\n4\n5\n6\n7\n8\n9\n"))).toEqual([
      { op: "skip", count: 6 },
      { op: "same", text: "7" },
      { op: "same", text: "8" },
      { op: "add", text: "9" },
    ]);
  });

  it("do passo 2 para o 3, só a quantidade e o material mudam", () => {
    const changed = diffLines(galaxia.steps[1].code, galaxia.steps[2].code).filter((d) => d.op !== "same");
    expect(changed.filter((d) => d.op === "del").map((d) => d.text)).toEqual(["const quantidade = 1000;", "const material = new THREE.PointsMaterial({ size: 0.05 });"]);
  });

  it("sabe se o código está no começo, no fim ou fora do guia", () => {
    expect(codeState(galaxia, 3, galaxia.steps[2].code)).toBe("start");
    expect(codeState(galaxia, 3, galaxia.steps[3].code + "\n\n")).toBe("done");
    expect(codeState(galaxia, 3, galaxia.steps[3].code.replace("raio = 5", "raio = 6"))).toBe("mine");
    expect(codeState(galaxia, 3, galaxia.steps[7].code)).toEqual({ guide: 8 });
    expect(codeState(galaxia, 3, galaxia.start)).toEqual({ guide: 0 });
    expect(guideStep(galaxia, galaxia.steps[6].code)).toBe(7);
    expect(guideStep(galaxia, "// meu código")).toBeNull();
  });

  it("os passos no computador não contam: o fim do passo 10 é o fim do guia", () => {
    expect(guideStep(galaxia, galaxia.steps[11].code)).toBe(10);
    expect(codeState(galaxia, 9, galaxia.steps[9].code)).toBe("done");
    expect(behind(galaxia, 10, galaxia.steps[2].code), "o passo 11 começa do fim do 10").toBe(true);
    expect(behind(galaxia, 11, galaxia.steps[9].code), "o passo 12 também").toBe(false);
    expect(behind(galaxia, 5, galaxia.steps[9].code), "adiantado não volta").toBe(false);
    expect(behind(galaxia, 5, "// meu código")).toBe(false);
  });

  it("ignora o recuo quando pedido, e mostra a linha como ficou", () => {
    expect(diffLines("a\n  b\nc\n", "a\nb\n  c\n", { ignoreIndent: true })).toEqual([
      { op: "same", text: "a" },
      { op: "same", text: "b" },
      { op: "same", text: "  c" },
    ]);
    expect(diffLines("a\n  b\n", "a\nb\n").filter((d) => d.op !== "same")).toHaveLength(2);
  });
});

/** Roda o src/cena.js do passo 12 com um GUI de mentira, que guarda os controles. */
function runPanel(code) {
  const controllers = [];
  class FakeGUI {
    add(object, property) {
      const controller = { object, property, finish: null, name: () => controller, onFinishChange: (fn) => ((controller.finish = fn), controller) };
      controllers.push(controller);
      return controller;
    }
    addColor(object, property) {
      return this.add(object, property);
    }
  }
  const body = code.replace(/^import .*\n/gm, "").replace(/^export \{ (.*) \};$/m, "return { $1, parametros };");
  return { ...new Function("THREE", "GUI", body)(THREE, FakeGUI), controllers };
}

describe.each(EACH)("%s: no seu computador", (_, project) => {
  const live = liveSteps(project);
  const computer = project.steps.filter(isComputer);

  it("os passos no computador têm comandos, arquivos explicados, porquês e o que conferir, e partem do último passo no VisuGraph", () => {
    expect(computer[0].id).toBe("computador");
    for (const s of computer) {
      expect(s.code, `${s.id} parte do fim do último passo no VisuGraph`).toBe(live.at(-1).code);
      expect(s.goal.length, s.id).toBeGreaterThan(80);
      expect(s.setup.length, s.id).toBeGreaterThan(0);
      expect(s.setup.filter((item) => item.download), s.id).toHaveLength(1);
      expect(s.files.length, s.id).toBeGreaterThan(0);
      for (const file of s.files) expect(file.lines.length, `${s.id}: ${file.path}`).toBeGreaterThan(0);
      expect(s.why.length, s.id).toBeGreaterThan(0);
      expect(s.try.length, s.id).toBeGreaterThan(0);
      expect(s.confirm.length, s.id).toBeGreaterThan(0);
      expect(s.view, s.id).toBe("camera");
    }
  });

  it("cada trecho explicado está no arquivo, uma vez só (ou depois do marcador)", () => {
    for (const s of computer) {
      for (const file of s.files) {
        for (const line of file.lines) {
          const at = findSnippet(file.code, line);
          expect(at, `${s.id} ${file.path}: ${line.code}`).not.toBeNull();
          if (!line.after) expect(file.code.indexOf(line.code, at.to), `${s.id} ${file.path}: ${line.code} repete`).toBe(-1);
        }
      }
    }
  });

  it("o projeto baixado no primeiro passo no computador tem os arquivos que o passo explica", () => {
    const step = computer[0];
    expect(step.setup.find((item) => item.download).download.file).toBe(`${project.id}.zip`);
    const { files } = exportProject(analyze(step.code), { name: project.id, title: project.title });
    for (const file of step.files) expect(fileOf(files, file.path).content, file.path).toBe(file.code);
    expect(fileOf(step.files, "src/cena.js").from, "o cena.js é o código do editor com o import e o export").toBe(step.code);
    expect(JSON.parse(fileOf(files, "package.json").content).name).toBe(project.id);
  });
});

describe("Gerador de galáxias: o painel do passo 12", () => {
  const stepOf = (id) => galaxia.steps[stepIndex(galaxia, id)];

  it("os dois passos no computador são o projeto e o painel, e o passo 12 parte dos arquivos do 11", () => {
    expect(computer.map((s) => s.id)).toEqual(["computador", "painel"]);
    for (const file of stepOf("painel").files) expect(file.from, file.path).toBe(fileOf(stepOf("computador").files, file.path).code);
  });

  it("o projeto pronto do passo 12 tem o lil-gui no package.json e o cena.js do passo", () => {
    const step = stepOf("painel");
    const item = step.setup.find((i) => i.download).download;
    const { files } = exportProject(analyze(step.code), { name: "galaxia", title: galaxia.title, cena: item.cena, extra: item.extra });
    for (const file of step.files) expect(fileOf(files, file.path).content, file.path).toBe(file.code);
    expect(JSON.parse(fileOf(files, "package.json").content).dependencies).toEqual({ "lil-gui": "^0.21.0", three: "^0.186.1" });
  });

  it("o cena.js do passo 12 monta a galáxia, e o painel gera outra no lugar, liberando a antiga", () => {
    const { cena, animar, parametros, controllers } = runPanel(fileOf(stepOf("painel").files, "src/cena.js").code);
    const stars = () => cena.children.filter((c) => c.isPoints).map((c) => c.geometry.attributes.position.count);
    expect(stars(), "a galáxia e o céu").toEqual([50000, 2000]);
    expect(controllers.map((c) => c.property)).toEqual(["quantidade", "raio", "bracos", "curvatura", "dispersao", "corNucleo", "corBorda"]);
    expect(controllers.every((c) => c.finish === controllers[0].finish && typeof c.finish === "function")).toBe(true);

    const old = cena.children.find((c) => c.isPoints);
    let disposed = 0;
    old.geometry.addEventListener("dispose", () => disposed++);
    old.material.addEventListener("dispose", () => disposed++);
    parametros.quantidade = 3000;
    controllers[0].finish(3000);
    expect(stars(), "o céu e a galáxia nova, que entra no fim da cena").toEqual([2000, 3000]);
    expect(cena.children.includes(old)).toBe(false);
    expect(disposed, "a geometria e o material da antiga").toBe(2);
    animar(10);
    const fresh = cena.children.find((c) => c.isPoints && c.geometry.attributes.position.count === 3000);
    expect(fresh.rotation.y, "animar gira a galáxia nova").toBeCloseTo(1);
  });
});
