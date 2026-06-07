---
task_id: BEQ-2
task_title: "Audit + trigger refine pipeline for PENDING BCTC corpus (exclude CTG)"
task_type: FIX
task_size: S
task_owner: dev-mcp-server
task_zone: apps/mcp-server/
sprint: BCTC-EXTRACT-QUALITY
depends: ["BEQ-1-SPIKE"]
acceptance_criteria:
  - "bctcRefineJob.ts eligibility criteria audited and documented (why CTG/VCB/FPT-Q4/VNM/EIB/DIG have refine_status=PENDING with zero bctc_refined_units)"
  - "One-time backfill trigger (or broadened eligibility) moves PENDING corpus → DONE (or PARTIAL if partial-table overlap)"
  - "Refine pipeline overwrites garbage scalars (from symptom B+C) with correct refined values"
  - "CTG excluded from backfill (pre-existing blocker: BCTC-CTG-ATTACHMENT-FETCH, cover-letter-only PDF)"
  - "After backfill, FPT 2025-Q4, VNM, EIB, DIG refine_status transitions PENDING→DONE"
success_proof:
  - "Direct in-container query post-backfill: `SELECT code, refine_status, bctc_refined_units FROM financial_reports WHERE code IN ('VCB', 'FPT', 'VNM', 'EIB', 'DIG') ORDER BY code` — all show refine_status='DONE' (or 'PARTIAL') with >0 bctc_refined_units"
  - "Verify scalars overwritten: FPT 2026-Q1 net_profit before = XXX, after = correct refined value (verify via get_bctc_full, not HTTP echo)"
  - "Unit test: mock a PENDING ticker with 0 refined_units + 100 bctc_table_rows, run refine job, assert PENDING→DONE + refined_units>0"

---

## Task Context

**Root cause (Symptom A):** The `bctcRefineJob` scheduler (`apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`) triggers refine only for reports meeting eligibility criteria. Most of the corpus (CTG, VCB, FPT 2025-Q4, VNM, EIB, DIG) has `refine_status=PENDING` with zero `bctc_refined_units` rows. The eligibility filter is either too narrow, or the job has not run for these tickers.

**Evidence from brief:**
```
CTG 2026-Q1:  refine_status=PENDING, table_rows=0,       units_total=0, units_done=null
VCB 2025-Q4:  refine_status=PENDING, table_rows=0,       units_total=0, units_done=null
VCB 2025-Q1:  refine_status=PENDING, table_rows=0,       units_total=0, units_done=null
FPT 2025-Q4:  refine_status=PENDING, table_rows=79 (all balance_sheet), units=0
VNM 2025-Q4:  refine_status=PENDING, table_rows=143 (all NULL value_current), units=0
EIB 2026-Q1:  refine_status=PENDING, extraction_method=pdf-parse, units=0
DIG 2025-Q4:  refine_status=PENDING, extraction_method=pdf-parse, units=0
```

Contrast with refined tickers (FPT 2026-Q1, ACB 2026-Q1):
```
FPT 2026-Q1:  refine_status=DONE, table_rows=145, bctc_refined_units=145 (scalars correctly mapped)
ACB 2026-Q1:  refine_status=DONE, table_rows=106, bctc_refined_units=106
```

**Why this task unblocks everything:** Once refine status transitions PENDING→DONE, symptoms B (zeroed secondary lines) and C (garbage scalars) auto-resolve because the refine pipeline rewrites the scalars.

---

