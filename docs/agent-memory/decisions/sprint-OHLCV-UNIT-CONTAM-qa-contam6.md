<!-- size-justification: 80L — QA decision journal for CONTAM-6 repair migration, verdict reasoning, scope miss assessment -->
# Decision Journal — sprint: OHLCV-UNIT-CONTAM | Task: CONTAM-6

**task-id:** CONTAM-6
**date:** 2026-06-12
**agent:** qa
**sprint:** OHLCV-UNIT-CONTAM

## Verdict: PASS (with scope-miss findings logged as follow-up, not blocking)

## What was considered

### Checks executed (all live named volume vn-market-intelligence-mcp_market_data)

**Check 1 — Contamination scan (primary gate):**
Query: `WHERE (open<100 OR low<100) AND NOT all-zero AND open>0 AND low>0 AND close>1000`
Result: **0 rows** — PASS. The 376 repaired rows all pass the heuristic; no remaining contamination under the task-defined criteria.

**Check 2a — VNH user-symptom rows:**
VNH 2026-06-08/09/10: open=900.0, close=900.0 — same scale, PASS.
VNH 2026-06-12: open=0.9, close=1000.0 — boundary edge case (close=1000.0 exactly, strict heuristic requires >1000). This row was inserted today post-repair. Heuristic correctly excluded it per spec (`close > 1000`, not `>= 1000`). Logged as follow-up scope miss (boundary ambiguity).
VNH 2026-06-11: open=0.9, close=0.9 — both in same unit (thousand-VND, pre-ingest normalization miss). Not a CONTAM-6 scope row (close not > 1000).

**Check 2b — FPT user-symptom rows:**
FPT clean repaired days: 2026-06-08 open=75000, 2026-06-09 open=72900, 2026-06-10 open=73700 — all in full-VND range, PASS.
FPT 2026-06-11/12: open=0.0 and open=73.1 (low=0.0) — these are the separate low=0 defect pattern. Not in CONTAM-6 heuristic scope (low=0 → `low>0` guard excludes them). New contamination post-repair (CONTAM-2 live writer guard issue, separate defect).

**Check 3 — Spot-check TRA/PVI/DFF:**
TRA: repaired rows in ~78000-81000 range — PASS (plausible VN market price).
PVI: repaired rows in ~77500-78200 range — PASS.
DFF: repaired rows 2026-04-24 through 2026-05-29 in ~400-500 range — PASS (DFF is genuinely a low-priced stock, ~500 VND, not 500k). DFF open=0.5 rows not repaired (close=500 < 1000 → outside heuristic, correctly excluded).

**Check 4 — All-zero rows untouched:**
Query: `WHERE open=0 AND low=0 AND high=0 AND close=0` → **116 rows** — matches developer claim, PASS.

**Check 5 — Script persistence:**
`scripts/migrations/repair-ohlcv-unit-contamination.ts` exists — PASS.
`docs/policies/dev-standards.md` § Script Persistence has pointer — PASS.

**Check 6 — pct-change sanity:**
VNH Jun09→Jun10: 900→900, pct=0.0% (< 30%) — PASS.
FPT Jun09→Jun10: 73700→74200, pct=0.68% (< 30%) — PASS.

**Test suite:** 14 pass / 0 fail (CONTAM-6 targeted) — PASS.
**tsc:** exit 0 (clean) — PASS.

## Scope miss findings (non-blocking — logged for follow-up)

**SM-1 — VNH 2026-06-12 boundary:** close=1000.0 exactly excluded by strict `> 1000` heuristic. Contaminated row (open=0.9) not repaired. Impact: 1 row. Root: heuristic boundary ambiguity + new row arriving post-repair. Separate ticket needed.

**SM-2 — 460 pre-repair rows (low=0):** open<100, open>0, close>1000, low=0 — excluded by `low>0` guard in repair heuristic. These have a different defect pattern (open in wrong units, low=0). Outside CONTAM-6 binding amendment scope. 460 rows. Follow-up needed.

**SM-3 — 59 today's rows (low=0):** Same pattern as SM-2 but inserted 2026-06-12 post-repair. CONTAM-2 guard should have caught these. Suggests CONTAM-2 guard does not fully block low=0 contamination pattern. Separate defect — CONTAM-2 guard scope review needed.

## Why PASS (not CHANGES_REQUESTED)

The primary acceptance criteria from TASK_CONTAM_6.md are all met:
- 376 rows repaired (developer reports), 0 remaining under the task-defined heuristic
- All-zero rows untouched (116 confirmed)
- Script persisted in scripts/ with flow-doc pointer
- Tests green, tsc clean
- Spot-check values plausible

The scope miss rows (SM-1/2/3) represent defects OUTSIDE the binding amendment scope and heuristic design. They are not regression introduced by CONTAM-6 — they pre-existed or are new contamination from a separate path. Blocking CONTAM-6 for out-of-scope rows would be incorrect gating. Follow-up tasks should address SM-2/3 (460+59 rows with low=0 pattern) and SM-1 (boundary fix >=1000 vs >1000).

## Why-change: no change from standard approval path
All primary checks green. Scope miss logged for pm/dev follow-up, not blocking current task.
