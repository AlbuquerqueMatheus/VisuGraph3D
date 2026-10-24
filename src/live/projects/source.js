// source.js — como um projeto escreve o código dos passos. Cada linha diz a partir de qual passo
// aparece (`from`) ou como muda de um passo para outro (`by`), e codeAt monta o código do fim de um
// passo. Assim o código do passo 6 é o do passo 5 com as mudanças do 6, e a aba Projetos mostra só
// a diferença.

/** Linhas que existem a partir do passo n. */
export const from = (n, ...lines) => ({ from: n, lines });

/** Uma linha que muda: { passo: texto }, valendo o texto do último passo até aqui. */
export const by = (versions) => ({ by: versions });

/** O código depois do passo n (0 é o código de partida, antes do passo 1). */
export function codeAt(source, n) {
  const out = [];
  for (const part of source) {
    if (part.lines) {
      if (n >= part.from) out.push(...part.lines);
      continue;
    }
    const steps = Object.keys(part.by).map(Number).filter((k) => k <= n);
    if (steps.length) out.push(part.by[Math.max(...steps)]);
  }
  return out.join("\n") + "\n";
}
