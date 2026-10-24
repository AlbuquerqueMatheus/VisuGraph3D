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
import { createEditor, resetDoc, revealPosition, sceneEdit, showAnalysis, showHighlight, showMathLinks } from "./editor/editor.js";
import { isDrawableKind, isObject3DKind } from "./engine/catalog.js";
import { Inspector } from "./inspector.js";
import { MathPanel } from "./mathPanel.js";
import { CHALLENGES, challengeById, firstOpen, grade, nextChallenge, trailById, trailOf } from "./challenges.js";
import { PROGRESS_KEY, readProgress } from "./progress.js";
import { topicOfTrail } from "../js/topics.js";
import { mountTopicBar } from "../js/topicbar.js";
import { ChallengesPanel } from "./challengesPanel.js";
import { NO_STUDY, StudyLog, studyGroup } from "./study.js";
import { ViewportBridge } from "./bridge.js";
import { exportHtml } from "./export.js";

const STORAGE_KEY = "visugraph.codigo.v1";
const challengeKey = (id) => `visugraph.desafio.${id}.v1`; // o código de cada desafio
const RUNNING_KEY = "visugraph.rodando"; // presente enquanto um código roda: se a página travar, fica lá
const NEW_SESSION_KEY = "visugraph.estudo.nova"; // sessionStorage: "Nova sessão" recarregou a página
const TYPING_DELAY_MS = 300;
const LIVE_RUN_MS = 80;

const $ = (sel) => document.querySelector(sel);

// Modo de estudo (?estudo=controle|experimental): no grupo controle a cena não escreve no
// código e nada se acende entre os dois; o código continua rodando a cada mudança.
const group = studyGroup(location.search);
const study = group ? new StudyLog(group) : NO_STUDY;
const sync = group !== "controle";
const READ_ONLY = "No grupo controle do estudo, as mudanças são feitas pelo código.";
// uma sessão que começa agora é de outro aluno: sem o progresso e o código de quem usou antes
if (study.fresh) forgetStudent();
// "Nova sessão" recarrega a página, que volta com o aviso do código novo na barra de status
let newSession = false;
try {
  newSession = group != null && sessionStorage.getItem(NEW_SESSION_KEY) === study.code;
  sessionStorage.removeItem(NEW_SESSION_KEY);
} catch {
  // sem sessionStorage: a faixa mostra o código mesmo assim
}

/** Apaga o progresso nos desafios e o código guardado (o livre e o de cada desafio). */
function forgetStudent() {
  try {
    for (const c of CHALLENGES) localStorage.removeItem(challengeKey(c.id));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(RUNNING_KEY); // o código que travou também foi embora
  } catch {
    // sem armazenamento: não há o que apagar
  }
}

// Desafios: o que já foi feito e o desafio aberto. ?trilha=matriz|camera|phong (a tela inicial,
// a barra e os laboratórios) abre o primeiro desafio ainda não feito da trilha, ou continua no
// desafio aberto, se ele é dessa trilha e não foi feito: quem foi rever o laboratório volta para
// ele. ?desafio=<id> abre um desafio (o laboratório de cores leva ao da cor) e ?livre abre o
// editor sem desafio.
function loadProgress() {
  const { done, current } = readProgress();
  return { done: new Set(done.filter((id) => challengeById(id))), current: challengeById(current) };
}
const progress = loadProgress();
const asked = new URLSearchParams(location.search);
const challengeAsked = challengeById(asked.get("desafio"));
const trailAsked = challengeAsked ? null : trailById(asked.get("trilha"));
const freeAsked = !challengeAsked && !trailAsked && asked.has("livre");
const resumeAsked = trailAsked && progress.current && trailOf(progress.current.id) === trailAsked && !progress.done.has(progress.current.id);
if (challengeAsked || trailAsked || freeAsked) {
  // ao recarregar, vale o desafio que estava aberto, não o começo da trilha
  const url = new URL(location.href);
  url.searchParams.delete("desafio");
  url.searchParams.delete("trilha");
  url.searchParams.delete("livre");
  history.replaceState(history.state, "", url);
}

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
  tab: "props", // aba do painel da direita: props, math ou challenges
  glass: null, // caixa de vidro: null, "phong" ou "blinn"
  vertex: 0, // vértice que o painel Matemática acompanha
  probeSeq: null,
  challenge: challengeAsked ?? (trailAsked && !resumeAsked ? firstOpen(trailAsked, progress.done) : freeAsked ? null : progress.current), // desafio aberto: o editor tem o código dele
  challengeOpenedAt: Date.now(),
  hints: 0, // dicas mostradas no desafio aberto
  gradeKey: null, // verificações que passaram na última correção (o registro guarda só as mudanças)
  factsSeq: 0,
  liveApplied: false, // o visor tem valores que o código ainda não rodou (arraste no painel ou num número)
};

