import { describe, expect, it } from "vitest";
import { FORMAT, MAX_EVENTS, STUDY_KEY, StudyLog, sessionCode, studyGroup } from "../../src/live/study.js";

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

const fixedRandom = (n) => Uint8Array.from({ length: n }, (_, i) => i * 7);

function makeLog(group = "controle", storage = memoryStorage()) {
  let clock = Date.parse("2026-10-20T13:00:00Z");
  const log = new StudyLog(group, { storage, now: () => clock, random: fixedRandom, saveDelay: 0 });
  return { log, storage, tick: (ms) => (clock += ms) };
}

describe("modo de estudo", () => {
  it("o grupo vem da URL e só vale controle ou experimental", () => {
    expect(studyGroup("?estudo=controle")).toBe("controle");
    expect(studyGroup("?trilha=matriz&estudo=experimental")).toBe("experimental");
    expect(studyGroup("?estudo=outro")).toBeNull();
    expect(studyGroup("")).toBeNull();
  });

  it("o código da sessão é curto e sem letras que se confundem", () => {
    const code = sessionCode(fixedRandom);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(sessionCode()).not.toBe(sessionCode());
  });

  it("registra o tempo desde o início e guarda no navegador", () => {
    const { log, storage, tick } = makeLog();
    tick(1500);
    log.log("aba", { aba: "math" });
    const saved = JSON.parse(storage.getItem(STUDY_KEY));
    expect(saved.formato).toBe(FORMAT);
    expect(saved.grupo).toBe("controle");
    expect(saved.eventos.map((e) => e.evento)).toEqual(["inicio", "aba"]);
    expect(saved.eventos[1]).toEqual({ t: 1500, evento: "aba", aba: "math" });
  });

  it("só guarda números, booleanos e textos curtos: nada de código ou objetos", () => {
    const { log } = makeLog();
    log.log("execucao", { ok: true, objetos: 3, codigo: { texto: "const cena" }, erro: "x".repeat(200) });
    const event = JSON.parse(log.export()).eventos.at(-1);
    expect(event.ok).toBe(true);
    expect(event.objetos).toBe(3);
    expect(event.codigo).toBeUndefined();
    expect(event.erro).toHaveLength(60);
  });

  it("rajadas viram um só evento com a contagem", () => {
    const { log, tick } = makeLog();
    for (let i = 0; i < 5; i++) {
      tick(200);
      log.log("math.hover", { keys: ["position.x"] });
    }
    tick(5000);
    log.log("math.hover", { keys: ["scale.y"] });
    const hovers = JSON.parse(log.export()).eventos.filter((e) => e.evento === "math.hover");
    expect(hovers).toHaveLength(2);
    expect(hovers[0]).toMatchObject({ n: 5, t: 200, ate: 1000 });
  });

  it("continua a sessão depois de recarregar a página, e troca de grupo começa outra", () => {
    const storage = memoryStorage();
    const first = makeLog("controle", storage).log;
    first.log("aba", { aba: "props" });
    expect(first.fresh, "a primeira sessão começa agora").toBe(true);
    const again = makeLog("controle", storage).log;
    expect(again.code).toBe(first.code);
    expect(again.fresh).toBe(false);
    expect(JSON.parse(again.export()).eventos).toHaveLength(2);
    const other = new StudyLog("experimental", { storage, random: (n) => new Uint8Array(n).fill(3), saveDelay: 0 });
    expect(other.code).not.toBe(first.code);
    expect(other.fresh).toBe(true);
    expect(JSON.parse(other.export()).eventos.map((e) => e.evento)).toEqual(["inicio"]);
  });

  it("guarda no máximo os últimos eventos", () => {
    const log = new StudyLog("controle", { storage: memoryStorage(), saveDelay: 60_000 });
    for (let i = 0; i < MAX_EVENTS + 10; i++) log.log("execucao", { i });
    const events = JSON.parse(log.export()).eventos;
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events.at(-1).i).toBe(MAX_EVENTS + 9);
  });

  it("sem armazenamento, o registro fica na memória", () => {
    const storage = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } };
    const log = new StudyLog("controle", { storage, saveDelay: 0 });
    log.log("aba", { aba: "math" });
    expect(JSON.parse(log.export()).eventos).toHaveLength(2);
  });
});

describe("nomes do registro", () => {
  it("um detalhe chamado tipo não apaga o nome do evento", () => {
    const log = new StudyLog("controle", { storage: null, saveDelay: 0 });
    log.log("selecao", { origem: "lista", tipo: "mesh", evento: "outro", t: 99 });
    expect(JSON.parse(log.export()).eventos.at(-1)).toMatchObject({ evento: "selecao", origem: "lista", tipo: "mesh" });
    expect(JSON.parse(log.export()).eventos.at(-1).t).not.toBe(99);
  });
});
