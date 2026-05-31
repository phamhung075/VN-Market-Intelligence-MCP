---
task_id: HC-AF-1
sprint: BCTC-HUMAN-CONFIRM
agent: agent-father
status: READY
zone: docs/agents/refine_bctc_md/
depends_on: [HC-DEV-1]
blocks: none
date_assigned: 2026-05-30
---

# HC-AF-1 — Cron Flow Guard: Confirm Status Check

**Scope:** Single-step addition to `docs/agents/refine_bctc_md/flow/main.md`. Add a confirm_status guard in Phase 0 so the refine cron skips CONFIRMED reports cleanly. This is belt-and-suspenders protection (primary guard is in `getBctcPendingRefineTool.ts` from HC-DEV-2; this flow guard is the secondary net).

**Atomic goal:** Phase 0 Step 2b added. Refine flow checks `report.confirm_status == "CONFIRMED"` and exits cleanly without touching the report.

**DEPENDS ON:** HC-DEV-1 (schema columns exist; flow can query them)
**INDEPENDENT:** Can run parallel to HC-DEV-2 after HC-DEV-1 completes

---

## File to Modify

**`docs/agents/refine_bctc_md/flow/main.md`**

### Context

The file has Phase 0 (setup/claim), Phase 1-3 (refine), Phase 4 (finalize). Phase 0 currently has Steps 1-5:
- Step 1: Load report metadata
- Step 2: Validate text_status == "COMPLETE"
- Step 3: Claim report
- Step 4: Set refine_status = "IN_PROGRESS"
- Step 5: Query pending refinements

### Change

Add a confirm_status guard between Step 2 and Step 3 (new Step 2b):

```markdown
## Phase 0 — Setup & Claim

### Step 1. Load report metadata
- Read `financial_reports WHERE id = {report_id}` → get `text_status`, `refine_status`, `confirm_status`

### Step 2. Validate text is complete
- Check: `text_status == "COMPLETE"` → continue; else → `{ reason: 'text_not_complete' }` + release + EXIT.

### Step 2b. Confirm status guard (NEW)
- Check: `confirm_status == "CONFIRMED"` → skip refine entirely
- Log: `[refine-orchestrator] Report {report.id} is CONFIRMED — skipping refine`
- Call task_release for the claim (already acquired in Step 3, so this is conditional)
- EXIT cleanly. Do NOT set refine_status to FAILED; leave it as-is. Return `{ skipped: true, reason: 'confirmed' }`

### Step 3. Claim report
- Acquire report via task_claim (sprint-task kind, TTL 3600s)
- If claim fails (held by peer) → log + EXIT (competitor is already working it)

### Step 4. Set refine_status = IN_PROGRESS
- UPDATE financial_reports SET refine_status = 'IN_PROGRESS' WHERE id = ?

### Step 5. Query pending refinements
- Call `get_bctc_refined` → list all `bctc_refined_units WHERE report_id = ? AND window_status != 'DONE'`
```

**Exact location in file:** After the line containing `text_status == "COMPLETE"` check, before the task_claim call. Insert the new step 2b markdown block.

### Semantics

The guard is **pre-claim** (checks status before acquiring the report). This is correct because:
1. If confirmed, we skip without holding the claim lock
2. If not confirmed, we proceed to claim and refine as normal
3. The primary guard in `getBctcPendingRefineTool.ts` filters confirmed reports from the queue, so this flow will rarely see them (belt-and-suspenders)

---

## Acceptance Criteria

### AC-HC-AF-1-1 Flow Guard
- [ ] Phase 0 Step 2b added between text_status check and task_claim
- [ ] Guard reads `confirm_status` from report metadata (loaded in Step 1)
- [ ] If `confirm_status == "CONFIRMED"`:
  - Logs `[refine-orchestrator] Report {id} is CONFIRMED — skipping refine`
  - Releases any held claim cleanly
  - Returns `{ skipped: true, reason: 'confirmed' }`
  - Does NOT set refine_status to FAILED (leaves it unchanged)
  - EXITs without entering Phase 1

### AC-HC-AF-1-2 No Logic Change
- [ ] Existing steps 1-5 untouched except for step numbering (2 → 2, new 2b, old 3 → 3, etc.)
- [ ] Confirmed reports skip cleanly; non-confirmed flow as before
- [ ] Guard is pre-claim (before task_claim)

---

## DV Test Requirements

No DV tests for agent .md edits. Flow is tested end-to-end by QA:
- Deploy mcp-server with HC-DEV-1+2 (schema + Layer 1 guard in tool)
- Mark a report CONFIRMED via HC-DEV-3 HTTP handler
- Trigger refine cron
- Verify report is NOT in refine queue (Layer 1 guard in tool)
- If somehow it reaches flow (Layer 2 safety net), verify flow exits with `skipped: true` (this step)

---

## Exit Criteria

1. `docs/agents/refine_bctc_md/flow/main.md` Phase 0 Step 2b added
2. Step 2b checks `confirm_status == "CONFIRMED"` from report metadata
3. Confirmed reports exit cleanly with `skipped: true` (no error, no failed status)
4. Existing steps untouched (only step numbering adjusted)
5. File reads correctly on next agent-father flow load (no syntax errors)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add`, never `-A`
- Agent .md file edited → Cowork refresh prompt required (paste-ready for user to run in Cowork)
- No logic change to existing steps
- Pre-claim guard (check before task_claim)

---

## Post-Edit Requirement: Cowork Refresh Prompt

After committing HC-AF-1, provide a paste-ready Cowork refresh prompt for the user to run:

```
curl -X POST https://zenmidi.com/cowork \
  -H "Content-Type: application/json" \
  -d '{
    "action": "refresh",
    "target": "refine_bctc_md_flow",
    "reason": "HC-AF-1: confirm_status guard added to Phase 0"
  }'
```

(Exact prompt depends on Cowork API; adjust as needed per `.claude/skills/cowork-boundary/SKILL.md`)

---

## RETURN

```
READY: HC-AF-1 handoff. Single step addition to refine flow.
ZONE: docs/agents/refine_bctc_md/
DEPENDS_ON: HC-DEV-1 (schema)
BLOCKS: none
DV_TESTS: none (flow integration tested by QA)
NEXT: agent-father — edit flow and provide Cowork refresh prompt
DURATION: ~20min (1 step edit, markdown only)
SERIALIZATION: HC-DEV-1 must be done first; can be parallel to HC-DEV-2
POST_COMMIT: Paste-ready Cowork refresh prompt required
```
