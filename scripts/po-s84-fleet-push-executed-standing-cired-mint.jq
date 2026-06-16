# po-s84-fleet-push-executed-standing-cired-mint.jq
#
# Single-pass POST-PUSH reconcile triage (2026-06-16 fleet push EXECUTED via
# isolated git worktree, NOT around the dirty main tree):
#
#  1. STAMP the top-level .head with a `push_executed` block recording that the
#     long-held fleet push (149-ahead → 0-behind) was carried out via the
#     `/tmp/fleet-push-wt` worktree path (origin 42290a40 -> 0c826511), so the
#     prior `push_note` (which only PLANNED the rebase) is now historical. The
#     head's active_task_id / next_agent / status are LEFT UNTOUCHED — the FE
#     dispatch (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH → dev-frontend) is the real
#     live dispatch and must not be perturbed by a push-reconcile.
#
#  2. id-guarded MINT of ONE follow-on FIX into backlog[] for the STANDING
#     CI-red the push surfaced on origin: `bun test` per-file-isolation fails
#     DETERMINISTICALLY (reproduced locally + on re-run, same 2 files) on
#       - src/__tests__/1837a-pipeline-state.test.ts  (AC-2: head.status valid
#         enum is missing "ready" — the live head.status IS "ready"; stale test
#         assertion, same class as 728ef563 which added "active"+"qa")
#       - src/__tests__/1352a-async-extraction-race.test.ts  (4 fail / 1 error
#         in the BCTC async-extraction-race suite)
#     This red PRE-DATES and is INDEPENDENT of the push (the push added zero
#     .ts; neither file is in the push delta) — it is genuine standing test
#     debt, NOT benign cloud-chore weather and NOT a regression from the merge.
#     It is NOT covered by any existing CI-RED-* task (those key on SHAs
#     b7b84d9b / d20468c0 / 8081e584, all DONE/done_verified) nor by the
#     FU-ORIGIN-LAG-PUSH-A..D push machinery (all done_verified).
#
# WHY this gates done_verified: 4 tasks carry `ci_green_on_subsequent_push`
# (CI-RED-b7b84d9b-FIX, CI-RED-d20468c0-FIX, plus the VMT-8 / FOREIGN-FLOW
# push-path gates). origin CI is now RED on this standing failure, so those
# gates CANNOT be satisfied until this FIX ships green. Promotion of the
# push-gated tasks to done_verified is therefore WITHHELD this tick — the
# push unblocked CI from RUNNING, but the suite must go green first.
#
# Idempotent: head stamp guarded by `.head.push_executed` presence; mint
# guarded by id-in-any-board-array. Re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s84-fleet-push-executed-standing-cired-mint.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#   && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   # commit orch-state by EXPLICIT PATH. The push itself is already on origin.

