import { describe, expect, it } from "vitest";
import { dot, halfVector, hexToRgb, normalize, reflect, shade } from "../../src/lib/phong.js";

const close = (actual, expected, digits = 10) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));

const params = { La: 0.2, Ld: 0.8, Ls: 0.8, Ka: 0.2, Kd: 0.7, Ks: 0.5, shininess: 32 };

describe("vetores do modelo de Phong", () => {
  it("r = 2(n·l)n − l espelha a luz em torno da normal", () => {
    const n = [0, 1, 0];
    const l = normalize([1, 1, 0]);
    close(reflect(l, n), normalize([-1, 1, 0]));
    expect(dot(reflect(l, n), n)).toBeCloseTo(dot(l, n), 10); // mesmo ângulo com a normal
  });

  it("h fica no meio do caminho entre l e v", () => {
    close(halfVector([1, 0, 0], [0, 1, 0]), normalize([1, 1, 0]));
  });
});

describe("shade()", () => {
  it("de frente para a luz e para o observador, cada termo vale L·K", () => {
    const z = [0, 0, 1];
    const res = shade({ ...params, n: z, l: z, v: z });
    expect(res.nl).toBeCloseTo(1);
    expect(res.rv).toBeCloseTo(1);
    expect(res.Ia).toBeCloseTo(0.04);
    expect(res.Id).toBeCloseTo(0.56);
    expect(res.Is).toBeCloseTo(0.4);
    expect(res.I).toBeCloseTo(1.0);
  });

  it("difusa segue max(0, n·l) e especular usa (r·v)^n", () => {
    const n = [0, 1, 0];
    const l = normalize([1, 1, 0]); // 45°
    const v = normalize([-1, 1, 0]); // exatamente na direção de r
    const res = shade({ ...params, n, l, v });
    expect(res.nlClamped).toBeCloseTo(Math.SQRT1_2);
    expect(res.Id).toBeCloseTo(0.8 * 0.7 * Math.SQRT1_2);
    expect(res.rv).toBeCloseTo(1);
    expect(res.Is).toBeCloseTo(0.8 * 0.5);
  });

  it("Blinn–Phong usa (h·n)^n no lugar de (r·v)^n", () => {
    const n = [0, 1, 0];
    const l = normalize([1, 1, 0]);
    const v = [0, 1, 0];
    const phong = shade({ ...params, n, l, v, model: "phong" });
    const blinn = shade({ ...params, n, l, v, model: "blinn" });
    expect(blinn.specBase).toBeCloseTo(dot(halfVector(l, v), n));
    expect(phong.specBase).toBeCloseTo(dot(reflect(l, n), v));
    expect(blinn.specPow).not.toBeCloseTo(phong.specPow, 3);
  });

  it("sem brilho especular quando a luz está atrás da superfície", () => {
    const n = [0, 1, 0];
    const l = normalize([1, -0.2, 0]); // n·l < 0
    const v = [0, 1, 0]; // h·n > 0 mesmo assim
    const res = shade({ ...params, n, l, v, model: "blinn" });
    expect(res.hn).toBeGreaterThan(0);
    expect(res.Id).toBe(0);
    expect(res.Is).toBe(0);
    expect(res.I).toBeCloseTo(0.04);
  });

  it("termos desligados não contribuem", () => {
    const z = [0, 0, 1];
    const res = shade({ ...params, n: z, l: z, v: z, terms: { ambient: false, diffuse: true, specular: false } });
    expect(res.Ia).toBe(0);
    expect(res.Is).toBe(0);
    expect(res.I).toBeCloseTo(0.56);
  });

  it("cor = Ia·Cobj + Id·Cobj·Cluz + Is·Cluz, limitada a 1", () => {
    const z = [0, 0, 1];
    const objectColor = [0.4, 0.6, 1];
    const lightColor = [1, 0.5, 1];
    const res = shade({ ...params, n: z, l: z, v: z, objectColor, lightColor });
    const expected = [0, 1, 2].map((i) =>
      Math.min(1, 0.04 * objectColor[i] + 0.56 * objectColor[i] * lightColor[i] + 0.4 * lightColor[i])
    );
    close(res.rgb, expected);
    expect(res.rgb[2]).toBe(1);
  });

  it("hexToRgb lê cores do <input type=color>", () => {
    close(hexToRgb("#6699ff"), [0.4, 0.6, 1]);
    close(hexToRgb("nada"), [1, 1, 1]);
  });
});
