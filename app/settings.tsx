import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  GPS_PROFILES,
  VIDEO_QUALITIES,
  type GpsProfileId,
  type VideoQualityId,
} from '@/settings/defaults';
import { useSettings, withGpsOverride, withGpsProfile } from '@/settings/store';
import { restartTracking } from '@/location/service';

export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const [dirty, setDirty] = useState(false);

  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4FBDC7" />
      </View>
    );
  }

  const apply = async (next: typeof settings, touchesGps = false) => {
    await update(next);
    if (touchesGps) {
      setDirty(true);
      await restartTracking();
      setDirty(false);
    }
  };

  const estimate = VIDEO_QUALITIES[settings.video.quality].mbPerMinute;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* ------------------------------------------------------------ GPS */}
      <Section
        title="GPS"
        note="A economia de bateria vem de dois lugares: pedir menos precisão ao chip e acordar o app menos vezes. Distância mínima é o parâmetro mais eficaz — parado, o aparelho não gera pontos."
      >
        <View style={styles.chips}>
          {(Object.keys(GPS_PROFILES) as Exclude<GpsProfileId, 'personalizado'>[]).map(
            (id) => (
              <Pressable
                key={id}
                style={[styles.chip, settings.gps.profile === id && styles.chipActive]}
                onPress={() => apply(withGpsProfile(settings, id), true)}
              >
                <Text
                  style={[
                    styles.chipText,
                    settings.gps.profile === id && styles.chipTextActive,
                  ]}
                >
                  {GPS_PROFILES[id].label}
                </Text>
              </Pressable>
            )
          )}
          {settings.gps.profile === 'personalizado' && (
            <View style={[styles.chip, styles.chipActive]}>
              <Text style={[styles.chipText, styles.chipTextActive]}>Personalizado</Text>
            </View>
          )}
        </View>

        {settings.gps.profile !== 'personalizado' && (
          <Text style={styles.help}>{GPS_PROFILES[settings.gps.profile].description}</Text>
        )}

        <NumberRow
          label="Intervalo mínimo"
          suffix="s"
          value={settings.gps.timeInterval}
          onChange={(v) => apply(withGpsOverride(settings, { timeInterval: v }), true)}
        />
        <NumberRow
          label="Distância mínima"
          suffix="m"
          value={settings.gps.distanceInterval}
          onChange={(v) => apply(withGpsOverride(settings, { distanceInterval: v }), true)}
        />
        <NumberRow
          label="Agrupar entregas a cada"
          suffix="s"
          value={Math.round(settings.gps.deferredUpdatesInterval / 1000)}
          onChange={(v) =>
            apply(withGpsOverride(settings, { deferredUpdatesInterval: v * 1000 }), true)
          }
        />
        <NumberRow
          label="...ou a cada"
          suffix="m percorridos"
          value={settings.gps.deferredUpdatesDistance}
          onChange={(v) =>
            apply(withGpsOverride(settings, { deferredUpdatesDistance: v }), true)
          }
        />
        <NumberRow
          label="Considerar lacuna acima de"
          suffix="s sem sinal"
          value={Math.round(settings.gps.gapThresholdMs / 1000)}
          onChange={(v) => apply(withGpsOverride(settings, { gapThresholdMs: v * 1000 }))}
        />

        <ToggleRow
          label="Manter trilha sempre ligada"
          help="Registra o percurso mesmo quando você não está gravando vídeo."
          value={settings.alwaysTrack}
          onChange={(v) => apply({ ...settings, alwaysTrack: v })}
        />
        {dirty && <Text style={styles.help}>Reaplicando no rastreamento em andamento…</Text>}
      </Section>

      {/* ---------------------------------------------------------- Vídeo */}
      <Section title="Vídeo" note={`≈ ${estimate} MB por minuto de gravação.`}>
        <View style={styles.chips}>
          {(Object.keys(VIDEO_QUALITIES) as VideoQualityId[]).map((id) => (
            <Pressable
              key={id}
              style={[styles.chip, settings.video.quality === id && styles.chipActive]}
              onPress={() =>
                apply({ ...settings, video: { ...settings.video, quality: id } })
              }
            >
              <Text
                style={[
                  styles.chipText,
                  settings.video.quality === id && styles.chipTextActive,
                ]}
              >
                {VIDEO_QUALITIES[id].label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ToggleRow
          label="Gravar áudio"
          value={settings.video.recordAudio}
          onChange={(v) =>
            apply({ ...settings, video: { ...settings.video, recordAudio: v } })
          }
        />
        <NumberRow
          label="Duração máxima"
          suffix="s (0 = sem limite)"
          value={settings.video.maxDurationSec}
          onChange={(v) =>
            apply({ ...settings, video: { ...settings.video, maxDurationSec: v } })
          }
        />
        <NumberRow
          label="Tamanho máximo"
          suffix="MB (0 = sem limite)"
          value={settings.video.maxFileSizeMb}
          onChange={(v) =>
            apply({ ...settings, video: { ...settings.video, maxFileSizeMb: v } })
          }
        />
      </Section>

      {/* ------------------------------------------------------ Metadados */}
      <Section
        title="Metadados"
        note="O átomo dentro do .mp4 guarda um ponto só — onde a gravação começou. A trilha completa fica no banco e, se você quiser, nos arquivos ao lado."
      >
        <ToggleRow
          label="Gravar local dentro do .mp4"
          help="Campo ©xyz, o mesmo da câmera nativa. Lido por Google Fotos, Windows, ffmpeg e ExifTool."
          value={settings.metadata.embedInFile}
          onChange={(v) =>
            apply({ ...settings, metadata: { ...settings.metadata, embedInFile: v } })
          }
        />
        <ToggleRow
          label="Arquivo .json ao lado"
          help="Trilha completa do trecho, com offset no timeline do vídeo."
          value={settings.metadata.sidecarJson}
          onChange={(v) =>
            apply({ ...settings, metadata: { ...settings.metadata, sidecarJson: v } })
          }
        />
        <ToggleRow
          label="Arquivo .gpx ao lado"
          help="Formato aberto: abre no Google Earth, QGIS, Strava e Garmin."
          value={settings.metadata.sidecarGpx}
          onChange={(v) =>
            apply({ ...settings, metadata: { ...settings.metadata, sidecarGpx: v } })
          }
        />
      </Section>
    </ScrollView>
  );
}

// -------------------------------------------------------------- primitivos

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note && <Text style={styles.note}>{note}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text style={styles.label}>{label}</Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#0E6E78', false: '#26363A' }}
        thumbColor="#E8EFF0"
      />
    </View>
  );
}

