// Desafios: a trilha abre o desafio, a cena é corrigida a cada execução e o progresso fica.
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { code, objectId, pasteCode, status, viewport } from "./live.js";
import { challengeById } from "../../src/live/challenges.js";

const check = (page, n = 0) => page.locator(".lv-result").nth(n);
const ghosts = (page) => viewport(page).evaluate(() => window.__vgDebug.ghosts());
const info = (page) => viewport(page).evaluate(() => window.__vgDebug.info());

/** Código inicial do desafio com uma troca de texto. */
const edited = (id, from, to) => {
  const starter = challengeById(id).starter;
  expect(starter).toContain(from);
  return starter.replace(from, to);
};

async function openTrail(page, query) {
  await page.goto(`index-3d.html?${query}`);
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
}

test("desafios: a trilha abre o primeiro desafio, o painel resolve e o próximo vem em seguida", async ({ page }) => {
  await openTrail(page, "trilha=matriz");
  expect(new URL(page.url()).search, "a trilha sai da URL: ao recarregar vale o desafio aberto").toBe("");
  await expect(page.locator("#lv-tab-challenges")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".lv-ch__title")).toHaveText("Leve o cubo até o alvo");
  await expect(page.locator("#lv-codebar")).toContainText("Leve o cubo até o alvo");
  await expect(page.locator("#lv-codebar")).toContainText("0 de 1 verificação");
  await expect(check(page)).toHaveAttribute("data-ok", "false");
  await expect(check(page)).toContainText("(está em (0,00; 0,50; 0,00))");
  expect(await code(page)).toContain("cubo.position.set(0, 0.5, 0);");
  expect(await ghosts(page)).toEqual([{ kind: "box", matrix: [[1, 0, 0, 2], [0, 1, 0, 0.5], [0, 0, 1, -1], [0, 0, 0, 1]] }]);

  // vale qualquer caminho até a cena certa: aqui, o painel de propriedades
  const id = await objectId(page, "cubo");
  await page.click("#lv-tab-props");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  for (const [key, value] of [["position.x", "2"], ["position.z", "-1"]]) {
    const input = page.locator(`#lv-props input[data-key="${key}"]`);
    await input.fill(value);
    await input.press("Enter");
  }
  await expect.poll(() => code(page)).toContain("cubo.position.set(2, 0.5, -1);");
  await expect(page.locator("#lv-codebar")).toContainText("✓ feito");
  await expect(status(page)).toContainText("Desafio feito: Leve o cubo até o alvo.");

  await page.click("#lv-codebar .lv-link");
  await expect(page.locator("#lv-tab-challenges")).toHaveAttribute("aria-selected", "true");
  await expect(check(page)).toHaveAttribute("data-ok", "true");
  await expect(page.locator(".lv-ch__done")).toContainText("Desafio feito!");
  await page.click('[data-action="next"]');

  await expect(page.locator(".lv-ch__title")).toHaveText("Gire a placa 45°");
  await expect.poll(() => code(page)).toContain("const placa = new THREE.Mesh(");
  await expect.poll(() => ghosts(page)).toHaveLength(1);
  // o histórico de desfazer começa de novo: Ctrl+Z não traz o código do desafio anterior
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await code(page)).toContain("const placa = new THREE.Mesh(");

  // as dicas vêm uma de cada vez, e a última é a resposta
  await page.click('[data-action="hint"]');
  await expect(page.locator(".lv-hints__list li")).toHaveCount(1);
  await page.click('[data-action="hint"]');
  await expect(page.locator('[data-action="hint"]')).toHaveText("Mostrar a resposta (3 de 3)");
  await page.click('[data-action="hint"]');
  await expect(page.locator(".lv-hints__list li").nth(2)).toHaveText("placa.rotation.y = THREE.MathUtils.degToRad(45);");
  await expect(page.locator('[data-action="hint"]')).toHaveCount(0);

  // graus no lugar de radianos: a correção mostra o ângulo que a cena tem
  await pasteCode(page, edited("rotacao", "placa.position.set(0, 0.5, 0);", "placa.position.set(0, 0.5, 0);\nplaca.rotation.y = 45;"));
  await expect(check(page)).toContainText("(está girada 58,3° em torno de y)");

  // sair do desafio devolve o código livre e mostra o progresso
  await page.click('[data-action="leave"]');
  await expect(page.locator("#lv-codebar")).toBeHidden();
  await expect.poll(() => code(page)).toContain("Tudo o que aparece no visor vem deste código");
  await expect(page.locator('[data-challenge="posicao"]')).toHaveAttribute("data-done", "true");
  await expect(page.locator('[data-challenge="rotacao"]')).toHaveAttribute("data-done", "false");
  await expect(page.locator("#lv-challenges")).toContainText("1 de 10 feitos");
  await expect.poll(() => ghosts(page)).toEqual([]);
});

