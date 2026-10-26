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
  [/^Nenhuma cena foi criada: .+$/, (m) => m[0]], // o próprio visor avisa, já em português
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

// ---------------------------------------------------------------------------
// Erros de compilação do GLSL, nos shaders de um ShaderMaterial

/** Funções que o GLSL já traz: um erro nelas é de argumentos, e não de ordem no código. */
const GLSL_FUNCTIONS = new Set(
  ("abs acos asin atan ceil clamp cos cross degrees distance dot exp exp2 faceforward floor fract inversesqrt length log log2 " +
    "max min mix mod normalize pow radians reflect refract round sign sin smoothstep sqrt step tan texture texture2D transpose " +
    "inverse determinant vec2 vec3 vec4 mat2 mat3 mat4 float int bool").split(" "),
);

/**
 * O nome de um tipo como o WebGL escreve nas mensagens ("uniform highp 3-component vector of float")
 * e como ele aparece no código (vec3).
 */
function glslType(text) {
  let m;
  if ((m = /(\d)X(\d) matrix of float/.exec(text))) return m[1] === m[2] ? `mat${m[1]}` : `mat${m[1]}x${m[2]}`;
  if ((m = /(\d)-component vector of (float|int|uint|bool)/.exec(text))) return `${{ float: "", int: "i", uint: "u", bool: "b" }[m[2]]}vec${m[1]}`;
  if ((m = /\b(float|int|uint|bool|sampler2D|samplerCube|void)\b/.exec(text))) return m[1];
  return text.trim();
}

const size = (type) => Number(/^vec(\d)$/.exec(type)?.[1] ?? 0);

function converted(from, to) {
  if (from === "int" && to === "float") return "No GLSL, um número inteiro não vira float sozinho: escreva 1.0 em vez de 1.";
  if (size(from) && size(to)) {
    return `Um ${from} não cabe num ${to}: ${size(from) > size(to) ? "pegue só os primeiros números, com .xyz ou .xy" : "complete os que faltam, como em vec4(cor, 1.0)"}.`;
  }
  return `Um ${from} não vira ${to}: os dois lados do = precisam ser do mesmo tipo.`;
}

function operands(op, left, right) {
  if ([left, right].sort().join() === "float,int") return `No GLSL, não dá para fazer ${left} ${op} ${right}: escreva os números inteiros com .0 (2.0, e não 2).`;
  if (left === "mat4" && right === "vec3") return `Não dá para fazer mat4 ${op} vec3: a matriz 4 × 4 precisa de um vec4, como vec4(position, 1.0).`;
  return `Não dá para fazer ${left} ${op} ${right}: os dois lados precisam combinar, como vec3 com vec3 ou vec3 com float.`;
}

