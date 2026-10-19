// studySummary.js — o resumo do estudo: junta os registros exportados no fim da aula
// (visugraph-estudo-<código>.json) e a planilha dos testes e questionários numa linha por
// código de sessão, pronta para a análise (JASP, R ou a própria planilha).
//
// Tudo aqui é puro: entra o texto dos arquivos, saem as linhas, os avisos e o CSV. A página
// (studyPage.js) só lê os arquivos e desenha as tabelas.

import { TRAILS } from "./challenges.js";
import { FORMAT, MAX_EVENTS } from "./study.js";

/** Os desafios na ordem da aula (a das trilhas), que é também a das colunas. */
export const ORDER = TRAILS.flatMap((t) => t.challenges);

const ITEMS = Array.from({ length: 10 }, (_, i) => i + 1);
const TLX = ["tlx_mental", "tlx_fisica", "tlx_temporal", "tlx_desempenho", "tlx_esforco", "tlx_frustracao"];

/** Colunas do CSV: as da planilha (quando houver), as do registro e, no fim, as de controle. */
export const SHEET_COLUMNS = ["ordem", "pre", "pos", "g", "sus", "tlx"];
export const LOG_COLUMNS = [
  "minutos", "desafios", "dicas",
  ...ORDER.map((id) => `tempo_${id}`), ...ORDER.map((id) => `dicas_${id}`),
  "execucoes", "erros", "digitacao", "selecao", "gizmo", "painel", "arraste_numero", "adicionar", "aba_math", "math_hover", "vidro", "sonda", "saidas",
  "eventos", "inicio", "exportado",
];

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** K7QM-2XPA, do jeito que o aluno escreveu: maiúsculas, sem espaços e com o hífen no meio. */
export function normalizeCode(text) {
  const raw = String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** O registro exportado, ou null se o texto não for um registro do VisuGraph. */
export function parseLog(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  return data && data.formato === FORMAT && typeof data.sessao === "string" && Array.isArray(data.eventos) ? data : null;
}

/** Uma linha do resumo a partir de um registro: tempos, dicas e quanto cada recurso foi usado. */
export function summarizeLog(log) {
  const events = log.eventos;
  const count = (type, test = () => true) => events.filter((e) => e.evento === type && test(e)).length;
  // eventos em rajada (digitar, erros seguidos, passar o mouse) guardam a contagem em n
  const burst = (type) => events.reduce((sum, e) => (e.evento === type ? sum + (e.n ?? 1) : sum), 0);

  // tempo de cada desafio: a soma dos trechos com ele aberto e a página à vista, até concluir
  const spent = {};
  const time = {};
  const hints = {};
  let current = null;
  let since = null; // desde quando o tempo do desafio aberto está correndo (null: parado)
  const stop = (t) => {
    if (current && since != null) spent[current] = (spent[current] ?? 0) + t - since;
    since = null;
  };
  for (const e of events) {
    if (e.evento === "desafio.abrir") {
      stop(e.t);
      current = e.id;
      since = e.t;
    } else if (e.evento === "desafio.sair" && e.id === current) {
      stop(e.t);
      current = null;
    } else if (e.evento === "visibilidade") {
      if (e.visivel === false) stop(e.t);
      else if (current && since == null) since = e.t;
    } else if (e.evento === "desafio.dica" && !(e.id in time)) {
      // só as dicas de antes de concluir; n é a mais adiantada aberta, de 1 a 3
      hints[e.id] = Math.max(hints[e.id] ?? 0, e.n ?? 1);
    } else if (e.evento === "desafio.concluir" && !(e.id in time)) {
      if (e.id === current && since != null) {
        stop(e.t);
        since = e.t;
      }
      // sem o desafio.abrir (o começo do registro se perdeu), vale o tempo que o app mediu
      time[e.id] = e.id in spent ? spent[e.id] / 1000 : e.segundos;
    }
  }

  const row = {
    codigo: normalizeCode(log.sessao),
    grupo: log.grupo,
    // até o último evento; numa rajada, o fim dela (ate) pode vir depois de eventos de outro tipo
    minutos: round(Math.max(0, ...events.map((e) => e.ate ?? e.t)) / 60000, 1),
    desafios: ORDER.filter((id) => id in time).length,
    dicas: ORDER.reduce((sum, id) => sum + (hints[id] ?? 0), 0),
  };
  // tempo em segundos (vazio se não fez); dicas de 0 a 3
  for (const id of ORDER) row[`tempo_${id}`] = id in time && isNum(time[id]) ? round(time[id], 1) : "";
  for (const id of ORDER) row[`dicas_${id}`] = hints[id] ?? 0;
  Object.assign(row, {
    execucoes: count("execucao"),
    erros: burst("erro"),
    digitacao: burst("digitacao"),
    selecao: count("selecao"),
    gizmo: count("gizmo"),
    painel: count("painel"),
    arraste_numero: count("arraste_numero"),
    adicionar: count("adicionar"),
    aba_math: count("aba", (e) => e.aba === "math"),
    math_hover: burst("math.hover"),
    vidro: count("vidro", (e) => e.modelo !== "desligado"),
    sonda: count("sonda"),
    saidas: count("visibilidade", (e) => e.visivel === false),
    eventos: events.length,
    inicio: log.inicio ?? "",
    exportado: log.exportado ?? "",
  });
  return row;
}

/** Lê CSV com vírgula ou com ponto e vírgula (o Excel em português usa ;), com ou sem aspas. */
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) rows.push([...row, field]);
  const [header = [], ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const keys = header.map((h) => h.trim().toLowerCase());
  return { sep, keys, rows: body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()]))) };
}