test("desafios: cada um guarda o seu código, a câmera do código entra sozinha e o recarregar volta ao desafio", async ({ page }) => {
  await openTrail(page, "trilha=camera");
  await expect(page.locator(".lv-ch__title")).toHaveText("Enquadre a esfera");
  await expect(page.locator("#lv-view")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await info(page)).view).toBe("camera");
  await expect(check(page, 0)).toHaveAttribute("data-ok", "true");
  await expect(check(page, 1)).toHaveAttribute("data-ok", "false");

  await pasteCode(page, edited("lookat", "camera.lookAt(0, 0, 0);", "camera.lookAt(-2, 1, -3);"));
  await expect(page.locator(".lv-ch__done")).toContainText("Desafio feito!");
  await page.click('[data-action="next"]');

  await expect(page.locator(".lv-ch__title")).toHaveText("Metade da altura da imagem");
  await expect(check(page, 1)).toContainText("(ocupa 24% da altura)");
  await pasteCode(page, edited("fov", "PerspectiveCamera(50,", "PerspectiveCamera(30,"));
  await expect(check(page, 1)).toContainText("(ocupa 41% da altura)");

  await page.reload();
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(page.locator(".lv-ch__title")).toHaveText("Metade da altura da imagem");
  expect(await code(page)).toContain("PerspectiveCamera(30,");
  await expect(check(page, 1)).toContainText("(ocupa 41% da altura)");

  await pasteCode(page, edited("fov", "PerspectiveCamera(50,", "PerspectiveCamera(25,"));
  await expect(page.locator(".lv-ch__done")).toContainText("Desafio feito!");

  // o desafio anterior abre com o código que o aluno deixou nele
  await page.click('[data-action="leave"]');
  await page.click('[data-challenge="lookat"]');
  await expect.poll(() => code(page)).toContain("camera.lookAt(-2, 1, -3);");
  await expect(page.locator(".lv-ch__done")).toContainText("Desafio feito!");

  // restaurar volta ao código inicial do desafio (e Ctrl+Z desfaz)
  await page.click("#lv-reset");
  await expect.poll(() => code(page)).toContain("camera.lookAt(0, 0, 0);");
  await expect(check(page, 1)).toHaveAttribute("data-ok", "false");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => code(page)).toContain("camera.lookAt(-2, 1, -3);");
});

test("desafios: a trilha de Phong liga a caixa de vidro, e o registro do estudo guarda o caminho", async ({ page }) => {
  await openTrail(page, "estudo=experimental&trilha=phong");
  expect(new URL(page.url()).search).toBe("?estudo=experimental");
  await expect(page.locator(".lv-ch__title")).toHaveText("Luz pela esquerda");
  await expect.poll(() => viewport(page).evaluate(() => window.__vgDebug.glass())).toBe("phong");
  await expect(page.locator('#lv-math [data-glass="phong"]')).toHaveAttribute("aria-pressed", "true");

  await pasteCode(page, edited("difusa", "sol.position.set(5, 2, 1);", "sol.position.set(-5, 1, 0);"));
  await expect(page.locator(".lv-ch__done")).toContainText("Desafio feito!");
  await page.click('[data-action="next"]');
  await expect(page.locator(".lv-ch__title")).toHaveText("Um brilho pequeno e forte");
  await page.click('[data-action="hint"]');
  await pasteCode(page, edited("especular", "MeshLambertMaterial({ color: \"#3366cc\" })", "MeshPhongMaterial({ color: \"#3366cc\", shininess: 150 })"));
  await expect(check(page, 1)).toHaveAttribute("data-ok", "true");
  await expect(check(page, 2)).toContainText("(Ks = (0,07; 0,07; 0,07))");

  const download = page.waitForEvent("download");
  await page.click(".lv-study button:has-text('Exportar registro')");
  const log = JSON.parse(await readFile(await (await download).path(), "utf8"));
  const events = log.eventos.filter((e) => e.evento.startsWith("desafio."));
  expect(events.map((e) => `${e.evento} ${e.id}`)).toEqual([
    "desafio.abrir difusa",
    "desafio.conferir difusa",
    "desafio.concluir difusa",
    "desafio.sair difusa",
    "desafio.abrir especular",
    "desafio.dica especular",
    "desafio.conferir especular",
  ]);
  expect(events[0]).toMatchObject({ origem: "trilha" });
  expect(events[2]).toMatchObject({ dicas: 0 });
  expect(events[4]).toMatchObject({ origem: "proximo" });
  expect(events[6]).toMatchObject({ ok: false, passou: 2, total: 3 });
  expect(log.eventos.some((e) => e.evento === "vidro" && e.modelo === "phong")).toBe(true);
  expect(JSON.stringify(log), "o registro não leva o código").not.toContain("MeshPhongMaterial");

  // a sessão nova é de outro aluno: progresso e código voltam ao começo
  await page.click(".lv-study button:has-text('Nova sessão')");
  await expect(page.locator(".lv-ch__title")).toHaveText("Luz pela esquerda");
  await expect.poll(() => code(page)).toContain("sol.position.set(5, 2, 1);");
  await page.click('[data-action="leave"]');
  await expect(page.locator("#lv-challenges")).toContainText("0 de 10 feitos");
  await expect.poll(() => code(page)).toContain("Tudo o que aparece no visor vem deste código");
});
