import { describe, expect, it } from "vitest";
import { analyze, hasBlockingError } from "../../src/live/engine/analyze.js";
import { STARTER_CODE } from "../../src/live/engine/snippets.js";

const byName = (a, name) => a.objects.find((o) => o.name === name);
const materialOf = (a, name) => a.objects[byName(a, name).links.material];
const prop = (a, name, key) => byName(a, name).props[key];

describe("analyze() no código inicial", () => {
  const a = analyze(STARTER_CODE);

  it("encontra a cena, a câmera, as luzes e as malhas com seus nomes", () => {
    expect(a.ok).toBe(true);
    expect(a.diagnostics).toEqual([]);
    expect(a.scene.name).toBe("cena");
    expect(a.camera.name).toBe("camera");
    const named = a.objects.filter((o) => o.name).map((o) => `${o.name}:${o.className}`);
    expect(named).toEqual([
      "cena:Scene", "camera:PerspectiveCamera", "luzAmbiente:AmbientLight", "sol:DirectionalLight", "chao:Mesh", "cubo:Mesh",
    ]);
    expect(a.animar).not.toBeNull();
  });

  it("liga cada malha à sua geometria e ao seu material", () => {
    const cubo = byName(a, "cubo");
    expect(a.objects[cubo.links.geometry].className).toBe("BoxGeometry");
    expect(a.objects[cubo.links.material].owner).toBe(cubo.id);
    expect(a.objects[cubo.links.material].users).toEqual([cubo.id]);
  });

  it("acha o literal de cada propriedade escrita no código", () => {
    expect(prop(a, "cubo", "position.y")).toMatchObject({ status: "slot", slot: { kind: "number", value: 0.5, raw: "0.5" } });
    expect(prop(a, "cubo", "castShadow")).toMatchObject({ status: "slot", slot: { kind: "boolean", value: true } });
    expect(materialOf(a, "cubo").props.color).toMatchObject({ status: "slot", slot: { kind: "color", value: "#4f8cff", quote: '"' } });
    expect(prop(a, "cena", "background")).toMatchObject({ status: "slot", slot: { value: "#15171c" } });
    expect(prop(a, "sol", "intensity")).toMatchObject({ status: "slot", slot: { value: 2 } });
    expect(prop(a, "camera", "fov")).toMatchObject({ status: "slot", slot: { value: 50 } });
  });

  it("lê ângulos em graus dentro de THREE.MathUtils.degToRad", () => {
    const rx = prop(a, "chao", "rotation.x");
    expect(rx.status).toBe("slot");
    expect(rx.slot).toMatchObject({ unit: "deg", degrees: -90, raw: "-90" });
    expect(rx.slot.value).toBeCloseTo(-Math.PI / 2);
  });

  it("marca como ausente o que o código não define", () => {
    expect(prop(a, "cubo", "rotation.y")).toEqual({ status: "missing" });
    expect(prop(a, "cubo", "scale.x")).toEqual({ status: "missing" });
    expect(materialOf(a, "cubo").props.emissive).toEqual({ status: "missing" });
  });

  it("a rotação da câmera vem do lookAt() e não é editável pela cena", () => {
    expect(prop(a, "camera", "rotation.y")).toMatchObject({ status: "readonly", reason: "method" });
    expect(prop(a, "camera", "position.x").status).toBe("slot");
  });

  it("cada trecho do código aponta para o objeto da cena que ele cria ou altera", () => {
    const cubo = byName(a, "cubo");
    const line = STARTER_CODE.indexOf("cubo.castShadow");
    const inner = a.intervals.find((i) => i.from <= line && line < i.to);
    expect(inner.ids).toEqual([cubo.id]);
    // o material inline aponta para a malha dona dele
    const mat = STARTER_CODE.indexOf('color: "#4f8cff"');
    expect(a.intervals.find((i) => i.from <= mat && mat < i.to).ids).toEqual([cubo.id]);
  });

  it("liga os números do código às propriedades que eles definem", () => {
    const n = a.numbers.find((x) => x.from === STARTER_CODE.indexOf("0.4, metalness") );
    expect(n.slot).toMatchObject({ key: "roughness" });
    const aspect = a.numbers.find((x) => x.raw === "16");
    expect(aspect.slot).toBeNull();
  });
});

describe("analyze(): erros de sintaxe em português", () => {
  it("parêntese sem fechar no fim do código", () => {
    const a = analyze("const cena = new THREE.Scene();\ncena.add(cubo");
    expect(a.ok).toBe(false);
    expect(a.error.message).toMatch(/terminou antes da hora/);
    expect(a.diagnostics[0]).toMatchObject({ severity: "error", source: "sintaxe" });
  });

  it("símbolo inesperado com linha e coluna", () => {
    const a = analyze("const a = 1;\nconst b = ;\n");
    expect(a.error).toMatchObject({ message: "Símbolo inesperado", line: 2 });
  });

  it("recusa import/export e await fora de função", () => {
    expect(analyze('import * as THREE from "three";').error.message).toMatch(/import\/export/);
    expect(analyze("await fetch('x');").error.message).toMatch(/await/);
  });

  it("nome usado pelo VisuGraph bloqueia a execução", () => {
    const a = analyze("const THREE = 1;\nconst cena = new THREE.Scene();");
    expect(a.ok).toBe(true);
    expect(hasBlockingError(a)).toBe(true);
    expect(a.diagnostics.find((d) => d.severity === "error").message).toMatch(/THREE já é usado/);
  });
});

