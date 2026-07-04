# Router: advance chain developer->qa for FIX-DRAINESC after developer implementation (RAW-verified).
# developer (a18a13d4) shipped commits bf0b2cc9a (code) + 9419e644d (notebook); left the board write to router.
# This: moves IMPL-DRAIN-GATE ready[]->in_progress[] with dev evidence + next_agent=qa; flips parent
# FIX-DRAINESC next_agent->qa; advances top-level .head->qa (dual-key discipline). SF-1 held by router.
# Guards: error if IMPL not in ready[] OR parent not in in_progress[] (idempotent — re-run after success aborts).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-advance-qa-drainesc-20260704.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.ready | map(select(type=="object" and .id=="IMPL-DRAIN-GATE-SEVERITY-RECURRENCE"))[0]) as $impl
| if $impl == null then error("IMPL-DRAIN-GATE-SEVERITY-RECURRENCE not in ready[] -- refuse to advance") else . end
| (.task_board.in_progress | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE")) | length) as $p
| if $p == 0 then error("parent FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in in_progress[] -- refuse to advance") else . end
| .task_board.in_progress += [
    ($impl + {
      status: "IN_PROGRESS",
      next_agent: "qa",
      owner: "qa",
      dev_commits: ["bf0b2cc9a", "9419e644d"],
      dev_files: ["docs/agents/dev-team/flow/drain-esc-dispatch.md", "scripts/agents-flow/drain-signals.js", "scripts/agents-flow/drain-signals.test.js"],
      dev_verify_note: "developer (a18a13d4) DONE + router RAW-verified: bf0b2cc9a (3 in-scope files, 305+/3-, UUID-clean, no orch-state/signals.db touch); router re-ran drain-signals.test.js -> 11/11 PASS exit 0 (AC4/AC5/AC7/AC8/AC9 incl AC7 golden-stdout byte-identical no-arg drain-mode); drain-esc-dispatch.md 153L<=200; GATE-A/GATE-B/TERMINAL anchors + type-guard hardening (2x) present. Dev caught+fixed REAL brief defect: literal Tier-1 jq (.related//[])|any crashes on string-typed .related in 3 live rows (FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-ALERT-COMMANDER-DEAD-NO-SLOT, FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK) -> hardened `if type==array then any else false`. AC1/AC2/AC3/AC6 dev-verified via scratch mirror + live read-only jq (AC3 MBB->true vs REFLOW-MBB-Q1-2026 BLOCKED; FPT->false).",
      dispatched_to_qa_at: $now,
      dispatched_to_qa_by: "router"
    })
  ]
| .task_board.ready |= map(select(type != "object" or .id != "IMPL-DRAIN-GATE-SEVERITY-RECURRENCE"))
| .task_board.in_progress |= map(if (type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE") then . + {next_agent: "qa"} else . end)
| .head = {
    status: "in_progress",
    active_task_id: "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE",
    next_agent: "qa",
    next_action: "developer DONE (commits bf0b2cc9a code + 9419e644d notebook, router RAW-verified: drain-signals.test.js re-run 11/11 pass exit 0, in-zone, UUID-clean, 153L<=cap; dev caught+fixed brief jq string-.related crash). IMPL-DRAIN-GATE-SEVERITY-RECURRENCE moved ready->in_progress, next_agent=qa. qa gates all 9 ACs: GATE-A severity floor (>=HIGH) + GATE-B two-tier recurrence dedup in docs/agents/dev-team/flow/drain-esc-dispatch.md + scripts/agents-flow/drain-signals.js (--recurrence-count read-only helper) + drain-signals.test.js. qa MUST confirm: no live orch-state/signals.db mutation, byte-identical no-arg drain-mode, count==1 never suppressed, no ticker hardcode, injection-safe. On PASS: close BOTH IMPL + parent FIX-DRAINESC to done_verified + release SF-1. Chain: qa (final). SF-1 held by router.",
    updated_at: $now,
    updated_by: "router",
    note: ($now + ": developer->qa handoff. IMPL moved ready->in_progress (next_agent=qa); parent next_agent=qa; head advanced to qa by router.")
  }
