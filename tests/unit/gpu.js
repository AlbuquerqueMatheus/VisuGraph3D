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
// recebe valor, um varying que o shader de vértices não manda.
//
// O desenho segue o da placa de vídeo: o shader de vértices leva cada vértice para a tela; num
// pixel coberto por um triângulo (os de costas ficam de fora, como no FrontSide), os varyings
// chegam misturados entre os três vértices, com a correção da perspectiva, e fica o mais perto da
// câmera. As outras malhas (o gabarito, com um material do three.js) entram pelo raio que sai da
// câmera, cinzas; a malha de um shader que não compila sai magenta, como no visor.

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

/** Uma conta número a número, com os números soltos valendo para todos os do vetor. */
function each(f, ...args) {
  const vectors = args.filter(Array.isArray);
  if (!vectors.length) return f(...args);
  const n = vectors[0].length;
  if (vectors.some((v) => v.length !== n)) throw new GlslError("'' : wrong operand types");
  return Array.from({ length: n }, (_, k) => f(...args.map((a) => (Array.isArray(a) ? a[k] : a))));
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

function operate(op, a, b, line) {
  if (op === "*" && isMat(a)) return isMat(b) ? matMat(a, b, line) : Array.isArray(b) ? matVec(a, b, line) : { n: a.n, e: a.e.map((x) => x * b) };
  if (op === "*" && isMat(b)) {
    if (Array.isArray(a)) return Array.from({ length: b.n }, (_, c) => a.reduce((s, x, r) => s + x * b.e[c * b.n + r], 0));
    return { n: b.n, e: b.e.map((x) => x * a) };
  }
  switch (op) {
    case "+":
      return each((x, y) => x + y, a, b);
    case "-":
      return each((x, y) => x - y, a, b);
    case "*":
      return each((x, y) => x * y, a, b);
    case "/":
      return each((x, y) => x / y, a, b);
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

const dotOf = (a, b) => (Array.isArray(a) ? a.reduce((s, x, k) => s + x * b[k], 0) : a * b);
const lengthOf = (v) => Math.sqrt(dotOf(v, v));
const scaleBy = (v, k) => (Array.isArray(v) ? v.map((x) => x * k) : v * k);

/** As funções da linguagem, para float e vetores de float. */
const BUILTINS = {
  radians: (x) => each((v) => (v * Math.PI) / 180, x),
  degrees: (x) => each((v) => (v * 180) / Math.PI, x),
  sin: (x) => each(Math.sin, x),
  cos: (x) => each(Math.cos, x),
  tan: (x) => each(Math.tan, x),
  asin: (x) => each(Math.asin, x),
  acos: (x) => each(Math.acos, x),
  atan: (y, x) => (x === undefined ? each(Math.atan, y) : each(Math.atan2, y, x)),
  pow: (a, b) => each((x, y) => x ** y, a, b),
  exp: (x) => each(Math.exp, x),
  log: (x) => each(Math.log, x),
  exp2: (x) => each((v) => 2 ** v, x),
  log2: (x) => each(Math.log2, x),
  sqrt: (x) => each(Math.sqrt, x),
  inversesqrt: (x) => each((v) => 1 / Math.sqrt(v), x),
  abs: (x) => each(Math.abs, x),
  sign: (x) => each(Math.sign, x),
  floor: (x) => each(Math.floor, x),
  ceil: (x) => each(Math.ceil, x),
  fract: (x) => each((v) => v - Math.floor(v), x),
  mod: (a, b) => each((x, y) => x - y * Math.floor(x / y), a, b),
  min: (a, b) => each(Math.min, a, b),
  max: (a, b) => each(Math.max, a, b),
  clamp: (x, lo, hi) => each((v, l, h) => Math.min(Math.max(v, l), h), x, lo, hi),
  mix: (a, b, t) => each((x, y, s) => x * (1 - s) + y * s, a, b, t),
  step: (edge, x) => each((e, v) => (v < e ? 0 : 1), edge, x),
  smoothstep: (e0, e1, x) =>
    each(
      (a, b, v) => {
        const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
        return t * t * (3 - 2 * t);
      },
      e0,
      e1,
      x,
    ),
  length: lengthOf,
  distance: (a, b) => lengthOf(operate("-", a, b)),
  dot: dotOf,
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  normalize: (v) => scaleBy(v, 1 / lengthOf(v)),
  reflect: (i, n) => operate("-", i, scaleBy(n, 2 * dotOf(n, i))),
  faceforward: (n, i, ref) => (dotOf(ref, i) < 0 ? n : scaleBy(n, -1)),
};

/** Um vetor, uma matriz ou um número montado com o nome do tipo: vec4(position, 1.0), mat3(modelMatrix). */
function construct(type, args, line) {
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

/** As posições de um vetor que um nome como .xyz ou .rg escolhe. */
function picks(field, size, line) {
  const set = SWIZZLE.find((s) => s.includes(field[0]));
  const out = set ? [...field].map((c) => set.indexOf(c)) : [-1];
  if (field.length > 4 || out.some((k) => k < 0 || k >= size)) throw new GlslError(`'${field}' : vector field selection out of range`, line);
  return out;
}

// ---------------------------------------------------------------------------
// O shader rodando

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.vars = new Map();
  }

  owner(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s;
    return null;
  }

  get(name) {
    return this.owner(name).vars.get(name);
  }
}

const DISCARD = Symbol("discard");

function evaluate(node, scope, fns) {
  switch (node.kind) {
    case "value":
      return node.value;
    case "name":
      return scope.get(node.name);
    case "field": {
      const v = evaluate(node.of, scope, fns);
      if (!Array.isArray(v)) throw new GlslError(`'${node.field}' : field selection requires structure, vector, or interface block on left hand side`, node.line);
      const ks = picks(node.field, v.length, node.line);
      return ks.length === 1 ? v[ks[0]] : ks.map((k) => v[k]);
    }
    case "index": {
      const v = evaluate(node.of, scope, fns);
      const k = evaluate(node.index, scope, fns);
      return isMat(v) ? v.e.slice(k * v.n, k * v.n + v.n) : v[k];
    }
    case "unary": {
      const v = evaluate(node.of, scope, fns);
      if (node.op === "!") return !v;
      return node.op === "-" ? (isMat(v) ? { n: v.n, e: v.e.map((x) => -x) } : scaleBy(v, -1)) : v;
    }
    case "binary":
      if (node.op === "&&") return evaluate(node.left, scope, fns) && evaluate(node.right, scope, fns);
      if (node.op === "||") return evaluate(node.left, scope, fns) || evaluate(node.right, scope, fns);
      return operate(node.op, evaluate(node.left, scope, fns), evaluate(node.right, scope, fns), node.line);
    case "ternary":
      return evaluate(node.test, scope, fns) ? evaluate(node.yes, scope, fns) : evaluate(node.no, scope, fns);
    case "assign": {
      let value = evaluate(node.value, scope, fns);
      if (node.op !== "=") value = operate(node.op[0], evaluate(node.target, scope, fns), value, node.line);
      store(node.target, copy(value), scope, fns);
      return value;
    }
    case "call": {
      const args = node.args.map((a) => evaluate(a, scope, fns));
      const fn = fns.get(node.name);
      if (fn) return invoke(fn, args, fns);
      if (CONSTRUCTORS.has(node.name)) return construct(node.name, args, node.line);
      return BUILTINS[node.name](...args);
    }
    default:
      throw new Error(`nó desconhecido: ${node.kind}`);
  }
}

function store(target, value, scope, fns) {
  if (target.kind === "name") {
    scope.owner(target.name).vars.set(target.name, value);
    return;
  }
  const base = copy(evaluate(target.of, scope, fns));
  if (target.kind === "field") picks(target.field, base.length, target.line).forEach((k, j) => (base[k] = Array.isArray(value) ? value[j] : value));
  else {
    const k = evaluate(target.index, scope, fns);
    if (isMat(base)) value.forEach((x, r) => (base.e[k * base.n + r] = x));
    else base[k] = value;
  }
  store(target.of, base, scope, fns);
}

/** Roda um comando; devolve { value } num return, para a função sair. */
function run(node, scope, fns) {
  switch (node.kind) {
    case "block": {
      const inner = new Scope(scope);
      for (const s of node.body) {
        const out = run(s, inner, fns);
        if (out) return out;
      }
      return null;
    }
    case "declare":
      for (const d of node.decls) scope.vars.set(d.name, d.init ? copy(evaluate(d.init, scope, fns)) : zero(node.type));
      return null;
    case "expr":
      evaluate(node.expr, scope, fns);
      return null;
    case "return":
      return { value: node.value ? evaluate(node.value, scope, fns) : undefined };
    case "if":
      if (evaluate(node.test, scope, fns)) return run(node.then, scope, fns);
      return node.otherwise ? run(node.otherwise, scope, fns) : null;
    case "discard":
      throw DISCARD;
    default:
      throw new Error(`comando desconhecido: ${node.kind}`);
  }
}

function invoke(fn, args, fns) {
  const scope = new Scope(fns.global);
  fn.params.forEach((p, k) => scope.vars.set(p.name, copy(args[k])));
  for (const s of fn.body.body) {
    const out = run(s, scope, fns);
    if (out) return out.value;
  }
  return undefined;
}

/**
 * Um shader pronto para rodar: `run(values)` roda o main com os valores dos nomes ({ nome: valor },
 * os uniforms, os atributos ou os varyings) e devolve o escopo do shader, de onde saem o
 * gl_Position, o gl_FragColor e os varyings que o shader de vértices escreveu.
 */
function program(items, stage, info) {
  const functions = items.filter((item) => item.kind === "function");
  return {
    ...info,
    run(values) {
      const global = new Scope();
      for (const [n, type] of Object.entries(DECLARED[stage])) global.vars.set(n, values[n] ?? zero(type));
      for (const item of items) {
        if (item.kind === "storage") for (const d of item.decls) global.vars.set(d.name, values[d.name] ?? zero(item.type));
      }
      const fns = new Map(functions.map((f) => [f.name, f]));
      fns.global = global;
      for (const item of items) if (item.kind === "declare") run(item, global, fns);
      invoke(fns.get("main"), [], fns);
      return global;
    },
  };
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
const attribute = (attr, i) => (attr ? Array.from({ length: attr.itemSize }, (_, k) => attr.getComponent(i, k)) : undefined);

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
  const vertexUniforms = uniformsOf(vertex.uniforms);
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
      const scope = vertex.run({ ...vertexUniforms, position: attribute(position, i), normal: attribute(normal, i) ?? [0, 0, 0], uv: attribute(uv, i) ?? [0, 0] });
      const clip = scope.get("gl_Position");
      vertices.push({ clip, varyings: names.map((n) => (scope.owner(n) ? scope.get(n) : zero(fragment.varyings[n]))) });
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
  return { mesh, side: material.side, vertices, triangles, names, fragment, uniforms: fragmentUniforms };
}

/**
 * Desenha a cena pela câmera numa imagem de `width` × `height`, um pixel por vez: `read(x, y)` dá
 * a cor [r, g, b] (de 0 a 255) do pixel (x, y), contado de baixo para cima, como o WebGL lê.
 * `errorOf(malha)` dá o erro de compilação dos shaders dela ({ stage, message, line }) ou null.
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

  function read(px, py) {
    const x = ((px + 0.5) / width) * 2 - 1;
    const y = ((py + 0.5) / height) * 2 - 1;
    let best = null;
    for (const draw of shaded) {
      const { vertices, triangles, side } = draw;
      for (let t = 0; t < triangles.length; t += 3) {
        const [A, B, C] = [vertices[triangles[t]].clip, vertices[triangles[t + 1]].clip, vertices[triangles[t + 2]].clip];
        if (A[3] <= 0 || B[3] <= 0 || C[3] <= 0) continue;
        const [ax, ay, bx, by, cx, cy] = [A[0] / A[3], A[1] / A[3], B[0] / B[3], B[1] / B[3], C[0] / C[3], C[1] / C[3]];
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (!area) continue;
        const front = area > 0;
        if ((side === THREE.FrontSide && !front) || (side === THREE.BackSide && front)) continue;
        const la = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const lb = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const lc = 1 - la - lb;
        if (la < 0 || lb < 0 || lc < 0) continue;
        const depth = (la * A[2]) / A[3] + (lb * B[2]) / B[3] + (lc * C[2]) / C[3];
        if (depth < -1 || depth > 1 || (best && depth >= best.depth)) continue;
        best = { depth, draw, t, weights: [la / A[3], lb / B[3], lc / C[3]], front };
      }
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
    if (!best) return BACKGROUND;
    if (best.color) return best.color;
    // os varyings misturados entre os três vértices, com a correção da perspectiva
    const { draw, t, weights, front } = best;
    const total = weights[0] + weights[1] + weights[2];
    const corners = [0, 1, 2].map((k) => draw.vertices[draw.triangles[t + k]].varyings);
    const values = { ...draw.uniforms, gl_FrontFacing: front, gl_FragCoord: [px + 0.5, py + 0.5, (best.depth + 1) / 2, 1] };
    draw.names.forEach((n, j) => {
      const [a, b, c] = corners.map((v) => v[j]);
      values[n] = each((p, q, r) => (p * weights[0] + q * weights[1] + r * weights[2]) / total, a, b, c);
    });
    let color;
    try {
      color = draw.fragment.run(values).get("gl_FragColor");
    } catch (e) {
      if (e === DISCARD) return BACKGROUND;
      throw e;
    }
    return [0, 1, 2].map((k) => Math.round(Math.min(1, Math.max(0, color[k])) * 255));
  }

  return { read, errorOf: (mesh) => errors.get(mesh) ?? null };
}
