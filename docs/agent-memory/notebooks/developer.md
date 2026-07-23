# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** UC-CDC-P4 (QA CHANGES_REQUESTED fix)

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

## Session 2026-07-23 — UC-CDC-P4 (QA CHANGES_REQUESTED redispatch #1, cross-service/) — REVIEW

**Task:** QA AC1 blocking: Step 5.1's missing/unparseable-`cadence-policy.json` branch inline-synthesized the ENTIRE `_fanout` object (`{max_parallel_default:4, max_parallel_degraded:2, headroom_floor_mb:1500, load_per_core_factor:2, batch_wait_max_seconds:120}`) as a fallback — a shadow copy of the SSOT, violating "ZERO hardcoded fan-out numbers" and contradicting the prior commit/WORK.md claim. AC2–AC6 already PASSED, untouched.

**Actions taken:** Replaced the literal-object fallback with a `FANOUT_MODE="degraded_serial"` downgrade + `MAX_PARALLEL=1` single conservative sentinel (not read from/standing in for any `_fanout` key) — mirrors pressure-read.md Step 4.2's proven missing-policy MODE-downgrade pattern (no numeric synthesis). Headroom/load computation is skipped entirely in that mode (no thresholds exist to gate against) rather than partially reconstructed. Step 5.2's inter-batch wait gained a matching `if FANOUT_MODE == "degraded_serial"` branch — it previously dereferenced `FANOUT_POLICY.batch_wait_max_seconds` unconditionally, which would now crash on an undefined object; degraded_serial instead waits unconditionally for the single spawn's completion (MAX_PARALLEL=1 already bounds concurrency, no timeout/re-probe math needed).

**Verification:** `bun test src/__tests__/DWF-phase1-cadence.test.ts` re-run (not trusted from prior run) — 51 pass / 0 fail, 183 expect() calls. `grep` confirms zero remaining inline `_fanout` numeric literals anywhere in spawn-fanout.md — all 5 keys now referenced by name only (`FANOUT_POLICY.<key>`), inside the `else` (policy-loaded) branch exclusively.

**Board:** `task_board.in_progress[UC-CDC-P4]` → `review`, `qa_blocking_issues` annotated resolved, via `orch-apply.sh`.

**Scope discipline:** Touched only `spawn-fanout.md` (Step 5.1/5.2 + size-justification header), this notebook, decision journal. Did NOT re-touch `cadence-policy.json` `_fanout` values, batch semantics, the health-driven DEGRADED fail-safe branch, the test file, or `agent-chaining-protocol.md` per redispatch scope.

Zone health: `docs/agents/cowork-team/flow/spawn-fanout.md` — no `_fanout` shadow copy remains; missing-policy path now mode-downgrades like pressure-read.md | HEALTHY
