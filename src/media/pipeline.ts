import { Directory, File, Paths } from 'expo-file-system';
import { insertRecording, pointsBetween } from '@/db';
import { loadSettings } from '@/settings/store';
import { currentPosition } from '@/location/service';
import { embedLocation } from './embedLocation';
import { writeGpxSidecar, writeJsonSidecar } from './sidecar';
import type { Recording } from '@/types';

const VIDEO_DIR = 'videos';

/** Diretório permanente. O expo-camera grava no cache, que o sistema apaga. */
export function videosDirectory(): Directory {
  const dir = new Directory(Paths.document, VIDEO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type RecordingStart = {
  id: string;
  sessionId: string | null;
  startedAt: number;
  startLat: number | null;
  startLon: number | null;
  startAltitude: number | null;
};

/**
 * Chamado no instante em que `recordAsync()` dispara.
 * Só duas coisas importam aqui: o relógio e a posição atual.
 */
export async function beginRecording(sessionId: string | null): Promise<RecordingStart> {
  const startedAt = Date.now();
  const position = await currentPosition();

  return {
    id: `r_${startedAt.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    startedAt,
    startLat: position?.coords.latitude ?? null,
    startLon: position?.coords.longitude ?? null,
    startAltitude: position?.coords.altitude ?? null,
  };
}

export type FinalizeResult = {
  recording: Recording;
  sidecars: string[];
  embedError?: string;
};

/**
 * Chamado quando `recordAsync()` resolve com o arquivo temporário.
 *
 * Ordem importa: primeiro movemos o arquivo para o lugar definitivo, depois
 * gravamos os metadados. Se o app morrer no meio, o vídeo já está salvo —
 * perder metadado é recuperável, perder o vídeo não.
 */
export async function finalizeRecording(
  start: RecordingStart,
  cacheUri: string
): Promise<FinalizeResult> {
  const settings = await loadSettings();
  const endedAt = Date.now();

  // 1. Cache → diretório permanente.
  const source = new File(cacheUri);
  const target = new File(videosDirectory(), `${start.id}.mp4`);
  source.move(target);

  // 2. Posição final e trilha do trecho.
  const end = await currentPosition();
  const points = await pointsBetween(
    start.startedAt,
    endedAt,
    start.sessionId ?? undefined
  );

  // Se o GPS instantâneo falhou no início, o primeiro ponto da trilha serve.
  const startLat = start.startLat ?? points[0]?.lat ?? null;
  const startLon = start.startLon ?? points[0]?.lon ?? null;

  const recording: Recording = {
    id: start.id,
    sessionId: start.sessionId,
    fileUri: target.uri,
    startedAt: start.startedAt,
    endedAt,
    durationMs: endedAt - start.startedAt,
    sizeBytes: target.size ?? null,
    startLat,
    startLon,
    endLat: end?.coords.latitude ?? points[points.length - 1]?.lat ?? null,
    endLon: end?.coords.longitude ?? points[points.length - 1]?.lon ?? null,
    metadataEmbedded: null,
  };

  // 3. Localização dentro do próprio .mp4 (átomo ©xyz).
  let embedError: string | undefined;
  if (settings.metadata.embedInFile && startLat != null && startLon != null) {
    const result = await embedLocation(
      target.uri,
      startLat,
      startLon,
      start.startAltitude ?? points[0]?.altitude ?? null
    );
    recording.metadataEmbedded = result.ok;
    if (!result.ok) embedError = result.detail ?? result.reason;
  }

  // 4. Arquivos ao lado, com a trilha completa do trecho.
  const sidecars: string[] = [];
  if (settings.metadata.sidecarJson) {
    sidecars.push(await writeJsonSidecar(recording, points));
  }
  if (settings.metadata.sidecarGpx && points.length > 0) {
    sidecars.push(await writeGpxSidecar(recording, points));
  }

  await insertRecording(recording);
  return { recording, sidecars, embedError };
}
