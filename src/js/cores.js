// cores.js — Sistema de Cores Didático (v2.3) com Lupa do Conta-gotas

class CoresApp {
  constructor() {
    this.state = {
      r: 255,
      g: 255,
      b: 255,
      hsl: { h: 0, s: 0, l: 100 },
      hsv: { h: 0, s: 0, v: 100 },
      useLCH: false,
      cvd: { type: "none", severity: 1.0 },
      updating: false,
    };

    this.bindElements();
    this.wireEvents();
    this.initModals();
    this.initImageHandlers();
    this.ensureAuxUI(); // contraste + harmonias
    this.refreshAll("rgb");
  }

  q(sel) {
    return document.querySelector(sel);
  }

  bindElements() {
    this.el = {
      // RGB
      rSlider: this.q("#r-slider"),
      gSlider: this.q("#g-slider"),
      bSlider: this.q("#b-slider"),
      rInput: this.q("#r-value"),
      gInput: this.q("#g-value"),
      bInput: this.q("#b-value"),
      rgbPreview: this.q("#rgb-preview"),
      hexRgb: this.q("#hex-value-rgb"),

      // HSL
      hSldrHsl: this.q("#h-slider-hsl"),
      sSldrHsl: this.q("#s-slider-hsl"),
      lSldrHsl: this.q("#l-slider-hsl"),
      hValHsl: this.q("#h-value-hsl"),
      sValHsl: this.q("#s-value-hsl"),
      lValHsl: this.q("#l-value-hsl"),
      hslPreview: this.q("#hsl-preview"),
      hexHsl: this.q("#hex-value-hsl"),

      // HSV
      hSldrHsv: this.q("#h-slider-hsv"),
      sSldrHsv: this.q("#s-slider-hsv"),
      vSldrHsv: this.q("#v-slider-hsv"),
      hValHsv: this.q("#h-value-hsv"),
      sValHsv: this.q("#s-value-hsv"),
      vValHsv: this.q("#v-value-hsv"),
      hsvPreview: this.q("#hsv-preview"),
      hexHsv: this.q("#hex-value-hsv"),

      // Imagem / paleta
      fileInput: this.q("#image-upload"),
      img: this.q("#uploaded-image"),
      canvas: this.q("#image-canvas"),
      colorsWrap: this.q("#colors"),

      // Controles extras
      colorControls: this.q("#color-controls"),
      imageContainer: this.q("#image-container"),
      modalCores: this.q("#modal-cores"),
      btnCores: this.q("#btn-cores"),

      // LCH + Daltonismo
      toggleLCH: this.q("#toggle-lch"),
      cvdType: this.q("#cvd-type"),
      cvdSev: this.q("#cvd-sev"),
      cvdSevVal: this.q("#cvd-sev-value"),
    };
    if (this.el.canvas) this.ctx = this.el.canvas.getContext("2d");

    // ---- LUPA (DOM dinamicamente) ----
    this.el.loupe = document.createElement("div");
    this.el.loupe.id = "color-loupe";
    this.el.loupeCanvas = document.createElement("canvas");
    this.el.loupeCanvas.width = 120;
    this.el.loupeCanvas.height = 120;
    this.el.loupeBadge = document.createElement("div");
    this.el.loupeBadge.className = "loupe-badge";
    this.el.loupeBadge.textContent = "#FFFFFF";

    this.el.loupe.appendChild(this.el.loupeCanvas);
    this.el.loupe.appendChild(this.el.loupeBadge);
    this.el.imageContainer?.appendChild(this.el.loupe);
    this.ctxLoupe = this.el.loupeCanvas.getContext("2d");
  }

