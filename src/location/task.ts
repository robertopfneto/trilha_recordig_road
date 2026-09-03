import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { activeSession, insertPoints } from '@/db';
import type { TrackPoint } from '@/types';

export const LOCATION_TASK = 'trilha-location-task';

/**
 * IMPORTANTE: `defineTask` precisa rodar no escopo de módulo, na primeira
 * carga do bundle. Quando o sistema acorda o app em segundo plano, ele
 * executa o bundle do zero e espera encontrar a task já registrada — se
 * isso estiver dentro de um componente ou de um useEffect, os pontos somem.
 *
 * Este módulo é importado por `app/_layout.tsx` justamente por causa disso.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn('[trilha] erro na task de localização:', error.message);
      return;
    }
    if (!data?.locations?.length) return;

    // A sessão vem do banco, não de estado em memória: este contexto JS
    // pode ter acabado de nascer.
    const session = await activeSession();
    if (!session) return;

    const points: TrackPoint[] = data.locations.map((loc) => ({
      sessionId: session.id,
      ts: Math.round(loc.timestamp),
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
      altitude: loc.coords.altitude ?? null,
      speed: loc.coords.speed ?? null,
      heading: loc.coords.heading ?? null,
    }));

    // Grava na hora. Nada fica acumulado em memória — se o sistema matar o
    // processo no próximo segundo, a trilha até aqui está salva.
    await insertPoints(points);
  }
);
