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
import { shaderError, translateError, translateShaderError } from "./engine/errors.js";
import { degToRad } from "./engine/format.js";
import { createEditor, resetDoc, revealPosition, sceneEdit, showAnalysis, showHighlight, showMathLinks } from "./editor/editor.js";
import { isDrawableKind, isObject3DKind } from "./engine/catalog.js";
import { Inspector } from "./inspector.js";
import { MathPanel } from "./mathPanel.js";
import { CHALLENGES, challengeById, firstOpen, grade, nextChallenge, trailById, trailOf } from "./challenges.js";
import { PROGRESS_KEY, PROJECTS_KEY, readProgress, readProjects } from "./progress.js";
import { PROJECTS, behind, codeState, findSnippet, isComputer, liveSteps, projectById, startCode, stepIndex } from "./projects/index.js";
import { animatedKeys } from "./projects/checks.js";
import { ProjectPanel } from "./projectPanel.js";
import { topicOfTrail } from "../js/topics.js";
import { mountTopicBar } from "../js/topicbar.js";
import { ChallengesPanel } from "./challengesPanel.js";
import { NO_STUDY, StudyLog, studyGroup } from "./study.js";
import { ViewportBridge } from "./bridge.js";
import { exportHtml, exportProject } from "./export.js";
import { zip } from "../lib/zip.js";

const STORAGE_KEY = "visugraph.codigo.v1";
const challengeKey = (id) => `visugraph.desafio.${id}.v1`; // o código de cada desafio
const projectKey = (id) => `visugraph.projeto.${id}.v1`; // o código de cada projeto, um só para todos os passos
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

/** Apaga o progresso nos desafios e nos projetos e o código guardado (o livre e o de cada um). */
function forgetStudent() {
  try {
    for (const c of CHALLENGES) localStorage.removeItem(challengeKey(c.id));
    for (const p of PROJECTS) localStorage.removeItem(projectKey(p.id));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(PROJECTS_KEY);
    localStorage.removeItem(RUNNING_KEY); // o código que travou também foi embora
  } catch {
    // sem armazenamento: não há o que apagar
  }
}

// Desafios: o que já foi feito e o desafio aberto. ?trilha=matriz|camera|phong (a tela inicial,
// a barra e os laboratórios) abre o primeiro desafio ainda não feito da trilha, ou continua no
// desafio aberto, se ele é dessa trilha e não foi feito: quem foi rever o laboratório volta para
// ele. ?desafio=<id> abre um desafio (o laboratório de cores leva ao da cor) e ?livre abre o
// editor sem desafio. ?projeto=<id>&passo=<n> abre um passo do guia de projetos (sem passo, o
// passo em que a pessoa parou); o modo de estudo não tem projetos.
function loadProgress() {
  const { done, current } = readProgress();
  return { done: new Set(done.filter((id) => challengeById(id))), current: challengeById(current) };
}
const progress = loadProgress();

function loadProjects() {
  const { done, current } = readProjects();
  const steps = Object.fromEntries(PROJECTS.map((p) => [p.id, new Set((done[p.id] ?? []).filter((id) => p.steps.some((s) => s.id === id)))]));
  const project = group ? null : projectById(current?.project);
  return { done: steps, current: project ? { project, index: Math.max(0, stepIndex(project, current.step)) } : null };
}
const projects = loadProjects();

/** O passo em que a pessoa parou no projeto: o aberto da última vez, ou o primeiro não feito. */
function resumeIndex(project) {
  if (projects.current?.project === project) return projects.current.index;
  const open = project.steps.findIndex((s) => !projects.done[project.id].has(s.id));
  return Math.max(0, open);
}

