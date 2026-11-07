# Frontal Lobe Trainer – Mobile (Expo)

React Native / Expo / TypeScript app hosting the **Verbal N-Back** module.

```bash
cd mobile
npm install
npm start          # Expo dev server
npm test           # Jest (engine, persistence)
npm run typecheck  # tsc --noEmit
```

## Verbal N-Back

A training exercise for verbal working memory. It is not a diagnostic or
therapeutic tool and makes no claims about clinical or everyday outcomes.

### Layout

```
src/features/verbalNBack/
  engine/        pure TypeScript, no React / RN / storage imports
    config.ts      constants, level ladder, thresholds, config validation
    random.ts      seeded PRNG (reproducible sequences)
    sequence.ts    generator + independent validator/classifier
    scoring.ts     outcome classification, block metrics
    adaptation.ts  promotion / maintenance / demotion rules
    clock.ts       monotonic clock + scheduler abstractions
    blockRunner.ts timing state machine for one block
  persistence/   KeyValueStore contract, repository, AsyncStorage adapter
  application/   recordBlock(): engine decision + persistence
  ui/            React hook (lifecycle, AppState) and screen
  __tests__/     generation, scoring, timing, adaptation, persistence
```

### Specification

| Parameter | Value |
|---|---|
| Stimuli | letters A–H |
| Stimulus duration | 500 ms |
| Stimulus onset interval (SOI) | per level, see ladder |
| Trials per block | 2 warm-up (not scored) + 40 scored |
| Targets | exactly 12 (match at distance N) |
| Lures | 3 × N-1 and 3 × N+1 (configurable) |
| Response | single "match" button, first press per trial counts |

**Level ladder** (start: index 0)

| Index | N | SOI |
|---|---|---|
| 0 | 2 | 3000 ms |
| 1 | 2 | 2500 ms |
| 2 | 2 | 2000 ms |
| 3 | 3 | 3500 ms |
| 4 | 3 | 3000 ms |
| 5 | 3 | 2500 ms |

### Sequence generation

Positions are planned first (targets, N-1 lures, N+1 lures, fillers) and
letters are then filled front to back. Each position is checked against the
three critical distances N-1, N and N+1 when it is written; because a position's
class depends only on earlier letters, the final sequence contains exactly the
planned targets/lures and nothing else. Targets and lures are "pure" (exactly
one match), fillers and warm-up trials match at none of these distances.
Every sequence is re-checked by an independent validator before use; failed
attempts are retried with a fresh plan. Sequences are reproducible from their
seed.

### Scoring

Hit / miss / false alarm / correct rejection over the 40 scored trials.
Hit rate = H / (H + M), specificity = CR / (CR + FA), balanced accuracy = their
mean. Also stored: mean/median hit RT, mean false-alarm RT, false alarms on
N-1/N+1 lures, anticipatory responses (< 150 ms, flagged only) and ignored
extra presses.

### Timing

- Onsets are scheduled on an absolute grid (`firstOnset + k × SOI`), so timer
  jitter does not accumulate.
- The stimulus is hidden 500 ms after its *measured* onset.
- The response window of a trial runs from its onset to the next onset.
- All timestamps come from a monotonic clock (`performance.now()`, guarded
  against regressions); RT = response timestamp − measured onset.
- Only the first press per trial is recorded; further presses are counted in
  `ignoredResponses`. Responses are taken on `onPressIn` to reduce latency.
- Limitation: JS timestamps mark when React Native was asked to render, not
  the physical display refresh. RTs therefore carry a device-dependent offset
  of roughly one frame.

### Interruptions

A block is aborted (status `interrupted`, no metrics) when the app leaves the
foreground, the user aborts, the screen unmounts, or an onset fires more than
250 ms late (e.g. a blocked JS thread). Interrupted blocks are stored for
transparency but **ignored by the adaptation** – they neither count towards nor
break a streak. There is no mid-block resume; the next block uses a new
sequence at the same level. The screen is kept awake during a block.

### Adaptation

| Block result | Effect |
|---|---|
| BA ≥ 85 % **and** hit rate ≥ 80 % **and** specificity ≥ 80 % | counts towards promotion; 2 consecutive → next level |
| 65 % ≤ BA (otherwise) | maintain, streaks reset |
| 50 % ≤ BA < 65 % | counts towards demotion; 2 consecutive → previous level |
| BA < 50 % | immediate demotion |

Streaks reset after every level change. The ladder ends are caps.
