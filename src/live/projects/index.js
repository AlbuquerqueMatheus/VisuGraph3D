// index.js — o guia de projetos: os níveis, os projetos de cada um e o que a aba Projetos
// calcula sobre o código de um passo (de onde ele parte e o que muda).
//
// Um projeto é uma sequência de passos que constroem uma cena completa. Cada passo tem o código
// inteiro como fica no fim dele (`code`), o objetivo, a explicação linha a linha (`lines`), o
// porquê das decisões (`why`), sugestões para mexer (`try`) e conferências da cena (`needs` e
// `checks`, como nos desafios: src/live/challenges.js).
//
// Os últimos passos podem ser "no seu computador" (kind: "computador"): o projeto sai do VisuGraph
// e roda com Node.js. Eles não mudam o código do editor nem conferem a cena; em vez disso têm os
// comandos (`setup`), os arquivos do projeto explicados (`files`) e o que conferir lá
// (`confirm`), e a pessoa diz que funcionou. O código deles é o do último passo no VisuGraph.

import { CIDADE } from "./cidade.js";
import { FLORESTA } from "./floresta.js";
import { GALAXIA } from "./galaxia.js";
import { GALAXIA_VIVA } from "./galaxiaViva.js";
import { MAR } from "./mar.js";
import { MONTANHA_RUSSA } from "./montanhaRussa.js";
import { PHONG } from "./phong.js";
import { SISTEMA_SOLAR } from "./sistemaSolar.js";
import { VITRINE } from "./vitrine.js";

export const LEVELS = [
  {
    id: "facil",
    title: "Fácil",
    about: "Cena, malhas, materiais e luz.",
    soon: [],
  },
  {
    id: "intermediario",
    title: "Intermediário",
    about: "Geometria feita à mão, milhares de objetos, curvas e animação.",
    soon: [],
  },
  {
    id: "avancado",
    title: "Avançado",
    about: "Shaders: o código que roda na placa de vídeo.",
    soon: [],
  },
];

export const PROJECTS = [SISTEMA_SOLAR, VITRINE, CIDADE, GALAXIA, MONTANHA_RUSSA, FLORESTA, PHONG, MAR, GALAXIA_VIVA];

export const projectById = (id) => PROJECTS.find((p) => p.id === id) ?? null;
export const levelOf = (project) => LEVELS.find((l) => l.id === project.level);

/** Índice do passo pelo id ou pelo número (1 a n); -1 se não existe. */
export function stepIndex(project, step) {
  const n = Number(step);
  if (Number.isInteger(n) && n >= 1 && n <= project.steps.length) return n - 1;
  return project.steps.findIndex((s) => s.id === step);
}

/** O código com que o passo começa: o do passo anterior, ou o de partida do projeto. */
export const startCode = (project, index) => (index === 0 ? project.start : project.steps[index - 1].code);

export const isComputer = (step) => step.kind === "computador";

/** Os passos feitos no VisuGraph, que vêm antes dos passos no computador. */
export const liveSteps = (project) => project.steps.filter((s) => !isComputer(s));

const normalize = (code) =>
  code
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/**
 * De qual passo o código é o fim, ignorando espaços no fim das linhas: 0 para o código de
 * partida, k para o fim do passo k, null se é outro código. Só os passos no VisuGraph contam.
 */
export function guideStep(project, code) {
  const mine = normalize(code);
  const ends = [project.start, ...liveSteps(project).map((s) => s.code)];
  for (let k = ends.length - 1; k >= 0; k--) if (normalize(ends[k]) === mine) return k;
  return null;
}

/**
 * Se o código é o fim de um passo do guia anterior ao começo do passo `index`: ao abrir o passo,
 * o editor troca o código pelo começo dele (os passos no computador começam do último no VisuGraph).
 */
export function behind(project, index, code) {
  const k = guideStep(project, code);
  return k != null && k < Math.min(index, liveSteps(project).length);
}

/**
 * O código no editor em relação ao passo `index`: "start" (o começo dele), "done" (o fim),
 * { guide: k } (o fim de outro passo k) ou "mine" (um código fora do guia).
 */
export function codeState(project, index, code) {
  const k = guideStep(project, code);
  if (k === index) return "start";
  if (k === index + 1) return "done";
  return k == null ? "mine" : { guide: k };
}

/**
 * Diferença linha a linha entre dois textos, pela maior subsequência comum: uma lista de
 * { op, text }, com op "same", "del" (só no primeiro) ou "add" (só no segundo). Com
 * `ignoreIndent`, uma linha que só mudou de recuo conta como igual, e aparece como no segundo.
 */
export function diffLines(before, after, { ignoreIndent = false } = {}) {
  const a = before.replace(/\n$/, "").split("\n");
  const b = after.replace(/\n$/, "").split("\n");
  const key = ignoreIndent ? (line) => line.trim() : (line) => line;
  const ka = a.map(key);
  const kb = b.map(key);
  // lcs[i][j]: tamanho da maior subsequência comum de a[i..] e b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      out.push({ op: "same", text: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: "del", text: a[i++] });
    else out.push({ op: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ op: "del", text: a[i++] });
  while (j < b.length) out.push({ op: "add", text: b[j++] });
  return out;
}

/**
 * Os trechos da diferença que mudam, com até `context` linhas iguais em volta de cada um.
 * As linhas iguais que ficam de fora viram { op: "skip", count }.
 */
export function hunks(diff, context = 2) {
  const keep = diff.map((d, i) => d.op !== "same" || diff.slice(Math.max(0, i - context), i + context + 1).some((x) => x.op !== "same"));
  const out = [];
  diff.forEach((d, i) => {
    if (keep[i]) out.push(d);
    else if (out.at(-1)?.op === "skip") out.at(-1).count++;
    else out.push({ op: "skip", count: 1 });
  });
  return out;
}

/** Onde está o trecho `code` (depois de `after`, se houver) no texto; null se não está. */
export function findSnippet(text, { code, after }) {
  const start = after ? text.indexOf(after) : 0;
  if (start < 0) return null;
  const from = text.indexOf(code, start);
  return from < 0 ? null : { from, to: from + code.length };
}
