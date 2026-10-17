// coordenadas.js — Laboratório de Coordenadas (p5.js em modo instância)
//
// Os pontos ficam em coordenadas do mundo: origem no centro do canvas, eixo y
// para cima e 1 unidade = 1 px. A tela (y para baixo) só entra em cena na hora
// de desenhar e de ler o mouse, assim a matriz exibida é a mesma usada no desenho.
import p5 from "p5";
import { apply, compose, formatNumber, invert } from "../lib/transform2d.js";
import { isShown, isTypingTarget, onShownChange } from "../lib/dom.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PICK_RADIUS = 10;

const labelFor = (i) =>
  ALPHABET[i % ALPHABET.length] + (i >= ALPHABET.length ? Math.floor(i / ALPHABET.length) : "");

class CoordenadasApp {
  constructor(p) {
    this.p = p;
    this.section = document.getElementById("coords-section");
    this.container = document.getElementById("coords-canvas-container");

    // Geometria (coordenadas do mundo)
    this.points = [];
    this.shape = [];
    this.draggingPoint = null;
    this.selectedPoint = null;

    // Transformações
    this.tx = 0;
    this.ty = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.rotationDeg = 0;
    this.order = "TRS";

    // UX
    this.gridStep = 25;
    this.snapToGrid = false;
    this.measureMode = false;
    this.measureA = null;
    this.measureB = null;
    this._matrixKey = "";

    this.setupUI();
  }

