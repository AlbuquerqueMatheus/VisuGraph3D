// inspector.js — painel de objetos e propriedades. Toda mudança feita aqui vira código.

import { AXES, OBJECT_FLAGS, TRANSFORMS, classInfo, isObject3DKind } from "./engine/catalog.js";
import { candidateKeys } from "./engine/analyze.js";
import { editability, propDef } from "./engine/patch.js";
import { degToRad, formatNumber, radToDeg } from "./engine/format.js";

const KIND_LABEL = { scene: "cena", mesh: "malha", points: "pontos", line: "linha", light: "luz", camera: "câmera", group: "grupo", object: "objeto" };
const CONTEXT_LABEL = { loop: "laço", function: "função", animar: "animar()", conditional: "bloco" };
const TRANSFORM_LABEL = { position: "Posição", rotation: "Rotação (graus)", scale: "Escala" };

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

/** Ângulos aparecem em graus no painel; no código e na cena ficam em radianos. */
const isAngle = (def) => def.unit === "rad";
const toShown = (def, v) => (isAngle(def) ? radToDeg(v) : v);
const fromShown = (def, v) => (isAngle(def) ? degToRad(v) : v);

export class Inspector {
  /**
   * `handlers.select(id)`: escolher um objeto na lista;
   * `handlers.edit(id, key, value, phase)`: phase "live" durante o arraste, "commit" no fim;
   * `handlers.reveal(pos)`: mostrar uma posição no código.
   * `readOnly`: uma mensagem quando o painel só mostra os valores (grupo controle do estudo).
   */
  constructor({ list, panel }, handlers, { readOnly = null } = {}) {
    this.listEl = list;
    this.panelEl = panel;
    this.handlers = handlers;
    this.readOnly = readOnly;
    this.fields = [];
    this.infos = []; // linhas só de leitura, com números da cena (vértices, cópias)
    this.signature = null;
    this.listSignature = null;
    this.analysis = null;
    this.selectedId = null;
    this.runtime = {};
  }

  /** Nova análise e/ou seleção: reconstrói o que mudou de estrutura e atualiza os valores. */
  update(analysis, selectedId, runtime = this.runtime) {
    this.analysis = analysis;
    this.selectedId = selectedId;
    this.runtime = runtime || {};
    this.renderList();
    const obj = selectedId != null && analysis.ok ? analysis.objects[selectedId] : null;
    const signature = obj ? structureOf(analysis, obj) : `vazio:${analysis.ok}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderPanel(obj);
    }
    this.refresh();
  }

  setRuntime(runtime) {
    this.runtime = runtime || {};
    this.refresh();
  }

  renderList() {
    const a = this.analysis;
    const items = a.ok ? a.objects.filter((o) => isObject3DKind(o.kind)) : [];
    const signature = items.map((o) => `${o.id}:${o.name}:${o.local}:${o.className}:${o.context}`).join("|") + `#${this.selectedId}`;
    if (signature === this.listSignature) return;
    this.listSignature = signature;
    this.listEl.replaceChildren(
      ...items.map((o) => {
        const button = el(
          "button",
          { type: "button", class: "lv-object", "data-id": o.id, "data-kind": o.kind, "aria-pressed": String(o.id === this.selectedId) },
          // um objeto criado num laço não tem nome, mas a variável local dele diz o que é
          el("span", { class: "lv-object__name", text: o.name || o.local || `(sem nome)` }),
          el("span", { class: "lv-object__class", text: o.className }),
          o.context !== "top" ? el("span", { class: "lv-badge", text: CONTEXT_LABEL[o.context] }) : null,
        );
        button.addEventListener("click", () => this.handlers.select(o.id));
        return el("li", {}, button);
      }),
    );
    if (!items.length) this.listEl.append(el("li", { class: "lv-empty", text: a.ok ? "Nenhum objeto na cena." : "Corrija o erro no código." }));
  }

