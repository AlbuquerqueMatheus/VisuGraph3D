import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  columnMajor,
  fromColumnMajor,
  identity,
  invert,
  modelMatrix,
  multiply,
  normalMatrix,
  orthographic,
  perspective,
  pipeline,
  rotation,
  rotationFactors,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  transform,
  translation,
  viewMatrix,
} from "../../src/lib/transform3d.js";

const close = (actual, expected, digits = 9) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
const closeMatrix = (actual, expected, digits = 9) => close(actual.flat(), expected.flat(), digits);

// Números "aleatórios" reproduzíveis: o mesmo teste sempre sorteia os mesmos casos.
function seeded(seed) {
  let s = seed >>> 0;
  return (min, max) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return min + (s / 2 ** 32) * (max - min);
  };
}

const ORDERS = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];

describe("matrizes básicas (vetores coluna)", () => {
  it("rotação positiva gira no sentido anti-horário olhando de frente para o eixo", () => {
    const q = Math.PI / 2;
    close(transform(rotationZ(q), [1, 0, 0]), [0, 1, 0, 1]);
    close(transform(rotationX(q), [0, 1, 0]), [0, 0, 1, 1]);
    close(transform(rotationY(q), [0, 0, 1]), [1, 0, 0, 1]);
  });

  it("M = T · R · S escala, depois gira e por último translada", () => {
    const M = modelMatrix({ position: [10, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] });
    // (1,0,0) --S--> (2,0,0) --R--> (0,2,0) --T--> (10,2,0)
    close(transform(M, [1, 0, 0]), [10, 2, 0, 1]);
  });

  it("uma direção (w = 0) não sente a translação", () => {
    close(transform(translation(5, 6, 7), [1, 2, 3, 0]), [1, 2, 3, 0]);
  });

  it("\"XYZ\" multiplica Rx · Ry · Rz, então o ponto gira primeiro em torno de z", () => {
    const angles = [0.3, -0.7, 1.1];
    expect(rotationFactors(angles, "XYZ").map((f) => f.axis)).toEqual(["X", "Y", "Z"]);
    closeMatrix(rotation(angles, "XYZ"), multiply(multiply(rotationX(0.3), rotationY(-0.7)), rotationZ(1.1)));
    expect(() => rotation(angles, "XXY")).toThrow();
  });

  it("a inversa desfaz a transformação, e uma matriz singular não tem inversa", () => {
    const M = modelMatrix({ position: [3, -2, 8], rotation: [0.4, 1.2, -0.5], scale: [1.5, 0.4, 2] });
    closeMatrix(multiply(invert(M), M), identity());
    expect(invert(scaling(1, 0, 1))).toBeNull();
  });

  it("columnMajor e fromColumnMajor são inversas uma da outra", () => {
    const M = modelMatrix({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] });
    expect(fromColumnMajor(columnMajor(M))).toEqual(M);
    expect(columnMajor(translation(4, 5, 6)).slice(12, 15)).toEqual([4, 5, 6]);
  });
});