  /* ==================== UI / Abas ==================== */
  setupUI() {
    const byId = (id) => document.getElementById(id);

    // Abas
    document.querySelectorAll(".coord-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".coord-tab").forEach((b) => b.classList.remove("is-active"));
        document.querySelectorAll(".coords-tabpanel").forEach((panel) => panel.classList.remove("is-active"));
        btn.classList.add("is-active");
        byId("tab-" + btn.dataset.tab)?.classList.add("is-active");
      });
    });

    // Construir
    byId("btn-add-point")?.addEventListener("click", () => {
      const sel = byId("primitive-select").value;
      if (sel === "point") this.addPoint();
      if (sel === "triangle") this.addTriangle();
      if (sel === "rectangle") this.addRectangle();
    });
    byId("btn-unir")?.addEventListener("click", () => {
      if (this.points.length >= 3) this.shape = [...this.points];
      else alert("Adicione pelo menos 3 pontos.");
    });
    byId("btn-reset")?.addEventListener("click", () => {
      this.points = [];
      this.shape = [];
      this.selectedPoint = this.draggingPoint = null;
      this.tx = this.ty = 0;
      this.scaleX = this.scaleY = 1;
      this.rotationDeg = 0;
      this.resetSliders();
      this.measureMode = false;
      this.measureA = this.measureB = null;
      byId("btn-measure")?.classList.remove("ghost");
      this.syncInputs();
    });

    byId("chk-snap")?.addEventListener("change", (e) => (this.snapToGrid = e.target.checked));

    // Passo da grade
    const step = byId("grid-step");
    const stepVal = byId("grid-step-value");
    step?.addEventListener("input", (e) => {
      this.gridStep = +e.target.value;
      if (stepVal) stepVal.textContent = `${this.gridStep}px`;
    });
    if (step) this.gridStep = +step.value;
    if (step && stepVal) stepVal.textContent = `${step.value}px`;

    // Toggles de transformação
    const updateGroups = () => {
      byId("group-translate").classList.toggle("hidden", !byId("chk-translate").checked);
      byId("group-rotate").classList.toggle("hidden", !byId("chk-rotate").checked);
      byId("group-scale").classList.toggle("hidden", !byId("chk-scale").checked);
    };
    ["chk-translate", "chk-rotate", "chk-scale"].forEach((id) => {
      const el = byId(id);
      if (el) {
        el.addEventListener("change", updateGroups);
        el.checked = false;
      }
    });
    updateGroups();

    // Sliders
    const bind = (id, cb, suffix = "") => {
      const slider = byId(id);
      const label = byId(id.replace("slider", "value"));
      slider?.addEventListener("input", (e) => {
        cb(+e.target.value);
        if (label) label.textContent = e.target.value + suffix;
      });
    };
    bind("tx-slider", (v) => (this.tx = v));
    bind("ty-slider", (v) => (this.ty = v));
    bind("scale-x-slider", (v) => (this.scaleX = v));
    bind("scale-y-slider", (v) => (this.scaleY = v));
    bind("rot-slider", (v) => (this.rotationDeg = v), "°");

    // Ordem
    byId("order-select")?.addEventListener("change", (e) => (this.order = e.target.value));

    // Medir
    const btnMeasure = byId("btn-measure");
    btnMeasure?.addEventListener("click", () => {
      this.measureMode = !this.measureMode;
      this.measureA = this.measureB = null;
      btnMeasure.classList.toggle("ghost", this.measureMode);
    });

    // Teclado: só quando esta seção está na tela e ninguém está digitando
    window.addEventListener("keydown", (e) => {
      if (!isShown(this.section) || isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        this.measureMode = false;
        this.measureA = this.measureB = null;
        btnMeasure?.classList.remove("ghost");
      }
      if ((e.key === "Delete" || e.key === "Backspace") && this.selectedPoint) {
        this.removePoint(this.selectedPoint);
        e.preventDefault();
      }
    });

    this.updateSliderLabels();
  }

  resetSliders() {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    set("tx-slider", 0);
    set("ty-slider", 0);
    set("scale-x-slider", 1);
    set("scale-y-slider", 1);
    set("rot-slider", 0);
    this.updateSliderLabels();
  }

  updateSliderLabels() {
    const set = (id, v) => {
      const label = document.getElementById(id);
      if (label) label.textContent = v;
    };
    set("tx-value", this.tx);
    set("ty-value", this.ty);
    set("scale-x-value", this.scaleX.toFixed(2));
    set("scale-y-value", this.scaleY.toFixed(2));
    set("rot-value", this.rotationDeg + "°");
  }

  /* ===================== p5 lifecycle ===================== */
  setup() {
    this.p.createCanvas(10, 10);
    this.p.pixelDensity(1);
    this.resizeCanvasToContainer();
    if (!isShown(this.section)) this.p.noLoop();
    onShownChange(this.section, (shown) => {
      if (shown) {
        this.resizeCanvasToContainer();
        this.p.loop();
      } else {
        this.p.noLoop();
      }
    });
  }

  onWindowResized() {
    if (isShown(this.section)) this.resizeCanvasToContainer();
  }

  resizeCanvasToContainer() {
    const wrap = this.container;
    // Canvas grande por padrão: ocupa a largura da coluna da direita e quase toda a altura
    let side = Math.min((wrap?.clientWidth || window.innerWidth) - 16, window.innerHeight - 160);
    side = Math.max(700, Math.floor(side));
    side -= side % 2; // centro em pixel inteiro: grade e eixos ficam nítidos
    if (side !== this.p.width || side !== this.p.height) this.p.resizeCanvas(side, side);
  }

  /* ===================== mundo ↔ tela ===================== */
  toScreen([x, y]) {
    return { x: this.p.width / 2 + x, y: this.p.height / 2 - y };
  }

  toWorld(sx, sy) {
    return [sx - this.p.width / 2, this.p.height / 2 - sy];
  }

  getMatrix() {
    const checked = (id) => !!document.getElementById(id)?.checked;
    return compose({
      order: this.order,
      translate: { enabled: checked("chk-translate"), tx: this.tx, ty: this.ty },
      rotate: { enabled: checked("chk-rotate"), degrees: this.rotationDeg },
      scale: {
        enabled: checked("chk-scale"),
        sx: Math.max(this.scaleX, 0.001),
        sy: Math.max(this.scaleY, 0.001),
      },
    });
  }

  draw() {
    const p = this.p;
    p.background(18);
    this.drawGrid();
    this.drawLegend();

    const M = this.getMatrix();
    this.updateMatrixDisplay(M);

    const world = this.points.map((pt) => apply(M, [pt.x, pt.y]));
    const TP = world.map((w) => this.toScreen(w));

    this.drawShape(TP, [0, 90, 255, 90]);

    TP.forEach((s, i) => {
      const pt = this.points[i];
      if (pt === this.selectedPoint) {
        p.noFill();
        p.stroke("#ffd54f");
        p.strokeWeight(1.5);
        p.ellipse(s.x, s.y, 18, 18);
      }
      p.noStroke();
      p.fill(this.draggingPoint === pt ? "#ffd54f" : "#ff5252");
      p.ellipse(s.x, s.y, 10, 10);
      p.fill(230);
      p.textSize(13);
      p.text(labelFor(i), s.x + 8, s.y - 8);
    });

    if (document.getElementById("chk-show-local")?.checked) {
      p.stroke(150);
      p.strokeWeight(1);
      const O = this.toScreen(apply(M, [0, 0]));
      TP.forEach((s) => p.line(O.x, O.y, s.x, s.y));
    }

    this.drawLocalAxes(M);

    if (document.getElementById("chk-reflect")?.checked) {
      // Espelho em relação ao eixo y (x = 0): (x', y') → (−x', y')
      const mirrored = world.map(([x, y]) => this.toScreen([-x, y]));
      this.drawShape(mirrored, [255, 140, 0, 80]);
      mirrored.forEach((s, i) => {
        p.noStroke();
        p.fill("orange");
        p.ellipse(s.x, s.y, 10, 10);
        p.fill(230);
        p.text(labelFor(i) + "'", s.x + 8, s.y - 8);
      });
      p.stroke(110);
      p.strokeWeight(1);
      p.drawingContext.setLineDash([5, 5]);
      p.line(p.width / 2, 0, p.width / 2, p.height);
      p.drawingContext.setLineDash([]);
    }

    this.drawMeasureOverlay();
    this.syncInputs(world);
  }

  /* ===================== desenho & grid ===================== */
  drawShape(screenPoints, rgba) {
    const p = this.p;
    const idx = this.shape.map((pt) => this.points.indexOf(pt)).filter((i) => i >= 0);
    if (idx.length < 3) return;
    p.noStroke();
    p.fill(...rgba);
    p.beginShape();
    idx.forEach((i) => p.vertex(screenPoints[i].x, screenPoints[i].y));
    p.endShape(p.CLOSE);
  }

  drawGrid() {
    const p = this.p;
    const { width: w, height: h } = p;
    const cx = w / 2;
    const cy = h / 2;
    const step = this.gridStep;

    // Linhas partindo da origem, para que a grade passe por (0, 0)
    p.stroke(52);
    p.strokeWeight(1);
    for (let x = cx % step; x <= w; x += step) p.line(x, 0, x, h);
    for (let y = cy % step; y <= h; y += step) p.line(0, y, w, y);

    p.stroke(0, 180, 90);
    p.strokeWeight(2);
    p.line(0, cy, w, cy); // eixo x
    p.stroke(230, 70, 70);
    p.line(cx, 0, cx, h); // eixo y

    p.noStroke();
    p.fill(160);
    p.textSize(11);
    const step2 = step * 2;
    for (let k = step2; cx + k < w; k += step2) {
      p.text(`${k}`, cx + k + 2, cy - 6);
      p.text(`${-k}`, cx - k + 2, cy - 6);
    }
    for (let k = step2; cy + k < h; k += step2) {
      p.text(`${k}`, cx + 4, cy - k - 2);
      p.text(`${-k}`, cx + 4, cy + k - 2);
    }
  }

  drawLegend() {
    const p = this.p;
    const { width: w, height: h } = p;
    p.noStroke();
    p.fill(200);
    p.textSize(12);
    p.text("Centro (0,0)", w / 2 + 6, h / 2 - 10);
    p.fill(255);
    p.ellipse(w / 2, h / 2, 4, 4);
    p.fill(120);
    p.textSize(11);
    p.text("I", w * 0.75, h * 0.25);
    p.text("II", w * 0.25, h * 0.25);
    p.text("III", w * 0.25, h * 0.75);
    p.text("IV", w * 0.75, h * 0.75);
  }

  drawLocalAxes(M) {
    const p = this.p;
    const L = 80;
    const O = this.toScreen(apply(M, [0, 0]));
    const I = this.toScreen(apply(M, [L, 0]));
    const J = this.toScreen(apply(M, [0, L]));

    p.strokeWeight(2);
    p.stroke(0, 220, 255);
    p.line(O.x, O.y, I.x, I.y);
    this.arrowHead(O, I, p.color(0, 220, 255));
    p.stroke(255, 220, 0);
    p.line(O.x, O.y, J.x, J.y);
    this.arrowHead(O, J, p.color(255, 220, 0));
    p.noStroke();
    p.fill(180);
    p.textSize(12);
    p.text("i'", I.x + 4, I.y - 4);
    p.text("j'", J.x + 4, J.y - 4);
  }

  arrowHead(A, B, col) {
    const p = this.p;
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    const s = 7;
    p.fill(col);
    p.noStroke();
    p.triangle(
      B.x,
      B.y,
      B.x - s * Math.cos(ang - 0.3),
      B.y - s * Math.sin(ang - 0.3),
      B.x - s * Math.cos(ang + 0.3),
      B.y - s * Math.sin(ang + 0.3)
    );
  }

  drawMeasureOverlay() {
    if (!this.measureMode) return;
    const p = this.p;
    if (this.measureA) {
      const A = this.toScreen(this.measureA);
      p.fill(0, 180, 255);
      p.noStroke();
      p.ellipse(A.x, A.y, 6, 6);
    }
    if (this.measureA && this.measureB) {
      const A = this.toScreen(this.measureA);
      const B = this.toScreen(this.measureB);
      p.stroke(0, 180, 255);
      p.strokeWeight(1.5);
      p.line(A.x, A.y, B.x, B.y);
      const dx = this.measureB[0] - this.measureA[0];
      const dy = this.measureB[1] - this.measureA[1];
      const dist = Math.hypot(dx, dy);
      const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      p.noStroke();
      p.fill(230);
      p.textSize(12);
      p.text(`d=${dist.toFixed(1)}px, θ=${ang.toFixed(1)}°`, (A.x + B.x) / 2 + 8, (A.y + B.y) / 2 - 8);
    }
  }

  updateMatrixDisplay(m) {
    const table = document.getElementById("matrix-table");
    if (!table) return;
    const cells = m.map((row) => row.map((v) => formatNumber(v)));
    const key = cells.join("|");
    if (key === this._matrixKey) return; // só reconstrói quando a matriz muda
    this._matrixKey = key;

    table.innerHTML = "";
    const head = document.createElement("tr");
    head.innerHTML = "<th></th><th>x</th><th>y</th><th>w</th>";
    table.appendChild(head);
    ["x'", "y'", "w'"].forEach((name, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th>${name}</th><td>${cells[i][0]}</td><td>${cells[i][1]}</td><td>${cells[i][2]}</td>`;
      table.appendChild(tr);
    });
  }

  /* ===================== inputs de coordenadas ===================== */
  // A lista só é recriada quando o número de pontos muda; no resto do tempo os
  // valores são atualizados no lugar, sem mexer no campo que está sendo editado.
  syncInputs(world) {
    const box = document.getElementById("coords-modifier");
    if (!box) return;
    if (box.children.length !== this.points.length) this.buildInputs(box);

    const M = world ? null : this.getMatrix();
    this.points.forEach((pt, i) => {
      const row = box.children[i];
      const [inX, inY] = row.querySelectorAll("input");
      setIdleValue(inX, pt.x);
      setIdleValue(inY, pt.y);
      const [wx, wy] = world ? world[i] : apply(M, [pt.x, pt.y]);
      const prime = `→ ${labelFor(i)}' (${formatNumber(wx, 1)}, ${formatNumber(wy, 1)})`;
      const out = row.querySelector(".coords-prime");
      if (out.textContent !== prime) out.textContent = prime;
    });
  }

  buildInputs(box) {
    box.innerHTML = "";
    this.points.forEach((pt, i) => {
      const row = document.createElement("div");
      row.className = "coords-row";
      const label = document.createElement("span");
      label.className = "coords-point-label";
      label.textContent = labelFor(i) + ":";

      const field = (axis) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "1";
        input.className = "coords-num";
        input.setAttribute("aria-label", `${axis} de ${labelFor(i)}`);
        input.addEventListener("input", () => {
          const v = parseFloat(input.value);
          if (Number.isFinite(v)) this.points[i][axis] = v;
        });
        return input;
      };

      const prime = document.createElement("span");
      prime.className = "coords-prime mono";
      row.append(label, field("x"), field("y"), prime);
      box.appendChild(row);
    });
  }

  /* ===================== primitivas ===================== */
  addPoint() {
    this.points.push({ x: 0, y: 0 });
    this.syncInputs();
  }

  addTriangle() {
    const s = 80;
    this.points.push({ x: 0, y: s }, { x: -s, y: -s }, { x: s, y: -s });
    this.syncInputs();
  }

  addRectangle() {
    const s = 100;
    this.points.push({ x: -s, y: s }, { x: s, y: s }, { x: s, y: -s }, { x: -s, y: -s });
    this.syncInputs();
  }

  removePoint(pt) {
    const idx = this.points.indexOf(pt);
    if (idx >= 0) this.points.splice(idx, 1);
    this.shape = this.shape.filter((s) => s !== pt);
    if (this.selectedPoint === pt) this.selectedPoint = null;
    if (this.draggingPoint === pt) this.draggingPoint = null;
    this.syncInputs();
  }

  /* ===================== interações p5 ===================== */
  mouseInCanvas() {
    const p = this.p;
    return p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX <= p.width && p.mouseY <= p.height;
  }

  mousePressed() {
    // p5 escuta o mouse na janela inteira: ignora cliques fora do canvas
    if (!isShown(this.section) || !this.mouseInCanvas()) return;
    const p = this.p;

    if (this.measureMode) {
      const P = this.toWorld(p.mouseX, p.mouseY);
      if (!this.measureA) this.measureA = P;
      else if (!this.measureB) this.measureB = P;
      else {
        this.measureA = P;
        this.measureB = null;
      }
      return;
    }

    // Seleciona o ponto desenhado (já transformado) mais próximo do clique
    const M = this.getMatrix();
    for (let i = this.points.length - 1; i >= 0; i--) {
      const s = this.toScreen(apply(M, [this.points[i].x, this.points[i].y]));
      if (Math.hypot(p.mouseX - s.x, p.mouseY - s.y) < PICK_RADIUS) {
        this.draggingPoint = this.points[i];
        this.selectedPoint = this.points[i];
        return;
      }
    }
    this.selectedPoint = null;
  }

  mouseDragged() {
    if (!this.draggingPoint) return;
    const p = this.p;
    const inverse = invert(this.getMatrix());
    if (!inverse) return;

    // O mouse está no espaço transformado; M⁻¹ leva de volta ao ponto original
    const sx = p.constrain(p.mouseX, 0, p.width);
    const sy = p.constrain(p.mouseY, 0, p.height);
    let [x, y] = apply(inverse, this.toWorld(sx, sy));
    if (this.snapToGrid || p.keyIsDown(p.SHIFT)) {
      x = Math.round(x / this.gridStep) * this.gridStep;
      y = Math.round(y / this.gridStep) * this.gridStep;
    }
    this.draggingPoint.x = x;
    this.draggingPoint.y = y;
  }

  mouseReleased() {
    this.draggingPoint = null;
  }
}

function setIdleValue(input, value) {
  if (!input || document.activeElement === input) return;
  const text = String(Math.round(value * 10) / 10);
  if (input.value !== text) input.value = text;
}

/* p5 bootstrap (modo instância: nada de funções globais) */
const container = document.getElementById("coords-canvas-container");
if (container) {
  new p5((p) => {
    const app = new CoordenadasApp(p);
    p.setup = () => app.setup();
    p.draw = () => app.draw();
    p.mousePressed = () => app.mousePressed();
    p.mouseDragged = () => app.mouseDragged();
    p.mouseReleased = () => app.mouseReleased();
    p.windowResized = () => app.onWindowResized();
  }, container);
}
