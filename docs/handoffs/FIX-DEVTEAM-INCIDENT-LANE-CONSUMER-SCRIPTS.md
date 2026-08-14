---
sprint: FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0
branch: task/incident-lane-consumer-scripts
size: M
zone: scripts/
depends_on: []
blocks: ["FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW"]
---

## TLDR
Implement incident-lane consumer scripts: add `is_po_expedited` and `incident_wip_in_progress` predicates to `scripts/lib/devteam-eligibility.jq`; create new batch-claim script `scripts/devteam-backlog-claim-incident-lane-consumer.jq` (sorts by priority then oldest-expedite-first); extend satisfiability instrumentation with ILC test fixtures. This is the prerequisite for the mainflow integration row (hard dependency — mainflow's call site references this script file).

## [PM] Planning Context

**Zone:** `scripts/`

**Acceptance Criteria:**
- [ ] `scripts/lib/devteam-eligibility.jq` gains two new predicates with correct placement (near `wip_in_progress` per defn-order constraint):
  - `is_po_expedited` — board-only predicate, no detail fallback (all 5 live examples are inline)
  - `incident_wip_in_progress` — counts only rows with `claimed_by == "dev-team (incident-lane consumer)"` and non-terminal status
- [ ] NEW `scripts/devteam-backlog-claim-incident-lane-consumer.jq` created with:
  - Problem/Selection/Dispatch/Concurrency/Mutation/Usage header sections (mirror RLC's own documentation style)
  - Candidate filter: `select(.value | is_po_expedited)` + existing eligibility chain (supervised/plan_only/epic-wrapper/deps_satisfied/detail-deferred/resolved-next_agent)
  - Sort: `sort_by([.rank, .po_expedited_at, .idx])` (priority first, then oldest-expedite-first, then array index)
  - Takes: `$candidates[0:$take]` where `$take = min($take_budget, $candidates|length)`
  - Stamps `claimed_by: "dev-team (incident-lane consumer)"` (distinct from RLC's `"dev-team (ready-lane consumer)"`)
  - Carries `po_expedited_at`/`po_expedited_by` through UNCHANGED
  - Uses same `$head_free` conditional guard as RLC/SLS/DRS/QA-Drain (no new write pattern)
  - Narrates only the batch's top row (cosmetic, dispatch correlates via `claimed_at`/`claimed_by`)
- [ ] `scripts/devteam-backlog-claim-ready-lane-consumer.jq` — header-comment-ONLY update (no logic change):
  - Add cross-reference pointing to new ILC section (so reader doesn't mistake RLC as sole `ready[]` consumer)
- [ ] `scripts/audits/devteam-dispatch-gate-satisfiability.sh` extended with ILC fixture section:
  - POSITIVE: `po_expedited_at` row buried deep in `ready[]` is claimed first within incident pool
  - NEGATIVE: non-expedited P0 row untouched by ILC (remains RLC territory)
  - `INCIDENT_CAP` boundary: 3rd simultaneously-expedited row NOT claimed while 2 already in flight
  - WIP-independence: `INCIDENT_WIP<2` claim succeeds even when shared `WIP≤2` already saturated
  - Head-busy negative control: `.head` byte-identical when genuinely busy (mirrors 07-29 brief's §6 DoD)
- [ ] All jq scripts validate (syntax + execution against fixture boards) without errors
- [ ] Commit message credits the architect's design (brief: 2026-08-14-readylane-incident-lane-throughput.md)

**Files to read first:**
- `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` § 4a–4c (design spec)
- `scripts/devteam-backlog-claim-ready-lane-consumer.jq` (model for structure/tone/header)
- `scripts/lib/devteam-eligibility.jq` (placement context for new defs)
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (fixture pattern)

**Files to create:**
- `scripts/devteam-backlog-claim-incident-lane-consumer.jq` — new batch-claim script for incident lane

**Files to modify:**
- `scripts/lib/devteam-eligibility.jq` — add 2 new predicates (4–6 lines each)
- `scripts/devteam-backlog-claim-ready-lane-consumer.jq` — header comment only (~2 lines cross-ref)
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — add ILC fixture section (10–15 lines)

**Dependencies:** none (ready for parallel dispatch)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (jq style, file headers)
- `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` § 4a–4c + 5 (complete design spec)
- `scripts/lib/devteam-eligibility.jq` (predicate patterns, scope resolution)
- Brief's own §4c for exact sort key and claimed_by stamp value

**Build standard:** N/A (scripts, no TypeScript rebuild needed)

---

## Design Rationale

This row is Part 1 of a zone-split implementation (the architect hands off zone-split work to PM per established convention; developer implements scripts/, agent-father implements docs/agents/). The incident-lane consumer is a dedicated, independent batch-claim mechanism that:
- Runs UNCONDITIONALLY every tick (Session-Gate→Step-1 anchor, mainflow will add invocation)
- Claims N rows per turn (batch, not single) up to `INCIDENT_CAP=2`
- Uses independent budget (incident_wip_in_progress) outside the shared `WIP≤2` slot
- Sorts by priority then oldest-expedite-first to prevent freshly-marked incidents from perpetually jumping queue

This design reuses QA-Drain's proven throughput-fix pattern (§2 of brief: 226→56 PRIMARY drain over 8 days on structurally identical starvation problem). The architect's measurement (§0–§1 of brief) shows ordering-only fixes (comparator changes, expedite fields) cannot address the binding throughput constraint (RLC claims 1 row per invocation, ~1 per 6 ticks = insufficient against 68-row queue).

---

## RETURN

**Task ID:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS  
**Zone:** scripts/  
**Size:** M  
**Depends:** none  
**Blocks:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW  
**Status:** TODO  
**Next agent:** developer

