import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BlockMetrics } from '../engine';
import { VerbalNBackRepository } from '../persistence';
import { strings } from './strings';
import { useVerbalNBack } from './useVerbalNBack';

export interface VerbalNBackScreenProps {
  readonly repository: VerbalNBackRepository;
}

export function VerbalNBackScreen({ repository }: VerbalNBackScreenProps) {
  const vm = useVerbalNBack({ repository });

  if (vm.status === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{strings.loading}</Text>
      </View>
    );
  }

  if (vm.status === 'running') {
    const s = vm.snapshot;
    const waiting = !s || s.trialIndex < 0;
    return (
      <View style={styles.runContainer}>
        <View style={styles.runHeader}>
          <Text style={styles.levelText}>{strings.levelLabel(vm.level)}</Text>
          <Text style={styles.muted} accessibilityLiveRegion="polite">
            {waiting
              ? strings.getReady
              : s.isWarmup
                ? strings.warmup
                : strings.progress(s.scoredPresented, s.scoredTotal)}
          </Text>
        </View>

        <View style={styles.stimulusBox} accessible accessibilityLabel={s?.letter ?? ''}>
          <Text style={styles.stimulus}>{s?.letter ?? ''}</Text>
        </View>

        <Pressable
          onPressIn={() => vm.respond()}
          accessibilityRole="button"
          accessibilityLabel={strings.respond}
          style={({ pressed }) => [styles.respondButton, pressed && styles.respondButtonPressed]}
        >
          <Text style={styles.respondText}>{strings.respond}</Text>
        </Pressable>

        <Pressable onPress={vm.abort} accessibilityRole="button" style={styles.linkButton}>
          <Text style={styles.linkText}>{strings.abort}</Text>
        </Pressable>
      </View>
    );
  }

  const result = vm.lastResult;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{strings.title}</Text>
      <Text style={styles.levelText}>{strings.levelLabel(vm.level)}</Text>

      {vm.error === 'load' && <Text style={styles.error}>{strings.loadError}</Text>}
      {vm.error === 'save' && <Text style={styles.error}>{strings.saveError}</Text>}

      {result?.status === 'interrupted' && result.interruption && (
        <Text style={styles.notice}>{strings.interrupted(result.interruption.reason)}</Text>
      )}

      {result?.status === 'completed' && result.metrics && (
        <ResultCard metrics={result.metrics} />
      )}

      {vm.lastDecision && result?.status === 'completed' && (
        <Text style={styles.notice}>{strings.decision(vm.lastDecision)}</Text>
      )}

      {!result && <Text style={styles.body}>{strings.instructions(vm.level.n)}</Text>}

      <Pressable onPress={vm.startBlock} accessibilityRole="button" style={styles.primaryButton}>
        <Text style={styles.primaryText}>{result ? strings.next : strings.start}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>{strings.disclaimer}</Text>
    </ScrollView>
  );
}

function ResultCard({ metrics: m }: { metrics: BlockMetrics }) {
  const rows: [string, string][] = [
    [strings.hits, `${m.hits} / ${m.targets}`],
    [strings.misses, String(m.misses)],
    [strings.falseAlarms, `${m.falseAlarms} / ${m.nonTargets}`],
    [strings.correctRejections, String(m.correctRejections)],
    [strings.hitRate, strings.percent(m.hitRate)],
    [strings.specificity, strings.percent(m.specificity)],
    [strings.balancedAccuracy, strings.percent(m.balancedAccuracy)],
    [strings.meanRt, strings.ms(m.meanHitRtMs)],
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{strings.resultTitle}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.body}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const colors = {
  bg: '#0f1222',
  surface: '#1a1f36',
  text: '#eef0f8',
  muted: '#9aa3c0',
  accent: '#6c8cff',
  accentPressed: '#4a67d6',
  error: '#ff8a8a',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  page: { padding: 24, gap: 16, backgroundColor: colors.bg, flexGrow: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  levelText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14 },
  notice: { color: colors.text, fontSize: 15, lineHeight: 22 },
  error: { color: colors.error, fontSize: 14 },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  runContainer: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'space-between' },
  runHeader: { alignItems: 'center', gap: 6, marginTop: 24 },
  stimulusBox: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stimulus: { color: colors.text, fontSize: 120, fontWeight: '700' },
  respondButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  respondButtonPressed: { backgroundColor: colors.accentPressed },
  respondText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  linkButton: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: colors.muted, fontSize: 15 },
});
