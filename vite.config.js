// vite.config.js
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  // Caminhos relativos: o mesmo build funciona em localhost e no GitHub Pages,
  // onde o site fica numa subpasta com o nome do repositório.
  base: "./",
  server: {
    host: true,
    open: "/index.html",
    port: 5173,
  },
  preview: {
    port: 4173,
    open: false,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    // three.js e p5.js são grandes por natureza; ficam em arquivos próprios (cache melhor)
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      input: {
        main: page("./index.html"),
        twoD: page("./index-2d.html"),
        threeD: page("./index-3d.html"),
        viewport: page("./viewport.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "p5", test: /node_modules[\\/]p5[\\/]/ },
            { name: "codemirror", test: /node_modules[\\/](@codemirror|@lezer|codemirror|crelt|style-mod|w3c-keyname)[\\/]/ },
            { name: "acorn", test: /node_modules[\\/]acorn[\\/]/ },
          ],
        },
      },
    },
  },
  // Vitest: testes unitários das funções puras (src/lib e o motor de src/live/engine)
  test: {
    include: ["tests/unit/**/*.test.js"],
  },
});
