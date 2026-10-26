// gpu.js — uma placa de vídeo de mentira, para os testes dos projetos de shader. No app, a
// conferência mede os pixels que a placa de vídeo pintou (os fatos `shader`, que o visor monta
// em src/live/runtime/viewport.js); aqui, os shaders do ShaderMaterial rodam em JavaScript, e só
// os pixels que a conferência pede são desenhados.
//
// O GLSL daqui é o pedaço que os projetos usam: float, int, bool, vec2, vec3, vec4, mat3 e mat4,
// uniforms, varyings, funções, if, ? : e as funções da linguagem para esses tipos, sem laços nem
// texturas. Os nomes que o three.js declara (position, normal, as matrizes, cameraPosition) valem
// o que ele daria. Antes de rodar, os nomes são conferidos como o compilador confere, com as
// mesmas mensagens: um nome que não existe, uma função usada antes de escrita, um uniform que
// recebe valor, um varying que o shader de vértices não manda. Conferido, o shader vira uma
// função de JavaScript, que roda para cada vértice e para cada pixel pedido.
//
// O desenho segue o da placa de vídeo: o shader de vértices leva cada vértice para a tela; num
// pixel coberto por um triângulo (os de costas ficam de fora, como no FrontSide), os varyings
// chegam misturados entre os três vértices, com a correção da perspectiva, e fica o mais perto da
// câmera, com a profundidade dele. As outras malhas (o gabarito, com um material do three.js)
// entram pelo raio que sai da câmera, cinzas; a malha de um shader que não compila sai magenta,
// como no visor.

import * as THREE from "three";

/** Um erro de compilação: a mensagem como o WebGL escreve, a linha no texto do shader (1 é a primeira) e o shader. */
export class GlslError extends Error {
  constructor(message, line = null) {
    super(message);
    this.line = line;
    this.stage = null;
  }
}

// ---------------------------------------------------------------------------
// O texto em símbolos

const TOKENS =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|([A-Za-z_]\w*)|(\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||[-+*/=<>!?:;,(){}[\].])/y;

function tokenize(text) {
  const tokens = [];
  let line = 1;
  TOKENS.lastIndex = 0;
  while (TOKENS.lastIndex < text.length) {
    const at = TOKENS.lastIndex;
    const m = TOKENS.exec(text);
    if (!m) throw new GlslError(`'${text[at]}' : invalid character`, line);
    const [all, number, name, op] = m;
    if (number) tokens.push({ kind: "number", text: number, line });
    else if (name) tokens.push({ kind: "name", text: name, line });
    else if (op) tokens.push({ kind: "op", text: op, line });
    for (const ch of all) if (ch === "\n") line++;
  }
  tokens.push({ kind: "end", text: "", line });
  return tokens;
}

// ---------------------------------------------------------------------------
// Os símbolos em árvore

const TYPES = new Set(["void", "float", "int", "bool", "vec2", "vec3", "vec4", "mat3", "mat4"]);
const PRECISION = new Set(["highp", "mediump", "lowp"]);
const STORAGE = new Set(["uniform", "varying", "attribute"]);
const ASSIGN = new Set(["=", "+=", "-=", "*=", "/="]);
const BINARY = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/"]];
const MISSING = new Set(["for", "while", "do", "switch", "break", "continue", "struct", "out", "inout", "sampler2D"]);

/**
 * A árvore de um shader: o que ele declara e as funções, na ordem do texto (`items`). Cada nó
 * leva a linha onde está, para as mensagens de erro.
 */
