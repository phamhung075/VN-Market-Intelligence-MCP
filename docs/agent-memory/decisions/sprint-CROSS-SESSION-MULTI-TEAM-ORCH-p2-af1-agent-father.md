---
task-id: TASK_1990
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P2-AF-1
agent: agent-father
date: 2026-06-28
status: REVIEW
---

# Decision Journal — TASK_1990: Dispatcher Presence Self-Registration

## what-changed

Wired session-presence self-registration into cowork-team and dev-team dispatchers, and
codified the full pattern in dispatch-claim SKILL + task-lock SKILL. MCP foundation
(session-presence enum, task_list_held payload fields) was pre-shipped in TASK_1989.

**Files modified:**
- `.claude/skills/dispatch-claim/SKILL.md` — new § Step 0a: Session-Presence Self-Registration
- `.claude/skills/task-lock/SKILL.md` — new § Session-Presence Row — P2; Phase Status P2 entry
- `docs/agents/cowork-team/flow/main.md` — Step 0b split into 0b.1 (presence) + 0b.2 (leader-lock)
- `docs/agents/dev-team/flow/main.md` — presence claim at PREFLIGHT before SF-1; heartbeat at Step 3
- `docs/handoffs/TASK_1990.md` — [Developer] section added

## why-decision

**Presence claim placement (before SF-1 in dev-team):** The presence row must register the session
as "alive" even when SF-1 fires an early exit on duplicate-tick guard. Placing presence claim before
SF-1 ensures visibility regardless of session outcome on that tick.

**task_heartbeat does NOT update payload:** Confirmed by reading coordinationStore.ts:667-691 —
the heartbeat UPDATE only sets `heartbeat_at` and `expires_at`. No payload_patch mechanism exists
in the current MCP surface. Documented `current_task` update via release+reclaim pattern (optional
advisory; task_id is session-scoped so race window is safe).

**Non-adoptable invariant sourced from code:** `ORPHAN_EMIT_ALLOW_LIST` at coordinationStore.ts:395
explicitly excludes `session-presence` (line 392: "NOT adoptable work"). This is enforced in the
reaper's Phase 1 scan (line 444: kind IN-list filter). Docs reference the constant by file+line.

**Presence is NEVER a gate:** All dispatch-claim SKILL + flow patterns explicitly proceed after
presence claim regardless of result. Blocking dispatch on presence claim failure would break
every dispatcher when the mcp-server restarts (presence row orphaned).

**cowork-team Step 0b.1 + 0b.2 split:** Leader-lock (0b.2) fires after presence (0b.1). This
ordering ensures the session is visible in the registry before acquiring the exclusive leader slot.
Peer sessions reading `task_list_held(kind="session-presence")` will see this session immediately.

## key-constraints-enforced

- `task_kind: "session-presence"` REQUIRED on all presence claims (not "intent" or "sprint-task")
- `owner_client_session: $CLAUDE_CODE_SESSION_ID` REQUIRED (authoritative key, not owner_agent)
- `ttl_seconds: 1800` per P2 spec (30 min; heartbeat every 600s = TTL/3)
- Payload structure: `{agent_id, host, started_at, current_task}` on all presence rows
- Presence result is advisory-only — NEVER a gate on dispatch
- session-presence NOT in ORPHAN_EMIT_ALLOW_LIST — silent GC on expiry, no orphan-signal emitted
- Zero rebuild: all changes are runtime-read docs/flow/skill files
