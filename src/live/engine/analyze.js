// analyze.js — lê o código da cena e monta o "mapa" que liga código e cena.
//
// Para cada `new THREE.X(...)` o motor guarda um objeto com id (ordem no código),
// nome da variável e trechos do código que o criam ou alteram. Para cada propriedade
// editável (posição, cor, intensidade...), guarda o literal que a define (o "slot")
// ou o motivo de não ser editável pela cena (expressão, animação, laço...).

import { parseCode, walk, isFunctionNode, isLoopNode } from "./parse.js";
import { AXES, OBJECT_FLAGS, RUNTIME_NAMES, TRANSFORMS, VALUE_CLASSES, classInfo, isObject3DKind } from "./catalog.js";
import { normalizeColor } from "./format.js";

const TRANSLATE_METHODS = new Set(["translateX", "translateY", "translateZ", "translateOnAxis"]);
const ROTATE_METHODS = new Set([
  "rotateX", "rotateY", "rotateZ", "rotateOnAxis", "rotateOnWorldAxis", "lookAt",
  "setRotationFromAxisAngle", "setRotationFromEuler", "setRotationFromMatrix", "setRotationFromQuaternion", "applyQuaternion",
]);
const COLOR_SET_METHODS = new Set(["set", "setHex", "setStyle"]);
const CONDITIONAL_NODES = new Set([
  "IfStatement", "SwitchStatement", "TryStatement", "CatchClause", "ConditionalExpression", "LogicalExpression",
  "BlockStatement", "LabeledStatement", "WithStatement",
]);

const CONTEXT_REASONS = {
  loop: "criado dentro de um laço",
  function: "criado dentro de uma função",
  animar: "criado dentro de animar()",
  conditional: "criado dentro de um if ou bloco",
};

/**
 * Analisa o código. Nunca lança exceção: erro de sintaxe vem em `error` e `diagnostics`.
 */
export function analyze(code) {
  const parsed = parseCode(code);
  if (parsed.error) {
    const e = parsed.error;
    return {
      ok: false,
      code,
      error: e,
      diagnostics: [{ from: e.from, to: e.to, severity: "error", message: e.message, source: "sintaxe" }],
      objects: [],
      records: [],
      numbers: [],
      intervals: [],
      loops: [],
      comments: [],
      topNames: new Set(),
      scene: null,
      camera: null,
      animar: null,
    };
  }
  return new Analysis(code, parsed.ast, parsed.comments).build();
}

/** Há algum erro que impede o código de rodar? */
export function hasBlockingError(analysis) {
  return !analysis.ok || analysis.diagnostics.some((d) => d.severity === "error");
}

class Analysis {
  constructor(code, ast, comments) {
    this.code = code;
    this.ast = ast;
    this.comments = comments;
    this.objects = [];
    this.records = [];
    this.diagnostics = [];
    this.numbers = [];
    this.loops = [];
    this.statements = []; // ExpressionStatements com contexto
    this.addCalls = []; // chamadas x.add(...)
    this.topNames = new Set();
    this.topDecls = new Map(); // nome → nó onde ele é declarado no topo
    this.animarFn = null;
    this.lineStarts = lineStarts(code);
  }

  build() {
    this.findAnimar();
    this.collect();
    this.bindAndResolve();
    for (const obj of this.objects) this.constructorRecords(obj);
    for (const obj of this.objects) this.computeProps(obj);
    this.computeRanges();
    this.diagnose();
    this.mapNumbers();

    const scene = this.objects.find((o) => o.kind === "scene" && o.context === "top") || null;
    const camera = this.objects.find((o) => o.kind === "camera" && o.context === "top") || null;
    return {
      ok: true,
      code: this.code,
      ast: this.ast,
      objects: this.objects,
      records: this.records,
      numbers: this.numbers,
      intervals: this.intervals,
      loops: this.loops,
      comments: this.comments,
      diagnostics: this.diagnostics,
      topNames: this.topNames,
      scene: scene && { id: scene.id, name: scene.name },
      camera: camera && { id: camera.id, name: camera.name },
      animar: this.animarFn && {
        from: this.animarStmt.start,
        to: this.animarStmt.end,
        bodyFrom: this.animarFn.body.start,
        bodyTo: this.animarFn.body.end,
      },
    };
  }

