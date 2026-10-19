// patch.js — da cena para o código.
//
// Transforma "dê o valor V à propriedade P do objeto N" em edições de texto mínimas:
// troca o literal que já define a propriedade (mantendo aspas, formato da cor e
// graus/radianos) ou, se nada a define, escreve no lugar mais natural: no argumento
// do construtor, no objeto de opções do material ou numa linha nova logo depois da
// última linha que mexe no objeto.

import { AXES, OBJECT_FLAGS, TRANSFORMS, classInfo } from "./catalog.js";
import { memberChain } from "./analyze.js";
import { formatColor, formatNumber, radToDeg } from "./format.js";

const DEG_CALL = "THREE.MathUtils.degToRad";

/** Definição (tipo, passo, casas decimais, limites) da propriedade `key` do objeto. */
export function propDef(obj, key) {
  const [p0, axis] = key.split(".");
  if (TRANSFORMS[p0] && axis) return { ...TRANSFORMS[p0], type: "number", transform: p0, axis };
  if (OBJECT_FLAGS[key]) return OBJECT_FLAGS[key];
  return classInfo(obj.className).props?.[key] ?? null;
}

const READONLY_MESSAGES = {
  expression: "vem de uma expressão",
  relative: "muda com +=, -= ou ++",
  method: "é definido por um método",
  dynamic: "muda dentro de uma função, laço ou if",
  animated: "é animado em animar()",
  loop: "o objeto é criado dentro de um laço",
  function: "o objeto é criado dentro de uma função",
  animar: "o objeto é criado dentro de animar()",
  conditional: "o objeto é criado dentro de um if ou bloco",
};

/** Explica por que uma propriedade não pode ser editada pela cena. */
export function readonlyMessage(state) {
  const what = READONLY_MESSAGES[state.reason] || "não pode ser editado pela cena";
  const at = state.line ? ` (linha ${state.line})` : "";
  return `${what[0].toUpperCase()}${what.slice(1)}${at}: edite pelo código.`;
}

const UNNAMED = "Guarde o objeto numa variável (const nome = new THREE.…) para editá-lo pela cena.";

/** Como uma edição de `key` chega ao código, ou por que não chega. */
function route(analysis, obj, key) {
  const def = propDef(obj, key);
  const state = obj.props[key];
  if (!def || !state) return { kind: "error", message: "Esta propriedade não é editável pela cena." };
  if (state.status === "readonly") return { kind: "error", message: readonlyMessage(state) };
  if (state.status === "slot") return { kind: "slot", def, state };

  // Nada no código define a propriedade: escolher onde escrevê-la.
  if (!def.transform && !OBJECT_FLAGS[key]) {
    const info = classInfo(obj.className);
    const argIndex = info.args ? info.args.indexOf(key) : -1;
    if (argIndex >= 0 && !obj.opaqueArgs) return { kind: "arg", def, index: argIndex };
    if (info.options && !obj.opaqueOptions) return { kind: "option", def };
    if (obj.kind === "geometry") {
      return { kind: "error", message: "Os argumentos desta geometria não são números escritos direto: edite pelo código." };
    }
  }
  const target = targetOf(analysis, obj);
  if (!target) return { kind: "error", message: UNNAMED };
  return { kind: "statement", def, ...target };
}

/** Nome pelo qual uma linha nova alcança o objeto: `cubo` ou, para um material sem nome, `cubo.material`. */
function targetOf(analysis, obj) {
  if (obj.name && obj.declStmt) return { path: obj.name, anchorObj: obj };
  if (obj.kind === "material" && obj.owner != null) {
    const owner = analysis.objects[obj.owner];
    if (owner.name && owner.declStmt) return { path: `${owner.name}.material`, anchorObj: owner };
  }
  return null;
}

/** A propriedade pode ser editada pela cena? Se não, `message` diz por quê. */
export function editability(analysis, id, key) {
  const obj = analysis.objects[id];
  if (!obj) return { editable: false, message: "Objeto não encontrado no código." };
  const r = route(analysis, obj, key);
  return r.kind === "error" ? { editable: false, message: r.message } : { editable: true, via: r.kind };
}

/** Quais eixos de position/rotation/scale o gizmo pode mexer. */
export function editableAxes(analysis, id, prop) {
  return AXES.map((axis) => editability(analysis, id, `${prop}.${axis}`).editable);
}

/**
 * Planeja as edições. `edits` = [{ id, key, value }], com ângulos em radianos e cores "#rrggbb".
 * `current(id, key)` dá o valor atual na cena, usado para completar position.set(x, y, z).
 * Retorna { changes: [{ from, to, insert }], errors: [{ id, key, message }] }, com as
 * posições de `changes` relativas ao código analisado.
 */