# ── id-presence guard: true if id is in ANY task_board array ──
def _in_board($id):
  [ .task_board | to_entries[] | select(.value|type=="array") | .value[]
    | (.id // .task_id // "") ] | any(. == $id);

. as $root
| .task_board.backlog as $backlog0

# ── 1. Stamp the head push_executed block (do NOT move active/next_agent) ──
| (if (.head | type=="object") and (.head | has("push_executed")) then .
   else .head += {
     push_executed: {
       at: $now,
       by: "po-s84",
       method: "isolated git worktree (/tmp/fleet-push-wt) — main dirty tree never touched, bg agents undisturbed",
       origin_range: "42290a40 -> 0c826511",
       result: "ahead 149 -> 0-behind; merged 18 benign cloud-chore commits; pre-push tsc GREEN; push EXIT=0",
       merge_conflict_resolved: "docs/data/orch/orch-state.json — kept HEAD _updated_at + preserved BOTH the 2 po-s76 sau-d4 reconcile rows AND origin's NEW tnb-20260615T201300 audit-handoff signal row",
       ci_result: "origin CI bun test RED on a STANDING pre-existing failure (1837a + 1352a) — independent of the push; follow-on FIX-CI-RED-STANDING-1837A-1352A minted; push-gated done_verified WITHHELD until green",
       main_tree_note: "main working-tree branch ref deliberately LEFT at 10797e26 (not fast-forwarded) — 3 dirty files overlap the FF delta; ref-move risks stranding a bg agent mid-write for zero benefit since the work is already on origin. Router reconciles the ref on its next fetch pass."
     }
   } end)

# ── 2. Mint the standing CI-red follow-on → backlog[] ──
| (if _in_board("FIX-CI-RED-STANDING-1837A-1352A") then .
   else .task_board.backlog += [{
     id: "FIX-CI-RED-STANDING-1837A-1352A",
     title: "FIX-CI-RED-STANDING-1837A-1352A — origin `bun test` RED on 2 standing-pre-existing files (1837a head.status enum missing 'ready' + 1352a async-extraction-race 4-fail/1-error)",
     type: "FIX",
     owner: "po",
     status: "BACKLOG",
     priority: "P2",
     zone: "apps/mcp-server/",
     next_agent: "dev-mcp-server",
     created_at: $now,
     source: "2026-06-16 fleet-push (origin 0c826511) — CI `bun test` per-file-isolation RED, reproduced LOCALLY + on re-run (deterministic, same 2 files). Pre-existing: NOT in push delta, push added zero .ts.",
     blocking: true,
     blocking_reason: "origin CI cannot go green while these 2 fail → the 4 tasks gated on ci_green_on_subsequent_push (CI-RED-b7b84d9b-FIX, CI-RED-d20468c0-FIX, VMT-8-MACRO-GRACEFUL-FAILCLOSE, FIX-FOREIGN-FLOW-DEAD-ENDPOINT) stay blocked from done_verified.",
     root_cause: "TWO independent standing failures: (1) 1837a-pipeline-state.test.ts AC-2 asserts head.status ∈ a fixed list that is MISSING 'ready' — but the live orch-state head.status IS 'ready' (a legitimate board value), so the test is a STALE assertion (same class as commit 728ef563 which previously added 'active'+'qa' to this same enum). (2) 1352a-async-extraction-race.test.ts: 4 fail / 1 error in the BCTC async extraction-race suite — needs a genuine triage of the race/fixture.",
     fix_spec: "(1) 1837a: add 'ready' to the valid head.status enum the test asserts against — verify against the orch-state-access.md canonical-status SSOT, NOT hardcoded (extend the SSOT list if 'ready' is genuinely valid, which it is per the current live head). (2) 1352a: triage the 4 failing assertions + 1 error in the async-extraction-race suite — determine whether it is a stale assertion, a fixture/mock-restore leak (per-file-isolation), or a genuine race regression; fix root cause, fail-loud, no test-skip.",
     generic_mandate: "1837a fix must source the valid-status set from the orch-state schema SSOT (docs/standards/orch-state-access.md) so future legitimate statuses don't re-break it — do NOT just append one literal. 1352a fix must address the actual race/fixture cause, not delete/skip the assertion.",
     verification_gate: "CI `bun test` (the EXACT per-file-isolation command, full suite) GREEN on origin AFTER this push — `gh run list --branch main --workflow CI` shows conclusion=success for a SHA containing this fix. Local: `bun test src/__tests__/1837a-pipeline-state.test.ts` AND `bun test src/__tests__/1352a-async-extraction-race.test.ts` both green. THIS unblocks the 4 ci_green_on_subsequent_push-gated tasks → promote them to done_verified once green.",
     files: ["apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts","apps/mcp-server/src/__tests__/1352a-async-extraction-race.test.ts","docs/standards/orch-state-access.md"],
     baseline_pass: false,
     size: "S"
   }] end)

# ── CONSERVATION guard: backlog += exactly 1 (or 0 if already present); all other lanes byte-unchanged ──
| ( (.task_board.backlog | length) as $b1
  | (if ($root | _in_board("FIX-CI-RED-STANDING-1837A-1352A")) then 0 else 1 end) as $delta
  | if $b1 == ($backlog0 | length) + $delta
    then .
    else error("CONSERVATION FAIL: backlog \($backlog0|length)->\($b1), expected delta \($delta)")
    end )