  lineOf(pos) {
    // busca binária no início de cada linha
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  findAnimar() {
    for (const stmt of this.ast.body) {
      if (stmt.type === "FunctionDeclaration" && stmt.id?.name === "animar") {
        this.animarFn = stmt;
        this.animarStmt = stmt;
      } else if (stmt.type === "VariableDeclaration") {
        for (const d of stmt.declarations) {
          if (d.id.type === "Identifier" && d.id.name === "animar" && d.init && isFunctionNode(d.init)) {
            this.animarFn = d.init;
            this.animarStmt = stmt;
          }
        }
      }
    }
  }

  contextOf(ancestors) {
    let inFunction = false;
    let inLoop = false;
    let inCond = false;
    for (let i = 1; i < ancestors.length; i++) {
      const a = ancestors[i];
      if (a === this.animarFn) return "animar";
      if (isFunctionNode(a) || a.type === "ClassBody") inFunction = true;
      else if (isLoopNode(a)) inLoop = true;
      else if (CONDITIONAL_NODES.has(a.type)) inCond = true;
    }
    if (inFunction) return "function";
    if (inLoop) return "loop";
    if (inCond) return "conditional";
    return "top";
  }

  collect() {
    const skipLiterals = new Set();
    walk(this.ast, (node, ancestors) => {
      const parent = ancestors[ancestors.length - 1];
      const top = ancestors.length >= 1 ? (ancestors.length === 1 ? node : ancestors[1]) : null;

      if (node.type === "NewExpression") {
        const className = threeMember(node.callee);
        if (className && !VALUE_CLASSES.has(className)) {
          const info = classInfo(className);
          this.objects.push({
            id: -1,
            className,
            kind: info.kind,
            known: !info.unknown,
            node,
            from: node.start,
            to: node.end,
            line: this.lineOf(node.start),
            context: this.contextOf(ancestors),
            topStmt: top,
            name: null,
            links: {},
            owner: null,
            users: [],
            props: {},
            ranges: [],
          });
        }
      } else if (node.type === "ExpressionStatement") {
        this.statements.push({ node, context: this.contextOf(ancestors), topStmt: top });
      } else if (isLoopNode(node)) {
        this.loops.push({ from: node.start, to: node.end, bodyFrom: node.body.start, bodyTo: node.body.end, block: node.body.type === "BlockStatement" });
      } else if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+") && isNumberLiteral(node.argument)) {
        skipLiterals.add(node.argument);
        this.pushNumber(node, node.operator === "-" ? -node.argument.value : node.argument.value, parent);
      } else if (isNumberLiteral(node) && !skipLiterals.has(node)) {
        this.pushNumber(node, node.value, parent);
      } else if (node.type === "CallExpression") {
        const chain = memberChain(node.callee);
        if (chain && chain.path.length >= 1 && chain.path[chain.path.length - 1] === "add") {
          this.addCalls.push({ node, chain, topStmt: top });
        }
        if (node.callee.type === "Identifier" && node.callee.name === "requestAnimationFrame") this.usesRaf = node;
        if (chain && chain.path[chain.path.length - 1] === "setAnimationLoop") this.usesRaf = node;
      }
      return undefined;
    });
    this.objects.sort((a, b) => a.from - b.from);
    this.objects.forEach((o, i) => (o.id = i));
    this.byNode = new Map(this.objects.map((o) => [o.node, o]));
  }

  pushNumber(node, value, parent) {
    const raw = this.code.slice(node.start, node.end);
    const digits = /\.(\d+)/.exec(raw);
    this.numbers.push({
      from: node.start,
      to: node.end,
      value,
      raw,
      decimals: digits ? digits[1].length : 0,
      hex: /^[-+]?0[xX]/.test(raw),
      afterOperator: !!parent && parent.type === "BinaryExpression" && parent.right === node,
      slot: null,
    });
  }