  wireEvents() {
    // RGB
    this.el.rSlider?.addEventListener("input", () => this.updateFromRGB());
    this.el.gSlider?.addEventListener("input", () => this.updateFromRGB());
    this.el.bSlider?.addEventListener("input", () => this.updateFromRGB());
    this.el.rInput?.addEventListener("input", () => this.updateFromRGB(true));
    this.el.gInput?.addEventListener("input", () => this.updateFromRGB(true));
    this.el.bInput?.addEventListener("input", () => this.updateFromRGB(true));

    // HSL
    this.el.hSldrHsl?.addEventListener("input", () => this.updateFromHSL());
    this.el.sSldrHsl?.addEventListener("input", () => this.updateFromHSL());
    this.el.lSldrHsl?.addEventListener("input", () => this.updateFromHSL());
    this.el.hValHsl?.addEventListener("input", () => this.updateFromHSL(true));
    this.el.sValHsl?.addEventListener("input", () => this.updateFromHSL(true));
    this.el.lValHsl?.addEventListener("input", () => this.updateFromHSL(true));

    // HSV
    this.el.hSldrHsv?.addEventListener("input", () => this.updateFromHSV());
    this.el.sSldrHsv?.addEventListener("input", () => this.updateFromHSV());
    this.el.vSldrHsv?.addEventListener("input", () => this.updateFromHSV());
    this.el.hValHsv?.addEventListener("input", () => this.updateFromHSV(true));
    this.el.sValHsv?.addEventListener("input", () => this.updateFromHSV(true));
    this.el.vValHsv?.addEventListener("input", () => this.updateFromHSV(true));

    // Copiar HEX
    [this.el.hexRgb, this.el.hexHsl, this.el.hexHsv].forEach((el) => {
      el?.addEventListener("click", () => this.copyHex(el.textContent));
    });

    // LCH + Daltonismo
    this.el.toggleLCH?.addEventListener("change", () => {
      this.state.useLCH = !!this.el.toggleLCH.checked;
      this.updateHarmonies();
    });
    this.el.cvdType?.addEventListener("change", () => {
      this.state.cvd.type = this.el.cvdType.value;
      this.refreshAll();
    });
    this.el.cvdSev?.addEventListener("input", () => {
      const v = (parseInt(this.el.cvdSev.value, 10) || 0) / 100;
      this.state.cvd.severity = v;
      this.el.cvdSevVal &&
        (this.el.cvdSevVal.textContent = `${Math.round(v * 100)}%`);
      this.refreshAll();
    });
  }

