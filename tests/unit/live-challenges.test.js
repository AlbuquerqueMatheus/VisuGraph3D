import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CHALLENGES, TARGET_MATRIX, TRAILS, challengeById, firstOpen, grade, nextChallenge, screenHeight, trailOf } from "../../src/live/challenges.js";
import { sceneFacts } from "../../src/live/runtime/facts.js";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";

// Roda o código com o Three.js de verdade e monta os fatos como o visor monta: cada variável
// do código é um objeto, e o pai de um objeto é dito pelo nome dela.
function factsOf(code) {
  const names = [...code.matchAll(/^(?:const|let|var)\s+(\w+)\s*=/gm)].map((m) => m[1]);
  const scope = new Function("THREE", `${code}\nreturn { ${names.join(", ")} };`)(THREE);
  const idOf = (obj) => names.find((n) => scope[n] === obj);
  const entries = names.map((n) => [n, scope[n]]);
  return { ...sceneFacts({ scene: scope.cena, camera: scope.camera, entries, idOf }), nameOf: (id) => id };
}

const run = (id, extra = "") => grade(challengeById(id), factsOf(challengeById(id).starter + extra));
const seen = (result) => result.results.map((r) => r.seen);

// Um jeito de resolver cada desafio, escrito no fim do código inicial.
const SOLUTIONS = {
  posicao: "cubo.position.set(2, 0.5, -1);",
  rotacao: "placa.rotation.y = THREE.MathUtils.degToRad(45);",
  escala: "coluna.scale.y = 3;\ncoluna.position.y = 1.5;",
  hierarquia: "lua.position.set(2, 0, 0);\norbita.add(lua);",
  lookat: "camera.lookAt(-2, 1, -3);",
  fov: "camera.fov = 25;\ncamera.updateProjectionMatrix();",
  difusa: "sol.position.set(-5, 1, 0);",
  especular: 'esfera.material = new THREE.MeshPhongMaterial({ color: "#3366cc", specular: "#ffffff", shininess: 120 });',
  cor: 'luzAmbiente.color.set("#0000ff");\nsol.color.set("#ff0000");',
  matriz: "bloco.position.set(1, 2, 0);\nbloco.rotation.z = THREE.MathUtils.degToRad(90);\nbloco.scale.set(2, 1, 1);",
};

