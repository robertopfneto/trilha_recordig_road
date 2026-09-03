import type { Coord, TrackPoint } from '@/types';

/**
 * Posição no instante `offsetMs` do vídeo.
 *
 * Este é o coração do app: GPS e vídeo são dois fluxos independentes que se
 * encontram por timestamp absoluto. `startedAtMs` é o `Date.now()` do
 * momento em que a gravação começou; qualquer ponto da trilha com
 * `ts` entre o início e o fim pertence àquele vídeo, e seu deslocamento no
 * timeline é `ts - startedAtMs`.
 */
export function positionAt(
  points: TrackPoint[],
  startedAtMs: number,
  offsetMs: number,
  gapMs = 60_000
): Coord | null {
  if (points.length === 0) return null;

  const target = startedAtMs + offsetMs;
  if (target <= points[0].ts) return toCoord(points[0]);

  const last = points[points.length - 1];
  if (target >= last.ts) return toCoord(last);

  const index = points.findIndex((p) => p.ts >= target);
  const before = points[index - 1];
  const after = points[index];

  // Lacuna longa: não inventamos uma reta atravessando o buraco.
  if (after.ts - before.ts > gapMs) {
    return target - before.ts < after.ts - target ? toCoord(before) : toCoord(after);
  }

  const factor = (target - before.ts) / (after.ts - before.ts);
  return {
    lat: before.lat + (after.lat - before.lat) * factor,
    lon: before.lon + (after.lon - before.lon) * factor,
    altitude:
      before.altitude != null && after.altitude != null
        ? before.altitude + (after.altitude - before.altitude) * factor
        : null,
  };
}

function toCoord(p: TrackPoint): Coord {
  return { lat: p.lat, lon: p.lon, altitude: p.altitude };
}

/** Distância entre dois pontos em metros (Haversine). */
export function distanceMeters(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Túnel, estacionamento ou app morto deixam um buraco entre dois pontos.
 * Quebrar o traçado em segmentos evita que o mapa desenhe uma reta
 * atravessando a cidade.
 */
export function splitOnGaps(points: TrackPoint[], gapMs = 60_000): TrackPoint[][] {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];

  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && point.ts - previous.ts > gapMs) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Comprimento total do trajeto, em metros, ignorando lacunas. */
export function trackLength(points: TrackPoint[], gapMs = 60_000): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].ts - points[i - 1].ts > gapMs) continue;
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}
