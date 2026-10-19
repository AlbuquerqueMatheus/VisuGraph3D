// study.js — o modo de estudo: dois grupos para comparar o código vivo com um editor comum,
// e um registro de uso anônimo que o professor exporta ao fim da aula.
//
//   index-3d.html?estudo=experimental   tudo ligado, como no uso normal
//   index-3d.html?estudo=controle       o código roda a cada mudança, mas a cena não escreve
//                                       no código e nada se acende entre os dois
//
// O registro guarda só o tipo de cada evento, alguns detalhes (qual aba, qual desafio) e o
// tempo desde o início da sessão: nunca o código, nomes ou dados pessoais. Ele fica no
// navegador (localStorage) até ser exportado; um código curto da sessão, mostrado na tela,
// liga o arquivo exportado ao questionário do aluno sem identificar ninguém.

export const STUDY_KEY = "visugraph.estudo.v1";
export const MAX_EVENTS = 5000;
export const FORMAT = "visugraph-estudo/1";

/** Grupo pedido na URL (?estudo=controle ou ?estudo=experimental), ou null. */
export function studyGroup(search) {
  const value = new URLSearchParams(search).get("estudo");
  return value === "controle" || value === "experimental" ? value : null;
}

/** Código aleatório da sessão, no formato XXXX-XXXX (sem letras que se confundem). */
export function sessionCode(random = defaultRandom) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = random(8);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function defaultRandom(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Eventos que chegam em rajada (passar o mouse, digitar) viram um só a cada intervalo. */
const COALESCE_MS = { "math.hover": 1500, digitacao: 3000, erro: 3000 };

export class StudyLog {
  /**
   * `storage`: localStorage ou um substituto; `now()`: relógio em ms; `saveDelay`: espera
   * para gravar (eventos em sequência gravam uma vez só; 0 grava na hora).
   */
  constructor(group, { storage = safeStorage(), now = () => Date.now(), random = defaultRandom, saveDelay = 1000 } = {}) {
    this.group = group;
    this.storage = storage;
    this.now = now;
    this.random = random;
    this.saveDelay = saveDelay;
    this.saveTimer = null;
    this.session = this.load();
    if (!this.session || this.session.grupo !== group) this.start();
  }

  load() {
    try {
      const data = JSON.parse(this.storage?.getItem(STUDY_KEY) ?? "null");
      return data && data.formato === FORMAT && Array.isArray(data.eventos) ? data : null;
    } catch {
      return null;
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.storage?.setItem(STUDY_KEY, JSON.stringify(this.session));
    } catch {
      // armazenamento cheio ou bloqueado: o registro continua na memória até exportar
    }
  }

  /** Começa uma sessão nova (outro aluno no mesmo computador). */
  start() {
    this.session = { formato: FORMAT, sessao: sessionCode(this.random), grupo: this.group, inicio: new Date(this.now()).toISOString(), eventos: [] };
    this.lastByType = {};
    this.log("inicio");
  }

  get code() {
    return this.session.sessao;
  }

  /** Registra um evento: `data` só pode ter números, booleanos e textos curtos. */
  log(type, data = {}) {
    const t = this.now() - Date.parse(this.session.inicio);
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "t" || k === "evento") continue; // nomes do próprio registro
      if (typeof v === "number" && Number.isFinite(v)) clean[k] = Math.round(v * 1000) / 1000;
      else if (typeof v === "boolean") clean[k] = v;
      else if (typeof v === "string") clean[k] = v.slice(0, 60);
      else if (Array.isArray(v)) clean[k] = v.filter((x) => typeof x === "string" || typeof x === "number").slice(0, 12);
    }
    const span = COALESCE_MS[type];
    const events = this.session.eventos;
    const last = this.lastByType?.[type];
    if (span && last && t - (last.ate ?? last.t) < span) {
      last.n = (last.n || 1) + 1;
      last.ate = t;
    } else {
      const event = { t, evento: type, ...clean };
      events.push(event);
      if (span) (this.lastByType ||= {})[type] = event;
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    }
    if (this.saveDelay === 0) this.save();
    else this.saveTimer ??= setTimeout(() => this.save(), this.saveDelay);
  }

  /** O registro como texto JSON, para baixar. */
  export() {
    return JSON.stringify({ ...this.session, exportado: new Date(this.now()).toISOString() }, null, 1);
  }
}

/** Sem modo de estudo, nada é registrado. */
export const NO_STUDY = { group: null, code: null, log() {}, export: () => "", start() {}, save() {} };

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
