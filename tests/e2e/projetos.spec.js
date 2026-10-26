// Projetos: o endereço abre o passo, o código pronto passa na conferência, os passos seguem um do
// outro e o progresso fica. Os passos no computador baixam o projeto e ficam feitos pela pessoa.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { code, pasteCode, status, viewport } from "./live.js";
import { CIDADE } from "../../src/live/projects/cidade.js";
import { FLORESTA } from "../../src/live/projects/floresta.js";
import { GALAXIA } from "../../src/live/projects/galaxia.js";
import { GALAXIA_VIVA } from "../../src/live/projects/galaxiaViva.js";
import { MAR } from "../../src/live/projects/mar.js";
import { MONTANHA_RUSSA } from "../../src/live/projects/montanhaRussa.js";
import { PHONG } from "../../src/live/projects/phong.js";
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

/** Quantos pixels do visor são magenta chapado, a cor de um shader que não compila. */
const magentaPixels = (page) =>
  viewport(page).evaluate(
    () =>
      new Promise((resolve) => {
        // o quadro do visor já está na fila deste quadro, então é desenhado antes desta leitura
        requestAnimationFrame(() => {
          const canvas = document.getElementById("vg-canvas");
          const gl = canvas.getContext("webgl2");
          const data = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
          let count = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) count++;
          resolve(count);
        });
      }),
  );

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
  await expect(panel(page).locator(".lv-pj-soon"), "todos os projetos do guia estão prontos").toHaveCount(0);
  await expect(panel(page).locator('.lv-pj-card[data-project="sistema-solar"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="vitrine"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="cidade"] .lv-pj-card__progress')).toHaveText("9 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="montanha-russa"] .lv-pj-card__progress')).toHaveText("12 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="floresta"] .lv-pj-card__progress')).toHaveText("12 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="phong"] .lv-pj-card__progress')).toHaveText("13 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="mar"] .lv-pj-card__progress')).toHaveText("13 passos");
  await expect(panel(page).locator('.lv-pj-card[data-project="galaxia-viva"] .lv-pj-card__progress')).toHaveText("12 passos");
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

test("projetos: na Floresta, a conferência espera o vento soprar e avisa do needsUpdate esquecido, e o projeto sai para o computador", async ({ page }) => {
  test.slow(); // a conferência olha as árvores balançarem alguns segundos de verdade
  await page.goto("index-3d.html?projeto=floresta&passo=11");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Intermediário · Floresta de 10 mil árvores");
  await expect(title(page)).toHaveText("11. O vento");
  await expect(page.locator("#lv-codebar")).toContainText("Floresta de 10 mil árvores · passo 11 de 12");
  await expect(result(page)).toContainText("(não achei a função animar(tempo))", { timeout: 30_000 });

  // a conferência olha as dez mil árvores balançarem, pela amostra das matrizes das cópias
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // rodando de novo com a animação parada, ela espera o vento soprar
  await page.click("#lv-play");
  await expect(page.locator("#lv-play")).toHaveAttribute("aria-pressed", "false");
  await page.click("#lv-restart");
  await expect(result(page)).toContainText("(a animação está parada: aperte ▶ na barra de cima para o vento soprar)", { timeout: 30_000 });
  await expect(result(page)).toHaveAttribute("data-ok", "pending");
  await expect(done(page)).toBeHidden();
  await page.click("#lv-play");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // sem o needsUpdate, as matrizes mudam na lista do three.js, mas a placa de vídeo não fica sabendo
  const stale = FLORESTA.steps[10].code.replace("  troncos.instanceMatrix.needsUpdate = true;\n  copas.instanceMatrix.needsUpdate = true;\n", "");
  expect(stale).not.toBe(FLORESTA.steps[10].code);
  await pasteCode(page, stale);
  await expect(result(page)).toContainText("(as matrizes dos troncos mudam, mas a placa de vídeo não fica sabendo: falta troncos.instanceMatrix.needsUpdate = true)", { timeout: 60_000 });
  await expect(result(page)).toHaveAttribute("data-ok", "false");

  // o passo no computador começa do fim do passo 11, e os controles do mouse giram em volta do meio da floresta
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });
  await stepButton(page, 12).click();
  await expect(title(page)).toHaveText("12. No seu computador");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="floresta.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("floresta.zip");
  const files = await zipFiles(download);
  for (const file of FLORESTA.steps[11].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("floresta");
  expect(files["src/main.js"]).toContain("controles.target.set(0, 0, 20);");
});

