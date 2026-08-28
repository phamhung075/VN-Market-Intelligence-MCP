# Developer Standards

<!-- size-justification: 140L — unified developer reference: code search tools, test patterns, DDD rules, TypeScript conventions, naming. All read together at sprint start to set context; splitting into tool-guide + test-patterns + naming-rules fragments the unified "how we code" standard. SCRIPT-PERSIST 2026-06-07: Script Persistence section incl. maintenance clause (+15L, user directive). SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 2026-07-04: CANONICAL pointer for the dev-team idle-capacity backlog pickup scripts (+11L). PUSH-AUTONOMY-1 2026-07-14: Autonomous Push Gate section (+16L, user directive — push on 100% green, no user action, post-push real-data verify task). FIX-CMH-OBSOLETE-FILE-CLEANUP 2026-07-20: CANONICAL pointer for scripts/audits/clean-obsolete-files.sh (+8L). BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA 2026-07-22 (qa): pinned the "targeted/merge-gate suite" reading against the standing FIX-MCP-SUITE-HEALTH-BASELINE full-suite red so it stops being re-litigated per push (+3L). UC-MDH-P3 2026-07-23: CANONICAL pointer for scripts/agents-flow/memory-prune-sweep.sh (+14L). UC-MDH-P4 2026-07-23: CANONICAL pointer for scripts/agents-flow/decision-journal-archive.sh (+15L). UC-GCP-P8 2026-07-23: CANONICAL pointer for scripts/agents-flow/stranded-state-sweep.sh (+13L). TE-T17 2026-07-23: CANONICAL pointer for scripts/agents-flow/notebook-linecap-sweep.sh (+13L). TE-T28 2026-07-23: CANONICAL pointer for scripts/gen-tool-list-stubs.py (+15L). TE-T31 2026-07-23: CANONICAL pointer for scripts/gen-tools-index.sh (+14L). TE-T33 2026-07-23: CANONICAL pointer for scripts/agents-flow/cold-archive-sweep.sh (+18L). FFLOW-STALE-0723-B-RECHECK-HARNESS 2026-07-23: CANONICAL pointer for scripts/check-foreign-flow-freshness.sh (+16L). FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK 2026-07-28: CANONICAL pointer for scripts/git-hooks/pre-commit (+15L). FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 2026-07-29: CANONICAL sole-writer + shape invariant for docs/data/auditor-tier{1,2,3}-last-healthy.json, cited from both writers (+21L). FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS-followup 2026-07-29: CANONICAL pointer for scripts/audits/verify-notebook-immutability-gate.sh (+9L). FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29: CANONICAL pointers for scripts/emit-dashboard-row.sh + scripts/audit-output-contract.sh (+24L). FACTORY-GUARD-CI-SIZELINT-IMPL 2026-07-29: CANONICAL pointer for scripts/audits/size-lint-justification.sh (+16L). FACTORY-GUARD-CI-METRICMASK-IMPL 2026-07-29: CANONICAL pointer for scripts/audits/metric-mask-lint.sh (+18L). FACTORY-GUARD-CI-TSBOUNDARIES-IMPL 2026-07-29: CANONICAL pointer for the 3 new TS eslint CI jobs (mcp-server/news-fetch/frontend) + news-fetch-go-lint (+22L). FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/composition-root-logic-gate.go + the composition-root-logic-gate CI job (+30L). FACTORY-GUARD-CI-DEADCODE-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/dead-code-gate.sh + the dead-code-gate CI job, incl. the check-3 twin-scaffold deviation from the board-row note's literal phrasing (news-fetch false-positive) (+35L). FACTORY-GUARD-CI-NOHARDCODE-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/no-hardcode-allowlist-scan.sh + the no-hardcode-allowlist-scan CI job, incl. the priceBackfillService.ts:224 verify-live deviation (documented test-fixture sentinel, annotated not fixed) (+38L). FACTORY-GUARD-CI-SHAREDPKG-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/shared-package-import-check.sh + the shared-package-import-check CI job, incl. baseline/ratchet seeding of the 3 current phantom packages and the advisory-only symbol-collision check (+20L). FACTORY-GUARD-CI-RAWVERIFY-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/rebuild-raw-verify-check.sh + the pre-push hook wiring + the rebuild-raw-verify-hook CI job, incl. the colocated-test-file verify-live exclusion deviation, plus a PUSH-AUTONOMY-1 §5 cross-reference (+56L). FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH 2026-07-30: updated the stranded-state-sweep.sh CANONICAL pointer for the UNKNOWN-bucket age gate + the 4 new OWNED-ELSEWHERE routine-output classes + the content-gated agent-model-switch OWNED-ELSEWHERE check (+6L). FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE 2026-07-30: CANONICAL pointer for the Design-Router Sweep (DRS) promote+claim script pair (+18L). FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD 2026-07-30: new CANONICAL entry AUD-CP-1 — fleet-wide caller-instruction precedence over spec-internal thresholds/predicates, designated-parameter vs spec-internal-threshold distinction, mandatory CONTRACT-CONTRADICTION RETURN-block line (+34L). FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER 2026-07-30: new CANONICAL entry — Supervised-Lane Sweep (SLS) claim's new `ready[]` FALLBACK path for unstamped supervised+plan_only rows, inserted after the existing DRS entry (+23L). FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS 2026-08-01: extended the orch-validate CANONICAL block with Stage 1f (`checkDependsDivergence()` hard fail) + Stage 1g (`checkMissingDependencyReport()` non-fatal report) (+11L). FIX-SWEEPGUARD-SAMEFILE-HUNK-PATHSPEC-ONLY-SEMANTICS-NONGOAL-AND-DETECTOR 2026-08-01: extended the Commit-path peer-index sweep guard CANONICAL block with a same-file-differently-staged-hunk NON-GOAL note + the new non-blocking `_detect_samefile_pathspec_only_divergence` detector pointer (+16L). NOTE (pre-existing, not from this task): this header's own base "140L" figure has not tracked the file's true cumulative growth for many entries now (actual line count far exceeds 140 + the sum of the deltas listed here) — a compounding self-maintenance drift, flagged for a separate cleanup, not fixed here. UC-CRITIC-HOOKS-ENFORCEMENT 2026-08-06: updated the orch-state Claude hook gate CANONICAL block's exit-code line + extended the Context-bloat backstop regression test CANONICAL block (T5) + new CANONICAL block for scripts/agents-flow/lib/hook-guard.sh (+31L). FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED 2026-08-06: new CANONICAL block for the market.db journal-mode runtime cron + source CI guardrail pair, incl. the cron-standalone-team wiring pointers and the coordinationStore.ts negative-control window calibration (+38L). FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR 2026-08-06: new CANONICAL block for scripts/notebook-compose.sh (the compose-step actuator this recurring-bug escalation, prior_warns=7, exists to close), incl. the shared scripts/agents-flow/lib/notebook-section-direction.sh extraction (also re-wired into scripts/agents-flow/notebook-auto-prune.sh, zero behavior change) and the AC-4 negative-control test pointer (+27L). FIX-RAWVERIFY-ATTEST-ERE-HYPHENATED-PAST-TENSE-FALSE-BLOCK 2026-08-07: updated the Rebuild-raw-verify attestation CANONICAL block's ATTEST_ERE description — post-ship defect fix, hyphenated past tense ("RAW-verified") was invisible to the old literal-list regex (+5L). FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE 2026-08-08: new CANONICAL block for scripts/lib/output-contract-invariant.sh (shared [OUTPUT-CONTRACT] extraction + AC-2 arithmetic invariant, sourced by both detect-analysis-only-exit.sh's new claim-vs-plane check and auditor-notebook-commit.sh's new AC-4 pre-commit refusal) (+22L). FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS 2026-08-09: new CANONICAL block, inserted after the Design-Router Sweep entry — pointer for the Idle-Tick Rotation Selection aged round-robin + its new AC-1/AC-4 rotation-fairness/gate-firing test extension on scripts/audits/devteam-dispatch-gate-satisfiability.sh, incl. the shared-lib (rotation_selected($doc)/devteam-idle-chain-stamp.jq) 5-vs-6-id staleness note (+2L). FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE 2026-08-09: extended the Orch-state conservation circuit-breaker CANONICAL block with a new "durable pending-triage-inbox dimension" paragraph (signal_total() now also counts dev_team_idle_chain.pending_triage_inbox — closes the same silent-wipe blind spot the original guard closed for signal_queue.rows[]) + new CANONICAL block, inserted after the Idle-Tick Rotation Selection entry, for the new scripts/agents-flow/drain-signals-durable.test.js AC-2 negative-control harness (46/46 assertions: append-success/short-circuit-retains/triage-clear/concurrent-append-survives/append-fails-with-retry-recovery + backward-compat + the conservation-guard-extension coverage) (+52L). TICK-WU-0-TELEMETRY-LIB 2026-08-12: new CANONICAL block, inserted after the Hook-enforcement crash discriminator entry and before the Fleet worktree push backstop entry, for scripts/agents-flow/lib/tick-telemetry.sh (jq-only, no python3, shared usage-telemetry emit-helper for the 3 tick-preflight/probe cron scripts — WU-1/2/3 wiring is separately tracked and gated on this landing) — pointer + field-set/rotation/root-resolution summary + the AC-11 verdict_bytes-is-a-lower-bound and elapsed_ms-resolution-degrade caveats + test coverage pointer (+61L). FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR 2026-08-14: marked the 2026-08-09 "durable pending-triage-inbox dimension" paragraph SUPERSEDED (the magnitude-folding it described was REMOVED — a drain-to-zero queue is the wrong shape for a magnitude floor) + new CANONICAL entry "Inbox row-identity dimension" describing its replacement (ORCH_APPLY_DECLARED_INBOX_TRIAGED, mirrors the existing signal_queue.rows[] row-identity guard one level down) + updated the conservation circuit-breaker block's own exit-code doc lines to name both row-identity dimensions (+~28L net, exact count not recomputed — this file's own base-140L drift is a standing pre-existing note, not fixed here). FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE 2026-08-14 (piece 1/2, scripts/ only — the flow-doc call-site 2-arg edit is agent-father's separate follow-up): extended the OUTPUT-CONTRACT CANONICAL block with the new §2b plane-crosscheck gate's 3 functions + updated the stale "no MCP-dependent test harness" note (a persisted `scripts/auditor-notebook-commit.test.sh` now exists, 24 assertions incl. the AC-4 before/after synthetic-replay pair) (+18L). FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT 2026-08-15 (steps 1/2/4/5 of the brief's 5-step decomposition — step 3, the supervised live LANES=backlog,ready,review migration run, deliberately NOT done this cycle, left for the supervised go-ahead): updated the gated-write-wrapper CANONICAL block's EXIT CODES + owning-task lines for the new Stage 2.5 row prose-ceiling guard; new CANONICAL block for scripts/orch-row-prose-ceiling-check.mjs (mirrors the conservation-check block's structure); extended the Backlog stub migration CANONICAL block with the LANES/--lane multi-lane extension + the F-3 cold-merge data-loss prerequisite fix; new informational convention note on append-vs-mint-new-field-name prose hygiene (+~75L). FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET 2026-08-15 (same-day regression fix): extended the row prose-ceiling guard CANONICAL block's test-coverage list (+SECONDARY-DRAIN-STAMP) + new paragraph documenting the `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target`/`dispatch_target` STRUCTURAL_FIELDS addition and why the fix scope excludes the other 5 claim scripts (+~20L). FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION 2026-08-15 (P0, unblocks the LANES migration + the 41 over-prose-ceiling rows' po_goahead ratification path): extended the Backlog stub migration CANONICAL block with the F-4 (array-shape merge crash, real live-data shape) + F-5 (po_goahead_* silently stripped by STUB_FIELDS whitelist) fix write-up, incl. the ARRAY-vs-OBJECT cold-shape decision + why, and updated the lazy-load one-liner to array-indexing form (+~30L). FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER 2026-08-22: new CANONICAL block, inserted after the Rebuild-raw-verify attestation CI guardrail entry, documenting `scripts/git-hooks/pre-push`'s new unconditional `run_doc_shaped_checks()` block (size-lint + task-claim-owner-session-lint + tool-registry-parity now run on EVERY push, not gated by `CODE_TOUCHING_REGEX` — closes the root mechanism behind 2 of 3 independent CI-red incidents in the 2026-08-01..05 window landing on docs/-excluded paths) + the new `scripts/git-hooks/pre-push.test.sh` regression suite pointer (+~35L). FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT 2026-08-24: new CANONICAL block, inserted after the Auditor heartbeat sole-writer entry, for `docs/data/auditor-tier1-spawn-debounce.json` (per-signature Tier-1 spawn debounce — sole-writer/shape/field-contract/signature-contract/window, verdict NEVER touched per AC-3) (+~45L). FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ 2026-08-24: updated the gated-write-wrapper CANONICAL block's exit-2/exit-1 doc lines (CAS caller-supplied baseline + lane-placement dimension) + two new CANONICAL blocks inserted after the Inbox row-identity dimension entry and before the row-level prose-ceiling guard entry: "Lane-placement dimension" (AC-3 — `undeclaredBackwardLaneMoves()`, tolerates 1 undeclared backward move per write, hard-rejects 2+, `ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES` escape hatch) and "CAS caller-supplied baseline" (AC-1/AC-2 — `ORCH_APPLY_CALLER_BASELINE_HASH`/`_MTIME`, byte-identical no-baseline fallback, AC-4 migration tracked as a follow-up, zero callers migrated yet) (+~50L). FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD 2026-08-25: new CANONICAL block, inserted before the Obsolete-file cleanup entry, for `scripts/lib/resolve-task-lane-by-id.jq` (shared task-board lane/status resolver, deliberate path deviation from the owning architecture brief's literal `scripts/agents-flow/` suggestion — see block for evidence) (+~15L). FIX-AUDITOR-NOTEBOOK-COMPOSE-COMMITMSG-MARKER-GATE 2026-08-26: new CANONICAL block, inserted after the Notebook compose actuator entry and before the DASHBOARD.md append actuator entry, for the repo's first `commit-msg` git hook (`scripts/git-hooks/commit-msg`, PILOT-SCOPED to `docs/agent-memory/notebooks/system-auditor.md`) — the mechanical forcing function checking the proposed commit MESSAGE for a `[notebook-compose OK|WARN ...]` marker, incl. why `commit-msg` not `pre-commit` (the latter cannot see the proposed message; `.git/COMMIT_EDITMSG` is a trap, holds the PREVIOUS commit's subject), the warn-by-default + `notebook-compose-marker-allow:` escape-hatch convention, and a documented regex fix found during implementation (the brief's literal marker regex failed to match the real nested-bracket shape, live commit `efe62d83d`) (+~25L). HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD 2026-08-28: new CANONICAL block for scripts/agents-flow/orch-bash-direct-write-guard.mjs (inserted after the Orch-state Claude hook gate entry) — Stage-1 observe-only direct-bypass Bash heuristic guard + its git-tracked would-block log + the user/config-admin registration note (+~18L). -->

## Script Persistence — scripts/, never /tmp

Any script useful for the work or reusable later MUST be saved to `scripts/` — NEVER left in `/tmp` (user directive 2026-06-07; precedent: `scripts/agents-flow/drain-signals.js`).

| Script kind | Location |
|---|---|
| Agent-flow helper (drain, match-slots, cadence…) | `scripts/agents-flow/` |
| Audit / one-shot verification worth replaying | `scripts/audits/` |
| Migration | `scripts/migrations/` |
| CI per-file isolation runner (deterministic, order-independent gate) | `scripts/ci-per-file-isolation.sh [P]` — owning brief: `docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md § P2-4` |
| Anything else reusable | `scripts/` |

After saving: **update the owning flow/skill doc with a canonical pointer** (`node scripts/...` usage line) so future agents discover it instead of rewriting it. Pattern: `docs/agents/dev-team/flow/drain-signals.md` §0a-1 "CANONICAL SCRIPT".

**CANONICAL: Cron-marker liveness probe (TASK-CRON-LIVENESS-PROBE-SCRIPT / FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE)**
```bash
bash scripts/agents-flow/cron-marker-liveness-probe.sh --family cowork-team|detect-loop|standalone-team
# One line of JSON on stdout: {verdict, family, marker_owner_session, evidence:{o1,o2,o3}, recommended_action}
#   verdict ∈ DEAD | LIVE | UNKNOWN | NO_MARKER | SELF | ERROR
# Exit code follows the tick-preflight idiom: 0 = terminal (LIVE/SELF, no LLM read needed);
#   1 = LLM continues (DEAD/UNKNOWN/NO_MARKER/ERROR).
# Owning flow docs (agent-father's zone, wired by TASK-CRON-SKILLMD-PROBE-WIRING):
#   .claude/skills/cron-cowork-team/SKILL.md, cron-detect-loop/SKILL.md, cron-standalone-team/SKILL.md — Step 1b.1
# Brief: docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md
# Gate:  bash scripts/agents-flow/cron-marker-liveness-probe.test.sh  (87 checks, fully mocked)
```
WHY IT EXISTS: the three `/cron-*` re-arm skills share one Step 1b.1 guard shape with three
different arbitrary `orphan_threshold_seconds`, and BOTH of its oracles read bookkeeping the dying
session wrote about itself — `session-presence` is a participation signal (measured 2 roster rows vs
5 live `claude` PIDs) and `task_force_release_orphan` reads `heartbeat_at` on the same marker row.
It answers "was alive T ago", never "is alive". One defect, two faces: false-LIVE at T=7200
(8 h 10 m cowork-dispatcher outage, 2026-08-23) and false-DEAD at T=120 (standalone double-arm,
confirmed 2x). **No threshold value fixes this** — do not "fix" it by tuning a number.

ORACLE RANKING, DO NOT REORDER: **O1** recorded PID absent from `ps`, or present with a different
`(pid, start_epoch, comm)` triple → soundly proves DEAD, no blind window. **O2** transcript `.jsonl`
mtime inside the window → proves LIVE only. **O3** `heartbeat_age`/presence-roster → proves neither,
emitted as corroboration and never allowed to decide. O1 is first because the dead session's
transcript was 16 s old at the incident instant, so any O2-primary design returns LIVE and
reproduces the outage with a smaller constant. The `UNKNOWN` third branch is mandatory: a two-branch
LIVE/DEAD shape must guess on ambiguity, and it guesses LIVE.

`has_fire_election_mutex` is ONE table inside the probe script, not three numbers in three docs —
`cowork-team`/`detect-loop` `true` (both tick-preflights claim a per-tick `cron:` lock, so a second
armed copy loses the election and fans out nothing) → `on_unknown=steal`; `standalone-team` `false`
(verified: no cross-session mutex in any of its four crons) → `on_unknown=defer` + alarm. Standalone's
`defer` is a narrowed temporary residual, not a resting state — the durable fix is
`FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX`, deliberately not a blocker.

NO BRANCH TERMINATES SILENTLY: `UNKNOWN`/`DEFER` emit a BUG telegram **and** a `docs/signals/` row
(`type: cron_marker_liveness_unknown`, `to: claude-manager-helper`), deduped on
`(family, marker_owner_session)` via the existing open-signal convention plus a
`PROBE_ALARM_COOLDOWN_S` (default 6 h) processed-signal cooldown. The 8 h 10 m cost came from the
wrong answer being *unobservable*, not only from it being wrong.

SIX MEASURED TRAPS, each named in a comment at its own site and each covered by a static assertion in
the gate: (1) `LC_ALL=C` on BOTH `ps -o lstart=` and `date -j -f` — this host is CEST with
`LC_TIME=fr_FR.UTF-8` and prints `Dim 23 aoû …`; (2) macOS `ps` has no `etimes`; (3) never test `ps`
by exit code through a pipe — capture stdout first and test for empty; (4) `stat -f '%m'`, never
`%Sm`; (5) PID reuse — compare the full `(pid, start_epoch, comm)` triple, never pid alone;
(6) read the transcript path from the marker, never re-derive the cwd encoding.

Env seams (tests override these; production uses the defaults): `PROBE_ROOT`,
`PROBE_TRANSCRIPT_MAX_AGE_S` (default 300), `PROBE_ALARM_COOLDOWN_S` (default 21600),
`PROBE_SIGNALS_DIR`, `PROBE_HOME`, `CLAUDE_CODE_SESSION_ID` (SELF branch). Tests additionally
override the shell functions `probe_ps_lstart` / `probe_ps_comm` / `probe_stat_mtime` /
`probe_now_epoch` / `probe_send_telegram` / `mcp_call` after sourcing — same function-override
harness convention as `auditor-tier1-probe.test.sh`, zero real `ps`/`stat`/network invocations.

**CANONICAL: Task-lane-by-id resolver (FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD)**
```bash
jq -c --arg id "$bare_id" 'include "scripts/lib/resolve-task-lane-by-id"; lane_map[$id] // null' \
  docs/data/orch/orch-state.json
# -> {id, lane, status, supervised} or null (not found in any hot lane)
```
SSOT for "find a `.task_board` row by id across both shapes (7 flat lanes + nested
`active_sprints[].tasks[]`)", canonicalizing `docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md`
§2. `bare_id($tid)` strips the `"task:"` outer-wrap prefix every orphan-signal payload carries
(EC-1); `lane_map` batch-resolves the WHOLE board in one pass (EC-8 — build once per tick, never
re-open the file per-signal). PATH DEVIATION from the brief's literal `scripts/agents-flow/...`
suggestion, deliberate: `scripts/agents-flow/` holds zero `.jq` files repo-wide (standalone
`.sh`/`.js`/`.mjs` hook/probe scripts only) — `scripts/lib/` is where this repo's shared
`include`-based jq predicate libraries already live (`devteam-eligibility.jq`,
`po-manual-dispatch-eligibility.jq`), and this file is the same shape (one resolver, several
independent callers). Consumers: `docs/agents/dev-team/flow/orphan-adoption.md` (FR-4 read-guard +
FR-5 lane-aware board-flip, both reuse the SAME resolved tuple — no second `ltrimstr`). NOT YET
retrofitted into `.claude/skills/dispatch-claim/SKILL.md` § Orphan-Adoption Probe's own inline FR-3
copy (out of this row's scope — flagged, not fixed). A hot-lane miss (`null`) does NOT itself
consult the cold archive — callers needing that (subtask 2(ii) widening, see
`docs/handoffs/2026-08-25-orphan-adoption-terminal-guard-live-reproduction.md`) query
`docs/data/orch/archive/*.json` `.done_tasks[]`/`.closed_sprints[]?.tasks[]` separately (rare,
per-signal path — see the caller for the exact query). Test: `bash scripts/lib/resolve-task-lane-by-id.test.sh` (12/12 GREEN).

**CANONICAL: Obsolete-file cleanup (FIX-CMH-OBSOLETE-FILE-CLEANUP)**
```bash
scripts/audits/clean-obsolete-files.sh              # --dry-run default, no deletes
scripts/audits/clean-obsolete-files.sh --live        # quarantines to docs/data/.trash/<date>/, never rm's
```
Allow-list-driven, quarantine-first janitor cleanup (unexpanded-shell-var names, aged atomic-write `.tmp`
leftovers, superseded per-cycle snapshots). Owning flow: `docs/agents/claude-manager-helper/flow/main.md`
§ Pass 0b. Policy SSOT: `docs/policies/obsolete-file-cleanup.md`.

**CANONICAL: Agent-memory prune sweep (UC-MDH-P3, memory-docs-hygiene-P3)**
```bash
bash scripts/agents-flow/memory-prune-sweep.sh
```
File-ops-only (never touches `docs/data/orch/orch-state.json`), idempotent — archives
`docs/agent-memory/sessions/*.md` >14d to `sessions/archive/` (`*.md` only; log/json writers
untouched), deletes `docs/agent-memory/health/team-tool-recheck-*.md` >30d + writes one
idempotent PO-decision payload to `docs/signals/`, folds `session-logs/` into
`sessions/archive/`, relocates root-level `scheduled-task-execution-*.md` to
`docs/agent-memory/archive/`. Owning flow: `docs/agents/code-janitor/flow/main.md` § Memory
Prune Sweep — the FLOW step (not the script) appends the `.signal_queue.rows[]` row for the
PO payload via `.claude/skills/signal-dashboard/SKILL.md`. Retention rules:
`docs/agent-memory/sessions/archive/.retention.md`. Test: `scripts/agents-flow/memory-prune-sweep.test.sh`.

**CANONICAL: Notebook line-cap sweep (TE-T17)**
```bash
bash scripts/agents-flow/notebook-linecap-sweep.sh
```
Write-path-agnostic backstop for `scripts/agents-flow/notebook-auto-prune.sh` (the PostToolUse
hook only fires on the `Write|Edit` matcher — Bash heredoc/append writes bypass it entirely,
the root cause of ops.md hitting 1197L/~6x cap before this sweep). Sweeps every
`docs/agent-memory/notebooks/*.md`, delegates any file >200L to the same drop-oldest prune
logic as the hook (synthetic PostToolUse JSON — no duplicated pruning code). Idempotent.
Owning flow: `docs/agents/code-janitor/flow/main.md` § Notebook Line-Cap Sweep. Test:
`scripts/agents-flow/notebook-linecap-sweep.test.sh`.

**CANONICAL: Sprint decision-journal archival (UC-MDH-P4, memory-docs-hygiene-P4)**
```bash
# per-cycle (piped diff of just-closed sprint ids):
comm -23 <(echo "$PRE_EVICT_ACTIVE_IDS") <(echo "$POST_EVICT_ACTIVE_IDS") \
  | bash scripts/agents-flow/decision-journal-archive.sh
# one-time / occasional backfill:
bash scripts/agents-flow/decision-journal-archive.sh --all
```
**CAVEAT (FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD, 2026-08-22):** the `--all` line above is now
GATED in live (non-`--dry-run`) mode — it refuses by default (147 journals belonging to 10 ids
with open work were confirmed archivable-live 2026-08-22) unless `DJA_ALLOW_ALL_UNGATED=1` is
set; see the script's own header for the full valve design and unlock legs before running it verbatim.
Moves `docs/agent-memory/decisions/sprint-<id>.md` / `sprint-<id>-<agent>.md` journals whose
sprint has CLOSED into `docs/archive/decisions/`. STATUS-based selection (closed vs still-active
sprint id via LONGEST-match, never bare prefix glob — handles the live
`OHLCV-UNIT-CONTAM` / `OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` collision shape), NOT mtime-based —
supersedes the decisions/ leg of backlog row TE-T33. File-ops-only (jq reads orch-state, never
writes it). Owning flow: `docs/agents/pm/flow/task-archive.md` § Step 5.5. Test:
`scripts/agents-flow/decision-journal-archive.test.sh`.

**CLOSED-ID-DERIVATION CORRECTION + AC-4 THIRD-STATE BRANCH (FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE, 2026-08-22):**
the weak `.done_tasks[].sprint` closed-id signal (a per-TASK provenance tag, never a per-SPRINT
closure record — root cause of the AC-1 valve hazard above) is now demoted from "sole
justification to archive" to "candidate, gated": an id derived from it is only actually placed in
`PROCESS_IDS` this run if BOTH (a) zero HOT task rows (any of the 8 flat lanes + both nested
sprint-task locations) reference it via `.sprint` with a non-terminal `.status`
(`TERMINAL_SET`-mirrored: `DONE`/`DONE_VERIFIED`/`CANCELLED`/`DEFERRED`/`SKIPPED`), AND (b) any
`.sprint_goal.entries[]` entry for the id, if present, canonicalizes to a terminal status
(`SPRINT_GOAL_TERMINAL_ALIASES`-mirrored). Shares the identical predicate with
`orchStateSchema.ts` §16's Stage 1h validator (`checkSprintRegistryReferentialIntegrity` — see
`scripts/orch-validate.mjs` below) by construction, not by convention. Separately, an id with NO
match anywhere in the known-id universe now triggers the **AC-4 third-state branch**: exit code
changes from always-0 to **2** when `no_orch_record > 0` this run (0 = ran clean, 1 = setup/config
error or the AC-1 valve refusal above — both unchanged, take precedence over 2), and ONE
aggregated `docs/signals/` entry is written (`sprint-registry-unresolved-ids-<hash>-<ts>.json`,
deduped by a sha256 hash of the sorted unresolved-id set so an unchanged backlog never re-signals
on every run). `DJA_SIGNALS_DIR` env override sandboxes the destination for tests, mirroring the
existing 4 path overrides.

**CANONICAL: Stranded machine-state sweep (UC-GCP-P8, git-ci-publish-P8)**
```bash
bash scripts/agents-flow/stranded-state-sweep.sh --plan
```
Classifier-only — emits a JSON commit-plan to stdout, makes NO git/orch-state writes itself.
Classifies `git status --porcelain` into AUTO-COMMIT (notebooks/decisions -> `memory`, `sessions/*.md`
-> `sessions`, `scripts/*` -> `scripts`; mtime >`SSS_AGE_HOURS` (default 24h) gate, deletions exempt;
`agent-memory/modules/*.json` excluded — owned by queued SYSREMAKE-P2 RC-GITSTATE), OWNED-ELSEWHERE
(silent skip — `docs/signals/**`, orch-state.json, cowork-schedule.json, coverage-state.json,
`agent-memory/modules/**`, `auditor-*-last-healthy.json`, `auditor-dedup-ledger.json`, `DASHBOARD.md`,
`unified-agent-synthesis-*.json`, `fb-post-*.md` — routine agent-output classes whose producing
agents hold no Bash/git tool; plus `.claude/agent-models.json`/`.claude/agents/*.md` ONLY when
`_is_model_switch_only()` confirms the `git diff HEAD` touches EXCLUSIVELY the `current_mode`/`model`
value line, else falls through to UNKNOWN — FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH AC1), and
UNKNOWN (SAME `SSS_AGE_HOURS` young-skip gate as AUTO-COMMIT, closing the false-positive class where
a file an agent is actively editing this tick was reported stranded — AC3; aggregated, dedup-checked
signal to po). Capped at 20 paths acted on per run. Owning flow: `docs/agents/dev-team/flow/post-cycle.md`
§ Step 4.3 — the FLOW step (not the script) performs the `git add`/`git commit` (commit-mutex:main) and
the `.signal_queue.rows[]` write via `.claude/skills/signal-dashboard/SKILL.md`. Test:
`scripts/agents-flow/stranded-state-sweep.test.sh`.

**CANONICAL: OHLCV unit contamination repair (CONTAM-6)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-migration.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-migration.ts --live
```
Detects WHERE (open < 100 OR low < 100) AND close >= 1000 AND open > 0 AND low > 0.
Excludes all-zero rows (2026-05-30T11:47Z bulk-zeros defect — out of scope).
Repair: open*1000, low*1000. data_env preserved (RF-5).

**CANONICAL: OHLCV low-zero / partial-zero repair (CONTAM-9)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-low-zero.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-low-zero.ts --live
```
Three-pass repair: A=mixed-unit open (open<100 AND open>0 AND low=0): open*1000 + low estimate;
B=partial-zero open (open=0, not all-zero): open=close; C=remaining low=0 (close>=1000): low=ROUND(close*0.99).
Excludes all-zero rows (separate defect). data_env preserved (RF-5).

**CANONICAL: OHLCV whole-row contamination repair (CONTAM-10-WHOLEROW-LT1000)**
```bash
# Dry-run (per-ticker count + anchor_close + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --dry-run

# Live against named volume (docker exec — requires CONTAM-10-MIGRATION QA PASS):
docker cp scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-wholerow.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-wholerow.ts --live
```
Predicate: per-ticker anchor (most recent bar with close>=1000 AND volume>0 in last 180 days).
Candidate: bar where anchor_close/bar.close>=100 AND bar.close<1000 (whole-row thousands scale).
Fix: ALL FOUR OHLC fields ×1000. INDEX_TICKERS excluded (VNINDEX/VN30/HNXINDEX/HNX30/UPCOMINDEX).
Legitimately cheap stocks skipped (no anchor found → skip). data_env preserved (RF-5).
GATE: CONTAM-10-EXEC blocked on CONTAM-10-MIGRATION QA pass — do NOT run --live before QA.

**CANONICAL: FB data-integrity plausibility gate (FIX-FB-POST-DATA-INTEGRITY-GATE)**
```bash
# Check a post file before publish (run from repo root):
bash scripts/fb-data-integrity-gate.sh <post-file> [YYYY-MM-DD] [snapshot-json-file]
# Exit 0 = PASS; Exit 1 = BLOCK (violations printed); Exit 2 = usage error
# Fetches live data from http://localhost:3000/mcp/api/prices/batch automatically.
# Owning flow: docs/agents/fb-market-poster/flow/daily.md STEP 4b (moved from main.md, TE-T26 2026-08-06)
```

**CANONICAL: Auditor heartbeat sole-writer + shape invariant (SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER, FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1)**
`docs/data/auditor-tier{1,2,3}-last-healthy.json` — ONE authorized writer per file, enforced by
`scripts/git-hooks/pre-commit`'s `_check_auditor_heartbeat_shapes` (always-reject, both directions,
never gated by `GIT_SWEEP_GUARD_MODE`):
- **Tier-1** (`auditor-tier1-last-healthy.json`): sole writer is `scripts/agents-flow/auditor-tier1-probe.sh`'s
  `_write_heartbeat()`, reachable ONLY from `run_probe()`'s ALL_GREEN branch. Semantic: "system was
  confirmed healthy". Required shape: `{last_healthy_at, checks:{docker_ps, health_3000, health_3001,
  disk, mem_creep, launchd_agents}}`, ALL 6 values `"PASS"` — the only shape the authorized writer ever
  emits, so any other shape (bare, wrong key set, a non-PASS value) is an out-of-contract write and is
  rejected. `docs/agents/system-auditor/flow/main.md`'s own Tier-2/3 Heartbeat Write block is explicitly
  gated OUT of Tier-1 and MUST stay that way — do NOT port `suppress_heartbeat` here (Tier-1 has no
  separate "audit completed" writer the way Tier-2/3 does; suppressing this file's only writer starves
  it permanently — see `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` `.why_the_obvious_fixes_are_wrong`).
- **Tier-2/Tier-3** (`auditor-tier{2,3}-last-healthy.json`): sole writer is the system-auditor subagent's
  own end-of-cycle write (`main.md` § Tier-2/3 Heartbeat Write, gated on `AUDIT_TIER` being `2`/`3` —
  do not drop that gate). Semantic differs from Tier-1 BY DESIGN: "a real Tier-N audit cycle completed",
  not "was healthy" — it fires every Tier-2/3 cycle regardless of HEALTHY/DEGRADED/CRITICAL
  (`auditor-signal-loop-P1`, load-bearing for the SKIP-SPAWN freshness gate in `run_tiered_probe()`;
  re-gating this write on a green verdict would starve the heartbeat on any persistently-tracked
  DEGRADED cycle and recreate the exact spawn-storm that fix closed). Required shape: bare
  `{last_healthy_at}` ONLY — a `checks` key means the Tier-1 shape/semantic bled in, and is rejected.
  This bare-vs-`checks{}` shape difference is the resolved, enforced signal distinguishing "confirmed
  healthy" from "an audit merely completed" within one filename family that otherwise implies healthy.
- Cited from both writers: `scripts/agents-flow/auditor-tier1-probe.sh` header comment (Heartbeat
  section) and `docs/agents/system-auditor/flow/main.md` § Tier-2/3 Heartbeat Write.
- Test: `scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh`.

**CANONICAL: Auditor Tier-1 per-signature spawn debounce (SSOT-AUDITOR-TIER1-SPAWN-DEBOUNCE,
FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT, 2026-08-24)**
`docs/data/auditor-tier1-spawn-debounce.json` — debounces the cron's SPAWN decision on a PERSISTING
Tier-1 FAILURE signature. **Never touches the verdict** (AC-3 of the owning design, paramount,
non-negotiable): `scripts/agents-flow/auditor-tier1-probe.sh`'s `run_probe()` returns `verdict:"FAILURE"`
on every failing tick, unconditionally, exactly as before this fix — this file only ever changes
whether the cron LAUNCHES a `system-auditor` subagent this tick, never what the probe itself reports.
Full design: `docs/architecture-briefs/2026-08-24-fix-auditor-tier1-spawn-debounce.md`.
- **Sole writer:** `_spawn_debounce_decision()` in `scripts/agents-flow/auditor-tier1-probe.sh`, called
  ONLY from `run_probe()`'s own top-level (non-suppressed) FAILURE branch — gated behind the exact same
  `[ "$suppress_heartbeat" != "suppress_heartbeat" ]` test already used for
  `_write_trigger_file`/`_write_heartbeat`. A `--tier=2/3` caller's inner `run_probe("suppress_heartbeat")`
  call, and `orch-sentinel-lite-probe.sh`'s own `run_probe("suppress_heartbeat")` call, NEVER touch this
  file — provably unaffected by construction (confirmed live, zero test-suite diff on both).
- **Shape:** `{entries:[{signature, first_seen_at, last_seen_at, last_spawn_at, spawn_count,
  window_expires_at}]}`. Atomic tmp+mv write, same idiom as `_write_heartbeat`/`_write_trigger_file`.
  Missing/unreadable/corrupt file is treated as `{"entries":[]}` and FAILS OPEN to `spawn_decision:"SPAWN"`
  — never fails closed to `"DEBOUNCED"` on an I/O or parse fault (Auditability Contract, same rule every
  sibling pre-gate script already follows,
  `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md` §5.3). Test seam:
  `SPAWN_DEBOUNCE_FILE_PATH` env override, same naming convention as `HEARTBEAT_FILE_PATH`/
  `TRIGGER_FILE_PATH`/`LAUNCHD_ACK_PATH`/`ORCH_STATE_PATH`.
- **`run_probe()` JSON field contract (the sibling cron-prompt row's consumer contract — keep this
  table and the shipped script/prompt text in sync):** the FAILURE branch gains exactly two ADDITIVE
  keys, `spawn_decision` (`"SPAWN"|"DEBOUNCED"`) and `signature` (string) — `verdict`/`detail`/
  `last_healthy_at`/exit-code(1) stay byte-identical to before this fix. Both new keys are
  **ABSENT** (not merely empty) when `suppress_heartbeat=="suppress_heartbeat"` (the Tier-2/3 inner
  call) — a missing `spawn_decision` field means "fail open, spawn" to any downstream reader, per the
  same Auditability Contract. The ALL_GREEN branch gains **zero** new keys.
- **Signature contract:** `sorted, "|"-joined "<checkname>[:<sorted,comma-joined UNACKED entity
  names>]"` tokens, one per FAILING check this tick. `health_3000`/`health_3001`/`disk` (no
  entity structure) contribute the bare checkname alone. `docker_ps`/`mem_creep`/`launchd_agents`
  contribute `<checkname>:<entities>`, built from a clean, prose-free, percentage-free bare-entity
  side-channel threaded out of each check's own per-entity loop (`_check_docker_ps`/`_check_mem_creep`/
  `_check_launchd_agents`, appending to the `_SIG_ENTITY_FILE` global when set) — **never** a regex
  re-parse of the human `detail` string (percentages drift every tick and would debounce nothing; the
  `(also acknowledged-degraded, tracked: ...)` clause's nested parens make a generic strip unsafe). An
  entity-bearing check that FAILS before its own per-entity loop ever runs (e.g. "docker unreachable")
  falls back to the bare checkname alone, so an infra-wide fault still yields a stable signature instead
  of silently dropping the check. The acked-transparency clause is **excluded** from the signature by
  design: an acked entity going STALE moves it OUT of that clause and INTO the check's own unacked
  breach list, which by construction changes the signature and forces an immediate `spawn_decision:
  "SPAWN"` (AC-4) — no special-case code, proven live against the 2026-08-24T07:36:32Z coordinator
  datapoint (two real consecutive ticks, `86.90%→86.56%`/`91.40%→90.80%`, both normalize to the
  identical `"mem_creep:vn-market-intelligence-mcp-pdf-extractor-1"` signature —
  `auditor-tier1-probe.test.sh` T-DEBOUNCE-1/2).
- **Window:** `SPAWN_DEBOUNCE_WINDOW_MIN` env override, default = `_fresh_threshold_minutes_for_tier(1)`
  (60min, 2x Tier-1's own 30min cadence) — reuses that existing convention, never a second, parallel
  hardcoded constant.
- No `scripts/git-hooks/pre-commit` shape-guard for this file (deliberate, mirrors the trigger file's
  own precedent — a stray hand-write here only ever perturbs SPAWN CADENCE, never the health verdict).
- Cited from: `scripts/agents-flow/auditor-tier1-probe.sh` header comment ("SPAWN DEBOUNCE" section) and
  the sibling row `FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT`'s
  `.claude/skills/cron-detect-loop/register.md` Job 2 prompt rewrite (consumer, not yet landed as of this
  writing — see the architecture brief §5 for the exact prompt text this field contract feeds).
- Test: `scripts/agents-flow/auditor-tier1-probe.test.sh` T-DEBOUNCE-1..8.

**CANONICAL: Caller-instruction precedence over spec-internal thresholds (AUD-CP-1,
FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD)**
Every agent flow spec may take TWO structurally different kinds of value from a spawn prompt:
- **Designated parameter** — named as caller-settable in the flow's own `## Input` (or equivalent)
  section (e.g. system-auditor `AUDIT_TIER`, market-watcher `slot=`, orch-sentinel `MODE=`,
  digest-predict `owner_client_session`, dispatch-claim `N_MAX`). The caller is authoritative; this
  rule does not apply.
- **Spec-internal threshold/predicate** — any other numeric threshold or boolean predicate the flow
  states as an invariant decision rule for a check/branch, NOT listed as a designated input anywhere.
  The flow's own spec text is the sole source of truth.

**PRECEDENCE RULE:** when a spawn prompt / caller instruction asserts or requests an outcome for a
spec-internal threshold/predicate that CONTRADICTS what the agent's own documented rule computes this
cycle — **the spec wins.** The agent MUST NOT act on (emit on, branch on) the caller's value.

**MANDATORY on contradiction:**
1. Do not take the caller-requested action (do not emit / do not branch to the caller's outcome).
2. Log the contradiction in this cycle's own notebook section.
3. Report a `CONTRACT-CONTRADICTION` line in the RETURN block:
   `CONTRACT-CONTRADICTION: check=<id> spec=<file:line>=<documented value/predicate> caller_value=<what the prompt asserted> caller_quote="<verbatim caller sentence>" resolution=SPEC_WINS`
   On a cycle with no contradiction, still print `CONTRACT-CONTRADICTION: NONE` — mandatory line,
   never silently omitted (mirrors this repo's own `[OUTPUT-CONTRACT]` "omitting it is a violation"
   convention; a line that only appears when something went wrong is a line nobody can audit for
   absence-of-evidence).

**SCOPE: fleet-wide**, not scoped to system-auditor or to A-21 — see rationale in the origin task's
brief (`docs/architecture-briefs/2026-07-30-fix-auditor-caller-prose-overrides-detector-threshold.md`
§4). Any flow spec that documents a spec-internal threshold/predicate is bound by this rule; a fix
that only touches one check (or one agent) misses the class.

**Origin:** a router spawn-prompt sentence overrode system-auditor's documented A-21 threshold
(`tier1-probe.md:135-137`), producing signal row `sys-20260729T060929-39de` at `crashRestarts=1`
against a documented `>=2` gate. PO retracted the row and hand-recorded provenance in prose fields on
the row itself — this CANONICAL entry + the system-auditor binding below is the preventive fix that
makes that manual archaeology unnecessary going forward.

**CANONICAL: Orch-state gated write wrapper (SSOT-INTEGRITY-PERIMETER SSOT-W1-ORCH-APPLY-WRAPPER)**
```bash
# ALL hot-file writes MUST route through this wrapper — NEVER write orch-state.json directly.
# Canonical call-site idiom (minimal churn over existing jq pattern):
#   jq '<filter>' docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
# Exit 0 = success (candidate atomically applied).
# Exit 1 = validation failed (dup-key / schema / dangling refs) OR conservation check failed
#   (candidate's task_total/signal_total dropped below FLOOR_RATIO of live) OR row prose-ceiling
#   check failed (Stage 2.5 — a row's candidate prose bytes exceed ORCH_ROW_PROSE_CEILING_BYTES
#   AND its own live prose bytes, i.e. net new inline growth past ceiling) — live file untouched.
# Exit 2 = CAS baseline mismatch (concurrent writer, OR the caller's own baseline was already
#   stale — see "CAS baseline" note below) — caller should retry.
# Exit 3 = usage error (empty stdin / live file missing).
# CAS baseline (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ, 2026-08-24): the
#   guard now supports a CALLER-SUPPLIED baseline — ORCH_APPLY_CALLER_BASELINE_HASH (sha256,
#   preferred) or ORCH_APPLY_CALLER_BASELINE_MTIME (epoch seconds) — captured by the caller
#   IMMEDIATELY BEFORE its own `jq` read, closing the gap where the pre-fix guard's mtime was
#   captured at this script's own (much later) startup instead. Neither var set = unchanged
#   fallback behaviour (self-captured mtime, exactly as before this fix) — see canonical entry
#   below for the full incident + migration status.
# Owning task: SSOT-W1-ORCH-APPLY-WRAPPER; validator wired: bun scripts/orch-validate.mjs (same SSOT);
#   conservation guard wired: bun scripts/orch-conservation-check.mjs (FIX-ORCHSTATE-CONSERVATION-
#   GUARD-CIRCUIT-BREAKER — see canonical entry below); updated_at stamp wired:
#   bun scripts/orch-stamp-updated-at.mjs (FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH — see canonical entry below);
#   Stage 2.5 row prose-ceiling guard wired: bun scripts/orch-row-prose-ceiling-check.mjs
#   (FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT — see canonical entry below)
# Routed writers: po-s*/router-*.jq apply idiom, scripts/orch-backlog-stub.sh,
#   scripts/orch-cold-evict.sh, dev-team WF-1 head-reset, signal-dashboard WRITE/READ/PRUNE,
#   pm/flow/main.md task-status writes, po/sprint-signoff.md, developer/fixer/qa WF-1 STOP-RELEASE,
#   fail-loud-protocol.md error boundary head-reset.
# Integration test (exit-code 0/1/2/3 + live-UNCHANGED guarantee): bash scripts/test/orch-apply-wrapper-tests.sh
# Writer audit (all ~290/tick sites categorized): docs/signals/orch-state-writer-audit.json
```

**CANONICAL: Orch-state diff-based updated_at stamping (FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH)**
```bash
# Standalone invocation (usually called internally by orch-apply.sh Stage 1.5 — rarely called directly):
bun scripts/orch-stamp-updated-at.mjs <liveFilePath> <candidateFilePath> <nowIso>
# Mutates <candidateFilePath> IN PLACE. Exit 0 = stamped (0+ rows). Exit 3 = usage/I-O error.
```
Root cause (fixed): `scripts/orch-apply.sh` had zero timestamp handling — task_board row
`updated_at` was stamped only by whichever of the 30+ ad-hoc jq callers happened to remember it,
leaving most rows permanently `null` (TaskSchema uses `.passthrough()`, so omitting it always
validated clean). Fix stamps at the write path, diff-based: for every row (id-keyed — `id` is a
required TaskSchema field, unique across all lanes), compares candidate content against the live
row with the same id, **excluding `updated_at` itself** (so the stamp can never feed back into its
own change predicate — idempotent, does not churn on re-apply of unchanged content). Changed or
brand-new (no live counterpart) rows get `updated_at = now`; unchanged rows — including their
existing `null` — are left byte-for-byte alone. **NO backfill** of the pre-existing null rows from
git history or file mtime (a synthesised timestamp is worse than a null one — falsifies staleness
sweeps and the audit trail); they age out naturally as rows are genuinely touched.
Diff unit is **lane-agnostic**: a row moved between lanes with byte-identical field content is not
itself treated as "changed" (real lane moves almost always change `status`, which orch-validate.mjs
Stage 1b's `checkLaneCoherence()` requires to match the lane anyway — that IS content, and IS
caught; the one exception is a status value legal in more than one lane, e.g. `BLOCKED` moved
between `backlog`/`review` with nothing else touched — a rare pure-bookkeeping relocation).
Runs in `scripts/orch-apply.sh` Stage 1.5, AFTER Stage 0/1 schema validation (so it never
interferes with the raw-text duplicate-key scan, which must see the untouched candidate bytes) and
BEFORE Stage 2 conservation check / CAS-mtime rename.
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (STAMP-CHANGED / STAMP-SIBLING /
STAMP-NEWROW / STAMP-IDEMPOTENT cases).

**Extension — `.head` coverage (FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A):** the top-level
`.head` routing pointer (singular, not a `task_board` row) gets the SAME diff-based `updated_at`
treatment — 30+ ad-hoc jq callers replace `.head` with a bare `{status,active_task_id,next_agent}`
literal that dropped both `updated_at`/`updated_by` (`HeadSchema` declares both `.optional()` +
`.passthrough()`, so it validated clean). `updated_by` is different: it identifies which agent wrote
the pointer, information the actuator cannot honestly invent, so it is left byte-for-byte alone
whenever the caller already supplies it (the common case — mirrors every other caller-supplied
`updated_by`/`_updated_by` field in this schema) and is backfilled with an honest, self-identifying
placeholder (never a fabricated agent name) ONLY when a changed head omits it. No new CLI arg, no
`orch-apply.sh` call-site change. Test coverage: same suite, HEAD-STAMP-CHANGED / HEAD-STAMP-BACKFILL
/ HEAD-STAMP-IDEMPOTENT cases.

**CANONICAL: Orch-state conservation circuit-breaker (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER)**
```bash
# Standalone invocation (usually called internally by orch-apply.sh Stage 2 — rarely called directly):
bun scripts/orch-conservation-check.mjs <liveFilePath> <candidateFilePath>
# Exit 0 = OK (within floor, live total below MIN_BASELINE, or bypass honored) AND zero
#   undeclared row-identity drops (signal_queue.rows[] AND pending_triage_inbox[] — see the two
#   row-identity dimensions below).
# Exit 1 = conservation violated — candidate's task_total/signal_total dropped below
#   CONSERVATION_FLOOR_RATIO (default 0.5) of the live value, live total >= CONSERVATION_MIN_BASELINE
#   (default 10), and no bypass set — OR a signal_queue.rows[] id, OR a
#   dev_team_idle_chain.pending_triage_inbox[] envelope_id, vanished between live and candidate
#   without being accounted for — OR more than CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES
#   (default 1) task_board rows moved to an earlier-pipeline-rank lane in one write without being
#   declared (all row-identity/placement violations, never bypassable — see below).
# Exit 3 = usage error (missing args / file not found / unparseable).
```
Whole-board magnitude-ratio design (NOT naive per-lane never-decrease — a normal single-task lane
move nets to zero on `task_total`, so it never trips the floor). Closes the empirically
live-exploitable full-doc-collapse class (commit `de595a44`: 320 backlog rows -> 0, 100 signal
rows -> 1, exit 0, no warning — reproduced live against current code before this fix landed).
Shared by `scripts/orch-apply.sh` (Stage 2 gate, after schema validation, before the CAS-mtime
rename — load-bearing) and `scripts/agents-flow/orch-state-hook-prewrite.mjs` (PreToolUse parity —
defense-in-depth, secondary). Bypass: `ORCH_APPLY_ALLOW_SHRINK=<reason>` — narrow named bypass
(mirrors the `ORCH_APPLY_LIVE_FILE_OVERRIDE` test-only precedent), wired ONLY into
`scripts/orch-cold-evict.sh` and `docs/agents/pm/flow/task-archive.md` (the 2 already-shipped
legitimate bulk-eviction writers). NEVER set it anywhere else — in particular, never from
system-auditor / signal-dashboard WRITE.
Owning brief: `docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md`
(§4.1 metric formula, §4.2 rejected-design proof, §4.3 hook-parity rationale).
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (COLLAPSE / APPEND-HAPPY /
SHRINK-ALLOWED cases) + `bun test scripts/agents-flow/orch-state-hook.test.mjs` (hook parity +
fail-open infra path).

**Extension — row-identity dimension (FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-PEER-FULLDOC-WRITE, 2026-08-08):**
the magnitude-ratio guard above is a whole-board circuit-breaker by design (§4.2) — it is BLIND to a
small, targeted `signal_queue.rows[]` drop (e.g. 2 of 133 rows = 98.5% retained, nowhere near the 0.5
floor). Added a SEPARATE, INDEPENDENT dimension alongside it (not a replacement): any live
`.signal_queue.rows[]` id absent from the candidate must be accounted for — present in candidate
`.signal_queue.archive[]` (defense-in-depth; every current writer always empties that deprecated
inline lane to `[]` post-HSC-7, so this path is currently dormant but cheap to keep), OR named in
`ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS=<comma-separated-ids>` — else HARD REJECT (exit 1, live
untouched). **Never bypassable by `ORCH_APPLY_ALLOW_SHRINK`** — that bypass says "the total may
shrink a lot" (legitimate bulk eviction), not "any specific row may vanish unaccounted for"; these
are orthogonal claims, proven by the `ROW-DROP-ALLOW-SHRINK-NO-BYPASS` test case. Wired ONLY into
`scripts/orch-cold-evict.sh` (the sole legitimate remover of `signal_queue.rows[]` entries —
`docs/agents/pm/flow/task-archive.md` delegates its own signal-row eviction to this same script,
see that flow doc §Step 4) — it declares exactly the ids its own `rm_sig_rows` map (already computed
for the eviction itself) removed each pass, so the declaration and the actual removal stay
mechanically in lockstep, never hand-maintained.
Root-cause note: the specific incident that motivated this task (2 `sys-*` sbv_fx WARN rows,
2026-07-29T10:33:37Z/38Z, commit `3e257beba`) was investigated and found to be **verified-innocent,
not a loss** — both rows are present today in `docs/data/orch/archive/2026-07.json` `.signal_rows[]`
(status `READ`), correctly cold-evicted via the (at-the-time) no-age-gate immediate-eviction path
already closed by `SIGNAL_MAX_AGE_HOURS` (`FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS`,
shipped 2026-08-01). The original PO evidence checked the deprecated always-empty
`.signal_queue.archive[]` inline lane, not the real cold-storage file, and concluded "destroyed"
in error. This row-identity guard is still shipped as legitimate defense-in-depth for the
theoretically-real class it describes (a candidate built from a stale pre-read snapshot that
predates a peer's concurrent append — `scripts/orch-apply.sh`'s CAS-mtime guard only proves "no
writer intervened during MY OWN process lifetime," it has no visibility into whether the candidate
it received was already stale relative to live before its own process started), not because the
named incident was a real loss.
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (`ROW-DROP-REJECTED` /
`ROW-DROP-ALLOW-SHRINK-NO-BYPASS` / `ROW-DROP-DECLARED-ALLOWED` / `ROW-DROP-ARCHIVE-ACCOUNTED` /
`ROW-APPEND-HAPPY` cases) + `bash scripts/test/orch-cold-evict-tests.sh` T9/T10 (real end-to-end
signal_queue eviction through the newly-wired declaration, unaffected).

**Extension — durable pending-triage-inbox dimension, SUPERSEDED (FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE,
2026-08-09, brief §3.4; superseded by FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-
DRAIN-CLEAR, 2026-08-14, see below):** `signal_total(doc)` briefly summed `length(signal_queue.rows)`
**+** `length(dev_team_idle_chain.pending_triage_inbox)` to close a blind spot where a silent
whole-inbox wipe (a bug in the inbox's own append/clear logic) would sail through this
circuit-breaker undetected as long as `signal_queue.rows[]` itself stayed intact. **This folding was
REMOVED again 2026-08-14** — see the new CANONICAL entry immediately below for why and what
replaced it. Kept here only as a historical marker (matches this repo's SUPERSEDED-not-deleted
convention).

**CANONICAL: Inbox row-identity dimension (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR, 2026-08-14)**
`.dev_team_idle_chain.pending_triage_inbox[]` (`FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN`,
2026-08-08) is a QUEUE whose entire purpose is to drain to zero on every legitimate dev-team
Step-1 triage pass (`docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR") — unlike
`signal_queue.rows[]` (an accumulating log). Folding it into the `signal_total` magnitude ratio
(the 2026-08-09 extension above) meant a single large, fully-legitimate clear tripped the same
0.5-ratio floor built to catch accidental mass-deletion, with the sole bypass
(`ORCH_APPLY_ALLOW_SHRINK`) explicitly forbidden to every caller except
`orch-cold-evict.sh`/`task-archive.md` — forcing PO/dev-team into artificial sequential
sub-batching purely to stay above the ratio, REPRODUCED LIVE TWICE (29 envelopes / 4 writes,
2026-08-11; 248 envelopes / 4 writes, 2026-08-14 — the second occurrence also proved the
self-reinforcing harm: a 2026-08-13 PO cycle triaged 147 envelopes but the blocked clear meant
they were never actually removed, re-presented to every subsequent tick while more piled on top).
**Fix:** `pending_triage_inbox` is REMOVED from `signal_total` entirely (a magnitude floor it is
not part of can never block it) and given its own independent, never-bypassable per-envelope
row-identity guard instead, mirroring `signal_queue.rows[]`'s existing row-identity dimension one
level down: any live `.envelope_id` absent from the candidate must be named in
`ORCH_APPLY_DECLARED_INBOX_TRIAGED=<comma-separated envelope_ids>` (there is no archive-lane
equivalent for this array, unlike `signal_queue.rows[]`/`.archive[]` — the declared env var is the
ONLY accounting mechanism) — else HARD REJECT (exit 1, live untouched), same as the
`signal_queue.rows[]` dimension, and likewise **never bypassable by `ORCH_APPLY_ALLOW_SHRINK`**
(orthogonal claim). Wired ONLY into `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox
CLEAR" — the SOLE legitimate remover of inbox entries — which already computes the exact id list
this write removes (`consumed_ids`) and now passes it through verbatim as the declaration, so a
full clear-to-zero lands in ONE write with zero new computation.
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (`INBOX-FULL-DRAIN-DECLARED` — AC-3,
real fixture, drains a 29-envelope inbox to 0 in one write through the full `orch-apply.sh` chain
with no bypass env var / `INBOX-DROP-UNDECLARED-REJECTED` / `INBOX-DROP-ALLOW-SHRINK-NO-BYPASS` /
`INBOX-APPEND-HAPPY` cases, 89/89 total unaffected+new) + `scripts/agents-flow/
drain-signals-durable.test.js` § Conservation Guard Extension, updated in place (undeclared full
wipe and undeclared single-entry consume both still REJECTED; the identical drops ACCEPTED once
declared; normal append unaffected either way — 48/48 total) + `bun test
scripts/agents-flow/orch-state-hook.test.mjs` (21/21 unaffected, hook-parity caller of the same
`signalTotal()`).

**CANONICAL: Lane-placement dimension (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ, AC-3, 2026-08-24)**
The magnitude-ratio guard above is ALSO blind to a stale full-document candidate that silently
REVERTS a peer's lane-move: a row moving backward out of a lane it was already promoted past nets
to zero on `task_total` (the row still exists somewhere, just in an earlier lane) — REPRODUCED
LIVE: a pm subagent's unrelated `done[]`->`done_verified[]` write carried a full-document candidate
built minutes earlier, wholesale-restoring stale `qa[]`/`review[]` arrays and reverting 5 rows;
`git show <that commit> -- docs/data/orch/orch-state.json` never even mentions the 5 clobbered ids
— the write's own diff never named them.
**Fix:** `undeclaredBackwardLaneMoves()` (in `orch-conservation-check.mjs`) tracks every
`task_board.<FLAT_TASK_LANES>[].id` present in both live and candidate; if the candidate's lane has
a strictly lower `LANE_RANK` TIER than the live lane, that id is a "backward move." A SINGLE
undeclared backward move per write is tolerated (`CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES`,
default 1) — this covers every known sanctioned single-row backward workflow (e.g.
`qa/flow/main.md`'s `CHANGES_REQUESTED` path moves exactly one row `qa[]`->`review[]` by name;
grep-verified 2026-08-24: every current `.task_board.<lane> = [...]` backward-lane assignment across
`scripts/*.jq` and every dev-agent flow-doc write targets exactly one `.id`). TWO OR MORE undeclared
backward moves in the SAME write is the exact reproduced-incident shape and is a HARD REJECT (exit 1,
live untouched) — independent of, and **never bypassable by**, `ORCH_APPLY_ALLOW_SHRINK` (same
orthogonality rationale as the two row-identity dimensions above). A caller with a genuine,
deliberate reason to revert 2+ rows in one write (no such caller exists today) can declare them via
`ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES=<comma-separated ids>`, mirroring the existing
declared-eviction escape hatches rather than leaving this permanently fail-closed for a hypothetical
future legitimate case. Scoped to the flat `task_board` lanes only —
`active_sprints[]`/`closed_sprints[].tasks[]` have no single flat-lane rank and are out of scope (the
reproduced incident was entirely within the flat lanes).

**CORRECTED 2026-08-26 (FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN,
architect brief `docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-
skipstrand.md` §2):** `LANE_RANK` is now an explicit TIER map, decoupled from `FLAT_TASK_LANES`'
array position — `backlog`(0) < `ready`(1) < `in_progress`(2) < {`review`, `done`}(3, SAME TIER) <
`qa`(4) < `done_verified`(5). The paragraph above previously claimed "batch multi-row claim
scripts, e.g. the QA_CAP=10 Review-Lane QA-Drain, always move FORWARD, never backward, so this
floor never affects them" — that was FALSE for the `done[]`-origin half of that batch under the
prior flat array-position rank (`done`=5 > `qa`=4, so every `done[]->qa[]` drain row scored
BACKWARD, and at >=2 such rows in one write the guard aborted the ENTIRE write, including the
strictly-forward `review[]`-origin rows riding along in the same batch — live-reproduced
2026-08-26T03:22Z, 2 review + 2 done eligible, first attempt landed ZERO of 4). `done[]` is a
SECOND pre-QA staging lane feeding `qa[]`, exactly like `review[]` (both are unioned by
`scripts/devteam-review-claim-qa-drain.jq`'s own candidate selector) — NOT a post-QA stage; only
`done_verified[]` is the true post-QA terminal lane. Giving `review`/`done` the same tier makes the
"batch claims always move forward" claim TRUE again. A genuine stale-revert of `qa[]->done[]`
(candidate tier 3 < live tier 4) is still correctly flagged backward — only the `done`<->`qa`
boundary in the forward (`done`->`qa`) direction changed. `LANE_RANK` is used in exactly ONE place
repo-wide (grep-verified 2026-08-26).
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (`LANE-BACKWARD-SINGLE-TOLERATED` /
`LANE-BACKWARD-MULTI-REJECTED` / `LANE-BACKWARD-DECLARED-ALLOWED` / `LANE-FORWARD-BATCH-HAPPY`
cases, 109/109 total unaffected+new) + `bash scripts/test-orch-conservation-lane-rank.sh` (new,
2026-08-26 — direct `orch-conservation-check.mjs` fixture harness: AC1 two-or-more `done[]`-origin
`qa[]` claims land clean with no bypass; AC2 negative control, a genuine 2-row `qa[]->done[]` stale
revert still aborts; AC3 replays the exact 03:22Z 2-review+2-done shape, lands all 4; NG1 same-tier
`review[]<->done[]` lateral moves are never flagged even 2-at-once; NG2 the pre-existing single-row
`qa[]->review[]` CHANGES_REQUESTED revert is unaffected — 12/12 passing, negative-controlled against
the pre-fix HEAD copy to confirm the harness genuinely discriminates the defect, not vacuously
passes).

**CANONICAL: CAS caller-supplied baseline (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ, AC-1/AC-2, 2026-08-24)**
Root cause: `scripts/orch-apply.sh`'s pre-fix CAS guard captured its "before" mtime at its OWN
process startup — in the mandated `jq '<filter>' orch-state.json | bash scripts/orch-apply.sh`
pipeline, that is AFTER the caller's `jq` already read the (possibly minutes-stale, under load)
live file. A candidate built from that stale read sailed through the before/after check trivially,
because "before" was never "before the caller's read." REPRODUCED LIVE (2026-08-23T21:37Z tick,
see the lane-placement entry above for the same incident): T0 peer reads (`qa`=2) -> T1 a real
write lands (`qa`=7) -> T2 peer's `orch-apply.sh` starts, self-captures `MTIME_BEFORE` = the
value T1 already set -> T3 rename, `MTIME_AFTER` matches -> stale candidate silently applies,
`qa` reverts to 2.
**Fix:** the caller may now supply what it observed, captured immediately before its own `jq`
invocation: `ORCH_APPLY_CALLER_BASELINE_HASH` (sha256 of the live file — preferred, exact
regardless of write cadence) or `ORCH_APPLY_CALLER_BASELINE_MTIME` (epoch seconds — 1s resolution,
cheaper for callers that cannot afford to hash a large file); hash takes precedence if both are
set. Canonical migrated call pattern:
```bash
BASELINE=$(sha256sum docs/data/orch/orch-state.json | awk '{print $1}')  # or: shasum -a 256 ... | awk '{print $1}'
jq '<filter>' docs/data/orch/orch-state.json \
  | ORCH_APPLY_CALLER_BASELINE_HASH="$BASELINE" bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```
**AC-1's explicit fallback clause:** a caller supplying NEITHER env var gets EXACTLY today's
pre-fix behaviour — mtime self-captured at this script's own startup, unaffected. **AC-4 migration
status:** no caller has migrated to the caller-supplied baseline yet — this is a TRACKED FOLLOW-UP
(the wrapper is mandatory fleet-wide per CLAUDE.md § Orch-State Hot File, so a baseline nobody
passes is currently a no-op for every one of the ~290/tick write sites in
`docs/signals/orch-state-writer-audit.json`); the mechanism itself is additive and non-breaking
(byte-identical fallback), so it can land ahead of the migration without regressing any caller.
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (`CALLER-BASELINE-STALE-REJECTED` —
AC-2, reproduces the exact T0..T3 interleave above end-to-end through two real `orch-apply.sh` runs
/ `CALLER-BASELINE-SEQUENTIAL-HAPPY` — AC-2 negative control, non-overlapping sequential write with
a caller baseline still applies / `CALLER-BASELINE-MTIME-MODE` — same repro via the mtime variant /
`CALLER-BASELINE-NOBASELINE-UNCHANGED` — AC-1 fallback clause named explicitly, 109/109 total
unaffected+new).

**CANONICAL: Orch-state row-level prose-ceiling guard (FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT)**
```bash
# Standalone invocation (usually called internally by orch-apply.sh Stage 2.5 — rarely called directly):
bun scripts/orch-row-prose-ceiling-check.mjs <liveFilePath> <candidateFilePath>
# Exit 0 = OK — zero rows with NET NEW inline growth past ORCH_ROW_PROSE_CEILING_BYTES (may still print
#   non-fatal WARN lines for rows already over ceiling that did NOT grow this write — grandfathered).
# Exit 1 = at least one row's candidate prose bytes exceed ORCH_ROW_PROSE_CEILING_BYTES AND exceed that
#   row's own live prose bytes (net new inline growth) — live file untouched.
# Exit 3 = usage error (missing args / file not found / unreadable / unparseable).
```
Mirrors `orch-conservation-check.mjs`'s `(liveFilePath, candidateFilePath)` CLI contract and read-only
assert-and-exit shape — both are "diff live vs candidate, apply a circuit-breaker rule, never mutate"
checks. Placement chosen over extending `orch-validate.mjs` (candidate-only, no live-file comparison
capability) or `orch-stamp-updated-at.mjs` (has the right live-vs-candidate row-diff primitives, but was
mid-extension for the unrelated in-flight `FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP` fix at the time).
**GROWTH-ONLY design** (never bricks): a row already over `ORCH_ROW_PROSE_CEILING_BYTES` (default 12000,
env-tunable, ≈p90 across `backlog[]`/`ready[]`/`review[]` on the 2026-08-09 live distribution) that is not
growing this write is a non-blocking WARN, mirroring `ORCH_APPLY_ALLOW_SHRINK`'s existing "grandfather
existing state, gate the delta" precedent for the conservation check — only NET NEW inline growth past
ceiling hard-rejects. Row identity is id-keyed and **lane-agnostic** (a lane move with unchanged prose
bytes is never mistaken for a brand-new row with a 0 baseline) across the same 3 flat lanes this task
measured (`backlog[]`/`ready[]`/`review[]` — `active_sprints[]`/`in_progress[]`/`qa[]`/`done[]`/
`done_verified[]` are deliberately out of scope, see the owning brief §3 non-goals). "Prose bytes" = a
row's JSON byte length (UTF-8) after excluding a fixed structural/routing/lifecycle field set (superset of
`scripts/orch-backlog-stub.sh`'s `STUB_FIELDS` plus the lifecycle/provenance fields that script
deliberately never strips) — a measurement convention local to this script, does NOT touch
`TaskSchema`/`.passthrough()` (that stays `SSOT-W1-SERVER-ENFORCE`'s separately-owned, still-pending
`.strict()` promotion). **No bypass env var** — unlike `ORCH_APPLY_ALLOW_SHRINK` (protects a legitimate,
structurally-necessary operation), there is no legitimate reason to inline-grow a row past ceiling:
`detail_ref` (see the Backlog stub migration entry below) is already the sanctioned escape hatch.
Wired into `scripts/orch-apply.sh` as Stage 2.5, after the conservation check (Stage 2) and before the
CAS-mtime re-check. Owning brief: `docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md`
§2.4. Test coverage: `bash scripts/test/orch-row-prose-ceiling-check-tests.sh` (GROWTH-VIOLATION /
WARN-NO-GROWTH / NEWROW-VIOLATION / UNDER-CEILING-HAPPY / SHRINK-STILL-OVER / LANE-AGNOSTIC-MOVE /
MULTI-VIOLATION-MSG / STRUCTURAL-FIELDS-EXCLUDED / SECONDARY-DRAIN-STAMP / usage-error cases) — verified
read-only against the real live `orch-state.json` (zero regression risk: 42 pre-existing over-ceiling
rows all resolve to non-blocking WARN, exit 0) before wiring into `orch-apply.sh`.

**Regression fixed 2026-08-15 (`FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET`,
same-day follow-up):** `STRUCTURAL_FIELDS` already excluded `claimed_at`/`claimed_by` (PRIMARY QA-Drain's
claim stamp) but NOT the `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target`/
`dispatch_target` family that `scripts/devteam-review-claim-secondary-drain.jq` stamps in place inside
`review[]` — so that claim stamp counted as prose growth on an already-over-ceiling row and hard-rejected
the write every tick, deterministically livelocking the whole Review-Lane SECONDARY-Drain lane (the
picker is oldest-first with no failed-claim exclusion, so the same blocking row was re-picked forever).
4513c45df's own shipping verification only exercised the STATIC case (rows sitting still); it never
exercised the DYNAMIC case (a claim script stamping an over-ceiling row), which is the only case a live
fleet actually produces — same shape as `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`.
Fixed by adding the 4 fields to `STRUCTURAL_FIELDS` (same coordination-metadata argument that already
admitted `claimed_at`/`claimed_by`) + a new DYNAMIC regression test (`SECONDARY-DRAIN-STAMP`, stamps a
synthetic over-ceiling `review[]` row with the real claim-field set, asserts exit 0) — a static field-list
scan would have passed even pre-fix, which is exactly how the regression slipped through. Scope explicitly
does NOT extend to the other 5 claim scripts (QA-Drain/BOUNDED-1/SLS/RLC/DRS) — they all move rows OUT of
the 3 guarded lanes on claim (into `qa[]`/`in_progress[]`), so the claimed row leaves the measured set
entirely before this guard ever inspects it; `devteam-review-claim-secondary-drain.jq` is the only claim
script that stamps in place inside a guarded lane, which is why it was the only one deadlocked.

**Convention (informational, not schema-enforced — brief §2.5):** append new review/verification prose
to the existing `note`/`status_note`/`verify_note` fields, or route it through `detail_ref`, rather than
minting a fresh uniquely-timestamped field name per cycle (`architect_review_note_<date>`,
`po_review_<timestamp>`, ...). Freshly-invented field names are exactly what let prose re-accrete around
`orch-backlog-stub.sh`'s one-time sweeps even after a stub run (F-2 in the owning brief) and are the
concrete reason `TaskSchema` is still `.passthrough()` rather than the already-approved
`SSOT-W1-SERVER-ENFORCE` `.strict()` promotion (gated on zero live unknown-key warnings — not yet true).
Not enforced by this guard or any schema check today — purely a naming-hygiene ask.

**CANONICAL: Orch-state Claude hook gate (SSOT-INTEGRITY-PERIMETER SSOT-W1-HOOK-ENFORCE)**
```bash
# PreToolUse gate — auto-wired in .claude/settings.local.json, no manual invocation needed.
# To test: echo '{"tool_name":"Write","tool_input":{"file_path":"docs/data/orch/orch-state.json","content":"<json>"}}' \
#   | bun scripts/agents-flow/orch-state-hook-prewrite.mjs
# Exit 0 = allow. Exit 2 + {"decision":"block","reason":"..."} = blocked (schema violation).
# PostToolUse Bash backstop:
# bash scripts/agents-flow/orch-state-hook-bash-backstop.sh  (auto-fired; non-blocking —
#   exit 0 = clean pass/no-op OR a genuine SSOT validation failure (warning printed to
#   stdout); exit 1 = a PREREQUISITE itself crashed (missing git/jq binary, unreadable
#   stdin, missing validator) — see UC-CRITIC-HOOKS-ENFORCEMENT FR-1/FR-2 below)
# Owning task: SSOT-W1-HOOK-ENFORCE; validator wired: bun scripts/orch-validate.mjs (same SSOT)
```
Both hook scripts call `bun scripts/orch-validate.mjs` — same canonical Zod validator as the CLI.
PreToolUse validates BEFORE write lands (blocks on schema fail). PostToolUse backstop catches
Bash shell writes that bypass the Write/Edit tools (surfaces warning; non-blocking).

**CANONICAL: Orch-state Bash direct-write guard (HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD)**
```bash
# PreToolUse Bash-matcher heuristic — detects direct-bypass writes to
# docs/data/orch/orch-state.json that skip the mandated orch-apply.sh wrapper.
# Directive: docs/architecture-briefs/2026-08-26-hook-enforcement-plane-mcp-socket.md §6.2/§8
# To test: echo '{"tool_name":"Bash","tool_input":{"command":"echo x > docs/data/orch/orch-state.json"}}' \
#   | bun scripts/agents-flow/orch-bash-direct-write-guard.mjs
# STAGED (§8): Stage 1 OBSERVE-ONLY is the shipped default — a would-flag command is appended
#   as one JSONL line to docs/data/orch-bash-guard-would-block.log and the hook exits 0 (never
#   blocks). Stage 2 BLOCK (ORCH_BASH_GUARD_MODE=block → exit 2 + {"decision":"block",...}) is
#   PO-gated: both Stage-1 promotion criteria (deliberate violation fires the log; zero false
#   positives over >=20 real orch-state-touching Bash invocations) must be met first.
# Kill switch: ORCH_BASH_GUARD_DISABLE=1 → exit 0 (no log, no block).
# HEURISTIC LIMIT (stated in-file): catches the realistic `jq ... > orch-state.json` one-liner
#   class; deliberately does NOT defeat string obfuscation (`X="..."; > "$X"`) or
#   cwd-relative bare-basename writes after `cd docs/data/orch`.
# Owning task: HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD; would-block log:
#   docs/data/orch-bash-guard-would-block.log (git-tracked, schema-comment first line)
# Tests: bun test scripts/agents-flow/orch-bash-direct-write-guard.test.mjs
# Registration: user/config-admin action (brief §9) — the .claude/settings*.json Bash matcher
#   entry is applied by the user, never by an agent.
```

**CANONICAL: Orch-state Zod validator CLI (SSOT-INTEGRITY-PERIMETER SSOT-W1-ZOD-VALIDATOR-CLI)**
```bash
# Validate docs/data/orch/orch-state.json (default path):
bun scripts/orch-validate.mjs
# Validate a specific candidate file (e.g., before atomic rename):
bun scripts/orch-validate.mjs path/to/candidate.json
# Exit 0 = Stage 0 + Stage 1 PASS (0 coherence issues, 0 dangling refs). Stage 1g/1h may still
# print a non-fatal report (warn mode) on exit 0. Exit 1 = dup-key.
# Exit 2 = schema/lane-coherence/ref/sprint-goal-status/decorative-blocks-co_edit-field/
#   depends-divergence fail, OR Stage 1h in ORCH_SPRINT_REGISTRY_MODE=reject (not the default).
#   Exit 3 = file-not-found.
# Owning task: SSOT-W1-ZOD-VALIDATOR-CLI; directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Step 3
# Acceptance fixture: bun scripts/test-orch-validate-ac.mjs (exercises AC-1..AC-4)
```
Imports schema from apps/mcp-server/src/infrastructure/orchStateSchema.ts (single source of truth — never duplicated).
Stage 0: raw-byte duplicate-key scan (pre-parse). Stage 1: OrchStateSchema.safeParse. Stage 1b: lane coherence
(HARD FAIL — flipped from warn-only by D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING once SHG migration drove live
coherence to 0; process.exit(2) on any violation). Stage 1c: ref integrity (hard fail on dangling detail_ref /
payload_ref). Stage 1d: sprint_goal terminal-status canonicalization (hard fail). Stage 1e
(FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE): `checkDecorativeSequencingFields()` — hard fail on a
reverse-only `blocks` edge (present, non-empty, but the named target does not carry the source id back in
its own `depends_on`/`depends`/`blocked_by` — the ONLY fields `scripts/lib/devteam-eligibility.jq`'s
`effective_depends_on()` reads — or malformed, e.g. a prose string) or any non-empty `co_edit` value (no
forward-field equivalent exists in the schema at all, so it can never be validated as bound). Closes the
class where a field reads as a sequencing/atomic-ship constraint in every board dump while binding nothing.
Stage 1f (FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS AC-3): `checkDependsDivergence()` — hard
fail when a row carries BOTH `.depends` and `.depends_on` and `.depends` names an id absent from
`.depends_on` — `effective_depends_on()`'s union (depends_on + depends + blocked_by) silently resurrects a
stale/deleted id left resident in `.depends` alone forever, permanently fail-closing `deps_satisfied()` (the
incident that starved 5 P0 rows for 3 days, 2026-07-29→08-01). Stage 1g (same task, NON-FATAL): `checkMissingDependencyReport()`
reports (never fails) rows whose effective dep set resolves MISSING in both the hot board's 7 flat lanes and
the cold archive (`docs/data/orch/archive/YYYY-MM.json .done_tasks[]`) — deliberately excludes
`active_sprints[].tasks[]` (in-flight intra-sprint deps are normal WIP-pending noise; `dep_status_map()`
never scans sprint-nested tasks at all) while including `closed_sprints[].tasks[]` (settled/frozen, a
genuine cleanup signal). Does NOT change `deps_satisfied()` MISSING semantics — that stays the separate,
explicitly-ratified territory of FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING.

Stage 1h (FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE, §3/§4, A1-corrected
per the board row's po_review_note): `checkSprintRegistryReferentialIntegrity()` — sprint-registry
referential-integrity guard. Delegates to `classifySprintRegistryDanglingIds()` (§15) and counts
every non-`PRE_SPRINT_LABEL` classification row as a violation (a narrower "no sprint_goal entry
at all" exemption was tried first and rejected — it wrongly flagged genuinely-exempt ids forever,
see the function's own header). Known-id union is STRICT (`active_sprints[].id` hot ∪
`closed_sprints[].id` hot ∪ cold archive `closed_sprints[].id`/`closed_sprint_goals` sprint ids) —
`.done_tasks[].sprint` is deliberately EXCLUDED (mirrors GIT_NOTEBOOK_IMMUTABILITY_MODE's model:
default **warn**, env `ORCH_SPRINT_REGISTRY_MODE`, print + one deduped `docs/signals/` entry, exit
0; `reject` = same detection, `process.exit(2)`). Do not flip the default to `reject` until
`scripts/audits/verify-sprint-registry-referential-integrity.mjs` reads `violations==0` against the
live file. Same predicate also backs the closed-id-derivation correction in
`scripts/agents-flow/decision-journal-archive.sh` (see its own CANONICAL entry above) — one shared
implementation, not two.

**CANONICAL: Sprint-registry dangling-id classification/replay (FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE)**
```bash
bun scripts/audits/verify-sprint-registry-referential-integrity.mjs   # default: docs/data/orch/orch-state.json
```
READ-ONLY classification/replay tool — makes NO write. Thin CLI wrapper around
`classifySprintRegistryDanglingIds()` (`orchStateSchema.ts` §15): resolves cold-archive inputs (fs
reads) and prints the regenerated per-id table (LIVE/FINISHED/RELABEL/NEVER_WAS/PRE_SPRINT_LABEL) +
a final `violations=N` line (counted = every row except `PRE_SPRINT_LABEL`, which is exempt by
design — chasing `strict_dangling` to 0 instead would fabricate phantom sprints, PO Q2 ruling).
PO sign-off on this table's output is required before `scripts/orch-apply.sh` applies any
reconciliation write derived from it. Same script is Stage 1h's `reject`-mode arming gate (brief
§3) and `decision-journal-archive.sh --all`'s AC-1 leg(b) (not yet wired — separate row
FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD). Test: `apps/mcp-server/src/__tests__/FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE.test.ts`.

**CANONICAL: Orch-state write-gate validator (ORCH-STATE-SCHEMA-HARDENING SHG-1 / SSOT-W1-BASH-SHIM)**
```bash
# Validate a candidate orch-state file before atomic rename (exit 0 = valid, non-zero = FAIL):
bash scripts/orch-state-validate.sh <path-to-candidate.json>
# Wire-in pattern (every orch-state write path, before mv):
#   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
#     || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
# Owning brief: docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md § 4
# Wire-in targets (SHG-3): pm/main, pm/task-archive, dev-team/post-cycle,
#   po/sprint-signoff, signal-dashboard, system-auditor, orch-cold-evict.sh
```
SHIM (SSOT-W1-BASH-SHIM, 2026-06-27): scripts/orch-state-validate.sh is now a thin shim that exec's
`bun scripts/orch-validate.mjs "$@"`. All G-1..G-5 hard gates are covered by Stage 0 + Stage 1
(superset: Zod checks 9 lanes vs former 3-lane G-5; READY added as 12th valid status).
G-6 (last_tick skew warn-only) dropped — no exit-code impact. Caller contract unchanged (0=pass, non-zero=fail).

**CANONICAL: Orch-state cold eviction (ORCH-STATE-HOT-COLD-SPLIT HSC-1; extended D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND)**
```bash
# Dry-run (preview eviction counts + projected hot-file size, no writes):
bash scripts/orch-cold-evict.sh --dry-run
# Live eviction (MUST hold commit-mutex:main before calling):
bash scripts/orch-cold-evict.sh
# Override retention policy (env vars):
KEEP_RECENT_DONE=10 DONE_MAX_AGE_DAYS=7 bash scripts/orch-cold-evict.sh --dry-run
# signal_queue.rows[] age gate (FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS,
# 2026-08-01): terminal-status rows also require ts older than SIGNAL_MAX_AGE_HOURS
# (default 24, matches .claude/skills/signal-dashboard/SKILL.md § PRUNE's live SSOT):
SIGNAL_MAX_AGE_HOURS=24 bash scripts/orch-cold-evict.sh --dry-run
# One-time migration safety valve — skip specific task IDs regardless of status
# (repeatable flag or comma-separated; also settable via EXCLUDE_TASK_IDS env):
bash scripts/orch-cold-evict.sh --exclude-ids FIX-BCTC-BANK-SUMMARY-MAPPING --exclude-ids OTHER-ID
bash scripts/orch-cold-evict.sh --exclude-ids=FIX-BCTC-BANK-SUMMARY-MAPPING,OTHER-ID
# Owning brief: docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §3
#   D4 extension brief: docs/architecture-briefs/2026-07-10-backlog-hygiene-verify-prune-sweep.md §8
# Called from: HSC-2 (one-time migration); HSC-6 (pm/dev-team post-cycle hook); D1 (sweep execution)
```
Evicts done[], done_verified[], terminal active_sprints[], terminal signal_queue.rows[], and
signal_queue.archive[] to docs/data/orch/archive/YYYY-MM.json. **D4 extension (2026-07-10):** also
scans the flat task lanes `{backlog, review, qa, in_progress, ready}` (NOT done/done_verified —
already handled) for rows whose `.status` is terminal (`TERMINAL_TASK_STATUSES` env, default =
TERMINAL_SET, same definition as `TERMINAL_SPRINT_STATUSES`) — root cause: a status flipped to
terminal in-place without a lane move previously stranded forever in these lanes (this script never
read them). Cold sink: the `.backlog_detail[]` field in the monthly archive (present in the schema
since inception, previously always `[]`, now wired). `--exclude-ids` is a migration-time safety
valve only — not a permanent per-row allowlist.
**FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE (2026-07-29):** an excluded row keeps its terminal
status only until this script's own SHG-3 write-gate runs — `build_hot_temp()` relabels it in-place
to a lane-coherent status (`EXCLUDE_RELABEL_STATUS` env, default `BLOCKED` for backlog/review/
in_progress, `QA`/`READY` for qa/ready — mirrors `LANE_ALLOWED_STATUSES`, orchStateSchema.ts) before
validation, and stamps `verify_note` with the original status + timestamp for traceability. Without
this, a terminal status parked in a non-terminal lane hard-fails Stage-1b `checkLaneCoherence()`
(D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING, commit `ed01c5c1b`) and aborts the *entire* eviction run,
not just the excluded row. The checker itself is untouched — only the data it validates is corrected.
Atomic temp-then-rename; cold-first ordering; mtime-CAS retry; idempotent.
Internal orch-apply.sh call propagates `ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}"` (no-op in
production — REQUIRED whenever `ORCH_STATE` is overridden, e.g. testing against a throwaway
fixture; without it orch-apply.sh silently falls back to its own default, the REAL live file) and
sets `ORCH_APPLY_ALLOW_SHRINK` (this script is one of only 2 legitimate bulk-eviction bypass
call sites — see FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER above).
Test coverage: `bash scripts/test/orch-cold-evict-tests.sh` (evict-correctness / non-terminal-skip /
--exclude-ids / idempotent-rerun / conservation-guard-still-fires / --dry-run-no-mutation / signal_queue
age-gate fresh-vs-aged-vs-NEW-vs-null-ts (TEST 9) — mirrors `orch-apply-wrapper-tests.sh`'s fixture +
real-live-hash-unchanged safety pattern; never run against the live `docs/data/orch/orch-state.json` file).
**FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION Component 6 (2026-08-23):** the `done[]`
age/count eviction pass no longer evicts a candidate whose `.status == "DONE"` — only a
`DONE_VERIFIED` row parked in `done[]` (legacy placement, already verified) remains evictable there.
An unverified `DONE` row is exactly what the Done-Lane Drain (below) exists to reach; cold-evicting
it on age/rank alone put it permanently out of reach of every hot-file-scoped mechanism (2 real
casualties already: `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`, `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-
LIVE-FETCH`). `done_verified[]` and every other pass are unaffected. Test coverage (CASE 8):
`bash scripts/test-devteam-donelane-drain.sh`.

**CANONICAL: Done-Lane Drain (FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION, architect brief
`docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md`)**
`task_board.done[]` had zero consumers — nothing ever produced the `DONE_VERIFIED` token a finished
row needs before `deps_satisfied()` (this same file, above) will unblock any successor naming it as a
dep. Fix: widen the candidate-gathering of the two pre-existing Review-Lane drains from `review[]`
alone to `review[] ∪ done[]` (status `REVIEW`/`DONE` respectively) — zero new dev-team/flow/main.md
section, zero new call site, zero new `.head` coordination path; the mechanism inherits the SAME
already-reachability-proven idle-chain rotation the review[]-only drains already had.
- `scripts/devteam-review-claim-qa-drain.jq` — PRIMARY (qa-routed) subset. A `done[]`-origin pick
  gets an additive, non-load-bearing `drain_source_lane: "done"` field (never `claimed_by`, which
  MUST stay the literal `"dev-team (review-lane qa-drain)"` — the dispatch-loop's own exact-match
  query on that field would silently drop a source-tagged row from the spawn fan-out). The two source
  lanes' index sets are independent (`idx` is only unique within one array) — a mixed batch removes
  the picked review-origin rows from `review[]` and the picked done-origin rows from `done[]`
  separately, never a shared index list.
- `scripts/devteam-review-claim-secondary-drain.jq` — non-qa/null subset, stamped IN PLACE on
  whichever source lane the picked row lives in (no lane move, no status change) via the pre-existing
  `resolved_secondary_dispatch_target` (`po` fallback for null/absent/`dev-team` next_agent) — for
  free, satisfies "a `done[]` row with no next_agent must not be silently invisible."
- Neither script writes `DONE_VERIFIED` under any condition — the producer only ever moves
  `DONE -> QA` or stamps in place; promotion stays QA's own independent `verify-committed` judgment
  (`docs/agents/qa/flow/main.md` § Direct-Commit Verify), by construction, not by an added check.
- `scripts/audits/devteam-review-lane-drain-report.sh` — extended with DONE-LANE PRIMARY/SECONDARY
  sections mirroring REVIEW PRIMARY/SECONDARY exactly; the staleness FAIL predicate (`[STALE_DAYS]`
  arg) now also fails if DONE-LANE PRIMARY is non-empty and every row in it is `>= STALE_DAYS` old.
- `scripts/audits/devteam-deps-satisfied-sole-failure-report.sh` (NEW, AC-6 regression instrument) —
  read-only, live board, exit 0 always. Mechanizes the "leg 1" hand-derivation from
  `scripts/po-triage-20260730T2148-donelane-doneverified-producer-starvation.jq`'s own header: reuses
  `is_bounded1_eligible`'s 7 sub-gates + `deps_satisfied`/`dep_status_map` from
  `scripts/lib/devteam-eligibility.jq` verbatim (no reimplementation) over `backlog[] + ready[]`,
  reports every row whose SOLE failing gate is `deps_satisfied` with each unmet dep's raw status
  (`DONE`, `MISSING`, or any other non-`DONE_VERIFIED` value).
  ```bash
  bash scripts/audits/devteam-deps-satisfied-sole-failure-report.sh          # human table
  bash scripts/audits/devteam-deps-satisfied-sole-failure-report.sh --json   # {"starved": [...]}
  ```
Test coverage: `bash scripts/test-devteam-donelane-drain.sh` (10 cases, I1-I8 hard invariants — done-
origin reach/claimed_by-exact-match/independent-index-sets/never-writes-DONE_VERIFIED/null-next_agent-
po-fallback/DONE_VERIFIED-and-BLOCKED-rows-never-picked/review[]-origin-byte-unchanged/cold-evict-
DONE-status-guard — plus the report + regression-instrument existence/live-run checks).

**CANONICAL: Backlog stub migration + cold detail writer (ORCH-STATE-HOT-COLD-SPLIT HSC-4; multi-lane extension FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT)**
```bash
# Dry-run (preview stub counts + projected hot-file size, no writes) — default lane (backlog only):
bash scripts/orch-backlog-stub.sh --dry-run
# Live migration (MUST hold commit-mutex:main before calling):
bash scripts/orch-backlog-stub.sh
# Multi-lane: LANES env var (comma-separated, mirrors the STUB_FIELDS idiom) or --lane=<x> CLI flag
# (single-invocation override — does NOT merge with the LANES default, e.g. --lane=review previews
# review[] ALONE, not backlog[]+review[]). Allowed lanes: backlog, ready, review.
bash scripts/orch-backlog-stub.sh --dry-run --lane=review
LANES="backlog,ready,review" bash scripts/orch-backlog-stub.sh --dry-run
# Override stub field set (comma-separated; default per FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE
# below — depends_on/depends/blocked_by MUST stay in any override, see that note):
STUB_FIELDS="id,title,priority,size,type,zone,status,sprint,detail_ref,depends_on,depends,blocked_by" \
  bash scripts/orch-backlog-stub.sh --dry-run
# Owning brief: docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §HSC-4
#   Multi-lane extension: docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.2
# Called from: HSC-4 one-time migration; pm/flow/main.md when adding new backlog items;
#   FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT one-time LANES=backlog,ready,review
#   migration (supervised, run separately from the code change that added lane support)
```
Strips prose from every item in the configured `LANES` (default: `backlog` only — byte-identical
behavior for the ~10 existing callers that do not set it) of hot orch-state; moves full items
(id-keyed) to the SAME `docs/data/orch/archive/backlog-detail.json` (`items` is a flat `id -> object`
map, not lane-scoped — matches the live convention `po-detail-resync-review-lifecycle-routing.sh`
already depends on). Adds detail_ref pointer to every stub. Atomic temp-then-rename; cold-first
ordering; mtime-CAS retry; idempotent — **per-field deep merge** on re-run (F-3 fix, below), NOT
"existing cold wins wholesale" (that was the pre-fix bug). Script name kept unchanged (not renamed to
reflect the 3-lane scope) — blast-radius decision, 10+ existing call sites reference it by name.
Lazy-load full detail for one id (any of the 3 lanes) — `.items` is ARRAY-shaped (see F-4 below, NOT
id-indexable): `jq '.items[] | select(.id=="<id>")' docs/data/orch/archive/backlog-detail.json`
Internal orch-apply.sh call propagates `ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}"` (same
no-op-in-production safety propagation as orch-cold-evict.sh above). Does NOT set
`ORCH_APPLY_ALLOW_SHRINK` — this script only strips fields, lane array lengths are unchanged, so it
never trips the conservation guard.
**FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE (2026-07-30, AC-4):** default `STUB_FIELDS` now
includes `depends_on,depends,blocked_by` (was: `id,title,priority,size,type,zone,status,sprint,
detail_ref` only). Root cause closed: a re-run of this migration used to silently strip an inline
dep from a hot row while the cold `backlog-detail.json` entry's own stale `depends_on: null`
survived (the pre-F-3 shallow "existing cold wins" merge, superseded below) — a dependency set
correctly could be silently unset, re-opening a gate `scripts/lib/devteam-eligibility.jq`'s
`effective_depends_on()` had previously closed. NEVER override `STUB_FIELDS` without these 3 names.
**FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT (2026-08-15, F-3 prerequisite fix):**
`build_detail_temp()`'s cold-merge was DATA-DESTRUCTIVE on re-run — the shallow
`.items = ($new_items + .items)` (plain jq `+`, right-hand-object-wins-whole-key, no recursion) meant
ANY field added to the hot row since the row's last stub (e.g. a fresh `review_note`) was silently
discarded whenever an id already existed in cold — not just overridden, the entire hot-side content
for that id vanished with zero error, zero trace. Fixed to `.items = (.items * $new_items)` — jq's
recursive object-merge operator, hot (`$new_items`, right operand) winning per-field on any key
present in both sides, cold-exclusive prose surviving untouched, hot-exclusive fresh prose picked up.
This is also what makes the multi-lane extension above SAFE to run repeatedly across
`ready[]`/`review[]` (both actively-edited-during-review-lifecycle lanes, unlike `backlog[]`) — the
prior shallow merge could not safely be re-run against actively-changing rows without risking silent
loss of live review/PO/architect prose. Regression proof (incl. a reproduction of both the pre-fix
depends_on-reopen scenario AND the F-3 hot-exclusive-field data loss, RED verified against pre-fix
code via `git stash`, GREEN post-fix): `bash scripts/orch-backlog-stub.test.sh` (T1-T2 = AC-4
STUB_FIELDS coverage, defense-in-depth note on T2; T3-T4 = F-3 cold-merge coverage; T5-T7 = LANES/
`--lane` multi-lane coverage — default-byte-identical / `--lane` override-not-merge / combined
`LANES=backlog,ready,review` single-run reconciliation).
**FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION (2026-08-15, F-4/F-5, the
crash that blocked the LANES migration above from ever actually being run):** the F-3 merge fix above
still hardcoded `.items * $new_items` as an object*object merge — the REAL live
`docs/data/orch/archive/backlog-detail.json` `.items` is a 442-element ARRAY of id-bearing objects
(same live shape as `FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX`, 2026-07-09), so every real
invocation of `build_detail_temp()`'s merge branch crashed (`array (...) and object (...) cannot be
multiplied`, exit 5) — reproduced against a scratch copy of the live file (PO, 2026-08-15). Every
fixture in T1-T7 pre-seeds an OBJECT-shaped cold file, which is why this was never caught.
**Fix (AC-1):** `build_detail_temp()` now normalizes the EXISTING cold `.items` (array or object) via
`scripts/lib/devteam-eligibility.jq`'s `detail_items_from()` — reused via `jq -L "$REPO_ROOT" 'include
"scripts/lib/devteam-eligibility"; ...'`, NOT a second hand-rolled shape-check — before the F-3
per-field merge, then flattens the result back to an ARRAY for the write. **Shape decision (documented
per AC-1):** cold `.items` is now ALWAYS written back ARRAY-shaped (both the merge branch and the
fresh-create branch) — matches the real live shape, matches
`po-detail-resync-review-lifecycle-routing.sh`'s own `.items | map(...)` read+write convention (the
ONLY other writer of this file, which unconditionally re-serializes as an array on its next matching
run regardless of what this script wrote — object output would not even be stable across both
writers), and is the only shape that can round-trip a cold item lacking `.id` (a pre-id-addressing-
scheme legacy record — one exists in the live file today, the `ORCH-STATE-HOT-COLD-SPLIT` follow-on
stub) without destroying it; `build_detail_temp()` captures any such id-less cold item separately and
re-appends it untouched. The lazy-load pattern above and this script's own header comment were updated
to the array-indexing form to match. The adjacent, previously-flagged-not-fixed reconciliation bug
(`.items | keys` on an array yields integer-string indices, not ids, silently defeating the post-write
hard gate — flagged by `scripts/po-eligibility-clause-d-detail-first-lifecycle-20260808.jq` but not
repaired there) was fixed in the same pass (reuses `detail_items_from()` again), since AC-4 requires
reconciliation to actually PASS against the real shape, not just "exit 0."
**Fix (AC-2, F-5):** `STUB_FIELDS` is an unconditional whitelist, so `build_hot_temp()` used to silently
strip any `po_goahead_<ts>` ratification stamp from a hot row on re-run — `should_hold` (WF-2
SUPERVISED-HOLD, `docs/agents/dev-team/flow/main.md`) reads a `^po_goahead`-matching key straight off
the HOT row (union'd with `.head`, no cold fallback), so this would REVOKE a PO ratification with zero
error/trace. Fixed by preserving any key matching `^po_goahead` through the strip by PREFIX (not adding
fixed names to `STUB_FIELDS` — po_goahead keys are timestamped/open-ended, one new key per stamp).
Verified against the live 6 `ready[]`/`review[]` rows carrying a `po_goahead_*` stamp today: all 6
byte-identical post-migration-rehearsal.
Regression proof: `bash scripts/orch-backlog-stub.test.sh` T8 (ARRAY-shaped cold input, the exact gap
that hid F-4, plus id-less-record round-trip) + T9 (`po_goahead_*` survival, prefix-scoped not a
blanket keep-all) + T4c (shape decision self-heals object-shaped legacy input to array on write) — 35/35
total, RED-verified pre-fix (T4c/T8/T9 fail; script crashes exit 5 on T8's fixture). AC-4 live rehearsal
(mandatory before claiming done, PO's exact repro recipe against a scratch copy of the real files, never
the live files themselves): pre-fix exit 5; post-fix exit 0, `Reconciliation PASS`, all 6 live
`po_goahead_*` rows + the 1 id-less legacy record verified byte-preserved, hot file 3,455,546B →
1,209,788B.

**CANONICAL: Context-bloat backstop regression test (FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH + TE-T24 + UC-CRITIC-HOOKS-ENFORCEMENT)**
```bash
# Regression: T1 archive/*.md >200L → EXEMPT | T2 top-level notebooks/*.md >200L → BREACH (line-cap)
#   | T3 mega-line 5L/>12000B → BREACH (byte-cap, passes line cap — the evasion case) | T4 normal
#   150L file within both caps → CLEAN (no false positive) | T5 corrupted file-size-caps.json → exit 1
#   (prerequisite crash, NOT the pre-fix silent "non-governed path" exit 0).
bash scripts/agents-flow/context-bloat-backstop.test.sh
# Exit 0 = all 5 pass. Exit 1 = failure.
# Owning brief: docs/architecture-briefs/2026-05-24-context-bloat-backstop-hook.md §2a
# Byte-cap predicate (MATCHED_CAP x 60 bytes, reason='byte-cap', SAME settle-window as the line
# predicate; a line-based size-justification never suppresses it): TE-T24, see
# docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-24
```

**CANONICAL: Hook-enforcement crash discriminator (UC-CRITIC-HOOKS-ENFORCEMENT FR-1/FR-2/FR-3)**
```bash
# Shared helper (sourced, not executed) by the 4 load-bearing PostToolUse/Stop hooks:
scripts/agents-flow/lib/hook-guard.sh
#   hg_run <label> <cmd...>          — merged-stream crash discriminator (0=success, prints
#                                       stdout; 1=prerequisite crash, prints
#                                       "[<label>] PREREQUISITE-FAILURE: exited <n>: <output>" to stderr)
#   hg_resolve_project_root          — PROJECT_ROOT resolution: distinguishes "git binary
#                                       missing" (real crash, returns 1) from "git ran fine,
#                                       just not inside a repo" (legitimate fallback to
#                                       $CLAUDE_PROJECT_DIR, unchanged from before)
# Applied ONLY at the named input-boundary guards of orch-state-hook-bash-backstop.sh
# (CRITICAL), context-bloat-backstop.sh, notebook-auto-prune.sh, branch-hygiene-stop.sh
# (all HIGH) — NOT retrofitted across every exit-0 site in these scripts (scope: BA spec
# §2 FR-2 + architect Verified Paths).
# FR-1: .claude/settings.local.json's 4 corresponding hook invocations no longer append
#   `2>/dev/null || true` — a crashed prerequisite now surfaces (exit 1) instead of being
#   silently coerced to exit 0 (that file is machine-local/gitignored — this repo's copy
#   of these 4 command strings is not itself a tracked artifact).
# branch-hygiene-stop.sh has OPPOSITE polarity (its 3 `git` calls feed a problems[] report,
#   not an early exit) — a crash there flips a problems+=(...) entry AND sets exit 1 at the
#   end, instead of the pre-fix "" / true fallthrough that read as "clean".
# Test coverage: scripts/agents-flow/orch-state-hook.test.mjs (AC-3, retitled + 2
#   crash-injection cases), context-bloat-backstop.test.sh (T5), notebook-auto-prune.test.sh
#   (T8), scripts/agents-flow/branch-hygiene-stop.test.sh (NEW — T1-T4, first coverage).
# FR-3: system-auditor tier1-probe.md § A-33 "Hook Enforcement Liveness" (existence +
#   executable-bit + settings-registration check for the 4 scripts above, reuses
#   scripts/emit-audit-signal.sh — zero new plumbing).
# Owning spec: docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md (FR-1..FR-6, architect
#   Brownfield Findings). FR-5 (explicit non-goal): orch-state-hook-prewrite.mjs is
#   untouched — it is already fail-closed, a different hook from the one this task fixes.
```

**CANONICAL: Tick-preflight usage telemetry shared lib (TICK-PREFLIGHT-USAGE-INSTRUMENTATION WU-0)**
```bash
# Shared helper (sourced, not executed) — WU-1/WU-2/WU-3 wire this into each
# script's own pre-existing "Standalone execution" trailer (never inside
# _emit_verdict()/run_probe()/run_tiered_probe(), zero touches there):
scripts/agents-flow/lib/tick-telemetry.sh
#   tt_capture_and_log <script_name> <fn> [args...]  — convenience wrapper:
#                                       captures <fn>'s real stdout + exit
#                                       code, reprints byte-identical, logs,
#                                       returns <fn>'s real $rc unaffected
#                                       by anything logging-related (AC-4/5).
#   log_tick_usage <script> <captured_json> <elapsed_ms> <exit_code>
#                                     — lower-level primitive: derives
#                                       verdict/tick FROM the captured JSON
#                                       (never re-derived), appends ONE
#                                       jq -nc line via O_APPEND. Every
#                                       failure path ends in `return 0` —
#                                       never propagated to the caller.
#   tt_epoch_ms / _tt_log_path / _tt_rotate (internal)
# Usage (each of the 3 target scripts' trailer, 2-3 line diff):
#   if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
#     tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
#     exit $?
#   fi
# Recorded fields, EXACT (FR-5, "no more, no less"): ts, script, verdict,
# tick (null when the source verdict JSON has no "tick" key — true for
# auditor-tier1-probe.sh's run_probe()/run_tiered_probe() output),
# verdict_bytes, elapsed_ms, exit_code. NEVER recorded: CLAUDE_CODE_
# SESSION_ID (not even hashed — cowork-tick-preflight.sh:61-62's existing
# stated contract), any computed token/cost field.
# Destination: docs/data/telemetry/<script>.jsonl (git-ignored — one file
# PER SCRIPT, not shared — removes the rotation-fairness race a shared file
# would have by construction). Root resolved in order: TICK_TELEMETRY_
# LOG_PATH (explicit override, the ONLY seam auditor's tests need — its
# suite has no PREFLIGHT_ROOT-equivalent override for REPO_ROOT) ->
# PREFLIGHT_ROOT (cowork/dev-team) -> REPO_ROOT (auditor) -> git-toplevel-
# equivalent fallback computed from the lib's own on-disk location
# (belt-and-suspenders, unreachable on all 3 real callers today).
# Rotation (FR-8): TICK_TELEMETRY_MAX_LINES (default 5000), atomic tmp+mv
# tail-truncate on every append once the cap is exceeded — an append racing
# the tail-read/mv swap targets the file about to be replaced and is LOST;
# accepted tradeoff (one-file-per-script + each script's own election/SF-1
# lock already substantially serializes concurrent writers).
# CAVEAT (AC-11, HONESTY-BINDING, restate wherever verdict_bytes/elapsed_ms
# are surfaced): verdict_bytes is a LOWER BOUND on true per-tick cost — it
# excludes the cron prompt text + flow-doc lines the LLM loads that tick,
# measuring only the tool_result. Convert bytes->tokens using the EXISTING
# 4 chars/token ratio, docs/architecture-briefs/2026-05-21-token-toolcall-
# economy.md §W-1 ("At 4 chars/token") — do not invent a new ratio, do not
# bake the conversion into any script (scope_out (c), analysis is a
# separate future row after >=7 days of accumulated data). elapsed_ms is
# SUB-SECOND precision only when bash's EPOCHREALTIME builtin is available
# (bash 5+); on bash <5.0 (macOS system /bin/bash, confirmed 3.2.57 on the
# dev machine at ratification time) it silently degrades to SECOND
# precision (rounds down, reported as a multiple of 1000) — no per-row
# precision flag is recorded (would violate FR-5's "no more, no less");
# second-precision rows are statistically self-evident as clusters of
# `elapsed_ms % 1000 == 0` in the JSONL without one.
# Test coverage: scripts/agents-flow/lib/tick-telemetry.test.sh (53/53 —
# field-shape coverage for both cowork/dev-team's {verdict,tick,...} and
# auditor tier-2/3's {tier,checks_verdict,verdict,...} shapes; AC-4/AC-5/
# AC-6/R1 negative controls; rotation; Q6 root-resolution precedence;
# EPOCHREALTIME-available + EPOCHREALTIME-unset elapsed_ms paths).
# Owning spec: docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md
#   § [Architect] Q1-Q6 Ratification + Design decisions ("the trailer is the
#   real choke point"). Task handoff: docs/handoffs/TASK_TICK-WU-0-
#   TELEMETRY-LIB.md.
# WU-1/WU-2/WU-3 wiring complete (all DONE_VERIFIED 2026-08-12):
#   WU-1: docs/handoffs/TASK_TICK-WU-1-COWORK-WIRING.md (cowork-tick-preflight.sh trailer, commit 976e7c5b7)
#   WU-2: docs/handoffs/TASK_TICK-WU-2-DEVTEAM-WIRING.md (dev-team-tick-preflight.sh trailer, commit ac53ec856)
#   WU-3: docs/handoffs/TASK_TICK-WU-3-AUDITOR-WIRING.md (auditor-tier1-probe.sh case-statement, commit df16b5a93)
# code-janitor-tick-preflight.sh, db-integrity-probe.sh, orch-sentinel-lite-probe.sh remain
# explicit non-goals (FR-10) — designated follow-up only, do not widen.
```

**CANONICAL: Fleet worktree push backstop (TASK-AUTO-PUSH-A)**
```bash
# No-op check (safe, never pushes unless ahead > threshold):
bash scripts/fleet-worktree-push.sh --dry-run
# Live push (fires when git rev-list --count origin/main..HEAD > PUSH_THRESHOLD=20):
bash scripts/fleet-worktree-push.sh
# Override threshold (tunable, no rebuild needed):
PUSH_THRESHOLD=30 bash scripts/fleet-worktree-push.sh
# Owning flow: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP
# Fallback flow: docs/agents/dev-team/flow/post-cycle.md § Step PUSH-BACKSTOP
```

**CANONICAL: Cowork guaranteed-slot OS-level firer (F1-LAUNCHD-COWORK-BACKSTOP)**
```bash
# Dry-run (print what would fire for every guaranteed===true match, no claude invocation):
bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh --dry-run
# Live run (invoked by launchd every 15 min — calls cowork-match-slots.js,
# filters to guaranteed===true, fires each match's trigger_prompt verbatim):
bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
# Override claude binary path (env, no rebuild):
CLAUDE_BIN=/path/to/claude bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
# Owning flow doc: docs/standards/cron-jobs.md § Cowork Guaranteed-Slot Firer
# Plist: launchd/com.vn-market.cowork-guaranteed-slot-firer.plist
# Slots: every docs/data/cowork-schedule.json row with guaranteed:true — currently
#   chef-morning/eod/evening, digest-sunday/daily, tnb-audit, fb-daily, fb-weekend.
#   A new guaranteed:true row is covered automatically — ZERO script edits.
# OPS install: launchctl load ~/Library/LaunchAgents/com.vn-market.cowork-guaranteed-slot-firer.plist
# Self-check: scripts/agents-flow/auditor-tier1-probe.sh asserts this label (and every
#   other repo-tracked launchd/*.plist Label) stays loaded (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED)
#
# FAILURE ESCALATION (FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION, 2026-08-23):
#   every non-zero outcome (matcher command failure / unparseable matcher output / >=1
#   failing slot invocation) POSTs ONCE per tick to the Telegram BUG channel via a direct
#   curl. Direct curl is mandatory, not a shortcut: this script has no gateway/MCP access,
#   and the flow-level send_telegram never runs because the claude CLI dies before Step 0
#   of any flow. Pre-fix, 67h of 100% exit_code=1 invocations produced ZERO alerts while
#   launchctl reported the job healthy; the outage was found by a human noticing a missing
#   Facebook post two days later.
#   Cooldown is time AND content based: an UNCHANGED failure fingerprint re-alerts at most
#   once per ALERT_COOLDOWN_SECONDS (default 21600 = 6h); a NEW fingerprint alerts at once.
#   --dry-run never escalates. Missing credentials / a failed POST are logged as
#   ESCALATION-BLOCKED / ESCALATION-SEND-FAILED — never silently swallowed.
#   Env seams: CURL_BIN, ALERT_STATE_FILE, ALERT_COOLDOWN_SECONDS, FIRER_ALERT_CHAT_ID.
#   BUG chat id resolves FIRST from the real .env key TELEGRAM_REPORT_BUG_CHANNEL_ID, then
#   from TELEGRAM_BUG_CHAT_ID — docs/data/system-map.json .telegram_channels[] still carries
#   the latter (drift: no such key exists in .env), so binding to either name alone would
#   silently disable the escalation.
# Gate: bash scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh (53 checks, hermetic —
#   fake CLAUDE_BIN + fake CURL_BIN, zero real CLI invocations, zero network)
```

**CANONICAL: Incident-Lane Consumer — ILC (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS)**
```bash
INCIDENT_CAP=2   # named constant, main.md-local — same convention as QA_CAP
INCIDENT_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; incident_wip_in_progress' docs/data/orch/orch-state.json)
if [ "$INCIDENT_WIP" -lt "$INCIDENT_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" --argjson take_budget "$((INCIDENT_CAP - INCIDENT_WIP))" \
    --slurpfile detail docs/data/orch/archive/backlog-detail.json \
    --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
    -f scripts/devteam-backlog-claim-incident-lane-consumer.jq \
    docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
  # correlate the batch by the PAIR (claimed_at == $NOW, claimed_by == "dev-team (incident-lane consumer)"),
  # never by .head.next_action
fi
# Brief: docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md §4a-§4c
# Owning flow doc (agent-father's zone, lands AFTER this row):
#   docs/agents/dev-team/flow/main.md § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation,
#   inserted after the Session Gate and BEFORE § Review-Lane SECONDARY-Drain
#   (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW)
# Gate: bash scripts/audits/devteam-dispatch-gate-satisfiability.sh  § INCIDENT-LANE CONSUMER (13 assertions)
```
WHY: `ready[]` had exactly ONE generic consumer (RLC), claiming ONE row per invocation and only on
its ~1-in-6 rotation turn. Against a 68-row queue that is a throughput ceiling, so an urgent row is
buried behind whatever precedes it no matter how it is labelled — the architect measured that
ORDERING-ONLY fixes cannot move a BINDING THROUGHPUT constraint. ILC reuses QA-Drain's proven
throughput shape (batch claim + dedicated budget; 226→56 on the structurally identical problem).

Selector is PO's already-live `po_expedited_at` field (5 live rows, 0 code consumers before this) —
extend, don't duplicate. Sort is `[rank, po_expedited_at, idx]`: priority first (a stray P1-expedited
row never jumps a P0-expedited one), then OLDEST-expedite-first so a freshly-marked incident cannot
perpetually cut ahead inside the pool. **Severity changes throughput priority, never safety gating** —
the supervised / plan_only / epic-wrapper / deps_satisfied gates are all kept unrelaxed; PO's manual
dispatch remains the path for that rare intersection.

Budget: rows land in the SAME `in_progress[]` lane (a 10th `TaskBoardSchema.strict()` lane would be a
real schema change) but carry the DISTINCT `claimed_by: "dev-team (incident-lane consumer)"` marker
that `incident_wip_in_progress` counts — so they consume neither the shared `WIP<=2` slot nor compete
for it. `INCIDENT_CAP=2` is the entire answer to "must not become a 4th priority tier": however many
rows PO ever expedites, at most 2 are in flight at once and the rest queue, capped, inside the
incident pool. Known deliberate asymmetry (documented at the predicate): incident rows ARE still
counted by `wip_in_progress` — the conservative direction; correcting it would touch every sibling
gate. `.head` uses the same `$head_free` conditional guard as every sibling — no new write pattern,
so the single-linear head-writer collision-freedom proof is untouched.

**CANONICAL: Dev-team idle-capacity backlog pickup (SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority unsupervised depends_on-eligible
#    BACKLOG/TODO row, no-op if WIP>=1):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim (ready[] -> in_progress[] + .head, no-op if nothing bounded-1-stamped waiting):
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Idle-capacity backlog pickup (BOUNDED-1), Step 0b head-idle fall-through, before Step 1 PO triage. BOUNDED-1 gate: WIP (`wip_in_progress`, `scripts/lib/devteam-eligibility.jq` — `in_progress[]` only, excluding BLOCKED/`TERMINAL_SET` rows; corrected 2026-07-22 UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK, FURTHER corrected 2026-07-30 FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS — this bullet's prior `ready[].length + in_progress[].length` text was stale/pre-dated both fixes) must be `< 1` — this lane is capped at ONE task in flight (user-gated 2026-07-04, distinct from the WIP≤2 human/router-supervised budget). Both scripts are idempotent no-ops outside their gate condition; neither has a hardcoded task ID; both write ONLY through `orch-apply.sh`. **supervised gate (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` rows are NEVER auto-promoted — true if EITHER inline `.supervised` on the board row OR `backlog-detail.json` `.items[<id>].supervised` (detail-authoritative, no `.detail_ref` precondition) is true; absent/null in both = promotable. Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. Test: `scripts/test-devteam-bounded1-supervised-flag.sh`. **depends_on gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** promote only picks rows whose effective `depends_on` (inline, or looked up in `backlog-detail.json` for `detail_ref`'d rows) are ALL `DONE_VERIFIED` in some `task_board` lane; a dep resolving nowhere is conservative-skipped. Filter runs during candidate ranking, not just on the final pick — a blocked top-ranked row never starves an eligible lower-ranked one. Test: `scripts/test-devteam-bounded1-depends-on.sh`. **epic-wrapper gate (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** rows carrying a non-empty `children[]` (decomposition containers, e.g. `mode=audit-epic`/multi-child SPIKEs — not directly-dispatchable atomic tasks) are NEVER auto-promoted, regardless of `supervised` — `effective_children` mirrors `effective_supervised`'s precedence exactly (EITHER inline `.children` on the board row OR `backlog-detail.json` `.items[<id>].children` is non-empty, no `.detail_ref` precondition). Closes the 2026-07-09T23:17Z near-miss (AUDIT-FETCH-COMPLETE auto-claimed, point-fixed by hand) plus the structurally identical exposed row FACTORY-GUARD-CI-REGRESSION-SPIKE (`supervised:null` everywhere — the supervised gate alone could not have caught it). Test: `scripts/test-devteam-bounded1-epic-wrapper.sh`.

**CANONICAL: Design-Router Sweep — non-dev next_agent residual dispatch lane (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE, 2026-07-30)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority allowlisted non-dev-next_agent
#    row not already SLS's supervised+plan_only territory, no-op if WIP>=2):
jq --arg now "$NOW" \
  --argjson allowlist '["architect","ba","pm","po","agents-architect"]' \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-design-router-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim (ready[] -> in_progress[] + conditional-guard .head write, no-op if
#    nothing design-router-sweep-stamped waiting):
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Design-Router Sweep (DRS), 4th writer of the pre-existing WIP≤2 in_progress budget (BOUNDED-1 → SLS → RLC → **DRS** → QA-Drain → Step 1), Step 0b head-idle fall-through, before Step 1 PO triage. PO ratification: `docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md` STEP po-4. **Agent-identity allowlist** (`is_design_router_allowed`, `scripts/lib/devteam-eligibility.jq`) is DRS's compensating control in place of a supervised/plan_only flag gate — ratified NARROW: `{architect, ba, pm, po, agents-architect}`; `agent-father`/`ops`/`ops-mainserver-fetch`/`ops-vps-fetch`/`qa`/`system-auditor` explicitly excluded. **Eligibility** (`is_design_router_eligible`, same file): `is_non_dev_next_agent_unrouted` AND NOT (`effective_supervised` AND `effective_plan_only` both true — SLS's own territory, an AND not an OR, so a row carrying exactly one of the two flags remains DRS-eligible) AND allowlisted AND not an epic wrapper AND `depends_on` satisfied AND NOT detail-DEFERRED* AND no unbacked prose sequencing. **`.head` write is a MANDATORY conditional guard from day one** (never an unconditional replace — hard AC, PO ratification Q3) per the live `qadrain-head-slot-decouple` precedent (`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`). Test: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (DRS positive-fire + allowlist negative control + `.head` conditional-guard negative control) and `scripts/audits/bounded1-supervised-lane-report.sh`'s dedicated DRS section (DRS-ELIGIBLE vs DRS-STRANDED-OFF-ALLOWLIST split, non-gating).

**CANONICAL: Idle-Tick Rotation Selection — aged round-robin fairness + `$SELECTED`-driven gate-firing test (FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION, test extension FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS 2026-08-09)**
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Idle-Tick Rotation Selection — replaces the pre-2026-08-08 fixed-priority BOUNDED-1→SLS→RLC→DRS→QA-Drain(idle-tick)→Step1 fall-through (starved every lane below whichever sat first) with an aged round-robin over 6 candidates (`bounded1`/`sls`/`rlc`/`drs`/`qa_drain`/`step1_triage`), picking the single oldest-`last_served_tick` id each idle-fallthrough tick, ties broken by fixed declared order. **6, not 5 — shared-lib drift, not fixed here:** `rotation_selected($doc)` (`scripts/lib/devteam-eligibility.jq:466`) and `devteam-idle-chain-stamp.jq`'s `$known_ids` guard both still hardcode the original 5-id 2026-07-25-brief set (DRS added to the dispatch chain 2026-07-30, five days after those shipped) — main.md does NOT call either; it INLINES its own 6-id selection + stamp jq instead (flagged fast-follow, not yet landed: extend those 2 shared files to 6 ids and drop the inline duplicate). Test: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` § ROTATION FAIRNESS BOUND + `$SELECTED`-DRIVEN GATE-FIRING PROOF — replicates main.md's own inline 6-candidate selection/stamp jq byte-verbatim (deliberately NOT the stale shared-lib functions above, which would test a different DRS-blind algorithm), simulates 12 consecutive idle-fallthrough ticks (2 independent 6-tick windows) against a fixture carrying one dedicated row per board-touching lane, and dispatches each tick to that lane's REAL promote/claim script(s). AC-1 (fairness): both windows cover all 6 ids exactly once, deterministic bootstrap tie-break order (`bounded1,sls,rlc,drs,qa_drain,step1_triage`) asserted exactly. AC-4 (gate-firing, not just resolution): each `$SELECTED` tick's real script actually mutates board state (row moves lane) — plus a dedicated isolated-fixture no-same-tick-cascade proof (a genuinely empty turn still advances the stamp, so the next tick moves on to the next-oldest candidate rather than retrying the same lane).

**CANONICAL: Durable pending-triage-inbox negative-control test harness (FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE, 2026-08-09)**
```bash
node scripts/agents-flow/drain-signals-durable.test.js
```
AC-2 durability negative control for `.dev_team_idle_chain.pending_triage_inbox[]`
(`FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN` append + `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION`
Step-1 read/clear — brief §3.1-3.2) — a companion to, not a fork of,
`scripts/agents-flow/drain-signals.test.js`'s own single-drain-call scenarios: this file walks
the multi-tick chain a real dev-team session takes (drain → idle-tick rotation → Step 1 PO
Triage). **Scenario 1** (append succeeds → destructive drain runs → inbox fully populated,
payload inlined not pointered). **Scenario 2** (short-circuit): a LATER tick's rotation winner is
`bounded1` (not `step1_triage`) — runs the REAL `scripts/devteam-backlog-{promote,claim}-
bounded1.jq` (+ their `scripts/lib/devteam-eligibility.jq` dependency, copied into the isolated
harness so `include "scripts/lib/devteam-eligibility";` resolves — jq module paths are CWD-
relative, not file-relative, see that file's own header) against a seeded eligible backlog row —
asserts the row actually moves AND the durable inbox from scenario 1 is byte-identical afterward.
**Scenario 3** (triage turn): replays Step 1's own read + subtractive-by-`envelope_id` clear jq
filters byte-verbatim from `docs/agents/dev-team/flow/main.md` — empties the inbox.
**Scenario 3b**: a concurrent append landing between Step 1's read and its clear write survives
the clear untouched (proves "never a blind `= []`"). **Scenario 4** (append FAILS): makes the
CONTAINING DIRECTORY of `orch-state.json` read-only (`0o555`) so `orch-apply.sh`'s own `mktemp`
write step fails — a genuinely different failure point than `drain-signals.test.js`'s pre-existing
"orch-state.json missing" scenario (that one fails at `drain-signals.js`'s own
`!fs.existsSync(ORCH_STATE)` early-exit) — asserts no destructive action, byte-unchanged
`orch-state.json`, then retry-on-recovery once the directory is writable again succeeds cleanly.
Plus a **backward-compat** negative control (no `dev_team_idle_chain` key at all — pre-migration
shape — defaults to `[]`, bootstraps cleanly on first append) and the **Conservation Guard
Extension** coverage cross-referenced from the conservation circuit-breaker CANONICAL entry above
(48/48 as of the 2026-08-14 update — 2 new cases added: a declared full-wipe accept, and an
undeclared single-entry-consume reject). Isolation: every scenario builds its own `mkdtemp` harness (real
`orch-apply.sh`/`orch-validate.mjs`/`orch-conservation-check.mjs`/`orchStateSchema.ts` gate chain,
copied — `node_modules` SYMLINKED never copied) — never touches the live `docs/data/orch/
orch-state.json` or `docs/signals/*.json`.

**CANONICAL: PO Manual-Dispatch Sweep — the "manual/PO dispatch" producer (FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH, 2026-07-31; bounded re-admission FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW, 2026-07-31)**
```bash
NOW_EPOCH=$(date -u +%s)
DRS_ALLOWLIST='["architect","ba","pm","po","agents-architect"]'
STALE_SECONDS=14400   # 4h — keep in lockstep with docs/agents/po/flow/manual-dispatch-sweep.md Step 1 and scripts/audits/po-manual-dispatch-sweep-verify.sh's own STALE_SECONDS
jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --argjson stale_seconds "$STALE_SECONDS" \
  --argjson allowlist "$DRS_ALLOWLIST" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -L scripts/lib \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   def flag_reentrant($now_epoch; $stale_seconds):
     (.po_manual_dispatch_flagged_at // "") as $flagged
     | ($flagged == "")
       or (try (($now_epoch - ($flagged | fromdateiso8601)) > $stale_seconds) catch false);
   (detail_items_from($detail)) as $detail_items | dep_status_map($archive) as $status_map
   | [ ((.task_board.backlog // []) | to_entries[] | .key as $idx | .value
        | select(.status == "BACKLOG" or .status == "TODO")
        | select(. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | {id, rank: (. | priority_rank), idx: $idx, class: "DRS-STRANDED-OFF-ALLOWLIST"}),
       ((.task_board.backlog // []) | to_entries[] | .key as $idx | .value
        | select(.status == "BACKLOG" or .status == "TODO")
        | select(. | is_backlog_xor_gap($detail_items; $status_map))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | {id, rank: (. | priority_rank), idx: $idx, class: "BACKLOG-XOR-GAP"}),
       ((.task_board.ready // []) | to_entries[] | .key as $idx | .value
        | select(. | is_ready_xor_gap($detail_items))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | {id, rank: (. | priority_rank), idx: $idx, class: "READY-XOR-SUP-OR-PLANONLY"})
     ] | sort_by([.rank, .idx])' \
  docs/data/orch/orch-state.json
```
Owning flow doc: `docs/agents/po/flow/manual-dispatch-sweep.md`, MANDATORY pre-check every PO tick (pointer: `docs/agents/po/flow/main.md`, same placement pattern as `supervised-goahead.md`). Producer for the live classes `docs/agents/dev-team/flow/main.md`'s Lane × Gate Coverage Matrix and `scripts/audits/bounded1-supervised-lane-report.sh`'s DRS/READY-XOR/BACKLOG-XOR-GAP sections both name as "reachable only by manual/PO dispatch" but, before this fix, no PO flow step ever produced (4th instance of this "documented consumer, no documented producer" defect class — see `supervised-goahead.md`'s header for the 3rd). Shared predicates (`is_drs_stranded_off_allowlist`, `is_backlog_xor_gap`, `is_ready_xor_gap`, `scripts/lib/po-manual-dispatch-eligibility.jq`) `include` `scripts/lib/devteam-eligibility.jq` and reuse its predicates verbatim — zero new predicate logic, three call sites (this sub-flow, `bounded1-supervised-lane-report.sh`'s DRS/READY-XOR/BACKLOG-XOR-GAP sections — retrofitted 2026-07-31, extended 2026-08-07, live-diffed byte-identical against a pinned snapshot before/after each retrofit — and the regression verifier below), never a hand-copy. `is_backlog_xor_gap` (`FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER`, 2026-08-07 — answers po_residual_measurement_20260728's "should SLS's AND become an OR?" question with "no, fold the residual into this human-gated sweep instead" — see that predicate's own header for the full reasoning) is disjoint from `is_drs_stranded_off_allowlist` by construction (dev-role-or-absent `next_agent` vs non-dev `next_agent`) — never double-counts a `backlog[]` row into two classes. Does NOT write `.head`/`in_progress[]`/any WIP-budget lane — PO is not dev-team's dispatch loop and every target class was deliberately excluded from that chain by policy (DRS allowlist ratification; sup-XOR-plan_only residual gaps). Action on the single top eligible candidate per tick (unflagged, OR flagged-but-stale beyond `$stale_seconds` — `flag_reentrant`, added by the bounded-re-admission fix above because the original PERMANENT exclusion left a stamped-but-never-dispatched row (stamp/dispatch are not atomic — e.g. dev-team's WIP cap saturated that tick) invisible to every later sweep forever, live-proved by `TE-T12`): additive `po_manual_dispatch_flagged_*` stamp (idempotency only, never a lane-move/gate-clear — re-stamping an already-flagged-but-stale row is the SAME overwrite as a first-time flag, just bumps the freshness clock) + fold into PO's own `BATCH` this tick — the SAME dispatch mechanism every other PO-self-initiated finding already uses. Same-tick double-BATCH stays structurally impossible regardless of the staleness window's value: Step 1 computes the candidate list once, before Step 2 stamps the single top pick. Out of scope (explicit): widening the DRS allowlist to admit `agent-father` — a separate, already-ratified blast-radius control; writing `.head`/`in_progress[]` from PO (see owning flow doc's design note). Test: `scripts/audits/po-manual-dispatch-sweep-verify.sh` (doc-existence + main.md pointer + synthetic-fixture replay covering every named Matrix branch, positive and negative controls, + `flag_reentrant`'s fresh-flagged-excluded / stale-flagged-re-admitted controls).

**CANONICAL: Supervised-Lane Sweep (SLS) claim — `ready[]` FALLBACK for unstamped rows (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority doubly-gated
#    effective_supervised && effective_plan_only row, no-op if WIP2>=2):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim — PRIMARY (SLS-stamped ready[] row) OR, if none, FALLBACK (an
#    unstamped ready[] row matching the same doubly-gated predicate that
#    arrived via a route OTHER than step 1 above — PO hand-placement,
#    PM/architect decomposition, an earlier manual promote). `--slurpfile
#    detail`/`--slurpfile archive` are now REQUIRED (previously were not —
#    a stale copy-paste of this snippet from before 2026-07-30 will jq-error
#    "$detail is not defined"):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Supervised-Lane Sweep (SLS), 2nd writer of the pre-existing WIP≤2 in_progress budget (BOUNDED-1 → **SLS** → RLC → DRS → QA-Drain → Step 1), Step 0b head-idle fall-through, before Step 1 PO triage — see that section's own "Lane × Gate Coverage Matrix" for the full `(lane × supervised × plan_only × epic-wrapper)` resolution table. **ROOT CAUSE closed:** a `ready[]` row carrying BOTH `effective_supervised==true` AND `effective_plan_only==true` but lacking the `promoted_by="dev-team (supervised-lane sweep)"` stamp only step 1 above writes was rejected by ALL FOUR dispatch pickers (BOUNDED-1 never reads `ready[]`; the claim script's own PRIMARY selector required the exact stamp; RLC excludes any supervised/plan_only row unconditionally; DRS excludes the doubly-gated class and only reads `backlog[]`) — unreachable by construction, confirmed live 2026-07-30 against 3 P0 `ready[]` rows. **FALLBACK eligibility** (reuses `scripts/lib/devteam-eligibility.jq`, no forked logic): `effective_supervised` AND `effective_plan_only` both true, NOT `is_epic_wrapper` (a decomposition-container row is closed out separately — see `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4 Epic-Wrapper Autoclose Sweep, never re-promoted/re-claimed by any of the four dispatch pickers), `deps_satisfied`, NOT detail-DEFERRED*. Resolves `dispatch_lane` via the same `resolved_dispatch_lane` helper SLS-promote uses. **Does NOT forge `promoted_by`** (explicit constraint — forging provenance was rejected as a fix) — the row's existing `promoted_by` (null, or whatever placed it) is carried through unchanged; `claimed_by` gets a distinct string (`"dev-team (supervised-lane sweep — unstamped ready fallback)"`) so PRIMARY vs FALLBACK claims stay auditable in an audit trail. PRIMARY always takes priority over FALLBACK within one invocation (at most one claim per tick, same discipline as every other picker in this chain). Test: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (§ SLS-claim FALLBACK — positive fire + `dispatch_lane` resolution + `promoted_by`-not-forged + epic-wrapper/unmet-`depends_on` negative controls + PRIMARY-vs-FALLBACK ordering, 40/40 PASS) and `scripts/audits/bounded1-supervised-lane-report.sh`'s new READY-PRIMARY (gates exit code)/READY-WRAPPER/READY-XOR sections plus REVIEW-SUP-PO (confirms `review[]` supervised+plan_only rows were never actually gated out of the pre-existing Review-Lane QA-Drain lane — that claim script has no supervised/plan_only check at all, by design).

**CANONICAL: Tool list-doc stub generator (TE-T28)**
```bash
python3 scripts/gen-tool-list-stubs.py              # live run — writes the current missing delta
python3 scripts/gen-tool-list-stubs.py --dry-run     # preview only, writes nothing
# Offline/test override (skips the live gateway call):
TOOL_SCHEMA_JSON_OVERRIDE=<path-to-list_server_tools-json> python3 scripts/gen-tool-list-stubs.py --dry-run
```
Diffs `docs/data/tool-registry.json` (SSOT tool inventory) against the basenames already
under `docs/agents/tools/list/` and mints a lean stub (get_price_history.md shape) for
exactly the missing delta — idempotent, never overwrites an existing stub, never hardcodes
a count. Live parameter schema is pulled via the gateway meta-tool `list_server_tools`
(server=`vn-market`) through the shared bash bridge `scripts/agents-flow/mcp-call.sh`'s
`mcp_call_gateway_meta()` — no duplicated transport. No-fabrication: if the live schema is
unreachable, or a specific tool is absent from the live listing, the stub is still emitted
from registry metadata only and clearly flagged `LIVE SCHEMA UNAVAILABLE` with zero guessed
parameter rows. Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-28`. Companion fix
(same task): `.claude/skills/anti-hallucination/SKILL.md` — "no list/ doc" is a DOC GAP
against `docs/data/tool-registry.json`, not proof the tool doesn't exist.

**CANONICAL: Tool inventory INDEX generator (TE-T31)**
```bash
bash scripts/gen-tools-index.sh              # regenerate docs/agents/tools/list/INDEX.md
bash scripts/gen-tools-index.sh --check      # exit 1 if regeneration would change the file, writes nothing
```
Renders `docs/agents/tools/list/INDEX.md` straight from `docs/data/tool-registry.json`
`.groups[]` — total (`.totalCount`) and every per-category count (`.groups[].count`) are
computed LIVE, nothing hardcoded. Kills the recurring "tool-count 3-way drift" class
(INDEX.md self-declared a stale "157 tools / canonical tool inventory" vs the registry's
184, with its own header table disagreeing with its own section headings). Idempotent —
no embedded wall-clock timestamp, only the registry's own `.lastUpdated` field is echoed,
so a no-op run against an unchanged registry is byte-identical (proven: two consecutive
runs both print `NOOP`). Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-31`.

**CANONICAL: Cold archive sweep — handoffs/sessions/po-decisions rotation (TE-T33)**
```bash
bash scripts/agents-flow/cold-archive-sweep.sh                # normal run — no-op except on the 1st of the month
COLD_ARCHIVE_FORCE=1 bash scripts/agents-flow/cold-archive-sweep.sh   # force-run any day (ad-hoc / test)
```
Monthly-guarded, idempotent. Three legs: (1) `docs/handoffs/*.md` >30d AND not referenced
by any OPEN `task_board` lane (backlog/ready/in_progress/review/qa — computed live via jq,
never hardcoded) → `docs/handoffs/archive/YYYY-MM/`; (2) `docs/agent-memory/sessions/*`
non-`.md` files >30d → `docs/agent-memory/sessions/archive/YYYY-MM/` (the `.md` leg is
already owned by `memory-prune-sweep.sh` at a tighter 14d flat-archive threshold — no
overlap); (3) `docs/agent-memory/decisions/po-decisions.md` rotated at 200L via the SAME
drop-oldest-`## ` algorithm as `notebook-auto-prune.sh`, delegated through that script's
new opt-in `NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH` governed-path hook (default unset = zero
behavior change on the hot PostToolUse path) — no duplicated prune scheme. Decision-journal
archival (`decisions/sprint-*.md`) is explicitly OUT of scope — SUPERSEDED by
`scripts/agents-flow/decision-journal-archive.sh` (UC-MDH-P4, status-based not mtime-based;
board row TE-T33 carries this coordination note). Owning flow:
`docs/agents/code-janitor/flow/main.md` § Cold Archive Sweep. Test:
`scripts/agents-flow/cold-archive-sweep.test.sh`. Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-33`.

**CANONICAL: Foreign-flow freshness recheck harness (FFLOW-STALE-0723-B-RECHECK-HARNESS)**
```bash
scripts/check-foreign-flow-freshness.sh              # live gate — exit 0 PASS / 2 STALE / 3 ERROR
scripts/check-foreign-flow-freshness.sh --self-test    # proves fresh/stale/weekend-nuance branches
scripts/check-foreign-flow-freshness.sh --help
```
Neutral, weekend/holiday-aware verification instrument for market foreign-flow ("khoi ngoai")
data — the "assume complete fixed" gate for any foreign-flow VPS/pipeline recovery incident
(origin: FFLOW-STALE-0723, Vinahost VPS suspended-for-non-payment outage). Probes
`get_market_foreign_flow` via `scripts/agents-flow/mcp-call.sh`; computes the Last Completed
Trading Session (LCTS) by shelling into the SAME canonical calendar module the OHLCV pipeline
uses (`apps/mcp-server/src/domain/services/vnTradingCalendar.ts` via `bun -e`) — NO hardcoded
holiday list in the script. Emits one stdout line
`FOREIGN_FLOW_FRESHNESS verdict=<PASS|STALE|ERROR> latest_date=... lcts=... now_ict=...` for
cron/CI capture; any ambiguity (probe/parse/calendar failure) is ERROR/exit 3, never a false
PASS. Owning monitoring doc pointers: `docs/agents/ops/flow/vps.md`,
`docs/agents/system-auditor/flow/main.md` § Per-Source Fetch Freshness.

**CANONICAL: Commit-path peer-index sweep guard (FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK)**
```bash
./scripts/git-hooks/install.sh                       # symlinks pre-commit + post-commit into .git/hooks/ (re-run after a fresh clone / .git rebuild)
bash scripts/git-hooks/pre-commit.test.sh             # permanent regression suite, disposable scratch repos only
```
Universal, transport-agnostic `pre-commit` hook — Layer 0 of the sweep-guard fix. Detects a
BARE (pathspec-less) `git commit` about to absorb ALL currently-staged content, including a
concurrent peer's `git add`'d WIP, via the `$GIT_INDEX_FILE` basename discriminator
(`index`/`index.lock` = BARE; `next-index-<pid>.lock` = pathspec-SCOPED, structurally immune).
WARN-by-default fleet-wide (stderr banner + `.git/sweep-guard.log` + best-effort
`docs/signals/*.json` bug-escalation, bash+jq only); opt-in hard-block per call site via
`GIT_SWEEP_GUARD_MODE=reject` only once that site's own commit line has migrated to pathspec
form (reference migration: `.claude/skills/commit-mutex/SKILL.md` Step 3c). Binds the
INV-GATEWAY-1-exempt population (dev-\*/qa/ba/pm/architect) too — a git hook sits beneath the
MCP-bound commit-mutex skill, so it cannot be opted out of the way a skill can. Owning brief:
`docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md` §4.1/§4.3.
Discriminator premise verified live via `scripts/audits/verify-commit-sweep-discriminator.sh`
(re-run on any new git version before trusting this hook).

**NON-GOAL (added 2026-08-01, `FIX-SWEEPGUARD-SAMEFILE-HUNK-PATHSPEC-ONLY-SEMANTICS-NONGOAL-AND-
DETECTOR`) — same-file, differently-staged hunks:** the fleet-mandated `git commit -m ... --
<path>` pattern (`.claude/skills/commit-mutex/SKILL.md` Step 2c, `.claude/skills/commit-boundary/
SKILL.md` RULE 2.5, `.claude/skills/commit/SKILL.md` Step 2 carry the actual mandate text) closes
the CROSS-FILE sweep only (§2.1 of the owning brief) — it does NOT guarantee that only the STAGED
SUBSET of the named path itself lands. Git's own `-o`/`--only` semantics (`git-commit(1)`) commit
the pathspec'd path's CURRENT WORKING-TREE content, not the index; if two peers (or one actor
across two edits) touch disjoint hunks of the SAME file, a pathspec-scoped commit on that file can
still land both hunks — reproduced 2/2 (commit `2f16eea16`), see owning brief §2.7. This is a
documented, non-mechanically-closable NON-GOAL (no per-hunk attribution exists in git to tell
"my own further edit" from "a peer's differently-staged hunk" apart) — same disposition precedent
as the existing directory/dot-pathspec NON-GOAL (§2.3). Mitigated, not closed, by a non-gating WARN
detector (`_detect_samefile_pathspec_only_divergence` in `scripts/git-hooks/pre-commit`, staged-
index-blob vs about-to-be-committed-blob comparison per named SCOPED path) — never overrides
`GIT_SWEEP_GUARD_MODE`, never blocks a commit. Test: `scripts/git-hooks/pre-commit.test.sh` T11
(pins the `--only` behavior) / T12 (detector false-positive negative control).

**FIX (2026-08-01, `FIX-SWEEPGUARD-SAMEFILE-DETECTOR-UNSTAGED-PATH-FALSE-POSITIVE`) — unstaged-path
false positive closed:** the detector above false-fired on every ordinary tracked-file pathspec
commit with NO preceding `git add` (e.g. every `scripts/orch-apply.sh` atomic-rename write +
pathspec commit, `docs/data/orch/orch-state.json` dominant) — `git rev-parse ":$f"` against the real
index returns the HEAD blob for ANY tracked path and never returns empty, so its "never staged"
fail-open check never fired. Now also skips when the real-index blob equals `HEAD:$f`'s blob
(nothing genuinely staged). Confirmed 10/10 live fires were false positives before this fix; T11
(peer-staged) and T12 (`git add` idiom) unaffected. Test: `pre-commit.test.sh` T13. Detail: owning
brief §2.7.

**CANONICAL: Same-session escalation actuator + deploy baseline (FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION, corrected by FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR)**
`scripts/git-hooks/pre-commit`'s sweep-guard escalation block converts repeated BARE commits from
the SAME `$CLAUDE_CODE_SESSION_ID` into a hard block (the `(threshold+1)`th BARE commit in default
`mode=warn` is rejected) without a fleet-wide `GIT_SWEEP_GUARD_MODE=reject` flip. **Rollback:**
`GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=0` disables escalation entirely for the caller's own commit
(the hook's own ESCALATED-REJECT stderr already names this, but it is documented HERE too so an
agent can find it BEFORE ever tripping the block, not only after). **Renamed "per-actor" ->
"per-session"**: `$CLAUDE_CODE_SESSION_ID` is a per-ROUTER-COORDINATION-SESSION id — every subagent
spawned from one router (dev-team/pm/po/architect/developer/qa/dev-\*/...) inherits the SAME value
by documented framework design (`.claude/skills/dispatch-claim/SKILL.md` "Inheritance note"), and
no narrower per-agent identifier is reachable inside a git hook subprocess (verified, not assumed:
`CLAUDE_CODE_BRIDGE_SESSION_ID` is coarser still — one top-level CLI session spanning many
DIFFERENT coordination sessions; `CLAUDE_PID` is the top-level host process, also constant across
every subagent in the tree; `$$` changes every invocation and so cannot even correlate repeat
offenses by ONE agent). `threshold=3` is therefore a POOLED budget for the whole coordination
session, not 3-per-agent — flagged, not silently re-tuned (the number itself needed no change, see
the deploy-baseline note below for why). **Deploy baseline (AC-1):** the counter only counts BARE
log lines timestamped AT OR AFTER a self-initializing per-clone marker
(`.git/sweep-guard.escalation-baseline`, created once with the current UTC time on the first hook
invocation to reach the escalation branch post-deploy) — pre-existing backlog in
`.git/sweep-guard.log` (append-only, NEVER truncated — it is the forensic record the whole
sweep-guard family depends on) is excluded by construction. **Observation window:** the original
(pre-baseline-fix) actuator was live long enough to put 2 real sessions over threshold using the
unwindowed counter (see `FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR`
evidence) — that window is DISCARDED as contaminated data; the owning brief's §2.3 24h
clean-observation requirement for the separate, still-unshipped Phase-2 global `warn`->`reject`
default flip restarts counting from THIS baseline-fix's own deploy timestamp, not from
`eac71308e`'s.

**CANONICAL: Notebook retained-section immutability gate replay (FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS)**
```bash
bash scripts/audits/verify-notebook-immutability-gate.sh [--commits N] [--file <path>]
```
Read-only corpus replay for `scripts/git-hooks/pre-commit` `_check_notebook_immutability` /
`_is_dated_heading` / `_notebook_section_hashes` — sources those 3 functions VERBATIM (never a
reimplementation) and replays them against the REAL commit history of every
`docs/agent-memory/notebooks/*.md`. The gate is **warn-by-default**
(`GIT_NOTEBOOK_IMMUTABILITY_MODE=reject` opts a caller into hard-block) until this script reads 0
rejects across the corpus — re-run it before ever re-arming reject-mode fleet-wide or changing the
hashing/classification logic.

**CANONICAL: Notebook compose actuator (FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR, RECURRING-BUG
ESCALATION prior_warns=7)**
```bash
scripts/notebook-compose.sh <notebook-path> <new-section-body-file> [max-sections=3] [section-cap=60]
```
Mirrors `scripts/auditor-notebook-commit.sh`'s "model calls ONE script, branches on stdout marker"
contract for the compose half of the notebook write pattern — closes the gap that let commit
`0fcc6a5d2` delete a retained `## c44` heading while the file GREW 80->81L and the cycle self-
reported success: the compose step used to be 100% LLM-narrated (the model had to read the whole
existing notebook and reproduce every retained section byte-for-byte inside one freehand `Write`
payload). This script removes that reproduction burden entirely — the caller authors ONLY the new
section's substantive text (a file, `<new-section-body-file>`, exactly ONE `## ` heading); the
script mechanically parses `## ` boundaries, derives the file's newest-first/oldest-first
convention by REUSING (never reimplementing) `scripts/agents-flow/lib/notebook-section-
direction.sh` — the SAME tie-break/override/default logic `scripts/agents-flow/notebook-auto-
prune.sh` uses, factored out of that script into this shared lib in the SAME commit (zero behavior
change, `notebook-auto-prune.test.sh` still 8/8) — enforces the 3-section retention steady state +
AC-2b `## Prior cycles` sub-block intra-prune (self-derived sub-block direction, falling back to
the file's own resolved top-level direction, never a second hardcoded default) + dual-axis 200L/
12000B caps (same SSOT `docs/data/file-size-caps.json` row `notebook-auto-prune.sh` reads), then
performs ONE settled write via `mktemp`+`mv` — never a Claude Write/Edit tool call. A belt-and-
suspenders internal invariant check (heading-count arithmetic + byte-for-byte identity of every
retained section) runs on the IN-MEMORY composed body BEFORE the write; any violation ABORTs and
writes NOTHING — this is what makes the `0fcc6a5d2` shape structurally unreachable via this
actuator (AC-4), not merely detected-and-warned. Does NOT git-add/commit anything — that stays
`scripts/auditor-notebook-commit.sh`'s separate, unchanged job. Full marker contract (grep
`"[notebook-compose]"`) documented in the script's own header comment (AC-5) for agent-father's
pending follow-up rewire of `docs/agents/system-auditor/flow/main.md` Step 1/2/2a (out of scope for
this task — flagged via signal, not done here). Owning brief:
`docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-
blindspot.md`. Test: `scripts/notebook-compose.test.sh` (T1 = the AC-4 negative-control replay of
the exact `0fcc6a5d2` shape).

**CANONICAL: Notebook-compose adoption forcing function — `commit-msg` hook (FIX-AUDITOR-NOTEBOOK-COMPOSE-COMMITMSG-MARKER-GATE)**
```bash
./scripts/git-hooks/install.sh                                      # symlinks pre-push/pre-commit/post-commit/commit-msg into .git/hooks/ (re-run after a fresh clone / .git rebuild)
bash scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh    # permanent regression suite, disposable scratch repos only
```
New `scripts/git-hooks/commit-msg` — same tracked-source-plus-symlink convention as
`FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK`'s `pre-commit`/`post-commit` pair, this repo's first
`commit-msg` hook. Mechanical forcing function for the compose actuator directly above: fires only
on a staged commit touching `docs/agent-memory/notebooks/system-auditor.md` (PILOT-SCOPED — the
sole live caller of `scripts/notebook-compose.sh` today; the fleet-wide rollout,
`FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`, is still un-merged in
`task_board.review[]` — do not widen ahead of that landing) and checks the PROPOSED commit MESSAGE
(`$1`, the only hook parameter that carries it — see WHY note below) for a `[notebook-compose
OK|WARN ...]`-shaped marker (the same marker `docs/agents/system-auditor/flow/main.md`'s Notebook
Write step already emits into every compose-actuator commit). **WHY `commit-msg`, not
`pre-commit`:** `pre-commit` fires before git has obtained the proposed message (githooks(5)) — a
guard there has no parameter access to it at all, and reading `.git/COMMIT_EDITMSG` instead is a
TRAP, not a workaround: that file holds the PREVIOUS commit's message during `pre-commit` (verified
live, 2026-08-26T12:07Z tick), so a `pre-commit`-hosted guard would validate the wrong message and
false-green almost permanently. **WARN-by-default** (mirrors `_check_notebook_immutability`/
`_check_notebook_uuid_provenance`'s precedent, NOT `_check_auditor_heartbeat_shapes`'s hard-reject
one) — a legitimate no-marker bypass class exists (AC-5-style data-repair/renumber commit,
precedent `35be008d0`); opt-in `GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject` once re-validated.
Escape-hatch trailer `notebook-compose-marker-allow: <reason>` mirrors the UUID guard's own
`notebook-uuid-lint-allow:`. **Regex deviation from the owning brief, found + fixed during
implementation:** the brief's literal `\[[^]]*(OK|WARN)[^]]*\]` does not match the real nested-
bracket marker shape `[[notebook-compose] OK ...]` (live commit `efe62d83d`) — `[^]]*` cannot cross
the inner `]`, so it would have false-flagged a compliant commit. Hook ships the widened
`\[([^][]|\[[^]]*\])*(OK|WARN)([^][]|\[[^]]*\])*\]` (tolerates one level of nested `[...]` either
side of the token), re-verified against all 4 observed real shapes plus negative controls (bare
`[skip ci]`, and OK-substring words like TOKEN/BROKEN outside any bracket — neither false-matches).
Owning brief: `docs/architecture-briefs/2026-08-26-fix-auditor-notebook-compose-tier1-adoption-gap-
and-commitmsg-forcing-function.md` §Child A. Test: `scripts/git-hooks/commit-msg-notebook-compose-
marker.test.sh`, 5 cases (marker-present all 4 shapes / no-marker warn / no-marker reject /
escape-hatch under reject / non-notebook-touching no-op).

**CANONICAL: DASHBOARD.md append actuator (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED)**
```bash
scripts/emit-dashboard-row.sh --check-id <A-xx|B-xx|C-xx> --title "<...>" --severity <CRITICAL|WARN|INFO> \
  --location "<...>" --details "<...>" --impact "<...>" --root-cause "<...>" --zone-owner <specialist> \
  --signal-id <id from the paired emit-audit-signal.sh marker>          # named args, see header comment
```
Gives `docs/data/DASHBOARD.md` the same anti-false-green treatment `scripts/emit-audit-signal.sh`'s E-3
step already gives signal_queue rows: tmp+mv atomic append, commit-mutex-guarded (self-contained —
does not nest into `scripts/auditor-notebook-commit.sh`), then a MANDATORY POST-WRITE read-back
(`grep -qF "signal <id>"`) that fails loud to the BUG channel if the anchor is not found on re-read.
Replaces unscripted prose ("append a DASHBOARD.md row") that had no script, no path SSOT, and no
failure path — the `docs/handoffs/DASHBOARD.md` path is a stale phantom (UC-ASL-P6 purges it) and the
`.claude/skills/signal-dashboard/` skill governs `.signal_queue.rows[]`, a different artifact — neither
is this script's target. Owning flow: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting →
DASHBOARD Append. Test: `scripts/emit-dashboard-row.test.sh`.

**CANONICAL: Audit OUTPUT-CONTRACT parser (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED)**
```bash
scripts/audit-output-contract.sh --markers-file <path> [--cycle-start-ts <ISO8601>] \
  [--anomalies-count <N>] [--next-token <token>] [--orch-state-file <path>] [--cycle-tag <value>]
```
Mechanically parses the `[emit-signal]`/`[emit-dashboard]`/`[post-agent-signal]` marker lines a
system-auditor cycle accumulated into a scratch file and PRINTS the
`[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N |
dedup_skipped=N` line — the agent pastes this verbatim, it never hand-composes the counts again.
Closes a confirmed recurring defect that failed in BOTH directions on 2026-07-29 (over-report:
narrated N, wrote 0; under-report: narrated 0, wrote 1 — root cause: a `SKIP-dedup` marker, which
still carries `id=`, misread as "nothing emitted"). Adds an independent `.signal_queue.rows[]`
cross-check (closes a previously vacuous same-agent-narrates-both-operands check) and symmetric
violation checks for `dashboard_rows==0` and RETURN-headline/`NEXT`-token consistency, each firing its
own BUG-channel Telegram. Owning flow: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting →
OUTPUT-CONTRACT. Test: `scripts/audit-output-contract.test.sh`.

FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH (2026-08-05) fixed two
independent structural bugs in the V1 `.signal_queue.rows[]` cross-check above (reproduced 100%
deterministically, NOT a concurrency race — occurrences 4412/4413/4415/4420): Bug A — the raw jq
string `.ts >= $cycle_start_ts` compare silently dropped any row written in the tick's own clock-minute
(`FIRE_TICK` is minute-precision, row `.ts` is second-precision; `":"` 0x3A sorts below `"Z"` 0x5A right
after `HH:MM`), now fixed by porting `emit-audit-signal.sh`'s `to_epoch` helper and comparing as epoch
ints. Bug B — no call site passed `--from-agent`, so every tier/session shared the default
`from="system-auditor"`, letting a concurrently-running peer tier's row inflate the count; now fixed by
threading the tier's own unique `FIRE_TASK_ID` through both scripts as `--cycle-tag`, stored as the
row's `audit_cycle_tag` passthrough field and matched exactly (falls back to the from+ts-window path
when `--cycle-tag` is omitted). All 7 call sites (6 `emit-audit-signal.sh` + 1
`audit-output-contract.sh`, across `main.md`/`tier1-probe.md`) now pass `--cycle-tag "$FIRE_TASK_ID"`.
Full design: `docs/architecture-briefs/2026-08-05-fix-audit-output-contract-signalqueue-mismatch.md`.

**CANONICAL: OUTPUT-CONTRACT structural invariant + partial-write detector gate (FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE, 2026-08-08)**
```bash
source scripts/lib/output-contract-invariant.sh
oc_extract_all_added_contract_lines_from_text   # reads a unified diff on stdin, echoes every added [OUTPUT-CONTRACT] line
oc_parse_counter "<line>" "<key>"               # echoes key=N's value, or "0" if absent
oc_check_arithmetic_invariant <signals_posted> <signal_queue_rows_written> <dedup_skipped>   # rc 0 sound, rc 1 hand-composed
```
**Extended (FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE, 2026-08-14)** — the §2a AC-4 backstop
above was proven structurally UNREACHABLE for every system-auditor cycle since 2026-08-06 (root cause:
`docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md` §4 — the flow doc's
own 2026-08-06 notebook-durability reorder now runs the OUTPUT-CONTRACT step, the only place the
`[OUTPUT-CONTRACT]` line is ever written, AFTER the notebook commit already lands, so §2a's diff scan
never finds one). `scripts/auditor-notebook-commit.sh` gained a SECOND, independently-reachable §2b
gate on a different already-mandatory fact pair (the notebook's own "Anomalies: N new" line vs the real
`[emit-signal] OK...` count in `$MARKERS_FILE`), wired via 3 new pure functions in the same shared lib:
```bash
oc_extract_declared_anomaly_count_from_diff       # reads a diff on stdin, echoes N from the first added "Anomalies: N new" line, or "0"
oc_count_real_emit_signals <markers_file>         # echoes the real [emit-signal] OK/SKIP-dedup/... line count, "0" if missing/empty
oc_check_emit_vs_claim_plane <declared_n> <real_signals_n>   # rc 0 sound, rc 1 violation (declared>0 AND real==0)
```
Only engages when the caller passes the script's new optional `--markers-file <path>` flag (omitted ⇒
byte-identical no-op, AC-1 backward-compat — the live `docs/agents/system-auditor/flow/main.md:1173-1177`
call site does not pass it yet; that 2-arg edit is a separate, deliberately-sequenced follow-up, agent-
father's zone). On mismatch: `git restore --staged` + exit 1 (refuse the commit, never rewrite-to-truth,
never commit-plus-discrepancy-signal — brief's explicit AC-4 ruling). `--cycle-tag <value>` is also
accepted-and-ignored, reserved for a Phase-2 defense-in-depth `.signal_queue.rows[]` cross-check
soft-blocked on `FIX-AUDIT-OUTPUT-CONTRACT-V4-V5-DEDUPSKIP-DENOMINATOR-FALSE-VIOLATION`, not implemented
this phase.
Confirmed live: system-auditor c80 (2026-08-08T01:08:04Z) published
`signals_posted=0 | signal_queue_rows_written=1 | dedup_skipped=1` — provably impossible for
`scripts/audit-output-contract.sh`'s own parser to produce (every incrementing arm bumps
`signals_posted` at least as much as the other two; V1's take-the-max never lowers it — see that
script's own header, L156-200+L250) — i.e. hand-composed, while `scripts/audits/detect-analysis-
only-exit.sh`'s original zero-diff-only OR verdict PASSed it (notebook/commit planes were genuinely
non-zero; a partial write, not the zero-diff shape it was built to catch). This shared lib is sourced
by BOTH `detect-analysis-only-exit.sh` (post-hoc AC-1/AC-2 check — DETECTED even when every plane is
non-zero, if a published claim fails the invariant or asserts a `.signal_queue` write the independent
Plane-3 re-read shows never landed) and `scripts/auditor-notebook-commit.sh` (AC-4 pre-commit
refusal — unstages + aborts the commit before a fabricated line ever reaches git HEAD). Both scan
EVERY `[OUTPUT-CONTRACT]` line added by the commit(s)/staged-diff in scope, never just "the newest"
one — a single commit can legitimately bundle more than one cycle's own notebook section (confirmed
live, commit `569f79108`: c79's 2026-08-07T06:12:14Z write never got its own commit and was folded
into c80's), and guessing "first vs last" would depend on a per-notebook newest_first/oldest_first
convention this agent-agnostic detector has no reliable way to know. Tests:
`scripts/audits/detect-analysis-only-exit.test.sh` T8-T12 (RED = c80's real line, GREEN = c79's real
line, AC-1 isolation, no-claim no-op, bundled-commit regression). `auditor-notebook-commit.sh` now HAS
a persisted `.test.sh` (`scripts/auditor-notebook-commit.test.sh`, added 2026-08-14 alongside the §2b
gate above — supersedes the prior "no MCP-dependent test harness, disposable scratch-repo manual smoke
run only" note): the REAL script runs as a REAL subprocess against isolated tmp git repos, with ONLY
the external `curl` transport (mcp-call.sh's task_claim/task_release) stubbed via a PATH-shadowing fake
binary — 24 assertions incl. the AC-4 synthetic-replay pair (I1: identical mismatch shape, flag
omitted → commit lands; I2: same shape, `--markers-file` supplied → ABORT contract-plane-mismatch, no
commit, working-tree content survives the `git restore --staged`). Owning flow: `docs/protocols/fail-
loud-protocol.md` § Analysis-Only Exit Guard, `docs/agents/system-auditor/flow/main.md` § Commit /
§ ANALYSIS-ONLY-EXIT GUARD.

**CANONICAL: E-1 write confirmed by read-back, not by call success (FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS)**
Confirmed live (2026-07-30, empirical repro before any code change — not assumed): `mcp_call` returning
rc=0 for `post_agent_signal` was NOT sufficient evidence a row landed in `agent_signals`. TWO distinct
mechanisms produced a "successful" call with zero rows written: (a) `postSignalWithCriticGate`/`postSignal`
return the sentinel `signalId=-1` for EVERY dedup-suppressed no-op (`INSERT OR IGNORE` identical-payload
guard, or the Task-1862g same-direction time-window guard), and the interface layer
(`apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`) only special-cased
`id===-1` for the narrow "critic rejected on first attempt" branch — every OTHER `id<=0` outcome fell
through to `success:true` with the bare `-1` embedded as a fake row id; (b) the handler's generic
catch-all (a genuine thrown DB error, e.g. mid-write during a corrupt-DB fault window) returned an
`Error: <message>` TEXT body without setting `isError:true` — the only one of the handler's 3 non-success
paths that omitted it — and `scripts/agents-flow/mcp-call.sh`'s `_mcp_call_parse()` inspected only
`.result.isError`, never the text, treating it as success. Fix, 3 layers: (1) tool layer — any `id<=0`
now returns `success:false` (not just the critic-reject case), and the catch-all sets `isError:true`;
(2) shared caller layer — `_mcp_call_parse()` now also treats a literal `Error:`-prefix on the response
text as a failure even when `isError` is unset (belt-and-suspenders, benefits every `mcp_call()` caller,
not just this one tool); (3) `scripts/emit-audit-signal.sh`'s `_run_e1()` no longer trusts `mcp_call`'s
rc alone — it parses the tool's own JSON body for `success===true` AND a positive-integer `signal_id`
(new `ABORT e1-not-written`), then performs a MANDATORY read-back via `get_agent_signals` (sender-history
mode) confirming that exact id is present in `agent_signals` before the call may count toward
`signals_posted` (new `ABORT e1-readback-failed`, non-dedup-gated BUG telegram — mirrors the pre-existing
E-3 signal_queue POST-WRITE read-back pattern, applied to the OTHER store this script writes to). Both
new ABORT reasons fall under `scripts/audit-output-contract.sh`'s existing `'[emit-signal] ABORT'*`
wildcard (counts nothing) — no parser change needed. Tests:
`apps/mcp-server/src/__tests__/FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS.test.ts`,
`scripts/agents-flow/mcp-call.test.sh`, `scripts/emit-audit-signal.test.sh` (T16-T20).

**CANONICAL: Source-code size-lint-justification CI guardrail (FACTORY-GUARD-CI-SIZELINT-IMPL)**
```bash
bash scripts/audits/size-lint-justification.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
bash scripts/audits/size-lint-justification.sh --update   # regenerate docs/data/size-lint-baseline.json
```
CI-time (not hook-time) code-plane sibling to `scripts/agents-flow/context-bloat-backstop.sh` — that
hook's own SSOT note is explicit: "Code and data JSON are explicitly NOT governed" (docs-plane only).
Full-tree scan of `apps/**/*.ts|*.py|*.go` + `packages/**/*.ts` (excl. `__tests__/`/`tests/`/`*.test.ts`/
`*_test.go`/`test_*.py`/`*.d.ts`/`node_modules/`/`dist/`/`.venv/`/`PDF-Extract-Kit/`/`vendor/`) at
push/PR time, so non-Claude-tool writes can't bypass it the way the PostToolUse hook can. Baseline/ratchet,
NOT blanket hard-fail: `docs/data/size-lint-baseline.json` grandfathers pre-existing over-cap files
(666 as of 2026-07-29, generated via `--update`); a grandfathered file failing only if it grows past
±10%/min-5L tolerance (mirrors the backstop hook's own tolerance idiom), a brand-new >120L file without
a `size-justification:` header always fails. Wired as the `size-lint` job in `.github/workflows/ci.yml`
(ubuntu-latest, checkout-only, no toolchain — cheapest job in the pipeline). Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md`. Test: `scripts/audits/size-lint-justification.test.sh`.

**CANONICAL: Metric-mask CI guardrail (FACTORY-GUARD-CI-METRICMASK-IMPL)**
```bash
bash scripts/audits/metric-mask-lint.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (NOT baseline/ratchet, unlike the size-lint sibling above — live debt was only
4 lines in 2 files, fixed in the same task that shipped the gate, so it opens at zero offenders).
Scans `apps/**/*.ts|*.py|*.go` + `packages/**/*.ts` (same exclusions as size-lint) for a silent
`?? <non-zero-literal>` / `|| <non-zero-literal>` / Python `or <non-zero-literal>` / destructuring-
or-param-default `<non-zero-literal>` fallback on an identifier matching `/confidence|score|impact|
magnitude|probability/i` — the "confidence_score=50" fabrication bug class (a plausible-looking
measured value silently substituted for an honestly-propagated absence). `0`/`0.0`/`null` fallbacks
are always allowed (the honest-absence idiom already established repo-wide, e.g. `row.confidence ??
0`) — never flagged. Comment-only keyword mentions are never scanned as code. Escape hatch: an
inline `metric-mask-allow: <reason>` comment on the same line or the line immediately preceding a
match suppresses it (mirrors `size-justification:`'s convention) — used for genuine caller-facing
config defaults (`watchlist.ts:198`, `brokerCredibilityTools.ts:51`) that are not fabricated metrics.
Wired as the `metric-mask-lint` job in `.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no
toolchain). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md`.
Test: `scripts/audits/metric-mask-lint.test.sh`.

**CANONICAL: TS/JS architecture-fence CI guardrail (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL)**
```bash
cd apps/mcp-server && ./node_modules/.bin/eslint src/ --max-warnings=0   # or: apps/news-fetch → bun run lint:ci
cd apps/frontend    && bun run lint:fence                               # frontend's dedicated fence-only script
```
Rule content (`eslint-plugin-boundaries` Fence-A/B/[C] in each service's `eslint.config.mjs`) already
existed on all 3 TS services (mcp-server, news-fetch, frontend) — the gap this task closed was that
ESLint never ran in CI at all (zero `eslint` step anywhere in `.github/workflows/`), so the fences were
unenforced dead config. Wired as 3 new jobs — `mcp-server-eslint`, `news-fetch-eslint`, `frontend-eslint`
— in `.github/workflows/ci.yml`. Zero-tolerance, same size-driven call as metric-mask-lint above: live
debt was 4 lines / 3 files (mcp-server `getMoneyRadarComposite.ts` 2x + `recoverMissingOhlcvSession.ts`
1x reaching into interface/scheduler layers; news-fetch `routes/fetchArticle.ts` importing infrastructure/
directly) plus one previously-invisible violation surfaced by fixing a drifted `boundaries/elements`
element-map gap (news-fetch's real route-handler directory `src/routes/**` was unclassified — mapped to
the "interface" type). All fixed via pure relocation (queryMarketWideForeignFlow + credit-flow computation
moved to their correct DDD layer; recoverMissingOhlcvSession.ts moved from application/usecases/ into its
sole caller's scheduler/market-data/ directory; news-fetch's PlaywrightBrowserFactory now wired via DI
setter from src/index.ts, the composition root) — zero logic rewrites, RAW-verified (tests + manual lint
diff against baseline) before/after. `eslint .` (whole-app-root glob) is NOT used for mcp-server — it
recurses into `node_modules` and trips on a vendored package's own unrelated `eslint.config.js`; each
job scopes to the service's own source tree (`src/` or the package's existing lint script) instead.
`apps/news-fetch` also carries a separate parallel Go implementation (`go.mod`/`.golangci.yml`, GFD-9
depguard) that had zero CI job of any kind — closed by a 7th `news-fetch-go-lint` job mirroring the 6
existing per-service go-lint jobs. Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md`.

**CANONICAL: Go composition-root-logic CI guardrail (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL)**
```bash
go run scripts/audits/composition-root-logic-gate.go --check apps/<service>/cmd/server [apps/<service2>/cmd/server ...]
```
Zero-tolerance `go/ast`+`go/parser` (Go stdlib only, no new go.mod dep) guardrail closing the gap
`depguard` (existing Fence-A/B/C in every service's `.golangci.yml`) cannot express — depguard is
import-based only, it cannot see that a composition-root adapter/shim type's RECEIVER METHOD embeds a
business decision (a fallback selection, an `IsEstimate`/`ParseOK`-style confidence flag) that belongs
in `pkg/application`, not `cmd/server/`. Scope: `ast.FuncDecl` nodes with a receiver, inside
`cmd/server/**/*.go` (excl. `*_test.go`) — `func main()` and every free (non-receiver) helper function
(`envStr`/`envInt`/`getenv`/`splitCSV`/`parseWatchlist`/`readWatchlistFromDB`) are structurally out of
scope (no receiver), not a special-cased allowlist. Threshold: flag when `if`-count >= 2 OR any
`for`/`range` appears anywhere in the method body (incl. nested func literals) — grep-verified
2026-07-24 to cleanly separate the 2 real offenders from every other checked receiver-method shim
across all 7 Go services (zero false positives; independently re-verified live 2026-07-30, same
result). Escape hatch: `// composition-root-logic-allow: <reason>` on the line(s) immediately
preceding the method (`go/ast`'s `FuncDecl.Doc` — a blank line breaks the association, same
"immediately preceding" contract as `size-justification:`/`metric-mask-allow:`). Live debt at design
time was 2 functions in 1 service (`apps/macro-indicators/cmd/server/adapters.go`:
`policyRatesAdapter.FetchPolicyRates` HTML-vs-DB-fallback + `IsEstimate`, `omoAdapter.FetchOMO`
`ParseOK`-fail-closed decision + a tenor-row DTO-mapping loop) — fixed in the same task that shipped
the gate by moving the DECISION logic into two new `pkg/application` resolvers
(`PolicyRatesResolver`, `omoResolver` — both still implement the pre-existing `PolicyRatesProvider`/
`OMOProvider` ports consumed by `LiquidityStateUseCase`, so `/liquidity-state`'s behaviour is
unchanged) while the composition-root adapters were split into pure-delegation pairs
(`policyRatesHTMLAdapter`+`policyRatesDBAdapter`, `omoRawAdapter`). The OMO tenor-row struct-mapping
loop (mechanical field copy between two distinct named struct types — Go disallows implicit slice
conversion between them even with identical field shapes) stays in `cmd/server/adapters.go` as a free
(non-receiver) function, `convertOMOTenorRows` — out of the gate's scope by construction, same
free-helper carve-out as `envStr`/`splitCSV`. RAW-verified against the LIVE running container: hit
`POST /liquidity-state` before and after rebuild (both calls landed on the exact 2 fallback/fail-closed
branches the gate flagged, live in production at verify time) — response bodies + `slog` warn-log
lines byte-identical modulo wall-clock `fetched_at` fields. Wired as a single `composition-root-logic-gate`
job in `.github/workflows/ci.yml` (not 7 per-service jobs like `go-lint` — the tool is syntax-only,
never type-checks/resolves imports, so one Go toolchain scans all 7 services' `cmd/server/` dirs in one
job). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md`
§3/§4. Test: `scripts/audits/composition-root-logic-gate_test.go` (`go test
scripts/audits/composition-root-logic-gate.go scripts/audits/composition-root-logic-gate_test.go`) —
NOT `.test.go` as the board-row note literally named it: Go's toolchain only discovers `_test.go`
(underscore) as test files, `.test.go` is invisible to `go test` and would silently ship a dead smoke
test.

**CANONICAL: Dead-code CI guardrail (FACTORY-GUARD-CI-DEADCODE-IMPL)**
```bash
bash scripts/audits/dead-code-gate.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (same fix-now pattern as metric-mask-lint.sh, NOT baseline/ratchet like
size-lint-justification.sh) `git ls-files`/grep guardrail against 4 recurring dead-artifact shapes,
all scanned on TRACKED files only (`git ls-files --cached` — a merely-gitignored-but-uncommitted
file is never flagged, only a staged/committed offender is): (1) tracked `*.bak`/`*.backup`/`*.patch`
files, (2) any tracked path with a `_deprecated/` segment (git history is the rollback reference,
same `FACTORY-INTERFACE-delete-bak-files` precedent — a graveyard folder adds zero safety over
`git log`/`git show` while diluting every grep), (3) a Go/TS "twin scaffold" — see deviation note
below, (4) `//go:build ignore` on any tracked `*.go` file. Live debt at design time (~1.4k LOC across
mcp-server ×2 `_deprecated/` trees + a dedicated wrapper test file + a surgical smoke-suite edit,
pdf-extractor's `_deprecated/mock_echo`, stock-price's `_deprecated/services_v1.go`+test, plus 2
stray root `docker-compose.yml.backup`/`.patch` files) fixed in the same task that shipped the gate
— `apps/technical-analysis/src/`'s independent ~697L share of the original ~2,070 LOC audit-brief
estimate had already been deleted by a separate, unrelated task (`099afddd3`,
`FACTORY-TECHANALYSIS-delete-orphaned-ts-service`) before this task was even dispatched; this task's
only remaining `technical-analysis` action was trimming `bun-types`/`typescript` out of
`package.json`'s `devDependencies` (the `module`/`start`/`test`/`check` script fields that commit
already removed) — `esbuild`/`playwright-core` kept, RAW-verified still load-bearing for
`dashboard/build.sh` (35/35 sandbox scenarios + headless render gate green post-trim, plus
`go build`/`go vet`/`go test ./...`/`golangci-lint run` all green).

**Check-3 deviation from the board-row note's literal phrasing** ("any `apps/<svc>/` with a Go
`cmd/server/` at its root MUST NOT also carry a top-level `package.json` and `src/`" — claimed
"0/7 Go services" after cleanup): that literal rule fails immediately and *permanently* against the
LIVE `apps/news-fetch` service, which legitimately carries all 3 structural elements today — a WIP
parallel Go port (own `news-fetch-go-lint` CI job + `composition-root-logic-gate` coverage per the
`FACTORY-GUARD-CI-TSBOUNDARIES-IMPL` entry above, same design-brief day) sitting alongside the live
TS/Bun service its `Dockerfile` actually builds and runs (`COPY --from=bun-builder /app/src ./src`,
`CMD ["bun","run","src/index.ts"]`). The confirmed dead instance this check is purpose-built for
(`apps/technical-analysis`, independently deleted per above) had the discriminating trait the
board-row note's directory-shape-only phrasing dropped: its `Dockerfile` `COPY`d only `cmd/ pkg/
api/` — zero `src/` reference of any kind. The shipped check generalizes that exact confirmed signal
instead of bare directory shape: flag `apps/<svc>/` only when it has a tracked `cmd/server/` AND a
tracked top-level `package.json` AND a tracked top-level `src/` **AND** its `Dockerfile` contains no
`src` reference at all (no `Dockerfile` present also fails — conservative default). RAW-verified:
`bash scripts/audits/dead-code-gate.sh --check` correctly reports 0 offenders on `apps/news-fetch`
(check 3 silently exempts it) while still catching the confirmed-dead shape via 2 dedicated
synthetic-fixture DoD cases (one Dockerfile-src-blind twin that fails, one Dockerfile-src-referencing
twin mirroring `news-fetch`'s own shape that passes). Wired as the `dead-code-gate` job in
`.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no toolchain — cheapest job in the
pipeline). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md`.
Test: `scripts/audits/dead-code-gate.test.sh`.

**CANONICAL: No-hardcode-allowlist CI guardrail (FACTORY-GUARD-CI-NOHARDCODE-IMPL)**
```bash
bash scripts/audits/no-hardcode-allowlist-scan.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (same fix-now pattern as metric-mask-lint.sh/dead-code-gate.sh, NOT baseline/ratchet
like size-lint-justification.sh), 2 mechanically-reliable `git ls-files`/grep checks against a
ticker/date literal smuggled INTO a control-flow condition — NOT a named, generically-consumed
reference-data table (the brief's own verify-live pass found hundreds of legitimately-overlapping
domain rule-table arrays across `predictionCascadeMapper.ts`/`policyImpactMapper.ts`/etc — those are
explicitly excluded, not the bug class): (1) temporal special-case ban — `.includes('YYYY')` (TS) or
`strings.Contains(x, "YYYY")` (Go) co-occurring within a +/-2 line window with a literal-year equality
(`===?`/`==`); (2) ticker/code literal-branch ban — `(ticker|symbol|code|action_code)` (bare or
`<obj>.<ident>` property access) compared via `===`/`==` against a quoted 2-5-char ALL-CAPS literal,
denylisting the stable `HOSE|HNX|UPCOM|BLOOMBERG` exchange-enum comparisons (per §2(a) of the design
brief — those are typed domain-enum mappings, not volatile reference data). A generic cross-file
ticker-array-duplication detector (would have caught `JANITOR-034`) is explicitly DEFERRED — the repo
has dozens of legitimately overlapping domain rule tables (e.g. `predictionCascadeMapper.ts`'s cascade
categories intentionally re-use VCB/BID/CTG across unrelated buckets), so a mechanical
"N-shared-elements" check would false-positive heavily. Live debt at design time: 2 cosmetic
diagnostic-reason-string branches (`backfillBctcScalarsTool.ts` CTG-only, `pharmaEventMapper.ts`
IMP-only) fixed outright in the same task that shipped the gate (RAW-verified behavior-preserving —
only the reason/reasoning text differs, no classification/confidence/severity/direction field
changed); 2 known-debt findings (`JANITOR-034` ticker-array overlap in `cascadeExecutor.ts`+
`priceSourceRouter.ts`, `JANITOR-035` temporal special-case in `newsChainFallback.ts`) annotated via
the `hardcode-scan-allow: <ticket-id> — <reason>` escape hatch (mirrors `size-justification:`/
`metric-mask-allow:` — same-line-or-immediately-preceding-line contract) rather than generalized —
both already require a human design decision their own `docs/data/code-janitor-known-findings.json`
entries call for, out of this gate-shipping task's scope to make unilaterally.

**Deviation (verify-live, not in the board-row note's file list):**
`apps/mcp-server/src/domain/services/priceBackfillService.ts:224` (`ticker === "BAD"`) also matches
check-2's literal shape but is NOT one of the 2 fix/2 annotate targets above — it is a documented
test-fixture sentinel (`ohlcvWriteService.ts:49` already labels it "Historical seed/mock only...
sentinel present"), never called outside `__tests__/`, explicitly excluded from this scan's offender
count by the design brief's own §2(c) ("a test-mock-leaked-into-domain-layer issue, not a
reference-data/allowlist issue — out of this scan's scope"). Left unfixed by design (no live
behavior to change), but annotated with the same `hardcode-scan-allow:` escape hatch (citing the
brief §2(c) directly) so the gate's own zero-tolerance mechanical check does not open red on day one
against a site the design already ruled out of scope.

Wired as the `no-hardcode-allowlist-scan` job in `.github/workflows/ci.yml` (ubuntu-latest,
checkout-only, no toolchain — cheapest job in the pipeline). Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md`.
Test: `scripts/audits/no-hardcode-allowlist-scan.test.sh`.

**CANONICAL: Shared-package-import CI guardrail (FACTORY-GUARD-CI-SHAREDPKG-IMPL)**
```bash
bash scripts/audits/shared-package-import-check.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
bash scripts/audits/shared-package-import-check.sh --update   # regenerate docs/data/shared-package-import-baseline.json
```
Baseline/ratchet (like size-lint-justification.sh, NOT zero-tolerance — different justifying axis:
the debt isn't too voluminous to fix now, the fix is a domain keep-or-cut decision explicitly owned by
a separate, larger, still-BACKLOG task, `FACTORY-SHARED-wire-or-prune-shared-packages`; forcing that
decision inside this CI-tooling child task would preempt/duplicate that task's own field-superset-
reconciliation care). Check 1 (blocking): for every `packages/*/package.json` declaring a
`@vn-market/`-scoped `name`, grep `apps/**`+`packages/**` (own package dir excluded) for a real import
specifier (`from '@vn-market/<pkg>'` / `require('@vn-market/<pkg>')`) or `package.json` dependency
entry. >=1 real importer always PASSes regardless of baseline membership (a package gaining a consumer
makes its baseline entry stale — not auto-pruned, mirrors size-lint's manual `--update` idiom); 0
importers + baseline-listed PASSes (prints `BASELINE: <pkg> — tracked by FACTORY-SHARED-wire-or-prune-
shared-packages`); 0 importers + NOT baseline-listed FAILs — blocks a brand-new phantom package (the
`packages/primitives/technical-analysis` shape, already pruned once) from landing again without a human
decision. Deliberately scoped to `apps/**`+`packages/**` only, NOT `docs/**` — this repo's own
architecture briefs discuss these package names by name in prose, and including docs/ in the scan would
let that discussion text itself be misread as a "real importer", permanently masking the debt. Live
debt at design time: 3/3 `packages/shared-*` packages 100% orphaned (`shared-types`/`shared-config`/
`shared-db`) — seeded into `docs/data/shared-package-import-baseline.json` via `--update` in the same
task that shipped the gate. Check 2 (ADVISORY ONLY, never fails `--check`): scans top-level
`export interface|type|const|function <Name>` in `packages/shared-*/index.ts`, prints an `ADVISORY:`
line for every symbol name independently re-exported anywhere under `apps/**/*.ts` (excl. tests/vendor)
— today's live hits go beyond the brief's own cited examples (`Alert`/`Signal`/`McpConfig`): also
`loadMcpConfig`/`ExtractPDFRequest`/`ExtractPDFResponse`/`ComputeTARequest`/`ComputeTAResponse`/
`SearchRequest`/`SearchResult`/`ServiceHealth` — the brief's "e.g." wording was explicitly non-
exhaustive, so the wider live hit-set is a MORE thorough match to the general design, not a deviation.
Full AST structural diffing to make check 2 blocking is explicitly deferred (no TS AST tool is wired
into any bash-only audit script in this repo; a regex field-diff would false-positive on reorder/JSDoc/
optional-marker churn — same reasoning as the dead-code-gate/no-hardcode siblings' own deferrals).
Perf note: every batch (importer search, symbol-collision app-scan) is done via ONE `grep -l ... --
"${files[@]}"` call over the whole candidate file array rather than a subprocess-per-file loop — a
naive per-file-per-package/symbol loop is slow enough at this repo's file count (multi-minute) to make
`--check` unusable in CI; batching keeps it to ~7s. EXPLICITLY OUT OF SCOPE (reserved for
`FACTORY-SHARED-wire-or-prune-shared-packages`, still `BACKLOG`): this gate never edits
`packages/shared-*/` contents, never wires a new consumer, never deletes a package, never reconciles a
field — it only observes and reports. Wired as the `shared-package-import-check` job in
`.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no toolchain — cheapest job in the pipeline).
Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md`.
Test: `scripts/audits/shared-package-import-check.test.sh`.

**CANONICAL: Rebuild-raw-verify attestation CI guardrail (FACTORY-GUARD-CI-RAWVERIFY-IMPL)**
```bash
bash scripts/audits/rebuild-raw-verify-check.sh <base-sha> <head-sha>    # exit 0 pass / 1 fail / 2 usage error
```
7th and LAST `ci-regression-prevention` guardrail (epic FACTORY-MAINTAINABILITY-2026-06). Zero-tolerance,
forward-only attestation check on a PUSH/PR DIFF RANGE — not a source-file-pattern sweep like the 6
siblings above, so there is no existing-file baseline to grandfather (the compliance gap is history,
nothing to retroactively fix; gate opens at zero going forward). Closes the gap: `PUSH-AUTONOMY-1` §5
below mandates a post-push RAW-live REALDATA verification whenever a commit touches serving code, but at
design time exactly 2 `VERIFY-*-REALDATA` board rows had EVER existed across 54 commits touching
`apps/**/src/**`/`pkg/**` serving code since §5 was pinned — concrete miss `e3386bdfa` ("remove DEFAULT-50
confidence mask, wire real severity/finding confidence", exactly this bug class) shipped zero attestation
and no companion row. Trigger (composes the two already-designed sibling primitives, brief §3, rather than
inventing a third pattern): a file matches if BOTH (a) it is under a DB-write/route-serving DDD layer
(`apps/*/src/infrastructure/**`, `apps/*/src/interface/**`, `apps/*/pkg/interface/http/**`,
`apps/*/pkg/infrastructure/**` — the same tiers `FACTORY-GUARD-CI-depguard-tier-boundaries` fences) AND
(b) an ADDED line (`git diff` `+` line) in that file matches the `metric-mask-lint.sh` sibling's own field
regex (`(confidence|score|impact|magnitude|probability)[A-Za-z0-9_]*`, case-insensitive) — reused verbatim,
not reinvented. On trigger, requires ONE of: (i) `git log <base>..<head> --format=%B` contains
`raw[- ]verif(y|ied)|realdata` (case-insensitive — collapsed separator/tense axes so
"raw-verify"/"RAW verified"/"raw-verified" etc. all match; the prior literal-list form
`raw-verify|raw verified|realdata` missed the hyphenated PAST TENSE, this repo's dominant
real-world attestation idiom — fixed post-ship by `FIX-RAWVERIFY-ATTEST-ERE-HYPHENATED-
PAST-TENSE-FALSE-BLOCK`, 2026-08-07), global, excuses every trigger point; (ii) the range
touches `docs/agent-memory/decisions/**` or `reports/TASK_REPORT_*.md` with an ADDED line matching the
same token, global, excuses every trigger point; (iii) an inline `raw-verify-allow: <reason>` annotation on
the triggering line or the line immediately preceding it (mirrors `metric-mask-allow:`/`size-justification:`
idiom), PER-TRIGGER-POINT, excuses only that occurrence. None found → FAIL, printing every un-excused
file:line + a fix hint pointing at §5 below.

**Deviation (verify-live, narrower than the board-row note's literal "a file under `<layer>`" phrasing):**
test files colocated INSIDE these trigger layers (`apps/mcp-server/src/infrastructure/**/__tests__/*.test.ts`,
`apps/*/pkg/infrastructure/*_test.go`, `apps/*/pkg/interface/http/*_test.go` — confirmed live via `find`,
2026-07-30) are excluded from the trigger corpus; a test assertion like `expect(result.confidence).toBe(0.8)`
is not a serving-code change and would otherwise fire on nearly every infra/interface test edit, defeating
the brief's own "evidence-scoped, not maximal" design intent — same test/vendor exclusion idiom
`metric-mask-lint.sh` already applies to its own field-regex scan, reused here for the identical reason.

Fail-open posture (distinct from the 6 zero-tolerance/baseline siblings above, which all hard-error on a
malformed invocation): an invalid/absent base or head SHA (zero-SHA new-branch case, or a `git diff`/
`git log` failure — shallow clone missing the base commit, or a `pull_request` event where
`github.event.before` is empty) PASSes with a WARN rather than blocking a push on an inability to compute
the diff — same posture as the pre-push hook's own tsc-check fail-open branches. Wired TWO layers (brief
§3 — primary is the hook, not CI; this repo has no PR/branch-protection to gate on, confirmed live 2026-07-24:
`gh pr list` shows exactly 1 PR ever, closed unmerged, `gh api .../branches/main/protection` → 404):
(a) PRIMARY/blocking — `scripts/git-hooks/pre-push` calls this script inside its existing
`CODE_TOUCHING_REGEX`-gated per-ref block (reuses the already-computed diff, same doc-only-push fast-skip
path, only invoked when that ref's diff was computed successfully AND matched `CODE_TOUCHING_REGEX`);
(b) SECONDARY/backstop — the `rebuild-raw-verify-hook` job in `.github/workflows/ci.yml`, running the same
script against `${{ github.event.before }}..${{ github.sha }}` with `fetch-depth: 0` (needs full history to
resolve `github.event.before` — every other job in this pipeline uses the default shallow checkout), catching
any push where the local hook was bypassed. EXPLICITLY OUT OF SCOPE (deferred, per board-row note): no
change to `PUSH-AUTONOMY-1` §5's PO-mint-task requirement; no board-state-aware check of whether a
`VERIFY-*-REALDATA` task was actually minted (that task is minted "after CI green," temporally outside the
triggering commit range — a heavier, different mechanism than this immediately-checkable textual-attestation
bar). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md`.
Test: `scripts/audits/rebuild-raw-verify-check.test.sh`.

**CANONICAL: Pre-push doc-shaped checks — unconditional, not CODE_TOUCHING_REGEX-gated
(FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER, 2026-08-22)**
```bash
# Reproduces exactly what `scripts/git-hooks/pre-push` now runs on EVERY push, before the
# CODE_TOUCHING_REGEX gate is even evaluated:
bash scripts/audits/size-lint-justification.sh --check
bash scripts/audits/task-claim-owner-session-lint.sh --check
(cd apps/mcp-server && bun test tool-registry-parity)
```
Root cause closed: the `CODE_TOUCHING_REGEX` gate above (`UC-GCP-P4`) correctly skips `tsc` +
`rebuild-raw-verify-check.sh` on a docs-only push to protect the 90s commit-mutex TTL (full `tsc`
alone measures ~94s) — but that same regex excludes `docs/` entirely, so a docs-only push ran
**zero** local checks even though CI enforces `size-lint`, `task-claim-owner-session-lint`, and
`tool-registry-parity` as separate jobs. 2 of the 3 independent CI-red incidents in the
2026-08-01→05 window (`9af50bb26` on `CLAUDE.md`, `3ce726a6e` on `docs/agents/po/flow/
sprint-kickoff.md`) landed on exactly the paths that regex excludes, and main sat red for 4+
days before anyone noticed — the 3rd (`7ac55adc8`, a size-lint offender) landed on a
code-touching path but still slipped past because pre-push never ran size-lint at all,
regardless of path.
**Fix:** added the 3 checks unconditionally (every push, not gated by `CODE_TOUCHING_REGEX`) as
a new `run_doc_shaped_checks()` block placed BEFORE the `PRE_PUSH_SKIP_TSC=1` early-exit guard
— correcting that guard's own name back to reality (it now only skips `tsc`/`rebuild-raw-verify`,
not the whole hook, closing a second unintended escape hatch). `tsc` + `rebuild-raw-verify-check.sh`
stay on the existing `CODE_TOUCHING_REGEX` gate, completely unchanged.
**Measured cost** (architect AC1, `docs/architecture-briefs/2026-08-05-fix-ci-gates-invisible-to-
prepush-docs-path-filter.md` §1): ~19.5-20s combined (size-lint ~13-14s, task-claim-lint ~5.5-6s,
parity test <1s) — ~4.5x margin inside the 90s TTL even added unconditionally; re-measured live at
implementation time (2026-08-22): ~21s, consistent. Adding these 3 checks does NOT reopen the
tsc-vs-TTL collision that motivated the docs/-exclusion in the first place — that collision is
`tsc` alone (~94s) vs. the 90s TTL, unrelated to and untouched by this fix.
**Fail-open posture:** `bun` absent from `PATH` → WARN + skip ONLY the `tool-registry-parity` check
(mirrors the pre-existing `pnpm`-absent fail-open for `tsc`); `size-lint`/`task-claim-lint` are NOT
similarly guarded on `jq` — both scripts already hard-fail (`exit 2`) internally if `jq` is absent,
which is the correct FAIL LOUD behavior here (AC3), not a redundant wrapper.
**Live dry-run proof (AC4, no synthetic fixture):** running the 3 checks directly against the repo
HEAD at implementation time reproduces a clean PASS on all 3 (the 3 symptom rows this fix's own
fence explicitly does NOT close — `FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR`,
`FIX-CI-PARITY-CLAUDEMD-CRON-LITERAL-EXEMPTION-SHAPE`, `FIX-CI-TASKCLAIM-PO-FLOW-OWNER-SESSION-
PAYDOWN` — had each independently landed by 2026-08-22); AC4's real gate (a subsequent green CI
run on the push that ships this fix) is confirmed via `gh run list` after push, not asserted here.
Test: `scripts/git-hooks/pre-push.test.sh` (T1 doc-only-clean-push runs+passes all 3, tsc skipped;
T2 a failing `task-claim-lint` fixture on an otherwise docs-only push still BLOCKS; T3 a
code-touching push still runs all 3 AND still invokes `tsc` via the unchanged regex gate; T4
`bun`-absent WARN+skip is fail-open, does not block) — isolated mktemp scratch-repo idiom (mirrors
`scripts/git-hooks/pre-commit.test.sh`'s `new_repo()`), never touches the live repo's `.git/`.
Owning brief: `docs/architecture-briefs/2026-08-05-fix-ci-gates-invisible-to-prepush-docs-path-filter.md`.

**CANONICAL: market.db journal-mode guards — runtime cron + source CI (FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED)**
```bash
bash scripts/audits/verify-market-db-journal-mode.sh                       # runtime: live container, 0=PASS/2=FAIL/3=ERROR
bash scripts/audits/verify-market-db-journal-mode.sh --self-test           # proves both branches against the live container
bash scripts/audits/verify-market-db-journal-source-guard.sh --check       # source: static repo-wide scan, exit 0 pass / 1 fail
```
TWO complementary guards, neither a substitute for the other (`verify-market-db-journal-source-guard.sh`'s
own header explains why): the RUNTIME guard (pre-existing since `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-
DELETE-MITIGATION`, 2026-07-30 — this task only wired it, never rewrote it) asserts the live container's
on-disk `journal_mode`/`-wal`/`-shm` state via two read-only `docker exec` calls but cannot say WHICH code
path re-armed it; the SOURCE guard (new, this task) statically greps tracked source for an unsanctioned
journal_mode SET against market.db but cannot see a runtime-only PRAGMA outside tracked source. Policy SSOT:
`docs/policies/market-db-journal-mode-policy.md` (DELETE + synchronous=FULL, sole owner
`apps/mcp-server/src/infrastructure/db/schema.ts`, WHY + durability trade-off + the `e370f5f51` cautionary
example of how the policy broke 14h after its own fix).

RUNTIME wiring: `*/15 * * * *` standalone cron (`market-db-journal-guard`, PO's explicit 15-min floor) via
the `cron-standalone-team` lane — `.claude/commands/crons/cron-market-db-journal-guard.md` (authoring doc)
→ `.claude/skills/cron-standalone-team/register-job-market-db-journal-guard.md` (ported-verbatim
`CronCreate` call) → `.claude/skills/cron-standalone-team/SKILL.md` Step 1 idempotency-guard entry 6/6. No
subagent spawn — the prompt runs the probe and branches on its own exit code directly (0=PASS no action,
2=FAIL/3=ERROR both alert `send_telegram(channel="bug", message=<verdict line verbatim>)` — ERROR alerting
too is a deliberate extension beyond AC-1's literal FAIL-only wording, since an unmonitored, silently-broken
probe is the same "guard shipped but never armed" defect one layer up). Exit-contract discipline (0=PASS/
2=FAIL/3=ERROR, verdict always stdout line 1) is preserved by the caller: never `&&`-chained, never
`tail`-truncated (see `feedback_verdict_exit_code_gated_by_and_chain_swallows_actionable_output` /
`feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it`). Alert path proven live at
authoring time against a genuine (not synthetic) FAIL verdict via `scripts/agents-flow/mcp-call.sh`'s
`mcp_call` bridge — delivered, `message_id: 4809`.

SOURCE guard checks (opt-IN allowlist — ONLY `schema.ts` is exempt, never an opt-OUT ignore-list of "known
safe" files, per `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`): (1) TS/JS — a `PRAGMA
journal_mode =` SET within 20 lines of a market.db path token (`Bun.env["DB_PATH"]`/`DEFAULT_DB_PATH`);
WINDOW=20 is calibrated against the one legitimate non-owner SET in the corpus
(`coordinationStore.ts`, WAL for the separate, PO-approved `coordination.db` — its own token/SET distance is
27 lines, safely outside WINDOW); a bare PRAGMA read (no `=`) never matches. (2) Go — the literal
`_journal_mode=` token anywhere in a non-test `.go` file (the exact shape `e370f5f51` reintroduced in
`apps/stock-price/pkg/infrastructure/fetchers.go` — the Go-DSN gap a TS-only sweep would have missed
entirely). Test files (`__tests__/`, `*.test.ts`, `_test.go`) are structurally out of scope for both checks
(same `EXCLUDE_PATTERN` idiom as `no-hardcode-allowlist-scan.sh`) — every test file that sets journal_mode
does so against an ephemeral fixture, never live market.db. 0 offenders against the live corpus at
authoring time (verified before shipping, per the fleetwide-validation lesson above). Wired as the
`verify-market-db-journal-source-guard` job in `.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no
toolchain — cheapest job in the pipeline). Test:
`scripts/audits/verify-market-db-journal-source-guard.test.sh` (6/6: live-repo PASS, TS re-arm fixture FAIL,
Go DSN re-arm fixture FAIL, coordinationStore.ts-shape negative control PASS, Go test-file PASS, bare-read
PASS).

**CANONICAL: cowork-team tick-postflight batch (UC-CDC-P7 Phase 2b)**
```bash
scripts/agents-flow/cowork-tick-postflight.sh <slot_id> [<slot_id> ...]
```
Consolidates 3 previously-separate per-tick call sites: (a) Step 5b `last_fired` batch write —
verbatim delegation to `scripts/agents-flow/cowork-write-last-fired.js`, no reimplementation;
(b) Step 4.7 cycle-snapshot assembly (pure-bash jq, same contract as `tick-snapshot.md`); (c)
NEW `docs/signals/processed/cowork-team-*.json` retention sweep (>14d, `git rm` — staged, not
committed), deliberately scoped to already-`processedAt`-stamped files only (never the live
inbox, never an unstamped row) so it cannot delete anything `drain-signals.js` hasn't already
finished with. Owning flow docs: `docs/agents/cowork-team/flow/last-fired.md`,
`docs/agents/cowork-team/flow/tick-snapshot.md`. Test: `scripts/agents-flow/cowork-tick-postflight.test.sh`.
Also see `scripts/agents-flow/cowork-match-slots.js`'s in-script Step 4.5 freshness-downgrade +
Step 4.5c CHEF mutex (same UC-CDC-P7 Phase 2a) — `applyFreshnessDowngrade()` derives the
gatherer-slot set from `cowork-schedule.json`'s `parallel_group=="gatherers"` field, never a
hardcoded literal.

`/tmp` is allowed ONLY for throwaway run-scoped DATA (payload json, stderr capture, session-id cache) — never for executable logic.

**CANONICAL: system-auditor C-04 DB predicate (FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE)**
```bash
bash scripts/auditor-db-checks.sh          # JSON stdout, .checks.c04.verdict = PASS|WARN
bash scripts/auditor-db-checks.test.sh     # regression suite, 29 assertions
```
Extends `scripts/db-integrity-counts.sh`'s host-bind/WAL-guard discipline (own file, `checks.c04`
key, room for future Tier-2/3 predicates per UC-ASL-P3). Computes: `COALESCE(published_at,
parsed_at)` recency (`published_at` is immutable — frozen at first insert, excluded from the
reparse `ON CONFLICT DO UPDATE` clause — `parsed_at` is a mutation timestamp re-stamped on every
reparse) + `validation_status NOT IN ('pending','pending_extraction')` population filter (excludes
never-extracted shell rows without excluding genuine zero-confidence extraction failures) + a
RATE-with-volume-floor threshold (`extracted_total_window >= 20 AND lowconf_rate_pct > 15` → WARN)
replacing the old inline-SQL C-04 predicate's absolute `≤5` count (`datetime(parsed_at) >
datetime('now','-7 days') AND extraction_confidence < 0.2`), which could not stay sensitive on
small batches while staying silent on large healthy ones. Full derivation:
`docs/handoffs/FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md`.
**Not yet wired** (deliberate, zone split): `docs/agents/system-auditor/flow/main.md` is
`agent-father`'s exclusive commit zone — this row's own PO-ratified scope is `scripts/` ONLY and
explicitly forbids editing that file. The C-04 table-row repoint (spec §4's verbatim diff) is a
separate, dependent BACKLOG row, `FIX-AUDITOR-C04-FLOWDOC-REPOINT` (`owner: agent-father`,
`depends_on: [FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE]`) — until that row lands, `main.md`'s
C-04 check still runs the OLD inline SQL; this script exists and is tested but is not yet the
check the live auditor actually executes. Locale note: both `awk printf "%.2f"` calls MUST use
`LC_NUMERIC=C` — this host's `fr_FR.UTF-8` default emits a comma decimal separator (`"0,00"`),
which is invalid JSON; caught live while implementing this fix, fixed in the same commit.

**Maintenance (user directive 2026-06-07):** agents MAY update/upgrade an existing `scripts/` script to work better or optimize (fix bugs, harden, speed up, extend) — improving the shared script beats writing a parallel one-off. Rules: (1) if the script implements a flow spec, edit the spec first, then the script — they MUST stay in sync; (2) smoke-test after the change (clean no-op run at minimum); (3) keep the usage contract (CLI args/env/stdout) backward-compatible or update every caller + flow pointer in the same commit; (4) commit under commit-mutex.

## Code Search — Preferred Tools

| Task | Tool |
|------|------|
| Find how a function/class/API works | `mcp__semble__search` |
| Locate callers, usages, implementations | `mcp__semble__search` |
| Discover related code patterns | `mcp__semble__find_related` |
| Exhaustive literal / regex match | `Grep` |
| Read a specific known file | `Read` |
| Find files by name pattern | `Glob` |

Agents call `mcp__semble__search` and `mcp__semble__find_related` directly — no CLI command, no sub-agent spawn. Full decision table (when Semble vs Grep/Glob/Read) → `.claude/skills/semble-search/SKILL.md`.

---

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `apps/mcp-server/src/domain/services/` |
| Data model / entity | **domain** | `apps/mcp-server/src/domain/models/` |
| Repository interface (port) | **domain** | `apps/mcp-server/src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `apps/mcp-server/src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `apps/mcp-server/src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `apps/mcp-server/src/application/usecases/` |
| MCP tool handler | **interface** | `apps/mcp-server/src/interface/mcp/tools/` |
| Cron job | **interface** | `apps/mcp-server/src/interface/scheduler/` |

