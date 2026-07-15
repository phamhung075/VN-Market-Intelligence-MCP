# ALPHA-S2-RAG-FTS-REBUILD-CRON — Cron Design (rag-service FTS rebuild)

**Task:** Archive-now — daily FTS-rebuild cron on rag-service so the hybrid BM25 leg stops
silently missing post-boot rows (FTS rebuild was never wired).
**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave 2)
**Verdict:** **LEAN single-implementation-zone FIX**, same shape as the just-landed sibling
`ALPHA-S2-OMO-LIQUIDITY-CRON` (commit `ae45fd0e7`) — the board carried `zone: multi` but
RAW-verification shows the target HTTP endpoint (`POST /admin/rebuild-fts`) **already exists and
is already tested** on `apps/rag-service/` (shipped by DFR-P3, 2026-06-08). The entire remaining
gap is identical to OMO's: **nobody calls it on a schedule.** No rag-service code change required.
**Primary ZONE:** `apps/mcp-server/` (new scheduler cron job + one new HTTP client function + 3
doc-registry updates).
**Secondary touch (verify-only, NOT edit):** `apps/rag-service/` — QA exercises the live
`POST /admin/rebuild-fts` + `POST /search` endpoints to confirm the behavioral DoD; no commit
expected there.
**BUILD-STANDARD:** not-applicable (in-zone scheduler wiring, zero new domain primitives — reuses
`AbortSignal.timeout` bounded-fetch idiom already established in `ragHttpClient.ts`,
`sendTelegramBug`, `buildJobTable`).

---

## 1. Problem

`apps/rag-service/interface/handlers.py:167-194` (`POST /admin/rebuild-fts`) calls
`vector_store._build_fts_index()` (`infrastructure/repositories.py:325-345`), which rebuilds the
LanceDB `title`+`summary` FTS indexes over the `rag_entries` table (`TABLE_NAME = "rag_entries"`,
`infrastructure/repositories.py:21`). This endpoint was built and unit-tested in DFR-P3
(`__tests__/unit/test_dfr_p3_hybrid_search.py`, AC-P3R-5) specifically so hybrid search
(`hybrid=true`, RRF-fused BM25+vector) stays fresh — but the DFR-P3 blueprint's own design
(`docs/architecture-briefs/2026-06-08-dfr-p3-hybrid-search-blueprint.md:62,68,202`) chose
**"Option C: lazy-on-first-hybrid-query + scheduled daily refresh"** and only the lazy half ever
shipped. The scheduled half — the mcp-server cron the blueprint names as
`deepFetchFtsRebuildJob.ts` — **was never written.**

Effect: the FTS index only rebuilds (a) once per container lifetime, lazily, on the first
`hybrid=true` search after boot (`_fts_index_built` flag, `repositories.py:80-83,405-410`), or (b)
on manual `POST /admin/rebuild-fts`. Every row indexed via `ragIndex()` (the mcp-server→rag-service
write path used by the news-analysis pipeline) **after** that one lazy build is invisible to the
BM25 leg until the next container restart. This silently degrades keyword recall for the sentiment
corpus (populated in parallel to `market.db`'s `rag_analyses` table) that feeds the
`ALPHA-S3` divergence screen — the vector leg still covers these rows (DFR-P3 risk register
R-P3-2, "Low" severity, precisely because of that fallback), so this has been a silent, partial
degradation rather than an outage, consistent with the board's "silently missing" framing.

---

## 2. Impl shape

### 2.1 New HTTP client function — extend, don't duplicate

`apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` already owns the established HTTP
boundary to rag-service (`ragSearch`, `ragIndex`, `ragHealthCheck` — all plain `fetch()` +
`AbortSignal.timeout(...)` + throw-on-`!response.ok`, **not** the `macroFetch<T>` discriminated
wrapper OMO used — that wrapper is macro-indicators-cluster-flavored and importing it here would
split the rag-service call-site convention across two styles for no benefit). Add a fourth
function in the same style:

```ts
export interface RagRebuildFtsResponse {
  status: string;
  message: string;
}

/**
 * Trigger a full FTS index rebuild on rag-service ('title' + 'summary' columns over rag_entries).
 *
 * DEADLINE NOTE: the DFR-P3 blueprint documents ~30-60s build time at 14k+ rows (and the corpus
 * has only grown since 2026-06-08) — do NOT reuse ragSearch/ragIndex's 8_000ms constant here.
 * A too-tight deadline would manufacture a false HARD-fail BUG alert every night for a
 * legitimately slow-but-successful rebuild.
 */
export async function ragRebuildFts(): Promise<RagRebuildFtsResponse> {
  const response = await fetch(`${RAG_SERVICE_URL}/admin/rebuild-fts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[ragHttpClient] rebuild-fts failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<RagRebuildFtsResponse>;
}
```

Export it from the barrel `apps/mcp-server/src/infrastructure/rag/index.ts` alongside the other
three active exports.

### 2.2 New scheduler cron job

**New file:** `apps/mcp-server/src/scheduler/rag/ragFtsRebuildCronJob.ts` (new `rag/` domain
subfolder under `scheduler/`, sibling convention to `macro/`, `news/`, `market-data/` — this is
the first mcp-server cron touching rag-service, so no existing folder fits).

```ts
export interface RagFtsRebuildCronDeps {
  notifyBug?: (msg: string) => Promise<unknown>;
  rebuildFn?: () => Promise<{ status: string; message: string }>;
}

