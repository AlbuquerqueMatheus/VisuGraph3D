// glass.js — o shader "caixa de vidro" do modo 3D.
//
// Com ele ligado, cada malha é desenhada por um ShaderMaterial que faz as contas de
// src/lib/phong3d.js, pixel a pixel, com as matrizes de src/lib/transform3d.js. Nada vem
// pronto do Three.js: o que o painel "Matemática" mostra é o que pinta a tela. A saída não
// passa por correção de gama nem tone mapping, então o pixel é o número da fórmula.

import * as THREE from "three";
import { MAX_LIGHTS, materialTerms } from "../../lib/phong3d.js";

const vertexShader = /* glsl */ `
  uniform mat4 uModel;
  uniform mat4 uView;
  uniform mat4 uProj;
  uniform mat3 uNormalMatrix;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec4 world = uModel * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vNormal = uNormalMatrix * normal;
    gl_Position = uProj * (uView * world);
  }
`;

const fragmentShader = /* glsl */ `
  #define MAX_LIGHTS ${MAX_LIGHTS}
  #define PI 3.141592653589793

  uniform vec3 uEye;
  uniform bool uLit;
  uniform bool uBlinn;
  uniform bool uFlat;
  uniform bool uTwoSided;
  uniform vec3 uKd;
  uniform vec3 uKs;
  uniform float uShininess;
  uniform vec3 uKe;
  uniform float uOpacity;
  uniform vec3 uAmbient; // soma de cor × intensidade das luzes ambientes
  uniform int uLightCount;
  uniform int uLightType[MAX_LIGHTS]; // 1 direcional, 2 ponto, 3 holofote, 4 hemisfério
  uniform vec3 uLightColor[MAX_LIGHTS]; // cor × intensidade (no hemisfério, a do céu)
  uniform vec3 uLightGround[MAX_LIGHTS];
  uniform vec3 uLightPos[MAX_LIGHTS];
  uniform vec3 uLightTarget[MAX_LIGHTS];
  uniform float uLightDistance[MAX_LIGHTS];
  uniform float uLightDecay[MAX_LIGHTS];
  uniform float uLightCosOuter[MAX_LIGHTS];
  uniform float uLightCosInner[MAX_LIGHTS];
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  float distanceAttenuation(float d, float range, float decay) {
    float k = 1.0 / max(pow(d, decay), 0.01);
    if (range > 0.0) {
      float t = clamp(1.0 - pow(d / range, 4.0), 0.0, 1.0);
      k *= t * t;
    }
    return k;
  }

  float spotFactor(vec3 l, vec3 dir, float cosOuter, float cosInner) {
    float c = dot(l, dir);
    if (cosInner - cosOuter < 1e-6) return c >= cosOuter ? 1.0 : 0.0;
    return smoothstep(cosOuter, cosInner, c);
  }

  void main() {
    if (!uLit) {
      gl_FragColor = vec4(clamp(uKd, 0.0, 1.0), uOpacity);
      return;
    }
    vec3 n = uFlat || dot(vNormal, vNormal) < 1e-12 ? normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos))) : normalize(vNormal);
    vec3 v = normalize(uEye - vWorldPos);
    if (uTwoSided && dot(n, v) < 0.0) n = -n;

    vec3 I = uKe + uKd * uAmbient / PI;
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      int type = uLightType[i];
      if (type == 4) {
        float w = 0.5 * dot(n, normalize(uLightPos[i])) + 0.5;
        I += uKd * mix(uLightGround[i], uLightColor[i], w) / PI;
        continue;
      }
      vec3 L = uLightColor[i] / PI;
      vec3 l;
      if (type == 1) {
        l = normalize(uLightPos[i] - uLightTarget[i]);
      } else {
        vec3 toLight = uLightPos[i] - vWorldPos;
        float d = length(toLight);
        l = toLight / d;
        float k = distanceAttenuation(d, uLightDistance[i], uLightDecay[i]);
        if (type == 3) k *= spotFactor(l, normalize(uLightPos[i] - uLightTarget[i]), uLightCosOuter[i], uLightCosInner[i]);
        L *= k;
      }
      float nl = dot(n, l);
      float base = uBlinn ? max(0.0, dot(n, normalize(l + v))) : max(0.0, dot(reflect(-l, n), v));
      float s = nl > 0.0 ? pow(base, uShininess) : 0.0;
      I += uKd * L * max(0.0, nl) + uKs * L * s;
    }
    gl_FragColor = vec4(clamp(I, 0.0, 1.0), uOpacity);
  }
`;

const LIGHT_TYPE = { directional: 1, point: 2, spot: 3, hemisphere: 4 };
const zeros = (make) => Array.from({ length: MAX_LIGHTS }, make);

export function createGlassMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uModel: { value: new THREE.Matrix4() },
      uView: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uNormalMatrix: { value: new THREE.Matrix3() },
      uEye: { value: new THREE.Vector3() },
      uLit: { value: true },
      uBlinn: { value: false },
      uFlat: { value: false },
      uTwoSided: { value: false },
      uKd: { value: new THREE.Vector3() },
      uKs: { value: new THREE.Vector3() },
      uShininess: { value: 30 },
      uKe: { value: new THREE.Vector3() },
      uOpacity: { value: 1 },
      uAmbient: { value: new THREE.Vector3() },
      uLightCount: { value: 0 },
      uLightType: { value: zeros(() => 0) },
      uLightColor: { value: zeros(() => new THREE.Vector3()) },
      uLightGround: { value: zeros(() => new THREE.Vector3()) },
      uLightPos: { value: zeros(() => new THREE.Vector3()) },
      uLightTarget: { value: zeros(() => new THREE.Vector3()) },
      uLightDistance: { value: zeros(() => 0) },
      uLightDecay: { value: zeros(() => 0) },
      uLightCosOuter: { value: zeros(() => 0) },
      uLightCosInner: { value: zeros(() => 0) },
    },
  });
}

