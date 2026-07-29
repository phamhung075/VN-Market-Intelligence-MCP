---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-p1a-main-rotation
size: L
zone: docs/agents/dev-team/flow/
depends_on: [FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION]
blocks: [FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION]
---

## TLDR
Replace the fixed-priority idle-chain fall-through (BOUNDED-1 → SLS → RLC → QA-Drain → Step-1, each exits via `JUMP TO end`) with aged round-robin selection that picks one of the five consumers per idle tick based on oldest `last_served_tick` stamp, and revise the Session Gate to avoid false-idle telegrams.

## [PM] Planning Context

- **Part 1 Focus:** Aged round-robin dispatcher selection (Part 2 durability is separate task)
- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §2.2 (selection algorithm), §2.4 (why no cascade), §2.5 (session gate)
- **PO Ruling:** Both parts mandatory, inseparable; Part 1 priority. BOUNDED-1 cap stays 1 (byte-unchanged, user-gated)
- **Acceptance Criteria (AC-1 through AC-4):** See board row `.acceptance` field (read verbatim). AC-1 fairness, AC-4 gate-firing proof (not just resolution) — tests in later tasks.
- **Live Evidence:** PO ruling `po_evidence_20260725T0948` + `devteam_direction_correction_20260725` in board row — BOUNDED-1 wins every idle tick (7/7 observed 02:17Z-05:18Z 2026-07-25), SLS/RLC/QA-Drain unreachable, Step-1 starved indefinitely. fix must be lane-generic (all four non-winners starve by same mechanism, not just Step-1)

### Change Scope (main.md §496-686, the idle-path consumer chain)

**File:** `docs/agents/dev-team/flow/main.md`

**Remove/Replace:** Lines §496-686 (current fixed-priority fall-through):
```
## Step 0c — Head-idle dispatch path

WIP=$(jq '.task_board.in_progress | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
if [ "$WIP" -lt 2 ]; then
  # → four JUMPs in sequence: BOUNDED-1 if backlog[], SLS if ready[], RLC if some condition, QA-Drain if review[]
  # Each JUMP TO end on dispatch, blocking later lanes
fi
```

**Replace with:** Rotation-select algorithm (§2.2):
1. Read `rotation_selected($doc)` via jq calling the new function from `scripts/lib/devteam-eligibility.jq`
2. Dispatch ONLY that one selected consumer's existing block (one of: bounded1, sls, rlc, qa_drain, step1_triage)
3. Keep each consumer's existing block VERBATIM — no change to its gate, promote, claim logic
4. Each selected consumer: if it dispatches → `JUMP TO end` (unchanged); if no-op (gate saturated or nothing eligible) → **do NOT cascade to next consumer** → fall through to revised Session Gate (§2.5)

**Key constraint:** BOUNDED-1's `WIP<1` gate and 1-task cap are byte-unchanged (AC-3). The rotation never touches what happens inside each consumer's block, only *which* block is entered per tick.

### Session Gate Revision (§2.5)

**Current:** "Dev loop idle" Telegram fires when task_board empty AND no Telegram reports AND pendingSignals empty.
**Problem under rotation:** A no-op turn (e.g., it's QA-Drain's turn and review[] momentarily has zero qa-eligible rows) does NOT mean the loop is idle — other lanes may be backlogged.

**New logic:**
- Evaluate the truly-idle predicate: `.task_board` empty AND no reports AND **durable inbox** (new key) empty
- If predicate is false but selected consumer found nothing → **silent** `JUMP TO end` (no Telegram, avoid misleading idle spam)
- If predicate is true → "Dev loop idle" Telegram, same as today

**Implementation detail:** The durable inbox reference is forward-looking (added in Part 2 task); this task may use a placeholder reference or read it from the schema after S1 task lands. Coordinate with Part 2 task timing.

### Integration with Stamp Write

The stamp write (new §2.3, separate task) happens AFTER this consumer's block runs, unconditionally:
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" --arg c "$SELECTED" \
  '.dev_team_idle_chain.rotation[$c].last_served_tick = $now
   | .dev_team_idle_chain._updated_at = $now | .dev_team_idle_chain._updated_by = "dev-team"' \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
```
This task does NOT implement the stamp write (that's task P1B-STAMP), but MUST account for the call site location in the flow.

### Acceptance Criteria

- [ ] Rotation-select block runs once per idle tick, resolves to one of the five consumer ids
- [ ] Selected consumer's existing block (bounded1/sls/rlc/qa_drain/step1_triage) runs verbatim, gates/promote/claim unchanged
- [ ] No consumer block runs after the selected one per tick (no cascade to next candidate if selected finds nothing)
- [ ] Session Gate revised: false-idle conditional no longer fires on no-op turns (durable inbox empty check added)
- [ ] BOUNDED-1 `WIP<1` gate and 1-task cap: `git diff` shows zero changes (AC-3 byte-proof)
- [ ] main.md remains valid shell+jq syntax (no syntax errors, reachable via `bash -n`)

### Files to Read First

- `docs/agents/dev-team/flow/main.md` (full file, understand current fixed-priority chain at §496-686)
- `scripts/lib/devteam-eligibility.jq` (understand rotation_selected function signature after S1 task)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§2.2-2.5, full algorithm + session gate logic)
- `scripts/devteam-backlog-promote-bounded1.jq` and `-claim-bounded1.jq` (understand existing blocks to reuse verbatim)

### Files to Create

None

### Files to Modify

- `docs/agents/dev-team/flow/main.md` — replace §496-686 (fixed-priority chain) with rotation-dispatch logic + revised session gate

### Dependencies

- **Blocks:** FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION (needs this rotation logic before Step 1 consumption is integrated)
- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION (schema + rotation_selected() must exist)
- **Parallel siblings:** Can be developed in parallel with P2A-DURABLE-DRAIN (no file overlap), but both depend on S1 schema

### Knowledge Needed

- `docs/agents/dev-team/flow/main.md` architecture (flow control, JUMP patterns, WIP gates)
- jq variable assignment + function calls
- Aged round-robin semantics (brief explains, not complex)
- Five idle-path consumers and their existing gate logic
- Session Gate logic and false-idle prevention rationale

### Risk & Constraints

- **Regression risk (HIGH):** Changing the head-idle dispatch chain affects every idle tick in production; thorough testing via AC-1/AC-4 test task is mandatory
- **Fairness bound proof:** Once landed, §2.3's stamp write must execute unconditionally after this block, or the fairness bound collapses (each tick's rotation pick must advance time)
- **No per-lane WIP budget changes:** Rotation governs *which* lane is tried, not what *capacity* a lane has — all existing WIP gates stay byte-unchanged
- **Session Gate durable-inbox reference:** Forward-looking to Part 2 task; coordinate timing or use temporary placeholder path reference
- **Conditional compilation:** Do not feature-flag or parameterize the rotation — it is the core fix, not an option
