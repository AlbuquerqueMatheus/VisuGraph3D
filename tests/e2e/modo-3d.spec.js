import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";
import { code, inPage, objectId, openLive, pasteCode, sceneValue, status, viewport } from "./live.js";

// ---------------------------------------------------------------------------
// Modo 3D (código vivo): o código é a fonte da verdade e a cena escreve nele.

test("modo 3D: a tela inicial abre o código vivo e a cena roda", async ({ page }) => {
  await page.goto("index.html");
  await page.click("#home-start");
  await expect(page).toHaveURL(/index-3d\.html$/);
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
  await expect(status(page)).toContainText("animar() rodando");

  await expect(page.frameLocator("#lv-viewport").locator("#vg-canvas")).toBeVisible();
  for (const name of ["cena", "camera", "luzAmbiente", "sol", "chao", "cubo"]) {
    await expect(page.locator(".lv-object__name", { hasText: new RegExp(`^${name}$`) })).toBeVisible();
  }
  const info = await viewport(page).evaluate(() => window.__vgDebug.info());
  expect(info.objects.length, "cada new THREE.X(...) do código é rastreado").toBeGreaterThanOrEqual(10);
});

test("modo 3D: clicar no cubo destaca as linhas dele no código", async ({ page }) => {
  await openLive(page);
  const id = await objectId(page, "cubo");
  const center = await inPage(page, await viewport(page).evaluate((i) => window.__vgDebug.project(i), id));
  await page.mouse.click(center.x, center.y);

  await expect(page.locator('.lv-object[aria-pressed="true"] .lv-object__name')).toHaveText("cubo");
  await expect(page.locator("#lv-props .lv-props__head h2")).toHaveText("cubo");
  const selected = page.locator(".cm-line.cm-vg-selected");
  await expect(selected.first()).toContainText("const cubo = new THREE.Mesh(");
  const lines = await selected.allInnerTexts();
  expect(lines.some((l) => l.includes("cubo.position.set(0, 0.5, 0);"))).toBe(true);
  expect(lines.some((l) => l.includes("cena.add(cubo);"))).toBe(true);
  expect(lines.some((l) => l.includes("const sol")), "linhas de outro objeto não ficam destacadas").toBe(false);
  expect((await viewport(page).evaluate(() => window.__vgDebug.info())).selected).toBe(id);
});

test("modo 3D: arrastar o gizmo reescreve a posição no código", async ({ page }) => {
  await openLive(page);
  const id = await objectId(page, "cubo");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info())).gizmo).toBe("translate");

  const handle = await inPage(page, await viewport(page).evaluate(() => window.__vgDebug.gizmoHandle("x")));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 20, { steps: 12 });
  await page.mouse.up();

  // só o x muda: o arraste segue o eixo da seta
  const codeX = async () => Number(/cubo\.position\.set\(([-\d.]+), 0\.5, 0\);/.exec(await code(page))?.[1]);
  await expect.poll(codeX).toBeGreaterThan(0);
  // depois de soltar, o código roda de novo e a cena fica exatamente como o código diz
  const x = await codeX();
  await expect.poll(() => sceneValue(page, id, "position.x")).toBeCloseTo(x, 5);
});

test("modo 3D: a câmera do código, que não está na cena, também se move pelo gizmo", async ({ page }) => {
  await openLive(page);
  const id = await objectId(page, "camera");
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info())).gizmo).toBe("translate");

  const handle = await inPage(page, await viewport(page).evaluate(() => window.__vgDebug.gizmoHandle("x")));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 20, { steps: 12 });
  await page.mouse.up();

  const codeX = async () => Number(/camera\.position\.set\(([-\d.]+), 3, 6\);/.exec(await code(page))?.[1]);
  await expect.poll(codeX).toBeGreaterThan(4);
  const x = await codeX();
  await expect.poll(() => sceneValue(page, id, "position.x")).toBeCloseTo(x, 5);
  const text = await code(page);
  expect(text.indexOf("camera.position.set("), "a posição continua antes do lookAt").toBeLessThan(text.indexOf("camera.lookAt("));
});

