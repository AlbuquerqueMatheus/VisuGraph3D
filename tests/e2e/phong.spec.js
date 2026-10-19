import { test, expect } from "./fixtures.js";

const VIEWER_CANVAS = "#phong-viewer canvas";

// Lê um pixel do canvas WebGL logo depois de o app desenhar o quadro
const readWebGLPixel = (page, x, y) =>
  page.evaluate(
    ([sel, px, py]) =>
      new Promise((resolve) => {
        // o callback do app já está na fila deste quadro, então roda antes deste
        requestAnimationFrame(() => {
          const canvas = document.querySelector(sel);
          const gl = canvas.getContext("webgl2");
          const scale = canvas.width / canvas.clientWidth;
          const out = new Uint8Array(4);
          gl.readPixels(Math.floor(px * scale), canvas.height - 1 - Math.floor(py * scale), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
          resolve([out[0], out[1], out[2]]);
        });
      }),
    [VIEWER_CANVAS, x, y]
  );

// Posição (px CSS) do pixel mais claro do objeto azul: o centro do brilho especular.
// Só conta pixels com azul > vermelho, para ignorar a "lâmpada" amarelada.
const brightestPixel = (page) =>
  page.evaluate(
    (sel) =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector(sel);
          const gl = canvas.getContext("webgl2");
          const { width, height } = canvas;
          const data = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
          let best = -1;
          let at = 0;
          for (let i = 0; i < data.length; i += 4) {
            const sum = data[i] + data[i + 1] + data[i + 2];
            if (data[i + 2] > data[i] + 20 && sum > best) [best, at] = [sum, i / 4];
          }
          const scale = width / canvas.clientWidth;
          resolve([(at % width) / scale, (height - 1 - Math.floor(at / width)) / scale]);
        });
      }),
    VIEWER_CANVAS
  );

const panelRgb = async (page) => (await page.locator("#phong-rgb").textContent()).match(/\d+/g).map(Number);

test.describe("Modelo Phong", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("index-2d.html");
    // Antes de a cena nascer: luz parada na posição inicial e sem setas na frente do pixel
    await page.evaluate(() => {
      document.getElementById("auto-light").checked = false;
      document.getElementById("show-vectors").checked = false;
    });
    await page.evaluate(() => (location.hash = "#phong"));
    await expect(page.locator(VIEWER_CANVAS).first()).toBeVisible();
  });

  for (const model of ["phong", "blinn"]) {
    test(`o pixel tem a cor que a fórmula calcula (${model})`, async ({ page }) => {
      await page.selectOption("#model-type", model);
      await page.locator("#shininess-slider").fill("8"); // brilho largo: mais pixels com especular

      const box = await page.locator(VIEWER_CANVAS).first().boundingBox();
      const [hx, hy] = await brightestPixel(page);
      const spots = [[hx, hy], [box.width * 0.5, box.height * 0.42], [box.width * 0.44, box.height * 0.5]];
      for (const [sx, sy] of spots) {
        const x = Math.round(sx);
        const y = Math.round(sy);
        await page.mouse.click(box.x + x + 0.5, box.y + y + 0.5); // centro do pixel
        const expected = await panelRgb(page);
        const actual = await readWebGLPixel(page, x, y);
        actual.forEach((c, i) => expect(Math.abs(c - expected[i]), `canal ${i} em (${x}, ${y})`).toBeLessThanOrEqual(3));
      }
    });
  }

  test("o painel troca r·v por h·n no Blinn–Phong", async ({ page }) => {
    await expect(page.locator("#rv-line")).toBeVisible();
    await expect(page.locator("#hn-line")).toBeHidden();
    await page.selectOption("#model-type", "blinn");
    await expect(page.locator("#hn-line")).toBeVisible();
    await expect(page.locator("#rv-line")).toBeHidden();
  });

  test("os números acompanham a luz e os sliders sem novo clique", async ({ page }) => {
    const intensity = page.locator("#intensity");
    const before = await intensity.textContent();
    await page.locator("#ambient-light").fill("1");
    await expect(intensity).not.toHaveText(before);

    await page.check("#auto-light");
    const moving = await intensity.textContent();
    await expect(intensity).not.toHaveText(moving);
  });
});
