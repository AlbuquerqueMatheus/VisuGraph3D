// catalog.js — o subconjunto didático do Three.js que o motor de código vivo entende.
//
// Para cada classe: que tipo de objeto ela cria, quais argumentos do construtor
// viram controles e quais propriedades podem ser editadas pela cena. O que estiver
// fora daqui continua rodando normalmente, só não é editável pela cena.

/** Propriedades de transformação de qualquer Object3D. Rotação fica em radianos no código. */
export const TRANSFORMS = {
  position: { label: "posição", step: 0.1, decimals: 2, default: 0 },
  rotation: { label: "rotação", step: 1, decimals: 1, default: 0, unit: "rad" },
  scale: { label: "escala", step: 0.1, decimals: 2, default: 1 },
};

export const AXES = ["x", "y", "z"];

/**
 * Nomes que o runtime injeta no escopo do código (o THREE e versões rastreadas dos
 * temporizadores, que são canceladas a cada nova execução). O código não pode redeclará-los.
 */
export const RUNTIME_NAMES = [
  "THREE", "__vg", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
];

/** Propriedades booleanas de Object3D editáveis por atribuição (obj.castShadow = true). */
export const OBJECT_FLAGS = {
  visible: { type: "boolean", label: "visível", default: true },
  castShadow: { type: "boolean", label: "projeta sombra", default: false },
  receiveShadow: { type: "boolean", label: "recebe sombra", default: false, meshOnly: true },
};

const num = (label, def, opts = {}) => ({ type: "number", label, default: def, step: 0.1, decimals: 2, ...opts });
const int = (label, def, opts = {}) => ({ type: "number", label, default: def, step: 1, decimals: 0, integer: true, min: 1, ...opts });
const color = (label, def = "#ffffff") => ({ type: "color", label, default: def });
const bool = (label, def = false) => ({ type: "boolean", label, default: def });

const size = (label, def = 1) => num(label, def, { min: 0.01, max: 50 });

/** Propriedades de material: viram chaves do objeto de opções ou atribuições (mat.roughness = 0.5). */
export const MATERIAL_PROPS = {
  color: color("cor"),
  emissive: color("cor emitida", "#000000"),
  emissiveIntensity: num("intensidade emitida", 1, { min: 0, max: 10 }),
  specular: color("cor especular", "#111111"),
  shininess: num("brilho", 30, { min: 0, max: 200, step: 1, decimals: 0 }),
  roughness: num("aspereza", 1, { min: 0, max: 1, step: 0.01 }),
  metalness: num("metal", 0, { min: 0, max: 1, step: 0.01 }),
  opacity: num("opacidade", 1, { min: 0, max: 1, step: 0.01 }),
  transparent: bool("transparente"),
  wireframe: bool("arame (wireframe)"),
  flatShading: bool("sombreamento plano"),
  // pontos (PointsMaterial): o tamanho fica em unidades da cena enquanto sizeAttenuation for true
  size: num("tamanho do ponto", 1, { min: 0, max: 10, step: 0.01, decimals: 3 }),
  sizeAttenuation: bool("diminui com a distância", true),
  vertexColors: bool("cor de cada vértice"),
  depthWrite: bool("grava a profundidade", true),
};

const BASIC = ["color", "opacity", "transparent", "wireframe"];

/** Propriedades de luz e câmera, indexadas pela chave usada no código. */
export const LIGHT_PROPS = {
  color: color("cor"),
  groundColor: color("cor do chão"),
  intensity: num("intensidade", 1, { min: 0, max: 20 }),
  distance: num("alcance", 0, { min: 0, max: 100, step: 0.5 }),
  decay: num("decaimento", 2, { min: 0, max: 4 }),
  angle: num("abertura", Math.PI / 3, { min: 0, max: Math.PI / 2, step: 1, decimals: 1, unit: "rad" }),
  penumbra: num("penumbra", 0, { min: 0, max: 1, step: 0.01 }),
};

export const CAMERA_PROPS = {
  fov: num("campo de visão (graus)", 50, { min: 10, max: 120, step: 1, decimals: 1 }),
  near: num("plano próximo", 0.1, { min: 0.01, max: 10, step: 0.01 }),
  far: num("plano distante", 2000, { min: 1, max: 5000, step: 10, decimals: 0 }),
};