test("modo 3D: o painel de propriedades grava no código", async ({ page }) => {
  await openLive(page);
  const id = await objectId(page, "cubo");
  await page.locator(`.lv-object[data-id="${id}"]`).click();

  const roughness = page.locator('#lv-props input[type="range"][aria-label="aspereza"]');
  await roughness.evaluate((el) => {
    el.value = "0.8";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => code(page)).toContain('{ color: "#4f8cff", roughness: 0.8, metalness: 0.1 }');
  await expect.poll(() => sceneValue(page, id, "material.roughness")).toBeCloseTo(0.8, 5);

  const rotationY = page.locator('#lv-props input[data-key="rotation.y"]');
  await rotationY.fill("30");
  await rotationY.press("Enter");
  await expect.poll(() => code(page)).toContain("cubo.rotation.y = THREE.MathUtils.degToRad(30);");
  await expect.poll(() => sceneValue(page, id, "rotation.y")).toBeCloseTo(Math.PI / 6, 5);

  // a linha nova entra junto das outras linhas do cubo, antes de cena.add(cubo)
  const text = await code(page);
  expect(text.indexOf("cubo.rotation.y")).toBeLessThan(text.indexOf("cena.add(cubo);"));
});

test("modo 3D: arrastar um número do código muda a cena", async ({ page }) => {
  await openLive(page);
  const id = await objectId(page, "cubo");
  const number = page.locator(".cm-line", { hasText: "roughness: 0.4" }).locator(".cm-vg-number", { hasText: /^0\.4$/ });
  const box = await number.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  // 4 px por passo, e o passo da aspereza é 0,01: 40 px → +0,1
  await page.mouse.move(box.x + box.width / 2 + 40, y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => code(page)).toContain("roughness: 0.5,");
  await expect.poll(() => sceneValue(page, id, "material.roughness")).toBeCloseTo(0.5, 5);
});

test("modo 3D: editar o código muda a cena", async ({ page }) => {
  await openLive(page);
  await pasteCode(
    page,
    [
      "const cena = new THREE.Scene();",
      "const bola = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshNormalMaterial());",
      "bola.position.set(2, 1, -1);",
      "cena.add(bola);",
    ].join("\n"),
  );
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
  const id = await objectId(page, "bola");
  await expect.poll(() => sceneValue(page, id, "position.x")).toBe(2);
  expect(await sceneValue(page, id, "position.z")).toBe(-1);
  await expect(page.locator(".lv-object__name", { hasText: /^cubo$/ })).toHaveCount(0);
});

test("modo 3D: erros aparecem na linha e não derrubam o editor", async ({ page }) => {
  await openLive(page);

  await pasteCode(page, "const cena = new THREE.Scene();\ncena.add(");
  await expect(status(page)).toContainText("Linha 2");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1); // marca vermelha na margem da linha

  await pasteCode(page, "const cena = new THREE.Scene();\nconst caixa = undefined;\ncaixa.position.set(1, 2, 3);");
  await expect(status(page)).toContainText("Linha 3: Tentou ler 'position'");

  // laço infinito: o visor interrompe o laço e aponta a linha dele
  await pasteCode(page, "const cena = new THREE.Scene();\nlet i = 0;\nwhile (i >= 0) {\n  i++;\n}");
  await expect(status(page)).toContainText("Linha 3: O laço não terminou a tempo", { timeout: 15_000 });

  // corrigido o código, tudo volta a funcionar
  await pasteCode(page, "const cena = new THREE.Scene();\nconst caixa = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());\ncena.add(caixa);");
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
});