export interface RagFtsRebuildCronResult {
  rebuilt: boolean;
  reason: string;
}

export async function runRagFtsRebuildCron(
  deps?: RagFtsRebuildCronDeps,
): Promise<RagFtsRebuildCronResult> {
  const notifyBug = deps?.notifyBug ?? ((m: string) => sendTelegramBug(m));
  const rebuildFn = deps?.rebuildFn ?? ragRebuildFts;

  try {
    const result = await rebuildFn();
    logger.info(`[rag-fts-rebuild-cron] FTS indexes rebuilt: ${result.message}`);
    return { rebuilt: true, reason: "ok" };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    const msg =
      `[rag-fts-rebuild-cron] rag-service /admin/rebuild-fts failed (${detail}) — FTS index NOT ` +
      `rebuilt today. Post-boot rows may be missing from the BM25 hybrid-search leg.`;
    logger.error(msg);
    await notifyBug(msg);
    return { rebuilt: false, reason: "http-error" };
  }
}
```

DI-injectable `deps.rebuildFn`/`deps.notifyBug` mirrors `runSbvOmoLiquidityCron`'s test seam
(`deps.baseUrl`/`deps.notifyBug`) — mock `rebuildFn` directly rather than mocking
`globalThis.fetch`, since `ragRebuildFts()` throws (Error-based contract) instead of returning
`macroFetch`'s discriminated envelope.

### 2.3 Fail-loud contract — single branch, simpler than OMO

Unlike OMO's HARD/SOFT split (which existed because SBV's endpoint has a genuine ambiguous
partial-success state), `POST /admin/rebuild-fts` has **no ambiguous state** — it either returns
`200 {"status":"ok"}` or raises/500s (`handlers.py:189-194`, generic `except Exception`). So:

- **HARD fail** (non-2xx, network error, or 90s timeout) → `sendTelegramBug()` + `logger.error`,
  every occurrence (dedup via the notifier's own 4h window — not re-implemented here).
- **Success** (200 `{"status":"ok"}`) → `logger.info` only, no alert.

No local DB write anywhere in this job (mirrors OMO's side-effect-free-by-construction proof) —
the write (LanceDB FTS index mutation) happens entirely server-side inside rag-service; this job
is a pure trigger+observe caller, same shape as `runSbvOmoLiquidityCron`.

### 2.4 Registration — 3 code touch points + 3 doc touch points (identical pattern to OMO)

**`cronConfig.ts` — new `CRONS` entry:**
```ts
/** ragFtsRebuildCron — daily FTS index rebuild trigger on rag-service
 *  (ALPHA-S2-RAG-FTS-REBUILD-CRON). Off-market UTC slot (VN market hours 02:00-08:59 UTC per
 *  isVnMarketHoursUtc, same avoidance idiom as sbvOmoLiquidityCron), non-:00/:30 minute mark.
 *  20:15 UTC daily (03:15 VN next day) — deep VN overnight, well after market close (08:59 UTC)
 *  and well before next reopen (02:00 UTC), after the day's ragIndex() write volume has settled.
 *  Slot verified free: hour-20 UTC already has sscCheck(:00), agmPlanRefresh(:30),
 *  cascadeBacktest(:37) — :15 is unused. */
