import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { grade } from "../../src/live/challenges.js";
import { sceneFacts } from "../../src/live/runtime/facts.js";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";
import { instrument } from "../../src/live/engine/instrument.js";
import { LEVELS, PROJECTS, behind, codeState, diffLines, findSnippet, guideStep, hunks, isComputer, liveSteps, projectById, startCode, stepIndex } from "../../src/live/projects/index.js";
import { animatedKeys, armsOf } from "../../src/live/projects/checks.js";
import { exportProject } from "../../src/live/export.js";

// Roda o código instrumentado com o Three.js de verdade, como o visor roda, e monta os fatos como
// o app monta para um projeto: cada `new` do código guarda os objetos que criou (num laço, vários),
// os objetos vão pelo nome da variável (a local, se foram criados num laço), com o fundo e o que
// animar() muda, pela análise do código. Sem cena no código, o visor usa uma vazia (e avisa na
// barra de status). Com `seconds`, a animação roda esse tempo em quadros de 1/60 s (ou com os
// tempos de `frames`, um depois do outro, de novo e de novo), e o rastro de cada objeto é anotado
// como o visor anota: a cada 1/30 s, os últimos 20 s.
function factsOf(code, { seconds = 0, frames = [1 / 60] } = {}) {
  const analysis = analyze(code);
  const registry = new Map();
  const ids = new Map();
  let error = null;
  let animar = null;
  globalThis.__vg = {
    THREE,
    t(id, obj) {
      if (!registry.has(id)) registry.set(id, []);
      registry.get(id).push(obj);
      if (obj && typeof obj === "object") ids.set(obj, id);
      return obj;
    },
    l() {},
    end(fn) {
      animar = fn;
    },
    fail(e) {
      error = e;
    },
    timers: { setTimeout, setInterval, clearTimeout, clearInterval, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} },
  };
  try {
    (0, eval)(instrument(analysis).script);
  } finally {
    delete globalThis.__vg;
  }
  if (error) throw error;
  const first = (obj) => (obj ? registry.get(obj.id)?.[0] : undefined);
  const scene = first(analysis.scene) ?? new THREE.Scene();
  const trails = new Map();
  let recorded = 0;
  if (animar && seconds > 0) {
    let last = -Infinity;
    let tempo = 0;
    for (let frame = 0; tempo < seconds - 1e-9; frame++) {
      const delta = frames[frame % frames.length];
      tempo += delta;
      animar(tempo, delta);
      if (tempo - last < 1 / 30 - 1e-9) continue;
      last = tempo;
      scene.updateMatrixWorld();
      for (const [id, [obj]] of registry) {
        if (!obj?.isObject3D || obj.isScene) continue;
        obj.updateWorldMatrix(true, false);
        const e = obj.matrixWorld.elements;
        if (!trails.has(id)) trails.set(id, []);
        const trail = trails.get(id);
        trail.push([tempo, e[12], e[13], e[14]]);
        if (trail.length > 600) trail.shift();
      }
    }
    const any = trails.values().next().value;
    recorded = any ? any.at(-1)[0] - any[0][0] : 0;
  }
  const facts = sceneFacts({ scene, camera: first(analysis.camera), entries: [...registry], idOf: (obj) => ids.get(obj), trails });
  const nameOf = (id) => analysis.objects[id]?.name ?? analysis.objects[id]?.local ?? null;
  const objects = Object.create(null);
  for (const [id, f] of Object.entries(facts.objects)) {
    const name = nameOf(id);
    if (name && !objects[name]) objects[name] = f;
  }
  return { ...facts, objects, nameOf, animated: animatedKeys(analysis), hasAnimar: !!analysis.animar, playing: !!animar && seconds > 0, recorded };
}

/** Os segundos de animação antes de conferir um passo que mede o movimento (`motion`), como o carrinho da montanha-russa. */
const MOTION_SECONDS = 20;
/** Os fatos do código para as conferências do passo: com a animação rodando, se o passo mede o movimento. */
const factsFor = (step, code) => factsOf(code, { seconds: step.motion ? MOTION_SECONDS : 0 });

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
    return grade(step, factsFor(step, code));
  };
}

