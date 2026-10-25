import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { shaderError, translateShaderError } from "../../src/live/engine/errors.js";
import { sceneFacts } from "../../src/live/runtime/facts.js";
import { belongsTo, failureInfo, firstError, samplePixels } from "../../src/live/runtime/shaders.js";

// O que o three.js põe na frente do texto de um ShaderMaterial, com o mesmo número de linhas de verdade.
const PREFIX = "#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n";
const vertexShader = "\n  void main() {\n    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  }\n";
const fragmentShader = "\n  uniform vec3 uCor;\n\n  void main() {\n    gl_FragColor = vec4(uCor, 1.0);\n  }\n";
const material = { vertexShader, fragmentShader };
const prefixLines = PREFIX.split("\n").length - 1;

/** Um programa que não compilou, como o visor anota: o registro e o texto de cada shader. */
const failure = ({ vertex = "", fragment = "", program = "" } = {}) => ({
  stages: [
    { stage: "vertex", log: vertex, source: PREFIX + vertexShader },
    { stage: "fragment", log: fragment, source: PREFIX + fragmentShader },
  ],
  programLog: program,
});

describe("o erro de um shader que não compilou", () => {
  it("o primeiro erro do registro, com a linha; o seguinte quando o primeiro só diz que as dimensões não batem", () => {
    expect(firstError("ERROR: 0:112: 'uLuz' : undeclared identifier\nERROR: 0:112: 'dot' : no matching overloaded function found\n")).toEqual({
      line: 112,
      message: "'uLuz' : undeclared identifier",
    });
    expect(
      firstError("ERROR: 0:40: '=' : dimension mismatch\nERROR: 0:40: '=' : cannot convert from 'highp 4-component vector of float' to 'highp 3-component vector of float'\n"),
    ).toEqual({ line: 40, message: "'=' : cannot convert from 'highp 4-component vector of float' to 'highp 3-component vector of float'" });
    expect(firstError("ERROR: Missing main()\n")).toEqual({ line: null, message: "Missing main()" });
    expect(firstError("")).toBeNull();
    expect(firstError(null)).toBeNull();
  });

  it("a linha do erro contada no texto do material, sem as linhas que o three.js põe na frente", () => {
    const line = prefixLines + 5; // a do gl_FragColor
    expect(failureInfo(failure({ fragment: `ERROR: 0:${line}: 'uCor' : undeclared identifier\n` }), material)).toEqual({
      stage: "fragment",
      message: "'uCor' : undeclared identifier",
      line: 5,
      source: fragmentShader,
    });
    // o primeiro shader com erro é o que conta
    expect(failureInfo(failure({ vertex: `ERROR: 0:${prefixLines + 3}: 'x' : undeclared identifier\n`, fragment: `ERROR: 0:${line}: 'y' : syntax error\n` }), material).stage).toBe("vertex");
    // um erro nas linhas do three.js não tem linha no código
    expect(failureInfo(failure({ fragment: "ERROR: 0:2: 'x' : syntax error\n" }), material)).toEqual({ stage: "fragment", message: "'x' : syntax error", line: null, source: null });
  });

  it("quando os dois compilam mas não se encaixam, o erro é do par, sem linha", () => {
    expect(failureInfo(failure({ program: "FRAGMENT varying vNormais does not match any VERTEX varying" }), material)).toEqual({
      stage: "link",
      message: "FRAGMENT varying vNormais does not match any VERTEX varying",
      line: null,
      source: null,
    });
  });

  it("um programa é do material quando o que foi compilado termina com os textos dele", () => {
    expect(belongsTo(failure(), material)).toBe(true);
    expect(belongsTo(failure(), { vertexShader, fragmentShader: "void main() {}" })).toBe(false);
    expect(belongsTo(failure(), { vertexShader })).toBe(false);
  });
});