/** Número de uma célula ("7,5" ou "7.5"); null se vazia ou se não for número. */
function cellNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Pré, pós, ganho de Hake, SUS e TLX de uma linha da planilha, a partir das notas de cada
 * questão e das respostas (ou das colunas pre, pos, sus e tlx, se a planilha já tiver os totais).
 * O que não dá para calcular fica vazio, e `problems` diz por quê.
 */
export function scoreInstruments(line) {
  const problems = [];
  const has = (key) => line[key] != null && String(line[key]).trim() !== "";
  // sem as respostas nem o total: só é problema se a planilha tem as colunas desse instrumento
  function missing(keys, name) {
    if (keys.some((k) => k in line)) problems.push(`sem ${name}`);
    return null;
  }

  function total(prefix, name) {
    const keys = ITEMS.map((i) => `${prefix}_${i}`);
    const given = keys.filter(has);
    if (!given.length) return has(prefix) ? cellNumber(line[prefix]) : missing([...keys, prefix], `as notas do ${name}`);
    if (given.length < keys.length) {
      problems.push(`faltam notas do ${name} (${keys.filter((k) => !has(k)).join(", ")})`);
      return null;
    }
    const values = keys.map((k) => cellNumber(line[k]));
    const bad = keys.filter((k, i) => values[i] == null || values[i] < 0 || values[i] > 10);
    if (bad.length) {
      problems.push(`nota fora de 0 a 10 no ${name} (${bad.join(", ")})`);
      return null;
    }
    return values.reduce((a, b) => a + b, 0);
  }

  function sus() {
    const keys = ITEMS.map((i) => `sus_${i}`);
    const given = keys.filter(has);
    if (!given.length) return has("sus") ? cellNumber(line.sus) : missing([...keys, "sus"], "as respostas do SUS");
    const values = keys.map((k) => cellNumber(line[k]));
    const bad = keys.filter((k, i) => !Number.isInteger(values[i]) || values[i] < 1 || values[i] > 5);
    if (bad.length) {
      problems.push(`SUS sem resposta de 1 a 5 em ${bad.join(", ")}`);
      return null;
    }
    // itens ímpares: resposta − 1; pares: 5 − resposta; o total vezes 2,5 vai de 0 a 100
    return 2.5 * values.reduce((sum, v, i) => sum + (i % 2 === 0 ? v - 1 : 5 - v), 0);
  }

  function tlx() {
    const given = TLX.filter(has);
    if (!given.length) return has("tlx") ? cellNumber(line.tlx) : missing([...TLX, "tlx"], "as escalas do TLX");
    const values = TLX.map((k) => cellNumber(line[k]));
    const bad = TLX.filter((k, i) => values[i] == null || values[i] < 0 || values[i] > 100);
    if (bad.length) {
      problems.push(`TLX sem valor de 0 a 100 em ${bad.join(", ")}`);
      return null;
    }
    return round(values.reduce((a, b) => a + b, 0) / TLX.length, 1); // TLX bruto: a média das seis
  }

  const pre = total("pre", "pré-teste");
  const pos = total("pos", "pós-teste");
  let g = null;
  if (pre != null && pos != null) {
    if (pre < 100) g = round((pos - pre) / (100 - pre), 3);
    else problems.push("pré-teste 100: sem ganho, porque o denominador é zero");
  }
  const ordem = String(line.ordem ?? "").trim().toUpperCase();
  if (ordem && ordem !== "AB" && ordem !== "BA") problems.push(`ordem "${line.ordem}" não é AB nem BA`);
  const values = { ordem, pre: pre ?? "", pos: pos ?? "", g: g ?? "", sus: sus() ?? "", tlx: tlx() ?? "" };
  return { values, problems };
}

