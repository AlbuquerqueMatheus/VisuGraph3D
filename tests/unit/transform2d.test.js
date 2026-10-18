import { describe, expect, it } from "vitest";
import {
  apply,
  compose,
  formatNumber,
  identity,
  invert,
  multiply,
  rotation,
  scaling,
  translation,
} from "../../src/lib/transform2d.js";

const close = (actual, expected) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 10));

describe("transformações 2D (y para cima)", () => {
  it("rotação positiva é anti-horária", () => {
    close(apply(rotation(90), [1, 0]), [0, 1]);
    close(apply(rotation(90), [0, 1]), [-1, 0]);
  });

  it("translação e escala agem como no livro", () => {
    close(apply(translation(10, -5), [1, 2]), [11, -3]);
    close(apply(scaling(2, 3), [1, 2]), [2, 6]);
  });

  it("a ordem TRS aplica primeiro S, depois R e por último T", () => {
    const M = compose({
      order: "TRS",
      translate: { enabled: true, tx: 10, ty: 0 },
      rotate: { enabled: true, degrees: 90 },
      scale: { enabled: true, sx: 2, sy: 1 },
    });
    // (1,0) --S--> (2,0) --R--> (0,2) --T--> (10,2)
    close(apply(M, [1, 0]), [10, 2]);
  });

  it("a ordem muda o resultado (T·R ≠ R·T)", () => {
    const params = {
      translate: { enabled: true, tx: 10, ty: 0 },
      rotate: { enabled: true, degrees: 90 },
      scale: { enabled: false, sx: 1, sy: 1 },
    };
    close(apply(compose({ ...params, order: "TRS" }), [0, 0]), [10, 0]);
    close(apply(compose({ ...params, order: "RTS" }), [0, 0]), [0, 10]);
  });

  it("transformações desligadas entram como identidade", () => {
    expect(compose({ order: "SRT" })).toEqual(identity());
  });

  it("rejeita ordens inválidas", () => {
    expect(() => compose({ order: "TTS" })).toThrow();
  });

  it("a inversa desfaz a transformação", () => {
    const M = multiply(translation(30, -12), multiply(rotation(37), scaling(1.5, 0.4)));
    const back = multiply(invert(M), M);
    back.forEach((row, i) => close(row, identity()[i]));
    close(apply(invert(M), apply(M, [7, -3])), [7, -3]);
  });

  it("matriz singular não tem inversa", () => {
    expect(invert(scaling(0, 1))).toBeNull();
  });

  it("formata sem '-0.00'", () => {
    expect(formatNumber(-1e-17)).toBe("0.00");
    expect(formatNumber(Math.cos(Math.PI / 2))).toBe("0.00");
    expect(formatNumber(-0.5)).toBe("-0.50");
    expect(formatNumber(12.345, 1)).toBe("12.3");
  });
});
