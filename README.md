# Creditbridge

Creditbridge helps **Henry Ford College (HFCC)** students see which HFCC courses **may transfer to Wayne State University (WSU)** and may fit **WSU General Education requirements**, track completed / in-progress / planned courses, and identify possible next courses.

> All results are **possible matches computed from the supplied data files — not an official WSU degree evaluation.** Always confirm with a WSU advisor.

It is a **static, installable Progressive Web App (PWA)** built with **Vite + React + TypeScript**, deployable to Vercel as-is. No server, account, live API, or scraping: the cleaned data is bundled with the app and cached for offline use. The student's plan is saved **only in the browser's localStorage** — nothing is uploaded.

## Features

- **Find Classes** — search ~3,300 HFCC courses by code or name; filter by WSU Gen Ed area (CIV, CI, GL, NSI, SI, USP, BC, IC, OC, QE), transfer status (transfers / does not transfer), and equivalency type (exact / broad `XXX` / none). Results are shown in a **collapsible dropdown**. Each card lists every WSU equivalency (multiple mappings and effective terms are preserved), possible Gen Ed areas, and an **Add to plan** button.
- **My Courses** — a **three-column table** (WSU Gen Ed Category · HFCC Course · WSU Equivalent) is preloaded with all 10 required WSU categories (6 Inquiry + 4 Competencies); course cells stay empty until you add courses. Click a course to edit it inline (status, term, grade, HFCC credits, notes, remove). Each category chip shows its credit requirement on hover, and WSU equivalents show the credits listed in the supplied requirement files. If a course may fit multiple categories (e.g. HUM101 → MUH1340, which the WSU file lists under both CI and GL), a red **“⚠ choose category”** notice appears next to the category with an inline picker — once you pick one, the course only appears in (and counts toward) that category's row. Planned and in-progress courses are never counted as completed.
- **Gen Ed Progress** — each of the six Inquiry groups and four Competencies is a **collapsed dropdown** (hidden by default, click the arrow to open) showing its **credit requirement from the TXT files** next to the name (Inquiry: “3 cr required” per the file’s ≥3-credit rule; Competencies: the credit range of the listed WSU courses, e.g. QE “3–5 cr”). Shows which tracked courses may fit each area, what remains uncovered, possible next HFCC courses, the **NSI second-course-with-lab condition tracked separately**, and warnings for overlapping matches (one course is never automatically counted toward multiple requirements unless the student picks one via the My Courses chooser; Competency courses generally should not also satisfy Inquiry requirements).
- **Data & Settings** — data sources and caveats, offline-use explanation, **JSON export/import** of the plan, and plan clearing.

## Data and matching rules

Source files (verbatim copies) live in [`data/source/`](data/source/). `npm run build:data` parses them into `src/data/courses.json` and `src/data/requirements.json`, which are committed and bundled with the app.

- A WSU equivalent matches a Gen Ed requirement **only when the exact WSU code appears in the supplied requirement lists** (cross-listed codes like `AFS/ENG 2390` are split).
- Broad codes containing `X` (`BIO1XXX`, `GEN2XXX`, `CMT2X10`, …) are **broad transfer credit — never a confirmed Gen Ed match**.
- **"Does not transfer"** is shown separately from **"transfers, but no specific Gen Ed match was identified"**.
- Multiple equivalencies per HFCC course and effective terms are preserved; gaps are labeled "needs review" where relevant (documented on the Data & Settings page).
- **BC, IC, QE require a grade of C or better** — applied when a grade is entered; otherwise flagged as needing confirmation.
- **WSU Gen Ed minimum: 34 credits** — Competencies 12 cr (BC, IC, OC, QE × 3 cr) + Inquiry 22 cr (CIV, CI, GL, SI, USP × 3 cr + **NSI 7 cr = two courses, one with a lab**). Each category label shows its required credits ("3 cr required"; NSI: "7 cr required · 2 courses (1 with lab)"), and Gen Ed Progress shows a summary card (**areas covered · ≈ credits of 34**) plus an **“n of 7” inquiry-course counter**.
- Each Inquiry group requires a course of **at least 3 credits** (entered HFCC credits are used when available, otherwise the WSU-listed credits of the matched course, marked as such; unknown credits → needs review). Per the file's rule — *“the NSI group requires a second NSI course with a lab section, for a minimum total of seven courses”* — the NSI area only shows **Covered** with **two** qualifying NSI courses, one with a lab. Lab status comes only from the notes in the supplied NSI list and is never inferred.
- Lab and concurrent-course notes from the source are preserved verbatim.

