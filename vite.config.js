// vite.config.js
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",                 // <- raiz do projeto (onde estão index.html e index-2d.html)
  server: {
    host: true,
    open: "/index.html",
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        twoD: resolve(__dirname, "index-2d.html"),
      },
    },
  },
  base: "/",
});
