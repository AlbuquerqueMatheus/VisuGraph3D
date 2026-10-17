# VisuGraph 3D

Laboratório interativo de Computação Gráfica que roda no navegador.

- **Modo 3D** (`index.html`): cena em Three.js com materiais, luzes, câmera, animações, gizmo de transformação e um editor com o código JavaScript equivalente à cena.
- **Modo 2D** (`index-2d.html`): sistema de coordenadas e transformações (com a matriz 3×3 em coordenadas homogêneas), sistemas de cores, modelo de iluminação Phong / Blinn–Phong e curvas de Bézier (De Casteljau).

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
npm test           # testes unitários (Vitest) das funções puras de src/lib
npm run test:e2e   # testes de ponta a ponta (Playwright) no build de produção
npm run check      # tudo acima, na ordem
```

Antes do primeiro `npm run test:e2e`, instale o navegador do Playwright com `npx playwright install chromium`.

Os testes de ponta a ponta servem o build em `/visugraph3d/`, como no GitHub Pages, e falham se a página registrar erro no console, pedir arquivo fora do site ou não encontrar algum arquivo. Entre outras coisas, eles conferem que a cor de um pixel do visor Phong é a que a fórmula do painel calcula.

## Estrutura

```
index.html, index-2d.html   páginas (menu + modo 3D, modo 2D)
src/js/                     código de cada página e seção
src/classes/                classes da cena 3D (câmera, luzes, editor, gerador de código…)
src/lib/                    funções puras com testes: transformações 2D, modelo de Phong e o shader que o implementa
src/css/                    estilos (camadas: tokens, base, componentes, overrides)
public/                     imagens e a fonte da logo (licença em public/fonts)
tests/unit/                 testes do Vitest
tests/e2e/                  testes do Playwright
```

Convenções usadas no modo 2D:

- **Coordenadas**: origem no centro do canvas, eixo y para cima e ângulos positivos no sentido anti-horário. A matriz mostrada em "Medir & Matriz" é exatamente a usada no desenho.
- **Phong**: `I = La·Ka + Ld·Kd·max(0, n·l) + Ls·Ks·max(0, r·v)^n` (ou `(h·n)^n` no Blinn–Phong), com o termo especular igual a zero quando `n·l ≤ 0`. O shader do visor (`src/lib/phongShader.js`) faz a mesma conta de `src/lib/phong.js`, sem correção de gama.

## Publicação

O workflow `.github/workflows/ci.yml` roda lint, testes e build em cada pull request. Em cada push na `main`, se tudo passar, ele publica `dist/` no GitHub Pages.

Para ativar a publicação uma única vez: no GitHub, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**.
