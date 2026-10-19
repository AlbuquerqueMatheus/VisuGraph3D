// explain.js — explicações que aparecem ao passar o mouse sobre o código.

import { classInfo } from "./engine/catalog.js";
import { propDef } from "./engine/patch.js";

const CLASS_DOCS = {
  Scene: "A cena: o \"palco\" onde ficam objetos, luzes e câmeras. Só aparece o que for adicionado com cena.add().",
  PerspectiveCamera: "Câmera com perspectiva, como o olho humano: o que está longe parece menor. Argumentos: campo de visão (graus), proporção, plano próximo e plano distante.",
  OrthographicCamera: "Câmera sem perspectiva: objetos longe e perto têm o mesmo tamanho (usada em desenho técnico).",
  Mesh: "Malha: junta uma geometria (a forma) com um material (a aparência) e vira um objeto da cena.",
  Group: "Grupo: junta objetos para mover, girar e escalar todos juntos.",
  Object3D: "Objeto 3D vazio: só tem posição, rotação e escala. Serve para agrupar outros objetos.",
  BoxGeometry: "Geometria de caixa. Argumentos: largura, altura e profundidade (e divisões em cada direção).",
  SphereGeometry: "Geometria de esfera. Argumentos: raio, segmentos na horizontal e na vertical (mais segmentos, mais lisa).",
  PlaneGeometry: "Geometria de plano: um retângulo sem espessura. Argumentos: largura e altura.",
  CylinderGeometry: "Geometria de cilindro. Argumentos: raio do topo, raio da base, altura e segmentos.",
  ConeGeometry: "Geometria de cone. Argumentos: raio da base, altura e segmentos.",
  TorusGeometry: "Geometria de toro (rosca). Argumentos: raio do anel, espessura do tubo e segmentos.",
  TorusKnotGeometry: "Nó toroidal: um tubo que dá voltas p e q em torno de um toro.",
  CapsuleGeometry: "Cápsula: um cilindro com meias esferas nas pontas.",
  CircleGeometry: "Círculo plano. Argumentos: raio e segmentos.",
  RingGeometry: "Anel plano. Argumentos: raio interno, raio externo e segmentos.",
  IcosahedronGeometry: "Icosaedro (20 faces). Com detalhe maior que 0 vira quase uma esfera.",
  DodecahedronGeometry: "Dodecaedro (12 faces).",
  OctahedronGeometry: "Octaedro (8 faces).",
  TetrahedronGeometry: "Tetraedro (4 faces).",
  MeshBasicMaterial: "Material que ignora as luzes: a cor aparece sempre igual, sem sombreamento.",
  MeshLambertMaterial: "Material fosco (modelo de Lambert): só tem reflexão difusa, calculada por vértice.",
  MeshPhongMaterial: "Material com brilho (modelo de Phong): reflexão difusa e especular, com 'shininess' controlando o brilho.",
  MeshStandardMaterial: "Material físico (PBR): a aparência vem de aspereza (roughness) e metal (metalness).",
  MeshPhysicalMaterial: "Versão estendida do MeshStandardMaterial, com verniz, transmissão e outros efeitos físicos.",
  MeshToonMaterial: "Material de desenho animado: o sombreamento muda em faixas.",
  MeshNormalMaterial: "Pinta cada ponto com a cor da sua normal (x→vermelho, y→verde, z→azul). Útil para ver a orientação das faces.",
  AmbientLight: "Luz ambiente: ilumina tudo por igual, de todas as direções. Não tem posição nem faz sombra.",
  DirectionalLight: "Luz direcional, como o sol: raios paralelos que vêm da posição da luz em direção ao alvo (a origem, por padrão).",
  PointLight: "Luz pontual, como uma lâmpada: espalha luz em todas as direções a partir da posição dela.",
  SpotLight: "Holofote: luz em forma de cone. 'angle' é a abertura do cone e 'penumbra' suaviza a borda.",
  HemisphereLight: "Luz do céu: uma cor vem de cima (céu) e outra de baixo (chão), misturando conforme a direção da superfície.",
  Color: "Uma cor. Aceita \"#rrggbb\", nomes em inglês (\"red\") ou números 0xrrggbb.",
  Vector3: "Um vetor com x, y e z: pode ser um ponto, uma direção ou um deslocamento.",
  MathUtils: "Funções matemáticas do Three.js, como degToRad (graus → radianos).",
  WebGLRenderer: "O renderizador. No VisuGraph ele já existe: não precisa criar outro.",
};

