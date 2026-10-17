import { test, expect } from "./fixtures.js";

// Lê um pixel de um canvas 2D (coordenadas CSS relativas ao canvas)
const pixel2d = (page, selector, x, y) =>
  page.evaluate(
    ([sel, px, py]) => {
      const canvas = document.querySelector(sel);
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      return [...canvas.getContext("2d").getImageData(Math.round(px * scale), Math.round(py * scale), 1, 1).data];
    },
    [selector, x, y]
  );

const COORDS_CANVAS = "#coords-canvas-container canvas";
const isPointRed = ([r, g, b]) => r > 200 && g < 120 && b < 120;

test("página 2D abre as quatro seções sem depender de CDN", async ({ page }) => {
  await page.goto("index-2d.html");
  await expect(page.locator("#coords-section")).toBeVisible();
  await expect(page.locator(COORDS_CANVAS)).toBeVisible();

  const sections = [
    ["#color-system-btn", "#color-system-section"],
    ["#btn-phong", "#phong-section"],
    ["#btn-curvas", "#curves-section"],
    ["#btn-coordenadas", "#coords-section"],
  ];
  for (const [button, section] of sections) {
    await page.click(button);
    await expect(page.locator(section)).toBeVisible();
  }
});

test.describe("Sistema de coordenadas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("index-2d.html");
    await expect(page.locator(COORDS_CANVAS)).toBeVisible();
    await page.selectOption("#primitive-select", "point");
    await page.click("#btn-add-point");
  });

  test("os campos aceitam digitação e o eixo y aponta para cima", async ({ page }) => {
    const [x, y] = await page.locator("#coords-modifier input").all();
    await x.fill("50");
    await y.fill("100");
    await page.waitForTimeout(300); // vários quadros do p5
    await expect(x).toHaveValue("50");
    await expect(y).toHaveValue("100");
    await expect(page.locator(".coords-prime").first()).toHaveText("→ A' (50.0, 100.0)");

    // y = +100 fica 100 px ACIMA do centro do canvas
    const box = await page.locator(COORDS_CANVAS).boundingBox();
    expect(isPointRed(await pixel2d(page, COORDS_CANVAS, box.width / 2 + 50, box.height / 2 - 100))).toBe(true);
    expect(isPointRed(await pixel2d(page, COORDS_CANVAS, box.width / 2 + 50, box.height / 2 + 100))).toBe(false);
  });

  test("rotação positiva gira no sentido anti-horário e a matriz confere", async ({ page }) => {
    const [x] = await page.locator("#coords-modifier input").all();
    await x.fill("100");
    await page.click('.coord-tab[data-tab="transform"]');
    await page.check("#chk-rotate");
    await page.locator("#rot-slider").fill("90");
    await expect(page.locator(".coords-prime").first()).toHaveText("→ A' (0.0, 100.0)");

    await page.click('.coord-tab[data-tab="measure"]');
    const cells = await page.locator("#matrix-table td").allTextContents();
    expect(cells).toEqual(["0.00", "-1.00", "0.00", "1.00", "0.00", "0.00", "0.00", "0.00", "1.00"]);
  });

  test("arrastar um ponto transformado move o que está na tela", async ({ page }) => {
    await page.click('.coord-tab[data-tab="transform"]');
    await page.check("#chk-translate");
    await page.locator("#tx-slider").fill("100");

    const box = await page.locator(COORDS_CANVAS).boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx + 100, cy); // o ponto (0,0) aparece em (100,0)
    await page.mouse.down();
    await page.mouse.move(cx + 125, cy - 50, { steps: 5 });
    await page.mouse.up();

    await page.click('.coord-tab[data-tab="build"]');
    const [x, y] = await page.locator("#coords-modifier input").all();
    await expect(x).toHaveValue("25"); // original = tela − translação
    await expect(y).toHaveValue("50");
    await expect(page.locator(".coords-prime").first()).toHaveText("→ A' (125.0, 50.0)");
  });

  test("Backspace num campo não apaga o ponto; Delete no canvas apaga", async ({ page }) => {
    const box = await page.locator(COORDS_CANVAS).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // seleciona A
    const [x] = await page.locator("#coords-modifier input").all();
    await x.fill("12");
    await x.press("Backspace");
    await expect(page.locator("#coords-modifier .coords-row")).toHaveCount(1);
    await expect(x).toHaveValue("1");

    await page.mouse.click(box.x + box.width / 2 + 1, box.y + box.height / 2); // A está em (1, 0)
    await page.keyboard.press("Delete");
    await expect(page.locator("#coords-modifier .coords-row")).toHaveCount(0);
  });
});

test("curvas: Backspace em campo de outra seção não apaga pontos", async ({ page }) => {
  await page.goto("index-2d.html");
  await page.click("#btn-curvas");
  const canvas = page.locator("#bezier-canvas");
  const box = await canvas.boundingBox();
  for (const [dx, dy] of [[100, 200], [250, 80], [400, 220]]) await page.mouse.dblclick(box.x + dx, box.y + dy);
  const snapshot = () => canvas.evaluate((c) => c.toDataURL());
  const withPoints = await snapshot();

  await page.click("#color-system-btn");
  await page.locator("#r-value").click();
  await page.keyboard.press("Backspace");
  await page.click("#btn-curvas");
  expect(await snapshot()).toBe(withPoints);

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Delete"); // fora de campos, Delete remove o último ponto
  expect(await snapshot()).not.toBe(withPoints);
});

test.describe("com o sistema operacional em modo claro", () => {
  test.use({ colorScheme: "light" });

  test("os rótulos dos painéis escuros continuam legíveis", async ({ page }) => {
    await page.goto("index-2d.html");
    const color = await page.locator('label[for="grid-step"]').evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = color.match(/\d+/g).map(Number);
    expect((r + g + b) / 3, `cor do texto: ${color}`).toBeGreaterThan(150);
  });
});
