# Decision Journal — Sprint FE-PAGE-REORG · architect

**Sprint goal:** FE-PAGE-REORG (active sprint; this task is an ERROR-AUDIT-2026-06-15 Wave-2 cross-sprint item)
**Agent:** architect
**Started:** 2026-06-16T00:00:00Z

---

### STEP architect-S2 · architect · 2026-06-16T06:30:00Z
**task-id:** FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
**what-done:** Brownfield scan of apps/frontend/; issued blueprint for fetchUtils.ts (3 helpers); confirmed 28 Cluster A files (not 26); resolved 4 ARCH-RATIFY items; excluded dashboard.bctc-inspect.tsx; confirmed FE-PAGE-REORG FR-4 absorption.
**what-considered:**
- Cluster A exact count: BA spec said "~26". Brownfield found 28 inline-fetch loaders. `dashboard.bctc.tsx` and `dashboard.vps.tsx` were not in BA's list. Both confirmed as inline-fetch pattern (Cluster A). `dashboard.bctc-inspect.tsx` was in neither Cluster A nor B in the BA spec; brownfield confirmed it is a raw-HTML relay with a different error contract — excluded cleanly.
- ARCH-RATIFY-FE-1 (`apiGet` internal deadline): Considered bounding `apiGet` internally. Rejected: (a) no `signal` merging logic; (b) 3 caller categories — 2 are already covered by the Cluster C migration (body replacement removes the `apiGet` call); (c) the 3rd category (EC-8 loaders: db/services/fetch) is out of scope and needs follow-on anyway. Outer-deadline-sufficient verdict matches BA recommendation.
- ARCH-RATIFY-FE-2 (`fetchWatchlistPrices`): Considered allowing `null` return (simpler). Rejected: requires caller change in watchlist tile loop — out of scope. `safeFetch` with `parseWatchlistPrices` returning `{}` is the zero-caller-change path. Confirmed correct.
- ARCH-RATIFY-FE-3 (EC-8 scope): Considered expanding scope to include EC-8 loaders now. Rejected: `apiGet` signal-merge is a separate concern requiring its own spec. Follow-on task is the clean path.
- ARCH-RATIFY-FE-4 (FE-PAGE-REORG absorption): Only option — `fetchUtils.ts` is strictly richer than planned `loader-utils.ts safeFetch`; creating `loader-utils.ts` would violate NFR-5 (circular risk) and duplicate the SSOT. Absorption is unambiguous.
- `parse(null)` vs `emptyT` parameter: `emptyT` parameter considered (avoids the re-invoke risk). Rejected: forces all 28 callers to supply an extra argument; the parse function already owns the empty-shape logic. `parse(null)` is the DRY choice; RISK-1 documented for PM to propagate.
- Timer type: `let timer: ReturnType<typeof setTimeout>` vs `let timer: number`. Under `@remix-run/node` types + ES2022 lib, `setTimeout` return resolves to `NodeJS.Timeout` in Node context. `ReturnType<typeof setTimeout>` is environment-agnostic. Confirmed as the correct pattern (same reasoning as W2-MCP-FETCH-DEADLINE `withDeadline`).
**why-decision:** All ratifications follow existing codebase conventions confirmed by brownfield read. The one deviation from BA spec is the Cluster A count (28 not 26) — two files missed in the BA audit. The design blueprint gives dev-frontend exact file lists and code-level guidance to avoid the RISK-4 double-migration trap and RISK-1 parse-null contract gap.

### STEP architect-S3 · architect · 2026-06-18T00:33:09Z
**task-id:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
**what-done:** Designed threshold-triggered worktree-push backstop extending FU-ORIGIN-LAG-PUSH-DISCIPLINE. Chose Option-B (PO flow step). Codified divergence-reconcile guards, bg-agent safety check, and decomposed 4 PM tasks.
**what-considered:**
- Option-A (launchd/cron): adds always-on component + cron inventory debt; same outcome as B with more overhead. Rejected.
- Option-B (PO flow step): no new component; rides existing PO tick (~15 min); worktree isolation means main tree never touched. Chosen.
- Option-C (post-commit hook): reduces to B inside hook with push-storm risk outside mutex. Rejected.
- Rebase vs merge for behind-set: rebase requires clean tree (defeats the purpose). MERGE for cloud-chore-only behind-set is both safe and proven (po-s84 manual execution). orch-state.json conflict → keep HEAD (cloud chores are additive).
- N=20 vs N=50: N=50 still lets 100-commit backlogs form (~2h). N=20 bounds to <1h. Tunable as `PUSH_THRESHOLD` in script.
**why-decision:** Option-B has the smallest blast radius, no new always-on component, and the worktree isolation recipe is already proven across 2 manual executions. PO is the semantic owner of push decisions in this project (all past push events were PO-triaged).
**why-change:** no change from PO-preferred design (PO explicitly noted "prefer option-b" in task spec).

