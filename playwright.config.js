// playwright.config.js — testes de ponta a ponta no build de produção.
// O site é servido numa subpasta (/visugraph3d/), como no GitHub Pages, para
// pegar qualquer caminho absoluto que quebraria a publicação.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE = "/visugraph3d/";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // WebGL por software é pesado: no CI um teste por vez evita disputa de CPU
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // WebGL por software (SwiftShader): funciona em máquinas de CI sem GPU
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --base ${BASE}`,
    url: `http://localhost:${PORT}${BASE}index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
