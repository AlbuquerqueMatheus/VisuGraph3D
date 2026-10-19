import { test, expect } from "./fixtures.js";
import { status } from "./live.js";

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

/** Troca de tema pelo menu da barra comum e, se o tema tem mais de um laboratório, pela aba. */
async function openTopic(page, topic, lab) {
  await page.locator(".vg-topic summary").click();
  await page.locator(".vg-topic__list").getByRole("link", { name: topic, exact: true }).click();
  if (lab) await page.locator(".vg-labs").getByRole("link", { name: lab, exact: true }).click();
}

test("página 2D abre os quatro laboratórios pela barra, sem depender de CDN", async ({ page }) => {
  await page.goto("index-2d.html");
  await expect(page.locator("#coords-section")).toBeVisible();
  await expect(page.locator(COORDS_CANVAS)).toBeVisible();

  const labs = [
    ["Luz e cor", null, "#phong-section"],
    ["Luz e cor", "Sistemas de cores", "#color-system-section"],
    ["Curvas", null, "#curves-section"],
    ["Transformações", null, "#coords-section"],
  ];
  for (const [topic, lab, section] of labs) {
    await openTopic(page, topic, lab);
    await expect(page.locator(section)).toBeVisible();
    await expect(page.locator(".section:not(.hidden)")).toHaveCount(1);
  }
});

test("cada laboratório 2D tem endereço próprio", async ({ page }) => {
  await page.goto("index-2d.html#curvas");
  await expect(page.locator("#curves-section")).toBeVisible();
  await expect(page.locator("#coords-section")).toBeHidden();

  await openTopic(page, "Luz e cor", "Sistemas de cores");
  await expect(page).toHaveURL(/index-2d\.html#cores$/);

  // trocar o endereço (um link, o botão voltar) troca o laboratório
  await page.evaluate(() => (location.hash = "#phong"));
  await expect(page.locator("#phong-section")).toBeVisible();
  await expect(page.locator("#color-system-section")).toBeHidden();
  await page.goBack();
  await expect(page.locator("#color-system-section")).toBeVisible();
});

test("trocar de laboratório pela barra não recarrega a página: cada um guarda o que se fez nele", async ({ page }) => {
  // sem o .html, como alguns servidores (o Netlify, com Pretty URLs) servem a página
  await page.goto("index-2d#coordenadas");
  await expect(page.locator(COORDS_CANVAS)).toBeVisible();
  await page.selectOption("#primitive-select", "point");
  await page.click("#btn-add-point");
  await expect(page.locator("#coords-modifier .coords-row")).toHaveCount(1);

  await openTopic(page, "Luz e cor", "Sistemas de cores");
  await expect(page).toHaveURL(/index-2d#cores$/);
  await openTopic(page, "Transformações");
  await expect(page.locator("#coords-section")).toBeVisible();
  await expect(page.locator("#coords-modifier .coords-row")).toHaveCount(1);
});

test("a barra comum mostra o tema do laboratório e leva à trilha do mesmo tema", async ({ page }) => {
  await page.goto("index-2d.html#phong");
  const bar = page.locator("#vg-nav");
  await expect(page).toHaveTitle("Modelo Phong · VisuGraph");
  await expect(page.locator(".vg-brand")).toHaveAttribute("href", "./index.html");
  await expect(bar.locator(".vg-topic__name")).toHaveText("Luz e cor");
  await expect(bar.locator('.vg-step[aria-current="page"]')).toHaveText("Explorar");
  await expect(bar.getByRole("link", { name: "Programar" })).toHaveAttribute("href", "./index-3d.html?trilha=phong");
  await expect(bar.locator('.vg-labs [aria-current="page"]')).toHaveText("Modelo Phong");

  await bar.locator(".vg-labs").getByRole("link", { name: "Sistemas de cores" }).click();
  await expect(page).toHaveTitle("Sistemas de cores · VisuGraph");
  await expect(bar.locator('.vg-labs [aria-current="page"]')).toHaveText("Sistemas de cores");

  // o menu fecha com Esc e devolve o foco ao tema
  await bar.locator(".vg-topic summary").click();
  await expect(bar.locator(".vg-topic__list")).toBeVisible();
  await expect(bar.locator('.vg-topic__list [aria-current="true"]')).toHaveText("Luz e cor");
  await expect(bar.getByRole("link", { name: "Editor livre, sem desafio" }), "o editor livre fica no código vivo").toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(bar.locator(".vg-topic__list")).toBeHidden();
  await expect(bar.locator(".vg-topic summary")).toBeFocused();

  // o tema aberto, no menu, só fecha o menu: continua no laboratório em que está
  await openTopic(page, "Luz e cor");
  await expect(bar.locator(".vg-topic__list")).toBeHidden();
  await expect(page).toHaveURL(/#cores$/);

  // Curvas ainda não tem desafios: Programar aparece apagado, com o motivo
  await openTopic(page, "Curvas");
  await expect(bar.locator(".vg-labs")).toHaveCount(0);
  const missing = bar.locator('.vg-step[aria-disabled="true"]');
  await expect(missing).toHaveText("Programar");
  await expect(missing).toHaveAttribute("title", "Curvas ainda não tem desafios");

  // Câmera ainda não tem laboratório: o tema leva direto à trilha, onde Explorar fica apagado
  await openTopic(page, "Câmera e projeção");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-ch__title")).toHaveText("Enquadre a esfera");
  await expect(bar.locator(".vg-topic__name")).toHaveText("Câmera e projeção");
  await expect(bar.locator('.vg-step[aria-disabled="true"]')).toHaveText("Explorar");
});

test("os laboratórios de coordenadas e de Phong continuam nas trilhas de desafios do modo 3D", async ({ page }) => {
  await page.goto("index-2d.html");
  await page.click('.coord-tab[data-tab="measure"]');
  await expect(page.locator("#tab-measure a.lab-next")).toBeVisible();
  await expect(page.locator("#tab-measure a.lab-next")).toHaveAttribute("href", "./index-3d.html?trilha=matriz");

  await openTopic(page, "Luz e cor");
  const next = page.locator("#phong-section a.lab-next");
  await expect(next).toHaveAttribute("href", "./index-3d.html?trilha=phong");
  await next.click();
  await expect(page.locator("#lv-status-text")).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-ch__title")).toHaveText("Luz pela esquerda");
  await expect(page.locator(".lv-ch__kicker")).toHaveText("Luz e cor (Phong) · 1 de 3");
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
  await page.goto("index-2d.html#curvas");
  const canvas = page.locator("#bezier-canvas");
  const box = await canvas.boundingBox();
  for (const [dx, dy] of [[100, 200], [250, 80], [400, 220]]) await page.mouse.dblclick(box.x + dx, box.y + dy);
  const snapshot = () => canvas.evaluate((c) => c.toDataURL());
  const withPoints = await snapshot();

  await openTopic(page, "Luz e cor", "Sistemas de cores");
  await page.locator("#r-value").click();
  await page.keyboard.press("Backspace");
  await openTopic(page, "Curvas");
  // a seção volta no evento hashchange, e o canvas volta ao tamanho dela logo depois
  await expect.poll(snapshot, "os pontos continuam lá").toBe(withPoints);

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
