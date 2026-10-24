// projectPanel.js — a aba "Projetos": os níveis com os seus projetos e o passo aberto.
//
// O painel só mostra. Quem abre um passo, troca o código do editor, confere a cena e guarda o
// progresso é src/live/app.js; o estado do código e a conferência chegam por setCodeState() e
// setResult(). Passar o mouse num trecho de "Linha por linha" marca esse trecho no editor.

import { LEVELS, PROJECTS, diffLines, hunks, levelOf, startCode } from "./projects/index.js";
import { richText } from "./challengesPanel.js";
import { el } from "./mathPanel.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** O que o editor tem, em relação ao passo aberto (codeState() de projects/index.js, ou { guide: k }). */
function codeStateText(state, index) {
  if (state === "start") return "Escreva no editor as linhas marcadas com +, ou use o código pronto.";
  if (state === "done") return "O editor já tem o código deste passo.";
  if (state?.guide != null) {
    const where = state.guide === 0 ? "o código de partida" : `o código do fim do passo ${state.guide}`;
    return state.guide > index ? `O editor está adiantado, com ${where}. Para refazer este passo, volte ao começo dele.` : `O editor tem ${where}. Volte ao começo deste passo para seguir daqui.`;
  }
  return "O editor tem o seu próprio código. A conferência olha a cena, então o seu jeito vale; para seguir o guia ao pé da letra, volte ao começo do passo.";
}

export class ProjectPanel {
  /**
   * `handlers`: open(projectId, índice) (null: o passo em que a pessoa parou), leave(), apply() e
   * restart() (o código do fim e do começo do passo), locate(linha) (onde o trecho está no editor,
   * ou null), mark(trecho ou null) e reveal(trecho).
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.done = {};
    this.project = null;
    this.index = 0;
    this.result = null;
    this.doneKey = null;
    this.render();
  }

  /** Passos feitos de cada projeto: { id do projeto: Set de ids de passo }. */
  setDone(done) {
    this.done = done;
    if (this.project) {
      this.renderSteps();
      this.renderResult();
    } else this.render();
  }

  /** Mostra um passo, ou a lista de projetos com null. */
  show(project, index = 0) {
    this.project = project;
    this.index = index;
    this.result = null;
    this.render();
    this.scrollToTop();
  }

  /** Se o começo do painel ficou para cima (o painel rola junto com a lista de objetos), volta a ele. */
  scrollToTop() {
    const scroller = this.root.closest(".lv-inspector");
    if (!scroller) return;
    const tabs = scroller.querySelector(".lv-tabs")?.offsetHeight ?? 0;
    const above = scroller.getBoundingClientRect().top + tabs - this.root.getBoundingClientRect().top;
    if (above > 0) scroller.scrollTop -= above;
  }

  /** Resultado de grade() para o passo aberto. */
  setResult(result) {
    this.result = result;
    this.renderResult();
  }

  setCodeState(state) {
    if (this.codeStateEl) this.codeStateEl.textContent = codeStateText(state, this.index);
  }

  doneOf(project) {
    return this.done[project.id] ?? new Set();
  }

  render() {
    this.checksEl = this.doneEl = this.stepsEl = this.codeStateEl = null;
    this.doneKey = null;
    this.root.replaceChildren(...(this.project ? this.stepView() : this.listView()).filter(Boolean));
  }

