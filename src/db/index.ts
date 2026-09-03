import * as SQLite from 'expo-sqlite';
import type { Recording, Session, TrackPoint } from '@/types';

const DB_NAME = 'trilha.db';

let handle: SQLite.SQLiteDatabase | null = null;

/**
 * Abre (uma vez por contexto JS) e migra o banco.
 *
 * Atenção: a task de localização em segundo plano roda em OUTRO contexto JS,
 * sem acesso ao estado do React. Por isso o banco é o único ponto de encontro
 * entre a interface e o rastreamento — inclusive para as configurações.
 */
export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;
  handle = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(handle);
  return handle;
}

async function migrate(d: SQLite.SQLiteDatabase) {
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER,
      label      TEXT
    );

    CREATE TABLE IF NOT EXISTS track_points (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      ts         INTEGER NOT NULL,
      lat        REAL NOT NULL,
      lon        REAL NOT NULL,
      accuracy   REAL,
      altitude   REAL,
      speed      REAL,
      heading    REAL
    );
    CREATE INDEX IF NOT EXISTS idx_points_session_ts ON track_points(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_points_ts ON track_points(ts);

    CREATE TABLE IF NOT EXISTS recordings (
      id                TEXT PRIMARY KEY,
      session_id        TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      file_uri          TEXT NOT NULL,
      started_at        INTEGER NOT NULL,
      ended_at          INTEGER NOT NULL,
      duration_ms       INTEGER NOT NULL,
      size_bytes        INTEGER,
      start_lat         REAL, start_lon REAL,
      end_lat           REAL, end_lon   REAL,
      metadata_embedded INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_recordings_started ON recordings(started_at DESC);
  `);
}

// ------------------------------------------------------------------- kv

export async function kvGet(key: string): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

// -------------------------------------------------------------- sessions

export async function openSession(label?: string): Promise<Session> {
  const d = await db();
  const session: Session = {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    endedAt: null,
    label: label ?? null,
  };
  await d.runAsync(
    'INSERT INTO sessions (id, started_at, ended_at, label) VALUES (?, ?, ?, ?)',
    session.id,
    session.startedAt,
    null,
    session.label
  );
  return session;
}

export async function closeSession(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE sessions SET ended_at = ? WHERE id = ?', Date.now(), id);
}

export async function activeSession(): Promise<Session | null> {
  const d = await db();
  const row = await d.getFirstAsync<any>(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return row
    ? { id: row.id, startedAt: row.started_at, endedAt: row.ended_at, label: row.label }
    : null;
}

// ---------------------------------------------------------- track points

/** Grava um lote de pontos numa transação só — é o caminho quente do app. */
export async function insertPoints(points: TrackPoint[]): Promise<void> {
  if (points.length === 0) return;
  const d = await db();
  await d.withTransactionAsync(async () => {
    for (const p of points) {
      await d.runAsync(
        `INSERT INTO track_points
           (session_id, ts, lat, lon, accuracy, altitude, speed, heading)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.sessionId,
        p.ts,
        p.lat,
        p.lon,
        p.accuracy,
        p.altitude,
        p.speed,
        p.heading
      );
    }
  });
}

/** Pontos de uma faixa de tempo — a consulta que amarra GPS e vídeo. */
export async function pointsBetween(
  fromTs: number,
  toTs: number,
  sessionId?: string
): Promise<TrackPoint[]> {
  const d = await db();
  const rows = sessionId
    ? await d.getAllAsync<any>(
        'SELECT * FROM track_points WHERE session_id = ? AND ts BETWEEN ? AND ? ORDER BY ts',
        sessionId,
        fromTs,
        toTs
      )
    : await d.getAllAsync<any>(
        'SELECT * FROM track_points WHERE ts BETWEEN ? AND ? ORDER BY ts',
        fromTs,
        toTs
      );
  return rows.map(rowToPoint);
}

export async function lastPoint(): Promise<TrackPoint | null> {
  const d = await db();
  const row = await d.getFirstAsync<any>(
    'SELECT * FROM track_points ORDER BY ts DESC LIMIT 1'
  );
  return row ? rowToPoint(row) : null;
}

export async function countPoints(sessionId: string): Promise<number> {
  const d = await db();
  const row = await d.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM track_points WHERE session_id = ?',
    sessionId
  );
  return row?.n ?? 0;
}

function rowToPoint(row: any): TrackPoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    ts: row.ts,
    lat: row.lat,
    lon: row.lon,
    accuracy: row.accuracy,
    altitude: row.altitude,
    speed: row.speed,
    heading: row.heading,
  };
}

// ----------------------------------------------------------- recordings

export async function insertRecording(r: Recording): Promise<void> {
  const d = await db();
  await d.runAsync(
    `INSERT INTO recordings
       (id, session_id, file_uri, started_at, ended_at, duration_ms, size_bytes,
        start_lat, start_lon, end_lat, end_lon, metadata_embedded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.id,
    r.sessionId,
    r.fileUri,
    r.startedAt,
    r.endedAt,
    r.durationMs,
    r.sizeBytes,
    r.startLat,
    r.startLon,
    r.endLat,
    r.endLon,
    r.metadataEmbedded === null ? null : r.metadataEmbedded ? 1 : 0
  );
}

export async function listRecordings(limit = 200): Promise<Recording[]> {
  const d = await db();
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM recordings ORDER BY started_at DESC LIMIT ?',
    limit
  );
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fileUri: row.file_uri,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
    startLat: row.start_lat,
    startLon: row.start_lon,
    endLat: row.end_lat,
    endLon: row.end_lon,
    metadataEmbedded:
      row.metadata_embedded === null ? null : row.metadata_embedded === 1,
  }));
}