ragFtsRebuildCron: Bun.env.CRON_RAG_FTS_REBUILD ?? '15 20 * * *',
```

**`schedulerJobTable.ts` — new `buildJobTable()` entry** (import `runRagFtsRebuildCron`, add
alongside the `sbvOmoLiquidityCronJob` entry):
```ts
{
  name: 'ragFtsRebuildCronJob',
  cron: CRONS.ragFtsRebuildCron,
  options: { timezone: 'UTC' },
  runner: async () => {
    const result = await runRagFtsRebuildCron()
    return { rowsWritten: result.rebuilt ? 1 : 0 }
  },
},
```
Registered via `registerJobTable()` — automatic `cron_job_runs` success/failure/duration
bookkeeping for free (same as every other `buildJobTable()` entry).

**No startup one-shot** — same rationale as OMO: there's nothing to "backfill"; the index either
needs rebuilding or the lazy-build fallback already covers it. Running twice on deploy would just
re-trigger the same idempotent-effect rebuild.

**Docs (3 places, `schedulerFileCount` 68→69 SSOT everywhere):**
1. `docs/data/cron-registry.json` — new `.jobs[]` row (same shape as the `sbvOmoLiquidityCron`
   row at line 78) + `schedulerFileCount: 68 → 69`.
2. `docs/data/system-map.json` — new entry in `mcp-server.crons[]` (rag-service's own `crons: []`
   entry, line ~620, stays `[]` — it is not a cron-owning service, same as macro-indicators).
3. `docs/standards/cron-jobs.md` — new `## RAG FTS Rebuild Cron (Trigger-Only)` section, same
   format as the adjacent `## SBV OMO Liquidity Cron (Trigger-Only)` section.

**Test-count bumps** (same convention as the 4 prior dated bumps):
- `apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts` — `schedulerFileCount` 68→69.
- `apps/mcp-server/src/__tests__/FACTORY-SCHEDULER-job-table-registry.test.ts` —
  `buildJobTable()`/`registerJobTable()` counts 61→62 (Group A/B), scheduler-boot smoke 83→84
  (Group D).
