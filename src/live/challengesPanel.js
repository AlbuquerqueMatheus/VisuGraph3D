// challengesPanel.js — a aba "Desafios": as trilhas, o desafio aberto e a correção dele.
//
// O painel só mostra. Quem abre um desafio, troca o código do editor, corrige a cena e
// guarda o progresso é src/live/app.js; a correção chega aqui por setResult().

import { CHALLENGES, TRAILS, challengeById, trailOf } from "./challenges.js";
import { MatrixView, el } from "./mathPanel.js";

/** Texto com `código` entre crases: os trechos de código viram <code>. */
export function richText(text) {
  return text.split("`").map((part, i) => (i % 2 ? el("code", { text: part }) : part));
}

export class ChallengesPanel {
  /**
   * `handlers`: open(id, origem), leave(), hint(id) e nextOf(id) (o desafio depois deste,
   * ou null).
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.done = new Set();
    this.challenge = null;
    this.hints = 0;
    this.result = null;
    this.doneKey = null;
    this.render();
  }

  /** Desafios já feitos (ids). */
  setDone(done) {
    this.done = new Set(done);
    if (this.challenge) this.renderResult();
    else this.render();
  }

  /** Mostra um desafio, ou a lista de trilhas com null. */
  show(challenge, hints = 0) {
    this.challenge = challenge;
    this.hints = hints;
    this.result = null;
    this.render();
  }

  setHints(n) {
    this.hints = n;
    this.renderHints();
  }

  /** Resultado de grade() para o desafio aberto. */
  setResult(result) {
    this.result = result;
    this.renderResult();
  }

  render() {
    this.checksEl = this.doneEl = this.hintsEl = null;
    this.doneKey = null;
    this.root.replaceChildren(...(this.challenge ? this.challengeView() : this.listView()).filter(Boolean));
  }

  listView() {
    const count = CHALLENGES.filter((c) => this.done.has(c.id)).length;
    const nodes = [
      el(
        "div",
        { class: "lv-ch__head" },
        el("h2", { class: "lv-ch__title", text: "Desafios" }),
        el("p", { class: "lv-note", text: `${count} de ${CHALLENGES.length} feitos. A cena é conferida a cada mudança: vale o código, o gizmo ou o painel.` }),
      ),
    ];
    for (const trail of TRAILS) {
      const list = el("ol", { class: "lv-trail__list" });
      for (const id of trail.challenges) {
        const c = challengeById(id);
        const done = this.done.has(id);
        const button = el(
          "button",
          { type: "button", class: "lv-trail__item", "data-challenge": id, "data-done": String(done), "aria-label": `${c.title}: ${c.topic}${done ? " (feito)" : ""}` },
          el("span", { class: "lv-trail__mark", "aria-hidden": "true", text: done ? "✓" : "○" }),
          el("span", { class: "lv-trail__title", text: c.title }),
          el("span", { class: "lv-trail__topic", text: c.topic }),
        );
        button.addEventListener("click", () => this.handlers.open(id, "lista"));
        list.append(el("li", {}, button));
      }
      nodes.push(
        el(
          "section",
          { class: "lv-trail", "data-trail": trail.id },
          el("h3", { text: trail.title }),
          trail.from ? el("p", { class: "lv-note", text: `Continua o laboratório ${trail.from}.` }) : null,
          list,
        ),
      );
    }
    nodes.push(el("p", { class: "lv-note", text: "Fora dos desafios, o editor mostra o seu próprio código." }));
    return nodes;
  }

  challengeView() {
    const c = this.challenge;
    const trail = trailOf(c.id);
    const leave = el("button", { type: "button", class: "lv-link", "data-action": "leave", text: "← Sair do desafio" });
    leave.addEventListener("click", () => this.handlers.leave());
    const nodes = [
      el("div", { class: "lv-ch__nav" }, leave),
      el(
        "div",
        { class: "lv-ch__head" },
        el("p", { class: "lv-ch__kicker", text: `${trail.title} · ${trail.challenges.indexOf(c.id) + 1} de ${trail.challenges.length}` }),
        el("h2", { class: "lv-ch__title", text: c.title }),
        el("p", { class: "lv-ch__topic", text: c.topic }),
      ),
      el("p", { class: "lv-ch__statement" }, ...richText(c.statement)),
    ];
    if (c.matrix) {
      const target = new MatrixView("M pedida");
      target.set(c.matrix);
      nodes.push(target.el);
    }
    this.checksEl = el("ul", { class: "lv-results", "aria-label": "Verificações" });
    this.doneEl = el("div", { class: "lv-ch__done", role: "status", hidden: true });
    this.hintsEl = el("div", { class: "lv-hints" });
    nodes.push(
      el("h3", { class: "lv-ch__sub", text: "Verificações" }),
      this.checksEl,
      this.doneEl,
      this.hintsEl,
      el("p", { class: "lv-note", text: "Restaurar exemplo volta ao código inicial deste desafio. O código de cada desafio fica guardado neste navegador." }),
    );
    this.renderResult();
    this.renderHints();
    return nodes;
  }

  renderResult() {
    if (!this.checksEl) return;
    const c = this.challenge;
    const results = this.result?.results ?? c.checks.map((check) => ({ text: check.text, ok: null, seen: null }));
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
    const next = ok ? this.handlers.nextOf(c.id) : null;
    const key = ok ? `ok:${next?.id ?? ""}` : "no";
    if (key === this.doneKey) return;
    this.doneKey = key;
    this.doneEl.hidden = !ok;
    if (!ok) {
      this.doneEl.replaceChildren();
      return;
    }
    const button = el("button", { type: "button", class: "lv-mini", "data-action": "next", text: next ? `Próximo: ${next.title} →` : "Ver todos os desafios" });
    button.addEventListener("click", () => (next ? this.handlers.open(next.id, "proximo") : this.handlers.leave()));
    const all = CHALLENGES.every((x) => x.id === c.id || this.done.has(x.id));
    this.doneEl.replaceChildren(el("strong", { text: next || !all ? "✓ Desafio feito!" : "✓ Você fez todos os desafios!" }), button);
  }

  renderHints() {
    if (!this.hintsEl) return;
    const c = this.challenge;
    const hadFocus = this.hintsEl.contains(document.activeElement);
    const shown = c.hints.slice(0, this.hints);
    const left = c.hints.length - this.hints;
    let more = null;
    if (left > 0) {
      const label = left === 1 ? "Mostrar a resposta" : this.hints ? "Mais uma dica" : "Mostrar uma dica";
      more = el("button", { type: "button", class: "lv-mini", "data-action": "hint", text: `${label} (${this.hints + 1} de ${c.hints.length})` });
      more.addEventListener("click", () => this.handlers.hint(c.id));
    }
    const list = shown.length ? el("ol", { class: "lv-hints__list" }, ...shown.map((h, i) => el("li", { "data-hint": String(i + 1) }, ...richText(h)))) : null;
    this.hintsEl.replaceChildren(...[el("h3", { class: "lv-ch__sub", text: "Dicas" }), list, more].filter(Boolean));
    if (hadFocus) more?.focus();
  }
}
