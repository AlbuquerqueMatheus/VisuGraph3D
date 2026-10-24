import { describe, expect, it } from "vitest";
import { analyze } from "../../src/live/engine/analyze.js";
import {
  applyChanges, editability, editableAxes, mergeChanges, planEdit, planEdits, planNumber, planTransform, scrubInfo,
} from "../../src/live/engine/patch.js";
import { STARTER_CODE, planAddObject } from "../../src/live/engine/snippets.js";

const HEAD = "const cena = new THREE.Scene();\n";

/** Objeto pelo nome, ou "nome.material" / "nome.geometry" para os que a malha usa. */
function find(a, ref) {
  const [name, link] = ref.split(".");
  const obj = a.objects.find((o) => o.name === name);
  if (!obj) throw new Error(`objeto ${name} não encontrado`);
  return link ? a.objects[obj.links[link]] : obj;
}

/** Aplica uma edição e devolve o código novo (falha se a edição der erro). */
function edit(code, ref, key, value, opts) {
  const a = analyze(code);
  const { changes, errors } = planEdit(a, find(a, ref).id, key, value, opts);
  expect(errors).toEqual([]);
  return applyChanges(code, changes);
}

function errorOf(code, ref, key, value) {
  const a = analyze(code);
  const { changes, errors } = planEdit(a, find(a, ref).id, key, value);
  expect(changes).toEqual([]);
  return errors[0].message;
}

/** Depois de editar, o código lido de novo tem o valor pedido no lugar certo. */
function roundTrip(code, ref, key, value) {
  const next = edit(code, ref, key, value);
  const state = find(analyze(next), ref).props[key];
  expect(state.status).toBe("slot");
  if (typeof value === "number") expect(state.slot.value).toBeCloseTo(value, 2);
  else expect(state.slot.value).toBe(value);
  return next;
}

describe("trocar o literal que já existe", () => {
  it("número dentro de position.set(x, y, z)", () => {
    expect(edit(STARTER_CODE, "cubo", "position.x", 2.25)).toContain("cubo.position.set(2.25, 0.5, 0);");
  });

  it("número negativo e valor arredondado às casas do controle", () => {
    const code = HEAD + "const c = new THREE.Mesh();\nc.position.set(-1, 0, 0);\n";
    expect(edit(code, "c", "position.x", 1.23456)).toContain("c.position.set(1.23, 0, 0);");
    expect(edit(code, "c", "position.y", -0.5)).toContain("c.position.set(-1, -0.5, 0);");
  });

  it("cores mantêm aspas e formato; nomes viram hexadecimal", () => {
    const code = HEAD + `const a = new THREE.MeshBasicMaterial({ color: 'red' });
const b = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const l = new THREE.PointLight(\`#fff\`);`;
    expect(edit(code, "a", "color", "#112233")).toContain("{ color: '#112233' }");
    expect(edit(code, "b", "color", "#112233")).toContain("{ color: 0x112233 }");
    expect(edit(code, "l", "color", "#112233")).toContain("new THREE.PointLight(`#112233`)");
  });

  it("cor dentro de new THREE.Color(…) e de .set(…)", () => {
    expect(edit(STARTER_CODE, "cena", "background", "#000000")).toContain('cena.background = new THREE.Color("#000000");');
    const code = HEAD + 'const m = new THREE.MeshBasicMaterial();\nm.color.set("#ffffff");';
    expect(edit(code, "m", "color", "#abcdef")).toContain('m.color.set("#abcdef");');
  });

  it("booleanos e inteiros", () => {
    expect(edit(STARTER_CODE, "cubo", "castShadow", false)).toContain("cubo.castShadow = false;");
    const code = HEAD + "const g = new THREE.SphereGeometry(1, 32, 16);";
    expect(edit(code, "g", "widthSegments", 12.7)).toContain("new THREE.SphereGeometry(1, 13, 16)");
  });
});