  /** Percorre as instruções do topo em ordem, com o estado das variáveis naquele ponto. */
  bindAndResolve() {
    const bindings = new Map();
    const deferredWrites = [];
    const deferredObjects = [];
    const stmtsByTop = groupBy(this.statements, (s) => s.topStmt);
    const objsByTop = groupBy(this.objects, (o) => o.topStmt);

    for (const stmt of this.ast.body) {
      for (const obj of objsByTop.get(stmt) || []) {
        if (obj.context === "function" || obj.context === "animar") deferredObjects.push(obj);
        else this.resolveLinks(obj, bindings);
      }
      for (const s of stmtsByTop.get(stmt) || []) {
        if (s.context === "function" || s.context === "animar") deferredWrites.push(s);
        else this.resolveStatement(s, bindings);
      }
      this.updateBindings(stmt, bindings);
    }
    for (const obj of deferredObjects) this.resolveLinks(obj, bindings);
    for (const s of deferredWrites) this.resolveStatement(s, bindings);

    for (const obj of this.objects) {
      if (obj.kind !== "mesh") continue;
      for (const key of ["geometry", "material"]) {
        const id = obj.links[key];
        if (id != null) this.objects[id].users.push(obj.id);
      }
    }
  }

  updateBindings(stmt, bindings) {
    const bindName = (name, init, node) => {
      this.topNames.add(name);
      if (node && !this.topDecls.has(name)) this.topDecls.set(name, node);
      const obj = init && this.byNode.get(init);
      if (obj) {
        bindings.set(name, obj.id);
        if (!obj.name && obj.context === "top") {
          obj.name = name;
          obj.declStmt = stmt;
        }
      } else if (init && init.type === "Identifier") {
        bindings.set(name, bindings.has(init.name) ? bindings.get(init.name) : null);
      } else {
        bindings.set(name, null);
      }
    };
    if (stmt.type === "VariableDeclaration") {
      for (const d of stmt.declarations) {
        if (d.id.type === "Identifier") bindName(d.id.name, d.init, d.id);
        else for (const name of patternNames(d.id)) bindName(name, null, d.id);
      }
    } else if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
      if (stmt.id) bindName(stmt.id.name, null, stmt.id);
    } else if (stmt.type === "ExpressionStatement" && stmt.expression.type === "AssignmentExpression" &&
      stmt.expression.operator === "=" && stmt.expression.left.type === "Identifier") {
      bindName(stmt.expression.left.name, stmt.expression.right);
    }
  }

  resolveLinks(obj, bindings) {
    if (obj.kind !== "mesh") return;
    ["geometry", "material"].forEach((key, i) => {
      const arg = obj.node.arguments[i];
      if (!arg) return;
      const inline = this.byNode.get(arg);
      if (inline) {
        obj.links[key] = inline.id;
        inline.owner = obj.id;
      } else if (arg.type === "Identifier" && bindings.get(arg.name) != null) {
        obj.links[key] = bindings.get(arg.name);
      }
    });
  }

  resolveStatement(s, bindings) {
    const expr = s.node.expression;
    const list = expr.type === "SequenceExpression" ? expr.expressions : [expr];
    for (const e of list) {
      const write = normalizeWrite(e);
      if (!write) continue;
      const rootId = bindings.get(write.root);
      if (rootId == null) continue;
      this.resolveWrite({ ...write, rootId, context: s.context, stmt: s.node }, bindings);
    }
  }

  resolveWrite(w, bindings) {
    let obj = this.objects[w.rootId];
    let path = w.path;
    const base = { rootId: w.rootId, context: w.context, from: w.stmt.start, to: w.stmt.end, line: this.lineOf(w.stmt.start), stmt: w.stmt };

    if (obj.kind === "mesh" && (path[0] === "material" || path[0] === "geometry")) {
      if (path.length === 1) {
        if (w.type === "assign" && w.context === "top") {
          const target = w.value.type === "Identifier" ? bindings.get(w.value.name) : this.byNode.get(w.value)?.id;
          obj.links[path[0]] = target ?? null;
        } else {
          obj.dynamicLinks = true;
        }
        return;
      }
      const linkId = obj.links[path[0]];
      if (linkId == null) return;
      obj = this.objects[linkId];
      path = path.slice(1);
    }

    const push = (key, status, slot, extra = {}) =>
      this.records.push({ id: obj.id, key, status, slot: slot || null, ...base, ...extra });
    if (w.type === "call") base.method = w.method;

    if (isObject3DKind(obj.kind)) {
      const [p0, p1] = path;
      if (TRANSFORMS[p0]) {
        if (path.length === 1 && w.type === "call" && w.method === "set") {
          AXES.forEach((axis, i) => {
            const arg = w.args[i];
            const slot = arg && this.numberSlot(arg, p0 === "rotation");
            push(`${p0}.${axis}`, slot ? "literal" : "expression", slot, { vector: { node: w.node, prop: p0, index: i } });
          });
        } else if (path.length === 2 && AXES.includes(p1) && w.type === "assign") {
          const slot = w.op === "=" ? this.numberSlot(w.value, p0 === "rotation") : null;
          push(`${p0}.${p1}`, w.op === "=" ? (slot ? "literal" : "expression") : "relative", slot);
        } else if (path.length === 1 && w.type === "call") {
          AXES.forEach((axis) => push(`${p0}.${axis}`, "method", null));
        }
        return;
      }
      if (path.length === 0 && w.type === "call") {
        if (TRANSLATE_METHODS.has(w.method)) AXES.forEach((a) => push(`position.${a}`, "relative", null));
        else if (ROTATE_METHODS.has(w.method)) AXES.forEach((a) => push(`rotation.${a}`, "method", null));
        else if (w.method === "applyMatrix4") {
          for (const p of Object.keys(TRANSFORMS)) AXES.forEach((a) => push(`${p}.${a}`, "method", null));
        }
        return;
      }
      if (p0 === "quaternion") {
        AXES.forEach((a) => push(`rotation.${a}`, "method", null));
        return;
      }
      if (OBJECT_FLAGS[p0] && path.length === 1 && w.type === "assign") {
        const slot = w.op === "=" ? booleanSlot(w.value) : null;
        push(p0, slot ? "literal" : "expression", slot);
        return;
      }
    }

    const props = classInfo(obj.className).props;
    const def = props && path.length === 1 ? props[path[0]] : null;
    if (!def) return;
    const key = path[0];
    if (def.type === "color") {
      if (w.type === "assign" && w.op === "=") {
        const slot = this.colorFromValue(w.value);
        push(key, slot ? "literal" : "expression", slot);
      } else if (w.type === "call") {
        const slot = COLOR_SET_METHODS.has(w.method) && w.args.length === 1 ? this.colorSlot(w.args[0]) : null;
        push(key, slot ? "literal" : "method", slot);
      }
    } else if (w.type === "assign") {
      if (w.op !== "=") return push(key, "relative", null);
      const slot = def.type === "boolean" ? booleanSlot(w.value) : this.numberSlot(w.value, def.unit === "rad");
      push(key, slot ? "literal" : "expression", slot);
    }
  }

  /** Argumentos do construtor e objeto de opções viram registros como qualquer escrita. */
  constructorRecords(obj) {
    const info = classInfo(obj.className);
    if (!info.props) return;
    const base = { rootId: obj.id, context: obj.context, from: obj.from, to: obj.to, line: obj.line, ctor: true };
    const push = (key, slot, extra) =>
      this.records.push({ id: obj.id, key, status: slot ? "literal" : "expression", slot: slot || null, ...base, ...extra });
    const args = obj.node.arguments;

    if (info.args) {
      info.args.forEach((key, i) => {
        if (!key || i >= args.length) return;
        const arg = args[i];
        const def = info.props[key];
        if (arg.type === "SpreadElement") obj.opaqueArgs = true;
        const slot = arg.type === "SpreadElement" ? null : this.slotByType(def, arg);
        push(key, slot, { argIndex: i });
      });
      if (args.some((a) => a.type === "SpreadElement")) obj.opaqueArgs = true;
    }
    if (info.options) {
      const first = args[0];
      if (first && first.type !== "ObjectExpression") obj.opaqueOptions = true;
      if (first && first.type === "ObjectExpression") {
        for (const p of first.properties) {
          if (p.type !== "Property" || p.computed || p.kind !== "init") {
            if (p.type === "SpreadElement") obj.opaqueOptions = true;
            continue;
          }
          const key = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null;
          const def = key && info.props[key];
          if (!def) continue;
          push(key, p.shorthand ? null : this.slotByType(def, p.value), { option: p });
        }
      }
    }
  }

  slotByType(def, node) {
    if (def.type === "color") return this.colorFromValue(node);
    if (def.type === "boolean") return booleanSlot(node);
    return this.numberSlot(node, def.unit === "rad");
  }

  numberSlot(node, angle) {
    const n = numberLiteral(node, this.code);
    if (n) return { kind: "number", ...n, unit: angle ? "rad" : undefined };
    if (angle && node.type === "CallExpression" && node.arguments.length === 1) {
      const chain = memberChain(node.callee);
      const inner = numberLiteral(node.arguments[0], this.code);
      if (chain && chain.root === "THREE" && chain.path.join(".") === "MathUtils.degToRad" && inner) {
        return { kind: "number", ...inner, value: (inner.value * Math.PI) / 180, degrees: inner.value, unit: "deg", call: { from: node.start, to: node.end } };
      }
    }
    // Expressão só com números e constantes (Math.PI / 2): editável, mas a edição troca a expressão inteira.
    const value = constantValue(node);
    if (value != null) {
      return { kind: "number", from: node.start, to: node.end, value, raw: this.code.slice(node.start, node.end), unit: angle ? "rad" : undefined, expr: true };
    }
    return null;
  }

  colorSlot(node) {
    if (node.type === "Literal" && typeof node.value === "string") {
      const raw = this.code.slice(node.start, node.end);
      return { kind: "color", from: node.start, to: node.end, raw, value: normalizeColor(node.value), format: "string", quote: raw[0] };
    }
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
      const raw = this.code.slice(node.start, node.end);
      return { kind: "color", from: node.start, to: node.end, raw, value: normalizeColor(node.quasis[0].value.cooked), format: "string", quote: "`" };
    }
    if (isNumberLiteral(node)) {
      const raw = this.code.slice(node.start, node.end);
      return { kind: "color", from: node.start, to: node.end, raw, value: "#" + node.value.toString(16).padStart(6, "0").slice(-6), format: "number" };
    }
    return null;
  }

  /** Cor como literal ou como new THREE.Color(literal). */
  colorFromValue(node) {
    if (node.type === "NewExpression" && threeMember(node.callee) === "Color" && node.arguments.length === 1) {
      return this.colorSlot(node.arguments[0]);
    }
    return this.colorSlot(node);
  }

  /** Decide, para cada propriedade, se ela tem um literal editável ou por que não. */
  computeProps(obj) {
    const mine = this.records.filter((r) => r.id === obj.id);
    const keys = new Set(mine.map((r) => r.key));
    for (const key of candidateKeys(obj)) keys.add(key);

    for (const key of keys) {
      const recs = mine.filter((r) => r.key === key).sort((a, b) => a.from - b.from);
      obj.props[key] = this.stateOf(obj, recs);
    }
  }

  stateOf(obj, recs) {
    if (obj.context !== "top") return { status: "readonly", reason: obj.context, line: obj.line };
    const dyn = recs.find((r) => r.context === "function" || r.context === "loop" || r.context === "conditional");
    if (dyn) return { status: "readonly", reason: "dynamic", line: dyn.line };
    const anim = recs.find((r) => r.context === "animar");
    if (anim) return { status: "readonly", reason: "animated", line: anim.line };
    const top = recs.filter((r) => r.context === "top");
    if (!top.length) return { status: "missing" };
    const last = top[top.length - 1];
    if (last.status === "literal") return { status: "slot", slot: last.slot, record: last };
    return { status: "readonly", reason: last.status, line: last.line };
  }

  /** Trechos que cada objeto "possui" no código, para o destaque cruzado. */
  computeRanges() {
    const add = (obj, from, to) => {
      if (!obj.ranges.some((r) => r.from === from && r.to === to)) obj.ranges.push({ from, to });
    };
    for (const obj of this.objects) {
      const stmt = obj.declStmt;
      add(obj, stmt ? stmt.start : obj.from, stmt ? stmt.end : obj.to);
    }
    for (const r of this.records) {
      if (r.ctor) continue;
      add(this.objects[r.rootId], r.from, r.to);
    }
    const byName = new Map(this.objects.filter((o) => o.name).map((o) => [o.name, o]));
    for (const call of this.addCalls) {
      const stmt = call.node;
      for (const arg of call.node.arguments) {
        const obj = arg.type === "Identifier" ? byName.get(arg.name) : this.byNode.get(arg);
        if (obj) add(obj, stmt.start, stmt.end);
      }
    }

    // intervalos → objetos da cena (materiais e geometrias apontam para as malhas que os usam)
    const intervals = [];
    for (const obj of this.objects) {
      const subjects = isObject3DKind(obj.kind) ? [obj.id] : obj.owner != null ? [obj.owner] : obj.users;
      if (!subjects.length) continue;
      for (const r of obj.ranges) intervals.push({ from: r.from, to: r.to, ids: subjects, size: r.to - r.from });
    }
    intervals.sort((a, b) => a.size - b.size);
    this.intervals = intervals;
  }

  diagnose() {
    const info = (node, message) =>
      this.diagnostics.push({ from: node.start, to: node.end, severity: "info", message, source: "subconjunto" });
    const warn = (node, message) =>
      this.diagnostics.push({ from: node.start, to: node.end, severity: "warning", message, source: "subconjunto" });

    for (const obj of this.objects) {
      const head = { start: obj.from, end: Math.min(obj.to, obj.node.callee.end) };
      if (obj.className === "WebGLRenderer") {
        warn(head, "O VisuGraph já cria o renderizador e desenha a cena: não é preciso um WebGLRenderer.");
      }
      if (!isObject3DKind(obj.kind)) continue;
      if (obj.context === "animar") {
        warn(head, "Isto cria um objeto novo a cada quadro. Crie o objeto fora de animar() e mude só as propriedades dentro dela.");
      } else if (obj.context !== "top") {
        info(head, `Objeto ${CONTEXT_REASONS[obj.context]}: ele aparece na cena, mas só pode ser editado pelo código.`);
      } else if (!obj.name && obj.kind !== "scene") {
        info(head, "Guarde o objeto numa variável (const nome = new THREE.…) para poder movê-lo pela cena.");
      }
    }
    for (const name of RUNTIME_NAMES) {
      const node = this.topDecls.get(name);
      if (node) {
        this.diagnostics.push({
          from: node.start, to: node.end, severity: "error", source: "subconjunto",
          message: `O nome ${name} já é usado pelo VisuGraph: escolha outro nome.`,
        });
      }
    }
    if (this.usesRaf) {
      info(this.usesRaf, "Para animar, escreva function animar(tempo) { … }: o VisuGraph chama essa função a cada quadro.");
    }
    if (this.code.trim() && !this.objects.some((o) => o.kind === "scene")) {
      const first = this.ast.body[0] || { start: 0, end: 0 };
      warn({ start: first.start, end: first.end }, "Nenhuma cena foi criada: comece com const cena = new THREE.Scene();");
    }
  }

  /** Liga cada número do código ao slot que ele representa (se houver). */
  mapNumbers() {
    const slots = new Map();
    for (const obj of this.objects) {
      for (const [key, state] of Object.entries(obj.props)) {
        if (state.status === "slot" && state.slot.kind === "number") {
          slots.set(`${state.slot.from}:${state.slot.to}`, { id: obj.id, key, unit: state.slot.unit });
        }
      }
    }
    for (const n of this.numbers) n.slot = slots.get(`${n.from}:${n.to}`) || null;
  }
}

