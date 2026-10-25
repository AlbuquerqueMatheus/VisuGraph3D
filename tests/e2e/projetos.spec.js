// Projetos: o endereço abre o passo, o código pronto passa na conferência, os passos seguem um do
// outro e o progresso fica. Os passos no computador baixam o projeto e ficam feitos pela pessoa.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { code, pasteCode, status } from "./live.js";
import { CIDADE } from "../../src/live/projects/cidade.js";
import { GALAXIA } from "../../src/live/projects/galaxia.js";
import { MONTANHA_RUSSA } from "../../src/live/projects/montanhaRussa.js";
import { SISTEMA_SOLAR } from "../../src/live/projects/sistemaSolar.js";
import { VITRINE } from "../../src/live/projects/vitrine.js";
import { unzip } from "../../src/lib/zip.js";

const panel = (page) => page.locator("#lv-project");
const title = (page) => panel(page).locator(".lv-pj-title");
const result = (page, n = 0) => panel(page).locator(".lv-result").nth(n);
const codeState = (page) => panel(page).locator("[data-code-state]");
const done = (page) => panel(page).locator(".lv-ch__done");
const stepButton = (page, n) => panel(page).locator(`.lv-pj-steps [data-step="${n}"]`);

/** Os arquivos de um .zip baixado: { caminho: texto }. */
async function zipFiles(download) {
  const files = unzip(new Uint8Array(await readFile(await download.path())));
  return Object.fromEntries(files.map((f) => [f.path, new TextDecoder().decode(f.content)]));
}