describe("ângulos", () => {
  it("dentro de degToRad muda só o número, em graus", () => {
    expect(edit(STARTER_CODE, "chao", "rotation.x", -Math.PI / 4)).toContain("chao.rotation.x = THREE.MathUtils.degToRad(-45);");
  });

  it("radiano escrito à mão continua em radianos", () => {
    const code = HEAD + "const c = new THREE.Mesh();\nc.rotation.y = 0.5;";
    expect(edit(code, "c", "rotation.y", Math.PI / 4)).toContain("c.rotation.y = 0.785;");
  });

  it("zero, Math.PI / 2 e vizinhos em graus viram degToRad", () => {
    const code = HEAD + `const c = new THREE.Mesh();
c.rotation.set(THREE.MathUtils.degToRad(10), 0.2, 0);
const d = new THREE.Mesh();
d.rotation.x = -Math.PI / 2;`;
    expect(edit(code, "c", "rotation.z", Math.PI / 2)).toContain("c.rotation.set(THREE.MathUtils.degToRad(10), 0.2, THREE.MathUtils.degToRad(90));");
    expect(edit(code, "c", "rotation.y", Math.PI)).toContain("THREE.MathUtils.degToRad(180), 0);");
    expect(edit(code, "d", "rotation.x", -Math.PI / 3)).toContain("d.rotation.x = THREE.MathUtils.degToRad(-60);");
  });

  it("rotação nova é escrita em graus", () => {
    const next = roundTrip(STARTER_CODE, "cubo", "rotation.y", Math.PI / 6);
    expect(next).toContain("cubo.rotation.y = THREE.MathUtils.degToRad(30);");
  });
});

