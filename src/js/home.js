// home.js — a tela inicial: mostra em cada tema quanto da trilha de desafios já foi feito.
import { TRAILS } from "../live/challenges.js";
import { readProgress } from "../live/progress.js";

const done = new Set(readProgress().done);

for (const card of document.querySelectorAll(".topic[data-trail]")) {
  const trail = TRAILS.find((t) => t.id === card.dataset.trail);
  const out = card.querySelector(".topic__progress");
  if (!trail || !out) continue;
  const total = trail.challenges.length;
  const count = trail.challenges.filter((id) => done.has(id)).length;
  out.textContent =
    count === 0 ? `${total} desafios` : count === total ? `${total} de ${total} feitos, trilha completa` : `${count} de ${total} feitos`;
  out.dataset.state = count === 0 ? "new" : count === total ? "done" : "started";
}
