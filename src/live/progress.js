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

export const PROJECTS_KEY = "visugraph.projetos.v1"; // { feitos: { projeto: [ids de passo] }, atual: { projeto, passo } }

/**
 * O guia de projetos: os passos feitos de cada projeto e o passo aberto ({ project, step },
 * ou null), sem conferir se os ids existem. Sem armazenamento (ou com lixo), nada feito.
 */
export function readProjects() {
  try {
    const data = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "null");
    const done = {};
    if (data?.feitos && typeof data.feitos === "object") {
      for (const [id, steps] of Object.entries(data.feitos)) if (Array.isArray(steps)) done[id] = steps;
    }
    const current = typeof data?.atual?.projeto === "string" ? { project: data.atual.projeto, step: data.atual.passo ?? null } : null;
    return { done, current };
  } catch {
    return { done: {}, current: null };
  }
}
