---
title: "Phase 1 Task Plan — news-fetch Microservice (TypeScript/Bun)"
date: "2026-05-24"
author: "architect (P0-NF-5)"
pilot: "news-fetch"
fleet_pilot_number: 6
phase: "1"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-brownfield.md"
language: "TypeScript"
runtime: "bun"
owner: "developer (generic — no dev-news-fetch specialist)"
wip_limit: 1
---

# Phase 1 Task Plan — `news-fetch` Microservice (TypeScript/Bun)

**Generated:** 2026-05-24 by architect (Phase 0, task P0-NF-5)
**Zone:** `apps/news-fetch/` ONLY (anti-scope-creep clause — do not touch cowork agents)
**Owner:** generic `developer` (no `dev-news-fetch` specialist)
**Language:** TypeScript / Bun (locked at charter creation; no rewrite)
**WIP:** 1 task at a time throughout Phase 1
**Status:** READY-FOR-DISPATCH

---

## IMPORTANT — Why This Plan Is More Explicit Than Specialist-Owned Plans

Owner = generic `developer`. No `dev-news-fetch` agent carries embedded news-fetch context. This plan carries ALL context that a specialist would internalize: exact file paths, exact scenario JSON bodies, exact sandbox command, exact primitive function signatures, exact module port interface. Do not abbreviate or defer to "brownfield inventory" when executing — all needed specifics are in this file.

---

## Phase 1 Overview

Phase 1 delivers the sandbox harness, four primitive extractions, the `news-ingest` module stub, the three-level dashboard stub, the composition-root split, and the G5 HTTP-rewire of the one mcp-server caller. Each task carries a G12 dashboard-green gate before DONE.

**Key fact from brownfield scan:** All four DDD layers already exist (`domain/`, `application/`, `infrastructure/`, `interface/`). Phase 1 does NOT rebuild layers. Phase 1 **adds** the factory scaffolding on top:
- `src/sandbox/` (NEW — sandbox runner)
- `src/primitive/` (NEW — 4 primitives)
- `src/module/news_ingest/` (NEW — module stub)
- `dashboard/` (NEW — HTML trust layer)
- `composition-root.ts` at service root (NEW — splits index.ts)
- `api/openapi.yaml` (NEW — HTTP contract)

Phase 1 also **moves** the fallback-chain orchestration from `interface/handlers.ts` into the module (see brownfield §2d), and **extracts** `normalizeRfcDate` duplicate from two scrapers into the `published-at-parser` primitive.

---

## G12 Streak Tasks (3-Task Streak Definition)

The three tasks that constitute the G12 3-task streak are:

1. **P1-B1** (first primitive: `published-at-parser`) — streak task #1
2. **P1-C** (module stub: `news_ingest`) — streak task #2
3. **P1-D** (dashboard stub, 3-panel) — streak task #3

**Streak rule:** G12 DoD gate (sandbox-green-before-RETURN) is effective only after P0-NF-3 agent-father flow commit. Developer must not mark any of these tasks DONE until `bun run sandbox` shows all scenarios green and the dashboard screenshot is pasted into the handoff.

---

## Pre-Revert Tags (Phase 1 Scope Only)

Phase 1 scaffolds new files — no deletion, no CI activation, no fence enforcement. Phase 2 pre-revert tags are the developer's responsibility at Phase 2 task time:

| Tag | Phase | Who creates | Purpose |
|---|---|---|---|
| `news-fetch-pre-ci` | Phase 2 | developer | G4 fence freeze anchor before `eslint.config.mjs` |
| `news-fetch-pre-delete` | Phase 2 | developer | G5a rollback anchor before `_deprecated/` move |
| `news-fetch-pre-inject` | Phase 2 | qa | G10 rollback anchor before bug injection |

None of these tags are created in Phase 1.

---

## Task Ledger

