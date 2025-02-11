(() => {
    const canvasElement = document.getElementById('curveCanvas');
    const ctx = canvasElement.getContext('2d');

    const formulaDescription = document.getElementById('formula-description');
    const mathEquation = document.getElementById('math-equation');

    let points = []; // Lista de pontos
    let mode = null; // Modo atual: "Bezier" ou "Chaikin"
    let selectedPoint = null; // Ponto selecionado para arrastar

    // Elementos do DOM
    const bezierDegreeSelect = document.getElementById('bezier-degree');
    const chaikinIterationsSlider = document.getElementById('chaikin-iterations');

    // Alternar para a aba de curvas
    document.getElementById('btn-curvas').addEventListener('click', function () {
        document.getElementById('color-system-container').style.display = 'none';
        document.getElementById('phong-container').style.display = 'none';
        document.getElementById('canvas-container').style.display = 'none';
        document.getElementById('curvas-container').style.display = 'flex';
        clearCanvas();
    });

    // Adicionar pontos ao clicar no canvas
    canvasElement.addEventListener('click', (e) => {
        if (selectedPoint) return; // Se estiver movendo um ponto, não adicionar novo
        const rect = canvasElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        points.push({ x, y });
        drawPoints();
        updateCurve();
    });

    // Permitir mover pontos arrastando
    canvasElement.addEventListener('mousedown', (e) => {
        const rect = canvasElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        selectedPoint = points.find(p => Math.hypot(p.x - x, p.y - y) < 7);
    });

    canvasElement.addEventListener('mousemove', (e) => {
        if (!selectedPoint) return;

        const rect = canvasElement.getBoundingClientRect();
        selectedPoint.x = e.clientX - rect.left;
        selectedPoint.y = e.clientY - rect.top;

        drawPoints();
        updateCurve();
    });

    canvasElement.addEventListener('mouseup', () => {
        selectedPoint = null;
    });

    // Redesenha os pontos de controle
    function drawPoints() {
        clearCanvas(false);
        points.forEach((point) => {
            ctx.fillStyle = 'yellow';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Limpar canvas
    function clearCanvas(clearPoints = true) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        if (clearPoints) points = [];
    }

    // Atualizar curva com base no modo atual
    function updateCurve() {
        if (mode === 'Bezier') {
            drawBezier();
            updateBezierFormula(); // Atualiza a explicação matemática da Bézier
        }
        if (mode === 'Chaikin') {
            drawChaikin();
            updateChaikinFormula(); // Atualiza a explicação matemática do Chaikin
        }
    }


    // Curvas Bézier com controle de grau
    function drawBezier() {
        if (points.length < 2) return;

        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        const steps = 100; // Resolução

        ctx.beginPath();
        for (let t = 0; t <= 1; t += 1 / steps) {
            const p = deCasteljau(points, t);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Linhas guias
        ctx.strokeStyle = 'gray';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Algoritmo de De Casteljau (Bézier)
    function deCasteljau(points, t) {
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

    // Algoritmo de Chaikin com controle de iterações
    function drawChaikin() {
        if (points.length < 2) return;

        const iterations = parseInt(chaikinIterationsSlider.value);
        let currentPoints = [...points];

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

        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.beginPath();
        currentPoints.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }

    // Ativar modo Bézier
    function startBezier() {
        mode = 'Bezier';
        clearCanvas();
        alert('Modo Bézier Ativado. Clique no canvas para adicionar pontos.');
    }

    // Ativar modo Chaikin
    function startChaikin() {
        mode = 'Chaikin';
        clearCanvas();
        alert('Modo Chaikin Ativado. Clique no canvas para adicionar pontos.');
    }

    // Eventos de UI
    bezierDegreeSelect.addEventListener('change', () => {
        clearCanvas();
        updateCurve();
    });

    chaikinIterationsSlider.addEventListener('input', () => {
        clearCanvas(false);
        drawChaikin();
    });

    function updateBezierFormula() {
        formulaDescription.innerText = "Curva Bézier gerada pelo algoritmo de De Casteljau:";
        mathEquation.innerText = "B(t) = Σ (Pᵢ * Bₙ,ᵢ(t)), onde Bₙ,ᵢ(t) são polinômios de Bernstein.";
    }

    function updateChaikinFormula() {
        formulaDescription.innerText = "Curva suavizada pelo Algoritmo de Chaikin:";
        mathEquation.innerText = "Pontos novos: Q = 3/4 Pᵢ + 1/4 Pᵢ₊₁, R = 1/4 Pᵢ + 3/4 Pᵢ₊₁.";
    }


    // Exponha as funções no escopo global
    window.startBezier = startBezier;
    window.startChaikin = startChaikin;
    window.clearCanvas = clearCanvas;
})();
