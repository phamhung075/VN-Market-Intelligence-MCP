# Developer — Notebook

**Last updated:** 2026-08-14T20:20:00Z | **Cycle:** FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE (P0, PO-split piece 1/2 — reachable §2b plane-crosscheck gate added to auditor-notebook-commit.sh)

## Session 2026-08-14T20:20:00Z — FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE (cross-service/, developer, P0 S, PO-split piece 1/2, session 632721c2)

**Task:** Root cause per `docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md` §4 — `scripts/auditor-notebook-commit.sh`'s §2a AC-4 backstop scans the staged notebook diff for a literal `[OUTPUT-CONTRACT]` line the flow doc never actually writes INTO the notebook (only the RETURN block, computed by a different script call the 2026-08-06 durability reorder now runs AFTER the notebook commit lands) — structurally unreachable every cycle since. PO-split into 2 pieces; this session owns piece (1) ONLY: `scripts/auditor-notebook-commit.sh` + `scripts/lib/output-contract-invariant.sh`. Piece (2) — `docs/agents/system-auditor/flow/main.md:1173-1177`'s 2-arg call-site edit — is agent-father's zone, deliberately NOT touched this session (confirmed `git status --porcelain` on that path is empty).

**Shipped (AC-1/AC-2):** new REACHABLE §2b gate in `auditor-notebook-commit.sh`, additive — §2a left untouched. New optional `--markers-file <path>` / `--cycle-tag <value>` args parsed out of `"$@"` (omitted ⇒ byte-identical no-op, every existing caller incl. orch-sentinel's own commit call unaffected). When `--markers-file` is supplied and the staged path is exactly `docs/agent-memory/notebooks/system-auditor.md`: cross-checks the notebook's already-mandatory "Anomalies: N new" line (declared_n) against the real `[emit-signal] OK...` count in `$MARKERS_FILE` (real_signals_n); mismatch (declared_n>0 AND real_signals_n==0) → `git restore --staged` + exit 1 (REFUSE — never rewrite-to-truth, never commit-plus-discrepancy-signal, per the brief's explicit AC-4 ruling). 3 new pure functions added to `scripts/lib/output-contract-invariant.sh` (`oc_extract_declared_anomaly_count_from_diff` / `oc_count_real_emit_signals` / `oc_check_emit_vs_claim_plane`).

**AC-4 (synthetic replay, mandatory per the task — presence alone is not proof, feedback_fence_false_green):** new `scripts/auditor-notebook-commit.test.sh`, 24/24 — 11 unit tests on the 3 pure lib functions (no git/network) + 13 integration tests running the REAL script as a REAL subprocess against isolated tmp git repos, only `curl` (mcp-call.sh's transport) stubbed via a PATH-shadowing fake binary (mirrors `auditor-tier1-probe.test.sh`'s own CLI-level T22/T23 precedent — zero real network/mutex contention). The required before/after pair: I1 = declared=3/markers=0, `--markers-file` OMITTED → commit LANDS (today's real, reachable vulnerable shape, exact unmodified 2-arg call contract every live caller still uses); I2 = identical mismatch shape, `--markers-file` SUPPLIED → real ABORT `contract-plane-mismatch`, exit 1, zero new commit, notebook path un-staged, working-tree content SURVIVES (`git restore --staged` only unstages, per the brief's explicit resume-mitigation rationale).

**Regression check:** existing consumers of the shared lib unaffected — `detect-analysis-only-exit.test.sh` 15/15, `audit-output-contract.test.sh` 87/87. `shellcheck -x` clean on all 3 touched/new files (1 reserved-`CYCLE_TAG_ARG` SC2034 silenced, same convention as `emit-audit-signal.sh:630`).

**Docs updated:** `docs/policies/dev-standards.md` OUTPUT-CONTRACT CANONICAL block (new functions + superseded the stale "no persisted test harness" note) + `docs/WORK.md`.

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding available to this spawned agent.

**Closeout:** commits pathspec-scoped (`scripts/auditor-notebook-commit.sh` + `scripts/lib/output-contract-invariant.sh` + `scripts/auditor-notebook-commit.test.sh`, then `docs/policies/dev-standards.md` + `docs/WORK.md` separately). Decision journal STEP developer-S7 (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md`). No handoff file existed for this row (PO-split board row, `status_note`/`acceptance` fields are the spec) — none created, matching established precedent. Board flip `in_progress[]`→`review[]`/`next_agent=qa` via `orch-apply.sh`. RETURN flags piece (2) explicitly so the dispatcher routes agent-father separately once this script change is confirmed landed — not silently implied.

---

## Session 2026-08-14T18:40:00Z — FIX-DEVTEAM-COLDEVICT-FAILURE-REPORT-SWALLOWS-STDERR (cross-service/, developer, P0 S, Ready-Lane Consumer dispatch, session 632721c2)

**Task:** 23 occurrences of "orch-cold-evict.sh failed" with zero stderr — PO's own manual re-runs always exited 0 clean seconds later against the same file, proving the script itself was not the defect.

**Found the real swallow point:** NOT `docs/agents/dev-team/flow/main.md` (no inline copy of this step exists there — confirmed via grep, zero hits). It is `scripts/agents-flow/dev-team-tick-preflight.sh` Step 5.5, the CANON-SCRIPT runtime for `post-cycle.md` § Step 4.2. `_step55_run_cold_evict()` already captured `orch-cold-evict.sh`'s combined stdout+stderr into a LOCAL var (printed to this script's own stderr for cron-log visibility per the earlier STDOUT-LEAK fix) but never exposed it past the function return — the caller (`_step55_cold_evict_and_commit`) only ever saw the exit code.

**Shipped:** (1) stash captured output+rc into module globals (`_STEP55_COLD_EVICT_OUTPUT`/`_STEP55_COLD_EVICT_RC`, freshly overwritten every call); (2) new `_step55_is_benign_cas_loss()` matches the script's own definitive CAS-exhaustion line (`ABORT: CAS retry limit (N) exceeded ... concurrent writer`) — the ONLY message it emits when its mtime-CAS loop or `orch-apply.sh`'s downstream exit-2 CAS guard loses to a peer writer; (3) benign branch logs only, zero telegram; (4) genuine-failure branch keeps reporting, now with real exit code + `_trunc()`'d verbatim stderr (reused the file's own existing helper, no new truncation pattern). `post-cycle.md` § Step 4.2 updated in lockstep (its own header says "edit the spec first").

**Test coverage:** 2 new cases in `dev-team-tick-preflight.test.sh` — T30b (synthetic CAS-exhaustion fixture → zero `send_telegram` calls, AC), T30c (synthetic genuine-failure fixture → telegram content asserted to contain both `exit 1` and the verbatim stderr snippet, AC). New `TELEGRAM_ARGS_LOG_FILE` capture seam added to the test harness's `mcp_call` stub (previously call-counted only, never content-asserted). Full suite 154/154 (146 pre-existing + 8 new), zero regressions. `shellcheck -S warning` clean on both touched scripts.

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding available to this spawned agent.

**Closeout:** commit pending, pathspec-scoped (`scripts/agents-flow/dev-team-tick-preflight.sh` + `.test.sh` + `docs/agents/dev-team/flow/post-cycle.md`, then `docs/WORK.md` alone). Decision journal STEP developer-S27 (`sprint-ULTRACODE-AUDIT-FIXALL-developer.md`). No handoff file existed for this row (Ready-Lane Consumer direct dispatch, board row's own `status_note`/`evidence_20260814` fields are the spec) — none created, matching established precedent. Board flip `in_progress[]`→`review[]`/`status=REVIEW`/`next_agent=qa` via `orch-apply.sh`.

---

## Session 2026-08-14T14:00:00Z — FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE (cross-service/, developer, P0 S, BOUNDED-1 idle-capacity auto-pickup, session 632721c2)

**Task:** P0 live data loss — `nso_ts_key()` (`scripts/agents-flow/lib/notebook-section-direction.sh`) used `grep -oE <date-regex> | tail -1` with the ISO time-of-day suffix OPTIONAL, so an all-numeric git short-SHA cited later in a `## cycle-N · <ISO ts> · ... commit \`<sha>\`` heading (live `qa.md` convention) matched the same pattern as the real timestamp — `tail -1` always won on whichever match came LAST, i.e. the SHA. Confirmed live: `notebook-auto-prune.sh`'s drop-oldest loop destroyed `TASK-COWORK-MUTEX-001`'s QA CHANGES_REQUESTED review record with zero signal (cycle-705's real ts 2026-08-14T01:33:11Z buggy-keyed as `76198814000000000` from SHA `761988143`, outranking the genuinely-newer cycle-711's correctly-keyed `20260814013311000`).

**Shipped (AC-1):** two-tier extraction. Tier 1 requires the literal `T..Z` suffix (`head -1`, first match) — collision-proof by construction, hex SHAs (0-9a-f) can never contain a literal `T`/`Z`. Tier 2 fallback (bare date-only, the live `qa.md` "cycle-N · YYYY-MM-DD" convention) is boundary-guarded `(^|[^0-9])...([^0-9]|$)` so a truncated digit-run prefix of a longer pure-digit SHA can never match either. Verified: `nso_ts_key` on the literal cycle-705 heading text now returns `20260814013311000` (not the buggy `76198814000000000`) — matches the board row's own evidence numbers exactly.

**AC-2 (RED-first regression):** new `T11` in `scripts/agents-flow/notebook-auto-prune.test.sh` — 2-section fixture mirroring the live shape (TASK-OLD: genuinely oldest, trailing all-digit SHA `761988143`; TASK-COWORK-MUTEX-001: genuinely newest, hex SHA). `git stash` on just the lib fix reproduced the exact live bug (TASK-OLD wrongly retained, the newest section wrongly dropped) before restoring — proves the test catches the real defect. GREEN: `notebook-auto-prune.test.sh` 11/11 pass.

**AC-3:** scanned every `## ` heading across all live `docs/agent-memory/notebooks/*.md` via `nso_ts_key` — 0 non-sentinel keys with an implausible (non-`20xx`) year prefix.

**AC-4 (data recovery):** `TASK-COWORK-MUTEX-001`'s destroyed CHANGES_REQUESTED verdict was still intact in that row's own `.note` field (only the `qa.md` notebook copy was lost) — reconstructed onto its empty `.status_note` via `orch-apply.sh`.

**Regression check:** sibling test `test-notebook-auto-prune.sh` has one PRE-EXISTING unrelated failure (Test 9, zsh `BASH_SOURCE` sourcing bug, tracked separately as `FIX-NOTEBOOKAUTOPRUNE-HOOKGUARD-BASHSOURCE-ZSH-BREAK`) — reproduced identically with my changes `git stash`-reverted, confirmed out of scope, not caused by this fix.

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding available to this spawned agent.

**Closeout:** commit pending, pathspec-scoped (`scripts/agents-flow/lib/notebook-section-direction.sh` + `scripts/agents-flow/notebook-auto-prune.test.sh`, then `docs/WORK.md` alone). Decision journal STEP developer-S5 (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md`). No handoff file existed for this row (BOUNDED-1 direct-execute mint, board `note`/`evidence`/`acceptance` fields are the spec) — none created, matching established precedent for this task shape. Board flip `in_progress[]`→`review[]`/`status=REVIEW`/`next_agent=qa` via `orch-apply.sh`, `.head` synced to idle in the same write per `execute-tier.md` CANONICAL:SSOT-STATUSFLIP-LANEMOVE rule (b) (`branch:null` flip).

---
