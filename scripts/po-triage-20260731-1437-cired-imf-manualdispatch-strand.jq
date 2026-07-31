# PO triage 2026-07-31T14:37Z — two board mints.
#
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq --arg now "$NOW" -f scripts/po-triage-20260731-1437-cired-imf-manualdispatch-strand.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Row 1 FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API
#   Minted per docs/agents/po/flow/triage-signals.md `ci_red` ANTI-AMNESTY BACKSTOP.
#   FAILING_FILES read verbatim from `gh run view 30639708394 --log-failed`
#   (=== FAILED FILES (1) === block) BEFORE dedup, as that rule mandates.
#   PRIMARY (dedup_key) + SECONDARY (check_id/head_sha/file) dedup both zero-hit
#   across backlog+ready+in_progress+review+qa.
#
# Row 2 FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW
#   Found by the MANDATORY manual-dispatch-sweep pre-check. Mechanism proven by
#   repo-wide grep of po_manual_dispatch_flagged_at (no clearing site anywhere),
#   not by the single live instance (TE-T12).
#
# Idempotent-by-dedup: row 1 carries the dedup_key the next tick's ci_red triage
# derives, so a re-drain of docs/signals/ci-red-a26653ff-20260731144640.json
# hits PRIMARY dedup and skips instead of double-minting.

