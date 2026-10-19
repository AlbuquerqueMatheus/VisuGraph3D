// mathPanel.js — o painel "Matemática": as matrizes do objeto selecionado, o caminho de um
// vértice até o pixel e a iluminação medida pela sonda da caixa de vidro.
//
// Cada número do painel sabe de quais literais do código ele depende (data-keys, no formato
// "id:chave" da análise). Passar o mouse num número marca esses literais no editor, e passar
// o mouse num literal do código acende os números que dependem dele.

import { objectMath, parentWorld } from "./mathModel.js";
import { rotationFactors, scaling, translation, rotation as rotationMatrix } from "../lib/transform3d.js";
import { toBytes } from "../lib/phong3d.js";

const AXES = ["x", "y", "z"];
const AXIS_INDEX = { X: 0, Y: 1, Z: 2 };

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
};

/** Número com casas fixas e sinal de menos de verdade, para as colunas alinharem. */
export function fmt(v, decimals = 3) {
  if (!Number.isFinite(v)) return "—";
  const t = (Math.abs(v) < 0.5 * 10 ** -decimals ? 0 : v).toFixed(decimals);
  return t.replace("-", "−");
}
const vec = (v, d = 2) => `(${v.map((x) => fmt(x, d)).join(", ")})`;
const maxDiff = (a, b) => Math.max(...a.flat().map((x, i) => Math.abs(x - b.flat()[i])));

const LIGHT_LABEL = { ambient: "Ambiente", hemisphere: "Hemisfério", directional: "Direcional", point: "Pontual", spot: "Holofote" };

/** Uma matriz 4×4 cujos números são atualizados no lugar (o mouse não perde o destaque). */
class MatrixView {
  constructor(label) {
    this.cells = [];
    const grid = el("div", { class: "lv-mat__grid", role: "table", "aria-label": label });
    for (let i = 0; i < 4; i++) {
      const row = el("div", { class: "lv-mat__row", role: "row" });
      for (let j = 0; j < 4; j++) {
        const cell = el("span", { class: "lv-cell", role: "cell" });
        this.cells.push(cell);
        row.append(cell);
      }
      grid.append(row);
    }
    this.el = el("figure", { class: "lv-mat" }, el("figcaption", { text: label }), grid);
  }

  /** `keys(i, j)`: literais de que o número depende. */
  set(m, keys = () => []) {
    this.cells.forEach((cell, k) => {
      const i = k >> 2;
      const j = k & 3;
      cell.textContent = m ? fmt(m[i][j]) : "—";
      const list = m ? keys(i, j).filter(Boolean) : [];
      if (list.length) cell.dataset.keys = list.join(" ");
      else delete cell.dataset.keys;
    });
  }
}

export class MathPanel {
  /**
   * `handlers`: hover(keys | null) ao passar o mouse num número ligado ao código;
   * vertex(index) ao trocar o vértice; glass(model) ao ligar a caixa de vidro; log(type, data).
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.context = null; // { id, name, className, ids: (screenId) → id da análise, links }
    this.data = null;
    this.probe = null;
    this.glass = null;
    this.vertex = 0;
    this.factors = false;
    this.signature = null;
    this.probeSignature = null;
    this.hoverKeys = null;
    root.addEventListener("mouseover", (e) => this.onHover(e.target.closest?.("[data-keys]")));
    root.addEventListener("mouseleave", () => this.onHover(null));
    this.render();
  }

  onHover(target) {
    const keys = target && this.context?.links ? target.dataset.keys : null;
    if (keys === this.hoverKeys) return;
    this.hoverKeys = keys;
    for (const c of this.root.querySelectorAll(".is-linked")) c.classList.remove("is-linked");
    if (target && keys) target.classList.add("is-linked");
    this.handlers.hover(keys ? keys.split(" ") : null);
    if (keys) this.handlers.log("math.hover", { keys: keys.split(" ").map((k) => k.split(":")[1]) });
  }

  /** Acende os números que dependem do literal `key` ("id:chave") sob o mouse no código. */
  highlightKey(key) {
    for (const c of this.root.querySelectorAll(".is-code-linked")) c.classList.remove("is-code-linked");
    if (!key || !this.context?.links) return;
    for (const c of this.root.querySelectorAll("[data-keys]")) if (c.dataset.keys.split(" ").includes(key)) c.classList.add("is-code-linked");
  }

