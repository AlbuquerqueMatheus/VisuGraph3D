// Botão de Sistema de Cores
document.getElementById('color-system-btn').addEventListener('click', function () {
    document.getElementById('phong-container').style.display = 'none';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('curvas-container').style.display = 'none';
    document.getElementById('color-system-container').style.display = 'flex';
});

// Sistema de cores - Início
// Função para converter valores HSL para RGB
function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
// Atualiza o preview para o sistema HSL
function updateHslPreview(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    document.getElementById('hsl-preview').style.backgroundColor = color;
}
// Atualiza o preview para o sistema HSV
function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;

    let r = 0,
        g = 0,
        b = 0;
    if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
    else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
    else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
    else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
    else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
    else if (h >= 300 && h < 360) [r, g, b] = [c, 0, x];

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return [r, g, b];
}
function updateHsvPreview(h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    document.getElementById('hsv-preview').style.backgroundColor = color;
}

// Atualiza os valores HEX para cada sistema
function updateHexValues() {
    // RGB para HEX
    const rgb = getRGB();
    const hexRgb = rgbToHex(rgb.r, rgb.g, rgb.b);
    document.getElementById('hex-value-rgb').textContent = hexRgb;

    // HSL para HEX
    const h = parseInt(document.getElementById('h-slider-hsl').value, 10);
    const s = parseInt(document.getElementById('s-slider-hsl').value, 10);
    const l = parseInt(document.getElementById('l-slider-hsl').value, 10);
    const rgbFromHsl = hslToRgb(h, s, l); // Retorna um array
    const hexHsl = rgbToHex(rgbFromHsl[0], rgbFromHsl[1], rgbFromHsl[2]); // Acessa índices do array
    document.getElementById('hex-value-hsl').textContent = hexHsl;

    // HSV para HEX
    const hHsv = parseInt(document.getElementById('h-slider-hsv').value, 10);
    const sHsv = parseInt(document.getElementById('s-slider-hsv').value, 10);
    const vHsv = parseInt(document.getElementById('v-slider-hsv').value, 10);
    const rgbFromHsv = hsvToRgb(hHsv, sHsv, vHsv); // Retorna um array
    const hexHsv = rgbToHex(rgbFromHsv[0], rgbFromHsv[1], rgbFromHsv[2]); // Acessa índices do array
    document.getElementById('hex-value-hsv').textContent = hexHsv;
}

// Atualiza os valores dos sliders
function setSliderValues(h, s, v) {
    document.getElementById('h-slider-hsv').value = h;
    document.getElementById('s-slider-hsv').value = s;
    document.getElementById('v-slider-hsv').value = v;

    document.getElementById('h-value-hsv').value = h;
    document.getElementById('s-value-hsv').value = s;
    document.getElementById('v-value-hsv').value = v;
}

// Conversão RGB para Hex
function rgbToHex(r, g, b) {
    const toHex = (value) => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Conversão RGB para HSV
function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h, s, v = max;

    s = max === 0 ? 0 : delta / max;

    if (delta === 0) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
            case g: h = (b - r) / delta + 2; break;
            case b: h = (r - g) / delta + 4; break;
        }
        h *= 60;
    }

    return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
}

// Atualiza a visualização HEX
function updateHexPreview() {
    const rgb = getRGB();
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    document.getElementById('hex-value').textContent = hex;
}

// Obtém os valores RGB
function getRGB() {
    return {
        r: parseInt(document.getElementById('r-slider').value, 10),
        g: parseInt(document.getElementById('g-slider').value, 10),
        b: parseInt(document.getElementById('b-slider').value, 10)
    };
}

// Atualiza todas as pré-visualizações
function updatePreviews() {
    // Atualiza RGB Preview
    const rgb = getRGB();
    document.getElementById('rgb-preview').style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    // Atualiza valores HEX
    updateHexValues();
}
// Adiciona eventos aos sliders
['r-slider', 'g-slider', 'b-slider'].forEach(id => {
    const slider = document.getElementById(id);
    slider.addEventListener('input', updatePreviews);
});