const MEMBER_DOCS = {
  position: "Posição do objeto (x, y, z), em relação ao objeto pai. O eixo y aponta para cima.",
  rotation: "Rotação do objeto em torno dos eixos x, y e z, em radianos. Use THREE.MathUtils.degToRad(graus) para escrever em graus.",
  scale: "Escala do objeto em x, y e z: 1 é o tamanho original, 2 é o dobro.",
  castShadow: "Se true, o objeto (ou a luz) projeta sombra.",
  receiveShadow: "Se true, o objeto mostra as sombras que caem sobre ele.",
  visible: "Se false, o objeto continua na cena, mas não é desenhado.",
  background: "Cor de fundo da cena.",
  add: "Coloca um objeto dentro de outro. cena.add(objeto) faz o objeto aparecer na cena.",
  remove: "Tira um objeto de dentro de outro.",
  lookAt: "Gira o objeto para que ele \"olhe\" para o ponto dado. Muito usado na câmera.",
  color: "Cor (da luz ou do material).",
  emissive: "Cor que o material emite por conta própria, mesmo sem luz.",
  emissiveIntensity: "Força da cor emitida.",
  roughness: "Aspereza: 0 é um espelho liso, 1 é totalmente fosco.",
  metalness: "Metal: 0 é um material comum (plástico, madeira), 1 é metal.",
  opacity: "Opacidade: 1 é opaco, 0 é invisível. Só funciona com transparent: true.",
  transparent: "Liga a transparência do material (necessário para opacity < 1).",
  wireframe: "Se true, desenha só as arestas dos triângulos da geometria.",
  flatShading: "Se true, cada face tem uma cor só (sombreamento plano), mostrando os triângulos.",
  shininess: "Brilho especular do modelo de Phong: quanto maior, menor e mais forte o reflexo.",
  specular: "Cor do reflexo especular (modelo de Phong).",
  intensity: "Intensidade da luz.",
  distance: "Alcance da luz: depois dessa distância ela não ilumina mais (0 = sem limite).",
  decay: "Quanto a luz enfraquece com a distância (2 é o valor fisicamente correto).",
  angle: "Abertura do cone do holofote, em radianos.",
  penumbra: "Suavidade da borda do cone do holofote (0 a 1).",
  groundColor: "Cor que vem de baixo, na luz do céu.",
  fov: "Campo de visão vertical da câmera, em graus.",
  near: "Plano próximo: o que estiver mais perto que isso não aparece.",
  far: "Plano distante: o que estiver mais longe que isso não aparece.",
  degToRad: "Converte graus em radianos (180° = π radianos). O Three.js usa radianos em todos os ângulos.",
  updateProjectionMatrix: "Recalcula a projeção da câmera depois de mudar fov, near, far ou aspect.",
  material: "O material da malha (a aparência).",
  geometry: "A geometria da malha (a forma).",
};

const SET_DOCS = {
  position: "Define a posição de uma vez: set(x, y, z).",
  rotation: "Define a rotação de uma vez: set(x, y, z), em radianos.",
  scale: "Define a escala de uma vez: set(x, y, z).",
  color: "Troca a cor: set(\"#rrggbb\").",
};

const WORD_DOCS = {
  THREE: "A biblioteca Three.js. Todas as classes (THREE.Mesh, THREE.Scene…) vêm daqui; no VisuGraph ela já está carregada.",
  animar: "O VisuGraph chama animar(tempo, delta) a cada quadro, cerca de 60 vezes por segundo. Mude propriedades aqui para animar a cena.",
  tempo: "Tempo em segundos desde que a cena começou a rodar.",
  delta: "Segundos desde o quadro anterior: velocidade * delta é o quanto algo anda em um quadro.",
};

const isWord = (c) => !!c && /[\w$]/.test(c);

/**
 * Explicação para a posição `pos` do código, ou null.
 * Retorna { from, to, title, text }.
 */
export function explain(analysis, pos) {
  const code = analysis.code;
  if (analysis.ok) {
    const n = analysis.numbers.find((x) => x.from <= pos && pos < x.to);
    if (n) return explainNumber(analysis, n);
  }
  let from = pos;
  let to = pos;
  while (isWord(code[from - 1])) from--;
  while (isWord(code[to])) to++;
  if (from === to) return null;
  const word = code.slice(from, to);
  if (/^\d/.test(word)) return null;
  const prev = code[from - 1] === "." ? previousWord(code, from - 1) : null;
  // chave de um objeto de opções, como em { roughness: 0.4 }
  const isKey = !prev && /^\s*:/.test(code.slice(to, to + 40)) && /[{,]\s*$/.test(code.slice(Math.max(0, from - 40), from));
  const range = { from, to };

  if (prev === "THREE" && CLASS_DOCS[word]) return { ...range, title: `THREE.${word}`, text: CLASS_DOCS[word] };
  if (word === "set" && prev && SET_DOCS[prev]) return { ...range, title: `${prev}.set`, text: SET_DOCS[prev] };
  if ((prev || isKey) && MEMBER_DOCS[word]) return { ...range, title: word, text: MEMBER_DOCS[word] };
  if (WORD_DOCS[word]) return { ...range, title: word, text: WORD_DOCS[word] };
  if (analysis.ok && !prev) {
    const obj = analysis.objects.find((o) => o.name === word);
    if (obj) {
      const what = CLASS_DOCS[obj.className] ? ` ${CLASS_DOCS[obj.className]}` : "";
      return { ...range, title: `${word}: THREE.${obj.className}`, text: `Criado na linha ${obj.line}.${what}` };
    }
  }
  return null;
}

function explainNumber(analysis, n) {
  const range = { from: n.from, to: n.to };
  const hint = "Arraste o número para os lados para mudar (Shift: passos maiores, Alt: menores).";
  if (!n.slot) return n.hex ? null : { ...range, title: "Número", text: hint };
  const obj = analysis.objects[n.slot.id];
  const def = propDef(obj, n.slot.key);
  const [, axis] = n.slot.key.split(".");
  const label = def ? `${def.label}${axis ? ` ${axis}` : ""}` : n.slot.key;
  const owner = obj.name || (obj.owner != null ? analysis.objects[obj.owner].name : null);
  const kind = classInfo(obj.className).kind;
  const of = owner ? ` ${kind === "material" ? "do material de" : kind === "geometry" ? "da geometria de" : "de"} ${owner}` : "";
  const unit = n.slot.unit === "deg" ? " (em graus)" : n.slot.unit === "rad" ? " (em radianos)" : "";
  return { ...range, title: `${label}${of}${unit}`, text: hint };
}

function previousWord(code, dot) {
  let end = dot;
  while (end > 0 && /\s/.test(code[end - 1])) end--;
  let start = end;
  while (isWord(code[start - 1])) start--;
  return start < end ? code.slice(start, end) : null;
}
