# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY

## Session 2026-07-29 — FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED — REVIEW

**Task:** Router dispatch, P1, cross-service/. Every counter in the auditor's `[OUTPUT-CONTRACT]` line was narrated, not derived — failing BOTH directions same day (over-report ×2: narrated N, wrote 0; under-report: narrated 0, wrote 1 — a `SKIP-dedup` marker, which still carries `id=`, misread as "nothing emitted"). Row's own `root_cause`/acceptance(2) named a nonexistent path (`scripts/agents-flow/emit-audit-signal.sh`) — verified via `ls` before reading anything; real script is `scripts/emit-audit-signal.sh`.

**Actions taken:** New `scripts/emit-dashboard-row.sh` — actuator for `docs/data/DASHBOARD.md` (the LIVE dashboard, confirmed vs the stale `docs/handoffs/DASHBOARD.md` phantom UC-ASL-P6 purges; also confirmed the `.claude/skills/signal-dashboard/` pointer main.md used was itself wrong — that skill governs `.signal_queue.rows[]`, not this file): tmp+mv atomic append, self-contained commit-mutex guard, MANDATORY POST-WRITE read-back (`grep -qF "signal <id>"`) failing loud to BUG on miss. New `scripts/audit-output-contract.sh` — mechanically parses `[emit-signal]`/`[emit-dashboard]`/`[post-agent-signal]` markers accumulated into a per-cycle `$MARKERS_FILE` (introduced at `flow/main.md` §Step 0d) instead of hand-composed counts; adds an independent `.signal_queue.rows[]` cross-check (the old check was vacuous — both operands narrated by the same agent from the same marker set) plus symmetric violations for `dashboard_rows==0` and RETURN-headline/`NEXT`-token consistency. Wired into all 4 WARN/CRITICAL emit sites + 2 bare `post_agent_signal` sites + `page-freshness.md`'s standard-line portion; D-BCTC-EVAL/D-IMPROVE stay `--e3-only` unchanged.

**Backfill decision (acceptance 5):** did NOT backfill the "still-missing 06:08Z A-21" DASHBOARD row — its signal_queue row (`sys-20260729T060929-39de`) was subsequently RETRACTED by PO as an out-of-spec emission contradicting the auditor's own `crashRestarts>=2` threshold. Backfilling now would resurrect a withdrawn finding. Real crash owned by `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`/`FIX-MCP-MEMORY-CODE-LEAK`; counting-window bug by `FIX-A21-CRASH-WINDOW-PREDECESSOR-BOUND-FALSE-NEGATIVE` (both untouched).

**Verification:** `scripts/emit-dashboard-row.test.sh` 32/32, `scripts/audit-output-contract.test.sh` 35/35 (both prove a narrated-but-unwritten count cannot pass — AC-4). No regressions: `scripts/emit-audit-signal.test.sh` 49/49 (unchanged). `shellcheck -x` clean on both new scripts. No TS touched.

**Board:** update via `orch-apply.sh` — `IN_PROGRESS` → `review` (`next_agent: qa`).

Zone health: no drift detected.

## Session 2026-07-29 — FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE — REVIEW

**Task:** BOUNDED-1 auto-pickup, `scripts/` (outside all dev-* zones). Router-diagnosed: D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (commit `ed01c5c1b`) flipped `orch-validate.mjs` Stage-1b from warn to hard-fail; broke `orch-cold-evict.sh`'s `--exclude-ids` safety valve — an excluded terminal-status row stays in a non-terminal lane by design, which the new hard-fail rejects, aborting the WHOLE eviction run.

