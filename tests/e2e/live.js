// live.js — o que os testes do modo 3D (código vivo) usam para abrir a página e ler o visor.
import { expect } from "./fixtures.js";

export const status = (page) => page.locator("#lv-status-text");
export const viewport = (page) => page.frame({ url: /viewport\.html/ });
export const code = (page) => page.locator(".cm-content").innerText();

/** Abre o modo 3D e espera o código inicial rodar no visor. */
export async function openLive(page) {
  await page.goto("index-3d.html");
  await expect(status(page)).toContainText("Cena atualizada", { timeout: 30_000 });
}

/** Troca todo o código do editor, como se o aluno colasse um texto. */
export async function pasteCode(page, text) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator(".cm-content").evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

/** Id do objeto `name` no visor (na página recém-aberta, igual à ordem no código). */
export const objectId = async (page, name) =>
  Number(await page.locator(".lv-object", { has: page.locator(".lv-object__name", { hasText: new RegExp(`^${name}$`) }) }).getAttribute("data-id"));

export const sceneValue = (page, id, path) => viewport(page).evaluate(([i, p]) => window.__vgDebug.value(i, p), [id, path]);

/** Converte um ponto do iframe em coordenadas da página. */
export async function inPage(page, point) {
  const box = await page.locator("#lv-viewport").boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}
