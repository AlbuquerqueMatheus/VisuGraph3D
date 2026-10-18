import { describe, expect, it } from "vitest";
import { formatColor, formatNumber, normalizeColor } from "../../src/live/engine/format.js";

describe("formatNumber()", () => {
  it("arredonda e tira zeros à direita", () => {
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(0.123456, 3)).toBe("0.123");
    expect(formatNumber(1e-9)).toBe("0");
    expect(formatNumber(-0.0001)).toBe("0");
    expect(formatNumber(-2.5, 0)).toBe("-2");
    expect(formatNumber(NaN)).toBe("0");
  });
});

describe("cores", () => {
  it("normalizeColor aceita #abc, #aabbcc, nomes e rgb()", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("#4f8cff")).toBe("#4f8cff");
    expect(normalizeColor("Red")).toBe("#ff0000");
    expect(normalizeColor("rgb(255, 128, 0)")).toBe("#ff8000");
    expect(normalizeColor("hsl(0, 100%, 50%)")).toBeNull();
  });

  it("formatColor segue o formato do literal original", () => {
    expect(formatColor("#AABBCC")).toBe('"#aabbcc"');
    expect(formatColor("#aabbcc", { format: "string", quote: "'" })).toBe("'#aabbcc'");
    expect(formatColor("#aabbcc", { format: "number" })).toBe("0xaabbcc");
  });
});