describe("os erros do GLSL em português", () => {
  it("cada mensagem do compilador vira uma explicação, com os tipos como no código", () => {
    const cases = [
      ["'uLuz' : undeclared identifier", "'uLuz' não existe: confira se o nome está escrito igual onde foi declarado. No GLSL, cada uniform e cada varying também precisa ser declarado no shader que o usa, antes do main."],
      ["'pc_fragColor' : syntax error", "Erro de sintaxe perto de 'gl_FragColor': confira os parênteses, as vírgulas e o ; no fim da linha."],
      ["'' : syntax error", "Erro de sintaxe no fim do shader: confira se cada { tem o seu }."],
      ["'=' : cannot convert from 'const int' to 'highp float'", "No GLSL, um número inteiro não vira float sozinho: escreva 1.0 em vez de 1."],
      [
        "'=' : cannot convert from 'highp 4-component vector of float' to 'highp 3-component vector of float'",
        "Um vec4 não cabe num vec3: pegue só os primeiros números, com .xyz ou .xy.",
      ],
      ["'=' : cannot convert from 'highp 3-component vector of float' to 'highp 4-component vector of float'", "Um vec3 não cabe num vec4: complete os que faltam, como em vec4(cor, 1.0)."],
      [
        "'*' : wrong operand types - no operation '*' exists that takes a left-hand operand of type 'const float' and a right operand of type 'const int' (or there is no acceptable conversion)",
        "No GLSL, não dá para fazer float * int: escreva os números inteiros com .0 (2.0, e não 2).",
      ],
      [
        "'*' : wrong operand types - no operation '*' exists that takes a left-hand operand of type 'uniform highp 4X4 matrix of float' and a right operand of type 'in highp 3-component vector of float' (or there is no acceptable conversion)",
        "Não dá para fazer mat4 * vec3: a matriz 4 × 4 precisa de um vec4, como vec4(position, 1.0).",
      ],
      ["'pow' : no matching overloaded function found", "pow() não aceita esses argumentos: confira o tipo de cada um e escreva os números inteiros com .0 (pow(x, 2.0), e não pow(x, 2))."],
      ["'luz' : no matching overloaded function found", "A função 'luz' não existe com esses argumentos: ela precisa vir antes de quem a chama, e cada argumento, ter o tipo que ela pede."],
      ["'d' : redefinition", "'d' já foi declarado antes neste shader. Para mudar o valor, tire o tipo da frente: d = …;"],
      ["'constructor' : not enough data provided for construction", "Faltam números para montar o vetor: um vec3 leva três, e um vec4, quatro (ou um só, que vale para todos)."],
      ["'constructor' : too many arguments", "Números demais para montar o vetor: um vec3 leva três, e um vec4, quatro."],
      ["'assign' : l-value required (can't modify a uniform \"uCor\")", "'uCor' é um uniform: o shader só lê o valor que vem do JavaScript. Para fazer contas com ele, guarde numa variável nova."],
      ["'assign' : l-value required (can't modify an input \"vNormal\")", "'vNormal' chega do shader de vértices e aqui só pode ser lido. Para fazer contas com ele, guarde numa variável nova."],
      ["Missing main()", "Falta a função main(): é por ela que a placa de vídeo começa o shader."],
      ["'luz' : function does not return a value:", "A função 'luz' não devolve nada: falta o return."],
      ["'return' : function return is not matching type:", "O return devolve um tipo diferente do que a função promete: uma função float precisa devolver um float."],
      ["'w' : vector field selection out of range", "O vetor não tem o componente 'w': um vec2 tem x e y, e um vec3, x, y e z."],
      ["'' : boolean expression expected", "O if precisa de uma comparação, como n.y > 0.0, e não de um número."],
      ["'?:' : mismatching ternary operator operand types 'const float and 'const int'", "Os dois lados do ? : precisam ser do mesmo tipo: 1.0 : 0.0, e não 1.0 : 0."],
      ["'input' : Illegal use of reserved word", "'input' é uma palavra reservada do GLSL: escolha outro nome."],
      [
        "FRAGMENT varying vNormais does not match any VERTEX varying",
        "O shader de fragmentos recebe 'vNormais', mas o de vértices não manda nenhum varying com esse nome: os dois precisam declarar o mesmo varying, com o mesmo nome e o mesmo tipo.",
      ],
      ["Types of varying 'vNormal' differ between VERTEX and FRAGMENT shaders.", "O varying 'vNormal' tem um tipo em cada shader: os dois precisam declará-lo igual."],
    ];
    for (const [message, text] of cases) expect(translateShaderError(message), message).toBe(text);
    expect(translateShaderError("'x' : algo novo")).toBe("'x' : algo novo");
    expect(translateShaderError("")).toBe("O shader não compilou.");
  });

  it("o ; esquecido, que o compilador só percebe na linha de baixo, vai para a linha de cima", () => {
    const source = "\n  void main() {\n    vec3 cor = vec3(1.0)\n    // a cor\n\n    gl_FragColor = vec4(cor, 1.0);\n  }\n";
    const missing = { line: 3, text: "Falta um ; no fim desta linha: o compilador só percebe na linha de baixo, onde encontra o que não esperava." };
    expect(shaderError("'pc_fragColor' : syntax error", source, 6)).toEqual(missing);
    // a linha de cima termina com ; ou { : o erro fica onde está
    expect(shaderError("'gl_FragColor' : syntax error", source.replace("vec3(1.0)", "vec3(1.0);"), 6)).toEqual({
      line: 6,
      text: "Erro de sintaxe perto de 'gl_FragColor': confira os parênteses, as vírgulas e o ; no fim da linha.",
    });
    // o símbolo do erro no meio da linha não é o começo da de baixo
    expect(shaderError("'+' : syntax error", source, 6).line).toBe(6);
    expect(shaderError("'uCor' : undeclared identifier", source, 6).line).toBe(6);
  });
});

