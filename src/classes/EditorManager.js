// src/classes/EditorManager.js
// Aceita seletor string ou elemento; funciona com CodeMirror via CDN, com fallback.
export class EditorManager {
  constructor(selectorOrEl, { theme = "dracula", language = "javascript" } = {}) {
    const root = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!root) throw new Error("Editor root não encontrado.");
    this.root = root;

    this.textarea = document.createElement("textarea");
    this.root.appendChild(this.textarea);

    if (window.CodeMirror) {
      this.cm = window.CodeMirror.fromTextArea(this.textarea, {
        mode: language,
        theme,
        lineNumbers: true,
        tabSize: 2,
        lineWrapping: true,
      });
      this.cm.setSize("480px", "280px");
    } else {
      // fallback simples
      Object.assign(this.textarea.style, {
        width: "480px",
        height: "280px",
        background: "#111",
        color: "#eee",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "13px",
      });
    }
  }
  setValue(s) { this.cm ? this.cm.setValue(s) : (this.textarea.value = s); }
  getValue()  { return this.cm ? this.cm.getValue() : this.textarea.value; }
}