describe("escrever o que o código ainda não define", () => {
  it("linha nova logo depois da última escrita do objeto, antes do cena.add", () => {
    const next = edit(STARTER_CODE, "cubo", "scale.x", 2);
    expect(next).toContain("cubo.castShadow = true;\ncubo.scale.set(2, 1, 1);\ncena.add(cubo);");
  });

  it("position.set completa os outros eixos com o valor atual da cena", () => {
    const code = HEAD + 'const sol = new THREE.DirectionalLight("#fff", 1);\ncena.add(sol);';
    // sem valor atual, usa o padrão do Three.js: luz direcional nasce em (0, 1, 0)
    expect(edit(code, "sol", "position.x", 3)).toContain('new THREE.DirectionalLight("#fff", 1);\nsol.position.set(3, 1, 0);\ncena.add(sol);');
    const current = (id, key) => ({ "position.y": 4, "position.z": -2 })[key];
    expect(edit(code, "sol", "position.x", 3, { current })).toContain("sol.position.set(3, 4, -2);");
  });

  it("um eixo só quando os outros já estão no código", () => {
    const code = HEAD + "const c = new THREE.Mesh();\nc.position.y = 1;";
    expect(edit(code, "c", "position.z", -2)).toContain("c.position.y = 1;\nc.position.z = -2;");
  });

  it("argumentos do construtor que faltam recebem os padrões do Three.js", () => {
    const code = HEAD + 'const p = new THREE.PointLight("#fff");\nconst g = new THREE.BoxGeometry();\nconst h = new THREE.HemisphereLight;';
    expect(edit(code, "p", "decay", 1)).toContain('new THREE.PointLight("#fff", 1, 0, 1)');
    expect(edit(code, "g", "depth", 3)).toContain("new THREE.BoxGeometry(1, 1, 3)");
    expect(edit(code, "h", "intensity", 0.5)).toContain('new THREE.HemisphereLight("#ffffff", "#ffffff", 0.5)');
    const spot = HEAD + "const s = new THREE.SpotLight();";
    expect(edit(spot, "s", "penumbra", 0.5)).toContain("new THREE.SpotLight(\"#ffffff\", 1, 0, THREE.MathUtils.degToRad(60), 0.5)");
  });

  it("opção nova no material, numa linha só", () => {
    expect(edit(STARTER_CODE, "cubo.material", "emissive", "#220000")).toContain(
      '{ color: "#4f8cff", roughness: 0.4, metalness: 0.1, emissive: "#220000" }',
    );
  });

  it("opção nova em objeto de várias linhas, com e sem vírgula no fim", () => {
    const multi = HEAD + `const m = new THREE.MeshStandardMaterial({
  color: "#ffffff", // cor
  roughness: 0.5 // aspereza
});`;
    expect(edit(multi, "m", "metalness", 1)).toContain('  roughness: 0.5, // aspereza\n  metalness: 1\n});');
    const trailing = HEAD + `const m = new THREE.MeshStandardMaterial({
    color: "#ffffff",
});`;
    expect(edit(trailing, "m", "wireframe", true)).toContain('    color: "#ffffff",\n    wireframe: true,\n});');
  });

  it("pontos: o tamanho troca o literal, e as opções novas entram no PointsMaterial, mesmo pelo objeto", () => {
    const code = HEAD + `const material = new THREE.PointsMaterial({ size: 0.03 });
const galaxia = new THREE.Points(new THREE.BufferGeometry(), material);
cena.add(galaxia);`;
    expect(roundTrip(code, "galaxia.material", "size", 0.05)).toContain("new THREE.PointsMaterial({ size: 0.05 });");
    expect(edit(code, "galaxia.material", "sizeAttenuation", false)).toContain("new THREE.PointsMaterial({ size: 0.03, sizeAttenuation: false });");
    expect(edit(code, "galaxia", "visible", false)).toContain("const galaxia = new THREE.Points(new THREE.BufferGeometry(), material);\ngalaxia.visible = false;");
  });

  it("material sem opções, com objeto vazio ou sem parênteses", () => {
    const code = HEAD + "const a = new THREE.MeshBasicMaterial();\nconst b = new THREE.MeshBasicMaterial({});\nconst c = new THREE.MeshBasicMaterial;";
    expect(edit(code, "a", "wireframe", true)).toContain("new THREE.MeshBasicMaterial({ wireframe: true });");
    expect(edit(code, "b", "opacity", 0.5)).toContain("new THREE.MeshBasicMaterial({ opacity: 0.5 });");
    expect(edit(code, "c", "color", "#ff0000")).toContain('new THREE.MeshBasicMaterial({ color: "#ff0000" });');
  });

  it("opções que não são um objeto literal: atribuição depois do material ou pela malha", () => {
    const code = HEAD + `const opcoes = { color: "red" };
const mat = new THREE.MeshStandardMaterial(opcoes);
const cubo = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(opcoes));`;
    expect(edit(code, "mat", "roughness", 0.25)).toContain("const mat = new THREE.MeshStandardMaterial(opcoes);\nmat.roughness = 0.25;");
    expect(edit(code, "cubo.material", "color", "#00ff00")).toContain('cubo.material.color.set("#00ff00");');
  });

  it("fundo da cena e flags do objeto", () => {
    const code = HEAD + "const cubo = new THREE.Mesh();\ncena.add(cubo);";
    expect(edit(code, "cena", "background", "#123456")).toContain('const cena = new THREE.Scene();\ncena.background = new THREE.Color("#123456");');
    expect(edit(code, "cubo", "castShadow", true)).toContain("const cubo = new THREE.Mesh();\ncubo.castShadow = true;\ncena.add(cubo);");
  });

  it("a posição da câmera vai antes do lookAt, para ele mirar do lugar novo", () => {
    const code = HEAD + "const camera = new THREE.PerspectiveCamera();\ncamera.lookAt(0, 0, 0);";
    expect(edit(code, "camera", "position.z", 5)).toContain(
      "const camera = new THREE.PerspectiveCamera();\ncamera.position.set(0, 0, 5);\ncamera.lookAt(0, 0, 0);",
    );
    expect(edit(code, "camera", "far", 50)).toContain("new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 50)");
  });

  it("linha nova vai no fim da linha da instrução, depois de comentários e de instruções na mesma linha", () => {
    const code = HEAD + `const c = new THREE.Mesh(); c.castShadow = true; cena.add(c); // cubo
const d = new THREE.Mesh(
  new THREE.BoxGeometry()
); /* d
  continua */ cena.add(d);
  const e = new THREE.Mesh();`;
    expect(edit(code, "c", "visible", false)).toContain("cena.add(c); // cubo\nc.visible = false;\nconst d");
    expect(edit(code, "d", "visible", false)).toContain("continua */ cena.add(d);\nd.visible = false;\n  const e");
    // o recuo segue o da instrução do objeto
    expect(edit(code, "e", "visible", false)).toMatch(/ {2}const e = new THREE\.Mesh\(\);\n {2}e\.visible = false;$/);
  });

  it("argumento novo entra depois dos parênteses do último argumento e respeita a vírgula final", () => {
    let code = edit(HEAD + "const camera = new THREE.PerspectiveCamera(75, (16 / 9));", "camera", "near", 0.2);
    expect(code).toContain("new THREE.PerspectiveCamera(75, (16 / 9), 0.2);");
    code = edit(code, "camera", "near", 0.3); // o mesmo campo passa a trocar o literal novo
    expect(code).toContain("new THREE.PerspectiveCamera(75, (16 / 9), 0.3);");
    expect(edit(HEAD + "const luz = new THREE.PointLight(0xffffff, (2));", "luz", "distance", 5)).toContain("new THREE.PointLight(0xffffff, (2), 5);");
    expect(edit(HEAD + 'const luz = new THREE.PointLight(\n  "#fff",\n  2,\n);', "luz", "distance", 5)).toContain("  2, 5,\n);");
  });

  it("com o lookAt na mesma linha, a posição entra logo antes dele", () => {
    const code = HEAD + "const cam = new THREE.PerspectiveCamera(); cam.lookAt(0, 0, 0);";
    expect(edit(code, "cam", "position.x", 1)).toContain(
      "const cam = new THREE.PerspectiveCamera(); cam.position.set(1, 0, 0); cam.lookAt(0, 0, 0);",
    );
  });

  it("depois de inserir, o mesmo campo passa a trocar o literal novo (arraste contínuo)", () => {
    let code = STARTER_CODE;
    for (const deg of [10, 20, 35]) code = roundTrip(code, "cubo", "rotation.x", (deg * Math.PI) / 180);
    expect(code.match(/cubo\.rotation\.x/g)).toHaveLength(1);
    expect(code).toContain("cubo.rotation.x = THREE.MathUtils.degToRad(35);");
  });
});