const SHADER_RULES = [
  [
    /^'color' : undeclared identifier/,
    () => "'color' é o atributo com a cor de cada vértice: o three.js só o declara no shader de vértices, e só com vertexColors: true no material.",
  ],
  [
    /^'(\w+)' : undeclared identifier/,
    (m) => `'${m[1]}' não existe: confira se o nome está escrito igual onde foi declarado. No GLSL, cada uniform e cada varying também precisa ser declarado no shader que o usa, antes do main.`,
  ],
  [
    /^'(.*)' : syntax error/,
    (m) => (m[1] ? `Erro de sintaxe perto de '${m[1]}': confira os parênteses, as vírgulas e o ; no fim da linha.` : "Erro de sintaxe no fim do shader: confira se cada { tem o seu }."),
  ],
  [/^'.*' : cannot convert from '(.+)' to '(.+)'/, (m) => converted(glslType(m[1]), glslType(m[2]))],
  [
    /no operation '(.+?)' exists that takes a left-hand operand of type '(.+?)' and a right operand of type '(.+?)'/,
    (m) => operands(m[1], glslType(m[2]), glslType(m[3])),
  ],
  [
    /^'(\w+)' : no matching overloaded function found/,
    (m) =>
      GLSL_FUNCTIONS.has(m[1])
        ? `${m[1]}() não aceita esses argumentos: confira o tipo de cada um e escreva os números inteiros com .0 (pow(x, 2.0), e não pow(x, 2)).`
        : `A função '${m[1]}' não existe com esses argumentos: ela precisa vir antes de quem a chama, e cada argumento, ter o tipo que ela pede.`,
  ],
  [/^'(\w+)' : redefinition/, (m) => `'${m[1]}' já foi declarado antes neste shader. Para mudar o valor, tire o tipo da frente: ${m[1]} = …;`],
  [/not enough data provided for construction/, () => "Faltam números para montar o vetor: um vec3 leva três, e um vec4, quatro (ou um só, que vale para todos)."],
  [/^'constructor' : too many arguments/, () => "Números demais para montar o vetor: um vec3 leva três, e um vec4, quatro."],
  [/can't modify a uniform "(\w+)"/, (m) => `'${m[1]}' é um uniform: o shader só lê o valor que vem do JavaScript. Para fazer contas com ele, guarde numa variável nova.`],
  [/can't modify an input "(\w+)"/, (m) => `'${m[1]}' chega do shader de vértices e aqui só pode ser lido. Para fazer contas com ele, guarde numa variável nova.`],
  [/^Missing main\(\)/, () => "Falta a função main(): é por ela que a placa de vídeo começa o shader."],
  [/^'(\w+)' : function does not return a value/, (m) => `A função '${m[1]}' não devolve nada: falta o return.`],
  [/function return is not matching type/, () => "O return devolve um tipo diferente do que a função promete: uma função float precisa devolver um float."],
  [/^'(\w+)' : vector field selection out of range/, (m) => `O vetor não tem o componente '${m[1]}': um vec2 tem x e y, e um vec3, x, y e z.`],
  [/boolean expression expected/, () => "O if precisa de uma comparação, como n.y > 0.0, e não de um número."],
  [/mismatching ternary operator operand types/, () => "Os dois lados do ? : precisam ser do mesmo tipo: 1.0 : 0.0, e não 1.0 : 0."],
  [/^'(\w+)' : Illegal use of reserved word/, (m) => `'${m[1]}' é uma palavra reservada do GLSL: escolha outro nome.`],
  [
    /^FRAGMENT varying (\w+) does not match any VERTEX varying/,
    (m) => `O shader de fragmentos recebe '${m[1]}', mas o de vértices não manda nenhum varying com esse nome: os dois precisam declarar o mesmo varying, com o mesmo nome e o mesmo tipo.`,
  ],
  [/^Types of varying '(\w+)' differ/, (m) => `O varying '${m[1]}' tem um tipo em cada shader: os dois precisam declará-lo igual.`],
];

/**
 * Uma mensagem de erro do compilador de GLSL (sem o "ERROR: 0:12:" da frente) em português. O
 * three.js troca o gl_FragColor do código por pc_fragColor antes de compilar: a mensagem volta a
 * dizer o nome que está no código.
 */
export function translateShaderError(message) {
  const text = String(message || "").trim().replace(/pc_fragColor/g, "gl_FragColor");
  for (const [re, fn] of SHADER_RULES) {
    const m = re.exec(text);
    if (m) return fn(m);
  }
  return text || "O shader não compilou.";
}

/** A linha sem o comentário // do fim, sem os espaços das pontas. */
const codeOf = (line) => line.replace(/\/\/.*$/, "").trim();

/**
 * O erro de um shader como o editor mostra: a linha dele no texto do shader (1 é a primeira) e o
 * que dizer. Um ; esquecido só aparece na linha seguinte, onde o compilador encontra o que não
 * esperava: quando a linha do erro começa justamente pelo que ele não esperava e a de cima não
 * termina com ;, {, }, uma vírgula ou um parêntese aberto, o erro vai para a de cima.
 */
export function shaderError(message, source, line) {
  const syntax = /^'(.+)' : syntax error/.exec(String(message || "").trim().replace(/pc_fragColor/g, "gl_FragColor"));
  if (syntax && source && line > 1) {
    const lines = source.split("\n");
    let k = line - 2;
    while (k >= 0 && !codeOf(lines[k])) k--;
    const above = k >= 0 ? codeOf(lines[k]) : "";
    if (codeOf(lines[line - 1] ?? "").startsWith(syntax[1]) && above && !/[;{},(]$/.test(above) && !above.startsWith("#")) {
      return { line: k + 1, text: "Falta um ; no fim desta linha: o compilador só percebe na linha de baixo, onde encontra o que não esperava." };
    }
  }
  return { line, text: translateShaderError(message) };
}
