# po-mint-ci-red-cdd5fa5a-buntest-20260728.jq
# PO triage 2026-07-28T23:2xZ — three idempotent board mutations:
#   (1) MINT CI-RED-cdd5fa5a-FIX into ready[] LEAD (P0, blocking) per the ci_red
#       contract in docs/agents/po/flow/triage-signals.md row `ci_red`.
#       Deviation from the contract's default backlog[] placement is deliberate and
#       recorded in the row's `placement_note`: root cause is already fully diagnosed
#       AND locally reproduced, main has been RED for 6 consecutive pushes, and a red
#       main blocks the fleet-wide push/CI-green gate.
#   (2) UNBLOCK FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (backlog BLOCKED -> ready READY,
#       next_agent=architect). It carried next_agent=po with blocked_reason=null,
#       blocked_on=null and po_question=null — no PO decision was ever actually pending;
#       its own acceptance (2)/(6) assign the disposition call to architect.
#   (3) STAMP a qa gate note on FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY
#       (review lane) so qa cannot sign it off green while its own commit holds main RED.
# Idempotent: (1) id-guarded across every board array; (2) guarded on the row still
#   being in backlog[]; (3) guarded on the note being absent.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-mint-ci-red-cdd5fa5a-buntest-20260728.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($now) as $now
| "CI-RED-cdd5fa5a-FIX" as $tid
| "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD" as $gid
| "FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY" as $pid
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa)[]? | .id? ]
    | any(. == $tid) ) as $present