export function planEdits(analysis, edits, { current } = {}) {
  const changes = [];
  const errors = [];
  const byObject = new Map();
  for (const edit of edits) {
    if (!byObject.has(edit.id)) byObject.set(edit.id, []);
    byObject.get(edit.id).push(edit);
  }

  for (const [id, list] of byObject) {
    const obj = analysis.objects[id];
    if (!obj) {
      for (const e of list) errors.push({ id, key: e.key, message: "Objeto não encontrado no código." });
      continue;
    }
    const args = new Map();
    const options = [];
    const statements = [];
    for (const edit of list) {
      const r = route(analysis, obj, edit.key);
      if (r.kind === "error") errors.push({ id, key: edit.key, message: r.message });
      else if (r.kind === "slot") changes.push(slotChange(r, edit.value));
      else if (r.kind === "arg") args.set(r.index, valueText(r.def, edit.value));
      else if (r.kind === "option") options.push(`${edit.key}: ${valueText(r.def, edit.value)}`);
      else statements.push({ ...r, key: edit.key, value: edit.value });
    }
    if (args.size) changes.push(argsChange(analysis.code, obj, args));
    if (options.length) changes.push(...optionsChanges(analysis.code, obj, options));
    if (statements.length) changes.push(statementsChange(analysis, obj, statements, current));
  }
  return { changes: mergeChanges(changes), errors };
}

export function planEdit(analysis, id, key, value, opts) {
  return planEdits(analysis, [{ id, key, value }], opts);
}

/**
 * Edições para um arraste do gizmo: `values` são os três eixos de `prop` no fim do
 * arraste (rotação em radianos), `start`, os valores quando o arraste começou, e
 * `touched`, os eixos que o arraste mexeu em algum momento. Só esses eixos são escritos,
 * e só se o valor mostrado mudar: os outros ficam como o código diz, mesmo que a cena
 * na tela esteja desatualizada (código que ainda não rodou ou que deu erro).
 */
export function planTransform(analysis, id, prop, values, start, touched = [true, true, true]) {
  const obj = analysis.objects[id];
  if (!obj) return { changes: [], errors: [{ id, key: prop, message: "Objeto não encontrado no código." }] };
  const def = TRANSFORMS[prop];
  const shown = (v) => formatNumber(prop === "rotation" ? radToDeg(v) : v, def.decimals);
  const edits = [];
  AXES.forEach((axis, i) => {
    if (!touched[i]) return;
    const key = `${prop}.${axis}`;
    const state = obj.props[key];
    const before = state && state.status === "slot" ? state.slot.value : start[i];
    if (shown(values[i]) !== shown(before)) edits.push({ id, key, value: values[i] });
  });
  const current = (oid, key) => {
    const [p, axis] = key.split(".");
    return oid === id && p === prop ? start[AXES.indexOf(axis)] : undefined;
  };
  return planEdits(analysis, edits, { current });
}

// ---------------------------------------------------------------------------
// Texto dos valores

function degCall(rad, decimals = 1) {
  return `${DEG_CALL}(${formatNumber(radToDeg(rad), decimals)})`;
}

function valueText(def, value) {
  if (def.type === "color") return formatColor(value);
  if (def.type === "boolean") return String(!!value);
  if (def.unit === "rad") return degCall(value, def.decimals);
  return formatNumber(def.integer ? Math.round(value) : value, def.decimals);
}

/** Troca o literal existente, no mesmo estilo do original. */
function slotChange({ def, state }, value) {
  const slot = state.slot;
  const replace = (insert) => ({ from: slot.from, to: slot.to, insert });
  if (slot.kind === "color") return replace(formatColor(value, slot));
  if (slot.kind === "boolean") return replace(String(!!value));
  if (def.unit === "rad") {
    if (slot.unit === "deg") return replace(formatNumber(radToDeg(value), def.decimals)); // o número dentro de degToRad(…)
    // Expressões (Math.PI / 2), zeros e vizinhos em graus viram degToRad; radiano escrito à mão continua radiano.
    if (slot.expr || slot.value === 0 || neighborUsesDegrees(state.record)) return replace(degCall(value, def.decimals));
    return replace(formatNumber(value, 3));
  }
  return replace(formatNumber(def.integer ? Math.round(value) : value, def.decimals));
}

function neighborUsesDegrees(record) {
  const call = record && record.vector && record.vector.node;
  return !!call && call.arguments.some((a) => a.type === "CallExpression" && chainName(a.callee) === DEG_CALL);
}

function chainName(node) {
  const chain = memberChain(node);
  return chain ? `${chain.root}.${chain.path.join(".")}` : null;
}

// ---------------------------------------------------------------------------
// Argumentos do construtor

function hasArgParens(code, node) {
  return code.slice(node.callee.end, node.end).includes("(");
}

