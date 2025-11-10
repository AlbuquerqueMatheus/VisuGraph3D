// navigation.js — unifica navegação entre seções e abertura de modais (robusto)

// ============================== Utils ==============================
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  // ======================= Troca de Seções (Sidebar) =======================
  const sections = {
    coords: $("#coords-section"),
    colors: $("#color-system-section"),
    phong: $("#phong-section"),
    curves: $("#curves-section"),
  };

  function showSection(key) {
    Object.values(sections).forEach(hide);
    show(sections[key]);
    // marca botão ativo (opcional)
    const mapBtn = {
      coords: "#btn-coordenadas",
      colors: "#color-system-btn",
      phong: "#btn-phong",
      curves: "#btn-curvas",
    };
    $$(".nav-btn").forEach((b) => b.classList.remove("is-active"));
    const activeBtn = $(mapBtn[key]);
    if (activeBtn) activeBtn.classList.add("is-active");
  }

  $("#btn-coordenadas")?.addEventListener("click", () => showSection("coords"));
  $("#color-system-btn")?.addEventListener("click", () => showSection("colors"));
  $("#btn-phong")?.addEventListener("click", () => showSection("phong"));
  $("#btn-curvas")?.addEventListener("click", () => showSection("curves"));

  $("#back-to-menu-2d")?.addEventListener("click", () => {
    try {
      if (document.referrer) history.back();
      else location.href = "/";
    } catch {
      location.href = "/";
    }
  });

  // Se nenhuma seção estiver visível (por HTML/CSS), mostra a primeira existente
  if (!Object.values(sections).some((el) => el && !el.classList.contains("hidden"))) {
    const first = Object.keys(sections).find((k) => sections[k]);
    if (first) showSection(first);
  }

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
