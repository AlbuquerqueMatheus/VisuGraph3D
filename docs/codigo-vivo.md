# Modo 3D: código vivo

No modo 3D (`index-3d.html`) a cena é um programa JavaScript com Three.js, e o código é a única fonte da verdade: o que aparece no visor é exatamente o que o código diz. Tudo o que se faz pela cena (arrastar o gizmo, mexer no painel, arrastar um número) vira uma edição no próprio texto, e cada edição no texto aparece na cena.

Esta página descreve o subconjunto do Three.js que o VisuGraph entende, o que pode ser editado pela cena e o que só pode ser editado pelo código, e também a aba Matemática, os desafios, os projetos e o modo de estudo.

## A página

- **Barra** (no alto): o tema do desafio aberto, que troca de trilha sem recarregar a página, e **Explorar | Programar**, que leva ao laboratório 2D do mesmo tema. O menu do tema também volta ao **editor livre**, sem desafio. O nome VisuGraph volta à tela inicial.
- **Código** (à esquerda): editor com destaque de sintaxe, autocompletar (`Ctrl+Espaço`) e explicações ao passar o mouse sobre uma palavra (`THREE.Mesh`, `roughness`, `animar`…).
- **Visor** (no centro): a cena rodando. Clique num objeto para selecioná-lo; as linhas que o criam e alteram ficam destacadas no código. No sentido contrário, o objeto da linha onde está o cursor (ou o mouse) fica destacado no visor. Pontos e linhas não têm superfície: o clique vale a uns 6 pixels deles.
- **Painel** (à direita), em quatro abas: **Propriedades** (a lista de objetos e as propriedades do objeto selecionado), **Matemática** (as contas que põem o objeto selecionado na tela), **Desafios** e **Projetos**.
- **Barra de status** (embaixo): o resultado da última execução ou o erro, com um link para a linha.

O código roda sozinho 300 ms depois que você para de digitar. `Ctrl+Enter` (ou `Ctrl+S`) roda na hora, e **↻ Rodar** roda de novo e zera o tempo da animação. Se o código tiver um erro, a cena anterior continua no visor até o erro ser corrigido.

O código fica salvo no navegador. **Restaurar exemplo** volta ao código inicial (e `Ctrl+Z` desfaz).

## Como escrever uma cena

```js
const cena = new THREE.Scene();
cena.background = new THREE.Color("#15171c");

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(0, 0.5, 0);

const sol = new THREE.DirectionalLight("#ffffff", 2);
sol.position.set(3, 5, 2);
cena.add(sol);

const cubo = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: "#4f8cff", roughness: 0.4 })
);
cubo.position.set(0, 0.5, 0);
cena.add(cubo);

function animar(tempo) {
  cubo.rotation.y = tempo;
}
```

- **`THREE` já existe**: não é preciso importar nada.
- **A cena**: o código precisa criar uma `THREE.Scene`. Só aparece no visor o que for adicionado a ela com `cena.add(...)`.
- **Sem renderizador**: o VisuGraph cria o renderizador, desenha a cena a cada quadro e já liga as sombras. Para um objeto projetar ou receber sombra, use `castShadow` e `receiveShadow`.
- **A câmera é opcional**: o visor usa a câmera do editor (que você gira com o mouse). Se o código criar uma câmera, o botão **Câmera do código** mostra a cena por ela; a proporção (`aspect`) é ajustada ao tamanho do visor.
- **Animação**: se o código tiver `function animar(tempo, delta) { … }`, o VisuGraph chama essa função a cada quadro. `tempo` são os segundos desde o início (o relógio continua quando o código roda de novo; **↻ Rodar** zera) e `delta` são os segundos desde o quadro anterior (no máximo 0,1 s). O botão **Pausar** congela a animação. Não use `requestAnimationFrame` nem `renderer.setAnimationLoop`.
- **Nomes reservados**: `THREE`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `requestAnimationFrame` e `cancelAnimationFrame` são fornecidos pelo VisuGraph e não podem ser redeclarados.

O menu **+ Adicionar** escreve no código um objeto pronto (caixa, esfera, cilindro, cone, toro, plano e quatro tipos de luz), com um nome que ainda não existe, logo antes de `animar()`.

## O que dá para editar pela cena

Um objeto pode ser editado pela cena quando é criado no nível de cima do código (fora de funções, laços e `if`) e guardado numa variável:

```js
const cubo = new THREE.Mesh(geometria, material); // editável
cena.add(new THREE.Mesh(geometria, material));    // aparece, mas não dá para movê-lo pela cena
```

Para cada propriedade, o VisuGraph procura no código o valor que a define e troca só esse valor, mantendo o resto do texto como está.

| Propriedade | Exemplo no código | Como se edita pela cena |
| --- | --- | --- |
| Posição, rotação e escala | `cubo.position.set(0, 0.5, 0)` ou `cubo.position.x = 2` | gizmo, painel ou arrastando o número |
| Rotação | `cubo.rotation.y = THREE.MathUtils.degToRad(30)` | o painel mostra graus; o código também fica em graus com `degToRad` |
| Visível e sombras | `cubo.castShadow = true` | caixas de seleção no painel |
| Argumentos do construtor | `new THREE.BoxGeometry(1, 2, 1)`, `new THREE.PointLight("#fff", 3)` | campos de geometria, luz e câmera |
| Opções do material | `new THREE.MeshStandardMaterial({ color: "#4f8cff", roughness: 0.4 })` | campos de material |
| Atribuições depois da criação | `material.roughness = 0.8`, `luz.intensity = 2` | os mesmos campos |
| Cores | `cubo.material.color.set("#ff0000")`, `cena.background = new THREE.Color("#15171c")` | seletor de cor |

