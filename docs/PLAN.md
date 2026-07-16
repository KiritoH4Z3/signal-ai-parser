# Signal AI Parser — Next.js 14 Rebuild (10/10 Portfolio Setpiece)

## Context

`signal-ai-parser/` is currently a Streamlit + Gemini app: paste messy market text → structured briefing (summary, entities, KPI cards, sentiment gauge, topics). It works, but as a portfolio setpiece it's capped: Streamlit look, deprecated `gemini-1.5-flash`, no in-app API key entry, no batch/RAG story, thin CI.

**Goal (user decisions, locked):** complete rebuild on **Next.js 14 (App Router) + TypeScript + Tailwind v3**, Vercel-ready, keeping the market/news-intelligence focus. **BYOK Gemini only** — an in-app API key section, session-only, never stored server-side. Demo mode must work with zero key. RAG included as a cuttable phase. This is a portfolio setpiece for AI-role job hunting — it must look exceptional and demonstrate real AI engineering.

**Execution model (user request):** this plan is written to `signal-ai-parser/docs/PLAN.md`; **Opus subagents read it and perform the work** phase by phase, with the main session verifying between phases (contracts-first, per swarm preference). Commits carry **no Claude co-author trailer**.

**Verified facts:** remote `github.com/KiritoH4Z3/signal-ai-parser` exists (branch `main`, holds the Python app); local folder has **no `.git`**; `gh` authenticated (HTTPS, repo scope); Node 18.19.1 → must pin Next 14.2.x / React 18 / Tailwind 3.4 / Vitest 2.1.9 (`node18-nextjs-preflight` skill); dev port **3003** (3000–3002 taken).

## Global decisions

