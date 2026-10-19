import { describe, expect, it } from "vitest";
import { normalize, shade } from "../../src/lib/phong.js";
import { MAX_LIGHTS, distanceAttenuation, lightAt, materialTerms, shadePoint, spotFactor, toBytes } from "../../src/lib/phong3d.js";

const close = (actual, expected, digits = 10) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));

const gray = (k) => [k, k, k];
// luz branca de intensidade π: Lⱼ = 1, a intensidade 1 dos livros
const sun = (position) => ({ type: "directional", color: [1, 1, 1], intensity: Math.PI, position, target: [0, 0, 0] });

describe("caixa de vidro: as mesmas contas do laboratório de Phong", () => {
  const point = [0, 0, 0];
  const n = [0, 1, 0];
  const cases = [
    { light: [1, 1, 0], eye: [-1, 1, 0] }, // observador na direção do reflexo
    { light: [0.3, 1, 0.5], eye: [2, 3, 1] },
    { light: [-1, 0.2, 0], eye: [0, 1, 4] },
  ];

  for (const model of ["phong", "blinn"]) {
    it(`com uma luz, difusa e especular de ${model} batem com phong.js`, () => {
      const material = materialTerms({ className: "MeshPhongMaterial", color: gray(0.7), specular: gray(0.5), shininess: 32 });
      for (const { light, eye } of cases) {
        const res = shadePoint({ point, normal: n, eye, material, lights: [sun(light)], model });
        const ref = shade({ n, l: normalize(light), v: normalize(eye), model, Ld: 1, Ls: 1, Kd: 0.7, Ks: 0.5, shininess: 32 });
        const term = res.direct[0];
        expect(term.nl).toBeCloseTo(ref.nl, 10);
        close(term.diffuse, gray(ref.Id));
        close(term.specular, gray(ref.Is));
        close(res.sum, gray(ref.Id + ref.Is));
      }
    });
  }

  it("a ambiente vale Kd ⊙ cor × intensidade ÷ π, sem depender da direção", () => {
    const material = materialTerms({ className: "MeshLambertMaterial", color: [1, 0.5, 0.2] });
    const res = shadePoint({ point, normal: n, eye: [0, 0, 5], material, lights: [{ type: "ambient", color: [1, 1, 1], intensity: Math.PI / 2 }] });
    close(res.sum, [0.5, 0.25, 0.1]);
    expect(res.direct).toHaveLength(0);
  });

  it("com a luz atrás da superfície, não há difusa nem brilho", () => {
    const material = materialTerms({ className: "MeshPhongMaterial", color: gray(1), specular: gray(1), shininess: 1 });
    const res = shadePoint({ point, normal: n, eye: [0, -1, 0], material, lights: [sun([0, -1, 0])] });
    close(res.direct[0].diffuse, [0, 0, 0]);
    close(res.direct[0].specular, [0, 0, 0]);
  });

  it("cada canal multiplica: material verde sob luz vermelha fica preto", () => {
    const material = materialTerms({ className: "MeshLambertMaterial", color: [0, 1, 0] });
    const red = { ...sun([0, 1, 0]), color: [1, 0, 0] };
    close(shadePoint({ point, normal: n, eye: [0, 1, 0], material, lights: [red] }).rgb, [0, 0, 0]);
  });

  it("o resultado é limitado a [0, 1] e vira bytes como na tela", () => {
    const material = materialTerms({ className: "MeshLambertMaterial", color: gray(1) });
    const res = shadePoint({ point, normal: n, eye: [0, 1, 0], material, lights: [{ ...sun([0, 1, 0]), intensity: 3 * Math.PI }] });
    close(res.sum, gray(3));
    expect(toBytes(res.rgb)).toEqual([255, 255, 255]);
    expect(toBytes([0.5, 0.2, 0])).toEqual([128, 51, 0]);
  });
});