### STEP architect-S3 · architect · 2026-06-17T05:00:00Z
**task-id:** ARCH-OHLCV-WRITER-SSOT-DURABLE
**what-done:** Brownfield recon of all daily_ohlcv writers; confirmed Writer G (writeForeignFlowToOhlcv) as the sole remaining bypassing writer; designed merge-only UPDATE-only replacement; issued blueprint + architecture brief.
**what-considered:**
- Route through writeOhlcvBatch: REJECTED — writeOhlcvBatch writes OHLCV columns; the foreign-flow writer has no OHLCV values to pass; forcing it through the SSOT would require fabricating OHLCV values, which is the exact problem being solved.
- Separate `daily_foreign_flow` table (option F): CORRECT long-term design; REJECTED for P0 — schema migration on live named-volume DB with 1200+ ticker-years of data; needs its own ARCH task + dev sprint.
- NULL close via schema ALTER: BLOCKED — SQLite does not support DROP NOT NULL without table rebuild.
- UPDATE-only (merge-only): CHOSEN — aligns with the writer's semantic contract (enrich existing row); deferred gap (no OHLCV row yet) is honest (/goal#1); 2–3h window accepted; follow-on F eliminates it.
- Sentinel close value (-1 etc.): REJECTED — still corrupts RSI if sentinel leaks into TA window.
**why-decision:** Merge-only is the only P0-safe approach given the schema NOT NULL constraint and live-DB rebuild risk. It closes the stub-INSERT path permanently. /goal#2 generic: no per-ticker logic. Follow-on table design queued as ARCH-DAILY-FOREIGN-FLOW-TABLE.
**why-change:** Cluster A count adjusted from ~26 to 28 (two files added). `dashboard.bctc-inspect.tsx` added as explicit exclusion. Follow-on Wave-3 task minted for EC-8 loaders. FE-PAGE-REORG FR-4 redirect confirmed.

### STEP architect-S1 · architect · 2026-06-16T00:00:00Z
**task-id:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
**what-done:** Ratified 4 open items, confirmed layer placement, issued blueprint with DDD risk notes for `withDeadline` + `macroFetch` shared helper.
**what-considered:**
- ARCH-RATIFY-W2-1: Error subclass vs tagged object. Tagged object rejected — no precedent in codebase; `instanceof` discrimination unreliable on non-Error shapes. Subclass wins (4 existing `extends Error` patterns confirmed).
- ARCH-RATIFY-W2-2: `err.name === 'AbortError'` vs `instanceof DOMException`. Two live Bun callers already use `.name` check (`foreignFlowFetcher`, `clients.ts`). DOMException instanceof check is less stable across Bun versions. `.name` wins.
- ARCH-RATIFY-W2-3: 7 files / 8 calls. `carryTools.ts` has TWO fetch calls (:57 `/snapshot`, :134 `/macro-calendar`). T-11 = 7 files, annotated as 8 migrations. No task split needed.
- ARCH-RATIFY-W2-4: `pushToMcpServer:79` folded into T-5. Localhost-to-localhost; 10s deadline (architect reduced from BA's implicit no-deadline). Splitting creates false dependency.
**why-decision:** RISK-1 (macroFetch upward import) is the only blocking deviation from BA spec — resolved by adding `baseUrl` as first parameter. All other ratifications follow existing codebase conventions confirmed by brownfield read.
**why-change:** macroFetch signature gains `baseUrl` param to avoid infrastructure→interface upward import. T-5 scope expands to cover `:79`. T-11 description must note 8 calls across 7 files.
