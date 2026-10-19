// Temas: a lista que a barra comum segue tem de bater com as trilhas do código vivo
// e com os links da tela inicial e dos laboratórios.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOPICS, labById, topicOfLab, topicOfTrail } from "../../src/js/topics.js";
import { TRAILS, trailById } from "../../src/live/challenges.js";

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
    }
  });
});
