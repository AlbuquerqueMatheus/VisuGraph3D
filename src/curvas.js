class CurvasApp {
  constructor() {
    // Seleciona os elementos do DOM
    this.canvasElement = document.getElementById('curveCanvas');
    this.ctx = this.canvasElement.getContext('2d');
    this.formulaDescription = document.getElementById('formula-description');
    this.mathEquation = document.getElementById('math-equation');

    // Estado da aplicação
    this.points = [];         // Lista de pontos de controle
    this.mode = null;         // "Bezier" ou "Chaikin"
    this.selectedPoint = null; // Ponto atualmente sendo arrastado

    // Elementos da interface
    this.bezierDegreeSelect = document.getElementById('bezier-degree');
    this.chaikinIterationsSlider = document.getElementById('chaikin-iterations');

    // Configura os eventos do canvas
    this.canvasElement.addEventListener('click', (e) => this.onCanvasClick(e));
    this.canvasElement.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
    this.canvasElement.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
    this.canvasElement.addEventListener('mouseup', () => this.onCanvasMouseUp());

    // Configura os eventos dos controles da interface
    document.getElementById('btn-curvas').addEventListener('click', () => {
      document.getElementById('color-system-container').classList.add('hidden');
      document.getElementById('phong-container').classList.add('hidden');
      document.getElementById('canvas-container').classList.add('hidden');
      document.getElementById('curvas-container').classList.remove('hidden');
      this.clearCanvas();
    });

    this.bezierDegreeSelect.addEventListener('change', () => {
      this.clearCanvas();
      this.updateCurve();
    });

    this.chaikinIterationsSlider.addEventListener('input', () => {
      this.clearCanvas(false);
      this.drawChaikin();
    });
  }

  // Limpa o canvas e, opcionalmente, os pontos
  clearCanvas(clearPoints = true) {
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    if (clearPoints) this.points = [];
  }

  // Desenha os pontos de controle no canvas
  drawPoints() {
    this.clearCanvas(false);
    this.points.forEach((point) => {
      this.ctx.fillStyle = 'yellow';
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // Atualiza a curva com base no modo selecionado
  updateCurve() {
    if (this.mode === 'Bezier') {
      this.drawBezier();
      this.updateBezierFormula();
    } else if (this.mode === 'Chaikin') {
      this.drawChaikin();
      this.updateChaikinFormula();
    }
  }

  // Desenha a curva Bézier utilizando o algoritmo de De Casteljau
  drawBezier() {
    if (this.points.length < 2) return;
    this.ctx.strokeStyle = 'blue';
    this.ctx.lineWidth = 2;
    const steps = 100;
    this.ctx.beginPath();
    for (let t = 0; t <= 1; t += 1 / steps) {
      const p = this.deCasteljau(this.points, t);
      this.ctx.lineTo(p.x, p.y);
    }
    this.ctx.stroke();

    // Desenha linhas guias com traço pontilhado
    this.ctx.strokeStyle = 'gray';
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.points.forEach((p, i) => {
      if (i === 0) this.ctx.moveTo(p.x, p.y);
      else this.ctx.lineTo(p.x, p.y);
    });
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  // Algoritmo de De Casteljau para o cálculo da curva Bézier
  deCasteljau(points, t) {
    let temp = [...points];
    while (temp.length > 1) {
      const nextTemp = [];
      for (let i = 0; i < temp.length - 1; i++) {
        const x = (1 - t) * temp[i].x + t * temp[i + 1].x;
        const y = (1 - t) * temp[i].y + t * temp[i + 1].y;
        nextTemp.push({ x, y });
      }
      temp = nextTemp;
    }
    return temp[0];
  }

  // Desenha a curva suavizada pelo algoritmo de Chaikin
  drawChaikin() {
    if (this.points.length < 2) return;
    const iterations = parseInt(this.chaikinIterationsSlider.value);
    let currentPoints = [...this.points];
    for (let i = 0; i < iterations; i++) {
      const nextPoints = [];
      for (let j = 0; j < currentPoints.length - 1; j++) {
        const p1 = currentPoints[j];
        const p2 = currentPoints[j + 1];
        const q = { x: 0.75 * p1.x + 0.25 * p2.x, y: 0.75 * p1.y + 0.25 * p2.y };
        const r = { x: 0.25 * p1.x + 0.75 * p2.x, y: 0.25 * p1.y + 0.75 * p2.y };
        nextPoints.push(q, r);
      }
      currentPoints = nextPoints;
    }
    this.ctx.strokeStyle = 'green';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    currentPoints.forEach((p, i) => {
      if (i === 0) this.ctx.moveTo(p.x, p.y);
      else this.ctx.lineTo(p.x, p.y);
    });
    this.ctx.stroke();
  }

  // Atualiza a descrição e a equação matemática para a curva Bézier
  updateBezierFormula() {
    this.formulaDescription.innerText = "Curva Bézier gerada pelo algoritmo de De Casteljau:";
    this.mathEquation.innerText = "B(t) = Σ (Pᵢ * Bₙ,ᵢ(t)), onde Bₙ,ᵢ(t) são polinômios de Bernstein.";
  }

  // Atualiza a descrição e a equação matemática para a curva Chaikin
  updateChaikinFormula() {
    this.formulaDescription.innerText = "Curva suavizada pelo Algoritmo de Chaikin:";
    this.mathEquation.innerText = "Pontos novos: Q = 3/4 Pᵢ + 1/4 Pᵢ₊₁, R = 1/4 Pᵢ + 3/4 Pᵢ₊₁.";
  }

  // Eventos do canvas
  onCanvasClick(e) {
    // Se estiver arrastando um ponto, não adiciona novo
    if (this.selectedPoint) return;
    const rect = this.canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.points.push({ x, y });
    this.drawPoints();
    this.updateCurve();
  }

  onCanvasMouseDown(e) {
    const rect = this.canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.selectedPoint = this.points.find(p => Math.hypot(p.x - x, p.y - y) < 7);
  }

  onCanvasMouseMove(e) {
    if (!this.selectedPoint) return;
    const rect = this.canvasElement.getBoundingClientRect();
    this.selectedPoint.x = e.clientX - rect.left;
    this.selectedPoint.y = e.clientY - rect.top;
    this.drawPoints();
    this.updateCurve();
  }

  onCanvasMouseUp() {
    this.selectedPoint = null;
  }

  // Métodos para ativar os modos
  startBezier() {
    this.mode = 'Bezier';
    this.clearCanvas();
    alert('Modo Bézier Ativado. Clique no canvas para adicionar pontos.');
  }

  startChaikin() {
    this.mode = 'Chaikin';
    this.clearCanvas();
    alert('Modo Chaikin Ativado. Clique no canvas para adicionar pontos.');
  }
}

// Instancia a aplicação de curvas
const curvasApp = new CurvasApp();

// Expondo os métodos para acesso global (para os botões de ativação)
window.startBezier = () => curvasApp.startBezier();
window.startChaikin = () => curvasApp.startChaikin();
window.clearCanvas = () => curvasApp.clearCanvas();