// Eventos para sliders e inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Atualiza previews ao carregar a página
    updatePreviews();

    // Adiciona eventos para sliders RGB, HSL e HSV
    ['r-slider', 'g-slider', 'b-slider'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreviews);
    });
    ['h-slider-hsl', 's-slider-hsl', 'l-slider-hsl', 'h-slider-hsv', 's-slider-hsv', 'v-slider-hsv'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateHexValues);
    });
});

// HSL Event Listeners
document.getElementById('h-slider-hsl').addEventListener('input', (e) => {
    const h = parseInt(e.target.value);
    const s = parseInt(document.getElementById('s-slider-hsl').value);
    const l = parseInt(document.getElementById('l-slider-hsl').value);
    updateHslPreview(h, s, l);
});

document.getElementById('s-slider-hsl').addEventListener('input', (e) => {
    const h = parseInt(document.getElementById('h-slider-hsl').value);
    const s = parseInt(e.target.value);
    const l = parseInt(document.getElementById('l-slider-hsl').value);
    updateHslPreview(h, s, l);
});

document.getElementById('l-slider-hsl').addEventListener('input', (e) => {
    const h = parseInt(document.getElementById('h-slider-hsl').value);
    const s = parseInt(document.getElementById('s-slider-hsl').value);
    const l = parseInt(e.target.value);
    updateHslPreview(h, s, l);
});

// HSV Event Listeners
document.getElementById('h-slider-hsv').addEventListener('input', (e) => {
    const h = parseInt(e.target.value);
    const s = parseInt(document.getElementById('s-slider-hsv').value);
    const v = parseInt(document.getElementById('v-slider-hsv').value);
    updateHsvPreview(h, s, v);
});

document.getElementById('s-slider-hsv').addEventListener('input', (e) => {
    const h = parseInt(document.getElementById('h-slider-hsv').value);
    const s = parseInt(e.target.value);
    const v = parseInt(document.getElementById('v-slider-hsv').value);
    updateHsvPreview(h, s, v);
});

document.getElementById('v-slider-hsv').addEventListener('input', (e) => {
    const h = parseInt(document.getElementById('h-slider-hsv').value);
    const s = parseInt(document.getElementById('s-slider-hsv').value);
    const v = parseInt(e.target.value);
    updateHsvPreview(h, s, v);
});
// Sincronizar sliders RGB e campos de entrada
['r', 'g', 'b'].forEach(color => {
    const slider = document.getElementById(`${color}-slider`);
    const input = document.getElementById(`${color}-value`);

    // Atualiza o campo de entrada ao alterar o slider
    slider.addEventListener('input', () => {
        input.value = slider.value; // Sincroniza valor do slider com o campo
        updatePreviews();
    });

    // Atualiza o slider ao alterar o campo de entrada
    input.addEventListener('input', () => {
        slider.value = input.value; // Sincroniza valor do campo com o slider
        updatePreviews();
    });
});

// Sincronizar sliders HSL e campos de entrada
['h', 's', 'l'].forEach(color => {
    const slider = document.getElementById(`${color}-slider-hsl`);
    const input = document.getElementById(`${color}-value-hsl`);

    slider.addEventListener('input', () => {
        input.value = slider.value;
        const h = parseInt(document.getElementById('h-slider-hsl').value);
        const s = parseInt(document.getElementById('s-slider-hsl').value);
        const l = parseInt(document.getElementById('l-slider-hsl').value);
        updateHslPreview(h, s, l);
    });

    input.addEventListener('input', () => {
        slider.value = input.value;
        const h = parseInt(document.getElementById('h-slider-hsl').value);
        const s = parseInt(document.getElementById('s-slider-hsl').value);
        const l = parseInt(document.getElementById('l-slider-hsl').value);
        updateHslPreview(h, s, l);
    });
});

