import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { grade } from "../../src/live/challenges.js";
import { sampleIndices, sceneFacts, trailPoint } from "../../src/live/runtime/facts.js";
import { samplePixels, sampleSurface } from "../../src/live/runtime/shaders.js";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";
import { instrument } from "../../src/live/engine/instrument.js";
import { LEVELS, PROJECTS, behind, codeState, diffLines, findSnippet, guideStep, hunks, isComputer, liveSteps, projectById, startCode, stepIndex } from "../../src/live/projects/index.js";
import { animatedKeys, armsOf } from "../../src/live/projects/checks.js";
import { exportProject } from "../../src/live/export.js";
import { BACKGROUND, draw, stars } from "./gpu.js";

// Roda o código instrumentado com o Three.js de verdade, como o visor roda, e monta os fatos como
// o app monta para um projeto: cada `new` do código guarda os objetos que criou (num laço, vários),
// os objetos vão pelo nome da variável (a local, se foram criados num laço), com o fundo e o que
// animar() muda, pela análise do código. Sem cena no código, o visor usa uma vazia (e avisa na
// barra de status). Com `seconds`, a animação roda esse tempo em quadros de 1/60 s (ou com os
// tempos de `frames`, um depois do outro, de novo e de novo), e o rastro de cada objeto é anotado
// como o visor anota: a cada 1/30 s, os últimos 20 s. Com `surface`, os fatos de um shader trazem
// a superfície que o shader de vértices desenhou, como o visor manda quando o projeto pede. O
// código vê uma tela com `pixelRatio` pixels da imagem em cada pixel (o window.devicePixelRatio).
function factsOf(code, { seconds = 0, frames = [1 / 60], surface = false, pixelRatio = 1 } = {}) {
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
  const screen = !("window" in globalThis);
  if (screen) globalThis.window = { devicePixelRatio: pixelRatio };
  try {
    (0, eval)(instrument(analysis).script);
  } finally {
    delete globalThis.__vg;
    if (screen) delete globalThis.window;
  }
  if (error) throw error;
  const first = (obj) => (obj ? registry.get(obj.id)?.[0] : undefined);
  const scene = first(analysis.scene) ?? new THREE.Scene();
  const trails = new Map();
  let recorded = 0;
  let tempo = 0;
  if (animar && seconds > 0) {
    let last = -Infinity;
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
        if (!trails.has(id)) trails.set(id, []);
        const trail = trails.get(id);
        trail.push([tempo, ...trailPoint(obj)]);
        if (trail.length > 600) trail.shift();
      }
    }
    const any = trails.values().next().value;
    recorded = any ? any.at(-1)[0] - any[0][0] : 0;
  }
  const camera = first(analysis.camera);
  const facts = sceneFacts({ scene, camera, entries: [...registry], idOf: (obj) => ids.get(obj), trails });
  if (camera) shaderFacts({ scene, camera, registry, objects: facts.objects, surface });
  const nameOf = (id) => analysis.objects[id]?.name ?? analysis.objects[id]?.local ?? null;
  const objects = Object.create(null);
  for (const [id, f] of Object.entries(facts.objects)) {
    const name = nameOf(id);
    if (name && !objects[name]) objects[name] = f;
  }
  return {
    ...facts,
    objects,
    nameOf,
    animated: animatedKeys(analysis),
    hasAnimar: !!analysis.animar,
    playing: !!animar && seconds > 0,
    recorded,
    elapsed: tempo,
    pixelRatio: Math.min(pixelRatio, 2),
  };
}

/** A largura da imagem que o visor desenha para medir os pixels dos shaders (SAMPLE_WIDTH, em viewport.js). */
const SAMPLE_WIDTH = 256;
/** A proporção do visor com a aba Projetos aberta numa tela de 1440 × 900, que a câmera do código assume no app. */
const VISOR_ASPECT = 580 / 824;

/**
 * Os fatos `shader` de cada malha e de cada nuvem de pontos com ShaderMaterial, como o visor monta
 * (shaderFacts, em src/live/runtime/viewport.js), com a placa de vídeo de mentira de gpu.js no
 * lugar da de verdade.
 */
function shaderFacts({ scene, camera, registry, objects, surface }) {
  const shaded = (obj) => [].concat(obj.material)[0]?.isShaderMaterial;
  const meshes = [...registry].filter(([id, [obj]]) => obj?.isMesh && !obj.isInstancedMesh && shaded(obj) && objects[id]);
  const clouds = [...registry].filter(([id, [obj]]) => obj?.isPoints && shaded(obj) && objects[id]);
  if (!meshes.length && !clouds.length) return;
  // como no visor, que acerta a proporção da câmera do código com a dele a cada quadro
  const aspect = camera.aspect;
  if (camera.isPerspectiveCamera) {
    camera.aspect = VISOR_ASPECT;
    camera.updateProjectionMatrix();
  }
  const width = SAMPLE_WIDTH;
  const height = Math.min(512, Math.max(32, Math.round(width / (camera.aspect || 1))));
  const eye = camera.getWorldPosition(new THREE.Vector3()).toArray();
  if (meshes.length) {
    const gpu = draw({ scene, camera, width, height });
    for (const [id, [mesh]] of meshes) {
      const error = gpu.errorOf(mesh);
      objects[id].shader = { error, eye, size: [width, height], background: BACKGROUND, ...(surface ? {} : samplePixels({ scene, camera, mesh, width, height, read: gpu.read })) };
      if (surface && !error) objects[id].shader.surface = sampleSurface({ camera, mesh, width, height, read: gpu.read, depth: gpu.depthOf(mesh) });
    }
  }
  for (const [id, [points]] of clouds) {
    const measured = stars({ points, camera, index: sampleIndices(points.geometry.getAttribute("position")?.count ?? 0) });
    objects[id].shader = { error: measured.error ?? null, eye, stars: measured.error ? null : measured };
  }
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}

/** Os segundos de animação antes de conferir um passo que mede o movimento (`motion`), como o carrinho da montanha-russa. */
const MOTION_SECONDS = 20;
/** O projeto de cada passo. */
const PROJECT_OF = new Map(PROJECTS.flatMap((p) => p.steps.map((s) => [s, p])));

/**
 * Os fatos do código para as conferências do passo, como o app pede: com a animação rodando, se o
 * passo mede o movimento, e com a superfície dos shaders, se o projeto pede (`surface`).
 */
