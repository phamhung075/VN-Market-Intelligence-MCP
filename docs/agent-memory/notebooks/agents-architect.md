# agents-architect — Notebook

## 2026-06-28T08:08:25Z (rev 2 — liveness extension added)

**Brief:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md`

CROSS-SESSION-MULTI-TEAM-ORCH (rev 2): N sessions of same role share `owner_agent` → cannot be distinguished by heartbeat/release probes → double-fire + lock interference. Mutex sound; defeat is attribution-only. P1: thread `CLAUDE_CODE_SESSION_ID` as `owner_client_session` into task_locks; rebind matching ladder; delete self-held-heartbeat; CLAUDE.md step 2.5 PRE-CLAIM gate. P1.5 (liveness + orphan takeover): server-side reaper extends gcExpiredLocks to emit `orphan-signal` rows before GC-delete; 600s periodic timer covers all-sessions-dead case; adopter resumes from checkpoint (git SHA for sprint-task, published artifact for cowork) — never restarts; poison-task cap N_MAX=3 → BUG escalation; orch-state board flip via orch-apply.sh only. P2: session-presence registry. P3: fire-time cron leader election. Grounded lessons: spawn-retry-under-lag (slow≠dead grace), recurring-bug-escalation (N_MAX=3), guaranteed-slot-double-post (period-key dedup), chef-fabricated-publish + headless-no-post (idempotency). PO signoff required.

**Signal dropped:** `docs/signals/cross-session-multi-team-orch-20260628T080825Z.json` → pm (rev 2)

---

## 2026-06-28T17:18:50Z

**Brief:** `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md`

CROSS-SESSION-MULTI-TEAM-ORCH P3 addendum: 5 items pinned. §A: tick-boundary period-key = floor(fire-time) to cron boundary → `cron:<flow>:YYYY-MM-DDTHH:MMZ`; distinct from `published:<kind>:<period>` artifact dedup (different TTL, purpose, task_id prefix). §B: dispatcher-level election (not per-slot); cowork pipeline is stateful — per-slot concurrent dispatch risks shared-state race with cadence/snapshot; existing Step 4.6 slot-claims are intra-dispatch dedup, unchanged. §C: SF-1 first (session-level), fire-election second (cross-session); fire-election loss releases SF-1 before EXIT; no deadlock. §D: TTL=600s (5× dispatch p99); no heartbeat (per-fire, not sticky); explicit task_release at flow exit; crash safety = TTL backstop + P1.5 orphan-signals. §E: retire 3 patterns — feedback_router_cowork_defer_to_live_leader, feedback_router_manual_drive_overlaps_devteam_loop (both memory-only), and sticky cowork-leader 1800s (executable in leader-lock.md); gate = P3-AF-1 ships + smoke tests pass; AF-1 backstop preserved. P3-MCP: NOT NEEDED — reuse cowork-slot + sprint-task task_kinds; task_id prefix discriminates.

**Signal dropped:** `docs/signals/cross-session-multi-team-orch-20260628T080825Z.json` → pm (rev 2 — addendum companion; no new signal needed)

---

## 2026-06-28T19:17:01Z

**Brief:** `docs/architecture-briefs/2026-06-28-simplicity-gate-skill.md`

SIMPLICITY-GATE: No preventive minimalism gate exists at authoring time; dev-* agents trend toward DDD maximalism because all existing gates fire after code lands (code-janitor=reactive DRY; code-simplifier=post-QA readability; self-critique=PLAN-ONLY advisory). New skill `.claude/skills/simplicity-gate/SKILL.md` provides a 4-question self-check (Q1 scope creep, Q2 single-use abstraction, Q3 senior-engineer test, Q4 line-ratio) that developer runs autonomously after TDD GREEN and before flipping task status to REVIEW. Self-enforced — no human-ask, no doctrine conflict. Wiring line added to all authoritative dev flow files at the After-code→Documentation-review boundary. Distinct lane from code-janitor (DRY/structural duplication, reactive cron) and code-simplifier (post-QA readability). QA advisory checklist item embedded in skill body; not a hard QA block by default.

**Signal dropped:** `docs/signals/simplicity-gate-20260628T191701Z.json` → agent-father