// Barra comum: o tema é a trilha do desafio aberto, e trocar de tema abre a trilha sem
// recarregar. No modo de estudo ela some, para a sessão registrada não sair do código vivo.
const topicBar = group
  ? null
  : mountTopicBar($("#vg-nav"), {
      onTopic: (topic) => {
        const trail = trailById(topic.trail);
        if (!trail) return false; // tema sem desafios: o link leva ao laboratório
        openChallenge(firstOpen(trail, progress.done), "barra");
        setTab("challenges");
      },
      onFree: () => openChallenge(null, "barra"),
    });
const showTopic = () => topicBar?.update({ step: "programar", topic: topicOfTrail(trailOf(state.challenge?.id)?.id) });
showTopic();

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

// Cada desafio guarda o próprio código; fora deles, o editor tem o código livre do aluno.
const codeKey = () => (state.challenge ? challengeKey(state.challenge.id) : STORAGE_KEY);
const starterCode = () => state.challenge?.starter ?? STARTER_CODE;

function loadCode() {
  try {
    startedAfterCrash = localStorage.getItem(RUNNING_KEY) != null;
    localStorage.removeItem(RUNNING_KEY);
  } catch {
    // sem armazenamento: começa do código inicial
  }
  return storedCode();
}

function storedCode() {
  try {
    return localStorage.getItem(codeKey()) ?? starterCode();
  } catch {
    return starterCode();
  }
}

let saveTimer = null;
function saveSoon(code) {
  clearTimeout(saveTimer);
  const key = codeKey(); // se o aluno trocar de desafio antes, o texto vai para o lugar certo
  saveTimer = setTimeout(() => save(code, key), 400);
}
function save(code, key = codeKey()) {
  try {
    localStorage.setItem(key, code);
  } catch {
    // modo privado ou armazenamento cheio: o código continua no editor
  }
}
let restarting = false; // "Nova sessão" já guardou o registro novo e apagou o código do aluno anterior
window.addEventListener("pagehide", () => {
  clearTimeout(saveTimer);
  if (restarting) return;
  save(view.state.doc.toString());
  study.save();
});
document.addEventListener("visibilitychange", () => {
  if (!restarting) study.log("visibilidade", { visivel: document.visibilityState === "visible" });
});

// ---------------------------------------------------------------------------
// Editor

const view = createEditor($("#lv-editor"), loadCode(), {
  analysis: () => state.analysis,
  onChange,
  onCursor: (pos) => setCodeHover(objectAt(pos)),
  onHoverPos: (pos) => {
    setCodeHover(pos == null ? objectAt(view.state.selection.main.head) : objectAt(pos));
    const slot = pos == null || !sync ? null : state.analysis.numbers.find((n) => n.from <= pos && pos <= n.to)?.slot;
    mathPanel.highlightKey(slot ? `${slot.id}:${slot.key}` : null);
  },
  onScrub,
  onScrubEnd: (number) => {
    study.log("arraste_numero", { chave: number?.slot?.key ?? null });
    runNow();
  },
  onRun: () => {
    study.log("rodar", { atalho: true });
    runNow({ force: true });
  },
  canScrub: () => sync,
});

state.analysis = analyze(view.state.doc.toString());