Quando a propriedade ainda não aparece no código, a edição a escreve no lugar mais natural: no argumento do construtor, no objeto de opções do material ou numa linha nova logo depois da última linha que mexe no objeto (a posição entra antes de um `lookAt`, que depende dela).

O gizmo também move objetos que não estão na cena, como a câmera do código, e grava só os eixos que o arraste mudou. Enquanto você arrasta, `animar()` espera, para a cena mudar só pelo gizmo. Com um erro que impede o código de rodar, o objeto continua selecionado, mas o gizmo some até o código ser corrigido.

**Números.** Um valor editável pode ser um número (`1.5`, `-2`) ou uma expressão feita só de números e constantes (`Math.PI / 2`, `THREE.MathUtils.degToRad(45)`); ao editar uma expressão, ela é trocada por um número. A rotação escrita em radianos à mão continua em radianos. Os números sublinhados com pontilhado mexem numa propriedade da cena: arraste-os para os lados (`Shift` acelera 10 vezes, `Alt` dá passos 10 vezes menores). Os outros números também podem ser arrastados, e o código roda de novo a cada passo, o que serve, por exemplo, para mudar quantas vezes um laço repete.

**Cores.** Aceitas como `"#rrggbb"`, `"#rgb"`, `"rgb(r, g, b)"`, nomes em inglês (`"red"`) ou números `0xrrggbb`, sozinhas ou dentro de `new THREE.Color(...)`. A edição mantém o formato (texto ou número) e as aspas.

### Classes conhecidas

