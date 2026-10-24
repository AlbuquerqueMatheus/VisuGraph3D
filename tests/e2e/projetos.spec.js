// Projetos: o endereço abre o passo, o código pronto passa na conferência, os passos seguem um do
// outro e o progresso fica.
import { test, expect } from "./fixtures.js";
import { code, pasteCode, status } from "./live.js";
import { GALAXIA } from "../../src/live/projects/galaxia.js";

const panel = (page) => page.locator("#lv-project");
const title = (page) => panel(page).locator(".lv-pj-title");
const result = (page, n = 0) => panel(page).locator(".lv-result").nth(n);
const codeState = (page) => panel(page).locator("[data-code-state]");
const done = (page) => panel(page).locator(".lv-ch__done");
const stepButton = (page, n) => panel(page).locator(`.lv-pj-steps [data-step="${n}"]`);

test("projetos: o endereço abre o passo, o código pronto passa na conferência e o próximo passo parte dele", async ({ page }) => {
  await page.goto("index-3d.html?projeto=galaxia&passo=2");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  expect(new URL(page.url()).search, "o projeto sai da URL: ao recarregar vale o passo aberto").toBe("");
  await expect(page.locator("#lv-tab-project")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Intermediário · Gerador de galáxias");
  await expect(title(page)).toHaveText("2. Mil pontos");
  await expect(stepButton(page, 2)).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#lv-codebar")).toContainText("Gerador de galáxias · passo 2 de 10");
  await expect(page.locator("#lv-codebar")).toContainText("0 de 2 conferências");
  await expect(codeState(page)).toHaveText(/^Escreva no editor as linhas marcadas com \+/);
  expect(await code(page), "o passo 2 começa do fim do passo 1").toContain("camera.lookAt(0, 0, 0);");
  expect(await code(page)).not.toContain("THREE.Points");
  await expect(result(page)).toHaveAttribute("data-ok", "false");
  await expect(panel(page).locator('.lv-pj-diff__line[data-op="add"]', { hasText: "new THREE.Points(geometria, material)" })).toHaveCount(1);

  await panel(page).locator('[data-action="apply"]').click();
  await expect.poll(() => code(page)).toContain("new THREE.Points(geometria, material)");
  await expect(done(page)).toContainText("✓ Passo feito!");
  await expect(page.locator("#lv-codebar")).toContainText("✓ feito");
  await expect(status(page)).toContainText("Passo feito: 2. Mil pontos.");
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(stepButton(page, 2)).toHaveAttribute("data-done", "true");

  // Ctrl+Z desfaz a troca do código
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => code(page)).not.toContain("THREE.Points");
  await expect(codeState(page)).toHaveText(/^Escreva no editor/);
  await panel(page).locator('[data-action="apply"]').click();

  await done(page).locator('[data-action="next"]').click();
  await expect(title(page)).toHaveText("3. Brilho de estrela");
  await expect(codeState(page)).toHaveText(/^Escreva no editor/);
  await expect(result(page)).toContainText("(tem 1.000)");

  // o jeito do aluno também vale: a conferência olha a cena, não o texto
  const mine = GALAXIA.steps[2].code.replace("size: 0.03", "size: 0.04");
  expect(mine).not.toBe(GALAXIA.steps[2].code);
  await pasteCode(page, mine);
  await expect(codeState(page)).toHaveText(/^O editor tem o seu próprio código/);
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // voltar ao começo do passo traz o código do fim do passo 2
  await panel(page).locator('[data-action="restart"]').click();
  await expect.poll(() => code(page)).not.toContain("blending");
  await expect(codeState(page)).toHaveText(/^Escreva no editor/);
  await expect(done(page), "o passo continua feito, mas o quadro some com a cena de antes").toBeHidden();
  await expect(stepButton(page, 3)).toHaveAttribute("data-done", "true");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // um passo anterior guarda o código adiantado, e o recarregar volta a ele
  await stepButton(page, 1).click();
  await expect(title(page)).toHaveText("1. O palco");
  await expect(codeState(page)).toHaveText("O editor está adiantado, com o código do fim do passo 3. Para refazer este passo, volte ao começo dele.");
  await expect(done(page), "a cena adiantada também tem o palco").toContainText("✓ Passo feito!", { timeout: 30_000 });
  await page.reload();
  await expect(title(page)).toHaveText("1. O palco", { timeout: 30_000 });
  await expect(codeState(page)).toContainText("adiantado, com o código do fim do passo 3");

  // pular para um passo adiante começa do código pronto até ali
  await stepButton(page, 6).click();
  await expect(title(page)).toHaveText("6. A espiral");
  await expect.poll(() => code(page)).toContain("const braco = i % bracos;");
  await expect(codeState(page)).toHaveText(/^Escreva no editor/);
  await expect(result(page)).toContainText("(os braços ainda são retos)", { timeout: 30_000 });
  await expect(page.locator("#lv-codebar")).toContainText("0 de 1 conferência");
});

test("projetos: a lista mostra os níveis e o progresso, e sair do projeto volta ao editor livre", async ({ page }) => {
  await page.goto("index-3d.html");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await page.click("#lv-tab-project");
  await expect(panel(page).locator(".lv-pj-level h3")).toHaveText(["Fácil", "Intermediário", "Avançado"]);
  await expect(panel(page).locator(".lv-pj-soon")).toHaveCount(8);
  const card = panel(page).locator('.lv-pj-card[data-project="galaxia"]');
  await expect(card.locator(".lv-pj-card__progress")).toHaveText("10 passos");

  await card.click();
  await expect(title(page)).toHaveText("1. O palco");
  await expect.poll(() => code(page)).toContain("// Gerador de galáxias");
  expect(await code(page), "o projeto começa do zero").not.toContain("THREE");
  await expect(status(page)).toContainText("Nenhuma cena foi criada");
  await expect(page.locator("#lv-codebar")).toContainText("Gerador de galáxias · passo 1 de 10");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await expect(status(page)).toContainText("Passo feito: 1. O palco.");

  await panel(page).locator('[data-action="leave"]').click();
  await expect(page.locator("#lv-codebar")).toBeHidden();
  await expect.poll(() => code(page)).toContain("Tudo o que aparece no visor vem deste código");
  await expect(card.locator(".lv-pj-card__progress")).toHaveText("1 de 10 passos");

  // de volta ao projeto, ele abre no primeiro passo ainda não feito, com o código guardado
  await card.click();
  await expect(title(page)).toHaveText("2. Mil pontos");
  await expect.poll(() => code(page)).toContain("camera.lookAt(0, 0, 0);");
});

test("projetos: o modo de estudo não tem a aba Projetos", async ({ page }) => {
  await page.goto("index-3d.html?estudo=experimental&projeto=galaxia");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  expect(new URL(page.url()).search).toBe("?estudo=experimental");
  await expect(page.locator("#lv-tab-project")).toBeHidden();
  await expect(page.locator("#lv-codebar")).toBeHidden();
});
