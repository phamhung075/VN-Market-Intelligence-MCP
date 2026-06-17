# Architect — Notebook

**Last updated:** 2026-06-17 05:00 UTC | **Sprint:** FE-PAGE-REORG (cross-sprint: ARCH-OHLCV-WRITER-SSOT-DURABLE)

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-17T05:00Z — ARCH-OHLCV-WRITER-SSOT-DURABLE (DESIGN DONE)

**Task:** ARCH-OHLCV-WRITER-SSOT-DURABLE | mode: RECURRING-BUG-ESCALATION (4th recurrence) | zone: apps/mcp-server/
**Output:** `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md` + `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md`
**Root confirmed:** `writeForeignFlowToOhlcv` (ohlcvForeignFlowStore.ts L57-69) — last bypassing writer; INSERTs `close=0` stub to satisfy `REAL NOT NULL` constraint when no OHLCV row exists at foreign-flow fetch time (02:00Z).
**Design:** Merge-only UPDATE — replace INSERT…ON CONFLICT with plain UPDATE; `changes=0` when no OHLCV row yet (deferred, no stub created). Schema constraint (`close REAL NOT NULL`, no DEFAULT) blocks NULL-close INSERT; table rebuild rejected for P0.
**Writer inventory:** All 8 writers now accounted for. After this fix: zero writers insert `close=0` stubs. Sentinel pattern (OHLCV-WRITE-BYPASS-ALLOWED) + ESLint rule (follow-on LINT-OHLCV-WRITE-BYPASS) close the bypass class generically.
**Follow-on queued:** ARCH-DAILY-FOREIGN-FLOW-TABLE (dedicated table eliminates the 2–3h deferred-gap window for new-day rows).
**BUILD-STANDARD:** not-applicable (bug-fix, in-zone). **Scan clean:** true.
**NEXT:** pm

## 2026-06-16T11:00Z — ARCH-BCTC-PIPELINE-DURABILITY (SPIKE DONE)

**Task:** ARCH-BCTC-PIPELINE-DURABILITY | mode: SPIKE | zone: multi (apps/mcp-server/ + vps-scripts/)
**Output:** `docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md`
**4 contracts defined:**
- C1: Consecutive-zero-URL counter + aggregate Telegram BUG alert (earnings-window guarded)
- C2: Replace `passive:true` in vpsHealthPoller with active `latestTimestampSql` on `bctc_vps_queue.last_attempt` (24h threshold, queueGuardSql)
- C3: Enrich fail-loud = `enrich_failed` status (989654f2 done) + prod sendBugFn wiring verification
- C4: ADF-brittleness — no new layer; C1+C2 detect within 30 min / 24h; sub-risk A (hardcoded fallback) co-located in FIX-HNX-SESSION-COOKIE

**5 child → contract mapping:**
- FIX-HNX-SESSION-COOKIE → C4 (vps-scripts session GET + fallback-default removal)
- FIX-SSC-C111-EMPTY-FALLBACK → C4 (c3 fallback in _ssc_parse_rows)
- FIX-BCTC-ZERO-URL-ALERT → C1 (mcp-server enricher counter + alert)
- FIX-BCTC-FRESHNESS-GATE → C2 (vpsHealthPoller active freshness)
- FIX-BCTC-ENRICH-SILENT-0ROWS → C3 (REVIEW, prod wiring outstanding)

**Key design choice:** No VPS-script-level Telegram alerts (no gateway on VPS); all escalation via mcp-server boundary. FreshnessConfig additive extension (non-breaking). Consecutive-zero in SQLite (survives restart).
**BUILD-STANDARD:** not-applicable (bug-fix/hardening in existing zones). **Scan clean:** true.
**NEXT:** po (PO to promote 4 held children to dispatch)

## 2026-06-16T06:30Z — FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH (DESIGN DONE)