  listView() {
    const nodes = [
      el(
        "div",
        { class: "lv-ch__head" },
        el("h2", { class: "lv-pj-title", text: "Projetos" }),
        el("p", { class: "lv-note", text: "Uma cena completa, passo a passo: cada linha explicada, e o porquê de cada escolha. O código de cada projeto fica guardado neste navegador." }),
      ),
    ];
    for (const level of LEVELS) {
      const list = el("ul", { class: "lv-pj-list" });
      for (const project of PROJECTS.filter((p) => p.level === level.id)) {
        const count = project.steps.filter((s) => this.doneOf(project).has(s.id)).length;
        const progress = count === project.steps.length ? `${count} de ${count} passos, pronto` : count ? `${count} de ${project.steps.length} passos` : plural(project.steps.length, "passo", "passos");
        const button = el(
          "button",
          { type: "button", class: "lv-pj-card", "data-project": project.id },
          el("span", { class: "lv-pj-card__title", text: project.title }),
          el("span", { class: "lv-pj-card__about", text: project.summary }),
          el("span", { class: "lv-pj-card__progress", "data-state": count === 0 ? "new" : count === project.steps.length ? "done" : "started", text: progress }),
        );
        button.addEventListener("click", () => this.handlers.open(project.id, null));
        list.append(el("li", {}, button));
      }
      for (const soon of level.soon) {
        list.append(
          el(
            "li",
            { class: "lv-pj-soon" },
            el("span", { class: "lv-pj-card__title" }, soon.title, el("span", { class: "lv-pj-soon__tag", text: "em breve" })),
            el("span", { class: "lv-pj-card__about", text: soon.about }),
          ),
        );
      }
      nodes.push(el("section", { class: "lv-pj-level", "data-level": level.id }, el("h3", { text: level.title }), el("p", { class: "lv-note", text: level.about }), list));
    }
    return nodes;
  }

  stepView() {
    const { project, index } = this;
    const step = project.steps[index];
    const leave = el("button", { type: "button", class: "lv-link", "data-action": "leave", text: "← Todos os projetos" });
    leave.addEventListener("click", () => this.handlers.leave());
    this.stepsEl = el("ol", { class: "lv-pj-steps", "aria-label": "Passos do projeto" });
    this.renderSteps();
    this.codeStateEl = el("p", { class: "lv-note", "data-code-state": "" });
    this.checksEl = el("ul", { class: "lv-results", "aria-label": "Conferências" });
    this.doneEl = el("div", { class: "lv-ch__done", role: "status", hidden: true });
    const nodes = [
      el("div", { class: "lv-ch__nav" }, leave),
      el(
        "div",
        { class: "lv-ch__head" },
        el("p", { class: "lv-ch__kicker", text: `${levelOf(project).title} · ${project.title}` }),
        el("h2", { class: "lv-pj-title", text: `${index + 1}. ${step.title}` }),
      ),
      this.stepsEl,
      el("p", { class: "lv-pj-goal" }, ...richText(step.goal)),
      this.section("code", "O código", this.codeStateEl, this.diffView(), this.codeActions()),
      this.section("lines", "Linha por linha", this.linesView(step)),
      this.section("why", "Por que assim", ...step.why.map((w) => el("div", { class: "lv-pj-why" }, el("h4", {}, ...richText(w.title)), el("p", {}, ...richText(w.text))))),
      this.section("try", "Experimente", el("ul", { class: "lv-pj-try" }, ...step.try.map((t) => el("li", {}, ...richText(t))))),
      this.section("check", "Confira na cena", this.checksEl, this.doneEl),
      this.navView(),
    ];
    if (index === project.steps.length - 1) {
      nodes.push(el("p", { class: "lv-note", text: "Depois deste passo vem levar o projeto para o seu computador, com Node, Vite, OrbitControls e lil-gui (em breve)." }));
    }
    this.renderResult();
    return nodes;
  }

  section(id, title, ...children) {
    return el("section", { class: "lv-pj-sec", "data-sec": id }, el("h3", { class: "lv-ch__sub", text: title }), ...children);
  }

  renderSteps() {
    if (!this.stepsEl) return;
    const done = this.doneOf(this.project);
    this.stepsEl.replaceChildren(
      ...this.project.steps.map((s, i) => {
        const isDone = done.has(s.id);
        const button = el("button", {
          type: "button",
          "data-step": String(i + 1),
          "data-done": String(isDone),
          "aria-current": i === this.index ? "step" : null,
          "aria-label": `Passo ${i + 1}: ${s.title}${isDone ? " (feito)" : ""}`,
          title: `${i + 1}. ${s.title}`,
          text: String(i + 1),
        });
        button.addEventListener("click", () => this.handlers.open(this.project.id, i));
        return el("li", {}, button);
      }),
    );
  }

