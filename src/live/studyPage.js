// studyPage.js — a página do resumo do estudo (estudo.html): lê os registros exportados e a
// planilha dos instrumentos, mostra os avisos e as tabelas e baixa o CSV para a análise.
// As contas ficam em studySummary.js.

import { buildSummary, groupStats, toCsv } from "./studySummary.js";

const $ = (selector) => document.querySelector(selector);
const logsInput = $("#st-logs");
const sheetInput = $("#st-sheet");

/** Medidas da tabela por grupo, na ordem da análise (as da planilha só aparecem com ela). */
const MEASURES = [
  ["pre", "Pré-teste"],
  ["pos", "Pós-teste"],
  ["g", "Ganho (g)"],
  ["sus", "SUS"],
  ["tlx", "NASA-TLX"],
  ["desafios", "Desafios feitos"],
  ["minutos", "Minutos de sessão"],
  ["dicas", "Dicas abertas"],
  ["execucoes", "Execuções do código"],
  ["erros", "Erros"],
];

/** Colunas da tabela por sessão; o CSV traz todas. */
const SESSION_COLUMNS = [
  ["codigo", "Código"],
  ["grupo", "Grupo"],
  ["ordem", "Ordem"],
  ["pre", "Pré"],
  ["pos", "Pós"],
  ["g", "g"],
  ["sus", "SUS"],
  ["tlx", "TLX"],
  ["desafios", "Desafios"],
  ["minutos", "Minutos"],
  ["dicas", "Dicas"],
  ["erros", "Erros"],
];

let summary = null;

const number = (v, digits = 2) => (typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : String(v ?? ""));

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function row(tag, texts) {
  const tr = document.createElement("tr");
  tr.append(...texts.map((t) => cell(tag, t)));
  return tr;
}

async function update() {
  const files = await Promise.all([...logsInput.files].map(async (file) => ({ name: file.name, text: await file.text() })));
  const sheet = sheetInput.files[0] ? await sheetInput.files[0].text() : null;
  summary = files.length || sheet != null ? buildSummary(files, sheet) : null;
  render();
}

function render() {
  $("#st-empty").hidden = !!summary;
  for (const id of ["#st-groups", "#st-sessions"]) $(id).hidden = !summary;
  $("#st-warnings").hidden = !summary?.warnings.length;
  if (!summary) return;
  const { rows, columns, warnings } = summary;

  $("#st-warnings ul").replaceChildren(...warnings.map((w) => cell("li", w)));

  const measures = MEASURES.filter(([key]) => columns.includes(key));
  const { groups, stats } = groupStats(rows, measures.map(([key]) => key));
  const label = Object.fromEntries(measures);
  const describe = ({ n, mean, sd }) => (n ? `${number(mean)}${sd == null ? "" : ` ± ${number(sd)}`} (n = ${n})` : "—");
  $("#st-groups table").replaceChildren(
    row("th", ["Medida", ...groups]),
    ...stats.map((s) => row("td", [label[s.measure], ...groups.map((g) => describe(s.byGroup[g]))])),
  );

  const shown = SESSION_COLUMNS.filter(([key]) => columns.includes(key));
  $("#st-sessions table").replaceChildren(
    row("th", shown.map(([, title]) => title)),
    ...rows.map((r) => row("td", shown.map(([key]) => number(r[key], 3)))),
  );
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

logsInput.addEventListener("change", update);
sheetInput.addEventListener("change", update);
$("#st-csv").addEventListener("click", () => download(toCsv(summary.rows, summary.columns), "resumo-estudo.csv"));
// a marca BOM faz o Excel ler o arquivo como UTF-8
$("#st-csv-excel").addEventListener("click", () => download(`\uFEFF${toCsv(summary.rows, summary.columns, { excel: true })}`, "resumo-estudo-excel.csv"));