- **Cena, grupos e o que se desenha**: `Scene`, `Group`, `Object3D`, `Mesh`, `InstancedMesh` (muitas cópias de uma malha), `Points` (um ponto em cada vértice), `Line`, `LineSegments` e `LineLoop`. Todos eles aparecem na lista de objetos, com a geometria e o material ligados como os de uma malha.
- **Câmeras**: `PerspectiveCamera` (campo de visão, planos próximo e distante) e `OrthographicCamera` (só posição).
- **Luzes**: `AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`.
- **Geometrias**: `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, `CylinderGeometry`, `ConeGeometry`, `TorusGeometry`, `TorusKnotGeometry`, `CapsuleGeometry`, `CircleGeometry`, `RingGeometry`, `IcosahedronGeometry`, `DodecahedronGeometry`, `OctahedronGeometry`, `TetrahedronGeometry` e `BufferGeometry`, montada à mão com `setAttribute` (sem controles, porque não tem argumentos).
- **Materiais**: `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshPhongMaterial`, `MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshToonMaterial`, `MeshNormalMaterial`, `PointsMaterial` (cor, tamanho do ponto, `sizeAttenuation`, `vertexColors`, opacidade e `depthWrite`) e `LineBasicMaterial`.

O grupo da geometria no painel diz o tamanho dela como está na cena, por exemplo "2.000 pontos · atributos position e color" ou "24 vértices · atributos position, normal e uv", e uma `InstancedMesh` diz quantas cópias desenha. Na aba Matemática, um objeto `Points` ou `Line` segue os próprios vértices até o pixel; uma `InstancedMesh` fica na origem do objeto, porque a matriz de cada cópia não entra na cadeia do painel. `BufferAttribute` e `Float32BufferAttribute` são valores, como `Vector3`: não viram objetos da lista.

Qualquer outra parte do Three.js continua funcionando normalmente: ela só não ganha controles no painel.

## O que só pode ser editado pelo código

Quando o valor de uma propriedade depende de algo que a cena não consegue reescrever com segurança, o campo fica desativado no painel com o selo **só pelo código** (o motivo aparece ao passar o mouse), e o gizmo esconde os eixos que não podem ser mexidos.

| Motivo | Exemplo |
| --- | --- |
| Vem de uma expressão | `cubo.position.x = largura / 2` |
| Muda com `+=`, `-=` ou `++` | `cubo.position.y += 1` |
| É definido por um método | `cubo.lookAt(0, 0, 0)`, `cubo.rotateY(1)`, `cubo.translateX(2)` |
| Muda dentro de uma função, laço ou `if` | `if (alto) cubo.scale.y = 2` |
| É animado em `animar()` | `cubo.rotation.y = tempo` |
| O objeto é criado dentro de um laço, função, `if` ou de `animar()` | `for (…) { cena.add(new THREE.Mesh(…)) }` |
| O objeto não está numa variável | `cena.add(new THREE.Mesh(…))` |

Na lista de objetos, um objeto criado num laço, numa função ou num `if` tem uma marca que diz onde ele nasce e aparece pela variável que o guarda ali: `for (…) { const pedestal = new THREE.Mesh(…); … }` aparece como `pedestal`, com a marca **laço**. É uma linha só do código, mesmo que ela crie vários objetos.

## A aba Matemática

Com um objeto selecionado, a aba **Matemática** mostra as contas que levam esse objeto até a tela, com os números da cena como ela está agora:

- **Matriz de modelo** `M = T · R · S`, que leva o objeto do espaço dele para o lugar na cena. **Ver T, R e S separadas** mostra os três fatores, e **R eixo por eixo** mostra a rotação como o produto das rotações em torno de x, y e z, na ordem de `rotation.order`.
- **Matriz de mundo** `Mundo = M_pai · M`, quando o objeto está dentro de outro (num `Group`, por exemplo).
- **Visão** `V = (mundo da câmera)⁻¹` e **Projeção** `P` (perspectiva ou ortográfica), da câmera que o visor está usando.
- **Do vértice ao pixel**: um vértice da geometria (◀ e ▶ trocam de vértice) passando por `M`, `V` e `P`, pela divisão por `w` e até o pixel. O visor marca esse vértice, e a última linha diz se o Three.js chega nas mesmas matrizes e no mesmo pixel.

Cada número sabe de quais literais do código ele depende: passar o mouse num número marca esses literais no editor, e passar o mouse num literal do código acende os números que dependem dele.

**Caixa de vidro.** Em **Iluminação**, os botões **Phong** e **Blinn-Phong** trocam o desenho de todas as malhas por um shader que faz só estas contas, pixel a pixel:

```
I = Ke + Σ Kd ⊙ L_ambiente + Σⱼ [ Kd ⊙ Lⱼ · max(0, n·lⱼ) + Ks ⊙ Lⱼ · max(0, rⱼ·v)ⁿ ]
```

com `r = 2(n·l)n − l` (no Blinn-Phong, `max(0, n·h)ⁿ` com `h = (l + v) / |l + v|`) e `Lⱼ = cor × intensidade ÷ π` (o Three.js divide por π para a intensidade ser física). Clicar num ponto de um objeto mostra a conta daquele pixel, luz por luz, até a cor final. As cores entram como estão no código, sem correção de gama nem tone mapping, então o pixel na tela é o número da conta; os testes de ponta a ponta conferem isso. `MeshStandardMaterial` e `MeshPhysicalMaterial` entram como um Phong aproximado, `MeshBasicMaterial` não é iluminado e as texturas ficam de fora. **Desligada** volta ao desenho do Three.js.

## Desafios

A aba **Desafios** tem 10 desafios em três trilhas. Cada desafio troca o código do editor por uma cena pronta e pede uma mudança nela.

| Trilha | Desafios | Continua o laboratório 2D |
| --- | --- | --- |
| Transformações e matrizes | translação, rotação em radianos, escala e centro, hierarquia (pai e filho), matriz de modelo | Coordenadas |
| Câmera e projeção | `lookAt`, campo de visão | |
| Luz e cor (Phong) | luz difusa (`n·l`), especular (o expoente `n`), cor canal a canal | Modelo Phong (a trilha liga a caixa de vidro) e Sistemas de cores (o desafio da cor) |

- **A correção olha a cena, não o texto.** A cada execução, o visor conta à correção como a cena está (posições de mundo, caixas, matrizes, câmera, luzes, materiais, o tipo de cada objeto, quantos vértices e quais atributos a geometria tem e quantas cópias uma `InstancedMesh` desenha), e cada verificação aparece com o que a cena tem, como "(está em (0,00; 0,50; 0,00))". Vale qualquer caminho até o resultado: o código, o gizmo ou o painel. A faixa acima do código mostra o desafio aberto e quantas verificações já passaram.
- **Contornos tracejados** mostram no visor onde um objeto tem de ficar, nos desafios em que isso ajuda. Os desafios de câmera e de luz abrem pela **Câmera do código**.
- **Dicas**: três por desafio, uma de cada vez. A última é a resposta.
- **Código e progresso**: cada desafio guarda o próprio código no navegador, e **Restaurar exemplo** volta ao código inicial dele (`Ctrl+Z` desfaz). **← Sair do desafio** volta ao código livre, que fica guardado à parte. Os desafios feitos ficam marcados, e **Próximo** segue a trilha e depois as outras.
- **Links**: `index-3d.html?trilha=matriz`, `?trilha=camera` e `?trilha=phong` abrem a trilha no desafio que estava aberto, se ele é dessa trilha e ainda não foi feito, ou no primeiro desafio ainda não feito dela. `?desafio=<id>` abre um desafio pelo nome, como `?desafio=cor`. Os laboratórios de coordenadas e de Phong do modo 2D terminam com o link da trilha, e o de Sistemas de cores com o do desafio da cor. O parâmetro sai da URL ao abrir, então recarregar a página volta ao desafio que estava aberto. `index-3d.html?livre` abre o editor livre, sem o desafio que estava aberto.
- **Rever no laboratório**: cada trilha da lista e cada desafio levam ao laboratório 2D do tema deles (o desafio da cor leva a Sistemas de cores). De lá, **Programar** na barra volta ao desafio que estava aberto. No modo de estudo esses links não aparecem, para a sessão não sair do código vivo.

## Projetos

A aba **Projetos** é um guia de projetos: cada projeto constrói uma cena completa do zero, em passos, e explica cada linha e o porquê de cada decisão. Os projetos se dividem em três níveis: **Fácil** (cena, malhas, materiais e luz), **Intermediário** (geometria feita à mão, milhares de objetos, curvas e animação) e **Avançado** (shaders). Há três projetos prontos, o **Sistema solar** e a **Vitrine de materiais** (fáceis, 9 passos cada: 8 no VisuGraph e 1 no seu computador) e o **Gerador de galáxias** (intermediário, 12 passos: 10 no VisuGraph e 2 no seu computador), e os outros aparecem na lista como "em breve".

O **Sistema solar** é sobre o grafo de cena: cada órbita é um grupo que gira, e o que está dentro dele vai junto.

| Passo | O que entra |
| --- | --- |
| 1. O palco | a cena com fundo azul-marinho e a câmera vendo o plano das órbitas de cima, a 45° |
| 2. O Sol | uma malha: `SphereGeometry` e `MeshBasicMaterial`, que não depende de luz |
| 3. A Terra | outra malha, de `MeshStandardMaterial`, que sem luz na cena fica preta |
| 4. A luz do Sol | uma `PointLight` no centro do Sol, em unidades físicas (a luz cai com o quadrado da distância), e uma `AmbientLight` fraca |
| 5. Em órbita | um `Group` no centro do Sol, com a Terra dentro, girado por `animar(tempo)` (Mundo = M_pai · M) |
| 6. A Lua | a órbita da Lua dentro da Terra: as rotações se somam |
| 7. Saturno e o anel | o eixo inclinado com `degToRad`, a `RingGeometry` deitada, `DoubleSide` e o anel filho de Saturno |
| 8. Os caminhos | `TorusGeometry` fina, um material para duas malhas, `transparent` e `opacity` |
| 9. No seu computador | o projeto Vite baixado, como no passo 11 da galáxia, com o sistema solar em `src/cena.js` |

A **Vitrine de materiais** é sobre a conta da luz: a mesma esfera três vezes, sob as mesmas luzes, com Lambert, Phong e Standard.

| Passo | O que entra |
| --- | --- |
| 1. O palco | a cena com fundo escuro e a câmera de frente, com campo de visão de 40° e longe o bastante para a vitrine caber no visor, que é mais alto que largo (o campo de visão é o vertical) |
| 2. Três esferas, sem luz | uma `SphereGeometry` para as três malhas, ainda de `MeshBasicMaterial` |
| 3. A luz e o Lambert | uma `DirectionalLight` como o sol, uma `HemisphereLight` como o céu e a esfera da esquerda de `MeshLambertMaterial`: a difusa, pelo cosseno n·l |
| 4. Phong: o brilho | a do meio de `MeshPhongMaterial`, com `specular` e `shininess`: o brilho que depende do olho (Phong e Blinn-Phong) |
| 5. Standard: aspereza e metal | a da direita de `MeshStandardMaterial`, com `roughness` e `metalness`: o desenho com base física |
| 6. O chão e os pedestais | um material para quatro malhas e um laço `for…of` que põe um pedestal debaixo de cada esfera |
| 7. A escala de aspereza | um laço `for` que cria cinco amostras, com a aspereza de 0 a 1 |
| 8. A lâmpada que passeia | uma `PointLight` com um bulbo filho, que dá voltas pelo cosseno e o seno do tempo em `animar(tempo)` |
| 9. No seu computador | o projeto Vite baixado, como nos outros projetos, com a vitrine em `src/cena.js` |

O **Gerador de galáxias** põe 50 mil estrelas num objeto só.

| Passo | O que entra |
| --- | --- |
| 1. O palco | a cena com fundo escuro e a câmera olhando para o centro |
| 2. Mil pontos | `THREE.Points`, uma `BufferGeometry` e um `Float32Array` com as posições |
| 3. Brilho de estrela | 50 mil pontos, `AdditiveBlending` e `depthWrite: false` |
| 4. Um disco | raio e ângulo sorteados (coordenadas polares) |
| 5. Braços | `i % bracos` reparte os pontos entre os braços |
| 6. A espiral | o ângulo cresce com o raio (espiral de Arquimedes) |
| 7. Dispersão | a distribuição normal (Box–Muller) dá espessura aos braços |
| 8. Cores | `lerpColors` do núcleo à borda e `vertexColors` |
| 9. Movimento | `animar(tempo)` gira a galáxia |
| 10. Céu estrelado | 2.000 estrelas à mesma distância, em direções sorteadas por igual, com o tamanho em pixels |
| 11. No seu computador | o projeto Vite baixado, com Node.js e npm: `package.json`, `vite.config.js`, `index.html`, `src/cena.js` e o `src/main.js` com o renderer, o tamanho da janela, os `OrbitControls` e o laço de quadros |
| 12. Um painel de controle | `npm install lil-gui`, a galáxia numa função que gera de novo, `dispose()` e um painel com `onFinishChange` |

Cada passo tem:

- **O código**: o que muda no editor, com as linhas que entram (+) e saem (−) e duas linhas iguais em volta. **Usar o código deste passo** troca o editor pelo código do fim do passo, e **Voltar ao começo do passo** pelo do começo (`Ctrl+Z` desfaz os dois). Uma nota diz o que o editor tem: o começo do passo, o fim dele, o fim de outro passo ou um código próprio.
- **Linha por linha**: cada trecho novo com a explicação. Passar o mouse num trecho marca onde ele está no editor, e clicar leva até lá.
- **Por que assim**: as decisões do passo, como "por que um objeto com mil pontos, e não mil objetos?".
- **Experimente**: mudanças para fazer e ver o que acontece.
- **Confira na cena**: como nos desafios, a conferência olha a cena que está rodando, não o texto, então qualquer código que chegue ao resultado vale. De uma nuvem de pontos o visor manda uma amostra de até 1.024 pontos, com as cores deles, espalhados pela razão áurea para não caírem sempre no mesmo braço. Na amostra, a conferência mede a altura e o contorno do disco, os braços e a curvatura da espiral (desenrolando os ângulos pela espiral e procurando o número de braços que mais se repete), a espessura e as cores do centro e da borda. No Sistema solar, ela mede as esferas pela amostra de vértices (todos à mesma distância do centro, em muitas direções, o que um cubo não passa), as distâncias no mundo, o pai de cada objeto na árvore, a luz que chega à Terra pela mesma conta do Three.js (a intensidade vezes o quanto ela enfraquece com a distância, com `decay` e `distance`), a inclinação do eixo de Saturno, se o anel fica no plano do equador e se cada caminho é um círculo deitado com o raio da órbita. Na Vitrine, ela confere o tipo e os números de cada material (`specular`, `shininess`, `roughness`, `metalness`), se as três esferas usam a mesma geometria, se o chão está deitado com a frente para cima e se a câmera fica longe o bastante para a vitrine caber no visor com o campo de visão dela, e conta os pedestais e as amostras que os laços criam: os objetos que uma mesma linha cria num laço vão nos fatos como cópias do primeiro (até 32 ao todo), e a conferência os acha pela variável do laço. Ela também olha o fundo da cena e o que `animar()` muda.

A faixa acima do código mostra o projeto, o passo e quantas conferências já passaram. Os passos feitos ficam marcados na fila de passos do alto do painel, e o quadro de "feito" leva ao próximo.

- **Código e progresso**: cada projeto guarda o próprio código no navegador, separado do editor livre e dos desafios. Abrir um passo adiante leva o editor ao começo dele quando o código é o de um passo anterior do guia; voltar a um passo anterior mantém o código e avisa que o editor está adiantado. Os passos feitos e o passo aberto ficam guardados, e recarregar a página volta ao passo aberto. **← Todos os projetos** volta à lista e ao editor livre, e abrir o projeto de novo retoma o primeiro passo ainda não feito.
- **Links**: `index-3d.html?projeto=sistema-solar` (ou `?projeto=vitrine`, `?projeto=galaxia`) abre o projeto no passo aberto da última vez ou no primeiro ainda não feito, e `?projeto=galaxia&passo=4` (ou `&passo=disco`) abre um passo pelo número ou pelo nome. O parâmetro sai da URL ao abrir, como nos desafios. A seção **Projetos** da tela inicial mostra os projetos prontos, quantos passos já foram feitos em cada um e os níveis.

Os últimos passos são **no seu computador** (a bolinha deles na fila é tracejada): o projeto sai do VisuGraph e roda com Node.js. Eles não mudam o código do editor, que continua no visor com a cena do último passo no VisuGraph, e não conferem a cena. O passo que baixa o projeto é o mesmo em todos (`src/live/projects/computador.js`): só mudam o nome do projeto e alguns trechos dos textos. No lugar do código e da conferência, cada um tem:

- **No seu computador**: os passos no terminal, com os comandos (e um botão de copiar), o link para o capítulo [Seu computador](../computador.html) e o botão de baixar. **Baixar sistema-solar.zip** e **Baixar vitrine.zip** (passo 9) e **Baixar galaxia.zip** (passo 11) montam o projeto Vite com o código que está no editor, a cena de quem fez o projeto; no passo 12 da galáxia, **Baixar galaxia-painel.zip** traz o projeto pronto do passo, com o lil-gui, para comparar.
- **Arquivo por arquivo**: cada arquivo do projeto, inteiro ou só o que muda nele (no passo 12, a diferença do `src/cena.js` ignora o recuo das linhas que entram na função), com as linhas explicadas embaixo. Passar o mouse numa explicação acende as linhas no arquivo.
- **Confira no seu computador**: o que deve acontecer lá, e o botão **Funcionou no meu computador**, que marca o passo como feito. Um link leva aos problemas comuns do capítulo.

O capítulo **Seu computador** (`computador.html`) ensina a instalar o Node.js em cada sistema, usar o terminal e o VS Code, rodar um projeto baixado, começar um do zero com `npm create vite` e resolver os problemas mais comuns (o PowerShell que bloqueia o npm, a página em branco aberta com dois cliques, a porta ocupada). A tela inicial liga para ele na seção Projetos.

## Modo de estudo

Para comparar o código vivo com um editor comum numa pesquisa, a página tem dois grupos, escolhidos pela URL:

- `index-3d.html?estudo=experimental`: tudo ligado, como no uso normal.
- `index-3d.html?estudo=controle`: o mesmo app, e o código continua rodando a cada mudança, mas sem a ligação entre a cena e o código. Não há gizmo nem **+ Adicionar**, o painel de propriedades só mostra os valores, os números do código não se arrastam e nada se acende entre o código, o visor e a aba Matemática. A aba Matemática, a caixa de vidro e os desafios são os mesmos.

Os parâmetros se combinam: `index-3d.html?estudo=controle&trilha=matriz` abre o grupo controle já no primeiro desafio da trilha.

No modo de estudo, a barra do alto fica só com o nome, sem os temas e sem a volta à tela inicial, para a sessão registrada não sair do código vivo, e uma faixa logo abaixo mostra o grupo e o **código da sessão** (como `K7QM-2XPA`), que liga o registro ao questionário do aluno sem identificar ninguém. **Exportar registro** baixa `visugraph-estudo-<código>.json`. **Nova sessão**, para o próximo aluno no mesmo computador, começa um registro com outro código, apaga o progresso e o código guardados e recarrega a página, que volta como recém-aberta: sem desafio aberto, pela câmera do editor e sem a caixa de vidro. Exporte antes: o registro anterior sai do navegador. A primeira sessão num navegador também começa sem o progresso e o código de quem usou o VisuGraph nele antes. A aba **Projetos** não aparece no modo de estudo (e `?projeto=` é ignorado), para todas as sessões terem as mesmas tarefas.

O registro fica no navegador (`localStorage`) até ser exportado. Ele guarda só o tipo de cada evento, alguns detalhes e o tempo `t` em milissegundos desde o início da sessão: nunca o código, nomes ou dados pessoais. Eventos em rajada (digitar, passar o mouse na aba Matemática, erros seguidos) viram um só, com a contagem em `n` e o tempo do último em `ate`.

```json
{
 "formato": "visugraph-estudo/1",
 "sessao": "K7QM-2XPA",
 "grupo": "controle",
 "inicio": "2026-10-20T13:00:00.000Z",
 "eventos": [
  { "t": 0, "evento": "inicio" },
  { "t": 1840, "evento": "execucao", "ok": true, "objetos": 3, "animar": false },
  { "t": 52310, "evento": "desafio.concluir", "id": "posicao", "segundos": 48.2, "dicas": 1 }
 ],
 "exportado": "2026-10-20T14:35:00.000Z"
}
```

| Evento | Quando | Detalhes |
| --- | --- | --- |
| `inicio` | a sessão começa | |
| `execucao` | o código rodou | `ok`, `objetos`, `animar` |
| `erro` | o código não rodou | `origem` (`execucao`, `sintaxe`, `subconjunto`), `fase`, `tipo`, `laco` |
| `digitacao` | o aluno digitou no editor | `n`, `ate` |
| `rodar` | rodou na mão, pelo botão ou pelo atalho | `atalho` |
| `arraste_numero` | arrastou um número no código | `chave` |
| `gizmo`, `painel` | mudou a cena pelo gizmo ou pelo painel | `prop`, `chave` |
| `selecao` | selecionou um objeto | `origem` (`visor` ou `lista`), `tipo` |
| `aba`, `vista`, `animar` | trocou de aba ou de câmera, pausou ou tocou a animação | `aba`, `vista`, `tocando` |
| `vidro`, `sonda` | ligou a caixa de vidro, mediu um pixel | `modelo`, `suportado`, `material` |
| `math.hover`, `math.factors`, `math.vertex` | usou a aba Matemática | `keys`, `on`, `index` |
| `desafio.abrir` | abriu um desafio | `id`, `origem` (`trilha`, `endereco` para `?desafio=`, `lista`, `proximo`, `retomar`) |
| `desafio.dica` | pediu uma dica | `id`, `n` |
| `desafio.conferir` | o resultado da correção mudou | `id`, `ok`, `passou`, `total` |
| `desafio.concluir` | fez o desafio pela primeira vez | `id`, `segundos`, `dicas` |
| `desafio.sair` | saiu de um desafio | `id`, `feito` |
| `adicionar`, `restaurar`, `copiar`, `baixar` | usou esses botões | `tipo`, `desafio` |
| `visibilidade` | a aba do navegador ficou visível ou escondida | `visivel` |

### Resumo do estudo

A página `estudo.html` junta os registros exportados e a planilha dos testes e questionários numa linha por código de sessão, pronta para o JASP, o R ou a própria planilha. Os arquivos são lidos no navegador, e nada é enviado.

- **Registros de uso**: todos os `visugraph-estudo-*.json` de uma vez. A página avisa quando um arquivo não é um registro, quando o começo de um registro se perdeu (ele guarda no máximo 5000 eventos) e quando o mesmo código aparece em dois arquivos (fica o exportado por último).
- **Planilha**, opcional: um CSV com vírgula, ou com ponto e vírgula e vírgula decimal, como o Excel em português salva. A coluna `codigo` liga cada linha ao registro, e maiúsculas, espaços e o hífen não importam. Com as notas de cada questão (`pre_1` a `pre_10` e `pos_1` a `pos_10`, de 0 a 10), as respostas do SUS (`sus_1` a `sus_10`, de 1 a 5) e as seis escalas do TLX (`tlx_mental`, `tlx_fisica`, `tlx_temporal`, `tlx_desempenho`, `tlx_esforco` e `tlx_frustracao`, de 0 a 100), a página calcula o pré e o pós (de 0 a 100), o ganho normalizado `g = (pós − pré) / (100 − pré)`, o SUS (de 0 a 100) e o TLX bruto, a média das seis escalas. Uma planilha só com os totais `pre`, `pos`, `sus` e `tlx` também serve, e `ordem` (AB ou BA) diz qual versão do teste veio antes. Respostas que faltam ou fogem da escala, códigos que estão só na planilha ou só nos registros e grupos que não batem (vale o do registro) aparecem nos avisos.
- A página mostra a média, o desvio padrão e o número de participantes de cada medida por grupo, e as colunas principais de cada sessão. **Baixar CSV** traz todas as colunas, com vírgula e ponto decimal; **Baixar CSV para o Excel** usa ponto e vírgula e vírgula decimal.

| Coluna | O que é |
| --- | --- |
| `codigo`, `grupo` | o código da sessão e o grupo do registro |
| `ordem`, `pre`, `pos`, `g`, `sus`, `tlx` | da planilha, quando houver |
| `minutos` | a duração da sessão, até o último evento |
| `desafios`, `dicas` | os desafios feitos e a soma das dicas abertas antes de concluir cada um |
| `tempo_<desafio>` | os segundos com o desafio aberto e a página à vista, somados até concluir (vazio se não fez) |
| `dicas_<desafio>` | a dica mais adiantada aberta antes de concluir, de 0 a 3 |
| `execucoes`, `erros`, `digitacao` | quantas vezes o código rodou e deu erro, e quanto o aluno digitou (as rajadas contam pelo `n`) |
| `selecao`, `gizmo`, `painel`, `arraste_numero`, `adicionar` | quantas vezes o aluno selecionou um objeto e mudou a cena por cada caminho |
| `aba_math`, `math_hover`, `vidro`, `sonda` | o uso da aba Matemática e da caixa de vidro |
| `saidas` | quantas vezes a aba do navegador ficou escondida |
| `eventos`, `inicio`, `exportado` | para conferir o arquivo |

## Avisos no editor

O editor marca na própria linha o que foge do subconjunto:

- **Erros** (o código não roda): erro de sintaxe e redeclaração de um nome reservado.
- **Avisos**: nenhuma `THREE.Scene` criada, um objeto com nome que nunca é adicionado à cena (falta `cena.add(nome)`), um `WebGLRenderer` (desnecessário: o VisuGraph já desenha a cena) e objetos criados dentro de `animar()`, que criaria um objeto novo a cada quadro.
- **Dicas**: objetos criados dentro de laços, funções ou `if`, objetos sem variável e o uso de `requestAnimationFrame` ou `setAnimationLoop` no lugar de `animar()`.

## Erros ao rodar

- As mensagens de erro do navegador são traduzidas para o português e apontam a linha (**ir para o código**).
- **Laço infinito**: um laço que passa de 2 s sem terminar é interrompido (1 s dentro de `animar()`, de um temporizador ou de um evento), com o erro na linha do laço. O erro aparece mesmo que o código o engula com `try/catch`, e os laços que estão em volta param junto. Num temporizador ou evento, os temporizadores e eventos do código param até ele rodar de novo, senão cada chamada travaria a página por 1 s.
- **Código que trava fora de um laço** (uma recursão enorme, uma única operação muito lenta): o editor e o visor rodam na mesma thread, então a página fica parada até o código terminar. Se uma execução não responde em 3 s, o visor é reiniciado e volta a mostrar a última cena que funcionou. Se a página inteira travar e for recarregada, o código não roda sozinho: corrija e clique em **↻ Rodar**.
- **Erro dentro de `animar()`**: a animação para e a cena fica como estava; ao corrigir o código, ela volta.
- Temporizadores (`setTimeout`, `setInterval`, `requestAnimationFrame`, também pelo `window`) e eventos (`addEventListener`) criados pelo código são cancelados a cada nova execução, então rodar de novo nunca acumula animações antigas.
- **`WebGLRenderer` no código**: cada um ocupa um dos poucos contextos WebGL que o navegador dá à página. Os renderizadores do código são liberados a cada execução, e só os 4 mais novos ficam ativos (um renderizador criado a cada quadro em `animar()` esgotaria os contextos). Se mesmo assim o visor perder o WebGL, ele é reiniciado e o código só roda de novo com **↻ Rodar**.
- Valores globais do Three que o código pode mudar, como `THREE.Object3D.DEFAULT_UP`, `THREE.ColorManagement.enabled` e `THREE.Cache.enabled`, voltam ao padrão a cada execução: apagar a linha desfaz o efeito.

## O visor isolado

O código roda num `iframe` (`viewport.html`) separado do editor. Assim, um erro ou um laço infinito não derruba o editor, e reiniciar o visor limpa tudo o que o código criou. Esse isolamento serve para estabilidade, não para segurança: o visor tem a mesma origem da página e roda na mesma thread, então rode só código em que você confia. Janelas como `alert()`, `confirm()` e `prompt()` são bloqueadas.

## Atalhos

| Onde | Atalho | Ação |
| --- | --- | --- |
| Código | `Ctrl+Enter` ou `Ctrl+S` | roda o código agora |
| Código | `Ctrl+Z` / `Ctrl+Shift+Z` | desfaz e refaz, inclusive o que foi feito pela cena |
| Código | `Ctrl+Espaço` | autocompletar |
| Código | arrastar um número | muda o valor (`Shift` ×10, `Alt` ×0,1) |
| Visor | clique | seleciona um objeto |
| Visor | arrastar / roda do mouse / botão direito | gira, aproxima e desloca a vista |
| Visor | `W`, `E`, `R` | gizmo de mover, girar e escalar |
| Visor | `F` | centraliza a vista no objeto selecionado |
| Visor | `Esc` | tira a seleção |

O gizmo anda em passos de 0,1 (mover e escalar) e de 5° (girar).

## Exportar

**Copiar código** copia o texto do editor. O menu **Baixar** tem duas saídas, com o nome do projeto quando um projeto está aberto (`galaxia.html`, `galaxia.zip`):

- **Página HTML** gera `cena-visugraph.html`, uma página que roda a cena sozinha, com o código exatamente como está no editor e a mesma função `animar()`. Ela carrega o Three.js 0.186.1 do jsDelivr, então precisa de internet para abrir.
- **Projeto Vite (.zip)** gera `cena-visugraph.zip`, um projeto para rodar com Node.js: `npm install` e `npm run dev` na pasta. O código do editor vai para `src/cena.js`, com `import * as THREE from "three"` no começo e o `export` da cena, da câmera e de `animar` no fim; o `src/main.js` faz o que o visor fazia (o renderer, o tamanho da janela, os `OrbitControls` e o laço que chama `animar(tempo, delta)`) e se ajusta ao código: cria uma câmera se não houver, liga as sombras se houver `castShadow`, usa o fundo do visor se a cena não tiver um e centra os controles no último `camera.lookAt(x, y, z)`. O `package.json` pede o three.js e o Vite nas versões deste site, e o `README.md` explica como rodar e publicar. O .zip não tem uma pasta por fora, para o "Extrair Tudo" do Windows não criar uma pasta dentro de outra.

## Para quem mexe no VisuGraph

```
src/live/engine/   motor sem DOM, com testes: análise do código (Acorn), mapa objeto↔código,
                   planos de edição (patches), instrumentação e trechos prontos
