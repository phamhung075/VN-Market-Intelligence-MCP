# Developer — Notebook

**Last updated:** 2026-08-14T14:35:00Z | **Cycle:** FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE (P0 live-data-loss — nso_ts_key() commit-SHA/date collision fixed)

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

## Session 2026-08-14T12:40:16Z — UC-CCA-P2-SKILL-GW-GATE (cross-service/, developer, P1 S, PM-decomposed subtask of UC-CCA-P2, router dispatch, session 632721c2)

**Task:** FR-1/FR-2 per architect's ratified design (`UC-CCA-P2-BA-spec.md` § [Architect] Brownfield Findings) — restructure `gateway-availability-gate/SKILL.md`'s flat "probe once, fail immediately" Step 0-GW into a DMS-2 escalation ladder. Scope is this ONE file only — the 9 sibling flow-file insertions (FR-3/FR-4/FR-5) are separate PM-decomposed rows owned by market-watcher/alert-commander/unified-agent/digest-predict/bctc-analyst/fb-market-poster, not touched here.

**Shipped:** classify PROBE_1 error — CONFIRMED-BLIND (trigger text IDENTICAL to `cycle-bootstrap/SKILL.md` § Error handling's own signature, cited not forked) skips backoff, escalates immediately (unchanged); TRANSIENT waits 30s → PROBE_2 (own failure never re-classified, always falls through to the sibling check) → `SIBLING_RECENT = get_agent_signals(hours_back=0.25)` — non-empty suppresses (new DEFER notebook template, OVERWRITE/APPEND split mirroring BLOCKED, no signal/no bug, clean EXIT), empty escalates via the existing a/b/c actions with one additive payload suffix. 101L→169L, inside AC-1's ≤200L cap (architect's own ~171-176L estimate — landed under it).

**Verified FR-2 hard invariant:** `grep -n "send_telegram"` on the edited file returns zero hits — the one place I considered naming the tool literally (a new PROHIBITIONS bullet) I paraphrased instead ("Telegram/notification tool call"), matching the original file's own pattern of never naming `send_telegram` literally and keeping AC-2's grep-zero-hits check literally true, not just spiritually true.

**AC-6 (news-scout inheritance):** re-checked `news-scout/flow/cycle.md:15` — still points at the skill unchanged; the new APPEND-class DEFER wording is agent-id-generic and reads coherently for news-scout without any file edit (verification-only, per BA's own AC-6 requirement).

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding; no MCP gateway binding either (INV-GATEWAY-1) — immaterial this task, no `task_claim`/`send_telegram` was needed.

**Closeout:** commit pending, pathspec-scoped (`.claude/skills/gateway-availability-gate/SKILL.md` alone). Decision journal STEP developer-S26. Board flip `ready[]`→`done[]`/`status=DONE` — leaf task, no downstream `next_agent` per router's own dispatch note.

---
