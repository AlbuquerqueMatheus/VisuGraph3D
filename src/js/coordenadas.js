// coordenadas.js — Laboratório de Coordenadas (p5.js) — canvas grande por padrão

class CoordenadasApp {
  constructor() {
    // Geometria
    this.points = [];
    this.shape = [];
    this.draggingPoint = null;
    this.selectedPoint = null;
    this.alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

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

    this.setupUI();
  }

  /* ==================== UI / Abas ==================== */
  setupUI() {
    // Abas
    document.querySelectorAll(".coord-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".coord-tab")
          .forEach((b) => b.classList.remove("is-active"));
        document
          .querySelectorAll(".coords-tabpanel")
          .forEach((p) => p.classList.remove("is-active"));
        btn.classList.add("is-active");
        document
          .getElementById("tab-" + btn.dataset.tab)
          .classList.add("is-active");
      });
    });

    // Construir
    document.getElementById("btn-add-point")?.addEventListener("click", () => {
      const sel = document.getElementById("primitive-select").value;
      if (sel === "point") this.addPoint();
      if (sel === "triangle") this.addTriangle();
      if (sel === "rectangle") this.addRectangle();
    });
    document.getElementById("btn-unir")?.addEventListener("click", () => {
      if (this.points.length >= 3) this.shape = [...this.points];
      else alert("Adicione pelo menos 3 pontos.");
    });
    document.getElementById("btn-reset")?.addEventListener("click", () => {
      this.points = [];
      this.shape = [];
      this.tx = this.ty = 0;
      this.scaleX = this.scaleY = 1;
      this.rotationDeg = 0;
      this.updateSliderLabels();
      this.measureMode = false;
      this.measureA = this.measureB = null;
      this.updateInputs();
    });

    // Checkboxes gerais
    document
      .getElementById("chk-show-local")
      ?.addEventListener("change", () => this.updateInputs());
    document
      .getElementById("chk-snap")
      ?.addEventListener("change", (e) => (this.snapToGrid = e.target.checked));
    document
      .getElementById("chk-reflect")
      ?.addEventListener("change", () => {});

    // Passo da grade
    const step = document.getElementById("grid-step");
    const stepVal = document.getElementById("grid-step-value");
    step?.addEventListener("input", (e) => {
      this.gridStep = +e.target.value;
      if (stepVal) stepVal.textContent = `${this.gridStep}px`;
    });
    if (step && stepVal) stepVal.textContent = `${step.value}px`;

    // Toggles de transformação
    const updateGroups = () => {
      const T = document.getElementById("chk-translate").checked;
      const R = document.getElementById("chk-rotate").checked;
      const S = document.getElementById("chk-scale").checked;
      document.getElementById("group-translate").classList.toggle("hidden", !T);
      document.getElementById("group-rotate").classList.toggle("hidden", !R);
      document.getElementById("group-scale").classList.toggle("hidden", !S);
    };
    ["chk-translate", "chk-rotate", "chk-scale"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", updateGroups);
        el.checked = false;
      }
    });
    updateGroups();

    // Sliders
    const bind = (id, cb, suffix = "") => {
      const sl = document.getElementById(id);
      const lb = document.getElementById(id.replace("slider", "value"));
      if (sl) {
        sl.addEventListener("input", (e) => {
          cb(+e.target.value);
          if (lb) lb.textContent = e.target.value + suffix;
        });
      }
    };
    bind("tx-slider", (v) => (this.tx = v));
    bind("ty-slider", (v) => (this.ty = v));
    bind("scale-x-slider", (v) => (this.scaleX = v));
    bind("scale-y-slider", (v) => (this.scaleY = v));
    bind("rot-slider", (v) => (this.rotationDeg = v), "°");

    // Ordem
    document
      .getElementById("order-select")
      ?.addEventListener("change", (e) => (this.order = e.target.value));

    // Medir
    const btnMeasure = document.getElementById("btn-measure");
    btnMeasure?.addEventListener("click", () => {
      this.measureMode = !this.measureMode;
      this.measureA = this.measureB = null;
      btnMeasure.classList.toggle("ghost", this.measureMode);
    });

    // Teclado
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.measureMode = false;
        this.measureA = this.measureB = null;
        btnMeasure?.classList.remove("ghost");
      }
      if ((e.key === "Delete" || e.key === "Backspace") && this.selectedPoint) {
        const idx = this.points.indexOf(this.selectedPoint);
        if (idx >= 0) this.points.splice(idx, 1);
        this.selectedPoint = null;
      }
    });

    this.updateSliderLabels();
  }

  updateSliderLabels() {
    const set = (id, v, s = "") => {
      const lb = document.getElementById(id);
      if (lb) lb.textContent = v + s;
    };
    set("tx-value", this.tx);
    set("ty-value", this.ty);
    set("scale-x-value", this.scaleX.toFixed(2));
    set("scale-y-value", this.scaleY.toFixed(2));
    set("rot-value", this.rotationDeg + "°");
  }

  /* ===================== p5 lifecycle ===================== */
  setup() {
    const parent = document.getElementById("coords-canvas-container");
    this.canvas = createCanvas(10, 10).parent(parent);
    pixelDensity(1);
    this.resizeCanvasToContainer();
  }
  onWindowResized() {
    this.resizeCanvasToContainer();
  }
  resizeCanvasToContainer() {
    const wrap = document.getElementById("coords-canvas-container");
    // Canvas grande por padrão: ocupa largura da coluna da direita e quase toda a altura
    let side = Math.min(
      (wrap.clientWidth || window.innerWidth) - 16,
      window.innerHeight - 160
    );
    side = Math.max(700, side); // nunca menor que 700 (ajuste se quiser)
    resizeCanvas(side, side);
  }

  draw() {
    background(18);
    this.drawGrid();
    this.drawLegend();

    const M = this.getTransformationMatrix();
    this.updateMatrixDisplay(M);

    const TP = this.points.map((p) => {
      const x = p.x - width / 2,
        y = p.y - height / 2;
      const [nx, ny] = this.applyMatrix(M, [x, y, 1]);
      return { x: nx + width / 2, y: ny + height / 2 };
    });

    if (this.shape.length > 1) {
      noStroke();
      fill(0, 90, 255, 90);
      beginShape();
      this.shape.forEach((p0) => {
        const i = this.points.indexOf(p0);
        vertex(TP[i].x, TP[i].y);
      });
      endShape(CLOSE);
    }

    TP.forEach((p, i) => {
      noStroke();
      fill(this.draggingPoint === this.points[i] ? "#ffd54f" : "#ff5252");
      ellipse(p.x, p.y, 10, 10);
      fill(230);
      textSize(13);
      text(this.alphabet[i], p.x + 8, p.y - 8);
    });

    if (document.getElementById("chk-show-local")?.checked) {
      stroke(150);
      const [ox, oy] = this.applyMatrix(M, [0, 0, 1]);
      const O = { x: ox + width / 2, y: oy + height / 2 };
      TP.forEach((p) => line(O.x, O.y, p.x, p.y));
    }

    this.drawLocalAxes(M);

    if (document.getElementById("chk-reflect")?.checked) {
      const R = TP.map((p) => ({ x: width - p.x, y: p.y }));
      if (this.shape.length > 1) {
        noStroke();
        fill(255, 140, 0, 80);
        beginShape();
        this.shape.forEach((p0) => {
          const i = this.points.indexOf(p0);
          vertex(R[i].x, R[i].y);
        });
        endShape(CLOSE);
      }
      R.forEach((p, i) => {
        noStroke();
        fill("orange");
        ellipse(p.x, p.y, 10, 10);
        fill(230);
        text(this.alphabet[i] + "'", p.x + 8, p.y - 8);
      });
      stroke(110);
      strokeWeight(1);
      drawingContext.setLineDash([5, 5]);
      line(width / 2, 0, width / 2, height);
      drawingContext.setLineDash([]);
    }

    this.drawMeasureOverlay();
    this.updateInputs();
  }

  /* ===================== desenho & grid ===================== */
  drawGrid() {
    stroke(52);
    strokeWeight(1);
    for (let x = 0; x <= width; x += this.gridStep) line(x, 0, x, height);
    for (let y = 0; y <= height; y += this.gridStep) line(0, y, width, y);

    stroke(0, 180, 90);
    strokeWeight(2);
    line(0, height / 2, width, height / 2); // x
    stroke(230, 70, 70);
    line(width / 2, 0, width / 2, height); // y

    noStroke();
    fill(160);
    textSize(11);
    const step2 = this.gridStep * 2;
    for (let x = width / 2 + step2; x < width; x += step2)
      text(`${x - width / 2}`, x + 2, height / 2 - 6);
    for (let x = width / 2 - step2; x > 0; x -= step2)
      text(`${x - width / 2}`, x + 2, height / 2 - 6);
    for (let y = height / 2 + step2; y < height; y += step2)
      text(`${-(y - height / 2)}`, width / 2 + 4, y - 2);
    for (let y = height / 2 - step2; y > 0; y -= step2)
      text(`${-(y - height / 2)}`, width / 2 + 4, y - 2);
  }

  drawLegend() {
    noStroke();
    fill(200);
    textSize(12);
    text("Centro (0,0)", width / 2 + 6, height / 2 - 10);
    fill(255);
    ellipse(width / 2, height / 2, 4, 4);
    fill(120);
    textSize(11);
    text("I", width * 0.75, height * 0.25);
    text("II", width * 0.25, height * 0.25);
    text("III", width * 0.25, height * 0.75);
    text("IV", width * 0.75, height * 0.75);
  }

  drawLocalAxes(M) {
    const [ox, oy] = this.applyMatrix(M, [0, 0, 1]);
    const O = { x: ox + width / 2, y: oy + height / 2 };
    const L = 80;
    const [ix, iy] = this.applyMatrix(M, [L, 0, 1]);
    const [jx, jy] = this.applyMatrix(M, [0, L, 1]);
    const I = { x: ix + width / 2, y: iy + height / 2 };
    const J = { x: jx + width / 2, y: jy + height / 2 };

    strokeWeight(2);
    stroke(0, 220, 255);
    line(O.x, O.y, I.x, I.y);
    this.arrowHead(O, I, color(0, 220, 255));
    stroke(255, 220, 0);
    line(O.x, O.y, J.x, J.y);
    this.arrowHead(O, J, color(255, 220, 0));
    noStroke();
    fill(180);
    textSize(12);
    text("i'", I.x + 4, I.y - 4);
    text("j'", J.x + 4, J.y - 4);
  }
  arrowHead(A, B, col) {
    const ang = Math.atan2(B.y - A.y, B.x - A.x),
      s = 7;
    fill(col);
    noStroke();
    triangle(
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
    stroke(0, 180, 255);
    strokeWeight(1.5);
    if (this.measureA) {
      fill(0, 180, 255);
      noStroke();
      ellipse(this.measureA.x, this.measureA.y, 6, 6);
    }
    if (this.measureA && this.measureB) {
      stroke(0, 180, 255);
      line(this.measureA.x, this.measureA.y, this.measureB.x, this.measureB.y);
      const dx = this.measureB.x - this.measureA.x,
        dy = this.measureB.y - this.measureA.y;
      const dist = Math.hypot(dx, dy);
      const ang = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
      noStroke();
      fill(230);
      textSize(12);
      text(
        `d=${dist.toFixed(1)}px, θ=${ang.toFixed(1)}°`,
        (this.measureA.x + this.measureB.x) / 2 + 8,
        (this.measureA.y + this.measureB.y) / 2 - 8
      );
    }
  }

  /* ===================== álgebra ===================== */
  getTransformationMatrix() {
    const rad = radians(this.rotationDeg),
      c = cos(rad),
      s = sin(rad);
    const Tchecked = document.getElementById("chk-translate")?.checked;
    const Rchecked = document.getElementById("chk-rotate")?.checked;
    const Schecked = document.getElementById("chk-scale")?.checked;

    const sx = Schecked ? Math.max(this.scaleX, 0.001) : 1;
    const sy = Schecked ? Math.max(this.scaleY, 0.001) : 1;

    const S = [
      [sx, 0, 0],
      [0, sy, 0],
      [0, 0, 1],
    ];
    const R = Rchecked
      ? [
          [c, -s, 0],
          [s, c, 0],
          [0, 0, 1],
        ]
      : [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
    const T = Tchecked
      ? [
          [1, 0, this.tx],
          [0, 1, this.ty],
          [0, 0, 1],
        ]
      : [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];

    const mul = (A, B) => this.multiplyMatrices(A, B);
    const dict = { T, R, S };
    const chain = (ord) => mul(mul(dict[ord[0]], dict[ord[1]]), dict[ord[2]]);
    return chain(this.order);
  }
  multiplyMatrices(a, b) {
    const r = Array.from({ length: 3 }, () => Array(3).fill(0));
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j];
    return r;
  }
  applyMatrix(m, [x, y, w]) {
    const nx = m[0][0] * x + m[0][1] * y + m[0][2] * w;
    const ny = m[1][0] * x + m[1][1] * y + m[1][2] * w;
    return [nx, ny];
  }
  updateMatrixDisplay(m) {
    const t = document.getElementById("matrix-table");
    if (!t) return;
    t.innerHTML = "";
    const head = document.createElement("tr");
    head.innerHTML = "<th></th><th>x</th><th>y</th><th>w</th>";
    t.appendChild(head);
    const L = ["x'", "y'", "w'"];
    for (let i = 0; i < 3; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th>${L[i]}</th>
        <td>${m[i][0].toFixed(2)}</td>
        <td>${m[i][1].toFixed(2)}</td>
        <td>${m[i][2].toFixed(2)}</td>`;
      t.appendChild(tr);
    }
  }

  /* ===================== inputs coords ===================== */
  updateInputs() {
    const useLocal = document.getElementById("chk-show-local")?.checked;
    const box = document.getElementById("coords-modifier");
    if (!box) return;
    box.innerHTML = "";
    this.points.forEach((p, i) => {
      const lx = p.x - width / 2,
        ly = p.y - height / 2;
      const r = document.createElement("div");
      r.className = "coords-row";
      const lbl = document.createElement("span");
      lbl.className = "coords-point-label";
      lbl.textContent = this.alphabet[i] + ":";
      const nx = document.createElement("input");
      nx.type = "number";
      nx.className = "coords-num";
      nx.value = (useLocal ? lx : p.x).toFixed(0);
      const ny = document.createElement("input");
      ny.type = "number";
      ny.className = "coords-num";
      ny.value = (useLocal ? ly : p.y).toFixed(0);
      nx.addEventListener("change", () => {
        const v = +nx.value;
        p.x = useLocal ? v + width / 2 : v;
      });
      ny.addEventListener("change", () => {
        const v = +ny.value;
        p.y = useLocal ? v + height / 2 : v;
      });
      r.append(lbl, nx, ny);
      box.appendChild(r);
    });
  }

  /* ===================== primitivas ===================== */
  addPoint() {
    this.points.push({ x: width / 2, y: height / 2 });
    this.updateInputs();
  }
  addTriangle() {
    const c = { x: width / 2, y: height / 2 },
      s = 80;
    this.points.push(
      { x: c.x, y: c.y - s },
      { x: c.x - s, y: c.y + s },
      { x: c.x + s, y: c.y + s }
    );
    this.updateInputs();
  }
  addRectangle() {
    const c = { x: width / 2, y: height / 2 },
      s = 100;
    this.points.push(
      { x: c.x - s, y: c.y - s },
      { x: c.x + s, y: c.y - s },
      { x: c.x + s, y: c.y + s },
      { x: c.x - s, y: c.y + s }
    );
    this.updateInputs();
  }

  /* ===================== interações p5 ===================== */
  mousePressed() {
    if (this.measureMode) {
      const P = { x: mouseX, y: mouseY };
      if (!this.measureA) this.measureA = P;
      else if (!this.measureB) this.measureB = P;
      else {
        this.measureA = P;
        this.measureB = null;
      }
      return;
    }
    for (const p of this.points) {
      if (dist(mouseX, mouseY, p.x, p.y) < 10) {
        this.draggingPoint = p;
        this.selectedPoint = p;
        return;
      }
    }
    this.selectedPoint = null;
  }
  mouseDragged() {
    if (!this.draggingPoint) return;
    const snap = this.snapToGrid || keyIsDown(SHIFT);
    let nx = mouseX,
      ny = mouseY;
    if (snap) {
      nx = Math.round(nx / this.gridStep) * this.gridStep;
      ny = Math.round(ny / this.gridStep) * this.gridStep;
    }
    this.draggingPoint.x = constrain(nx, 0, width);
    this.draggingPoint.y = constrain(ny, 0, height);
  }
  mouseReleased() {
    this.draggingPoint = null;
  }
}

/* p5 bootstrap */
const coordenadasApp = new CoordenadasApp();
function setup() {
  coordenadasApp.setup();
}
function draw() {
  coordenadasApp.draw();
}
function mousePressed() {
  coordenadasApp.mousePressed();
}
function mouseDragged() {
  coordenadasApp.mouseDragged();
}
function mouseReleased() {
  coordenadasApp.mouseReleased();
}
function windowResized() {
  coordenadasApp.onWindowResized();
}