/**
 * Junta os registros (`[{ name, text }]`) e a planilha (texto CSV, opcional) pelo código da
 * sessão. Devolve as linhas, as colunas do CSV e os avisos: arquivos que não são registros,
 * códigos repetidos ou que aparecem num lado só, grupos que não batem e respostas que faltam.
 */
export function buildSummary(files, sheetText = null) {
  const warnings = [];
  const byCode = new Map();
  for (const file of files) {
    const log = parseLog(file.text);
    if (!log) {
      warnings.push(`${file.name} não é um registro exportado pelo VisuGraph.`);
      continue;
    }
    const row = summarizeLog(log);
    if (log.eventos[0]?.evento !== "inicio") warnings.push(`${row.codigo}: o começo do registro se perdeu, porque ele guarda no máximo ${MAX_EVENTS} eventos.`);
    const before = byCode.get(row.codigo);
    if (before) {
      warnings.push(`${row.codigo} está em ${before.file} e em ${file.name}; ficou o exportado por último.`);
      if (row.exportado < before.row.exportado) continue;
    }
    byCode.set(row.codigo, { row, file: file.name });
  }
  const rows = [...byCode.values()].map((v) => v.row);

  let columns = ["codigo", "grupo", ...LOG_COLUMNS];
  if (sheetText != null) {
    columns = ["codigo", "grupo", ...SHEET_COLUMNS, ...LOG_COLUMNS];
    const sheet = parseCsv(sheetText);
    if (!sheet.keys.includes("codigo")) warnings.push("A planilha não tem a coluna codigo, então nada dela entrou no resumo.");
    else {
      const seen = new Set();
      for (const line of sheet.rows) {
        const code = normalizeCode(line.codigo);
        if (!code) continue;
        if (seen.has(code)) {
          warnings.push(`${code} aparece mais de uma vez na planilha; ficou a primeira linha.`);
          continue;
        }
        seen.add(code);
        const { values, problems } = scoreInstruments(line);
        for (const p of problems) warnings.push(`${code}: ${p}.`);
        const group = String(line.grupo ?? "").trim().toLowerCase();
        let target = byCode.get(code)?.row;
        if (!target) {
          warnings.push(`${code} está na planilha, mas em nenhum registro: confira no cartão do participante.`);
          target = { codigo: code, grupo: group };
          rows.push(target);
        } else if (group && group !== target.grupo) warnings.push(`${code}: a planilha diz grupo ${group}, e o registro diz ${target.grupo}; valeu o do registro.`);
        Object.assign(target, values);
      }
      for (const code of byCode.keys()) if (!seen.has(code)) warnings.push(`${code} tem registro, mas não está na planilha.`);
    }
  }
  rows.sort((a, b) => String(a.grupo).localeCompare(String(b.grupo)) || a.codigo.localeCompare(b.codigo));
  return { rows, columns, warnings };
}

/** n, média, desvio padrão (amostral) e mediana de cada medida, por grupo. */
export function groupStats(rows, measures) {
  const groups = [...new Set(rows.map((r) => r.grupo).filter(Boolean))].sort();
  return {
    groups,
    stats: measures.map((measure) => {
      const byGroup = {};
      for (const group of groups) byGroup[group] = describe(rows.filter((r) => r.grupo === group).map((r) => r[measure]).filter(isNum));
      return { measure, byGroup };
    }),
  };
}

function describe(values) {
  const n = values.length;
  if (!n) return { n: 0, mean: null, sd: null, median: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)) : null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, sd, median };
}

/**
 * O resumo em CSV: com vírgula e ponto decimal (JASP, R, Planilhas Google) ou, com
 * `excel`, com ponto e vírgula e vírgula decimal, como o Excel em português abre direto.
 */
export function toCsv(rows, columns, { excel = false } = {}) {
  const sep = excel ? ";" : ",";
  const cell = (v) => {
    if (v == null || v === "") return "";
    const text = excel && typeof v === "number" ? String(v).replace(".", ",") : String(v);
    // aspas só quando precisa: a vírgula decimal do modo Excel fica sem aspas, e o Excel lê o número
    return text.includes(sep) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(sep), ...rows.map((r) => columns.map((c) => cell(r[c])).join(sep))].join("\r\n") + "\r\n";
}