**Task:** FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH | zone: apps/frontend/ | epic: ERROR-AUDIT-2026-06-15 Wave 2
**Output:** `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md`
**3/3 clusters mapped:**
- Cluster A: 28 files confirmed (not 26 — brownfield found 2 additional: `dashboard.bctc.tsx`, `dashboard.vps.tsx`); `dashboard.bctc-inspect.tsx` excluded (HTML relay, different error contract).
- Cluster B: 29 `api.*.tsx` proxy routes confirmed; pattern is consistent; `proxyUpstream` encapsulates exactly.
- Cluster C: 4 functions confirmed in `client.ts` at lines :283, :489, :550, :578.

**4 ARCH-RATIFY verdicts:**
- ARCH-RATIFY-FE-1: `apiGet<T>` NOT bounded internally. Outer `safeFetch` covers the inline-fetch loaders. EC-8 loaders (`dashboard.db/services/fetch.tsx`) = accepted gap → follow-on Wave-3.
- ARCH-RATIFY-FE-2: `fetchWatchlistPrices` migrates to `safeFetch` (NOT `safeFetchOrNull`) — empty-object parse fallback preserves `{}` degrade contract. No caller change.
- ARCH-RATIFY-FE-3: EC-8 scope boundary confirmed OUT OF SCOPE. 4 files excluded. `dashboard.analysis.tsx` is hybrid — 1 inline fetch in scope, `client.ts` calls out of scope.
- ARCH-RATIFY-FE-4: FE-PAGE-REORG FR-4 `loader-utils.ts safeFetch` ABSORBED into `fetchUtils.ts`. PM must update `BA-FE-PAGE-REORG` task before spawning.

**Key design decisions:**
- `ReturnType<typeof setTimeout>` required (tsconfig `types: ["@remix-run/node"]` + ES2022 lib creates timer type ambiguity; Node vs DOM).
- `parse(null)` empty-T contract — callers' `parseXxx` must handle `null` input → return empty-shape. RISK-1 documented.
- `fetchCascadeSignals` + `fetchAccuracyDigest`: full body replacement (not wrapping `apiGet`). RISK-4 documented.
- `dashboard.bctc-inspect.tsx` excluded from both T-3 and T-4.

**BUILD-STANDARD:** lean. **Scan clean:** true.
**NEXT:** pm

## 2026-06-16T01:50Z — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (DESIGN DONE)

**Task:** FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 | zone: apps/mcp-server/ | recurring class: OHLCV-UNIT-CONTAM 3rd+ touch
**Output:** `docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-architect-design.md`
**Root cause confirmed:** Writer D (taOhlcvBackfillJob, 01:30 UTC) — prevClose=0 no-op for ÷1000 group; double-write race with Writer A for ×1000 group.
**SSOT chokepoint:** `ohlcvWriteService.ts` (application/usecases) — single batched-prevClose + normalize + seed-filter + validate + upsert entry for all writers.
**Guard placement:** pre-write in writeOhlcvBatch; post-write extension in ohlcvSanityCheckJob (FR-G2/G3); early cron at 00:45 UTC (FR-G4).
**Repair verdict:** Option D SAFE (fingerprint-scoped DELETE; all consumers handle absent-row via ON CONFLICT or prior-date fallback).
**Build-standard:** not-applicable (bug-fix, in-zone).
**NEXT:** pm

## 2026-06-16T00:00Z — FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (BLUEPRINT DONE)

**Task:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE | zone: apps/mcp-server/ | epic: ERROR-AUDIT-2026-06-15 Wave 2
**Output:** `[Architect] Brownfield Findings` appended to `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md`. Decision journal: `docs/agent-memory/decisions/sprint-FE-PAGE-REORG-architect.md` entry S1.

**4 Ratifications:**
- ARCH-RATIFY-W2-1: `DeadlineError extends Error` — name set in constructor, label+ms fields. Codebase has 4 existing `extends Error` patterns; no tagged-object precedent.
- ARCH-RATIFY-W2-2: `err.name === 'AbortError'` confirmed for Bun. Two live callers (`foreignFlowFetcher`, `clients.ts`) already use this pattern. `instanceof DOMException` rejected.
- ARCH-RATIFY-W2-3: T-11 = 7 files / 8 fetch calls. `carryTools.ts` has 2 unbounded fetches (:57 `/snapshot`, :134 `/macro-calendar`). T-11 remains one task; PM annotates the double-call.
- ARCH-RATIFY-W2-4: `pushToMcpServer:79` folded into T-5. Deadline = 10_000ms (localhost-to-localhost). No split needed.