export const SCENE_PROPS = {
  background: color("fundo", "#000000"),
};

/**
 * Classes conhecidas. `args` são os parâmetros do construtor na ordem do Three.js r186
 * (null = argumento que não vira controle). `options` = chaves aceitas no objeto de opções.
 */
export const CLASSES = {
  Scene: { kind: "scene", props: SCENE_PROPS },
  Group: { kind: "group" },
  Object3D: { kind: "group" },
  Mesh: { kind: "mesh", links: ["geometry", "material"] },
  // o terceiro argumento é quantas cópias a malha desenha
  InstancedMesh: { kind: "mesh", links: ["geometry", "material"] },
  Points: { kind: "points", links: ["geometry", "material"] },
  Line: { kind: "line", links: ["geometry", "material"] },
  LineSegments: { kind: "line", links: ["geometry", "material"] },
  LineLoop: { kind: "line", links: ["geometry", "material"] },

  // argText: texto usado quando um argumento sem controle precisa ser preenchido.
  PerspectiveCamera: { kind: "camera", args: ["fov", null, "near", "far"], argText: { 1: "16 / 9" }, props: CAMERA_PROPS },
  OrthographicCamera: { kind: "camera" },

  AmbientLight: { kind: "light", args: ["color", "intensity"], props: pick(LIGHT_PROPS, ["color", "intensity"]), positionless: true },
  // defaultPosition: luzes que o Three.js cria em (0, 1, 0) em vez da origem.
  DirectionalLight: { kind: "light", args: ["color", "intensity"], props: pick(LIGHT_PROPS, ["color", "intensity"]), defaultPosition: [0, 1, 0] },
  PointLight: { kind: "light", args: ["color", "intensity", "distance", "decay"], props: pick(LIGHT_PROPS, ["color", "intensity", "distance", "decay"]) },
  SpotLight: {
    kind: "light",
    args: ["color", "intensity", "distance", "angle", "penumbra", "decay"],
    props: pick(LIGHT_PROPS, ["color", "intensity", "distance", "angle", "penumbra", "decay"]),
    defaultPosition: [0, 1, 0],
  },
  HemisphereLight: {
    kind: "light",
    args: ["color", "groundColor", "intensity"],
    props: pick(LIGHT_PROPS, ["color", "groundColor", "intensity"]),
    defaultPosition: [0, 1, 0],
  },

  BoxGeometry: geometry([
    ["width", size("largura")], ["height", size("altura")], ["depth", size("profundidade")],
    ["widthSegments", int("divisões na largura", 1, { max: 64 })],
    ["heightSegments", int("divisões na altura", 1, { max: 64 })],
    ["depthSegments", int("divisões na profundidade", 1, { max: 64 })],
  ]),
  SphereGeometry: geometry([
    ["radius", size("raio")],
    ["widthSegments", int("segmentos horizontais", 32, { min: 3, max: 128 })],
    ["heightSegments", int("segmentos verticais", 16, { min: 2, max: 128 })],
  ]),
  PlaneGeometry: geometry([
    ["width", size("largura")], ["height", size("altura")],
    ["widthSegments", int("divisões na largura", 1, { max: 64 })],
    ["heightSegments", int("divisões na altura", 1, { max: 64 })],
  ]),
  CylinderGeometry: geometry([
    ["radiusTop", size("raio do topo")], ["radiusBottom", size("raio da base")], ["height", size("altura")],
    ["radialSegments", int("segmentos", 32, { min: 3, max: 128 })],
  ]),
  ConeGeometry: geometry([
    ["radius", size("raio")], ["height", size("altura")],
    ["radialSegments", int("segmentos", 32, { min: 3, max: 128 })],
  ]),
  TorusGeometry: geometry([
    ["radius", size("raio")], ["tube", size("espessura do tubo", 0.4)],
    ["radialSegments", int("segmentos do tubo", 12, { min: 3, max: 64 })],
    ["tubularSegments", int("segmentos do anel", 48, { min: 3, max: 256 })],
  ]),
  TorusKnotGeometry: geometry([
    ["radius", size("raio")], ["tube", size("espessura do tubo", 0.4)],
    ["tubularSegments", int("segmentos do anel", 64, { min: 3, max: 512 })],
    ["radialSegments", int("segmentos do tubo", 8, { min: 3, max: 64 })],
    ["p", int("voltas (p)", 2, { max: 20 })], ["q", int("voltas (q)", 3, { max: 20 })],
  ]),
  CapsuleGeometry: geometry([
    ["radius", size("raio")], ["height", size("altura")],
    ["capSegments", int("segmentos da tampa", 4, { max: 32 })],
    ["radialSegments", int("segmentos", 8, { min: 3, max: 64 })],
  ]),
  CircleGeometry: geometry([["radius", size("raio")], ["segments", int("segmentos", 32, { min: 3, max: 128 })]]),
  RingGeometry: geometry([
    ["innerRadius", size("raio interno", 0.5)], ["outerRadius", size("raio externo")],
    ["thetaSegments", int("segmentos", 32, { min: 3, max: 128 })],
  ]),
  IcosahedronGeometry: geometry([["radius", size("raio")], ["detail", int("detalhe", 0, { min: 0, max: 6 })]]),
  DodecahedronGeometry: geometry([["radius", size("raio")], ["detail", int("detalhe", 0, { min: 0, max: 6 })]]),
  OctahedronGeometry: geometry([["radius", size("raio")], ["detail", int("detalhe", 0, { min: 0, max: 6 })]]),
  TetrahedronGeometry: geometry([["radius", size("raio")], ["detail", int("detalhe", 0, { min: 0, max: 6 })]]),
  // geometria montada à mão, atributo por atributo: não tem argumentos para virar controle
  BufferGeometry: { kind: "geometry" },

  MeshBasicMaterial: material(BASIC),
  MeshLambertMaterial: material([...BASIC, "emissive"]),
  MeshPhongMaterial: material([...BASIC, "emissive", "specular", "shininess", "flatShading"]),
  MeshStandardMaterial: material([...BASIC, "roughness", "metalness", "emissive", "emissiveIntensity", "flatShading"]),
  MeshPhysicalMaterial: material([...BASIC, "roughness", "metalness", "emissive", "emissiveIntensity", "flatShading"]),
  MeshToonMaterial: material([...BASIC, "emissive"]),
  MeshNormalMaterial: material(["opacity", "transparent", "wireframe", "flatShading"]),
  PointsMaterial: material(["color", "size", "sizeAttenuation", "vertexColors", "opacity", "transparent", "depthWrite"]),
  LineBasicMaterial: material(["color", "vertexColors", "opacity", "transparent"]),
};

