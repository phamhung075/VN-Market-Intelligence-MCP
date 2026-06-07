---
task_id: CLEAN-DEAD-SOURCE-IDS
sprint: FLEET-HOST-SAFETY (BATCH-5, zone: mcp-server)
status: REVIEW
owner: dev-mcp-server
date: 2026-06-07
---

# CLEAN-DEAD-SOURCE-IDS — Implementation Record

## Task Summary

Remove 6 retired/dead source IDs from the fetch-status serving surface:
`news`, `cafef1`, `vnexpress1`, `shared-url`, `vnbusiness`, `vietnambiz`.

These IDs have no live fetchers and produce permanent VERY-STALE entries
in the `/api/fetch-status` dashboard output.

---

## Scope Analysis

### How fetch-status generates source IDs

`fetchStatusHandler.ts:querySourceAges()` derives source slugs dynamically
from `rag_analyses.source_url` using SQL hostname extraction with
`GROUP BY source_slug`. There is NO hardcoded source ID registry.

The dead IDs appear because historical rows with matching URL patterns remain
in the DB. The fix is a SQL-level `HAVING source_slug NOT IN (...)` exclusion —
this removes them from the serving layer without touching historical DB data.

### Before / After source counts

- Before: fetch-status output includes all slugs derived from `rag_analyses`
  including the 6 dead ones (e.g. `vietnambiz` with last article 48h+ ago).
- After: only live slugs with no dead-ID entries.
- Source count change: -6 dead IDs from any fetch-status response that previously
  included them. Live sources (cafef, vnexpress, vneconomy, vietstock, etc.)
  are unaffected.

---

