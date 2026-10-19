// progress.js — o progresso nos desafios, guardado no navegador. A página do código vivo
// grava; a tela inicial lê para mostrar quanto de cada trilha já foi feito.

export const PROGRESS_KEY = "visugraph.desafios.v1"; // { feitos: [ids], atual: id }

/** O que está guardado, sem conferir se os ids existem. Sem armazenamento (ou com lixo), nada feito. */
export function readProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    return { done: Array.isArray(data?.feitos) ? data.feitos : [], current: data?.atual ?? null };
  } catch {
    return { done: [], current: null };
  }
}
