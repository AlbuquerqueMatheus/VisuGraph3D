// challenges.js — os desafios do modo 3D e as trilhas que os ligam aos laboratórios 2D.
//
// Cada desafio tem um enunciado, um código inicial, três dicas e verificações. As
// verificações olham a cena que está rodando (os "fatos" que o visor lê: posições de mundo,
// caixas, câmera, luzes, materiais), não o texto do código: qualquer caminho que chegue ao
// resultado vale, seja pelo código, pelo gizmo ou pelo painel. Nos textos, `assim` é código.

import { invert, multiply, perspective, rotationY, rotationZ, scaling, toNdc, transform, translation } from "../lib/transform3d.js";

const HEAD = (camera = "camera.position.set(5, 4, 7);\ncamera.lookAt(0, 0.5, 0);") => `const cena = new THREE.Scene();
cena.background = new THREE.Color("#15171c");

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
${camera}

const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.5);
cena.add(luzAmbiente);

const sol = new THREE.DirectionalLight("#ffffff", 2);
sol.position.set(3, 5, 2);
cena.add(sol);
`;

const FLOOR = `
const chao = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: "#3a3f4b" })
);
chao.rotation.x = THREE.MathUtils.degToRad(-90);
cena.add(chao);
`;

const close = (a, b, tol) => Math.abs(a - b) <= tol;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (v) => {
  const l = Math.hypot(...v);
  return l ? v.map((c) => c / l) : v;
};
const sub = (a, b) => a.map((c, i) => c - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = (rad) => (rad * 180) / Math.PI;
const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace("-", "−").replace(".", ",");
const vec = (v, d = 2) => `(${v.map((c) => fmt(c, d)).join("; ")})`;
const size = (box) => sub(box.max, box.min);
const round = (m) => m.map((row) => row.map((v) => Math.round(v * 1e9) / 1e9 + 0)); // sem −0 nem 6e-17

/** Resultado de uma verificação: `ok` e, se falhou, o que se viu. */
const check = (ok, seen) => ({ ok, seen: ok ? null : seen });

/** Matriz alvo do desafio "Reproduza a matriz": T(1, 2, 0) · Rz(90°) · S(2, 1, 1). */
export const TARGET_MATRIX = round(multiply(multiply(translation(1, 2, 0), rotationZ(Math.PI / 2)), scaling(2, 1, 1)));

export const CHALLENGES = [
  {
    id: "posicao",
    title: "Leve o cubo até o alvo",
    topic: "Translação",
    statement: "O contorno tracejado mostra onde o cubo deve ficar: x = 2, y = 0,5, z = −1. Mova o cubo até lá, pelo código ou pela seta do gizmo.",
    view: "editor",
    needs: ["cubo"],
    ghosts: [{ kind: "box", size: [1, 1, 1], matrix: translation(2, 0.5, -1) }],
    starter: `${HEAD()}${FLOOR}
const cubo = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: "#4f8cff" })
);
cubo.position.set(0, 0.5, 0);
cena.add(cubo);
`,
    checks: [
      {
        text: "O cubo está em (2; 0,5; −1)",
        test: ({ objects }) => check(dist(objects.cubo.worldPosition, [2, 0.5, -1]) <= 0.05, `está em ${vec(objects.cubo.worldPosition)}`),
      },
    ],
    hints: [
      "A posição é uma translação: `cubo.position.set(x, y, z)`.",
      "Na aba Matemática, a última coluna de M é a translação (x, y, z) do cubo.",
      "`cubo.position.set(2, 0.5, -1);`",
    ],
  },
  {
    id: "rotacao",
    title: "Gire a placa 45°",
    topic: "Rotação em radianos",
    statement: "Gire a placa 45° em torno do eixo y (o vertical), no sentido anti-horário visto de cima, até ela cobrir o contorno. O Three.js mede ângulos em radianos.",
    view: "editor",
    needs: ["placa"],
    ghosts: [{ kind: "box", size: [2, 1, 0.1], matrix: multiply(translation(0, 0.5, 0), rotationY(Math.PI / 4)) }],
    starter: `${HEAD()}${FLOOR}
const placa = new THREE.Mesh(
  new THREE.BoxGeometry(2, 1, 0.1),
  new THREE.MeshStandardMaterial({ color: "#ff8a3d" })
);
placa.position.set(0, 0.5, 0);
cena.add(placa);
`,
    checks: [
      {
        text: "A placa está girada 45° em torno de y",
        test: ({ objects }) => {
          // para onde foram os eixos da placa: as colunas da matriz de mundo. Girada só em
          // torno de y, o eixo x fica deitado e o y continua de pé.
          const w = objects.placa.world;
          const x = norm([w[0][0], w[1][0], w[2][0]]);
          const y = norm([w[0][1], w[1][1], w[2][1]]);
          if (Math.abs(x[1]) > 0.02 || y[1] < 0.999) return check(false, "está inclinada: gire só em torno de y");
          // a placa é simétrica: 45° e 225° cobrem o mesmo contorno
          const angle = ((deg(Math.atan2(-x[2], x[0])) % 180) + 180) % 180;
          return check(close(angle, 45, 1), `está girada ${fmt(angle, 1)}° em torno de y`);
        },
      },
    ],
    hints: [
      "Use `placa.rotation.y = ângulo`, com o ângulo em radianos.",
      "45° = π/4 rad ≈ 0,785. `THREE.MathUtils.degToRad(45)` faz a conta.",
      "`placa.rotation.y = THREE.MathUtils.degToRad(45);`",
    ],
  },
  {
    id: "escala",
    title: "Uma coluna de 3 de altura",
    topic: "Escala e centro",
    statement: "A coluna é um cilindro de altura 1. Estique-a até 3 de altura sem mudar a grossura e sem afundar no chão: a base tem de ficar em y = 0.",
    view: "editor",
    needs: ["coluna"],
    ghosts: [{ kind: "box", size: [0.6, 3, 0.6], matrix: translation(0, 1.5, 0) }],
    starter: `${HEAD()}${FLOOR}
const coluna = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 1, 32),
  new THREE.MeshStandardMaterial({ color: "#3ddc97" })
);
coluna.position.set(0, 0.5, 0);
cena.add(coluna);
`,
    checks: [
      {
        text: "A coluna tem 3 de altura",
        test: ({ objects }) => check(close(size(objects.coluna.box)[1], 3, 0.02), `tem ${fmt(size(objects.coluna.box)[1])} de altura`),
      },
      {
        text: "A grossura continua 0,6",
        test: ({ objects }) => {
          const s = size(objects.coluna.box);
          return check(close(s[0], 0.6, 0.02) && close(s[2], 0.6, 0.02), `tem ${fmt(s[0])} × ${fmt(s[2])} de largura`);
        },
      },
      {
        text: "A base está no chão (y = 0)",
        test: ({ objects }) => check(close(objects.coluna.box.min[1], 0, 0.02), `a base está em y = ${fmt(objects.coluna.box.min[1])}`),
      },
    ],
    hints: [
      "A escala multiplica o tamanho a partir do centro do objeto: `coluna.scale.y = 3`.",
      "Esticada pelo centro, a coluna cresce para cima e para baixo. Suba o centro até a metade da altura nova.",
      "`coluna.scale.y = 3;\ncoluna.position.y = 1.5;`",
    ],
  },
  {
    id: "hierarquia",
    title: "A lua na órbita",
    topic: "Hierarquia (pai e filho)",
    statement:
      "O grupo `orbita` está no centro da Terra e gira em `animar()`. Ponha a lua dentro dele, a 2 unidades do centro da Terra, para ela girar junto, sobre o anel tracejado.",
    view: "editor",
    needs: ["lua", "terra", "orbita"],
    ghosts: [{ kind: "ring", center: [0, 1, 0], radius: 2 }],
    starter: `${HEAD("camera.position.set(4, 5, 7);\ncamera.lookAt(0, 1, 0);")}
const terra = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 32, 16),
  new THREE.MeshStandardMaterial({ color: "#4f8cff" })
);
terra.position.set(0, 1, 0);
cena.add(terra);

const orbita = new THREE.Group();
orbita.position.set(0, 1, 0);
cena.add(orbita);

const lua = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 24, 12),
  new THREE.MeshStandardMaterial({ color: "#d9d9d9" })
);
lua.position.set(3, 1, 0);
cena.add(lua);

function animar(tempo) {
  orbita.rotation.y = tempo * 0.5;
}
`,
    checks: [
      {
        text: "A lua está dentro do grupo orbita",
        test: ({ objects, nameOf }) => {
          const parent = objects.lua.parent;
          const name = parent == null ? "a cena" : nameOf(parent) ?? "outro objeto";
          return check(name === "orbita", `o pai da lua é ${name}`);
        },
      },
      {
        text: "A lua fica a 2 unidades do centro da Terra",
        test: ({ objects }) => {
          const d = dist(objects.lua.worldPosition, objects.terra.worldPosition);
          return check(close(d, 2, 0.05), `está a ${fmt(d)}`);
        },
      },
    ],
    hints: [
      "Um objeto dentro de um grupo usa o grupo como origem: troque `cena.add(lua)` por `orbita.add(lua)`.",
      "Dentro do grupo, a posição da lua é medida a partir do centro do grupo, que já está no centro da Terra. Na aba Matemática, veja Mundo = M_pai · M.",
      "`lua.position.set(2, 0, 0);\norbita.add(lua);`",
    ],
  },
  {
    id: "lookat",
    title: "Enquadre a esfera",
    topic: "Câmera: lookAt",
    statement: "A vista está pela Câmera do código. Sem tirar a câmera do lugar, faça ela olhar direto para a esfera, que tem de aparecer no meio da imagem.",
    view: "camera",
    needs: ["esfera"],
    starter: `${HEAD("camera.position.set(6, 2, 4);\ncamera.lookAt(0, 0, 0);")}${FLOOR}
const esfera = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 16),
  new THREE.MeshStandardMaterial({ color: "#f25f5c" })
);
esfera.position.set(-2, 1, -3);
cena.add(esfera);
`,
    checks: [
      {
        text: "A câmera continua em (6; 2; 4)",
        test: ({ camera }) => check(!!camera && dist(camera.worldPosition, [6, 2, 4]) <= 0.01, camera ? `está em ${vec(camera.worldPosition)}` : "não há câmera no código"),
      },
      {
        text: "A câmera olha para o centro da esfera",
        test: ({ camera, objects }) => {
          if (!camera) return check(false, "não há câmera no código");
          const want = norm(sub(objects.esfera.worldPosition, camera.worldPosition));
          const angle = deg(Math.acos(Math.min(1, dot(norm(camera.direction), want))));
          return check(angle <= 1.5, `erra por ${fmt(angle, 1)}°`);
        },
      },
    ],
    hints: [
      "`camera.lookAt(x, y, z)` vira a câmera para um ponto do mundo.",
      "O ponto é o centro da esfera: os números de `esfera.position`.",
      "`camera.lookAt(-2, 1, -3);`",
    ],
  },
  {
    id: "fov",
    title: "Metade da altura da imagem",
    topic: "Projeção: campo de visão",
    statement:
      "Pela Câmera do código, a caixa ocupa pouco da imagem. Sem mover a câmera nem a caixa, mude só o campo de visão (fov) até a caixa ocupar metade da altura da imagem.",
    view: "camera",
    needs: ["caixa"],
    starter: `${HEAD("camera.position.set(0, 1, 10);\ncamera.lookAt(0, 1, 0);")}
const caixa = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: "#ffd23f" })
);
caixa.position.set(0, 1, 0);
cena.add(caixa);
`,
    checks: [
      {
        text: "A câmera e a caixa continuam no lugar",
        test: ({ camera, objects }) =>
          check(!!camera && dist(camera.worldPosition, [0, 1, 10]) <= 0.01 && dist(objects.caixa.worldPosition, [0, 1, 0]) <= 0.01, "algo saiu do lugar"),
      },
      {
        text: "A caixa ocupa metade da altura da imagem",
        test: ({ camera, objects }) => {
          if (!camera) return check(false, "não há câmera no código");
          if (!(camera.fov > 0)) return check(false, "a câmera do código não é PerspectiveCamera");
          const h = screenHeight(objects.caixa.box, camera);
          return check(close(h, 0.5, 0.03), `ocupa ${fmt(h * 100, 0)}% da altura`);
        },
      },
    ],
    hints: [
      "O fov é o ângulo vertical da câmera, o primeiro número de `new THREE.PerspectiveCamera(fov, …)`. Menos fov, mais zoom.",
      "Na aba Matemática, P[1][1] = f = 1 / tan(fov/2). A frente da caixa está a 9 da câmera e sobe 1 acima do centro da imagem: ela ocupa metade quando f · 1/9 = 0,5.",
      "f = 4,5, então tan(fov/2) = 2/9 e fov ≈ 25°: `new THREE.PerspectiveCamera(25, 16 / 9, 0.1, 100)`.",
    ],
  },
  {
    id: "difusa",
    title: "Luz pela esquerda",
    topic: "Luz difusa: n·l",
    statement: "Ilumine a esfera pelo lado −x, a esquerda na Câmera do código: a parte clara tem de ficar à esquerda e a escura à direita. Mude só a luz direcional `sol`.",
    view: "camera",
    needs: ["esfera", "sol"],
    starter: `${HEAD("camera.position.set(0, 1.5, 6);\ncamera.lookAt(0, 1, 0);")
      .replace("sol.position.set(3, 5, 2);", "sol.position.set(5, 2, 1);")
      .replace('new THREE.AmbientLight("#ffffff", 0.5)', 'new THREE.AmbientLight("#ffffff", 0.2)')}
const esfera = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 24),
  new THREE.MeshLambertMaterial({ color: "#f2f2f2" })
);
esfera.position.set(0, 1, 0);
cena.add(esfera);
`,
    checks: [
      {
        text: "A luz vem do lado −x",
        test: ({ objects }) => {
          const l = norm(sub(objects.sol.worldPosition, objects.sol.target));
          return check(l[0] <= -0.8, `a direção da luz é l = ${vec(l)}`);
        },
      },
    ],
    hints: [
      "A luz direcional vem da posição dela em direção ao alvo (`sol.target`), que fica na origem.",
      "A difusa é Kd·L·max(0, n·l): fica clara onde a normal aponta para a luz. Para clarear o lado −x, a luz tem de estar em x negativo.",
      "`sol.position.set(-5, 1, 0);`",
    ],
  },
  {
    id: "especular",
    title: "Um brilho pequeno e forte",
    topic: "Especular: o expoente n",
    statement:
      "Troque o material da esfera por `MeshPhongMaterial` e deixe o reflexo da luz pequeno e concentrado: brilho (`shininess`) de pelo menos 100, com cor especular clara.",
    view: "camera",
    needs: ["esfera"],
    starter: `${HEAD("camera.position.set(0, 2, 6);\ncamera.lookAt(0, 1, 0);")}
const esfera = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 24),
  new THREE.MeshLambertMaterial({ color: "#3366cc" })
);
esfera.position.set(0, 1, 0);
cena.add(esfera);
`,
    checks: [
      {
        text: "O material é MeshPhongMaterial",
        test: ({ objects }) => check(objects.esfera.material?.type === "MeshPhongMaterial", `é ${objects.esfera.material?.type ?? "outro"}`),
      },
      {
        text: "O brilho (shininess) é de pelo menos 100",
        test: ({ objects }) => check((objects.esfera.material?.shininess ?? 0) >= 100, `é ${fmt(objects.esfera.material?.shininess ?? 0, 0)}`),
      },
      {
        text: "A cor especular é clara",
        test: ({ objects }) => {
          const s = objects.esfera.material?.specular;
          return check(!!s && Math.max(...s) >= 0.5, s ? `Ks = ${vec(s)}` : "o material não tem cor especular");
        },
      },
    ],
    hints: [
      "Só o `MeshPhongMaterial` tem o termo especular, Ks · L · (r·v)ⁿ.",
      "Quanto maior o n (`shininess`), mais depressa (r·v)ⁿ cai fora do reflexo, e menor fica o brilho. Ligue a caixa de vidro na aba Matemática e meça.",
      '`new THREE.MeshPhongMaterial({ color: "#3366cc", specular: "#ffffff", shininess: 120 })`',
    ],
  },
  {
    id: "cor",
    title: "A esfera verde fica preta",
    topic: "Cor: canal a canal",
    statement: "A esfera é verde. Sem mudar o material e sem apagar as luzes, faça ela ficar preta mudando só a cor delas (a luz ambiente também conta).",
    view: "camera",
    needs: ["esfera", "luzAmbiente", "sol"],
    starter: `${HEAD("camera.position.set(0, 1.5, 6);\ncamera.lookAt(0, 1, 0);")}
const esfera = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 24),
  new THREE.MeshLambertMaterial({ color: "#00cc00" })
);
esfera.position.set(0, 1, 0);
cena.add(esfera);
`,
    checks: [
      {
        text: "O material continua verde (#00cc00)",
        test: ({ objects }) => check(objects.esfera.material?.hex === "#00cc00", `a cor do material é ${objects.esfera.material?.hex ?? "outra"}`),
      },
      {
        text: "As duas luzes continuam acesas",
        test: ({ objects }) => {
          const off = ["luzAmbiente", "sol"].filter((name) => {
            const l = objects[name].light;
            return !l || Math.max(...l.color) * l.intensity < 0.1;
          });
          return check(!off.length, `${off.join(" e ")} ${off.length > 1 ? "estão apagadas" : "está apagada"} ou quase`);
        },
      },
      {
        text: "Nenhuma luz tem verde",
        test: ({ lights }) => {
          const green = lights.filter((l) => Math.max(l.color[1], l.ground?.[1] ?? 0) * l.intensity > 0.01);
          return check(!green.length, green.length === 1 ? "1 luz ainda tem verde" : `${green.length} luzes ainda têm verde`);
        },
      },
    ],
    hints: [
      "A cor de cada ponto é Kd ⊙ L: vermelho com vermelho, verde com verde e azul com azul.",
      "O material só tem verde: Kd = (0; 0,8; 0). Uma luz sem verde não tem o que esse material refletir.",
      '`luzAmbiente.color.set("#0000ff");\nsol.color.set("#ff0000");`',
    ],
  },
  {
    id: "matriz",
    title: "Reproduza a matriz",
    topic: "Matriz de modelo",
    statement: "Faça a matriz de modelo M do bloco ficar igual a esta. Compare com a aba Matemática, que mostra a M do bloco agora.",
    view: "editor",
    matrix: TARGET_MATRIX,
    needs: ["bloco"],
    ghosts: [{ kind: "box", size: [1, 1, 1], matrix: TARGET_MATRIX }],
    starter: `${HEAD("camera.position.set(2, 3, 8);\ncamera.lookAt(1, 1.5, 0);")}
const bloco = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: "#b388ff" })
);
bloco.position.set(0, 0.5, 0);
cena.add(bloco);
`,
    checks: [
      {
        text: "M é igual à matriz pedida",
        test: ({ objects }) => {
          const diff = Math.max(...objects.bloco.world.flat().map((v, i) => Math.abs(v - TARGET_MATRIX.flat()[i])));
          return check(diff <= 0.01, `a maior diferença é ${fmt(diff, 3)}`);
        },
      },
    ],
    hints: [
      "A última coluna de M é a posição do bloco.",
      "As três primeiras colunas são R · S: o tamanho de cada coluna é a escala daquele eixo, e a direção dela é para onde aquele eixo foi girado.",
      "`bloco.position.set(1, 2, 0);\nbloco.rotation.z = THREE.MathUtils.degToRad(90);\nbloco.scale.set(2, 1, 1);`",
    ],
  },
];

export const TRAILS = [
  { id: "matriz", title: "Transformações e matrizes", from: "Coordenadas 2D", challenges: ["posicao", "rotacao", "escala", "hierarquia", "matriz"] },
  { id: "camera", title: "Câmera e projeção", challenges: ["lookat", "fov"] },
  { id: "phong", title: "Luz e cor (Phong)", from: "Modelo Phong 2D", glass: "phong", challenges: ["difusa", "especular", "cor"] },
];

export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) ?? null;
export const trailOf = (id) => TRAILS.find((t) => t.challenges.includes(id)) ?? null;
export const trailById = (id) => TRAILS.find((t) => t.id === id) ?? null;

