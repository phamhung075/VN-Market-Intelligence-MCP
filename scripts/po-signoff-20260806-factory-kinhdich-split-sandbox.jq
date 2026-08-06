# scripts/po-signoff-20260806-factory-kinhdich-split-sandbox.jq
#
# PO sign-off for FACTORY-KINHDICH-split-sandbox — moves the row out of the
# stale review[] lane (claimed 2026-08-06T20:10Z by dev-team's Review-Lane
# SECONDARY-Drain, routed to po: no next_agent=qa, no other resolvable owner)
# into done[] with status DONE_VERIFIED (lane-coherent per
# apps/mcp-server/src/infrastructure/orchStateSchema.ts LANE_ALLOWED_STATUSES:
# done -> {DONE, DONE_VERIFIED}; the done_verified[] lane is empty repo-wide,
# done[] is the live convention).
#
# Usage (NEVER raw mv/cp/> — CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER):
#   jq -f scripts/po-signoff-20260806-factory-kinhdich-split-sandbox.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Owning flow: docs/agents/po/flow/main.md (Reusable triage scripts)
# Detail ref:  docs/agent-memory/decisions/sprint-FACTORY-KINHDICH-split-sandbox-po.md

def NOW: "2026-08-06T20:37:00Z";
def TID: "FACTORY-KINHDICH-split-sandbox";

def signoff:
  . + {
    status: "DONE_VERIFIED",
    commit_sha: "fa3c51f3a67b39872b2bb38d2687f9172f8e9d83",
    closed_at: NOW,
    updated_at: NOW,
    updated_by: "po/review-lane-secondary-drain-signoff-20260806T2037Z",
    secondary_resolved_at: NOW,
    secondary_resolved_disposition: "DONE_VERIFIED — no rework, no reassignment; row was never stale work, only a stale lane position",
    po_signoff_at: NOW,
    po_signoff_by: "po/review-lane-secondary-drain-signoff-20260806T2037Z",
    po_signoff_verdict: "APPROVED / DONE_VERIFIED. The row carried NO status_note and NO review_note — the implementer (dev-kinh-dich) shipped code and a decision journal but never wrote a review note onto the board row, which is why 6 weeks of Review-Lane sweeps found nothing resolvable and kept re-deferring it. Sign-off therefore rests entirely on RAW re-verification of the DoD against live source and git, not on any self-report. DoD was: 'Files split; each <=120L or justified; sandbox runs scenarios identically; tests green; generic; dev-tool behavior unchanged.' All six clauses independently re-verified this cycle — see po_signoff_evidence.",
    po_signoff_evidence: "(1) SPLIT LANDED: commit fa3c51f3a (2026-07-24T13:21Z) split apps/kinh-dich-service/cmd/sandbox/main.go 752L -> main.go 183L + runners.go 400L + emit.go 107L + discovery.go 109L (799L total), all package main. Live wc -l re-read, matches. (2) SIZE CLAUSE: emit.go/discovery.go under the 120L cap outright; main.go and runners.go carry size-justification headers in their first 10 lines. Ran the actual CI gate scoped to the zone — SIZE_LINT_INCLUDE_OVERRIDE='apps/kinh-dich-service/**/*.go' bash scripts/audits/size-lint-justification.sh --check -> 'PASS — 0 unjustified offenders (scanned 25 files, threshold=120L)'. main.go's header declares 179L against an actual 183L; that 4L drift is inside the gate's own +/-10%-or-min-5L tolerance, so it is a PASS not a waiver, and it is recorded here rather than silently absorbed. (3) BEHAVIOUR IDENTICAL: diffed the sorted top-level declaration set of the pre-split blob (git show fa3c51f3a^:.../main.go) against the concatenation of all 4 post-split files — 18 symbols pre, 18 post, diff EMPTY. Pure code movement, no symbol added, dropped or renamed. (4) SANDBOX RUNS: go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all -> 'Passed: 17/17 / All scenarios GREEN', exit 0, worktree still clean afterwards (both emit flags default false, so the run writes nothing). (5) TESTS GREEN: go build ./cmd/sandbox and go vet ./cmd/sandbox clean; go test ./... across the service -> 8 packages ok (application, infrastructure, interface/http, reading_composer, hao_encoder, hexagram_resolver, ngu_hanh_classifier, nuclear_hexagram, reading_scorer), 0 fail. (6) DEV-TOOL UNCHANGED: flags, types (ScenarioTrace/TraceOutput) and the tier loop are byte-for-byte the pre-split logic relocated; no exported API and no HTTP surface is involved at all.",
    po_signoff_rebuild_disposition: "NO REBUILD NEEDED — the detail row's rebuild_required:true is over-conservative and is hereby dispositioned, not inherited. Read apps/kinh-dich-service/Dockerfile at source: the builder stage runs `go build -o /app/server ./cmd/server` and the runtime stage copies only /app/server and /app/api. cmd/sandbox is a dev-only CLI that is never compiled into the served image, so no byte of the running kinh-dich-service container is affected by this change. The implementer's commit-message note 'rebuild_required=true — PENDING-USER-GATED (CODE-ONLY landed)' is doubly moot: the rebuild is unnecessary, and PO holds full rebuild autonomy with no user gate regardless (feedback_po_deploy_rebuild_full_autonomy_no_user_gate). This is the root cause of the 6-week strand — a phantom deploy gate on a change that could never require a deploy.",
    po_signoff_followup: "No follow-on row minted. Considered minting a FIX for the missing-review_note class (implementer ships + journals but leaves the board row noteless, so every downstream sweep must re-derive verification from scratch — the exact cost paid here). Not minted: it is a fleet-wide flow-compliance pattern, not a kinh-dich defect, and minting a zone-scoped row against one instance would be the wrong shape. Recorded in docs/agent-memory/notebooks/po.md and the PO decision journal for the next flow-level pass instead."
  };

# Capture-then-move. If the row is absent the $row binding yields nothing and
# the filter emits NO output — orch-apply.sh then aborts on empty stdin rather
# than silently writing a board with the row dropped.
(.task_board.review[] | select(.id == TID) | signoff) as $row
| .task_board.review |= map(select(.id != TID))
| .task_board.done += [$row]
| .task_board._updated_at = NOW
| .task_board._updated_by = "po"
