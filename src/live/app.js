// app.js — o modo 3D com código vivo: liga o editor, o visor e o painel de propriedades.
//
// O código é a única fonte da verdade. Toda edição no visor ou no painel vira uma edição
// no texto; o texto é analisado a cada mudança e roda de novo no visor. Durante um arraste
// o visor já mostra o resultado, então o código é atualizado sem rodar; ao soltar, ele roda
// uma vez para confirmar que a cena é exatamente o que o código diz.

import { analyze, hasBlockingError } from "./engine/analyze.js";
import { instrument } from "./engine/instrument.js";
import { editableAxes, planEdit, planTransform } from "./engine/patch.js";
import { ADD_ITEMS, STARTER_CODE, planAddObject } from "./engine/snippets.js";
import { translateError } from "./engine/errors.js";
import { degToRad } from "./engine/format.js";
import { createEditor, revealPosition, sceneEdit, showAnalysis, showHighlight } from "./editor/editor.js";
import { Inspector } from "./inspector.js";
import { ViewportBridge } from "./bridge.js";
import { exportHtml } from "./export.js";

const STORAGE_KEY = "visugraph.codigo.v1";
const RUNNING_KEY = "visugraph.rodando"; // presente enquanto um código roda: se a página travar, fica lá
const TYPING_DELAY_MS = 300;
const LIVE_RUN_MS = 80;

const $ = (sel) => document.querySelector(sel);

const state = {
  analysis: null, // análise do texto atual do editor
  screen: null, // análise da última execução que deu certo (o que está no visor)
  runs: new Map(), // runId → { analysis, toOriginal, failed }
  runId: 0,
  selectedKey: null, // objeto selecionado, por uma chave que sobrevive a edições
  hoverId: null, // objeto sob o mouse no visor
  codeHoverId: null, // objeto sob o mouse ou o cursor no código
  runtimeDiagnostics: [],
  runtimeValues: {},
  playing: true,
  hasAnimar: false,
  hasCodeCamera: false,
  view: "editor",
  stuckCode: null, // código que travou o visor: só roda de novo se mudar (ou com ↻)
  firstRunDone: false,
  runTimer: null,
  liveTimer: null,
  liveDirty: false,
};

// ---------------------------------------------------------------------------
// Identidade dos objetos entre análises: ids são a ordem no código e mudam quando
// um objeto é criado antes; a chave (nome, ou classe e posição) continua igual.

const keyCache = new WeakMap();

function keysOf(analysis) {
  let keys = keyCache.get(analysis);
  if (keys) return keys;
  const byId = new Map();
  const seen = new Map();
  const next = (base) => {
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  };
  for (const o of analysis.objects) if (o.name) byId.set(o.id, next(`n:${o.name}`));
  for (const o of analysis.objects) if (!o.name && o.owner == null) byId.set(o.id, next(`c:${o.className}`));
  for (const o of analysis.objects) {
    if (o.name || o.owner == null) continue;
    const owner = analysis.objects[o.owner];
    byId.set(o.id, `${byId.get(owner.id)}>${owner.links.geometry === o.id ? "geometry" : "material"}`);
  }
  keys = { byId, byKey: new Map([...byId].map(([id, key]) => [key, id])) };
  keyCache.set(analysis, keys);
  return keys;
}

function mapId(from, to, id) {
  if (id == null || !from || !to) return null;
  if (from === to) return id;
  const key = keysOf(from).byId.get(id);
  return key == null ? null : keysOf(to).byKey.get(key) ?? null;
}

const toScreen = (id) => mapId(state.analysis, state.screen, id);
const fromScreen = (id) => mapId(state.screen, state.analysis, id);

function selectedId() {
  if (state.selectedKey == null || !state.analysis.ok) return null;
  return keysOf(state.analysis).byKey.get(state.selectedKey) ?? null;
}

// ---------------------------------------------------------------------------
// Guardar o código no navegador

let startedAfterCrash = false;

function loadCode() {
  try {
    startedAfterCrash = localStorage.getItem(RUNNING_KEY) != null;
    localStorage.removeItem(RUNNING_KEY);
    return localStorage.getItem(STORAGE_KEY) ?? STARTER_CODE;
  } catch {
    return STARTER_CODE;
  }
}

let saveTimer = null;
function saveSoon(code) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(code), 400);
}
function save(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // modo privado ou armazenamento cheio: o código continua no editor
  }
}
window.addEventListener("pagehide", () => {
  clearTimeout(saveTimer);
  save(view.state.doc.toString());
});

// ---------------------------------------------------------------------------
// Editor

const view = createEditor($("#lv-editor"), loadCode(), {
  analysis: () => state.analysis,
  onChange,
  onCursor: (pos) => setCodeHover(objectAt(pos)),
  onHoverPos: (pos) => setCodeHover(pos == null ? objectAt(view.state.selection.main.head) : objectAt(pos)),
  onScrub,
  onScrubEnd: () => runNow(),
  onRun: () => runNow({ force: true }),
});