## Files Modified

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` | Added `DEAD_SOURCE_SLUGS` constant (exported) + extended HAVING clause with `NOT IN (?)` for all 6 dead IDs; updated `.all()` call to pass dead slugs as bound parameters. |
| `apps/mcp-server/src/__tests__/CLEAN-DEAD-SOURCE-IDS.test.ts` | NEW: 8 TDD tests covering AC-1 (each dead ID excluded), AC-2 (live sources unaffected), AC-3 (DEAD_SOURCE_SLUGS export). |
| `docs/data/orch/orch-state.json` | Added task CLEAN-DEAD-SOURCE-IDS to FLEET-HOST-SAFETY sprint with status REVIEW. |
| `docs/handoffs/CLEAN-DEAD-SOURCE-IDS.md` | This file. |

---

## Grep Evidence Per Dead ID (non-test source files)

All remaining hits in `apps/mcp-server/src` (non-test) are **justified**:

### `news`
- `slaStatusTools.ts:62,177,193` — `'news'` is an SLA signal type (maps to `rag_analyses.created_at`), not a fetch-status source slug. Different surface, no change needed.
- `vpsPushLogStore.ts:13,93` — `VpsService = "news"` is the VPS push log service discriminator (service="news" in vps_push_log table). Different table, not fetch-status.
- `pushNewsHandler.ts:37,102,107` — same VPS push log usage.
- `freshnessSlaChecker.ts` — domain SLA type "news", not fetch-status slug.
- `intelligenceCycleJob.ts:247`, `freshnessSlaMonitorJob.ts:86` — `WHERE service = 'news'` in vps_push_log queries.
- `agentSignalTools.ts:366`, `newsNormalizer.ts:43,963`, `tradeRelationships.ts:357` — "news" as a content/source-type discriminator.
- `resilientFetcher.ts:25` — comment documenting service name string.
- `vpsHealthPoller.ts:131` — `WHERE service = 'news'` in vps_push_log.
- `server.ts:1396` — passing "news" as a source_type column value in rag_analyses INSERT.

**All of the above are justified**: "news" here is either (a) a VPS push log service discriminator in the `vps_push_log.service` column, (b) an SLA signal type, or (c) a content-type discriminator. None are fetch-status source slug enumerations. The fetch-status slug "news" would only be derived from a source_url with hostname `news.*` — which is the dead pattern being excluded.

### `cafef1`
- `fetchStatusHandler.ts:67,75` — DEAD_SOURCE_SLUGS constant and comment (our addition).

No other hits in non-test source files.

### `vnexpress1`
- `fetchStatusHandler.ts:68,76` — DEAD_SOURCE_SLUGS constant and comment (our addition).

No other hits in non-test source files.

### `shared-url`
- `fetchStatusHandler.ts:69,77` — DEAD_SOURCE_SLUGS constant and comment (our addition).

No other hits in non-test source files.

### `vnbusiness`
- `fetchStatusHandler.ts:78` — DEAD_SOURCE_SLUGS entry (our addition).
- `newsDebugTriggerHandler.ts:42` — RSS URL in NEWS_SOURCES debug array. This is a debug/diagnostic tool, not the fetch-status surface. The debug trigger tool shows what the VPS _would_ scrape if re-enabled. No change needed — the tool is for debug purposes only.
- `pollNews.ts:110,624,662` — appears in `SourceFetchers` interface (optional VPS-only fetcher slot) and `vpsOnlyKeys` array. This is the news ingestion pipeline, not the fetch-status surface. Removing it here would break the VPS push pipeline architecture for potential future re-activation.
- `vnRelevanceFilter.ts:37` — `VN_SOURCE_IDS` list used to bypass keyword scan. Removing it would cause VN relevance check to fail for any articles pushed from vnbusiness.vn via the VPS. This is conservative/correct behaviour to keep.

### `vietnambiz`
- `fetchStatusHandler.ts:79` — DEAD_SOURCE_SLUGS entry (our addition).
- `newsDebugTriggerHandler.ts:41` — RSS URL in NEWS_SOURCES debug array. Same rationale as vnbusiness.
- `pollNews.ts:109,623,662` — same rationale as vnbusiness.
- `vnRelevanceFilter.ts:36` — `VN_SOURCE_IDS` list. Same rationale as vnbusiness.

---

## system-map.json Cross-Check

The 6 dead IDs were checked against `docs/data/system-map.json` `.data_sources[].id`:
- None of the 6 IDs (`news`, `cafef1`, `vnexpress1`, `shared-url`, `vnbusiness`, `vietnambiz`) appear as a `data_sources` entry in system-map.json.
- `news-vps` appears (the VPS proxy route for news, source_id="news-vps") — this is a different ID and is NOT dead.
- `vnbusiness` and `vietnambiz` do NOT appear in `data_sources` (they were direct RSS fetchers, not VPS-proxied infrastructure sources).

**No edits to system-map.json required.**

---

## G12 DoD Gate Evidence

### Gate 1: bun test (F-1 + CLEAN-DEAD-SOURCE-IDS)
```
src/__tests__/CLEAN-DEAD-SOURCE-IDS.test.ts:  8 pass / 0 fail
src/__tests__/F-1-fetch-ops-page-truth.test.ts: 21 pass / 0 fail
```

### Gate 2a: TypeScript check
```
bun tsc --noEmit
```
Result: Pre-existing errors in `tasksMdJanitorJob.ts` and `1980-f2-canon-schema.test.ts` only.
No errors in `fetchStatusHandler.ts` or any file touched by this task.

### Gate 2c: Tool count
Not applicable — no tools added/removed. `DEAD_SOURCE_SLUGS` is a data constant, not an MCP tool.

### Gate 2d: Scheduler count
Not applicable — no cron.schedule calls added/removed.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` — added DEAD_SOURCE_SLUGS export + HAVING NOT IN filter + bound params
  - `docs/data/orch/orch-state.json` — task CLEAN-DEAD-SOURCE-IDS added with status REVIEW
  - `docs/handoffs/CLEAN-DEAD-SOURCE-IDS.md` — this file
