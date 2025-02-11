
let points = [];
let shape = [];
let draggingPoint = null;
let canvas;
let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Event listener para o botão de Reset
document.getElementById('reset-canvas').addEventListener('click', () => {
    resetCanvas();
});
document.getElementById('toggle-coordinates').addEventListener('change', (e) => {
    const useLocalCoordinates = e.target.checked;
    updateInputs(useLocalCoordinates);
});
document.getElementById('add-point').addEventListener('click', () => {
    if (points.length < alphabet.length) {
        addPoint();
    } else {
        alert('Limite de pontos alcançado.');
    }
});

document.getElementById('unir-pontos').addEventListener('click', () => {
    unirPontos();
});
+
    document.getElementById('object-type').addEventListener('change', (e) => {
        const type = e.target.value;
        if (type === 'triangle') addTriangle();
        else if (type === 'rectangle') addRectangle();
        else addPoint();
    });



// Botão de Coordenadas
document.getElementById('btn-coordenadas').addEventListener('click', function () {
    document.getElementById('color-system-container').style.display = 'none';
    document.getElementById('phong-container').style.display = 'none';
    document.getElementById('curvas-container').style.display = 'none';
    document.getElementById('canvas-container').style.display = 'flex';
});

// Referências aos elementos
const modal = document.getElementById('modal-ajuda');
const btnAjuda = document.getElementById('btn-ajuda');
const closeBtn = document.querySelector('.close-btn');

// Abrir o modal
btnAjuda.addEventListener('click', () => {
    modal.style.display = 'flex';
});

// Fechar o modal
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Fechar o modal clicando fora dele
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// Função para resetar o canvas
function resetCanvas() {
    points = []; // Zera os pontos
    shape = []; // Zera a forma criada
    updateInputs(); // Limpa os inputs de coordenadas
    background(255); // Limpa o fundo do canvas
    drawGrid(); // Redesenha a grade e os eixos
}

function drawLegend() {
    const globalOriginX = 0;
    const globalOriginY = 0;
    const localOriginX = width / 2;
    const localOriginY = height / 2;

    // Legenda para as origens
    textSize(14);
    fill(0);
    textAlign(LEFT);

    // Desenhar origem global
    fill(255, 110, 110);
    text("Origem Global (0, 0)", globalOriginX + 10, globalOriginY + 20);

    // Desenhar origem local
    fill(140, 140, 140);
    text("Origem Local (0, 0)", localOriginX + 10, localOriginY - 10);

    // Marcar origem global
    fill(255, 110, 110);
    ellipse(globalOriginX, globalOriginY, 8, 8);

    // Marcar origem local
    fill(140, 140, 140);
    ellipse(localOriginX, localOriginY, 8, 8);
}


function addTriangle() {
    const centerX = width / 2;
    const centerY = height / 2;
    const size = 50;
    points.push({ x: centerX, y: centerY - size });
    points.push({ x: centerX - size, y: centerY + size });
    points.push({ x: centerX + size, y: centerY + size });
    updateInputs(); // Atualizar os inputs após adicionar os pontos
}

function addRectangle() {
    const centerX = width / 2;
    const centerY = height / 2;
    const size = 50;
    points.push({ x: centerX - size, y: centerY - size });
    points.push({ x: centerX + size, y: centerY - size });
    points.push({ x: centerX + size, y: centerY + size });
    points.push({ x: centerX - size, y: centerY + size });
    updateInputs(); // Atualizar os inputs após adicionar os pontos
}

function updateInputs(useLocal = false) {
    const inputsDiv = document.getElementById('num-inputs');
    inputsDiv.innerHTML = '';

    points.forEach((p, index) => {
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
                p.y = parseFloat(inputY.value) + height / 2;
            } else {
                p.y = parseFloat(inputY.value);
            }
        });

        inputsDiv.appendChild(document.createTextNode(`${alphabet[index]}: `));
        inputsDiv.appendChild(inputX);
        inputsDiv.appendChild(inputY);
        inputsDiv.appendChild(document.createElement('br'));
    });
}

function applyTransformation(matrix, point) {
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

function drawReferenceLines() {
    if (document.getElementById('toggle-coordinates').checked) {
        const centerX = width / 2;
        const centerY = height / 2;
        stroke(150);
        points.forEach((p) => {
            line(centerX, centerY, p.x, p.y);
        });
    }
}

function setup() {
    const container = document.getElementById('canvas-container');
    canvas = createCanvas(600, 600);
    canvas.parent(container);
    background(255);
    drawGrid();
}

function draw() {
    background(255);
    drawGrid();
    drawShape();
    drawPoints();
    drawReferenceLines();
    drawLegend();
}


function drawGrid() {
    stroke(200); // Cor para as linhas da grade

    // Desenha as linhas da grade
    for (let x = 0; x <= width; x += width / 20) {
        line(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += height / 20) {
        line(0, y, width, y);
    }

    // Desenha o eixo X em verde
    stroke(0, 255, 0); // Verde
    line(0, height / 2, width, height / 2); // Linha horizontal

    // Adiciona a letra "X" no final do eixo X
    fill(0, 255, 0);
    noStroke();
    textSize(16);
    text("X", width - 20, height / 2 - 10);

    // Desenha o eixo Y em vermelho
    stroke(255, 0, 0); // Vermelho
    line(width / 2, 0, width / 2, height); // Linha vertical

    // Adiciona a letra "Y" no final do eixo Y
    fill(255, 0, 0);
    noStroke();
    textSize(16);
    text("Y", width / 2 + 10, 20);
}


function drawPoints() {
    for (let i = 0; i < points.length; i++) {
        let p = points[i];
        fill(draggingPoint === p ? 'yellow' : 'red'); // Destaque para o ponto arrastado
        noStroke();
        ellipse(p.x, p.y, 10, 10);

        fill(0);
        textSize(16);
        text(alphabet[i], p.x + 10, p.y - 10);
    }
}


function drawShape() {
    if (shape.length > 1) {
        fill(0, 0, 255, 100);
        noStroke();
        beginShape();
        for (let p of shape) {
            vertex(p.x, p.y);
        }
        endShape(CLOSE);
    }
}

function mousePressed() {
    for (let p of points) {
        if (dist(mouseX, mouseY, p.x, p.y) < 10) {
            draggingPoint = p;
            return;
        }
    }
}

function mouseDragged() {
    if (draggingPoint) {
        draggingPoint.x = mouseX;
        draggingPoint.y = mouseY;
        updateInputs();
    }
}

function mouseReleased() {
    draggingPoint = null;
}

function addPoint(x, y) {
    let canvasX = x || width / 2;
    let canvasY = y || height / 2;
    points.push({ x: canvasX, y: canvasY });
    updateInputs();
}

function unirPontos() {
    if (points.length >= 3) {
        shape = [...points];
    } else {
        alert('Adicione pelo menos 3 pontos para formar uma geometria.');
    }
}
const backToMenu2D = document.getElementById('back-to-menu-2d');

// Voltar para o menu principal
backToMenu2D.addEventListener('click', () => {
     window.location.href = './index.html';
});

