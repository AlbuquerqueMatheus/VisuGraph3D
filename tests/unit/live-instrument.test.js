import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { analyze } from "../../src/live/engine/analyze.js";
import { instrument, scriptPosition } from "../../src/live/engine/instrument.js";
import { STARTER_CODE } from "../../src/live/engine/snippets.js";

/** Roda o script como o visor roda (no escopo global), com um __vg de teste. */
function run(code, { loopLimit = 1e5 } = {}) {
  const analysis = analyze(code);
  const result = instrument(analysis);
  const created = [];
  const state = { created, ended: false, animar: null, error: null, loops: 0, analysis, ...result };
  globalThis.__vg = {
    THREE,
    t(id, obj) {
      created.push({ id, obj });
      return obj;
    },
    l() {
      if (++state.loops > loopLimit) throw new Error("laço infinito");
    },
    end(fn) {
      state.ended = true;
      state.animar = fn;
    },
    fail(e) {
      state.error = e;
    },
    timers: { setTimeout, setInterval, clearTimeout, clearInterval, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} },
  };
  (0, eval)(result.script);
  return state;
}

afterEach(() => {
  delete globalThis.__vg;
});

describe("instrument()", () => {
  it("mantém as linhas do código", () => {
    const { script } = instrument(analyze(STARTER_CODE));
    expect(script.split("\n").length).toBe(STARTER_CODE.split("\n").length + 2); // + fim do embrulho e sourceURL
    expect(script.split("\n")[3]).toContain("const cena = __vg.t(0,new THREE.Scene());");
  });

  it("rastreia cada new THREE.X da cena, inclusive os aninhados, mas não vetores e cores", () => {
    const { script } = instrument(analyze(STARTER_CODE));
    expect(script).toContain("__vg.t(7,new THREE.Mesh(\n  __vg.t(8,new THREE.BoxGeometry(1, 1, 1)),");
    expect(script).toContain('cena.background = new THREE.Color("#15171c");');
  });

  it("o código inicial roda e entrega cada objeto e a função animar", () => {
    const state = run(STARTER_CODE);
    expect(state.error).toBeNull();
    expect(state.ended).toBe(true);
    expect(typeof state.animar).toBe("function");
    // os argumentos são criados antes da malha, então a ordem de criação não é a dos ids
    expect(state.created.map((c) => c.id).sort((a, b) => a - b)).toEqual(state.analysis.objects.map((o) => o.id));
    const scene = state.created.find((c) => c.id === 0).obj;
    expect(scene.isScene).toBe(true);
    expect(scene.children.map((c) => c.type)).toEqual(["AmbientLight", "DirectionalLight", "Mesh", "Mesh"]);
    const cubo = state.created.find((c) => c.id === state.analysis.objects.find((o) => o.name === "cubo").id).obj;
    expect(cubo.position.y).toBe(0.5);
  });

  it("cada objeto criado num laço é registrado com o id do trecho que o cria", () => {
    const state = run(`const cena = new THREE.Scene();
for (let i = 0; i < 3; i++) cena.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));`);
    expect(state.error).toBeNull();
    const meshId = state.analysis.objects.find((o) => o.className === "Mesh").id;
    expect(state.created.filter((c) => c.id === meshId)).toHaveLength(3);
    expect(state.loops).toBe(3);
  });

  it("laço infinito é interrompido pela guarda, com e sem chaves", () => {
    expect(run("const cena = new THREE.Scene();\nwhile (true) {}").error.message).toBe("laço infinito");
    expect(run("const cena = new THREE.Scene();\nfor (;;);").error.message).toBe("laço infinito");
    expect(run("const cena = new THREE.Scene();\nlet i = 0;\ndo i++; while (i >= 0);").error.message).toBe("laço infinito");
  });

  it("erro de execução aponta a linha e a coluna do editor", () => {
    const code = "const cena = new THREE.Scene();\nconst cubo = new THREE.Mesh(new THREE.BoxGeometry(), naoExiste);\n";
    const state = run(code);
    expect(state.error).toBeInstanceOf(ReferenceError);
    const pos = scriptPosition(state.error.stack);
    expect(pos.line).toBe(2);
    const original = state.toOriginal(pos.line, pos.column);
    expect(original).toMatchObject({ line: 2, column: code.split("\n")[1].indexOf("naoExiste") });
  });

  it("erro na primeira linha desconta o começo do embrulho", () => {
    const state = run("naoExiste();");
    const pos = scriptPosition(state.error.stack);
    expect(state.toOriginal(pos.line, pos.column)).toMatchObject({ line: 1, column: 0 });
  });
});

describe("scriptPosition()", () => {
  it("lê pilhas do Chrome e do Firefox", () => {
    expect(scriptPosition("ReferenceError: x\n    at animar (cena.js:12:5)\n    at loop (viewport.js:1:1)")).toEqual({ line: 12, column: 4 });
    expect(scriptPosition("animar@cena.js:3:9\n")).toEqual({ line: 3, column: 8 });
    expect(scriptPosition("Error\n at foo (bar.js:1:1)")).toBeNull();
  });
});
