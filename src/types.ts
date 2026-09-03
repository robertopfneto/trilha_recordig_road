export type TrackPoint = {
  id?: number;
  sessionId: string;
  /** epoch em milissegundos — o relógio comum entre GPS e vídeo */
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
};

export type Session = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  label: string | null;
};

export type Recording = {
  id: string;
  sessionId: string | null;
  fileUri: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  sizeBytes: number | null;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  /** null = não tentamos ainda, true/false = resultado da gravação do átomo ©xyz */
  metadataEmbedded: boolean | null;
};

export type Coord = { lat: number; lon: number; altitude?: number | null };