| ID | Title | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|----------------|--------|------------|-----|----------|
| **P1-A** | `src/sandbox/runner.ts` — Bun sandbox harness (--tier, --module, --scenario flags) | G7, G12 | P1-B1 | — | 45m | 7 |
| **P1-B1** | Primitive: `published-at-parser` + 3 scenario JSONs + R-FENCE discovery gate | G1, G7, G12 | P1-B2 | P1-A | 1.5h | 8 |
| **P1-B2** | Primitive: `headline-normalizer` + 3 scenario JSONs | G1, G7, G12 | P1-B3 | P1-B1 | 1h | 6 |
| **P1-B3** | Primitive: `source-dedup-key` + 3 scenario JSONs | G1, G7, G12 | P1-B4 | P1-B2 | 1h | 6 |
| **P1-B4** | Primitive: `article-relevance-filter` + 3 scenario JSONs | G1, G7, G12 | P1-C | P1-B3 | 1h | 6 |
| **P1-C** | Module stub: `src/module/news_ingest/` — ports + composition + fallback-chain + multi-primitive scenario | G2, G12 | P1-D | P1-B4 | 1.5h | 8 |
| **P1-D** | Dashboard stub: `dashboard/index.html` — 3 panels (primitives/module/microservice) NOT-RUN state | G6, G8, G9, G12 | P1-E | P1-C | 1.5h | 7 |
| **P1-E** | Edit-rerun handler + env audit (zero DB creds, zero API keys in sandbox env) | G7, G8, G12 | P1-G5 | P1-D | 1h | 6 |
| **P1-G5** | G5 rewire: split `composition-root.ts`, HTTP-rewire `analysis.ts`, deprecate legacy `reuters.ts`, add `api/openapi.yaml` | G3, G5, G12 | P1-QA | P1-E | 2h | 9 |
| **P1-QA** | Phase 1 close-gate verification — sandbox all-green, dashboard renders, G12 streak 3/3 confirmed | G1, G2, G6, G7, G8, G12 | — | P1-G5 | 30m | 5 |

**Total atomic tasks:** 10
**Total estimated effort:** ~11.5 dev-hours (WIP=1 sequential)
**Total AC count:** 68

---

## Per-Task Acceptance Criteria

---

### P1-A — `src/sandbox/runner.ts` (Sandbox Harness)

**Files touched:**
- `apps/news-fetch/src/sandbox/runner.ts` (CREATE)

**Background:** The sandbox runner is the core of G7 (edit-JSON-and-rerun) and G12 (green-before-done). It MUST import ONLY `src/primitive/*` and `src/module/*`. Zero infrastructure imports: no Hono, no Playwright, no fetch(), no SQLite. News-fetch has zero DB credentials by design — but the env audit must still be explicit.

**Sandbox runner command:** `bun run apps/news-fetch/src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all`

**AC-1:** Runner accepts three flags:
- `--tier` (values: `primitive` | `module` | `all`)
- `--module` (value: `news-fetch`)
- `--scenario` (values: `all` | path to a specific JSON file)

**AC-2:** For `--tier=primitive`, runner locates scenario files at `docs/scenarios/news-fetch/primitives/<primitive-name>/*.json`, loads each, calls the corresponding primitive function with `input`, compares result to `expectedOutput` via deep-equal, records PASS or FAIL with diff.

**AC-3:** For `--tier=module`, runner locates scenario files at `docs/scenarios/news-fetch/module/*.json`, runs the news_ingest module's compose function.

**AC-4:** Runner imports ZERO infrastructure files. Verify: `grep -r "from.*infrastructure\|from.*scrapers\|from.*hono\|from.*playwright" apps/news-fetch/src/sandbox/` must return 0.

**AC-5:** Runner exits with code 0 when all scenarios PASS. Exits with non-zero code when any scenario FAILS. This is required for dashboard honest-red (G8).

**AC-6:** Env audit gate: running the sandbox does not expose credentials. `env | grep -iE "DB_|API_KEY|SECRET|TOKEN|PASSWORD|PLAYWRIGHT|BROWSER"` must return empty when sandbox runs (news-fetch has no creds by design — but this proves it).

**AC-7:** Sandbox directory has its own `README.md` (3 lines: what it does, how to run, what files it loads).

---

### P1-B1 — Primitive: `published-at-parser` + R-FENCE Discovery Gate

**Files touched:**
- `apps/news-fetch/src/primitive/published-at-parser/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/published-at-parser/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/failure.json` (CREATE)
- `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts` (MODIFY — remove `normalizeRfcDate`, import from primitive)
- `apps/news-fetch/src/infrastructure/scrapers/bloomberg-rss.ts` (MODIFY — remove `normalizeRfcDate`, import from primitive)

**G12 streak task #1.**

**Function signature (exact):**
```typescript
// apps/news-fetch/src/primitive/published-at-parser/index.ts
export function parsePublishedAt(rfcDate: string): string | null
```
No side effects. No `Date.now()`. Deterministic for same input. Zero imports from infrastructure.