# ── (1) MINT the ci_red FIX row ──────────────────────────────────────────────
| if $present then .
  else
    .task_board.ready = ([ {
      id: $tid,
      type: "FIX",
      title: "CI-RED-cdd5fa5a-FIX — CI RED: bun test — emit-pressure-state.test.ts negative-control asserts a property of the DEV HOST (macOS has no `free` binary), not a property of the code, so it fails on every ubuntu-latest CI runner",
      status: "READY",
      priority: "P0",
      blocking: true,
      size: "S",
      zone: "apps/mcp-server/",
      owner: "po",
      next_agent: "dev-mcp-server",
      supervised: false,
      created_at: $now,
      created_by: "po-triage-20260728T2320Z",
      updated_at: $now,
      source: "ci-health-probe signal, dev-team Step 0a drain, cron tick 2026-07-28T23:07Z",
      source_signal_dedup_key: "ci_red:cdd5fa5ad344406298fdf70b59afd71050c30289:bun test",
      check_id: "CI-RED-cdd5fa5a",
      head_sha: "cdd5fa5ad344406298fdf70b59afd71050c30289",
      run_id: 30406497654,
      run_url: "https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/30406497654",
      fingerprint: "29f66987964049714b7ebf9afa0c779a4b3c6414a600e968cab432c4df832d06",
      failing_jobs: ["bun test"],
      failing_file: "apps/mcp-server/src/__tests__/emit-pressure-state.test.ts",
      verdict: "CONFIRMED — root cause identified AND reproduced locally, not inferred",
      not_flaky: "6 consecutive CI runs RED on the `CI` workflow / `bun test` job: c5e7c6747 20:25:47Z, fd5d4565e 20:26:59Z, 64c41a6e0 20:29:56Z, d7330d539 20:30:47Z, 977a71950 20:37:14Z, cdd5fa5ad 22:59:10Z. Last GREEN was 3ec962067 at 17:56:45Z. Same single failing file every run.",
      introduced_by: "98917416a fix(mcp-server): pressure-state host_headroom_mb wrong machine + latent wrong quantity (2026-07-28T18:01:11Z) — the ONLY commit in the last-green..first-red range that touches this test file or emitPressureStateTool.ts, and the commit that ADDED the offending test (git show 98917416a confirms the `[macOS path, REAL — negative control]` block is a `+` line).",
      root_cause: "apps/mcp-server/src/__tests__/emit-pressure-state.test.ts:246-254 runs `computeContainerVmHeadroomMb()` with NO execFn override — i.e. the real production default, which shells out to `free -m` via execSync — and then asserts `expect(result).toBeNull()` UNCONDITIONALLY, with no platform guard. That assertion encodes a property of the author's dev machine (macOS, which has no `free` binary, so execSync throws and the function correctly returns its null sentinel), NOT a property of the code under test. .github/workflows/ci.yml:13 runs this job on `runs-on: ubuntu-latest`, where `free` IS present (procps), so the real default execFn parses the runner's own `available` column and returns a number. The function's behaviour is CORRECT on both platforms — on Linux it is measuring the machine it actually runs on, which is exactly what the field now promises. Only the test's expectation is wrong off-macOS. PROOF (reproduced, not inferred): unmodified checkout, `bun test src/__tests__/emit-pressure-state.test.ts` on this macOS host = 31 pass / 0 fail; the SAME command with a stub `free` shim prepended to PATH (emitting a canned Linux `free -m` table) = 30 pass / 1 fail with `expect(received).toBeNull() / Received: 3410` at emit-pressure-state.test.ts:253 — the exact 1-fail count CI reports for this file.",
      secondary_finding: "scripts/ci-per-file-isolation.sh makes this class of failure undiagnosable from CI alone. Line 50 preserves the failing file's full output to \"$RESULT_DIR/${slug}.log\", but that file is never echoed to stdout and never uploaded as an artifact, and line 96 `rm -rf \"$RESULT_DIR\"` deletes it before the script exits. CI therefore surfaces only `FAILEDFILE: <path>` with zero assertion text — which is why diagnosing this required a local reproduction. Related existing row CI-PERFILE-STRUCTURAL-MITIGATION (backlog, PLAN-ONLY, low) covers item (a) unchecked `rc` and (b) parallelism-vs-vCPU; it does NOT cover this log-destruction defect, so AC-3 below carries it rather than re-minting a third overlapping row.",
      deliverable: "AC-1 (blocking): make the negative-control assertion test the CODE CONTRACT rather than the host. Do NOT simply delete the test — it is the only negative control for root cause (A) of FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY (never substitute a different machine's reading). Recommended shape: keep an unconditional assertion of the platform-independent invariant (the real default execFn never throws, and returns either a positive finite number or null — never a fabricated/zero/NaN value), and gate the strict `toBeNull()` leg behind an explicit runtime probe for `free` being ABSENT rather than behind an assumption about the OS. Whatever shape is chosen must pass on BOTH macOS and ubuntu-latest. AC-2: CI green. AC-3: fix the diagnosability defect in scripts/ci-per-file-isolation.sh — the preserved per-file failure log must reach CI output (echo the captured .log for each failed file before the `rm -rf`, and/or upload $RESULT_DIR as an artifact), so the next ci_red signal carries an assertion, not just a filename.",
      acceptance: "(1) `cd apps/mcp-server && bun test src/__tests__/emit-pressure-state.test.ts` passes on this macOS dev host AND passes with a stub `free` on PATH (the reproduction harness above) — both legs must be shown, a single-plane green is the exact false-green that produced this row. (2) A `CI` workflow run with conclusion=success lands on a head_sha DIFFERENT from cdd5fa5ad344406298fdf70b59afd71050c30289. Local-green does NOT close this row (feedback_ci_green_gate_blocked_by_cloud_chore_divergence). (3) A deliberately-failing test file in a scratch branch or a re-read of the changed script demonstrates the failing file's assertion text now appears in the CI job log.",
      baseline_pass: "DONE only when a CI run with conclusion=success lands on a HEAD SHA different from cdd5fa5ad344406298fdf70b59afd71050c30289. verification_gate from signal: ci_green_on_subsequent_push.",
      verification_gate: "ci_green_on_subsequent_push — done_verified requires `gh run list --branch main --workflow CI --limit 3` showing conclusion=success on a head_sha != cdd5fa5ad. On close, record the fingerprint 29f66987964049714b7ebf9afa0c779a4b3c6414a600e968cab432c4df832d06 in the closing note (feedback_ci_red_close_must_record_fingerprint_else_redrain) or the probe re-drains this signal.",
      files_hint: "apps/mcp-server/src/__tests__/emit-pressure-state.test.ts (lines 246-254, and the file-header comment block at ~lines 205-212 that states the same host assumption) · scripts/ci-per-file-isolation.sh (lines 48-51 capture, line 96 rm -rf) · read-only context: apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts computeContainerVmHeadroomMb() — the SOURCE is not believed defective, do not 'fix' it to make the test pass",
      related: [$pid, "CI-PERFILE-STRUCTURAL-MITIGATION"],
      placement_note: "Minted directly into ready[] LEAD rather than the ci_red contract's default backlog[]. Justification: the contract defaults to backlog because a raw ci_red signal is normally undiagnosed, but this row ships a reproduced root cause and a named 6-line fix site; main has been RED for 6 consecutive pushes (~3h) which blocks the fleet-wide push/CI-green gate; and a backlog row is not dispatchable without a separate promotion step (feedback_po_notebook_mint_never_reaches_orchstate_board). .head deliberately NOT repointed — dev-team owns Step-3 dispatch this tick and a PO head-repoint would double-drive it (feedback_router_manual_drive_overlaps_devteam_loop).",
      note: "This row and FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY (review lane) are the same blast radius: the pressure row's commit introduced this RED. They are NOT folded — the pressure row's acceptance is a two-plane 10%-agreement measurement, this row's gate is CI-green-on-a-new-sha, and collapsing them would let one green mask the other. A qa gate note has been stamped on the pressure row so it cannot be signed off while main is red. Broader lesson for the fix author: the dev's own acceptance evidence for the pressure row (\"macOS path (negative control) — real unmocked call on this dev host (confirmed no free binary) returns null\") is a correct one-host observation that was then frozen into a universal test invariant — feedback_internal_consistency_is_not_corroboration_check_the_other_plane. The dev also ran the full local suite and grepped all 59 baseline fails for pressure/headroom and found none, which is true and still missed this, because the divergent plane is the CI runner's OS, not the local suite."
    } ] + .task_board.ready)
  end

