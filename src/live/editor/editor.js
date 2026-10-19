// editor.js — o editor de código (CodeMirror 6) do modo 3D.
//
// Além do básico (números de linha, histórico, busca, autocompletar), ele destaca as
// linhas do objeto selecionado, deixa arrastar números com o mouse, explica o código
// ao passar o mouse e mostra os erros da análise e da execução.

import { EditorView, basicSetup } from "codemirror";
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, ViewPlugin, hoverTooltip, keymap } from "@codemirror/view";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { CLASSES, VALUE_CLASSES, classInfo, isObject3DKind } from "../engine/catalog.js";
import { planNumber, scrubInfo } from "../engine/patch.js";
import { explain } from "../explain.js";

/** Marca transações que vieram da cena (gizmo, painel) ou do arraste de números. */
export const sceneEdit = Annotation.define();

const MONO = 'ui-monospace, SFMono-Regular, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace';

const theme = EditorView.theme(
  {
    "&": { color: "#e6e9ef", backgroundColor: "#16181e", height: "100%", fontSize: "13.5px" },
    ".cm-scroller": { fontFamily: MONO, lineHeight: "1.6" },
    ".cm-content": { caretColor: "#41c5ff", padding: "8px 0" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#41c5ff", borderLeftWidth: "2px" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": { backgroundColor: "#1a1c23", color: "#5d6577", border: "none" },
    ".cm-activeLine": { backgroundColor: "#ffffff07" },
    ".cm-activeLineGutter": { backgroundColor: "#ffffff0d", color: "#9aa3b5" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#41c5ff38" },
    ".cm-selectionMatch": { backgroundColor: "#41c5ff1c" },
    ".cm-matchingBracket": { backgroundColor: "#41c5ff26", outline: "1px solid #41c5ff66" },
    ".cm-line.cm-vg-selected": { backgroundColor: "#ffc94d17", boxShadow: "inset 3px 0 #ffc94d" },
    ".cm-line.cm-vg-related": { backgroundColor: "#41c5ff10", boxShadow: "inset 3px 0 #41c5ff99" },
    ".cm-vg-number": { borderBottom: "1px dotted #f78c6c99", cursor: "ew-resize" },
    ".cm-tooltip": { backgroundColor: "#22252e", color: "#e6e9ef", border: "1px solid #343946", borderRadius: "6px" },
    ".cm-tooltip.cm-tooltip-hover": { maxWidth: "380px", padding: "8px 10px", fontFamily: "system-ui, sans-serif", fontSize: "13px" },
    ".cm-vg-tip-title": { fontFamily: MONO, color: "#ffcb6b", marginBottom: "4px", fontSize: "12.5px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#41c5ff33", color: "#fff" },
    ".cm-diagnostic": { fontFamily: "system-ui, sans-serif", padding: "6px 10px" },
    ".cm-panels": { backgroundColor: "#1a1c23", color: "#e6e9ef" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#c792ea" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#e6e9ef" },
  { tag: t.propertyName, color: "#82aaff" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#82aaff" },
  { tag: t.definition(t.variableName), color: "#f2f4f8" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#c3e88d" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#f78c6c" },
  { tag: t.comment, color: "#6f788b", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "#89ddff" },
  { tag: [t.className, t.typeName], color: "#ffcb6b" },
  { tag: t.invalid, color: "#ff5370" },
]);

// ---------------------------------------------------------------------------
// Linhas do objeto selecionado (forte) e do objeto sob o mouse (leve)

const setHighlight = StateEffect.define();

const highlightField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setHighlight)) deco = lineDecorations(tr.state.doc, e.value);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function lineDecorations(doc, { selected = [], related = [] }) {
  const lines = new Map();
  const mark = (ranges, cls) => {
    for (const r of ranges) {
      const from = Math.min(r.from, doc.length);
      const to = Math.min(Math.max(r.to - 1, r.from), doc.length);
      for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) lines.set(n, cls);
    }
  };
  mark(related, "cm-vg-related");
  mark(selected, "cm-vg-selected");
  const builder = new RangeSetBuilder();
  for (const n of [...lines.keys()].sort((a, b) => a - b)) {
    const line = doc.line(n);
    builder.add(line.from, line.from, Decoration.line({ class: lines.get(n) }));
  }
  return builder.finish();
}

// ---------------------------------------------------------------------------
// Números editáveis sublinhados e arrastáveis

const numberMark = Decoration.mark({ class: "cm-vg-number" });
const setNumbers = StateEffect.define();
const numbersField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setNumbers)) deco = e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function numberDecorations(analysis) {
  const builder = new RangeSetBuilder();
  for (const n of analysis.numbers) if (n.slot) builder.add(n.from, n.to, numberMark);
  return builder.finish();
}

