import { crc32 as zlibCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, unzip, zip } from "../../src/lib/zip.js";

const bytes = (text) => new TextEncoder().encode(text);
const DATE = new Date(2026, 9, 24, 13, 14, 16);

describe("zip", () => {
  it("calcula o CRC-32 como o zlib", () => {
    for (const text of ["", "a", "VisuGraph", "çãé — três"]) expect(crc32(bytes(text)), text).toBe(zlibCrc32(bytes(text)));
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926); // o valor de conferência do CRC-32
  });

  it("guarda e devolve arquivos de texto e de bytes, com nomes em UTF-8 e pastas no caminho", () => {
    const files = [
      { path: "galáxia/README.md", content: "# Olá\n" },
      { path: "galáxia/src/cena.js", content: "const cena = 1;\n" },
      { path: "dados.bin", content: new Uint8Array([0, 255, 7]) },
    ];
    const out = unzip(zip(files, DATE));
    expect(out.map((f) => f.path)).toEqual(files.map((f) => f.path));
    expect(new TextDecoder().decode(out[1].content)).toBe("const cena = 1;\n");
    expect([...out[2].content]).toEqual([0, 255, 7]);
  });

  it("escreve as assinaturas, a data do MS-DOS e o diretório central no lugar certo", () => {
    const out = zip([{ path: "a.txt", content: "oi" }], DATE);
    const view = new DataView(out.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true), "nomes em UTF-8").toBe(0x0800);
    expect(view.getUint16(10, true), "13:14:16").toBe((13 << 11) | (14 << 5) | 8);
    expect(view.getUint16(12, true), "24/10/2026").toBe(((2026 - 1980) << 9) | (10 << 5) | 24);
    const end = out.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint32(end + 16, true), "o diretório central vem depois do único arquivo").toBe(30 + "a.txt".length + 2);
  });

  it("recusa o que não é zip e acusa um arquivo corrompido", () => {
    expect(() => unzip(new Uint8Array(40))).toThrow("Não é um arquivo .zip.");
    const out = zip([{ path: "a.txt", content: "oi" }]);
    out[30 + "a.txt".length] ^= 1; // muda um byte do conteúdo
    expect(() => unzip(out)).toThrow("CRC errado em a.txt.");
  });
});