describe("o que não pode ser editado pela cena", () => {
  it("explica o motivo e a linha", () => {
    const code = HEAD + `const cubo = new THREE.Mesh();
function animar(tempo) {
  cubo.rotation.y = tempo;
}`;
    expect(errorOf(code, "cubo", "rotation.y", 1)).toBe("É animado em animar() (linha 4): edite pelo código.");
    const a = analyze(code);
    expect(editableAxes(a, find(a, "cubo").id, "rotation")).toEqual([true, false, true]);
  });

  it("objeto sem nome pede uma variável; geometria com argumento calculado não aceita edição", () => {
    const code = HEAD + "const l = 2;\ncena.add(new THREE.Mesh(new THREE.BoxGeometry(l, l, l), new THREE.MeshBasicMaterial()));";
    const a = analyze(code);
    const mesh = a.objects.find((o) => o.className === "Mesh");
    expect(editability(a, mesh.id, "position.x").message).toMatch(/Guarde o objeto numa variável/);
    expect(editability(a, mesh.links.geometry, "width")).toMatchObject({ editable: false, message: expect.stringMatching(/expressão/) });
    // mas o material inline aceita opções novas
    expect(editability(a, mesh.links.material, "color")).toEqual({ editable: true, via: "option" });
  });
});

describe("arraste do gizmo", () => {
  it("só escreve os eixos que mudaram", () => {
    const a = analyze(STARTER_CODE);
    const cubo = find(a, "cubo");
    const { changes, errors } = planTransform(a, cubo.id, "position", [1.5, 0.5, 0], [0, 0.5, 0]);
    expect(errors).toEqual([]);
    expect(changes).toHaveLength(1);
    expect(applyChanges(STARTER_CODE, changes)).toContain("cubo.position.set(1.5, 0.5, 0);");
    expect(planTransform(a, cubo.id, "position", [0.001, 0.5, 0], [0, 0.5, 0]).changes).toEqual([]);
  });

  it("eixos que o arraste não mexeu ficam como o código diz, mesmo com a cena desatualizada", () => {
    // o código já diz x = 2, mas a cena na tela ainda mostra x = 0 (a última execução deu erro)
    const code = STARTER_CODE.replace("cubo.position.set(0, 0.5, 0);", "cubo.position.set(2, 0.5, 0);");
    const a = analyze(code);
    const { changes } = planTransform(a, find(a, "cubo").id, "position", [0, 1.2, 0], [0, 0.5, 0], [false, true, false]);
    expect(applyChanges(code, changes)).toContain("cubo.position.set(2, 1.2, 0);");
  });

  it("escala nova completa com 1 os eixos que não mudaram", () => {
    const a = analyze(STARTER_CODE);
    const { changes } = planTransform(a, find(a, "cubo").id, "scale", [1, 2, 1], [1, 1, 1]);
    expect(applyChanges(STARTER_CODE, changes)).toContain("cubo.scale.set(1, 2, 1);");
  });

  it("eixo animado que muda no arraste vira erro, os outros são escritos", () => {
    const code = HEAD + `const cubo = new THREE.Mesh();
function animar(tempo) { cubo.rotation.y = tempo; }`;
    const a = analyze(code);
    const { changes, errors } = planTransform(a, find(a, "cubo").id, "rotation", [0.5, 1, 0], [0, 0.2, 0]);
    expect(errors.map((e) => e.key)).toEqual(["rotation.y"]);
    expect(applyChanges(code, changes)).toContain("cubo.rotation.x = THREE.MathUtils.degToRad(28.6);");
  });
});

