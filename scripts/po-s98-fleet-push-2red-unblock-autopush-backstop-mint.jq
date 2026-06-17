# po-s98-fleet-push-2red-unblock-autopush-backstop-mint.jq
# Single-pass triple-mutation POST-PUSH triage. Origin 2026-06-17: PO executed the
# worktree fleet push (origin 882ab789 -> 701923bc, 104-ahead->0; CI-RED-STANDING
# fix 1837a/1352a NOW GREEN on origin, RAW-verified 13 pass/0 fail local). BUT the
# Linux CI run for the pushed SHA is RED with 2 GENUINE (not host-weather) reds that
# the per-file-isolation full suite surfaced — both fail LOCALLY too:
#   - src/__tests__/084-tool-market.test.ts:391  toBe(2) -> Received 3 (a 3rd
#       market tool legitimately added by ddc36452; STALE test count assertion).
#   - src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts:224  vn-bctc-fetch passive check
#       always healthy (no active freshness check) — behavioral regression.
# Neither is in the pushed diff; both are DISJOINT from the CI-RED-STANDING fix
# (CI subset-verify-misses-full-suite lesson). So done_verified STAYS WITHHELD for
# CI-RED-STANDING + the 4 ci_green_on_subsequent_push-gated tasks: the gate is
# "full-suite CI GREEN on origin" and it is RED on a NEW blocker now reassigned.
#
# M1 MINT FIX-CI-RED-2RED-084-VPS-FRESHN -> ready[] LEAD (P1, dev-mcp-server,
#    apps/mcp-server/) — the immediate push-gate UNBLOCKER for 5 already-done tasks.
# M2 MINT ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP -> backlog[] (P2, architect,
#    cross-service/) — DURABLE automation: a threshold-triggered worktree-push
#    backstop EXTENDING (not duplicating) the shipped FU-ORIGIN-LAG-PUSH-DISCIPLINE
#    (which shipped option-1 in-mutex rebase-push; the recurrence proves it's
#    insufficient under a perpetually-dirty tree — option-2 periodic worktree-push
#    was the deferred alternative, now needed as a backstop).
# M3 ANNOTATE-IN-PLACE the CI-RED-STANDING done[] row: stamp push_landed + own-tests
#    GREEN, reassign the gate-blocker to the new FIX, done_verified STAYS null.
#
# Idempotent: mints id-guarded across ALL board arrays; annotation guarded by the
# .gate_reassigned_to marker. Conservation: ready +1, backlog +1, done length
# byte-stable (M3 is in-place), in_progress/review/done_verified byte-stable.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s98-fleet-push-2red-unblock-autopush-backstop-mint.jq \
#   docs/data/orch/orch-state.json
# Atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by
# EXPLICIT PATH. Flow-doc pointer: docs/agents/po/flow/main.md (reusable triage scripts).

