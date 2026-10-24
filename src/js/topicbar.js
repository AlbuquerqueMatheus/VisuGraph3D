// topicbar.js — a barra comum dos laboratórios e do código vivo: o tema aberto, que troca de
// tema, e Explorar | Programar, que alterna os dois passos do tema. Os laboratórios de um tema
// com mais de um (Luz e cor) aparecem ao lado, como abas.
import { FREE_EDITOR_URL, TOPICS, labUrl, trailUrl } from "./topics.js";

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

// Um tema leva ao passo em que a pessoa já está, se ele tiver esse passo; senão, ao outro
const topicHref = (topic, step) =>
  (step === "programar" && topic.trail) || !topic.labs.length ? trailUrl(topic.trail) : labUrl(topic.labs[0].id);

/** O passo aberto não é link; o que o tema ainda não tem aparece apagado, com o motivo. */
function stepLink(name, href, current, missing) {
  if (current) return el("span", { class: "vg-step", "aria-current": "page" }, name);
  if (href) return el("a", { class: "vg-step", href }, name);
  return el("span", { class: "vg-step", "aria-disabled": "true", title: missing }, name);
}

/**
 * Liga a barra ao `nav` da página. update({ step, topic, lab, label }) a redesenha a cada troca de
 * laboratório ou de desafio: step é "explorar" ou "programar", topic é null no editor livre e
 * num projeto do guia, que aparece pelo nome (label).
 * Na página do código vivo, onTopic(topic) abre a trilha sem recarregar (false segue o link)
 * e onFree() volta ao editor livre.
 */
export function mountTopicBar(nav, { onTopic, onFree } = {}) {
  const close = () => nav.querySelector(".vg-topic[open]")?.removeAttribute("open");
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".vg-topic")) close();
  });
  document.addEventListener("keydown", (e) => {
    const open = nav.querySelector(".vg-topic[open]");
    if (e.key !== "Escape" || !open) return;
    open.removeAttribute("open");
    open.querySelector("summary").focus();
  });

  function update({ step, topic = null, lab = null, label = null }) {
    const list = el("ul", { class: "vg-topic__list" });
    for (const t of TOPICS) {
      const link = el("a", { href: topicHref(t, step), "aria-current": t === topic ? "true" : null }, t.name);
      link.addEventListener("click", (e) => {
        close();
        // o tema aberto só fecha o menu; um outro segue o link, ou a página troca sozinha (onTopic)
        if (t === topic || (onTopic && onTopic(t) !== false)) e.preventDefault();
      });
      list.append(el("li", {}, link));
    }
    if (step === "programar") {
      const free = el("a", { href: FREE_EDITOR_URL, "aria-current": topic || label ? null : "true" }, "Editor livre, sem desafio");
      free.addEventListener("click", (e) => {
        close();
        if (onFree) {
          e.preventDefault();
          onFree();
        }
      });
      list.append(el("li", { class: "vg-topic__free" }, free));
    }
    const summary = el(
      "summary",
      { title: "Trocar de tema" },
      el("span", { class: "vg-topic__kicker" }, label && !topic ? "Projeto" : "Tema"),
      el("span", { class: "vg-topic__name" }, topic?.name ?? label ?? "Editor livre"),
    );
    const parts = [el("details", { class: "vg-topic" }, summary, list)];

    if (topic) {
      parts.push(
        el(
          "div",
          { class: "vg-steps", role: "group", "aria-label": "Passo do tema" },
          stepLink("Explorar", topic.labs.length ? labUrl(topic.labs[0].id) : null, step === "explorar", `${topic.name} ainda não tem laboratório`),
          stepLink("Programar", topic.trail ? trailUrl(topic.trail) : null, step === "programar", `${topic.name} ainda não tem desafios`),
        ),
      );
      if (step === "explorar" && topic.labs.length > 1) {
        const tabs = topic.labs.map((l) =>
          l.id === lab ? el("span", { "aria-current": "page" }, l.name) : el("a", { href: labUrl(l.id) }, l.name),
        );
        parts.push(el("div", { class: "vg-labs", role: "group", "aria-label": "Laboratórios do tema" }, ...tabs));
      }
    }
    nav.replaceChildren(...parts);
  }

  return { update };
}
