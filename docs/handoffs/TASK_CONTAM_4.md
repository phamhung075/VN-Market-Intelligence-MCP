---
agent: dev-mcp-server
task_id: CONTAM_4
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 4 (parallel after CONTAM-1, PRIMARY FIX per amendment)
depends_on: CONTAM_1
---

# TASK CONTAM-4: Add unit guard to Writers D & E — VNDIRECT backfill normalization (BINDING AMENDMENT)

## BINDING AMENDMENT NOTICE

**Signed:** 2026-06-12T07:53:30Z

**Key amendment:** Writers D/E must NORMALIZE to full-VND, not just guard. Root-cause seed = Writer D space-timestamp rows (L113+L255-259 taOhlcvBackfillJob.ts), not Writer A first-push. This is the PRIMARY FIX location per architect brief Decision 2 & 3.

## Summary

Writers D (`taOhlcvBackfillJob.ts`) and E (`ohlcvBackfill.ts`) handle VNDIRECT 18-month and 2-year backfills respectively. **PO live-verified that VNDIRECT delivers prices in THOUSAND-VND for these rows** (the architect brief's "full-VND" claim is FALSIFIED). These writers must **NORMALIZE thousand-VND → full-VND (×1000) before upsert**, NOT merely guard-and-skip. A pure range-skip would DROP every VNDIRECT row (all fall below the 100-VND floor) and silently break the backfill while leaving the contamination seed un-repaired.

## Context — PO BINDING CORRECTION (overrides architect brief)

- **VNDIRECT delivers THOUSAND-VND, not full-VND.** PO live evidence (keinos sqlite3 on market.db): VCB row `62.3` (= 62,300 VND), VNH `0.9` (= 900 VND), DAG `1.4` — all carry SPACE-format `updated_at` (`datetime('now')`) = Writer D signature (`taOhlcvBackfillJob.ts` L113). Writer D L255-259 inserts `r.open/high/low/close` with NO `×1000`.
- **Therefore Writer D is the PRIMARY thousand-scale seed injector** for penny tickers (the exact VNH case the user reported). The fix is NORMALIZE-at-write, not skip.
- **`continue`/skip is FORBIDDEN here** — skipping a sub-100 stock row drops valid (thousand-scale) data and stops the backfill. Normalize instead.
- Writer E (`ohlcvBackfill.ts`) MUST be re-verified live against its VNDIRECT endpoint; if it also returns thousand-VND, apply the same ×1000 normalization. If a live probe proves Writer E already returns full-VND, document the probe result in the commit and apply guard-only there.
- Both writers use full-overwrite upsert (`ON CONFLICT DO UPDATE SET open/high/low/close`) — once a normalized full-VND row is written, it self-heals the contaminated seed.

## Files to Modify

### Primary
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` (L113+L255-259 block)
- `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` (insertMany transaction)

### Dependencies
- Import: `validateOhlcvUnit` from `domain/services/ohlcvUnitGuard` (CONTAM-1)

## Changes Required

### Writer D — `taOhlcvBackfillJob.ts`

**Location:** L113 (upsert SQL) + L255-259 (the insertMany transaction block where records are upserted)

**Pattern — NORMALIZE then guard (NOT skip):**
```typescript
import { normalizeOhlcvToVnd, validateOhlcvUnit } from '../../domain/services/ohlcvUnitGuard';

// In the transaction loop (around L255-259):
for (const record of records) {
  // STEP 1 — Normalize VNDIRECT thousand-VND → full-VND (×1000) BEFORE upsert.
  // VNDIRECT returns thousand-VND for these rows (PO live-verified). normalizeOhlcvToVnd
  // detects scale (e.g. stock value < 100 floor) and multiplies by 1000; if already
  // full-VND it is a no-op. Indices are exempt.
  const norm = normalizeOhlcvToVnd("stock", {
    open: record.open, high: record.high, low: record.low, close: record.close,
  });

  // STEP 2 — Guard the NORMALIZED values (defensive: a still-out-of-range row after
  // normalization is genuinely corrupt → log + skip, never throw).
  const guardResult = validateOhlcvUnit(record.code, "stock", norm.open, norm.high, norm.low, norm.close);
  if (!guardResult.valid) {
    log.error(`[taOhlcvBackfill] post-normalize guard rejected ${record.code} ${record.date}: ${guardResult.reason}`);
    continue;
  }

  // STEP 3 — Upsert the NORMALIZED full-VND values (self-heals contaminated seed rows).
  upsertStmt.run(record.code, record.date, norm.open, norm.high, norm.low, norm.close, record.volume, now);
}
```

**Key line numbers:** L113 (upsert SQL — `datetime('now')` space-ts), L255-259 (upsert block — add normalize+guard here)

### Writer E — `ohlcvBackfill.ts`

**Location:** insertMany transaction.

**FIRST: live-probe Writer E's VNDIRECT endpoint** (record the result in the commit body).
- If thousand-VND → apply the SAME normalize-then-guard-then-upsert pattern as Writer D.
- If proven full-VND → apply guard-only (no normalize) and document the live probe proving full-VND.

```typescript
import { normalizeOhlcvToVnd, validateOhlcvUnit } from '../../domain/services/ohlcvUnitGuard';

// In insertMany transaction:
for (const record of records) {
  const norm = normalizeOhlcvToVnd("stock", {
    open: record.open, high: record.high, low: record.low, close: record.close,
  });
  const guardResult = validateOhlcvUnit(record.code, "stock", norm.open, norm.high, norm.low, norm.close);
  if (!guardResult.valid) {
    log.error(`[ohlcvBackfill] post-normalize guard rejected ${record.code} ${record.date}: ${guardResult.reason}`);
    continue;
  }
  upsert.run(record.code, record.date, norm.open, norm.high, norm.low, norm.close, record.volume, now);
}
```

> NOTE on `normalizeOhlcvToVnd`: this helper is added to `ohlcvUnitGuard.ts` under CONTAM-1 (see updated CONTAM-1 handoff). If CONTAM-1 ships without it, CONTAM-4 is BLOCKED — coordinate with the CONTAM-1 implementer.

## Acceptance Criteria

### Functional
- [ ] Each VNDIRECT record is NORMALIZED to full-VND (×1000 when thousand-scale) BEFORE upsert in Writer D
- [ ] A VNDIRECT thousand-VND row (e.g. VCB=62.3) is written as full-VND (62300) — NOT skipped
- [ ] Guard runs on the POST-normalize values; a still-out-of-range row is logged + skipped (never thrown)
- [ ] Re-running Writer D over a contaminated seed row (VNH open=0.9) overwrites it with full-VND (900) — self-heal verified
- [ ] Writer E: live-probe result documented; normalize applied iff endpoint returns thousand-VND
- [ ] Backfill still writes rows after the change (regression guard: row-count must NOT drop to ~0)

### Code Quality
- [ ] Both files import validateOhlcvUnit at top
- [ ] Guard calls wrapped in try/catch
- [ ] No schema or query changes (pure guard addition)
- [ ] tsc passes

### Test Coverage
- [ ] Integration test (CONTAM-7): seed DB with contaminated row (open=0.9); re-run Writer D/E backfill; verify row is updated to full-VND

## Definition of Done

- [ ] `taOhlcvBackfillJob.ts` modified at L113+L255-259, guard added
- [ ] `ohlcvBackfill.ts` modified in insertMany transaction, guard added
- [ ] Both files compile (tsc check)
- [ ] Commit message: `fix(scheduler/infrastructure): Writers D & E — add ohlcv unit guard on VNDIRECT records`
- [ ] Ready for integration test

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/scheduler/market-data/` (Writer D) + `apps/mcp-server/src/infrastructure/fetchers/` (Writer E)
- **DDD:** Scheduler + Infrastructure layers (use domain service)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Writers D & E, Decision 2 & 3, Binding Amendment

## Blockers
- Blocked until CONTAM-1 is committed

## Dispatch Notes
- Size: S (small, two focused changes)
- Parallelizable with CONTAM-2 and CONTAM-3 after CONTAM-1
- **PRIMARY FIX per binding amendment:** This task is critical for stopping contamination at the backfill layer

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` — added import of normalizeOhlcvToVnd + validateOhlcvUnit; replaced bare upsert in insertMany transaction with normalize-then-guard-then-upsert pattern (try/catch around both calls)
  - `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` — same import + normalize-then-guard-then-upsert in insertMany transaction
- **Tests written:** `apps/mcp-server/src/__tests__/CONTAM-4-writers-d-e-normalize.test.ts` — 7 assertions, GREEN
  - AC-D1: VNH open=0.9 written as 900 (×1000)
  - AC-D2: full-VND row written unchanged (no-op)
  - AC-D3: contaminated seed self-healed on re-run → open=900
  - AC-D4: all-zero row guard-rejected, count stays 0
  - AC-D5: row-count does NOT drop to 0 for clean full-VND fetch (35 rows written)
  - AC-E1: Writer E thousand-VND row normalized to full-VND
  - AC-E2: Writer E new date row written as full-VND (not dropped)
- **Git commits:** see below
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test:** 12770 pass / 0 fail (full suite; Bun C++ post-run crash is known unrelated to tests; exit 0)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 78 cron.schedule entries — matches pre-task baseline (baseline 76 as of FIX-PROJECT-STATS-GENERATED; current baseline 78)
- **Docs updated:** NONE (no architecture docs impacted)
- **Graphify:** skipped (no docs impacted)

## Writer E Live-Probe Evidence

**Endpoint:** `https://api-finfo.vndirect.com.vn/v4/stock_prices?code=VNH&sort=date&size=5&page=1&fromDate=2026-06-01&toDate=2026-06-12`

**Live sample (2026-06-12):**
- KSD open=4.9, close=4.9 (< 100 floor → THOUSAND-VND)
- VHH open=2.7, close=2.7 (< 100 floor → THOUSAND-VND)
- NQB open=10.1, close=10.1 (< 100 floor → THOUSAND-VND)
- TNP open=22.1, close=22.1 (< 100 floor → THOUSAND-VND)

**Verdict:** Writer E uses the SAME endpoint as Writer D (`api-finfo.vndirect.com.vn/v4/stock_prices`). Live values are in THOUSAND-VND. The SAME normalize-then-guard pattern applies.

## G12 Gate Evidence

| Gate | Command | Result |
|------|---------|--------|
| bun test suite | `cd apps/mcp-server && bun test` | 12770 pass / 0 fail — exit 0 |
| tsc | `bun tsc --noEmit` | exit 0 (clean) |
| tool count | `gen-project-stats.ts --dry-run` | 157 tools — matches baseline |
| scheduler count | `grep -rc cron.schedule scheduler/` | 78 — matches baseline |

---

## [QA] Review Record · 2026-06-12T09:45:00Z

**Verdict:** APPROVED
**Report:** reports/TASK_REPORT_CONTAM-4.md
**DJ entry:** sprint-OHLCV-UNIT-CONTAM-qa.md § qa-S3

**Evidence:**
- bun test CONTAM-4: 7 pass / 0 fail (QA-reproduced); full suite 12770 pass / 0 fail (exit 0)
- tsc --noEmit: exit 0 (QA-reproduced)
- DDD: PASS (scheduler + infrastructure layers; domain import allowed)
- Security: PASS (mock-guard EXIT 0)
- taOhlcvBackfillJob.ts L259-295 + ohlcvBackfill.ts L205-240: normalize-then-guard-then-upsert in both files
- Binding amendment: NORMALIZE ×1000 not skip — AC-D1 (VNH=0.9→900), AC-D5 (35 rows written) confirmed
- toolCount=157, schedulerCount=78 — unchanged

**Status:** CONTAM-4 → DONE
