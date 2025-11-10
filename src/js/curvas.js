class CurvasApp {
  constructor() {
    // ===== DOM base =====
    this.section = document.getElementById("curves-section");
    const $s = (sel) => this.section?.querySelector(sel);
    this.canvas = $s("#bezier-canvas");
    if (!this.canvas) return; // seção pode não estar visível
    this.ctx = this.canvas.getContext("2d");

    // Controles (todos escopados à seção — resolve IDs duplicados como "show-grid")
    this.degreeSelect = $s("#bezier-degree");
    this.tSlider = $s("#t-slider");
    this.tValue = $s("#t-value");
    this.speedSlider = $s("#speed-slider");
    this.playBtn = $s("#play-btn");
    this.showPolygonChk = $s("#show-polygon");
    this.showDeCasteljauChk = $s("#show-decasteljau");
    this.showPointChk = $s("#show-point");
    this.showTangentChk = $s("#show-tangent");
    this.showGridChk = $s("#show-grid");
    this.lockDegreeChk = $s("#lock-degree");
    this.resetBtn = $s("#reset-curve");

    // Ajuda (modal tratado centralmente por navigation.js)
    this.helpBtn = document.getElementById("btn-curves-help");
    this.helpModal = document.getElementById("modal-curves");
    this.closeBtns = this.helpModal
      ? this.helpModal.querySelectorAll(".close-btn")
      : [];

    // ===== Estado =====
    this.points = [];
    this.dragIndex = -1;
    this.animating = false;
    this.animationId = null;
    this.animT = 0; // t independente do slider

    // ===== Responsivo / HiDPI =====
    this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.canvas);
    this.resizeCanvas();

    // ===== Eventos e primeiro desenho =====
    this.addEventListeners();
    this.redraw();
  }

  /* ==================== Eventos ==================== */
  addEventListeners() {
    // Ponteiro unificado
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", () => this.onPointerUp());

    // Duplo clique para adicionar ponto
    this.canvas.addEventListener("dblclick", (e) => this.addPoint(e));

    // UI sliders / selects
    this.degreeSelect?.addEventListener("change", () => this.onDegreeChange());
    this.tSlider?.addEventListener("input", () => this.onTChange());
    this.speedSlider?.addEventListener("input", () => this.onSpeedChange());
    this.playBtn?.addEventListener("click", () => this.toggleAnimation());

    // Checkboxes que só redesenham
    this.showPolygonChk?.addEventListener("change", () => this.redraw());
    this.showDeCasteljauChk?.addEventListener("change", () => this.redraw());
    this.showPointChk?.addEventListener("change", () => this.redraw());
    this.showTangentChk?.addEventListener("change", () => this.redraw());
    this.showGridChk?.addEventListener("change", () => this.redraw());

    // "Travar grau": desabilita o <select> e poda pontos excedentes
    this.lockDegreeChk?.addEventListener("change", () => {
      const locked = this.lockDegreeChk.checked;
      if (this.degreeSelect) this.degreeSelect.disabled = locked;
      this.onDegreeChange();
    });

    // Reset
    this.resetBtn?.addEventListener("click", () => {
      this.points = [];
      this.redraw();
    });

    // Teclado (delete último ponto)
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && this.points.length) {
        this.points.pop();
        this.redraw();
      }
    });
  }

  /* ==================== Handlers ==================== */
  onDegreeChange() {
    const maxPts = parseInt(this.degreeSelect?.value || "3", 10) + 1;
    if (this.lockDegreeChk?.checked && this.points.length > maxPts) {
      this.points.length = maxPts;
    }
    this.redraw();
  }

  onTChange() {
    const t = parseFloat(this.tSlider?.value || "0");
    if (this.tValue) this.tValue.textContent = t.toFixed(2);
    if (!this.animating) this.redraw();
  }

  onSpeedChange() {
    // só afeta a animação, nada a fazer aqui se não estiver animando
  }

  toggleAnimation() {
    this.animating = !this.animating;
    if (this.playBtn)
      this.playBtn.textContent = this.animating ? "Pausar" : "Iniciar Animação";
    if (this.animating) {
      this.animLoop();
    } else if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animLoop(timestamp) {
    const speed = parseFloat(this.speedSlider?.value || "1");
    this.animT += 0.005 * speed;
    if (this.animT > 1) this.animT = 0;
    if (this.tSlider) this.tSlider.value = String(this.animT);
    if (this.tValue) this.tValue.textContent = this.animT.toFixed(2);
    this.redraw();
    this.animationId = requestAnimationFrame((t) => this.animLoop(t));
  }

  /* ==================== Canvas utils ==================== */
  resizeCanvas() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const w = Math.max(100, Math.floor(width));
    const h = Math.max(100, Math.floor(height));
    this.canvas.width = Math.floor(w * this.pixelRatio);
    this.canvas.height = Math.floor(h * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.redraw();
  }

  toCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  hitTest(x, y) {
    const R = 8;
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      const dx = p.x - x,
        dy = p.y - y;
      if (dx * dx + dy * dy <= R * R) return i;
    }
    return -1;
  }

  onPointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.toCanvasCoords(e);
    const idx = this.hitTest(x, y);
    if (idx !== -1) this.dragIndex = idx;
  }

  onPointerMove(e) {
    if (this.dragIndex === -1) return;
    const { x, y } = this.toCanvasCoords(e);
    const step = e.shiftKey || (this.lockDegreeChk?.checked ?? false) ? 10 : 1;
    const snap = (v) => Math.round(v / step) * step;
    this.points[this.dragIndex] = { x: snap(x), y: snap(y) };
    this.redraw();
  }

  onPointerUp() {
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.dragIndex = -1;
  }

  addPoint(e) {
    const degree = parseInt(this.degreeSelect?.value || "3", 10);
    const maxPts = degree + 1;
    if (this.lockDegreeChk?.checked && this.points.length >= maxPts) return;

    const { x, y } = this.toCanvasCoords(e);
    this.points.push({ x, y });
    this.redraw();
  }

  /* ==================== Desenho ==================== */
  redraw() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.pixelRatio;
    const h = this.canvas.height / this.pixelRatio;

    // fundo
    ctx.clearRect(0, 0, w, h);
    if (this.showGridChk?.checked) this.drawGrid(ctx, w, h);

    // sem pontos -> nada
    if (this.points.length === 0) return;

    // pontos de controle
    if (this.showPolygonChk?.checked) this.drawControlPolygon(ctx);
    this.drawControlPoints(ctx);

    // curva e elementos opcionais
    const t = parseFloat(this.tSlider?.value || "0");
    const pts = this.points.slice();
    if (pts.length >= 2) this.drawBezier(ctx, pts);

    if (this.showDeCasteljauChk?.checked && pts.length >= 2) {
      this.drawDeCasteljau(ctx, pts, t);
    }
    if (this.showPointChk?.checked && pts.length >= 2) {
      const p = this.deCasteljauPoint(pts, t);
      this.drawPoint(ctx, p.x, p.y, "#0f0", 5);
    }
    if (this.showTangentChk?.checked && pts.length >= 2) {
      this.drawTangent(ctx, pts, t);
    }
  }

  drawGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    const step = 20;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawControlPolygon(ctx) {
    ctx.save();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    this.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawControlPoints(ctx) {
    this.points.forEach((p, i) => {
      this.drawPoint(ctx, p.x, p.y, "#ff0", 4);
      // label
      ctx.save();
      ctx.fillStyle = "#ddd";
      ctx.font = "11px sans-serif";
      ctx.fillText(`P${i}`, p.x + 8, p.y - 8);
      ctx.restore();
    });
  }

  drawPoint(ctx, x, y, color = "#fff", r = 4) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  deCasteljauPoint(pts, t) {
    let q = pts.map((p) => ({ ...p }));
    while (q.length > 1) {
      const next = [];
      for (let i = 0; i < q.length - 1; i++) {
        next.push({
          x: (1 - t) * q[i].x + t * q[i + 1].x,
          y: (1 - t) * q[i].y + t * q[i + 1].y,
        });
      }
      q = next;
    }
    return q[0];
  }

  drawDeCasteljau(ctx, pts, t) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,255,255,0.5)";
    ctx.fillStyle = "rgba(0,255,255,0.9)";
    let q = pts.map((p) => ({ ...p }));
    while (q.length > 1) {
      // linhas do nível
      ctx.beginPath();
      for (let i = 0; i < q.length - 1; i++) {
        const a = q[i],
          b = q[i + 1];
        if (i === 0) ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();

      // pontos do nível
      q.forEach((p) => this.drawPoint(ctx, p.x, p.y, "cyan", 3));

      // próximo nível
      const next = [];
      for (let i = 0; i < q.length - 1; i++) {
        next.push({
          x: (1 - t) * q[i].x + t * q[i + 1].x,
          y: (1 - t) * q[i].y + t * q[i + 1].y,
        });
      }
      q = next;
    }
    ctx.restore();
  }

  drawBezier(ctx, pts) {
    // aproximação poligonal (amostras)
    ctx.save();
    ctx.strokeStyle = "#0af";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const samples = 100;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = this.deCasteljauPoint(pts, t);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawTangent(ctx, pts, t) {
    // derivada por diferença: B'(t) ≈ (B(t+dt)-B(t-dt))/(2dt)
    const dt = 0.001;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const p0 = this.deCasteljauPoint(pts, clamp(t - dt));
    const p1 = this.deCasteljauPoint(pts, clamp(t + dt));
    const px = this.deCasteljauPoint(pts, t);

    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const L = Math.hypot(vx, vy) || 1;
    const ux = vx / L,
      uy = vy / L;

    const len = 60; // tamanho visual
    const a = { x: px.x - ux * len, y: px.y - uy * len };
    const b = { x: px.x + ux * len, y: px.y + uy * len };

    ctx.save();
    ctx.strokeStyle = "#fa0";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new CurvasApp();
});