| Decision | Value |
|---|---|
| Gemini access | Plain REST fetch to `generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent` — no AI SDK dep (old SDK deprecated; REST = full header control + trivial mocking) |
| Model | `GEMINI_MODEL = "gemini-2.5-flash"` — single constant in `lib/config.ts`; verified against live `/models` list at ship time (one-line swap if wrong). Embeddings: `gemini-embedding-001` |
| Key transport | Client: `sessionStorage` only (dies with tab). Per-request `X-Gemini-Key` header → API route → Google via `x-goog-api-key` header. Never URL, never logged, never persisted. Optional `process.env.GEMINI_API_KEY` server fallback supported in code but **not set by us** (user's manual step if wanted) |
| History | `localStorage`, cap 10 (parity with Python) |
| Legacy Python app | Deleted from working tree in one commit after git wiring (history preserves it); no `_old` folders (`iterating-without-clones`) |
| Design direction | Dark "intelligence console" — near-black green-teal palette, JetBrains Mono for all data surfaces, hand-built SVG sentiment gauge (no chart lib), persistent StatusLine strip |
| Deploy | Code + README made Vercel-ready; **actual deploy + env key = user's manual steps** |

## Architecture (target file tree)

```
signal-ai-parser/
├── package.json            # "dev": "next dev -p 3003"; pinned deps
├── next.config.mjs         # security headers (CSP, nosniff, DENY, referrer)
├── tailwind.config.ts      # design tokens
├── vitest.config.ts        # environment: node
├── docs/PLAN.md            # this plan (Opus reads it)
├── app/
│   ├── layout.tsx  page.tsx  globals.css        # server shell, next/font (Inter + JetBrains Mono)
│   └── api/
│       ├── analyze/route.ts       # POST: core Gemini proxy
│       ├── validate-key/route.ts  # POST: cheap key check (GET /models?pageSize=1)
│       └── ask/route.ts           # Phase 4: {op:"embed"|"answer"}
├── components/
│   ├── Workbench.tsx        # single "use client" island; state machine idle|loading|report|error + keyState none|untested|valid|invalid
│   ├── InputPanel.tsx  ExampleGallery.tsx  ApiKeyPanel.tsx  HistoryRail.tsx  StatusLine.tsx
│   ├── report/  ReportView, ReportSkeleton, SummaryCard, SentimentGauge(SVG), MetricCards, EntityChips, TopicTags, ErrorPanel, ExportBar
│   └── library/ BriefingLibrary.tsx  AskArchive.tsx          # Phase 4
├── lib/
│   ├── config.ts  types.ts  errors.ts            # THE CONTRACTS — written first
│   ├── extract-json.ts  normalize.ts  markdown.ts  csv.ts  examples.ts   # pure, offline-testable (port of constants.py/examples.py)
│   ├── gemini.ts  prompt.ts  rate-limit.ts       # server-only (import "server-only")
│   ├── key-store.ts  history.ts                  # client-side storage helpers
│   └── vector.ts                                 # Phase 4: cosine, topK
└── tests/  extract-json, normalize, markdown, csv, rate-limit, api-analyze, vector  (.test.ts)
```

### Master contract — `lib/types.ts` (written first; everything codes against it)

```ts
export interface AnalysisResult {
  summary: string;
  entities: { companies: string[]; people: string[]; places: string[] };
  metrics: { label: string; value: string; change: string }[];
  sentiment: { label: "Positive"|"Neutral"|"Negative"; confidence: "High"|"Medium"|"Low";
               confidence_score: number /*0-100*/; reasoning: string };
  topics: string[]; // ≤5
}
// POST /api/analyze: body {text}; key in X-Gemini-Key header
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult; model: string; durationMs: number }
  | { ok: false; error: { code: SignalErrorCode; message: string } };
export interface HistoryEntry { id: string; timestamp: number; preview: string;
  source: string; sentiment: "Positive"|"Neutral"|"Negative"; result: AnalysisResult }
```

### Error taxonomy — `lib/errors.ts` (mirrors Python typed hierarchy)

`missing_key`(401) · `invalid_key`(401) · `rate_limited`(429) · `input_too_short`(400) · `input_too_long`(400) · `empty_response`(502, SAFETY/RECITATION/empty) · `malformed_json`(502) · `api_error`(502). Exports `SignalError`, `errorResponse()`, `FRIENDLY_MESSAGES` map → `ErrorPanel` never shows a stack trace.

### Pipeline semantics (1:1 port from Python — source files listed at bottom)

- `extract-json.ts`: JSON.parse happy path → strip ```json fences → string/escape-aware brace-depth scan (`_slice_first_json_object` port) → throw `malformed_json`.
- `normalize.ts`: `confidenceToScore` (clamp 0–100, bands High=90/Med=65/Low=35, `"85%"`, bool-guard, default 65), `normalizeLabel` (unknown→Neutral), `splitMetric` (currency/magnitude/percent/±change regexes, 60-char label cap), `normalizeResults` (fill missing keys, coerce strays, topics→5, band↔score backfill).
- `gemini.ts` (server-only): JSON-mode call (temp 0.2, maxOutputTokens 1024), safe candidate/parts text extraction, one 800ms retry on transient (429/5xx/network) only, 30s abort, never retry auth errors. `malformed_json` retried once at route level (fresh model call — exact Python semantics).
- `rate-limit.ts`: in-memory sliding window 10 req/min/IP (best-effort; BYOK means visitors spend their own quota).

## Security (ship-gate enforced)

1. Key: sessionStorage only; header transport both hops; grep gate `grep -rn "console.log" app/ lib/` → nothing touching key/text.
2. Server re-validates input length (20k cap hard, min 20); reject >64KB bodies early.
3. No `dangerouslySetInnerHTML` anywhere (grep gate) — JSX auto-escaping replaces Python `safe_html`.
4. Security headers in `next.config.mjs`: tight CSP (self-hosted fonts via next/font), nosniff, X-Frame-Options DENY, strict referrer.
5. `.gitignore`: `.env*`, `node_modules`, `.next`, `graphify-out/`, `__pycache__`.

## UI/UX requirements

- **All states:** empty (dashed panel + hint), loading (`ReportSkeleton` shimmer matching report layout), keyless ("PREVIEW MODE" amber badge; examples serve canned results fully client-side, zero network; Analyze on manual text opens key panel with aistudio.google.com link), error (friendly panel).
- **ApiKeyPanel:** password input + show/hide, format hint (`AIza…` warn-don't-block), **Test key** button → green/red LED via `/api/validate-key`, Clear, privacy note: "Your key stays in this browser tab… never stored, never logged."
- **StatusLine:** `MODEL gemini-2.5-flash · KEY ● live · 1,243 chars · last parse 2.1s`.
- **Exports:** JSON / Markdown / CSV downloads + Copy-Markdown with ✓ flash.
- **A11y AA:** focus-visible rings, `aria-live` result announcements, gauge `role="img"` + label, deltas use ▲/▼ + color (not color alone), `prefers-reduced-motion`, keyboard-operable history. Verify with `accesslint:scan http://localhost:3003`.
- Invoke `frontend-design` skill at Phase 2 start; `web-design-guidelines` review at end.

## Phases (Opus executors; contracts-first; verification per task)

**Phase 0 — Preflight + git (sequential):**
Invoke `node18-nextjs-preflight`. Git: `git init` → `git remote add origin https://github.com/KiritoH4Z3/signal-ai-parser.git` → `git fetch` → `git checkout -B main origin/main` → reconcile → one commit deleting Python app (`app.py utils/ tests/ requirements.txt secrets_template.toml .streamlit/ .github/workflows/tests.yml`) + junk dirs. Scaffold Next 14.2.x/React 18/Tailwind 3.4/Vitest 2.1.9, port 3003, `server-only` pkg. Write this plan to `docs/PLAN.md`. **Verify:** `curl -s localhost:3003 | grep -q Signal`; `npm run build` passes (never while dev runs).

**Phase 1 — Contracts + pipeline (T1.1 first, rest parallel):**
`types.ts`+`errors.ts`+`config.ts` → then parallel: extract-json, normalize, markdown+csv, examples (verbatim port incl. canned results), prompt+gemini+rate-limit → then `api/analyze` + `api/validate-key` routes + route tests (mocked `fetch`). **Verify:** `npx vitest run` green, `npx tsc --noEmit` clean; `curl` drill: short text → `input_too_short`.

**Phase 2 — UI (design system first, then 3 parallel tracks):**
T2.1 tokens/layout/StatusLine (frontend-design skill) → A: Workbench+key-store+ApiKeyPanel · B: InputPanel+counter+ExampleGallery+demo wiring · C: report/* incl. SVG gauge, skeleton, ErrorPanel. **Verify:** keyless example click → full canned report on :3003; every error code visually reachable.

**Phase 3 — History, exports, polish (parallel):**
history.ts+HistoryRail (10-cap, revisit w/o API call) · ExportBar · responsive+a11y+security headers. **Verify:** reload persists history; accesslint clean of serious violations; `curl -sI localhost:3003 | grep -i x-frame`.

**Phase 4 — RAG "Briefing Library" (isolated, cuttable):**
`api/ask` route (embed + grounded answer ops), `vector.ts` (cosine/topK + tests), Save-to-Library (embed summary+topics → localStorage vectors), AskArchive (embed question → client top-3 → grounded answer citing briefings). **Verify:** vector tests green; live-key manual check = user step.

**Phase 5 — Tests, README, ship gate (sequential):**
Full suite ≥35 tests green + tsc clean. README rewrite (portfolio voice, light charm, shields badges: Next.js/TypeScript/Tailwind/Gemini/Vitest/Vercel; **Results section with real measured numbers** — test count+runtime, parse latency from `durationMs`, first-load JS from build output; BYOK privacy model as first-class section; mermaid architecture diagram; never "cutting-edge"/"robust solution"). Screenshot via chrome-devtools MCP. Invoke `client-ship-gate` + `security-review` greps. Clean `npm run build` → `npm run start` smoke. Commit + push `main` (no co-author trailer). Update progress.log per project CLAUDE.md. Run `graphify update ./signal-ai-parser` (non-git-hook folder → manual, though after git init the hook may handle it).

**Left for the user (explicitly out of scope, per instruction):** connecting Vercel + pressing deploy, setting any `GEMINI_API_KEY` env fallback, live-key Phase 5 spot-checks (model-id sanity: `curl -H "x-goog-api-key: $KEY" .../v1beta/models?pageSize=50`).

## End-to-end verification matrix

1. `npx vitest run` — all green, offline, keyless. 2. `npx tsc --noEmit` clean. 3. Dev on :3003 keyless → 3 examples render canned reports + PREVIEW badge. 4. (user, live key) Test-key LED green → real analysis with durationMs. 5. Error drills: bad key → invalid_key panel; 12 chars → disabled button; 25k paste → red counter + truncation note. 6. Reload → history persists; new tab → key gone. 7. Clean `next build` + `start` smoke. 8. DevTools: key only ever in `X-Gemini-Key` header to same-origin route.

## Source files for the port (executors read these)

- `signal-ai-parser/utils/constants.py` — extract_json / normalize_results / metric+confidence coercion / markdown builder / error hierarchy semantics
- `signal-ai-parser/utils/parser.py` — prompt text, generation config, safe extraction, retry policy
- `signal-ai-parser/utils/examples.py` — sample texts + canned results (port verbatim)
- `signal-ai-parser/tests/test_parser.py` — the 24 cases to mirror in Vitest
- `~/.claude/skills/node18-nextjs-preflight/SKILL.md` — pins, port map, build/dev exclusion rule