const asked = new URLSearchParams(location.search);
const projectAsked = group ? null : projectById(asked.get("projeto"));
const challengeAsked = projectAsked ? null : challengeById(asked.get("desafio"));
const trailAsked = projectAsked || challengeAsked ? null : trailById(asked.get("trilha"));
const freeAsked = !projectAsked && !challengeAsked && !trailAsked && asked.has("livre");
const resumeAsked = trailAsked && progress.current && trailOf(progress.current.id) === trailAsked && !progress.done.has(progress.current.id);
const URL_KEYS = ["desafio", "trilha", "livre", "projeto", "passo"];
if (URL_KEYS.some((key) => asked.has(key))) {
  // ao recarregar, vale o desafio ou o passo que estava aberto, não o começo da trilha
  const url = new URL(location.href);
  for (const key of URL_KEYS) url.searchParams.delete(key);
  history.replaceState(history.state, "", url);
}
const stepAsked = projectAsked ? stepIndex(projectAsked, asked.get("passo")) : -1;
const projectOpen = projectAsked
  ? { project: projectAsked, index: stepAsked >= 0 ? stepAsked : resumeIndex(projectAsked) }
  : challengeAsked || trailAsked || freeAsked
    ? null
    : projects.current;

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
  tab: "props", // aba do painel da direita: props, math, challenges ou project
  glass: null, // caixa de vidro: null, "phong" ou "blinn"
  vertex: 0, // vértice que o painel Matemática acompanha
  probeSeq: null,
  // desafio aberto ou passo de projeto aberto ({ project, index }): o editor tem o código dele
  challenge: projectOpen ? null : challengeAsked ?? (trailAsked && !resumeAsked ? firstOpen(trailAsked, progress.done) : freeAsked ? null : progress.current),
  project: projectOpen,
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
const showTopic = () =>
  topicBar?.update({ step: "programar", topic: topicOfTrail(trailOf(state.challenge?.id)?.id), label: state.project ? state.project.project.title : null });
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

// Cada desafio e cada projeto guardam o próprio código; fora deles, o editor tem o código livre
// do aluno. O código inicial de um projeto é o do começo do passo aberto.
const codeKey = () => (state.project ? projectKey(state.project.project.id) : state.challenge ? challengeKey(state.challenge.id) : STORAGE_KEY);
const starterCode = () => (state.project ? startCode(state.project.project, state.project.index) : state.challenge?.starter ?? STARTER_CODE);