Sample checks (covered by tests): `ENG131 → ENG1020 → BC`, `ART120 → AH1000 → CI`, `MATH131 → MAT1000 → QE`, `ANTH131 → ANT1100 → possible SI **and** USP (not auto double-counted)`.

## Project structure

```
data/source/               # verbatim supplied source files
scripts/build-data.ts      # parses sources -> src/data/*.json (tsx)
scripts/serve-dist.mjs     # tiny static server for verifying dist/
src/lib/parse.ts           # parsers for the three source files (pure, unit-tested)
src/lib/matching.ts        # HFCC -> WSU -> Gen Ed matching + search/filter rules
src/lib/progress.ts        # Gen Ed progress computation from the plan
src/lib/plan.ts            # localStorage plan + JSON export/import + grade rule
src/lib/store.tsx          # React context for the plan
src/components/            # FindClasses, MyCourses, Progress, DataSettings, bits
src/data/                  # generated normalized JSON (committed)
tests/                     # vitest suites (parse, matching, progress, app smoke)
```

## Develop

```bash
npm install
npm run build:data   # regenerate src/data/*.json from data/source/ (already committed)
npm run dev          # dev server
npm test             # run the test suites
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ (or: node scripts/serve-dist.mjs 4173)
```

## Tests

`npm test` runs 49 tests across 4 files, all passing:

- `tests/parse.test.ts` (16) — parsing of all three source files: row counts, exact/broad/none classification, multiple equivalencies + effective terms, cross-list splitting, six Inquiry groups, four Competencies, C-or-better rule extraction, lab-note preservation, rules.
- `tests/matching.test.ts` (14) — the four sample mappings, broad `XXX` mappings (transfer but no Gen Ed match), "Does not transfer" vs "transfers with no Gen Ed match", overlapping categories (POLS101 → CIV+SI; PHYS120 → QE+NSI), search filters, area suggestions, caveat behavior.
- `tests/progress.test.ts` (14) — grade rule (C or better for BC/IC/QE; missing grade → needs confirmation), planned/in-progress never counted as completed, ≥3-credit rule from entered vs WSU-listed credits, NSI lab condition (unconditional / conditional / never assumed), overlap warnings, plan export/import round-trip and validation errors, localStorage persistence.
- `tests/app.test.tsx` (5) — jsdom smoke test of the real app: navigation, collapsible results dropdown, ENG131 → BC card, add-to-plan → 3-column table row (WSU Gen Ed Category / HFCC Course / WSU Equivalent) → progress "on track" (not covered), does-not-transfer display, broad-credit display, Data & Settings offline/export UI.

## Offline / PWA

`vite-plugin-pwa` generates `sw.js` (Workbox) with `registerType: 'autoUpdate'`. The production build precaches the app shell, the bundled JSON data, CSS, and icons (13 precache entries), and uses a navigation fallback to `index.html`. **Open the hosted site once while online** (or install it) — after that it works fully offline. The manifest (`manifest.webmanifest`) provides name, icons (192/512/maskable), theme color, and `display: standalone`. Verified: `npm run build` → `dist/sw.js` precache list contains `index.html`, all JS/CSS (including bundled data), icons, and the manifest; all served with HTTP 200.

## Deploy to Vercel (static)

1. Push this repository to GitHub (Vercel imports from your Git provider).
2. In the Vercel dashboard: **Add New → Project → Import** the repository.
3. Framework preset: **Vite** (auto-detected). Leave the defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Click **Deploy**. Vercel serves `dist/` as a static site with SPA fallback; the service worker (`dist/sw.js`) is served from the root, so the PWA installs and works offline after the first visit.
5. (Optional) Add a custom domain under **Settings → Domains**.

No environment variables or server functions are needed.
