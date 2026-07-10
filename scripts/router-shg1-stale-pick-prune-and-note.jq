# Board flip: SHG-1 IN_PROGRESS -> DONE_VERIFIED (stale-pick pre-verify prune, NOT new work)
# + append finding note to BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP (still BACKLOG/supervised, unchanged lane)
#
# BOUNDED-1 auto-picked SHG-1 ("Create scripts/orch-state-validate.sh with G-1...G-6 checks") on
# WIP=0 idle-capacity pickup this tick. Router RAW-verified BEFORE dispatching any developer:
# - scripts/orch-state-validate.sh EXISTS on disk (1945 bytes, executable), full content read.
# - git log -- scripts/orch-state-validate.sh shows 3 commits: d6f9b0580 "feat(scripts/SHG-1):
#   create orch-state-validate.sh write-gate validator" (original creation — commit message
#   itself cites SHG-1), 4a5d655df "chore(SHG/validate): SHG-5 promote G-5 status-enum check to
#   hard gate", 33b3f12be "refactor(...SSOT-W1-BASH-SHIM) demote orch-state-validate.sh to thin
#   shim" (current state — delegates to scripts/orch-validate.mjs, the canonical Zod validator,
#   which the shim's own header comment documents as a SUPERSET of the original G-1..G-6 checks).
# - The script is actively, currently in use: this very tick's orch-apply.sh invocations (BOUNDED-1
#   promote + claim writes) ran through this exact validation path with visible PASS output.
# - This is the SAME class of gap already documented in project memory
#   project_bounded1_first_pickup_stale_backlog_hygiene_debt.md (2 prior confirmed instances,
#   4 total per the existing BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP row's own status_note) — SHG-1 is
#   a 5th confirmed instance. Established mitigation: router pre-verify prunes the stale pick
#   without spawning a worker (real systemic fix = the batch verify-prune sweep task itself,
#   still pending supervised dispatch, unchanged by this write).
#
# Broader finding (NOT acted on here — out of scope for this tick's single BOUNDED-1 pick,
# routed to the sweep task's status_note instead): git log --grep shows ALL FIVE of SHG-1..SHG-5
# have commits matching their stated scope (SHG-1: d6f9b0580; SHG-2: 41d925d8c; SHG-3+SHG-4:
# 46eba4b33 + eviction-execution b7fc62411; SHG-5: 4a5d655df) — yet all 5 still sit as
# BACKLOG/TODO rows. SHG-2/3/4/5 are NOT flipped by this script: scripts/orch-validate.mjs line
# 375 ("Switch coherence to a hard-fail AFTER SHG-2 (status migration) + SHG-4 (eviction)
# complete") documents an unflipped condition, and THIS tick's own orch-apply.sh runs printed 129
# live coherence warnings (non-canonical status values across many backlog rows) — genuine
# unresolved work, not just an unflipped checkbox. Judging whether that residual state means
# SHG-2/4 are incomplete vs. superseded-by-later-drift needs an adjudicated look, not a router
# rubber-stamp — left for whoever picks up BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP.
#
# GUARD: refuse unless SHG-1 is in in_progress[] with status IN_PROGRESS.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-shg1-stale-pick-prune-and-note.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="SHG-1")][0]) as $t
| if $t == null then error("SHG-1 not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("SHG-1 status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "pending",
    router_verdict: "SUPERSEDED — already done",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "STALE BOUNDED-1 PICK (5th confirmed instance of the project_bounded1_first_pickup_stale_backlog_hygiene_debt pattern) — NOT dispatched to a developer. scripts/orch-state-validate.sh already exists (created by commit d6f9b0580 \"feat(scripts/SHG-1): create orch-state-validate.sh write-gate validator\", later hardened by 4a5d655df \"SHG-5 promote G-5 status-enum check to hard gate\" and demoted to a thin shim of the canonical scripts/orch-validate.mjs by 33b3f12be — a documented SUPERSET of the original G-1..G-6 checks). Actively in live use: this very tick's own orch-apply.sh writes ran through this exact validation path. Pre-verify-pruned per established mitigation rather than spawning duplicate work. Broader finding (all of SHG-2..SHG-5 also show matching completion commits yet remain BACKLOG/TODO, plus a genuinely-still-open coherence hard-fail flip condition documented in orch-validate.mjs line 375 with 129 live violations this tick) routed to BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP's status_note for adjudicated follow-up — NOT closed here, out of this tick's scope."
  }) as $done
| .task_board.in_progress = [$ip[] | select(.id != "SHG-1")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "router",
    active_task_id: null,
    next_agent: null
  }
| (.task_board.backlog // []) as $bl
| (.task_board.backlog = [
    $bl[] | if (type=="object" and .id=="BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP") then
      (.status_note = ((.status_note // "") + " | UPDATE " + $now + " (router): SHG-1 confirmed as a 5th stale-pick instance (scripts/orch-state-validate.sh pre-existed, commit d6f9b0580). Wider check: SHG-2 (41d925d8c), SHG-3+SHG-4 (46eba4b33, eviction-exec b7fc62411), SHG-5 (4a5d655df) ALL have matching completion commits yet remain BACKLOG/TODO rows — but orch-validate.mjs:375 documents an still-unflipped coherence hard-fail condition gated on SHG-2+SHG-4 \"complete\", and this tick's own orch-apply.sh runs show 129 live coherence violations — genuine open work, not just unflipped checkboxes. Whoever picks up this sweep should treat the SHG-1..SHG-5 cluster as a concrete first case study: verify each individually (SHG-1 done, closed this tick; SHG-2/3/4/5 need actual investigation of the coherence-hard-fail-flip readiness before any DONE_VERIFIED flip)."))
    else . end
  ])
