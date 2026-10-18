// format.js — como os valores voltam para o código: números curtos e cores em hexadecimal.

/** Arredonda para `decimals` casas e tira zeros à direita: 1.50 → "1.5", -0.001 → "0". */
export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "0";
  const factor = 10 ** decimals;
  let rounded = Math.round(value * factor) / factor;
  if (Math.abs(rounded) < 0.5 / factor) rounded = 0;
  let text = rounded.toFixed(decimals);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text === "-0" ? "0" : text;
}

export const radToDeg = (rad) => (rad * 180) / Math.PI;
export const degToRad = (deg) => (deg * Math.PI) / 180;

const NAMED_COLORS = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", lime: "#00ff00", blue: "#0000ff",
  yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", orange: "#ffa500",
  purple: "#800080", gray: "#808080", grey: "#808080", pink: "#ffc0cb", brown: "#a52a2a", silver: "#c0c0c0",
  gold: "#ffd700", navy: "#000080", teal: "#008080", maroon: "#800000", olive: "#808000", coral: "#ff7f50",
  salmon: "#fa8072", violet: "#ee82ee", indigo: "#4b0082", skyblue: "#87ceeb", tomato: "#ff6347",
  orchid: "#da70d6", turquoise: "#40e0d0", beige: "#f5f5dc", ivory: "#fffff0", khaki: "#f0e68c",
  crimson: "#dc143c", chocolate: "#d2691e",
};

/** Cor do código ("#abc", "#aabbcc", "red", "rgb(…)") → "#rrggbb", ou null se não reconhecer. */
export function normalizeColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return "#" + [...m[1]].map((c) => c + c).join("");
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return v;
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (m) return "#" + m.slice(1, 4).map((c) => Math.min(255, +c).toString(16).padStart(2, "0")).join("");
  return null;
}

/** Literal de cor no mesmo formato do original: "#rrggbb" (com as mesmas aspas) ou 0xrrggbb. */
export function formatColor(hex, slot = { format: "string", quote: '"' }) {
  const color = normalizeColor(hex) || "#ffffff";
  if (slot.format === "number") return "0x" + color.slice(1);
  const q = slot.quote === "'" || slot.quote === "`" ? slot.quote : '"';
  return q + color + q;
}