**Scenario JSONs (exact structure — developer must use these):**

`golden.json`:
```json
{
  "primitive": "published-at-parser",
  "function": "parsePublishedAt",
  "input": { "rfcDate": "Mon, 13 May 2026 14:30:00 GMT" },
  "expectedOutput": "2026-05-13T14:30:00.000Z",
  "scenarioType": "golden"
}
```

`edge.json`:
```json
{
  "primitive": "published-at-parser",
  "function": "parsePublishedAt",
  "input": { "rfcDate": "Thu, 22 May 2026 07:00:00 +0700" },
  "expectedOutput": "2026-05-22T00:00:00.000Z",
  "scenarioType": "edge"
}
```

`failure.json`:
```json
{
  "primitive": "published-at-parser",
  "function": "parsePublishedAt",
  "input": { "rfcDate": "not-a-date-string" },
  "expectedOutput": null,
  "scenarioType": "failure"
}
```

**AC-1:** `parsePublishedAt` function exported from `apps/news-fetch/src/primitive/published-at-parser/index.ts`. File has zero imports from `infrastructure/`, `application/`, or `interface/`.

**AC-2:** Both `reuters-rss.ts` and `bloomberg-rss.ts` import `parsePublishedAt` from `../../primitive/published-at-parser/index.js`. The local `normalizeRfcDate` function is removed from both files.

**AC-3:** Unit test (`index.test.ts`) has ≥3 `it()` blocks covering: valid RFC 2822 → ISO, malformed → null, and empty string → null.

**AC-4 (sandbox green gate):** `bun run apps/news-fetch/src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all` exits 0 and reports all 3 scenarios PASS before this task is marked DONE. Paste exit code + PASS count into handoff.

**AC-5 (R-FENCE discovery):** Record in handoff: exact import path style used in this primitive (e.g. `../../primitive/published-at-parser/index.js` with `.js` extension per ESM rules). This record is the R-FENCE discovery gate for Phase 2's `eslint.config.mjs` AC.

**AC-6:** `grep -r "from.*infrastructure\|from.*scrapers" apps/news-fetch/src/primitive/` returns 0.

**AC-7:** Dashboard stub (if already created) shows this primitive as PASS. If dashboard not yet created, skip this sub-check.

**AC-8 (G12 DoD gate):** Developer does not mark DONE until sandbox shows green and paste evidence is in handoff. Rule effective after P0-NF-3 flow commit.

---

### P1-B2 — Primitive: `headline-normalizer` + 3 Scenario JSONs

**Files touched:**
- `apps/news-fetch/src/primitive/headline-normalizer/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/headline-normalizer/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/failure.json` (CREATE)

**Function signature (exact):**
```typescript
// apps/news-fetch/src/primitive/headline-normalizer/index.ts
export function normalizeHeadline(raw: string): string
```
Strips trailing source attribution suffix (e.g. " - Bloomberg", " - Reuters"). Collapses multiple internal whitespace. Trims. Deterministic. Zero imports from infrastructure.

**Scenario JSONs (exact structure):**

`golden.json`:
```json
{
  "primitive": "headline-normalizer",
  "function": "normalizeHeadline",
  "input": { "raw": "Fed raises interest rates for third time this year - Bloomberg" },
  "expectedOutput": "Fed raises interest rates for third time this year",
  "scenarioType": "golden"
}
```

`edge.json`:
```json
{
  "primitive": "headline-normalizer",
  "function": "normalizeHeadline",
  "input": { "raw": "  Vietnam  GDP  grows  6.8%  in  Q1  " },
  "expectedOutput": "Vietnam GDP grows 6.8% in Q1",
  "scenarioType": "edge"
}
```

`failure.json`:
```json
{
  "primitive": "headline-normalizer",
  "function": "normalizeHeadline",
  "input": { "raw": "" },
  "expectedOutput": "",
  "scenarioType": "failure"
}
```

**AC-1:** `normalizeHeadline` exported from `apps/news-fetch/src/primitive/headline-normalizer/index.ts`. Zero infra imports.

**AC-2:** Unit test with ≥3 `it()` blocks: suffix strip, whitespace collapse, empty string no-op.

**AC-3:** All 3 scenario JSONs present at `docs/scenarios/news-fetch/primitives/headline-normalizer/`.

