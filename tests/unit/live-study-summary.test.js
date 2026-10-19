import { describe, expect, it } from "vitest";
import { FORMAT, MAX_EVENTS } from "../../src/live/study.js";
import { LOG_COLUMNS, ORDER, SHEET_COLUMNS, buildSummary, groupStats, normalizeCode, parseCsv, parseLog, scoreInstruments, summarizeLog, toCsv } from "../../src/live/studySummary.js";

const makeLog = (sessao, grupo, eventos, extra = {}) => ({
  formato: FORMAT,
  sessao,
  grupo,
  inicio: "2026-10-20T13:00:00.000Z",
  eventos,
  exportado: "2026-10-20T14:00:00.000Z",
  ...extra,
});
const file = (name, log) => ({ name, text: JSON.stringify(log, null, 1) });
const simple = (sessao, grupo, extra) => makeLog(sessao, grupo, [{ t: 0, evento: "inicio" }, { t: 60000, evento: "execucao", ok: true }], extra);

// a linha de exemplo da planilha nos instrumentos do estudo: pré 70, pós 95, ganho 0,83, SUS 80 e TLX 27,5
const SHEET_HEADER = [
  "codigo", "grupo", "ordem",
  ...Array.from({ length: 10 }, (_, i) => `pre_${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `pos_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `sus_${i + 1}`),
  "tlx_mental", "tlx_fisica", "tlx_temporal", "tlx_desempenho", "tlx_esforco", "tlx_frustracao",
].join(",");
const SHEET_EXAMPLE = "K7QM-2XPA,experimental,AB,10,5,10,5,0,10,5,10,5,10,10,10,10,10,5,10,10,10,10,10,4,2,4,1,4,2,5,2,4,2,40,10,35,20,45,15";
const lineOf = (csvRow) => parseCsv(`${SHEET_HEADER}\n${csvRow}`).rows[0];

