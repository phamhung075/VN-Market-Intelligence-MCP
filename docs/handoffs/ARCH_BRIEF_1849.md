# Architect Brief — BATCH-S-1849 Resolution Tracking

**For:** Architect review (pre-approval for developer execution)
**Date:** 2026-05-07
**Type:** SPRINT-S schema + interface extension

---

## Context

Dev-team cron currently marks all reports "processed" after triage, losing visibility into issues that are still unresolved. This causes recurring bugs to slip through undetected because the first report has already been archived.

**User requirement:** Add resolution state to telegram_reports so unresolved issues (claimed, monitoring) stay visible in the dev-team loop until explicitly resolved (fixed, wontfix, duplicate).

---

## Design Decision: Status vs. Resolution

**Question:** Should we extend the `status` field (new/claimed/fixed/...) or add a separate `resolution` field?

**Selected Approach:** Separate columns
- `status` TEXT: new | processed (backward-compatible, unchanged semantics)
- `resolution` TEXT: none | fixed | wontfix | duplicate | monitoring | claimed (NEW, tracking issue outcome)

**Rationale:**
1. **Backward compatibility:** Existing code queries `status = 'new'` and `status = 'processed'`. Adding a separate column doesn't break those.
2. **Clarity:** Status = "is this report in the system?" vs. Resolution = "how was this issue resolved?"
3. **Audit trail:** We can mark a report "processed" (archived) while keeping resolution for future reference (for reporting & dedup).

**Alternative rejected:** Merge into single status enum
- PRO: Simpler schema
- CON: Breaking change for existing flow code + queries
- CON: Can't distinguish "processed but still investigating" from "processed and fixed"

---

## Design Decision: When to Set Resolution

**Question:** When should `resolution` be set — on `claim`, on `process`, or separately?

**Selected Approach:** Decoupled — resolution is set independently
- `claim_telegram_report()` → sets `claimed_by` + `claimed_at`, resolution stays `none`
- `process_telegram_report(resolution="fixed")` → explicitly sets resolution + resolved_at
- Flow logic: only mark `status='processed'` after resolution is confirmed

