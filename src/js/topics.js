// topics.js — os temas do VisuGraph. Cada tema tem dois passos: explorar o conceito num
// laboratório (index-2d.html#<laboratório>) e programar a cena na trilha de desafios do código
// vivo (index-3d.html?trilha=<trilha>). Um tema pode ainda não ter um dos dois passos.

export const TOPICS = [
  { id: "transformacoes", name: "Transformações", labs: [{ id: "coordenadas", name: "Coordenadas" }], trail: "matriz" },
  { id: "camera", name: "Câmera e projeção", labs: [], trail: "camera" },
  {
    id: "luz",
    name: "Luz e cor",
    labs: [
      { id: "phong", name: "Modelo Phong" },
      { id: "cores", name: "Sistemas de cores" },
    ],
    trail: "phong",
  },
  { id: "curvas", name: "Curvas", labs: [{ id: "curvas", name: "Curvas de Bézier" }], trail: null },
];

export const labUrl = (lab) => `./index-2d.html#${lab}`;
export const trailUrl = (trail) => `./index-3d.html?trilha=${trail}`;
export const FREE_EDITOR_URL = "./index-3d.html?livre"; // o código vivo sem desafio aberto

export const topicOfLab = (lab) => TOPICS.find((t) => t.labs.some((l) => l.id === lab)) ?? null;
export const topicOfTrail = (trail) => TOPICS.find((t) => t.trail != null && t.trail === trail) ?? null;
export const labById = (lab) => topicOfLab(lab)?.labs.find((l) => l.id === lab) ?? null;