describe("luzes do Three.js", () => {
  it("ponto e holofote perdem força com o quadrado da distância (decay = 2)", () => {
    expect(distanceAttenuation(2, 0, 2)).toBeCloseTo(0.25, 12);
    expect(distanceAttenuation(0.01, 0, 2)).toBeCloseTo(100, 6); // limitada perto da luz
    expect(distanceAttenuation(5, 5, 2)).toBe(0); // passa do alcance (distance)
    const at = lightAt({ type: "point", color: [1, 1, 1], intensity: Math.PI, position: [0, 2, 0], decay: 2, distance: 0 }, [0, 0, 0], [0, 1, 0]);
    close(at.l, [0, 1, 0]);
    close(at.L, gray(0.25));
  });

  it("o holofote só ilumina dentro do cone, com borda suave na penumbra", () => {
    const angle = Math.PI / 6;
    expect(spotFactor([0, 1, 0], [0, 1, 0], angle, 0.2)).toBe(1);
    expect(spotFactor(normalize([1, 1, 0]), [0, 1, 0], angle, 0.2)).toBe(0); // 45° > 30°
    const edge = spotFactor(normalize([Math.tan(angle * 0.9), 1, 0]), [0, 1, 0], angle, 0.2);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    const spot = { type: "spot", color: [1, 1, 1], intensity: Math.PI, position: [0, 1, 0], target: [0, 0, 0], angle, penumbra: 0, decay: 0, distance: 0 };
    close(lightAt(spot, [0, 0, 0], [0, 1, 0]).L, gray(1));
    close(lightAt(spot, [2, 0, 0], [0, 1, 0]).L, gray(0));
  });

  it("o hemisfério mistura chão e céu pela inclinação da normal", () => {
    const hemi = { type: "hemisphere", color: [0, 0, 1], groundColor: [1, 0, 0], intensity: Math.PI, position: [0, 1, 0] };
    close(lightAt(hemi, [0, 0, 0], [0, 1, 0]).L, [0, 0, 1]);
    close(lightAt(hemi, [0, 0, 0], [0, -1, 0]).L, [1, 0, 0]);
    close(lightAt(hemi, [0, 0, 0], [1, 0, 0]).L, [0.5, 0, 0.5]);
  });

  it("só as primeiras luzes diretas entram, como no shader", () => {
    const material = materialTerms({ className: "MeshLambertMaterial", color: gray(1) });
    const lights = Array.from({ length: MAX_LIGHTS + 2 }, () => ({ ...sun([0, 1, 0]), intensity: Math.PI / 100 }));
    const res = shadePoint({ point: [0, 0, 0], normal: [0, 1, 0], eye: [0, 1, 0], material, lights });
    expect(res.direct).toHaveLength(MAX_LIGHTS);
    close(res.sum, gray(MAX_LIGHTS / 100));
  });
});

describe("materiais do Three.js", () => {
  it("MeshBasicMaterial não é iluminado: a cor é a do material", () => {
    const material = materialTerms({ className: "MeshBasicMaterial", color: [0.2, 0.4, 0.6] });
    const res = shadePoint({ point: [0, 0, 0], normal: [0, 1, 0], eye: [0, 1, 0], material, lights: [sun([0, 1, 0])] });
    close(res.rgb, [0.2, 0.4, 0.6]);
  });

  it("emissive soma uma cor própria, que não depende das luzes", () => {
    const material = materialTerms({ className: "MeshLambertMaterial", color: gray(0), emissive: [1, 0.5, 0], emissiveIntensity: 0.5 });
    close(shadePoint({ point: [0, 0, 0], normal: [0, 1, 0], eye: [0, 1, 0], material, lights: [] }).rgb, [0.5, 0.25, 0]);
  });

  it("Standard vira um Phong aproximado: metal sem difusa e brilho da cor do metal", () => {
    const metal = materialTerms({ className: "MeshStandardMaterial", color: [1, 0.8, 0.2], metalness: 1, roughness: 0.5 });
    close(metal.Kd, [0, 0, 0]);
    close(metal.Ks, [1, 0.8, 0.2]);
    expect(metal.n).toBeCloseTo(2 / 0.5 ** 4 - 2, 10);
    expect(metal.approx).toBe(true);
    const plastic = materialTerms({ className: "MeshStandardMaterial", color: [1, 0, 0], metalness: 0, roughness: 1 });
    close(plastic.Ks, gray(0.04));
    expect(plastic.n).toBe(1);
  });

  it("materiais sem modelo de Phong ficam com o shader do Three.js", () => {
    expect(materialTerms({ className: "MeshNormalMaterial" })).toBeNull();
    expect(materialTerms({ className: "ShaderMaterial" })).toBeNull();
  });
});