- **Tests written:** `apps/mcp-server/src/__tests__/CLEAN-DEAD-SOURCE-IDS.test.ts` — 8 assertions, GREEN
- **Type check:** clean for modified files (pre-existing errors in tasksMdJanitorJob.ts unrelated)
- **bun test:** 8 pass / 0 fail (new) + 21 pass / 0 fail (F-1 unchanged)
- **Tool count:** unchanged (no MCP tools added/removed)
- **Scheduler count:** unchanged (no cron.schedule added/removed)
- **Compiled code changed:** YES — `fetchStatusHandler.ts` is compiled TypeScript source
- **Docs updated:** NONE (no service docs reference fetch-status source enumeration)
- **Graphify:** skipped (no docs impacted)

---

## Compiled Code Changed

**YES** — `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` contains compiled TypeScript.
A container rebuild is needed to serve the updated fetch-status behavior.

---

## Zone Health

Zone health: fetchStatusHandler DEAD_SOURCE_SLUGS exclusion LIVE (8/0 tests). Pre-existing tsc errors in tasksMdJanitorJob.ts/1980-f2-canon-schema.test.ts (non-blocking, pre-date this task). | HEALTHY

---

## [QA] Review Record — 2026-06-07T02:50Z

**Verdict: APPROVED**

| AC | Result | Evidence |
|----|--------|---------|
| AC1: DEAD_SOURCE_SLUGS exported, 6 entries | PASS | File read fetchStatusHandler.ts L73-80; test DEAD_SOURCE_SLUGS has 6 entries, all 6 slugs present, length===6 |
| AC2: SQL bound params, no string interpolation of values | PASS | HAVING NOT IN (`${DEAD_SOURCE_SLUGS.map(()=>"?").join(",")}`) generates `?,?,?,?,?,?` — values spread via `.all(cutoff, ...DEAD_SOURCE_SLUGS)` |
| AC3: Live sources not filtered | PASS | DEAD_SOURCE_SLUGS contains exactly 6 dead IDs; test AC-2 verifies cafef/vnexpress/vneconomy/vietstock still appear |
| AC4a: CLEAN-DEAD-SOURCE-IDS test — 8 pass / 0 fail | PASS | `bun test src/__tests__/CLEAN-DEAD-SOURCE-IDS.test.ts` → 8 pass / 0 fail / 32 expect() calls |
| AC4b: F-1 suite — 21 pass / 0 fail | PASS | `bun test src/__tests__/F-1-fetch-ops-page-truth.test.ts` → 21 pass / 0 fail / 52 expect() calls |
| AC5: tsc — no NEW errors | PASS | 5 errors exactly (3× 1980-f2-canon-schema.test.ts, 2× tasksMdJanitorJob.ts) — all pre-existing, none in diff files |
| AC6: Commit scope 5 files | PASS | `git show d267e997 --stat` → 5 files: test A, fetchStatusHandler M, dev-mcp-server notebook M, orch-state M, handoff A. orch-state diff touches only new task row + `_updated_at`/`_updated_by` — signal_queue and other sprints untouched |
| AC7: Historical DB rows preserved | PASS | Only SQL change is HAVING clause (SELECT only). No DELETE/DROP/ALTER/migration in diff |

**mock-guard:** Exit 0 PASS — no fabricated-data patterns in fetchStatusHandler.ts

**DDD:** interface→infrastructure import (`vpsPushLogStore`) pre-existed (not in diff) — same pattern as vpsProxyHealthHandler.ts, consistent with QA cycle-198 precedent.

**Security:** No `process.env`, no hardcoded secrets/tokens/passwords in file or diff. SQL uses `?` bound parameters exclusively.

**NIT (non-blocking):** dev's orch-state `_updated_at` = 2026-06-07T00:00:00Z is earlier than predecessor 00:21:54Z (hand-typed stamp). Non-blocking; QA timestamp (02:50Z) is authoritative now.

**QA commit:** see QA notebook append + commit below.
