# PO triage 2026-08-23T11:57Z — PREFLIGHT WIDENING of the CI-RED umbrella.
# PO repaired 2 previously-unparseable docs/signals/*.json this tick, which
# makes them drainable for the first time — and their type has NO Pipeline-A
# routing row, so the next drain would re-red the guard and auto-mint a 5th
# undispatchable tracker. Widened the umbrella scope NOW instead of paying for
# it next tick. Scope derived by running the guard's own parser against
# triage-signals.md and diffing it with every type still queued on the file
# plane (docs/signals/*.json), not from memory.
def NOW: "2026-08-23T11:58:00Z";
def BY: "po/triage-20260823T1157Z";
  (.task_board.ready[] | select(.id == "FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire"))
  |= (. + {
      umbrella_scope: ["cowork-fire","flow_actuator_fix","system-issue","sprint_registry_unresolved_journal_ids","notebook_prune_dropped_newest_dated_section","notebook_tiebreak_direction_defaulted"],
      updated_at: NOW, updated_by: BY,
      po_scope_widening_20260823T1158Z: "SCOPE WIDENED 4 -> 6 TYPES, from a preflight rather than from the next red build. Method: ran the guard's own awk/sed parser against triage-signals.md's Pipeline-A section to get the routed set, then diffed it against every `.type` still queued on the file plane (docs/signals/*.json), which is what the next drain will append to .dev_team_idle_chain.pending_triage_inbox[]. Result: `ci_red` routed; `cowork-fire` UNROUTED (1 file); `notebook_prune_dropped_newest_dated_section` UNROUTED (2 files). The latter two are the ones PO repaired this tick — they had been unparseable JSON and therefore invisible to every drain for 5 consecutive passes, so they had never yet been able to red the guard. Repairing them makes them drainable for the first time, which would have re-reddened signal-type-coverage-guard on the next push AND auto-minted a 5th undispatchable FIX-SIGNAL-TYPE-ROUTING-GAP-* row. Added `notebook_tiebreak_direction_defaulted` in the same pass: same emitter (notebook-auto-prune-hook), also unrouted, and already observed live on 2026-08-22 (see scripts/po-triage-20260822T2258-fleetpush-sizelint-sweepguard-5folds.jq) — cheap to route now, one more red build if not. Suggested disposition for both notebook_* types, matching the three notebook_*_breach rows already in the Pipeline-A table: FOLD on payload.file, else CHORE owner=claude-manager-helper zone=docs/agent-memory/notebooks/. SEPARATE, NOT IN SCOPE HERE: 47 of the 51 files in docs/signals/ carry NO `type` field at all — tracked on FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER (ready, P1, developer), re-measured 47/51 this tick."
    })
| (.task_board.ready[] | select(.id == "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER"))
  |= (. + { updated_at: NOW, updated_by: BY,
      po_remeasure_20260823T1158Z: "RE-MEASURED 2026-08-23T11:58Z, still live: 47 of 51 docs/signals/*.json carry no `type` field. The 4 that do: ci_red (1), cowork-fire (1), notebook_prune_dropped_newest_dated_section (2, both of which PO had to hand-repair this tick — they were unparseable JSON, not merely untyped, and had been silently skipped by 5 consecutive drains). Emitter-side root cause for the unparseable subset is now minted separately as FIX-NOTEBOOK-PRUNE-AC6-SIGNAL-HEREDOC-EMITS-UNPARSEABLE-JSON-UNDRAINABLE-FOREVER." })