function onChange(update) {
  const code = update.state.doc.toString();
  state.analysis = analyze(code);
  state.runtimeDiagnostics = [];
  saveSoon(code);
  queueMicrotask(refreshEditor);
  inspector.update(state.analysis, selectedId(), runtimeForCurrent());
  updateMathContext();
  const kind = update.transactions.map((tr) => tr.annotation(sceneEdit)).find(Boolean);
  if (!kind && update.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"))) study.log("digitacao");
  if (kind === "cena") return; // quem editou decide quando rodar
  if (kind === "scrub") return liveRun();
  if (hasBlockingError(state.analysis)) {
    clearTimeout(state.runTimer);
    showBlockingError();
    sendSelection();
    return;
  }
  clearTimeout(state.runTimer);
  state.runTimer = setTimeout(() => runNow(), TYPING_DELAY_MS);
}

function refreshEditor() {
  const a = state.analysis;
  showAnalysis(view, a, [...a.diagnostics, ...state.runtimeDiagnostics], sync);
  if (!sync) return; // grupo controle: nada se acende no código pela cena
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
  if (id === state.codeHoverId || !sync) return;
  state.codeHoverId = id;
  bridge.send({ type: "highlight", id: toScreen(id) });
}

function onScrub(number, value) {
  const slot = number.slot;
  const obj = slot && state.analysis.objects[slot.id];
  if (!slot || !obj || obj.kind === "geometry") return; // o código já mudou; liveRun cuida
  const v = slot.unit === "deg" ? degToRad(value) : value;
  state.liveApplied = true;
  bridge.send({ type: "apply", id: toScreen(slot.id), key: slot.key, value: v });
}

// ---------------------------------------------------------------------------
// Rodar o código no visor

/** `quiet`: a barra de status não troca para "Cena atualizada" (fica o aviso que já está lá). */
function runNow({ force = false, resetTime = false, quiet = false } = {}) {
  clearTimeout(state.runTimer);
  const analysis = state.analysis;
  if (hasBlockingError(analysis)) {
    showBlockingError();
    return;
  }
  if (!force && state.stuckCode === analysis.code) return;
  state.stuckCode = null;
  sendRun(analysis, resetTime, quiet);
}

function sendRun(analysis, resetTime = false, quiet = false) {
  const { script, toOriginal } = instrument(analysis);
  const runId = ++state.runId;
  state.runs.set(runId, { analysis, toOriginal, failed: false, quiet });
  for (const id of state.runs.keys()) if (id < runId - 20) state.runs.delete(id);
  state.runtimeDiagnostics = [];
  state.liveApplied = false;
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
        } else runNow({ quiet: newSession });
      } else if (state.screen) {
        // o visor foi reiniciado: mostra de novo a última cena que funcionou
        sendRun(state.screen);
      }
      // o visor (re)começa do zero: manda de novo o que o editor ligou
      if (state.glass) bridge.send({ type: "glass", model: state.glass });
      if (state.view !== "editor") bridge.send({ type: "view", view: state.view });
      if (!state.playing) bridge.send({ type: "play", playing: false });
      sendGhosts();
      break;
    case "ran":
      onRan(msg);
      break;
    case "error":
      onRuntimeError(msg);
      break;
    case "pick":
      select(fromScreen(msg.id), { reveal: true });
      study.log("selecao", { origem: "visor", tipo: kindOfSelected() });
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
    case "math":
      if (msg.id != null && msg.id === toScreen(selectedId())) mathPanel.setData(msg);
      break;
    case "facts":
      onFacts(msg);
      break;
    case "probe":
      mathPanel.setProbe(msg);
      if (msg.seq !== state.probeSeq) {
        state.probeSeq = msg.seq;
        study.log("sonda", { modelo: msg.model, suportado: !!msg.supported, material: msg.params?.className ?? msg.materialType ?? null });
      }
      break;
    case "fatal":
      setStatus("error", msg.message);
      break;
    case "contextlost": {
      // Sem o contexto WebGL o visor não desenha mais nada: recomeça do zero. Se o código cria
      // WebGLRenderer (o motivo mais provável da perda), ele só roda de novo com ↻ Rodar.
      const last = state.runs.get(state.runId)?.analysis;
      const suspect = !!last && last.objects.some((o) => o.className === "WebGLRenderer");
      if (suspect) {
        state.stuckCode = last.code;
        state.screen = null;
      }
      clearRunning();
      bridge.reset();
      setStatus(
        "error",
        "O visor perdeu o acesso ao WebGL e foi reiniciado." +
          (suspect ? " Cada WebGLRenderer do código ocupa um contexto WebGL: apague essa parte (o VisuGraph já desenha a cena) e clique em ↻ Rodar." : ""),
      );
      break;
    }
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
    const count = run.analysis.objects.filter((o) => isDrawableKind(o.kind) || o.kind === "light").length;
    if (!run.quiet) setStatus("ok", `Cena atualizada · ${count} ${count === 1 ? "objeto" : "objetos"}${msg.hasAnimar ? " · animar() rodando" : ""}`);
    study.log("execucao", { ok: true, objetos: count, animar: !!msg.hasAnimar });
  }
  sendSelection();
  requestInspect();
  updateMathContext();
  sendMarker();
  requestMath();
  // um valor mudado direto no visor (arraste no painel) ainda não está no código: corrige depois
  if (msg.runId === state.runId && !state.liveApplied) requestFacts();
}

