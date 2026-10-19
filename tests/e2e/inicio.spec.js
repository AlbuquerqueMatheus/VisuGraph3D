// Tela inicial: cada tema leva ao laboratório e à trilha de desafios, e a trilha mostra o progresso.
import { test, expect } from "./fixtures.js";
import { status } from "./live.js";

const progress = (page, trail) => page.locator(`.topic[data-trail="${trail}"] .topic__progress`);

test("a tela inicial mostra a proposta, a imagem do código vivo e os quatro temas", async ({ page }) => {
  await page.goto("index.html");
  await expect(page.locator("h1")).toContainText("a matemática, o código e a imagem");
  await expect(page.locator(".topic h3")).toHaveText(["Transformações", "Câmera e projeção", "Luz e cor", "Curvas"]);
  await expect.poll(() => page.locator(".home-shot img").evaluate((img) => img.naturalWidth), "a imagem carrega").toBe(1366);

  // sem progresso guardado, cada trilha mostra quantos desafios tem
  await expect(progress(page, "matriz")).toHaveText("5 desafios");
  await expect(progress(page, "camera")).toHaveText("2 desafios");
  await expect(progress(page, "phong")).toHaveText("3 desafios");
});

test("os temas levam ao laboratório 2D e à trilha de desafios do código vivo", async ({ page }) => {
  await page.goto("index.html");
  await page.getByRole("link", { name: "Sistemas de cores" }).click();
  await expect(page).toHaveURL(/index-2d\.html#cores$/);
  await expect(page.locator("#color-system-section")).toBeVisible();
  await expect(page.locator("#coords-section")).toBeHidden();

  await page.goBack();
  await page.getByRole("link", { name: "Transformações e matrizes" }).click();
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-ch__title")).toHaveText("Leve o cubo até o alvo");
});

test("o progresso guardado nos desafios aparece em cada tema", async ({ page }) => {
  await page.goto("index.html");
  await page.evaluate(() =>
    localStorage.setItem("visugraph.desafios.v1", JSON.stringify({ feitos: ["posicao", "rotacao", "lookat", "fov"], atual: "escala" }))
  );
  await page.reload();
  await expect(progress(page, "matriz")).toHaveText("2 de 5 feitos");
  await expect(progress(page, "camera")).toHaveText("2 de 2 feitos, trilha completa");
  await expect(progress(page, "phong")).toHaveText("3 desafios");
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a tela inicial cabe na largura, sem rolagem lateral", async ({ page }) => {
    await page.goto("index.html");
    await expect(page.locator(".home-shot img")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
