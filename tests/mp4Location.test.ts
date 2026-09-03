import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findMoov,
  patchMoov,
  readIso6709,
  toIso6709,
} from '../src/media/mp4Location.ts';

const CAMPO_GRANDE = { lat: -20.469712, lon: -54.620183, alt: 412.3 };

function makeSampleMp4(dir: string): string {
  const path = join(dir, 'sample.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-y', path,
  ]);
  return path;
}

/** Aplica o patch como o app faz: reescreve só o moov, que fica no fim. */
function embed(path: string, lat: number, lon: number, alt?: number) {
  const bytes = new Uint8Array(readFileSync(path));
  const moov = findMoov(bytes);
  assert.ok(moov, 'moov não encontrado');
  assert.ok(moov.isLast, 'moov deveria estar no fim do arquivo');

  const patched = patchMoov(bytes.subarray(moov.start, moov.start + moov.size), lat, lon, alt);
  const out = new Uint8Array(moov.start + patched.length);
  out.set(bytes.subarray(0, moov.start), 0);
  out.set(patched, moov.start);
  writeFileSync(path, out);
  return { oldSize: moov.size, newSize: patched.length };
}

test('ISO 6709 usa sinal e largura fixa de graus', () => {
  assert.equal(
    toIso6709(CAMPO_GRANDE.lat, CAMPO_GRANDE.lon, CAMPO_GRANDE.alt),
    '-20.469712-054.620183+412.300/'
  );
  assert.equal(toIso6709(1.5, 2.5), '+01.500000+002.500000/');
  assert.equal(toIso6709(-0.5, 179.999999), '-00.500000+179.999999/');
});

test('grava a localização e o ffprobe consegue ler', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trilha-'));
  const path = makeSampleMp4(dir);

  embed(path, CAMPO_GRANDE.lat, CAMPO_GRANDE.lon, CAMPO_GRANDE.alt);

  const probe = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format_tags=location', '-of', 'default=nw=1:nk=1', path,
  ]).toString().trim().split('\n')[0];

  assert.equal(probe, '-20.469712-054.620183+412.300/');
});

test('o vídeo continua decodificável depois do patch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trilha-'));
  const path = makeSampleMp4(dir);
  embed(path, CAMPO_GRANDE.lat, CAMPO_GRANDE.lon);

  // ffmpeg sai com código != 0 se o container estiver corrompido
  execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-']);
});

test('aplicar duas vezes substitui, não duplica', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trilha-'));
  const path = makeSampleMp4(dir);

  embed(path, CAMPO_GRANDE.lat, CAMPO_GRANDE.lon, CAMPO_GRANDE.alt);
  const second = embed(path, 1.5, 2.5);

  // sem altitude o átomo encolhe — prova de que o anterior foi removido
  assert.ok(second.newSize <= second.oldSize);

  const bytes = new Uint8Array(readFileSync(path));
  assert.equal(readIso6709(bytes), '+01.500000+002.500000/');
});

test('readIso6709 devolve null em arquivo sem localização', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trilha-'));
  const path = makeSampleMp4(dir);
  assert.equal(readIso6709(new Uint8Array(readFileSync(path))), null);
});
