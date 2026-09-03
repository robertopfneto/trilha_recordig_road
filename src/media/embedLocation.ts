import { File, FileMode } from 'expo-file-system';
import { buildFreeBox, patchMoov, readIso6709FromMoov } from './mp4Location';

const HEAD_SCAN_BYTES = 512 * 1024; // suficiente para achar o índice de caixas

export type EmbedResult =
  | { ok: true; iso6709: string }
  | { ok: false; reason: 'sem-moov' | 'moov-no-inicio' | 'erro'; detail?: string };

/**
 * Grava lat/lon dentro do arquivo de vídeo sem re-encodar.
 *
 * Estratégia: só o átomo `moov` é reescrito. Como Android e iOS finalizam
 * a gravação escrevendo o `moov` no FIM do arquivo, isso custa alguns
 * kilobytes de escrita, independentemente de o vídeo ter 3 MB ou 3 GB.
 *
 * Se o `moov` estiver no início (arquivo com "faststart", vindo de outra
 * fonte), desistimos: mexer no tamanho dele deslocaria o `mdat` e exigiria
 * corrigir todos os offsets de `stco`/`co64`. Nesse caso o app cai para os
 * arquivos .json/.gpx ao lado do vídeo.
 */
export async function embedLocation(
  fileUri: string,
  lat: number,
  lon: number,
  altitude?: number | null
): Promise<EmbedResult> {
  let handle: ReturnType<File['open']> | null = null;
  try {
    const file = new File(fileUri);
    handle = file.open(FileMode.ReadWrite);

    // 1. Lê só o começo do arquivo para mapear as caixas de nível superior.
    const totalSize = handle.size;
    handle.offset = 0;
    const head = handle.readBytes(Math.min(HEAD_SCAN_BYTES, totalSize));

    const index = locateMoov(head, totalSize, handle);
    if (!index) return { ok: false, reason: 'sem-moov' };
    if (!index.isLast) return { ok: false, reason: 'moov-no-inicio' };

    // 2. Lê o moov inteiro (poucos KB) e monta a versão com a localização.
    handle.offset = index.start;
    const moov = handle.readBytes(index.size);
    const patched = patchMoov(moov, lat, lon, altitude);

    // 3. Reescreve o moov no lugar. Se encolheu, um `free` cobre a sobra —
    //    assim o arquivo continua válido sem precisar de truncate.
    handle.offset = index.start;
    handle.writeBytes(patched);

    const leftover = index.size - patched.length;
    if (leftover >= 8) {
      handle.writeBytes(buildFreeBox(leftover));
    } else if (leftover > 0) {
      // sobra pequena demais para uma caixa: zera para não virar lixo
      handle.writeBytes(new Uint8Array(leftover));
    }

    // 4. Confere lendo de volta o mesmo trecho — barato, e evita registrar
    //    no banco um "embutido com sucesso" que não aconteceu.
    handle.offset = index.start;
    const written = readIso6709FromMoov(handle.readBytes(patched.length));

    handle.close();
    handle = null;

    return written ? { ok: true, iso6709: written } : { ok: false, reason: 'erro' };
  } catch (error) {
    return {
      ok: false,
      reason: 'erro',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      handle?.close();
    } catch {
      /* já fechado */
    }
  }
}

/**
 * Percorre as caixas de nível superior lendo apenas os cabeçalhos (8 bytes
 * cada), pulando o `mdat` inteiro em vez de carregá-lo na memória.
 */
function locateMoov(
  head: Uint8Array,
  totalSize: number,
  handle: ReturnType<File['open']>
): { start: number; size: number; isLast: boolean } | null {
  let at = 0;
  let moov: { start: number; size: number } | null = null;

  while (at + 8 <= totalSize) {
    let header: Uint8Array;
    if (at + 16 <= head.length) {
      header = head.subarray(at, at + 16);
    } else {
      handle.offset = at;
      header = handle.readBytes(Math.min(16, totalSize - at));
    }
    if (header.length < 8) break;

    let size =
      ((header[0] << 24) >>> 0) + (header[1] << 16) + (header[2] << 8) + header[3];
    const type = String.fromCharCode(header[4], header[5], header[6], header[7]);

    if (size === 1 && header.length >= 16) {
      size =
        (((header[8] << 24) >>> 0) +
          (header[9] << 16) +
          (header[10] << 8) +
          header[11]) *
          0x100000000 +
        (((header[12] << 24) >>> 0) +
          (header[13] << 16) +
          (header[14] << 8) +
          header[15]);
    } else if (size === 0) {
      size = totalSize - at;
    }
    if (size < 8 || at + size > totalSize) break;

    if (type === 'moov') moov = { start: at, size };
    at += size;
  }

  if (!moov) return null;
  return { ...moov, isLast: moov.start + moov.size >= totalSize };
}
