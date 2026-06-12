---
sprint: BCTC-ANALYTICS-LAYER
task_id: FIX-FINALIZE-STATUS-STUCK-PARTIAL
size: M
priority: high
depends_on: []
blocks:
  - FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE
  - FIX-PENDING-REFINE-TICKER-TARGETING
---

## TLDR

The finalize flow writes an effective `refine_status` (DONE/PARTIAL/FAILED) that can differ from the caller-supplied status due to the BEQ-7 completeness guard. This guard is correct (server owns the decision), but two feedback-loop gaps cause a deadlock: (1) the response doesn't return the effective status, so the caller is blind to overrides; (2) the queue predicate re-serves reports where all windows are DONE but section completeness is false (data-quality PARTIAL, not work-remaining PARTIAL). Fix the queue predicate (SQL exclusion subquery) to exclude fully-processed PARTIAL reports, and extend the finalize response to return the effective status + override flag for observability.

## [PM] Planning Context

**Acceptance Criteria:**

- [ ] AC-1-1: `get_bctc_pending_refine(limit:1)` after code lands returns a report with `id != fea19bae-2b7a-4954-b3e0-e09d7bfc7390`
- [ ] AC-1-2: A subsequent refine cron tick processes a PENDING report from the 34-report queue (queue drains by at least 1)
- [ ] AC-2-1: `finalizeBctcRefineTool` response includes `effective_status` field (one of DONE, PARTIAL, FAILED)
- [ ] AC-2-2: Response includes `beg7_override: true` when caller supplied DONE but BEQ-7 override fired
- [ ] AC-2-3: Response includes `beg7_override: false` when no override occurred
- [ ] AC-3-1: `get_bctc_pending_refine` SQL query includes the exclusion subquery (lines match architect brief SQL)
- [ ] AC-3-2: Index `idx_bctc_refined_units_report_status` is created (RF-1 mitigation)
- [ ] AC-3-3: EXPLAIN QUERY PLAN verified on both subqueries — lookup cost must be O(log n)
- [ ] AC-4-1: All existing finalize call sites still compile (response shape is additive)
- [ ] AC-4-2: No new test files created; handoff test gates in verification section below
- [ ] AC-5-1: `bun test` baseline remains >8800 pass / <=1 fail after changes