function onRuntimeError(msg) {
  const run = state.runs.get(msg.runId);
  if (!run) return;
  run.failed = true;
  study.log("erro", { origem: "execucao", fase: msg.phase, tipo: msg.name, laco: !!msg.loop });
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
  study.log("erro", { origem: d.source });
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
  const key = id == null ? null : keysOf(state.analysis).byId.get(id) ?? null;
  if (key !== state.selectedKey) state.vertex = 0;
  state.selectedKey = key;
  refreshEditor();
  inspector.update(state.analysis, selectedId(), runtimeForCurrent());
  updateMathContext();
  sendSelection();
  requestInspect();
  sendMarker();
  requestMath();
  const obj = id != null ? state.analysis.objects[id] : null;
  if (reveal && obj && sync) revealPosition(view, obj.ranges[0]?.from ?? obj.from);
}

function kindOfSelected() {
  const id = selectedId();
  return id != null ? state.analysis.objects[id].kind : null;
}

function sendSelection() {
  const a = state.analysis;
  if (hasBlockingError(a)) {
    // Com o código quebrado não há onde escrever um arraste: a seleção continua na cena, sem gizmo.
    const screenId = state.selectedKey != null && state.screen ? keysOf(state.screen).byKey.get(state.selectedKey) ?? null : null;
    bridge.send({ type: "select", id: screenId, axes: {} });
    return;
  }
  const id = selectedId();
  // sem eixos o visor não mostra o gizmo: no grupo controle, a cena não escreve no código
  const axes = id == null || !sync ? {} : Object.fromEntries(["position", "rotation", "scale"].map((p) => [p, editableAxes(a, id, p)]));
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
  // uma execução pendente (de algo digitado antes) esperaria o arraste acabar no visor
  if (!msg.final) clearTimeout(state.runTimer);
  applyPlan(planTransform(state.analysis, id, msg.prop, msg.values, msg.start, msg.touched));
  if (msg.final) {
    study.log("gizmo", { prop: msg.prop });
    runNow();
  }
}

function onInspectorEdit(id, key, value, phase) {
  const ok = applyPlan(planEdit(state.analysis, id, key, value, { current: (oid, k) => state.runtimeValues[oid]?.[k] }));
  if (!ok) return;
  if (phase === "commit") {
    study.log("painel", { chave: key });
    runNow();
    return;
  }
  const obj = state.analysis.objects[id];
  if (obj && obj.kind === "geometry") liveRun();
  else {
    state.liveApplied = true;
    bridge.send({ type: "apply", id: toScreen(id), key, value });
  }
}

