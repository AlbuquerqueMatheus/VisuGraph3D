// src/classes/EditorManager.js
// Editor de código do modo 3D (CodeMirror 5 empacotado pelo Vite, sem CDN).
import CodeMirror from "codemirror5";
import "codemirror5/mode/javascript/javascript.js";
import "codemirror5/lib/codemirror.css";
import "codemirror5/theme/dracula.css";

export class EditorManager {
  constructor(selectorOrEl, { theme = "dracula", language = "javascript" } = {}) {
    const root = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!root) throw new Error("Editor root não encontrado.");
    this.root = root;

    this.textarea = document.createElement("textarea");
    this.root.appendChild(this.textarea);

    this.cm = CodeMirror.fromTextArea(this.textarea, {
      mode: language,
      theme,
      lineNumbers: true,
      tabSize: 2,
      lineWrapping: true,
    });
    // O tamanho vem do CSS de #code-editor; o editor só preenche o contêiner.
    this.cm.setSize("100%", "100%");
  }

  setValue(s) {
    this.cm.setValue(s);
  }

  getValue() {
    return this.cm.getValue();
  }

  /** Recalcula o layout depois que o painel deixa de estar oculto. */
  refresh() {
    this.cm.refresh();
  }
}
