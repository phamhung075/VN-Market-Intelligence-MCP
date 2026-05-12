# Task 1876a-A6 — Seed 7 high-vol watchlist tickers at -9.0 alert_drop_pct

**Sprint:** SPRINT-S | **Zone:** `apps/mcp-server/` | **OPS priority:** HIGH

---

## Context

Sprint 1869 precision threshold tuning shipped standard tier to prod (c52: 31 rows at -7.0 via
`docker-compose restart mcp-server`). HIGH-VOL GAP confirmed: 7 tickers (NVL/DPM/REE/VNH/KBC/MWG/TCH)
are completely absent from the `watchlist` table — they have never been seeded. The existing
`migrateWatchlistThresholds()` function only UPDATEs rows that already exist; with 0 rows to
match, it silently produces `highVol: 0`. Predecessor 1876a-A5 closed the standard-tier gap;
this task closes the high-vol gap.

---

## [Architect] Brownfield Findings

**Verified files:**
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`
- `apps/mcp-server/src/infrastructure/db/schema.ts` (L194-217)
- `docs/handoffs/TASK_1876a-A5.md`
- `docs/pipeline-state.json` (c52 ops confirmation)

---

### Q1 — Tier classification source

**Location:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` L173-178.

```
export const HIGH_VOL_TICKERS = ["NVL", "DPM", "REE", "VNH", "KBC", "MWG", "TCH"] as const;
export const STANDARD_DROP_PCT = -7.0;
export const HIGH_VOL_DROP_PCT = -9.0;
```

This is the canonical SSOT for the tier classification. The Sprint 1869 design rationale
(real-estate + retail sectors with daily std-dev > 2σ of watchlist average) is documented in the
JSDoc comment at line 168. The `HIGH_VOL_TICKERS` constant is the single authoritative list.

**All 7 tickers confirmed:** NVL, DPM, REE, VNH, KBC, MWG, TCH — exact match with task spec.

---

### Q2 — Seed vs migrate scope

**Root cause: SEED GAP (not migrate gap).**

Examination of `WATCHLIST_SEED` array (L33-72): zero entries for any of the 7 high-vol tickers.
The array contains 25 tickers (Oil&Gas, Agriculture, Banking, Real Estate, Steel, Aviation, Tech,
Securities, Machinery, Pharma, Utilities). None of NVL/DPM/REE/VNH/KBC/MWG/TCH appear.

Execution sequence in `schema.ts::initDatabase()`:
1. L199: `seedWatchlist(db)` — UPSERT from `WATCHLIST_SEED` (25 rows; high-vol tickers absent)
2. L217: `migrateWatchlistThresholds(db)` — UPDATE rows matching `HIGH_VOL_TICKERS` to -9.0
   → 0 rows matched because step 1 never inserted them.

**Decision: Option (a) — add 7 INSERT entries to `WATCHLIST_SEED` array.**

Rationale:
- The UPSERT in `seedWatchlist()` uses `ON CONFLICT(code) DO UPDATE`, making it fully idempotent.
- Inserting the 7 tickers into `WATCHLIST_SEED` with the same default thresholds (drop=-3) means
  they will be created on container restart, and then `migrateWatchlistThresholds()` (called
  immediately after in step 2) will UPDATE them to -9.0 in the same startup sequence.
- Option (b) (auto-insert inside `migrateWatchlistThresholds`) would conflate two concerns:
  migration (threshold update) and seeding (initial row creation). This violates the existing
  separation between `seedWatchlist` (data presence) and `migrateWatchlistThresholds` (threshold
  correctness).
- Option (c) is unnecessary — option (a) alone completes the full fix in one atomic startup.