describe("guia de projetos: o catálogo", () => {
  it("tem os três níveis, e cada projeto está num deles", () => {
    expect(LEVELS.map((l) => l.id)).toEqual(["facil", "intermediario", "avancado"]);
    for (const p of PROJECTS) expect(LEVELS.map((l) => l.id)).toContain(p.level);
    expect(LEVELS.flatMap((l) => l.soon)).toHaveLength(4);
    const soon = LEVELS.flatMap((l) => l.soon.map((s) => s.title));
    for (const p of PROJECTS) expect(soon, `${p.title} já existe`).not.toContain(p.title);
  });

  it("os fáceis vêm primeiro: Sistema solar, Vitrine de materiais e Cidade ao entardecer, com 8 passos no VisuGraph e 1 no computador; o Gerador de galáxias tem 10 e 2, e a Montanha-russa, 11 e 1", () => {
    expect(PROJECTS.map((p) => [p.id, liveSteps(p).length, p.steps.filter(isComputer).length])).toEqual([
      ["sistema-solar", 8, 1],
      ["vitrine", 8, 1],
      ["cidade", 8, 1],
      ["galaxia", 10, 2],
      ["montanha-russa", 11, 1],
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
    for (const s of live) expect(failing(grade(s, factsFor(s, s.code))), s.id).toEqual([]);
  });

  it("o código do começo de cada passo ainda não passa: o passo tem o que fazer", () => {
    live.forEach((s, i) => {
      expect(grade(s, factsFor(s, startCode(project, i))).ok, s.id).toBe(false);
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

describe("conferências da vitrine", () => {
  const variant = variantOf(projectById("vitrine"));

  it("a câmera sem lookAt, de lado, perto ou com o campo de visão aberto, e o fundo claro, a conferência avisa", () => {
    expect(failing(variant("palco", ["camera.lookAt(0, 1, 0);", ""]))).toEqual(["Ela olha para o centro da vitrine, de um pouco acima (5° a 35°) (a câmera olha 14° para fora do centro)"]);
    expect(failing(variant("palco", ["camera.position.set(0, 5, 16);", "camera.position.set(12, 5, 10);"]))).toEqual([
      "A câmera fica de frente para a vitrine, longe o bastante para ela caber no visor (a câmera está 50° para o lado: as esferas ficariam umas atrás das outras)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(0, 5, 16);", "camera.position.set(0, 3.6, 10);"]))).toEqual([
      "A câmera fica de frente para a vitrine, longe o bastante para ela caber no visor (a câmera está a 10,3 do centro: com 40° de campo de visão, as esferas das pontas só cabem num visor estreito de 14,9 para trás)",
    ]);
    expect(failing(variant("palco", ["PerspectiveCamera(40,", "PerspectiveCamera(30,"]))).toEqual([
      "A câmera fica de frente para a vitrine, longe o bastante para ela caber no visor (a câmera está a 16,5 do centro: com 30° de campo de visão, as esferas das pontas só cabem num visor estreito de 20,3 para trás)",
    ]);
    expect(failing(variant("palco", ["PerspectiveCamera(40,", "PerspectiveCamera(50,"], ["camera.position.set(0, 5, 16);", "camera.position.set(0, 4, 12);"])), "com um ângulo maior, cabe mais perto").toEqual([]);
    expect(failing(variant("palco", ["PerspectiveCamera(40,", "PerspectiveCamera(90,"]))).toEqual(["O campo de visão é fechado, de no máximo 50° (o campo de visão é de 90°: as esferas das pontas sairiam ovais)"]);
    expect(failing(variant("palco", ['new THREE.Color("#111317")', 'new THREE.Color("#f0f0f0")']))).toEqual(["A cena tem um fundo escuro (o fundo é #f0f0f0, claro demais para uma vitrine à noite)"]);
  });

  it("as três esferas: a mesma geometria, a mesma cor, na ordem e sem se encostar", () => {
    expect(failing(variant("esferas", ["  forma,", "  new THREE.SphereGeometry(1, 64, 32),"]))).toEqual(["As três usam a mesma geometria (lambert tem uma geometria só dela)"]);
    expect(failing(variant("esferas", ["  forma,", "  new THREE.SphereGeometry(1, 64, 32),"], ["  forma,", "  new THREE.SphereGeometry(1, 64, 32),"], ["  forma,", "  new THREE.SphereGeometry(1, 64, 32),"]))).toEqual([
      "As três usam a mesma geometria (cada esfera tem a sua geometria)",
    ]);
    expect(failing(variant("esferas", ['new THREE.MeshBasicMaterial({ color: "#e0533d" })\n);\nphong', 'new THREE.MeshBasicMaterial({ color: "#3d7be0" })\n);\nphong']))).toEqual([
      "As três têm a mesma cor (phong é #3d7be0, e lambert, #e0533d)",
    ]);
    expect(failing(variant("esferas", ["lambert.position.set(-2.6, 1.6, 0);", "lambert.position.set(2.6, 1.6, 0);"], ["standard.position.set(2.6, 1.6, 0);", "standard.position.set(-2.6, 1.6, 0);"]))).toEqual([
      "Da esquerda para a direita: lambert, phong e standard, sem encostar uma na outra (da esquerda para a direita, estão standard, phong e lambert)",
    ]);
    expect(failing(variant("esferas", ["lambert.position.set(-2.6, 1.6, 0);", "lambert.position.set(-1.9, 1.6, 0);"]))).toEqual([
      "Da esquerda para a direita: lambert, phong e standard, sem encostar uma na outra (lambert e phong se encostam)",
    ]);
    expect(failing(variant("esferas", ["new THREE.SphereGeometry(1, 64, 32)", "new THREE.BoxGeometry(2, 2, 2)"]))).toEqual([
      "As três são esferas do mesmo tamanho, lado a lado, à mesma altura (lambert não é redonda)",
    ]);
  });

  it("o sol fraco, de trás ou fora da cena, a luz ambiente no lugar da do céu e o Lambert sem luz, a conferência avisa", () => {
    expect(failing(variant("luz", ['new THREE.DirectionalLight("#ffffff", 2.2)', 'new THREE.DirectionalLight("#ffffff", 0.5)']))).toEqual([
      "Ele ilumina sem estourar: intensidade entre 1 e 5 (a intensidade é 0,50: fraca demais, as esferas ficam escuras)",
    ]);
    expect(failing(variant("luz", ["sol.position.set(-4, 6, 5);", "sol.position.set(-4, 6, -5);"]))).toEqual([
      "O sol é uma luz direcional, na cena, que vem de cima e da frente (a luz vem de trás das esferas: o lado que a câmera vê fica no escuro)",
    ]);
    expect(failing(variant("luz", ["cena.add(sol);", ""]))).toEqual(["O sol é uma luz direcional, na cena, que vem de cima e da frente (o sol não foi adicionado à cena)"]);
    expect(failing(variant("luz", ['new THREE.HemisphereLight("#cfe0ff", "#4a3b2f", 1)', 'new THREE.AmbientLight("#cfe0ff", 1)']))).toEqual([
      "Uma luz do céu (HemisphereLight) clareia o lado da sombra (não há HemisphereLight acesa na cena)",
    ]);
    expect(failing(variant("luz", ['new THREE.HemisphereLight("#cfe0ff", "#4a3b2f", 1)', 'new THREE.HemisphereLight("#4a3b2f", "#cfe0ff", 1)']))).toEqual([
      "Uma luz do céu (HemisphereLight) clareia o lado da sombra (o chão (a segunda cor) está mais claro que o céu)",
    ]);
    expect(failing(variant("luz", ["new THREE.MeshLambertMaterial(", "new THREE.MeshBasicMaterial("]))).toEqual([
      "A esfera da esquerda é de MeshLambertMaterial (é MeshBasicMaterial, que ignora a luz)",
    ]);
  });

  it("o Phong com o specular padrão ou um shininess fora da faixa, a conferência avisa", () => {
    expect(failing(variant("phong", [', specular: "#ffffff"', ""]))).toEqual(["A cor do brilho (specular) é clara (specular é #111111, o padrão: o brilho quase não aparece)"]);
    expect(failing(variant("phong", ["shininess: 60", "shininess: 5"]))).toEqual(["O shininess fica entre 20 e 300 (shininess 5: a mancha se espalha pela esfera inteira)"]);
    expect(failing(variant("phong", ["shininess: 60", "shininess: 1000"]))).toEqual(["O shininess fica entre 20 e 300 (shininess 1000: a mancha vira um ponto)"]);
  });

  it("o Standard de metal, sem roughness ou liso demais, a conferência avisa", () => {
    expect(failing(variant("standard", ["metalness: 0 ", "metalness: 1 "]))).toEqual(["Ela não é metal (metalness perto de 0) (metalness 1,00: sem nada em volta para refletir, o metal fica escuro)"]);
    expect(failing(variant("standard", ["roughness: 0.35, ", ""]))).toEqual([
      "A aspereza (roughness) fica entre 0,2 e 0,6 (roughness 1,00, o padrão: o brilho se espalha tanto que some)",
    ]);
    expect(failing(variant("standard", ["roughness: 0.35", "roughness: 0.05"]))).toEqual(["A aspereza (roughness) fica entre 0,2 e 0,6 (roughness 0,05: o brilho vira um ponto)"]);
  });

  it("o chão de costas ou em pé, os pedestais enterrados e uma esfera sem pedestal, a conferência avisa", () => {
    expect(failing(variant("chao", ["chao.rotation.x = -Math.PI / 2;", "chao.rotation.x = Math.PI / 2;"]))).toEqual([
      "O chão é plano, deitado na altura 0 e virado para cima (o chão está de costas: a câmera, de cima, vê o verso, que não é pintado)",
    ]);
    expect(failing(variant("chao", ["chao.rotation.x = -Math.PI / 2;\n", ""]))).toEqual(["O chão é plano, deitado na altura 0 e virado para cima (o chão não está deitado: falta girar 90° em x)"]);
    expect(failing(variant("chao", ["pedestal.position.set(esfera.position.x, 0.3, 0);", "pedestal.position.set(esfera.position.x, 0, 0);"]))).toEqual([
      "Cada esfera está em cima de um pedestal, encostada nele (lambert flutua 0,30 acima do pedestal)",
      "Os pedestais ficam apoiados no chão (um pedestal começa a −0,30 do chão)",
    ]);
    expect(failing(variant("chao", ["[lambert, phong, standard]", "[lambert, phong]"]))).toEqual(["Cada esfera está em cima de um pedestal, encostada nele (standard não tem pedestal embaixo)"]);
    expect(failing(variant("chao", ["const pedra = new THREE.MeshStandardMaterial(", "const pedra = new THREE.MeshBasicMaterial("]))).toEqual([
      "O chão e os pedestais reagem à luz (o chão é MeshBasicMaterial, que não reage à luz)",
    ]);
  });

  it("a escala de aspereza conta as cinco amostras do laço, na ordem", () => {
    expect(failing(variant("aspereza", ["i < 5", "i < 4"]))).toEqual([
      "São 5 amostras redondas, numa fila na frente dos pedestais (há 4 amostras)",
      "Da esquerda para a direita, a aspereza vai de 0 a 1, subindo (a aspereza vai de 0,00 a 0,75)",
    ]);
    expect(failing(variant("aspereza", ["roughness: i / 4", "roughness: 1 - i / 4"]))).toEqual([
      "Da esquerda para a direita, a aspereza vai de 0 a 1, subindo (da esquerda para a direita, a aspereza é 1,00; 0,75; 0,50; 0,25; 0,00)",
    ]);
    expect(failing(variant("aspereza", ["amostra.position.set(-2.4 + i * 1.2, 0.4, 3.6);", "amostra.position.set(-2.4 + i * 1.2, 1, 3.6);"]))).toEqual([
      "Elas ficam apoiadas no chão (uma amostra começa a 0,60 do chão)",
    ]);
  });

  it("a lâmpada fraca, o bulbo fora dela ou com luz e o animar sem o z, a conferência avisa; com position.set no animar, vale", () => {
    expect(failing(variant("lampada", ['new THREE.PointLight("#ffd9a0", 12)', 'new THREE.PointLight("#ffd9a0", 1)']))).toEqual([
      "A luz da lâmpada chega à esfera do meio (chega 0,05 de luz na esfera do meio, quase nada: a luz pontual enfraquece com o quadrado da distância)",
    ]);
    expect(failing(variant("lampada", ["lampada.add(bulbo);", "cena.add(bulbo);"]))).toEqual([
      "O bulbo vai junto com a lâmpada e brilha com a própria cor (o bulbo está direto na cena e não vai com a lâmpada)",
    ]);
    expect(failing(variant("lampada", ['new THREE.MeshBasicMaterial({ color: "#ffd9a0" })', 'new THREE.MeshStandardMaterial({ color: "#ffd9a0" })']))).toEqual([
      "O bulbo vai junto com a lâmpada e brilha com a própria cor (o bulbo é MeshStandardMaterial: com a luz dentro dele, ele fica escuro)",
    ]);
    expect(failing(variant("lampada", ["  lampada.position.z = Math.sin(tempo) * 4;\n", ""]))).toEqual([
      "Ela dá voltas em torno do centro, a uns 4 dele (animar() não muda o x e o z da lâmpada)",
    ]);
    expect(
      failing(variant("lampada", ["  lampada.position.x = Math.cos(tempo) * 4;\n  lampada.position.z = Math.sin(tempo) * 4;", "  lampada.position.set(Math.cos(tempo) * 4, 3.5, Math.sin(tempo) * 4);"])),
    ).toEqual([]);
  });
});

describe("conferências da cidade", () => {
  const variant = variantOf(projectById("cidade"));

  it("o céu escuro ou frio, e a câmera de frente, perto ou olhando para fora, a conferência avisa", () => {
    expect(failing(variant("palco", ['new THREE.Color("#f6a26b")', 'new THREE.Color("#1b2a4a")']))).toEqual(["O céu é de fim de tarde: uma cor clara e quente (o fundo é #1b2a4a, escuro demais para o fim da tarde)"]);
    expect(failing(variant("palco", ['new THREE.Color("#f6a26b")', 'new THREE.Color("#a8c8ff")']))).toEqual([
      "O céu é de fim de tarde: uma cor clara e quente (o fundo é #a8c8ff, uma cor fria: o céu do fim da tarde puxa para o laranja)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(22, 19, 33);", "camera.position.set(0, 19, 40);"]))).toEqual([
      "Ela vê a cidade na diagonal e de cima, de 15° a 45° (a câmera está só 0° fora do eixo z: quase de frente para a grade, ela vê uma face só de cada prédio)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(22, 19, 33);", "camera.position.set(10, 9, 15);"]))).toEqual([
      "A câmera fica do lado de fora da cidade, a uns 30 a 60 do centro (a câmera está a 19,7 do centro: perto demais, no meio dos prédios)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(22, 19, 33);", "camera.position.set(22, 6, 33);"]))).toEqual([
      "Ela vê a cidade na diagonal e de cima, de 15° a 45° (a câmera está só 7° acima do centro: os prédios da frente escondem a cidade)",
    ]);
    expect(failing(variant("palco", ["camera.lookAt(0, 1, 0);", "camera.lookAt(10, 1, 0);"]))).toEqual(["Ela olha para o centro da cidade (a câmera olha 13° para fora do centro da cidade)"]);
  });

  it("o chão de costas ou pequeno e a luz do céu forte ou com as cores trocadas, a conferência avisa", () => {
    expect(failing(variant("chao", ["chao.rotation.x = -Math.PI / 2;", "chao.rotation.x = Math.PI / 2;"]))).toEqual([
      "O chão é plano, deitado na altura 0 e virado para cima (o chão está de costas: a câmera, de cima, vê o verso, que não é pintado)",
    ]);
    expect(failing(variant("chao", ["new THREE.PlaneGeometry(200, 200)", "new THREE.PlaneGeometry(40, 40)"]))).toEqual([
      "Ele é grande: vai pelo menos 60 para cada lado do centro (o chão vai só até 20 do centro: a borda dele aparece logo atrás da cidade)",
    ]);
    expect(failing(variant("chao", ['new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 1)', 'new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 3)']))).toEqual([
      "Uma luz do céu (HemisphereLight) clareia a cena, azulada de cima (a intensidade é 3,00: forte demais, o lado da sombra ficaria quase tão claro quanto o do sol)",
    ]);
    expect(failing(variant("chao", ['new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 1)', 'new THREE.HemisphereLight("#6b4a3a", "#7f8fff", 1)']))).toEqual([
      "Uma luz do céu (HemisphereLight) clareia a cena, azulada de cima (o chão (a segunda cor) está mais claro que o céu)",
    ]);
    expect(failing(variant("chao", ['new THREE.HemisphereLight("#7f8fff", "#6b4a3a", 1)', 'new THREE.HemisphereLight("#ffd0a0", "#6b4a3a", 1)']))).toEqual([
      "Uma luz do céu (HemisphereLight) clareia a cena, azulada de cima (a cor de cima é #ffd0a0: a luz do céu, a que vai pintar as sombras, é azulada)",
    ]);
    // a sugestão da câmera que desenha só até 60: o chão termina antes, e nada mais muda
    expect(failing(variant("chao", ["16 / 9, 0.1, 200)", "16 / 9, 0.1, 60)"]))).toEqual([]);
  });

  it("sem o translate, o prédio afunda; subir o prédio metade da altura não muda a forma, que continua com o centro no meio", () => {
    expect(failing(variant("predio", ["forma.translate(0, 0.5, 0);\n", ""]))).toEqual([
      "O prédio fica no centro, de pé no chão (o prédio afunda 3,00 no chão)",
      "A forma tem a base no chão: começa na altura 0 (a forma vai de −0,50 a 0,50 em y: com o centro no meio, a escala estica o prédio para baixo também)",
    ]);
    expect(failing(variant("predio", ["forma.translate(0, 0.5, 0);\n", ""], ["predio.scale.set(2, 6, 2);", "predio.scale.set(2, 6, 2);\npredio.position.y = 3;"]))).toEqual([
      "A forma tem a base no chão: começa na altura 0 (a forma vai de −0,50 a 0,50 em y: com o centro no meio, a escala estica o prédio para baixo também)",
    ]);
    expect(failing(variant("predio", ["predio.scale.set(2, 6, 2);", "predio.scale.set(2, 2, 2);"]))).toEqual(["Ele é um prédio: mais alto que largo (o prédio tem 2,0 de altura e 2,0 de largura: parece mais um bloco)"]);
    expect(failing(variant("predio", ["new THREE.MeshStandardMaterial({ color: \"#e8dfd2\" })", "new THREE.MeshBasicMaterial({ color: \"#e8dfd2\" })"]))).toEqual([
      "O concreto reage à luz (o prédio é MeshBasicMaterial, que ignora a luz)",
    ]);
  });

  it("outro sorteio ainda é a cidade; sem o centro mais alto, com as quadras grudadas ou com uma forma por prédio, a conferência avisa", () => {
    expect(failing(variant("cidade", ["Math.sin(i * 17 + j * 31)", "Math.sin(i * 18 + j * 31)"]))).toEqual([]);
    const flat = failing(variant("cidade", ["(12 - 2 * centro)", "12"]));
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatch(/^Os mais altos ficam perto do centro \(perto do centro, a altura média é \d,\d; mais longe, \d,\d\)$/);
    expect(failing(variant("cidade", ["predio.position.set((i - 4) * 3.6, 0, (j - 4) * 3.6);", "predio.position.set((i - 4) * 1.8, 0, (j - 4) * 1.8);"]))).toEqual([
      "Todos ficam de pé no chão, com ruas entre eles (dois prédios se encostam perto de (−7,2; −7,2))",
    ]);
    expect(failing(variant("cidade", ["const predio = new THREE.Mesh(forma, concreto);", "const predio = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), concreto);"]))).toEqual([
      "Todos usam a mesma forma (cada prédio tem uma geometria só dele)",
    ]);
    expect(failing(variant("cidade", ["for (let i = 0; i < 9; i++) {", "for (let i = 0; i < 2; i++) {"]))[0]).toBe("A cidade tem pelo menos 25 prédios (há 18 prédios)");
  });

  it("o sol alto, branco, atrás dos prédios ou fraco, a conferência avisa; com o dobro da posição, a luz é a mesma", () => {
    expect(failing(variant("sol", ["sol.position.set(-22, 12, 26);", "sol.position.set(-22, 40, 26);"]))).toEqual([
      "Ele está baixo: de 10° a 30° acima do horizonte (o sol está 50° acima do horizonte: alto demais para o fim da tarde, e as sombras ficariam curtas)",
    ]);
    expect(failing(variant("sol", ['new THREE.DirectionalLight("#ffc27a", 3.5)', 'new THREE.DirectionalLight("#ffffff", 3.5)']))).toEqual([
      "A luz dele é quente, mais vermelha que azul (a cor do sol é #ffffff: no fim da tarde, a luz do sol chega alaranjada)",
    ]);
    expect(failing(variant("sol", ["sol.position.set(-22, 12, 26);", "sol.position.set(-22, 12, -26);"]))).toEqual([
      "Ele ilumina o lado dos prédios que a câmera vê (o sol está atrás dos prédios: a câmera só vê o lado da sombra)",
    ]);
    expect(failing(variant("sol", ['new THREE.DirectionalLight("#ffc27a", 3.5)', 'new THREE.DirectionalLight("#ffc27a", 1)']))).toEqual([
      "Ele é a luz mais forte: intensidade de 2 a 6 (a intensidade é 1,00: fraca demais, a luz do céu ganha dele)",
    ]);
    expect(failing(variant("sol", ['new THREE.DirectionalLight("#ffc27a", 3.5)', 'new THREE.PointLight("#ffc27a", 3.5)']))[0]).toBe("O sol é uma luz direcional, na cena (sol é PointLight, não DirectionalLight)");
    expect(failing(variant("sol", ["sol.position.set(-22, 12, 26);", "sol.position.set(-44, 24, 52);"]))).toEqual([]);
    // a sugestão do sol do lado da câmera: os prédios ficam chapados, mas a luz ainda vale
    expect(failing(variant("sol", ["sol.position.set(-22, 12, 26);", "sol.position.set(22, 12, 26);"]))).toEqual([]);
  });

  it("sem castShadow ou receiveShadow, a conferência diz onde falta", () => {
    expect(failing(variant("sombras", ["sol.castShadow = true;\n", ""]))).toEqual(["O sol faz sombra (castShadow) (o sol não faz sombra: falta sol.castShadow = true)"]);
    expect(failing(variant("sombras", ["chao.receiveShadow = true;\n", ""]))).toEqual([
      "O chão e os prédios recebem sombra (receiveShadow) (o chão não recebe sombra: falta chao.receiveShadow = true)",
    ]);
    expect(failing(variant("sombras", ["    predio.castShadow = true;\n", ""]))).toEqual(["Todos os prédios fazem sombra (os prédios não fazem sombra: falta castShadow no laço)"]);
    expect(failing(variant("sombras", ["predio.receiveShadow = true;", "predio.receiveShadow = false;"]))).toEqual([
      "O chão e os prédios recebem sombra (receiveShadow) (81 prédios não recebem sombra: a sombra de um não aparece no outro)",
    ]);
  });

  it("a caixa pequena, rasa ou com poucos pixels, a conferência avisa; o sol dando voltas continua coberto", () => {
    const box = (n) => [-1, 1, 1, -1].map((sign, k) => [`sol.shadow.camera.${["left", "right", "top", "bottom"][k]} = ${sign * 22};`, `sol.shadow.camera.${["left", "right", "top", "bottom"][k]} = ${sign * n};`]);
    expect(failing(variant("camera-sombra", ...box(10)))).toEqual([
      "A caixa da sombra cobre a cidade inteira, vista do sol (vista do sol, a cidade vai de −21,7 a 21,7 de um lado ao outro, e a caixa, de −10,0 a 10,0)",
    ]);
    expect(failing(variant("camera-sombra", ["sol.shadow.mapSize.set(2048, 2048);", "sol.shadow.mapSize.set(256, 256);"]))).toEqual([
      "A foto da sombra tem detalhe: cada pixel dela cobre no máximo 0,05 (com a caixa de 44 de largura e 256 pixels, cada pixel cobre 0,17: a borda da sombra sai em degraus)",
    ]);
    expect(failing(variant("camera-sombra", ["sol.shadow.camera.far = 80;", "sol.shadow.camera.far = 40;"]))).toEqual([
      "Ela vai da frente da cidade até a ponta da sombra mais comprida (o fundo da caixa (far) está a 40,0 do sol, e a sombra mais comprida termina a 70,3 dele)",
    ]);
    expect(failing(variant("camera-sombra", ["sol.shadow.camera.near = 10;", "sol.shadow.camera.near = 20;"]))).toEqual([
      "Ela vai da frente da cidade até a ponta da sombra mais comprida (a frente da caixa (near) está a 20,0 do sol, e a cidade começa a 15,1 dele: a caixa corta os prédios mais perto do sol)",
    ]);
    // o sol da sugestão, que dá voltas: de qualquer lado, na mesma altura e à mesma distância
    for (const a of [0, 1, 2, 3, 4, 5]) {
      const [x, z] = [Math.cos(a) * 34, Math.sin(a) * 34].map((c) => c.toFixed(3));
      expect(failing(variant("camera-sombra", ["sol.position.set(-22, 12, 26);", `sol.position.set(${x}, 12, ${z});`])), `ângulo ${a}`).toEqual([]);
    }
  });

  it("a neblina de outra cor, colada na câmera ou longe demais, a conferência avisa; a exponencial da sugestão vale", () => {
    expect(failing(variant("neblina", ['new THREE.Fog("#f6a26b", 25, 70)', 'new THREE.Fog("#ffffff", 25, 70)']))).toEqual([
      "A neblina tem a cor do céu (a neblina é #ffffff, e o céu, #f6a26b: o que está longe vira uma mancha de outra cor)",
    ]);
    expect(failing(variant("neblina", ['new THREE.Fog("#f6a26b", 25, 70)', 'new THREE.Fog("#f6a26b", 0, 70)']))).toEqual([
      "A frente da cidade fica nítida, e o fundo quase some (o prédio mais perto já fica 27% coberto pela neblina: ela começa perto demais da câmera)",
    ]);
    expect(failing(variant("neblina", ['new THREE.Fog("#f6a26b", 25, 70)', 'new THREE.Fog("#f6a26b", 25, 150)']))).toEqual([
      "A frente da cidade fica nítida, e o fundo quase some (o prédio mais longe fica só 21% coberto: a neblina quase não aparece)",
      "A borda do chão some na neblina (a borda do chão fica a 100 da câmera, e só 65% coberta pela neblina)",
    ]);
    expect(failing(variant("neblina", ['new THREE.Fog("#f6a26b", 25, 70)', 'new THREE.Fog("#f6a26b", 25, 40)']))).toEqual([]);
    expect(failing(variant("neblina", ['cena.fog = new THREE.Fog("#f6a26b", 25, 70);', 'cena.fog = new THREE.FogExp2("#f6a26b", 0.02);']))).toEqual([]);
  });
});