state.analysis = analyze(view.state.doc.toString());

function onChange(update) {
  const code = update.state.doc.toString();
  state.analysis = analyze(code);
  state.runtimeDiagnostics = [];
  saveSoon(code);
  queueMicrotask(refreshEditor);
  inspector.update(state.analysis, selectedId(), runtimeForCurrent());
  const kind = update.transactions.map((tr) => tr.annotation(sceneEdit)).find(Boolean);
  if (kind === "cena") return; // quem editou decide quando rodar
  if (kind === "scrub") return liveRun();
  if (hasBlockingError(state.analysis)) {
    clearTimeout(state.runTimer);
    showBlockingError();
    return;
  }
  clearTimeout(state.runTimer);
  state.runTimer = setTimeout(() => runNow(), TYPING_DELAY_MS);
}

function refreshEditor() {
  const a = state.analysis;
  showAnalysis(view, a, [...a.diagnostics, ...state.runtimeDiagnostics]);
  const sel = selectedId();
  const selected = sel != null ? a.objects[sel].ranges : [];
  const hover = state.hoverId != null && state.hoverId !== sel && a.objects[state.hoverId] ? a.objects[state.hoverId].ranges : [];
  showHighlight(view, selected, hover);
}

/** Objeto (da cena) cujo trecho de código contém a posição. */
function objectAt(pos) {
  const a = state.analysis;
  if (pos == null || !a.ok) return null;
  const hit = a.intervals.find((i) => i.from <= pos && pos <= i.to);
  return hit ? hit.ids[0] : null;
}

function setCodeHover(id) {
  if (id === state.codeHoverId) return;
  state.codeHoverId = id;
  bridge.send({ type: "highlight", id: toScreen(id) });
}

function onScrub(number, value) {
  const slot = number.slot;
  const obj = slot && state.analysis.objects[slot.id];
  if (!slot || !obj || obj.kind === "geometry") return; // o código já mudou; liveRun cuida
  const v = slot.unit === "deg" ? degToRad(value) : value;
  bridge.send({ type: "apply", id: toScreen(slot.id), key: slot.key, value: v });
}

// ---------------------------------------------------------------------------
// Rodar o código no visor

function runNow({ force = false, resetTime = false } = {}) {
  clearTimeout(state.runTimer);
  const analysis = state.analysis;
  if (hasBlockingError(analysis)) {
    showBlockingError();
    return;
  }
  if (!force && state.stuckCode === analysis.code) return;
  state.stuckCode = null;
  sendRun(analysis, resetTime);
}

function sendRun(analysis, resetTime = false) {
  const { script, toOriginal } = instrument(analysis);
  const runId = ++state.runId;
  state.runs.set(runId, { analysis, toOriginal, failed: false });
  for (const id of state.runs.keys()) if (id < runId - 20) state.runs.delete(id);
  state.runtimeDiagnostics = [];
  markRunning(analysis.code);
  bridge.run({ runId, script, sceneId: analysis.scene?.id ?? null, cameraId: analysis.camera?.id ?? null, resetTime });
}

/** Execuções seguidas durante um arraste: no máximo uma a cada LIVE_RUN_MS. */
function liveRun() {
  if (state.liveTimer) {
    state.liveDirty = true;
    return;
  }
  runNow();
  state.liveTimer = setTimeout(() => {
    state.liveTimer = null;
    if (state.liveDirty) {
      state.liveDirty = false;
      liveRun();
    }
  }, LIVE_RUN_MS);
}

const bridge = new ViewportBridge($("#lv-viewport"), {
  onMessage,
  onHang(ms) {
    state.stuckCode = state.runs.get(state.runId)?.analysis.code ?? null;
    clearRunning();
    setStatus("error", `O código passou de ${Math.round(ms / 1000)} s sem terminar e o visor foi reiniciado. Confira se algum laço nunca termina.`);
  },
});

function onMessage(msg) {
  switch (msg.type) {
    case "ready":
      if (!state.firstRunDone) {
        state.firstRunDone = true;
        if (startedAfterCrash) {
          state.stuckCode = state.analysis.code;
          setStatus("error", "Da última vez, este código travou a página e por isso não foi rodado. Confira os laços e clique em ↻ Rodar.");
        } else runNow();
      } else if (state.screen) {
        // o visor foi reiniciado: mostra de novo a última cena que funcionou
        sendRun(state.screen);
      }
      break;
    case "ran":
      onRan(msg);
      break;
    case "error":
      onRuntimeError(msg);
      break;
    case "pick":
      select(fromScreen(msg.id), { reveal: true });
      break;
    case "hover":
      state.hoverId = fromScreen(msg.id);
      refreshEditor();
      break;
    case "transform":
      onTransform(msg);
      break;
    case "inspect": {
      const values = {};
      for (const [screenId, v] of Object.entries(msg.values || {})) {
        const id = fromScreen(Number(screenId));
        if (id != null && v) values[id] = v;
      }
      state.runtimeValues = values;
      inspector.setRuntime(values);
      break;
    }
    case "mode":
      setMode(msg.mode, false);
      break;
  }
}