const inspector = new Inspector(
  { list: $("#lv-objects"), panel: $("#lv-props") },
  {
    select: (id) => {
      select(id, { reveal: true });
      study.log("selecao", { origem: "lista", tipo: kindOfSelected() });
    },
    edit: onInspectorEdit,
    reveal: (pos) => revealPosition(view, pos, true),
  },
  { readOnly: sync ? null : READ_ONLY },
);
inspector.update(state.analysis, null);

// ---------------------------------------------------------------------------
// Abas do painel e a aba Matemática

const mathPanel = new MathPanel($("#lv-math"), {
  hover: (keys) => showMathLinks(view, keys ? rangesOf(keys) : [], true),
  vertex(index) {
    state.vertex = index;
    sendMarker();
    requestMath();
  },
  glass: (model) => setGlass(model),
  log: (type, data) => study.log(type, data),
});

/** Trechos do código dos literais "id:chave" (só os que o painel pode apontar). */
function rangesOf(keys) {
  const a = state.analysis;
  if (!a.ok) return [];
  const out = [];
  for (const key of keys) {
    const i = key.indexOf(":");
    const st = a.objects[Number(key.slice(0, i))]?.props[key.slice(i + 1)];
    if (st && st.status === "slot") out.push({ from: st.slot.from, to: st.slot.to });
  }
  return out;
}

function updateMathContext() {
  const id = selectedId();
  const obj = id != null ? state.analysis.objects[id] : null;
  mathPanel.setContext(
    obj && isObject3DKind(obj.kind)
      ? {
        id,
        name: obj.name,
        className: obj.className,
        ids: fromScreen,
        material: (meshId) => state.analysis.objects[meshId]?.links.material ?? null,
        nameOf: (objId) => state.analysis.objects[objId]?.name ?? null,
        links: sync,
      }
      : null,
  );
}

function requestMath() {
  const id = state.tab === "math" ? toScreen(selectedId()) : null;
  if (id != null) bridge.send({ type: "math", id, vertex: state.vertex });
}
// a câmera do editor e a animação mudam as contas sem o código mudar
setInterval(() => {
  if (document.visibilityState === "visible") requestMath();
}, 200);

function sendMarker() {
  const id = state.tab === "math" ? toScreen(selectedId()) : null;
  bridge.send({ type: "marker", id, vertex: state.vertex });
}

function setGlass(model) {
  state.glass = model;
  bridge.send({ type: "glass", model });
  mathPanel.setGlass(model);
  study.log("vidro", { modelo: model ?? "desligado" });
}

const tabs = [...document.querySelectorAll('.lv-tabs [role="tab"]')];
function setTab(tab) {
  if (tab !== state.tab) study.log("aba", { aba: tab });
  state.tab = tab;
  for (const t of tabs) {
    const on = t.dataset.tab === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
  showMathLinks(view, []);
  sendMarker();
  requestMath();
}
for (const t of tabs) {
  t.addEventListener("click", () => setTab(t.dataset.tab));
  t.addEventListener("keydown", (e) => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    const visible = tabs.filter((x) => !x.hidden);
    const next = visible[(visible.indexOf(t) + k + visible.length) % visible.length];
    setTab(next.dataset.tab);
    next.focus();
  });
}

// ---------------------------------------------------------------------------
// Desafios: abrir, corrigir pela cena e guardar o progresso

const challengesPanel = new ChallengesPanel(
  $("#lv-challenges"),
  {
    open: (id, origin) => openChallenge(challengeById(id), origin),
    leave: () => openChallenge(null),
    hint(id) {
      const c = state.challenge;
      if (!c || c.id !== id || state.hints >= c.hints.length) return;
      state.hints++;
      study.log("desafio.dica", { id, n: state.hints });
      challengesPanel.setHints(state.hints);
    },
    nextOf: (id) => nextChallenge(id, progress.done),
  },
  { sceneEdits: sync, labLinks: !group },
);
challengesPanel.setDone(progress.done);

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ feitos: [...progress.done], atual: state.challenge?.id ?? null }));
  } catch {
    // sem armazenamento: o progresso vale até fechar a página
  }
}

