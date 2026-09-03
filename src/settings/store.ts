import { useCallback, useEffect, useState } from 'react';
import { kvGet, kvSet } from '@/db';
import { DEFAULT_SETTINGS, GPS_PROFILES, type Settings } from './defaults';

const KEY = 'settings.v1';

/**
 * As configurações vivem no SQLite, não em memória: a task de localização
 * roda num contexto JS separado e precisa ler os mesmos valores que a tela
 * de ajustes gravou.
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await kvGet(KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return merge(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  await kvSet(KEY, JSON.stringify(next));
}

/** Aplica um perfil de GPS pronto, ou marca como personalizado. */
export function withGpsProfile(
  settings: Settings,
  profile: Settings['gps']['profile']
): Settings {
  if (profile === 'personalizado') {
    return { ...settings, gps: { ...settings.gps, profile } };
  }
  return {
    ...settings,
    gps: { profile, ...GPS_PROFILES[profile].settings },
  };
}

/** Mexer em qualquer parâmetro solto de GPS derruba o perfil para personalizado. */
export function withGpsOverride(
  settings: Settings,
  patch: Partial<Settings['gps']>
): Settings {
  return {
    ...settings,
    gps: { ...settings.gps, ...patch, profile: 'personalizado' },
  };
}

function merge(base: Settings, stored: Partial<Settings>): Settings {
  return {
    gps: { ...base.gps, ...(stored.gps ?? {}) },
    video: { ...base.video, ...(stored.video ?? {}) },
    metadata: { ...base.metadata, ...(stored.metadata ?? {}) },
    alwaysTrack: stored.alwaysTrack ?? base.alwaysTrack,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  return { settings, update };
}