  renderPanel(obj) {
    this.fields = [];
    this.infos = [];
    const a = this.analysis;
    if (!obj) {
      this.panelEl.replaceChildren(
        el("p", { class: "lv-hint", text: "Clique num objeto da cena ou da lista para ver e editar as propriedades dele." }),
      );
      return;
    }
    const kind = KIND_LABEL[obj.kind] || "objeto";
    const head = el(
      "header",
      { class: "lv-props__head" },
      el("h2", { text: obj.name || obj.local || `(${kind} sem nome)` }),
      el(
        "p",
        {},
        `THREE.${obj.className} · `,
        this.lineLink(obj.from, `linha ${obj.line}`),
      ),
    );
    const sections = [head];
    if (obj.className === "InstancedMesh") sections.push(this.info(obj, (v) => countText(v?.instances, "cópia desta malha", "cópias desta malha")));
    if (this.readOnly) sections.push(el("p", { class: "lv-note", text: this.readOnly }));
    else if (obj.context !== "top") {
      sections.push(el("p", { class: "lv-note", text: editability(a, obj.id, candidateKeys(obj)[0] || "position.x").message || "" }));
    }
    const keys = candidateKeys(obj);
    for (const prop of Object.keys(TRANSFORMS)) {
      if (!keys.includes(`${prop}.x`)) continue;
      sections.push(this.vectorRow(obj, prop));
    }
    const flags = keys.filter((k) => OBJECT_FLAGS[k]);
    if (flags.length) sections.push(this.group("Objeto", flags.map((k) => this.field(obj, k))));
    const own = Object.keys(classInfo(obj.className).props || {});
    if (own.length) sections.push(this.group(obj.kind === "scene" ? "Cena" : obj.kind === "camera" ? "Câmera" : "Luz", own.map((k) => this.field(obj, k))));
    for (const link of ["geometry", "material"]) {
      const id = obj.links[link];
      if (id == null) continue;
      const linked = a.objects[id];
      const props = Object.keys(classInfo(linked.className).props || {});
      const title = `${link === "geometry" ? "Geometria" : "Material"}: ${linked.className}`;
      const shared = linked.users.length > 1 ? `usado também por ${linked.users.filter((u) => u !== obj.id).map((u) => a.objects[u].name || "outro objeto").join(", ")}` : null;
      const rows = props.map((k) => this.field(linked, k));
      if (link === "geometry") rows.unshift(this.info(linked, (v) => geometryText(v, obj.kind)));
      if (!props.length) rows.push(el("p", { class: "lv-note", text: "Esta classe não tem controles no painel; edite pelo código." }));
      sections.push(this.group(title, rows, shared, linked));
    }
    this.panelEl.replaceChildren(...sections);
  }

  /** Linha que mostra um número lido da cena; `text(valores)` vazio esconde a linha. */
  info(obj, text) {
    const node = el("p", { class: "lv-note lv-info", hidden: true });
    this.infos.push({ obj, node, text });
    return node;
  }

  lineLink(pos, text) {
    const link = el("button", { type: "button", class: "lv-link", text });
    link.addEventListener("click", () => this.handlers.reveal(pos));
    return link;
  }

  group(title, rows, note, linked) {
    const legend = el("legend", {}, title);
    if (linked && linked.name) legend.append(" ", el("code", { text: linked.name }));
    return el("fieldset", { class: "lv-group" }, legend, note ? el("p", { class: "lv-note", text: note }) : null, ...rows);
  }

  vectorRow(obj, prop) {
    const inputs = AXES.map((axis) => {
      const key = `${prop}.${axis}`;
      const def = propDef(obj, key);
      const input = el("input", { type: "number", step: prop === "rotation" ? 5 : def.step, "aria-label": `${def.label} ${axis}`, "data-key": key });
      const label = el("span", { class: `lv-axis lv-axis--${axis}`, text: axis, title: "Arraste para os lados para mudar" });
      const field = { obj, key, def, type: "number", input, label };
      this.bindNumber(field);
      this.fields.push(field);
      return el("label", { class: "lv-vector__axis" }, label, input);
    });
    return el("fieldset", { class: "lv-group lv-vector", "data-prop": prop }, el("legend", {}, TRANSFORM_LABEL[prop]), el("div", { class: "lv-vector__row" }, ...inputs));
  }

  field(obj, key) {
    const def = propDef(obj, key);
    const name = `${def.label}`;
    const why = el("span", { class: "lv-why", hidden: true });
    let field;
    let control;
    if (def.type === "boolean") {
      const input = el("input", { type: "checkbox", "data-key": key });
      field = { obj, key, def, type: "boolean", input, why };
      input.addEventListener("change", () => this.handlers.edit(obj.id, key, input.checked, "commit"));
      control = el("label", { class: "lv-check" }, input, el("span", { text: name }));
      this.fields.push(field);
      return el("div", { class: "lv-row lv-row--check" }, control, why);
    }
    if (def.type === "color") {
      const input = el("input", { type: "color", "data-key": key, "aria-label": name });
      field = { obj, key, def, type: "color", input, why };
      input.addEventListener("input", () => this.handlers.edit(obj.id, key, input.value, "live"));
      input.addEventListener("change", () => this.handlers.edit(obj.id, key, input.value, "commit"));
      control = input;
    } else {
      const input = el("input", { type: "number", step: isAngle(def) ? 1 : def.step, "data-key": key, "aria-label": name });
      const label = el("span", { class: "lv-row__drag", text: "↔", title: "Arraste para os lados para mudar" });
      field = { obj, key, def, type: "number", input, label, why };
      this.bindNumber(field);
      if (def.min != null && def.max != null) {
        const range = el("input", {
          type: "range", min: toShown(def, def.min), max: toShown(def, def.max), step: isAngle(def) ? 1 : def.step, "aria-label": name, tabindex: "-1",
        });
        field.range = range;
        range.addEventListener("input", () => {
          input.value = range.value;
          this.handlers.edit(obj.id, key, fromShown(def, Number(range.value)), "live");
        });
        range.addEventListener("change", () => this.handlers.edit(obj.id, key, fromShown(def, Number(range.value)), "commit"));
        control = el("div", { class: "lv-row__pair" }, range, input);
      } else {
        control = el("div", { class: "lv-row__pair" }, label, input);
      }
    }
    this.fields.push(field);
    return el("label", { class: "lv-row" }, el("span", { class: "lv-row__name", text: name }), control, why);
  }