/** Chaves editáveis de um objeto, mesmo as que ainda não aparecem no código. */
export function candidateKeys(obj) {
  const keys = [];
  if (isObject3DKind(obj.kind) && obj.kind !== "scene") {
    const info = classInfo(obj.className);
    const transformProps = info.positionless ? [] : obj.kind === "light" || obj.kind === "camera" ? ["position"] : Object.keys(TRANSFORMS);
    for (const p of transformProps) for (const a of AXES) keys.push(`${p}.${a}`);
    if (obj.kind === "mesh") keys.push("visible", "castShadow", "receiveShadow");
    else if (obj.kind === "light" && !info.positionless && obj.className !== "HemisphereLight") keys.push("castShadow");
  }
  const props = classInfo(obj.className).props;
  if (props) keys.push(...Object.keys(props));
  return keys;
}

/** `THREE.Mesh` → "Mesh"; qualquer outra coisa → null. */
export function threeMember(node) {
  if (node && node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" &&
    node.object.name === "THREE" && node.property.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

/** `cubo.position.x` → { root: "cubo", path: ["position", "x"] }. */
export function memberChain(node) {
  const path = [];
  let cur = node;
  while (cur && cur.type === "MemberExpression") {
    if (cur.computed || cur.property.type !== "Identifier") return null;
    path.unshift(cur.property.name);
    cur = cur.object;
  }
  if (!cur || cur.type !== "Identifier" || !path.length) return null;
  return { root: cur.name, path };
}

/** Atribuição ou chamada de método sobre uma variável: a forma das "escritas" na cena. */
function normalizeWrite(expr) {
  if (expr.type === "AssignmentExpression") {
    const chain = memberChain(expr.left);
    if (!chain) return null;
    return { type: "assign", root: chain.root, path: chain.path, op: expr.operator, value: expr.right, node: expr };
  }
  if (expr.type === "UpdateExpression") {
    const chain = memberChain(expr.argument);
    if (!chain) return null;
    return { type: "assign", root: chain.root, path: chain.path, op: expr.operator, value: null, node: expr };
  }
  if (expr.type === "CallExpression") {
    const chain = memberChain(expr.callee);
    if (!chain) return null;
    return { type: "call", root: chain.root, path: chain.path.slice(0, -1), method: chain.path[chain.path.length - 1], args: expr.arguments, node: expr };
  }
  return null;
}

function isNumberLiteral(node) {
  return node && node.type === "Literal" && typeof node.value === "number";
}

function numberLiteral(node, code) {
  if (isNumberLiteral(node)) return { from: node.start, to: node.end, value: node.value, raw: code.slice(node.start, node.end) };
  if (node && node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+") && isNumberLiteral(node.argument)) {
    const v = node.operator === "-" ? -node.argument.value : node.argument.value;
    return { from: node.start, to: node.end, value: v, raw: code.slice(node.start, node.end) };
  }
  return null;
}

const CONSTANTS = {
  "Math.PI": Math.PI,
  "THREE.MathUtils.DEG2RAD": Math.PI / 180,
  "THREE.MathUtils.RAD2DEG": 180 / Math.PI,
};

/** Valor de uma expressão feita só de números, + - * / ** e as constantes acima; senão null. */
export function constantValue(node) {
  let value = null;
  switch (node && node.type) {
    case "Literal":
      value = typeof node.value === "number" ? node.value : null;
      break;
    case "UnaryExpression": {
      const v = node.operator === "-" || node.operator === "+" ? constantValue(node.argument) : null;
      value = v == null ? null : node.operator === "-" ? -v : v;
      break;
    }
    case "BinaryExpression": {
      const a = constantValue(node.left);
      const b = a == null ? null : constantValue(node.right);
      if (b == null) break;
      if (node.operator === "+") value = a + b;
      else if (node.operator === "-") value = a - b;
      else if (node.operator === "*") value = a * b;
      else if (node.operator === "/") value = a / b;
      else if (node.operator === "**") value = a ** b;
      break;
    }
    case "MemberExpression": {
      const chain = memberChain(node);
      value = chain ? CONSTANTS[`${chain.root}.${chain.path.join(".")}`] ?? null : null;
      break;
    }
    case "CallExpression": {
      const chain = memberChain(node.callee);
      if (chain && `${chain.root}.${chain.path.join(".")}` === "THREE.MathUtils.degToRad" && node.arguments.length === 1) {
        const v = constantValue(node.arguments[0]);
        value = v == null ? null : (v * Math.PI) / 180;
      }
      break;
    }
  }
  return value != null && Number.isFinite(value) ? value : null;
}

function booleanSlot(node) {
  if (node && node.type === "Literal" && typeof node.value === "boolean") {
    return { kind: "boolean", from: node.start, to: node.end, value: node.value, raw: String(node.value) };
  }
  return null;
}

function patternNames(pattern) {
  const names = [];
  walk(pattern, (n, anc) => {
    const parent = anc[anc.length - 1];
    if (n.type === "Identifier" && !(parent && parent.type === "Property" && parent.key === n && !parent.shorthand)) names.push(n.name);
    if (n.type === "AssignmentPattern") {
      names.push(...patternNames(n.left));
      return false;
    }
    return undefined;
  });
  return names;
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function lineStarts(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