function loadCode() {
  try {
    startedAfterCrash = localStorage.getItem(RUNNING_KEY) != null;
    localStorage.removeItem(RUNNING_KEY);
  } catch {
    // sem armazenamento: começa do código inicial
  }
  const code = storedCode();
  // aberto num passo adiante (?passo=), o código de um passo anterior do guia vira o começo dele
  return state.project && behind(state.project.project, state.project.index, code) ? starterCode() : code;
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
  if (state.project) projectPanel.setCodeState(codeState(state.project.project, state.project.index, code));
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
  if (msg.phase === "shader") {
    showShaderError(run, msg);
    return;
  }
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

const SHADER_STAGES = { vertex: "No shader de vértices", fragment: "No shader de fragmentos", link: "Ao ligar os dois shaders" };

/**
 * Um shader que não compilou. O visor manda a linha do erro dentro do texto do shader e o próprio
 * texto, que aparece igual no código (entre as crases): o erro vai para a linha dele no editor.
 */
function showShaderError(run, msg) {
  const where = SHADER_STAGES[msg.stage] ?? "No shader";
  const code = run.analysis.code;
  const at = msg.glsl ? code.indexOf(msg.glsl.source) : -1;
  if (at < 0) {
    setStatus("error", `${where}: ${translateShaderError(msg.message)}`);
    return;
  }
  const { line, text } = shaderError(msg.message, msg.glsl.source, msg.glsl.line);
  const lines = msg.glsl.source.split("\n");
  let from = at;
  for (let i = 0; i < line - 1; i++) from += lines[i].length + 1;
  from += lines[line - 1].length - lines[line - 1].trimStart().length; // sem o recuo
  const message = `${where}: ${text}`;
  if (code === state.analysis.code) {
    const end = view.state.doc.lineAt(Math.min(from, view.state.doc.length)).to;
    state.runtimeDiagnostics = [{ from, to: Math.max(end, from + 1), severity: "error", message, source: "shader" }];
    refreshEditor();
  }
  setStatus("error", `Linha ${code.slice(0, from).split("\n").length}: ${message}`, from);
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

// Um passo que mede o movimento (`motion`, como a velocidade do carrinho da montanha-russa)
// confere de novo a cada segundo enquanto a animação roda: o rastro do que anda cresce a cada quadro.
setInterval(() => {
  if (projectStep()?.motion && state.playing && state.hasAnimar && !state.liveApplied && document.visibilityState === "visible") requestFacts();
}, 1000);

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
        name: obj.name ?? obj.local,
        className: obj.className,
        ids: fromScreen,
        material: (meshId) => state.analysis.objects[meshId]?.links.material ?? null,
        nameOf: (objId) => state.analysis.objects[objId]?.name ?? state.analysis.objects[objId]?.local ?? null,
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
  $(".lv-grid").dataset.panel = tab; // a aba Projetos alarga o painel
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
  if (challenge === state.challenge && !state.project && keepCode) return;
  clearTimeout(saveTimer);
  if (keepCode) save(view.state.doc.toString());
  if (state.challenge) study.log("desafio.sair", { id: state.challenge.id, feito: progress.done.has(state.challenge.id) });
  if (state.project) closeProject();
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
  updateCodebar(null);
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

/** O passo de projeto aberto, ou null. */
const projectStep = () => (state.project ? state.project.project.steps[state.project.index] : null);

function requestFacts() {
  // um passo no computador não confere a cena: quem diz que funcionou é a pessoa
  if (state.challenge || (state.project && !isComputer(projectStep()))) bridge.send({ type: "facts", seq: ++state.factsSeq });
}

/**
 * Corrige o desafio ou o passo aberto com os fatos da cena, pelos nomes das variáveis do código
 * que rodou. Os passos de projeto também olham o fundo da cena, o que animar() muda e se a
 * animação está andando (o rastro de quem anda só cresce com ela).
 */
function onFacts(msg) {
  const analysis = state.runs.get(msg.runId)?.analysis;
  const target = state.project ? projectStep() : state.challenge;
  if (!target || isComputer(target) || !analysis || msg.seq !== state.factsSeq) return;
  const objects = Object.create(null);
  // os objetos criados num laço não têm `name`, mas têm a variável local (`local`)
  const nameOf = (id) => analysis.objects[id]?.name ?? analysis.objects[id]?.local ?? null;
  for (const [id, facts] of Object.entries(msg.objects)) {
    const name = nameOf(id);
    if (name && !objects[name]) objects[name] = facts;
  }
  const facts = {
    objects,
    camera: msg.camera,
    lights: msg.lights,
    nameOf,
    background: msg.background,
    fog: msg.fog,
    animated: animatedKeys(analysis),
    hasAnimar: !!analysis.animar,
    playing: !!msg.playing,
    recorded: msg.recorded ?? 0,
  };
  const result = grade(target, facts);
  const passed = result.results.filter((r) => r.ok).length;
  updateCodebar({ passed, total: result.results.length, ok: result.ok });
  if (state.project) {
    onStepResult(result);
    return;
  }
  const challenge = state.challenge;
  challengesPanel.setResult(result);
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

// Faixa sobre o código: lembra que o editor tem o código do desafio ou do projeto, e como ele vai.
const codebar = $("#lv-codebar");
const codebarKind = document.createTextNode(""); // texto solto: os spans da faixa ficam verdes quando o passo está feito
const codebarTitle = document.createElement("strong");
const codebarStatus = document.createElement("span");
const codebarOpen = Object.assign(document.createElement("button"), { type: "button", className: "lv-link" });
codebarOpen.addEventListener("click", () => setTab(state.project ? "project" : "challenges"));
codebar.append(codebarKind, codebarTitle, codebarStatus, codebarOpen);

function updateCodebar(grading) {
  const c = state.challenge;
  const p = state.project;
  codebar.hidden = !c && !p;
  if (!c && !p) return;
  codebarKind.data = p ? "" : "Desafio: "; // o nome do projeto já diz o que é, e a faixa é estreita
  codebarTitle.textContent = p ? `${p.project.title} · passo ${p.index + 1} de ${p.project.steps.length}` : c.title;
  codebarOpen.textContent = p ? "ver passo" : "ver desafio";
  // no computador não há conferência: a faixa diz onde o passo acontece, até a pessoa dizer que funcionou
  const step = projectStep();
  if (step && isComputer(step)) grading = { computer: true, ok: projects.done[p.project.id].has(step.id) };
  codebar.dataset.ok = String(!!grading?.ok);
  const checks = p ? ["conferência", "conferências"] : ["verificação", "verificações"];
  codebarStatus.textContent = !grading ? "" : grading.ok ? "✓ feito" : grading.computer ? "no seu computador" : `${grading.passed} de ${grading.total} ${grading.total === 1 ? checks[0] : checks[1]}`;
}

// ---------------------------------------------------------------------------
// Guia de projetos: abrir um passo, trocar o código e conferir a cena

const projectPanel = new ProjectPanel($("#lv-project"), {
  open: (id, index) => openProject(projectById(id), index),
  leave: () => openChallenge(null, "projeto"),
  apply: () => replaceCode(state.project.project.steps[state.project.index].code),
  restart: () => replaceCode(starterCode()),
  locate: (line) => findSnippet(view.state.doc.toString(), line),
  mark: (range) => showMathLinks(view, range ? [range] : [], true),
  reveal(range) {
    revealPosition(view, range.from, true);
    showMathLinks(view, [range]);
  },
  copy: (text) => copyText(text, "Comando copiado: cole no terminal."),
  download: (item) => downloadStepProject(item),
  confirm() {
    const { project, index } = state.project;
    const step = project.steps[index];
    const done = projects.done[project.id];
    if (done.has(step.id)) return;
    done.add(step.id);
    saveProjects();
    projectPanel.setDone(projects.done);
    updateCodebar(null);
    setStatus("ok", `Passo feito: ${index + 1}. ${step.title}.`);
  },
});
projectPanel.setDone(projects.done);

function saveProjects() {
  if (group) return; // o modo de estudo não tem projetos
  const p = state.project;
  const feitos = Object.fromEntries(Object.entries(projects.done).filter(([, steps]) => steps.size).map(([id, steps]) => [id, [...steps]]));
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify({ feitos, atual: p ? { projeto: p.project.id, passo: p.project.steps[p.index].id } : null }));
  } catch {
    // sem armazenamento: o progresso vale até fechar a página
  }
}

/** Troca todo o código do editor (Ctrl+Z desfaz) e roda. */
function replaceCode(code) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code }, userEvent: "input.cena" });
  state.selectedKey = null;
  runNow({ force: true, resetTime: true });
}

