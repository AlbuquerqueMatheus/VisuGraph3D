// Modo de estudo: o grupo controle perde só a ligação entre a cena e o código.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { objectId, pasteCode, status, viewport } from "./live.js";

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

  // recarregar continua a mesma sessão; "Nova sessão" começa outra
  await page.reload();
  await expect(page.locator(".lv-study strong")).toHaveText(first);
  await page.click(".lv-study button:has-text('Nova sessão')");
  await expect(page.locator(".lv-study strong")).not.toHaveText(first);
  const log = await exportLog(page);
  expect(log.grupo).toBe("experimental");
  expect(log.eventos.map((e) => e.evento)).toEqual(["inicio"]);
});

test("sem ?estudo na URL não há faixa nem registro", async ({ page }) => {
  await page.goto("index-3d.html");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-study")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("visugraph.estudo.v1"))).toBeNull();
});
