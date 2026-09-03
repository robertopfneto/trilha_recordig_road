/**
 * Escreve a localização dentro do container MP4/MOV, no átomo
 * `moov > udta > ©xyz` — exatamente o campo que a câmera nativa do Android
 * e do iOS preenchem, e que o Google Fotos, o Windows, o ffmpeg, o ExifTool
 * e o Finder do macOS leem.
 *
 * Sem módulo nativo, sem ffmpeg e sem re-encode: só reescrevemos o átomo
 * `moov`, que tem alguns kilobytes e fica no fim do arquivo em gravações
 * de Android e iOS. O `mdat` (os quadros de vídeo, centenas de MB) não é
 * tocado.
 *
 * Limite conhecido: o átomo guarda UM ponto por arquivo — a posição em que
 * a gravação começou. A trilha completa vive no SQLite e, opcionalmente,
 * nos arquivos .json/.gpx ao lado do vídeo.
 *
 * Este módulo é puro (bytes → bytes) para poder ser testado fora do
 * aparelho; o I/O fica em `embedLocation.ts`.
 */

const XYZ_TYPE = '©xyz';
const LANG_UNDEFINED = 0x15c7;

export type Box = { type: string; start: number; size: number };

// ------------------------------------------------------------- utilidades

function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function typeAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset + 4],
    bytes[offset + 5],
    bytes[offset + 6],
    bytes[offset + 7]
  );
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Lista os filhos diretos de um container, ignorando caixas malformadas. */
export function listBoxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(bytes, at);
    const type = typeAt(bytes, at);
    if (size === 1) {
      // tamanho de 64 bits nos 8 bytes seguintes ao tipo
      size = u32(bytes, at + 8) * 0x100000000 + u32(bytes, at + 12);
    } else if (size === 0) {
      size = to - at; // "até o fim do arquivo"
    }
    if (size < 8 || at + size > to) break;
    boxes.push({ type, start: at, size });
    at += size;
  }
  return boxes;
}

// --------------------------------------------------------------- ISO 6709

/**
 * Formata no padrão ISO 6709 usado pelo QuickTime:
 * `-20.469712-054.620183+412.300/`
 * Sinal sempre presente e graus com largura fixa (2 na latitude, 3 na longitude).
 */
export function toIso6709(lat: number, lon: number, altitude?: number | null): string {
  const fixed = (value: number, intDigits: number, decimals: number) => {
    const sign = value < 0 ? '-' : '+';
    const [int, dec] = Math.abs(value).toFixed(decimals).split('.');
    return sign + int.padStart(intDigits, '0') + (dec ? '.' + dec : '');
  };

  let out = fixed(lat, 2, 6) + fixed(lon, 3, 6);
  if (typeof altitude === 'number' && Number.isFinite(altitude)) {
    out += fixed(altitude, 3, 3);
  }
  return out + '/';
}

// -------------------------------------------------------------- montagem

export function buildXyzAtom(iso6709: string): Uint8Array {
  const text = ascii(iso6709);
  const size = 8 + 4 + text.length;
  const box = new Uint8Array(size);
  writeU32(box, 0, size);
  box.set(ascii(XYZ_TYPE), 4);
  box[8] = (text.length >>> 8) & 0xff;
  box[9] = text.length & 0xff;
  box[10] = (LANG_UNDEFINED >>> 8) & 0xff;
  box[11] = LANG_UNDEFINED & 0xff;
  box.set(text, 12);
  return box;
}

/**
 * Recebe o `moov` original e devolve um novo com a localização.
 * Um `©xyz` preexistente é substituído, nunca duplicado.
 */
export function patchMoov(
  moov: Uint8Array,
  lat: number,
  lon: number,
  altitude?: number | null
): Uint8Array {
  const xyz = buildXyzAtom(toIso6709(lat, lon, altitude));
  const children = listBoxes(moov, 8, moov.length);
  const udta = children.find((b) => b.type === 'udta');

  let rebuilt: Uint8Array;

  if (!udta) {
    const newUdta = new Uint8Array(8 + xyz.length);
    writeU32(newUdta, 0, newUdta.length);
    newUdta.set(ascii('udta'), 4);
    newUdta.set(xyz, 8);
    rebuilt = concat([moov, newUdta]);
  } else {
    const inner = listBoxes(moov, udta.start + 8, udta.start + udta.size);
    const kept = inner
      .filter((b) => b.type !== XYZ_TYPE)
      .map((b) => moov.subarray(b.start, b.start + b.size));

    const body = concat([...kept, xyz]);
    const newUdta = new Uint8Array(8 + body.length);
    writeU32(newUdta, 0, newUdta.length);
    newUdta.set(ascii('udta'), 4);
    newUdta.set(body, 8);

    rebuilt = concat([
      moov.subarray(0, udta.start),
      newUdta,
      moov.subarray(udta.start + udta.size),
    ]);
  }

  writeU32(rebuilt, 0, rebuilt.length);
  return rebuilt;
}

/** Caixa `free` de preenchimento, usada quando o novo moov ficou menor. */
export function buildFreeBox(size: number): Uint8Array {
  if (size < 8) throw new Error('caixa free precisa de pelo menos 8 bytes');
  const box = new Uint8Array(size);
  writeU32(box, 0, size);
  box.set(ascii('free'), 4);
  return box;
}

export function findMoov(
  bytes: Uint8Array
): { start: number; size: number; isLast: boolean } | null {
  const top = listBoxes(bytes, 0, bytes.length);
  const index = top.findIndex((b) => b.type === 'moov');
  if (index === -1) return null;
  return {
    start: top[index].start,
    size: top[index].size,
    isLast: index === top.length - 1,
  };
}

/** Lê a localização de um arquivo MP4 inteiro, se houver. */
export function readIso6709(bytes: Uint8Array): string | null {
  const moov = findMoov(bytes);
  if (!moov) return null;
  return readIso6709FromMoov(bytes.subarray(moov.start, moov.start + moov.size));
}

/** Lê a localização a partir de um átomo `moov` já isolado. */
export function readIso6709FromMoov(slice: Uint8Array): string | null {
  const udta = listBoxes(slice, 8, slice.length).find((b) => b.type === 'udta');
  if (!udta) return null;
  const xyz = listBoxes(slice, udta.start + 8, udta.start + udta.size).find(
    (b) => b.type === XYZ_TYPE
  );
  if (!xyz) return null;
  const length = (slice[xyz.start + 8] << 8) + slice[xyz.start + 9];
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(slice[xyz.start + 12 + i]);
  return out;
}
