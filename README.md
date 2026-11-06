# 🧠 Frontal Lobe Trainer

A modern, science-inspired web app for training your **prefrontal cortex** — the brain's "command center" responsible for working memory, inhibitory control, cognitive flexibility, attention, and planning & decision-making.

Built with **Vue 3 + Vite**, wrapped in a polished **dark glassmorphism** UI with ambient light blobs, sound feedback, and full keyboard support.

![Vue](https://img.shields.io/badge/Vue-3.5-42b883) ![Vite](https://img.shields.io/badge/Vite-8-646cff) ![Router](https://img.shields.io/badge/vue--router-4-42b883)

---

## ✨ Features

- **19 cognitive training games** across 5 core domains (see table below)
- **Domain filter tabs** — quickly browse games by cognitive area
- **Game flow** — rule intro → difficulty selection → play → result card
- **Training profile** (`/profile`) — ability radar chart, 84-day streak heatmap, per-game best records with recent-performance trend lines
- **Achievement system** (`/achievements`) — 4 achievements per game (first clear, master, regular, **extreme: flawless run at max difficulty ×5**) plus 4 global achievements, with toast popups
- **Glassmorphism dark theme** — ambient floating light blobs, frosted-glass cards, route transitions
- **Web Audio sound effects** — synthesized feedback (correct/wrong/flip/match/win) with no audio files
- **Keyboard accessibility** — number/arrow keys for several games, Space for Go/No-Go & Stop Signal
- **Local-first data** — scores, streaks and achievements stored in `localStorage` (no backend)

## 🎮 Games

| Domain | Games |
|---|---|
| Working Memory | Digit Span, Digit Memory Test, Spatial Memory, N-Back, Memory Match, Timed Match, Serial Addition |
| Inhibitory Control | Stroop Test, Go/No-Go, Stop Signal, Flanker Task |
| Cognitive Flexibility | Brain Shift Overdrive, DCCS Card Sorting, Trail Making (TMT-B), Task Switching |
| Attention | Schulte Grid, Visual Search |
| Planning & Decision | Tower of Hanoi, Risk Decision |

Each game offers adjustable difficulty (sequence length, grid size, reaction window, timer, etc.).

> DCCS Card Sorting now draws colors and shapes from independent pools and combines them randomly every round, so a red card is no longer always a circle. Flanker Task, Trail Making (TMT-B), Task Switching, and Serial Addition were added to cover inhibitory control, task switching, and working memory.

## 📱 Mobile app (Expo)

The `mobile/` folder contains a React Native / Expo / TypeScript app with a
**Verbal N-Back** module (adaptive 2-/3-back, letters A–H). See
[`mobile/README.md`](mobile/README.md) for the specification, architecture and tests.

## 🧩 Tech Stack

- [Vue 3](https://vuejs.org/) with `<script setup>` SFCs
- [Vue Router 4](https://router.vuejs.org/) (hash history)
- [Vite](https://vite.dev/) — fast dev server & optimized builds
- Plain CSS with CSS variables (no UI framework)

## 🚀 Getting Started

```bash
# install dependencies
npm install

# start dev server
npm run dev

# production build (outputs to dist/)
npm run build

# preview the production build locally
npm run preview
```

## ☁️ Deploying to Vercel

The project is a static SPA — deploy the `dist/` output.

### Option A — Vercel CLI (fastest)

```bash
npm i -g vercel
npm run build
vercel --prod
```

### Option B — Git integration (auto-deploy)

1. Push the repo to GitHub.
2. In the [Vercel dashboard](https://vercel.com/new), click **Import** and select the repo.
3. Vercel auto-detects **Vite**. If not, set:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Deploy. Every push to the default branch triggers a new build.

### Telling Vercel to use `dist/`

- **CLI**: add `"build": "vite build"` to `package.json` (already present) — the CLI picks up the output automatically.
- **Dashboard**: set **Output Directory** to `dist`.
- **Optional `vercel.json`** (commit it to the repo):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

> The app uses **hash-based routing** (`createWebHashHistory`), so no SPA rewrite/redirect config is required on Vercel.

## 📁 Project Structure

```
src/
├── components/        # HeroSection, GameList, GameFilterTabs, Guide, ...
├── games/             # 19 game components + registry.js (metadata & difficulty config)
├── utils/             # storage.js, sound.js, achievements.js
├── views/             # HomePage, GameDetail, Profile, Achievements
├── router/index.js    # routes: / , /game/:id , /profile , /achievements
├── App.vue            # root with route transitions
└── main.js
```

## 🏅 Scoring & Achievements

Best-record metrics adapt to each game type:

| Metric | Games |
|---|---|
| Accuracy % | Digit Span, N-Back, Stroop, Go/No-Go, Stop Signal, Flanker, Brain Shift, DCCS, Visual Search, Task Switch, Serial Addition |
| Highest level / digits | Digit Memory, Spatial Memory |
| Fewest moves | Memory Match |
| Fastest time | Schulte Grid, Timed Match, Trail Making |
| Efficiency | Tower of Hanoi |
| Average coins | Risk Decision |

## 🧑‍💻 Author & Links

- GitHub: [SCeLees](https://github.com/SCeLees/Frontal-lobe-trainer)
- Personal site: [gts.us.kg](https://gts.us.kg/)

Built with **Vite** · Powered by **DeepSeek** · Deployed on **Vercel** Edge Network · © 2026 GTSense

## 📄 License

This project is for personal/educational use. No license file is included — contact the author for reuse terms.
