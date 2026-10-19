// errors.js — erros de execução do JavaScript explicados em português.

const RULES = [
  [/^(\S+) is not defined$/, (m) => `'${m[1]}' não existe: confira se o nome está escrito igual onde ele foi criado.`],
  [/^Cannot access '(.+)' before initialization$/, (m) => `'${m[1]}' foi usado antes da linha que o cria.`],
  [/^Assignment to constant variable\.?$/, () => "Uma const não pode receber outro valor: use let se ela precisa mudar."],
  [
    /^Cannot read propert(?:y|ies) of (undefined|null) \(reading '(.+)'\)$/,
    (m) => `Tentou ler '${m[2]}' de algo que é ${m[1]}: o objeto antes do ponto não existe.`,
  ],
  [
    /^Cannot set propert(?:y|ies) of (undefined|null) \(setting '(.+)'\)$/,
    (m) => `Tentou mudar '${m[2]}' de algo que é ${m[1]}: o objeto antes do ponto não existe.`,
  ],
  [/^(.+) is not a constructor$/, (m) => `${m[1]} não é uma classe que dá para usar com new: confira o nome.`],
  [/^(.+) is not a function/, (m) => `${m[1]} não é uma função: confira o nome ou se faltou criar o objeto.`],
  [/^(.+) is not iterable/, (m) => `${m[1]} não é uma lista: não dá para percorrer com for…of.`],
  [/^Maximum call stack size exceeded$/, () => "Uma função chama a si mesma sem parar (recursão infinita)."],
  [/^too much recursion$/, () => "Uma função chama a si mesma sem parar (recursão infinita)."],
  [/^Invalid array length$/, () => "Tamanho de lista inválido (negativo ou grande demais)."],
  [/^Identifier '(.+)' has already been declared$/, (m) => `O nome '${m[1]}' já foi declarado antes.`],
];

/** Mensagem em português para um erro do código do aluno. */
export function translateError(name, message) {
  const text = String(message || "").trim();
  if (name === "LoopLimitError") return text;
  for (const [re, fn] of RULES) {
    const m = re.exec(text);
    if (m) return fn(m);
  }
  return text ? `${name || "Erro"}: ${text}` : name || "Erro";
}
