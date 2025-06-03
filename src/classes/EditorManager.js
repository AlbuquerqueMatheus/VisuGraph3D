// src/classes/EditorManager.js

export class EditorManager {
  /**
   * @param {HTMLElement} editorContainer (div onde o CodeMirror ficará)
   * @param {HTMLButtonElement} toggleBtn
   * @param {HTMLButtonElement} generateCodeBtn
   */
  constructor(editorContainer, toggleBtn, generateCodeBtn) {
    // Inicializa o CodeMirror
    this.codeEditor = CodeMirror(editorContainer, {
      mode: "javascript",
      theme: "dracula",
      lineNumbers: true,
    });
    this.toggleBtn = toggleBtn;
    this.generateCodeBtn = generateCodeBtn;
    this.editorContainer = editorContainer;

    this._setupToggle();
  }

  _setupToggle() {
    this.toggleBtn.addEventListener("click", () => {
      const hidden = this.editorContainer.classList.contains("hidden");
      if (hidden) {
        this.editorContainer.classList.remove("hidden");
        this.generateCodeBtn.classList.remove("hidden");
        this.toggleBtn.textContent = "Esconder Editor";
      } else {
        this.editorContainer.classList.add("hidden");
        this.generateCodeBtn.classList.add("hidden");
        this.toggleBtn.textContent = "Mostrar Editor";
      }
    });
  }

  getEditorInstance() {
    return this.codeEditor;
  }
}