/** Completa os argumentos que faltam até o maior índice pedido, com os padrões do Three.js. */
function argsChange(code, obj, wanted) {
  const info = classInfo(obj.className);
  const node = obj.node;
  const args = node.arguments;
  const last = Math.max(...wanted.keys());
  const parts = [];
  for (let i = args.length; i <= last; i++) {
    if (wanted.has(i)) parts.push(wanted.get(i));
    else if (info.args[i]) parts.push(valueText(info.props[info.args[i]], info.props[info.args[i]].default));
    else parts.push(info.argText?.[i] ?? "undefined");
  }
  const text = parts.join(", ");
  if (args.length) return insertAt(argumentsEnd(code, node), `, ${text}`);
  if (hasArgParens(code, node)) return insertAt(node.end - 1, text);
  return insertAt(node.end, `(${text})`);
}

/** Fim do último argumento, incluindo os parênteses em volta dele, como em `(16 / 9)`. */
function argumentsEnd(code, node) {
  const close = node.end - 1; // o ")" da chamada
  let pos = node.arguments[node.arguments.length - 1].end;
  for (;;) {
    const next = skipTrivia(code, pos, close);
    if (next >= close || code[next] !== ")") return pos;
    pos = next + 1;
  }
}

// ---------------------------------------------------------------------------
// Objeto de opções do material

function optionsChanges(code, obj, pairs) {
  const node = obj.node;
  const first = node.arguments[0];
  const inline = `{ ${pairs.join(", ")} }`;
  if (!first) return [hasArgParens(code, node) ? insertAt(node.end - 1, inline) : insertAt(node.end, `(${inline})`)];
  const props = first.properties;
  if (!props.length) return [{ from: first.start, to: first.end, insert: inline }];

  const lastProp = props[props.length - 1];
  const close = first.end - 1;
  const afterProp = skipTrivia(code, lastProp.end, close);
  const comma = code[afterProp] === "," ? afterProp : -1;
  const afterLast = comma >= 0 ? comma + 1 : lastProp.end;

  if (!code.slice(afterLast, close).includes("\n")) {
    // { color: "#fff" } → { color: "#fff", roughness: 0.5 }
    if (comma >= 0) return [insertAt(afterLast, ` ${pairs.join(", ")},`)];
    return [insertAt(lastProp.end, `, ${pairs.join(", ")}`)];
  }
  // Objeto em várias linhas: uma propriedade por linha, com o recuo da última.
  const indent = lineIndent(code, lastProp.start);
  const body = pairs.map((p) => `\n${indent}${p}`).join(",") + (comma >= 0 ? "," : "");
  const out = [];
  if (comma < 0) out.push(insertAt(lastProp.end, ","));
  out.push(insertAt(lineEnd(code, afterLast), body));
  return out;
}

// ---------------------------------------------------------------------------
// Linhas novas

function defaultTransform(obj, prop, axisIndex) {
  if (prop === "scale") return 1;
  if (prop === "position") return classInfo(obj.className).defaultPosition?.[axisIndex] ?? 0;
  return 0;
}

function statementsChange(analysis, obj, items, current) {
  const lines = [];
  const done = new Set();
  for (const item of items) {
    const { def, key, value, path } = item;
    if (def.transform === "rotation") {
      lines.push(`${path}.rotation.${def.axis} = ${degCall(value, def.decimals)};`);
    } else if (def.transform) {
      const prop = def.transform;
      const allMissing = AXES.every((a) => obj.props[`${prop}.${a}`]?.status === "missing");
      if (!allMissing) {
        lines.push(`${path}.${prop}.${def.axis} = ${formatNumber(value, def.decimals)};`);
      } else if (!done.has(prop)) {
        done.add(prop);
        const values = AXES.map((axis, i) => {
          const edit = items.find((it) => it.key === `${prop}.${axis}`);
          if (edit) return edit.value;
          const now = current ? current(obj.id, `${prop}.${axis}`) : undefined;
          return now ?? defaultTransform(obj, prop, i);
        });
        lines.push(`${path}.${prop}.set(${values.map((v) => formatNumber(v, def.decimals)).join(", ")});`);
      }
    } else if (def.type === "color") {
      const text = formatColor(value);
      lines.push(key === "background" ? `${path}.background = new THREE.Color(${text});` : `${path}.${key}.set(${text});`);
    } else {
      lines.push(`${path}.${key} = ${valueText(def, value)};`);
    }
  }
  const anchorObj = items[0].anchorObj;
  // Mexer na posição depois de um lookAt() mudaria para onde o objeto olha: escrever antes dele.
  const beforeLookAt = items.some((it) => it.def.transform === "position");
  const { anchor, limit } = anchorStatement(analysis, anchorObj, beforeLookAt);
  const at = insertionPoint(analysis, anchor);
  // lookAt() na mesma linha da âncora: a linha nova não cabe entre os dois, vai na própria linha
  if (limit < at) return insertAt(limit, lines.map((l) => `${l} `).join(""));
  const indent = lineIndent(analysis.code, anchor.start);
  return insertAt(at, lines.map((l) => `\n${indent}${l}`).join(""));
}

