// bridge.js — o lado do editor na conversa com o visor (iframe).

const RUN_TIMEOUT_MS = 3000;

export class ViewportBridge {
  /** `onMessage(msg)` recebe tudo o que o visor manda; `onHang()` é chamado se uma execução travar. */
  constructor(iframe, { onMessage, onHang }) {
    this.iframe = iframe;
    this.onMessage = onMessage;
    this.onHang = onHang;
    this.ready = false;
    this.queue = [];
    this.watchdog = null;
    this.waitingRun = null;
    window.addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.source !== "visugraph-viewport") return;
      if (msg.type === "ready") {
        this.ready = true;
        const queued = this.queue;
        this.queue = [];
        for (const m of queued) m.type === "run" ? this.run(m) : this.send(m);
      }
      if (msg.type === "ran" && msg.runId === this.waitingRun) this.clearWatchdog();
      this.onMessage(msg);
    });
  }

  send(msg) {
    if (!this.ready) {
      this.queue.push(msg);
      return;
    }
    const origin = window.location.origin === "null" ? "*" : window.location.origin;
    this.iframe.contentWindow.postMessage({ source: "visugraph-editor", ...msg }, origin);
  }

  /** Manda o código para rodar e reinicia o visor se não houver resposta a tempo. */
  run(msg) {
    if (!this.ready) {
      // só a última execução pendente importa
      this.queue = this.queue.filter((m) => m.type !== "run");
      this.queue.push({ ...msg, type: "run" });
      return;
    }
    this.clearWatchdog();
    this.waitingRun = msg.runId;
    this.send({ ...msg, type: "run" });
    const started = performance.now();
    this.watchdog = setTimeout(() => {
      // Se a página inteira ficou presa, este timer dispara atrasado junto com a resposta:
      // espera mais um instante para a resposta chegar antes de reiniciar o visor.
      this.watchdog = setTimeout(() => {
        if (this.waitingRun !== msg.runId) return;
        this.waitingRun = null;
        this.reset();
        this.onHang(performance.now() - started);
      }, 100);
    }, RUN_TIMEOUT_MS);
  }

  clearWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = null;
    this.waitingRun = null;
  }

  /** Recarrega o visor do zero (depois de um travamento). */
  reset() {
    this.ready = false;
    this.queue = [];
    this.iframe.contentWindow.location.reload();
  }
}
