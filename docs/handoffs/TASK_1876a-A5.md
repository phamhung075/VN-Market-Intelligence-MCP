# Task 1876a-A5 — Re-deploy 1869b-seed migration on prod DB

**Sprint:** SPRINT-S | **Zone:** `apps/mcp-server/` | **OPS priority:** HIGH

---

## Context

Sprint 1869 (precision threshold tuning) shipped but watchlist rows on prod DB were
never migrated. VRE/HPG remain at -3.0 default; NVL/DPM/MWG are missing entirely.
Diagnostic 1876a-A4 confirmed root cause. This task re-executes the already-approved
1869b migration logic on the live prod DB.

---

## [Architect] Brownfield Findings

**Zone:** `apps/mcp-server/`

**Verified paths:**
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts:193-220`
  — `migrateWatchlistThresholds(db)` exists, idempotent, returns `{ standard, highVol }`.
  — Two SQL UPDATEs: standard tier -7.0 (only touches NULL/-3 rows), high-vol tier -9.0.
  — HIGH_VOL_TICKERS = `[NVL, DPM, REE, VNH, KBC, MWG, TCH]`.
  — Standard threshold: -7.0. High-vol threshold: -9.0.
- `apps/mcp-server/src/infrastructure/db/schema.ts:217`
  — `migrateWatchlistThresholds(db)` IS ALREADY CALLED inside `initDatabase()` — unconditionally,
  no isTestEnv guard, no row-count gate.
  — `seedWatchlist(db)` is also called (line 199) unconditionally for non-test envs.

**Critical finding — why prod rows were never migrated:**
`initDatabase()` calls `migrateWatchlistThresholds` correctly in code. The prod DB was
NOT restarted (container not rebuilt / restarted) after Sprint 1869 merged. No migration
runner independent of container startup exists — there is no `migrateDb.ts`, no
`migrations/` directory, no standalone migration CLI. The only execution path for
`migrateWatchlistThresholds` is via `initDatabase()` at container startup.

**Root cause (confirmed):** prod mcp-server container was not restarted after 1869b
merged. The code is correct and complete; the data fix requires only a container restart.

**No new files required. No code changes required.**

**Reuse pattern:** `initDatabase()` is the migration runner. Container restart = migration
execution. This is the established pattern (see schema.ts lines 206-258 — all inline
migrations follow the same pattern).

**Existing test coverage:** `src/__tests__/1869b-seed-watchlist-thresholds.test.ts`
— 9 test cases covering AC1-AC6 + full scenario. All pass in CI. No new tests needed.

**Scan clean:** true

---

## DECISION

**(a) exec-only** — restart mcp-server container. `initDatabase()` will call
`migrateWatchlistThresholds(db)` on startup. No code to write, no file to create.

The migration is idempotent: rows already at -7.0/-9.0 are untouched. Re-running is safe.

---

## EXECUTOR

**ops** — `docker-compose restart mcp-server` (or `docker-compose up -d mcp-server`).
Then run the 1876a-A4 verification query:

```sql
SELECT code, alert_drop_pct FROM watchlist ORDER BY alert_drop_pct;
```

Expected: 30+ rows, no -3.0, NVL/DPM/MWG present, high-vol at -9.0, rest at -7.0.

---

## ROLLBACK

If migration corrupts watchlist rows (extremely unlikely — idempotent UPDATE, no DELETE):

```sql
-- Restore all rows to pre-1869 default
UPDATE watchlist SET alert_drop_pct = -3.0;
```

Then revert `seedWatchlist.ts` to pre-1869b state and restart container. This restores
the old schema default while preserving all other watchlist columns untouched.

---

## AC

30+ rows in watchlist show thresholds -7.0/-9.0 per high-vol classification, no -3.0
defaults remaining, NVL/DPM/MWG present.

---

## FILES

None. Exec-only.

---

## RETURN
DONE: Brownfield findings complete — DECISION (a) exec-only. No code change needed.
ZONE: apps/mcp-server/
NEXT: pm | assign to ops, no PM subtask split needed (single-zone, exec-only)
HANDOFF: docs/handoffs/TASK_1876a-A5.md
PIPELINE: continue