describe("desafios: o conjunto", () => {
  it("tem 10 desafios, cada um numa trilha só, com enunciado, verificações e 3 dicas", () => {
    expect(CHALLENGES).toHaveLength(10);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(10);
    const inTrails = TRAILS.flatMap((t) => t.challenges);
    expect([...inTrails].sort()).toEqual(CHALLENGES.map((c) => c.id).sort());
    for (const c of CHALLENGES) {
      expect(c.statement.length, c.id).toBeGreaterThan(40);
      expect(c.checks.length, c.id).toBeGreaterThan(0);
      expect(c.hints, c.id).toHaveLength(3);
      expect(["editor", "camera"], c.id).toContain(c.view);
      expect(trailOf(c.id), c.id).not.toBeNull();
    }
  });

  it("o código inicial de cada desafio roda sem erro e cria os objetos que a correção procura", () => {
    for (const c of CHALLENGES) {
      const a = analyze(c.starter);
      expect(hasBlockingError(a), c.id).toBe(false);
      expect(a.diagnostics.filter((d) => d.severity === "error"), c.id).toEqual([]);
      const names = a.objects.map((o) => o.name);
      for (const name of c.needs) expect(names, `${c.id}: ${name}`).toContain(name);
      expect(a.scene?.name, c.id).toBe("cena");
      expect(a.camera?.name, c.id).toBe("camera");
    }
  });

  it("nenhum desafio vem resolvido, e cada um tem solução", () => {
    for (const c of CHALLENGES) {
      expect(run(c.id).ok, `${c.id} no início`).toBe(false);
      const solved = run(c.id, `\n${SOLUTIONS[c.id]}\n`);
      expect(solved.results.filter((r) => !r.ok), `${c.id} resolvido`).toEqual([]);
      expect(solved.ok).toBe(true);
    }
  });

  it("a última dica, quando é só código, resolve o desafio", () => {
    for (const c of CHALLENGES) {
      const last = c.hints.at(-1);
      const code = /^`([^`]+)`$/.exec(last)?.[1];
      // fov explica a conta; especular mostra o material para pôr no lugar do outro
      if (!code || code.startsWith("new ")) continue;
      expect(run(c.id, `\n${code}\n`).ok, c.id).toBe(true);
    }
  });

  it("um objeto que sumiu do código reprova as verificações e diz qual", () => {
    const result = grade(challengeById("posicao"), { objects: {}, lights: [], camera: null, nameOf: () => null });
    expect(result.ok).toBe(false);
    expect(seen(result)).toEqual(["não achei cubo na cena"]);
  });
});

describe("desafios: a correção diz o que viu", () => {
  it("posição: mostra onde o cubo está", () => {
    expect(seen(run("posicao"))).toEqual(["está em (0,00; 0,50; 0,00)"]);
    expect(run("posicao", "cubo.position.set(2.03, 0.5, -1);").ok).toBe(true);
  });

  it("rotação: aceita 225° (a placa é simétrica), recusa graus no lugar de radianos e inclinação", () => {
    expect(run("rotacao", "placa.rotation.y = THREE.MathUtils.degToRad(225);").ok).toBe(true);
    expect(seen(run("rotacao", "placa.rotation.y = 45;"))[0]).toMatch(/^está girada \d+,\d° em torno de y$/);
    expect(seen(run("rotacao", "placa.rotation.set(0.3, Math.PI / 4, 0);"))).toEqual(["está inclinada: gire só em torno de y"]);
    // inclinada em torno do próprio eixo x da placa, depois de girar: o eixo y sai de pé
    expect(run("rotacao", "placa.rotation.order = 'YXZ';\nplaca.rotation.set(0.3, Math.PI / 4, 0);").ok).toBe(false);
  });

  it("escala: só a escala deixa a base afundada", () => {
    const result = run("escala", "coluna.scale.y = 3;");
    expect(result.results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(seen(result)[2]).toBe("a base está em y = −1,00");
    expect(seen(run("escala", "coluna.scale.set(2, 3, 2);\ncoluna.position.y = 1.5;"))[1]).toBe("tem 1,20 × 1,20 de largura");
  });

  it("hierarquia: o pai é dito pelo nome, e a distância é a de mundo", () => {
    expect(seen(run("hierarquia"))[0]).toBe("o pai da lua é a cena");
    const wrong = run("hierarquia", "orbita.add(lua);");
    expect(wrong.results.map((r) => r.ok)).toEqual([true, false]);
    expect(seen(wrong)[1]).toBe("está a 3,16");
    // a distância não muda com o giro da órbita
    expect(run("hierarquia", "lua.position.set(2, 0, 0);\norbita.add(lua);\norbita.rotation.y = 1.3;").ok).toBe(true);
    expect(seen(run("hierarquia", "const outro = new THREE.Group();\ncena.add(outro);\nlua.position.set(2, 0, 0);\noutro.add(lua);"))[0]).toBe("o pai da lua é outro");
  });

  it("lookAt: mover a câmera reprova, e o erro sai em graus", () => {
    expect(seen(run("lookat"))[1]).toMatch(/^erra por \d+,\d°$/);
    const moved = run("lookat", "camera.position.set(0, 2, 4);\ncamera.lookAt(-2, 1, -3);");
    expect(moved.results.map((r) => r.ok)).toEqual([false, true]);
  });

  it("fov: metade da altura com fov ≈ 25°, conferida pelas nossas matrizes", () => {
    expect(seen(run("fov"))[1]).toBe("ocupa 24% da altura");
    const world = new THREE.Matrix4().makeTranslation(0, 1, 10);
    const camera = { world: [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => world.elements[j * 4 + i])), fov: 25.06, near: 0.1, far: 100, zoom: 1 };
    expect(screenHeight({ min: [-1, 0, -1], max: [1, 2, 1] }, camera)).toBeCloseTo(0.5, 3);
    // o zoom da câmera também chega lá
    expect(run("fov", "camera.zoom = 2.1;\ncamera.updateProjectionMatrix();").ok).toBe(true);
    expect(seen(run("fov", "camera.position.z = 5;"))[0]).toBe("algo saiu do lugar");
  });

  it("difusa: a direção da luz vai da posição até o alvo", () => {
    expect(seen(run("difusa"))).toEqual(["a direção da luz é l = (0,91; 0,37; 0,18)"]);
    expect(run("difusa", "sol.position.set(0, 2, 1);\nsol.target.position.set(5, 0, 0);\ncena.add(sol.target);").ok).toBe(true);
  });

  it("especular: o material, o brilho e a cor especular, um de cada vez", () => {
    expect(seen(run("especular"))).toEqual(["é MeshLambertMaterial", "é 0", "o material não tem cor especular"]);
    const phong = run("especular", 'esfera.material = new THREE.MeshPhongMaterial({ color: "#3366cc" });');
    expect(seen(phong)).toEqual([null, "é 30", "Ks = (0,07; 0,07; 0,07)"]);
  });

  it("cor: apagar uma luz não vale, e o verde do chão de uma HemisphereLight conta", () => {
    const off = run("cor", 'luzAmbiente.color.set("#0000ff");\nsol.intensity = 0;');
    expect(seen(off)).toEqual([null, "sol está apagada ou quase", null]);
    const ground = run("cor", 'luzAmbiente.color.set("#0000ff");\nsol.color.set("#ff0000");\ncena.add(new THREE.HemisphereLight("#ff0000", "#00ff00", 1));');
    expect(seen(ground)[2]).toBe("1 luz ainda tem verde");
    const material = run("cor", 'esfera.material.color.set("#ff0000");\nluzAmbiente.color.set("#00ffff");\nsol.color.set("#00ffff");');
    expect(seen(material)).toEqual(["a cor do material é #ff0000", null, "2 luzes ainda têm verde"]);
  });

  it("matriz: a alvo é T · Rz(90°) · S, e a correção dá a maior diferença", () => {
    expect(TARGET_MATRIX).toEqual([
      [0, -1, 0, 1],
      [2, 0, 0, 2],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]);
    expect(seen(run("matriz"))).toEqual(["a maior diferença é 2,000"]);
  });
});

describe("trilhas", () => {
  it("abrem no primeiro desafio ainda não feito, e o próximo segue a trilha e depois as outras", () => {
    const matriz = TRAILS.find((t) => t.id === "matriz");
    expect(firstOpen(matriz, new Set()).id).toBe("posicao");
    expect(firstOpen(matriz, new Set(["posicao", "rotacao"])).id).toBe("escala");
    expect(firstOpen(matriz, new Set(matriz.challenges)).id).toBe("posicao");
    expect(nextChallenge("posicao", new Set()).id).toBe("rotacao");
    expect(nextChallenge("matriz", new Set()).id).toBe("lookat");
    expect(nextChallenge("cor", new Set(["posicao"])).id).toBe("rotacao");
    expect(nextChallenge("cor", new Set(CHALLENGES.map((c) => c.id)))).toBeNull();
  });

  it("a trilha de Phong liga a caixa de vidro", () => {
    expect(TRAILS.find((t) => t.id === "phong").glass).toBe("phong");
  });
});
