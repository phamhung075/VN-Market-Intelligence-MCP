# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP

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

## Session 2026-07-29 — FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP — REVIEW

**Task:** BOUNDED-1 auto-pickup, `docs/agents/dev-team/flow/` (shared SSOT flow-doc/tooling, no `apps/<service>/` zone match — generic developer). Router-diagnosed gap: once pm decomposes an epic-wrapper backlog row and `.head` resets to idle, nothing ever re-visits it once its children[] all finish — `BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP` sat open for hours post-2026-07-10 despite all 11 children reaching `DONE_VERIFIED`, caught only by chance during manual inspection.

**Actions taken:** New `scripts/devteam-wrapper-autoclose.jq` (single-script sweep — candidates already live in `ready[]`/`in_progress[]`, no promote half needed, mirrors `devteam-backlog-claim-ready-lane-consumer.jq`'s own shape) + 4 new shared predicates in `scripts/lib/devteam-eligibility.jq` (`all_children_terminal`, `is_terminal_task_status`, `normalize_task_status`, `has_hold_reason`): sweeps both source lanes for `is_epic_wrapper` rows whose every child resolves (hot lane OR cold-archived `docs/data/orch/archive/YYYY-MM.json`, case/separator-normalized) to orchStateSchema.ts's TERMINAL_SET, not `hold_reason`-held, into `review[]` (status REVIEW, `next_agent` = resolved owner, `.head`(b)-conditional sync per CANONICAL:SSOT-STATUSFLIP-LANEMOVE). New Step 4.4 in `post-cycle.md` (after 4.3, before 4.5) invokes it then dispatcher-wraps a per-row `task:<id>` claim + `Agent()` spawn of the resolved next_agent (usually pm) — a real auto-dispatch, not just a lane move (signal_queue was considered and rejected — its `to` vocabulary is cross-team, not an intra-dev-team dispatch channel). 2 new bullets in `main.md` § Reusable Scripts; both files' size-justification headers updated.

**Verification:** New `scripts/audits/devteam-wrapper-autoclose-verify.sh` — 10/10 synthetic ACs PASS (all-terminal hot+cold sweep, non-terminal-child block, case/separator-drift normalization, missing-child conservative-skip, hold_reason guard, non-wrapper no-op passthrough, `.head` sync positive+negative, `in_progress[]` source lane, idempotency). Caught + fixed a real jq `.`-rescoping bug (`$arr | index(.key)` evaluates `.key` against `$arr` itself, not the piped to_entries object) via a minimal `jq -n` repro before it reached the fixture layer. Scratch-copy end-to-end run against a live `orch-state.json` copy + `scripts/orch-state-validate.sh` (Zod) PASS; unmodified live-data dry run confirmed a true no-op today (zero wrapper rows currently in `ready[]`/`in_progress[]`). Re-ran the 3 pre-existing `devteam-eligibility.jq`-dependent regression suites (`devteam-dispatch-gate-satisfiability.sh`, `devteam-bounded1-detail-disposition-gate-verify.sh`, `devteam-bounded1-prose-sequencing-gate-verify.sh`) — all rc=0, zero regressions from the shared-lib append.

**Board:** `task_board.in_progress[FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP]` → `review` (`next_agent: qa`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** clean — 1 new jq script + 1 new verifier + 4 append-only predicates on the existing shared lib, no new abstraction layer, no speculative generality (Q1-Q4 all NO).

Zone health: no drift detected.