**Rationale:**
1. **Flexibility:** Developer can claim a report, investigate, THEN decide resolution (don't force resolution at claim time)
2. **Monitoring reports:** If developer marks as `monitoring`, report stays `status='new'` (visible) but gets `resolution='monitoring'` (context)
3. **Explicit intent:** Calling `process_telegram_report(resolution="fixed")` is an explicit dev decision, not auto-inferred

**Flow impact:**
```
1. read_telegram_reports(status="new", unclaimed_only=true)
   → filter by resolution != 'fixed' | 'wontfix' | 'duplicate'
   → dev claims report

2. Developer investigates, then:
   process_telegram_report(id, resolution="fixed")
   → sets resolution='fixed', resolved_at=now()
   → step 4 will mark status='processed' next cycle
```

---

## Design Decision: Monitoring Status Lifecycle

**Question:** What happens if a report is marked `monitoring` — does it stay visible forever?

**Selected Approach (for this sprint):** Manual lifecycle only
- Developer marks as `monitoring`
- Report stays visible in `read_telegram_reports(status="unresolved")`
- Next cycle: dev reviews, updates resolution to `fixed` or keeps as `monitoring`
- **Auto-expiration:** NOT included (scope out for next sprint if needed)

**Rationale:**
1. **Keep scope small:** SPRINT-S is 30-line changes. Auto-expiration adds state machine complexity.
2. **Data-driven:** Let real usage patterns guide expiration strategy (1-7 days? on first re-fire?).
3. **Safe:** Manual is safer than auto (less risk of prematurely auto-resolving a real issue).

**Future option (Sprint 1850+):**
```
IF resolution='monitoring' AND created_at < now() - 7 days AND not fired again:
  → auto-mark as wontfix (with WORK notification)
```

---

## Design Decision: Index Strategy

**Question:** How to optimize queries for unresolved reports?

**Selected Approach:** Single-column index on `resolution`
```sql
CREATE INDEX idx_telegram_reports_resolution ON telegram_reports(resolution)
```

**Rationale:**
1. **Selectivity:** `resolution IN ('fixed', 'wontfix', 'duplicate')` is selective (typically 20-30% of rows)
2. **Query pattern:** Dev-team loop does: `SELECT ... WHERE resolution NOT IN (...)`
3. **No compound index needed:** Flow doesn't filter by both status + resolution (yet)

**Query plan (expected):**
```
SEARCH telegram_reports USING INDEX idx_telegram_reports_resolution
  WHERE resolution = 'monitoring' OR resolution = 'claimed'
```

---

## Open Decisions for Architect

### 1. Monitoring Re-check Interval
**Decision needed:** Should `monitoring` reports auto-expire to `wontfix` after N days of no new fires?

- **Option A:** Manual only (defer to next sprint)
- **Option B:** Auto-expire after 7 days
- **Option C:** Auto-expire after 3 fires without escalation

**Current implementation:** Option A (manual, simpler)

### 2. Cascade on Duplicate
**Decision needed:** If Report A is marked `duplicate` → should it reference Report B?

- **Option A:** No references (just mark as duplicate, manual linking)
- **Option B:** Add `duplicate_of_report_id INT` foreign key
- **Option C:** Add duplicate category text (e.g., "duplicate of issue #1847a")

**Current implementation:** Option A (no references, out of scope)

**Note:** This could be a future enhancement: `resolution='duplicate', duplicate_of_text='Task 1847a'`

### 3. Statuses Cardinality
**Decision needed:** Are 6 statuses enough? (new, claimed, fixed, wontfix, duplicate, monitoring)

Proposed statuses cover:
- `new` — unclaimed, awaiting triage
- `claimed` — assigned, under investigation
- `fixed` — resolved via code change
- `wontfix` — not a bug, design intent
- `duplicate` — same as another report
- `monitoring` — known issue, observing

**Missing statuses?**
- `blocked` (depends on external fix)? → Could use monitoring + comment
- `in_progress` (different from claimed)? → We already have claimed
- `invalid` (not reproducible)? → Could use wontfix + comment

**Current implementation:** Use 6 as proposed (see AC-2 in BATCH_SPRINT_S_1849.md for enum)

---

## Implementation Path

### Phase 1 (This sprint — BATCH-S-1849)
1. **Schema:** Add resolution + resolved_at columns with defaults
2. **Store:** Add markResolved() + listUnresolvedReports() helpers
3. **MCP tool:** Extend process_telegram_report(resolution=...) parameter
4. **Flow:** Update dev-team Step 4 to detect unresolved reports
5. **Tests:** Full coverage of new functions + backward-compat

### Phase 2 (Future sprint — 1850+)
- Auto-expiration logic for monitoring (if needed by usage patterns)
- Duplicate linking with foreign key (if needed)
- Resolution reason/comment column (for audit trail)
- Telegram message edit (update original report with resolution instead of delete)

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Schema migration corruption | Use ALTER TABLE ... IF NOT EXISTS pattern, test on clone DB before production |
| Backward-compatibility break | Default resolution='none', existing MCP calls work unchanged |
| Flow infinite loop on unresolved | Dev-team Step 4 checks both new + unresolved; if same report re-fires, developer must explicitly resolve |
| Query performance | Index on resolution, test EXPLAIN PLAN on 10k+ rows |
| Cascading null values | Default resolution='none' (not NULL) to avoid 3-value logic |

---

## Sign-off Questions

Before proceeding:

1. **Statuses:** Approve the 6-status model (new, claimed, fixed, wontfix, duplicate, monitoring)?
2. **Lifecycle:** Confirm manual-only lifecycle for this sprint (defer auto-expiration)?
3. **Scoping:** Any additional columns (reason, ticket_link, priority) needed before implementation, or defer to next sprint?

---

## Files Changed (Summary)

| File | Type | LOC | Complexity |
|------|------|-----|-----------|
| schema-system.ts | DDL | 10 | Low (simple ALTER + index) |
| telegramReportStore.ts | CRUD | 60 | Low (straightforward query extension) |
| telegramReportTools.ts | MCP | 50 | Low (add optional param) |
| .claude/flows/dev-team/main.md | Orchestration | 20 | Medium (new step 4 logic) |

**Total:** 4 files, ~140 lines, LOW complexity

---

## Next Steps

1. Architect approve (this brief) or request revisions
2. PM creates detailed task breakdown (1849a, 1849b, 1849c subtasks)
3. Developer executes in parallel (1849a + 1849b → 1849c)
4. QA validates schema safety + backward-compat