describe("os fatos de um ShaderMaterial", () => {
  it("os uniforms vão como o shader os recebe: as cores no espaço linear, os vetores e as matrizes como listas", () => {
    const scene = new THREE.Scene();
    const shader = new THREE.ShaderMaterial({
      uniforms: {
        uNumero: { value: 0.5 },
        uLigado: { value: true },
        uCor: { value: new THREE.Color("#3f7fd9") },
        uDirecao: { value: new THREE.Vector3(1, 2, 3) },
        uMatriz: { value: new THREE.Matrix4().makeTranslation(1, 2, 3) },
        uTextura: { value: new THREE.Texture() },
      },
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), shader);
    scene.add(mesh);
    const facts = sceneFacts({ scene, camera: null, entries: [[1, mesh]], idOf: () => 1 });
    const { uniforms } = facts.objects[1].material;
    expect(uniforms.uNumero).toEqual({ type: "number", value: 0.5 });
    expect(uniforms.uLigado).toEqual({ type: "boolean", value: true });
    expect(uniforms.uCor.type).toBe("color");
    uniforms.uCor.value.forEach((c, k) => expect(c).toBeCloseTo([0.0497, 0.2122, 0.6939][k], 3));
    expect(uniforms.uDirecao).toEqual({ type: "vector", value: [1, 2, 3] });
    expect(uniforms.uMatriz.value[0]).toEqual([1, 0, 0, 1]);
    expect(uniforms.uTextura).toEqual({ type: "other", value: null });
  });
});

describe("os pixels de uma malha", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial());
  sphere.position.x = -0.5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  box.position.set(0.9, 0, 1);
  scene.add(sphere, box);
  const read = (x, y) => [x % 256, y % 256, 7];

  it("cada pixel da malha leva o ponto da superfície, a normal ali e a cor; os da folga dizem se mostram outro objeto", () => {
    const { inside, outside } = samplePixels({ scene, camera, mesh: sphere, width: 128, height: 128, read });
    expect(inside.length).toBeGreaterThan(100);
    for (const { p, n, c } of inside) {
      expect(Math.hypot(p[0] + 0.5, p[1], p[2])).toBeGreaterThan(0.99); // na esfera
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      const toEye = new THREE.Vector3(...camera.position.toArray()).sub(new THREE.Vector3(...p)).normalize();
      expect(toEye.dot(new THREE.Vector3(...n))).toBeGreaterThan(0.2); // de frente para a câmera, sem os da borda
      expect(c[2]).toBe(7);
    }
    expect(outside.some((s) => s.other)).toBe(true); // a caixa, na frente de um pedaço da folga
    expect(outside.some((s) => !s.other)).toBe(true);
  });

  it("os raios da malha ficam guardados, mas o que passa na frente dela é visto a cada vez", () => {
    const sample = () => samplePixels({ scene, camera, mesh: sphere, width: 128, height: 128, read });
    const first = sample();
    // uma bolinha na frente da esfera, como uma lâmpada que dá a volta
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial());
    ball.position.set(-0.5, 0, 2);
    scene.add(ball);
    const covered = sample();
    expect(covered.inside.length).toBeLessThan(first.inside.length - 10);
    expect(covered.outside.filter((s) => s.other).length).toBeGreaterThan(first.outside.filter((s) => s.other).length);
    ball.position.y = 5; // saiu da frente
    expect(sample()).toEqual(first);
    scene.remove(ball);

    // com a câmera em outro lugar, os raios são outros
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 0, 0);
    const near = sample();
    expect(near.inside.length).toBeGreaterThan(100);
    expect(near.inside.map((s) => s.p)).not.toEqual(first.inside.map((s) => s.p));
    for (const { p } of near.inside) expect(Math.hypot(p[0] + 0.5, p[1], p[2])).toBeGreaterThan(0.99);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);
    expect(sample()).toEqual(first);
  });

  it("uma malha escondida ou fora da vista não tem pixels", () => {
    sphere.visible = false;
    expect(samplePixels({ scene, camera, mesh: sphere, width: 128, height: 128, read }).inside).toEqual([]);
    sphere.visible = true;
    sphere.position.x = 40;
    expect(samplePixels({ scene, camera, mesh: sphere, width: 128, height: 128, read }).inside).toEqual([]);
    sphere.position.x = -0.5;
  });
});