- `docs/data/project-stats.json` — NOT hand-edited; confirm via
  `bun scripts/gen-project-stats.ts --dry-run` that `schedulerFileCount`/`cronJobCount` pick the
  change up on their own (same verification step OMO's commit did).

**New test file:** `apps/mcp-server/src/__tests__/ALPHA-S2-RAG-FTS-REBUILD-CRON.test.ts` — 3
paths (fewer than OMO's 5 since there is no SOFT-fail branch): (1) success → mocked `notifyBug`
NOT called; (2) HTTP error (rejected/thrown from `rebuildFn`) → mocked `notifyBug` called with a
message naming the endpoint; (3) source-inspection assertion that the job module never imports
the DB/schema layer (mirrors OMO's side-effect-free structural proof, avoids the
`mock.module()`-leak class `mock-module-afterall-guard.test.ts` guards against).

---

## 3. ZONE(s)

- **Primary implementation zone: `apps/mcp-server/`** — all code changes (new cron job file, new
  `ragHttpClient.ts` function, `cronConfig.ts`/`schedulerJobTable.ts` registration, 3 docs, 2
  test-count bumps, 1 new test file). **dev-mcp-server implements the entire task in one commit** —
  same "do NOT decompose into a multi-subtask epic" verdict OMO reached, for the identical reason
  (no DDL, no write-path change, single service owns 100% of the code).
- **Secondary touch (verify-only, zero commit expected): `apps/rag-service/`** — the endpoint
  under test (`POST /admin/rebuild-fts`) and the search endpoint used for the behavioral DoD check
  (`POST /search` with `hybrid=true`) already exist and are unmodified. QA exercises them live; no
  dev-rag-service hop is required for this task.

---

## 4. DoD (numbered, verifiable)

1. `runRagFtsRebuildCron()` calls `POST /admin/rebuild-fts` via the new `ragRebuildFts()` client
   function, bounded by a deadline generous enough to clear the DFR-P3-documented ~30-60s build
   time at current corpus size (90s recommended — confirm/tune against a live timing run if the
   corpus has grown enough to threaten that margin).
2. HARD fail (non-2xx / network / timeout) → `sendTelegramBug()` + `logger.error`, every
   occurrence (test: mocked `rebuildFn` rejects → mocked `notifyBug` called).
3. Success (`{"status":"ok"}`) → `logger.info` only, no alert, no local DB write of any kind
   (test: mocked `rebuildFn` resolves → mocked `notifyBug` NOT called; source-inspection proof the
   module never imports the DB/schema layer).
4. Zero new tables/DDL/schema anywhere — this job writes nothing itself; the LanceDB index mutation
   happens entirely server-side inside the already-shipped rag-service endpoint.
5. Cron + docs registered in the 3 places: `docs/data/cron-registry.json` (`.jobs[]` +
   `schedulerFileCount` 68→69), `docs/data/system-map.json` (`mcp-server.crons[]` new entry),
   `docs/standards/cron-jobs.md` (new section, same format as the adjacent OMO section).
6. `1190-pipeline-watchdog.test.ts`'s `schedulerFileCount` guard bumped 68→69 with a dated BUMP
   comment; `FACTORY-SCHEDULER-job-table-registry.test.ts`'s two counts bumped 61→62 / 83→84.
7. `docs/data/project-stats.json`'s generator-derived fields NOT hand-edited — confirmed via
   `--dry-run` they pick the change up unassisted.
8. **Behavioral BM25-freshness check (QA, live, post-deploy)** — the actual "recent rows searchable"
   proof the board note requires, executed against the running containers:
   a. `curl -X POST http://rag-service:5002/index` (or via mcp-server's `ragIndex()`) with a
      synthetic entry containing a unique, never-before-indexed token in its `summary` field.
   b. `curl -X POST http://rag-service:5002/search -d '{"query":"<unique token>","hybrid":true}'`
      **before** any rebuild — vector leg may or may not surface it depending on distance; this
      step is context, not a pass/fail gate.
   c. Trigger the rebuild — either wait for the 20:15 UTC cron fire, or
      `curl -X POST http://rag-service:5002/admin/rebuild-fts` manually — confirm `{"status":"ok"}`.
   d. Re-run the same `POST /search` (`hybrid:true`) query — the synthetic row now appears via the
      BM25 leg (RRF-fused rank), confirming the FTS index picked up a post-boot row. This is the
      literal DoD claim ("recent rows are searchable via the BM25 leg") — a passing result here is
      the task's actual behavioral proof, independent of the mcp-server unit tests in §2.4 (which
      only prove the *trigger* fires correctly, not that rag-service's rebuild does its job — that
      half was already proven by DFR-P3's own `test_dfr_p3_hybrid_search.py`).
   e. Confirm a `cron_job_runs` row for `ragFtsRebuildCronJob` appears after the first live cron
      fire (free via `registerJobTable()`'s automatic wrapping — same mechanism every other
      `buildJobTable()` entry gets).

---

## 5. Out of scope

- No `apps/rag-service/` code change of any kind — `POST /admin/rebuild-fts` and
  `_build_fts_index()` are already shipped and unit-tested (DFR-P3, AC-P3R-5). This task closes
  purely the "nobody calls it on a schedule" gap, identical in shape to how OMO closed macro-
  indicators' "nobody calls `/liquidity-state`" gap. No separate dev-rag-service task should be
  minted.
- No incremental/delta FTS rebuild — LanceDB's native `create_index(config=FTS())` rebuilds the
  entire index every call (DFR-P3 blueprint's own documented constraint, §"Why not on-write?");
  out of scope to change that here.
- No change to the lazy-build fallback (`_fts_index_built` per-container flag) — this cron is
  additive to it, not a replacement (Option C in the DFR-P3 blueprint always intended both halves
  to coexist).

---

## 6. Recommended relay

**SPRINT-S, single atomic task, no zone split needed despite the board's `zone: multi` framing**
(same resolution OMO reached): pm mints **one** `dev-mcp-server` task covering §2.1-2.4 in a single
commit (new client function + new cron job file + registration + docs + test bumps + new test
file). dev-mcp-server implements + runs the new unit test file + confirms
`gen-project-stats.ts --dry-run` unaffected. qa then RAW-verifies both the unit tests (mocked) AND
executes the §4 item-8 live behavioral check against the running rag-service + mcp-server
containers — that live check is the actual proof the board's DoD asks for, and it requires no new
committed code in either service, only live HTTP calls.

`owner: developer` / `next_agent: dev-mcp-server` / `sprint: FLOW-PRICE-ALPHA-LOOP` (unchanged).
Board `zone` should be corrected `"multi"` → `"apps/mcp-server/"` by whichever hop owns the
`orch-state.json` write (architect does not write orch-state per this task's coordination
constraints — router/pm to apply).
