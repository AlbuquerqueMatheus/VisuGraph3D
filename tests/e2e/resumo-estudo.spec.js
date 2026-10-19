// Resumo do estudo: a página junta os registros exportados e a planilha dos testes num CSV.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { objectId, status } from "./live.js";

const json = (name, data) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data, null, 1)) });
const csv = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

const log = (sessao, grupo, eventos) => ({
  formato: "visugraph-estudo/1",
  sessao,
  grupo,
  inicio: "2026-10-20T13:00:00.000Z",
  eventos: [{ t: 0, evento: "inicio" }, ...eventos],
  exportado: "2026-10-20T14:00:00.000Z",
});

/** Linhas da tabela (cabeçalho incluído), como texto. */
const table = (page, section) =>
  page.locator(`${section} table tr`).evaluateAll((rows) => rows.map((tr) => [...tr.children].map((c) => c.textContent)));

async function downloadText(page, button) {
  const download = page.waitForEvent("download");
  await page.click(button);
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), "utf8") };
}

test("resumo do estudo: junta registros e planilha pelo código, avisa o que não bate e baixa o CSV", async ({ page }) => {
  await page.goto("estudo.html");
  await expect(page.locator("#st-empty")).toBeVisible();
  await expect(page.locator("#st-sessions")).toBeHidden();

  await page.setInputFiles("#st-logs", [
    json("visugraph-estudo-K7QM-2XPA.json", log("K7QM-2XPA", "experimental", [
      { t: 1000, evento: "desafio.abrir", id: "posicao", origem: "trilha" },
      { t: 2000, evento: "desafio.dica", id: "posicao", n: 1 },
      { t: 31000, evento: "desafio.concluir", id: "posicao", segundos: 30, dicas: 1 },
      { t: 120000, evento: "erro", origem: "sintaxe", n: 3, ate: 125000 },
    ])),
    json("visugraph-estudo-ABCD-EFGH.json", log("ABCD-EFGH", "controle", [{ t: 60000, evento: "execucao", ok: true, objetos: 3 }])),
    json("notas.json", { qualquer: "coisa" }),
  ]);
  await expect(page.locator("#st-empty")).toBeHidden();
  await expect(page.locator("#st-warnings li")).toHaveText(["notas.json não é um registro exportado pelo VisuGraph."]);
  expect(await table(page, "#st-sessions")).toEqual([
    ["Código", "Grupo", "Desafios", "Minutos", "Dicas", "Erros"],
    ["ABCD-EFGH", "controle", "0", "1", "0", "0"],
    ["K7QM-2XPA", "experimental", "1", "2,1", "1", "3"],
  ]);
  expect((await table(page, "#st-groups"))[0]).toEqual(["Medida", "controle", "experimental"]);

  // a planilha do Excel em português: ponto e vírgula, vírgula decimal e o código escrito de outro jeito
  await page.setInputFiles("#st-sheet", csv("instrumentos.csv", "codigo;grupo;ordem;pre;pos;sus;tlx\nk7qm2xpa;experimental;AB;70;95;80;27,5\nABCD-EFGH;controle;BA;60;70;72,5;40\nZZZZ-9999;controle;AB;50;;;\n"));
  await expect(page.locator("#st-warnings li")).toHaveText([
    "notas.json não é um registro exportado pelo VisuGraph.",
    "ZZZZ-9999: sem as notas do pós-teste.",
    "ZZZZ-9999: sem as respostas do SUS.",
    "ZZZZ-9999: sem as escalas do TLX.",
    "ZZZZ-9999 está na planilha, mas em nenhum registro: confira no cartão do participante.",
  ]);
  const groups = await table(page, "#st-groups");
  expect(groups.find((r) => r[0] === "Pré-teste")).toEqual(["Pré-teste", "55 ± 7,07 (n = 2)", "70 (n = 1)"]);
  expect(groups.find((r) => r[0] === "Ganho (g)")).toEqual(["Ganho (g)", "0,25 (n = 1)", "0,83 (n = 1)"]);
  expect(groups.find((r) => r[0] === "NASA-TLX")).toEqual(["NASA-TLX", "40 (n = 1)", "27,5 (n = 1)"]);
  expect((await table(page, "#st-sessions")).at(-1)).toEqual(["K7QM-2XPA", "experimental", "AB", "70", "95", "0,833", "80", "27,5", "1", "2,1", "1", "3"]);

  const plain = await downloadText(page, "#st-csv");
  expect(plain.name).toBe("resumo-estudo.csv");
  const lines = plain.text.trimEnd().split("\r\n");
  const header = lines[0].split(",");
  expect(header.slice(0, 8)).toEqual(["codigo", "grupo", "ordem", "pre", "pos", "g", "sus", "tlx"]);
  const k7 = Object.fromEntries(lines.find((l) => l.startsWith("K7QM-2XPA")).split(",").map((v, i) => [header[i], v]));
  expect(k7).toMatchObject({ g: "0.833", tlx: "27.5", tempo_posicao: "30", dicas_posicao: "1", erros: "3", minutos: "2.1" });

  const excel = await downloadText(page, "#st-csv-excel");
  expect(excel.name).toBe("resumo-estudo-excel.csv");
  expect(excel.text.startsWith("\uFEFFcodigo;grupo;ordem;pre;pos;g;sus;tlx;")).toBe(true);
  expect(excel.text).toContain("K7QM-2XPA;experimental;AB;70;95;0,833;80;27,5;");
});

test("resumo do estudo: lê o registro que o modo de estudo exporta", async ({ page }) => {
  await page.goto("index-3d.html?estudo=experimental&trilha=matriz");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  const code = (await page.locator(".lv-study strong").innerText()).trim();
  await expect(page.locator(".lv-ch__title")).toHaveText("Leve o cubo até o alvo");
  await page.click('[data-action="hint"]');

  const id = await objectId(page, "cubo");
  await page.click("#lv-tab-props");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  for (const [key, value] of [["position.x", "2"], ["position.z", "-1"]]) {
    const input = page.locator(`#lv-props input[data-key="${key}"]`);
    await input.fill(value);
    await input.press("Enter");
  }
  await expect(status(page)).toContainText("Desafio feito: Leve o cubo até o alvo.");

  const download = page.waitForEvent("download");
  await page.click(".lv-study button:has-text('Exportar registro')");
  const path = await (await download).path();

  await page.goto("estudo.html");
  await page.setInputFiles("#st-logs", { name: `visugraph-estudo-${code}.json`, mimeType: "application/json", buffer: await readFile(path) });
  await expect(page.locator("#st-warnings")).toBeHidden();
  const [, row] = await table(page, "#st-sessions");
  expect(row.slice(0, 3)).toEqual([code, "experimental", "1"]);
  expect(row[4], "uma dica").toBe("1");

  const { text } = await downloadText(page, "#st-csv");
  const [header, line] = text.trimEnd().split("\r\n").map((l) => l.split(","));
  const values = Object.fromEntries(header.map((h, i) => [h, line[i]]));
  expect(Number(values.tempo_posicao)).toBeGreaterThan(0);
  expect(values.tempo_rotacao).toBe("");
  expect(Number(values.painel)).toBeGreaterThanOrEqual(2);
});