  setContext(context) {
    const changed = !this.context || !context || this.context.id !== context.id;
    this.context = context;
    if (changed) {
      this.data = null;
      this.vertex = 0;
    }
    this.render();
  }

  setGlass(model) {
    this.glass = model;
    if (!model) this.probe = null;
    this.render();
  }

  setData(msg) {
    if (!this.context || msg.missing) return;
    this.data = msg;
    this.render();
  }

  setProbe(msg) {
    if (!this.glass) return;
    this.probe = msg;
    this.renderProbe();
  }

  // -------------------------------------------------------------------------

  render() {
    const d = this.data;
    const ctx = this.context;
    const signature = ctx
      ? [ctx.id, ctx.links, !!d, !!d && !!parentWorld(d.chain), d?.camera.type, d?.camera.source, this.factors, this.glass].join("|")
      : `vazio:${this.glass}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.build();
    }
    this.update();
  }

  build() {
    const ctx = this.context;
    this.views = {};
    this.live = [];
    this.probeSignature = null;
    const sections = [];
    if (!ctx) {
      sections.push(el("p", { class: "lv-hint", text: "Selecione um objeto para ver as contas que o colocam na tela: a matriz de modelo, a câmera, a projeção e o caminho de um vértice até o pixel." }));
    } else {
      sections.push(
        el(
          "header",
          { class: "lv-props__head" },
          el("h2", { text: ctx.name || "(sem nome)" }),
          el("p", {}, `THREE.${ctx.className} · `, this.text(() => (this.data?.camera.source === "code" ? `vista pela câmera ${this.codeName(this.data.camera) || "do código"}` : "vista pela câmera do editor"))),
        ),
      );
      if (this.data) sections.push(...this.buildMatrices());
      else sections.push(el("p", { class: "lv-hint", text: "Lendo a cena…" }));
    }
    sections.push(this.buildLighting());
    this.root.replaceChildren(...sections);
    this.hoverKeys = null;
  }

  /** Texto que se recalcula a cada atualização. */
  text(fn, attrs = {}) {
    const span = el("span", attrs);
    this.live.push(() => (span.textContent = fn()));
    return span;
  }

  buildMatrices() {
    const d = this.data;
    const hasParent = !!parentWorld(d.chain);
    const out = [];

    const factorsToggle = el("input", { type: "checkbox", checked: this.factors });
    factorsToggle.addEventListener("change", () => {
      this.factors = factorsToggle.checked;
      this.handlers.log("math.factors", { on: this.factors });
      this.render();
    });
    this.views.M = new MatrixView("M");
    const model = el(
      "section",
      { class: "lv-mathsec", "data-sec": "model" },
      el("h3", {}, "Matriz de modelo ", el("span", { class: "lv-formula", text: "M = T · R · S" })),
      el("p", { class: "lv-note", text: "Leva o objeto do espaço dele para o lugar na cena: primeiro escala, depois gira e por último translada." }),
      this.views.M.el,
      el("label", { class: "lv-check" }, factorsToggle, el("span", { text: "Ver T, R e S separadas" })),
    );
    if (this.factors) {
      this.views.T = new MatrixView("T (translação)");
      this.views.R = new MatrixView("R (rotação)");
      this.views.S = new MatrixView("S (escala)");
      this.views.R1 = new MatrixView("");
      this.views.R2 = new MatrixView("");
      this.views.R3 = new MatrixView("");
      const order = el("p", { class: "lv-note" }, this.text(() => this.orderText()));
      const axes = el("details", { class: "lv-details" }, el("summary", { text: "R eixo por eixo" }), order, this.views.R1.el, this.views.R2.el, this.views.R3.el);
      model.append(el("div", { class: "lv-factors" }, this.views.T.el, this.views.R.el, axes, this.views.S.el));
    }
    out.push(model);

    if (hasParent) {
      this.views.P0 = new MatrixView("Mundo do pai");
      this.views.W = new MatrixView("Mundo = pai · M");
      out.push(
        el(
          "section",
          { class: "lv-mathsec", "data-sec": "world" },
          el("h3", {}, "Matriz de mundo ", el("span", { class: "lv-formula", text: "Mundo = M_pai · M" })),
          el("p", { class: "lv-note" }, "O objeto está dentro de ", this.text(() => this.parentName()), ": a matriz dele vem depois da do pai."),
          this.views.P0.el,
          this.views.W.el,
        ),
      );
    }

    this.views.V = new MatrixView("V");
    out.push(
      el(
        "section",
        { class: "lv-mathsec", "data-sec": "view" },
        el("h3", {}, "Visão ", el("span", { class: "lv-formula", text: "V = (mundo da câmera)⁻¹" })),
        el("p", { class: "lv-note", text: "Leva a cena para o ponto de vista da câmera, que fica na origem olhando para −z." }),
        this.views.V.el,
      ),
    );

    this.views.Pj = new MatrixView("P");
    out.push(
      el(
        "section",
        { class: "lv-mathsec", "data-sec": "projection" },
        el("h3", {}, "Projeção ", el("span", { class: "lv-formula", text: d.camera.type === "orthographic" ? "P ortográfica" : "P perspectiva" })),
        el("p", { class: "lv-note" }, this.text(() => this.projectionText())),
        this.views.Pj.el,
      ),
    );

    const prev = el("button", { type: "button", class: "lv-mini", "aria-label": "Vértice anterior", text: "◀" });
    const next = el("button", { type: "button", class: "lv-mini", "aria-label": "Próximo vértice", text: "▶" });
    const step = (k) => {
      const count = this.data?.vertex.count || 0;
      if (!count) return;
      this.vertex = (((this.data.vertex.index + k) % count) + count) % count;
      this.handlers.vertex(this.vertex);
      this.handlers.log("math.vertex", { index: this.vertex });
    };
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    // pontos com w = 1 aparecem com x, y e z; no recorte o w importa e aparece
    const rows = [
      ["p", "no objeto", (m) => m.path.point.slice(0, 3), "point"],
      ["M · p", "no mundo", (m) => m.path.world.slice(0, 3), "world"],
      ["V · mundo", "na câmera", (m) => m.path.eye.slice(0, 3), "eye"],
      ["P · câmera", "recorte (x, y, z, w)", (m) => m.path.clip, "clip"],
      ["÷ w", "NDC", (m) => m.path.ndc, "ndc"],
      ["pixel", "na tela", (m) => m.path.screen, "screen"],
    ];
    const table = el(
      "div",
      { class: "lv-path", role: "table", "aria-label": "Caminho do vértice até o pixel" },
      ...rows.map(([op, label, get, key]) =>
        el(
          "div",
          { class: "lv-path__row", role: "row", "data-step": key },
          el("span", { class: "lv-path__step", role: "cell" }, el("span", { class: "lv-path__op", text: op }), el("span", { class: "lv-path__label", text: label })),
          this.text(() => {
            const m = this.math;
            if (!m?.path) return "—";
            const v = get(m);
            return key === "screen" ? `(${fmt(v[0], 1)}, ${fmt(v[1], 1)}) px` : vec(v, key === "ndc" ? 3 : 2);
          }, { class: "lv-path__value", role: "cell" }),
        ),
      ),
    );
    out.push(
      el(
        "section",
        { class: "lv-mathsec", "data-sec": "path" },
        el("h3", {}, "Do vértice ao pixel"),
        el(
          "div",
          { class: "lv-vsel" },
          prev,
          this.text(() => (this.data?.vertex.count ? `vértice ${this.data.vertex.index + 1} de ${this.data.vertex.count}` : "origem do objeto")),
          next,
        ),
        table,
        el("p", { class: "lv-note" }, this.text(() => this.pathNote())),
        el("p", { class: "lv-verify", "data-verify": "" }, this.text(() => this.verifyText())),
      ),
    );
    return out;
  }

  orderText() {
    const link = this.data?.chain.at(-1);
    if (!link || link.matrix) return "";
    return `R = R${link.order[0]} · R${link.order[1]} · R${link.order[2]} (rotation.order = "${link.order}"): o ponto gira primeiro em ${link.order[2].toLowerCase()}.`;
  }

  parentName() {
    const chain = this.data?.chain || [];
    const parent = chain[chain.length - 2];
    return parent ? this.codeName(parent) || `um ${parent.type}` : "outro objeto";
  }

  /** Nome do objeto no código (a variável), ou o name dele no Three.js. */
  codeName(link) {
    const id = link?.id != null ? this.context?.ids(link.id) : null;
    return (id != null ? this.context?.nameOf?.(id) : null) || link?.name || null;
  }

  projectionText() {
    const c = this.data?.camera;
    if (!c) return "";
    if (c.type === "perspective") {
      const f = c.zoom / Math.tan(((c.fov * Math.PI) / 180) / 2);
      return `fov ${fmt(c.fov, 1)}°, aspecto ${fmt(c.aspect, 2)}, near ${fmt(c.near, 2)}, far ${fmt(c.far, 1)}. f = ${c.zoom !== 1 ? "zoom / " : "1 / "}tan(fov/2) = ${fmt(f, 3)}; x e y saem divididos por −z (o w).`;
    }
    if (c.type === "orthographic") return `Caixa de ${fmt(c.left, 1)} a ${fmt(c.right, 1)} em x e de ${fmt(c.bottom, 1)} a ${fmt(c.top, 1)} em y vira o cubo de −1 a 1. Sem perspectiva: w = 1.`;
    return "Esta câmera usa uma projeção que o painel não decompõe; a matriz é a do Three.js.";
  }

  pathNote() {
    const m = this.math;
    if (!m?.path) return "";
    if (m.path.clip[3] <= 0) return "O vértice está atrás da câmera (w ≤ 0): não aparece na tela.";
    if (!m.path.visible) return "O vértice está fora da vista (algum valor do NDC passa de ±1).";
    return "O círculo rosa no visor está no pixel calculado aqui.";
  }

  verifyText() {
    const d = this.data;
    const m = this.math;
    if (!d || !m) return "";
    const issues = [];
    if (maxDiff(m.world, d.three.world) > 1e-6) issues.push("a matriz de mundo");
    if (!m.view || maxDiff(m.view, d.three.view) > 1e-6) issues.push("a visão");
    if (!m.projection || maxDiff(m.projection, d.three.projection) > 1e-6) issues.push("a projeção");
    const px = m.path ? Math.hypot(m.path.screen[0] - d.three.screen[0], m.path.screen[1] - d.three.screen[1]) : NaN;
    if (issues.length) return `Diferente do Three.js em ${issues.join(", ")}: o código mexe na matriz por outro caminho (matrixAutoUpdate, filmOffset…).`;
    return `✓ Conferido: o Three.js chega nas mesmas matrizes e põe o vértice no mesmo pixel (diferença de ${fmt(px, 2)} px).`;
  }

  /** Literais de que cada número depende, por objeto (ids da análise). */
  keysOf(link, ...props) {
    const id = link?.id != null ? this.context.ids(link.id) : null;
    if (id == null) return [];
    return props.map((p) => `${id}:${p}`);
  }

  update() {
    const d = this.data;
    if (d && this.context) {
      const m = (this.math = objectMath({ ...d, vertex: d.vertex.local }));
      const link = d.chain.at(-1);
      const pos = (i) => this.keysOf(link, `position.${AXES[i]}`);
      const rot = () => this.keysOf(link, "rotation.x", "rotation.y", "rotation.z");
      const scl = (j) => this.keysOf(link, `scale.${AXES[j]}`);
      const local = (i, j) => (i === 3 ? [] : j === 3 ? pos(i) : [...scl(j), ...rot()]);
      this.views.M.set(m.local, local);
      if (this.views.T && link.matrix) for (const k of ["T", "R", "S", "R1", "R2", "R3"]) this.views[k].set(null);
      else if (this.views.T) {
        this.views.T.set(translation(...link.position), (i, j) => (j === 3 && i < 3 ? pos(i) : []));
        this.views.R.set(rotationMatrix(link.rotation, link.order), (i, j) => (i < 3 && j < 3 ? rot() : []));
        this.views.S.set(scaling(...link.scale), (i, j) => (i === j && i < 3 ? scl(i) : []));
        rotationFactors(link.rotation, link.order).forEach((f, k) => {
          const view = this.views[`R${k + 1}`];
          view.el.querySelector("figcaption").textContent = `R${f.axis} (${fmt((link.rotation[AXIS_INDEX[f.axis]] * 180) / Math.PI, 1)}°)`;
          view.set(f.matrix, (i, j) => (i < 3 && j < 3 && i !== AXIS_INDEX[f.axis] && j !== AXIS_INDEX[f.axis] ? this.keysOf(link, `rotation.${f.axis.toLowerCase()}`) : []));
        });
      }
      if (this.views.W) {
        const parentLink = d.chain.at(-2);
        const parentKeys = (i, j) => (i === 3 ? [] : j === 3 ? this.keysOf(parentLink, `position.${AXES[i]}`) : this.keysOf(parentLink, `scale.${AXES[j]}`, "rotation.x", "rotation.y", "rotation.z"));
        this.views.P0.set(m.parent, parentKeys);
        this.views.W.set(m.world, (i, j) => [...local(i, j), ...parentKeys(i, j)]);
      }
      const camLink = d.camera.chain.at(-1);
      this.views.V.set(m.view, (i) => (i < 3 ? this.keysOf(camLink, "position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z") : []));
      const camKeys = (i, j) => {
        if (d.camera.type !== "perspective") return [];
        if ((i === 0 && j === 0) || (i === 1 && j === 1)) return this.keysOf(camLink, "fov");
        if (i === 2 && (j === 2 || j === 3)) return this.keysOf(camLink, "near", "far");
        return [];
      };
      this.views.Pj.set(m.projection, camKeys);
    }
    for (const fn of this.live) fn();
    if (this.root.querySelector("[data-probe]")) this.renderProbe();
  }

  // -------------------------------------------------------------------------
  // Iluminação

  buildLighting() {
    const seg = el("div", { class: "lv-seg lv-seg--small", role: "group", "aria-label": "Caixa de vidro" });
    for (const [model, label] of [[null, "Desligada"], ["phong", "Phong"], ["blinn", "Blinn-Phong"]]) {
      const b = el("button", { type: "button", "data-glass": model ?? "off", "aria-pressed": String(this.glass === model), text: label });
      b.addEventListener("click", () => this.handlers.glass(model));
      seg.append(b);
    }
    return el(
      "section",
      { class: "lv-mathsec", "data-sec": "light" },
      el("h3", {}, "Iluminação ", el("span", { class: "lv-formula", text: "caixa de vidro" })),
      el("p", {
        class: "lv-note",
        text: this.glass
          ? "A cena agora é desenhada por um shader que faz só as contas mostradas aqui. Clique num ponto de um objeto para medir."
          : "Liga um shader que desenha a cena com a fórmula de Phong escrita à mostra. Depois, clique num ponto para ver a conta daquele pixel.",
      }),
      seg,
      this.glass ? el("div", { class: "lv-probe", "data-probe": "" }) : null,
    );
  }

  renderProbe() {
    const box = this.root.querySelector("[data-probe]");
    if (!box) return;
    const p = this.probe;
    const signature = !p ? "nada" : !p.supported ? `x:${p.hit}:${p.materialType}` : [p.model, p.id, p.params.className, ...p.result.ambient.map((a) => a.type), ...p.result.direct.map((t) => t.type + (t.nl > 0))].join("|");
    if (signature !== this.probeSignature) {
      this.probeSignature = signature;
      this.probeLive = [];
      box.replaceChildren(...this.buildProbe(p));
    }
    for (const fn of this.probeLive) fn(p);
    this.paintSwatches();
  }

  /** Texto da sonda que se recalcula a cada medida. */
  ptext(fn, attrs = {}) {
    const span = el("span", attrs);
    this.probeLive.push((p) => (span.textContent = fn(p)));
    return span;
  }

  buildProbe(p) {
    if (!p) return [el("p", { class: "lv-hint", text: "Clique num ponto de um objeto no visor." })];
    if (!p.hit) return [el("p", { class: "lv-hint", text: "Nenhum objeto neste pixel. Clique em cima de um objeto." })];
    if (!p.supported) {
      return [el("p", { class: "lv-hint", text: `${p.materialType || "Este objeto"} não segue o modelo de Phong: fica com o shader do Three.js.` })];
    }
    const ids = this.context?.ids ?? (() => null);
    const meshId = p.id != null ? ids(p.id) : null;
    const matKey = (k) => (meshId != null && this.context?.material?.(meshId) != null ? `${this.context.material(meshId)}:${k}` : null);
    const lightKeys = (light, ...keys) => {
      const id = light.screenId != null ? ids(light.screenId) : null;
      return id == null ? null : keys.map((k) => `${id}:${k}`).join(" ");
    };
    // nome da luz no código (a variável), ou o name dela no Three.js
    const lightTitle = (type, light) => {
      const id = light.screenId != null ? ids(light.screenId) : null;
      const name = (id != null ? this.context?.nameOf?.(id) : null) || light.name;
      return `${LIGHT_LABEL[type]}${name ? ` · ${name}` : ""}`;
    };
    const blinn = p.model === "blinn";
    const t = p.terms;
    const out = [];
    out.push(
      el(
        "div",
        { class: "lv-probe__head" },
        el("span", { class: "lv-swatch", "data-swatch": "formula" }),
        this.ptext((q) => `Fórmula: (${toBytes(q.result.rgb).join(", ")})`),
        el("span", { class: "lv-swatch", "data-swatch": "pixel" }),
        this.ptext((q) => `Tela: (${q.pixel.join(", ")})`),
      ),
      el("p", { class: "lv-verify", "data-verify": "probe" }, this.ptext((q) => probeVerdict(q))),
      el(
        "dl",
        { class: "lv-terms" },
        el("dt", { text: "Ponto" }), el("dd", {}, this.ptext((q) => vec(q.point))),
        el("dt", { text: "n (normal)" }), el("dd", {}, this.ptext((q) => vec(q.normal))),
        el("dt", { text: "v (observador)" }), el("dd", {}, this.ptext((q) => vec(q.result.v))),
      ),
    );
    const mat = el(
      "dl",
      { class: "lv-terms" },
      el("dt", { text: "Kd" }), el("dd", { "data-keys": matKey("color") }, this.ptext((q) => vec(q.terms.Kd, 3))),
      t.lit ? el("dt", { text: "Ks" }) : null, t.lit ? el("dd", { "data-keys": matKey(t.approx ? "metalness" : "specular") }, this.ptext((q) => vec(q.terms.Ks, 3))) : null,
      t.lit ? el("dt", { text: "n (brilho)" }) : null, t.lit ? el("dd", { "data-keys": matKey(t.approx ? "roughness" : "shininess") }, this.ptext((q) => fmt(q.terms.n, 1))) : null,
      t.Ke.some((c) => c > 0) ? el("dt", { text: "Ke (emitida)" }) : null, t.Ke.some((c) => c > 0) ? el("dd", { "data-keys": matKey("emissive") }, this.ptext((q) => vec(q.terms.Ke, 3))) : null,
    );
    out.push(el("h4", {}, `Material: ${p.params.className}`), mat);
    if (!t.lit) out.push(el("p", { class: "lv-note", text: "Sem iluminação: a cor do pixel é a própria cor do material, I = Kd." }));
    if (t.approx) out.push(el("p", { class: "lv-note", text: "Este material usa outro modelo (PBR). Aqui ele vira um Phong aproximado: Kd = cor · (1 − metal), Ks = mistura de 0,04 e da cor pelo metal, n = 2 / aspereza⁴ − 2." }));
    if (p.params.hasMap) out.push(el("p", { class: "lv-note", text: "A textura (map) fica de fora: a caixa de vidro usa só a cor do material." }));

    p.result.ambient.forEach((a, k) => {
      const light = { ...a.light, screenId: p.lightIds?.[p.lights.indexOf(a.light)] };
      out.push(
        el("h4", {}, lightTitle(a.type, light)),
        el(
          "dl",
          { class: "lv-terms" },
          el("dt", { text: "L = cor × intensidade ÷ π" }),
          el("dd", { "data-keys": lightKeys(light, "color", "intensity", "groundColor") }, this.ptext((q) => vec(q.result.ambient[k].L, 3))),
          el("dt", { text: "Kd ⊙ L" }),
          el("dd", {}, this.ptext((q) => vec(q.result.ambient[k].I, 3))),
        ),
      );
    });
    p.result.direct.forEach((d, k) => {
      const light = { ...d.light, screenId: p.lightIds?.[p.lights.indexOf(d.light)] };
      const term = (q) => q.result.direct[k];
      const rows = [
        el("dt", { text: "l (para a luz)" }), el("dd", { "data-keys": lightKeys(light, "position.x", "position.y", "position.z") }, this.ptext((q) => vec(term(q).l))),
        el("dt", { text: d.attenuation !== 1 ? "L (com atenuação)" : "L = cor × intensidade ÷ π" }),
        el("dd", { "data-keys": lightKeys(light, "color", "intensity", "distance", "decay", "angle", "penumbra") }, this.ptext((q) => vec(term(q).L, 3))),
        el("dt", { text: "n · l" }), el("dd", {}, this.ptext((q) => fmt(term(q).nl))),
        el("dt", { text: "difusa = Kd ⊙ L · max(0, n·l)" }), el("dd", {}, this.ptext((q) => vec(term(q).diffuse, 3))),
      ];
      if (t.lit && d.nl > 0) {
        rows.push(
          el("dt", { text: blinn ? "h = (l + v) / |l + v|" : "r = 2(n·l)n − l" }), el("dd", {}, this.ptext((q) => vec(blinn ? term(q).h : term(q).r))),
          el("dt", { text: blinn ? "n · h" : "r · v" }), el("dd", {}, this.ptext((q) => fmt(term(q).base))),
          el("dt", { text: blinn ? "(n·h)ⁿ" : "(r·v)ⁿ" }), el("dd", {}, this.ptext((q) => fmt(term(q).pow, 4))),
          el("dt", { text: `especular = Ks ⊙ L · ${blinn ? "(n·h)ⁿ" : "(r·v)ⁿ"}` }), el("dd", {}, this.ptext((q) => vec(term(q).specular, 3))),
        );
      } else if (t.lit) {
        rows.push(el("dt", { text: "especular" }), el("dd", { text: "0 (a luz está atrás da superfície)" }));
      }
      out.push(el("h4", {}, lightTitle(d.type, light)), el("dl", { class: "lv-terms" }, ...rows));
    });
    if (p.ignored) out.push(el("p", { class: "lv-note", text: `${p.ignored} luz(es) ficaram de fora (tipo sem modelo aqui, ou mais de 8).` }));
    out.push(
      el(
        "dl",
        { class: "lv-terms lv-terms--sum" },
        el("dt", { text: "I = soma de tudo" }), el("dd", {}, this.ptext((q) => vec(q.result.sum, 3))),
        el("dt", { text: "limitada a [0, 1] × 255" }), el("dd", {}, this.ptext((q) => `(${toBytes(q.result.rgb).join(", ")})`)),
      ),
      el("p", { class: "lv-note", text: "Sem correção de gama: as cores entram como estão no código (0 a 1), como no livro. Por isso os meios-tons saem mais escuros que no Three.js." }),
    );
    return out;
  }

  /** Cores das amostras da sonda (fora do ciclo de texto). */
  paintSwatches() {
    const p = this.probe;
    if (!p?.supported) return;
    const f = this.root.querySelector('[data-swatch="formula"]');
    const s = this.root.querySelector('[data-swatch="pixel"]');
    if (f) f.style.background = `rgb(${toBytes(p.result.rgb).join(",")})`;
    if (s) s.style.background = `rgb(${p.pixel.join(",")})`;
  }
}

/** Fórmula e pixel batem? Cada canal pode diferir de 1 ou 2 pelo arredondamento da placa. */
export function probeVerdict(p) {
  const formula = toBytes(p.result.rgb);
  const diff = Math.max(...formula.map((c, i) => Math.abs(c - p.pixel[i])));
  if (p.transparent) return "O material é transparente: o pixel mistura este objeto com o que está atrás.";
  if (diff <= 2) return `✓ O pixel da tela é o da fórmula (diferença máxima de ${diff} em 255).`;
  return `O pixel difere da fórmula em até ${diff} de 255: talvez outro objeto cubra este ponto.`;
}
