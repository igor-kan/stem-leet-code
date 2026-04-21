# STEM LeetCode

LeetCode-style STEM coding practice platform with in-browser judging, subject-driven problem sets, and automatic GitHub Pages deployment.

## Live

- GitHub Pages: https://igor-kan.github.io/stem-leet-code/

## Features

- LeetCode-like split layout: problem list, statement/editorial/submissions tabs, and code panel.
- STEM-focused challenge bank across Physics, Electrical Engineering, Biology, Signal Processing, Bioinformatics, Robotics, Group Theory, Linear Algebra, Statistics, Probability, and Regression Analysis.
- Multi-language starter templates (`JavaScript`, `Python`, `C++`, `Java`, `Lean4`).
- In-browser judge for JavaScript and Lean4 bridge mode with:
  - Run mode (public tests)
  - Submit mode (public + hidden tests)
  - status, runtime, and per-case output
  - Lean submit proof-quality gating (`theorem/lemma` presence and `sorry/admit` rejection)
- Local persistence of editor code and submission history.
- Community systems:
  - authentication (`Sign In` / `Sign Up`)
  - leaderboard with composite ranking
  - peer verification queue (review others' submissions)
  - contributor scoring (solution + review quality + consensus alignment)
  - discuss board with problem-scoped threads, voting, and replies
- LeetCode-style productivity systems:
  - advanced catalog filters (difficulty, topic, tag, status, bookmark-only)
  - per-problem bookmarks, progressive hints, and private notes tab
  - proof mode tab with Lean readiness checks, checklist, and proof-notes workflow
  - daily challenge with streak tracking
  - weekly timed contest mode with countdown and scoped contest submissions
  - timed hard-problem mock exams (topic filtered)
  - progress dashboard by difficulty/topic plus recent activity
  - curated study-plan tracks (Group Theory, Linear Algebra, Probability/Statistics, Regression)

## Run Locally

```bash
npm install
npm run type-check
npm run build
npm run dev
```

## Community Backend Setup (Supabase)

1. Create a Supabase project.
2. Run the SQL in [`data/supabase-community-schema.sql`](data/supabase-community-schema.sql).
3. Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Restart `npm run dev`.

If env vars are missing, the app runs in local fallback mode with browser storage.

## Deployment

Deployment is handled by `.github/workflows/pages.yml` on every push to `main`.

Quality checks run in `.github/workflows/ci.yml` (`type-check` + `build`) for pushes and pull requests.