/**
 * Abre o passo `index` de um projeto (null: o passo em que a pessoa parou). Ao entrar no projeto,
 * o editor troca de documento, como num desafio. Entre passos do mesmo projeto o código continua,
 * e só vira o começo do passo novo se ainda for o código de um passo anterior do guia: o que a
 * pessoa escreveu não se perde, e Ctrl+Z desfaz a troca.
 */
function openProject(project, index = null) {
  if (index == null) index = resumeIndex(project);
  const same = state.project?.project === project;
  if (same && state.project.index === index) return;
  clearTimeout(saveTimer);
  save(view.state.doc.toString());
  if (state.challenge) {
    study.log("desafio.sair", { id: state.challenge.id, feito: progress.done.has(state.challenge.id) });
    state.challenge = null;
    showChallenge();
  }
  state.project = { project, index };
  projects.current = state.project;
  saveProgress();
  saveProjects();
  if (!same) {
    resetDoc(view, storedCode());
    state.analysis = analyze(view.state.doc.toString());
    state.runtimeDiagnostics = [];
    state.stuckCode = null;
    select(null);
  }
  if (behind(project, index, view.state.doc.toString())) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: starterCode() }, userEvent: "input.cena" });
  showProject();
  if (hasBlockingError(state.analysis)) showBlockingError();
  else runNow({ force: true, resetTime: true });
}

function closeProject() {
  state.project = null;
  projects.current = null; // quem sai e volta retoma do primeiro passo não feito, como depois de recarregar
  saveProjects();
  projectPanel.show(null);
  showMathLinks(view, []);
  setView("editor"); // como o editor livre abre; um desafio troca depois pela vista dele
}

/** Painel, faixa sobre o código e vista do passo aberto. */
function showProject() {
  const { project, index } = state.project;
  state.gradeKey = null;
  projectPanel.show(project, index);
  projectPanel.setCodeState(codeState(project, index, view.state.doc.toString()));
  updateCodebar(null);
  showTopic();
  setView(project.steps[index].view);
}

/**
 * Baixa o projeto Vite de um passo no computador: com o código do editor, ou o projeto pronto do
 * passo (item.cena), que parte do código do guia.
 */
function downloadStepProject(item) {
  const { project, index } = state.project;
  const analysis = item.cena ? analyze(project.steps[index].code) : state.analysis;
  const result = exportProject(analysis, { name: project.id, title: project.title, site: siteUrl(), cena: item.cena ?? null, extra: item.extra ?? [] });
  if (result.error) {
    setStatus("warn", `${result.error} Ou volte ao passo ${liveSteps(project).length} e use o código dele.`);
    return;
  }
  saveFile(zip(result.files), item.file, "application/zip");
  study.log("baixar", { tipo: "projeto" });
  setStatus("ok", `Projeto baixado: ${item.file}.`);
}

