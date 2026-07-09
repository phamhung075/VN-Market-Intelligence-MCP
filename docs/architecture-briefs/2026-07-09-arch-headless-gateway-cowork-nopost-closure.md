<!-- size-justification: closure note, not a design brief — cites existing artifacts rather than re-deriving them; kept short by design. -->
# Architecture Brief (Closure) — ARCH-HEADLESS-GATEWAY-COWORK-NOPOST

**Date:** 2026-07-09T17:57:02Z · **Author:** agents-architect · **Type:** CLOSURE (task superseded, no new design produced)
**Task:** `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST` (created 2026-06-14, `docs/data/orch/archive/backlog-detail.json#ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`), auto-picked by dev-team's BOUNDED-1 idle-capacity lane 2026-07-09T17:48:39Z.

## Verdict

**STALE/SUPERSEDED. No new design brief produced.** Per the dispatch's own instruction, the first step was to verify whether the original premise (cloud-RemoteTrigger-fired cowork slots silently no-posting because the subagent surface lacks `call_tool`) is still live. It is not — and separately, the underlying "detect a broken gateway and don't silently drop the slot" principle the task asked for has already been built, shipped, and iterated on multiple times since, against the *current* mechanism, more precisely than a fresh brief today would produce. Reopening this design question now would be pure churn, not new signal (see project memory `project_systemic_review_0704_churn_without_convergence`).

## 1. The original premise's mechanism no longer exists

- STANDING directive (user, 2026-06-22, memory `feedback_no_remote_trigger_all_local`, verbatim: "no remote trigger all working on this server"): the project runs entirely local; no cloud RemoteTrigger backstops.
- ALL-LOCAL CUTOVER executed 2026-06-23T17:22Z: all 6 cloud RemoteTriggers (`chef-morning`, `chef-eod`, `chef-evening`, `tnb-audit`, `digest-sunday` — the exact slot whose W24 block opened this task — and `health-recheck`) set `enabled:false`.
- **Note on live verification:** this agent's tool surface (`Read`/`Edit`/`Write`/`Bash`, no `mcp__*` of any kind — itself a live instance of the gateway-blind condition discussed below) cannot call `RemoteTrigger(action="list")` directly; that tool is account/router-scoped (memory `reference_remotetrigger_create_contract`: "Router holds the RemoteTrigger tool — agent-father/architect do not"). Deferring to the most recent independent live check instead of re-deriving it: `feedback_local_cowork_subagents_gateway_blind.md`'s 2026-07-08T20:15–20:35Z entry ran `RemoteTrigger(action=list)` live and confirmed all 6 backstops still `enabled:false`, `last_fired_at`/`next_run_at` frozen since 2026-06-22/23 — one day before this dispatch, no drift.
- `docs/data/cowork-schedule.json._notes.layer_a_deletion_gate` (repo, checked directly): `"RESOLVED 2026-07-07 ... RemoteTrigger Layer A is retired per STANDING feedback_no_remote_trigger_all_local ... the deletion lock is moot, there is nothing left to guard once the mechanism itself is retired, not merely paused."` The 5 formerly-RemoteTrigger-backed slots (`chef-morning`/`chef-eod`/`chef-evening`/`digest-sunday`/`tnb-audit`) each carry `trigger_status:"superseded"`, `_superseded_by:"cowork-dispatcher"` in the live schedule file.

So the specific architecture asked for — "CLI-dispatcher-primary with cloud-RemoteTrigger as Read/Write-only fallback that detects missing `call_tool` and re-queues" — has no fallback layer left to design around. There is no cloud path anymore to harden.

## 2. The "detect, don't silently drop" principle is already shipped, for the mechanism that actually still exists

The overlapping-symptom exception the dispatch called out ("local `*/15` cowork-team dispatcher subagents have a related-but-distinct gateway-blindness issue") is real and IS the live version of this problem — but it has already had more design and build cycles spent on it than this task would add:

