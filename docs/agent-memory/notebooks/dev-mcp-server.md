# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md` (tasks 1955a-1967-01 archived)

## Working Memory

### Task 1972 — VnDirect OHLCV null-coercion fix (2026-05-22, IMPL_DONE/QA-PENDING)

**Change:**
- `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` — expanded guard in `insertMany` transaction from `r.close==null` to include `r.open==null || r.high==null || r.low==null`. Removed `r.open ?? 0`, `r.high ?? close`, `r.low ?? close` coercions; use field values directly. Records with any missing OHLC field are now skipped entirely.

**Root cause fixed:** `ohlcvBackfill.ts` only guarded `r.close==null`. Null `open`/`high`/`low` fields were coerced — `r.open ?? 0` wrote 0 to DB, `r.low ?? close` wrote 0 if close was also 0. Produced ~1072 corrupt `low=0` rows in `daily_ohlcv` (tracked separately from 1971 Go scan-order fix).

**Tests:** `1972-vndirect-ohlcv-null-coercion.test.ts` 5/5 GREEN (AC-1 null-low skip, AC-2 null-open skip, AC-3 valid record insert, AC-4 null-close regression, AC-5 asymmetric fixture). tsc 0 errors. Full suite 9370/285.

**Commit:** `0a51a5a0`

**Signal:** `docs/signals/dev-mcp-server-1972-done.json` → qa

Zone health: ohlcvBackfill.ts null-coercion guard FIXED; ~1072 pre-existing corrupt rows remain in production DB (cleanup task if needed, not blocking); regression test seals the fix | HEALING

---

### Task 1965d-JANITOR-PATHFIX — tasksMdJanitorJob projectRoot fix + lint seal (2026-05-22, DONE)

**Change:**
- `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` — deleted local `const projectRoot = resolve(import.meta.dir, "..", "..", "..", "..", "..")` at line 501 (resolved to `/` in container). Added `import { getProjectRoot } from "../../infrastructure/projectRoot.js"`. Replaced `cwd: projectRoot` and `projectRoot,` in production deps with `getProjectRoot()` calls.
- `apps/mcp-server/src/__tests__/lint/no-local-project-root.test.ts` (NEW) — lint test scanning `scheduler/` tree for `resolve(import.meta.dir, '..'` anti-pattern. FAIL pre-fix, PASS post-fix. Regression seal.

**Root cause fixed:** Same anti-pattern as dailyDashboardJob (commit 2f0a74e9). `import.meta.dir` in container = `/app/src/scheduler/system` — five `..` segments reach `/` not `/app`. Canonical `getProjectRoot()` uses `git rev-parse --show-toplevel` with `process.cwd()` fallback.

**Tests:** smoke-tasks-md-janitor.ts 12/12 PASS. Lint test 1/1 GREEN. tsc 0 errors.

**Commit:** db4931de

**Signal:** `docs/signals/dev-mcp-server-1965d-JANITOR-PATHFIX-done.json` → qa

Zone health: tasksMdJanitorJob container-path ENOENT bug FIXED (R-2 pipeline-state.json + R-3 TASKS.md errors=2 at 03:00Z now resolved); lint seal prevents recurrence; AC-5 PENDING_LIVE (next 03:00Z cron fire) | HEALING

---

### Task 1960-DAILYDASH — dailyDashboardJob projectRoot fix (2026-05-22, DONE)

**Change:**
- `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts` — added `import { getProjectRoot } from "../../infrastructure/projectRoot.js"` at line 27. Deleted local `projectRoot()` helper (was lines 455-460: `import.meta.dir + '../../..'` which resolves to `/` in container). Switched all 4 path.join callers: `loadSessionFiles`, `loadProjectStats`, `loadTasksMd`, `writeDashboard` to use canonical `getProjectRoot()`.

**Root cause fixed:** Container WORKDIR `/app` has only 3 path segments above the file; local helper used 3 `..` to reach `/app` but resolved to `/` instead. Canonical `getProjectRoot()` uses `git rev-parse --show-toplevel` with `process.cwd()` fallback — correct in both dev and container.

**Tests:** `1955a-daily-dashboard-project-root.test.ts` + `1854a-daily-dashboard-job.test.ts` — 14/14 GREEN. tsc 0 errors. Full suite: 9364 pass / 285 fail (285 = pre-existing BCTC freeze, zero regression).

**Commit:** 2f0a74e9