**AC-4 (sandbox green gate):** Sandbox exits 0, all 3 scenarios PASS. Paste evidence into handoff.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/headline-normalizer/` returns 0.

**AC-6 (G12 DoD gate):** Dashboard green (or NOT-RUN if dashboard not yet built) before DONE.

---

### P1-B3 — Primitive: `source-dedup-key` + 3 Scenario JSONs

**Files touched:**
- `apps/news-fetch/src/primitive/source-dedup-key/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/source-dedup-key/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/source-dedup-key/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/source-dedup-key/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/source-dedup-key/failure.json` (CREATE)

**Function signature (exact):**
```typescript
// apps/news-fetch/src/primitive/source-dedup-key/index.ts
export interface ArticleKeyInput {
  url: string | null;
  headline: string;
  source: string;
}
export function computeArticleKey(article: ArticleKeyInput): string
```
Returns a deterministic string key. If `url` is non-null and non-empty, key is based on URL (normalized). If `url` is null/empty, key is based on `source + ":" + headline` (lowercased, trimmed). No crypto — a simple deterministic composition (not a hash — pure string manipulation). Must be collision-resistant within a single fetch batch.

**Scenario JSONs (exact structure):**

`golden.json`:
```json
{
  "primitive": "source-dedup-key",
  "function": "computeArticleKey",
  "input": {
    "article": {
      "url": "https://bloomberg.com/news/articles/2026-05-24/fed-rates",
      "headline": "Fed raises rates",
      "source": "bloomberg"
    }
  },
  "expectedOutput": "url:bloomberg.com/news/articles/2026-05-24/fed-rates",
  "scenarioType": "golden"
}
```

`edge.json`:
```json
{
  "primitive": "source-dedup-key",
  "function": "computeArticleKey",
  "input": {
    "article": {
      "url": null,
      "headline": "Vietnam GDP grows 6.8%",
      "source": "reuters"
    }
  },
  "expectedOutput": "headline:reuters:vietnam gdp grows 6.8%",
  "scenarioType": "edge"
}
```

`failure.json`:
```json
{
  "primitive": "source-dedup-key",
  "function": "computeArticleKey",
  "input": {
    "article": {
      "url": null,
      "headline": "",
      "source": "reuters"
    }
  },
  "expectedOutput": "fallback:reuters:empty",
  "scenarioType": "failure"
}
```

**AC-1:** `computeArticleKey` exported from `apps/news-fetch/src/primitive/source-dedup-key/index.ts`. Zero infra imports.

**AC-2:** Unit test with ≥3 `it()` blocks: url-based key, headline-based key (null url), empty headline fallback.

**AC-3:** All 3 scenario JSONs present.

**AC-4 (sandbox green gate):** Sandbox exits 0, all 3 scenarios PASS. Paste evidence.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/source-dedup-key/` returns 0.

**AC-6 (G12 DoD gate):** Dashboard green before DONE.

---

### P1-B4 — Primitive: `article-relevance-filter` + 3 Scenario JSONs

**Files touched:**
- `apps/news-fetch/src/primitive/article-relevance-filter/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/article-relevance-filter/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/failure.json` (CREATE)

**Function signature (exact):**
```typescript
// apps/news-fetch/src/primitive/article-relevance-filter/index.ts
export function isRelevantArticle(headline: string, keywords: string[]): boolean
```
Pure boolean. Case-insensitive keyword check. Returns true if headline contains any keyword (case-insensitive). Returns false if keywords array is empty (no filter = not relevant). Zero I/O. Deterministic.

**Scenario JSONs (exact structure):**

`golden.json`:
```json
{
  "primitive": "article-relevance-filter",
  "function": "isRelevantArticle",
  "input": {
    "headline": "Vietnam central bank holds interest rate steady",
    "keywords": ["Vietnam", "VN", "HOSE"]
  },
  "expectedOutput": true,
  "scenarioType": "golden"
}
```

`edge.json`:
```json
{
  "primitive": "article-relevance-filter",
  "function": "isRelevantArticle",
  "input": {
    "headline": "VIETNAM GDP SURGES IN Q1 2026",
    "keywords": ["vietnam", "vn"]
  },
  "expectedOutput": true,
  "scenarioType": "edge",
  "note": "Case-insensitive match — uppercase headline matches lowercase keyword"
}
```

`failure.json`:
```json
{
  "primitive": "article-relevance-filter",
  "function": "isRelevantArticle",
  "input": {
    "headline": "US treasury yields climb on strong jobs data",
    "keywords": ["Vietnam", "VN", "HOSE", "HNX"]
  },
  "expectedOutput": false,
  "scenarioType": "failure",
  "note": "No keyword match — false is the correct output, not an error"
}
```

