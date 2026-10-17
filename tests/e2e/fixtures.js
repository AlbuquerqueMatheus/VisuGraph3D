// Fixture comum: todo teste falha se a página registrar erro, aviso de API
// obsoleta do three.js, requisição para fora do site ou arquivo não encontrado.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  diagnostics: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL).origin;
      const report = { errors: [], external: [], failed: [] };

      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error") report.errors.push(text);
        if (msg.type() === "warning" && /THREE|deprecated|removed/i.test(text)) report.errors.push(text);
      });
      page.on("pageerror", (err) => report.errors.push(`pageerror: ${err.message}`));
      page.on("request", (req) => {
        const url = req.url();
        if (!url.startsWith(origin) && !/^(data|blob):/.test(url)) report.external.push(url);
      });
      page.on("response", (res) => {
        if (res.status() >= 400) report.failed.push(`${res.status()} ${res.url()}`);
      });

      await use(report);

      expect(report.errors, "erros no console").toEqual([]);
      expect(report.external, "requisições para fora do site (CDN)").toEqual([]);
      expect(report.failed, "arquivos não encontrados").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