**Golden rule**: `domain/` has ZERO imports from `infrastructure/`.

## Coding Standards

```typescript
// Runtime config: always Bun.env, never process.env
const port = Bun.env.PORT ?? "3000";

// Import paths: always .js extension (ESM compatibility)
import { embed } from "../infrastructure/rag/embeddings.js";

// No any — use unknown + type narrowing

// MCP tools: ALWAYS return this exact format
return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };

// All financial numbers: million VND (document in JSDoc)

// Fetchers: ALWAYS use browser User-Agent (Vietnamese sites block bots with 503)
// Fetchers: multi-tier fallback pattern (see hose.ts as reference)
// Fetchers: VnDirect stock_prices works for ALL exchanges (HOSE, HNX, UPCOM)

// Sector context: use sectorPeers.ts for 16 sectors including 'automotive'

// Telegram alerts: plain text, Vietnamese format, no Markdown
```

## Test File Template

```typescript
// apps/mcp-server/src/__tests__/NNN-task-name.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";

describe("Task NNN — Title", () => {
  it("does the expected thing", () => {
    // ...
    expect(result).toBe(expected);
  });

  it("handles edge case", () => {
    // empty input, Vietnamese negatives, missing fields
  });
});
```

## Parallel Agent Dispatch

| Scenario | Dispatch | `isolation` param |
|----------|----------|-------------------|
| Tasks with disjoint file scopes | parallel | `isolation: "worktree"` REQUIRED |
| Tasks touching shared SSOT files | sequential | omit `isolation` |
| Sequential (default / anti-c37) | sequential | omit `isolation` |