describe("conferências da montanha-russa", () => {
  const montanha = projectById("montanha-russa");
  const variant = variantOf(montanha);
  const stepOf = (id) => montanha.steps[stepIndex(montanha, id)];
  /** Troca o ponto de animar() (os laços dos trilhos e dos dormentes têm a mesma linha). */
  const inAnimar = (to) => ["% 1;\n  const ponto = curva.getPointAt(u);", `% 1;\n  const ponto = curva.${to}(u);`];

  it("o céu escuro, a neblina de outra cor, perto ou longe demais, o chão pequeno ou de costas, a câmera perto ou baixa e o sol baixo ou apagado, a conferência avisa", () => {
    expect(failing(variant("palco", ['cena.background = new THREE.Color("#9fd8ff");', 'cena.background = new THREE.Color("#1b2a4a");']))).toEqual([
      "O céu é azul-claro (o fundo é #1b2a4a, escuro demais para um dia de sol)",
      "A neblina tem a cor do céu e apaga a borda do chão (a neblina é #9fd8ff, e o céu é #1b2a4a)",
    ]);
    expect(failing(variant("palco", ['new THREE.Fog("#9fd8ff", 50, 150)', 'new THREE.Fog("#ffffff", 50, 150)']))).toEqual(["A neblina tem a cor do céu e apaga a borda do chão (a neblina é #ffffff, e o céu é #9fd8ff)"]);
    expect(failing(variant("palco", ['new THREE.Fog("#9fd8ff", 50, 150)', 'new THREE.Fog("#9fd8ff", 10, 150)']))).toEqual(["A neblina tem a cor do céu e apaga a borda do chão (a neblina já cobre 16% do meio do parque)"]);
    expect(failing(variant("palco", ['new THREE.Fog("#9fd8ff", 50, 150)', 'new THREE.Fog("#9fd8ff", 50, 400)']))).toEqual([
      "A neblina tem a cor do céu e apaga a borda do chão (a neblina cobre só 55% da borda do chão: ela aparece contra o céu)",
    ]);
    expect(failing(variant("palco", ["new THREE.PlaneGeometry(400, 400)", "new THREE.PlaneGeometry(100, 100)"]))).toEqual([
      "O chão é uma placa de grama grande e deitada (o chão tem 100 de lado: a borda dele aparece perto do trilho)",
    ]);
    expect(failing(variant("palco", ["chao.rotation.x = -Math.PI / 2;", "chao.rotation.x = Math.PI / 2;"]))).toEqual([
      "O chão é uma placa de grama grande e deitada (o chão está virado para baixo: de cima, a câmera vê o verso, que não é desenhado)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(34, 18, 26);", "camera.position.set(14, 8, 10);"]))).toEqual([
      "A câmera vê o parque do alto, de um canto (a câmera está a 17,66 do meio do parque: perto demais para ver o trilho inteiro)",
    ]);
    expect(failing(variant("palco", ["camera.position.set(34, 18, 26);", "camera.position.set(40, 5, 30);"]))).toEqual([
      "A câmera vê o parque do alto, de um canto (a câmera está na altura 5,00: baixa demais para ver o trilho de cima)",
    ]);
    expect(failing(variant("palco", ["sol.position.set(15, 30, 20);", "sol.position.set(30, 8, 20);"]))).toEqual([
      "O parque tem a luz do céu e um sol alto (o sol está 13° acima do horizonte: baixo demais para um dia de sol)",
    ]);
    expect(failing(variant("palco", ['new THREE.DirectionalLight("#fff2d6", 2.2)', 'new THREE.DirectionalLight("#fff2d6", 0)']))).toEqual([
      "O parque tem a luz do céu e um sol alto (o sol está apagado: a intensidade dele é 0)",
    ]);
    // a sugestão do chão de areia: o mesmo parque
    expect(failing(variant("palco", ['color: "#7cbf5a"', 'color: "#e0c98f"']))).toEqual([]);
  });

  it("um ponto rente ao chão e uma geometria por bolinha, a conferência avisa; o morro mais alto ou mais longe ainda vale", () => {
    expect(failing(variant("pontos", ["new THREE.Vector3(3, 1.5, -14.5)", "new THREE.Vector3(3, 0.5, -14.5)"]))).toEqual([
      "Os pontos ficam acima do chão, a mais de 1 dele (o ponto (3,00; 0,50; −14,50) fica a menos de 1 do chão: não sobra lugar para o carrinho)",
    ]);
    expect(failing(variant("pontos", ["new THREE.Mesh(geometriaMarca, materialMarca)", "new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8), materialMarca)"]))).toEqual([
      "As bolinhas dividem uma geometria (13 geometrias diferentes: uma por volta do laço)",
    ]);
    expect(failing(variant("pontos", ["new THREE.Vector3(8.5, 12, -5)", "new THREE.Vector3(8.5, 16, -5)"]))).toEqual([]);
    expect(failing(variant("pontos", ["new THREE.Vector3(-9, 6, 3)", "new THREE.Vector3(-15, 6, 3)"]))).toEqual([]);
  });

  it("a curva aberta ou a linha com poucos traços, a conferência avisa; o morro esticado continua suave", () => {
    expect(failing(variant("curva", ["new THREE.CatmullRomCurve3(pontos, true)", "new THREE.CatmullRomCurve3(pontos, false)"]))).toEqual([
      "A linha fecha a volta (a linha começa em (8,50; 12,00; −5,00) e termina em (9,00; 7,50; 0,00): falta o true que fecha a curva)",
    ]);
    expect(failing(variant("curva", ["curva.getPoints(300)", "curva.getPoints(13)"]))).toEqual(["A linha é suave, sem quinas (a linha faz uma quina de 79° em (−9,50; 2,00; −3,00))"]);
    expect(failing(variant("curva", ["new THREE.Vector3(-9, 6, 3)", "new THREE.Vector3(-15, 6, 3)"]))).toEqual([]);
  });

  it("a viga aberta, grossa, com poucos pedaços ou poucos lados, a conferência avisa", () => {
    expect(failing(variant("viga", ["new THREE.CatmullRomCurve3(pontos, true)", "new THREE.CatmullRomCurve3(pontos)"]))).toEqual([
      "A viga é um tubo pela curva, e fecha a volta (a curva da viga não fecha: falta o true no fim da CatmullRomCurve3)",
    ]);
    expect(failing(variant("viga", ["TubeGeometry(curva, 800, 0.2, 12, true)", "TubeGeometry(curva, 800, 0.2, 12, false)"]))).toEqual([
      "A viga é um tubo pela curva, e fecha a volta (o tubo da viga não fecha: falta o true no fim da TubeGeometry)",
    ]);
    expect(failing(variant("viga", ["TubeGeometry(curva, 800, 0.2, 12, true)", "TubeGeometry(curva, 800, 1, 12, true)"]))).toEqual([
      "O tubo é fino: o raio fica entre 0,1 e 0,4 (o raio é 1,00: grosso demais para a viga de uma montanha-russa)",
    ]);
    expect(failing(variant("viga", ["TubeGeometry(curva, 800, 0.2, 12, true)", "TubeGeometry(curva, 40, 0.2, 12, true)"]))).toEqual([
      "O tubo é liso, sem quinas nem faces planas (com 40 pedaços para 97 de trilho, cada um tem 2,43: as curvas ficam com quinas)",
    ]);
    expect(failing(variant("viga", ["TubeGeometry(curva, 800, 0.2, 12, true)", "TubeGeometry(curva, 800, 0.2, 3, true)"]))).toEqual([
      "O tubo é liso, sem quinas nem faces planas (com 3 lados, a viga fica com faces planas)",
    ]);
  });

  it("os trilhos sem o normalize, longe da viga ou abertos, a conferência avisa; o produto na outra ordem só troca os lados", () => {
    expect(failing(variant("trilhos", [".normalize().multiplyScalar(0.55)", ".multiplyScalar(0.55)"]))).toEqual([
      "Há um trilho de cada lado da viga, a uns 0,55 dela (em (8,20; 10,97; −6,56), o trilho direito passa a 0,36 da viga)",
    ]);
    expect(failing(variant("trilhos", ["multiplyScalar(0.55)", "multiplyScalar(1.5)"]))).toEqual([
      "Há um trilho de cada lado da viga, a uns 0,55 dela (em (8,50; 12,00; −5,00), o trilho esquerdo passa a 1,50 da viga, longe demais)",
    ]);
    expect(failing(variant("trilhos", ["new THREE.CatmullRomCurve3(esquerda, true)", "new THREE.CatmullRomCurve3(esquerda)"]))).toEqual([
      "Os trilhos são tubos fechados, mais finos que a viga (a curva do trilho esquerdo não fecha: falta o true no fim da CatmullRomCurve3)",
    ]);
    expect(failing(variant("trilhos", ["crossVectors(frente, cima)", "crossVectors(cima, frente)"]))).toEqual([]);
  });

  it("os dormentes espaçados ou sem o lookAt, a conferência avisa", () => {
    expect(failing(variant("dormentes", ["i < 160", "i < 40"], ["i / 160", "i / 40"]))).toEqual(["Há dormentes pelo caminho todo, a menos de 1 um do outro (há 40 dormentes: poucos para 97 de trilho)"]);
    expect(failing(variant("dormentes", ["  dormente.lookAt(ponto.clone().add(curva.getTangentAt(u)));\n", ""]))).toEqual([
      "Cada dormente fica na viga, atravessado no trilho (o dormente em (8,39; 11,83; −5,57) fica 29° fora da direção do caminho: ele não atravessa o trilho)",
    ]);
  });

  it("sem o translate, os pilares afundam no chão; com o dobro de pilares, vale", () => {
    expect(failing(variant("pilares", ["geometriaPilar.translate(0, 0.5, 0);", ""]))).toEqual(["Cada pilar vai do chão até a viga (um pilar começa em y = −6,00, dentro do chão)"]);
    expect(failing(variant("pilares", ["i < 30", "i < 60"], ["i / 30", "i / 60"]))).toEqual([]);
  });

  it("sem castShadow, a caixa pequena, rasa ou enorme e o mapa com poucos pixels, a conferência avisa", () => {
    expect(failing(variant("sombras", ["viga.castShadow = true;\n", ""], ["  pilar.castShadow = true;\n", ""]))).toEqual([
      "A viga, os trilhos, os dormentes e os pilares fazem sombra (a viga e os pilares não fazem sombra)",
    ]);
    const box = (n) => [-1, 1, 1, -1].map((sign, k) => [`sol.shadow.camera.${["left", "right", "top", "bottom"][k]} = ${sign * 18};`, `sol.shadow.camera.${["left", "right", "top", "bottom"][k]} = ${sign * n};`]);
    expect(failing(variant("sombras", ...box(5)))).toEqual(["A caixa da sombra cobre a montanha-russa inteira (a caixa, de −5,0 a 5,0, deixa de fora 99% do trilho)"]);
    expect(failing(variant("sombras", ["sol.shadow.camera.far = 60;", "sol.shadow.camera.far = 30;"]))).toEqual([
      "A caixa da sombra cobre a montanha-russa inteira (o fundo da caixa fica a 30 do sol, e a sombra do trilho cai no chão a até 52)",
    ]);
    expect(failing(variant("sombras", ["sol.shadow.mapSize.set(2048, 2048);", "sol.shadow.mapSize.set(256, 256);"]))).toEqual([
      "Os pixels do mapa de sombra são pequenos para a sombra fina dos trilhos (com 256 × 256 numa caixa de 36 por 36, cada pixel do mapa cobre 0,14: a sombra dos trilhos, que têm 0,14 de largura, vira um borrão)",
    ]);
    expect(failing(variant("sombras", ...box(50)))).toEqual([
      "Os pixels do mapa de sombra são pequenos para a sombra fina dos trilhos (com 2048 × 2048 numa caixa de 100 por 100, cada pixel do mapa cobre 0,05: a sombra dos trilhos, que têm 0,14 de largura, vira um borrão)",
    ]);
    expect(failing(variant("sombras", ["sol.shadow.mapSize.set(2048, 2048);", "sol.shadow.mapSize.set(1024, 1024);"]))).toEqual([]);
  });

  it("o passeio espera a animação rodar: parada, ela pede o ▶; nos primeiros segundos, mede antes de dizer", () => {
    const step = stepOf("passeio");
    const marks = (facts) => grade(step, facts).results.map((r) => [r.ok, r.seen]);
    // parada desde o começo, o carrinho ainda está onde nasceu, na origem
    expect(marks(factsOf(step.code))).toEqual(Array(4).fill([null, "a animação está parada: aperte ▶ na barra de cima para o carrinho andar"]));
    expect(marks(factsOf(step.code, { seconds: 1 }))).toEqual([
      [true, null],
      [true, null],
      [true, null],
      [null, "medindo a velocidade"],
    ]);
    expect(grade(step, factsOf(step.code, { seconds: 1 })).ok).toBe(false);
  });

  it("o carrinho com getPoint, sem o translate ou parado, a conferência avisa; mais rápido, vale", () => {
    expect(failing(variant("passeio", inAnimar("getPoint")))).toEqual([
      "O carrinho aponta para a frente, ao longo da curva (o carrinho fica 35° fora da direção da curva)",
      "O carrinho anda sempre na mesma velocidade (a velocidade vai de 4,9 a 11,0 por segundo)",
    ]);
    expect(failing(variant("passeio", ["geometriaCarrinho.translate(0, 0.55, 0);\n", ""]))).toEqual([
      "O carrinho fica em cima da viga, com a base na curva (o fundo do carrinho fica 0,35 abaixo da origem dele: o carrinho atravessa a viga)",
    ]);
    expect(failing(variant("passeio", ["const velocidade = 8;", "const velocidade = 0;"]))).toEqual([
      "O carrinho anda pela curva (o carrinho não sai do lugar)",
      "O carrinho anda sempre na mesma velocidade (o carrinho não sai do lugar)",
    ]);
    expect(failing(variant("passeio", ["const velocidade = 8;", "const velocidade = 30;"]))).toEqual([]);
  });

  it("a velocidade sem a altura ou sem a energia, ou zero no topo, a conferência avisa; na Lua, vale", () => {
    expect(failing(variant("gravidade", ["(topo - ponto.y)", "(topo - 5)"]))).toEqual([
      "O carrinho ganha velocidade na descida e perde na subida (a velocidade não muda com a altura: fica em 11,9 por segundo)",
    ]);
    expect(failing(variant("gravidade", inAnimar("getPoint")))).toEqual([
      "O carrinho ganha velocidade na descida e perde na subida (a velocidade muda, mas não acompanha a altura: ela não vem da conta da energia)",
    ]);
    expect(failing(variant("gravidade", ["const velocidadeNoTopo = 2;", "const velocidadeNoTopo = 0;"]))).toEqual([
      "O carrinho anda pela curva (o carrinho não sai do lugar)",
      "O carrinho ganha velocidade na descida e perde na subida (o carrinho não sai do lugar)",
      "O carrinho dá a volta inteira, sem parar no alto (o carrinho não sai do lugar)",
    ]);
    expect(failing(variant("gravidade", ["const gravidade = 9.8;", "const gravidade = 1.6;"]))).toEqual([]);
  });

  it("com quadros de tempos diferentes, como num computador lento, a conta da energia ainda vale, e a velocidade fixa ainda não", () => {
    const step = stepOf("gravidade");
    // um quadro de 0,1 s a cada cinco: o carrinho anda o delta de um quadro, e o rastro mede no seguinte
    const slow = { seconds: MOTION_SECONDS, frames: [0.1, 1 / 30, 1 / 30, 1 / 30, 1 / 30] };
    expect(failing(grade(step, factsOf(step.code, slow)))).toEqual([]);
    const fixed = failing(grade(step, factsOf(step.code.replace("(topo - ponto.y)", "(topo - 5)"), slow)));
    expect(fixed).toHaveLength(1);
    expect(fixed[0]).toMatch(/^O carrinho ganha velocidade na descida e perde na subida \(a velocidade não muda com a altura: fica (em|entre) 1\d,\d/);
  });

  it("a câmera fora do carrinho, de costas, atrás, do lado, dentro dele ou alta demais, a conferência avisa; com outro campo de visão, vale", () => {
    expect(failing(variant("camera", ["carrinho.add(camera);\n", ""]))).toEqual(["A câmera vai no carrinho, como filha dele (a câmera não está no carrinho: falta carrinho.add(camera))"]);
    expect(failing(variant("camera", ["camera.rotation.y = Math.PI;", "camera.rotation.y = 0;"]))).toEqual(["A câmera olha para a frente do carrinho (a câmera olha para trás: falta a meia-volta em y)"]);
    const at = (position) => failing(variant("camera", ["camera.position.set(0, 1.2, 0.3);", `camera.position.set(${position});`]));
    expect(at("0, 2.2, -4")).toEqual(["A câmera fica em cima do carrinho, onde iria a cabeça (a câmera fica 4,00 atrás do meio do carrinho, fora dele)"]);
    expect(at("0.8, 1.2, 0.3")).toEqual(["A câmera fica em cima do carrinho, onde iria a cabeça (a câmera fica 0,80 para o lado do meio do carrinho, fora dele)"]);
    expect(at("0, 0.5, 0.3")).toEqual([
      "A câmera fica em cima do carrinho, onde iria a cabeça (a câmera está 0,50 acima da origem do carrinho, e a tampa dele, a 0,90: ela fica dentro da caixa)",
    ]);
    expect(at("0, 4, 0.3")).toEqual(["A câmera fica em cima do carrinho, onde iria a cabeça (a câmera está 4,00 acima do carrinho: alto demais para quem vai sentado nele)"]);
    expect(failing(variant("camera", ["new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300)", "new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 300)"]))).toEqual([]);
  });

  it("os andaimes saem no passo 4, e a câmera do alto, no 11", () => {
    expect(stepOf("curva").code).toContain("const linha = new THREE.Line(");
    expect(stepOf("viga").code).not.toMatch(/marca|linha/);
    expect(stepOf("gravidade").code).toContain("camera.position.set(34, 18, 26);");
    expect(stepOf("camera").code).not.toContain("camera.position.set(34, 18, 26);");
    expect(stepOf("camera").code).not.toContain("camera.lookAt");
  });

  it("o projeto baixado anda no carrinho: sem os controles do mouse", () => {
    const main = fileOf(stepOf("computador").files, "src/main.js").code;
    expect(main).not.toContain("OrbitControls");
    expect(main).toContain("// O código move a câmera: sem controles do mouse, que a tirariam do lugar a cada quadro");
    expect(main).toContain("  animar(tempo, delta);\n  renderizador.render(cena, camera);");
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