describe("analyze(): o que sai do subconjunto editável", () => {
  it("objetos criados num laço aparecem na cena, mas só se editam pelo código", () => {
    const a = analyze(`const cena = new THREE.Scene();
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  m.position.x = i;
  cena.add(m);
}`);
    const mesh = a.objects.find((o) => o.className === "Mesh");
    expect(mesh.context).toBe("loop");
    expect(mesh.props["position.x"]).toMatchObject({ status: "readonly", reason: "loop" });
    expect(a.diagnostics.some((d) => d.severity === "info" && /laço/.test(d.message))).toBe(true);
  });

  it("objeto criado dentro de animar() gera aviso", () => {
    const a = analyze(`const cena = new THREE.Scene();
function animar(tempo) {
  cena.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
}`);
    expect(a.diagnostics.some((d) => d.severity === "warning" && /a cada quadro/.test(d.message))).toBe(true);
  });

  it("propriedade animada fica só no código; as outras continuam editáveis", () => {
    const a = analyze(`const cena = new THREE.Scene();
const cubo = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
cubo.rotation.y = 0.5;
function animar(tempo) {
  cubo.rotation.y = tempo;
}`);
    expect(prop(a, "cubo", "rotation.y")).toMatchObject({ status: "readonly", reason: "animated", line: 5 });
    expect(prop(a, "cubo", "rotation.x").status).toBe("missing");
  });

  it("escritas em funções (eventos), expressões e += não são editáveis pela cena", () => {
    const a = analyze(`const cena = new THREE.Scene();
const cubo = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
const base = 2;
cubo.position.x = base * 2;
cubo.position.y += 1;
window.addEventListener("keydown", () => { cubo.position.z = 3; });`);
    expect(prop(a, "cubo", "position.x")).toMatchObject({ status: "readonly", reason: "expression", line: 4 });
    expect(prop(a, "cubo", "position.y")).toMatchObject({ status: "readonly", reason: "relative" });
    expect(prop(a, "cubo", "position.z")).toMatchObject({ status: "readonly", reason: "dynamic" });
  });

  it("expressões só com números e Math.PI continuam editáveis", () => {
    const a = analyze(`const cena = new THREE.Scene();
const chao = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
chao.rotation.x = -Math.PI / 2;
chao.position.y = 1 / 4;`);
    expect(prop(a, "chao", "rotation.x")).toMatchObject({ status: "slot", slot: { expr: true, raw: "-Math.PI / 2" } });
    expect(prop(a, "chao", "rotation.x").slot.value).toBeCloseTo(-Math.PI / 2);
    expect(prop(a, "chao", "position.y").slot).toMatchObject({ expr: true, value: 0.25 });
  });

  it("a ordem das instruções importa: vale a última escrita do topo", () => {
    const a = analyze(`const cena = new THREE.Scene();
let m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
m.position.x = 1;
cena.add(m);
m = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
m.position.x = 2;
m.position.x = 3;`);
    const meshes = a.objects.filter((o) => o.className === "Mesh");
    expect(meshes[0].props["position.x"].slot.value).toBe(1);
    expect(meshes[1].props["position.x"].slot.value).toBe(3);
  });

  it("material alterado pela malha (cubo.material.color.set) e material compartilhado", () => {
    const a = analyze(`const cena = new THREE.Scene();
const mat = new THREE.MeshStandardMaterial({ color: "red" });
const a1 = new THREE.Mesh(new THREE.BoxGeometry(), mat);
const a2 = new THREE.Mesh(new THREE.BoxGeometry(), mat);
a1.material.color.set(0x00ff00);
a1.material.roughness = 0.3;`);
    const mat = byName(a, "mat");
    expect(mat.users).toEqual([byName(a, "a1").id, byName(a, "a2").id]);
    expect(mat.props.color).toMatchObject({ status: "slot", slot: { format: "number", value: "#00ff00" } });
    expect(mat.props.roughness.slot.value).toBe(0.3);
  });

  it("avisa sobre WebGLRenderer e requestAnimationFrame, que o VisuGraph já faz", () => {
    const a = analyze(`const cena = new THREE.Scene();
const r = new THREE.WebGLRenderer();
function loop() { requestAnimationFrame(loop); }`);
    expect(a.diagnostics.some((d) => /renderizador/.test(d.message))).toBe(true);
    expect(a.diagnostics.some((d) => /function animar/.test(d.message))).toBe(true);
  });

  it("sem cena, avisa como começar", () => {
    const a = analyze("const cubo = new THREE.Mesh();");
    expect(a.diagnostics.some((d) => /Nenhuma cena/.test(d.message))).toBe(true);
  });
});