**Shared SSOT files that hard-trigger sequential dispatch:** `docs/data/orch/orch-state.json`, `docs/data/project-stats.json`, any agent `.md` file.

Sequential dispatch remains the DEFAULT until c44 verification passes (see Phase 3 roadmap).

Source: `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`

---

## Branch Hygiene (after QA merge)

After merge to main, verify:
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Delete task branch: `git branch -d task/NNN-*` + `git push origin --delete task/NNN-*`
4. Remove worktrees: `git worktree remove --force .claude/worktrees/<name>`
4a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` before deleting the task branch.
5. Drop stashes from merged branch

Full reference → `.claude/WORKFLOW.md#branch-hygiene-checklist`

## Commit Format

Full spec → `docs/policies/commit-convention.md` (type vocabulary, scope, task-id, trailers, worked example, no-sprint rule).

Shell mechanism — always use the heredoc pattern, pathspec-scoped (never bare — a bare `git commit -m "..."` with no trailing pathspec is hard-rejected by the live `scripts/git-hooks/pre-commit` sweep guard once this session's pooled bare-commit warn count passes threshold):

```bash
git commit -m "$(cat <<'EOF'
<type>(<sprint>/<area>): <task-id> <one-line title>

<optional body>

Sprint: <sprint>
Task: <task-id>
AC: <terse criterion 1> / <terse criterion 2>
EOF
)" -- <explicit paths>
```

## Push Policy — Autonomous Push Gate

**CANONICAL: PUSH-AUTONOMY-1 (user directive 2026-07-14).** Supersedes any "push only when user asks" / user-gated-push stance — that rule was never written; do NOT resurrect it. Never freeze the pipeline or `head` on "awaiting user push".

1. **Push is autonomous.** `git push origin main` requires NO user authorization when the gate below is green.
2. **Gate — 100% tests green, RAW:**
   - supervised cascade complete for the head task (dev commit + QA APPROVE + PO sign-off, each RAW-verified), and
   - targeted/merge-gate suite: 0 fail — assertions may not be skipped or deleted to reach green, and
   - pre-push hook (`pnpm --filter vn-market check`) green — never bypass with `--no-verify` / `PRE_PUSH_SKIP_TSC=1`.

**CANONICAL reading (pinned 2026-07-22, qa — `BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA`):** "targeted/merge-gate suite: 0 fail" means the suite scoped to the touched surface (+ a base-vs-head A/B on the highest-risk cluster when in doubt), NOT the repo-wide `bun test` run. `apps/mcp-server` carries a standing, tracked, order-dependent full-suite red (`FIX-MCP-SUITE-HEALTH-BASELINE`, drifted 40→42) that makes a literal full-suite "0 fail" reading permanently unsatisfiable — do not re-litigate that baseline inside a push decision; verify zero NET NEW failures (base vs head A/B) instead.
3. **Executor + serialization:** the session holding the chain mutex (dev-team tick) pushes; router may push on direct user instruction. ONE push at a time (fleet-push serialization).
4. **Post-push CI gate:** RAW-verify CI GREEN on the NEW head SHA (`gh run list --branch main`) — gate id `ci_green_on_subsequent_push`.
5. **Post-push REAL-DATA verification task (mandatory):** after CI green, po mints a board task `VERIFY-<task-id>-REALDATA` whose verification gate is a RAW-live probe of the SERVING layer with real data (the live tool/endpoint returns correct values) — test-suite green alone does NOT close the loop. If the change touches serving code, the task's precondition is the single-service rebuild+deploy (`docker compose build <svc> && docker compose up -d --no-deps <svc>`), executed by ops per OVERRIDE 2026-07-03 — no user gate.
   **Mechanized (partial) via `FACTORY-GUARD-CI-RAWVERIFY-IMPL`, see the CANONICAL entry above:** the PO-mint-task requirement itself is unchanged and still NOT mechanically enforced — what IS enforced is the lighter, immediately-checkable bar that a commit adding a `confidence`/`score`/`impact`/`magnitude`/`probability`-named field to a DB-write/route-serving DDD layer carries SOME textual RAW-verify/REALDATA attestation (commit message, decision-journal/task-report entry, or inline `raw-verify-allow:` annotation) before it can land — `scripts/git-hooks/pre-push` blocks locally, `.github/workflows/ci.yml`'s `rebuild-raw-verify-hook` job backstops in CI.
