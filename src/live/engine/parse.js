// parse.js — leitura do código com Acorn e mensagens de erro em português.

import { parse as acornParse } from "acorn";

/**
 * Lê o código como módulo (modo estrito, como no runtime), mas recusa import/export
 * e await fora de função, que o runtime não aceita.
 * Retorna { ast, comments } ou { error: { message, line, column, from, to } }.
 */
export function parseCode(code) {
  let ast;
  const comments = [];
  try {
    ast = acornParse(code, { ecmaVersion: "latest", sourceType: "module", locations: true, onComment: comments });
  } catch (err) {
    return { error: syntaxError(err, code) };
  }

  for (const node of ast.body) {
    if (node.type === "ImportDeclaration" || node.type.startsWith("Export")) {
      return { error: errorAt(node, "Não use import/export: o THREE já está disponível no editor.") };
    }
  }
  const topAwait = findTopLevelAwait(ast);
  if (topAwait) return { error: errorAt(topAwait, "await só funciona dentro de uma função async.") };

  return { ast, comments };
}

/** Percorre os nós filhos de um nó ESTree, na ordem das chaves. */
export function forEachChild(node, fn) {
  for (const key in node) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === "string") fn(child);
    } else if (value && typeof value.type === "string") {
      fn(value);
    }
  }
}

/** Visita a árvore em pré-ordem. `visit(node, ancestors)`; retornar false não desce nos filhos. */
export function walk(root, visit) {
  const ancestors = [];
  (function go(node) {
    if (visit(node, ancestors) === false) return;
    ancestors.push(node);
    forEachChild(node, go);
    ancestors.pop();
  })(root);
}

export const isFunctionNode = (node) =>
  node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";

export const isLoopNode = (node) =>
  node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement" ||
  node.type === "WhileStatement" || node.type === "DoWhileStatement";

function findTopLevelAwait(ast) {
  let found = null;
  walk(ast, (node) => {
    if (found || isFunctionNode(node) || node.type === "ClassBody") return false;
    if (node.type === "AwaitExpression" || (node.type === "ForOfStatement" && node.await)) found = node;
    return undefined;
  });
  return found;
}

function errorAt(node, message) {
  return { message, line: node.loc.start.line, column: node.loc.start.column, from: node.start, to: node.end };
}

const TRANSLATIONS = [
  [/^Unexpected token/, (m, ctx) => (ctx.atEnd ? "O código terminou antes da hora: falta fechar um ( , [ ou {?" : "Símbolo inesperado")],
  [/^Unexpected character '(.+)'/, (m) => `Caractere inesperado '${m[1]}'`],
  [/^Unterminated string constant/, () => "Texto entre aspas sem fechar"],
  [/^Unterminated template/, () => "Template string (`…`) sem fechar"],
  [/^Unterminated comment/, () => "Comentário /* … */ sem fechar"],
  [/^Unterminated regular expression/, () => "Expressão regular sem fechar"],
  [/^Identifier '(.+)' has already been declared/, (m) => `O nome '${m[1]}' já foi declarado antes`],
  [/^Unexpected keyword '(.+)'/, (m) => `A palavra '${m[1]}' não pode aparecer aqui`],
  [/^The keyword '(.+)' is reserved/, (m) => `'${m[1]}' é uma palavra reservada do JavaScript`],
  [/^Unexpected reserved word/, () => "Palavra reservada do JavaScript fora do lugar"],
  [/^Assigning to rvalue/, () => "Não dá para atribuir um valor a esta expressão"],
  [/^'return' outside of function/, () => "return fora de uma função"],
  [/^Octal literal in strict mode/, () => "Números não podem começar com zero (ex.: 010)"],
  [/^'with' in strict mode/, () => "with não é permitido"],
  [/^Invalid number/, () => "Número inválido"],
  [/^Cannot use keyword 'await'/, () => "await só funciona dentro de uma função async"],
  [/^Missing initializer in const declaration/, () => "const precisa de um valor: const nome = …"],
];

function syntaxError(err, code) {
  const raw = String(err.message || err).replace(/\s*\(\d+:\d+\)\s*$/, "");
  const pos = typeof err.pos === "number" ? err.pos : 0;
  const ctx = { atEnd: pos >= code.trimEnd().length };
  let message = `Erro de sintaxe: ${raw}`;
  for (const [re, fn] of TRANSLATIONS) {
    const m = re.exec(raw);
    if (m) {
      message = fn(m, ctx);
      break;
    }
  }
  const to = Math.min(code.length, Math.max(pos + 1, typeof err.raisedAt === "number" ? err.raisedAt : pos + 1));
  return {
    message,
    line: err.loc ? err.loc.line : 1,
    column: err.loc ? err.loc.column : 0,
    from: Math.min(pos, code.length),
    to,
  };
}