# ── (2) UNBLOCK the stranded P0 peer-index-sweep guard ────────────────────────
| ( [ .task_board.backlog[]? | select(.id == $gid) ] | length ) as $gInBacklog
| if $gInBacklog == 0 then .
  else
    ( [ .task_board.backlog[] | select(.id == $gid) ][0]
      | .status = "READY"
      | .next_agent = "architect"
      | .updated_at = $now
      | .updated_by = "po-triage-20260728T2320Z"
      | .unblocked_at = $now
      | .unblock_note = "PO pre-check unblock 2026-07-28T23:2xZ. This row sat BLOCKED with next_agent=po for 7 days (created 2026-07-21T16:35:12Z) while carrying blocked_reason=null, blocked_on=null and po_question=null — there was no PO decision pending on it, so nothing was ever going to arrive to unblock it. Its own acceptance already assigns the open call to the architect, twice and explicitly: (2) 'the disposition (hard reject vs loud warn) is the architect's call and MUST be justified in writing against fleet blast radius', and (6) 'Architect states explicitly whether this guard covers that case or whether it needs its own row.' Routed to architect. supervised=true retained deliberately: this installs an executable guard on the shared commit path, so a misfiring hard-reject blocks every agent and every human on the repo — architect must produce the disposition + blast-radius justification BEFORE any implementation dispatch. P0 retained: 3 confirmed occurrences and documentation-only enforcement has already failed 3x."
    ) as $grow
    | .task_board.backlog = [ .task_board.backlog[] | select(.id != $gid) ]
    | .task_board.ready = (.task_board.ready + [ $grow ])
  end

# ── (3) STAMP the qa gate note on the pressure review row ─────────────────────
| .task_board.review = [ .task_board.review[]
    | if .id == $pid and (has("qa_gate_note") | not) then
        . + {
          qa_gate_note: "PO GATE 2026-07-28T23:2xZ — DO NOT sign off DONE while main CI is RED. This row's own commit 98917416a introduced the CI RED tracked as CI-RED-cdd5fa5a-FIX: it added an unconditional negative-control assertion (emit-pressure-state.test.ts:246-254) that the real unmocked computeContainerVmHeadroomMb() returns null, which holds only on a macOS host with no `free` binary and fails on ubuntu-latest, where the CI job runs. The review_note's claim '31/31 pass' and 'zero of the 59 baseline fails relate to pressure/headroom' are both TRUE locally and both miss this, because the divergent plane is the CI runner's OS. The SOURCE fix in this row (rename to container_vm_headroom_mb, delete the dead vm_stat branch, injectable execFn, null sentinel) is not itself in question and its two-plane container evidence stands. Sequence: CI-RED-cdd5fa5a-FIX lands and CI goes green on a new sha, THEN verify this row. Re-verify this row's own acceptance against the post-fix tree, not against the 98917416a tree.",
          related: (((.related // []) + ["CI-RED-cdd5fa5a-FIX"]) | unique),
          updated_at: $now,
          updated_by: "po-triage-20260728T2320Z"
        }
      else . end
  ]
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-triage-20260728T2320Z"