**Findings:** Root cause confirmed exactly as diagnosed. `LANE_ALLOWED_STATUSES` (orchStateSchema.ts) admits NO terminal status in any of backlog/review/qa/in_progress/ready — any terminal-status row parked there (excluded or not) is unconditionally incoherent by construction. Adjacent discovery, flagged not fixed (0 live occurrences, out of this row's stated scope): the referential-dependency eviction guard (2026-07-28) can hit the identical latent shape for a different reason (live `depends_on` reference instead of `--exclude-ids`).

**Actions taken:** `build_hot_temp()` now relabels an excluded-and-terminal row's `.status` to a lane-coherent status (new `EXCLUDE_RELABEL_STATUS` map, default BLOCKED for backlog/review/in_progress, QA/READY for qa/ready — mirrors `LANE_ALLOWED_STATUSES`) before the SHG-3 write-gate runs, stamping `verify_note` with the original status + timestamp. Zero changes to `orch-validate.mjs`/`orchStateSchema.ts` — chose this over teaching the shared validator an exemption list, which would widen a bypass mechanism's blast radius across every orch-state.json writer and walk back D5's "zero exceptions" intent. `docs/policies/dev-standards.md` CANONICAL block updated.

**Verification:** `scripts/test/orch-cold-evict-tests.sh` 33/41 → 41/41 (0 regressions). Negative-path proof: a fresh genuinely-incoherent fixture (unrelated to `--exclude-ids`) still exits 2 via `orch-validate.mjs` — hard-fail intact, checker untouched. `orchStateSchema.test.ts` 104/104, `dev-team-tick-preflight.test.sh` 98/98 (both shell out to the real script) unchanged. `shellcheck -x` clean.

**Board:** `task_board.in_progress[FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE]` → `review` (`next_agent: qa`), `.head` synced to idle, via `orch-apply.sh`.

Zone health: no drift detected.

## Session 2026-07-29 — FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY — REVIEW

**Task:** BOUNDED-1 auto-pickup, `cross-service/` (outside all dev-* zones), P1, sprint INFRA-AUDIT. `auditor-tier1-probe.sh`'s mem/launchd ACK ledgers had two stacked defects: (1) `tracked_by` read by nothing — an ACK could never expire past its tracked fix's DONE_VERIFIED; (2) the mem ACK predicate was pure `pct>=85`, no absolute-headroom floor, so 85.01% and 99.99% suppressed identically. PO measured live consequence: rag-service ACK-suppressed at 97.11% (22.2MiB free, falling) while Tier-1 reported ALL_GREEN.

**Actions taken:** (a) `MEM_FLOOR_MIB=40` + `_mem_headroom_mib()` (cap*(100-pct)/100, `LC_ALL=C LC_NUMERIC=C` pinned — caught the SAME comma-decimal awk bug already documented in `verify-a30-mcp-memory-reclamation.sh`, live on this box's fr_FR locale). Calibrated 2x the ~20MiB measured rag-service `compact()` burst (`FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP`), not the cap, per PO's calibration note — pdf-extractor's own (larger, undiagnosed, no ack entry yet) burst doesn't constrain it today. (b) New shared `_task_status_in_orch_state()` — resolves tracked_by against every task_board lane (8 array lanes + active/closed_sprints nested); ABSENT or DONE_VERIFIED = STALE ACK. Fail-loud (rc=2) on missing/unparseable orch-state.json, never `2>/dev/null || true`. (c) Wired into both `_mem_container_acked` and `_launchd_label_acked` (same dead-field defect, 3 live launchd entries), per-entry — one stale sibling ack doesn't kill a live one.

**Verification:** New T44-T53 (26 assertions, 167/167 total, was 141/141) — floor boundary either side of 40MiB, DONE_VERIFIED + ABSENT staleness both arms, missing-file + malformed-JSON fail-loud both arms, mixed live+stale sibling. Added `ORCH_STATE_PATH` test seam — proved it was MISSING first: T36/T40 were silently resolving against the REAL live board pre-fix, passing only by coincidence (those 3 ids happen non-terminal today). RED via `git stash`: old script + new tests crash `unbound variable: ORCH_STATE`. `shellcheck` clean (2 pre-existing warnings, unchanged). AC6 raw evidence: real script vs live fleet (`date -u` 2026-07-29T12:09:09Z) — verdict FAILURE, `rag-service(99.22%, 6.0MiB-free, BELOW-FLOOR(floor=40MiB))`.

**Operational consequence (flagged, not fixed):** shipping this flips the LIVE rag-service ACK from suppressed to FAILURE immediately — real headroom is ~6-11MiB now. INTENDED per AC2, not a regression. Updated `docs/data/auditor-launchd-ack.json` `_comment`/`_comment_acked_memory` (staleness now code-enforced) + a `floor_enforcement_20260729` field on the rag-service entry. Did not touch rag-service's memory (out of `does_not_cover` scope) or widen the floor to silence the new FAILURE.

**Board:** `task_board.in_progress[FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY]` → `review` (`next_agent: qa`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** clean — 2 new helper functions + 1 constant, all directly load-bearing for AC1-3, no speculative abstraction (Q1-Q4 all NO).

Zone health: no drift detected.
