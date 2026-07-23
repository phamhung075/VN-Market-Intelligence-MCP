# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** UC-CDC-P4 (dev-team dispatched)

## Session 2026-07-21 — CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR (router-directed, active-producer premise, ready/P1) — PARTIAL, step (1) re-routed

**Task:** Router's re-ordered scope: (1) atomic-write fix at the telemetry writer (most urgent — a second 0-byte `cowork-team-*.json` landed 53min after the first, live evidence of a recurring truncated write), (2) loud log on drain's unparseable-file skip path, (3) `git rm` the two 0-byte artifacts only after (1) ships.

**Step (1) — STOPPED before editing, re-routed:** Grepped for the actual writer (did not guess from filename). Found: `docs/agents/cowork-team/flow/telemetry.md` Step 6.1 — `cat > docs/signals/cowork-team-${ISO}.json <<EOF`, a bash heredoc inside a flow doc, executed by the cowork-team LLM agent during its own live session. Not a script. Dispatch table (`.claude/skills/dispatch/SKILL.md`): "create/edit/review/maintain agent -> `agent-father`, All agent-file lifecycle"; `docs/policies/docs-organization.md`: `docs/agents/*/flow/` -> "Update via flow guide". Neither `system-map.json` zones nor my own zone_dispatch cover this path — per my own Step-0 mandate ("never write code in their zone") I stopped rather than drive-by-editing it, and annotated the board row so PO/router can re-route `next_agent` to `agent-father`.

**Step (2) — SHIPPED:** `scripts/agents-flow/drain-signals.js` unparseable-JSON catch now `console.error`s an immediate `[drain-signals] WARN unparseable JSON: <file> — <msg> (0-byte or truncated write; ...)`, distinguishable from the pre-existing benign `SKIP non-signal shape` console.log (well-formed JSON, just missing from/type). Previously it only pushed into the batched `report` array (stdout, printed once at end) — indistinguishable in prominence from routine `routed-to-po` lines.

**Verification (RED then GREEN):** Added 6-assertion scenario to `drain-signals.test.js` (0-byte file + benign non-signal file in the same run, asserting the WARN fires for one and not the other, stdout/report line unchanged, file left in place). Ran isolated (scratchpad standalone runner reusing the real `drain-signals.js`) — RED confirmed (no stderr output) before the fix, GREEN after. Could not run the full `node drain-signals.test.js` end-to-end: an EARLIER, unrelated scenario (`makeOrchRefHarness`) crashes the whole process because `scripts/orch-stamp-updated-at.mjs` (added by commit `a5d079663`, same day) isn't in that harness's file-copy list — confirmed pre-existing via `git stash` (crashes identically without my changes) and out of scope for this row. Worked around by running a truncated copy of the real test file through the pre-existing scenarios (15/15 PASS, including the exact-match AC7 golden-stdout regression) plus my new scenario (6/6 PASS) = 21/21 clean, no regression.

**Step (3) — NOT done, correctly:** Router's scope explicitly forbids `git rm`-ing the two 0-byte artifacts before step (1) ships (deleting now just lets the still-truncating writer re-create them within the hour). Both files (`cowork-team-20260721T183028Z.json`, `cowork-team-20260721T192339Z.json`) left untouched, untracked.

**Board:** Annotated `task_board.ready[CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR]` with `developer_progress_20260721T1953` (commit hash, re-route need, step-3 rationale) via `orch-apply.sh`. Did not change status/next_agent myself — that's PO/router's call on a supervised:true row.

**Commit:** `c6e548ca2 fix(signals/drain): loud WARN for unparseable/0-byte inbox files` — explicit pathspecs (`scripts/agents-flow/drain-signals.js scripts/agents-flow/drain-signals.test.js`), no `-A`/`-a`.

**Scope discipline:** Touched only the two drain-signals.js/test.js files, the board-row annotation, this notebook, decision journal. Did not touch `docs/agents/cowork-team/flow/telemetry.md`, did not `git rm` the artifacts, did not widen beyond the router's 3-step scope.

Zone health: `scripts/agents-flow/drain-signals.js` unparseable-skip path now loud | HEALTHY. Writer-side atomic-write fix | BLOCKED, needs `agent-father` re-route.

## Session 2026-07-21 — FIX-DRAIN-TEST-HARNESS-ORCH-HELPER-COPY-LIST (PO-directed, P0 unblocker, cross-service/) — REVIEW