**AC-1:** `isRelevantArticle` exported. Zero infra imports.

**AC-2:** Unit test with ≥3 `it()` blocks: match present, case-insensitive match, no match.

**AC-3:** All 3 scenario JSONs present.

**AC-4 (sandbox green gate):** Sandbox exits 0, all 3 scenarios PASS. Paste evidence.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/article-relevance-filter/` returns 0.

**AC-6 (G12 DoD gate):** Dashboard green before DONE.

---

### P1-C — Module Stub: `src/module/news_ingest/`

**Files touched:**
- `apps/news-fetch/src/module/news_ingest/index.ts` (CREATE — module composition function)
- `apps/news-fetch/src/module/news_ingest/ports.ts` (CREATE — NewsIngestPort interface)
- `apps/news-fetch/src/module/news_ingest/index.test.ts` (CREATE — unit test with mock ports)
- `docs/scenarios/news-fetch/module/multi-source-ingest.json` (CREATE — multi-primitive scenario)
- `apps/news-fetch/src/interface/handlers.ts` (MODIFY — inject NewsIngestPort, remove fallback-chain private functions, remove 4-param createRouter signature)

**G12 streak task #2.**

**Port interface (exact):**
```typescript
// apps/news-fetch/src/module/news_ingest/ports.ts
import type { Article } from '../../domain/models.js';
import type { NewsSource } from '../../domain/models.js';

export interface NewsIngestPort {
  ingestHeadlines(source: NewsSource, maxItems?: number): Promise<Article[]>;
}

