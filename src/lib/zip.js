// zip.js — um arquivo .zip sem compressão (o método "store"), o bastante para baixar um projeto
// de poucos arquivos de texto. Os nomes vão em UTF-8 (bit 11 dos flags), e as pastas saem dos
// próprios caminhos ("galaxia/src/main.js"): quem descompacta cria as que faltam.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (o do zip, do gzip e do PNG) de uma sequência de bytes. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const UTF8 = 0x0800;

/** Data e hora no formato do MS-DOS, que o zip usa: o ano conta a partir de 1980, os segundos de 2 em 2. */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Os bytes de um .zip com os arquivos `files` ([{ path, content }], o conteúdo em texto ou em
 * bytes), na ordem dada.
 */
export function zip(files, date = new Date()) {
  const encoder = new TextEncoder();
  const { time, day } = dosTime(date);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // assinatura do cabeçalho local
    local.setUint16(4, 20, true); // versão 2.0 para extrair
    local.setUint16(6, UTF8, true);
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); // tamanho guardado
    local.setUint32(22, data.length, true); // tamanho original
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); // assinatura da entrada no diretório central
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, UTF8, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true); // onde está o cabeçalho local
    central.push(new Uint8Array(entry.buffer), name);

    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // fim do diretório central
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  parts.push(...central, new Uint8Array(end.buffer));

  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Os arquivos de um .zip sem compressão, como zip() faz: [{ path, content }] com o conteúdo em bytes. */
export function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Não é um arquivo .zip.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Diretório central inválido.");
    if (view.getUint16(at + 10, true) !== 0) throw new Error("Só arquivos sem compressão.");
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const content = bytes.subarray(start, start + size);
    if (crc32(content) !== view.getUint32(at + 16, true)) throw new Error(`CRC errado em ${path}.`);
    files.push({ path, content });
    at += 46 + nameLength + extra + comment;
  }
  return files;
}