function onRan(msg) {
  const run = state.runs.get(msg.runId);
  if (!run) return;
  if (msg.runId === state.runId) clearRunning();
  if (!msg.ok) return;
  state.screen = run.analysis;
  state.hasAnimar = msg.hasAnimar;
  state.hasCodeCamera = msg.hasCodeCamera;
  updateToolbar();
  if (!run.failed && msg.runId === state.runId) {
    const count = run.analysis.objects.filter((o) => o.kind === "mesh" || o.kind === "light").length;
    setStatus("ok", `Cena atualizada · ${count} ${count === 1 ? "objeto" : "objetos"}${msg.hasAnimar ? " · animar() rodando" : ""}`);
  }
  sendSelection();
  requestInspect();
}

function onRuntimeError(msg) {
  const run = state.runs.get(msg.runId);
  if (!run) return;
  run.failed = true;
  let pos = msg.line != null ? run.toOriginal(msg.line, msg.column ?? 0) : null;
  const where = { animar: "Em animar() (a animação parou): ", timer: "Num temporizador: ", evento: "Num evento: ", async: "Numa função async: " };
  const text = (where[msg.phase] || "") + translateError(msg.name, msg.message);
  if (pos && run.analysis.code === state.analysis.code) {
    const a = state.analysis;
    let from = pos.offset;
    if (msg.loop) {
      const loop = a.loops.filter((l) => l.bodyFrom <= from && from <= l.bodyTo).sort((x, y) => y.bodyFrom - x.bodyFrom)[0];
      if (loop) from = loop.from;
    }
    const line = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
    pos = { ...pos, line: line.number, offset: from };
    state.runtimeDiagnostics = [{ from, to: Math.max(line.to, from + 1), severity: "error", message: text, source: "execução" }];
    refreshEditor();
  }
  setStatus("error", pos ? `Linha ${pos.line}: ${text}` : text, pos ? pos.offset : null);
}

function showBlockingError() {
  const d = state.analysis.diagnostics.find((x) => x.severity === "error");
  if (!d) return;
  const line = view.state.doc.lineAt(Math.min(d.from, view.state.doc.length)).number;
  setStatus("error", `Linha ${line}: ${d.message}`, d.from);
}

function markRunning(code) {
  try {
    localStorage.setItem(RUNNING_KEY, String(code.length));
  } catch {
    // sem armazenamento: só não dá para detectar travamentos ao recarregar
  }
}

function clearRunning() {
  try {
    localStorage.removeItem(RUNNING_KEY);
  } catch {
    // idem
  }
}

// ---------------------------------------------------------------------------
// Seleção

function select(id, { reveal = false } = {}) {
  state.selectedKey = id == null ? null : keysOf(state.analysis).byId.get(id) ?? null;
  refreshEditor();
  inspector.update(state.analysis, selectedId(), runtimeForCurrent());
  sendSelection();
  requestInspect();
  const obj = id != null ? state.analysis.objects[id] : null;
  if (reveal && obj) revealPosition(view, obj.ranges[0]?.from ?? obj.from);
}

function sendSelection() {
  const id = selectedId();
  const a = state.analysis;
  const axes = id == null ? {} : Object.fromEntries(["position", "rotation", "scale"].map((p) => [p, editableAxes(a, id, p)]));
  bridge.send({ type: "select", id: toScreen(id), axes });
}

function requestInspect() {
  const id = selectedId();
  if (id == null) return;
  const obj = state.analysis.objects[id];
  const ids = [id, obj.links.geometry, obj.links.material].filter((x) => x != null).map(toScreen).filter((x) => x != null);
  if (ids.length) bridge.send({ type: "inspect", ids });
}

function runtimeForCurrent() {
  return state.runtimeValues;
}

// Valores animados mudam sozinhos: o painel lê de novo enquanto a animação roda.
setInterval(() => {
  if (state.playing && state.hasAnimar && selectedId() != null && document.visibilityState === "visible") requestInspect();
}, 300);

// ---------------------------------------------------------------------------
// Edições vindas da cena e do painel

function applyPlan(plan) {
  if (plan.changes.length) {
    view.dispatch({ changes: plan.changes, annotations: sceneEdit.of("cena"), userEvent: "input.cena" });
  }
  if (plan.errors.length) setStatus("warn", plan.errors[0].message);
  return plan.errors.length === 0;
}

