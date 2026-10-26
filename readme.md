# VisuGraph

Laboratório interativo de Computação Gráfica que roda no navegador, em quatro temas: transformações, câmera e projeção, luz e cor, e curvas. Cada tema tem dois passos: **Explorar**, num laboratório 2D, e **Programar**, no código vivo, com desafios corrigidos pela própria cena. A barra do alto, a mesma nos laboratórios e no código vivo, mostra o tema aberto, troca de tema e alterna os dois passos.

- **Modo 3D** (`index-3d.html`): código vivo. A cena é um programa JavaScript com Three.js, e o código é a única fonte da verdade: clicar num objeto destaca as linhas que o criam, e arrastar o gizmo, mexer no painel de propriedades ou arrastar um número no código reescreve o próprio código. A aba **Matemática** mostra as matrizes e o caminho de um vértice até o pixel, e a "caixa de vidro" desenha a cena com a fórmula de Phong à mostra. A aba **Desafios** tem 10 desafios corrigidos pela própria cena, e a aba **Projetos** é um guia de projetos em três níveis, que constrói uma cena completa passo a passo, explicando cada linha e o porquê de cada decisão, e termina com o projeto rodando no seu computador, com Node.js e Vite (os prontos são o Sistema solar, `index-3d.html?projeto=sistema-solar`, a Vitrine de materiais, `?projeto=vitrine`, a Cidade ao entardecer, `?projeto=cidade`, o Gerador de galáxias, `?projeto=galaxia`, a Montanha-russa, `?projeto=montanha-russa`, a Floresta de 10 mil árvores, `?projeto=floresta`, o Phong escrito à mão, `?projeto=phong`, em que a pessoa escreve a luz num shader em GLSL e o VisuGraph mostra o erro de compilação na linha dele, e o Mar com ondas na GPU, `?projeto=mar`, em que as ondas saem de um shader de vértices e a conferência mede a superfície que ele desenhou). O menu **Baixar** leva qualquer cena para fora, como uma página HTML ou um projeto Vite, e o capítulo `computador.html` ensina a instalar o Node.js e rodar o projeto. O modo de estudo (`?estudo=controle` ou `?estudo=experimental`) compara o app com e sem a ligação entre cena e código, com um registro de uso anônimo que a página `estudo.html` junta à planilha dos testes numa linha por aluno. Tudo isso está em [docs/codigo-vivo.md](docs/codigo-vivo.md).
- **Modo 2D** (`index-2d.html`): sistema de coordenadas e transformações (com a matriz 3×3 em coordenadas homogêneas), sistemas de cores, modelo de iluminação Phong / Blinn–Phong e curvas de Bézier (De Casteljau). Cada laboratório tem endereço próprio (`index-2d.html#coordenadas`, `#cores`, `#phong` e `#curvas`) e abre com um exemplo pronto (um triângulo, um azul, uma esfera iluminada e uma cúbica em S) e uma frase do que fazer. Os de coordenadas e de Phong terminam com um link para a trilha de desafios do mesmo tema no modo 3D. O de cores mostra a cor montada como código do Three.js, `new THREE.Color("#3366cc")`, pronta para copiar, e leva ao desafio da cor. No sentido contrário, cada trilha e cada desafio têm um link **Rever no laboratório**.

Todas as bibliotecas vêm do npm e são empacotadas pelo Vite: o site funciona sem CDN e pode ser publicado em qualquer subpasta (por exemplo, no GitHub Pages).

## Como rodar

Requer [Node.js](https://nodejs.org/) 22.12 ou mais recente.

```bash
npm install        # só na primeira vez
npm run dev        # servidor local em http://localhost:5173
npm run build      # gera o site em dist/
npm run preview    # serve o conteúdo de dist/ em http://localhost:4173
```

## Qualidade

```bash
npm run lint       # ESLint
npm test           # testes unitários (Vitest) de src/lib e do motor de src/live/engine
npm run test:e2e   # testes de ponta a ponta (Playwright) no build de produção
npm run check      # tudo acima, na ordem
```

Antes do primeiro `npm run test:e2e`, instale o navegador do Playwright com `npx playwright install chromium`.

Os testes de ponta a ponta servem o build numa subpasta (`/visugraph3d/`), para garantir que ele funciona em qualquer endereço, e falham se a página registrar erro no console, pedir arquivo fora do site ou não encontrar algum arquivo. Entre outras coisas, eles conferem que a cor de um pixel do visor Phong é a que a fórmula do painel calcula e que, no modo 3D, arrastar o gizmo e mexer no painel reescrevem o código, a caixa de vidro pinta o pixel que a aba Matemática calcula e cada desafio é corrigido pela cena.

## Estrutura

```
index.html                    tela inicial: os temas, cada um com o laboratório e a trilha de desafios, e os projetos
index-2d.html                 modo 2D
index-3d.html, viewport.html  modo 3D (código vivo) e o visor, que roda a cena num iframe
estudo.html                   resumo do estudo: junta os registros de uso e a planilha dos testes
computador.html               capítulo Seu computador: Node.js, terminal, editor e como rodar um projeto baixado
src/js/                       código da tela inicial, da barra comum (a lista de temas fica em topics.js) e das seções do modo 2D
src/lib/                      funções puras com testes: transformações 2D e 3D, modelo de Phong (2D e 3D), o shader do visor Phong e o .zip dos projetos baixados
src/live/                     modo 3D: motor (análise do código e edições), editor, visor, painel, desafios, projetos e modo de estudo
src/css/                      estilos (camadas: tokens, base, componentes, overrides)
src/img/                      a imagem do código vivo na tela inicial
public/                       o ícone do site
docs/                         documentação do modo 3D: o subconjunto do Three.js, a aba Matemática, os desafios, os projetos e o modo de estudo
tests/unit/                   testes do Vitest
tests/e2e/                    testes do Playwright
```

Convenções usadas no modo 2D:

- **Coordenadas**: origem no centro do canvas, eixo y para cima e ângulos positivos no sentido anti-horário. A matriz mostrada em "Medir & Matriz" é exatamente a usada no desenho.
- **Phong**: `I = La·Ka + Ld·Kd·max(0, n·l) + Ls·Ks·max(0, r·v)^n` (ou `(h·n)^n` no Blinn–Phong), com o termo especular igual a zero quando `n·l ≤ 0`. O shader do visor (`src/lib/phongShader.js`) faz a mesma conta de `src/lib/phong.js`, sem correção de gama.

## Publicação

O site é publicado pelo [Netlify](https://www.netlify.com/), configurado em `netlify.toml`: ele roda `npm run build` com Node 22 e publica `dist/`. Cada push na `main` atualiza o site, e cada pull request ganha um endereço de prévia, que o Netlify comenta no próprio PR.

O workflow `.github/workflows/ci.yml` roda lint, testes unitários, build e testes de ponta a ponta em cada pull request e em cada push na `main`.