test("modo 3D: um laço infinito para mesmo quando o código engole o erro com try/catch", async ({ page }) => {
  await openLive(page);

  // o laço de dentro estoura o prazo; o de fora continuaria para sempre
  await pasteCode(page, "const cena = new THREE.Scene();\nwhile (true) {\n  try {\n    for (;;) {}\n  } catch (e) {}\n}");
  await expect(status(page)).toContainText("Linha 4: O laço não terminou a tempo", { timeout: 15_000 });

  // em animar(), o erro engolido também aparece e a animação para
  await pasteCode(page, "const cena = new THREE.Scene();\nfunction animar() {\n  try {\n    while (true) {}\n  } catch (e) {}\n}");
  await expect(status(page)).toContainText("Linha 4: Em animar() (a animação parou): O laço não terminou a tempo", { timeout: 15_000 });

  // num temporizador, o laço infinito para os temporizadores: senão cada chamada travaria a página
  await pasteCode(page, "const cena = new THREE.Scene();\nsetInterval(() => {\n  window.chamadas = (window.chamadas || 0) + 1;\n  while (true) {}\n}, 50);");
  await expect(status(page)).toContainText("Linha 4: Num temporizador: O laço não terminou a tempo", { timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(await viewport(page).evaluate(() => window.chamadas), "o setInterval não foi chamado de novo").toBe(1);

  await pasteCode(page, "const cena = new THREE.Scene();\nconst caixa = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());\ncena.add(caixa);");
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
});

test("modo 3D: WebGLRenderer criados pelo código não derrubam o visor", async ({ page }) => {
  const evicted = [];
  page.on("console", (msg) => /Too many active WebGL contexts/i.test(msg.text()) && evicted.push(msg.text()));
  await openLive(page);
  // um contexto WebGL novo a cada execução e a cada quadro; o navegador só aceita uns 16 por página
  await pasteCode(
    page,
    [
      "const cena = new THREE.Scene();",
      "const desenhista = new THREE.WebGLRenderer();",
      "const caixa = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());",
      "cena.add(caixa);",
      "function animar() {",
      "  const outro = new THREE.WebGLRenderer();",
      "}",
    ].join("\n"),
  );
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
  await viewport(page).evaluate(() => {
    window.__lost = 0;
    document.getElementById("vg-canvas").addEventListener("webglcontextlost", () => window.__lost++);
  });

  const info = () => viewport(page).evaluate(() => window.__vgDebug.info());
  for (let i = 0; i < 20; i++) {
    const before = (await info()).runId;
    await page.click("#lv-restart");
    await expect.poll(async () => (await info()).runId).toBeGreaterThan(before);
  }
  await expect.poll(async () => (await info()).elapsed).toBeGreaterThan(1); // dezenas de quadros, um renderizador em cada
  expect(await viewport(page).evaluate(() => window.__lost), "o contexto do visor nunca se perdeu").toBe(0);
  expect(evicted).toEqual([]);
  await expect(status(page)).toContainText("Cena atualizada · 1 objeto");
});

test("modo 3D: o menu Adicionar escreve o objeto no código e o seleciona", async ({ page }) => {
  await openLive(page);
  await page.locator("#lv-add summary").click();
  await page.locator("#lv-add-list button", { hasText: "Esfera" }).click();

  await expect.poll(() => code(page)).toContain("const esfera = new THREE.Mesh(");
  await expect(page.locator('.lv-object[aria-pressed="true"] .lv-object__name')).toHaveText("esfera");
  await expect(status(page)).toContainText("Cena atualizada · 5 objetos");
  const text = await code(page);
  expect(text.indexOf("const esfera"), "o objeto novo entra antes de animar()").toBeLessThan(text.indexOf("function animar"));
});

// Um disco de pontos (sem Math.random, para o clique cair sempre num ponto) e três cópias de um cone.
const PONTOS_E_COPIAS = `const cena = new THREE.Scene();
const quantidade = 2000;
const posicoes = new Float32Array(quantidade * 3);
for (let i = 0; i < quantidade; i++) {
  const r = Math.sqrt(i / quantidade) * 2;
  posicoes[i * 3] = Math.cos(i * 2.4) * r;
  posicoes[i * 3 + 2] = Math.sin(i * 2.4) * r;
}
const geometria = new THREE.BufferGeometry();
geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
const material = new THREE.PointsMaterial({ color: "#ffcc66", size: 0.05 });
const galaxia = new THREE.Points(geometria, material);
cena.add(galaxia);

const arvores = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.6, 6), new THREE.MeshBasicMaterial({ color: "#2f6b3a" }), 3);
const matriz = new THREE.Matrix4();
for (let i = 0; i < 3; i++) arvores.setMatrixAt(i, matriz.makeTranslation(i - 1, 0.3, 3));
cena.add(arvores);`;

test("modo 3D: pontos e cópias de uma malha são objetos da cena, com o tamanho da geometria no painel", async ({ page }) => {
  await openLive(page);
  await pasteCode(page, PONTOS_E_COPIAS);
  await expect(status(page)).toContainText("Cena atualizada · 2 objetos");
  await expect(page.locator(".lv-object", { hasText: "galaxia" }).locator(".lv-object__class")).toHaveText("Points");
  await expect(page.locator(".lv-object", { hasText: "arvores" }).locator(".lv-object__class")).toHaveText("InstancedMesh");

  // pontos não têm superfície: o clique vale perto de um deles
  const id = await objectId(page, "galaxia");
  const center = await inPage(page, await viewport(page).evaluate((i) => window.__vgDebug.project(i), id));
  await page.mouse.click(center.x, center.y);
  await expect(page.locator("#lv-props .lv-props__head h2")).toHaveText("galaxia");
  await expect.poll(async () => (await viewport(page).evaluate(() => window.__vgDebug.info())).gizmo).toBe("translate");
  await expect(page.locator("#lv-props .lv-info")).toHaveText("2.000 pontos · atributo position");

  const size = page.locator('#lv-props input[type="number"][data-key="size"]');
  await expect(size).toHaveValue("0.05");
  await size.fill("0.1");
  await size.press("Enter");
  await expect.poll(() => code(page)).toContain('new THREE.PointsMaterial({ color: "#ffcc66", size: 0.1 });');
  await expect.poll(() => sceneValue(page, id, "material.size")).toBeCloseTo(0.1, 5);

  // a aba Matemática segue um ponto da nuvem até o pixel
  await page.click("#lv-tab-math");
  await expect(page.locator("#lv-math .lv-vsel")).toContainText("vértice 1 de 2000");
  await expect(page.locator('#lv-math [data-sec="path"] [data-verify]')).toContainText("✓ Conferido");

  // numa malha instanciada, cada cópia tem a sua matriz: o painel conta as cópias e a Matemática fica na origem
  await page.click("#lv-tab-props");
  await page.locator(".lv-object", { hasText: "arvores" }).click();
  await expect(page.locator("#lv-props .lv-info").first()).toHaveText("3 cópias desta malha");
  await expect(page.locator("#lv-props .lv-info").nth(1)).toHaveText(/^\d+ vértices · atributos position, normal e uv$/);
  await page.click("#lv-tab-math");
  await expect(page.locator("#lv-math .lv-vsel")).toContainText("origem do objeto");
});

test("modo 3D: Baixar HTML gera uma página com o código da cena", async ({ page }) => {
  await openLive(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#lv-download")]);
  expect(download.suggestedFilename()).toBe("cena-visugraph.html");
  const html = await readFile(await download.path(), "utf8");
  expect(html).toContain('<script type="importmap">');
  expect(html).toContain("cubo.position.set(0, 0.5, 0);");
  expect(html).toContain("return { cena: cena, camera: camera, animar:");
});