function parse(text) {
  const tokens = tokenize(text);
  let i = 0;
  const peek = (k = 0) => tokens[Math.min(i + k, tokens.length - 1)];
  const is = (t) => peek().kind !== "number" && peek().text === t;
  const syntax = () => {
    const t = peek();
    if (MISSING.has(t.text)) return new GlslError(`'${t.text}' : não há neste GLSL de teste`, t.line);
    return new GlslError(`'${t.text}' : syntax error`, t.line);
  };
  const take = (t) => {
    if (!is(t)) throw syntax();
    return tokens[i++];
  };
  const name = () => {
    if (peek().kind !== "name" || TYPES.has(peek().text)) throw syntax();
    return tokens[i++];
  };
  const type = () => {
    while (PRECISION.has(peek().text)) i++;
    if (!TYPES.has(peek().text)) throw syntax();
    return tokens[i++].text;
  };
  /** Os nomes de uma declaração (`float a = 1.0, b;`), até o ;. */
  const names = (init) => {
    const list = [];
    for (;;) {
      const n = name();
      let value = null;
      if (init && is("=")) {
        i++;
        value = assignment();
      }
      list.push({ name: n.text, line: n.line, init: value });
      if (!is(",")) break;
      i++;
    }
    take(";");
    return list;
  };

  function primary() {
    const t = peek();
    if (t.kind === "number") {
      i++;
      return { kind: "value", value: Number(t.text), line: t.line };
    }
    if (t.kind === "name" && (t.text === "true" || t.text === "false")) {
      i++;
      return { kind: "value", value: t.text === "true", line: t.line };
    }
    if (t.kind === "name") {
      i++;
      if (!is("(")) return { kind: "name", name: t.text, line: t.line };
      i++;
      const args = [];
      while (!is(")")) {
        args.push(assignment());
        if (!is(")")) take(",");
      }
      i++;
      return { kind: "call", name: t.text, args, line: t.line };
    }
    if (is("(")) {
      i++;
      const inner = assignment();
      take(")");
      return inner;
    }
    throw syntax();
  }
  function postfix() {
    let node = primary();
    for (;;) {
      if (is(".")) {
        const line = tokens[i++].line;
        node = { kind: "field", of: node, field: name().text, line };
      } else if (is("[")) {
        i++;
        node = { kind: "index", of: node, index: assignment(), line: node.line };
        take("]");
      } else return node;
    }
  }
  function unary() {
    if (is("-") || is("+") || is("!")) {
      const op = tokens[i++];
      return { kind: "unary", op: op.text, of: unary(), line: op.line };
    }
    return postfix();
  }
  function binary(level = 0) {
    if (level === BINARY.length) return unary();
    let node = binary(level + 1);
    while (peek().kind === "op" && BINARY[level].includes(peek().text)) {
      const op = tokens[i++];
      node = { kind: "binary", op: op.text, left: node, right: binary(level + 1), line: op.line };
    }
    return node;
  }
  function ternary() {
    const test = binary();
    if (!is("?")) return test;
    const line = tokens[i++].line;
    const yes = assignment();
    take(":");
    return { kind: "ternary", test, yes, no: assignment(), line };
  }
  function assignment() {
    const target = ternary();
    if (peek().kind !== "op" || !ASSIGN.has(peek().text)) return target;
    const op = tokens[i++];
    return { kind: "assign", op: op.text, target, value: assignment(), line: op.line };
  }

  function block() {
    take("{");
    const body = [];
    while (!is("}")) {
      if (peek().kind === "end") throw syntax();
      body.push(statement());
    }
    i++;
    return { kind: "block", body };
  }
  function statement() {
    const t = peek();
    if (is("{")) return block();
    if (is(";")) {
      i++;
      return { kind: "block", body: [] };
    }
    if (is("return")) {
      i++;
      const value = is(";") ? null : assignment();
      take(";");
      return { kind: "return", value, line: t.line };
    }
    if (is("if")) {
      i++;
      take("(");
      const test = assignment();
      take(")");
      const then = statement();
      let otherwise = null;
      if (is("else")) {
        i++;
        otherwise = statement();
      }
      return { kind: "if", test, then, otherwise, line: t.line };
    }
    if (is("discard")) {
      i++;
      take(";");
      return { kind: "discard", line: t.line };
    }
    if (MISSING.has(t.text)) throw syntax();
    if (is("const")) i++;
    if (PRECISION.has(peek().text) || (TYPES.has(peek().text) && peek(1).kind === "name")) {
      const ty = type();
      return { kind: "declare", type: ty, decls: names(true), line: t.line };
    }
    const expr = assignment();
    take(";");
    return { kind: "expr", expr, line: t.line };
  }

  const items = [];
  while (peek().kind !== "end") {
    const t = peek();
    if (is("precision")) {
      while (!is(";")) {
        if (peek().kind === "end") throw syntax();
        i++;
      }
      i++;
      continue;
    }
    if (STORAGE.has(t.text)) {
      i++;
      const ty = type();
      items.push({ kind: "storage", storage: t.text, type: ty, decls: names(false), line: t.line });
      continue;
    }
    if (is("const")) i++;
    const ty = type();
    const n = name();
    if (!is("(")) {
      i--;
      items.push({ kind: "declare", type: ty, decls: names(true), line: t.line });
      continue;
    }
    i++;
    const params = [];
    if (is("void") && peek(1).text === ")") i++;
    while (!is(")")) {
      if (is("in") || is("const")) i++;
      const pt = type();
      params.push({ type: pt, name: name().text });
      if (!is(")")) take(",");
    }
    i++;
    if (is(";")) {
      i++; // só a assinatura: a função vem depois
      continue;
    }
    items.push({ kind: "function", type: ty, name: n.text, params, body: block(), line: n.line });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Os nomes, conferidos como o compilador confere

/** Os nomes que o three.js declara antes do texto de cada shader de um ShaderMaterial, com o tipo. */
const DECLARED = {
  vertex: {
    position: "vec3",
    normal: "vec3",
    uv: "vec2",
    modelMatrix: "mat4",
    modelViewMatrix: "mat4",
    projectionMatrix: "mat4",
    viewMatrix: "mat4",
    normalMatrix: "mat3",
    cameraPosition: "vec3",
    isOrthographic: "bool",
    gl_Position: "vec4",
    gl_PointSize: "float",
  },
  fragment: { viewMatrix: "mat4", cameraPosition: "vec3", isOrthographic: "bool", gl_FragColor: "vec4", gl_FragCoord: "vec4", gl_FrontFacing: "bool" },
};
const OUTPUTS = new Set(["gl_Position", "gl_PointSize", "gl_FragColor"]);
const ATTRIBUTES = new Set(["position", "normal", "uv"]);
const CONSTRUCTORS = new Set(["float", "int", "bool", "vec2", "vec3", "vec4", "mat3", "mat4"]);

const hasReturn = (node) =>
  node.kind === "return" || (node.kind === "block" && node.body.some(hasReturn)) || (node.kind === "if" && (hasReturn(node.then) || (node.otherwise && hasReturn(node.otherwise))));

/**
 * Confere os nomes de um shader, na ordem do texto: cada nome usado precisa estar declarado
 * antes, e cada função, escrita antes de quem a chama. Devolve os varyings e os uniforms
 * declarados ({ nome: tipo }) e os nomes usados nas contas.
 */
function verify(items, stage) {
  const global = new Map();
  for (const [n] of Object.entries(DECLARED[stage])) global.set(n, OUTPUTS.has(n) ? "var" : n.startsWith("gl_") || ATTRIBUTES.has(n) ? "input" : "uniform");
  const scopes = [global];
  const functions = new Set();
  const varyings = {};
  const uniforms = {};
  const used = new Set();
  const find = (n) => {
    for (let k = scopes.length - 1; k >= 0; k--) if (scopes[k].has(n)) return scopes[k].get(n);
    return null;
  };
  const declare = (n, what, line) => {
    const top = scopes.at(-1);
    if (top.has(n) || (top === global && functions.has(n))) throw new GlslError(`'${n}' : redefinition`, line);
    top.set(n, what);
  };

  function expr(node) {
    switch (node.kind) {
      case "name":
        if (!find(node.name)) throw new GlslError(`'${node.name}' : undeclared identifier`, node.line);
        used.add(node.name);
        return;
      case "field":
      case "unary":
        return expr(node.of);
      case "index":
        expr(node.of);
        return expr(node.index);
      case "binary":
        expr(node.left);
        return expr(node.right);
      case "ternary":
        expr(node.test);
        expr(node.yes);
        return expr(node.no);
      case "assign": {
        expr(node.value);
        let base = node.target;
        while (base.kind === "field" || base.kind === "index") base = base.of;
        if (base.kind !== "name") throw new GlslError("'assign' : l-value required", node.line);
        const what = find(base.name);
        if (!what) throw new GlslError(`'${base.name}' : undeclared identifier`, base.line);
        if (what === "uniform") throw new GlslError(`'assign' : l-value required (can't modify a uniform "${base.name}")`, node.line);
        if (what === "input") throw new GlslError(`'assign' : l-value required (can't modify an input "${base.name}")`, node.line);
        if (node.op !== "=") used.add(base.name);
        return;
      }
      case "call":
        for (const a of node.args) expr(a);
        if (!functions.has(node.name) && !CONSTRUCTORS.has(node.name) && !BUILTINS[node.name]) throw new GlslError(`'${node.name}' : no matching overloaded function found`, node.line);
        return;
      default:
    }
  }
  function statement(node, fn) {
    switch (node.kind) {
      case "block":
        scopes.push(new Map());
        for (const s of node.body) statement(s, fn);
        scopes.pop();
        return;
      case "declare":
        for (const d of node.decls) {
          if (d.init) expr(d.init);
          declare(d.name, "var", d.line);
        }
        return;
      case "expr":
        return expr(node.expr);
      case "return":
        if (node.value) expr(node.value);
        if (fn.type !== "void" && !node.value) throw new GlslError("'return' : non-void function must return a value", node.line);
        if (fn.type === "void" && node.value) throw new GlslError("'return' : void function cannot return a value", node.line);
        return;
      case "if":
        expr(node.test);
        statement(node.then, fn);
        if (node.otherwise) statement(node.otherwise, fn);
        return;
      default:
    }
  }

  for (const item of items) {
    if (item.kind === "storage") {
      for (const d of item.decls) {
        if (item.storage === "varying") varyings[d.name] = item.type;
        if (item.storage === "uniform") uniforms[d.name] = item.type;
        declare(d.name, item.storage === "uniform" || item.storage === "attribute" || stage === "fragment" ? (item.storage === "uniform" ? "uniform" : "input") : "var", d.line);
      }
    } else if (item.kind === "declare") statement(item, null);
    else {
      if (functions.has(item.name) || global.has(item.name)) throw new GlslError(`'${item.name}' : redefinition`, item.line);
      scopes.push(new Map(item.params.map((p) => [p.name, "var"])));
      for (const s of item.body.body) statement(s, item);
      scopes.pop();
      if (item.type !== "void" && !hasReturn(item.body)) throw new GlslError(`'${item.name}' : function does not return a value:`, item.line);
      functions.add(item.name);
    }
  }
  if (!functions.has("main")) throw new GlslError("Missing main()");
  return { varyings, uniforms, used };
}

/** Os varyings que o shader de fragmentos usa precisam vir do de vértices, com o mesmo tipo. */
function link(vertex, fragment) {
  for (const [n, type] of Object.entries(fragment.varyings)) {
    if (!fragment.used.has(n)) continue;
    if (!(n in vertex.varyings)) throw new GlslError(`FRAGMENT varying ${n} does not match any VERTEX varying`);
    if (vertex.varyings[n] !== type) throw new GlslError(`Types of varying '${n}' differ between VERTEX and FRAGMENT shaders.`);
  }
}

// ---------------------------------------------------------------------------
// Os valores e as contas

const isMat = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const copy = (v) => (Array.isArray(v) ? v.slice() : isMat(v) ? { n: v.n, e: v.e.slice() } : v);
const SIZES = { vec2: 2, vec3: 3, vec4: 4 };

/** O valor de uma variável declarada sem valor (o GLSL não promete nada; aqui, zero). */
function zero(type) {
  if (SIZES[type]) return new Array(SIZES[type]).fill(0);
  if (type === "mat3" || type === "mat4") return { n: type === "mat3" ? 3 : 4, e: new Array(type === "mat3" ? 9 : 16).fill(0) };
  return type === "bool" ? false : 0;
}

/** Uma conta número a número, com os números soltos valendo para todos os do vetor (um, dois ou três valores). */
function each1(f, a) {
  if (!Array.isArray(a)) return f(a);
  const out = new Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = f(a[k]);
  return out;
}

function each2(f, a, b) {
  const va = Array.isArray(a);
  const vb = Array.isArray(b);
  if (!va && !vb) return f(a, b);
  if (va && vb && a.length !== b.length) throw new GlslError("'' : wrong operand types");
  const n = va ? a.length : b.length;
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = f(va ? a[k] : a, vb ? b[k] : b);
  return out;
}

function each3(f, a, b, c) {
  const va = Array.isArray(a);
  const vb = Array.isArray(b);
  const vc = Array.isArray(c);
  if (!va && !vb && !vc) return f(a, b, c);
  const n = (va ? a : vb ? b : c).length;
  if ((va && a.length !== n) || (vb && b.length !== n) || (vc && c.length !== n)) throw new GlslError("'' : wrong operand types");
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = f(va ? a[k] : a, vb ? b[k] : b, vc ? c[k] : c);
  return out;
}

const TYPE_NAMES = (v) => (isMat(v) ? `highp ${v.n}X${v.n} matrix of float` : Array.isArray(v) ? `highp ${v.length}-component vector of float` : "highp float");

function matVec(m, v, line) {
  if (v.length !== m.n) throw new GlslError(`'*' : wrong operand types - no operation '*' exists that takes a left-hand operand of type '${TYPE_NAMES(m)}' and a right operand of type '${TYPE_NAMES(v)}' (or there is no acceptable conversion)`, line);
  return Array.from({ length: m.n }, (_, r) => v.reduce((s, x, c) => s + m.e[c * m.n + r] * x, 0));
}

function matMat(a, b, line) {
  if (a.n !== b.n) throw new GlslError(`'*' : wrong operand types`, line);
  const n = a.n;
  const e = new Array(n * n);
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += a.e[k * n + r] * b.e[c * n + k];
    e[c * n + r] = s;
  }
  return { n, e };
}

const PLUS = (x, y) => x + y;
const MINUS = (x, y) => x - y;
const TIMES = (x, y) => x * y;
const OVER = (x, y) => x / y;

function operate(op, a, b, line) {
  if (op === "*" && isMat(a)) return isMat(b) ? matMat(a, b, line) : Array.isArray(b) ? matVec(a, b, line) : { n: a.n, e: a.e.map((x) => x * b) };
  if (op === "*" && isMat(b)) {
    if (Array.isArray(a)) return Array.from({ length: b.n }, (_, c) => a.reduce((s, x, r) => s + x * b.e[c * b.n + r], 0));
    return { n: b.n, e: b.e.map((x) => x * a) };
  }
  switch (op) {
    case "+":
      return each2(PLUS, a, b);
    case "-":
      return each2(MINUS, a, b);
    case "*":
      return each2(TIMES, a, b);
    case "/":
      return each2(OVER, a, b);
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
    case "==":
      return Array.isArray(a) ? a.every((x, k) => x === b[k]) : a === b;
    case "!=":
      return Array.isArray(a) ? a.some((x, k) => x !== b[k]) : a !== b;
    default:
      throw new GlslError(`'${op}' : syntax error`, line);
  }
}

function dotOf(a, b) {
  if (!Array.isArray(a)) return a * b;
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}
const lengthOf = (v) => Math.sqrt(dotOf(v, v));
function scaleBy(v, k) {
  if (!Array.isArray(v)) return v * k;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * k;
  return out;
}

const RADIANS = (v) => (v * Math.PI) / 180;
const DEGREES = (v) => (v * 180) / Math.PI;
const EXP2 = (v) => 2 ** v;
const INVERSESQRT = (v) => 1 / Math.sqrt(v);
const FRACT = (v) => v - Math.floor(v);
const MOD = (x, y) => x - y * Math.floor(x / y);
const CLAMP = (v, l, h) => Math.min(Math.max(v, l), h);
const MIX = (x, y, s) => x * (1 - s) + y * s;
const STEP = (e, v) => (v < e ? 0 : 1);
function SMOOTHSTEP(a, b, v) {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** As funções da linguagem, para float e vetores de float. */
const BUILTINS = {
  radians: (x) => each1(RADIANS, x),
  degrees: (x) => each1(DEGREES, x),
  sin: (x) => each1(Math.sin, x),
  cos: (x) => each1(Math.cos, x),
  tan: (x) => each1(Math.tan, x),
  asin: (x) => each1(Math.asin, x),
  acos: (x) => each1(Math.acos, x),
  atan: (y, x) => (x === undefined ? each1(Math.atan, y) : each2(Math.atan2, y, x)),
  pow: (a, b) => each2(Math.pow, a, b),
  exp: (x) => each1(Math.exp, x),
  log: (x) => each1(Math.log, x),
  exp2: (x) => each1(EXP2, x),
  log2: (x) => each1(Math.log2, x),
  sqrt: (x) => each1(Math.sqrt, x),
  inversesqrt: (x) => each1(INVERSESQRT, x),
  abs: (x) => each1(Math.abs, x),
  sign: (x) => each1(Math.sign, x),
  floor: (x) => each1(Math.floor, x),
  ceil: (x) => each1(Math.ceil, x),
  fract: (x) => each1(FRACT, x),
  mod: (a, b) => each2(MOD, a, b),
  min: (a, b) => each2(Math.min, a, b),
  max: (a, b) => each2(Math.max, a, b),
  clamp: (x, lo, hi) => each3(CLAMP, x, lo, hi),
  mix: (a, b, t) => each3(MIX, a, b, t),
  step: (edge, x) => each2(STEP, edge, x),
  smoothstep: (e0, e1, x) => each3(SMOOTHSTEP, e0, e1, x),
  length: lengthOf,
  distance: (a, b) => lengthOf(operate("-", a, b)),
  dot: dotOf,
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  normalize: (v) => scaleBy(v, 1 / lengthOf(v)),
  reflect: (i, n) => operate("-", i, scaleBy(n, 2 * dotOf(n, i))),
  faceforward: (n, i, ref) => (dotOf(ref, i) < 0 ? n : scaleBy(n, -1)),
};

/** Se todos os valores da lista são números soltos. */
function numbers(list) {
  for (const x of list) if (typeof x !== "number") return false;
  return true;
}

/** Um vetor, uma matriz ou um número montado com o nome do tipo: vec4(position, 1.0), mat3(modelMatrix). */
function construct(type, args, line) {
  // o caso comum, sem desmontar nada: vec3(1.0, 2.0, 3.0)
  if (SIZES[type] && args.length === SIZES[type] && numbers(args)) return args;
  const flat = args.flatMap((a) => (Array.isArray(a) ? a : isMat(a) ? a.e : [a])).map(Number);
  if (!flat.length) throw new GlslError("'constructor' : not enough data provided for construction", line);
  if (type === "float") return flat[0];
  if (type === "int") return Math.trunc(flat[0]);
  if (type === "bool") return !!flat[0];
  if (SIZES[type]) {
    const n = SIZES[type];
    if (args.length === 1 && !Array.isArray(args[0]) && !isMat(args[0])) return new Array(n).fill(flat[0]);
    if (flat.length < n) throw new GlslError("'constructor' : not enough data provided for construction", line);
    if (flat.length - (Array.isArray(args.at(-1)) ? args.at(-1).length : 1) >= n) throw new GlslError("'constructor' : too many arguments", line);
    return flat.slice(0, n);
  }
  const n = type === "mat3" ? 3 : 4;
  const m = args[0];
  if (args.length === 1 && isMat(m)) {
    const e = [];
    for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) e.push(c < m.n && r < m.n ? m.e[c * m.n + r] : c === r ? 1 : 0);
    return { n, e };
  }
  if (args.length === 1) return { n, e: Array.from({ length: n * n }, (_, k) => (k % (n + 1) === 0 ? flat[0] : 0)) };
  if (flat.length < n * n) throw new GlslError("'constructor' : not enough data provided for construction", line);
  return { n, e: flat.slice(0, n * n) };
}

const SWIZZLE = ["xyzw", "rgba", "stpq"];

// ---------------------------------------------------------------------------
// O shader rodando: a árvore vira uma função de JavaScript
//
// Num mar de 16 mil vértices, o shader de vértices roda 16 mil vezes por desenho, e cada volta
// chama as funções do shader dezenas de vezes. Percorrer a árvore a cada volta levaria segundos;
// escrita uma vez como JavaScript, a mesma conta roda como o resto do teste. As variáveis do
// shader viram variáveis do JavaScript (com `v_` na frente, e as funções com `f_`), os blocos do
// GLSL viram blocos com `let`, e os valores seguem os do GLSL: uma variável nunca divide o vetor
// com outra (a atribuição e a declaração copiam o vetor de outra variável, e a função copia o
// parâmetro que ela muda), e um `p.y = …` muda só o vetor de `p`.

const DISCARD = Symbol("discard");

/** As letras de um .xyz, .rg ou .stp como posições do vetor; −1 para uma letra que não existe. */
function lettersOf(field) {
  const set = SWIZZLE.find((s) => s.includes(field[0]));
  return set ? [...field].map((c) => set.indexOf(c)) : [-1];
}

const notVector = (name, line) => new GlslError(`'${name}' : field selection requires structure, vector, or interface block on left hand side`, line);
const outOfRange = (name, line) => new GlslError(`'${name}' : vector field selection out of range`, line);

/** O .xyz de um vetor: um número, para uma letra só, ou um vetor novo. */
function field(v, ks, name, line) {
  if (!Array.isArray(v)) throw notVector(name, line);
  if (ks.length > 4) throw outOfRange(name, line);
  if (ks.length === 1) {
    if (!(ks[0] >= 0 && ks[0] < v.length)) throw outOfRange(name, line);
    return v[ks[0]];
  }
  const out = new Array(ks.length);
  for (let j = 0; j < ks.length; j++) {
    if (!(ks[j] >= 0 && ks[j] < v.length)) throw outOfRange(name, line);
    out[j] = v[ks[j]];
  }
  return out;
}

/** O [k] de um vetor (um número) ou de uma matriz (a coluna k, um vetor novo). */
const index = (v, k) => (isMat(v) ? v.e.slice(k * v.n, k * v.n + v.n) : v[k]);

/**
 * Uma atribuição a um pedaço de uma variável (`p.y = …`, `m[1] = …`, `m[0].x += …`): muda o vetor
 * (ou a matriz) da própria variável, que é só dela. `path` tem os passos do pedaço: [0, letras,
 * nome] para um .xyz e [1, k] para um [k]. Devolve o valor atribuído.
 */
function assign(root, path, value, op, line) {
  if (!Array.isArray(root) && !isMat(root)) throw notVector(path[0][0] === 0 ? path[0][2] : "[", line);
  const values = isMat(root) ? root.e : root;
  let slots = isMat(root) ? null : values.map((_, k) => k); // as posições do pedaço em `values`
  for (const [kind, a, name] of path) {
    if (kind === 1) slots = slots ? [slots[a]] : Array.from({ length: root.n }, (_, r) => a * root.n + r); // numa matriz, a coluna
    else {
      if (!slots) throw notVector(name, line);
      if (a.length > 4 || a.some((k) => !(k >= 0 && k < slots.length))) throw outOfRange(name, line);
      slots = a.map((k) => slots[k]);
    }
  }
  if (!slots) throw notVector("[", line);
  let v = value;
  if (op !== "=") v = operate(op[0], slots.length === 1 ? values[slots[0]] : slots.map((k) => values[k]), value, line);
  slots.forEach((k, j) => (values[k] = Array.isArray(v) ? v[j] : v));
  return v;
}

/** O que o JavaScript escrito para um shader usa: as contas, as funções da linguagem, os construtores e as atribuições. */
const RUNTIME = {
  cp: copy,
  zero,
  add: (a, b, line) => (typeof a === "number" && typeof b === "number" ? a + b : operate("+", a, b, line)),
  sub: (a, b, line) => (typeof a === "number" && typeof b === "number" ? a - b : operate("-", a, b, line)),
  mul: (a, b, line) => (typeof a === "number" && typeof b === "number" ? a * b : operate("*", a, b, line)),
  div: (a, b, line) => (typeof a === "number" && typeof b === "number" ? a / b : operate("/", a, b, line)),
  eq: (a, b, line) => operate("==", a, b, line),
  ne: (a, b, line) => operate("!=", a, b, line),
  neg: (v) => (typeof v === "number" ? -v : isMat(v) ? { n: v.n, e: v.e.map((x) => -x) } : v.map((x) => -x)),
  field,
  index,
  assign,
  construct,
  B: BUILTINS,
  DISCARD,
};

const OPERATORS = { "+": "add", "-": "sub", "*": "mul", "/": "div", "==": "eq", "!=": "ne" };

/**
 * O shader escrito como JavaScript: uma função `run(values)` que roda o main com os valores dos
 * nomes ({ nome: valor }: os uniforms, os atributos ou os varyings) e devolve o que ele escreveu:
 * o gl_Position e os varyings, no de vértices, ou o gl_FragColor, no de fragmentos.
 */
function program(items, stage, info) {
  const functions = new Set(items.filter((item) => item.kind === "function").map((item) => item.name));
  const globals = new Map(Object.entries(DECLARED[stage]));
  for (const item of items) if (item.kind === "storage") for (const d of item.decls) globals.set(d.name, item.type);
  const declared = items.filter((item) => item.kind === "declare");
  const v = (name) => `v_${name}`;
  const text = JSON.stringify;
  // um valor novo, que nenhuma variável tem: todo resultado de conta, menos o nome de uma variável,
  // o ? :, uma atribuição e o que uma função do shader (ou o faceforward) devolve, que pode ser o vetor de alguém
  const fresh = (node) => !["name", "ternary", "assign"].includes(node.kind) && !(node.kind === "call" && (functions.has(node.name) || node.name === "faceforward"));
  const owned = (node) => (fresh(node) ? expression(node) : `cp(${expression(node)})`);

  function expression(node) {
    switch (node.kind) {
      case "value":
        return typeof node.value === "boolean" ? String(node.value) : `(${node.value})`;
      case "name":
        return v(node.name);
      case "field":
        return `field(${expression(node.of)}, ${text(lettersOf(node.field))}, ${text(node.field)}, ${node.line})`;
      case "index":
        return `index(${expression(node.of)}, ${expression(node.index)})`;
      case "unary":
        if (node.op === "!") return `!(${expression(node.of)})`;
        return node.op === "-" ? `neg(${expression(node.of)})` : expression(node.of);
      case "binary":
        if (OPERATORS[node.op]) return `${OPERATORS[node.op]}(${expression(node.left)}, ${expression(node.right)}, ${node.line})`;
        return `(${expression(node.left)} ${node.op} ${expression(node.right)})`;
      case "ternary":
        return `(${expression(node.test)} ? ${expression(node.yes)} : ${expression(node.no)})`;
      case "assign": {
        const path = [];
        let base = node.target;
        while (base.kind === "field" || base.kind === "index") {
          path.unshift(base.kind === "field" ? `[0, ${text(lettersOf(base.field))}, ${text(base.field)}]` : `[1, ${expression(base.index)}]`);
          base = base.of;
        }
        const value = expression(node.value);
        if (path.length) return `assign(${v(base.name)}, [${path.join(", ")}], ${value}, ${text(node.op)}, ${node.line})`;
        if (node.op === "=") return `(${v(base.name)} = ${fresh(node.value) ? value : `cp(${value})`})`;
        return `(${v(base.name)} = ${OPERATORS[node.op[0]]}(${v(base.name)}, ${value}, ${node.line}))`;
      }
      case "call": {
        const args = node.args.map(expression).join(", ");
        if (functions.has(node.name)) return `f_${node.name}(${args})`;
        if (CONSTRUCTORS.has(node.name)) return `construct(${text(node.name)}, [${args}], ${node.line})`;
        return `B.${node.name}(${args})`;
      }
      default:
        throw new Error(`nó desconhecido: ${node.kind}`);
    }
  }

  const declaration = (node) => node.decls.map((d) => `let ${v(d.name)} = ${d.init ? owned(d.init) : `zero(${text(node.type)})`};`).join("\n");

  /** Se algum comando ou conta dentro de `node` atribui a `name` (ou a um pedaço dele). */
  function assigns(node, name) {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some((n) => assigns(n, name));
    if (node.kind === "assign") {
      let base = node.target;
      while (base.kind === "field" || base.kind === "index") base = base.of;
      if (base.name === name) return true;
    }
    return Object.values(node).some((n) => typeof n === "object" && assigns(n, name));
  }

  function statement(node) {
    switch (node.kind) {
      case "block":
        return `{\n${node.body.map(statement).join("\n")}\n}`;
      case "declare":
        return declaration(node);
      case "expr":
        return `${expression(node.expr)};`;
      case "return":
        return node.value ? `return ${expression(node.value)};` : "return;";
      case "if":
        return `if (${expression(node.test)}) {\n${statement(node.then)}\n}${node.otherwise ? ` else {\n${statement(node.otherwise)}\n}` : ""}`;
      case "discard":
        return "throw DISCARD;";
      default:
        throw new Error(`comando desconhecido: ${node.kind}`);
    }
  }

  const outputs = stage === "vertex" ? ["gl_Position", "gl_PointSize", ...Object.keys(info.varyings)] : ["gl_FragColor"];
  const lines = [
    `const { ${Object.keys(RUNTIME).join(", ")} } = R;`,
    `let ${[...globals.keys(), ...declared.flatMap((item) => item.decls.map((d) => d.name))].map(v).join(", ")};`,
  ];
  for (const item of items) {
    if (item.kind !== "function") continue;
    const params = item.params.map((p) => v(p.name));
    const copies = item.params.filter((p) => assigns(item.body, p.name)).map((p) => `${v(p.name)} = cp(${v(p.name)});`);
    lines.push(`function f_${item.name}(${params.join(", ")}) {`, ...copies, ...item.body.body.map(statement), "}");
  }
  lines.push("return function run(values) {");
  for (const [name, type] of globals) lines.push(`${v(name)} = values.${name} !== undefined ? values.${name} : zero(${text(type)});`);
  for (const item of declared) for (const d of item.decls) lines.push(`${v(d.name)} = ${d.init ? owned(d.init) : `zero(${text(item.type)})`};`);
  lines.push("f_main();", `return { ${[...new Set(outputs)].map((name) => `${name}: ${v(name)}`).join(", ")} };`, "};");
  return { ...info, run: new Function("R", lines.join("\n"))(RUNTIME) };
}

/** Compila o texto de um shader: a árvore, conferida; um erro sai como GlslError, com o shader em `stage`. */
function compile(text, stage) {
  try {
    const items = parse(String(text ?? ""));
    return program(items, stage, verify(items, stage));
  } catch (e) {
    if (e instanceof GlslError) e.stage = stage;
    throw e;
  }
}

const programs = new Map();

/**
 * Os dois shaders de um material, compilados e ligados: { vertex, fragment } ou { error }, com
 * `stage` ("vertex", "fragment" ou "link"), a mensagem e a linha, como nos fatos do visor.
 */
export function programOf(material) {
  const key = `${material.vertexShader}\u0000${material.fragmentShader}`;
  if (!programs.has(key)) {
    try {
      const vertex = compile(material.vertexShader, "vertex");
      const fragment = compile(material.fragmentShader, "fragment");
      try {
        link(vertex, fragment);
      } catch (e) {
        if (e instanceof GlslError) e.stage = "link";
        throw e;
      }
      programs.set(key, { vertex, fragment, error: null });
    } catch (e) {
      if (!(e instanceof GlslError)) throw e;
      programs.set(key, { error: { stage: e.stage, message: e.message, line: e.line } });
    }
  }
  return programs.get(key);
}

// ---------------------------------------------------------------------------
// O desenho

/** O fundo da imagem dos fatos: a cor (1; 0; 0,4) do espaço linear, como sai no alvo do visor. */
export const BACKGROUND = [255, 0, 102];
const MAGENTA = [255, 0, 255];
const GRAY = [128, 128, 128];

/** Um uniform do JavaScript como o shader recebe: uma THREE.Color no espaço linear, um vetor como lista. */
function uniformValue(value, type) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value?.isColor) return [value.r, value.g, value.b];
  if (value?.isVector2 || value?.isVector3 || value?.isVector4) return value.toArray();
  if (value?.isMatrix3 || value?.isMatrix4) return { n: value.isMatrix3 ? 3 : 4, e: [...value.elements] };
  return zero(type);
}

