class CoordenadasApp {
  constructor() {
    this.points = [];
    this.shape = [];
    this.draggingPoint = null;
    this.alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    this.tx = 0;
    this.ty = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.rotationDeg = 0;

    this.setupUI();
  }

  setupUI() {
    const setSlider = (id, value, labelSuffix = "") => {
      const slider = document.getElementById(id);
      const label = document.getElementById(id.replace("slider", "value"));
      if (slider && label) {
        slider.value = value;
        label.textContent = value + labelSuffix;
      }
    };

    const sliders = [
      ["tx-slider", (v) => (this.tx = +v)],
      ["ty-slider", (v) => (this.ty = +v)],
      ["scale-x-slider", (v) => (this.scaleX = +v)],
      ["scale-y-slider", (v) => (this.scaleY = +v)],
      ["rot-slider", (v) => (this.rotationDeg = +v)],
    ];

    sliders.forEach(([id, setVal]) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", (e) => {
          setVal(e.target.value);
          this.updateSliderLabel(id, e.target.value);
        });
      }
    });

    document.getElementById("add-point")?.addEventListener("click", () => {
      if (this.points.length < this.alphabet.length) {
        this.points.push({ x: width / 2, y: height / 2 });
        this.updateInputs();
      }
    });

    document.getElementById("unir-pontos")?.addEventListener("click", () => {
      if (this.points.length >= 3) {
        this.shape = [...this.points];
      } else {
        alert("Adicione pelo menos 3 pontos.");
      }
    });

    document.getElementById("reset-canvas")?.addEventListener("click", () => {
      this.points = [];
      this.shape = [];

      this.tx = 0;
      this.ty = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this.rotationDeg = 0;

      setSlider("tx-slider", 0);
      setSlider("ty-slider", 0);
      setSlider("scale-x-slider", 1);
      setSlider("scale-y-slider", 1);
      setSlider("rot-slider", 0, "°");

      this.updateInputs();
    });

    document
      .getElementById("toggle-coordinates")
      ?.addEventListener("change", () => this.updateInputs());

    document.getElementById("object-type")?.addEventListener("change", (e) => {
      const type = e.target.value;
      if (type === "triangle") this.addTriangle();
      else if (type === "rectangle") this.addRectangle();
      else this.addPoint();
    });
    // Atualiza visibilidade dos grupos de sliders
    const updateSliderGroups = () => {
      const sets = [
        ["toggle-translate", "group-translate"],
        ["toggle-rotate", "group-rotate"],
        ["toggle-scale", "group-scale"],
      ];
      sets.forEach(([checkboxId, groupId]) => {
        const checkbox = document.getElementById(checkboxId);
        const group = document.getElementById(groupId);
        if (checkbox && group) {
          group.classList.toggle("hidden", !checkbox.checked);
        }
      });
    };

    // Inicializar como ocultos
    updateSliderGroups();

    // Adicionar listeners para checkboxes
    ["toggle-translate", "toggle-rotate", "toggle-scale"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = false;
        el.addEventListener("change", updateSliderGroups);
      }
    });
  }

  updateSliderLabel(id, val) {
    const label = document.getElementById(id.replace("slider", "value"));
    if (label) {
      const suffix = id.includes("rot") ? "°" : "";
      label.textContent = val + suffix;
    }
  }

  setup() {
    const parent = document.getElementById("coords-canvas-container");
    this.canvas = createCanvas(500, 500).parent(parent);
  }

  draw() {
    background(255);
    this.drawGrid();
    this.drawLegend();

    const M = this.getTransformationMatrix();
    this.updateMatrixDisplay(M);

    const transformedPoints = this.points.map((p) => {
      const px = p.x - width / 2;
      const py = p.y - height / 2;
      const [tx, ty] = this.applyMatrix(M, [px, py, 1]);
      return { x: tx + width / 2, y: ty + height / 2 };
    });

    // Desenhar a forma original transformada
    if (this.shape.length > 1) {
      fill(0, 0, 255, 100);
      noStroke();
      beginShape();
      this.shape.forEach((p0) => {
        const i = this.points.indexOf(p0);
        vertex(transformedPoints[i].x, transformedPoints[i].y);
      });
      endShape(CLOSE);
    }

    // Pontos transformados
    transformedPoints.forEach((p, i) => {
      fill(this.draggingPoint === this.points[i] ? "yellow" : "red");
      noStroke();
      ellipse(p.x, p.y, 10, 10);
      fill(0);
      textSize(14);
      text(this.alphabet[i], p.x + 8, p.y - 8);
    });

    // Linhas para coordenadas locais
    if (document.getElementById("toggle-coordinates")?.checked) {
      stroke(150);
      const cx = width / 2 + this.tx;
      const cy = height / 2 + this.ty;
      transformedPoints.forEach((p) => line(cx, cy, p.x, p.y));
    }

    // === Reflexão visual opcional ===
    const showReflection =
      document.getElementById("toggle-reflection")?.checked;
    if (showReflection) {
      const reflected = transformedPoints.map((p) => ({
        x: width - p.x, // Reflexão horizontal (em torno do eixo Y central)
        y: p.y,
      }));

      // Desenhar forma refletida
      if (this.shape.length > 1) {
        fill(255, 140, 0, 100); // cor de preenchimento da reflexão
        noStroke();
        beginShape();
        this.shape.forEach((p0) => {
          const i = this.points.indexOf(p0);
          vertex(reflected[i].x, reflected[i].y);
        });
        endShape(CLOSE);
      }

      // Pontos refletidos
      reflected.forEach((p, i) => {
        fill("orange");
        noStroke();
        ellipse(p.x, p.y, 10, 10);
        fill(0);
        textSize(14);
        text(this.alphabet[i] + "'", p.x + 8, p.y - 8); // usa A', B', etc
      });

      // Linha do espelho (opcional)
      stroke(100);
      strokeWeight(1);
      drawingContext.setLineDash([5, 5]); // dashed line
      line(width / 2, 0, width / 2, height);
      drawingContext.setLineDash([]); // reset dash
    }

    this.updateInputs();
  }

  drawGrid() {
    stroke(220);
    for (let x = 0; x <= width; x += 25) line(x, 0, x, height);
    for (let y = 0; y <= height; y += 25) line(0, y, width, y);
    stroke(0, 255, 0);
    line(0, height / 2, width, height / 2);
    stroke(255, 0, 0);
    line(width / 2, 0, width / 2, height);
  }

  drawLegend() {
    noStroke();
    fill(120);
    textSize(12);
    text("Centro (0,0)", width / 2 + 5, height / 2 - 10);
    ellipse(width / 2, height / 2, 5, 5);
  }

  getTransformationMatrix() {
    const rad = radians(this.rotationDeg);
    const cosA = cos(rad),
      sinA = sin(rad);

    const aplicarT = document.getElementById("toggle-translate")?.checked;
    const aplicarR = document.getElementById("toggle-rotate")?.checked;
    const aplicarS = document.getElementById("toggle-scale")?.checked;

    const sx = aplicarS ? Math.max(this.scaleX, 0.001) : 1;
    const sy = aplicarS ? Math.max(this.scaleY, 0.001) : 1;

    const S = [
      [sx, 0, 0],
      [0, sy, 0],
      [0, 0, 1],
    ];

    const R = aplicarR
      ? [
          [cosA, -sinA, 0],
          [sinA, cosA, 0],
          [0, 0, 1],
        ]
      : [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];

    const T = aplicarT
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

    return this.multiplyMatrices(this.multiplyMatrices(T, R), S);
  }

  multiplyMatrices(a, b) {
    const result = Array.from({ length: 3 }, () => Array(3).fill(0));
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) result[i][j] += a[i][k] * b[k][j];
    return result;
  }

  applyMatrix(m, vec3) {
    const [x, y, w] = vec3;
    const nx = m[0][0] * x + m[0][1] * y + m[0][2] * w;
    const ny = m[1][0] * x + m[1][1] * y + m[1][2] * w;
    return [nx, ny];
  }

  updateMatrixDisplay(m) {
    const table = document.getElementById("matrix-table");
    if (!table) return;
    table.innerHTML = "";

    const header = document.createElement("tr");
    header.innerHTML = "<th></th><th>x</th><th>y</th><th>w</th>";
    table.appendChild(header);

    const labels = ["x'", "y'", "w'"];
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.textContent = labels[i];
      row.appendChild(labelCell);
      for (let j = 0; j < 3; j++) {
        const cell = document.createElement("td");
        cell.textContent = m[i][j].toFixed(2);
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
  }

  updateInputs() {
    const useLocal = document.getElementById("toggle-coordinates")?.checked;
    const container = document.getElementById("coords-modifier");
    if (!container) return;
    container.innerHTML = "";

    this.points.forEach((p, i) => {
      const lx = p.x - width / 2;
      const ly = p.y - height / 2;
      const xVal = useLocal ? lx : p.x;
      const yVal = useLocal ? ly : p.y;

      const inputX = document.createElement("input");
      inputX.type = "number";
      inputX.value = xVal.toFixed(2);
      inputX.disabled = true;

      const inputY = document.createElement("input");
      inputY.type = "number";
      inputY.value = yVal.toFixed(2);
      inputY.disabled = true;

      container.appendChild(document.createTextNode(`${this.alphabet[i]}: `));
      container.appendChild(inputX);
      container.appendChild(inputY);
      container.appendChild(document.createElement("br"));
    });
  }

  addTriangle() {
    const cx = width / 2,
      cy = height / 2,
      s = 50;
    this.points.push({ x: cx, y: cy - s });
    this.points.push({ x: cx - s, y: cy + s });
    this.points.push({ x: cx + s, y: cy + s });
    this.updateInputs();
  }

  addRectangle() {
    const cx = width / 2,
      cy = height / 2,
      s = 50;
    this.points.push({ x: cx - s, y: cy - s });
    this.points.push({ x: cx + s, y: cy - s });
    this.points.push({ x: cx + s, y: cy + s });
    this.points.push({ x: cx - s, y: cy + s });
    this.updateInputs();
  }

  mousePressed() {
    for (let p of this.points) {
      if (dist(mouseX, mouseY, p.x, p.y) < 10) {
        this.draggingPoint = p;
        return;
      }
    }
  }

  mouseDragged() {
    if (this.draggingPoint) {
      this.draggingPoint.x = mouseX;
      this.draggingPoint.y = mouseY;
    }
  }

  mouseReleased() {
    this.draggingPoint = null;
  }
}

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