## Code Location & Audit Scope

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`

**Audit tasks (PLAN-ONLY findings, document in handoff):**

1. **Eligibility criteria analysis:**
   - Read the job's eligibility logic (likely filters on extraction_method, table_rows count, prior_status, etc.)
   - For each PENDING ticker (CTG, VCB, FPT-Q4, VNM, EIB, DIG), determine why it was skipped:
     - Does it have `bctc_table_rows > 0`? (CTG/VCB have 0 rows, special case)
     - Does it have OCR confidence > some threshold?
     - Is it age-gated (only recent periods)?
     - Is it blacklisted?

2. **Backfill trigger design:**
   - Option A: Broaden the eligibility filter (e.g., remove age gate, lower confidence threshold, include zero-row reports if they have OCR text)
   - Option B: Write a one-time backfill script that manually dispatches `push_bctc_refined_unit` for each PENDING ticker
   - Document which option is chosen and why

3. **CTG exclusion logic:**
   - CTG has `table_rows=0` (cover-letter-only PDF, no financial tables present)
   - Even if refine job runs, there is nothing to refine
   - Backfill must exclude CTG; note the pre-existing blocker BCTC-CTG-ATTACHMENT-FETCH in commit message

---

## Implementation Path

### Step 1: Audit (PLAN-ONLY, document findings)
- Read bctcRefineJob.ts eligibility logic
- Query live DB for each PENDING ticker's metadata (extraction_method, bctc_table_rows count, ocr_confidence, filing_date, extraction_timestamp)
- Document findings in commit message or a companion audit note

### Step 2: Execute backfill
- Once eligibility root cause is clear, either:
  - **Merge strategy:** Temporarily broaden the job eligibility, let it run once on the full corpus, then restore normal eligibility
  - **Backfill script:** Write a one-off script that manually queues refine jobs for PENDING tickers with >0 table_rows

### Step 3: Verify post-backfill
- Query DB after backfill: all PENDING tickers (except CTG) now have refine_status='DONE' or 'PARTIAL'
- Spot-check refined scalars (FPT 2026-Q1 net_profit, ACB 2026-Q1 operating_profit, etc.) match the true values

---

## Testing & Verification

### DV-1: Pre-backfill audit (MUST complete before backfill triggers)
1. Query the live DB: `SELECT code, sort_key, refine_status, bctc_table_rows, bctc_refined_units FROM financial_reports WHERE refine_status='PENDING' ORDER BY code`
2. For each row, document:
   - Code, sort_key
   - extraction_method, ocr_confidence, filing_date
   - bctc_table_rows count (is it >0? which statement sections?)
   - Why the job skipped it (based on eligibility logic)
3. **Output:** A audit findings table in the commit message or a PLAN-ONLY comment

### DV-2: Post-backfill verification (after backfill script runs)
1. Re-run the same query from DV-1
2. **Expected:** All PENDING rows (except CTG) now show refine_status='DONE' or 'PARTIAL' with bctc_refined_units>0
3. **Spot-check scalars:**
   ```sql
   SELECT code, sort_key, refine_status, net_profit, operating_profit, ebitda, cash 
   FROM financial_reports 
   WHERE code IN ('FPT', 'VNM', 'EIB', 'DIG') AND refine_status='DONE'
   ORDER BY sort_key DESC
   ```
   — Verify values are non-zero and reasonable (not legacy OCR garbage)

### DV-3: Integration proof (NO HTTP echo)
- Connect to mcp-server: `docker exec -it mcp-server /bin/bash`
- Direct DB read: `bun scripts/inspect-db.ts --query "SELECT COUNT(*) FROM financial_reports WHERE refine_status='PENDING'"`
- **Expected after backfill:** PENDING count = 1 (CTG only; all others DONE)

### Anti-false-green (unit test)
- Mock a PENDING ticker with valid `bctc_table_rows` (e.g., 100 rows)
- Trigger the refine job (or backfill script)
- Assert `refine_status` → 'DONE' (or 'PARTIAL') and `bctc_refined_units` > 0

---

## WIP & Serialization

**Zone:** apps/mcp-server (single git tree)
**Serialization:** 
- Must complete BEFORE BEQ-3 (column audit) ships, so that FIX-2 can verify the new columns are being populated correctly
- Independent of BEQ-4a/4b (they are serve-side guards, this is data-production)

**Blocking relationship:**
- Unblocks BEQ-3 (column audit cannot verify new fields until refine runs and populates them)

---

## DoD Checklist

- [ ] Eligibility criteria audit completed (findings documented in commit message or brief)
- [ ] Backfill trigger designed and implemented (broadened filter OR one-off script)
- [ ] CTG explicitly excluded from backfill (documented in code or script)
- [ ] DV-1 pre-backfill audit query run and findings recorded
- [ ] Backfill executed (all PENDING tickers with >0 table_rows now DONE/PARTIAL)
- [ ] DV-2 post-backfill query confirms refine_status transitions + scalars non-zero
- [ ] DV-3 integration proof (direct DB count shows PENDING count=1 or 0)
- [ ] Unit test added (mock PENDING ticker → refine runs → DONE + units>0)
- [ ] Commit message references architect brief 2026-06-02-bctc-extract-quality.md § FIX-1
- [ ] Commit message notes CTG exclusion reason (BCTC-CTG-ATTACHMENT-FETCH blocker)
- [ ] orch-state.json task marked DONE with commit SHA

---

## Related Artifacts

- **Architect Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-1
- **Related backlog item:** BCTC-CTG-ATTACHMENT-FETCH (keep as separate backlog item, do NOT fold into this task)
- **Sprint:** BCTC-EXTRACT-QUALITY
- **Blocks:** BEQ-3 (column audit needs refine to populate new fields)
- **Blocked by:** BEQ-1-SPIKE (analysis complete)