const matrix = (m) => ({ n: m.isMatrix3 ? 3 : 4, e: [...m.elements] });

/** O valor do atributo no vértice i, como lista. */
function attribute(attr, i) {
  if (!attr) return undefined;
  const out = new Array(attr.itemSize);
  for (let k = 0; k < attr.itemSize; k++) out[k] = attr.getComponent(i, k);
  return out;
}

/**
 * Uma malha com ShaderMaterial pronta para os pixels: cada vértice levado à tela pelo shader de
 * vértices (`clip`, antes da divisão pelo w) com os varyings que ele escreveu, e os triângulos.
 * { error } se os shaders não compilam, ou se uma conta deles não fecha (como mat4 * vec3).
 */
function prepare(mesh, material, camera) {
  const compiled = programOf(material);
  if (compiled.error) return { mesh, error: compiled.error };
  const { vertex, fragment } = compiled;
  const modelView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
  const builtins = {
    modelMatrix: matrix(mesh.matrixWorld),
    viewMatrix: matrix(camera.matrixWorldInverse),
    projectionMatrix: matrix(camera.projectionMatrix),
    modelViewMatrix: matrix(modelView),
    normalMatrix: matrix(new THREE.Matrix3().getNormalMatrix(modelView)),
    cameraPosition: camera.getWorldPosition(new THREE.Vector3()).toArray(),
    isOrthographic: !!camera.isOrthographicCamera,
  };
  const uniformsOf = (declared) => {
    const out = { ...builtins };
    for (const [n, type] of Object.entries(declared)) out[n] = uniformValue(material.uniforms?.[n]?.value, type);
    return out;
  };
  const vertexValues = uniformsOf(vertex.uniforms);
  const fragmentUniforms = uniformsOf(fragment.uniforms);
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const names = Object.keys(fragment.varyings);
  const vertices = [];
  let stage = "vertex";
  try {
    for (let i = 0; i < position.count; i++) {
      vertexValues.position = attribute(position, i);
      vertexValues.normal = attribute(normal, i) ?? [0, 0, 0];
      vertexValues.uv = attribute(uv, i) ?? [0, 0];
      const out = vertex.run(vertexValues);
      vertices.push({ clip: out.gl_Position, varyings: names.map((n) => out[n] ?? zero(fragment.varyings[n])) });
    }
    // uma volta no shader de fragmentos, para uma conta que não fecha aparecer já aqui
    stage = "fragment";
    fragment.run({ ...fragmentUniforms, ...Object.fromEntries(names.map((n, k) => [n, vertices[0]?.varyings[k] ?? zero(fragment.varyings[n])])) });
  } catch (e) {
    if (e instanceof GlslError) return { mesh, error: { stage, message: e.message, line: e.line } };
    if (e !== DISCARD) throw e; // um discard na volta de teste não é erro
  }
  const index = geometry.getIndex();
  const triangles = index ? Array.from(index.array) : Array.from({ length: position.count }, (_, k) => k);
  return { mesh, side: material.side, wireframe: !!material.wireframe, vertices, triangles, names, fragment, uniforms: fragmentUniforms };
}

