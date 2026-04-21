# STEM LeetCode

LeetCode-style STEM coding practice platform with in-browser judging, subject-driven problem sets, and automatic GitHub Pages deployment.

## Live

- GitHub Pages: https://igor-kan.github.io/stem-leet-code/

## Features

- LeetCode-like split layout: problem list, statement/editorial/submissions tabs, and code panel.
- STEM-focused challenge bank across Physics, Electrical Engineering, Biology, Signal Processing, Bioinformatics, and Robotics.
- Multi-language starter templates (`JavaScript`, `Python`, `C++`, `Java`).
- In-browser judge for JavaScript with:
  - Run mode (public tests)
  - Submit mode (public + hidden tests)
  - status, runtime, and per-case output
- Local persistence of editor code and submission history.

## Run Locally

```bash
npm install
npm run type-check
npm run build
npm run dev
```

## Deployment

Deployment is handled by `.github/workflows/pages.yml` on every push to `main`.