/** Primeiro desafio da trilha que ainda não foi feito (ou o primeiro, se todos foram). */
export function firstOpen(trail, done) {
  return challengeById(trail.challenges.find((id) => !done.has(id)) ?? trail.challenges[0]);
}

/** O desafio depois deste: o próximo da trilha, ou o primeiro não feito das outras. */
export function nextChallenge(id, done) {
  const trail = trailOf(id);
  const i = trail.challenges.indexOf(id);
  if (i + 1 < trail.challenges.length) return challengeById(trail.challenges[i + 1]);
  const t = TRAILS.indexOf(trail);
  for (const other of [...TRAILS.slice(t + 1), ...TRAILS.slice(0, t)]) {
    const open = other.challenges.find((c) => !done.has(c));
    if (open) return challengeById(open);
  }
  return null;
}

/** Fração da altura da imagem que a caixa ocupa vista pela câmera (pelas nossas matrizes). */
export function screenHeight(box, camera) {
  const view = invert(camera.world);
  const projection = perspective({ fov: camera.fov, aspect: 1, near: camera.near, far: camera.far, zoom: camera.zoom ?? 1 });
  const ys = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) ys.push(toNdc(transform(projection, transform(view, [x, y, z])))[1]);
  return (Math.max(...ys) - Math.min(...ys)) / 2;
}

/**
 * Corrige o desafio com os fatos da cena: `facts.objects[nome]`, `facts.camera`,
 * `facts.lights` e `facts.nameOf(id)`. Objeto pedido que não existe reprova a verificação.
 */
export function grade(challenge, facts) {
  const missing = challenge.needs.filter((name) => !facts.objects[name]);
  const results = challenge.checks.map((c) => {
    if (missing.length) return { text: c.text, ok: false, seen: `não achei ${missing.join(", ")} na cena` };
    try {
      return { text: c.text, ...c.test(facts) };
    } catch {
      return { text: c.text, ok: false, seen: "não deu para conferir" };
    }
  });
  return { ok: results.every((r) => r.ok), results };
}
