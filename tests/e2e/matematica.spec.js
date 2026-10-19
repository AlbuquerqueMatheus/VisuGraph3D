// Aba Matemática e caixa de vidro: as contas mostradas no painel são as que desenham a tela.
import { test, expect } from "./fixtures.js";
import { inPage, objectId, openLive, pasteCode, status, viewport } from "./live.js";

const debug = (page, fn, arg) => viewport(page).evaluate(fn, arg);

/** Cola o código e espera o visor rodar exatamente ele (`count` malhas e luzes). */
async function runCode(page, text, count) {
  await pasteCode(page, text);
  await expect(status(page)).toContainText(`Cena atualizada · ${count} ${count === 1 ? "objeto" : "objetos"}`);
}

async function openMath(page, name) {
  const id = await objectId(page, name);
  await page.locator(`.lv-object[data-id="${id}"]`).click();
  await page.click("#lv-tab-math");
  await expect(page.locator("#lv-math .lv-props__head h2")).toHaveText(name);
  return id;
}

/** O marcador do painel e a projeção do Three.js para o vértice que o painel mostra. */
async function markerAndThree(page, id) {
  const index = Number(/vértice (\d+)/.exec(await page.locator("#lv-math .lv-vsel").innerText())?.[1] ?? 1) - 1;
  return debug(page, ([i, k]) => ({ marker: window.__vgDebug.marker(), three: window.__vgDebug.vertexScreen(i, k) }), [id, index]);
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("matemática: o vértice cai no pixel que as matrizes do painel calculam", async ({ page }) => {
  await openLive(page);
  const id = await openMath(page, "cubo");
  const verify = page.locator('#lv-math [data-sec="path"] [data-verify]');
  await expect(verify).toContainText("✓ Conferido");

  for (let k = 0; k < 4; k++) {
    await page.click('#lv-math button[aria-label="Próximo vértice"]');
    await expect(page.locator("#lv-math .lv-vsel")).toContainText(`vértice ${k + 2} de 24`);
    await expect.poll(async () => {
      const { marker, three } = await markerAndThree(page, id);
      return marker && three ? distance(marker, three) : Infinity;
    }).toBeLessThan(0.5);
  }

  // olhando pela câmera do código, as contas passam a ser as dela (fov 50, near 0,1, far 100)
  await page.click("#lv-view");
  await expect(page.locator("#lv-math .lv-props__head p")).toContainText("vista pela câmera camera");
  await expect(page.locator('#lv-math [data-sec="projection"] .lv-note')).toContainText("near 0.10, far 100.0");
  await expect(verify).toContainText("✓ Conferido");
  await expect.poll(async () => {
    const { marker, three } = await markerAndThree(page, id);
    return marker && three ? distance(marker, three) : Infinity;
  }).toBeLessThan(0.5);
});

test("matemática: dentro de um grupo, a matriz de mundo é a do pai vezes a do filho", async ({ page }) => {
  await openLive(page);
  await runCode(
    page,
    [
      "const cena = new THREE.Scene();",
      "const sistema = new THREE.Group();",
      "sistema.position.set(0.5, 0, -0.5);",
      "sistema.rotation.y = THREE.MathUtils.degToRad(30);",
      "sistema.scale.set(1.5, 1.5, 1.5);",
      "cena.add(sistema);",
      "const lua = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshNormalMaterial());",
      "lua.position.set(0.8, 0.5, 0);",
      "lua.rotation.set(0.2, 0.4, 0.6, 'ZYX');",
      "sistema.add(lua);",
    ].join("\n"),
    1,
  );
  const id = await openMath(page, "lua");
  await expect(page.locator('#lv-math [data-sec="world"]')).toContainText("O objeto está dentro de sistema");
  await page.locator('#lv-math [data-sec="model"] input[type="checkbox"]').check();
  await expect(page.locator('#lv-math [data-sec="model"] .lv-details')).toContainText('rotation.order = "ZYX"');
  await expect(page.locator('#lv-math [data-sec="path"] [data-verify]')).toContainText("✓ Conferido");
  await expect.poll(async () => {
    const { marker, three } = await markerAndThree(page, id);
    return marker && three ? distance(marker, three) : Infinity;
  }).toBeLessThan(0.5);
});

test("matemática: o número do painel e o literal do código se acendem juntos", async ({ page }) => {
  await openLive(page);
  await openMath(page, "cubo");
  // M[1][3] é a translação em y: cubo.position.set(0, 0.5, 0)
  const ty = page.locator('#lv-math [data-sec="model"] .lv-mat__row').nth(1).locator(".lv-cell").nth(3);
  await expect(ty).toHaveText("0.500");
  await ty.hover();
  await expect(page.locator(".cm-vg-math")).toHaveText("0.5");
  await expect(page.locator(".cm-line", { has: page.locator(".cm-vg-math") })).toHaveText("cubo.position.set(0, 0.5, 0);");

  await page.locator("#lv-objects").hover(); // sai do painel: a marca some
  await expect(page.locator(".cm-vg-math")).toHaveCount(0);

  // no sentido contrário: o mouse sobre o literal acende o número da matriz
  const literal = page.locator(".cm-line", { hasText: "cubo.position.set(0, 0.5, 0);" }).locator(".cm-vg-number", { hasText: /^0\.5$/ });
  await literal.hover();
  await expect(ty).toHaveClass(/is-code-linked/);
});

const LIGHTS_SCENE = [
  "const cena = new THREE.Scene();",
  'cena.add(new THREE.AmbientLight("#ffffff", 0.3));',
  'const ceu = new THREE.HemisphereLight("#87ceeb", "#3a3f4b", 0.6);',
  "cena.add(ceu);",
  'const sol = new THREE.DirectionalLight("#ffeedd", 2);',
  "sol.position.set(3, 5, 2);",
  "cena.add(sol);",
  'const lampada = new THREE.PointLight("#ff8844", 6);',
  "lampada.position.set(-2, 2, 2);",
  "cena.add(lampada);",
  'const holofote = new THREE.SpotLight("#88ccff", 20, 0, THREE.MathUtils.degToRad(25), 0.3);',
  "holofote.position.set(2, 4, 3);",
  "cena.add(holofote);",
  "const bola = new THREE.Mesh(",
  "  new THREE.SphereGeometry(1, 48, 24),",
  '  new THREE.MeshPhongMaterial({ color: "#d04f4f", specular: "#ffffff", shininess: 40 })',
  ");",
  "bola.position.set(0, 1, 0);",
  "cena.add(bola);",
].join("\n");

/** Mede a iluminação no ponto (do iframe) e espera a medida chegar. */
async function probeAt(page, point) {
  await page.locator("#lv-viewport").evaluate((frame, p) => {
    frame.contentWindow.postMessage({ source: "visugraph-editor", type: "probe", x: p.x, y: p.y }, "*");
  }, point);
  await expect.poll(async () => {
    const p = await debug(page, () => window.__vgDebug.probe());
    return p ? Math.hypot(p.screen[0] - point.x, p.screen[1] - point.y) : Infinity;
  }).toBeLessThan(1.5);
  return debug(page, () => window.__vgDebug.probe());
}

const formulaBytes = (p) => p.result.rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
const worstChannel = (p) => Math.max(...formulaBytes(p).map((c, i) => Math.abs(c - p.pixel[i])));

for (const [model, label] of [["phong", "Phong"], ["blinn", "Blinn-Phong"]]) {
  test(`caixa de vidro (${label}): o pixel da tela é o da fórmula, com cinco tipos de luz`, async ({ page }) => {
    await openLive(page);
    await runCode(page, LIGHTS_SCENE, 6);
    const id = await objectId(page, "bola");
    await page.click("#lv-tab-math");
    await page.click(`#lv-math [data-glass="${model}"]`);
    await expect.poll(() => debug(page, () => window.__vgDebug.glass())).toBe(model);

    // primeiro um clique de verdade, no centro da bola
    const center = await debug(page, (i) => window.__vgDebug.project(i), id);
    const click = await inPage(page, center);
    await page.mouse.click(click.x, click.y);
    await expect(page.locator('#lv-math [data-verify="probe"]')).toContainText("✓ O pixel da tela é o da fórmula");
    let p = await debug(page, () => window.__vgDebug.probe());
    expect(p.result.ambient.map((a) => a.type).sort()).toEqual(["ambient", "hemisphere"]);
    expect(p.result.direct.map((d) => d.type).sort()).toEqual(["directional", "point", "spot"]);
    expect(worstChannel(p)).toBeLessThanOrEqual(2);

    // o brilho do sol fica onde a normal é o vetor meio-caminho entre a luz e o observador
    const eye = p.eye;
    const norm = (v) => v.map((c) => c / Math.hypot(...v));
    const l = norm([3, 5, 2]);
    const v = norm([eye[0], eye[1] - 1, eye[2]]);
    const h = norm(l.map((c, i) => c + v[i]));
    const highlight = await debug(page, (pt) => window.__vgDebug.toScreen(pt), [h[0], 1 + h[1], h[2]]);
    p = await probeAt(page, highlight);
    expect(Math.max(...p.result.direct.find((d) => d.type === "directional").specular), "o termo especular aparece").toBeGreaterThan(0.3);
    expect(worstChannel(p)).toBeLessThanOrEqual(2);

    for (const [dx, dy] of [[-40, 25], [30, 45], [55, -10]]) {
      p = await probeAt(page, { x: center.x + dx, y: center.y + dy });
      expect(p.supported).toBe(true);
      expect(worstChannel(p), `ponto (${dx}, ${dy})`).toBeLessThanOrEqual(2);
    }
    await expect(page.locator('#lv-math [data-verify="probe"]')).toContainText("✓");
  });
}

test("caixa de vidro: material sem Phong fica com o shader do Three.js", async ({ page }) => {
  await openLive(page);
  await runCode(
    page,
    "const cena = new THREE.Scene();\nconst bola = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshNormalMaterial());\nbola.position.set(0, 1, 0);\ncena.add(bola);",
    1,
  );
  const id = await objectId(page, "bola");
  await page.click("#lv-tab-math");
  await page.click('#lv-math [data-glass="phong"]');
  await expect.poll(() => debug(page, () => window.__vgDebug.glass())).toBe("phong");
  const center = await inPage(page, await debug(page, (i) => window.__vgDebug.project(i), id));
  await page.mouse.click(center.x, center.y);
  await expect(page.locator("#lv-math .lv-probe")).toContainText("MeshNormalMaterial não segue o modelo de Phong");

  await page.click('#lv-math [data-glass="off"]');
  await expect.poll(() => debug(page, () => window.__vgDebug.glass())).toBeNull();
  await expect(page.locator("#lv-math .lv-probe")).toHaveCount(0);
});