test("projetos: no Phong escrito à mão, o erro do shader aparece na linha dele, a conferência refaz a conta da luz nos pixels, e o projeto sai para o computador", async ({ page }) => {
  test.slow(); // a conferência desenha a cena para medir os pixels, e a lâmpada anda alguns segundos de verdade
  await page.goto("index-3d.html?projeto=phong&passo=2");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Avançado · Phong escrito à mão");
  await expect(title(page)).toHaveText("2. O primeiro shader");
  await expect(page.locator("#lv-codebar")).toContainText("Phong escrito à mão · passo 2 de 13");
  await expect(result(page)).toContainText("(a esfera é MeshPhongMaterial, e não um ShaderMaterial)", { timeout: 30_000 });

  await panel(page).locator('[data-action="apply"]').click();
  await expect.poll(() => code(page)).toContain("gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  expect(await magentaPixels(page), "os dois shaders compilam").toBe(0);

  // sem o ; no fim do gl_FragColor, o shader não compila: o erro vai para a linha dele no editor, e a esfera fica magenta
  const broken = PHONG.steps[1].code.replace("vec4(1.0, 0.5, 0.2, 1.0);", "vec4(1.0, 0.5, 0.2, 1.0)");
  expect(broken).not.toBe(PHONG.steps[1].code);
  const line = broken.split("\n").findIndex((l) => l.includes("gl_FragColor")) + 1;
  await pasteCode(page, broken);
  await expect(status(page)).toContainText(`Linha ${line}: No shader de fragmentos: Falta um ; no fim desta linha`, { timeout: 30_000 });
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);
  await expect(result(page, 1)).toContainText("(o shader de fragmentos não compila: a barra embaixo do código diz o erro e a linha)", { timeout: 30_000 });
  await expect.poll(() => magentaPixels(page), "a esfera do shader quebrado fica magenta").toBeGreaterThan(500);

  // com o ; de volta, a esfera volta a ser desenhada pelo shader
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);
  await expect.poll(() => magentaPixels(page)).toBe(0);

  // no último passo no VisuGraph, a conferência refaz a conta do sol e da lâmpada em cada pixel da esfera
  await stepButton(page, 12).click();
  await expect(title(page)).toHaveText("12. A lâmpada dá a volta");
  await expect(codeState(page), "o passo 12 começa do fim do passo 11, com a lâmpada parada").toHaveText(/^Escreva no editor/);
  await expect(result(page)).toContainText("(não achei a função animar(tempo))", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // rodando de novo com a animação parada, ela espera a lâmpada andar
  await page.click("#lv-play");
  await expect(page.locator("#lv-play")).toHaveAttribute("aria-pressed", "false");
  await page.click("#lv-restart");
  await expect(result(page)).toContainText("(a animação está parada: aperte ▶ na barra de cima para a lâmpada andar)", { timeout: 30_000 });
  await expect(result(page)).toHaveAttribute("data-ok", "pending");
  await expect(done(page)).toBeHidden();
  await page.click("#lv-play");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // sem o copy, a lâmpada anda, e a luz dela fica no shader onde ela começou
  const stale = PHONG.steps[11].code.replace("  material.uniforms.uPosicaoDaLampada.value.copy(lampada.position);\n", "");
  expect(stale).not.toBe(PHONG.steps[11].code);
  await pasteCode(page, stale);
  await expect(result(page, 1)).toContainText(/e a luz no shader ficou em \(0,00; 0,60; 3,00\): falta copiar a posição dela para material\.uniforms\.uPosicaoDaLampada\.value no animar/, { timeout: 60_000 });
  await expect(result(page, 1)).toHaveAttribute("data-ok", "false");

  // o passo no computador começa do fim do passo 12, com os dois shaders no cena.js e os controles do mouse no main.js
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await stepButton(page, 13).click();
  await expect(title(page)).toHaveText("13. No seu computador");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="phong.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("phong.zip");
  const files = await zipFiles(download);
  for (const file of PHONG.steps[12].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("phong");
  expect(files["src/cena.js"]).toContain("const fragmentShader = /* glsl */ `");
  expect(files["src/main.js"]).toContain("new OrbitControls(");
  expect(files["src/main.js"], "os controles giram em volta do meio, onde a câmera olha").not.toContain("controles.target.set");
});

test("projetos: no Mar com ondas na GPU, a conferência mede a superfície que o shader desenhou, espera as ondas andarem, e o projeto sai para o computador", async ({ page }) => {
  test.slow(); // a conferência desenha a superfície do mar para medir cada ponto, e as ondas andam alguns segundos de verdade
  await page.goto("index-3d.html?projeto=mar&passo=2");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Avançado · Mar com ondas na GPU");
  await expect(title(page)).toHaveText("2. O primeiro shader");
  await expect(page.locator("#lv-codebar")).toContainText("Mar com ondas na GPU · passo 2 de 13");
  await expect(result(page)).toContainText("(o mar é MeshBasicMaterial, e não um ShaderMaterial)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // um inteiro vezes um número com casas decimais não compila no GLSL: o erro vai para a linha dele, e a conferência manda olhar a barra
  await stepButton(page, 3).click();
  await expect(title(page)).toHaveText("3. Uma onda");
  const broken = MAR.steps[2].code.replace("sin(mundo.x)", "2 * sin(mundo.x)");
  expect(broken).not.toBe(MAR.steps[2].code);
  const line = broken.split("\n").findIndex((l) => l.includes("2 * sin(mundo.x)")) + 1;
  await pasteCode(page, broken);
  await expect(status(page)).toContainText(`Linha ${line}: No shader de vértices: No GLSL, não dá para fazer int * float`, { timeout: 30_000 });
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);
  await expect(result(page)).toContainText("(o shader de vértices não compila: a barra embaixo do código diz o erro e a linha)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);

  // com as ondas andando, a conferência espera o tempo correr; com a animação parada, ela pede o ▶
  await stepButton(page, 4).click();
  await expect(title(page)).toHaveText("4. As ondas andam");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await page.click("#lv-play");
  await expect(page.locator("#lv-play")).toHaveAttribute("aria-pressed", "false");
  await page.click("#lv-restart");
  await expect(result(page, 1)).toContainText("(a animação está parada: aperte ▶ na barra de cima para as ondas andarem)", { timeout: 30_000 });
  await expect(result(page, 1)).toHaveAttribute("data-ok", "pending");
  await expect(done(page)).toBeHidden();
  await page.click("#lv-play");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // ondas altas demais dobram as cristas: a conferência mede e diz o porquê
  await stepButton(page, 8).click();
  await expect(title(page)).toHaveText("8. Ondas de Gerstner");
  const steep = MAR.steps[7].code.replace("uAltura: { value: 0.5 }", "uAltura: { value: 1.7 }");
  expect(steep).not.toBe(MAR.steps[7].code);
  await pasteCode(page, steep);
  await expect(result(page, 1)).toContainText("(com 1,70 de altura e 10,00 de comprimento, a altura vezes o k dá 1,07: de 1 para cima, as cristas se dobram em laçadas)", { timeout: 30_000 });
  await expect(result(page)).toContainText("(as cristas se dobram em laçadas:", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // no último passo no VisuGraph, a conferência refaz a conta da cor de cada ponto do mar, com o sol e a neblina
  await stepButton(page, 12).click();
  await expect(title(page)).toHaveText("12. O horizonte");
  await expect(codeState(page), "o passo 12 começa do fim do passo 11, sem a neblina").toHaveText(/^Escreva no editor/);
  await expect(result(page)).toContainText("(o material do mar não tem o uniform uNeblinaPerto)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // o passo no computador começa do fim do passo 12, com os dois shaders no cena.js e os controles do mouse no main.js
  await stepButton(page, 13).click();
  await expect(title(page)).toHaveText("13. No seu computador");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="mar.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("mar.zip");
  const files = await zipFiles(download);
  for (const file of MAR.steps[12].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("mar");
  expect(files["src/cena.js"]).toContain("const vertexShader = /* glsl */ `");
  expect(files["src/main.js"]).toContain("new OrbitControls(");
  expect(files["src/main.js"], "os controles giram em volta do meio, onde a câmera olha").not.toContain("controles.target.set");
});

test("projetos: na Galáxia viva, a conferência mede as estrelas que o shader desenhou, espera a galáxia girar, e o projeto sai para o computador", async ({ page }) => {
  test.slow(); // a conferência mede as estrelas na placa de vídeo, e a galáxia gira alguns segundos de verdade
  await page.goto("index-3d.html?projeto=galaxia-viva&passo=2");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(panel(page).locator(".lv-ch__kicker")).toHaveText("Avançado · Galáxia viva");
  await expect(title(page)).toHaveText("2. O primeiro shader de pontos");
  await expect(page.locator("#lv-codebar")).toContainText("Galáxia viva · passo 2 de 12");
  await expect(result(page)).toContainText("(a galáxia é desenhada por um PointsMaterial, e não por um ShaderMaterial)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // sem o vertexColors, o three.js não declara o color: o erro vai para a linha dele, com o porquê
  await stepButton(page, 3).click();
  await expect(title(page)).toHaveText("3. A cor de cada estrela");
  const broken = GALAXIA_VIVA.steps[2].code.replace("  vertexColors: true,\n", "");
  expect(broken).not.toBe(GALAXIA_VIVA.steps[2].code);
  const line = broken.split("\n").findIndex((l) => l.includes("vCor = color;")) + 1;
  await pasteCode(page, broken);
  await expect(status(page)).toContainText(`Linha ${line}: No shader de vértices: 'color' é o atributo com a cor de cada vértice`, { timeout: 30_000 });
  await expect(result(page, 1)).toContainText("(o shader de vértices não compila: a barra embaixo do código diz o erro e a linha)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // o brilho de cada estrela é medido pixel a pixel no quadrado dela
  await stepButton(page, 6).click();
  await expect(title(page)).toHaveText("6. O brilho das estrelas");
  const flat = GALAXIA_VIVA.steps[5].code.replace("pow(max(1.0 - 2.0 * d, 0.0), 6.0)", "pow(max(1.0 - 2.0 * d, 0.0), 1.0)");
  expect(flat).not.toBe(GALAXIA_VIVA.steps[5].code);
  await pasteCode(page, flat);
  await expect(result(page, 3)).toContainText("(a luz cai devagar demais, e as estrelas viram bolas embaçadas: falta elevar a 6, pow(max(1.0 - 2.0 * d, 0.0), 6.0))", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // com a galáxia girando, a conferência espera o tempo correr; com a animação parada, ela pede o ▶
  await stepButton(page, 7).click();
  await expect(title(page)).toHaveText("7. A galáxia gira no shader");
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });
  await page.click("#lv-play");
  await expect(page.locator("#lv-play")).toHaveAttribute("aria-pressed", "false");
  await page.click("#lv-restart");
  await expect(result(page, 1)).toContainText("(a animação está parada: aperte ▶ na barra de cima para a galáxia girar)", { timeout: 30_000 });
  await expect(result(page, 1)).toHaveAttribute("data-ok", "pending");
  await expect(done(page)).toBeHidden();
  await page.click("#lv-play");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // girando para o outro lado, a conferência diz o sentido
  await stepButton(page, 8).click();
  await expect(title(page)).toHaveText("8. Cada estrela na sua velocidade");
  const backwards = GALAXIA_VIVA.steps[7].code.replace("angulo -= uTempo * uVelocidade / r;", "angulo += uTempo * uVelocidade / r;");
  expect(backwards).not.toBe(GALAXIA_VIVA.steps[7].code);
  await pasteCode(page, backwards);
  await expect(result(page, 1)).toContainText("(a galáxia gira para o outro lado: o ângulo diminui, angulo -= uTempo * uVelocidade / r)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 30_000 });

  // no último passo no VisuGraph, a conferência refaz a cor de cada estrela, com a onda dos braços e a cor jovem
  await stepButton(page, 11).click();
  await expect(title(page)).toHaveText("11. Estrelas jovens nos braços");
  await expect(codeState(page), "o passo 11 começa do fim do passo 10, sem a cor jovem").toHaveText(/^Escreva no editor/);
  await expect(result(page, 1)).toContainText("(o material da galáxia não tem o uniform uCorJovem)", { timeout: 30_000 });
  await panel(page).locator('[data-action="apply"]').click();
  await expect(codeState(page)).toHaveText("O editor já tem o código deste passo.");
  await expect(done(page)).toContainText("✓ Passo feito!", { timeout: 60_000 });

  // o passo no computador começa do fim do passo 11, com os dois shaders no cena.js e a mesma densidade de tela no main.js
  await stepButton(page, 12).click();
  await expect(title(page)).toHaveText("12. No seu computador");
  const [download] = await Promise.all([page.waitForEvent("download"), panel(page).locator('[data-download="galaxia-viva.zip"]').click()]);
  expect(download.suggestedFilename()).toBe("galaxia-viva.zip");
  const files = await zipFiles(download);
  for (const file of GALAXIA_VIVA.steps[11].files) expect(files[file.path], file.path).toBe(file.code);
  expect(JSON.parse(files["package.json"]).name).toBe("galaxia-viva");
  expect(files["src/cena.js"]).toContain("const densidade = Math.min(window.devicePixelRatio, 2);");
  expect(files["src/main.js"]).toContain("renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));");
  expect(files["src/main.js"]).toContain("new OrbitControls(");
});

test.describe("numa tela de alta densidade", () => {
  test.use({ deviceScaleFactor: 2 });

  test("projetos: na Galáxia viva, o tamanho das estrelas conta com a densidade da tela", async ({ page }) => {
    await page.goto("index-3d.html?projeto=galaxia-viva&passo=4");
    await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
    await panel(page).locator('[data-action="apply"]').click();
    await expect(done(page), "com 30 * densidade, as estrelas têm o tamanho de uma tela comum").toContainText("✓ Passo feito!", { timeout: 30_000 });
    const fixed = GALAXIA_VIVA.steps[3].code.replace("30 * densidade", "30");
    expect(fixed).not.toBe(GALAXIA_VIVA.steps[3].code);
    await pasteCode(page, fixed);
    await expect(result(page)).toContainText("(o uTamanho está em 30, e a sua tela tem 2 pixels da imagem em cada pixel: falta multiplicar pela densidade, 30 * densidade)", { timeout: 30_000 });
  });
});

test("projetos: o modo de estudo não tem a aba Projetos", async ({ page }) => {
  await page.goto("index-3d.html?estudo=experimental&projeto=galaxia");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  expect(new URL(page.url()).search).toBe("?estudo=experimental");
  await expect(page.locator("#lv-tab-project")).toBeHidden();
  await expect(page.locator("#lv-codebar")).toBeHidden();
});
