import { test, expect } from "./fixtures.js";

test("menu carrega a logo 3D com a fonte do próprio site", async ({ page }) => {
  const font = page.waitForResponse((res) => res.url().endsWith("fonts/helvetiker_regular.typeface.json"));
  await page.goto("index.html");
  expect((await font).ok()).toBe(true);
  await expect(page.locator("#logo-canvas")).toBeVisible();
  await expect(page.locator("#btn-3d")).toBeVisible();
});

test("modo 3D: editor fica inteiro na tela e gera código", async ({ page }) => {
  await page.goto("index.html");
  await page.click("#btn-3d");
  await expect(page.locator("canvas.webgl")).toBeVisible();

  await page.click("#toggleEditorBtn");
  await expect(page.locator("#toggleEditorBtn")).toHaveText("Ocultar Editor");

  // Cliques sem "force": o Playwright falha se outro elemento estiver por cima
  for (const id of ["#auto-update-code", "#sync-bidirectional", "#copy-code-btn", "#download-code-btn"]) {
    await page.locator(id).click({ trial: true });
  }
  await page.click("#generateCodeBtn");

  const lines = page.locator("#code-editor .CodeMirror-line");
  await expect(lines.first()).toBeVisible();
  expect(await lines.count()).toBeGreaterThan(20);
  await expect(page.locator("#code-editor .cm-keyword").first()).toBeVisible(); // modo JavaScript ativo

  const panel = await page.locator("#code-editor-container").boundingBox();
  const viewport = page.viewportSize();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);

  const area = await page.locator("#code-editor").boundingBox();
  const cm = await page.locator("#code-editor .CodeMirror").boundingBox();
  expect(Math.abs(cm.width - area.width)).toBeLessThan(2);
  expect(Math.abs(cm.height - area.height)).toBeLessThan(2);
});

// Resumo (hash) dos pixels do centro da cena, lido logo depois de o app desenhar
const sceneCenterHash = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector("canvas.webgl");
          const gl = canvas.getContext("webgl2");
          const size = 240;
          const data = new Uint8Array(size * size * 4);
          gl.readPixels((canvas.width - size) >> 1, (canvas.height - size) >> 1, size, size, gl.RGBA, gl.UNSIGNED_BYTE, data);
          let hash = 0;
          for (const byte of data) hash = (hash * 31 + byte) >>> 0;
          resolve(hash);
        });
      })
  );

test("modo 3D: o gizmo de transformação aparece na cena", async ({ page }) => {
  await page.goto("index.html");
  await page.click("#btn-3d");
  await expect(page.locator("canvas.webgl")).toBeVisible();

  await page.waitForTimeout(800);
  const still = await sceneCenterHash(page);
  await page.waitForTimeout(300);
  expect(await sceneCenterHash(page), "a cena parada não muda sozinha").toBe(still);

  await page.click('#sidebar nav button[data-section="transforms"]');
  await page.check("input[name='mode'][value='translate']");
  await page.waitForTimeout(300);
  expect(await sceneCenterHash(page), "o gizmo de translação deve aparecer").not.toBe(still);
});