describe("resumo do estudo: o registro", () => {
  it("o código da sessão fica como o app mostra, do jeito que o aluno escrever", () => {
    expect(normalizeCode("k7qm2xpa")).toBe("K7QM-2XPA");
    expect(normalizeCode(" K7QM - 2XPA ")).toBe("K7QM-2XPA");
    expect(normalizeCode("K7QM-2XPA")).toBe("K7QM-2XPA");
    expect(normalizeCode("K7Q")).toBe("K7Q");
    expect(normalizeCode(undefined)).toBe("");
  });

  it("só aceita o registro exportado pelo VisuGraph", () => {
    expect(parseLog(JSON.stringify(simple("K7QM-2XPA", "controle")))?.sessao).toBe("K7QM-2XPA");
    expect(parseLog("não é json")).toBeNull();
    expect(parseLog(JSON.stringify({ formato: "outro/1", sessao: "K7QM-2XPA", eventos: [] }))).toBeNull();
    expect(parseLog(JSON.stringify({ formato: FORMAT, sessao: "K7QM-2XPA" }))).toBeNull();
  });

  it("o tempo de um desafio soma só os trechos com ele aberto e a página à vista", () => {
    const row = summarizeLog(
      makeLog("K7QM-2XPA", "experimental", [
        { t: 0, evento: "inicio" },
        { t: 3000, evento: "desafio.abrir", id: "posicao", origem: "lista" },
        { t: 10000, evento: "visibilidade", visivel: false },
        { t: 70000, evento: "visibilidade", visivel: true },
        { t: 73000, evento: "desafio.sair", id: "posicao", feito: false },
        { t: 74000, evento: "desafio.abrir", id: "rotacao", origem: "lista" },
        { t: 90000, evento: "desafio.abrir", id: "posicao", origem: "lista" },
        { t: 95000, evento: "desafio.concluir", id: "posicao", segundos: 5, dicas: 0 },
        { t: 100000, evento: "desafio.sair", id: "posicao", feito: true },
      ]),
    );
    // 7 s antes de esconder a página, 3 s depois de voltar e 5 s na segunda vez
    expect(row.tempo_posicao).toBe(15);
    expect(row.tempo_rotacao).toBe("");
    expect(row.desafios).toBe(1);
    expect(row.saidas).toBe(1);
    expect(row.minutos).toBe(1.7);
  });

  it("as dicas são a mais adiantada antes de concluir, mesmo se o desafio reabrir", () => {
    const row = summarizeLog(
      makeLog("K7QM-2XPA", "experimental", [
        { t: 0, evento: "inicio" },
        { t: 1000, evento: "desafio.abrir", id: "posicao", origem: "lista" },
        { t: 2000, evento: "desafio.dica", id: "posicao", n: 1 },
        { t: 3000, evento: "desafio.dica", id: "posicao", n: 2 },
        { t: 4000, evento: "desafio.abrir", id: "escala", origem: "lista" },
        { t: 5000, evento: "desafio.dica", id: "escala", n: 1 },
        { t: 6000, evento: "desafio.abrir", id: "posicao", origem: "lista" },
        { t: 7000, evento: "desafio.dica", id: "posicao", n: 1 },
        { t: 8000, evento: "desafio.concluir", id: "posicao", segundos: 2, dicas: 1 },
        { t: 9000, evento: "desafio.dica", id: "posicao", n: 2 },
        { t: 9500, evento: "desafio.dica", id: "posicao", n: 3 },
      ]),
    );
    expect(row.dicas_posicao).toBe(2);
    expect(row.dicas_escala).toBe(1);
    expect(row.dicas_rotacao).toBe(0);
    expect(row.dicas).toBe(3);
  });

  it("conta o uso de cada recurso, com as rajadas pela contagem n", () => {
    const row = summarizeLog(
      makeLog("K7QM-2XPA", "experimental", [
        { t: 0, evento: "inicio" },
        { t: 1000, evento: "execucao", ok: true, objetos: 3 },
        { t: 2000, evento: "erro", origem: "execucao", n: 4, ate: 8000 },
        { t: 9000, evento: "erro", origem: "sintaxe" },
        { t: 10000, evento: "execucao", ok: true, objetos: 3 },
        { t: 11000, evento: "digitacao", n: 7, ate: 15000 },
        { t: 16000, evento: "selecao", origem: "visor", tipo: "Mesh" },
        { t: 17000, evento: "gizmo", prop: "position" },
        { t: 18000, evento: "painel", chave: "position.x" },
        { t: 19000, evento: "arraste_numero", chave: "position.y" },
        { t: 20000, evento: "adicionar", tipo: "esfera" },
        { t: 21000, evento: "aba", aba: "math" },
        { t: 22000, evento: "aba", aba: "props" },
        { t: 23000, evento: "math.hover", keys: ["position.x"], n: 3, ate: 24000 },
        { t: 25000, evento: "vidro", modelo: "phong" },
        { t: 26000, evento: "vidro", modelo: "desligado" },
        { t: 27000, evento: "sonda", modelo: "phong", suportado: true },
      ]),
    );
    expect(row).toMatchObject({
      codigo: "K7QM-2XPA",
      grupo: "experimental",
      execucoes: 2,
      erros: 5,
      digitacao: 7,
      selecao: 1,
      gizmo: 1,
      painel: 1,
      arraste_numero: 1,
      adicionar: 1,
      aba_math: 1,
      math_hover: 3,
      vidro: 1,
      sonda: 1,
      saidas: 0,
      eventos: 17,
      inicio: "2026-10-20T13:00:00.000Z",
      exportado: "2026-10-20T14:00:00.000Z",
    });
    expect(Object.keys(row)).toEqual(["codigo", "grupo", ...LOG_COLUMNS]);
  });

  it("sem o desafio.abrir, que se perdeu no começo do registro, vale o tempo que o app mediu", () => {
    const row = summarizeLog(makeLog("K7QM-2XPA", "controle", [{ t: 500000, evento: "desafio.concluir", id: "matriz", segundos: 42.25, dicas: 0 }]));
    expect(row.tempo_matriz).toBe(42.3);
    expect(row.desafios).toBe(1);
  });
});

