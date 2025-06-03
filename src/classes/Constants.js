// src/classes/constants.js

export const debugObject = {
  // Parâmetros de geometria e aparência
  subdivisions: 2,
  extrudeAmount: 0,
  color: 0xff0000,
  opacity: 1,
  renderStyle: "normal",
  shadows: true,
  
  // Câmera
  cameraPositionZ: 3,
  
  // Escolhas do usuário
  selectedGeometry: "Box",
  selectedTexture: "none",
  
  // Funções que serão sobrescritas pelo GUIManager
  spin: () => {},
  resetTransform: () => {},
  
  // Modo de transformação: "none" | "translate" | "rotate" | "scale"
  mode: "none",

  // ** Array Modifier **
  // Este objeto deve existir antes de o GUI ler suas propriedades
  arrayModifier: {
    count: 1,
    offsetX: 1,
    offsetY: 0,
    offsetZ: 0,
  },
};

export const textures = {
  metal: {
    color: null,
    displacement: null,
    metalness: null,
    normal: null,
    roughness: null,
  },
  moss: {
    color: null,
    displacement: null,
    normal: null,
    roughness: null,
    ambientOcclusion: null,
  },
  wood: {
    color: null,
    displacement: null,
    normal: null,
    roughness: null,
  },
  pedra: {
    color: null,
    displacement: null,
    normal: null,
    roughness: null,
    ambientOcclusion: null,
  },
};

export const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};
