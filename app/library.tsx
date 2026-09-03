import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listRecordings, pointsBetween } from '@/db';
import { trackLength } from '@/media/track';
import type { Recording } from '@/types';

type Row = Recording & { meters: number; points: number };

export default function LibraryScreen() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const recordings = await listRecordings();
      const enriched = await Promise.all(
        recordings.map(async (r) => {
          const points = await pointsBetween(
            r.startedAt,
            r.endedAt,
            r.sessionId ?? undefined
          );
          return { ...r, meters: trackLength(points), points: points.length };
        })
      );
      setRows(enriched);
    })();
  }, []);

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Nenhuma gravação ainda.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.date}>
              {new Date(item.startedAt).toLocaleString('pt-BR')}
            </Text>
            <Text style={styles.duration}>{(item.durationMs / 1000).toFixed(0)} s</Text>
          </View>

          <Text style={styles.coords}>
            {item.startLat != null
              ? `${item.startLat.toFixed(6)}, ${item.startLon!.toFixed(6)}`
              : 'sem coordenada'}
          </Text>

          <View style={styles.tags}>
            <Tag
              text={
                item.metadataEmbedded === true
                  ? 'local no .mp4'
                  : item.metadataEmbedded === false
                    ? 'falhou no .mp4'
                    : 'só no banco'
              }
              tone={
                item.metadataEmbedded === true
                  ? 'ok'
                  : item.metadataEmbedded === false
                    ? 'bad'
                    : 'muted'
              }
            />
            <Tag text={`${item.points} pontos`} tone="muted" />
            <Tag text={`${(item.meters / 1000).toFixed(2)} km`} tone="muted" />
            <Tag
              text={item.sizeBytes ? `${(item.sizeBytes / 1048576).toFixed(1)} MB` : '—'}
              tone="muted"
            />
          </View>
        </View>
      )}
    />
  );
}

function Tag({ text, tone }: { text: string; tone: 'ok' | 'bad' | 'muted' }) {
  return (
    <View style={[styles.tag, tone === 'ok' && styles.tagOk, tone === 'bad' && styles.tagBad]}>
      <Text
        style={[
          styles.tagText,
          tone === 'ok' && styles.tagTextOk,
          tone === 'bad' && styles.tagTextBad,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1416' },
  content: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1416' },
  empty: { color: '#74878C' },

  card: {
    backgroundColor: '#141F22',
    borderWidth: 1,
    borderColor: '#26363A',
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  date: { color: '#E8EFF0', fontSize: 14 },
  duration: { color: '#74878C', fontSize: 13, fontVariant: ['tabular-nums'] },
  coords: { color: '#A3B4B8', fontSize: 12, fontVariant: ['tabular-nums'] },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#1D2A2D',
  },
  tagOk: { backgroundColor: '#143438' },
  tagBad: { backgroundColor: '#3A211E' },
  tagText: { color: '#74878C', fontSize: 11 },
  tagTextOk: { color: '#4FBDC7' },
  tagTextBad: { color: '#E8867A' },
});