src/live/editor/   editor CodeMirror 6: destaque das linhas, números arrastáveis, explicações
src/live/runtime/  o visor (roda dentro do iframe): execução, gizmo, seleção, proteção contra laços,
                   o shader caixa de vidro (glass.js) e os fatos da cena para a correção (facts.js)
src/live/app.js    liga editor, visor (bridge.js, via postMessage) e as abas do painel: Propriedades
                   (inspector.js), Matemática (mathPanel.js, com as contas de mathModel.js),
                   Desafios (challengesPanel.js, com os desafios e a correção de challenges.js) e
                   Projetos (projectPanel.js)
src/live/projects/ o guia de projetos: os níveis, os projetos e a diferença entre passos (index.js),
                   cada projeto com os seus passos (sistemaSolar.js, vitrine.js, galaxia.js), o
                   código dos passos montado linha a linha (source.js), o passo no seu computador,
                   comum a todos (computador.js), e as medidas da cena que as conferências usam,
                   como o raio de uma esfera e os braços de uma galáxia (checks.js)
src/live/export.js a cena fora do VisuGraph: a página HTML e os arquivos do projeto Vite, que os
                   passos no computador também mostram; src/lib/zip.js monta o .zip
src/live/study.js  o modo de estudo e o registro de uso; studySummary.js e studyPage.js, o resumo
                   do estudo (estudo.html)
