---
sprint: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT
branch: task/FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM
size: M
zone: cowork-team
depends_on: []
blocks:
  - FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER
  - FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER
---

## TLDR
Implement the push mechanism for signal-queue delivery: add `signal_queue_push` SSOT flag to 6 cowork-schedule.json slots and implement new Step 5.2b in spawn-fanout.md that claims/marks-READ/releases dashboard-row locks and injects matched NEW rows into the ENTRY_PROMPT as CROSS_TEAM_SIGNAL_BLOCK.

## [PM] Planning Context

**Zone:** cowork-team

**Origin:** Architect ruling (HYBRID approach) — Component A in `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` § 3

**Acceptance Criteria:**
- [ ] AC-1: `docs/data/cowork-schedule.json` — add `"signal_queue_push": true` to exactly 6 slots: `chef-morning`, `chef-intraday`, `chef-eod`, `chef-evening`, `alert-commander-market`, `alert-commander-critical` (all other slots remain unset/default false, including `tnb-audit`)
- [ ] AC-2: `docs/agents/cowork-team/flow/spawn-fanout.md` new Step 5.2b inserted between SESSION_ID_LINE composition and ENTRY_PROMPT finalization:
  - Filters `.signal_queue.rows[]` for `r.to == slot.agent && r.status == "NEW"`
  - Claims per-row `dash:signal_queue:<row.id>` lock using existing `task_kind: "dashboard-row"` (reuses dev-team drain-signals.md §0a-D lock namespace, NOT a new lock class)
  - On claim fail: skip row, leave NEW, log collision (same as 0a-D semantics)
  - On claim success: collects up to 5 rows (oldest-first, bounded payload), formats as markdown list (id/from/type/severity/summary), appends to CROSS_TEAM_SIGNAL_BLOCK markdown section
  - Marks row NEW→READ via orch-apply.sh (atomic CAS, batched with any other state writes this cycle)
  - Releases lock immediately after READ mark
  - If no matching rows: CROSS_TEAM_SIGNAL_BLOCK empty string, NO markdown header appended
- [ ] AC-3: ENTRY_PROMPT composition order preserved: `IDENTITY_PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE + CROSS_TEAM_SIGNAL_BLOCK` (signal block appended last, never disturbs trigger_prompt/flow_path consistency check on first line)
- [ ] AC-4: Payload logic — row_key strictly `"dash:signal_queue:" + row.id` (no agent name, no timestamp); claim `payload` JSON carries `{row_id, from, type}` for peer-diagnostic logging only (cowork-team never dereferences `payload_ref` field — that is the receiving agent's responsibility)
- [ ] AC-5: Lock-plane statement (§6 of brief) ships verbatim or materially equivalent in prose: confirms DB-plane only (orch-state.json rows[]), file-plane (docs/signals/*.json) unchanged, no contradiction with FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD
- [ ] AC-6: Empty-case verification — manually inspect a cycle where no NEW rows match `to=slot.agent`: zero new tool calls, zero text appended to ENTRY_PROMPT (no boilerplate markdown header for empty signal list)
- [ ] AC-7: Test verification — post a test NEW row to `.signal_queue.rows[]` with `to=unified-agent`, trigger next chef-morning spawn, verify ENTRY_PROMPT log contains the signal row and row transitions NEW→READ in the same tick
- [ ] AC-8: No new dependencies introduced (no new MCP tools, no new skills, no new conditionals beyond slot flag check)

**Files to read first:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (full context + lock-plane statement § 6)
- `docs/agents/cowork-team/flow/spawn-fanout.md` (where Step 5.2b inserts)
- `docs/agents/dev-team/flow/drain-signals.md` § 0a-D (existing lock pattern to reuse)
- `docs/data/cowork-schedule.json` (where to add signal_queue_push flag)
- `docs/data/orch/orch-state.json` (structure of .signal_queue.rows[], .head for CAS guard in orch-apply.sh)

**Files to create:**
- None (modifications only)

**Files to modify:**
- `docs/data/cowork-schedule.json` — add `signal_queue_push: true` to 6 slots
- `docs/agents/cowork-team/flow/spawn-fanout.md` — new Step 5.2b + ENTRY_PROMPT ordering documentation

**Dependencies:** None (tier1, no prior work required)

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (full ruling + rationale)
- `docs/agents/dev-team/flow/drain-signals.md` § 0a-D (lock pattern reference)
- `docs/standards/orch-state-access.md` (CAS guard pattern for orch-apply.sh writes)
- `docs/policies/dev-standards.md` § Orch-State Hot File — Write Contract

## [Developer] Implementation Notes

### Step 5.2b logic flow
1. Check `if slot.signal_queue_push == true:` (skip entire block if false/absent)
2. Query `.signal_queue.rows[]` for matches: `to == slot.agent && status == "NEW"`
3. Sort by creation timestamp (oldest first)
4. For each row (limit 5):
   - Build row_key: `"dash:signal_queue:" + row.id`
   - Call `task_claim(task_id: row_key, task_kind: "dashboard-row", owner_agent: "cowork-team", owner_client_session: <SESSION_ID>, ttl_seconds: 1800, payload: <json>)`
   - If not claimed: `continue` (log: "[cowork-team] signal row <id> held by peer, skipping")
   - If claimed:
     - Append row data to CROSS_TEAM_SIGNAL_BLOCK (markdown format)
     - Mark row NEW→READ (via orch-apply.sh CAS, atomic)
     - Release lock immediately: `task_release(task_id: row_key, owner_client_session: <SESSION_ID>)`
5. If CROSS_TEAM_SIGNAL_BLOCK is non-empty: prepend `\n\n## CROSS-TEAM SIGNAL\n` header
6. Append CROSS_TEAM_SIGNAL_BLOCK to ENTRY_PROMPT (always last, after SESSION_ID_LINE)

### Edge cases
- **No matching rows:** CROSS_TEAM_SIGNAL_BLOCK remains empty string, no header appended, zero new text in prompt
- **Peer collision:** skip row (continue loop), leave NEW, log collision (0a-D semantics, expected in parallel cowork runs)
- **Row claim succeeds, mark READ fails:** log failure, release lock, continue (do not abort — other rows in the batch may succeed)
- **session_id variable:** Resolve at step entry, substitute actual value (NEVER write literal `$CLAUDE_CODE_SESSION_ID` in MCP call)

### Testing checklist
1. Dry-run: cowork-schedule.json syntax valid (jq parse)
2. Unit: simulate 3 rows, 1 claimed, 1 collision, 1 missing — verify CROSS_TEAM_SIGNAL_BLOCK has 2 entries
3. Integration: post test row, trigger spawn, verify:
   - Row appears in ENTRY_PROMPT (observable in log)
   - Row flips NEW→READ in same tick
   - No duplicate signals if spawn retried (claimed lock prevents re-processing)

---

## Sibling coordination note

This task unblocks both unified-agent and alert-commander consumers (tasks 3 and 4). The lock-plane statement in AC-5 must not contradict FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD (separate backlog row); both describe the same DB-plane lock but different file-plane scopes. Coordinate landing timing with Tasks 3/4 so all three changes ship together (or in a tight sequence) to avoid intermediate states where push fires but no consumer is listening.