function onTransform(msg) {
  const id = fromScreen(msg.id);
  if (id == null) return;
  applyPlan(planTransform(state.analysis, id, msg.prop, msg.values, msg.start));
  if (msg.final) runNow();
}

function onInspectorEdit(id, key, value, phase) {
  const ok = applyPlan(planEdit(state.analysis, id, key, value, { current: (oid, k) => state.runtimeValues[oid]?.[k] }));
  if (!ok) return;
  if (phase === "commit") {
    runNow();
    return;
  }
  const obj = state.analysis.objects[id];
  if (obj && obj.kind === "geometry") liveRun();
  else bridge.send({ type: "apply", id: toScreen(id), key, value });
}

const inspector = new Inspector(
  { list: $("#lv-objects"), panel: $("#lv-props") },
  {
    select: (id) => select(id, { reveal: true }),
    edit: onInspectorEdit,
    reveal: (pos) => revealPosition(view, pos, true),
  },
);
inspector.update(state.analysis, null);

// ---------------------------------------------------------------------------
// Barra de ferramentas

const addList = $("#lv-add-list");
for (const item of ADD_ITEMS) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "menuitem";
  button.dataset.kind = item.kind;
  button.textContent = item.label;
  button.addEventListener("click", () => {
    $("#lv-add").open = false;
    const plan = planAddObject(state.analysis, item.kind);
    if (plan.error) {
      setStatus("warn", plan.error);
      return;
    }
    state.selectedKey = `n:${plan.name}#0`;
    view.dispatch({ changes: plan.changes, userEvent: "input.cena" });
    runNow();
    const obj = state.analysis.objects[selectedId()];
    if (obj) revealPosition(view, obj.from);
    refreshEditor();
  });
  addList.append(button);
}

function setMode(mode, notify = true) {
  for (const b of document.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  if (notify) bridge.send({ type: "mode", mode });
}
for (const b of document.querySelectorAll("[data-mode]")) b.addEventListener("click", () => setMode(b.dataset.mode));

$("#lv-view").addEventListener("click", () => {
  state.view = state.view === "editor" ? "camera" : "editor";
  bridge.send({ type: "view", view: state.view });
  updateToolbar();
});

$("#lv-play").addEventListener("click", () => {
  state.playing = !state.playing;
  bridge.send({ type: "play", playing: state.playing });
  updateToolbar();
});

$("#lv-restart").addEventListener("click", () => runNow({ force: true, resetTime: true }));

$("#lv-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(view.state.doc.toString());
    setStatus("ok", "Código copiado.");
  } catch {
    setStatus("warn", "O navegador não deixou copiar: selecione o código e use Ctrl+C.");
  }
});

$("#lv-download").addEventListener("click", () => {
  const result = exportHtml(state.analysis);
  if (result.error) {
    setStatus("warn", result.error);
    return;
  }
  const url = URL.createObjectURL(new Blob([result.html], { type: "text/html" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "cena-visugraph.html" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("ok", "Página baixada: abra cena-visugraph.html no navegador (precisa de internet para carregar o Three.js).");
});

$("#lv-reset").addEventListener("click", () => {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: STARTER_CODE }, userEvent: "input.cena" });
  state.selectedKey = null;
  runNow({ force: true, resetTime: true });
  setStatus("ok", "Exemplo restaurado. Ctrl+Z desfaz.");
});

function updateToolbar() {
  const viewButton = $("#lv-view");
  viewButton.disabled = !state.hasCodeCamera;
  viewButton.setAttribute("aria-pressed", String(state.view === "camera"));
  viewButton.title = state.hasCodeCamera ? "Ver a cena pela câmera criada no código" : "Crie uma câmera no código para usar esta vista";
  const play = $("#lv-play");
  play.disabled = !state.hasAnimar;
  play.setAttribute("aria-pressed", String(state.playing));
  play.textContent = state.playing ? "⏸ Pausar" : "▶ Animar";
  play.title = state.hasAnimar ? "Pausar ou continuar a função animar()" : "Escreva function animar(tempo) { … } para animar a cena";
}
updateToolbar();

// ---------------------------------------------------------------------------
// Barra de status

const statusEl = $("#lv-status");
const statusText = $("#lv-status-text");

function setStatus(kind, text, pos = null) {
  statusEl.dataset.kind = kind;
  statusText.replaceChildren(text);
  if (pos != null) {
    const go = document.createElement("button");
    go.type = "button";
    go.className = "lv-link";
    go.textContent = "ir para o código";
    go.addEventListener("click", () => revealPosition(view, pos, true));
    statusText.append(" ", go);
  }
}

queueMicrotask(refreshEditor);
if (hasBlockingError(state.analysis)) showBlockingError();
else setStatus("info", "Carregando o visor…");
