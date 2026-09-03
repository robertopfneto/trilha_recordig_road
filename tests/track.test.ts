import test from 'node:test';
import assert from 'node:assert/strict';

import {
  distanceMeters,
  positionAt,
  splitOnGaps,
  trackLength,
} from '../src/media/track.ts';

const T0 = 1_756_900_800_000;

const point = (offsetSec: number, lat: number, lon: number) => ({
  sessionId: 's1',
  ts: T0 + offsetSec * 1000,
  lat,
  lon,
  accuracy: 5,
  altitude: null,
  speed: null,
  heading: null,
});

const track = [
  point(0, -20.4697, -54.6201),
  point(10, -20.4707, -54.6201),
  point(20, -20.4717, -54.6201),
];

test('interpola linearmente entre dois pontos', () => {
  const at5s = positionAt(track, T0, 5_000);
  assert.ok(at5s);
  assert.ok(Math.abs(at5s.lat - -20.4702) < 1e-9);
});

test('antes do primeiro e depois do último devolve as extremidades', () => {
  assert.equal(positionAt(track, T0, -5_000)!.lat, -20.4697);
  assert.equal(positionAt(track, T0, 999_000)!.lat, -20.4717);
});

test('não interpola através de uma lacuna longa', () => {
  const comBuraco = [point(0, -20.4697, -54.6201), point(600, -20.6, -54.8)];
  const meio = positionAt(comBuraco, T0, 300_000, 60_000);
  // deve grudar num dos extremos, não cair no meio do caminho
  assert.ok(meio!.lat === -20.4697 || meio!.lat === -20.6);
});

test('trilha vazia devolve null', () => {
  assert.equal(positionAt([], T0, 1000), null);
});

test('distância de um grau de latitude ≈ 111 km', () => {
  const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(d - 111_195) < 500, `esperado ~111 km, veio ${d}`);
});

test('comprimento da trilha ignora lacunas', () => {
  const comBuraco = [
    point(0, -20.4697, -54.6201),
    point(10, -20.4707, -54.6201),
    point(600, -20.9, -54.9), // lacuna: não deve entrar na conta
  ];
  const total = trackLength(comBuraco, 60_000);
  assert.ok(total < 200, `esperado só o primeiro trecho, veio ${total}`);
});

test('splitOnGaps quebra o traçado em segmentos', () => {
  const segments = splitOnGaps(
    [point(0, 1, 1), point(10, 1, 1), point(600, 1, 1), point(610, 1, 1)],
    60_000
  );
  assert.equal(segments.length, 2);
  assert.equal(segments[0].length, 2);
  assert.equal(segments[1].length, 2);
});
