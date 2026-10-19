// snippets.js — o código inicial e os trechos do menu "Adicionar".

export const STARTER_CODE = `// Tudo o que aparece no visor vem deste código: mude um número e veja a cena
// mudar, ou arraste um objeto no visor e veja o código mudar.

const cena = new THREE.Scene();
cena.background = new THREE.Color("#15171c");

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(0, 0.5, 0);

const luzAmbiente = new THREE.AmbientLight("#ffffff", 0.4);
cena.add(luzAmbiente);

const sol = new THREE.DirectionalLight("#ffffff", 2);
sol.position.set(3, 5, 2);
sol.castShadow = true;
cena.add(sol);

const chao = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: "#3a3f4b", roughness: 0.9 })
);
chao.rotation.x = THREE.MathUtils.degToRad(-90);
chao.receiveShadow = true;
cena.add(chao);

const cubo = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: "#4f8cff", roughness: 0.4, metalness: 0.1 })
);
cubo.position.set(0, 0.5, 0);
cubo.castShadow = true;
cena.add(cubo);

// O VisuGraph chama animar() a cada quadro, com o tempo em segundos.
// Experimente escrever aqui dentro: cubo.rotation.y = tempo;
function animar(tempo) {
}
`;

const PALETTE = ["#ff8a3d", "#3ddc97", "#f25f5c", "#ffd23f", "#b388ff", "#4fd1ff"];

/** Itens do menu "Adicionar". `geometry` cria uma malha; `light` cria uma luz. */
export const ADD_ITEMS = [
  { kind: "caixa", label: "Caixa", geometry: "new THREE.BoxGeometry(1, 1, 1)", y: 0.5 },
  { kind: "esfera", label: "Esfera", geometry: "new THREE.SphereGeometry(0.5, 32, 16)", y: 0.5 },
  { kind: "cilindro", label: "Cilindro", geometry: "new THREE.CylinderGeometry(0.5, 0.5, 1, 32)", y: 0.5 },
  { kind: "cone", label: "Cone", geometry: "new THREE.ConeGeometry(0.5, 1, 32)", y: 0.5 },
  { kind: "toro", label: "Toro", geometry: "new THREE.TorusGeometry(0.4, 0.15, 16, 48)", y: 0.55 },
  { kind: "plano", label: "Plano", geometry: "new THREE.PlaneGeometry(2, 2)", y: 0.01, flat: true },
  { kind: "luzPontual", label: "Luz pontual", light: 'new THREE.PointLight("#ffd27a", 8)', y: 2 },
  { kind: "holofote", label: "Holofote", light: 'new THREE.SpotLight("#ffffff", 30, 0, THREE.MathUtils.degToRad(30), 0.3)', y: 4 },
  { kind: "luzDirecional", label: "Luz direcional", light: 'new THREE.DirectionalLight("#ffffff", 1)', y: 4 },
  { kind: "luzCeu", label: "Luz do céu (hemisférica)", light: 'new THREE.HemisphereLight("#87ceeb", "#3a3f4b", 0.6)', fixed: true },
];

/**
 * Trecho que cria um objeto novo, com um nome que ainda não existe no código.
 * Vai antes de animar() (e dos comentários logo acima dela), se animar() vier depois
 * da cena, ou no fim do código. Retorna { changes, name } ou { error }.
 */
export function planAddObject(analysis, kind) {
  const item = ADD_ITEMS.find((i) => i.kind === kind);
  if (!item) return { error: "Tipo de objeto desconhecido." };
  if (!analysis.ok) return { error: "Corrija o erro no código antes de adicionar objetos." };
  if (!analysis.scene || !analysis.scene.name) return { error: "Crie a cena antes: const cena = new THREE.Scene();" };

  const name = freeName(analysis, kind);
  const scene = analysis.scene.name;
  const meshes = analysis.objects.filter((o) => o.kind === "mesh" && o.context === "top").length;
  const x = [1.5, -1.5, 3, -3, 4.5, -4.5][meshes % 6];
  const lines = [];
  if (item.geometry) {
    const color = PALETTE[meshes % PALETTE.length];
    lines.push(
      `const ${name} = new THREE.Mesh(`,
      `  ${item.geometry},`,
      `  new THREE.MeshStandardMaterial({ color: "${color}", roughness: 0.5${item.flat ? ", side: THREE.DoubleSide" : ""} })`,
      `);`,
      `${name}.position.set(${x}, ${item.y}, 0);`,
    );
    if (item.flat) lines.push(`${name}.rotation.x = THREE.MathUtils.degToRad(-90);`);
    lines.push(item.flat ? `${name}.receiveShadow = true;` : `${name}.castShadow = true;`);
  } else {
    lines.push(`const ${name} = ${item.light};`);
    if (!item.fixed) lines.push(`${name}.position.set(${x}, ${item.y}, 0);`);
  }
  lines.push(`${scene}.add(${name});`);
  const snippet = lines.join("\n");

  const { code } = analysis;
  const at = beforeAnimar(analysis);
  // o trecho usa a cena: não pode vir antes da linha que a cria
  const sceneEnd = analysis.objects[analysis.scene.id].declStmt?.end ?? 0;
  if (at != null && at >= sceneEnd) return { name, changes: [{ from: at, to: at, insert: `${snippet}\n\n` }] };
  const trimmed = code.replace(/\s+$/, "");
  return { name, changes: [{ from: trimmed.length, to: code.length, insert: `${trimmed ? "\n\n" : ""}${snippet}\n` }] };
}

function freeName(analysis, base) {
  if (!analysis.topNames.has(base)) return base;
  for (let i = 2; ; i++) if (!analysis.topNames.has(`${base}${i}`)) return `${base}${i}`;
}

/** Início da linha de animar(), subindo pelos comentários colados nela. */
function beforeAnimar(analysis) {
  if (!analysis.animar) return null;
  const { code } = analysis;
  let start = lineStart(code, analysis.animar.from);
  const comments = [...analysis.comments].sort((a, b) => b.start - a.start);
  for (const c of comments) {
    if (c.end > start) continue;
    // o comentário termina na linha logo acima e começa no início da própria linha?
    const between = code.slice(c.end, start);
    if (!/^[ \t]*\n$/.test(between)) break;
    if (code.slice(lineStart(code, c.start), c.start).trim()) break;
    start = lineStart(code, c.start);
  }
  return start;
}

function lineStart(code, pos) {
  return code.lastIndexOf("\n", pos - 1) + 1;
}
