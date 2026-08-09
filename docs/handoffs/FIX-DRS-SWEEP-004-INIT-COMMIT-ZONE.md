---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-004-init-commit-zone
size: XS
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-003-BOARD-DRAIN]
blocks: []
---

## TLDR
Update `docs/agents/agent-father/init.md` governance: widen `commit_zone.allowed` to explicitly include `docs/improvement-proposals/` (was implicit, now explicit), and update the `commit_zone` note to document the two allowed orch-apply.sh write exceptions (pre-existing signal-queue DONE-mark + new board-drain status/lane flip restriction).

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] `commit_zone.allowed` list in `init.md` now includes `"docs/improvement-proposals/"`
  - [ ] `commit_zone.note` updated to match brief §2.5 diff exactly:
    - Cites the pre-existing signal-queue DONE-mark exception
    - Documents the new board-drain exception: may call orch-apply.sh to flip ONLY status/lane + `board_drain_*` fields of rows this cycle drained (never any other row, never any other field)
    - Both exceptions auditable from the note text alone
  - [ ] No other lines in `init.md` modified
  - [ ] Governance intent is clear: blast-radius containment for "meta-agent that defines every other agent"

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §2.5 (exact wording)
  - `docs/agents/agent-father/init.md` (current state, existing carve-out note location)
  - `docs/agents/agent-father/flow/board-drain.md` (to understand the orch-apply usage being documented)

- **Files to create:** None

- **Files to modify:**
  - `docs/agents/agent-father/init.md` — `commit_zone.allowed` + `commit_zone.note`

- **Dependencies:** FIX-DRS-SWEEP-003-BOARD-DRAIN (need to understand what the flow does to document the carve-out correctly)

- **Knowledge needed:**
  - Brief §1.2 (pre-existing exclusion, ratified blast-radius boundary)
  - Brief §2.5 (exact governance diff)
  - init.md structure (agent definition format)

---

## RETURN
Task specification ready for developer. Minor governance documentation change. No blocking dependencies from this task.