/**
 * Abre um desafio (null volta ao código livre). O editor troca de documento: o código que
 * sai fica guardado, e o que entra é o guardado daquele desafio ou o inicial dele.
 */
function openChallenge(challenge, origin = "lista", { keepCode = true, quiet = false } = {}) {
  if (challenge === state.challenge && keepCode) return;
  clearTimeout(saveTimer);
  if (keepCode) save(view.state.doc.toString());
  if (state.challenge) study.log("desafio.sair", { id: state.challenge.id, feito: progress.done.has(state.challenge.id) });
  state.challenge = challenge;
  saveProgress();
  if (challenge) study.log("desafio.abrir", { id: challenge.id, origem: origin });
  resetDoc(view, storedCode());
  state.analysis = analyze(view.state.doc.toString());
  state.runtimeDiagnostics = [];
  state.stuckCode = null;
  select(null);
  showChallenge();
  if (hasBlockingError(state.analysis)) showBlockingError();
  else runNow({ force: true, resetTime: true, quiet });
}

/** Painel, faixa sobre o código, contornos e vista do desafio aberto. */
function showChallenge() {
  const c = state.challenge;
  state.challengeOpenedAt = Date.now();
  state.hints = 0;
  state.gradeKey = null;
  challengesPanel.show(c);
  updateChallengeBar(null);
  showTopic();
  sendGhosts();
  if (!c) return;
  setView(c.view);
  const glass = trailOf(c.id).glass;
  if (glass && !state.glass) setGlass(glass);
}

function sendGhosts() {
  bridge.send({ type: "ghost", shapes: state.challenge?.ghosts ?? [] });
}

function requestFacts() {
  if (state.challenge) bridge.send({ type: "facts", seq: ++state.factsSeq });
}

/** Corrige o desafio aberto com os fatos da cena, pelos nomes das variáveis do código que rodou. */
function onFacts(msg) {
  const challenge = state.challenge;
  const analysis = state.runs.get(msg.runId)?.analysis;
  if (!challenge || !analysis || msg.seq !== state.factsSeq) return;
  const objects = Object.create(null);
  for (const [id, facts] of Object.entries(msg.objects)) {
    const name = analysis.objects[id]?.name;
    if (name && !objects[name]) objects[name] = facts;
  }
  const nameOf = (id) => analysis.objects[id]?.name ?? null;
  const result = grade(challenge, { objects, camera: msg.camera, lights: msg.lights, nameOf });
  challengesPanel.setResult(result);
  const passed = result.results.filter((r) => r.ok).length;
  updateChallengeBar({ passed, total: result.results.length, ok: result.ok });
  const key = result.results.map((r) => (r.ok ? 1 : 0)).join("");
  if (key !== state.gradeKey) {
    if (state.gradeKey != null || passed) study.log("desafio.conferir", { id: challenge.id, ok: result.ok, passou: passed, total: result.results.length });
    state.gradeKey = key;
  }
  if (result.ok && !progress.done.has(challenge.id)) {
    progress.done.add(challenge.id);
    saveProgress();
    challengesPanel.setDone(progress.done);
    study.log("desafio.concluir", { id: challenge.id, segundos: (Date.now() - state.challengeOpenedAt) / 1000, dicas: state.hints });
    setStatus("ok", `Desafio feito: ${challenge.title}.`);
  }
}

// Faixa sobre o código: lembra que o editor tem o código do desafio, e como ele vai.
const codebar = $("#lv-codebar");
const codebarTitle = document.createElement("strong");
const codebarStatus = document.createElement("span");
const codebarOpen = Object.assign(document.createElement("button"), { type: "button", className: "lv-link", textContent: "ver desafio" });
codebarOpen.addEventListener("click", () => setTab("challenges"));
codebar.append("Desafio: ", codebarTitle, codebarStatus, codebarOpen);

