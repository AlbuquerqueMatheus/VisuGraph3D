// Modo de estudo: o grupo controle perde só a ligação entre a cena e o código.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { code, objectId, openLive, pasteCode, status, viewport } from "./live.js";

async function openStudy(page, group) {
  await page.goto(`index-3d.html?estudo=${group}`);
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-study")).toContainText(`Estudo · grupo ${group} · sessão`);
  return (await page.locator(".lv-study strong").innerText()).trim();
}

async function exportLog(page) {
  const download = page.waitForEvent("download");
  await page.click(".lv-study button:has-text('Exportar registro')");
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}

test("estudo: no grupo controle o código roda, mas a cena não escreve nele nem acende nada", async ({ page }) => {
  const code = await openStudy(page, "controle");
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // a barra fica só com o nome, sem temas e sem volta ao início: a sessão não sai do código vivo
  await expect(page.locator("#vg-nav")).toBeHidden();
  await expect(page.locator(".vg-brand")).not.toHaveAttribute("href");
  await expect(page.locator("#lv-add")).toBeHidden();
  await expect(page.locator(".cm-vg-number")).toHaveCount(0); // números não se arrastam

  const id = await objectId(page, "cubo");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  await expect(page.locator("#lv-props .lv-props__head h2")).toHaveText("cubo");
  await expect(page.locator('#lv-props input[data-key="position.x"]')).toBeDisabled();
  await expect(page.locator(".cm-line.cm-vg-selected")).toHaveCount(0);
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info())).selected).toBe(id);
  expect((await viewport(page).evaluate(() => window.__vgDebug.info())).gizmo, "sem gizmo").toBeNull();

  // a aba Matemática mostra as contas, sem ligar os números ao código
  await page.click("#lv-tab-math");
  await expect(page.locator('#lv-math [data-sec="path"] [data-verify]')).toContainText("✓ Conferido");
  await expect(page.locator("#lv-math [data-keys]")).toHaveCount(0);

  // os desafios não falam do gizmo nem do painel, que este grupo não tem
  await page.click("#lv-tab-challenges");
  await expect(page.locator("#lv-challenges .lv-ch__head .lv-note")).toHaveText("0 de 10 feitos. A cena é conferida a cada vez que o código roda.");

  // escrever código continua mudando a cena
  await pasteCode(page, "const cena = new THREE.Scene();\nconst bola = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshNormalMaterial());\ncena.add(bola);");
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");

  const log = await exportLog(page);
  expect(log).toMatchObject({ formato: "visugraph-estudo/1", grupo: "controle", sessao: code });
  const types = log.eventos.map((e) => e.evento);
  for (const t of ["inicio", "execucao", "selecao", "aba", "digitacao"]) expect(types).toContain(t);
  const text = JSON.stringify(log);
  expect(text, "o registro não leva o código").not.toContain("THREE");
  expect(text).not.toContain("bola");
  expect(log.eventos.every((e, i) => i === 0 || e.t >= log.eventos[i - 1].t)).toBe(true);
});

test("estudo: no grupo experimental tudo continua ligado, e cada sessão tem o seu código", async ({ page }) => {
  const first = await openStudy(page, "experimental");
  await expect(page.locator("#lv-add")).toBeVisible();
  await expect(page.locator(".cm-vg-number").first()).toBeVisible();
  const id = await objectId(page, "cubo");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  await expect(page.locator(".cm-line.cm-vg-selected").first()).toContainText("const cubo = new THREE.Mesh(");
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info())).gizmo).toBe("translate");

  // recarregar continua a mesma sessão; "Nova sessão" começa outra, com o código inicial
  await pasteCode(page, "const cena = new THREE.Scene();\nconst bola = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshNormalMaterial());\ncena.add(bola);");
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
  await page.reload();
  await expect(page.locator(".lv-study strong")).toHaveText(first);
  expect(await code(page)).toContain("const bola");
  await page.click(".lv-study button:has-text('Nova sessão')");
  await expect(status(page), "o aviso com o código da sessão fica na tela").toContainText("Nova sessão:", { timeout: 30_000 });
  const second = (await page.locator(".lv-study strong").innerText()).trim();
  expect(second).not.toBe(first);
  await expect(status(page)).toContainText(second);
  expect(await code(page)).toContain("Tudo o que aparece no visor vem deste código");
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info()))?.runId ?? 0).toBeGreaterThan(0);
  const log = await exportLog(page);
  expect(log).toMatchObject({ grupo: "experimental", sessao: second });
  expect(log.eventos.map((e) => e.evento)).toEqual(["inicio", "execucao"]);
});

test("estudo: as trilhas e os desafios não mandam rever o laboratório, que fica fora da sessão", async ({ page }) => {
  await openStudy(page, "experimental");
  await page.click("#lv-tab-challenges");
  await expect(page.locator('.lv-trail[data-trail="matriz"]')).toBeVisible();
  await expect(page.locator("#lv-challenges a")).toHaveCount(0);
  await page.click('[data-challenge="posicao"]');
  await expect(page.locator(".lv-ch__title")).toHaveText("Leve o cubo até o alvo");
  await expect(page.locator("#lv-challenges a")).toHaveCount(0);
});

test("estudo: a primeira sessão num navegador já usado começa sem o progresso e o código de antes", async ({ page }) => {
  await openLive(page);
  await pasteCode(page, "// de quem usou antes\nconst cena = new THREE.Scene();");
  await expect(status(page)).toContainText("Cena atualizada · 0 objetos");
  await page.evaluate(() => {
    localStorage.setItem("visugraph.desafio.posicao.v1", "// de quem usou antes");
    localStorage.setItem("visugraph.desafios.v1", JSON.stringify({ feitos: ["posicao"], atual: "rotacao" }));
  });
  await openStudy(page, "controle");
  expect(await code(page)).toContain("Tudo o que aparece no visor vem deste código");
  await expect(page.locator("#lv-codebar")).toBeHidden();
  await page.click("#lv-tab-challenges");
  await expect(page.locator("#lv-challenges")).toContainText("0 de 10 feitos");
  await page.click('[data-challenge="posicao"]');
  await expect.poll(() => code(page)).toContain("cubo.position.set(0, 0.5, 0);");
});

test("sem ?estudo na URL não há faixa nem registro", async ({ page }) => {
  await page.goto("index-3d.html");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-study")).toHaveCount(0);
  await expect(page.locator("#vg-nav")).toBeVisible();
  await expect(page.locator(".vg-brand")).toHaveAttribute("href", "./index.html");
  expect(await page.evaluate(() => localStorage.getItem("visugraph.estudo.v1"))).toBeNull();
});
