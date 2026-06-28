---
task-id: TASK_1991
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P2-AF-2
agent: agent-father
date: 2026-06-28
status: REVIEW
---

# Decision Journal — TASK_1991: Router Presence Roster Read

## what-changed

Wired Phase A.5 (presence roster read) into step 2.5 of CLAUDE.md and the dispatch-claim SKILL.
The ordering in step 2.5 is now: Phase A (orphan-probe) → Phase A.5 (roster read) → Phase B (PRE-CLAIM).

**Files modified:**
- `CLAUDE.md` — Phase A.5 block inserted between Phase A and Phase B in step 2.5
- `.claude/skills/dispatch-claim/SKILL.md` — new § Phase A.5: Presence Roster Read section

## why-decision

**Ordering (orphan-probe → roster-read → PRE-CLAIM):**
Orphan-probe fires first because adopted work is the highest-priority action (rescue dead sessions
before claiming new intent). Roster read is placed after orphan-probe so the log output captures
the current live roster AFTER any adoption-triggered presence changes. PRE-CLAIM is last (hard gate).

**Advisory-only (no gate):**
Roster read must never block dispatch; its sole purpose is observability. The Phase B PRE-CLAIM
mutex is the authoritative hard gate. Blocking on a roster result would break multi-team
architecture (parallel cowork/dev-team pairs intentionally show same agent_id in N sessions).

**Duplicate agent_id = warn, not block:**
Multiple sessions running the same agent role (two dev-teams, two cowork dispatchers) is the
expected state in multi-team ops (§6.5 spec). The warning gives the human/router operator
visibility without blocking legitimate parallel work.

**Empty roster = silent proceed:**
Fresh startup or single-team mode produces zero rows. Silently proceeding avoids false warnings.

**Phase A.5 placed in SKILL not flow:**
The roster read is a dispatch-scope primitive (same scope as the orphan-probe and PRE-CLAIM).
Placing it in the dispatch-claim SKILL keeps all three phases co-located and avoids split
documentation across multiple files.

## key-constraints-enforced

- `task_list_held(kind="session-presence")` — READ-ONLY; no heartbeat/claim/release on roster rows
- Result never gates dispatch — always proceed to Phase B
- Duplicate agent_id detection is per-payload.agent_id (not per owner_agent, not per session-uuid)
- Example log format documented: "[router] session-presence roster: [<agent_id>/<host>/<current_task>, ...]"
- P2 INVARIANT (non-adoptable presence rows) cross-referenced in the "What this is NOT" block
- Zero rebuild: all changes are runtime-read docs/skills files