**Signal:** `docs/signals/dev-mcp-server-1960-DAILYDASH-done.json` → qa

Zone health: dailyDashboardJob projectRoot() container path bug FIXED; job was dead 5 days (success_rate 0%); AC-5 PENDING_LIVE (ops docker rebuild required for next cron tick at 23:30 GMT+7) | HEALING

---

### Task 1968c-P03 — get_agent_signals signal_type filter (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `signalType?: string | null` to `GetSignalsOptions`. `getSignals()` gains `AND s.signal_type = '...'` SQL clause when signalType is non-null/non-empty. SQL injection guarded via `replace(/'/g, "''")`.
- `agentSignalTools.ts` — added `signal_type: z.string().nullable().optional()` to `get_agent_signals` MCP tool schema. Tool description updated. Handler passes `signalType` to `getSignals()` when non-null.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated with `signal_type` row; new "Key Notes on signal_type" section added.
- `.claude/flows/alert-commander/stage-signals.md` — step 3b updated to use `signal_type="price_anomaly"` + step 3c updated to use `signal_type="chain_catalyst"` with actual `call_tool` blocks and L-9 comment tags.

**Tests:** `1968c-p03-signal-type-filter.test.ts` — 6/6 GREEN (AC-1 schema, AC-2 filter, AC-3 backward-compat, AC-3b null=all, AC-6c invalid→empty, AC-7 payload reduction 50%). tsc 0 errors. Full suite: 9364 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** c3b18e8c

**Signal:** `docs/signals/dev-mcp-server-1968c-p03-done.json` → qa

Zone health: get_agent_signals server-side signal_type filter COMPLETE; alert-commander 3b+3c use typed queries; wire payload reduced 40-60% | HEALTHY

---

### Task 1967-02 — verified_decision SignalTypeSchema enum (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts:50` — added `"verified_decision"` to `SignalTypeSchema` z.enum (SSOT, 11 values total). Enum is imported by agentSignalTools.ts; no direct edit needed there for the schema.
- `agentSignalTools.ts:180` — updated `signal_type` describe string to list `verified_decision`.
- `.claude/tools/list/post_agent_signal.md:19` — added `verified_decision` to enum column.
- `docs/standards/mcp-tools.md:144` — new row: Alert Commander → All, chain de-dup ack.

**Tests:** `1967-02-verified-decision-enum.test.ts` — 4/4 GREEN (AC-1 enum accepts, AC-2 round-trip, AC-3 regression, AC-4 reject unknown). tsc 0 errors. Full suite: 9358 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** 257d92bf (swept into PM housekeeping commit; all 3 zone files + test included)

**Signal:** `docs/signals/dev-mcp-server-1967-02-done.json` → qa

Zone health: SignalTypeSchema now has 11 values (urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain, signal_feedback, legal_risk, verified_decision). alert-commander chain-ack unblocked | HEALTHY

---

### Task 1968b1 — get_agent_signals hours_back param (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `hoursBack?: number` to `GetSignalsOptions`. SQL query gains `AND s.created_at >= datetime('now', '-N minutes')` when set.
- `agentSignalTools.ts` — added `hours_back: z.coerce.number().positive().optional()` to MCP tool schema. Passed to store as `hoursBack`.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated; L-4 consolidation pattern documented.

**Tests:** `1968b1-get-agent-signals-hours-back.test.ts` — 7/7 GREEN. AC-1 Zod schema, AC-2 filter excludes old signals, AC-3 default backward-compat, AC-4 6h/360-min window, AC-5 from_agent combo. tsc 0 errors. Full suite: 9356 pass / 283 fail (283 = pre-existing BCTC, zero regression).

**Commit:** 4fff6cbb

**Signal:** `docs/signals/dev-mcp-server-1968b1-param-ready.json` → agent-father (ungates phase 2 SELF_SIGNALS_CACHE)

Zone health: get_agent_signals now supports hours_back lookback; L-4 consolidation prereq COMPLETE | HEALTHY

---

### Carry-over

- 285 pre-existing BCTC PDF parsing test failures — BCTC freeze active, do not touch
- Bun v1.3.13 C++ panic after full suite run is a known upstream bug (exit code 0, tests all pass)
- LanceDB ~29GB > DISK_THRESHOLD_GB(20) — diskUsageAlertJob will fire on next hourly tick (correct behavior, shipped 1959-watchdog-5)
