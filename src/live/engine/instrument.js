// instrument.js — prepara o código para rodar no visor.
//
// Cada `new THREE.X(...)` vira `__vg.t(id, new THREE.X(...))`, para o visor saber
// qual objeto veio de qual trecho do código, e cada laço ganha `__vg.l()`, que
// interrompe laços infinitos. Nenhuma quebra de linha é inserida: as linhas do
// erro no visor são as mesmas do editor.

import { RUNTIME_NAMES } from "./catalog.js";

export const SCRIPT_NAME = "cena.js";

const PREFIX = `(function(${RUNTIME_NAMES.join(",")}){"use strict";try{`;
const CALL_ARGS = RUNTIME_NAMES.map((name) => (name === "__vg" ? "__vg" : name === "THREE" ? "__vg.THREE" : `__vg.timers.${name}`));
const SUFFIX =
  `\n;__vg.end(typeof animar==="function"?animar:null)}catch(e){__vg.fail(e)}})(${CALL_ARGS.join(",")});` +
  `\n//# sourceURL=${SCRIPT_NAME}`;

/**
 * Gera o script do visor a partir de uma análise sem erros.
 * Retorna { script, toOriginal(line, column) }: `toOriginal` converte uma posição do
 * script (linha a partir de 1, coluna a partir de 0) para a posição no código do editor.
 */
export function instrument(analysis) {
  const inserts = [];
  for (const obj of analysis.objects) {
    const size = obj.to - obj.from;
    inserts.push({ pos: obj.from, text: `__vg.t(${obj.id},`, open: true, loop: false, size });
    inserts.push({ pos: obj.to, text: ")", open: false, loop: false, size });
  }
  for (const loop of analysis.loops) {
    if (loop.block) {
      inserts.push({ pos: loop.bodyFrom + 1, text: "__vg.l();", open: true, loop: true, size: Infinity });
    } else {
      const size = loop.bodyTo - loop.bodyFrom;
      inserts.push({ pos: loop.bodyFrom, text: "{__vg.l();", open: true, loop: true, size });
      inserts.push({ pos: loop.bodyTo, text: "}", open: false, loop: true, size });
    }
  }
  // No mesmo ponto: primeiro fecha, depois abre; quem envolve abre antes e fecha depois.
  inserts.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.open !== b.open) return a.open ? 1 : -1;
    if (a.loop !== b.loop) return a.open === a.loop ? -1 : 1;
    return a.open ? b.size - a.size : a.size - b.size;
  });

  const { code } = analysis;
  let body = "";
  let pos = 0;
  for (const ins of inserts) {
    body += code.slice(pos, ins.pos) + ins.text;
    pos = ins.pos;
  }
  body += code.slice(pos);

  const bodyLineStarts = lineStarts(body);
  const codeLineStarts = lineStarts(code);
  return {
    script: PREFIX + body + SUFFIX,
    toOriginal(line, column) {
      const col = line === 1 ? column - PREFIX.length : column;
      const start = bodyLineStarts[line - 1];
      if (start == null) return null;
      let offset = Math.max(0, start + Math.max(0, col));
      // desfaz as inserções que estão antes da posição
      let shift = 0;
      for (const ins of inserts) {
        const at = ins.pos + shift;
        if (at + ins.text.length <= offset) shift += ins.text.length;
        else {
          if (at <= offset) offset = at;
          break;
        }
      }
      const original = Math.min(code.length, offset - shift);
      const l = Math.min(line, codeLineStarts.length);
      return { line: l, column: Math.max(0, original - codeLineStarts[l - 1]), offset: original };
    },
  };
}

/** Linha e coluna do primeiro trecho do código da cena numa pilha de erro (Chrome ou Firefox). */
export function scriptPosition(stack) {
  const m = new RegExp(`${SCRIPT_NAME.replace(".", "\\.")}:(\\d+):(\\d+)`).exec(String(stack || ""));
  return m ? { line: Number(m[1]), column: Number(m[2]) - 1 } : null;
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
