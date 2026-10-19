// navigation.js — os laboratórios da página (um por vez, pelo endereço), a barra comum e os modais
import { labById, topicOfLab } from "./topics.js";
import { mountTopicBar } from "./topicbar.js";

// ============================== Utils ==============================
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  // ======================= Laboratórios =======================
  // Cada laboratório tem endereço próprio (index-2d.html#cores): a tela inicial, a barra comum
  // e as trilhas do código vivo apontam direto para ele. Trocar o endereço troca o laboratório.
  const sections = {
    coordenadas: $("#coords-section"),
    cores: $("#color-system-section"),
    phong: $("#phong-section"),
    curvas: $("#curves-section"),
  };
  const bar = mountTopicBar($("#vg-nav"));

  function showSection(lab) {
    Object.values(sections).forEach(hide);
    show(sections[lab]);
    if (location.hash !== `#${lab}`) history.replaceState(history.state, "", `#${lab}`);
    document.title = `${labById(lab).name} · VisuGraph`;
    bar.update({ step: "explorar", topic: topicOfLab(lab), lab });
  }

  const fromHash = () => {
    const lab = decodeURIComponent(location.hash.slice(1));
    return sections[lab] ? lab : null;
  };
  window.addEventListener("hashchange", () => {
    const lab = fromHash();
    if (lab) showSection(lab);
  });
  showSection(fromHash() ?? "coordenadas");

  // Um link para outro laboratório desta página (a barra comum) só troca o endereço, sem
  // recarregar: cada laboratório guarda o que o aluno fez nele. Vale também onde o servidor
  // tira o ".html" do endereço (index-2d em vez de index-2d.html).
  const samePage = (url) => url.origin === location.origin && url.pathname.replace(/\.html$/, "") === location.pathname.replace(/\.html$/, "");
  document.addEventListener("click", (e) => {
    const link = e.target.closest?.("a[href]");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(link.href);
    const lab = decodeURIComponent(url.hash.slice(1));
    if (!sections[lab] || !samePage(url)) return;
    e.preventDefault();
    location.hash = lab;
  });

  // ======================= Sistema de Modais =======================
  let openModals = 0;
  function lockBodyScroll() {
    openModals++;
    document.body.style.overflow = "hidden";
  }
  function unlockBodyScroll() {
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) document.body.style.overflow = "";
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!modal.classList.contains("hidden")) return; // já está aberto
    modal.setAttribute("aria-hidden", "false");
    show(modal);
    lockBodyScroll();

    // Garante que sempre exista uma aba ativa ao abrir
    const activeBtn = modal.querySelector(".tab-btn.active") || modal.querySelector(".tab-btn");
    if (activeBtn) {
      // ativa o respectivo painel
      const targetId = activeBtn.dataset.tab;
      modal.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      modal.querySelectorAll(".tab-content").forEach((p) => p.classList.remove("active"));
      activeBtn.classList.add("active");
      const panel = modal.querySelector("#" + targetId);
      if (panel) panel.classList.add("active");
    }
  }

  function closeModal(modal) {
    if (!modal || modal.classList.contains("hidden")) return;
    modal.setAttribute("aria-hidden", "true");
    hide(modal);
    unlockBodyScroll();
  }

  function closeAllModals() {
    $$(".modal:not(.hidden)").forEach((m) => closeModal(m));
  }

  // ---- Ligações dos Botões (Abrir) ----
  $("#btn-cores")?.addEventListener("click", () => openModal("modal-cores"));
  $("#btn-curves-help")?.addEventListener("click", () => openModal("modal-curves"));
  $("#btn-coords-help")?.addEventListener("click", () => openModal("modal-help"));
  $("#btn-phong-explain")?.addEventListener("click", () => openModal("modal-phong"));

  // ---- Fechar com ESC ----
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  // ---- Fechar ao clicar no backdrop (fora do conteúdo) ----
  document.addEventListener("click", (e) => {
    const modal = e.target.classList?.contains("modal") ? e.target : null;
    if (modal) closeModal(modal);
  });

  // ---- Botões de fechar (delegação) ----
  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".close-btn");
    if (closeBtn) closeAllModals();
  });

  // ======================= Abas universais para TODOS os modais =======================
  // Usa delegação de eventos: qualquer .tab-btn dentro de .modal
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;

    const modal = btn.closest(".modal");
    if (!modal) return; // ignora cliques fora de modais

    const tabBtns = modal.querySelectorAll(".tab-btn");
    const tabPanels = modal.querySelectorAll(".tab-content");
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const targetId = btn.dataset.tab;
    const panel = modal.querySelector("#" + targetId);
    if (panel) panel.classList.add("active");
  });

  window.openModal = openModal;
  window.closeAllModals = closeAllModals;
})();
