import type { AdaptationDecision, InterruptionReason, LevelSpec } from '../engine';

/** All user-facing copy in one place (German). */
export const strings = {
  title: 'Verbales N-Back',
  levelLabel: (level: LevelSpec) =>
    `${level.n}-Back · ${(level.soiMs / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1 })} s Takt`,
  instructions: (n: number) =>
    `Nacheinander erscheinen Buchstaben. Tippe auf „Treffer“, wenn der aktuelle Buchstabe ` +
    `derselbe ist wie der vor ${n} Schritten. Sonst tippst du nichts. ` +
    `Die ersten beiden Buchstaben dienen nur dem Einstieg und werden nicht gewertet.`,
  disclaimer:
    'Eine Übung zum Arbeitsgedächtnis. Sie stellt keine Diagnose, ersetzt keine Behandlung ' +
    'und die Ergebnisse sagen nichts über Alltagsleistungen oder Gesundheit aus.',
  start: 'Block starten',
  next: 'Nächster Block',
  abort: 'Abbrechen',
  respond: 'Treffer',
  getReady: 'Gleich geht es los …',
  warmup: 'Einstieg – nicht gewertet',
  progress: (done: number, total: number) => `${done} / ${total}`,
  loading: 'Lade Fortschritt …',
  loadError: 'Der gespeicherte Fortschritt konnte nicht geladen werden. Es wird mit Stufe 1 begonnen.',
  saveError: 'Das Ergebnis konnte nicht gespeichert werden.',
  resultTitle: 'Ergebnis des Blocks',
  hits: 'Treffer',
  misses: 'Ausgelassen',
  falseAlarms: 'Fehlalarme',
  correctRejections: 'Korrekt nicht reagiert',
  hitRate: 'Trefferquote',
  specificity: 'Spezifität',
  balancedAccuracy: 'Balanced Accuracy',
  meanRt: 'Mittlere Reaktionszeit (Treffer)',
  percent: (v: number) => `${Math.round(v * 100)} %`,
  ms: (v: number | null) => (v === null ? '–' : `${Math.round(v)} ms`),
  decision: (d: AdaptationDecision): string => {
    switch (d.action) {
      case 'promote':
        return 'Nächster Block auf der nächsthöheren Stufe.';
      case 'demote':
        return 'Nächster Block eine Stufe leichter.';
      case 'ignored':
        return 'Dieser Block wird für die Stufenanpassung nicht berücksichtigt.';
      case 'maintain':
        if (d.capped) return 'Die Stufe bleibt (Ende der Skala).';
        if (d.state.consecutivePromotionBlocks > 0) {
          return 'Stufe bleibt. Noch ein Block dieser Güte, dann geht es eine Stufe höher.';
        }
        if (d.state.consecutiveLowBlocks > 0) {
          return 'Stufe bleibt vorerst.';
        }
        return 'Die Stufe bleibt gleich.';
    }
  },
  interrupted: (reason: InterruptionReason): string => {
    const why: Record<InterruptionReason, string> = {
      'app-background': 'Die App war im Hintergrund.',
      'user-abort': 'Der Block wurde abgebrochen.',
      'timing-fault': 'Die Darbietung kam zeitlich aus dem Takt.',
      unmounted: 'Der Bildschirm wurde verlassen.',
    };
    return `${why[reason]} Der Block wird nicht gewertet – ein neuer Block startet mit neuer Buchstabenfolge.`;
  },
} as const;