/** O lado de um pedaço da tela, em pixels: cada pixel confere só os triângulos que passam pelo pedaço dele. */
const BIN = 8;

/**
 * Desenha a cena pela câmera numa imagem de `width` × `height`, um pixel por vez: `read(x, y)` dá
 * a cor [r, g, b] (de 0 a 255) do pixel (x, y), contado de baixo para cima, como o WebGL lê.
 * `errorOf(malha)` dá o erro de compilação dos shaders dela ({ stage, message, line }) ou null.
 * `depthOf(malha)` dá a profundidade da malha em cada pixel, como o desenho de profundidade do
 * visor mede: (x, y) → de 0 a 1, como o gl_FragCoord.z, ou null onde a malha não é o que aparece.
 * A profundidade é a da malha cheia, mesmo numa desenhada em linhas (wireframe). Numa malha em
 * linhas, a cor só aparece nos pixels por onde passa uma aresta do triângulo da frente, e os
 * outros mostram o fundo: é quase o que a placa de vídeo faz, que mostraria também as arestas
 * dos triângulos de trás.
 */
export function draw({ scene, camera, width, height }) {
  scene.updateMatrixWorld();
  camera.updateWorldMatrix(true, false);
  const shaded = [];
  const others = [];
  const broken = new Set();
  const errors = new Map();
  scene.traverseVisible((obj) => {
    if (!obj.isMesh) return;
    const material = [].concat(obj.material)[0];
    if (!material || material.visible === false) return;
    if (!material.isShaderMaterial || obj.isInstancedMesh) {
      others.push(obj);
      return;
    }
    const prepared = prepare(obj, material, camera);
    errors.set(obj, prepared.error ?? null);
    if (prepared.error) {
      broken.add(obj);
      others.push(obj);
    } else shaded.push(prepared);
  });
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const point = new THREE.Vector3();
  const cols = Math.ceil(width / BIN);
  const rows = Math.ceil(height / BIN);
  let bins = null;

  // Cada triângulo vai para os pedaços da tela que o retângulo em volta dele cobre. Um triângulo
  // com um vértice atrás da câmera fica de fora (a placa de vídeo o cortaria).
  function binTriangles() {
    bins = Array.from({ length: cols * rows }, () => []);
    const col = (x) => Math.floor((((x + 1) / 2) * width) / BIN);
    const row = (y) => Math.floor((((y + 1) / 2) * height) / BIN);
    for (const d of shaded) {
      d.screen = d.vertices.map(({ clip }) => (clip[3] > 0 ? [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]] : null));
      for (let t = 0; t < d.triangles.length; t += 3) {
        const A = d.screen[d.triangles[t]];
        const B = d.screen[d.triangles[t + 1]];
        const C = d.screen[d.triangles[t + 2]];
        if (!A || !B || !C) continue;
        const c0 = Math.max(0, col(Math.min(A[0], B[0], C[0])));
        const c1 = Math.min(cols - 1, col(Math.max(A[0], B[0], C[0])));
        const r0 = Math.max(0, row(Math.min(A[1], B[1], C[1])));
        const r1 = Math.min(rows - 1, row(Math.max(A[1], B[1], C[1])));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bins[r * cols + c].push(d, t);
      }
    }
  }

  const hits = new Map();

  /** O que o pixel mostra: o triângulo de um shader mais perto da câmera, com os pesos de cada vértice, ou a cor de outra malha. */
  function hitAt(px, py) {
    const key = py * width + px;
    if (hits.has(key)) return hits.get(key);
    if (!bins) binTriangles();
    const x = ((px + 0.5) / width) * 2 - 1;
    const y = ((py + 0.5) / height) * 2 - 1;
    let best = null;
    const list = bins[Math.floor(py / BIN) * cols + Math.floor(px / BIN)] ?? [];
    for (let j = 0; j < list.length; j += 2) {
      const d = list[j];
      const t = list[j + 1];
      const [ax, ay, az] = d.screen[d.triangles[t]];
      const [bx, by, bz] = d.screen[d.triangles[t + 1]];
      const [cx, cy, cz] = d.screen[d.triangles[t + 2]];
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (!area) continue;
      const front = area > 0;
      if ((d.side === THREE.FrontSide && !front) || (d.side === THREE.BackSide && front)) continue;
      const la = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
      const lb = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
      const lc = 1 - la - lb;
      if (la < 0 || lb < 0 || lc < 0) continue;
      const depth = la * az + lb * bz + lc * cz;
      if (depth < -1 || depth > 1 || (best && depth >= best.depth)) continue;
      const w = [0, 1, 2].map((k) => d.vertices[d.triangles[t + k]].clip[3]);
      best = { depth, draw: d, t, weights: [la / w[0], lb / w[1], lc / w[2]], front };
    }
    if (others.length) {
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(others, false)[0];
      if (hit) {
        const depth = point.copy(hit.point).project(camera).z;
        if (!best || depth < best.depth) best = { depth, color: broken.has(hit.object) ? MAGENTA : GRAY };
      }
    }
    hits.set(key, best);
    return best;
  }

  /** Se o centro do pixel fica a até meio pixel de uma aresta do triângulo t, medido no eixo em que a aresta anda menos. */
  function onEdge(d, t, px, py) {
    const [X, Y] = [px + 0.5, py + 0.5];
    const corners = [0, 1, 2].map((k) => {
      const [x, y] = d.screen[d.triangles[t + k]];
      return [((x + 1) / 2) * width, ((y + 1) / 2) * height];
    });
    for (let k = 0; k < 3; k++) {
      const [x0, y0] = corners[k];
      const [x1, y1] = corners[(k + 1) % 3];
      const [dx, dy] = [x1 - x0, y1 - y0];
      const flat = Math.abs(dx) >= Math.abs(dy);
      if (!dx && !dy) continue;
      const s = flat ? (X - x0) / dx : (Y - y0) / dy;
      if (s < 0 || s > 1) continue;
      if ((flat ? Math.abs(y0 + s * dy - Y) : Math.abs(x0 + s * dx - X)) <= 0.5) return true;
    }
    return false;
  }

  function read(px, py) {
    const best = hitAt(px, py);
    if (!best) return BACKGROUND;
    if (best.color) return best.color;
    const { draw, t, weights, front } = best;
    if (draw.wireframe && !onEdge(draw, t, px, py)) return BACKGROUND;
    // os varyings misturados entre os três vértices, com a correção da perspectiva
    const total = weights[0] + weights[1] + weights[2];
    const mixed = (p, q, r) => (p * weights[0] + q * weights[1] + r * weights[2]) / total;
    const corners = [0, 1, 2].map((k) => draw.vertices[draw.triangles[t + k]].varyings);
    const values = { ...draw.uniforms, gl_FrontFacing: front, gl_FragCoord: [px + 0.5, py + 0.5, (best.depth + 1) / 2, 1] };
    draw.names.forEach((n, j) => {
      const [a, b, c] = corners.map((v) => v[j]);
      values[n] = each3(mixed, a, b, c);
    });
    let color;
    try {
      color = draw.fragment.run(values).gl_FragColor;
    } catch (e) {
      if (e === DISCARD) return BACKGROUND;
      throw e;
    }
    return [0, 1, 2].map((k) => Math.round(Math.min(1, Math.max(0, color[k])) * 255));
  }

  function depthOf(mesh) {
    return (px, py) => {
      const best = hitAt(px, py);
      return best?.draw?.mesh === mesh ? (best.depth + 1) / 2 : null;
    };
  }

  return { read, depthOf, errorOf: (mesh) => errors.get(mesh) ?? null };
}
