# TASK_REPORT_1402 — Resolve Stranded agent_feedback Rows (IDs 73, 76, 77)

## Status
DONE

## Date
2026-04-28

---

## Investigation Findings

### Actual Row State (before fix)

| ID | status | reparse_attempts | priority | PDF file |
|----|--------|-----------------|----------|----------|
| 73 | new    | 6               | high     | 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf |
| 76 | new    | 6               | high     | 20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf |
| 77 | new    | 6               | high     | 20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf |

Note: the handoff stated `status='stranded_bctc_pdf'` but the actual DB value was `status='new'`.
The title pattern `[AUDIT] stranded_bctc_pdf%` is how the bctcReparseJob identifies these rows.

### Why They Were Stuck

`bctcReparseJob` queries `WHERE status = 'new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'`.
Each row was picked up on every cycle, but `reparse()` failed all 6 times — the PDFs for
FPT Q4-2025 and VCB Q4/Q1-2025 could not be extracted. After 3 attempts the rows were escalated
to `priority='high'`. After the alert threshold the job logs a warning but does NOT auto-resolve;
the rows stay `'new'` indefinitely, blocking the fallback queue each cycle.

### FK Dependency Check

`PRAGMA foreign_key_list('agent_feedback')` returned empty — no outgoing foreign keys.
`system_changelog.related_feedback_id` was checked: no entries point to IDs 73, 76, or 77.
Update is safe with no cascade effects.

---

## Fix Applied

**Approach: UPDATE** (preserves audit trail — consistent with all 40+ prior stranded_bctc_pdf
resolutions in this table).

The schema has no `resolved_at` or `resolution_note` columns; the established pattern across
all historical resolutions in this table is to set `status = 'resolved'`.

```sql
UPDATE agent_feedback
SET status = 'resolved', priority = 'medium'
WHERE id IN (73, 76, 77)
  AND status = 'new'
  AND title LIKE '[AUDIT] stranded_bctc_pdf%';
```

Script committed at: `scripts/fix-stranded-feedback-rows.sql`

---

## Verification

Post-fix query results:

| ID | status   | reparse_attempts |
|----|----------|-----------------|
| 73 | resolved | 6               |
| 76 | resolved | 6               |
| 77 | resolved | 6               |

Guard query (`SELECT COUNT(*) WHERE id IN (73,76,77) AND status != 'resolved'`) returned **0**.

---

## Impact on bctcReparseJob

On the next cycle, `bctcReparseJob` will find 0 rows matching
`status='new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'` for these IDs.
The disk-scan fallback path is unblocked. If the underlying PDFs (FPT/VCB) are re-fetched
from VPS in future, the auditor will emit fresh `agent_feedback` rows and the reparse loop
will retry them cleanly from `reparse_attempts=0`.

---

## Files Changed

- `scripts/fix-stranded-feedback-rows.sql` — one-shot SQL script (created)
- `apps/mcp-server/reports/TASK_REPORT_1402.md` — this report (created)
- Live DB: `market.db` agent_feedback rows 73, 76, 77 updated in-place