**Files to read first:**

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — BEQ-7 guard at lines 328–341, response object at bottom
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — queue query, Zod InputSchema
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` — orchestration context (how finalize is called)
- Architect brief: `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` — full design + risk flags RF-1 through RF-4

**Files to modify:**

1. **`apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`**
   - Line ~340 (after BEQ-7 override block): add comment explaining the state-machine ruling
   - Line ~1140 (response return): change from `{ ok: true, rows_parsed: totalRows }` to `{ ok: true, rows_parsed: totalRows, effective_status: report_status, beg7_override: callerWasDone && report_status === "PARTIAL" }`
   - Add a line `const callerWasDone = callerReportStatus === "DONE"` near the top after line 135 (after the `let report_status` declaration) to track the original caller value

2. **`apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`**
   - Replace the WHERE clause (lines 119–129) with the architect's SQL predicate from brief lines 98–112 (includes the exclusion subquery)
   - Verify the query still handles `(confirm_status IS NULL OR confirm_status != 'CONFIRMED')` correctly

3. **Infrastructure migration (database layer)**
   - Create or verify index: `CREATE INDEX IF NOT EXISTS idx_bctc_refined_units_report_status ON bctc_refined_units(report_id, window_status)` 
   - This should be added to the DB initialization / migration step (check `apps/mcp-server/src/infrastructure/db/` for schema-init files)

**Verification gates (mandatory before merge):**

1. **Live queue test:**
   - Connect to named volume DB: `docker exec vn-market-intelligence-mcp-mcp-server-1 sqlite3 /var/lib/market.db`
   - Run: `SELECT id, refine_status FROM financial_reports WHERE refine_status IN ('PENDING','PARTIAL','FAILED') ORDER BY created_at LIMIT 1;`
   - Result must be a report with `id != fea19bae-2b7a-4954-b3e0-e09d7bfc7390`
   - Then trigger a refine cron tick (or call `finalize_bctc_refine` with the new head report) and verify the queue advances

2. **Response shape test:**
   - Call `finalize_bctc_refine` with a known report and capture the response JSON
   - Verify response contains `effective_status`, `beg7_override`, `ok`, `rows_parsed` keys (no missing fields)
   - Parse response as JSON (no syntax errors)

3. **Index performance test:**
   - In the same sqlite3 session: `EXPLAIN QUERY PLAN <the subquery from get_bctc_pending_refine>;`
   - Both COUNT(*) subqueries must show an INDEX lookup (not SCAN); cost must be O(log n)

4. **Regression test:**
   - After code change, rebuild container (ops): `docker-compose down && docker-compose up -d`
   - Verify `get_bctc_full(ACB)` still returns a result (should not regress; ACB is stuck at PARTIAL but PUB-5 is a separate gate)
   - Run `bun test` — must pass existing baseline

**Risk flags (from brief):**

- **RF-1 (HIGH) — Subquery cost at scale:** The exclusion subquery runs on every `get_bctc_pending_refine` call. Verify index is created before landing. Dev must EXPLAIN QUERY PLAN both subqueries.
- **RF-2 (MEDIUM) — Response shape breaking change:** The response shape is additive (`effective_status` + `beg7_override` fields). This is non-breaking. However, if any caller hard-checks the response keys (e.g., `Object.keys(response).length === 2`), it will break. Dev must grep for all callers of `finalize_bctc_refine` in code and Telegram orchestration.
- **RF-4 (LOW) — Fleet cron pattern-match:** The fleet cron in Claude agent flow currently reads `{ ok: true, rows_parsed: N }`. The new fields are optional for interpretation; the cron can log them if present, or ignore them. No code change required in the cron, but doc should note the new fields are available.

**Dependencies:**

None. This task is P0 and unblocks P1 + P2.

---

## Architecture Reference

Full design in `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` §BUG 1. Key decisions:

**BEQ-7 Ruling:** The server's BEQ-7 completeness guard is architecturally correct. Do NOT remove it. The server must defend against false-DONE from callers that don't have section visibility.

**Fix A — Queue predicate (load-bearing):**

The SQL exclusion subquery is the load-bearing fix. It excludes PARTIAL reports where all windows are DONE (section incompleteness is data quality, not work remaining).

```sql
WHERE text_status = 'COMPLETE'
  AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
  AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  AND NOT (
    refine_status = 'PARTIAL'
    AND (
      SELECT COUNT(*) FROM bctc_refined_units u
      WHERE u.report_id = financial_reports.id
        AND u.window_status != 'DONE'
    ) = 0
    AND (
      SELECT COUNT(*) FROM bctc_refined_units u
      WHERE u.report_id = financial_reports.id
    ) > 0
  )
```

**Fix B — Response transparency (observability fix):**

Add `effective_status` and `beg7_override` to the response so the fleet cron can log overrides and the frontend can display the actual written status.

```typescript
// Old response:
{ ok: true, rows_parsed: totalRows }

// New response:
{ ok: true, rows_parsed: totalRows, effective_status: report_status, beg7_override: callerWasDone && report_status === "PARTIAL" }
```

---

## Implementation Notes

- **Zone:** `apps/mcp-server/src/` — interface layer (tool handlers + DB queries)
- **DDD:** interface-layer changes only; domain service `bctcSectionCompleteness` is unchanged
- **Container rebuild required:** After code change lands, ops must rebuild the container and verify live queue state
- **Sequential dependency:** This task must complete before FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE and FIX-PENDING-REFINE-TICKER-TARGETING can proceed

---

## Dispatch

**Agent:** `dev-mcp-server`

**Ready now:** Yes (no dependencies, P0)

**Estimated effort:** ~2h (fix A = SQL predicate + subquery + index; fix B = response shape edit + variable tracking)