. as $root
| ([.task_board[]? | (if type=="array" then .[] else empty end) | objects | (.id // .task_id // "")]) as $all_ids

| ({
    id: "FIX-CI-RED-2RED-084-VPS-FRESHN",
    title: "Standing CI RED: 2 genuine non-host-weather test fails block the full-suite push gate (unblocks 5 done tasks)",
    type: "FIX",
    status: "READY",
    priority: "P1",
    blocking: true,
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    created_at: $now,
    created_by: "po-s98",
    root_cause: "Full per-file-isolation CI suite (bun test) RED with 2 fails DISJOINT from FIX-CI-RED-STANDING-1837A-1352A (which is now GREEN on origin, RAW 13 pass/0 fail). Both fail LOCALLY too (NOT host-weather): (1) src/__tests__/084-tool-market.test.ts:391 expects registerMarketTools to register exactly 2 tools (toBe(2)) but marketTools.ts now registers 3 server.tool() calls (3rd added by ddc36452 'market breadth + liquidity') — STALE count assertion, code is correct. (2) src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts:224 'vn-bctc-fetch: passive check always returns healthy (no active freshness check)' — behavioral regression in the data-freshness health check.",
    fix_spec: "(1) 084-tool-market.test.ts:391 — bump toBe(2) -> toBe(3) AND assert the new tool name is in toolNames (do NOT just bump the number blindly — verify the 3rd registered tool's name and add a toContain for it so the count stays meaningful). (2) FIX-VPS-HEALTH-FRESHN.test.ts:224 — RAW-read the test intent: it asserts vn-bctc-fetch should NOT always return healthy under passive check (must do an active freshness check); determine whether the regression is in the health-check IMPL (active-freshness path dropped) or the test expectation; fix the IMPL if the active freshness gate was lost (passive-health-masks-dead-data lesson), else correct the test. Do NOT mask a real freshness regression by relaxing the test.",
    generic_mandate: "Fix is generic — no sentinel/date cutoff. After fix, the EXACT CI command (per-file isolation full suite) must be 0 fail.",
    verification_gate: "Local: `bun test src/__tests__/084-tool-market.test.ts` AND `bun test src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts` both 0 fail, AND the full per-file-isolation suite 0 fail. THEN push -> `gh run list --branch main --workflow CI` conclusion=success for the SHA containing this fix. ON GREEN: promote FIX-CI-RED-STANDING-1837A-1352A + the 4 ci_green_on_subsequent_push-gated tasks (CI-RED-RECONCILE, CI-RED-b7b84d9b-FIX, FIX-TA-SANDBOX-DEPGUARD, CI-RED-8081e584-FIX) to done_verified.",
    unblocks: ["FIX-CI-RED-STANDING-1837A-1352A","CI-RED-RECONCILE","CI-RED-b7b84d9b-FIX","FIX-TA-SANDBOX-DEPGUARD","CI-RED-8081e584-FIX"],
    rebuild_required: false,
    size: "S",
    origin: "po-s98 fleet-push 2026-06-17 — CI red on pushed SHA 701923bc, 2 genuine reds disjoint from CI-RED-STANDING"
  }) as $fix

| ({
    id: "ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP",
    title: "DURABLE: threshold-triggered worktree-push backstop so origin-lag stops recurring as manual router nudges",
    type: "SPRINT-S",
    mode: "design",
    status: "BACKLOG",
    priority: "P2",
    zone: "cross-service/",
    next_agent: "architect",
    recon_first: true,
    created_at: $now,
    created_by: "po-s98",
    extends: "FU-ORIGIN-LAG-PUSH-DISCIPLINE",
    problem: "FU-ORIGIN-LAG-PUSH-DISCIPLINE (done_verified) shipped option-1: a rebase-retry push step INSIDE the commit-mutex window so each committing agent pushes its own work. RECURRENCE EVIDENCE: this is the 2nd time THIS session the push backlog grew to ~100+ commits (1st: 0c826511 worktree push; now: 701923bc, 103-ahead/36-behind) and needed a manual router-nudge worktree push. ROOT of the recurrence: the working tree is PERPETUALLY dirty (cowork churn) so the in-mutex `git pull --rebase` can never get a clean window — option-1's push silently fails its rebase-retry and commits pile up local-only again. The DISCIPLINE task itself named option-2 (periodic auto-push, decoupled from commit, single race-free pusher) as the deferred alternative. The recurrence shows option-1 needs option-2 as a BACKSTOP. Also: 103 unpushed commits = ~2 days of work with NO off-machine backup.",
    design_mandate: "Design the LOWEST-RISK threshold-triggered worktree-push backstop that fits the flow. The proven recipe (router notebook + feedback_push_blocked_by_perpetual_dirty_tree) already WORKS precisely because it is tree-INDEPENDENT: `git worktree add <wt> HEAD` -> integrate origin (MERGE if behind-set is cloud-chore; preserve both signal_queue rows on conflict) -> symlink main node_modules so the pre-push tsc hook passes -> `pnpm --filter vn-market check`=0 -> `git push origin HEAD:main` -> remove symlinks -> `git worktree remove`. Codify THIS recipe into a single reusable script (scripts/fleet-worktree-push.sh) and TRIGGER it when `git rev-list --count origin/main..HEAD` exceeds a threshold (evaluate N=20). Evaluate the trigger options and pick one: (a) a scheduled cron/RemoteTrigger that runs the script every N hours WHEN ahead>threshold (reconcile against existing cron inventory in docs/data/system-map.json — do NOT add an unmanaged always-on component); (b) a po-flow / dev-team-flow step that fires the script when the ahead-count exceeds threshold during a triage tick (no new daemon — rides the existing loop cadence). PREFER (b) on first read: it adds no always-on component, rides the loop that's already running, and the worktree isolation means it never touches the dirty main tree the loop uses. CONSTRAINTS: must be CONCURRENCY-SAFE under the active dev-team commit loop (claim a commit-mutex/task_claim before the push; the worktree is isolated so it never blocks the loop's main-tree work); MUST run the tsc pre-push gate (never --no-verify); MUST classify the behind-set (MERGE for cloud-chore, never silently rebase over real fixes); MUST NOT push around a RED pre-push hook (red-prepush-strands-fleet lesson).",
    deliverable: "architecture-brief in docs/architecture-briefs/ choosing trigger (a vs b), naming the single SSOT script (scripts/fleet-worktree-push.sh), the threshold N, the mutex/claim integration, and the exact flow-step or cron wiring. Then pm decomposes + the right zone implements (cross-service/ for the script + flow-doc; dev-mcp-server only if a scheduler job is chosen). Acceptance: after ship, `git rev-list --count origin/main..HEAD` stays bounded (<= N) across a full maintenance cycle WITHOUT any manual router-nudge worktree push, and NO push-storm / non-fast-forward error spam.",
    dedup_note: "EXTENDS FU-ORIGIN-LAG-PUSH-DISCIPLINE (done_verified, shipped option-1 in-mutex push) — does NOT duplicate it. This is the deferred option-2 backstop the DISCIPLINE task explicitly named. Reuses the proven worktree-push recipe, does not invent a new mechanism.",
    size: "S",
    origin: "po-s98 fleet-push 2026-06-17 — 2nd ~100-commit manual-nudge recurrence this session"
  }) as $arch

| (if ($all_ids | index($fix.id)) then . else .task_board.ready = ([$fix] + .task_board.ready) end)
| (if ($all_ids | index($arch.id)) then . else .task_board.backlog += [$arch] end)

# M3: annotate CI-RED-STANDING done[] row in-place (guard on gate_reassigned_to marker)
| .task_board.done = (.task_board.done | map(
    if (.id // "") == "FIX-CI-RED-STANDING-1837A-1352A" and (has("gate_reassigned_to") | not)
    then . + {
      push_landed: "origin 882ab789 -> 701923bc (worktree merge-push 2026-06-17, po-s98); this fix IS on origin",
      own_tests_green: "RAW-verified local 13 pass/0 fail: 1837a-pipeline-state.test.ts + 1352a-async-extraction-race.test.ts",
      gate_status: "WITHHELD — full-suite CI RED on pushed SHA, but the 2 reds are DISJOINT from this fix (084-tool-market stale count + FIX-VPS-HEALTH-FRESHN behavioral); this fix's own gate is satisfied",
      gate_reassigned_to: "FIX-CI-RED-2RED-084-VPS-FRESHN",
      gate_reassigned_at: $now,
      gate_reassigned_by: "po-s98"
    }
    else . end))

| .task_board._updated_at = $now
| .task_board._updated_by = "po-s98"
| ._updated_at = $now
| ._updated_by = "po-s98"
