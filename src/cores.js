class CoresApp {
  constructor() {
    // Exibe apenas a interface de Sistema de Cores ao clicar no botão correspondente
    document.getElementById('color-system-btn').addEventListener('click', () => {
      this.showColorSystem();
    });

    // Inicializa os event listeners dos sliders e inputs
    this.initRGBSliders();
    this.initHSLSliders();
    this.initHSVSliders();

    // Atualiza as pré-visualizações quando o DOM estiver carregado
    document.addEventListener('DOMContentLoaded', () => {
      this.updatePreviews();
      this.updateRgbSliderBackgrounds();
      this.updateHslSliderBackgrounds();
      this.updateHsvSliderBackgrounds();
    });

    // Inicializa os modais de sistemas de cores
    this.initModals();

    // Configura o evento de upload de imagem
    document.getElementById('image-upload').addEventListener('change', (event) => {
      this.handleImageUpload(event);
    });
  }

  showColorSystem() {
    document.getElementById('phong-container').classList.add('hidden');
    document.getElementById('canvas-container').classList.add('hidden');
    document.getElementById('curvas-container').classList.add('hidden');
    document.getElementById('color-system-container').classList.remove('hidden');
  }

  // Conversão de HSL para RGB
  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  updateHslPreview(h, s, l) {
    const [r, g, b] = this.hslToRgb(h, s, l);
    document.getElementById('hsl-preview')
      .style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    this.updateHexValues();
    this.updateHslSliderBackgrounds();
  }

  updateHslSliderBackgrounds() {
    const h = +document.getElementById('h-slider-hsl').value;
    const s = +document.getElementById('s-slider-hsl').value;
    const l = +document.getElementById('l-slider-hsl').value;

    // Saturação: do cinza (0%) à cor plena (100%)
    document.getElementById('s-slider-hsl').style.background = `
      linear-gradient(to right,
        hsl(${h},0%,${l}%),
        hsl(${h},100%,${l}%)
      )`;

    // Luminosidade: do preto à cor no meio e ao branco
    document.getElementById('l-slider-hsl').style.background = `
      linear-gradient(to right,
        hsl(${h},${s}%,0%),
        hsl(${h},${s}%,50%),
        hsl(${h},${s}%,100%)
      )`;
  }

  // Conversão de HSV para RGB
  hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
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

  updateHsvPreview(h, s, v) {
    const [r, g, b] = this.hsvToRgb(h, s, v);
    document.getElementById('hsv-preview')
      .style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    this.updateHexValues();
    this.updateHsvSliderBackgrounds();
  }

  updateHsvSliderBackgrounds() {
    const h = +document.getElementById('h-slider-hsv').value;
    const s = +document.getElementById('s-slider-hsv').value;
    const v = +document.getElementById('v-slider-hsv').value;

    // Saturação: de “sem cor” (cinza) à cor cheia
    const off = this.hsvToRgb(h, 0, v).join(',');
    const on  = this.hsvToRgb(h, 100, v).join(',');
    document.getElementById('s-slider-hsv').style.background = `
      linear-gradient(to right,
        rgb(${off}),
        rgb(${on})
      )`;

    // Valor: do preto à cor plena
    const black  = this.hsvToRgb(h, s, 0).join(',');
    const bright = this.hsvToRgb(h, s, 100).join(',');
    document.getElementById('v-slider-hsv').style.background = `
      linear-gradient(to right,
        rgb(${black}),
        rgb(${bright})
      )`;
  }

  // Atualiza os valores HEX para os três sistemas de cores
  updateHexValues() {
    // HEX para RGB
    const rgb = this.getRGB();
    const hexRgb = this.rgbToHex(rgb.r, rgb.g, rgb.b);
    document.getElementById('hex-value-rgb').textContent = hexRgb;

    // HEX para HSL
    const h = parseInt(document.getElementById('h-slider-hsl').value, 10);
    const s = parseInt(document.getElementById('s-slider-hsl').value, 10);
    const l = parseInt(document.getElementById('l-slider-hsl').value, 10);
    const rgbFromHsl = this.hslToRgb(h, s, l);
    const hexHsl = this.rgbToHex(rgbFromHsl[0], rgbFromHsl[1], rgbFromHsl[2]);
    document.getElementById('hex-value-hsl').textContent = hexHsl;

    // HEX para HSV
    const hHsv = parseInt(document.getElementById('h-slider-hsv').value, 10);
    const sHsv = parseInt(document.getElementById('s-slider-hsv').value, 10);
    const vHsv = parseInt(document.getElementById('v-slider-hsv').value, 10);
    const rgbFromHsv = this.hsvToRgb(hHsv, sHsv, vHsv);
    const hexHsv = this.rgbToHex(rgbFromHsv[0], rgbFromHsv[1], rgbFromHsv[2]);
    document.getElementById('hex-value-hsv').textContent = hexHsv;
  }

  setSliderValues(h, s, v) {
    document.getElementById('h-slider-hsv').value = h;
    document.getElementById('s-slider-hsv').value = s;
    document.getElementById('v-slider-hsv').value = v;
    document.getElementById('h-value-hsv').value = h;
    document.getElementById('s-value-hsv').value = s;
    document.getElementById('v-value-hsv').value = v;
  }

  // Conversão de RGB para HEX
  rgbToHex(r, g, b) {
    const toHex = value => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  // Conversão de RGB para HSV (não utilizada diretamente neste script, mas disponível)
  rgbToHsv(r, g, b) {
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

  updateHexPreview() {
    const rgb = this.getRGB();
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
    const hexElem = document.getElementById('hex-value');
    if (hexElem) {
      hexElem.textContent = hex;
    }
  }

  getRGB() {
    return {
      r: parseInt(document.getElementById('r-slider').value, 10),
      g: parseInt(document.getElementById('g-slider').value, 10),
      b: parseInt(document.getElementById('b-slider').value, 10)
    };
  }

  updatePreviews() {
    const rgb = this.getRGB();
    document.getElementById('rgb-preview')
      .style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    this.updateHexValues();
    this.updateRgbSliderBackgrounds();
  }
  updateRgbSliderBackgrounds() {
    const { r, g, b } = this.getRGB();

    document.getElementById('r-slider').style.background = `
      linear-gradient(to right,
        rgb(0,${g},${b}),
        rgb(255,${g},${b})
      )`;

    document.getElementById('g-slider').style.background = `
      linear-gradient(to right,
        rgb(${r},0,${b}),
        rgb(${r},255,${b})
      )`;

    document.getElementById('b-slider').style.background = `
      linear-gradient(to right,
        rgb(${r},${g},0),
        rgb(${r},${g},255)
      )`;
  }

  // Inicializa os sliders RGB e sincroniza seus inputs
  initRGBSliders() {
    ['r-slider', 'g-slider', 'b-slider'].forEach(id => {
      const slider = document.getElementById(id);
      slider.addEventListener('input', () => this.updatePreviews());
    });
    ['r', 'g', 'b'].forEach(color => {
      const slider = document.getElementById(`${color}-slider`);
      const input = document.getElementById(`${color}-value`);
      slider.addEventListener('input', () => {
        input.value = slider.value;
        this.updatePreviews();
      });
      input.addEventListener('input', () => {
        slider.value = input.value;
        this.updatePreviews();
      });
    });
  }

  // Inicializa os sliders HSL e sincroniza com os inputs
  initHSLSliders() {
    document.getElementById('h-slider-hsl').addEventListener('input', (e) => {
      const h = parseInt(e.target.value);
      const s = parseInt(document.getElementById('s-slider-hsl').value);
      const l = parseInt(document.getElementById('l-slider-hsl').value);
      this.updateHslPreview(h, s, l);
    });
    document.getElementById('s-slider-hsl').addEventListener('input', (e) => {
      const h = parseInt(document.getElementById('h-slider-hsl').value);
      const s = parseInt(e.target.value);
      const l = parseInt(document.getElementById('l-slider-hsl').value);
      this.updateHslPreview(h, s, l);
    });
    document.getElementById('l-slider-hsl').addEventListener('input', (e) => {
      const h = parseInt(document.getElementById('h-slider-hsl').value);
      const s = parseInt(document.getElementById('s-slider-hsl').value);
      const l = parseInt(e.target.value);
      this.updateHslPreview(h, s, l);
    });
    ['h', 's', 'l'].forEach(color => {
      const slider = document.getElementById(`${color}-slider-hsl`);
      const input = document.getElementById(`${color}-value-hsl`);
      slider.addEventListener('input', () => {
        input.value = slider.value;
        const h = parseInt(document.getElementById('h-slider-hsl').value);
        const s = parseInt(document.getElementById('s-slider-hsl').value);
        const l = parseInt(document.getElementById('l-slider-hsl').value);
        this.updateHslPreview(h, s, l);
      });
      input.addEventListener('input', () => {
        slider.value = input.value;
        const h = parseInt(document.getElementById('h-slider-hsl').value);
        const s = parseInt(document.getElementById('s-slider-hsl').value);
        const l = parseInt(document.getElementById('l-slider-hsl').value);
        this.updateHslPreview(h, s, l);
      });
    });
  }

  // Inicializa os sliders HSV e sincroniza com os inputs
  initHSVSliders() {
    document.getElementById('h-slider-hsv').addEventListener('input', (e) => {
      const h = parseInt(e.target.value);
      const s = parseInt(document.getElementById('s-slider-hsv').value);
      const v = parseInt(document.getElementById('v-slider-hsv').value);
      this.updateHsvPreview(h, s, v);
    });
    document.getElementById('s-slider-hsv').addEventListener('input', (e) => {
      const h = parseInt(document.getElementById('h-slider-hsv').value);
      const s = parseInt(e.target.value);
      const v = parseInt(document.getElementById('v-slider-hsv').value);
      this.updateHsvPreview(h, s, v);
    });
    document.getElementById('v-slider-hsv').addEventListener('input', (e) => {
      const h = parseInt(document.getElementById('h-slider-hsv').value);
      const s = parseInt(document.getElementById('s-slider-hsv').value);
      const v = parseInt(e.target.value);
      this.updateHsvPreview(h, s, v);
    });
    ['h', 's', 'v'].forEach(color => {
      const slider = document.getElementById(`${color}-slider-hsv`);
      const input = document.getElementById(`${color}-value-hsv`);
      slider.addEventListener('input', () => {
        input.value = slider.value;
        const h = parseInt(document.getElementById('h-slider-hsv').value);
        const s = parseInt(document.getElementById('s-slider-hsv').value);
        const v = parseInt(document.getElementById('v-slider-hsv').value);
        this.updateHsvPreview(h, s, v);
      });
      input.addEventListener('input', () => {
        slider.value = input.value;
        const h = parseInt(document.getElementById('h-slider-hsv').value);
        const s = parseInt(document.getElementById('s-slider-hsv').value);
        const v = parseInt(document.getElementById('v-slider-hsv').value);
        this.updateHsvPreview(h, s, v);
      });
    });
  }

  // Inicializa os modais (abertura e fechamento)
  initModals() {
    const modalCores = document.getElementById('modal-cores');
    const btnCores = document.getElementById('btn-cores');
    const closeBtnCores = modalCores.querySelector('.close-btn');
    btnCores.addEventListener('click', () => modalCores.classList.remove('hidden'));
    closeBtnCores.addEventListener('click', () => modalCores.classList.add('hidden'));
    window.addEventListener('click', (event) => {
      if (event.target === modalCores) {
        modalCores.classList.add('hidden');
      }
    });
  }

  // Manipula o upload de imagem e processa as cores
  handleImageUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('uploaded-image');
      img.src = e.target.result;
      const canvas = document.getElementById('image-canvas');
      const ctx = canvas.getContext('2d');
      img.onload = () => {
        const maxDimension = 300;
        const scale = Math.min(maxDimension / img.width, maxDimension / img.height);
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        img.style.width = `${newWidth}px`;
        img.style.height = `${newHeight}px`;
        this.processColors(ctx, canvas.width, canvas.height);
      };
    };
    reader.readAsDataURL(file);
  }

  // Processa as cores da imagem e atualiza a paleta
  processColors(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const colorCounts = {};
    for (let i = 0; i < pixels.length; i += 4) {
      const r = Math.round(pixels[i] / 10) * 10;
      const g = Math.round(pixels[i + 1] / 10) * 10;
      const b = Math.round(pixels[i + 2] / 10) * 10;
      const color = `rgb(${r},${g},${b})`;
      if (!colorCounts[color]) {
        colorCounts[color] = 0;
      }
      colorCounts[color]++;
    }
    const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
    this.displayColors(sortedColors.slice(0, 5));
    if (sortedColors.length > 0) {
      this.displayDominantColor(sortedColors[0][0]);
    }
  }

  // Exibe a paleta de cores
  displayColors(colors) {
    const palette = document.getElementById('colors');
    palette.innerHTML = '';
    colors.forEach(color => {
      const div = document.createElement('div');
      div.style.backgroundColor = color[0];
      div.style.width = '50px';
      div.style.height = '50px';
      div.style.display = 'inline-block';
      div.style.margin = '5px';
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

  // Exibe a cor dominante
  displayDominantColor(color) {
    const dominantDiv = document.getElementById('dominant-color');
    if (dominantDiv) {
      dominantDiv.style.backgroundColor = color;
      dominantDiv.textContent = color;
      dominantDiv.style.textAlign = 'center';
      dominantDiv.style.lineHeight = '100px';
      dominantDiv.style.color = '#fff';
    }
  }
}

// Instancia a aplicação de cores
const coresApp = new CoresApp();