**Files to edit:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` only.

**Concrete change:** add 7 entries to `WATCHLIST_SEED`. Each entry needs `code`, `exchange`, and
`domain`. Exchange and domain per ticker:

| Ticker | Exchange | Domain |
|--------|----------|--------|
| NVL    | HOSE     | real_estate |
| DPM    | HOSE     | chemicals |
| REE    | HOSE     | utilities |
| VNH    | HNX      | real_estate |
| KBC    | HOSE     | real_estate |
| MWG    | HOSE     | retail |
| TCH    | HOSE     | real_estate |

Note on domain: `chemicals`, `retail` are new domain values not currently in the seed array. They
are free-form strings stored as `TEXT` in the watchlist table — no enum constraint exists in the
schema. Using descriptive domain strings is consistent with existing pattern (e.g., `"machinery"`,
`"pharma"` already present). No schema change needed.

---

### Q3 — Idempotency + rollback

**Idempotency: SAFE.**

`seedWatchlist()` uses `ON CONFLICT(code) DO UPDATE SET ...` which overwrites thresholds for
existing rows. To prevent `seedWatchlist()` from overwriting the -9.0 threshold that
`migrateWatchlistThresholds()` just set (they run in this order each restart), the UPSERT
default is drop=-3 and `migrateWatchlistThresholds()` Step 2 is an unconditional UPDATE for
high-vol tickers that runs after. On each subsequent restart:
1. UPSERT resets high-vol rows to drop=-3 (conflict branch fires, overwrites).
2. `migrateWatchlistThresholds()` immediately re-applies -9.0.
Net effect: correct thresholds on every restart. Already confirmed idempotent for standard tier
via c52 prod restart (31 rows correct).

**Production state:** 31 standard rows at -7.0; 0 high-vol rows. No transient state.
Re-running on prod is safe — standard rows untouched (UPDATE WHERE drop IS NULL OR drop=-3
excludes -7.0 rows).

**Rollback path:**
If the 7 new rows ship with wrong domain/exchange values or cause unexpected alert behavior:
```sql
DELETE FROM watchlist WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH');
```
Then revert the `WATCHLIST_SEED` addition in `seedWatchlist.ts` and restart container. No cascade
risk — watchlist is a reference table (no FK children that would orphan on delete in the alert
pipeline; alert scan reads watchlist at runtime, not via FK).

---

### Q4 — Restart strategy

**`migrateWatchlistThresholds()` fires on every container start: CONFIRMED.**
Path: `docker-compose restart mcp-server` → `initDatabase()` L217 → `migrateWatchlistThresholds(db)`.
No `isTestEnv` guard on this call (L217 is outside the `if (!isTestEnv)` block at L198-204).

**Adding 7 rows to `WATCHLIST_SEED` is picked up without container rebuild.**
`seedWatchlist.ts` is application code compiled at Docker image build time. Adding rows to the
constant array requires a code commit → developer builds a new image → `docker-compose up -d
mcp-server` (pulls new image). This is the standard deploy path for mcp-server code changes.

No separate `docker build` step if the compose file uses a pre-built image tag and CI rebuilds on
merge. If the compose uses `build: .`, developer runs `docker-compose up --build mcp-server`.

**Drizzle migration files: NOT needed.** No schema change. Pure runtime seed data added to
existing TypeScript constant. The existing migration runner (`initDatabase()`) covers it.

---

### Q5 — Acceptance Criteria

**AC1 (primary):** 7 high-vol rows present at correct threshold:
```sql
SELECT COUNT(*) FROM watchlist
WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH')
  AND alert_drop_pct = -9.0;
-- Expected: 7
```

**AC2 (standard tier untouched):** Standard rows remain at -7.0:
```sql
SELECT COUNT(*) FROM watchlist WHERE alert_drop_pct = -7.0;
-- Expected: >= 31
```

**AC3 (no stale defaults):** No rows remain at old -3.0 default:
```sql
SELECT COUNT(*) FROM watchlist WHERE alert_drop_pct = -3.0 OR alert_drop_pct IS NULL;
-- Expected: 0
```

**AC4 (total row count):** Watchlist contains at least 32 rows (25 original + 7 high-vol):
```sql
SELECT COUNT(*) FROM watchlist;
-- Expected: >= 32
```

**AC5 (idempotency):** Second container restart leaves counts unchanged — run AC1+AC2+AC3
immediately after a second `docker-compose restart mcp-server`:
```sql
SELECT code, alert_drop_pct FROM watchlist
WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH')
ORDER BY code;
-- Expected: 7 rows, all alert_drop_pct = -9.0
```

**AC6 (exchange correctness):** Spot-check exchange assignment:
```sql
SELECT code, exchange FROM watchlist
WHERE code IN ('NVL','DPM','REE','KBC','MWG','TCH')
ORDER BY code;
-- Expected: all HOSE; VNH = HNX
```

**AC7 (test suite passes):** Existing `1869b-seed-watchlist-thresholds.test.ts` (9 tests) all
pass after adding 7 rows to `WATCHLIST_SEED` — no new test failures introduced.
```bash
cd apps/mcp-server && bun test src/__tests__/1869b-seed-watchlist-thresholds.test.ts
-- Expected: 9 passed, 0 failed
```

---

## FILES TO EDIT

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` | Add 7 entries to `WATCHLIST_SEED` array |

No other files required. No schema changes. No new test file needed (existing 9-test suite covers
the full 25+7 scenario per `dev-mcp-server` notebook).

---

## EXECUTOR

**dev-mcp-server** — edit `WATCHLIST_SEED`, add 7 entries (NVL/DPM/REE/VNH/KBC/MWG/TCH).
Then **ops** — `docker-compose up --build mcp-server` (or `docker-compose up -d mcp-server` if
CI auto-builds image on merge). Then verify AC1-AC4 via SQL.

---

## ROLLBACK

```sql
DELETE FROM watchlist WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH');
```
Revert `WATCHLIST_SEED` addition in `seedWatchlist.ts`, rebuild, restart. No cascade risk.

---

## RETURN

1876a-A6 SPRINT-S brownfield
ZONE: apps/mcp-server/
decision: (a) — add 7 entries to WATCHLIST_SEED; migrateWatchlistThresholds() runs after seed on every startup, applying -9.0 unconditionally
ac_count: 7
files_to_edit: [apps/mcp-server/src/infrastructure/db/seedWatchlist.ts]
rollback: DELETE 7 rows + revert WATCHLIST_SEED commit + restart
handoff: docs/handoffs/TASK_1876a-A6.md
PIPELINE: continue
NEXT: pm
