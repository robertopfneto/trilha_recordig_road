import * as Location from 'expo-location';

/**
 * Perfis de GPS. O consumo de bateria vem sobretudo de dois fatores:
 * a precisão pedida ao chip (quanto maior, mais tempo o GPS fica ligado)
 * e a frequência com que o sistema acorda o app para entregar posições.
 *
 * `distanceInterval` é o parâmetro que mais economiza: parado, o aparelho
 * simplesmente não gera pontos.
 */
export type GpsProfileId = 'economia' | 'equilibrado' | 'preciso' | 'personalizado';

export type GpsSettings = {
  profile: GpsProfileId;
  accuracy: Location.LocationAccuracy;
  /** intervalo mínimo entre pontos, em segundos */
  timeInterval: number;
  /** distância mínima entre pontos, em metros (0 = desligado) */
  distanceInterval: number;
  /** em segundo plano, acumula entregas por este tempo (ms) antes de acordar o app */
  deferredUpdatesInterval: number;
  /** ...ou por esta distância percorrida (m) */
  deferredUpdatesDistance: number;
  /** acima deste intervalo entre dois pontos, tratamos como lacuna (túnel, app morto) */
  gapThresholdMs: number;
};

export const GPS_PROFILES: Record<
  Exclude<GpsProfileId, 'personalizado'>,
  { label: string; description: string; settings: Omit<GpsSettings, 'profile'> }
> = {
  economia: {
    label: 'Economia',
    description: 'Um ponto a cada 50 m. Traçado grosseiro, bateria dura o dia.',
    settings: {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30,
      distanceInterval: 50,
      deferredUpdatesInterval: 120_000,
      deferredUpdatesDistance: 200,
      gapThresholdMs: 180_000,
    },
  },
  equilibrado: {
    label: 'Equilibrado',
    description: 'Um ponto a cada 10 m. Padrão recomendado para caminhada e carro.',
    settings: {
      accuracy: Location.Accuracy.High,
      timeInterval: 5,
      distanceInterval: 10,
      deferredUpdatesInterval: 30_000,
      deferredUpdatesDistance: 50,
      gapThresholdMs: 60_000,
    },
  },
  preciso: {
    label: 'Preciso',
    description: 'Um ponto por segundo. Para trechos curtos — consome bateria rápido.',
    settings: {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      gapThresholdMs: 30_000,
    },
  },
};

export type VideoQualityId = '480p' | '720p' | '1080p' | '2160p';

export const VIDEO_QUALITIES: Record<
  VideoQualityId,
  { label: string; mbPerMinute: number }
> = {
  '480p': { label: '480p · leve', mbPerMinute: 20 },
  '720p': { label: '720p · equilibrado', mbPerMinute: 60 },
  '1080p': { label: '1080p · padrão', mbPerMinute: 130 },
  '2160p': { label: '4K · pesado', mbPerMinute: 400 },
};

export type VideoSettings = {
  quality: VideoQualityId;
  recordAudio: boolean;
  /** duração máxima por gravação, em segundos (0 = sem limite) */
  maxDurationSec: number;
  /** tamanho máximo por arquivo, em MB (0 = sem limite) */
  maxFileSizeMb: number;
};

export type MetadataSettings = {
  /** grava lat/lon dentro do próprio .mp4, no átomo moov > udta > ©xyz */
  embedInFile: boolean;
  /** grava um .json ao lado do vídeo com a trilha completa daquele trecho */
  sidecarJson: boolean;
  /** grava um .gpx ao lado do vídeo (abre no Google Earth, QGIS, Strava) */
  sidecarGpx: boolean;
};

export type Settings = {
  gps: GpsSettings;
  video: VideoSettings;
  metadata: MetadataSettings;
  /** mantém a trilha rodando mesmo sem gravação em andamento */
  alwaysTrack: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  gps: { profile: 'equilibrado', ...GPS_PROFILES.equilibrado.settings },
  video: {
    quality: '1080p',
    recordAudio: true,
    maxDurationSec: 0,
    maxFileSizeMb: 0,
  },
  metadata: {
    embedInFile: true,
    sidecarJson: true,
    sidecarGpx: false,
  },
  alwaysTrack: true,
};