const PIXELS_PER_STEP = 4;

/** O número do código que está exatamente sob o mouse. */
function numberAt(view, analysis, x, y) {
  const pos = view.posAtCoords({ x, y });
  if (pos == null) return null;
  const number = analysis.numbers.find((n) => n.from <= pos && pos <= n.to);
  if (!number) return null;
  const start = view.coordsAtPos(number.from, 1);
  const end = view.coordsAtPos(number.to, -1);
  return start && end && x >= start.left && x <= end.right && y >= start.top && y <= end.bottom ? number : null;
}

function scrubPlugin(host) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.drag = null;
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);
      }

      start(event) {
        const view = this.view;
        if (event.button !== 0 || event.ctrlKey || event.metaKey) return false;
        const analysis = host.analysis();
        if (!analysis || !analysis.ok || analysis.code.length !== view.state.doc.length) return false;
        const number = numberAt(view, analysis, event.clientX, event.clientY);
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const info = number && scrubInfo(analysis, number);
        if (!info) return false;
        this.drag = { number, info, x: event.clientX, from: number.from, to: number.to, pos, moved: false, value: number.value };
        window.addEventListener("mousemove", this.onMove);
        window.addEventListener("mouseup", this.onUp);
        event.preventDefault();
        return true;
      }

      onMove(event) {
        const d = this.drag;
        if (!d) return;
        const dx = event.clientX - d.x;
        if (!d.moved && Math.abs(dx) < PIXELS_PER_STEP) return;
        if (!d.moved) {
          d.moved = true;
          document.body.classList.add("vg-scrubbing");
        }
        const mult = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
        const decimals = event.altKey ? d.info.decimals + 1 : d.info.decimals;
        let value = d.number.value + Math.round(dx / PIXELS_PER_STEP) * d.info.step * mult;
        if (d.info.min != null) value = Math.max(d.info.min, value);
        if (d.info.max != null) value = Math.min(d.info.max, value);
        const change = planNumber({ ...d.number, from: d.from, to: d.to }, value, decimals);
        if (this.view.state.sliceDoc(d.from, d.to) === change.insert) return;
        this.view.dispatch({ changes: change, annotations: sceneEdit.of("scrub"), userEvent: "input.scrub" });
        d.to = d.from + change.insert.length;
        d.value = value;
        host.onScrub?.(d.number, value);
      }

      onUp() {
        const d = this.drag;
        this.drag = null;
        window.removeEventListener("mousemove", this.onMove);
        window.removeEventListener("mouseup", this.onUp);
        document.body.classList.remove("vg-scrubbing");
        if (!d) return;
        if (d.moved) host.onScrubEnd?.();
        else {
          this.view.dispatch({ selection: { anchor: d.pos } });
          this.view.focus();
        }
      }

      destroy() {
        this.onUp();
      }
    },
    {
      eventHandlers: {
        mousedown(event) {
          return this.start(event);
        },
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Mouse sobre o código → destaque na cena

function hoverPlugin(host) {
  let queued = null;
  return EditorView.domEventHandlers({
    mousemove(event, view) {
      if (queued) {
        queued.event = event;
        return false;
      }
      queued = { event };
      requestAnimationFrame(() => {
        const e = queued.event;
        queued = null;
        host.onHoverPos?.(view.posAtCoords({ x: e.clientX, y: e.clientY }, false));
      });
      return false;
    },
    mouseleave() {
      host.onHoverPos?.(null);
      return false;
    },
  });
}

// ---------------------------------------------------------------------------
// Autocompletar THREE.X e propriedades dos objetos

const THREE_NAMES = [
  ...Object.keys(CLASSES), ...VALUE_CLASSES, "MathUtils", "DoubleSide", "FrontSide", "BackSide",
].sort();

const OBJECT_MEMBERS = ["position", "rotation", "scale", "visible", "castShadow", "receiveShadow", "add", "remove", "lookAt", "name"];
const VECTOR_MEMBERS = ["x", "y", "z", "set"];

function completions(host) {
  return (context) => {
    const three = context.matchBefore(/THREE\.\w*/);
    if (three) {
      return { from: three.from + 6, options: THREE_NAMES.map((label) => ({ label, type: "class" })), validFor: /^\w*$/ };
    }
    const member = context.matchBefore(/[\w$]+(?:\.[\w$]+)?\.\w*/);
    const analysis = host.analysis();
    if (!member || !analysis || !analysis.ok) return null;
    const parts = member.text.split(".");
    const obj = analysis.objects.find((o) => o.name === parts[0]);
    if (!obj) return null;
    let labels = [];
    if (parts.length === 3) {
      if (["position", "rotation", "scale"].includes(parts[1])) labels = VECTOR_MEMBERS;
      else if (parts[1] === "material" || parts[1] === "geometry") {
        const linked = obj.links[parts[1]] != null ? analysis.objects[obj.links[parts[1]]] : null;
        labels = linked ? Object.keys(classInfo(linked.className).props || {}) : [];
      }
    } else {
      if (isObject3DKind(obj.kind)) labels = [...OBJECT_MEMBERS];
      if (obj.kind === "mesh") labels.push("material", "geometry");
      labels.push(...Object.keys(classInfo(obj.className).props || {}));
    }
    if (!labels.length) return null;
    const from = member.from + member.text.lastIndexOf(".") + 1;
    return { from, options: [...new Set(labels)].map((label) => ({ label, type: "property" })), validFor: /^\w*$/ };
  };
}

// ---------------------------------------------------------------------------

/**
 * Cria o editor. `host` fornece analysis() (análise do texto atual) e recebe os eventos:
 * onChange(update), onCursor(pos), onHoverPos(pos), onScrub(number, value), onScrubEnd(), onRun().
 */
export function createEditor(parent, doc, host) {
  const runKey = () => {
    host.onRun?.();
    return true;
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        javascript(),
        javascriptLanguage.data.of({ autocomplete: completions(host) }),
        theme,
        EditorView.lineWrapping,
        syntaxHighlighting(highlight),
        lintGutter(),
        highlightField,
        numbersField,
        scrubPlugin(host),
        hoverPlugin(host),
        hoverTooltip((view, pos) => {
          const analysis = host.analysis();
          const info = analysis && analysis.code.length === view.state.doc.length ? explain(analysis, pos) : null;
          if (!info) return null;
          return {
            pos: info.from,
            end: info.to,
            above: true,
            create() {
              const dom = document.createElement("div");
              const title = dom.appendChild(document.createElement("div"));
              title.className = "cm-vg-tip-title";
              title.textContent = info.title;
              dom.appendChild(document.createElement("div")).textContent = info.text;
              return { dom };
            },
          };
        }),
        keymap.of([
          { key: "Mod-Enter", run: runKey },
          { key: "Mod-s", run: runKey, preventDefault: true },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) host.onChange?.(update);
          if (update.selectionSet && !update.docChanged) host.onCursor?.(update.state.selection.main.head);
        }),
        EditorView.contentAttributes.of({ "aria-label": "Código da cena", spellcheck: "false" }),
      ],
    }),
  });
  return view;
}

/** Destaca as linhas do objeto selecionado e as do objeto sob o mouse. */
export function showHighlight(view, selected, related) {
  view.dispatch({ effects: setHighlight.of({ selected, related }) });
}

/** Atualiza sublinhado dos números editáveis e a lista de erros. */
export function showAnalysis(view, analysis, diagnostics) {
  const doc = view.state.doc;
  const valid = diagnostics
    .filter((d) => d.from <= doc.length)
    .map((d) => ({ ...d, to: Math.min(Math.max(d.to, d.from), doc.length) }));
  view.dispatch(setDiagnostics(view.state, valid), {
    effects: setNumbers.of(analysis.ok && analysis.code.length === doc.length ? numberDecorations(analysis) : Decoration.none),
  });
}

/** Rola até a posição e coloca o cursor nela. */
export function revealPosition(view, pos, focus = false) {
  view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  if (focus) view.focus();
}
