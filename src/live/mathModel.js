// mathModel.js — as matrizes de um objeto e da câmera a partir dos dados que o visor lê da
// cena. O painel "Matemática" (editor) e o visor (marcador e shader caixa de vidro) chamam
// estas mesmas funções com os mesmos dados, então mostram e desenham a mesma conta.
//
// Uma cadeia (`chain`) é a lista de elos da raiz até o objeto: cada elo tem position,
// rotation, order e scale, ou `matrix` quando o código escreveu a matriz direto
// (matrixAutoUpdate = false).

import { modelMatrix, multiply, orthographic, perspective, pipeline, product, viewMatrix } from "../lib/transform3d.js";

export const localMatrix = (link) => link.matrix ?? modelMatrix(link);

/** Matriz de mundo: as matrizes locais da raiz até o objeto, multiplicadas nessa ordem. */
export const worldMatrix = (chain) => product(...chain.map(localMatrix));

/** Matriz de mundo do pai (null se o objeto não tem pai, ou só tem uma cena parada). */
export function parentWorld(chain) {
  const ancestors = chain.slice(0, -1);
  if (!ancestors.length || ancestors.every(isIdentityLink)) return null;
  return worldMatrix(ancestors);
}

const isIdentityLink = (link) =>
  !link.matrix && link.position.every((v) => v === 0) && link.rotation.every((v) => v === 0) && link.scale.every((v) => v === 1);

/** Projeção da câmera: perspectiva ou ortográfica pelas fórmulas; outras, a do Three.js. */
export function projectionMatrix(camera) {
  if (camera.type === "perspective") return perspective(camera);
  if (camera.type === "orthographic") return orthographic(camera);
  return camera.projection;
}

export const viewOf = (camera) => viewMatrix(worldMatrix(camera.chain));

/**
 * Tudo o que o painel mostra de um objeto visto por uma câmera: M (local), a matriz de mundo
 * do pai, a de mundo, V, P e o caminho de `vertex` até o pixel.
 */
export function objectMath({ chain, camera, viewport, vertex }) {
  const local = localMatrix(chain[chain.length - 1]);
  const parent = parentWorld(chain);
  const world = parent ? multiply(parent, local) : local;
  const view = viewOf(camera);
  const projection = projectionMatrix(camera);
  const path = view && projection ? pipeline(vertex, { model: world, view, projection, width: viewport.width, height: viewport.height }) : null;
  return { local, parent, world, view, projection, path };
}
