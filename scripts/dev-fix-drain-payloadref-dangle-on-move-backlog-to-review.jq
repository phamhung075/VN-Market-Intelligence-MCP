# scripts/dev-fix-drain-payloadref-dangle-on-move-backlog-to-review.jq
#
# FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE — backlog[] -> review[] after
# implementation + verification-gate GREEN + commit. Flipped to REVIEW (not
# DONE_VERIFIED — developer never self-flips per DJ-GATE-1); next_agent=qa
# to independently re-verify. Router-directed dispatch (supervised:true row,
# bypassed via explicit router instruction — see commit trailer).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-drain-payloadref-dangle-on-move-backlog-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.backlog | map(select(.id == "FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "Root cause: scripts/agents-flow/drain-signals.js moved docs/signals/*.json -> processed/ with zero signal_queue awareness. Fix: after the existing move loop, the script now builds a movedRefs map (old repo-relative path -> new processed/ path, both routed-to-po and skipped-duplicate-replay branches) and, if non-empty, calls repointPayloadRefs() -- a jq filter (--argjson bound map, never string-interpolated) that rewrites signal_queue.rows[].payload_ref (fragment-preserving split on \"#\") for every row whose ref matches a moved file, computes {doc, changed}, and skips the write entirely when changed==0 (common case). When changed>0 the candidate is applied via the SAME scripts/orch-apply.sh gate every other orch-state writer uses (Zod schema + conservation + CAS), with up to 3 CAS-retry attempts (re-deriving the candidate from the live file each attempt) and a FAIL-LOUD process.exit(1) if the gated write still cannot land -- silently swallowing that failure would just reproduce the exact bug being fixed. All new diagnostics use console.error (stderr) only, so stdout stays byte-identical for every pre-existing caller/test (confirmed: existing golden-stdout regression test AC7 in drain-signals.test.js still passes verbatim). New verification-gate scenario in scripts/agents-flow/drain-signals.test.js (isolated mkdtemp harness: drain-signals.js + orch-apply.sh + orch-validate.mjs + orch-conservation-check.mjs + orchStateSchema.ts copied in, node_modules symlinked -- never the live orch-state.json) asserts live, in one run: (1) seeded docs/signals/<f>.json now under processed/, (2) the seeded signal_queue row payload_ref rewritten to the processed/ path, (3) the REAL bun scripts/orch-validate.mjs exits 0 against the harness copy. 18/18 total assertions green (15 pre-existing + 3 new). Negative control (pre-fix HEAD copy of the script, run against the identical fixture) reproduces the live bug verbatim -- payload_ref stays at the pre-move path after the file relocates, and a direct dangling-ref fixture separately confirmed orch-validate.mjs Stage 1c genuinely fails (exit 2) on this exact defect class, so the new gate is not vacuously green. Commit scoped to scripts/agents-flow/drain-signals.js + scripts/agents-flow/drain-signals.test.js only (explicit pathspec) -- did not sweep the live orch-state.json (already dirty from a separate concurrent fleet-push) into that commit; this board-transition write is a separate, additive orch-apply.sh write, also not committed by developer (left for the owning fleet-push/PO to pick up)."
  })
)
| .task_board.backlog |= map(select(.id != "FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE",
    next_agent: "qa",
    next_action: "FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE at REVIEW -- qa: re-run scripts/agents-flow/drain-signals.test.js (18/18 expected), spot-check the payload_ref repoint jq filter in scripts/agents-flow/drain-signals.js, then flip DONE_VERIFIED. No rebuild/deploy needed (scripts/ tooling change, no apps/mcp-server image dependency).",
    updated_at: $now,
    updated_by: "developer"
  }