function onStepResult(result) {
  projectPanel.setResult(result);
  const { project, index } = state.project;
  const step = project.steps[index];
  const done = projects.done[project.id];
  if (result.ok && !done.has(step.id)) {
    done.add(step.id);
    saveProjects();
    projectPanel.setDone(projects.done);
    setStatus("ok", `Passo feito: ${index + 1}. ${step.title}.`);
  }
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

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("ok", done);
    return true;
  } catch {
    setStatus("warn", "O navegador não deixou copiar: selecione o texto e use Ctrl+C.");
    return false;
  }
}

$("#lv-copy").addEventListener("click", async () => {
  if (await copyText(view.state.doc.toString(), "Código copiado.")) study.log("copiar");
});

/** Entrega um arquivo feito na página, como um download. */
function saveFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** O endereço do VisuGraph, para o README de um projeto baixado apontar o capítulo Seu computador. */
const siteUrl = () => new URL(".", location.href).href;

// Baixar: a cena como uma página HTML que roda sozinha, ou como um projeto Vite (.zip). Num
// projeto, os arquivos levam o nome e o título dele.
const downloadMenu = $("#lv-download");
for (const button of downloadMenu.querySelectorAll("[data-download]")) {
  button.addEventListener("click", () => {
    downloadMenu.open = false;
    const name = state.project ? state.project.project.id : "cena-visugraph";
    const title = state.project?.project.title;
    if (button.dataset.download === "html") {
      const result = exportHtml(state.analysis, title);
      if (result.error) return setStatus("warn", result.error);
      saveFile(result.html, `${name}.html`, "text/html");
      study.log("baixar", { tipo: "html" });
      setStatus("ok", `Página baixada: abra ${name}.html no navegador (precisa de internet para carregar o Three.js).`);
    } else {
      const result = exportProject(state.analysis, { name, title, site: siteUrl() });
      if (result.error) return setStatus("warn", result.error);
      saveFile(zip(result.files), `${name}.zip`, "application/zip");
      study.log("baixar", { tipo: "vite" });
      setStatus("ok", `Projeto baixado: descompacte ${name}.zip e, na pasta, rode npm install e npm run dev (o README.md explica).`);
    }
  });
}

// Um menu da barra aberto fecha com um clique fora dele ou com Esc
document.addEventListener("pointerdown", (event) => {
  for (const menu of document.querySelectorAll(".lv-menu[open]")) if (!menu.contains(event.target)) menu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") for (const menu of document.querySelectorAll(".lv-menu[open]")) menu.open = false;
});

$("#lv-reset").addEventListener("click", () => {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: starterCode() }, userEvent: "input.cena" });
  state.selectedKey = null;
  study.log("restaurar", { desafio: state.challenge?.id ?? null });
  runNow({ force: true, resetTime: true });
  setStatus(
    "ok",
    state.project ? "Código do começo do passo restaurado. Ctrl+Z desfaz." : state.challenge ? "Código inicial do desafio restaurado. Ctrl+Z desfaz." : "Exemplo restaurado. Ctrl+Z desfaz.",
  );
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
  $("#lv-tab-project").hidden = true; // os projetos ficam fora da sessão registrada
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
    saveFile(study.export(), `visugraph-estudo-${study.code}.json`, "application/json");
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

if (state.project) {
  saveProgress(); // ao recarregar, vale o passo, não um desafio aberto antes
  saveProjects();
  showProject();
  setTab("project");
} else if (state.challenge) {
  study.log("desafio.abrir", { id: state.challenge.id, origem: challengeAsked ? "endereco" : trailAsked ? "trilha" : "retomar" });
  saveProgress();
  saveProjects();
  showChallenge();
  setTab("challenges");
} else if (freeAsked) {
  saveProgress(); // ao recarregar, continua sem desafio
  saveProjects();
}

queueMicrotask(refreshEditor);
if (hasBlockingError(state.analysis)) showBlockingError();
else if (newSession) setStatus("ok", `Nova sessão: ${study.code}. Anote este código no questionário.`);
else setStatus("info", "Carregando o visor…");
