# Modo 3D: código vivo

No modo 3D (`index-3d.html`) a cena é um programa JavaScript com Three.js, e o código é a única fonte da verdade: o que aparece no visor é exatamente o que o código diz. Tudo o que se faz pela cena (arrastar o gizmo, mexer no painel, arrastar um número) vira uma edição no próprio texto, e cada edição no texto aparece na cena.

Esta página descreve o subconjunto do Three.js que o VisuGraph entende, o que pode ser editado pela cena e o que só pode ser editado pelo código.

## A página

- **Código** (à esquerda): editor com destaque de sintaxe, autocompletar (`Ctrl+Espaço`) e explicações ao passar o mouse sobre uma palavra (`THREE.Mesh`, `roughness`, `animar`…).
- **Visor** (no centro): a cena rodando. Clique num objeto para selecioná-lo; as linhas que o criam e alteram ficam destacadas no código. No sentido contrário, o objeto da linha onde está o cursor (ou o mouse) fica destacado no visor.
- **Painel** (à direita): a lista de objetos e as propriedades do objeto selecionado.
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

**Números.** Um valor editável pode ser um número (`1.5`, `-2`) ou uma expressão feita só de números e constantes (`Math.PI / 2`, `THREE.MathUtils.degToRad(45)`); ao editar uma expressão, ela é trocada por um número. A rotação escrita em radianos à mão continua em radianos. Os números sublinhados com pontilhado mexem numa propriedade da cena: arraste-os para os lados (`Shift` acelera 10 vezes, `Alt` dá passos 10 vezes menores). Os outros números também podem ser arrastados, e o código roda de novo a cada passo, o que serve, por exemplo, para mudar quantas vezes um laço repete.

**Cores.** Aceitas como `"#rrggbb"`, `"#rgb"`, `"rgb(r, g, b)"`, nomes em inglês (`"red"`) ou números `0xrrggbb`, sozinhas ou dentro de `new THREE.Color(...)`. A edição mantém o formato (texto ou número) e as aspas.

### Classes conhecidas

- **Cena e grupos**: `Scene`, `Group`, `Object3D`, `Mesh`.
- **Câmeras**: `PerspectiveCamera` (campo de visão, planos próximo e distante) e `OrthographicCamera` (só posição).
- **Luzes**: `AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`.
- **Geometrias**: `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, `CylinderGeometry`, `ConeGeometry`, `TorusGeometry`, `TorusKnotGeometry`, `CapsuleGeometry`, `CircleGeometry`, `RingGeometry`, `IcosahedronGeometry`, `DodecahedronGeometry`, `OctahedronGeometry`, `TetrahedronGeometry`.
- **Materiais**: `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshPhongMaterial`, `MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshToonMaterial`, `MeshNormalMaterial`.

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

## Avisos no editor

O editor marca na própria linha o que foge do subconjunto:

- **Erros** (o código não roda): erro de sintaxe e redeclaração de um nome reservado.
- **Avisos**: nenhuma `THREE.Scene` criada, um `WebGLRenderer` (desnecessário: o VisuGraph já desenha a cena) e objetos criados dentro de `animar()`, que criaria um objeto novo a cada quadro.
- **Dicas**: objetos criados dentro de laços, funções ou `if`, objetos sem variável e o uso de `requestAnimationFrame` ou `setAnimationLoop` no lugar de `animar()`.

## Erros ao rodar

- As mensagens de erro do navegador são traduzidas para o português e apontam a linha (**ir para o código**).
- **Laço infinito**: um laço que passa de 2 s sem terminar é interrompido (1 s dentro de `animar()`, de um temporizador ou de um evento), com o erro na linha do laço. Se o visor parar de responder por 3 s, ele é reiniciado e volta a mostrar a última cena que funcionou. Se a página inteira travar, na próxima vez o código não roda sozinho: corrija e clique em **↻ Rodar**.
- **Erro dentro de `animar()`**: a animação para e a cena fica como estava; ao corrigir o código, ela volta.
- Temporizadores (`setTimeout`, `setInterval`, `requestAnimationFrame`) e eventos (`addEventListener`) criados pelo código são cancelados a cada nova execução, então rodar de novo nunca acumula animações antigas.

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

**Copiar código** copia o texto do editor. **Baixar HTML** gera `cena-visugraph.html`, uma página que roda a cena sozinha, com o código exatamente como está no editor e a mesma função `animar()`. Ela carrega o Three.js 0.186.1 do jsDelivr, então precisa de internet para abrir.

## Para quem mexe no VisuGraph

```
src/live/engine/   motor sem DOM, com testes: análise do código (Acorn), mapa objeto↔código,
                   planos de edição (patches), instrumentação e trechos prontos
src/live/editor/   editor CodeMirror 6: destaque das linhas, números arrastáveis, explicações
src/live/runtime/  o visor (roda dentro do iframe): execução, gizmo, seleção e proteção contra laços
src/live/app.js    liga editor, visor (bridge.js, via postMessage) e painel (inspector.js)
```

A cada mudança no texto, `analyze()` lê o código e gera um id para cada `new THREE.X(...)`, com os trechos que o criam e alteram e, para cada propriedade, o literal que a define ou o motivo de não ser editável. `instrument()` acrescenta ao código, sem mudar as linhas, o registro de cada objeto criado e a verificação de tempo em cada laço. Uma edição pela cena vira `planEdit()` ou `planTransform()`, que devolvem as trocas de texto aplicadas no editor como uma transação comum (por isso `Ctrl+Z` desfaz). Durante um arraste, o visor muda a propriedade direto e o código é atualizado sem rodar; ao soltar, o código roda uma vez para confirmar que a cena é o que ele diz.

Os testes do motor ficam em `tests/unit/live-*.test.js` (o de instrumentação roda o código instrumentado com o Three.js de verdade no Node), e os da página em `tests/e2e/modo-3d.spec.js`.
