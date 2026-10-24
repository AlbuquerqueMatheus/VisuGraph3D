// Temas: a lista que a barra comum segue tem de bater com as trilhas do código vivo
// e com os links da tela inicial e dos laboratórios.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOPICS, labById, labsOfTrail, topicOfLab, topicOfTrail } from "../../src/js/topics.js";
import { CHALLENGES, TRAILS, challengeById, trailById, trailOf } from "../../src/live/challenges.js";
import { LEVELS, projectById } from "../../src/live/projects/index.js";

const page = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const captures = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

describe("temas", () => {
  it("cada trilha do código vivo está em um tema, e todo tema com trilha aponta para uma que existe", () => {
    for (const trail of TRAILS) expect(topicOfTrail(trail.id)?.trail, trail.id).toBe(trail.id);
    for (const topic of TOPICS) if (topic.trail) expect(trailById(topic.trail), topic.id).not.toBeNull();
  });

  it("todo tema tem pelo menos um passo, e cada laboratório pertence a um tema só", () => {
    for (const topic of TOPICS) expect(topic.labs.length + (topic.trail ? 1 : 0), topic.id).toBeGreaterThan(0);
    const labs = TOPICS.flatMap((t) => t.labs.map((l) => l.id));
    expect(new Set(labs).size).toBe(labs.length);
    for (const lab of labs) expect(topicOfLab(lab).labs).toContain(labById(lab));
    expect(topicOfLab("nenhum")).toBeNull();
    expect(topicOfTrail(null), "o editor livre não tem tema").toBeNull();
  });

  it("os links da tela inicial e dos laboratórios levam a laboratórios e trilhas que existem", () => {
    for (const file of ["index.html", "index-2d.html"]) {
      const html = page(file);
      for (const lab of captures(html, /index-2d\.html#([\w-]+)/g)) expect(labById(lab), `${file}: #${lab}`).not.toBeNull();
      for (const trail of captures(html, /index-3d\.html\?trilha=([\w-]+)/g)) expect(trailById(trail), `${file}: ${trail}`).not.toBeNull();
      for (const id of captures(html, /index-3d\.html\?desafio=([\w-]+)/g)) expect(challengeById(id), `${file}: ${id}`).not.toBeNull();
      for (const id of captures(html, /index-3d\.html\?projeto=([\w-]+)/g)) expect(projectById(id), `${file}: ${id}`).not.toBeNull();
    }
  });

  it("os projetos da tela inicial existem, e as trilhas de projetos dela são os níveis do código vivo", () => {
    const html = page("index.html");
    const cards = captures(html, /data-project="([\w-]+)"/g);
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards) expect(projectById(id), id).not.toBeNull();
    for (const [, id, card] of html.matchAll(/<article class="project" data-project="([\w-]+)">([\s\S]*?)<\/article>/g)) {
      const chips = captures(card.match(/<ul class="project__concepts"[^>]*>([\s\S]*?)<\/ul>/)[1], /<li>(.*?)<\/li>/g);
      expect(chips, `os conceitos de ${id}`).toEqual(projectById(id).concepts);
    }
    expect(captures(html, /<h3 id="level-([\w-]+)">/g)).toEqual(LEVELS.map((l) => l.id));
    for (const level of LEVELS) {
      expect(html, level.id).toContain(`<p>${level.about}</p>`);
      for (const soon of level.soon) expect(html, soon.title).toContain(`<span>${soon.title}</span>`);
    }
  });

  it("o laboratório que um desafio manda rever é um laboratório do tema da trilha dele", () => {
    const named = CHALLENGES.filter((c) => c.lab);
    expect(named.length).toBeGreaterThan(0);
    for (const c of named) expect(labsOfTrail(trailOf(c.id).id).map((l) => l.id), c.id).toContain(c.lab);
    expect(labsOfTrail("phong").map((l) => l.id)).toEqual(["phong", "cores"]);
    expect(labsOfTrail("camera"), "Câmera ainda não tem laboratório").toEqual([]);
  });
});