// Sincronizar sliders HSV e campos de entrada
['h', 's', 'v'].forEach(color => {
    const slider = document.getElementById(`${color}-slider-hsv`);
    const input = document.getElementById(`${color}-value-hsv`);

    slider.addEventListener('input', () => {
        input.value = slider.value;
        const h = parseInt(document.getElementById('h-slider-hsv').value);
        const s = parseInt(document.getElementById('s-slider-hsv').value);
        const v = parseInt(document.getElementById('v-slider-hsv').value);
        updateHsvPreview(h, s, v);
    });

    input.addEventListener('input', () => {
        slider.value = input.value;
        const h = parseInt(document.getElementById('h-slider-hsv').value);
        const s = parseInt(document.getElementById('s-slider-hsv').value);
        const v = parseInt(document.getElementById('v-slider-hsv').value);
        updateHsvPreview(h, s, v);
    });
});

// Referências aos elementos do modal de cores
const modalCores = document.getElementById('modal-cores');
const btnCores = document.getElementById('btn-cores');
const closeBtnCores = modalCores.querySelector('.close-btn');

// Abrir o modal
btnCores.addEventListener('click', () => {
    modalCores.style.display = 'flex';
});

// Fechar o modal
closeBtnCores.addEventListener('click', () => {
    modalCores.style.display = 'none';
});

// Fechar o modal clicando fora dele
window.addEventListener('click', (event) => {
    if (event.target === modalCores) {
        modalCores.style.display = 'none';
    }
});
document.getElementById('image-upload').addEventListener('change', function (event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = document.getElementById('uploaded-image');
        img.src = e.target.result;

        const canvas = document.getElementById('image-canvas');
        const ctx = canvas.getContext('2d');
        img.onload = () => {
            const maxDimension = 300; // Dimensão máxima para largura ou altura
            const scale = Math.min(maxDimension / img.width, maxDimension / img.height);
            const newWidth = img.width * scale;
            const newHeight = img.height * scale;

            canvas.width = newWidth;
            canvas.height = newHeight;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            // Atualizar o tamanho do elemento <img> para refletir o padrão
            img.style.width = `${newWidth}px`;
            img.style.height = `${newHeight}px`;

            // Processar cores da imagem
            processColors(ctx, canvas.width, canvas.height);
        };
    };

    reader.readAsDataURL(file);
});

function processColors(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const colorCounts = {};

    // Contar cores com filtro básico
    for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.round(pixels[i] / 10) * 10;   // Agrupando em intervalos de 10
        const g = Math.round(pixels[i + 1] / 10) * 10;
        const b = Math.round(pixels[i + 2] / 10) * 10;
        const color = `rgb(${r},${g},${b})`;

        if (!colorCounts[color]) {
            colorCounts[color] = 0;
        }
        colorCounts[color]++;
    }

    // Ordenar cores pela frequência
    const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);

    // Mostrar cores dominantes
    displayColors(sortedColors.slice(0, 5));

    // Mostrar a cor mais dominante
    displayDominantColor(sortedColors[0][0]);
}
function displayColors(colors) {
    const palette = document.getElementById('colors');
    palette.innerHTML = '';

    colors.forEach(color => {
        const div = document.createElement('div');
        div.style.backgroundColor = color[0];
        div.style.width = '50px';
        div.style.height = '50px';
        div.style.display = 'inline-block';
        div.style.margin = '5px';

        // Exibir valores RGB abaixo
        const label = document.createElement('span');
        label.textContent = color[0];
        label.style.display = 'block';
        label.style.textAlign = 'center';
        label.style.fontSize = '12px';

        const container = document.createElement('div');
        container.style.display = 'inline-block';
        container.style.textAlign = 'center';
        container.appendChild(div);
        container.appendChild(label);

        palette.appendChild(container);
    });
}

function displayDominantColor(color) {
    const dominantDiv = document.getElementById('dominant-color');
    dominantDiv.style.backgroundColor = color;
    dominantDiv.textContent = color;
    dominantDiv.style.textAlign = 'center';
    dominantDiv.style.lineHeight = '100px';
    dominantDiv.style.color = '#fff';
}

// Sistema de cores - Fim


