// home.js — a tela inicial: mostra em cada tema quanto da trilha de desafios já foi feito e, em
// cada projeto, quantos passos.
import { TRAILS } from "../live/challenges.js";
import { readProgress, readProjects } from "../live/progress.js";
import { projectById } from "../live/projects/index.js";

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

const projects = readProjects();

for (const card of document.querySelectorAll(".project[data-project]")) {
  const project = projectById(card.dataset.project);
  const out = card.querySelector(".project__progress");
  if (!project || !out) continue;
  const steps = new Set(projects.done[project.id] ?? []);
  const total = project.steps.length;
  const count = project.steps.filter((s) => steps.has(s.id)).length;
  // os mesmos textos da lista de projetos do código vivo (src/live/projectPanel.js)
  out.textContent = count === 0 ? `${total} passos` : count === total ? `${total} de ${total} passos, pronto` : `${count} de ${total} passos`;
  out.dataset.state = count === 0 ? "new" : count === total ? "done" : "started";
  const go = card.querySelector(".project__go a");
  if (go && count > 0) go.textContent = count === total ? "Rever o projeto" : "Continuar o projeto";
}
