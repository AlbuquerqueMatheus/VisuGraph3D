// dom.js — utilitários compartilhados pelas seções do modo 2D.

/** Uma seção está visível quando não tem a classe "hidden". */
export function isShown(el) {
  return !!el && !el.classList.contains("hidden");
}

/**
 * Chama `callback(visível)` sempre que a classe "hidden" do elemento muda.
 * Serve para pausar loops de desenho de seções que não estão na tela.
 */
export function onShownChange(el, callback) {
  if (!el) return () => {};
  let shown = isShown(el);
  const observer = new MutationObserver(() => {
    const now = isShown(el);
    if (now !== shown) {
      shown = now;
      callback(now);
    }
  });
  observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Verdadeiro quando o evento de teclado veio de um campo onde a pessoa digita. */
export function isTypingTarget(target) {
  return !!target?.closest?.("input, textarea, select, [contenteditable='true']");
}

/** Executa `fn` quando o DOM estiver pronto (ou na hora, se já estiver). */
export function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}