.task_board.backlog += [
  {
    id: "FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API",
    type: "FIX",
    title: "CI-RED-a26653ff-FIX — CI RED: bun test — src/__tests__/1296b-imf-integration.test.ts (non-hermetic: AC-7/AC-8 call live IMF API in CI)",
    status: "BACKLOG",
    priority: "high",
    size: "S",
    zone: "apps/mcp-server/",
    owner: "po",
    next_agent: "dev-mcp-server",
    check_id: "CI-RED-a26653ff",
    dedup_key: "ci_job:bun test|file:src/__tests__/1296b-imf-integration.test.ts",
    ci_fingerprint: "88e080090cb9207fd265f3a9cb47f90481a979fd8200f27f2b604caae7c11cb0",
    origin_signal_id: "ci-red-a26653ff-20260731144640",
    created_at: $now,
    created_by: "po/triage-20260731T1437Z",
    baseline_pass: "14908",
    verification_gate: "ci_green_on_subsequent_push",
    files: ["apps/mcp-server/src/__tests__/1296b-imf-integration.test.ts"],
    desc: "CI RED on main HEAD a26653ff2 (run 30639708394), job \"bun test\", 14908 pass / 40 skip / 1 fail. FAILING_FILES read verbatim from `gh run view 30639708394 --log-failed` === FAILED FILES (1) === block: src/__tests__/1296b-imf-integration.test.ts (repo path apps/mcp-server/src/__tests__/1296b-imf-integration.test.ts). ROOT-CAUSE HYPOTHESIS (not yet confirmed — do not close on it): the file is NOT hermetic. describe AC-7 (runImfIndicatorPollerJob; its it() carries an explicit 35_000ms timeout commented \"poller has 30s timeout + overhead\") and describe AC-8 (getLatestImfIndicators + classifyImfIndicators) exercise a live external IMF API from CI. File untouched by any recent commit (last content change 2681856e5; moved by 8fc725347 + a09751686 monorepo scaffold), and the identical suite was green on the immediately-prior commit 6775752af minutes earlier — consistent with external-API flakiness rather than a code regression. Same defect CLASS as the already-open FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE (different file, so no dedup).",
    deliverable: "AC: make apps/mcp-server/src/__tests__/1296b-imf-integration.test.ts hermetic in CI — AC-7/AC-8 must not depend on live IMF API reachability (mock the poller/fetch boundary, or gate the live-network describes behind an env flag CI does not set). Pure-logic describes (AC-5 IMF_CASCADE_RULES, AC-6 synthesizeChain conviction weights) must keep running unconditionally. Verify: gh run view <databaseId with headSha AFTER a26653ff2> --json jobs -q '.jobs[]|select(.name==\"bun test\")|.conclusion' == success.",
    status_note: "AC: gh run view <databaseId with headSha AFTER a26653ff2a0f36c804e6ec7448b8c6ae534761e8> --json jobs -q '.jobs[]|select(.name==\"bun test\")|.conclusion' == success (verification_gate=ci_green_on_subsequent_push). Priority: high. Failing job: bun test. Failing file: src/__tests__/1296b-imf-integration.test.ts. Observed SHAs: a26653ff2 (run 30639708394). MINTED PER ANTI-AMNESTY BACKSTOP: file-scoped PRIMARY dedup (dedup_key) and SECONDARY dedup (check_id / head_sha / file across backlog+ready+in_progress+review+qa) both returned zero hits; per triage-signals.md the CI plane baseline is 0 fail, so \"flake / pre-existing\" is NOT a valid disposition without a matched open row. If it proves transient, close on a GREEN subsequent run — do not close as \"not a real failure\" while the non-hermetic live-API dependency remains in the file.",
    related: ["FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE"]
  },
  {
    id: "FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW",
    type: "FIX",
    title: "manual-dispatch-sweep idempotency guard strands any flagged row whose BATCH was never dispatched — re-creates the exact P0 class its own parent row cured",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    owner: "po",
    next_agent: "agent-father",
    created_at: $now,
    created_by: "po/triage-20260731T1437Z",
    baseline_pass: "14908",
    files: [
      "docs/agents/po/flow/manual-dispatch-sweep.md",
      "scripts/audits/po-manual-dispatch-sweep-verify.sh",
      "docs/policies/dev-standards.md"
    ],
    desc: "docs/agents/po/flow/manual-dispatch-sweep.md Step 1 excludes every row carrying po_manual_dispatch_flagged_at from the candidate list, but Step 3 only ever folds the ONE row Step 2 just stamped this tick. There is therefore no path by which a previously-flagged row re-enters any BATCH: stamp and dispatch are not atomic, so a row that gets stamped but whose BATCH is then deferred (e.g. dev-team WIP cap) becomes permanently invisible to the only producer that reaches it. MECHANISM PROVEN BY CONTROL FLOW, not by the single instance: repo-wide grep for po_manual_dispatch_flagged_at returns only (a) the two Step 1 exclusion filters in the sub-flow, (b) their mirror in docs/policies/dev-standards.md:517/521, (c) the G-ALREADY-FLAGGED fixture in scripts/audits/po-manual-dispatch-sweep-verify.sh, (d) two historical one-off mint scripts. NOTHING ever clears the stamp, and the sub-flow header itself states \"Consumer of this sub-flow's stamp: none automated by design\". LIVE INSTANCE: TE-T12 (P1, SPRINT-M, next_agent=agent-father) flagged 2026-07-31T06:56:27Z, still status=BACKLOG at 2026-07-31T14:49Z (~8h), still satisfies is_drs_stranded_off_allowlist, and is now excluded from every future sweep. Same documented-producer-strands-row failure the parent row FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH (P0, review) was built to cure — 5th instance of the producer/consumer defect family.",
    deliverable: "AC: (1) a flagged-but-still-in-backlog[]/ready[] row must be re-foldable into a later BATCH — e.g. Step 1 re-admits rows whose po_manual_dispatch_flagged_at is older than a bounded staleness window, or Step 3 folds the highest-priority already-flagged undispatched row when Step 2 stamps nothing; (2) the exclusion must still prevent double-BATCHing within a single tick; (3) scripts/audits/po-manual-dispatch-sweep-verify.sh gains a positive control for the re-admission branch (flagged + still in backlog + stale => candidate) alongside the existing G-ALREADY-FLAGGED negative control; (4) the docs/policies/dev-standards.md:517/521 mirror is updated in lockstep so the two copies do not drift.",
    out_of_scope: "Widening the DRS allowlist; making PO write .head / in_progress[] (the sub-flow's own design note explains why PO must not share dev-team's WIP budget).",
    status_note: "Found by po during the MANDATORY manual-dispatch-sweep pre-check, triage tick 2026-07-31T14:37Z. Recorded in docs/agent-memory/notebooks/po.md on a prior tick but never minted to the board (notebook notes are invisible to backlog sweeps) — this row closes that gap. NOTE: po deliberately did NOT stamp a new candidate (TE-T14) this tick precisely because stamping under a saturated WIP cap deterministically creates another stranded row; 40 unflagged candidates remain, so flag rate is not the binding constraint — dispatch is.",
    related: ["FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH", "TE-T12"]
  },
  {
    id: "FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR",
    type: "FIX",
    title: "triage-signals.md ci_red mint template hardcodes status \"TODO\" for a backlog[] append — lane-coherence validator only accepts BACKLOG|BLOCKED, so every ci_red mint fails orch-apply on first attempt",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "cross-service/",
    owner: "po",
    next_agent: "agent-father",
    created_at: $now,
    created_by: "po/triage-20260731T1437Z",
    baseline_pass: "14908",
    files: ["docs/agents/po/flow/triage-signals.md"],
    desc: "docs/agents/po/flow/triage-signals.md, `ci_red` row: the mint template instructs `append to .task_board.backlog[]: {id: ..., status: \"TODO\", ...}`. orch-apply Stage 1b lane-coherence rejects it: 'task_board.backlog[id=...].status: \"TODO\" is not allowed in lane \"backlog\", expected: BACKLOG|BLOCKED'. Reproduced live this tick 2026-07-31T14:5xZ while minting FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API — the write ABORTED (live file untouched) and only succeeded after relabelling to BACKLOG. Every existing backlog row uses BACKLOG (spot-checked TE-T12, FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE), so the doc template — not the validator — is the drifted side. Impact: not silent (orch-apply fails loud and refuses the write), but it costs every ci_red triage a wasted round-trip and invites an agent under token pressure to mis-'fix' it by moving the row to the wrong lane, which the validator's own message explicitly offers as an alternative remedy.",
    deliverable: "AC: (1) change the `ci_red` mint template in docs/agents/po/flow/triage-signals.md from status: \"TODO\" to status: \"BACKLOG\"; (2) grep the rest of that file (and the sibling po/flow/*.md mint templates) for any other `.task_board.<lane>[]` append whose literal status token is not in that lane's allowed set per apps/mcp-server/src/infrastructure/orchStateSchema.ts, and correct them in the same pass — this is a template-vs-validator drift class, not a one-token typo.",
    out_of_scope: "Relaxing the lane-coherence validator to accept TODO in backlog[] — the validator is the correct side and is load-bearing for lane/status coherence.",
    status_note: "Found by po during triage tick 2026-07-31T14:37Z, reproduced live (orch-apply Stage 1b abort, exit 2). Routed to agent-father per the ARTIFACT-CLASS ROUTING RULING 2026-07-21 (docs/agents/** = instruction-prose an agent loads and executes).",
    related: ["FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API"]
  }
]
