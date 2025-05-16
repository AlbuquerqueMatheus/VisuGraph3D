class CoordenadasApp {
  constructor() {
    this.points = [];
    this.shape = [];
    this.draggingPoint = null;
    this.alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    this.canvas = null;

    // Botões de manipulação
    document.getElementById('reset-canvas')
      .addEventListener('click', () => this.resetCanvas());
    document.getElementById('toggle-coordinates')
      .addEventListener('change', e => this.updateInputs(e.target.checked));
    document.getElementById('add-point')
      .addEventListener('click', () => {
        if (this.points.length < this.alphabet.length) this.addPoint();
        else alert('Limite de pontos alcançado.');
      });
    document.getElementById('unir-pontos')
      .addEventListener('click', () => this.unirPontos());
    document.getElementById('object-type')
      .addEventListener('change', e => {
        const type = e.target.value;
        if      (type === 'triangle') this.addTriangle();
        else if (type === 'rectangle') this.addRectangle();
        else this.addPoint();
      });

    // Navegação: exibir seção de Coordenadas
    document.getElementById('btn-coordenadas')
      .addEventListener('click', () => {
        document.getElementById('color-system-section').classList.add('hidden');
        document.getElementById('phong-section').classList.add('hidden');
        document.getElementById('curves-section').classList.add('hidden');
        document.getElementById('coords-section').classList.remove('hidden');
      });

    // Modal de ajuda
    this.modal = document.getElementById('modal-help');
    const btnAjuda  = document.getElementById('btn-ajuda');
    const closeBtn  = this.modal.querySelector('.close-btn');
    btnAjuda.addEventListener('click', () => this.modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => this.modal.classList.add('hidden'));
    window.addEventListener('click', e => {
      if (e.target === this.modal) this.modal.classList.add('hidden');
    });
  }

  resetCanvas() {
    this.points = [];
    this.shape  = [];
    this.updateInputs();
    background(255);
    this.drawGrid();
  }

  drawLegend() {
    const globalOriginX = 0, globalOriginY = 0;
    const localOriginX  = width/2, localOriginY = height/2;

    textSize(14);
    // Origem Global
    fill(255,110,110);
    text("Origem Global (0,0)", globalOriginX + 10, globalOriginY + 20);
    ellipse(globalOriginX, globalOriginY, 8, 8);
    // Origem Local
    fill(140);
    text("Origem Local (0,0)", localOriginX + 10, localOriginY - 10);
    ellipse(localOriginX, localOriginY, 8, 8);
  }

  addTriangle() {
    const cx = width/2, cy = height/2, s = 50;
    this.points.push({x:cx,      y:cy-s});
    this.points.push({x:cx - s,  y:cy + s});
    this.points.push({x:cx + s,  y:cy + s});
    this.updateInputs();
  }

  addRectangle() {
    const cx = width/2, cy = height/2, s = 50;
    this.points.push({x:cx - s,  y:cy - s});
    this.points.push({x:cx + s,  y:cy - s});
    this.points.push({x:cx + s,  y:cy + s});
    this.points.push({x:cx - s,  y:cy + s});
    this.updateInputs();
  }

  updateInputs(useLocal = false) {
    const container = document.getElementById('coords-modifier');
    container.innerHTML = '';
    this.points.forEach((p,i) => {
      const lx = p.x - width/2;
      const ly = p.y - height/2;
      const xVal = useLocal ? lx : p.x;
      const yVal = useLocal ? ly : p.y;

      const inputX = document.createElement('input');
      inputX.type  = 'number';
      inputX.value = xVal.toFixed(2);
      inputX.addEventListener('input', () => {
        p.x = useLocal
          ? parseFloat(inputX.value) + width/2
          : parseFloat(inputX.value);
      });

      const inputY = document.createElement('input');
      inputY.type  = 'number';
      inputY.value = yVal.toFixed(2);
      inputY.addEventListener('input', () => {
        p.y = useLocal
          ? parseFloat(inputY.value) + height/2
          : parseFloat(inputY.value);
      });

      container.appendChild(document.createTextNode(`${this.alphabet[i]}: `));
      container.appendChild(inputX);
      container.appendChild(inputY);
      container.appendChild(document.createElement('br'));
    });
  }

  drawReferenceLines() {
    if (document.getElementById('toggle-coordinates').checked) {
      const cx = width/2, cy = height/2;
      stroke(150);
      this.points.forEach(p => line(cx, cy, p.x, p.y));
    }
  }

  setup() {
    const parent = document.getElementById('coords-canvas-container');
    const size = 500; // novo tamanho
    this.canvas = createCanvas(size, size)
                    .parent(parent);
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
    for (let x=0; x<=width; x+=width/20) line(x,0,x,height);
    for (let y=0; y<=height; y+=height/20) line(0,y,width,y);
    // Eixo X
    stroke(0,255,0);
    line(0, height/2, width, height/2);
    noStroke(); fill(0,255,0); textSize(16);
    text("X", width-20, height/2 - 10);
    // Eixo Y
    stroke(255,0,0);
    line(width/2,0, width/2, height);
    noStroke(); fill(255,0,0); textSize(16);
    text("Y", width/2 + 10, 20);
  }

  drawPoints() {
    this.points.forEach((p,i) => {
      fill(this.draggingPoint===p ? 'yellow' : 'red');
      noStroke(); ellipse(p.x,p.y,10,10);
      fill(0); textSize(16);
      text(this.alphabet[i], p.x+10, p.y-10);
    });
  }

  drawShape() {
    if (this.shape.length > 1) {
      fill(0,0,255,100); noStroke(); beginShape();
      this.shape.forEach(p => vertex(p.x,p.y));
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

  addPoint() {
    this.points.push({ x: width/2, y: height/2 });
    this.updateInputs();
  }

  unirPontos() {
    if (this.points.length >= 3) this.shape = [...this.points];
    else alert('Adicione pelo menos 3 pontos.');
  }
}

// Instancia e integra com p5.js
const coordenadasApp = new CoordenadasApp();
function setup()        { coordenadasApp.setup(); }
function draw()         { coordenadasApp.draw(); }
function mousePressed() { coordenadasApp.mousePressed(); }
function mouseDragged() { coordenadasApp.mouseDragged(); }
function mouseReleased(){ coordenadasApp.mouseReleased(); }