describe("as mesmas contas do Three.js", () => {
  const rand = seeded(2026);

  it("a matriz de modelo é a de Object3D, nas seis ordens de rotação", () => {
    for (const order of ORDERS) {
      for (let k = 0; k < 20; k++) {
        const position = [rand(-10, 10), rand(-10, 10), rand(-10, 10)];
        const angles = [rand(-Math.PI, Math.PI), rand(-Math.PI, Math.PI), rand(-Math.PI, Math.PI)];
        const scale = [rand(0.1, 3), rand(0.1, 3), rand(0.1, 3)];

        const obj = new THREE.Object3D();
        obj.position.set(...position);
        obj.rotation.set(...angles, order);
        obj.scale.set(...scale);
        obj.updateMatrix();

        closeMatrix(modelMatrix({ position, rotation: angles, order, scale }), fromColumnMajor(obj.matrix.elements));
      }
    }
  });

  it("um filho junta a matriz de mundo do pai à esquerda, como matrixWorld", () => {
    const parent = new THREE.Group();
    parent.position.set(2, 0, -1);
    parent.rotation.set(0, 0.8, 0.2, "YXZ");
    parent.scale.set(2, 2, 2);
    const child = new THREE.Object3D();
    child.position.set(1, 3, 0);
    child.rotation.set(0.5, 0, 0);
    parent.add(child);
    parent.updateMatrixWorld(true);

    const parentWorld = modelMatrix({ position: [2, 0, -1], rotation: [0, 0.8, 0.2], order: "YXZ", scale: [2, 2, 2] });
    const childWorld = modelMatrix({ position: [1, 3, 0], rotation: [0.5, 0, 0], parent: parentWorld });
    closeMatrix(childWorld, fromColumnMajor(child.matrixWorld.elements));
  });

  it("a inversa é a de Matrix4.invert", () => {
    for (let k = 0; k < 20; k++) {
      const M = modelMatrix({
        position: [rand(-5, 5), rand(-5, 5), rand(-5, 5)],
        rotation: [rand(-3, 3), rand(-3, 3), rand(-3, 3)],
        scale: [rand(0.2, 2), rand(0.2, 2), rand(0.2, 2)],
      });
      const m4 = new THREE.Matrix4().fromArray(columnMajor(M)).invert();
      closeMatrix(invert(M), fromColumnMajor(m4.elements));
    }
  });

  it("a projeção perspectiva é a de PerspectiveCamera, com zoom", () => {
    for (const [fov, aspect, near, far, zoom] of [
      [50, 16 / 9, 0.1, 100, 1],
      [75, 1, 0.5, 2000, 1],
      [30, 4 / 3, 1, 50, 2.5],
    ]) {
      const cam = new THREE.PerspectiveCamera(fov, aspect, near, far);
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
      closeMatrix(perspective({ fov, aspect, near, far, zoom }), fromColumnMajor(cam.projectionMatrix.elements));
    }
  });

  it("a projeção ortográfica é a de OrthographicCamera, com zoom", () => {
    for (const [left, right, top, bottom, near, far, zoom] of [
      [-4, 4, 3, -3, 0.1, 100, 1],
      [-10, 6, 8, -2, 1, 20, 3],
    ]) {
      const cam = new THREE.OrthographicCamera(left, right, top, bottom, near, far);
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
      closeMatrix(orthographic({ left, right, top, bottom, near, far, zoom }), fromColumnMajor(cam.projectionMatrix.elements));
    }
  });

  it("o caminho modelo → visão → projeção → pixel chega ao mesmo ponto que Vector3.project", () => {
    const cam = new THREE.PerspectiveCamera(60, 800 / 450, 0.1, 100);
    cam.position.set(4, 3, 6);
    cam.lookAt(0, 0.5, 0);
    cam.updateMatrixWorld(true);

    const mesh = new THREE.Object3D();
    mesh.position.set(0.5, 1, -0.5);
    mesh.rotation.set(0.3, 0.9, 0);
    mesh.scale.set(1.5, 1, 1);
    mesh.updateMatrixWorld(true);

    // A câmera não tem os ângulos no código: a matriz de mundo dela vem do lookAt.
    const view = viewMatrix(fromColumnMajor(cam.matrixWorld.elements));
    const model = modelMatrix({ position: [0.5, 1, -0.5], rotation: [0.3, 0.9, 0], scale: [1.5, 1, 1] });
    const projection = perspective({ fov: 60, aspect: 800 / 450, near: 0.1, far: 100 });

    for (const p of [[0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [0, -0.5, 0.25]]) {
      const res = pipeline(p, { model, view, projection, width: 800, height: 450 });
      const ndc = new THREE.Vector3(...p).applyMatrix4(mesh.matrixWorld).project(cam);
      close(res.ndc, ndc.toArray());
      close(res.screen, [((ndc.x + 1) / 2) * 800, ((1 - ndc.y) / 2) * 450]);
      expect(res.visible).toBe(true);
      expect(res.eye[2]).toBeLessThan(0); // na frente da câmera, que olha para −z
    }
  });

  it("um ponto atrás da câmera não é visível", () => {
    const view = viewMatrix(translation(0, 0, 5));
    const projection = perspective({ fov: 50, aspect: 1, near: 0.1, far: 100 });
    expect(pipeline([0, 0, 10], { model: identity(), view, projection, width: 100, height: 100 }).visible).toBe(false);
    expect(pipeline([0, 0, 0], { model: identity(), view, projection, width: 100, height: 100 }).visible).toBe(true);
  });
});

describe("matriz das normais", () => {
  it("é a de Matrix3.getNormalMatrix, também com escala não uniforme", () => {
    const M = modelMatrix({ position: [1, 2, 3], rotation: [0.4, -0.9, 0.2], order: "ZXY", scale: [3, 0.5, 1.2] });
    const expected = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().fromArray(columnMajor(M)));
    const N = normalMatrix(M);
    // Matrix3.elements também está em ordem de coluna
    closeMatrix(N, [0, 1, 2].map((i) => [0, 1, 2].map((j) => expected.elements[j * 3 + i])));
    // a normal continua perpendicular à superfície depois da escala
    const tangent = transform(M, [1, -1, 0, 0]).slice(0, 3);
    const normal = [0, 1, 2].map((i) => N[i][0] * 1 + N[i][1] * 1 + N[i][2] * 0);
    expect(tangent[0] * normal[0] + tangent[1] * normal[1] + tangent[2] * normal[2]).toBeCloseTo(0, 10);
  });
});