**Key DDD risk introduced (RISK-1, blocks T-1):** `macroFetch` in `infrastructure/fetchers/` must NOT import `macroHttpClient.ts` from `interface/mcp/tools/macro/` — that is an upward import. Fix: add `baseUrl: string` as first parameter to `macroFetch`. Callers already hold `baseUrl`; they pass it in. Signature: `macroFetch<T>(baseUrl, path, body, opts)`.

**Deadline sanity all-clear:** All 9 values < 60_000. bctcPdfPull 45s is safe — it is a background scheduler, not a synchronous MCP gateway call; 60s ceiling does not apply. pushToMcpServer reduced to 10_000 (localhost).

**BUILD-STANDARD:** lean. **Scan clean:** true (provided RISK-1 signature adopted).


## 2026-06-14T18:30Z — ARCH-KINHDICH-HOVER-ENRICH-FE RATIFY-1 (RATIFIED, DONE)

**Task:** KINHDICH-HOVER-ENRICH-FE | zone: apps/frontend/ (single zone)
**Output:** Brownfield findings + implementation blueprint appended to docs/handoffs/KINHDICH-HOVER-ENRICH-FE-BA-spec.md. Board advanced: ready→in_progress, next_agent=dev-frontend.

**ARCH-RATIFY-FE-1 verdict: CONFIRMED — codegen extension mechanism valid, QUE-TOOLTIP-DRY preserved.**

**Brownfield findings (raw-read confirmed):**
- `scripts/gen-que-descriptions.ts` BLOCK 1 (L95-107): 2-field loop (`coreMeaning.vi`, `marketTrendLabel.vi`) with backtick-escape pattern. Adding `hoverSummary.vi` extraction + escape is a copy of the identical existing pattern — zero structural change to the loop.
- `QueRefEntry` interface (L57-72): all known fields typed; `hoverSummary` is silently covered by `[key: string]: unknown` index. Making it explicit is a strict improvement.
- `QueDescription` interface (in generated file header template): 2-field interface. `hoverSummary?: string` is purely additive — no existing caller destructuring `coreMeaning`/`marketTrendLabel` is broken.
- `QueName.tsx` L75: `{desc.coreMeaning}` → `{desc.hoverSummary ?? desc.coreMeaning}`. TypeScript infers result as `string` (coreMeaning is non-optional). No cast required.
- BLOCK 2 + detail pipeline: UNTOUCHED. `que-descriptions-detail.generated.ts` and `dashboard.kinh-dich-reference.tsx` unaffected.
- `que-reference.js` hoverSummary x64: RAW-confirmed. Structure: `"hoverSummary": { "vi": "...", "en": "..." }`. en field excluded from QueDescription (tooltip is VI-only per language-boundary rule).

**Risks found:** All LOW and mitigated (see handoff § Brownfield Risk Review): R1 TypeScript optional field (additive, non-breaking), R2 backtick escape (same pattern as coreMeaning — mandatory in blueprint), R3 marketTrendLabel no regression (confirmed untouched), R4 withDetailLink no regression (conditional on prop, unaffected), R5 header comment preserved (template unchanged), R6 peers-intact rebuild (explicit safe command in blueprint).

**BUILD-STANDARD:** lean (apps/frontend/ zone exists, extending existing codegen pipeline, no new service/port/primitive).

## 2026-06-14T18:15Z — ARCH-KINHDICH-HOVER-ENRICH (RATIFIED, CLOSED)

**Task:** ARCH-KINHDICH-HOVER-ENRICH | zone: apps/kinh-dich-service/ (single zone)
**Output:** Board transition KINHDICH-HOVER-ENRICH→ready (owner=dev-kinh-dich), ARCH task closed.
**Key:** Option C CONFIRMED — new `HoverSummary localized` field. Service rebuild required for new Go binary.
