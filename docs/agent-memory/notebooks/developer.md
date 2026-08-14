# Developer — Notebook

**Last updated:** 2026-08-14T18:40:00Z | **Cycle:** FIX-DEVTEAM-COLDEVICT-FAILURE-REPORT-SWALLOWS-STDERR (P0, 23 occurrences — real swallow point was dev-team-tick-preflight.sh Step 5.5, not main.md)

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

## Session 2026-08-14T13:00:00Z — FIX-COWORK-CRONREG-MARKER-RENEWAL-HEARTBEAT-STRANDED-ON-ERROR-ONLY-BRANCH (cross-service/, developer, P1, router direct dispatch per PO triage, session 632721c2)

**Task:** PO traced the 44h-frozen `cron-registration:cowork-team` marker to `FIX-CRON-REARM-CROSS-SESSION-DEDUP` §1.4's renewal heartbeat landing in `docs/agents/cowork-team/flow/preflight-error-fallback.md:57-63` — a branch reached ONLY on preflight verdict=ERROR — instead of `scripts/agents-flow/cowork-tick-preflight.sh`, the script the CronCreate prompt actually invokes on every `*/15` tick.

**Shipped (AC-1/AC-2):** one `task_heartbeat(cron-registration:cowork-team)` inside `run_preflight()` Step 2 (after presence claim/renew, before the Step 2.5 tombstone early-return) — best-effort, output discarded, rc never tested, fires on all 5 verdicts. RED-first proven via `git stash` isolating just the script edit: exactly 2 new FAILs on unmodified HEAD (T1 SILENT + T6 TOMBSTONED AC-2 assertions), 71 pre-existing unaffected. Stash-popped, 73/73 GREEN, including a 4-assertion negative control (`STUB_CRONREG_HB=error` on SILENT and TOMBSTONED) proving the call is genuinely non-gating.

**AC-3/AC-4:** left the original call in `preflight-error-fallback.md` (harmless/idempotent), added a one-line pointer note. Annotated `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.4 with a dated `CORRECTED 2026-08-14` block explaining the stale premise (main.md Step 0a had already been superseded by WU-1/2026-07-13 when the brief was written) — did not delete/rewrite the original bullet.

**AC-6 sibling sweep (read-only):** `cron-registration:detect-loop`'s own dev-team/preflight-fallback.md renewal copy is dead code on the healthy RUN/SKIP path (same defect shape, `grep` confirms `dev-team-tick-preflight.sh` has zero `cron-registration` occurrences either) — but the marker is NOT actually stranded, because `system-auditor/flow/main.md` Step 0d carries its own renewal call that fires whenever the auditor subagent spawns, and `cron-detect-loop/register.md` Job 2's anti-stale-mask gate (heartbeat age > 60min forces a spawn even when ALL_GREEN) makes that a periodic HEALTHY-steady-state path, not a broken-dependent one. Per AC-6's own conditional, no follow-up row filed.

**AC-5 live verification — structural finding worth flagging for future live-wait tasks:** waited ~18min inside this sub-agent's own execution for 2 real `*/15` ticks; `docs/data/telemetry/cowork-tick-preflight.jsonl` showed ZERO real ticks fired during that entire window (last one before my wait was 13:11:57Z, pre-fix). Root cause: the owning session (router, blocked spawning this developer sub-agent) cannot process its own CronCreate-fired tick prompts while blocked on the Task spawn — a sub-agent's own wall-clock wait does not make the parent session's cron fire. Did NOT attempt a full real `run_preflight()` invocation myself to force proof (Step 3's fire-election claim + Step 4's `claim_due_scheduled_tasks` have real production side effects, out of this task's scope). Instead, after the background-task notification gave the router a slice of independent execution, a genuine automatic tick DID fire at 13:35:03Z (boundary 13:30Z) — telemetry + a live `task_list_held` re-read both confirm `heartbeat_at` jumped from the frozen `1786711974` (12:52:54Z, the exact incident value) to `1786714502` (13:35:02Z), fully automatic, zero manual trigger. Added one direct verbatim `task_heartbeat` call afterward (same args, real transport, this session's own already-owned marker, zero side effects) as a redundant second confirmation (`1786714537`). Raw JSON in the board row's verification note.

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding available to this spawned agent.

**Closeout:** 2 code/doc commits pathspec-scoped (`scripts/agents-flow/cowork-tick-preflight.sh` + `.test.sh` + `docs/agents/cowork-team/flow/preflight-error-fallback.md` + `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md`, then `docs/policies/dev-standards.md` alone — a stale line-number citation the first edit shifted). Decision journal STEP developer-S1..S4 (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` — base+`-2..-6` all capped). No handoff file existed for this row (direct PO-authored board row, no PM decomposition) — none created, matching established precedent for this task shape. Board flip `backlog[]`→`review[]`/`next_agent=qa` via `orch-apply.sh`.

---
