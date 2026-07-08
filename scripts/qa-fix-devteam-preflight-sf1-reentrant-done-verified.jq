# Board flip: FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT REVIEW -> DONE_VERIFIED
# QA independent re-verify (not rubber-stamp) of the SF-1 re-entrant
# self-hold fix in scripts/agents-flow/dev-team-tick-preflight.sh (commit
# 216205e0c):
# - Read the actual diff myself: `_step_sf1_claim()` (~L150-188) now reads
#   `current_holder.owner_client_session` on `claimed:false` and compares it
#   to `$session_id` — on match (self-hold) it heartbeat-renews SF-1 and
#   returns 0 (proceed), exactly mirroring the sibling `_step_fire_election()`
#   self-hold branch (~L232-238) already in the same file. On a genuine
#   mismatch (real peer) it falls through unchanged to the original SKIP
#   path (a) — `return 1`, releases nothing (never held it). The two
#   branches are not conflated: self-hold and peer-hold are gated by two
#   distinct comparisons against two different fields (`.claimed` first,
#   then `current_holder.owner_client_session` only when `.claimed=false`).
# - Ran `bash scripts/agents-flow/dev-team-tick-preflight.test.sh` myself
#   directly: 55/55 PASS (53 pre-existing + T19 self-hold->RUN+heartbeat,
#   no release/no telegram + T20 regression guard: real peer-hold still
#   SKIPs, still releases nothing) — re-confirmed, not trusted from the
#   developer's report.
# - Checked for other callers/assumptions: `_step_sf1_claim()` has exactly
#   one call site (`run_preflight()` itself); grepped the whole repo for
#   other references — only decision-journal/notebook/architecture-brief
#   prose describing the same bug, no other code depends on the old
#   behavior. Found ONE pre-existing residual of the SAME bug class,
#   correctly OUT OF SCOPE for this task: docs/agents/dev-team/flow/main.md
#   Step 0-PREFLIGHT-FALLBACK's inline SF-1 claim pseudocode (~L158-161,
#   ERROR-fallback / manual-run path only) still has no self-hold branch —
#   unlike its own sibling fire-election block immediately below it
#   (~L194-203) which DOES have one. This is pre-existing (not introduced
#   or worsened by this commit), is explicitly flagged in the script's own
#   header comment (L29-33) as a known asymmetry the script works around
#   (Step 4's error path pre-emptively releases SF-1 to avoid stranding it
#   across a fallback re-claim), and is reached only on script
#   transport/malformed-JSON error or a fully-manual run — non-blocking for
#   this task's scope (scripts/agents-flow/ dev-team-tick-preflight.sh
#   only). Flagged as a follow-up candidate, not filed as a new backlog row
#   (task-breakdown is PM/router's job, not QA's).
# - No DDD/security scan applicable (bash script, no domain/infra layering,
#   no process.env / hardcoded secrets in the diff — grepped clean).
#   shellcheck flags only 2 pre-existing info-level nits (SC1091 relative
#   source, SC2012 ls-vs-find) on lines untouched by this diff — not new.
# - Confirmed DJ-GATE-1: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-developer.md
#   STEP developer-S6 carries `task-id:** FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT`
#   with a substantive what-done/what-considered/why-decision/why-change body.
# - Scope check: `git show 216205e0c --stat` touches only
#   scripts/agents-flow/dev-team-tick-preflight.sh +
#   scripts/agents-flow/dev-team-tick-preflight.test.sh — zero apps/*
#   change, no Docker Close Gate needed (bash script consumed live by the
#   next dev-team cron tick, no rebuild/deploy).
#
# GUARD: refuse unless FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-fix-devteam-preflight-sf1-reentrant-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT")][0]) as $t
| if $t == null then error("FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT") then
    error("head.active_task_id drifted away from FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_review_note: $note,
    updated_at: $now,
    updated_by: "qa"
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = ("FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT DONE_VERIFIED (qa independent re-verify PASS \($now) — self-hold vs genuine-peer-hold branches both re-confirmed correct by direct diff read; dev-team-tick-preflight.test.sh re-run 55/55 PASS incl. T19/T20; no other caller depends on the old broken behavior; one pre-existing SAME-CLASS residual flagged non-blocking (main.md ERROR-fallback pseudocode SF-1 claim step still lacks a self-hold branch — out of this task's scope, follow-up candidate); DJ-GATE-1 journal confirmed substantive; scope confirmed clean, script+test only, no apps/* change, no Docker Close Gate needed).")
| .head.updated_at = $now
| .head.updated_by = "qa"
