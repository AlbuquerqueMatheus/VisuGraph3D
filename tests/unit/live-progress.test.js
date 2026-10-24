import { afterEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY, PROJECTS_KEY, readProgress, readProjects } from "../../src/live/progress.js";

/** Um localStorage mínimo, só com o que readProgress usa. */
const storage = (items) => ({ getItem: (key) => items[key] ?? null });

describe("readProgress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lê os desafios feitos e o desafio aberto", () => {
    vi.stubGlobal("localStorage", storage({ [PROGRESS_KEY]: JSON.stringify({ feitos: ["posicao", "lookat"], atual: "fov" }) }));
    expect(readProgress()).toEqual({ done: ["posicao", "lookat"], current: "fov" });
  });

  it("sem nada guardado, nada feito", () => {
    vi.stubGlobal("localStorage", storage({}));
    expect(readProgress()).toEqual({ done: [], current: null });
  });

  it("dado corrompido ou num formato antigo não quebra a página", () => {
    vi.stubGlobal("localStorage", storage({ [PROGRESS_KEY]: "{feitos" }));
    expect(readProgress()).toEqual({ done: [], current: null });
    vi.stubGlobal("localStorage", storage({ [PROGRESS_KEY]: JSON.stringify({ feitos: "posicao" }) }));
    expect(readProgress()).toEqual({ done: [], current: null });
  });

  it("sem acesso ao armazenamento (bloqueado pelo navegador), nada feito", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    expect(readProgress()).toEqual({ done: [], current: null });
  });
});

describe("readProjects", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lê os passos feitos de cada projeto e o passo aberto", () => {
    vi.stubGlobal("localStorage", storage({ [PROJECTS_KEY]: JSON.stringify({ feitos: { galaxia: ["palco", "pontos"] }, atual: { projeto: "galaxia", passo: "brilho" } }) }));
    expect(readProjects()).toEqual({ done: { galaxia: ["palco", "pontos"] }, current: { project: "galaxia", step: "brilho" } });
  });

  it("sem nada guardado, ou com lixo, nada feito e nenhum projeto aberto", () => {
    vi.stubGlobal("localStorage", storage({}));
    expect(readProjects()).toEqual({ done: {}, current: null });
    vi.stubGlobal("localStorage", storage({ [PROJECTS_KEY]: "[1, 2" }));
    expect(readProjects()).toEqual({ done: {}, current: null });
    vi.stubGlobal("localStorage", storage({ [PROJECTS_KEY]: JSON.stringify({ feitos: { galaxia: "palco" }, atual: "galaxia" }) }));
    expect(readProjects()).toEqual({ done: {}, current: null });
  });
});
