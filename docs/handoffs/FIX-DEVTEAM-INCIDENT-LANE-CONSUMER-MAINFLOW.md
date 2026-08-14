---
sprint: FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0
branch: task/incident-lane-consumer-mainflow
size: M
zone: docs/agents/dev-team/
depends_on: ["FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS"]
blocks: []
---

## TLDR
Integrate incident-lane consumer invocation into `docs/agents/dev-team/flow/main.md`: insert new Session-Gate→Step-1 section with unconditional batch-claim call to `scripts/devteam-backlog-claim-incident-lane-consumer.jq` (INCIDENT_CAP=2, independent budget); update SECONDARY-Drain intro text; add INCIDENT_CAP to Invariants section. Hard dependency on SCRIPTS row (mainflow's call site references the script file that does not exist until SCRIPTS ships).

## [PM] Planning Context

**Zone:** `docs/agents/dev-team/`

**Acceptance Criteria:**
- [ ] New § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation inserted at CORRECT LOCATION:
  - Content-anchored at `<!-- jump:session-gate -->` (after Session Gate paragraph)
  - BEFORE § Review-Lane SECONDARY-Drain (first of the three unconditional Session-Gate→Step-1 blocks: ILC → SECONDARY-Drain → QA-Drain Head-Decoupled)
  - BEFORE § Step 1 (Triage)
  - Ordering deliberate: P0 incident dispatch outranks review/QA triage for shared `.head` slot each tick
- [ ] New § Incident-Lane Consumer contains:
  - Named constant: `INCIDENT_CAP=2` (comment: "retune together with DoD trend below if 5-tick measurement under/over-shoots")
  - `INCIDENT_WIP` jq slice (calls new `incident_wip_in_progress` predicate from devteam-eligibility.jq)
  - `if [ "$INCIDENT_WIP" -lt "$INCIDENT_CAP" ]` guard
  - jq invocation: `-f scripts/devteam-backlog-claim-incident-lane-consumer.jq` with:
    - `--arg now "$NOW"` (ISO 8601 UTC timestamp)
    - `--argjson take_budget "$((INCIDENT_CAP - INCIDENT_WIP))"`
    - Existing `--slurpfile` for detail/archive (same as RLC call in Rotation Selection)
    - Pipe to `bash scripts/orch-apply.sh || true`
  - `picked_batch` jq post-check (select rows by claimed_at/claimed_by matching ILC marker)
  - `if $picked_batch non-empty` → BGFAN-1 spawn loop (task_claim → Agent spawn background → task_release on failure)
  - `JUMP TO end` on successful claim (do not fall through to SECONDARY-Drain same tick)
- [ ] § Review-Lane SECONDARY-Drain intro updated:
  - OLD: "Runs immediately after the Session Gate above"
  - NEW: "Runs immediately after the Incident-Lane Consumer above" (or generic ref like "after the head-decoupled consumers above")
  - No other changes to SECONDARY-Drain logic
- [ ] § Invariants section gains one clause:
  - Add to existing concurrency budget list: `INCIDENT_CAP=2` (independent budget, separate from `WIP≤2` and `qa[]<QA_CAP`)
  - Document that ILC's claim pool is outside the shared WIP slot
- [ ] New Reusable Scripts bullet added (same format as existing bullets):
  - `scripts/devteam-backlog-claim-incident-lane-consumer.jq` (short description: batch claim for po_expedited_at rows)
- [ ] File unchanged in logic/control flow — only additions (no removal of existing sections, no reordering outside the ILC insertion point)
- [ ] Commit message credits architect's design (brief: 2026-08-14-readylane-incident-lane-throughput.md)

**Files to read first:**
- `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` § 4d (invocation spec + code template)
- `docs/agents/dev-team/flow/main.md` (find `<!-- jump:session-gate -->` anchor; review existing SECONDARY-Drain/QA-Drain/Step-1 structure)
- `scripts/devteam-backlog-claim-ready-lane-consumer.jq` (model for RLC invocation pattern in the same file)

**Files to create:** none

**Files to modify:**
- `docs/agents/dev-team/flow/main.md` — 4 edits:
  1. New § Incident-Lane Consumer section (25–30 lines, after Session Gate)
  2. Update SECONDARY-Drain intro (1 line)
  3. Add INCIDENT_CAP bullet to Invariants (2–3 lines)
  4. New Reusable Scripts bullet (1–2 lines)

**Dependencies:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (hard: mainflow's call site references script file)

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` § 4c (sort/claimed_by values), § 4d (invocation code template + placement rules)
- `docs/agents/dev-team/flow/main.md` structure (session gate, BGFAN-1 fan-out pattern, JUMP semantics)
- Review: `docs/agents/dev-team/flow/main.md` § Review-Lane SECONDARY-Drain (prose style, intro format)
- Brief's own §4d code template (copy verbatim, substitute `$NOW` and `$TAKE_BUDGET` at runtime)

**Build standard:** N/A (flow doc, no TypeScript rebuild)

---

## Design Rationale

This row is Part 2 of the zone-split implementation (agent-father zone). The architect's design (brief § 4d) specifies that ILC must:
- Run UNCONDITIONALLY every tick (Session-Gate→Step-1, not gated by Idle-Tick Rotation)
- Use independent `INCIDENT_CAP=2` budget (not part of shared `WIP≤2`)
- Fire FIRST among unconditional blocks (P0 incident dispatch priority over review/QA triage)
- Use existing `$head_free` conditional guard (no new write pattern — collision-freedom proof intact)

**Critical placement rule:** Content-anchored at `<!-- jump:session-gate -->`, not line-number-anchored (this file changes frequently per its own header discipline). Insertion point must be immediately AFTER Session Gate, BEFORE SECONDARY-Drain.

**Precedent:** QA-Drain's own head-decoupled invocation (2026-08-08 brief) used identical pattern (independent budget + unconditional invocation + BGFAN spawn loop). Measured live result: review[] PRIMARY dropped 226→56 over 8 days. This brief reuses that proven shape verbatim for incident-lane problem (same throughput root cause, different queue).

---

## RETURN

**Task ID:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW  
**Zone:** docs/agents/dev-team/  
**Size:** M  
**Depends:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS  
**Blocks:** none  
**Status:** TODO  
**Next agent:** agent-father