src/lib/           as contas 3D da aba Matemática e da caixa de vidro (transform3d.js e phong3d.js)
```

A cada mudança no texto, `analyze()` lê o código e gera um id para cada `new THREE.X(...)`, com os trechos que o criam e alteram e, para cada propriedade, o literal que a define ou o motivo de não ser editável. `instrument()` acrescenta ao código, sem mudar as linhas, o registro de cada objeto criado e a verificação de tempo em cada laço. Uma edição pela cena vira `planEdit()` ou `planTransform()`, que devolvem as trocas de texto aplicadas no editor como uma transação comum (por isso `Ctrl+Z` desfaz). Durante um arraste, o visor muda a propriedade direto e o código é atualizado sem rodar; ao soltar, o código roda uma vez para confirmar que a cena é o que ele diz.

Os testes do motor ficam em `tests/unit/live-*.test.js` (o de instrumentação roda o código instrumentado com o Three.js de verdade no Node, o dos desafios resolve cada um com a cena de verdade, e o dos projetos confere que o código de cada passo passa nas conferências dele e que o código de antes não passa, que os erros mais comuns são avisados (a Terra fora do grupo, o anel em pé, a luz fraca de código antigo, o chão de costas, o `specular` padrão do Phong), que o projeto baixado tem os arquivos que os passos no computador explicam e que o `cena.js` do painel gera uma galáxia nova liberando a antiga), e os da página em `tests/e2e/modo-3d.spec.js`, `matematica.spec.js` (as contas do painel contra o Three.js e contra os pixels da tela), `desafios.spec.js`, `projetos.spec.js`, `estudo.spec.js` e `resumo-estudo.spec.js`.