  /** O que muda do começo para o fim do passo, com duas linhas iguais em volta. */
  diffView() {
    const { project, index } = this;
    const pre = el("pre", { class: "lv-pj-diff", "aria-label": "O que muda no código: linhas com + entram, linhas com − saem" });
    for (const line of hunks(diffLines(startCode(project, index), project.steps[index].code))) {
      if (line.op === "skip") {
        pre.append(el("span", { class: "lv-pj-diff__line", "data-op": "skip", text: `⋯ ${plural(line.count, "linha igual", "linhas iguais")}` }));
        continue;
      }
      const mark = { add: "+", del: "−", same: " " }[line.op];
      pre.append(el("span", { class: "lv-pj-diff__line", "data-op": line.op }, el("span", { class: "lv-pj-diff__mark", "aria-hidden": "true", text: mark }), line.text || " "));
    }
    return pre;
  }

  codeActions() {
    const apply = el("button", { type: "button", class: "lv-mini", "data-action": "apply", text: "Usar o código deste passo" });
    apply.addEventListener("click", () => this.handlers.apply());
    const restart = el("button", { type: "button", class: "lv-mini", "data-action": "restart", text: "Voltar ao começo do passo" });
    restart.addEventListener("click", () => this.handlers.restart());
    return el("div", { class: "lv-pj-actions" }, apply, restart, el("span", { class: "lv-note", text: "Ctrl+Z desfaz." }));
  }

  linesView(step) {
    const list = el("ol", { class: "lv-pj-lines" });
    for (const line of step.lines) {
      const button = el("button", { type: "button", class: "lv-pj-snippet", title: "Mostrar no código" }, el("code", { text: line.code }));
      const mark = (on) => this.handlers.mark(on ? this.handlers.locate(line) : null);
      button.addEventListener("mouseenter", () => mark(true));
      button.addEventListener("mouseleave", () => mark(false));
      button.addEventListener("focus", () => mark(true));
      button.addEventListener("blur", () => mark(false));
      button.addEventListener("click", () => {
        const at = this.handlers.locate(line);
        if (at) this.handlers.reveal(at);
      });
      list.append(el("li", {}, button, el("p", {}, ...richText(line.text))));
    }
    return list;
  }

  navView() {
    const { project, index } = this;
    const prev = el("button", { type: "button", class: "lv-mini", "data-action": "prev", text: "← Passo anterior", disabled: index === 0 });
    prev.addEventListener("click", () => this.handlers.open(project.id, index - 1));
    const last = index === project.steps.length - 1;
    const next = el("button", { type: "button", class: "lv-mini", "data-action": "next", text: "Próximo passo →", disabled: last });
    next.addEventListener("click", () => this.handlers.open(project.id, index + 1));
    return el("nav", { class: "lv-pj-nav", "aria-label": "Passos" }, prev, next);
  }

  renderResult() {
    if (!this.checksEl) return;
    const step = this.project.steps[this.index];
    const results = this.result?.results ?? step.checks.map((c) => ({ text: c.text, ok: null, seen: null }));
    this.checksEl.replaceChildren(
      ...results.map((r) =>
        el(
          "li",
          { class: "lv-result", "data-ok": r.ok == null ? "pending" : String(r.ok) },
          el("span", { class: "lv-result__mark", "aria-hidden": "true", text: r.ok == null ? "…" : r.ok ? "✓" : "✗" }),
          el("span", {}, r.text, r.seen ? el("span", { class: "lv-result__seen", text: ` (${r.seen})` }) : null),
        ),
      ),
    );
    // o quadro de "feito" só é refeito quando muda: o botão dele não perde o foco a cada execução
    const ok = !!this.result?.ok;
    const key = ok ? `ok:${this.index}` : "no";
    if (key === this.doneKey) return;
    this.doneKey = key;
    this.doneEl.hidden = !ok;
    if (!ok) {
      this.doneEl.replaceChildren();
      return;
    }
    const nextStep = this.project.steps[this.index + 1];
    const parts = [el("strong", { text: nextStep ? "✓ Passo feito!" : "✓ Projeto pronto!" })];
    if (nextStep) {
      const button = el("button", { type: "button", class: "lv-mini", "data-action": "next", text: `Próximo: ${this.index + 2}. ${nextStep.title} →` });
      button.addEventListener("click", () => this.handlers.open(this.project.id, this.index + 1));
      parts.push(button);
    }
    this.doneEl.replaceChildren(...parts);
  }
}