- `docs/agents/cowork-team/flow/blind-guard.md` Step 0c — gateway-free `SESSION_BLIND` preflight (jq-only, no MCP dependency for the primary check).
- `docs/agents/cowork-team/flow/spawn-fanout.md` Step 5.0 — second enforcement point: classifies matched slots into `BACKSTOP_SLOTS` vs `NO_BACKSTOP_SLOTS` (re-keyed 2026-07-08, `FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS`, off the live-maintained `_superseded_by` field after the stale `trigger_status` field was caught masking real misses), logs undeliverable slots to `errors[]`, posts one WORK summary — critically, this runs **before** any per-slot spawn, so the content-level published-marker gate is never falsely claimed on a blind tick, which is exactly "re-queue rather than claim-and-drop": the next healthy tick (or the session-independent launchd backstop below) re-matches the same still-unpublished slot.
- `.claude/skills/cycle-bootstrap/SKILL.md` Step 0 CONFIRMED-BLIND fallback (shipped 2026-07-07, commits `caba878b7`+`83bca6c04`) — for the 8 no-Bash cowork cycle agents: on confirmed blindness, skip `send_telegram` (a gateway call that would fail identically) and `Write` a `docs/signals/*.json` bug-escalation directly instead of a silent hang or fabrication.
- `docs/standards/gateway-call-contract.md` §6 Degraded Mode + `scripts/agents-flow/mcp-call.sh`'s `mcp_call_gateway_meta()` — shipped, QA-APPROVED (`reports/TASK_REPORT_FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE.md`), giving Bash-equipped agents a sanctioned workaround for the 3 gateway meta-tools too.
- `docs/architecture-briefs/2026-07-08-gateway-blind-cli-handshake-spike.md` — root-caused the *current* gateway-blind mechanism as a CLI/harness client-side MCP-connection-lifecycle defect (proven live via a full raw-curl MCP handshake against the same endpoint, which succeeded instantly) — i.e. **not fixable from this repo at all**, which is precisely why this task's original "design a detection+re-queue contract" framing (implying a repo-side architectural gap) doesn't apply to the current mechanism either; the detection+non-silent-drop half is the only repo-actionable part, and it's the part already shipped (bullets above). That SPIKE also formally CANCELLED the 3 prior `F1-GATEWAY-TRANSPORT-PROBE` / `F1-WRITE-MCP-JSON-GATEWAY` / `F1-AGENT-FATHER-BLIND-GUARD-REMOVE` tasks whose premise this task shares lineage with.
- `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` — separately covers the other silent-no-post cause (CLI session not running at all, not a live-session tool-gap) via a generalized session-independent launchd firer reusing the same `cowork-schedule.json` SSOT — this is the "session absence" twin of the "session present but blind" case this closure covers, tracked as its own task, not folded in here.

## 3. FOLD (2026-06-16 second polarity — marker-gate-fails-open double-post)

Already resolved per the task's own note (`AC-FAILCLOSED`, shipped) — not re-verified here since the task text itself records it as done and no new evidence contradicts that.

## 4. Disposition

No design brief. Closing this task as `DONE` (objective fulfilled by other, more current work — not `CANCELLED`, since nothing about the underlying problem was abandoned; it was solved, repeatedly, elsewhere), moved to `task_board.archive[]`, mirroring the `BPE-ARCH-1` "zombie task formally closed, all blockers resolved and shipped" precedent. `.head` reset to terminal (`status:"done"`, `active_task_id:null`, `next_agent:"router"`) in the same atomic write, per the established Close-Gate convention (`feedback_close_gate_step4_head_sync_gap`) — this task currently *is* `.head.active_task_id`.

If cloud RemoteTriggers are ever re-enabled in the future, or a *new* concrete recurrence of the cloud-fallback-silent-no-post pattern is observed (not the case today — the mechanism is off), that would be a fresh task grounded in fresh evidence, not a reopening of this one.

## RETURN

DONE: Verified premise stale (RemoteTrigger Layer A retired, confirmed via the most recent live check available), confirmed the overlapping-symptom exception is already extensively covered by shipped work, closed task instead of producing a duplicative design brief.
NEXT: none — task closed. Router/dev-team's BOUNDED-1 idle-capacity pickup is unblocked (`.head` reset to terminal).
HANDOFF: `docs/architecture-briefs/2026-07-09-arch-headless-gateway-cowork-nopost-closure.md`
PIPELINE: closed