function NumberRow({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));

  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text style={styles.label}>{label}</Text>
        {suffix && <Text style={styles.help}>{suffix}</Text>}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        keyboardType="number-pad"
        onChangeText={setText}
        onEndEditing={() => {
          const parsed = Math.max(0, Number(text.replace(/[^0-9]/g, '')) || 0);
          setText(String(parsed));
          onChange(parsed);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1416' },
  content: { padding: 16, gap: 28, paddingBottom: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1416' },

  section: { gap: 8 },
  sectionTitle: {
    color: '#E8EFF0',
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: '#141F22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#26363A',
    overflow: 'hidden',
  },
  note: { color: '#74878C', fontSize: 12, lineHeight: 17 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#26363A',
  },
  rowLabel: { flex: 1, gap: 2 },
  label: { color: '#E8EFF0', fontSize: 14 },
  help: { color: '#74878C', fontSize: 11, lineHeight: 15 },

  input: {
    minWidth: 72,
    backgroundColor: '#0D1416',
    borderWidth: 1,
    borderColor: '#26363A',
    borderRadius: 6,
    color: '#E8EFF0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14, paddingBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#26363A',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { borderColor: '#4FBDC7', backgroundColor: '#14343899' },
  chipText: { color: '#A3B4B8', fontSize: 13 },
  chipTextActive: { color: '#4FBDC7' },
});