// Adapter port (injected into module — implemented by scrapers in infrastructure)
export interface NewsFetcherPort {
  fetchHeadlines(maxItems?: number): Promise<import('../../domain/models.js').FetchResult>;
}
```

**Module composition (pattern — developer implements exact body):**
The `news_ingest` module's `composeNewsIngest()` function:
1. Accepts injected fetcher adapters (primary RSS port, fallback Playwright port) per source
2. On `ingestHeadlines(source, maxItems)`: calls primary fetcher, if error/empty calls fallback (the fallback-chain logic currently in handlers.ts lines 60-84 / 122-146 moved here)
3. Calls `normalizeHeadline` primitive on each article headline
4. Calls `computeArticleKey` primitive to dedup within the batch
5. Returns `Article[]` (not `FetchResult` — strips the envelope)

**Multi-primitive scenario JSON:**

`docs/scenarios/news-fetch/module/multi-source-ingest.json`:
```json
{
  "module": "news_ingest",
  "function": "processArticleBatch",
  "description": "Normalize + dedup a batch of articles from two sources",
  "input": {
    "articles": [
      {
        "source": "reuters",
        "headline": "Fed raises rates - Reuters",
        "url": "https://reuters.com/fed-rates",
        "publishedAt": "2026-05-13T14:30:00.000Z",
        "fetchedAt": "2026-05-13T14:31:00.000Z",
        "confidence": "HIGH"
      },
      {
        "source": "reuters",
        "headline": "Fed raises rates - Reuters",
        "url": "https://reuters.com/fed-rates",
        "publishedAt": "2026-05-13T14:30:00.000Z",
        "fetchedAt": "2026-05-13T14:32:00.000Z",
        "confidence": "HIGH"
      },
      {
        "source": "bloomberg",
        "headline": "Vietnam GDP grows in Q1 - Bloomberg",
        "url": null,
        "publishedAt": null,
        "fetchedAt": "2026-05-13T14:31:00.000Z",
        "confidence": "LOW"
      }
    ]
  },
  "expectedOutput": {
    "articleCount": 2,
    "normalized": true,
    "deduped": true
  },
  "scenarioType": "multi-primitive",
  "primitivesExercised": ["headline-normalizer", "source-dedup-key"]
}
```

**AC-1:** `apps/news-fetch/src/module/news_ingest/index.ts` exists. Imports ONLY from `../../primitive/*` and `../../domain/*`. Zero imports from `../../infrastructure/*`.

**AC-2:** `apps/news-fetch/src/module/news_ingest/ports.ts` declares `NewsIngestPort` and `NewsFetcherPort` interfaces (domain-only imports).

**AC-3:** `handlers.ts` updated: `createRouter()` now takes a single `NewsIngestPort` param (or one per source if design requires). The private `fetchReuters()` and `fetchBloomberg()` fallback-chain functions are REMOVED from handlers.ts.

**AC-4:** Unit test uses mock ports (no real scraper calls). Tests: normal ingest returns articles; empty primary triggers fallback; batch dedup removes duplicate keys.

**AC-5:** `grep -r "from.*infrastructure\|from.*scrapers\|require.*infrastructure" apps/news-fetch/src/module/` returns 0.

**AC-6 (sandbox green gate for module scenario):** `bun run apps/news-fetch/src/sandbox/runner.ts --tier=module --module=news-fetch --scenario=all` exits 0 and the multi-source-ingest scenario PASSES. Paste evidence.

**AC-7 (sandbox green gate for all primitive scenarios):** All 12 primitive scenarios (4 primitives × 3 each) must still PASS after this task. Paste consolidated exit 0 evidence.

**AC-8 (G12 DoD gate):** Dashboard shows module stub card NOT-RUN or PASS. Developer does not mark DONE without sandbox evidence in handoff.

---

### P1-D — Dashboard Stub: `dashboard/index.html` (3 Panels)

**Files touched:**
- `apps/news-fetch/dashboard/index.html` (CREATE)
- `apps/news-fetch/dashboard/styles.css` (CREATE — optional; can be inline)

**G12 streak task #3.**

**Dashboard must work from `file://` URL with zero network calls.**

**Three panels required:**
1. **Primitives panel** — one card per primitive (published-at-parser, headline-normalizer, source-dedup-key, article-relevance-filter). Each card shows: primitive name, scenario count, status badge (NOT-RUN / PASS / FAIL).
2. **Module panel** — one card for `news_ingest` module. Shows: module name, scenario count, status badge. Includes wire list: "composes: published-at-parser + headline-normalizer + source-dedup-key + article-relevance-filter".
3. **Microservice panel** — one card for `news-fetch` microservice. Shows: service name, port 5008, endpoints (reuters/headlines, bloomberg/headlines, health), status badge.

**Initial state:** all cards show NOT-RUN (no scenario results loaded yet). This is correct for stub.

**Honest red/green requirement (G8):** When the sandbox runner writes a `results.json` trace to `apps/news-fetch/dashboard/`, the dashboard reads and renders it. Corrupted scenario → red card. Clean scenario → green card. The NOT-RUN → red transition must be tested in Phase 1 (P1-E handles this).

**AC-1:** `apps/news-fetch/dashboard/index.html` opens in browser via `file://` URL without errors. All three panels visible.

**AC-2:** QA opens browser devtools console — zero JavaScript errors on load.

**AC-3:** Each of the 3 panels has ≥1 visible card with a status badge.

**AC-4:** HTML comment present: `<!-- news-fetch pilot dashboard — SI-2 BOUNDARY: this file is news-fetch ONLY, never shared with docs/dashboards/index.html (stock-price exclusive) -->`. This enforces the SI-2 boundary.

**AC-5:** Dashboard source contains NO hardcoded credentials, no API keys, no DB connection strings.

**AC-6 (sandbox green gate):** All 12 primitive scenarios + 1 module scenario PASS via sandbox before dashboard stub is submitted. Paste evidence.

**AC-7 (G12 DoD gate):** Evidence of all three panels rendering (screenshot or file:// open confirmation) pasted into handoff before DONE.

---

### P1-E — Edit-Rerun Handler + Env Audit

**Files touched:**
- `apps/news-fetch/dashboard/rerun-handler.js` (CREATE — edit-rerun handler, loads scenario trace, re-renders)
- `apps/news-fetch/src/sandbox/runner.ts` (MODIFY — add `--output` flag to write trace JSON to `dashboard/results.json`)

**Purpose:** Proves G7 (edit-JSON-and-rerun) and solidifies G8 (honest red/green).

**AC-1:** Developer edits `docs/scenarios/news-fetch/primitives/published-at-parser/golden.json` (changes `expectedOutput` to a wrong value), runs `bun run apps/news-fetch/src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all --output=apps/news-fetch/dashboard/results.json`, refreshes dashboard → `published-at-parser` card shows RED.

**AC-2:** Developer reverts the change, re-runs sandbox, refreshes dashboard → card shows GREEN.

**AC-3:** Env audit. Run the sandbox and then: `env | grep -iE "DB_|API_KEY|SECRET|TOKEN|PASSWORD|BROWSER|PLAYWRIGHT"` must return EMPTY. Paste exact empty output into handoff.

**AC-4:** `grep -rniE "token|api_key|secret|password|db_path" apps/news-fetch/src/sandbox/` returns 0. Paste into handoff.

**AC-5:** Before/after dashboard screenshots (or file:// screenshots) showing RED → GREEN transition pasted into handoff.

**AC-6 (G12 DoD gate):** All scenarios still green after handler addition. Sandbox exit 0. Evidence in handoff.

---

### P1-G5 — Composition Root + HTTP Rewire + OpenAPI + Deprecation

**Files touched:**
- `apps/news-fetch/composition-root.ts` (CREATE — extracted from index.ts)
- `apps/news-fetch/src/index.ts` (MODIFY — import from composition-root, reduce to ~10-line server entry)
- `apps/news-fetch/api/openapi.yaml` (CREATE — HTTP contract for port 5008)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (MODIFY — replace `fetchReuters` direct import with HTTP call to `http://news-fetch:5008/reuters/headlines`)
- `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` (MOVE to `apps/mcp-server/src/_deprecated/fetchers/reuters.ts`)
- `apps/mcp-server/src/infrastructure/fetchers/newsSourceRouter.ts` (ASSESS — move to `_deprecated/` if no other non-news-fetch callers)

**This task covers G3 (clean composition root) and G5 (old code deleted + HTTP rewire).**

**G3 — Composition root:**

**AC-1:** `apps/news-fetch/composition-root.ts` exists. Contains ONLY: import statements, DI bindings (wiring scrapers + module + router), and `export const app`. Zero `if` conditions on data values. Zero domain operations (no `normalizeHeadline`, no `parsePublishedAt` calls). Verify: `grep -E "if |switch |calculateRSI|normalizeHeadline|parsePublishedAt|computeArticleKey" apps/news-fetch/composition-root.ts` returns 0.

**AC-2:** `apps/news-fetch/src/index.ts` reduced to ≤15 lines: imports `app` from `../composition-root.js`, binds port from `Bun.env.PORT`, exports default server config. Zero business logic.

**AC-3:** `apps/news-fetch/api/openapi.yaml` exists and documents:
- `GET /health` → 200 `{status: "ok", service: "news-fetch", port: 5008}`
- `POST /reuters/headlines` + `GET /reuters/headlines`
- `POST /bloomberg/headlines` + `GET /bloomberg/headlines`

**G5 — HTTP rewire and deprecation:**

**AC-4 (G5a):** `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` moved to `apps/mcp-server/src/_deprecated/fetchers/reuters.ts`. The `_deprecated/` directory must contain a `README.md` noting: "Superseded by news-fetch microservice (port 5008). Retained for rollback reference only."

**AC-5 (G5b):** `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` updated: the line `import { fetchReuters } from "../../../../infrastructure/fetchers/reuters.js"` is removed. The `if (sources.includes("reuters")) fetchPromises.push(fetchReuters())` call is replaced with an HTTP fetch to `${NEWS_FETCH_BASE}/reuters/headlines` where `NEWS_FETCH_BASE = Bun.env['NEWS_FETCH_URL'] ?? 'http://news-fetch:5008'`.

**AC-6 (G5c):** `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/news-fetch/src/` returns 0.

**AC-7 (G5c):** `find apps/mcp-server/src -path "*_deprecated*" -prune -o -name "*.ts" -print | xargs grep -l "from.*infrastructure/fetchers/reuters"` returns 0 (no non-deprecated callers remain).

**AC-8 (sandbox green gate):** All 13 scenarios (12 primitive + 1 module) still PASS after composition-root change. Paste exit 0 evidence.

**AC-9 (G12 DoD gate):** Dashboard shows all cards green. Paste screenshot.

---

### P1-QA — Phase 1 Close-Gate Verification

**Owner:** qa
**Files touched:** `docs/data/pilot-status-news-fetch.json` (update phase1 fields)

**AC-1:** Sandbox exit 0 with 13/13 scenarios PASS (all 4 primitives × 3 scenarios + 1 module scenario). Evidence: `bun run apps/news-fetch/src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all` output showing 13 PASS, 0 FAIL, exit 0.

**AC-2:** Dashboard renders all 3 panels (primitives, module, microservice) from `file://` URL. Dashboard screenshot showing all panel cards present.

**AC-3:** G12 streak confirmed: first 3 streak tasks (P1-B1, P1-C, P1-D) each have sandbox-green evidence pasted in their handoffs before they were marked DONE. QA checks handoff files for each streak task's evidence section.

**AC-4:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/ apps/news-fetch/src/module/` returns 0.

**AC-5:** Env audit clean: `env | grep -iE "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty in sandbox process. Evidence pasted.

---

## Scenario Directory Layout

```
docs/scenarios/news-fetch/
  primitives/
    published-at-parser/
      golden.json
      edge.json
      failure.json
    headline-normalizer/
      golden.json
      edge.json
      failure.json
    source-dedup-key/
      golden.json
      edge.json
      failure.json
    article-relevance-filter/
      golden.json
      edge.json
      failure.json
  module/
    multi-source-ingest.json
```

**Total scenario files Phase 1:** 13 (4 primitives × 3 + 1 module)

---

## Sequencing Diagram

```
P1-A (sandbox harness)
  └─► P1-B1 (published-at-parser)  ← G12 streak #1
        └─► P1-B2 (headline-normalizer)
              └─► P1-B3 (source-dedup-key)
                    └─► P1-B4 (article-relevance-filter)
                          └─► P1-C (news_ingest module stub)  ← G12 streak #2
                                └─► P1-D (dashboard stub)     ← G12 streak #3
                                      └─► P1-E (edit-rerun + env audit)
                                            └─► P1-G5 (composition root + G5 rewire)
                                                  └─► P1-QA (close gate)
```

---

## Hard Constraints

| Constraint | Source |
|---|---|
| WIP=1 sequential throughout Phase 1 | pilot-status `phase1.wip_limit` |
| No code in `apps/mcp-server/` outside the G5 rewire (P1-G5 only) | anti-scope-creep clause |
| No code in cowork agents (news-scout, market-watcher) | charter §Risk 4 |
| All `src/primitive/*` files: zero infrastructure imports | DDD golden rule |
| All `src/module/*` files: zero infrastructure imports | DDD golden rule |
| No process.env — use `Bun.env` | dev-standards §Coding Standards |
| All import paths end in `.js` (ESM) | dev-standards §Coding Standards |
| Sandbox runner exits non-zero on any scenario FAIL | G8 honest-red requirement |
| SI-2 boundary: news-fetch dashboard ≠ docs/dashboards/index.html | fleet SI-2 rule |
| G12 DoD gate: NO DONE without sandbox green evidence in handoff | G12 rule effective after P0-NF-3 |
| No `--no-verify`, no force push, no branch creation | CLAUDE.md constraints |
| Explicit file staging only (git add <path>) | L84 constraint, pilot-status day-0 |

---

## Goals Roadmap — Phase 1 Contributions

| Goal | Status after Phase 1 | Evidence source |
|---|---|---|
| G1 (primitives + scenarios) | EARNED-PENDING | 4 primitives × 3 scenarios = 12 PASS |
| G2 (module composes via ports) | EARNED-PENDING | news_ingest module + multi-primitive scenario PASS |
| G3 (clean composition root) | EARNED-PENDING | composition-root.ts AC-1/2 |
| G5 (old code deleted + HTTP rewire) | EARNED-PENDING | analysis.ts rewired, reuters.ts deprecated |
| G6 (dashboard renders) | EARNED-PENDING | dashboard/index.html 3-panel stub |
| G7 (edit-rerun + zero creds) | EARNED-PENDING | env audit clean + edit-rerun cycle proven |
| G8 (honest red/green) | EARNED-PENDING | P1-E red→green transition |
| G12 (streak 3/3) | EARNED-PENDING | P1-B1 + P1-C + P1-D streak |
| G4 (fence) | STILL-UNMET | Phase 2 work (`eslint.config.mjs` + violation proof) |
| G9 (dashboard trust contract) | STILL-UNMET | Phase 2: PO Playwright Path B |
| G10 (AI fixes bug ≤2 cycles) | STILL-UNMET | Phase 2: QA injection |
| G11 (regression alarm) | STILL-UNMET | Phase 2: 2-trial coupling proof |

**goalsEarned:** stays 0. PO-only flip at 12/12 terminal Phase 3 (§4.5 compliance).

---

## §4.5 Compliance

NO goal flip instructions appear in any task in this plan. Developer does NOT update `pilot-status-news-fetch.json` goals fields. goalsEarned stays 0. decisionMatrix stays all-TBD. Phase 1 tasks carry only `goals advanced` labels (informational). PO is the sole authority for terminal goal state transitions.
