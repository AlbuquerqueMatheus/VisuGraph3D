class CurvasApp {
  constructor() {
    // Elementos do DOM
    this.canvas = document.getElementById("bezier-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.degreeSelect = document.getElementById("bezier-degree");
    this.tSlider = document.getElementById("t-slider");
    this.tValue = document.getElementById("t-value");
    this.playBtn = document.getElementById("play-btn");
    this.showPolygonChk = document.getElementById("show-polygon");
    this.showDeCasteljauChk = document.getElementById("show-decasteljau");
    this.infoBtn = document.getElementById("btn-info");
    this.formulaBtn = document.getElementById("btn-formula");
    this.modalInfo = document.getElementById("modal-info");
    this.modalFormula = document.getElementById("modal-formula");
    this.closeButtons = document.querySelectorAll(".close-btn");

    // Estado
    this.points = [];
    this.selectedPoint = null;
    this.animating = false;
    this.animationId = null;

    this.addEventListeners();
    this.drawBackground();
  }

  addEventListeners() {
    this.canvas.addEventListener("click", (e) => this.addPoint(e));
    this.canvas.addEventListener("mousedown", (e) => this.startDrag(e));
    this.canvas.addEventListener("mousemove", (e) => this.dragPoint(e));
    this.canvas.addEventListener("mouseup", () => this.endDrag());

    this.degreeSelect.addEventListener("change", () => this.redraw());
    this.tSlider.addEventListener("input", () => this.onTChange());
    this.playBtn.addEventListener("click", () => this.toggleAnimation());
    this.infoBtn.addEventListener("click", () =>
      this.toggleModal(this.modalInfo)
    );
    this.formulaBtn.addEventListener("click", () =>
      this.toggleModal(this.modalFormula)
    );
    this.closeButtons.forEach((btn) =>
      btn.addEventListener("click", () => {
        this.modalInfo.classList.add("hidden");
        this.modalFormula.classList.add("hidden");
      })
    );
  }

  drawBackground() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

 addPoint(e) {
  const maxPts = parseInt(this.degreeSelect.value, 10) + 1;
  if (this.points.length >= maxPts) return; // Apenas ignora silenciosamente

  const rect = this.canvas.getBoundingClientRect();
  this.points.push({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  });

  this.redraw();
}


  startDrag(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    this.selectedPoint = this.points.find(
      (p) => Math.hypot(p.x - x, p.y - y) < 8
    );
  }

  dragPoint(e) {
    if (!this.selectedPoint) return;
    const rect = this.canvas.getBoundingClientRect();
    this.selectedPoint.x = e.clientX - rect.left;
    this.selectedPoint.y = e.clientY - rect.top;
    this.redraw();
  }

  endDrag() {
    this.selectedPoint = null;
  }

  onTChange() {
    this.tValue.textContent = parseFloat(this.tSlider.value).toFixed(2);
    this.redraw(false);
  }

  toggleAnimation() {
    this.animating = !this.animating;
    this.playBtn.textContent = this.animating
      ? "Pausar Animação"
      : "Iniciar Animação";

    if (this.animating) this.animate();
    else cancelAnimationFrame(this.animationId);
  }

  animate() {
  if (!this.animating) return;

  let t = parseFloat(this.tSlider.value);
  t += 0.005;
  if (t > 1) t = 0;

  this.tSlider.value = t;
  this.onTChange(); // agora sim: redesenha e atualiza label

  this.animationId = requestAnimationFrame(() => this.animate());
}


  redraw(clearPoints = true) {
    this.drawBackground();
    if (this.points.length === 0) return;
    const n = parseInt(this.degreeSelect.value, 10);
    const pts = this.points.slice(0, n + 1);
    this.drawCurve(pts);
    if (this.showPolygonChk.checked) this.drawPolygon(pts);
    this.drawPoints();
    if (this.showDeCasteljauChk.checked)
      this.drawDeCasteljau(pts, parseFloat(this.tSlider.value));
  }

  drawPoints() {
    this.ctx.fillStyle = "#ff0";
    this.points.forEach((p) => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawPolygon(pts) {
    this.ctx.strokeStyle = "#888";
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    pts.forEach((p, i) =>
      i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)
    );
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawCurve(pts) {
    const steps = 200;
    this.ctx.strokeStyle = "#0af";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = this.deCasteljau(pts, t);
      i === 0 ? this.ctx.moveTo(p.x, p.y) : this.ctx.lineTo(p.x, p.y);
    }
    this.ctx.stroke();
  }

  drawDeCasteljau(pts, t) {
    let levels = [pts];
    while (levels[levels.length - 1].length > 1) {
      const prev = levels[levels.length - 1];
      const next = prev.slice(0, -1).map((p, i) => ({
        x: (1 - t) * p.x + t * prev[i + 1].x,
        y: (1 - t) * p.y + t * prev[i + 1].y,
      }));
      levels.push(next);
    }
    levels.forEach((lvl, i) => {
      this.ctx.strokeStyle = ["#f55", "#5f5", "#55f", "#ff5"][i] || "#fff";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      lvl.forEach((p, j) =>
        j ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)
      );
      this.ctx.stroke();
      lvl.forEach((p) => {
        this.ctx.fillStyle = "#0f0";
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      });
    });
  }

  deCasteljau(points, t) {
    let arr = points.map((p) => ({ ...p }));
    while (arr.length > 1) {
      arr = arr.slice(0, -1).map((p, i) => ({
        x: (1 - t) * p.x + t * arr[i + 1].x,
        y: (1 - t) * p.y + t * arr[i + 1].y,
      }));
    }
    return arr[0];
  }

  toggleModal(modal) {
    modal.classList.toggle("hidden");
  }
}