describe("várias edições de uma vez", () => {
  it("argumentos, opções e linhas novas no mesmo plano", () => {
    const code = HEAD + `const luz = new THREE.PointLight("#fff");
luz.castShadow = true;
cena.add(luz);`;
    const a = analyze(code);
    const id = find(a, "luz").id;
    const { changes, errors } = planEdits(a, [
      { id, key: "distance", value: 10 },
      { id, key: "decay", value: 1 },
      { id, key: "color", value: "#ff0000" },
      { id, key: "position.y", value: 2 },
    ]);
    expect(errors).toEqual([]);
    expect(applyChanges(code, changes)).toBe(HEAD + `const luz = new THREE.PointLight("#ff0000", 1, 10, 1);
luz.castShadow = true;
luz.position.set(0, 2, 0);
cena.add(luz);`);
  });

  it("mergeChanges junta inserções no mesmo ponto e encosta inserção em troca", () => {
    expect(mergeChanges([
      { from: 5, to: 5, insert: "b" },
      { from: 1, to: 3, insert: "X" },
      { from: 3, to: 3, insert: "Y" },
      { from: 5, to: 5, insert: "c" },
    ])).toEqual([{ from: 1, to: 3, insert: "XY" }, { from: 5, to: 5, insert: "bc" }]);
  });
});

describe("números arrastáveis no editor", () => {
  it("passo e casas vêm do controle da propriedade, ou das casas do número", () => {
    const a = analyze(STARTER_CODE);
    const at = (text) => a.numbers.find((n) => n.from === STARTER_CODE.indexOf(text));
    expect(scrubInfo(a, at("0.4, metalness"))).toMatchObject({ step: 0.01, min: 0, max: 1 });
    expect(scrubInfo(a, at("-90)"))).toMatchObject({ step: 1, decimals: 0 });
    expect(scrubInfo(a, at("16 / 9"))).toEqual({ step: 1, decimals: 0 });
  });

  it("número negativo dentro de uma conta ganha parênteses", () => {
    const code = HEAD + "const x = 10 -2*3;\nconst y = 2 ** 3;";
    const a = analyze(code);
    for (const text of ["2*3", "2 ** 3"]) {
      const change = planNumber(a.numbers.find((n) => n.from === code.indexOf(text)), -1, 0);
      expect(change.insert).toBe("(-1)");
      expect(analyze(applyChanges(code, [change])).ok).toBe(true);
    }
  });

  it("número negativo depois de um operador ganha parênteses", () => {
    const a = analyze(HEAD + "const x = 2-1;");
    const one = a.numbers.find((n) => n.raw === "1");
    expect(planNumber(one, -1.5, 1)).toMatchObject({ insert: "(-1.5)" });
    expect(planNumber(one, 3, 1)).toMatchObject({ insert: "3" });
  });
});

describe("menu Adicionar", () => {
  it("com animar() antes da cena, o objeto novo vai para o fim do código", () => {
    const code = "function animar(tempo) {}\n" + HEAD;
    const next = applyChanges(code, planAddObject(analyze(code), "caixa").changes);
    expect(next.indexOf("cena.add(caixa);")).toBeGreaterThan(next.indexOf("const cena"));
    expect(analyze(next).diagnostics).toEqual([]);
  });

  it("cria o objeto antes de animar() e dos comentários dela, com nome livre", () => {
    const a = analyze(STARTER_CODE);
    const first = planAddObject(a, "caixa");
    expect(first.name).toBe("caixa");
    let code = applyChanges(STARTER_CODE, first.changes);
    expect(code).toContain("cena.add(caixa);\n\n// O VisuGraph chama animar()");
    const second = planAddObject(analyze(code), "caixa");
    expect(second.name).toBe("caixa2");
    code = applyChanges(code, second.changes);
    const after = analyze(code);
    expect(after.diagnostics).toEqual([]);
    expect(find(after, "caixa2").props["position.x"].status).toBe("slot");
  });

  it("sem animar() vai para o fim; sem cena, explica o que falta", () => {
    const code = HEAD + "const luz = new THREE.AmbientLight();";
    const add = planAddObject(analyze(code), "luzPontual");
    expect(applyChanges(code, add.changes)).toMatch(/AmbientLight\(\);\n\nconst luzPontual = new THREE\.PointLight\("#ffd27a", 8\);\nluzPontual\.position\.set\(1\.5, 2, 0\);\ncena\.add\(luzPontual\);\n$/);
    expect(planAddObject(analyze("const x = 1;"), "caixa").error).toMatch(/Crie a cena/);
  });
});