/** Classes de valor (vetores, cores, matrizes): não são objetos da cena e não são rastreadas. */
export const VALUE_CLASSES = new Set([
  "Vector2", "Vector3", "Vector4", "Color", "Euler", "Quaternion", "Matrix3", "Matrix4",
  "Box2", "Box3", "Sphere", "Ray", "Plane", "Line3", "Triangle", "Spherical", "Cylindrical",
  "Clock", "Timer", "Raycaster", "Layers", "BufferAttribute", "Float32BufferAttribute",
]);

export function classInfo(className) {
  if (CLASSES[className]) return CLASSES[className];
  if (/Geometry$/.test(className)) return { kind: "geometry", unknown: true };
  if (/Material$/.test(className)) return { kind: "material", unknown: true };
  if (/Light$/.test(className)) return { kind: "light", unknown: true };
  if (/Camera$/.test(className)) return { kind: "camera", unknown: true };
  if (/Helper$/.test(className)) return { kind: "object", unknown: true };
  return { kind: "other", unknown: true };
}

/** Objetos que existem no espaço da cena (têm posição, rotação e escala). */
export function isObject3DKind(kind) {
  return isDrawableKind(kind) || kind === "light" || kind === "camera" || kind === "group" || kind === "object" || kind === "scene";
}

/** Objetos desenhados a partir de uma geometria e de um material: malhas, pontos e linhas. */
export function isDrawableKind(kind) {
  return kind === "mesh" || kind === "points" || kind === "line";
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((k) => [k, source[k]]));
}

function geometry(params) {
  return {
    kind: "geometry",
    args: params.map(([key]) => key),
    props: Object.fromEntries(params),
  };
}

function material(keys) {
  return { kind: "material", options: true, props: pick(MATERIAL_PROPS, keys) };
}
