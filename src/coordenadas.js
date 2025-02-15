class CoordenadasApp {
  constructor() {
    this.points = [];
    this.shape = [];
    this.draggingPoint = null;
    this.alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    this.canvas = null;

    // Configurar os event listeners dos botões e modais
    document.getElementById('reset-canvas').addEventListener('click', () => this.resetCanvas());
    document.getElementById('toggle-coordinates').addEventListener('change', (e) => {
      this.updateInputs(e.target.checked);
    });
    document.getElementById('add-point').addEventListener('click', () => {
      if (this.points.length < this.alphabet.length) {
        this.addPoint();
      } else {
        alert('Limite de pontos alcançado.');
      }
    });
    document.getElementById('unir-pontos').addEventListener('click', () => this.unirPontos());
    document.getElementById('object-type').addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'triangle') this.addTriangle();
      else if (type === 'rectangle') this.addRectangle();
      else this.addPoint();
    });
    // Botão que exibe a interface de coordenadas (oculta as demais)
    document.getElementById('btn-coordenadas').addEventListener('click', () => {
      document.getElementById('color-system-container').classList.add('hidden');
      document.getElementById('phong-container').classList.add('hidden');
      document.getElementById('curvas-container').classList.add('hidden');
      document.getElementById('canvas-container').classList.remove('hidden');
    });
    // Configurar o modal de ajuda
    this.modal = document.getElementById('modal-ajuda');
    const btnAjuda = document.getElementById('btn-ajuda');
    const closeBtn = this.modal.querySelector('.close-btn');
    btnAjuda.addEventListener('click', () => this.modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => this.modal.classList.add('hidden'));
    window.addEventListener('click', (event) => {
      if (event.target === this.modal) {
        this.modal.classList.add('hidden');
      }
    });
  }

  resetCanvas() {
    this.points = [];
    this.shape = [];
    this.updateInputs();
    background(255); // p5.js: limpa o fundo do canvas
    this.drawGrid();
  }

  drawLegend() {
    const globalOriginX = 0;
    const globalOriginY = 0;
    const localOriginX = width / 2;
    const localOriginY = height / 2;

    textSize(14);
    fill(0);
    textAlign(LEFT);
    // Origem Global
    fill(255, 110, 110);
    text("Origem Global (0, 0)", globalOriginX + 10, globalOriginY + 20);
    // Origem Local
    fill(140, 140, 140);
    text("Origem Local (0, 0)", localOriginX + 10, localOriginY - 10);
    // Marcação das origens
    fill(255, 110, 110);
    ellipse(globalOriginX, globalOriginY, 8, 8);
    fill(140, 140, 140);
    ellipse(localOriginX, localOriginY, 8, 8);
  }

  addTriangle() {
    const centerX = width / 2;
    const centerY = height / 2;
    const size = 50;
    this.points.push({ x: centerX, y: centerY - size });
    this.points.push({ x: centerX - size, y: centerY + size });
    this.points.push({ x: centerX + size, y: centerY + size });
    this.updateInputs();
  }

  addRectangle() {
    const centerX = width / 2;
    const centerY = height / 2;
    const size = 50;
    this.points.push({ x: centerX - size, y: centerY - size });
    this.points.push({ x: centerX + size, y: centerY - size });
    this.points.push({ x: centerX + size, y: centerY + size });
    this.points.push({ x: centerX - size, y: centerY + size });
    this.updateInputs();
  }

  updateInputs(useLocal = false) {
    const inputsDiv = document.getElementById('num-inputs');
    inputsDiv.innerHTML = '';
    this.points.forEach((p, index) => {
      const localX = p.x - width / 2;
      const localY = p.y - height / 2;
      const xValue = useLocal ? localX : p.x;
      const yValue = useLocal ? localY : p.y;
      let inputX = document.createElement('input');
      let inputY = document.createElement('input');
      inputX.type = 'number';
      inputX.value = xValue.toFixed(2);
      inputY.type = 'number';
      inputY.value = yValue.toFixed(2);
      inputX.addEventListener('input', () => {
        if (useLocal) {
          p.x = parseFloat(inputX.value) + width / 2;
        } else {
          p.x = parseFloat(inputX.value);
        }
      });
      inputY.addEventListener('input', () => {
        if (useLocal) {
          p.y = parseFloat(inputY.value) + width / 2;
        } else {
          p.y = parseFloat(inputY.value);
        }
      });
      inputsDiv.appendChild(document.createTextNode(`${this.alphabet[index]}: `));
      inputsDiv.appendChild(inputX);
      inputsDiv.appendChild(inputY);
      inputsDiv.appendChild(document.createElement('br'));
    });
  }

  applyTransformation(matrix, point) {
    if (!point || point.x === undefined || point.y === undefined) {
      console.error('Ponto inválido', point);
      return null;
    }
    const [a, b, c, d, e, f] = matrix;
    const x = point.x;
    const y = point.y;
    return {
      x: a * x + b * y + e,
      y: c * x + d * y + f,
    };
  }

  drawReferenceLines() {
    if (document.getElementById('toggle-coordinates').checked) {
      const centerX = width / 2;
      const centerY = height / 2;
      stroke(150);
      this.points.forEach((p) => {
        line(centerX, centerY, p.x, p.y);
      });
    }
  }

  setup() {
    const container = document.getElementById('canvas-container');
    this.canvas = createCanvas(600, 600);
    this.canvas.parent(container);
    background(255);
    this.drawGrid();
  }

  draw() {
    background(255);
    this.drawGrid();
    this.drawShape();
    this.drawPoints();
    this.drawReferenceLines();
    this.drawLegend();
  }

  drawGrid() {
    stroke(200);
    for (let x = 0; x <= width; x += width / 20) {
      line(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += height / 20) {
      line(0, y, width, y);
    }
    // Eixo X
    stroke(0, 255, 0);
    line(0, height / 2, width, height / 2);
    fill(0, 255, 0);
    noStroke();
    textSize(16);
    text("X", width - 20, height / 2 - 10);
    // Eixo Y
    stroke(255, 0, 0);
    line(width / 2, 0, width / 2, height);
    fill(255, 0, 0);
    noStroke();
    textSize(16);
    text("Y", width / 2 + 10, 20);
  }

  drawPoints() {
    for (let i = 0; i < this.points.length; i++) {
      let p = this.points[i];
      fill(this.draggingPoint === p ? 'yellow' : 'red');
      noStroke();
      ellipse(p.x, p.y, 10, 10);
      fill(0);
      textSize(16);
      text(this.alphabet[i], p.x + 10, p.y - 10);
    }
  }

  drawShape() {
    if (this.shape.length > 1) {
      fill(0, 0, 255, 100);
      noStroke();
      beginShape();
      for (let p of this.shape) {
        vertex(p.x, p.y);
      }
      endShape(CLOSE);
    }
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
      this.updateInputs();
    }
  }

  mouseReleased() {
    this.draggingPoint = null;
  }

  addPoint(x, y) {
    let canvasX = x || width / 2;
    let canvasY = y || height / 2;
    this.points.push({ x: canvasX, y: canvasY });
    this.updateInputs();
  }

  unirPontos() {
    if (this.points.length >= 3) {
      this.shape = [...this.points];
    } else {
      alert('Adicione pelo menos 3 pontos para formar uma geometria.');
    }
  }
}

// Instancia a aplicação
const coordenadasApp = new CoordenadasApp();

// Integração com p5.js: as funções globais chamam os métodos da instância
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
