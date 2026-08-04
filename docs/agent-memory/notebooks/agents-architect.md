# agents-architect — Notebook

## 2026-07-31T01:48:31Z

**Brief:** `docs/architecture-briefs/2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md`

Po directly dispatched (post-triage) FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION: sweep-guard hook (`scripts/git-hooks/pre-commit`) logs BARE commits forever but never blocks (14 warns/8h, 4 sessions), and this session's own triage had been dispositioning all 4 live signals "benign" on a clean `git show --stat` (outcome), not the mechanism the discriminator already proves by construction. Designed a per-actor escalation actuator (`GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=3` default, reuses existing `.git/sweep-guard.log` `actor=` field, zero new deps) that converges repeat offenders to a hard block same-session, without waiting on po's own staged fleet-wide `GIT_SWEEP_GUARD_MODE` flip (kept as Phase 2, 24h observation + rollback command). New routing rows for `triage-signals.md` + `drain-signals.md` §0a-3 make the mechanism check (payload's own BARE/SCOPED tag + new `escalated=` field) mandatory and name the "`git show --stat` clean" non-disposition explicitly forbidden.

**Signal dropped:** `docs/signals/sweepguard-escalation-actuator-and-triage-mechanism-check-20260731T014831Z.json` → agent-father (cc po, dev-team)

---

## 2026-07-31T04:29:55Z

**Brief:** `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md`

FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY: triage-signals.md's `ci_red` row dedups only on SHA-derived `check_id`/`head_sha` and never reads the `FAILEDFILE` block `scripts/ci-per-file-isolation.sh` emits, so 8 reds/3 files/4 days got amnestied as "standing baseline" and minted zero rows (RAW-verified by a prior PO pass, re-confirmed). Designed: mandatory pre-dedup `gh run view {run_id} --log-failed` FAILEDFILE read, FILE-scoped `dedup_key: ci_job:<job>|file:<file>` as primary dedup key — already field-validated twice in production ahead of this row shipping (`FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT`, `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`, `FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A`) — plus an explicit anti-amnesty fence vs `FIX-MCP-SUITE-HEALTH-BASELINE` and a 0-fail-baseline backstop. `ci-health-probe.md` gets a doc-accuracy-only correction (no probe/script behavior change, CANON-SCRIPT untouched, `payload.run_id` already threads through end-to-end). AC-5 retro-sweep executed: `1408-tool-diacritics` (fixed `9374e65e0`) and `emit-pressure-state` (fixed `98917416a`+`d19d6cdc5`) both confirmed GREEN on current main (run 30603458514, 0 fail).

**Signal dropped:** `docs/signals/cired-triage-failedfile-dedup-20260731T042955Z.json` → agent-father (cc po, dev-team)

---

## 2026-08-04T18:16:13Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md`

Ad-hoc user request ("right moment, not all the time") across cowork-team/dev-team/system-auditor: 15-cron inventory found cowork's DWF-Phase1 `cadence-policy.json` engine and dev-team/system-auditor's independently-reinvented bespoke idle/health gates (dev-team RUN-IDLE; `auditor-tier1-probe.sh` ALL_GREEN+fresh-heartbeat) already adaptive; one naively-fixed cron found (`cron-db-data-integrity.md` — zero conditioning, full agent spawn every 30min 24/7); one latent config gap (alert-commander `policy_id` has zero matching `cadence-policy.json` rows — masked today only because the fleet is in legacy-cron fallback); and one distinct operational finding kept separate from the design question per the brief's own instruction: fleet crons (cowork-team, dev-team, auditor Tier-1/2/3) have been unarmed ~3 days (`CronList` empty, `pressure-state.json` 72h stale, independently corroborated via a git-log gap since commit `02d9ac3c7`) — a re-arm gap, not a broken design. Verdict on whether this is the deferred Phase 3+ greenlight: NO — the ask is Phase-1's domain (already shipped for cowork); Phase 3/4/5 solve routing/DAG/backpressure, a different problem, and correctly stay deferred. Brief ends with a 7-item numbered candidate list for user confirmation — PLAN-ONLY, nothing implemented, no cron/flow/`.task_board` file touched.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only