describe("resumo do estudo: a planilha", () => {
  it("lê CSV com vírgula, aspas e a marca BOM do Excel", () => {
    const { sep, keys, rows } = parseCsv('\uFEFFCodigo,Grupo,obs\r\nK7QM-2XPA,controle,"disse ""ok"", e saiu"\r\n\r\nABCD-EFGH,experimental,\r\n');
    expect(sep).toBe(",");
    expect(keys).toEqual(["codigo", "grupo", "obs"]);
    expect(rows).toEqual([
      { codigo: "K7QM-2XPA", grupo: "controle", obs: 'disse "ok", e saiu' },
      { codigo: "ABCD-EFGH", grupo: "experimental", obs: "" },
    ]);
  });

  it("lê o CSV do Excel em português, com ponto e vírgula e vírgula decimal", () => {
    const { sep, rows } = parseCsv("codigo;pre;pos;tlx\nk7qm2xpa;70;95;27,5");
    expect(sep).toBe(";");
    expect(rows).toEqual([{ codigo: "k7qm2xpa", pre: "70", pos: "95", tlx: "27,5" }]);
    expect(scoreInstruments(rows[0]).values).toMatchObject({ pre: 70, pos: 95, g: 0.833, tlx: 27.5 });
  });

  it("corrige a linha de exemplo dos instrumentos", () => {
    const { values, problems } = scoreInstruments(lineOf(SHEET_EXAMPLE));
    expect(problems).toEqual([]);
    expect(values).toEqual({ ordem: "AB", pre: 70, pos: 95, g: 0.833, sus: 80, tlx: 27.5 });
  });

  it("as contas do SUS vão de 0 a 100", () => {
    const sus = (answers) => scoreInstruments(Object.fromEntries(answers.map((v, i) => [`sus_${i + 1}`, String(v)]))).values.sus;
    expect(sus([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(sus([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(sus([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
  });

  it("o que não dá para calcular fica vazio e diz por quê", () => {
    const bad = SHEET_EXAMPLE.split(",");
    bad[2] = "AC"; // ordem
    bad[3] = ""; // pre_1
    bad[17] = "12"; // pos_5
    bad[23] = "6"; // sus_1
    bad[33] = "120"; // tlx_mental
    const { values, problems } = scoreInstruments(lineOf(bad.join(",")));
    expect(values).toMatchObject({ pre: "", pos: "", g: "", sus: "", tlx: "" });
    expect(problems).toEqual([
      "faltam notas do pré-teste (pre_1)",
      "nota fora de 0 a 10 no pós-teste (pos_5)",
      'ordem "AC" não é AB nem BA',
      "SUS sem resposta de 1 a 5 em sus_1",
      "TLX sem valor de 0 a 100 em tlx_mental",
    ]);
  });

  it("aceita os totais no lugar das notas e só cobra o instrumento que a planilha tem", () => {
    expect(scoreInstruments({ codigo: "K7QM-2XPA", pre: "60", pos: "80" })).toEqual({ values: { ordem: "", pre: 60, pos: 80, g: 0.5, sus: "", tlx: "" }, problems: [] });
    expect(scoreInstruments({ codigo: "K7QM-2XPA", pre: "60", pos: "", sus: "72,5" }).problems).toEqual(["sem as notas do pós-teste"]);
    expect(scoreInstruments({ pre: "100", pos: "100" })).toMatchObject({ values: { g: "" }, problems: ["pré-teste 100: sem ganho, porque o denominador é zero"] });
  });
});

describe("resumo do estudo: juntando tudo", () => {
  it("junta registro e planilha pelo código e avisa o que não bate", () => {
    const logs = [
      file("visugraph-estudo-K7QM-2XPA.json", simple("K7QM-2XPA", "experimental")),
      file("visugraph-estudo-ABCD-EFGH.json", simple("ABCD-EFGH", "controle")),
      file("visugraph-estudo-ABCD-EFGH (1).json", simple("ABCD-EFGH", "controle", { exportado: "2026-10-20T14:30:00.000Z" })),
      file("visugraph-estudo-ZZZZ-9999.json", makeLog("ZZZZ-9999", "controle", [{ t: 5000, evento: "execucao", ok: true }])),
      { name: "anotacoes.json", text: "{}" },
    ];
    const sheet = [SHEET_HEADER, SHEET_EXAMPLE, SHEET_EXAMPLE.replace("K7QM-2XPA,experimental", "k7qm2xpa,experimental"), SHEET_EXAMPLE.replace("K7QM-2XPA,experimental", "abcd efgh,experimental"), SHEET_EXAMPLE.replace("K7QM-2XPA", "NOVO-0001")].join("\n");
    const { rows, columns, warnings } = buildSummary(logs, sheet);

    expect(columns).toEqual(["codigo", "grupo", ...SHEET_COLUMNS, ...LOG_COLUMNS]);
    expect(warnings).toEqual([
      "ABCD-EFGH está em visugraph-estudo-ABCD-EFGH.json e em visugraph-estudo-ABCD-EFGH (1).json; ficou o exportado por último.",
      `ZZZZ-9999: o começo do registro se perdeu, porque ele guarda no máximo ${MAX_EVENTS} eventos.`,
      "anotacoes.json não é um registro exportado pelo VisuGraph.",
      "K7QM-2XPA aparece mais de uma vez na planilha; ficou a primeira linha.",
      "ABCD-EFGH: a planilha diz grupo experimental, e o registro diz controle; valeu o do registro.",
      "NOVO-0001 está na planilha, mas em nenhum registro: confira no cartão do participante.",
      "ZZZZ-9999 tem registro, mas não está na planilha.",
    ]);
    expect(rows.map((r) => `${r.grupo} ${r.codigo}`)).toEqual(["controle ABCD-EFGH", "controle ZZZZ-9999", "experimental K7QM-2XPA", "experimental NOVO-0001"]);
    expect(rows[0]).toMatchObject({ exportado: "2026-10-20T14:30:00.000Z", pre: 70, sus: 80 });
    expect(rows[2]).toMatchObject({ ordem: "AB", pre: 70, pos: 95, g: 0.833, sus: 80, tlx: 27.5, minutos: 1 });
    expect(rows[3]).toEqual({ codigo: "NOVO-0001", grupo: "experimental", ordem: "AB", pre: 70, pos: 95, g: 0.833, sus: 80, tlx: 27.5 });
  });

  it("só com os registros, as colunas da planilha ficam de fora", () => {
    const { columns, warnings } = buildSummary([file("a.json", simple("K7QM-2XPA", "controle"))]);
    expect(columns).toEqual(["codigo", "grupo", ...LOG_COLUMNS]);
    expect(columns).toContain(`tempo_${ORDER[0]}`);
    expect(warnings).toEqual([]);
  });

  it("uma planilha sem a coluna codigo não entra", () => {
    const { rows, warnings } = buildSummary([file("a.json", simple("K7QM-2XPA", "controle"))], "nome;pre\nAna;50");
    expect(warnings).toEqual(["A planilha não tem a coluna codigo, então nada dela entrou no resumo."]);
    expect(rows[0].pre).toBeUndefined();
  });

  it("média, desvio padrão amostral e mediana por grupo", () => {
    const rows = [
      { grupo: "controle", g: 0.2 },
      { grupo: "controle", g: 0.4 },
      { grupo: "controle", g: "" },
      { grupo: "experimental", g: 0.5 },
      { grupo: "experimental", g: 0.6 },
      { grupo: "experimental", g: 0.9 },
    ];
    const { groups, stats } = groupStats(rows, ["g", "sus"]);
    expect(groups).toEqual(["controle", "experimental"]);
    expect(stats[0].byGroup.controle).toMatchObject({ n: 2, mean: expect.closeTo(0.3, 10), sd: expect.closeTo(Math.SQRT2 / 10, 10), median: expect.closeTo(0.3, 10) });
    expect(stats[0].byGroup.experimental).toMatchObject({ n: 3, mean: expect.closeTo(2 / 3, 10), median: 0.6 });
    expect(stats[1].byGroup.controle).toEqual({ n: 0, mean: null, sd: null, median: null });
  });

  it("o CSV sai com ponto decimal, ou do jeito do Excel em português", () => {
    const rows = [{ codigo: "K7QM-2XPA", grupo: "experimental", g: 0.833, obs: 'disse "ok"; saiu', vazio: "" }];
    const columns = ["codigo", "grupo", "g", "obs", "vazio"];
    expect(toCsv(rows, columns)).toBe('codigo,grupo,g,obs,vazio\r\nK7QM-2XPA,experimental,0.833,"disse ""ok""; saiu",\r\n');
    expect(toCsv(rows, columns, { excel: true })).toBe('codigo;grupo;g;obs;vazio\r\nK7QM-2XPA;experimental;0,833;"disse ""ok""; saiu";\r\n');
    // e a página lê de volta o que ela mesma gerou
    expect(parseCsv(toCsv(rows, columns, { excel: true })).rows[0]).toMatchObject({ g: "0,833", obs: 'disse "ok"; saiu' });
  });
});
