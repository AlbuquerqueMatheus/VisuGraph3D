import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { grade } from "../../src/live/challenges.js";
import { sceneFacts } from "../../src/live/runtime/facts.js";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";
import { LEVELS, PROJECTS, codeState, diffLines, findSnippet, guideStep, hunks, projectById, startCode, stepIndex } from "../../src/live/projects/index.js";
import { animatedKeys, armsOf } from "../../src/live/projects/checks.js";

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
const failing = (result) => result.results.filter((r) => !r.ok).map((r) => `${r.text} (${r.seen})`);

describe("guia de projetos: o catálogo", () => {
  it("tem os três níveis, e cada projeto está num deles", () => {
    expect(LEVELS.map((l) => l.id)).toEqual(["facil", "intermediario", "avancado"]);
    for (const p of PROJECTS) expect(LEVELS.map((l) => l.id)).toContain(p.level);
    expect(LEVELS.flatMap((l) => l.soon)).toHaveLength(8);
  });

  it("acha o passo pelo número ou pelo id", () => {
    expect(stepIndex(galaxia, "1")).toBe(0);
    expect(stepIndex(galaxia, 10)).toBe(9);
    expect(stepIndex(galaxia, "espiral")).toBe(5);
    expect(stepIndex(galaxia, "11")).toBe(-1);
    expect(stepIndex(galaxia, "nada")).toBe(-1);
  });
});

describe("Gerador de galáxias", () => {
  it("tem 10 passos, cada um com objetivo, linhas, porquês, sugestões e conferências", () => {
    expect(galaxia.steps).toHaveLength(10);
    expect(new Set(galaxia.steps.map((s) => s.id)).size).toBe(10);
    for (const s of galaxia.steps) {
      expect(s.goal.length, s.id).toBeGreaterThan(80);
      expect(s.lines.length, s.id).toBeGreaterThan(0);
      expect(s.why.length, s.id).toBeGreaterThan(0);
      expect(s.try.length, s.id).toBeGreaterThan(0);
      expect(s.checks.length, s.id).toBeGreaterThan(0);
      expect(["editor", "camera"], s.id).toContain(s.view);
    }
  });

  it("o código de cada passo roda sem erro e é o do passo anterior com mudanças", () => {
    galaxia.steps.forEach((s, i) => {
      const a = analyze(s.code);
      expect(hasBlockingError(a), s.id).toBe(false);
      expect(a.diagnostics.filter((d) => d.severity === "error"), s.id).toEqual([]);
      expect(diffLines(startCode(galaxia, i), s.code).some((d) => d.op !== "same"), s.id).toBe(true);
    });
  });

  it("cada trecho explicado está no código do passo, uma vez só (ou depois do marcador)", () => {
    for (const s of galaxia.steps) {
      for (const line of s.lines) {
        const at = findSnippet(s.code, line);
        expect(at, `${s.id}: ${line.code}`).not.toBeNull();
        if (!line.after) expect(s.code.indexOf(line.code, at.to), `${s.id}: ${line.code} repete`).toBe(-1);
      }
    }
  });

  it("o código de cada passo passa nas conferências do passo", () => {
    for (const s of galaxia.steps) expect(failing(grade(s, factsOf(s.code))), s.id).toEqual([]);
  });

  it("o código do começo de cada passo ainda não passa: o passo tem o que fazer", () => {
    galaxia.steps.forEach((s, i) => {
      expect(grade(s, factsOf(startCode(galaxia, i))).ok, s.id).toBe(false);
    });
  });
});

describe("conferências da galáxia", () => {
  const stepOf = (id) => galaxia.steps[stepIndex(galaxia, id)];
  /** O código do passo com trocas [de, para], conferido pelo próprio passo. */
  const variant = (id, ...swaps) => {
    let code = stepOf(id).code;
    for (const [from, to] of swaps) {
      expect(code, `${id}: ${from}`).toContain(from);
      code = code.replace(from, to);
    }
    return grade(stepOf(id), factsOf(code));
  };

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
});
