document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------
  // 1. NAVEGAÇÃO ENTRE TELAS: MENU / 2D / 3D
  // ---------------------------------------
  const menuScreen = document.getElementById("menu-screen");
  const screen3D = document.getElementById("screen-3d");
  const screen2D = document.getElementById("screen-2d");
  const btn3D = document.getElementById("btn-3d");
  const btn2D = document.getElementById("btn-2d");
  const backToMenu3D = document.getElementById("back-to-menu-3d");
  const generateCodeBtn = document.getElementById("generateCodeBtn");
  const codeEditor = document.getElementById("codeEditor");
  const toggleEditorBtn = document.getElementById("toggleEditorBtn");
  let isEditorVisible = false;

  function showScreen(screenToShow) {
    [menuScreen, screen3D, screen2D].forEach((screen) =>
      screen?.classList.add("hidden")
    );
    screenToShow?.classList.remove("hidden");

    if (screenToShow === screen3D && toggleEditorBtn) {
      toggleEditorBtn.classList.remove("hidden");
      document.getElementById("code-editor")?.classList.add("hidden");
      generateCodeBtn?.classList.add("hidden");
      toggleEditorBtn.textContent = "Mostrar Editor";
    }
  }

  btn3D?.addEventListener("click", () => showScreen(screen3D));
  btn2D?.addEventListener("click", () => showScreen(screen2D));
  backToMenu3D?.addEventListener("click", () => showScreen(menuScreen));

  // Esse botão redireciona para index.html (página principal)
  document.getElementById("back-to-menu-2d")?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  toggleEditorBtn?.addEventListener("click", () => {
    isEditorVisible = !isEditorVisible;
    generateCodeBtn?.classList.toggle("hidden", !isEditorVisible);
    codeEditor?.classList.toggle("hidden", !isEditorVisible);
  });

  // ---------------------------------------
  // 2. NAVEGAÇÃO ENTRE SEÇÕES 2D (curvas, cores, etc.)
  // ---------------------------------------
  const sections = document.querySelectorAll(".section");
  const navBtns = document.querySelectorAll(".nav-btn");

  navBtns.forEach((btn) => {
    // Evita que o botão "Voltar ao Menu" execute lógica de seções
    if (btn.id === "back-to-menu-2d") return;

    btn.addEventListener("click", () => {
      sections.forEach((s) => s.classList.add("hidden"));

      const targetId =
        btn.id === "color-system-btn"
          ? "color-system-section"
          : btn.id === "btn-phong"
          ? "phong-section"
          : btn.id === "btn-curvas"
          ? "curves-section"
          : "coords-section";

      document.getElementById(targetId)?.classList.remove("hidden");

      if (targetId === "curves-section" && window.curvasApp?.clearCanvas) {
        window.curvasApp.clearCanvas();
      }

      navBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // ---------------------------------------
  // 3. MODAIS E ABAS DE AJUDA
  // ---------------------------------------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      document.getElementById(tabId)?.classList.add("active");
    });
  });

  document.querySelectorAll(".modal .close-btn").forEach((b) => {
    b.addEventListener("click", () => {
      b.closest(".modal")?.classList.add("hidden");
    });
  });

  document.getElementById("btn-cores")?.addEventListener("click", () => {
    document.getElementById("modal-cores")?.classList.remove("hidden");
  });

  document.getElementById("btn-ajuda")?.addEventListener("click", () => {
    document.getElementById("modal-help")?.classList.remove("hidden");
  });

  document
    .getElementById("btn-phong-explain")
    ?.addEventListener("click", () => {
      document.getElementById("modal-phong")?.classList.remove("hidden");
    });

  // ---------------------------------------
  // 4. INSTANCIAMENTO DE CurvasApp
  // ---------------------------------------
  if (typeof CurvasApp === "function") {
    window.curvasApp = new CurvasApp();
  } else {
    console.warn("CurvasApp não está disponível.");
  }
});