const factsFor = (step, code) => factsOf(code, { seconds: step.motion ? MOTION_SECONDS : 0, surface: !!PROJECT_OF.get(step)?.surface });

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
    expect(LEVELS.flatMap((l) => l.soon)).toHaveLength(0);
    const soon = LEVELS.flatMap((l) => l.soon.map((s) => s.title));
    for (const p of PROJECTS) expect(soon, `${p.title} já existe`).not.toContain(p.title);
  });

  it("os fáceis vêm primeiro: Sistema solar, Vitrine de materiais e Cidade ao entardecer, com 8 passos no VisuGraph e 1 no computador; o Gerador de galáxias tem 10 e 2, a Montanha-russa e a Floresta, 11 e 1, o Phong escrito à mão e o Mar com ondas na GPU, 12 e 1, e a Galáxia viva, 11 e 1", () => {
    expect(PROJECTS.map((p) => [p.id, liveSteps(p).length, p.steps.filter(isComputer).length])).toEqual([
      ["sistema-solar", 8, 1],
      ["vitrine", 8, 1],
      ["cidade", 8, 1],
      ["galaxia", 10, 2],
      ["montanha-russa", 11, 1],
      ["floresta", 11, 1],
      ["phong", 12, 1],
      ["mar", 12, 1],
      ["galaxia-viva", 11, 1],
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

describe("conferências da floresta", () => {
  const floresta = projectById("floresta");
  const variant = variantOf(floresta);
  const stepOf = (id) => floresta.steps[stepIndex(floresta, id)];
  /** O passo do vento com trocas, conferido depois de 4 s de animação (o bastante para medir, e mais rápido que os 20 s). */
  const wind = (...swaps) => {
    let code = stepOf("vento").code;
    for (const [from, to] of swaps) {
      expect(code, from).toContain(from);
      code = code.replace(from, to);
    }
    return grade(stepOf("vento"), factsOf(code, { seconds: 4 }));
  };

  it("o céu escuro, a neblina longe ou perto demais, o terreno de costas, em pé, deitado pela malha, com poucos pedaços ou pequeno, a câmera baixa, olhando para o céu ou para fora e o sol baixo, a conferência avisa; o wireframe vale", () => {
    expect(failing(variant("palco", ['cena.background = new THREE.Color("#a9cfe8");', 'cena.background = new THREE.Color("#1b2a4a");']))).toEqual([
      "O céu é azul-claro (o fundo é #1b2a4a, escuro demais para um dia de sol)",
      "A neblina tem a cor do céu e apaga o fundo do terreno (a neblina é #a9cfe8, e o céu é #1b2a4a)",
    ]);
    expect(failing(variant("palco", ['new THREE.Fog("#a9cfe8", 60, 190)', 'new THREE.Fog("#a9cfe8", 60, 400)']))).toEqual([
      "A neblina tem a cor do céu e apaga o fundo do terreno (a neblina cobre só 36% da borda do fundo do terreno: ela aparece contra o céu)",
    ]);
    expect(failing(variant("palco", ['new THREE.Fog("#a9cfe8", 60, 190)', 'new THREE.Fog("#a9cfe8", 20, 190)']))).toEqual([
      "A neblina tem a cor do céu e apaga o fundo do terreno (a neblina já cobre 32% do meio da floresta)",
    ]);
    expect(failing(variant("palco", ["geometriaTerreno.rotateX(-Math.PI / 2);", "geometriaTerreno.rotateX(Math.PI / 2);"]))).toEqual([
      "O terreno é uma placa deitada, grande e com muitos pedaços (o terreno está de costas: de cima, a câmera vê o verso, que não é desenhado. O giro do rotateX é −Math.PI / 2)",
    ]);
    const standing = "o terreno está em pé: falta deitar a placa, com geometriaTerreno.rotateX(-Math.PI / 2)";
    expect(failing(variant("palco", ["geometriaTerreno.rotateX(-Math.PI / 2);\n", ""]))).toEqual([
      `A neblina tem a cor do céu e apaga o fundo do terreno (${standing})`,
      `O terreno é uma placa deitada, grande e com muitos pedaços (${standing})`,
      `A câmera vê o terreno do alto, da beira (${standing})`,
    ]);
    // a montanha-russa deitou o chão pela malha: aqui, o y dos vértices tem de ser a altura
    expect(failing(variant("palco", ["geometriaTerreno.rotateX(-Math.PI / 2);\n", ""], ["cena.add(terreno);", "terreno.rotation.x = -Math.PI / 2;\ncena.add(terreno);"]))).toEqual([
      "O terreno é uma placa deitada, grande e com muitos pedaços (a placa foi deitada com terreno.rotation, que gira a malha: gire a geometria, com geometriaTerreno.rotateX, para o y dos vértices ser a altura deles no próximo passo)",
    ]);
    expect(failing(variant("palco", ["PlaneGeometry(200, 200, 160, 160)", "PlaneGeometry(200, 200, 10, 10)"]))).toEqual([
      "O terreno é uma placa deitada, grande e com muitos pedaços (a placa tem 10 × 10 pedaços: poucos vértices para os morros do próximo passo)",
    ]);
    expect(failing(variant("palco", ["PlaneGeometry(200, 200, 160, 160)", "PlaneGeometry(100, 100, 160, 160)"]))).toEqual([
      "A neblina tem a cor do céu e apaga o fundo do terreno (a neblina cobre só 78% da borda do fundo do terreno: ela aparece contra o céu)",
      "O terreno é uma placa deitada, grande e com muitos pedaços (o terreno tem 100 de lado: pequeno para dez mil árvores)",
    ]);
    expect(failing(variant("palco", ["PlaneGeometry(200, 200, 160, 160)", "PlaneGeometry(200, 200, 300, 300)"]))[1]).toBe(
      "O terreno é uma placa deitada, grande e com muitos pedaços (o terreno tem 90.601 vértices, e a conferência mede até 70 mil, uns 260 × 260 pedaços)",
    );
    expect(failing(variant("palco", ["camera.position.set(0, 28, 100);", "camera.position.set(0, 5, 100);"]))).toEqual([
      "A câmera vê o terreno do alto, da beira (a câmera está na altura 5,00: baixa demais para ver a floresta por cima das árvores)",
    ]);
    expect(failing(variant("palco", ["camera.lookAt(0, 0, 20);", "camera.lookAt(0, 30, 20);"]))).toEqual(["A câmera vê o terreno do alto, da beira (a câmera olha para o céu: o terreno fica fora da vista)"]);
    expect(failing(variant("palco", ["camera.lookAt(0, 0, 20);", "camera.lookAt(200, 0, 20);"]))).toEqual([
      "A neblina tem a cor do céu e apaga o fundo do terreno (a neblina já cobre 100% do meio da floresta)",
      "A câmera vê o terreno do alto, da beira (a câmera olha para o ponto (200,0; 20,0), fora do terreno)",
    ]);
    expect(failing(variant("palco", ["sol.position.set(-40, 50, 30);", "sol.position.set(-40, 10, 30);"]))).toEqual([
      "Há a luz do céu e um sol alto (o sol está 11° acima do horizonte: baixo demais para um dia de sol)",
    ]);
    expect(failing(variant("palco", ['color: "#7a9a50" }', 'color: "#7a9a50", wireframe: true }']))).toEqual([]);
  });

  it("o chão sorteado vértice por vértice ou baixo demais, a conferência avisa; as montanhas valem", () => {
    expect(failing(variant("morros", ["return grande + media + pequena;", "return Math.random() * 2;"]))).toEqual([
      "O terreno tem morros e vales (o terreno vai da altura 0,00 a 2,00: quase plano)",
      expect.stringMatching(/^O chão sobe e desce aos poucos \(perto do ponto \(.+\), o chão sobe \d,\d\d de um vértice para o vizinho, a 1,25 dele: um degrau de \d\d°, e não um morro\)$/),
    ]);
    expect(failing(variant("morros", ["const grande = 3 *", "const grande = 0.3 *"], ["const media = 1.5 *", "const media = 0.15 *"], ["const pequena = 0.6 *", "const pequena = 0.06 *"]))).toEqual([
      "O terreno tem morros e vales (o terreno vai da altura −0,51 a 0,45: quase plano)",
    ]);
    expect(failing(variant("morros", ["const grande = 3 *", "const grande = 8 *"]))).toEqual([]);
  });

  it("as normais calculadas antes do laço ou o material sem luz, a conferência avisa; o flatShading e o sol do outro lado valem", () => {
    const normals = "geometriaTerreno.computeVertexNormals(); // as normais seguem os morros, para a luz\n";
    expect(failing(variant("normais", [normals, ""], ["const posicoes", "geometriaTerreno.computeVertexNormals();\nconst posicoes"]))).toEqual([
      "As normais seguem a inclinação dos morros (as normais apontam todas para cima, como na placa plana: a luz não vê os morros. Falta geometriaTerreno.computeVertexNormals(), depois do laço das alturas)",
    ]);
    expect(failing(variant("normais", ['new THREE.MeshStandardMaterial({ color: "#7a9a50" })', 'new THREE.MeshBasicMaterial({ color: "#7a9a50" })']))).toEqual([
      "As normais seguem a inclinação dos morros (o terreno é MeshBasicMaterial, que ignora a luz)",
    ]);
    expect(failing(variant("normais", [normals, ""], ['color: "#7a9a50" }', 'color: "#7a9a50", flatShading: true }']))).toEqual([]);
    expect(failing(variant("normais", ["sol.position.set(-40, 50, 30);", "sol.position.set(40, 50, 30);"]))).toEqual([]);
  });

  it("sem os translates, a árvore afunda; fora do chão, de lado, longe ou fora da vista, a conferência avisa; a câmera de perto vale", () => {
    expect(failing(variant("arvore", ["geometriaTronco.translate(0, 0.5, 0);\n", ""]))).toEqual([
      "O tronco é um cilindro em pé, com a base no chão (metade do tronco está enterrada: o cilindro tem o centro na origem, e falta o translate da geometriaTronco)",
      "A copa é um cone, em cima do tronco (há uma fresta de 0,30 entre o alto do tronco e a copa)",
    ]);
    expect(failing(variant("arvore", ["geometriaCopa.translate(0, 2, 0);\n", ""]))).toEqual([
      "A copa é um cone, em cima do tronco (a copa começa 1,20 abaixo do pé do tronco, dentro do chão: falta o translate da geometriaCopa, que a sobe)",
    ]);
    expect(failing(variant("arvore", ["tronco.position.set(0, altura(0, 60), 60);", "tronco.position.set(0, 0, 60);"]))).toEqual([
      "O tronco é um cilindro em pé, com a base no chão (o tronco está 1,68 acima do chão: o y dele tem de ser a altura do chão ali, altura(x, z))",
    ]);
    expect(failing(variant("arvore", ["copa.position.copy(tronco.position);", "copa.position.set(0, altura(0, 60), 61);"]))).toEqual([
      "A copa é um cone, em cima do tronco (a copa está 1,00 para o lado do tronco: as duas peças têm de ficar no mesmo lugar)",
    ]);
    expect(failing(variant("arvore", ["tronco.position.set(0, altura(0, 60), 60);", "tronco.position.set(0, altura(0, -80), -80);"]))).toEqual([
      "A árvore aparece na câmera (a neblina cobre 98% da árvore: ela está longe demais)",
    ]);
    expect(failing(variant("arvore", ["tronco.position.set(0, altura(0, 60), 60);", "tronco.position.set(80, altura(80, 60), 60);"]))).toEqual(["A árvore aparece na câmera (a árvore fica fora da vista da câmera)"]);
    // a sugestão de ver a árvore de perto
    expect(failing(variant("arvore", ["camera.position.set(0, 28, 100);", "camera.position.set(3, 1, 66);"], ["camera.lookAt(0, 0, 20);", "camera.lookAt(0, 0, 60);"]))).toEqual([]);
  });

  it("o sorteio parado, num canto ou fora do chão, e uma geometria por árvore, a conferência avisa; outra semente e mil árvores valem", () => {
    expect(failing(variant("cem", ["  semente = (semente * 16807) % 2147483647;\n", ""]))).toEqual([
      "As árvores se espalham pelo terreno (100 árvores estão no mesmo ponto, (−100,0; −100,0): cada árvore precisa de um ponto sorteado só dela)",
    ]);
    expect(failing(variant("cem", ["const x = (sorteio() - 0.5) * 200;", "const x = sorteio() * 100;"], ["const z = (sorteio() - 0.5) * 200;", "const z = sorteio() * 100;"]))).toEqual([
      "As árvores se espalham pelo terreno (as árvores ocupam só 50% do terreno em x e 50% em z)",
    ]);
    expect(failing(variant("cem", ["tronco.position.set(x, altura(x, z), z);", "tronco.position.set(x, 0, z);"]))).toEqual([
      "As árvores estão em pé no chão (97 árvores estão fora do chão: a do ponto (37,5; −52,4) fica 4,33 acima dele)",
    ]);
    expect(failing(variant("cem", ["copa.position.copy(tronco.position);", "copa.position.set(x, 0, z);"]))).toEqual([
      "Há pelo menos cem árvores, cada uma com tronco e copa (a copa da árvore 1 está a 1,98 do tronco dela)",
    ]);
    expect(failing(variant("cem", ["new THREE.Mesh(geometriaTronco, materialTronco);", "new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6).translate(0, 0.5, 0), materialTronco);"]))).toEqual([
      "Os troncos dividem uma geometria, e as copas, outra (100 geometrias de tronco diferentes: uma por volta do laço)",
    ]);
    expect(failing(variant("cem", ["let semente = 7;", "let semente = 8;"]))).toEqual([]);
    expect(failing(variant("cem", ["i < 100", "i < 1000"]))).toEqual([]);
  });

  it("as copas sem setMatrixAt, as matrizes sem updateMatrix, as árvores fora do chão ou poucas cópias, a conferência avisa; com 50 mil, vale", () => {
    expect(failing(variant("instancias", ["  copas.setMatrixAt(i, molde.matrix);", "  // copas.setMatrixAt(i, molde.matrix);"]))).toEqual([
      "Cada copa fica em cima do seu tronco (10.000 copas estão na origem, com a matriz de quando a malha foi criada: falta copas.setMatrixAt)",
    ]);
    expect(failing(variant("instancias", ["  molde.updateMatrix();\n", ""]))).toEqual([
      "As árvores se espalham pelo terreno inteiro (10.000 árvores estão no mesmo ponto, (0,0; 0,0), a origem: a matriz de quando a malha foi criada)",
    ]);
    expect(failing(variant("instancias", ["molde.position.set(x, altura(x, z), z);", "molde.position.set(x, 0, z);"]))).toEqual([
      "As árvores estão em pé no chão (9.479 árvores estão fora do chão: a do ponto (39,9; −59,5) fica 5,03 acima dele)",
    ]);
    expect(failing(variant("instancias", ["const quantas = 10000;", "const quantas = 1000;"]))).toEqual([
      "Os troncos e as copas são duas InstancedMesh, com 10 mil cópias cada (os troncos têm 1.000 cópias: poucas para dez mil árvores)",
    ]);
    expect(failing(variant("instancias", ["new THREE.InstancedMesh(geometriaTronco,", "new THREE.InstancedMesh(geometriaCopa,"]))).toEqual([
      "Os troncos e as copas são duas InstancedMesh, com 10 mil cópias cada (a malha dos troncos usa a ConeGeometry, e não a geometria do tronco)",
    ]);
    // 50 mil cópias: os fatos mandam 20 mil posições, espalhadas
    expect(failing(variant("instancias", ["const quantas = 10000;", "const quantas = 50000;"]))).toEqual([]);
  });

  it("o sorteio solto faz clareiras, e sem o n++ as árvores se empilham; a plantação em fileiras ainda tem uma por quadrado", () => {
    expect(failing(variant("grade", ["const x = -100 + (coluna + sorteio()) * passo;", "const x = (sorteio() - 0.5) * 200;"], ["const z = -100 + (linha + sorteio()) * passo;", "const z = (sorteio() - 0.5) * 200;"]))).toEqual([
      "Há uma árvore em cada quadrado de 2 × 2 (36% dos quadrados de 2 × 2 estão vazios, e 26% têm duas árvores ou mais: o sorteio solto faz clareiras e bolos)",
    ]);
    expect(failing(variant("grade", ["    n++;\n", ""]))).toEqual([
      "Há uma árvore em cada quadrado de 2 × 2 (9.999 árvores estão no mesmo ponto, (0,0; 0,0), a origem: a matriz de quando a malha foi criada)",
    ]);
    expect(failing(variant("grade", ["const x = -100 + (coluna + sorteio()) * passo;", "const x = -100 + (coluna + 0.5) * passo;"], ["const z = -100 + (linha + sorteio()) * passo;", "const z = -100 + (linha + 0.5) * passo;"]))).toEqual([]);
    expect(failing(variant("grade", ["const lado = 100;", "const lado = 60;"]))).toEqual([]);
  });

  it("a proporção fixa, as árvores achatadas ou todas da mesma altura ou largura, a conferência avisa; as mais altas valem", () => {
    expect(failing(variant("tamanhos", ["molde.scale.set(largura, alto, largura);", "molde.scale.set(largura, largura, largura);"]))).toEqual([
      "As larguras também mudam, e a proporção muda de uma árvore para outra (a altura cresce junto com a largura: as árvores são cópias ampliadas umas das outras. Sorteie as duas separadas)",
    ]);
    expect(failing(variant("tamanhos", ["molde.scale.set(largura, alto, largura);", "molde.scale.set(largura, alto, 1);"]))).toEqual([
      "Vistas de cima, as árvores continuam redondas (há árvores achatadas: a escala em x e em z tem de ser a mesma, a largura)",
    ]);
    expect(failing(variant("tamanhos", ["const alto = 0.7 + sorteio() * 0.8;", "const alto = 1;"]))).toEqual(["As árvores têm alturas diferentes (as árvores têm todas a mesma altura: 3,20)"]);
    expect(failing(variant("tamanhos", ["const largura = 0.7 + sorteio() * 0.6;", "const largura = 1;"]))).toEqual([
      "As larguras também mudam, e a proporção muda de uma árvore para outra (as árvores têm quase todas a mesma largura)",
    ]);
    expect(failing(variant("tamanhos", ["const alto = 0.7 + sorteio() * 0.8;", "const alto = 0.7 + sorteio() * 2.5;"]))).toEqual([]);
  });

  it("as copas sem setColorAt, de outono, de uma cor só ou com o material verde, a conferência avisa", () => {
    expect(failing(variant("cores", ["    copas.setColorAt(n, cor);\n", ""]))).toEqual([
      "Cada copa tem a sua cor (as copas não têm cor por cópia: falta copas.setColorAt)",
      "As copas são verdes (as copas não têm cor por cópia: falta copas.setColorAt)",
    ]);
    expect(failing(variant("cores", ["cor.setHSL(0.25 + sorteio() * 0.1,", "cor.setHSL(0.03 + sorteio() * 0.1,"]))).toEqual(["As copas são verdes (as copas não são verdes: a maioria é laranja)"]);
    expect(failing(variant("cores", ["cor.setHSL(0.25 + sorteio() * 0.1, 0.5, 0.22 + sorteio() * 0.15);", "cor.setHSL(0.3, 0.5, 0.3);"]))).toEqual(["Cada copa tem a sua cor (as copas têm todas a mesma cor)"]);
    expect(failing(variant("cores", ['{ color: "#ffffff" }); // a cor de cada copa vem do setColorAt', '{ color: "#4f7a3a" });']))).toEqual([
      "O material das copas é branco (o material das copas é #4f7a3a: a cor de cada cópia multiplica a dele, e as copas saem escurecidas)",
    ]);
  });

  it("a água alta, abaixo dos vales, opaca, verde, de costas ou pequena, as árvores na água e as cópias que sobram, a conferência avisa", () => {
    expect(failing(variant("lagos", ["const nivelDaAgua = -2.4;", "const nivelDaAgua = 0;"]))).toEqual(["A água cobre só o fundo dos vales (a água cobre 50% do terreno: um mar, e não lagos)"]);
    expect(failing(variant("lagos", ["const nivelDaAgua = -2.4;", "const nivelDaAgua = -6;"]))).toEqual([
      "A água cobre só o fundo dos vales (a água, na altura −6,00, fica abaixo do vale mais fundo, que chega a −5,05: nenhum lago aparece)",
    ]);
    expect(failing(variant("lagos", ["transparent: true, opacity: 0.85, ", ""]))).toEqual([
      "A água é uma placa azul, deitada e um pouco transparente (a água não é transparente: falta transparent: true no material)",
    ]);
    expect(failing(variant("lagos", ['color: "#4f8fc0"', 'color: "#3f9f4f"']))).toEqual(["A água é uma placa azul, deitada e um pouco transparente (a água é #3f9f4f, que não é azul)"]);
    expect(failing(variant("lagos", ["agua.rotation.x = -Math.PI / 2;", "agua.rotation.x = Math.PI / 2;"]))).toEqual([
      "A água é uma placa azul, deitada e um pouco transparente (a água está de costas: de cima, a câmera vê o verso, que não é desenhado)",
    ]);
    expect(failing(variant("lagos", ["new THREE.PlaneGeometry(200, 200),", "new THREE.PlaneGeometry(50, 50),"]))).toEqual([
      "A água é uma placa azul, deitada e um pouco transparente (a água tem 50 de lado, e o terreno, 200: os vales fora dela ficam secos)",
    ]);
    expect(failing(variant("lagos", ["    if (y < nivelDaAgua + 0.3) continue; // na água ou na beira: sem árvore\n", ""]))).toEqual([
      "Nenhuma árvore fica dentro d'água (758 árvores estão dentro d'água: falta o continue que pula os pontos abaixo do nível da água)",
    ]);
    expect(failing(variant("lagos", ["troncos.count = n; // só as árvores plantadas são desenhadas\ncopas.count = n;\n", ""]))).toEqual([
      "Só as árvores plantadas são desenhadas (1.012 árvores estão todas no mesmo ponto, a origem: são as cópias que o laço pulou, com a matriz de quando a malha foi criada. Faltam troncos.count = n e copas.count = n)",
    ]);
    expect(failing(variant("lagos", ["copas.count = n;\n", ""]))).toEqual([
      "Só as árvores plantadas são desenhadas (a malha dos troncos desenha 8.988 cópias, e a das copas, 10.000: falta copas.count = n)",
    ]);
  });

  it("o vento espera a animação rodar: parada, ela pede o ▶; no primeiro segundo, espera as matrizes mudarem", () => {
    const step = stepOf("vento");
    const marks = (facts) => grade(step, facts).results.map((r) => [r.ok, r.seen]);
    expect(marks(factsOf(step.code))).toEqual(Array(4).fill([null, "a animação está parada: aperte ▶ na barra de cima para o vento soprar"]));
    expect(marks(factsOf(step.code, { seconds: 0.5 }))[0]).toEqual([null, "esperando o vento soprar"]);
    expect(failing(wind())).toEqual([]);
  });

  it("sem o needsUpdate, em bloco, forte ou fraco demais, parado no tempo, fora do lugar, sem a escala ou com uma peça parada, a conferência avisa; num computador lento, vale", () => {
    expect(failing(wind(["  troncos.instanceMatrix.needsUpdate = true;\n  copas.instanceMatrix.needsUpdate = true;\n", ""]))).toEqual([
      "As árvores balançam com o vento (as matrizes dos troncos mudam, mas a placa de vídeo não fica sabendo: falta troncos.instanceMatrix.needsUpdate = true)",
    ]);
    expect(failing(wind(["  copas.instanceMatrix.needsUpdate = true;\n", ""]))).toEqual([
      "As árvores balançam com o vento (as matrizes das copas mudam, mas a placa de vídeo não fica sabendo: falta copas.instanceMatrix.needsUpdate = true)",
    ]);
    expect(failing(wind([" - arvore.x * 0.1", ""]))).toEqual([
      "O vento passa como uma onda, e não em todas juntas (todas as árvores se inclinam juntas, como um bloco: o ângulo tem de depender também do lugar da árvore)",
    ]);
    expect(failing(wind(["* 0.06;", "* 0.3;"]))).toEqual(["As árvores se inclinam pouco, como num vento forte (as árvores se inclinam até 17°: é um vendaval)"]);
    expect(failing(wind(["Math.sin(tempo * 1.5 - arvore.x * 0.1)", "Math.sin(1.5 - arvore.x * 0.1)"]))).toEqual(
      step4("as árvores estão inclinadas, mas paradas: a inclinação não muda com o tempo"),
    );
    expect(failing(wind(["    molde.position.set(arvore.x, arvore.y, arvore.z);\n", ""]))).toEqual([
      "Cada árvore balança inteira, no lugar e do tamanho dela (as árvores saíram do lugar: 8.988 estão no mesmo ponto, (98,4; 100,0). Falta pôr o molde no lugar de cada árvore no animar)",
    ]);
    expect(failing(wind(["    molde.scale.set(arvore.largura, arvore.alto, arvore.largura);\n", ""]))).toEqual([
      "Cada árvore balança inteira, no lugar e do tamanho dela (as árvores ficaram todas do mesmo tamanho: falta molde.scale.set no animar)",
    ]);
    expect(failing(wind(["    troncos.setMatrixAt(i, molde.matrix);\n", ""]))).toEqual([
      "Cada árvore balança inteira, no lugar e do tamanho dela (as copas balançam, e os troncos ficam parados: falta troncos.setMatrixAt(i, molde.matrix) no animar)",
    ]);
    // um quadro de 0,1 s a cada cinco: as matrizes mudam a cada quadro, e o vento continua valendo
    const slow = { seconds: 4, frames: [0.1, 1 / 30, 1 / 30, 1 / 30, 1 / 30] };
    expect(failing(grade(stepOf("vento"), factsOf(stepOf("vento").code, slow)))).toEqual([]);
  });

  it("o projeto baixado leva os controles do mouse, que giram a câmera em volta do meio da floresta", () => {
    const main = fileOf(stepOf("computador").files, "src/main.js").code;
    expect(main).toContain('import { OrbitControls } from "three/addons/controls/OrbitControls.js";');
    expect(main).toContain("controles.target.set(0, 0, 20);");
    expect(main, "a floresta não tem sombras").not.toContain("shadowMap");
  });
});

/** As quatro conferências do vento, todas com o mesmo resultado. */
function step4(seen) {
  return [
    `As árvores balançam com o vento (${seen})`,
    `As árvores se inclinam pouco, como num vento forte (${seen})`,
    `O vento passa como uma onda, e não em todas juntas (${seen})`,
    `Cada árvore balança inteira, no lugar e do tamanho dela (${seen})`,
  ];
}

describe("conferências do Phong", () => {
  const phong = projectById("phong");
  const variant = variantOf(phong);
  const stepOf = (id) => phong.steps[stepIndex(phong, id)];
  const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura: falta passar a cor pela paraSRGB no gl_FragColor";
  const BROKEN = "o shader de fragmentos não compila: a barra embaixo do código diz o erro e a linha";

  it("o shader que não compila, a esfera fora do lugar, sumida ou de mais de uma cor, a conferência avisa; o verde vale", () => {
    expect(failing(variant("shader", ["gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);", "gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0)"]))).toEqual([
      `Ela aparece no lugar dela, do tamanho dela (${BROKEN})`,
      `O shader pinta a esfera inteira de uma cor só (${BROKEN})`,
    ]);
    const away = "a esfera aparece fora do lugar dela: confira o gl_Position do shader de vértices, que leva cada vértice pela câmera com as matrizes";
    expect(failing(variant("shader", ["projectionMatrix * modelViewMatrix * vec4(position, 1.0)", "vec4(position, 1.0)"]))).toEqual([
      `Ela aparece no lugar dela, do tamanho dela (${away})`,
      `O shader pinta a esfera inteira de uma cor só (${away})`,
    ]);
    const gone = "100% da esfera não aparece: o fundo continua onde ela está. Confira o gl_Position do shader de vértices";
    expect(failing(variant("shader", ["projectionMatrix * modelViewMatrix * vec4(position, 1.0)", "vec4(0.0)"]))).toEqual([
      `Ela aparece no lugar dela, do tamanho dela (${gone})`,
      `O shader pinta a esfera inteira de uma cor só (${gone})`,
    ]);
    expect(failing(variant("shader", ["vec4(1.0, 0.5, 0.2, 1.0)", "vec4(gl_FragCoord.x / 256.0, 0.5, 0.2, 1.0)"]))).toEqual([
      "O shader pinta a esfera inteira de uma cor só (a cor muda de um pixel para outro: neste passo, o gl_FragColor é uma cor só, a mesma em todo pixel)",
    ]);
    expect(failing(variant("shader", ["vec4(1.0, 0.5, 0.2, 1.0)", "vec4(0.2, 0.8, 0.4, 1.0)"]))).toEqual([]);
  });

  it("o laranja que ficou, o uniform sem declaração ou fora do material, a conferência avisa; outra cor vale", () => {
    expect(failing(variant("uniform", ["gl_FragColor = vec4(uCor, 1.0);", "gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);"]))).toEqual([
      "A esfera tem a cor do uCor (a esfera continua laranja: o gl_FragColor ainda não usa o uCor)",
    ]);
    expect(failing(variant("uniform", ["  uniform vec3 uCor;\n", ""]))).toEqual([`A esfera tem a cor do uCor (${BROKEN})`]);
    expect(failing(variant("uniform", ["    uCor: { value", "    cor: { value"]))).toEqual([
      "O material da esfera tem o uniform uCor, com uma cor (o material da esfera não tem o uniform uCor)",
      "A esfera tem a cor do uCor (o material da esfera não tem o uniform uCor)",
    ]);
    expect(failing(variant("uniform", ['new THREE.Color("#3f7fd9") },', 'new THREE.Color("#ff3366") },']))).toEqual([]);
  });

  it("a cor que não passa pela paraSRGB e a normal sem o meio ou no espaço da câmera, a conferência avisa; a curva de 2,2 e a normal em sRGB valem", () => {
    expect(failing(variant("srgb", ["vec4(paraSRGB(uCor), 1.0)", "vec4(uCor, 1.0)"]))).toEqual([
      "A esfera tem a cor do código, convertida para sRGB (a cor saiu do shader no espaço linear, mais escura: falta passar o uCor pela paraSRGB no gl_FragColor)",
    ]);
    expect(failing(variant("srgb", ["paraSRGB(uCor)", "pow(uCor, vec3(1.0 / 2.2))"]))).toEqual([]);
    expect(failing(variant("normal", ["vec4(n * 0.5 + 0.5, 1.0)", "vec4(n, 1.0)"]))).toEqual([
      "A esfera mostra a normal de cada ponto, em cores (faltou o * 0.5 + 0.5: os números da normal vão de −1 a 1, e os negativos viram preto)",
    ]);
    expect(failing(variant("normal", ["mat3(modelMatrix) * normal", "normalMatrix * normal"]))).toEqual([
      "A esfera mostra a normal de cada ponto, em cores (a normal está no espaço da câmera (é o que o normalMatrix faz), e as contas deste projeto são no mundo: use mat3(modelMatrix) * normal)",
    ]);
    expect(failing(variant("normal", ["vec4(n * 0.5 + 0.5, 1.0)", "vec4(paraSRGB(n * 0.5 + 0.5), 1.0)"]))).toEqual([]);
    expect(failing(variant("normal", ["  varying vec3 vNormal;\n\n  void main() {\n    vNormal = mat3(modelMatrix) * normal;\n", "\n  void main() {\n"]))).toEqual([
      "A esfera mostra a normal de cada ponto, em cores (os dois shaders compilam, mas não se encaixam: a barra embaixo do código diz o que falta)",
    ]);
  });

  it("o sol sem o normalize, do lado oposto ou em linear, a conferência avisa; o sol do outro lado vale", () => {
    expect(failing(variant("difusa", ["sol.position.clone().normalize()", "sol.position.clone()"]))).toEqual([
      "O uniform uDirecaoDoSol aponta para o sol, com comprimento 1 (uDirecaoDoSol tem comprimento 7,07: falta o normalize())",
    ]);
    expect(failing(variant("difusa", ["sol.position.clone().normalize()", "new THREE.Vector3(0, 1, 0)"]))).toEqual([
      "O uniform uDirecaoDoSol aponta para o sol, com comprimento 1 (uDirecaoDoSol aponta 56° longe do sol: ela vai do ponto para o sol, na direção de sol.position)",
    ]);
    expect(failing(variant("difusa", ["max(dot(n, uDirecaoDoSol), 0.0)", "max(dot(n, -uDirecaoDoSol), 0.0)"]))).toEqual([
      "A luz do sol cai na esfera pela lei de Lambert (a luz chega pelo lado oposto ao do sol: no dot, a direção é a do ponto para o sol, uDirecaoDoSol, sem o menos)",
    ]);
    expect(failing(variant("difusa", ["vec4(paraSRGB(cor), 1.0)", "vec4(cor, 1.0)"]))).toEqual([`A luz do sol cai na esfera pela lei de Lambert (${NO_SRGB})`]);
    expect(failing(variant("difusa", ["sol.position.set(3, 4, 5);", "sol.position.set(-3, 4, 5);"]))).toEqual([]);
  });

  it("a difusa sem o max, a luz ambiente fora da cor ou com outro número, a conferência avisa", () => {
    expect(failing(variant("ambiente", ["float difusa = max(dot(n, uDirecaoDoSol), 0.0);", "float difusa = dot(n, uDirecaoDoSol);"]))).toEqual([
      "A luz ambiente acende o lado escuro, como no gabarito (o lado escuro ficou mais escuro que a luz ambiente: falta o max(…, 0.0) na difusa, porque de costas para o sol o produto escalar é negativo e apaga o ambiente)",
    ]);
    expect(failing(variant("ambiente", ["uCor * (uAmbiente + difusa)", "uCor * difusa + uAmbiente"]))).toEqual([
      "A luz ambiente acende o lado escuro, como no gabarito (a luz ambiente precisa passar pela cor da esfera, como a do sol: uCor * (uAmbiente + difusa))",
    ]);
    expect(failing(variant("ambiente", ["uAmbiente: { value: 0.15 }", "uAmbiente: { value: 0.5 }"]))).toEqual([
      "O uniform uAmbiente tem a luz ambiente da cena, 0,15 (uAmbiente é 0,50, e a luz ambiente da cena vale 0,15: a intensidade dela dividida por π)",
    ]);
  });

  it("o reflexo ou a câmera do lado errado, o brilho da cor da esfera e o expoente zero, a conferência avisa; um expoente alto vale", () => {
    const wrongSign =
      "O brilho de Phong aparece onde o reflexo do sol aponta para a câmera (o brilho está no lugar errado: confira os sinais. O reflect recebe a direção em que a luz anda, do sol para o ponto, -uDirecaoDoSol, e o v vai do ponto para a câmera, cameraPosition - vPosicao)";
    expect(failing(variant("phong", ["reflect(-uDirecaoDoSol, n)", "reflect(uDirecaoDoSol, n)"]))).toEqual([wrongSign]);
    expect(failing(variant("phong", ["normalize(cameraPosition - vPosicao)", "normalize(vPosicao - cameraPosition)"]))).toEqual([wrongSign]);
    expect(failing(variant("phong", ["uCor * (uAmbiente + difusa) + uCorEspecular * brilho", "uCor * (uAmbiente + difusa + brilho)"]))).toEqual([
      "O brilho de Phong aparece onde o reflexo do sol aponta para a câmera (o brilho ficou da cor da esfera: ele tem a cor da luz, uCorEspecular * brilho, fora da conta com o uCor)",
    ]);
    expect(failing(variant("phong", ["uBrilho: { value: 30 }", "uBrilho: { value: 0 }"]))).toEqual([
      "O material tem os uniforms do brilho: uCorEspecular e uBrilho (uBrilho é 0: o expoente precisa ser maior que 0)",
    ]);
    expect(failing(variant("phong", ["uBrilho: { value: 30 }", "uBrilho: { value: 200 }"]))).toEqual([]);
  });

  it("o Blinn–Phong que ainda é o de Phong, com o expoente dos livros ou sem normalizar o h, a conferência avisa", () => {
    const blinn = stepOf("blinn");
    expect(failing(grade(blinn, factsFor(blinn, startCode(phong, stepIndex(phong, "blinn")))))).toEqual([
      "O brilho usa o vetor do meio, com o expoente do gabarito (o brilho ainda é o de Phong: troque o r pelo h, normalize(uDirecaoDoSol + v), e o dot(r, v) pelo dot(n, h))",
    ]);
    expect(failing(variant("blinn", ["pow(max(dot(n, h), 0.0), uBrilho)", "pow(max(dot(n, h), 0.0), uBrilho * 4.0)"]))).toEqual([
      "O brilho usa o vetor do meio, com o expoente do gabarito (a mancha ficou do tamanho da de Phong: com o h, o three.js usa o expoente como está, uBrilho, sem o * 4.0)",
    ]);
    expect(failing(variant("blinn", ["normalize(uDirecaoDoSol + v)", "(uDirecaoDoSol + v)"]))).toEqual([
      "O brilho usa o vetor do meio, com o expoente do gabarito (falta normalizar o h: a soma de duas direções de comprimento 1 é mais comprida que 1)",
    ]);
  });

  it("sem o fator do three.js ou com outros números que os do gabarito, a conferência avisa; com o expoente 100 nas duas, vale", () => {
    expect(failing(variant("energia", ["(uBrilho + 2.0) / 8.0", "1.0"]))).toEqual([
      "A nossa esfera fica igual ao gabarito: o brilho vezes (uBrilho + 2) ÷ 8 e vezes a difusa (a mancha ainda está mais fraca que a do gabarito: falta multiplicar o brilho por (uBrilho + 2.0) / 8.0)",
    ]);
    expect(failing(variant("energia", ["uBrilho: { value: 30 }", "uBrilho: { value: 100 }"]))).toEqual([
      "Os uniforms têm os números do gabarito: a cor, a cor do brilho e o expoente (o uBrilho é 100, e o shininess do gabarito, 30: para as manchas ficarem iguais, os dois números precisam ser iguais)",
    ]);
    expect(failing(variant("energia", ['uCor: { value: new THREE.Color("#3f7fd9") }', 'uCor: { value: new THREE.Color("#ff3366") }']))).toEqual([
      "Os uniforms têm os números do gabarito: a cor, a cor do brilho e o expoente (o uCor é #ff3366, e a cor do gabarito, #3f7fd9)",
    ]);
    expect(failing(variant("energia", ["uBrilho: { value: 30 }", "uBrilho: { value: 100 }"], ["shininess: 30 }", "shininess: 100 }"]))).toEqual([]);
  });

  it("a lâmpada sem atenuação, com a atenuação linear, fora do main, sem a bolinha ou sem a força na cor, a conferência avisa", () => {
    expect(failing(variant("lampada", ["uCorDaLampada / max(distancia * distancia, 0.01)", "uCorDaLampada"]))).toEqual([
      "A esfera recebe a luz da lâmpada, que enfraquece com a distância (a luz da lâmpada não enfraquece com a distância: divida a cor dela pelo quadrado da distância)",
    ]);
    expect(failing(variant("lampada", ["max(distancia * distancia, 0.01)", "max(distancia, 0.01)"]))).toEqual([
      "A esfera recebe a luz da lâmpada, que enfraquece com a distância (a luz da lâmpada enfraquece com a distância, e não com o quadrado dela: divida por distancia * distancia)",
    ]);
    expect(failing(variant("lampada", ["    cor += luz(paraLampada / distancia, uCorDaLampada / max(distancia * distancia, 0.01), n, v);\n", ""]))).toEqual([
      "A esfera recebe a luz da lâmpada, que enfraquece com a distância (a luz da lâmpada não chega à esfera: falta somar a luz(…) da lâmpada no main)",
    ]);
    expect(failing(variant("lampada", ["lampada.add(bulbo);", "cena.add(bulbo);"]))).toEqual([
      "A lâmpada é uma luz pontual na cena, com a bolinha dentro (o bulbo não está dentro da lâmpada: falta lampada.add(bulbo))",
    ]);
    expect(failing(variant("lampada", ['new THREE.Color("#ffaa55").multiplyScalar(4)', 'new THREE.Color("#ffaa55")']))).toEqual([
      "Os uniforms da lâmpada têm a posição e a cor dela (uCorDaLampada é (1,00; 0,40; 0,09), e a luz da lâmpada chega com (4,00; 1,61; 0,36): a cor dela, no espaço linear, vezes a intensidade dividida por π)",
    ]);
  });

  it("a volta espera a animação rodar; sem o copy ou raspando nas esferas, a conferência avisa; mais rápida, vale", () => {
    const step = stepOf("volta");
    const marks = (facts) => grade(step, facts).results.map((r) => [r.ok, r.seen]);
    expect(marks(factsOf(step.code)).slice(0, 2)).toEqual(Array(2).fill([null, "a animação está parada: aperte ▶ na barra de cima para a lâmpada andar"]));
    expect(failing(variant("volta", ["  material.uniforms.uPosicaoDaLampada.value.copy(lampada.position);\n", ""]))).toEqual([
      expect.stringMatching(/^O uniform da posição acompanha a lâmpada \(a lâmpada está em \(.+\), e a luz no shader ficou em \(0,00; 0,60; 3,00\): falta copiar a posição dela para material\.uniforms\.uPosicaoDaLampada\.value no animar\)$/),
    ]);
    expect(failing(variant("volta", ["Math.sin(tempo) * 3", "Math.sin(tempo) * 2"], ["Math.cos(tempo) * 3", "Math.cos(tempo) * 2"]))).toEqual([
      "A lâmpada dá voltas em torno das esferas (a lâmpada passa a 2,00 do centro: a volta tem de passar por fora das esferas)",
    ]);
    expect(failing(variant("volta", ["Math.sin(tempo)", "Math.sin(tempo * 3)"], ["Math.cos(tempo)", "Math.cos(tempo * 3)"]))).toEqual([]);
  });

  it("o projeto baixado leva os controles do mouse, que giram em volta da origem", () => {
    const main = fileOf(stepOf("computador").files, "src/main.js").code;
    expect(main).toContain('import { OrbitControls } from "three/addons/controls/OrbitControls.js";');
    expect(main, "a câmera olha para a origem, o centro dos controles").not.toContain("controles.target.set");
    expect(fileOf(stepOf("computador").files, "src/cena.js").code).toContain("const fragmentShader = /* glsl */ `");
  });
});

describe("conferências do mar", () => {
  const mar = projectById("mar");
  const variant = variantOf(mar);
  const stepOf = (id) => mar.steps[stepIndex(mar, id)];
  const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura: falta passar a cor pela paraSRGB no gl_FragColor";
  /** A mensagem de quando a superfície não bate com a conta, com o ponto mais longe dela. */
  const offShape = (text) => expect.stringMatching(new RegExp(`^${text} \\(a superfície não bate com a conta: em x = .+, z = .+, o mar está em y = .+, e a conta dá .+\\)$`));

  it("a placa fora da câmera, a cor sem a paraSRGB ou sem o wireframe, a conferência avisa; outra cor vale", () => {
    expect(failing(variant("shader", ["projectionMatrix * viewMatrix * mundo", "projectionMatrix * mundo"]))).toEqual([
      "O shader de vértices desenha a placa no lugar dela, plana (a placa quase não aparece na câmera: confira o gl_Position, que leva o ponto do mundo pela câmera, projectionMatrix * viewMatrix * mundo)",
      "As linhas têm a cor do uCorDaAgua, em sRGB (o mar quase não aparece na câmera)",
    ]);
    expect(failing(variant("shader", ["vec4(paraSRGB(uCorDaAgua), 1.0)", "vec4(uCorDaAgua, 1.0)"]))).toEqual([`As linhas têm a cor do uCorDaAgua, em sRGB (${NO_SRGB})`]);
    expect(failing(variant("shader", ["  wireframe: true,\n", ""]))).toEqual(["As linhas têm a cor do uCorDaAgua, em sRGB (o material não está em wireframe: falta o wireframe: true no ShaderMaterial)"]);
    expect(failing(variant("shader", ['new THREE.Color("#0b4268")', 'new THREE.Color("#ffffff")']))).toEqual([]);
  });

  it("a onda em z ou mais alta que a do passo, a conferência avisa", () => {
    expect(failing(variant("onda", ["sin(mundo.x)", "sin(mundo.z)"]))).toEqual(["A placa vira uma onda: cada ponto sobe ou desce sin(x) (a onda corre em z: o seno usa o x, sin(mundo.x))"]);
    expect(failing(variant("onda", ["sin(mundo.x)", "2.0 * sin(mundo.x)"]))).toEqual([offShape("A placa vira uma onda: cada ponto sobe ou desce sin\\(x\\)")]);
  });

  it("as ondas esperam a animação rodar e, quando a onda parada desenharia o mesmo mar, esperam mais; sem o tempo, para trás ou mais rápida, a conferência avisa", () => {
    const step = stepOf("tempo");
    const marks = (facts) => grade(step, facts).results.map((r) => [r.ok, r.seen]);
    expect(marks(factsOf(step.code, { surface: true }))).toEqual(Array(2).fill([null, "a animação está parada: aperte ▶ na barra de cima para as ondas andarem"]));
    expect(marks(factsOf(step.code, { seconds: 0.3, surface: true }))).toEqual(Array(2).fill([null, "esperando as ondas andarem um pouco"]));
    expect(marks(factsOf(step.code, { seconds: 2 * Math.PI, surface: true }))).toEqual([
      [true, null],
      [null, "esperando as ondas andarem mais um pouco para conferir"],
    ]);
    const copy = "o uTempo continua em 0: falta o animar copiar o tempo para ele, material.uniforms.uTempo.value = tempo";
    expect(failing(variant("tempo", ["  material.uniforms.uTempo.value = tempo;\n", ""]))).toEqual([
      `O uniform uTempo recebe o tempo da animação a cada quadro (${copy})`,
      `A onda anda: a superfície é sin(x − uTempo) (${copy})`,
    ]);
    expect(failing(variant("tempo", ["mundo.x - uTempo", "mundo.x + uTempo"]))).toEqual([
      "A onda anda: a superfície é sin(x − uTempo) (a onda anda para trás, para o −x: o tempo entra com menos, sin(mundo.x - uTempo))",
    ]);
    expect(failing(variant("tempo", ["mundo.x - uTempo", "mundo.x - uTempo * 3.0"]))).toEqual([offShape("A onda anda: a superfície é sin\\(x − uTempo\\)")]);
  });

  it("a onda sem a altura ou com outra, sem o k ou sem o 2π, parada, sem o parêntese, para trás ou na gravidade da Lua, a conferência avisa; as ondas de 40 e de 3 valem", () => {
    const size = "A onda tem a altura uAltura e o comprimento uComprimento";
    const speed = "Ela anda na velocidade das ondas do mar, c = √(9,8 / k)";
    const above = `${speed} (a altura e o comprimento da onda ainda não batem: a conferência de cima diz o que falta)`;
    expect(failing(variant("fisica", ["uAltura * sin(", "sin("]))).toEqual([`${size} (a onda tem altura 1: falta multiplicar o seno por uAltura)`, above]);
    expect(failing(variant("fisica", ["uAltura * sin(", "0.8 * sin("]))).toEqual([`${size} (a onda tem 0,80 de altura, e o uAltura é 0,50)`, above]);
    expect(failing(variant("fisica", ["sin(k * (mundo.x - c * uTempo))", "sin(mundo.x - c * uTempo)"]))).toEqual([
      `${size} (a onda tem o comprimento do seno puro, 2π: falta o k multiplicando dentro do seno, sin(k * (mundo.x - c * uTempo)))`,
      above,
    ]);
    expect(failing(variant("fisica", ["2.0 * PI / uComprimento", "1.0 / uComprimento"]))).toEqual([
      `${size} (as ondas saíram compridas demais: o k é 2.0 * PI / uComprimento, com o 2π de uma volta inteira)`,
      above,
    ]);
    expect(failing(variant("fisica", ["c * uTempo", "uTempo"]))).toEqual([`${speed} (a onda parou: falta o tempo na fase, k * (mundo.x - c * uTempo))`]);
    expect(failing(variant("fisica", ["k * (mundo.x - c * uTempo)", "k * mundo.x - c * uTempo"]))).toEqual([
      `${speed} (o tempo também vai multiplicado pelo k: k * (mundo.x - c * uTempo), com o parêntese)`,
    ]);
    expect(failing(variant("fisica", ["mundo.x - c * uTempo", "mundo.x + c * uTempo"]))).toEqual([
      `${speed} (a onda anda para trás, para o −x: o tempo entra com menos, k * (mundo.x - c * uTempo))`,
    ]);
    expect(failing(variant("fisica", ["sqrt(9.8 / k)", "sqrt(1.6 / k)"]))).toEqual([`${speed} (a onda não anda na velocidade c = √(9,8 / k): a fase é k * (mundo.x - c * uTempo))`]);
    expect(failing(variant("fisica", ["uComprimento: { value: 10 }", "uComprimento: { value: 40 }"]))).toEqual([]);
    // com 3 de comprimento, os triângulos da placa cortam as cristas, e a onda parece mais baixa: a conferência conta com isso
    expect(failing(variant("fisica", ["uComprimento: { value: 10 }", "uComprimento: { value: 3 }"]))).toEqual([]);
    expect(failing(variant("fisica", ["uComprimento: { value: 10 }", "uComprimento: { value: 3 }"], ["uAltura * sin(", "0.8 * sin("]))).toEqual([`${size} (a onda tem 0,80 de altura, e o uAltura é 0,50)`, above]);
  });

  it("a normal ao contrário, a da placa parada, sem o normalize ou em sRGB, a conferência avisa", () => {
    const normal = "A cor de cada ponto mostra a normal dele";
    expect(failing(variant("normal", ["cross(binormal, tangente)", "cross(tangente, binormal)"]))).toEqual([`${normal} (a normal aponta para baixo: no cross, a ordem é cross(binormal, tangente))`]);
    expect(failing(variant("normal", ["vNormal = normalize(cross(binormal, tangente));", "vNormal = normal;"]))).toEqual([
      `${normal} (o mar inteiro tem a cor da normal da placa parada, (0, 1, 0): a normal precisa vir dos vizinhos, que sobem e descem com a onda)`,
    ]);
    expect(failing(variant("normal", ["vNormal = normalize(cross(binormal, tangente));", "vNormal = cross(binormal, tangente);"], ["vec3 n = normalize(vNormal);", "vec3 n = vNormal;"]))).toEqual([
      `${normal} (a normal está quase zerada, e o mar sai cinza: falta o normalize, normalize(cross(binormal, tangente)))`,
    ]);
    expect(failing(variant("normal", ["vec4(n * 0.5 + 0.5, 1.0)", "vec4(paraSRGB(n * 0.5 + 0.5), 1.0)"]))).toEqual([
      `${normal} (neste passo, a cor é a normal direto, sem a paraSRGB: gl_FragColor = vec4(n * 0.5 + 0.5, 1.0))`,
    ]);
  });

  it("a água e o céu trocados, a direção ao contrário, a cor em linear, outro céu ou o Fresnel sem a potência, a conferência avisa; o céu de fim de tarde vale", () => {
    const fresnel = "O mar reflete o céu pelo Fresnel de Schlick";
    expect(failing(variant("ceu", ["mix(uCorDaAgua, uCorDoCeu, fresnel)", "mix(uCorDoCeu, uCorDaAgua, fresnel)"]))).toEqual([
      `${fresnel} (a água e o céu trocaram de lugar no mix: com fresnel 0 (olhando de cima), a cor é a da água, mix(uCorDaAgua, uCorDoCeu, fresnel))`,
    ]);
    expect(failing(variant("ceu", ["normalize(cameraPosition - vPosicao)", "normalize(vPosicao - cameraPosition)"]))).toEqual([`${fresnel} (a direção v vai do ponto para a câmera: cameraPosition - vPosicao)`]);
    expect(failing(variant("ceu", ["vec4(paraSRGB(cor), 1.0)", "vec4(cor, 1.0)"]))).toEqual([`${fresnel} (${NO_SRGB})`]);
    expect(failing(variant("ceu", ["uCorDoCeu: { value: cena.background }", 'uCorDoCeu: { value: new THREE.Color("#ffffff") }']))).toEqual([
      "O céu refletido é a cor do fundo da cena (o uCorDoCeu é #ffffff, e o fundo da cena é #8fc1e3: o céu refletido é o do fundo, uCorDoCeu: { value: cena.background })",
    ]);
    expect(failing(variant("ceu", ["0.0), 5.0)", "0.0), 1.0)"]))).toEqual([
      expect.stringMatching(/^O mar reflete o céu pelo Fresnel de Schlick \(a cor do mar não bate com a conta: num ponto, o shader pinta #[0-9a-f]{6}, e a conta dá #[0-9a-f]{6}\)$/),
    ]);
    expect(failing(variant("ceu", ['cena.background = new THREE.Color("#8fc1e3");', 'cena.background = new THREE.Color("#ffb37a");']))).toEqual([]);
  });

  it("o empurrão ao contrário ou com o seno e as cristas dobradas, a conferência avisa; a altura 1,5 vale", () => {
    const circle = "Os pontos andam em círculo: as cristas ficam pontudas, e os vales, largos";
    expect(failing(variant("gerstner", ["p.x += uAltura * cos(f);", "p.x -= uAltura * cos(f);"]))).toEqual([
      `${circle} (o empurrão está ao contrário, e as cristas ficaram largas: p.x += uAltura * cos(f), com +)`,
    ]);
    expect(failing(variant("gerstner", ["p.x += uAltura * cos(f);", "p.x += uAltura * sin(f);"]))).toEqual([
      `${circle} (o x vai com o cosseno, e o y com o seno: p.x += uAltura * cos(f). Com os dois iguais, os pontos andam numa linha, e não num círculo)`,
    ]);
    expect(failing(variant("gerstner", ["uAltura: { value: 0.5 }", "uAltura: { value: 1.5 }"]))).toEqual([]);
    expect(failing(variant("gerstner", ["uAltura: { value: 0.5 }", "uAltura: { value: 1.7 }"]))).toEqual([
      `${circle} (as cristas se dobram em laçadas: as ondas estão íngremes demais, com a altura vezes o k (somada, se são várias) passando de 1. Diminua a altura ou aumente o comprimento)`,
      "A crista não se dobra: a altura vezes o k fica abaixo de 1 (com 1,70 de altura e 10,00 de comprimento, a altura vezes o k dá 1,07: de 1 para cima, as cristas se dobram em laçadas)",
    ]);
  });

  it("a direção sem o normalize, sem o empurrão em z ou com o empurrão fora da direção, a conferência avisa; outras direções valem", () => {
    const direction = "A onda corre na direção do uDirecao, com o empurrão junto";
    expect(failing(variant("direcao", ["vec2 d = normalize(uDirecao);", "vec2 d = uDirecao;"]))).toEqual([`${direction} (a direção precisa de comprimento 1: vec2 d = normalize(uDirecao))`]);
    expect(failing(variant("direcao", ["    p.z += d.y * uAltura * cos(f);\n", ""]))).toEqual([`${direction} (falta empurrar o z também: p.z += d.y * uAltura * cos(f))`]);
    expect(failing(variant("direcao", ["p.x += d.x * uAltura * cos(f);", "p.x += uAltura * cos(f);"]))).toEqual([`${direction} (o empurrão vai na direção da onda: p.x += d.x * uAltura * cos(f))`]);
    expect(failing(variant("direcao", ["new THREE.Vector2(1, 0.5)", "new THREE.Vector2(0, 1)"]))).toEqual([]);
    expect(failing(variant("direcao", ["new THREE.Vector2(1, 0.5)", "new THREE.Vector2(-1, 0)"]))).toEqual([]);
  });

  it("a onda que falta, as ondas em cadeia, sem o empurrão ou sem o normalize, a conferência avisa; outras ondas valem", () => {
    const sum = "O mar soma as três ondas, cada uma com a sua direção, altura e comprimento";
    const all = "p + onda(uOnda1, p) + onda(uOnda2, p) + onda(uOnda3, p)";
    expect(failing(variant("ondas", [" + onda(uOnda3, p)", ""]))).toEqual([`${sum} (falta somar a onda uOnda3: ${all})`]);
    expect(failing(variant("ondas", [" + onda(uOnda1, p)", ""]))).toEqual([`${sum} (falta somar a onda uOnda1: ${all})`]);
    expect(failing(variant("ondas", [`    return ${all};`, "    p += onda(uOnda1, p);\n    p += onda(uOnda2, p);\n    p += onda(uOnda3, p);\n    return p;"]))).toEqual([
      `${sum} (cada onda é calculada no ponto parado p, e só no fim tudo se soma: ${all})`,
    ]);
    expect(failing(variant("ondas", ["return vec3(d.x * o.z * cos(f), o.z * sin(f), d.y * o.z * cos(f));", "return vec3(0.0, o.z * sin(f), 0.0);"]))).toEqual([
      `${sum} (a função onda também empurra o ponto para o lado: d.x * o.z * cos(f) e d.y * o.z * cos(f))`,
    ]);
    expect(failing(variant("ondas", ["vec2 d = normalize(o.xy);", "vec2 d = o.xy;"]))).toEqual([`${sum} (a direção de cada onda precisa de comprimento 1: vec2 d = normalize(o.xy))`]);
    expect(failing(variant("ondas", ["new THREE.Vector4(1, 0, 0.35, 10)", "new THREE.Vector4(1, 0, 0, 10)"]))).toEqual([]);
    expect(failing(variant("ondas", ["new THREE.Vector4(1, 0.7, 0.18, 6)", "new THREE.Vector4(-1, 0.3, 0.18, 6)"]))).toEqual([]);
  });

  it("o sol sem o brilho, sem o meio do caminho, atrás da câmera, sem o normalize ou em linear, a conferência avisa; outro brilho e o sol mais alto valem", () => {
    const glint = "O sol brilha nas ondas, com o expoente uBrilho";
    const missing = `${glint} (o sol não brilha nas ondas: falta somar o brilho à cor, cor += pow(max(dot(n, h), 0.0), uBrilho), com o h = normalize(uDirecaoDoSol + v))`;
    expect(failing(variant("sol", ["    cor += pow(max(dot(n, h), 0.0), uBrilho);\n", ""]))).toEqual([missing]);
    expect(failing(variant("sol", ["normalize(uDirecaoDoSol + v)", "uDirecaoDoSol + v"]))).toEqual([missing]);
    expect(failing(variant("sol", ["normalize(uDirecaoDoSol + v)", "normalize(v - uDirecaoDoSol)"]))).toEqual([missing]);
    expect(failing(variant("sol", ["new THREE.Vector3(0, 0.25, -1).normalize()", "new THREE.Vector3(0, 0.25, 1).normalize()"]))).toEqual([
      "O sol vem de trás do mar, acima do horizonte (o sol não está atrás do mar: ele vem de −z, do lado oposto ao da câmera, para o reflexo cair na água à frente dela)",
    ]);
    expect(failing(variant("sol", ["new THREE.Vector3(0, 0.25, -1).normalize()", "new THREE.Vector3(0, 0.25, -1)"]))).toEqual([
      "O sol vem de trás do mar, acima do horizonte (a direção do sol tem comprimento 1,03: falta o .normalize(), que deixa em 1)",
    ]);
    expect(failing(variant("sol", ["vec4(paraSRGB(cor), 1.0)", "vec4(cor, 1.0)"]))).toEqual([`${glint} (${NO_SRGB})`]);
    expect(failing(variant("sol", ["uBrilho: { value: 500 }", "uBrilho: { value: 50 }"]))).toEqual([]);
    expect(failing(variant("sol", ["new THREE.Vector3(0, 0.25, -1)", "new THREE.Vector3(0, 0.8, -1)"]))).toEqual([]);
  });

  it("a neblina que falta, medida da origem, ao contrário ou longe demais, a conferência avisa; a neblina desde a câmera e o céu de fim de tarde valem", () => {
    const fog = "De longe, o mar some no céu: a neblina vai de uNeblinaPerto a uNeblinaLonge";
    const reversed = `${fog} (a neblina ficou ao contrário, forte perto e fraca longe: smoothstep(uNeblinaPerto, uNeblinaLonge, distancia) e mix(cor, uCorDoCeu, neblina))`;
    expect(failing(variant("horizonte", ["    cor = mix(cor, uCorDoCeu, neblina);\n", ""]))).toEqual([
      `${fog} (o mar ainda não some no horizonte: falta misturar a cor com o céu pela neblina, mix(cor, uCorDoCeu, neblina))`,
    ]);
    expect(failing(variant("horizonte", ["length(cameraPosition - vPosicao)", "length(vPosicao)"]))).toEqual([`${fog} (a distância é até a câmera: length(cameraPosition - vPosicao))`]);
    expect(failing(variant("horizonte", ["smoothstep(uNeblinaPerto, uNeblinaLonge, distancia)", "smoothstep(uNeblinaLonge, uNeblinaPerto, distancia)"]))).toEqual([reversed]);
    expect(failing(variant("horizonte", ["mix(cor, uCorDoCeu, neblina)", "mix(uCorDoCeu, cor, neblina)"]))).toEqual([reversed]);
    expect(failing(variant("horizonte", ["uNeblinaLonge: { value: 40 }", "uNeblinaLonge: { value: 100 }"]))).toEqual([
      "A neblina cobre o mar antes da borda da placa (a neblina só cobre tudo a 100 da câmera, e o mar acaba a 52: a borda da placa aparece contra o céu)",
    ]);
    expect(failing(variant("horizonte", ["uNeblinaPerto: { value: 15 }", "uNeblinaPerto: { value: 0 }"]))).toEqual([]);
    expect(failing(variant("horizonte", ['cena.background = new THREE.Color("#8fc1e3");', 'cena.background = new THREE.Color("#ffb37a");']))).toEqual([]);
  });

  it("o projeto baixado leva os controles do mouse e os dois shaders no cena.js", () => {
    const { files } = stepOf("computador");
    const main = fileOf(files, "src/main.js").code;
    expect(main).toContain('import { OrbitControls } from "three/addons/controls/OrbitControls.js";');
    expect(main, "a câmera olha para a origem, o centro dos controles").not.toContain("controles.target.set");
    const cena = fileOf(files, "src/cena.js").code;
    expect(cena).toContain("const vertexShader = /* glsl */ `");
    expect(cena).toContain("const fragmentShader = /* glsl */ `");
  });
});

describe("conferências da galáxia viva", () => {
  const viva = projectById("galaxia-viva");
  const variant = variantOf(viva);
  const stepOf = (id) => viva.steps[stepIndex(viva, id)];
  const NO_SRGB = "a cor saiu do shader no espaço linear, mais escura e carregada: falta passar a cor pela paraSRGB no gl_FragColor";
  const GL_POSITION = "projectionMatrix * modelViewMatrix * vec4(position, 1.0)";
  const COPY = "o uTempo continua em 0: falta o animar copiar o tempo para ele, material.uniforms.uTempo.value = tempo";
  /** A mensagem com {n} no lugar dos números que dependem do sorteio das estrelas, e {cor} no das cores. */
  const like = (text) =>
    expect.stringMatching(
      new RegExp(`^${text.split(/(\{n\}|\{cor\})/).map((part) => ({ "{n}": "[−\\d.,]+", "{cor}": "#[0-9a-f]{6}" })[part] ?? part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}$`),
    );

  it("a galáxia com poucas estrelas, a conferência avisa; com pontos maiores, vale", () => {
    expect(failing(variant("partida", ["const quantidade = 50000;", "const quantidade = 5000;"]))).toEqual(["A galáxia é um THREE.Points com 50 mil estrelas (a galáxia tem 5.000 estrelas: são 50.000)"]);
    expect(failing(variant("partida", ["  size: 0.03,", "  size: 0.1,"]))).toEqual([]);
  });

  it("as estrelas sem a câmera ou sem a perspectiva, sem o gl_PointSize, maiores ou amarelas, a conferência avisa; com a modelMatrix separada, vale", () => {
    const place = `Cada estrela aparece no seu lugar: ${GL_POSITION}`;
    const size = "Cada estrela é um quadrado de 2 pixels";
    expect(failing(variant("shader", [GL_POSITION, "projectionMatrix * vec4(position, 1.0)"]))).toEqual([`${place} (a câmera ficou de fora: o ponto passa pela modelViewMatrix, ${GL_POSITION})`]);
    expect(failing(variant("shader", [GL_POSITION, "modelViewMatrix * vec4(position, 1.0)"]))).toEqual([`${place} (falta a perspectiva: o ponto passa pela projectionMatrix, ${GL_POSITION})`]);
    expect(failing(variant("shader", [GL_POSITION, "projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0)"]))).toEqual([]);
    expect(failing(variant("shader", ["    gl_PointSize = 2.0;\n", ""]))).toEqual([`${size} (o shader de vértices não escreve o gl_PointSize: sem ele, o tamanho das estrelas fica indefinido)`]);
    expect(failing(variant("shader", ["gl_PointSize = 2.0;", "gl_PointSize = 6.0;"]))).toEqual([`${size} (as estrelas têm 6 pixels: o passo usa gl_PointSize = 2.0)`]);
    expect(failing(variant("shader", ["vec4(1.0, 1.0, 1.0, 1.0)", "vec4(1.0, 0.8, 0.2, 1.0)"]))).toEqual(["As estrelas são brancas (o meio de uma estrela saiu #ffcc33, e a conta dá #ffffff)"]);
  });

  it("a cor sem a paraSRGB, sem o vertexColors ou com os canais trocados, a conferência avisa", () => {
    const color = "Cada estrela tem a cor do seu vértice, em sRGB";
    expect(failing(variant("cor", ["vec4(paraSRGB(vCor), 1.0)", "vec4(vCor, 1.0)"]))).toEqual([`${color} (${NO_SRGB})`]);
    expect(failing(variant("cor", ["  vertexColors: true,\n", ""]))).toEqual([
      "O material usa a cor de cada vértice (vertexColors: true) (vertexColors está desligado)",
      `${color} (o shader de vértices não compila: a barra embaixo do código diz o erro e a linha)`,
    ]);
    expect(failing(variant("cor", ["vCor = color;", "vCor = vec3(color.b, color.g, color.r);"]))).toEqual([like(`${color} (o meio de uma estrela saiu {cor}, e a conta dá {cor})`)]);
  });

  it("o tamanho negativo, multiplicado, igual para todas, pela distância ou sem a densidade da tela, a conferência avisa", () => {
    const size = "O tamanho cai com a profundidade: gl_PointSize = uTamanho / -visto.z";
    const line = "gl_PointSize = uTamanho / -visto.z;";
    expect(failing(variant("distancia", [line, "gl_PointSize = uTamanho / visto.z;"]))).toEqual([
      `${size} (o tamanho saiu negativo, e as estrelas sumiram: na frente da câmera, o visto.z é negativo, e a profundidade é o -visto.z)`,
    ]);
    expect(failing(variant("distancia", [line, "gl_PointSize = uTamanho * -visto.z;"]))).toEqual([`${size} (as estrelas crescem com a profundidade: o uTamanho é dividido pelo -visto.z, e não multiplicado)`]);
    expect(failing(variant("distancia", [line, "gl_PointSize = uTamanho;"]))).toEqual([`${size} (o tamanho não muda com a profundidade: falta dividir pelo -visto.z, uTamanho / -visto.z)`]);
    expect(failing(variant("distancia", [line, "gl_PointSize = uTamanho / length(visto.xyz);"]))).toEqual([like(`${size} (uma estrela a {n} de profundidade tem {n} pixels, e a conta dá {n})`)]);
    expect(failing(variant("distancia", ["30 * densidade", "90 * densidade"]))).toEqual(["O uTamanho é 30 vezes a densidade da tela (o uTamanho está em 90: o passo usa 30 * densidade, que dá 30 na sua tela)"]);
    // numa tela de alta densidade, como a de um celular
    const step = stepOf("distancia");
    expect(failing(grade(step, factsOf(step.code.replace("30 * densidade", "30"), { pixelRatio: 2 })))).toEqual([
      "O uTamanho é 30 vezes a densidade da tela (o uTamanho está em 30, e a sua tela tem 2 pixels da imagem em cada pixel: falta multiplicar pela densidade, 30 * densidade)",
    ]);
    expect(failing(grade(step, factsOf(step.code, { pixelRatio: 2 })))).toEqual([]);
    expect(failing(grade(step, factsOf(step.code, { pixelRatio: 3 }))), "o visor desenha com no máximo 2, como o Math.min").toEqual([]);
  });

  it("a escala sorteada por igual, grande demais ou fora do gl_PointSize, a conferência avisa", () => {
    const scale = "A geometria tem o atributo aEscala, de 0,5 a 2,5, com a maioria das estrelas pequenas";
    expect(failing(variant("tamanhos", ["Math.random() ** 3", "Math.random()"]))).toEqual([
      like(`${scale} (metade das estrelas tem escala acima de {n}: com o Math.random() ** 3, a maioria fica pequena, perto de 0,5)`),
    ]);
    expect(failing(variant("tamanhos", ["0.5 + 2 *", "0.5 + 6 *"]))).toEqual([like(`${scale} (as escalas vão de {n} a {n}: são de 0,5 a 2,5)`)]);
    expect(failing(variant("tamanhos", ["uTamanho * aEscala / -visto.z", "uTamanho / -visto.z"]))).toEqual([
      "Cada estrela tem o tamanho da sua escala: gl_PointSize = uTamanho * aEscala / -visto.z (as estrelas à mesma profundidade ainda têm o mesmo tamanho: falta multiplicar pelo aEscala, uTamanho * aEscala / -visto.z)",
    ]);
  });

  it("o brilho sem a potência, chapado, sem o 2, dentro da paraSRGB ou que falta, sem a mistura aditiva ou com o tamanho de antes, a conferência avisa", () => {
    const fall = "A luz de cada estrela cai rápido do meio até a borda do círculo";
    const power = "pow(max(1.0 - 2.0 * d, 0.0), 6.0)";
    expect(failing(variant("brilho", [power, "pow(max(1.0 - 2.0 * d, 0.0), 1.0)"]))).toEqual([`${fall} (a luz cai devagar demais, e as estrelas viram bolas embaçadas: falta elevar a 6, ${power})`]);
    expect(failing(variant("brilho", [power, "(d < 0.5 ? 1.0 : 0.0)"]))).toEqual([`${fall} (as estrelas são bolinhas chapadas: a força cai do meio para a borda, ${power})`]);
    expect(failing(variant("brilho", [power, "pow(max(1.0 - d, 0.0), 6.0)"]))).toEqual([`${fall} (a luz não chega a zero na borda do círculo: o d vai até 0,5 na borda, por isso o 2.0 em 1.0 - 2.0 * d)`]);
    expect(failing(variant("brilho", ["paraSRGB(vCor) * forca", "paraSRGB(vCor * forca)"]))).toEqual([`${fall} (a força entrou antes da paraSRGB, que clareia os tons fracos e espalha o brilho: é paraSRGB(vCor) * forca)`]);
    expect(failing(variant("brilho", ["paraSRGB(vCor) * forca", "paraSRGB(vCor)"]))).toEqual([`${fall} (as estrelas ainda são quadrados chapados: falta a força cair do meio para a borda, com o gl_PointCoord)`]);
    expect(failing(variant("brilho", ["  blending: THREE.AdditiveBlending,\n", ""]))).toEqual([
      "As estrelas somam a luz, sem gravar a profundidade (a mistura não é a aditiva: falta o blending: THREE.AdditiveBlending, que soma a luz das estrelas)",
    ]);
    expect(failing(variant("brilho", ["60 * densidade", "30 * densidade"]))).toEqual(["O uTamanho é 60 vezes a densidade da tela (o uTamanho está em 30: o passo usa 60 * densidade, que dá 60 na sua tela)"]);
  });

  it("o giro espera a animação rodar e, quando a galáxia girando ao contrário estaria no mesmo lugar, espera mais; sem o tempo, ao contrário, espelhado, parado ou mais rápido, a conferência avisa", () => {
    const step = stepOf("giro");
    const spin = "A galáxia gira 0,1 radiano por segundo, no sentido do Gerador";
    const marks = (facts) => grade(step, facts).results.map((r) => [r.ok, r.seen]);
    expect(marks(factsOf(step.code))).toEqual(Array(2).fill([null, "a animação está parada: aperte ▶ na barra de cima para a galáxia girar"]));
    expect(marks(factsOf(step.code, { seconds: 0.3 }))).toEqual(Array(2).fill([null, "esperando a galáxia girar um pouco"]));
    // em 10π segundos, a galáxia deu meia volta, e a que gira ao contrário está no mesmo lugar
    expect(marks(factsOf(step.code, { seconds: 10 * Math.PI }))).toEqual([
      [true, null],
      [null, "esperando a galáxia girar mais um pouco para conferir"],
    ]);
    expect(failing(variant("giro", ["  material.uniforms.uTempo.value = tempo;\n", ""]))).toEqual([`O uniform uTempo recebe o tempo da animação a cada quadro (${COPY})`, `${spin} (${COPY})`]);
    expect(failing(variant("giro", ["angulo -= uTempo * 0.1;", "angulo += uTempo * 0.1;"]))).toEqual([
      `${spin} (a galáxia gira para o outro lado, com as pontas dos braços na frente: o ângulo diminui, angulo -= uTempo * 0.1)`,
    ]);
    expect(failing(variant("giro", ["atan(p.z, p.x)", "atan(p.x, p.z)"]))).toEqual([`${spin} (a galáxia ficou espelhada: no atan, o z vem primeiro, atan(p.z, p.x))`]);
    expect(failing(variant("giro", ["modelViewMatrix * vec4(p, 1.0)", "modelViewMatrix * vec4(position, 1.0)"]))).toEqual([
      `${spin} (a galáxia não gira: falta diminuir o ângulo, angulo -= uTempo * 0.1, e a câmera ver o ponto girado, modelViewMatrix * vec4(p, 1.0))`,
    ]);
    expect(failing(variant("giro", ["angulo -= uTempo * 0.1;", "angulo -= uTempo * 1.0;"]))).toEqual([like(`${spin} (uma estrela que a conta põe em x = {n}, z = {n} apareceu em x = {n}, z = {n})`)]);
  });

  it("a velocidade vezes o raio, sem o uVelocidade, igual para todas, ao contrário ou zerada, a conferência avisa; o quádruplo vale", () => {
    const flat = "Cada estrela gira uVelocidade / r radianos por segundo";
    const line = "angulo -= uTempo * uVelocidade / r";
    expect(failing(variant("velocidade", [line, "angulo -= uTempo * uVelocidade * r"]))).toEqual([`${flat} (as estrelas de fora giram mais rápido: a velocidade é dividida pelo raio, uVelocidade / r)`]);
    expect(failing(variant("velocidade", [line, "angulo -= uTempo / r"]))).toEqual([`${flat} (as estrelas giram rápido demais: falta o uVelocidade, ${line})`]);
    expect(failing(variant("velocidade", [line, "angulo -= uTempo * 0.1"]))).toEqual([`${flat} (a galáxia ainda gira inteira, como um disco: cada estrela gira na sua velocidade, ${line})`]);
    expect(failing(variant("velocidade", [line, "angulo += uTempo * uVelocidade / r"]))).toEqual([`${flat} (a galáxia gira para o outro lado: o ângulo diminui, ${line})`]);
    expect(failing(variant("velocidade", ["uVelocidade: { value: 0.5 }", "uVelocidade: { value: 0 }"]))).toEqual([`${flat} (o uVelocidade está em 0, e as estrelas ficam paradas)`]);
    expect(failing(variant("velocidade", ["uVelocidade: { value: 0.5 }", "uVelocidade: { value: 2.0 }"]))).toEqual([]);
  });

  it("o núcleo sem a raiz ou com a soma no lugar dela, a conferência avisa; um núcleo maior vale", () => {
    const core = "O núcleo gira junto, como um disco: uVelocidade / √(r² + uNucleo²)";
    const speed = "uVelocidade / sqrt(r * r + uNucleo * uNucleo)";
    expect(failing(variant("nucleo", [speed, "uVelocidade / r"]))).toEqual([`${core} (perto do centro, as estrelas ainda giram depressa demais: divida pela raiz, ${speed})`]);
    expect(failing(variant("nucleo", [speed, "uVelocidade / (r + uNucleo)"]))).toEqual([
      `${core} (longe do centro, as estrelas ficaram lentas demais: é a raiz de r² + uNucleo², sqrt(r * r + uNucleo * uNucleo), que fica quase igual ao r longe do centro)`,
    ]);
    expect(failing(variant("nucleo", ["uNucleo: { value: 0.5 }", "uNucleo: { value: 2.0 }"]))).toEqual([]);
  });

  it("a espiral parada, ao contrário, larga, sem a luz ou com as estrelas ainda nos braços, a conferência avisa; com 5 braços, vale", () => {
    const wave = "Quem passa pela espiral brilha, e a espiral gira inteira, devagar";
    const turn = "+ uTempo * uVelocidadeDosBracos";
    expect(failing(variant("onda", ["uVelocidadeDosBracos: { value: 0.15 }", "uVelocidadeDosBracos: { value: 0 }"]))).toEqual([
      `${wave} (o uVelocidadeDosBracos está em 0, e a espiral fica parada: ela gira devagar, a 0,15 radiano por segundo)`,
    ]);
    expect(failing(variant("onda", [` ${turn}`, ""]))).toEqual([`${wave} (a espiral está parada: ela gira com o tempo, ${turn})`]);
    expect(failing(variant("onda", [turn, "- uTempo * uVelocidadeDosBracos"]))).toEqual([`${wave} (a espiral gira ao contrário das estrelas: o tempo entra com mais, ${turn})`]);
    expect(failing(variant("onda", ["pow(0.5 + 0.5 * onda, 3.0)", "(0.5 + 0.5 * onda)"]))).toEqual([`${wave} (os braços ficaram largos e borrados: falta elevar ao cubo, pow(0.5 + 0.5 * onda, 3.0))`]);
    expect(failing(variant("onda", ["vCor = color * mix(0.08, 1.0, brilho);", "vCor = color;"]))).toEqual([
      `${wave} (as estrelas não mudam de brilho: falta multiplicar a cor pela luz da espiral, color * mix(0.08, 1.0, brilho))`,
    ]);
    expect(failing(variant("onda", ["const angulo = Math.random() * Math.PI * 2;", "const angulo = ((i % bracos) / bracos) * Math.PI * 2 + r * curvatura;"]))).toEqual([
      "As estrelas se espalham por igual pelo disco, sem braços (as estrelas ainda estão nos braços: o ângulo agora é sorteado por igual, Math.random() * Math.PI * 2, e quem desenha os braços é o shader)",
    ]);
    expect(failing(variant("onda", ["const bracos = 3;", "const bracos = 5;"]))).toEqual([]);
  });

  it("a cor jovem fora dos braços ou que falta, a conferência avisa; outra cor jovem vale", () => {
    const young = "Na espiral, as estrelas ficam azuladas: mix(color, uCorJovem, brilho)";
    expect(failing(variant("jovens", ["mix(color, uCorJovem, brilho)", "mix(uCorJovem, color, brilho)"]))).toEqual([
      `${young} (a cor jovem ficou fora dos braços: no mix, ela vem em segundo, mix(color, uCorJovem, brilho))`,
    ]);
    expect(failing(variant("jovens", ["mix(color, uCorJovem, brilho) * ", "color * "]))).toEqual([
      `${young} (as estrelas dos braços ainda têm a cor de antes: falta misturar a cor com a jovem, mix(color, uCorJovem, brilho))`,
    ]);
    expect(failing(variant("jovens", ['"#a8c8ff"', '"#ff6b9a"']))).toEqual([]);
  });

  it("o projeto baixado leva os controles do mouse, a densidade da tela e os dois shaders no cena.js", () => {
    const { files } = stepOf("computador");
    const main = fileOf(files, "src/main.js").code;
    expect(main).toContain('import { OrbitControls } from "three/addons/controls/OrbitControls.js";');
    expect(main, "a imagem com a densidade que o uTamanho conta").toContain("renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));");
    const cena = fileOf(files, "src/cena.js").code;
    expect(cena).toContain("const densidade = Math.min(window.devicePixelRatio, 2);");
    expect(cena).toContain("const vertexShader = /* glsl */ `");
    expect(cena).toContain("const fragmentShader = /* glsl */ `");
  });
});

describe("os fatos de uma InstancedMesh e de uma placa", () => {
  it("as cópias desenhadas vão com a posição, uma amostra das matrizes e das cores e a versão; o rastro segue a primeira cópia", () => {
    const geometry = new THREE.BoxGeometry();
    const copies = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 30);
    const molde = new THREE.Object3D();
    for (let i = 0; i < 30; i++) {
      molde.position.set(i, 0, -i);
      molde.updateMatrix();
      copies.setMatrixAt(i, molde.matrix);
      copies.setColorAt(i, new THREE.Color(i / 30, 0.5, 0));
    }
    copies.count = 20;
    const scene = new THREE.Scene();
    scene.add(copies);
    const { objects } = sceneFacts({ scene, camera: null, entries: [[1, [copies]]], idOf: () => undefined });
    const facts = objects[1];
    expect(facts.instances).toBe(20);
    expect([...facts.instanced.positions]).toEqual(Array.from({ length: 20 }, (_, i) => [i, 0, -i]).flat());
    expect(facts.instanced.sample).toHaveLength(20);
    expect(facts.instanced.sample[3][0][3]).toBe(3);
    expect(facts.instanced.colors).toHaveLength(20);
    expect(facts.instanced.version).toBe(0);
    copies.instanceMatrix.needsUpdate = true;
    expect(sceneFacts({ scene, camera: null, entries: [[1, [copies]]], idOf: () => undefined }).objects[1].instanced.version).toBe(1);
    // o rastro segue o ponto (1, 1, 1) da primeira cópia, e não a malha
    copies.position.set(0, 5, 0);
    copies.updateMatrixWorld();
    expect(trailPoint(copies)).toEqual([1, 6, 1]);
  });

  it("uma placa (PlaneGeometry) manda a grade de vértices e as normais; sem a grade, não manda", () => {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(4, 2, 4, 2), new THREE.MeshStandardMaterial({ flatShading: true }));
    const scene = new THREE.Scene();
    scene.add(plate);
    const factsOfPlate = (mesh) => sceneFacts({ scene, camera: null, entries: [[1, [mesh]]], idOf: () => undefined }).objects[1];
    const { geometry, material } = factsOfPlate(plate);
    expect(material.flatShading).toBe(true);
    expect([geometry.grid.cols, geometry.grid.rows]).toEqual([4, 2]);
    expect(geometry.grid.positions).toHaveLength(15 * 3);
    expect([...geometry.grid.positions.slice(0, 3)]).toEqual([-2, 1, 0]);
    expect([...geometry.grid.normals.slice(0, 3)]).toEqual([0, 0, 1]);
    const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    scene.add(box);
    expect(factsOfPlate(box).geometry.grid).toBeUndefined();
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