**Task:** `drain-signals.test.js` `makeOrchRefHarness()`'s hardcoded copy list (`['orch-apply.sh','orch-validate.mjs','orch-conservation-check.mjs']`) never got `orch-stamp-updated-at.mjs` added when commit `a5d079663` wired it into `orch-apply.sh` — the sandboxed `orch-apply.sh` called a file that wasn't there, crashing the whole node process at the first `makeOrchRefHarness()` call (line 273), darkening all 13 assertions after it. Same defect the prior CLEAN-COWORK-DISPATCHER session (above) already hit and worked around via a truncated file copy.

**Actions taken:** Replaced the fixed array with `deriveOrchApplyHelpers()` — regex-scans `orch-apply.sh`'s own source (`\$\{REPO_ROOT\}/scripts/<name>.<ext>`) at test-run time and copies whatever it finds, plus `orch-apply.sh` itself. Self-updating: the next helper `orch-apply.sh` grows is picked up automatically, no second list to remember. Throws loud if the regex ever matches 0 (staleness self-detection).

**Verification:** Ran the FULL, untruncated suite end-to-end: 28/28 PASS, 0 fail, exit 0 (previously crashed after assertion 15/28). All 13 previously-dark assertions now execute — 3 FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE gates + 4 ENOBUFS + 6 unparseable-loud (written last session against a truncated copy, never actually run until now) — all PASS, no regression found in any of them.

**Board:** `task_board.ready[FIX-DRAIN-TEST-HARNESS-ORCH-HELPER-COPY-LIST]` → `review`, `dev_result`+`dev_completed_at` set, via `orch-apply.sh`.

**Scope discipline:** Touched only `drain-signals.test.js`, board row, this notebook, decision journal. Did not touch `orch-apply.sh`/other helper scripts (no behavior change needed there) — root-cause fix confined to the test harness.

Zone health: `scripts/agents-flow/drain-signals.test.js` orch-helper sandbox copy — now derives from source instead of a hand-maintained list | HEALTHY

## Session 2026-07-23 — UC-CDC-P4 (dev-team dispatched, cowork-dispatcher-cron-P4, cross-service/) — REVIEW

**Task:** `spawn-fanout.md` Step 5 fired ALL `WON_SLOTS` unconditionally in one message block ("no sequential gating") — root cause of a prior load-205 host-starvation incident (memory `feedback_overparallel_fanout_host_starvation`). PO rescope (architecture brief 2026-07-12 #cowork-dispatcher-cron-P4) asked for a headroom-gated bounded batcher, thresholds SSOT'd not hardcoded.

**Actions taken:** New Step 5.1 computes `MAX_PARALLEL` from `cadence-policy.json` new `_fanout` key (5 thresholds), gated on `host_headroom_mb` (Step 4.2's `PRESSURE_STATE`, fail-safe degraded when legacy/stale) OR `uptime` 1-min load vs `sysctl -n hw.ncpu`. New Step 5.2 batches `WON_SLOTS` (guaranteed slots fill batch 1), fires each batch as one `run_in_background=true` block (BGFAN-1 unchanged within a batch), and waits for completion/load re-probe between batches capped at `batch_wait_max_seconds` (degrades on timeout, never stalls past the 600s token TTL/15-min tick — naive back-to-back batching of background spawns would otherwise be a no-op). Added the carve-out to `agent-chaining-protocol.md` § Background Spawn Mandate. Corrected spawn-fanout.md's stale size-justification header (108L claimed vs 227L actual pre-edit drift) to the real post-edit count.

**Verification:** `cadence-policy.json` jq-validated. `DWF-phase1-cadence.test.ts` (only test touching cadence-policy.js) re-run 51/51 GREEN post `_fanout` addition — no schema assertion broke. Docs/config-only, no `.ts` touched, main-only (no branch, per CLAUDE.md).

**Board:** `task_board.in_progress[UC-CDC-P4]` → review, via `orch-apply.sh`.

**Scope discipline:** Touched `spawn-fanout.md`, `cadence-policy.json`, `agent-chaining-protocol.md`, `WORK.md`, this notebook, decision journal. Flagged not fixed: `graphify-out/graph.json` is 2 months stale (last run 2026-05-23) — a scoped `--update` would re-extract that whole accumulated backlog, disproportionate to this 3-file fix; left for PO/router.

Zone health: `docs/agents/cowork-team/flow/spawn-fanout.md` Step 5 fan-out — now headroom/load-bounded, thresholds SSOT | HEALTHY