  bindNumber(field) {
    const { obj, key, def, input, label } = field;
    const parse = () => {
      const v = input.valueAsNumber;
      return Number.isFinite(v) ? fromShown(def, v) : null;
    };
    input.addEventListener("input", () => {
      const v = parse();
      if (v != null) this.handlers.edit(obj.id, key, v, "live");
    });
    input.addEventListener("change", () => {
      const v = parse();
      if (v != null) this.handlers.edit(obj.id, key, v, "commit");
    });
    if (!label) return;
    // arrastar o rótulo muda o valor, como os números do código
    label.addEventListener("pointerdown", (e) => {
      if (input.disabled || e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const start = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      const step = Number(input.step) || 0.1;
      let moved = false;
      label.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const steps = Math.round((ev.clientX - startX) / 4);
        if (!moved && Math.abs(ev.clientX - startX) < 4) return;
        moved = true;
        const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
        let shown = start + steps * step * mult;
        if (def.min != null) shown = Math.max(toShown(def, def.min), shown);
        if (def.max != null) shown = Math.min(toShown(def, def.max), shown);
        input.value = formatNumber(shown, isAngle(def) ? def.decimals : Math.max(def.decimals ?? 2, 0));
        this.handlers.edit(obj.id, key, fromShown(def, shown), "live");
      };
      const up = () => {
        label.removeEventListener("pointermove", move);
        label.removeEventListener("pointerup", up);
        label.removeEventListener("pointercancel", up);
        if (moved) {
          const v = parse();
          if (v != null) this.handlers.edit(obj.id, key, v, "commit");
        }
      };
      label.addEventListener("pointermove", move);
      label.addEventListener("pointerup", up);
      label.addEventListener("pointercancel", up);
    });
  }

  /** Atualiza valores e o estado (editável ou não) de cada campo, sem reconstruir o painel. */
  refresh() {
    const a = this.analysis;
    if (!a || !a.ok) return;
    for (const info of this.infos) {
      const text = info.text(this.runtime[info.obj.id]);
      info.node.textContent = text;
      info.node.hidden = !text;
    }
    for (const f of this.fields) {
      const obj = a.objects[f.obj.id];
      if (!obj) continue;
      f.obj = obj;
      const { editable, message } = this.readOnly ? { editable: false, message: this.readOnly } : editability(a, obj.id, f.key);
      const disabled = !editable;
      f.input.disabled = disabled;
      if (f.range) f.range.disabled = disabled;
      f.input.title = disabled ? message : "";
      if (f.why) {
        f.why.hidden = !disabled || !!this.readOnly; // só leitura: o aviso único fica no topo
        f.why.textContent = disabled ? "só pelo código" : "";
        f.why.title = disabled ? message : "";
      }
      if (f.label) f.label.classList.toggle("is-disabled", disabled);
      if (document.activeElement === f.input) continue;
      const value = this.valueOf(obj, f.key, f.def);
      if (value == null) continue;
      if (f.type === "boolean") f.input.checked = !!value;
      else if (f.type === "color") f.input.value = value;
      else {
        const shown = toShown(f.def, value);
        const decimals = isAngle(f.def) ? f.def.decimals : f.def.transform ? 3 : Math.max(f.def.decimals ?? 2, 2);
        f.input.value = formatNumber(shown, decimals);
        if (f.range && document.activeElement !== f.range) f.range.value = String(shown);
      }
    }
  }

  valueOf(obj, key, def) {
    const state = obj.props[key];
    if (state && state.status === "slot" && state.slot.value != null) return state.slot.value;
    const live = this.runtime[obj.id] && this.runtime[obj.id][key];
    if (live != null) return live;
    if (def.transform === "scale") return 1;
    if (def.transform === "position") return classInfo(obj.className).defaultPosition?.[AXES.indexOf(def.axis)] ?? 0;
    if (def.transform) return 0;
    return def.default;
  }
}

/** "1 cópia", "10.000 cópias"; vazio quando a cena ainda não disse o número. */
function countText(n, one, many) {
  return typeof n === "number" ? `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}` : "";
}

/** "1.000 pontos · atributos position e color": o tamanho da geometria que está na cena. */
function geometryText(values, kind) {
  const count = kind === "points" ? countText(values?.vertices, "ponto", "pontos") : countText(values?.vertices, "vértice", "vértices");
  const names = values?.attributes || [];
  if (!count || !names.length) return count;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `${count} · ${names.length === 1 ? "atributo" : "atributos"} ${list}`;
}

/** O que define a forma do painel: se não mudar, só os valores são atualizados. */
function structureOf(analysis, obj) {
  const parts = [obj.id, obj.className, obj.name, obj.context, ...candidateKeys(obj)];
  for (const link of ["geometry", "material"]) {
    const id = obj.links[link];
    if (id != null) parts.push(link, id, analysis.objects[id].className, analysis.objects[id].users.join(","));
  }
  return parts.join("|");
}