/** A última instrução do topo que declara ou altera o objeto (antes de `limit`, o primeiro lookAt). */
function anchorStatement(analysis, obj, beforeLookAt) {
  const records = analysis.records.filter((r) => r.rootId === obj.id && r.context === "top" && !r.ctor);
  let limit = Infinity;
  if (beforeLookAt) for (const r of records) if (r.method === "lookAt") limit = Math.min(limit, r.stmt.start);
  let anchor = obj.declStmt;
  for (const r of records) if (r.stmt.end <= limit && r.stmt.end > anchor.end) anchor = r.stmt;
  return { anchor, limit };
}

/** Fim da última linha da instrução (depois de outras instruções ou comentários na mesma linha). */
function insertionPoint(analysis, stmt) {
  const { code } = analysis;
  let end = stmt.end;
  for (;;) {
    const eol = lineEnd(code, end);
    let next = eol;
    for (const node of [...analysis.ast.body, ...analysis.comments]) {
      if (node.start >= stmt.end && node.start < eol && node.end > next) next = node.end;
    }
    if (next === eol) return eol;
    end = next;
  }
}

// ---------------------------------------------------------------------------
// Utilitários de texto

const insertAt = (pos, insert) => ({ from: pos, to: pos, insert });

function lineEnd(code, pos) {
  const i = code.indexOf("\n", pos);
  return i < 0 ? code.length : i;
}

function lineIndent(code, pos) {
  const start = code.lastIndexOf("\n", pos - 1) + 1;
  return /^[ \t]*/.exec(code.slice(start))[0];
}

/** Pula espaços e comentários a partir de `pos`, sem passar de `limit`. */
function skipTrivia(code, pos, limit) {
  let i = pos;
  while (i < limit) {
    const c = code[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
    else if (code.startsWith("//", i)) i = lineEnd(code, i);
    else if (code.startsWith("/*", i)) {
      const close = code.indexOf("*/", i + 2);
      i = close < 0 ? limit : close + 2;
    } else break;
  }
  return Math.min(i, limit);
}

/**
 * Ordena as mudanças e junta as que se tocam (substituição seguida de inserção no
 * mesmo ponto, ou duas inserções no mesmo ponto), para que qualquer editor as aplique igual.
 */
export function mergeChanges(changes) {
  const sorted = changes.map((c, i) => ({ ...c, i })).sort((a, b) => a.from - b.from || a.to - b.to || a.i - b.i);
  const out = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && c.from === c.to && c.from === prev.to) prev.insert += c.insert;
    else if (prev && c.from < prev.to) continue; // sobreposição: fica a primeira
    else out.push({ from: c.from, to: c.to, insert: c.insert });
  }
  return out;
}

/** Aplica mudanças (posições do texto original) e devolve o texto novo. */
export function applyChanges(code, changes) {
  let out = "";
  let pos = 0;
  for (const c of mergeChanges(changes)) {
    out += code.slice(pos, c.from) + c.insert;
    pos = c.to;
  }
  return out + code.slice(pos);
}

// ---------------------------------------------------------------------------
// Números arrastáveis no editor

/** Passo, casas decimais e limites para arrastar um número do código; null se não fizer sentido. */
export function scrubInfo(analysis, number) {
  if (number.hex) return null;
  if (number.slot) {
    const obj = analysis.objects[number.slot.id];
    const def = obj && propDef(obj, number.slot.key);
    if (def && def.type === "number") {
      if (number.slot.unit === "deg") {
        const toDeg = (v) => (v == null ? undefined : radToDeg(v));
        return { step: 1, decimals: Math.max(number.decimals, 0), min: toDeg(def.min), max: toDeg(def.max) };
      }
      if (number.slot.unit === "rad") return { step: 0.01, decimals: Math.max(number.decimals, 2), min: def.min, max: def.max };
      return { step: def.step, decimals: Math.max(number.decimals, def.decimals), min: def.min, max: def.max };
    }
  }
  const decimals = Math.min(number.decimals, 3);
  return { step: 10 ** -decimals, decimals };
}

/** Mudança que troca o número por `value` (entre parênteses se ficar negativo dentro de uma conta). */
export function planNumber(number, value, decimals) {
  let text = formatNumber(value, decimals);
  // 10 -2*3 → 10 -(-1)*3, e não 10 --1*3; 2 ** 3 → (-1) ** 3
  if (number.operand && text.startsWith("-")) text = `(${text})`;
  return { from: number.from, to: number.to, insert: text };
}