  initModals() {
    const modal = this.el.modalCores,
      btn = this.el.btnCores;
    if (!modal || !btn) return;
    const close = modal.querySelector(".close-btn");
    btn.addEventListener("click", () => modal.classList.remove("hidden"));
    close?.addEventListener("click", () => modal.classList.add("hidden"));
    window.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  rgbToHex(r, g, b) {
    const h = (v) => v.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  }
  hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 0, g: 0, b: 0 };
  }

  srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  linearToSrgb(c) {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return this.clamp(Math.round(v * 255), 0, 255);
  }

  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12,
      a = s * Math.min(l, 1 - l);
    const f = (n) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [
      Math.round(f(0) * 255),
      Math.round(f(8) * 255),
      Math.round(f(4) * 255),
    ];
  }
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2,
      d = max - min;
    if (d === 0) h = 0;
    else {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
    }
    s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }
  rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h,
      s = max === 0 ? 0 : d / max,
      v = max;
    if (d === 0) h = 0;
    else {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  rgbToXyz(r, g, b) {
    const R = this.srgbToLinear(r),
      G = this.srgbToLinear(g),
      B = this.srgbToLinear(b);
    return {
      X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
      Y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
      Z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B,
    };
  }
  xyzToRgb(X, Y, Z) {
    let R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
      G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
      B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    return [
      this.linearToSrgb(this.clamp(R, 0, 1)),
      this.linearToSrgb(this.clamp(G, 0, 1)),
      this.linearToSrgb(this.clamp(B, 0, 1)),
    ];
  }

  xyzToLab(X, Y, Z) {
    const Xn = 0.95047,
      Yn = 1,
      Zn = 1.08883,
      f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X / Xn),
      fy = f(Y / Yn),
      fz = f(Z / Zn);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }
  labToXyz(L, a, b) {
    const Xn = 0.95047,
      Yn = 1,
      Zn = 1.08883,
      fy = (L + 16) / 116,
      fx = fy + a / 500,
      fz = fy - b / 200,
      finv = (t) => {
        const t3 = t * t * t;
        return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
      };
    return { X: Xn * finv(fx), Y: Yn * finv(fy), Z: Zn * finv(fz) };
  }
  labToLch(L, a, b) {
    const C = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { L, C, h };
  }
  lchToLab(L, C, h) {
    const hr = h * (Math.PI / 180);
    return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
  }

  setRGB(r, g, b) {
    this.state.r = this.clamp(+r | 0, 0, 255);
    this.state.g = this.clamp(+g | 0, 0, 255);
    this.state.b = this.clamp(+b | 0, 0, 255);
  }

  updateFromRGB(fromInputs = false) {
    if (this.state.updating) return;
    this.state.updating = true;
    const r = fromInputs ? this.el.rInput.value : this.el.rSlider.value;
    const g = fromInputs ? this.el.gInput.value : this.el.gSlider.value;
    const b = fromInputs ? this.el.bInput.value : this.el.bSlider.value;
    this.setRGB(r, g, b);
    this.refreshAll("rgb");
    this.state.updating = false;
  }
  updateFromHSL(fromInputs = false) {
    if (this.state.updating) return;
    this.state.updating = true;
    const h = +(fromInputs ? this.el.hValHsl.value : this.el.hSldrHsl.value);
    const s = +(fromInputs ? this.el.sValHsl.value : this.el.sSldrHsl.value);
    const l = +(fromInputs ? this.el.lValHsl.value : this.el.lSldrHsl.value);
    const [r, g, b] = this.hslToRgb(
      this.clamp(h, 0, 360),
      this.clamp(s, 0, 100),
      this.clamp(l, 0, 100)
    );
    this.setRGB(r, g, b);
    this.refreshAll("hsl");
    this.state.updating = false;
  }
  updateFromHSV(fromInputs = false) {
    if (this.state.updating) return;
    this.state.updating = true;
    const h = +(fromInputs ? this.el.hValHsv.value : this.el.hSldrHsv.value);
    const s = +(fromInputs ? this.el.sValHsv.value : this.el.sSldrHsv.value);
    const v = +(fromInputs ? this.el.vValHsv.value : this.el.vSldrHsv.value);
    const [r, g, b] = this.hsvToRgb(
      this.clamp(h, 0, 360),
      this.clamp(s, 0, 100),
      this.clamp(v, 0, 100)
    );
    this.setRGB(r, g, b);
    this.refreshAll("hsv");
    this.state.updating = false;
  }

  refreshAll() {
    this.state.hsl = this.rgbToHsl(this.state.r, this.state.g, this.state.b);
    this.state.hsv = this.rgbToHsv(this.state.r, this.state.g, this.state.b);
    this.reflectToUI();
    this.updatePreviewsAndHex();
    this.updateRgbSliderBackgrounds();
    this.updateHslSliderBackgrounds();
    this.updateHsvSliderBackgrounds();
    this.updateHarmonies();
  }

  reflectToUI() {
    const { r, g, b } = this.state,
      { h: sH, s: sS, l } = this.state.hsl,
      { h: vH, s: vS, v } = this.state.hsv;
    // RGB
    this.el.rSlider && (this.el.rSlider.value = r);
    this.el.gSlider && (this.el.gSlider.value = g);
    this.el.bSlider && (this.el.bSlider.value = b);
    this.el.rInput && (this.el.rInput.value = r);
    this.el.gInput && (this.el.gInput.value = g);
    this.el.bInput && (this.el.bInput.value = b);
    // HSL
    this.el.hSldrHsl && (this.el.hSldrHsl.value = sH);
    this.el.sSldrHsl && (this.el.sSldrHsl.value = sS);
    this.el.lSldrHsl && (this.el.lSldrHsl.value = l);
    this.el.hValHsl && (this.el.hValHsl.value = sH);
    this.el.sValHsl && (this.el.sValHsl.value = sS);
    this.el.lValHsl && (this.el.lValHsl.value = l);
    // HSV
    this.el.hSldrHsv && (this.el.hSldrHsv.value = vH);
    this.el.sSldrHsv && (this.el.sSldrHsv.value = vS);
    this.el.vSldrHsv && (this.el.vSldrHsv.value = v);
    this.el.hValHsv && (this.el.hValHsv.value = vH);
    this.el.sValHsv && (this.el.sValHsv.value = vS);
    this.el.vValHsv && (this.el.vValHsv.value = v);
  }

  setElBg(el, hex) {
    if (el) el.style.backgroundColor = hex;
  }

  updatePreviewsAndHex() {
    const { r, g, b } = this.state,
      hex = this.rgbToHex(r, g, b);
    const displayHex = this.getDisplayHex(hex);

    this.setElBg(this.el.rgbPreview, displayHex);
    this.setElBg(this.el.hslPreview, displayHex);
    this.setElBg(this.el.hsvPreview, displayHex);

    this.el.hexRgb && (this.el.hexRgb.textContent = hex);
    this.el.hexHsl && (this.el.hexHsl.textContent = hex);
    this.el.hexHsv && (this.el.hexHsv.textContent = hex);

    this.updateContrastBlock(this.blocks?.rgbContrast, hex, displayHex);
    this.updateContrastBlock(this.blocks?.hslContrast, hex, displayHex);
    this.updateContrastBlock(this.blocks?.hsvContrast, hex, displayHex);
  }

  updateContrastBlock(block, hexReal, hexDisplay = hexReal) {
    if (!block) return;
    const bg = this.hexToRgb(hexReal);
    const ratioBlack = this.contrastRatio(bg, { r: 0, g: 0, b: 0 });
    const ratioWhite = this.contrastRatio(bg, { r: 255, g: 255, b: 255 });
    const better =
      ratioBlack > ratioWhite
        ? { color: "#000", ratio: ratioBlack }
        : { color: "#fff", ratio: ratioWhite };

    const ratioEl = block.querySelector(".ratio");
    const recEl = block.querySelector(".text-rec");
    const sDark = block.querySelector(".sample-dark");
    const sLight = block.querySelector(".sample-light");

    ratioEl && (ratioEl.textContent = better.ratio.toFixed(2) + " : 1");
    if (recEl) {
      recEl.textContent = better.color === "#000" ? "preto" : "branco";
      recEl.classList.toggle("text-rec--dark", better.color === "#000");
      recEl.classList.toggle("text-rec--light", better.color === "#fff");
    }
    sDark && (sDark.style.backgroundColor = hexDisplay);
    sLight && (sLight.style.backgroundColor = hexDisplay);
    if (sDark) sDark.style.color = "#000";
    if (sLight) sLight.style.color = "#fff";
    sDark?.classList.toggle("is-recommended", better.color === "#000");
    sLight?.classList.toggle("is-recommended", better.color === "#fff");
  }

  relLuminance({ r, g, b }) {
    const s = [r, g, b]
      .map((v) => v / 255)
      .map((c) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      );
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  contrastRatio(rgb1, rgb2) {
    const L1 = this.relLuminance(rgb1),
      L2 = this.relLuminance(rgb2);
    const lighter = Math.max(L1, L2) + 0.05,
      darker = Math.min(L1, L2) + 0.05;
    return lighter / darker;
  }

  /* ---------- sliders coloridos (usam --track-bg) ---------- */
  updateRgbSliderBackgrounds() {
    const { r, g, b } = this.state;
    this.el.rSlider?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, rgb(0,${g},${b}), rgb(255,${g},${b}))`
    );
    this.el.gSlider?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, rgb(${r},0,${b}), rgb(${r},255,${b}))`
    );
    this.el.bSlider?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, rgb(${r},${g},0), rgb(${r},${g},255))`
    );
  }
  updateHslSliderBackgrounds() {
    const { h, s, l } = this.state.hsl;
    this.el.hSldrHsl?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, red, yellow, green, cyan, blue, magenta, red)`
    );
    this.el.sSldrHsl?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, hsl(${h},0%,${l}%),
                               hsl(${h},100%,${l}%))`
    );
    this.el.lSldrHsl?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, hsl(${h},${s}%,0%),
                               hsl(${h},${s}%,50%),
                               hsl(${h},${s}%,100%))`
    );
  }
  updateHsvSliderBackgrounds() {
    const { h, s, v } = this.state.hsv;
    this.el.hSldrHsv?.style.setProperty(
      "--track-bg",
      `linear-gradient(to right, red, yellow, green, cyan, blue, magenta, red)`
    );
    if (this.el.sSldrHsv) {
      const off = this.hsvToRgb(h, 0, v).join(","),
        on = this.hsvToRgb(h, 100, v).join(",");
      this.el.sSldrHsv.style.setProperty(
        "--track-bg",
        `linear-gradient(to right, rgb(${off}), rgb(${on}))`
      );
    }
    if (this.el.vSldrHsv) {
      const black = this.hsvToRgb(h, s, 0).join(","),
        bright = this.hsvToRgb(h, s, 100).join(",");
      this.el.vSldrHsv.style.setProperty(
        "--track-bg",
        `linear-gradient(to right, rgb(${black}), rgb(${bright}))`
      );
    }
  }

  updateHarmonies() {
    if (!this.blocks?.harmony) return;
    const hexBase = this.rgbToHex(this.state.r, this.state.g, this.state.b);
    let harmonies = {};
    if (this.state.useLCH) {
      const { X, Y, Z } = this.rgbToXyz(
        this.state.r,
        this.state.g,
        this.state.b
      );
      const { L, a, b } = this.xyzToLab(X, Y, Z);
      const { L: LL, C, h } = this.labToLch(L, a, b);
      const mk = (d) => {
        const lab = this.lchToLab(LL, C, (h + d + 360) % 360);
        const xyz = this.labToXyz(lab.L, lab.a, lab.b);
        const [r, g, b2] = this.xyzToRgb(xyz.X, xyz.Y, xyz.Z);
        return this.rgbToHex(r, g, b2);
      };
      harmonies = {
        comp: mk(180),
        "anal-1": mk(-30),
        "anal-2": mk(+30),
        "tri-1": mk(-120),
        "tri-2": mk(+120),
      };
    } else {
      const { h, s, l } = this.state.hsl;
      const mk = (d) =>
        this.rgbToHex(...this.hslToRgb((h + d + 360) % 360, s, l));
      harmonies = {
        comp: mk(180),
        "anal-1": mk(-30),
        "anal-2": mk(+30),
        "tri-1": mk(-120),
        "tri-2": mk(+120),
      };
    }
    for (const [kind, hex] of Object.entries(harmonies)) {
      const el = this.blocks.harmony.querySelector(
        `.swatch[data-kind="${kind}"]`
      );
      if (!el) continue;
      el.dataset.hex = hex;
      el.style.background = this.getDisplayHex(hex);
    }
  }

  ensureAuxUI() {
    const mountContrast = (previewEl) => {
      const panel = previewEl?.closest(".color-panel");
      if (!panel) return null;
      const box = document.createElement("div");
      box.className = "contrast-info";
      box.innerHTML = `
        <div><strong>Contraste</strong>: <span class="ratio">–</span></div>
        <div>Texto recomendado: <span class="text-rec">–</span></div>
        <div class="demo">
          <div class="sample sample-dark">Aa</div>
          <div class="sample sample-light">Aa</div>
        </div>`;
      panel.appendChild(box);
      return box;
    };
    const mountHarmony = () => {
      const wrap = document.createElement("div");
      wrap.className = "harmony";
      wrap.style.cssText =
        "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;";
      wrap.innerHTML = `
        <div style="width:100%"><strong>Harmonias</strong> <small>(clique para aplicar)</small></div>
        <div class="swatch" data-kind="comp"   title="Complementar"   style="width:40px;height:40px;border-radius:6px;border:1px solid #555;cursor:pointer;"></div>
        <div class="swatch" data-kind="anal-1" title="Análoga (-30°)"  style="width:40px;height:40px;border-radius:6px;border:1px solid #555;cursor:pointer;"></div>
        <div class="swatch" data-kind="anal-2" title="Análoga (+30°)"  style="width:40px;height:40px;border-radius:6px;border:1px solid #555;cursor:pointer;"></div>
        <div class="swatch" data-kind="tri-1"  title="Tríade (-120°)"  style="width:40px;height:40px;border-radius:6px;border:1px solid #555;cursor:pointer;"></div>
        <div class="swatch" data-kind="tri-2"  title="Tríade (+120°)"  style="width:40px;height:40px;border-radius:6px;border:1px solid #555;cursor:pointer;"></div>`;
      this.el.colorControls?.appendChild(wrap);
      wrap.addEventListener("click", (e) => {
        const sw = e.target.closest(".swatch");
        if (!sw) return;
        const hex = sw.dataset.hex;
        if (!hex) return;
        const { r, g, b } = this.hexToRgb(hex);
        this.setRGB(r, g, b);
        this.refreshAll("rgb");
      });
      return wrap;
    };

    this.blocks = this.blocks || {};
    this.blocks.rgbContrast =
      this.blocks.rgbContrast || mountContrast(this.el.rgbPreview);
    this.blocks.hslContrast =
      this.blocks.hslContrast || mountContrast(this.el.hslPreview);
    this.blocks.hsvContrast =
      this.blocks.hsvContrast || mountContrast(this.el.hsvPreview);
    this.blocks.harmony = this.blocks.harmony || mountHarmony();
  }

  /* ---------- Upload/Paleta/Conta-gotas ---------- */
  initImageHandlers() {
    if (!this.el.fileInput) return;
    this.el.fileInput.addEventListener("change", (e) =>
      this.handleImageUpload(e)
    );

    // conta-gotas: hover com lupa + click pega a cor
    if (this.el.canvas) {
      const onMove = (ev) => {
        this._lastMouseEvent = ev;
        if (this._loupeRAF) return;
        this._loupeRAF = requestAnimationFrame(() => {
          this._loupeRAF = 0;
          this.updateLoupe(this._lastMouseEvent);
        });
      };
      this.el.canvas.addEventListener("mousemove", onMove);
      this.el.canvas.addEventListener("mouseleave", () => this.hideLoupe());
      this.el.canvas.addEventListener("click", (e) => {
        const { x, y } = this.canvasPixelFromEvent(e);
        if (x < 0 || y < 0) return;
        const px = this.ctx.getImageData(x, y, 1, 1).data;
        this.setRGB(px[0], px[1], px[2]);
        this.refreshAll("rgb");
        this.hideLoupe();
      });
    }
  }

  handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.el.img.src = e.target.result;
      this.el.img.onload = () => {
        const maxD = 300,
          s = Math.min(
            maxD / this.el.img.naturalWidth,
            maxD / this.el.img.naturalHeight,
            1
          );
        const w = Math.max(1, Math.round(this.el.img.naturalWidth * s));
        const h = Math.max(1, Math.round(this.el.img.naturalHeight * s));

        this.el.canvas.width = w;
        this.el.canvas.height = h;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(this.el.img, 0, 0, w, h);

        this.el.canvas.classList.remove("hidden", "is-hidden", "is-empty");
        this.el.canvas.style.display = "block";
        this.el.img.style.display = "none";

        this.extractPaletteKMeans(5);
      };
    };
    reader.readAsDataURL(file);
  }

  /* ---------- Lupa do conta-gotas ---------- */
  canvasPixelFromEvent(e) {
    if (!this.el.canvas?.width) return { x: -1, y: -1 };
    const rect = this.el.canvas.getBoundingClientRect();
    const x = Math.floor(
      (e.clientX - rect.left) * (this.el.canvas.width / rect.width)
    );
    const y = Math.floor(
      (e.clientY - rect.top) * (this.el.canvas.height / rect.height)
    );
    return {
      x: this.clamp(x, 0, this.el.canvas.width - 1),
      y: this.clamp(y, 0, this.el.canvas.height - 1),
    };
  }
  updateLoupe(e) {
    if (!this.el.canvas?.width) return this.hideLoupe();

    const { x, y } = this.canvasPixelFromEvent(e);
    const px = this.ctx.getImageData(x, y, 1, 1).data;
    const hex = this.rgbToHex(px[0], px[1], px[2]);
    const showHex = this.getDisplayHex(hex); // aparência (respeita simulação)

    // posiciona perto do cursor, sem sair do container
    const contRect = this.el.imageContainer.getBoundingClientRect();
    const size = 120,
    offset = 18;
    let left = e.clientX - contRect.left + offset;
    let top = e.clientY - contRect.top + offset;
    left = this.clamp(left, size / 2, contRect.width - size / 2);
    top = this.clamp(top, size / 2, contRect.height - size / 2);
    this.el.loupe.style.left = `${left - size / 2}px`;
    this.el.loupe.style.top = `${top - size / 2}px`;

    // desenha zoom circular
    const zoom = 8; // fator de zoom
    const win = Math.floor(size / zoom); // janela em pixels da imagem
    const sx = this.clamp(
      x - Math.floor(win / 2),
      0,
      this.el.canvas.width - win
    );
    const sy = this.clamp(
      y - Math.floor(win / 2),
      0,
      this.el.canvas.height - win
    );

    const ctx = this.ctxLoupe;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.el.canvas, sx, sy, win, win, 0, 0, size, size);
    ctx.restore();

    // crosshair
    ctx.strokeStyle = "rgba(0,0,0,.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size / 2, 10);
    ctx.lineTo(size / 2, size - 10);
    ctx.moveTo(10, size / 2);
    ctx.lineTo(size - 10, size / 2);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 10);
    ctx.lineTo(size / 2, size - 10);
    ctx.moveTo(10, size / 2);
    ctx.lineTo(size - 10, size / 2);
    ctx.stroke();

    // badge com o HEX
    this.el.loupeBadge.textContent = hex;

    // mostra lupa
    this.el.loupe.style.display = "block";
  }
  hideLoupe() {
    this.el.loupe.style.display = "none";
  }

  /* ---------- Paleta (K-means) ---------- */
  extractPaletteKMeans(k = 5) {
    const { width: W, height: H } = this.el.canvas;
    const { data } = this.ctx.getImageData(0, 0, W, H);
    const samples = [];
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }

    const centroids = [],
      used = new Set();
    while (centroids.length < k && samples.length) {
      const idx = Math.floor(Math.random() * samples.length);
      if (!used.has(idx)) {
        centroids.push(samples[idx].slice());
        used.add(idx);
      }
    }

    const maxIter = 10;
    for (let it = 0; it < maxIter; it++) {
      const clusters = Array.from({ length: k }, () => []);
      for (const px of samples) {
        let best = 0,
          bestD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = this.dist2(px, centroids[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        clusters[best].push(px);
      }
      for (let c = 0; c < k; c++) {
        const cl = clusters[c];
        if (!cl.length) continue;
        const sum = cl.reduce(
          (a, p) => ((a[0] += p[0]), (a[1] += p[1]), (a[2] += p[2]), a),
          [0, 0, 0]
        );
        centroids[c] = [
          Math.round(sum[0] / cl.length),
          Math.round(sum[1] / cl.length),
          Math.round(sum[2] / cl.length),
        ];
      }
    }

    const sorted = centroids
      .map((c) => ({ c, L: this.relLuminance({ r: c[0], g: c[1], b: c[2] }) }))
      .sort((a, b) => b.L - a.L)
      .map((x) => x.c);
    this.displayColors(
      sorted.map((rgb) => [`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, 1])
    );
  }
  dist2(a, b) {
    const dr = a[0] - b[0],
      dg = a[1] - b[1],
      db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  displayColors(colors) {
    const palette = this.el.colorsWrap;
    if (!palette) return;
    palette.innerHTML = "";
    colors.forEach(([color]) => {
      const m = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
      const hex = m ? this.rgbToHex(+m[1], +m[2], +m[3]) : color;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.title = `${hex} (clique para usar)`;
      chip.style.cssText =
        "display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:64px;height:64px;margin:4px;border:1px solid #555;border-radius:8px;cursor:pointer;";
      chip.innerHTML = `<div style="width:36px;height:24px;border-radius:4px;background:${this.getDisplayHex(
        hex
      )};margin-bottom:6px;"></div>
                      <small style="font-family:ui-monospace,monospace">${hex}</small>`;
      chip.addEventListener("click", () => {
        const { r, g, b } = this.hexToRgb(hex);
        this.setRGB(r, g, b);
        this.refreshAll("rgb");
      });
      palette.appendChild(chip);
    });
  }

  /* ---------- Daltonismo (CVD) ---------- */
  cvdMatrix(type) {
    switch (type) {
      case "protan":
        return [
          [0.567, 0.433, 0.0],
          [0.558, 0.442, 0.0],
          [0.0, 0.242, 0.758],
        ];
      case "deutan":
        return [
          [0.625, 0.375, 0.0],
          [0.7, 0.3, 0.0],
          [0.0, 0.3, 0.7],
        ];
      case "tritan":
        return [
          [0.95, 0.05, 0.0],
          [0.0, 0.433, 0.567],
          [0.0, 0.475, 0.525],
        ];
      default:
        return null;
    }
  }
  applyCVD(hex, type, severity) {
    const M = this.cvdMatrix(type);
    if (!M || severity <= 0) return hex;
    const { r, g, b } = this.hexToRgb(hex);
    const R = this.srgbToLinear(r),
      G = this.srgbToLinear(g),
      B = this.srgbToLinear(b);
    const Sr = M[0][0] * R + M[0][1] * G + M[0][2] * B;
    const Sg = M[1][0] * R + M[1][1] * G + M[1][2] * B;
    const Sb = M[2][0] * R + M[2][1] * G + M[2][2] * B;
    const mix = (a, b) => (1 - severity) * a + severity * b;
    return this.rgbToHex(
      this.linearToSrgb(this.clamp(mix(R, Sr), 0, 1)),
      this.linearToSrgb(this.clamp(mix(G, Sg), 0, 1)),
      this.linearToSrgb(this.clamp(mix(B, Sb), 0, 1))
    );
  }
  getDisplayHex(hex) {
    const t = this.state.cvd.type,
      s = this.state.cvd.severity;
    return t === "none" || s <= 0 ? hex : this.applyCVD(hex, t, s);
  }

  copyHex(hex) {
    if (!hex) return;
    navigator.clipboard?.writeText(hex).then(() => {
      const toast = document.createElement("div");
      toast.textContent = `Copiado: ${hex}`;
      toast.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;padding:6px 10px;border-radius:6px;z-index:9999;";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 900);
    });
  }
}

new CoresApp();