const srgb = (color) => (color && color.isColor ? color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace) : null);
const rgbArray = (color) => {
  const c = srgb(color);
  return c ? [c.r, c.g, c.b] : undefined;
};

/** Parâmetros de um material do Three.js, com as cores como estão no código (sRGB, 0 a 1). */
export function readMaterial(material) {
  const pick = (k) => (typeof material[k] === "number" ? material[k] : undefined);
  return {
    className: material.type,
    color: rgbArray(material.color),
    specular: rgbArray(material.specular),
    shininess: pick("shininess"),
    emissive: rgbArray(material.emissive),
    emissiveIntensity: pick("emissiveIntensity"),
    metalness: pick("metalness"),
    roughness: pick("roughness"),
    side: material.side,
    flatShading: !!material.flatShading,
    hasMap: !!material.map,
  };
}

/** Termos do modelo para o material, ou null se ele fica com o shader do Three.js. */
export function glassTerms(material) {
  if (!material || !material.isMaterial) return null;
  const params = readMaterial(material);
  const terms = materialTerms(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)));
  return terms && { params, terms };
}

/** Copia para o material de vidro o estado de desenho do original e os coeficientes. */
export function syncGlass(glass, original, { params, terms }, model) {
  for (const k of ["side", "transparent", "opacity", "depthTest", "depthWrite", "visible", "wireframe", "colorWrite", "blending"]) glass[k] = original[k];
  const u = glass.uniforms;
  u.uLit.value = terms.lit;
  u.uBlinn.value = model === "blinn";
  u.uFlat.value = params.flatShading;
  u.uTwoSided.value = original.side !== THREE.FrontSide;
  u.uKd.value.fromArray(terms.Kd);
  u.uKs.value.fromArray(terms.Ks);
  u.uShininess.value = terms.n;
  u.uKe.value.fromArray(terms.Ke);
  u.uOpacity.value = original.opacity;
}

/**
 * Luzes da cena no formato de src/lib/phong3d.js, na ordem em que o shader as recebe: as
 * ambientes somadas e até MAX_LIGHTS outras. Luzes que o modelo não cobre ficam de fora.
 */
export function collectLights(scene, camera) {
  const list = [];
  let others = 0;
  let ignored = 0;
  const world = (obj) => new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).toArray();
  scene.traverseVisible((obj) => {
    if (!obj.isLight || !obj.layers.test(camera.layers)) return;
    const color = rgbArray(obj.color);
    const base = { id: obj.id, name: obj.name || null, color, intensity: obj.intensity };
    let light = null;
    if (obj.isAmbientLight) light = { ...base, type: "ambient" };
    else if (obj.isHemisphereLight) light = { ...base, type: "hemisphere", groundColor: rgbArray(obj.groundColor), position: world(obj) };
    else if (obj.isDirectionalLight) light = { ...base, type: "directional", position: world(obj), target: world(obj.target) };
    else if (obj.isPointLight) light = { ...base, type: "point", position: world(obj), distance: obj.distance, decay: obj.decay };
    else if (obj.isSpotLight) {
      light = { ...base, type: "spot", position: world(obj), target: world(obj.target), distance: obj.distance, decay: obj.decay, angle: obj.angle, penumbra: obj.penumbra };
    }
    if (!light) {
      ignored++;
      return;
    }
    if (light.type !== "ambient" && others++ >= MAX_LIGHTS) {
      ignored++;
      return;
    }
    list.push({ light, object: obj });
  });
  return { list: list.map((l) => l.light), objects: list.map((l) => l.object), ignored };
}

/** Uniforms de luz de um material de vidro a partir de collectLights(). */
export function setLightUniforms(glass, lights) {
  const u = glass.uniforms;
  const ambient = [0, 0, 0];
  let i = 0;
  for (const light of lights.list) {
    if (light.type === "ambient") {
      for (let c = 0; c < 3; c++) ambient[c] += light.color[c] * light.intensity;
      continue;
    }
    u.uLightType.value[i] = LIGHT_TYPE[light.type];
    u.uLightColor.value[i].fromArray(light.color).multiplyScalar(light.intensity);
    u.uLightGround.value[i].fromArray(light.groundColor ?? [0, 0, 0]).multiplyScalar(light.intensity);
    u.uLightPos.value[i].fromArray(light.position);
    u.uLightTarget.value[i].fromArray(light.target ?? [0, 0, 0]);
    u.uLightDistance.value[i] = light.distance ?? 0;
    u.uLightDecay.value[i] = light.decay ?? 2;
    u.uLightCosOuter.value[i] = Math.cos(light.angle ?? 0);
    u.uLightCosInner.value[i] = Math.cos((light.angle ?? 0) * (1 - (light.penumbra ?? 0)));
    i++;
  }
  u.uLightCount.value = i;
  u.uAmbient.value.fromArray(ambient);
}
