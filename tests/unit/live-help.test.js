import { describe, expect, it } from "vitest";
import { analyze } from "../../src/live/engine/analyze.js";
import { translateError } from "../../src/live/engine/errors.js";
import { STARTER_CODE } from "../../src/live/engine/snippets.js";
import { explain } from "../../src/live/explain.js";
import { exportHtml } from "../../src/live/export.js";

describe("translateError", () => {
  it.each([
    ["ReferenceError", "velocidade is not defined", "'velocidade' não existe"],
    ["ReferenceError", "Cannot access 'cubo' before initialization", "'cubo' foi usado antes da linha que o cria."],
    ["TypeError", "Assignment to constant variable.", "Uma const não pode receber outro valor"],
    ["TypeError", "Cannot read properties of undefined (reading 'set')", "Tentou ler 'set' de algo que é undefined"],
    ["TypeError", "Cannot set properties of null (setting 'x')", "Tentou mudar 'x' de algo que é null"],
    ["TypeError", "THREE.Cubo is not a constructor", "THREE.Cubo não é uma classe"],
    ["TypeError", "cubo.girar is not a function", "cubo.girar não é uma função"],
    ["RangeError", "Maximum call stack size exceeded", "recursão infinita"],
  ])("%s: %s", (name, message, expected) => {
    expect(translateError(name, message)).toContain(expected);
  });

  it("mantém a mensagem do limite de laço e mostra o nome dos erros desconhecidos", () => {
    expect(translateError("LoopLimitError", "O laço não terminou a tempo.")).toBe("O laço não terminou a tempo.");
    expect(translateError("Error", "algo deu errado")).toBe("Error: algo deu errado");
    expect(translateError("", "")).toBe("Erro");
  });
});

describe("explain", () => {
  const analysis = analyze(STARTER_CODE);
  const at = (text, offset = 0) => explain(analysis, STARTER_CODE.indexOf(text) + offset);

  it("explica classes do THREE, propriedades e chaves de opções", () => {
    expect(at("Scene").title).toBe("THREE.Scene");
    expect(at("castShadow").title).toBe("castShadow");
    expect(at("roughness").text).toContain("Aspereza"); // { color: …, roughness: 0.9 }
    expect(at("animar").text).toContain("animar(tempo, delta)");
  });

  it("diz onde um objeto da cena foi criado", () => {
    const cubo = at("cena.add(cubo)", "cena.add(".length);
    expect(cubo.title).toBe("cubo: THREE.Mesh");
    expect(cubo.text).toContain(`Criado na linha ${analysis.objects.find((o) => o.name === "cubo").line}.`);
  });

  it("diz o que cada número controla", () => {
    expect(at("roughness: 0.4", "roughness: ".length).title).toBe("aspereza do material de cubo");
    expect(at("degToRad(-90)", "degToRad(".length).title).toBe("rotação x de chao (em graus)");
    expect(at("16 / 9").title).toBe("Número"); // não é uma propriedade, mas dá para arrastar
  });

  it("não explica palavras soltas nem a condição de um ternário", () => {
    const code = "const cena = new THREE.Scene();\nconst a = true ? roughness : 1;";
    expect(explain(analyze(code), code.indexOf("roughness"))).toBeNull();
    expect(explain(analyze(code), code.indexOf("const"))).toBeNull();
  });
});

describe("exportHtml", () => {
  it("gera uma página que roda o código exatamente como está", () => {
    const { html } = exportHtml(analyze(STARTER_CODE));
    expect(html).toContain('"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js"');
    expect(html).toContain(STARTER_CODE.replace(/\s+$/, ""));
    expect(html).toContain("return { cena: cena, camera: camera, animar:");
  });

  it("não deixa o código fechar a tag <script> antes da hora", () => {
    const code = 'const cena = new THREE.Scene();\nconst texto = "</script><b>oi</b>";';
    const { html } = exportHtml(analyze(code));
    expect(html.match(/<\/script>/g)).toHaveLength(2); // só o importmap e o módulo
    expect(html).toContain('"<\\/script><b>oi</b>"');
    // "<!--" seguido de "<script>" faria o navegador ignorar o fim da tag
    const comment = exportHtml(analyze('const cena = new THREE.Scene();\nconst t = "<!--<script>";')).html;
    expect(comment).toContain('const t = "<\\!--<script>";');
    expect(comment).not.toContain("<!--");
  });

  it("sem câmera usa a padrão; sem cena com nome ou com erro, explica o motivo", () => {
    expect(exportHtml(analyze("const cena = new THREE.Scene();")).html).toContain("camera: null");
    expect(exportHtml(analyze("new THREE.Scene();")).error).toContain("Guarde a cena numa variável");
    expect(exportHtml(analyze("const cena = ;")).error).toContain("Corrija o erro");
  });
});
