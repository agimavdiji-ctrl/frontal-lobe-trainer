import {
  LETTERS,
  LEVEL_LADDER,
  Letter,
  analyzeSequence,
  classifyPosition,
  createBlockConfig,
  createRng,
  generateSequence,
  getLevel,
  prepareBlock,
  validateSequence,
} from '../engine';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

describe('sequence generation', () => {
  describe.each(LEVEL_LADDER.map((l) => [`${l.n}-back @ ${l.soiMs} ms`, l.index] as const))(
    '%s',
    (_label, levelIndex) => {
      it('always yields a sequence that meets the full specification', () => {
        for (const seed of SEEDS) {
          const { config, sequence } = prepareBlock(levelIndex, seed);
          const letters = sequence.trials.map((t) => t.letter);

          expect(letters).toHaveLength(42);
          expect(sequence.trials.filter((t) => !t.scored)).toHaveLength(2);
          expect(sequence.trials.filter((t) => t.scored)).toHaveLength(40);
          expect(sequence.trials.filter((t) => t.isTarget)).toHaveLength(12);
          expect(letters.every((l) => (LETTERS as readonly string[]).includes(l))).toBe(true);
          expect(validateSequence(letters, config)).toEqual({ valid: true, errors: [] });

          const a = analyzeSequence(letters, config.n, config.warmupTrials);
          expect(a.targets).toBe(12);
          expect(a.luresNMinus1).toBe(3);
          expect(a.luresNPlus1).toBe(3);
          expect(a.ambiguous).toBe(0);
          expect(a.warmupMatches).toBe(0);
        }
      });

      it('labels every trial exactly as an independent classifier sees it', () => {
        for (const seed of SEEDS.slice(0, 50)) {
          const { config, sequence } = prepareBlock(levelIndex, seed);
          const letters = sequence.trials.map((t) => t.letter);
          sequence.trials.forEach((t, i) => {
            const observed = classifyPosition(letters, i, config.n);
            if (t.scored) expect(observed).toBe(t.kind);
            else expect(observed).toBe('filler'); // warm-up: no matches at all
          });
        }
      });

      it('places targets exactly N back and lures exactly N-1 / N+1 back', () => {
        const { config, sequence } = prepareBlock(levelIndex, 4242);
        const L = sequence.trials.map((t) => t.letter);
        const n = config.n;
        for (const t of sequence.trials) {
          const i = t.index;
          if (t.kind === 'target') {
            expect(L[i]).toBe(L[i - n]);
            expect(L[i]).not.toBe(L[i - n + 1]);
            if (i - n - 1 >= 0) expect(L[i]).not.toBe(L[i - n - 1]);
          }
          if (t.kind === 'lure-n-minus-1') {
            expect(L[i]).toBe(L[i - (n - 1)]);
            expect(L[i]).not.toBe(L[i - n]);
          }
          if (t.kind === 'lure-n-plus-1') {
            expect(L[i]).toBe(L[i - (n + 1)]);
            expect(L[i]).not.toBe(L[i - n]);
          }
        }
      });
    },
  );

  it('is reproducible for a seed and varies across seeds', () => {
    const a = prepareBlock(0, 123).sequence.trials.map((t) => t.letter).join('');
    const b = prepareBlock(0, 123).sequence.trials.map((t) => t.letter).join('');
    const c = prepareBlock(0, 124).sequence.trials.map((t) => t.letter).join('');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('honours custom lure counts, including zero', () => {
    for (const lureCounts of [
      { nMinus1: 0, nPlus1: 0 },
      { nMinus1: 5, nPlus1: 2 },
    ]) {
      const config = createBlockConfig(getLevel(3), { lureCounts });
      const seq = generateSequence(config, createRng(99), 99);
      const a = analyzeSequence(
        seq.trials.map((t) => t.letter),
        config.n,
        config.warmupTrials,
      );
      expect(a.luresNMinus1).toBe(lureCounts.nMinus1);
      expect(a.luresNPlus1).toBe(lureCounts.nPlus1);
      expect(a.targets).toBe(12);
    }
  });

  it('rejects impossible configurations', () => {
    expect(() => createBlockConfig({ index: 0, n: 1, soiMs: 3000 })).toThrow(/n must be/);
    expect(() => createBlockConfig(getLevel(0), { soiMs: 400 })).toThrow(/soiMs/);
    expect(() => createBlockConfig(getLevel(0), { targetCount: 41 })).toThrow(/targetCount/);
  });
});

describe('sequence validation', () => {
  const config = createBlockConfig(getLevel(0)); // 2-back

  it('detects an unintended target', () => {
    const { sequence } = prepareBlock(0, 7);
    const letters = sequence.trials.map((t) => t.letter) as Letter[];
    // Turn the first filler into an accidental 2-back match.
    const i = sequence.trials.findIndex((t) => t.kind === 'filler' && t.index >= 4);
    letters[i] = letters[i - 2];
    const v = validateSequence(letters, config);
    expect(v.valid).toBe(false);
  });

  it('flags ambiguous positions and matches inside the warm-up', () => {
    // A A A …: position 2 matches at distance 1, 2 → ambiguous; warm-up 1 matches at 1.
    const letters = Array.from({ length: 42 }, () => 'A') as Letter[];
    const v = validateSequence(letters, config);
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/ambiguous/);
    expect(v.errors.join(' ')).toMatch(/warm-up/);
  });

  it('flags letters outside the alphabet and a wrong length', () => {
    const v = validateSequence(['A', 'Z' as Letter], config);
    expect(v.errors.join(' ')).toMatch(/length/);
    expect(v.errors.join(' ')).toMatch(/not in alphabet/);
  });
});
