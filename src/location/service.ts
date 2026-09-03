import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { LOCATION_TASK } from './task';
import { activeSession, closeSession, openSession } from '@/db';
import { loadSettings } from '@/settings/store';
import type { Session } from '@/types';

export type PermissionState = {
  foreground: boolean;
  background: boolean;
  /** o usuário negou de forma permanente — só resolve nos ajustes do sistema */
  blocked: boolean;
};

/**
 * O Android exige que a permissão de primeiro plano seja concedida ANTES
 * de a de segundo plano ser pedida. Pedir as duas de uma vez faz o sistema
 * negar silenciosamente.
 */
export async function requestPermissions(): Promise<PermissionState> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { foreground: false, background: false, blocked: !fg.canAskAgain };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  return {
    foreground: true,
    background: bg.status === 'granted',
    blocked: bg.status !== 'granted' && !bg.canAskAgain,
  };
}

export async function checkPermissions(): Promise<PermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return {
    foreground: fg.status === 'granted',
    background: bg.status === 'granted',
    blocked: !fg.canAskAgain || !bg.canAskAgain,
  };
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}

/**
 * Abre uma sessão e liga o rastreamento com os parâmetros configurados.
 * Se já houver sessão aberta (o app foi morto e reaberto), retoma aquela.
 */
export async function startTracking(label?: string): Promise<Session> {
  const settings = await loadSettings();
  const session = (await activeSession()) ?? (await openSession(label));

  if (await isTracking()) return session;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: settings.gps.accuracy,
    timeInterval: settings.gps.timeInterval * 1000,
    distanceInterval: settings.gps.distanceInterval,

    // Agrupa entregas em segundo plano: o app acorda menos vezes,
    // que é de onde vem a maior parte da economia de bateria.
    deferredUpdatesInterval: settings.gps.deferredUpdatesInterval,
    deferredUpdatesDistance: settings.gps.deferredUpdatesDistance,

    // Android: notificação persistente obrigatória para o serviço sobreviver.
    foregroundService: {
      notificationTitle: 'Trilha registrando percurso',
      notificationBody: 'Toque para abrir o app.',
      notificationColor: '#0E6E78',
      killServiceOnDestroy: false,
    },

    // iOS: mantém a seta de localização visível na barra de status.
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Other,
    pausesUpdatesAutomatically: false,
  });

  return session;
}

export async function stopTracking(closeCurrentSession = true): Promise<void> {
  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  if (closeCurrentSession) {
    const session = await activeSession();
    if (session) await closeSession(session.id);
  }
}

/** Reaplica as configurações num rastreamento já em andamento. */
export async function restartTracking(): Promise<void> {
  if (!(await isTracking())) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await startTracking();
}

/** Posição instantânea, para carimbar o início e o fim de uma gravação. */
export async function currentPosition(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch {
    return null;
  }
}

/**
 * O Android agressivo de alguns fabricantes (Xiaomi, Samsung, Motorola)
 * mata serviços em segundo plano. Não há API para contornar — só dá para
 * orientar o usuário.
 */
export function needsBatteryOptimizationWarning(): boolean {
  return Platform.OS === 'android';
}
