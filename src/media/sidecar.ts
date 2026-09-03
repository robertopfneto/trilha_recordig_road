import { File } from 'expo-file-system';
import { splitOnGaps } from './track';
import type { Recording, TrackPoint } from '@/types';

/**
 * Arquivos ao lado do vídeo. O átomo ©xyz guarda um ponto só; estes guardam
 * a trilha inteira do trecho gravado, com tempo, precisão e velocidade.
 *
 * Ficam com o mesmo nome-base do vídeo: `video-x.mp4` → `video-x.json`.
 */

export function sidecarUri(videoUri: string, extension: string): string {
  return videoUri.replace(/\.[^./]+$/, '') + '.' + extension;
}

export async function writeJsonSidecar(
  recording: Recording,
  points: TrackPoint[]
): Promise<string> {
  const payload = {
    format: 'trilha/recording-track',
    version: 1,
    recording: {
      id: recording.id,
      file: recording.fileUri.split('/').pop(),
      startedAt: new Date(recording.startedAt).toISOString(),
      endedAt: new Date(recording.endedAt).toISOString(),
      durationMs: recording.durationMs,
    },
    // offsetMs = posição no timeline do vídeo. É isso que permite
    // sincronizar o marcador do mapa com o player.
    track: points.map((p) => ({
      offsetMs: p.ts - recording.startedAt,
      ts: new Date(p.ts).toISOString(),
      lat: p.lat,
      lon: p.lon,
      accuracy: p.accuracy,
      altitude: p.altitude,
      speed: p.speed,
      heading: p.heading,
    })),
  };

  const uri = sidecarUri(recording.fileUri, 'json');
  const file = new File(uri);
  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));
  return uri;
}

export async function writeGpxSidecar(
  recording: Recording,
  points: TrackPoint[]
): Promise<string> {
  const segments = splitOnGaps(points, 60_000);

  const body = segments
    .map(
      (segment) =>
        '    <trkseg>\n' +
        segment
          .map(
            (p) =>
              `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
              (p.altitude != null ? `<ele>${p.altitude.toFixed(2)}</ele>` : '') +
              `<time>${new Date(p.ts).toISOString()}</time>` +
              '</trkpt>'
          )
          .join('\n') +
        '\n    </trkseg>'
    )
    .join('\n');

  const gpx =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Trilha" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <trk>\n' +
    `    <name>${escapeXml(recording.fileUri.split('/').pop() ?? recording.id)}</name>\n` +
    body +
    '\n  </trk>\n</gpx>\n';

  const uri = sidecarUri(recording.fileUri, 'gpx');
  const file = new File(uri);
  file.create({ overwrite: true });
  file.write(gpx);
  return uri;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
