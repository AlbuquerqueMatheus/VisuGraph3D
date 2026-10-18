// transform2d.js — álgebra das transformações 2D em coordenadas homogêneas.
// Convenção matemática: origem no centro, eixo y para cima e ângulos positivos
// no sentido anti-horário. Um ponto P = (x, y, 1) vira P' = M · P.

export function identity() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function translation(tx, ty) {
  return [
    [1, 0, tx],
    [0, 1, ty],
    [0, 0, 1],
  ];
}

export function rotation(degrees) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

export function scaling(sx, sy) {
  return [
    [sx, 0, 0],
    [0, sy, 0],
    [0, 0, 1],
  ];
}

export function multiply(a, b) {
  const r = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j];
  return r;
}

/** Aplica M a um ponto (x, y) e devolve [x', y']. */
export function apply(m, [x, y]) {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2],
    m[1][0] * x + m[1][1] * y + m[1][2],
  ];
}

/** Inversa de uma matriz afim 3×3 (última linha 0 0 1); null se for singular. */
export function invert(m) {
  const [[a, b, tx], [c, d, ty]] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [
    [ia, ib, -(ia * tx + ib * ty)],
    [ic, id, -(ic * tx + id * ty)],
    [0, 0, 1],
  ];
}

/**
 * Monta M a partir dos parâmetros da interface.
 * `order` lê da esquerda para a direita como no produto: "TRS" → M = T · R · S,
 * ou seja, o ponto sofre primeiro S, depois R e por último T.
 * Transformações desligadas entram como identidade.
 */
export function compose({
  order = "TRS",
  translate = { enabled: false, tx: 0, ty: 0 },
  rotate = { enabled: false, degrees: 0 },
  scale = { enabled: false, sx: 1, sy: 1 },
} = {}) {
  const parts = {
    T: translate.enabled ? translation(translate.tx, translate.ty) : identity(),
    R: rotate.enabled ? rotation(rotate.degrees) : identity(),
    S: scale.enabled ? scaling(scale.sx, scale.sy) : identity(),
  };
  if (!/^(?=.*T)(?=.*R)(?=.*S)[TRS]{3}$/.test(order)) {
    throw new Error(`Ordem inválida: ${order}`);
  }
  return multiply(multiply(parts[order[0]], parts[order[1]]), parts[order[2]]);
}

/** Formata um número para exibição, sem "-0.00" causado por erro de arredondamento. */
export function formatNumber(value, digits = 2) {
  const limit = 0.5 * 10 ** -digits;
  return (Math.abs(value) < limit ? 0 : value).toFixed(digits);
}