function updateChallengeBar(grading) {
  const c = state.challenge;
  codebar.hidden = !c;
  if (!c) return;
  codebarTitle.textContent = c.title;
  codebar.dataset.ok = String(!!grading?.ok);
  codebarStatus.textContent = !grading ? "" : grading.ok ? "✓ feito" : `${grading.passed} de ${grading.total} ${grading.total === 1 ? "verificação" : "verificações"}`;
}

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
    study.log("adicionar", { tipo: item.kind });
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

function setView(next) {
  if (next === state.view) return;
  state.view = next;
  bridge.send({ type: "view", view: next });
  updateToolbar();
}
$("#lv-view").addEventListener("click", () => {
  setView(state.view === "editor" ? "camera" : "editor");
  study.log("vista", { vista: state.view });
});

$("#lv-play").addEventListener("click", () => {
  state.playing = !state.playing;
  study.log("animar", { tocando: state.playing });
  bridge.send({ type: "play", playing: state.playing });
  updateToolbar();
});

$("#lv-restart").addEventListener("click", () => {
  study.log("rodar", { atalho: false });
  runNow({ force: true, resetTime: true });
});

$("#lv-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(view.state.doc.toString());
    study.log("copiar");
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
  study.log("baixar");
  setStatus("ok", "Página baixada: abra cena-visugraph.html no navegador (precisa de internet para carregar o Three.js).");
});

$("#lv-reset").addEventListener("click", () => {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: starterCode() }, userEvent: "input.cena" });
  state.selectedKey = null;
  study.log("restaurar", { desafio: state.challenge?.id ?? null });
  runNow({ force: true, resetTime: true });
  setStatus("ok", state.challenge ? "Código inicial do desafio restaurado. Ctrl+Z desfaz." : "Exemplo restaurado. Ctrl+Z desfaz.");
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

// ---------------------------------------------------------------------------
// Faixa do modo de estudo

if (group) {
  document.body.dataset.study = group;
  // a barra fica só com o nome, sem os temas e sem a volta ao início
  $("#vg-nav").hidden = true;
  $(".vg-brand").removeAttribute("href");
  $(".vg-brand").removeAttribute("title");
  if (!sync) {
    // sem gizmo e sem inserir código pela cena
    $("#lv-add").hidden = true;
    $('.lv-seg[aria-label="Ferramenta do gizmo"]').hidden = true;
    $(".lv-view__hint").textContent = "Clique para selecionar · arraste para girar a vista · F centraliza";
  }
  const code = document.createElement("strong");
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Exportar registro";
  exportButton.addEventListener("click", () => {
    study.save();
    const url = URL.createObjectURL(new Blob([study.export()], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `visugraph-estudo-${study.code}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("ok", `Registro da sessão ${study.code} baixado. Ele não tem o seu código nem dados pessoais.`);
  });
  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.textContent = "Nova sessão";
  newButton.title = "Para o próximo aluno neste computador (exporte o registro antes)";
  newButton.addEventListener("click", () => {
    // o próximo aluno começa como numa página recém-aberta: mesma vista, sem desafio aberto,
    // sem caixa de vidro e com o código inicial
    restarting = true;
    clearTimeout(saveTimer);
    study.start();
    study.save();
    forgetStudent();
    try {
      sessionStorage.setItem(NEW_SESSION_KEY, study.code);
    } catch {
      // idem
    }
    location.reload();
  });
  code.textContent = study.code;
  const banner = document.createElement("div");
  banner.className = "lv-study";
  banner.setAttribute("role", "note");
  banner.append(`Estudo · grupo ${group} · sessão `, code, exportButton, newButton);
  $(".lv-top").append(banner);
}

if (state.challenge) {
  study.log("desafio.abrir", { id: state.challenge.id, origem: challengeAsked ? "endereco" : trailAsked ? "trilha" : "retomar" });
  saveProgress();
  showChallenge();
  setTab("challenges");
} else if (freeAsked) saveProgress(); // ao recarregar, continua sem desafio

queueMicrotask(refreshEditor);
if (hasBlockingError(state.analysis)) showBlockingError();
else if (newSession) setStatus("ok", `Nova sessão: ${study.code}. Anote este código no questionário.`);
else setStatus("info", "Carregando o visor…");
