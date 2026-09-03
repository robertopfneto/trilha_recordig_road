import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Link } from 'expo-router';
import { activeSession, countPoints, lastPoint } from '@/db';
import {
  checkPermissions,
  isTracking,
  requestPermissions,
  startTracking,
  stopTracking,
} from '@/location/service';
import { beginRecording, finalizeRecording } from '@/media/pipeline';
import { loadSettings } from '@/settings/store';
import { VIDEO_QUALITIES } from '@/settings/defaults';
import type { Settings } from '@/settings/defaults';
import type { TrackPoint } from '@/types';

export default function CameraScreen() {
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [tracking, setTracking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fix, setFix] = useState<TrackPoint | null>(null);
  const [pointCount, setPointCount] = useState(0);

  useEffect(() => {
    loadSettings().then(setSettings);
    isTracking().then(setTracking);
  }, []);

  // Indicador de sinal: mostra a precisão real antes de o usuário gravar,
  // e não depois de descobrir que o vídeo saiu sem coordenada.
  useEffect(() => {
    const tick = async () => {
      setFix(await lastPoint());
      const session = await activeSession();
      if (session) setPointCount(await countPoints(session.id));
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, []);

  const toggleTracking = useCallback(async () => {
    if (tracking) {
      await stopTracking();
      setTracking(false);
      return;
    }

    const state = await checkPermissions();
    const granted = state.background ? state : await requestPermissions();

    if (!granted.foreground) {
      Alert.alert(
        'Sem permissão de localização',
        'Sem acesso ao GPS o app grava vídeo, mas não registra o percurso.'
      );
      return;
    }
    if (!granted.background) {
      Alert.alert(
        'Só em primeiro plano',
        'A trilha vai parar quando você sair do app. Para registrar com a tela apagada, ' +
          'escolha "Permitir o tempo todo" nos ajustes de localização do sistema.'
      );
    }

    await startTracking();
    setTracking(true);
  }, [tracking]);

  const toggleRecording = useCallback(async () => {
    if (!camera.current || !settings) return;

    if (recording) {
      camera.current.stopRecording();
      return;
    }

    const session = await activeSession();
    const start = await beginRecording(session?.id ?? null);
    setRecording(true);

    try {
      const result = await camera.current.recordAsync({
        maxDuration: settings.video.maxDurationSec || undefined,
        maxFileSize: settings.video.maxFileSizeMb
          ? settings.video.maxFileSizeMb * 1024 * 1024
          : undefined,
      });
      setRecording(false);
      if (!result?.uri) return;

      setSaving(true);
      const { recording: saved, sidecars, embedError } = await finalizeRecording(
        start,
        result.uri
      );
      setSaving(false);

      Alert.alert(
        'Gravação salva',
        [
          `${(saved.durationMs / 1000).toFixed(0)} s · ${formatSize(saved.sizeBytes)}`,
          saved.startLat != null
            ? `Local: ${saved.startLat.toFixed(5)}, ${saved.startLon!.toFixed(5)}`
            : 'Sem coordenada de início (GPS não fixou)',
          saved.metadataEmbedded === true
            ? 'Localização gravada dentro do .mp4'
            : saved.metadataEmbedded === false
              ? `Não foi possível gravar no .mp4 (${embedError})`
              : 'Metadado no arquivo desativado nos ajustes',
          sidecars.length ? `Arquivos ao lado: ${sidecars.length}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (error) {
      setRecording(false);
      setSaving(false);
      Alert.alert('Erro na gravação', String(error));
    }
  }, [recording, settings]);

  if (!cameraPermission || !micPermission || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4FBDC7" />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.prompt}>O Trilha precisa da câmera para gravar.</Text>
        <Pressable
          style={styles.button}
          onPress={async () => {
            await requestCamera();
            await requestMic();
          }}
        >
          <Text style={styles.buttonText}>Permitir câmera e microfone</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing="back"
        videoQuality={settings.video.quality}
        mute={!settings.video.recordAudio}
      />

      <View style={styles.hud}>
        <View style={[styles.chip, tracking ? styles.chipOn : styles.chipOff]}>
          <View style={[styles.dot, tracking ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.chipText}>
            {tracking ? 'Trilha ativa' : 'Trilha parada'}
            {fix?.accuracy != null && tracking ? ` · ±${fix.accuracy.toFixed(0)} m` : ''}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{pointCount} pontos</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {VIDEO_QUALITIES[settings.video.quality].label}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.secondary} onPress={toggleTracking}>
          <Text style={styles.secondaryText}>{tracking ? 'Parar trilha' : 'Iniciar trilha'}</Text>
        </Pressable>

        <Pressable
          style={[styles.shutter, recording && styles.shutterActive]}
          onPress={toggleRecording}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0D1416" />
          ) : (
            <View style={recording ? styles.stopIcon : styles.recIcon} />
          )}
        </Pressable>

        <View style={styles.links}>
          <Link href="/library" style={styles.secondaryText}>
            Gravações
          </Link>
          <Link href="/settings" style={styles.secondaryText}>
            Ajustes
          </Link>
        </View>
      </View>
    </View>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#0D1416',
    padding: 24,
  },
  prompt: { color: '#E8EFF0', textAlign: 'center', fontSize: 16 },
  button: { backgroundColor: '#0E6E78', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },

  hud: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13,20,22,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  chipOn: { borderWidth: 1, borderColor: '#4FBDC7' },
  chipOff: { borderWidth: 1, borderColor: '#46595F' },
  chipText: { color: '#E8EFF0', fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#4FBDC7' },
  dotOff: { backgroundColor: '#74878C' },

  controls: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  secondary: { width: 96 },
  secondaryText: { color: '#E8EFF0', fontSize: 13 },
  links: { width: 96, alignItems: 'flex-end', gap: 8 },

  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#E8EFF0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterActive: { borderColor: '#E8867A' },
  recIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#B03A2E' },
  stopIcon: { width: 30, height: 30, borderRadius: 4, backgroundColor: '#E8867A' },
});