test("projetos: o endereço abre o passo, o código pronto passa na conferência e o próximo passo parte dele", async ({ page }) => {
  await page.goto("index-3d.html?projeto=galaxia&passo=2");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  expect(new URL(page.url()).search, "o projeto sai da URL: ao recarregar vale o passo aberto").toBe("");
  await expect(page.locator("#lv-tab-project")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Intermediário · Gerador de galáxias");
  await expect(title(page)).toHaveText("2. Mil pontos");
  await expect(stepButton(page, 2)).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#lv-codebar")).toContainText("Gerador de galáxias · passo 2 de 12");
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
  await expect(panel(page).locator(".lv-pj-soon")).toHaveCount(4);
  await expect(panel(page).locator('.lv-pj-card[data-project="sistema-solar"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="vitrine"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="cidade"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="montanha-russa"] .lv-pj-card__progress')).toHaveText("12 passos");
  const card = panel(page).locator('.lv-pj-card[data-project="galaxia"]');
  await expect(card.locator(".lv-pj-card__progress")).toHaveText("12 passos");

  await card.click();
  await expect(title(page)).toHaveText("1. O palco");
  await expect.poll(() => code(page)).toContain("// Gerador de galáxias");
  expect(await code(page), "o projeto começa do zero").not.toContain("THREE");
  await expect(status(page)).toContainText("Nenhuma cena foi criada");
  await expect(page.locator("#lv-codebar")).toContainText("Gerador de galáxias · passo 1 de 12");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await expect(status(page)).toContainText("Passo feito: 1. O palco.");

  await panel(page).locator('[data-action="leave"]').click();
  await expect(page.locator("#lv-codebar")).toBeHidden();
  await expect.poll(() => code(page)).toContain("Tudo o que aparece no visor vem deste código");
  await expect(card.locator(".lv-pj-card__progress")).toHaveText("1 de 12 passos");

  // de volta ao projeto, ele abre no primeiro passo ainda não feito, com o código guardado
  await card.click();
  await expect(title(page)).toHaveText("2. Mil pontos");
  await expect.poll(() => code(page)).toContain("camera.lookAt(0, 0, 0);");
});

test("projetos: os passos no computador baixam o projeto, explicam os arquivos e ficam feitos quando funciona", async ({ page }) => {
  await page.goto("index-3d.html?projeto=galaxia&passo=11");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(title(page)).toHaveText("11. No seu computador");
  await expect(stepButton(page, 11)).toHaveAttribute("data-kind", "computador");
  await expect(page.locator("#lv-codebar")).toContainText("Gerador de galáxias · passo 11 de 12");
  await expect(page.locator("#lv-codebar")).toContainText("no seu computador");
  await expect(panel(page).locator(".lv-pj-cmd code").first()).toHaveText("node -v\nnpm -v");
  await expect(panel(page).locator(".lv-pj-file h4")).toHaveText(["package.json", "vite.config.js", "index.html", "src/cena.js", "src/main.js"]);

  // passar o mouse na explicação acende a linha no arquivo
  const main = panel(page).locator('.lv-pj-file[data-path="src/main.js"]');
  await main.locator(".lv-pj-snippet", { hasText: "controles.update();" }).hover();
  await expect(main.locator("[data-mark]")).toHaveText(["  controles.update();"]);

  // o projeto leva o código do editor, que é o do fim do passo 10: o cena.js sai igual ao do passo
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="galaxia.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("galaxia.zip");
  const files = await zipFiles(download);
  expect(Object.keys(files)).toEqual(["README.md", "package.json", "vite.config.js", "index.html", "src/main.js", "src/cena.js", ".gitignore"]);
  for (const file of GALAXIA.steps[10].files) expect(files[file.path], file.path).toBe(file.code);
  await expect(status(page)).toContainText("Projeto baixado: galaxia.zip.");

  // quem confere é a pessoa
  await expect(done(page)).toBeHidden();
  await panel(page).locator('[data-action="confirm"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!");
  await expect(panel(page).locator('[data-action="confirm"]')).toBeHidden();
  await expect(stepButton(page, 11)).toHaveAttribute("data-done", "true");
  await expect(page.locator("#lv-codebar")).toContainText("✓ feito");
  await expect(status(page)).toContainText("Passo feito: 11. No seu computador.");

  // de volta ao passo 10, o editor tem o código do fim dele, e não um passo adiantado
  await stepButton(page, 10).click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await stepButton(page, 11).click();
  await done(page).locator('[data-action="next"]').click();
  await expect(title(page)).toHaveText("12. Um painel de controle");
  await expect(panel(page).locator('.lv-pj-file[data-path="src/cena.js"] .lv-pj-diff__line[data-op="add"]', { hasText: 'import GUI from "lil-gui";' })).toHaveCount(1);
  expect(await code(page), "o passo 12 não troca o código do editor").toContain("const quantidade = 50000;");
  expect(await code(page)).not.toContain("parametros");

  // o projeto pronto do passo, com o lil-gui
  const [ready] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="galaxia-painel.zip"]').click()]);
  const readyFiles = await zipFiles(ready);
  expect(JSON.parse(readyFiles["package.json"]).dependencies).toEqual({ "lil-gui": "^0.21.0", three: "^0.186.1" });
  expect(readyFiles["src/cena.js"]).toContain('const painel = new GUI({ title: "Galáxia" });');
  await panel(page).locator('[data-action="confirm"]').click();
  await expect(done(page)).toContainText("✓ Projeto pronto!");
});

test("projetos: no Sistema solar, a Terra entra em órbita dentro de um grupo, e o projeto sai para o computador", async ({ page }) => {
  await page.goto("index-3d.html?projeto=sistema-solar&passo=5");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Fácil · Sistema solar");
  await expect(title(page)).toHaveText("5. Em órbita");
  await expect(page.locator("#lv-codebar")).toContainText("Sistema solar · passo 5 de 9");
  expect(await code(page), "o passo 5 começa com a Terra direto na cena").toContain("cena.add(terra);");
  await expect(result(page)).toContainText("(não achei orbitaTerra na cena)", { timeout: 30_000 });

  await panel(page).locator('[data-action="apply"]').click();
  await expect.poll(() => code(page)).toContain("orbitaTerra.add(terra);");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await expect(status(page)).toContainText("Passo feito: 5. Em órbita.");

  // o grupo vazio não basta: a Terra precisa estar dentro dele
  await pasteCode(page, SISTEMA_SOLAR.steps[4].code.replace("orbitaTerra.add(terra);", "cena.add(terra);"));
  await expect(result(page)).toContainText("(está direto na cena)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // o passo no computador começa do fim do passo 8 e baixa o projeto com ele
  await stepButton(page, 9).click();
  await expect(title(page)).toHaveText("9. No seu computador");
  await expect.poll(() => code(page)).toContain("const caminhoSaturno = new THREE.Mesh(");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="sistema-solar.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("sistema-solar.zip");
  const files = await zipFiles(download);
  for (const file of SISTEMA_SOLAR.steps[8].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("sistema-solar");
});

test("projetos: na Vitrine de materiais, a conferência conta as amostras que o laço cria, e o projeto sai para o computador", async ({ page }) => {
  await page.goto("index-3d.html?projeto=vitrine&passo=7");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Fácil · Vitrine de materiais");
  await expect(title(page)).toHaveText("7. A escala de aspereza");
  await expect(page.locator("#lv-codebar")).toContainText("Vitrine de materiais · passo 7 de 9");
  await expect(result(page)).toContainText("(não achei amostra na cena)", { timeout: 30_000 });

  await panel(page).locator('[data-action="apply"]').click();
  await expect.poll(() => code(page)).toContain("for (let i = 0; i < 5; i++) {");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // com quatro voltas, o laço cria quatro amostras, e a conferência vê todas
  await pasteCode(page, VITRINE.steps[6].code.replace("i < 5", "i < 4"));
  await expect(result(page)).toContainText("(há 4 amostras)", { timeout: 30_000 });
  await page.click("#lv-tab-props");
  await expect(page.locator("#lv-objects .lv-object", { hasText: "amostra" }), "o objeto do laço aparece pela variável dele").toContainText("laço");

  // de volta ao código do passo, o passo no computador começa do fim do passo 8 e baixa o projeto com ele
  await page.click("#lv-tab-project");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await stepButton(page, 9).click();
  await expect(title(page)).toHaveText("9. No seu computador");
  await expect.poll(() => code(page)).toContain("lampada.position.z = Math.sin(tempo) * 4;");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="vitrine.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("vitrine.zip");
  const files = await zipFiles(download);
  for (const file of VITRINE.steps[8].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("vitrine");
});

test("projetos: na Cidade ao entardecer, a conferência vê as sombras dos prédios do laço e a neblina, e o projeto sai para o computador", async ({ page }) => {
  await page.goto("index-3d.html?projeto=cidade&passo=6");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Fácil · Cidade ao entardecer");
  await expect(title(page)).toHaveText("6. As sombras");
  await expect(page.locator("#lv-codebar")).toContainText("Cidade ao entardecer · passo 6 de 9");
  await expect(result(page)).toContainText("(o sol não faz sombra: falta sol.castShadow = true)", { timeout: 30_000 });

  await panel(page).locator('[data-action="apply"]').click();
  await expect.poll(() => code(page)).toContain("predio.castShadow = true;");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // sem receiveShadow no laço, a conferência conta os 81 prédios que não recebem sombra
  await pasteCode(page, CIDADE.steps[5].code.replace("predio.receiveShadow = true;", "predio.receiveShadow = false;"));
  await expect(result(page, 2)).toContainText("(81 prédios não recebem sombra: a sombra de um não aparece no outro)", { timeout: 30_000 });
  await page.click("#lv-tab-props");
  await expect(page.locator("#lv-objects .lv-object", { hasText: "predio" }), "o objeto do laço aparece pela variável dele").toContainText("laço");

  // de volta ao código do passo, o passo 8 começa do fim do 7, sem neblina
  await page.click("#lv-tab-project");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await stepButton(page, 8).click();
  await expect(title(page)).toHaveText("8. A neblina");
  await expect.poll(() => code(page)).toContain("sol.shadow.mapSize.set(2048, 2048);");
  await expect(result(page)).toContainText("(a cena não tem neblina: falta cena.fog)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // o passo no computador começa do fim do passo 8 e baixa o projeto com ele
  await stepButton(page, 9).click();
  await expect(title(page)).toHaveText("9. No seu computador");
  await expect.poll(() => code(page)).toContain('cena.fog = new THREE.Fog("#f6a26b", 25, 70);');
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="cidade.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("cidade.zip");
  const files = await zipFiles(download);
  for (const file of CIDADE.steps[8].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("cidade");
});

test("projetos: na Montanha-russa, a conferência segue o carrinho andando, e o projeto sai para o computador sem os controles do mouse", async ({ page }) => {
  test.slow(); // o carrinho anda alguns segundos de verdade até a conferência medir a velocidade
  await page.goto("index-3d.html?projeto=montanha-russa&passo=9");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Intermediário · Montanha-russa");
  await expect(title(page)).toHaveText("9. O passeio");
  await expect(page.locator("#lv-codebar")).toContainText("Montanha-russa · passo 9 de 12");
  await expect(result(page)).toContainText("(não achei carrinho na cena)", { timeout: 30_000 });

  // a conferência segue o rastro do carrinho andando e mede a velocidade
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // rodando de novo com a animação parada, ela espera o carrinho andar, e volta a valer quando ele anda
  await page.click("#lv-play");
  await expect(page.locator("#lv-play")).toHaveAttribute("aria-pressed", "false");
  await page.click("#lv-restart");
  await expect(result(page)).toContainText("(a animação está parada: aperte ▶ na barra de cima para o carrinho andar)", { timeout: 30_000 });
  await expect(result(page)).toHaveAttribute("data-ok", "pending");
  await expect(done(page)).toBeHidden();
  await page.click("#lv-play");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // com getPoint, o carrinho acelera e freia conforme os pontos do traçado
  const getPoint = MONTANHA_RUSSA.steps[8].code.replace("% 1;\n  const ponto = curva.getPointAt(u);", "% 1;\n  const ponto = curva.getPoint(u);");
  expect(getPoint).not.toBe(MONTANHA_RUSSA.steps[8].code);
  await pasteCode(page, getPoint);
  await expect(result(page, 3)).toContainText(/\(a velocidade vai de \d+,\d a \d+,\d por segundo\)/, { timeout: 60_000 });
  await expect(result(page, 3)).toHaveAttribute("data-ok", "false");

  // o passo 10 começa com a velocidade fixa do 9, que não muda com a altura, e a conta da energia passa
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });
  await done(page).locator('[data-action="next"]').click();
  await expect(title(page)).toHaveText("10. A gravidade");
  await expect(result(page, 1)).toContainText("(a velocidade não muda com a altura: fica em 8,0 por segundo)", { timeout: 60_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 90_000 });

  // o passo no computador começa do fim do passo 11, com a câmera no carrinho, e o main.js não leva os OrbitControls
  await stepButton(page, 12).click();
  await expect(title(page)).toHaveText("12. No seu computador");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="montanha-russa.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("montanha-russa.zip");
  const files = await zipFiles(download);
  for (const file of MONTANHA_RUSSA.steps[11].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("montanha-russa");
  expect(files["src/main.js"]).not.toContain("OrbitControls");
});

test("projetos: o modo de estudo não tem a aba Projetos", async ({ page }) => {
  await page.goto("index-3d.html?estudo=experimental&projeto=galaxia");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  expect(new URL(page.url()).search).toBe("?estudo=experimental");
  await expect(page.locator("#lv-tab-project")).toBeHidden();
  await expect(page.locator("#lv-codebar")).toBeHidden();
});
