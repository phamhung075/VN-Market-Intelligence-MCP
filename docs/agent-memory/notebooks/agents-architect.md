# agents-architect — Notebook

## 2026-07-31T04:29:55Z

**Brief:** `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md`

FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY: triage-signals.md's `ci_red` row dedups only on SHA-derived `check_id`/`head_sha` and never reads the `FAILEDFILE` block `scripts/ci-per-file-isolation.sh` emits, so 8 reds/3 files/4 days got amnestied as "standing baseline" and minted zero rows (RAW-verified by a prior PO pass, re-confirmed). Designed: mandatory pre-dedup `gh run view {run_id} --log-failed` FAILEDFILE read, FILE-scoped `dedup_key: ci_job:<job>|file:<file>` as primary dedup key — already field-validated twice in production ahead of this row shipping (`FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT`, `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`, `FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A`) — plus an explicit anti-amnesty fence vs `FIX-MCP-SUITE-HEALTH-BASELINE` and a 0-fail-baseline backstop. `ci-health-probe.md` gets a doc-accuracy-only correction (no probe/script behavior change, CANON-SCRIPT untouched, `payload.run_id` already threads through end-to-end). AC-5 retro-sweep executed: `1408-tool-diacritics` (fixed `9374e65e0`) and `emit-pressure-state` (fixed `98917416a`+`d19d6cdc5`) both confirmed GREEN on current main (run 30603458514, 0 fail).

**Signal dropped:** `docs/signals/cired-triage-failedfile-dedup-20260731T042955Z.json` → agent-father (cc po, dev-team)

---

## 2026-08-04T18:16:13Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md`

Ad-hoc user request ("right moment, not all the time") across cowork-team/dev-team/system-auditor: 15-cron inventory found cowork's DWF-Phase1 `cadence-policy.json` engine and dev-team/system-auditor's independently-reinvented bespoke idle/health gates (dev-team RUN-IDLE; `auditor-tier1-probe.sh` ALL_GREEN+fresh-heartbeat) already adaptive; one naively-fixed cron found (`cron-db-data-integrity.md` — zero conditioning, full agent spawn every 30min 24/7); one latent config gap (alert-commander `policy_id` has zero matching `cadence-policy.json` rows — masked today only because the fleet is in legacy-cron fallback); and one distinct operational finding kept separate from the design question per the brief's own instruction: fleet crons (cowork-team, dev-team, auditor Tier-1/2/3) have been unarmed ~3 days (`CronList` empty, `pressure-state.json` 72h stale, independently corroborated via a git-log gap since commit `02d9ac3c7`) — a re-arm gap, not a broken design. Verdict on whether this is the deferred Phase 3+ greenlight: NO — the ask is Phase-1's domain (already shipped for cowork); Phase 3/4/5 solve routing/DAG/backpressure, a different problem, and correctly stay deferred. Brief ends with a 7-item numbered candidate list for user confirmation — PLAN-ONLY, nothing implemented, no cron/flow/`.task_board` file touched.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only

---

## 2026-08-04T19:28:44Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (updated in place, no new file)

User follow-up (via coordinator): widen to ALL crons and make the confirmed-worth-fixing items implementation-ready, with the fleet re-arm explicitly sequenced LAST. Widened inventory 15→18 rows: added `cron-agent-father.md` (`23 14 * * *` daily, unconditional `keep.md` orphan+roster sweep, no diff-gate — naively fixed, lower severity), `cron-claude-manager-helper.md` (`30 19 * * 1,4`, ALREADY best-in-class adaptive — real `git diff --name-only HEAD~3..HEAD` mutation-delta routing + per-pass SKIP-IF stubs, no change needed), `cron-code-janitor.md` (`0 */6 * * *` 4x/day, mixed — 3 of 4 sweep legs self-gate via internal script thresholds but the core DRY-duplication grep scan has no diff-gate, 2nd clearest naive-fix gap found, with claude-manager-helper's own pattern as a ready precedent). Turned the 3 already-confirmed items into implementation-ready specs: literal 10-row JSON block for the alert-commander `cadence-policy.json` gap (`_cron_fallback:true` mirroring `bctc-offmarket`, preserves current behavior, no regression); full contract for a new `db-integrity-probe.sh` pre-gate script (COUNT(*)-diff v1 against a new dedicated snapshot file, not the unstable `db-integrity-history.json`; FAIL-OPEN SPAWN/SKIP-SPAWN shape mirroring Tier-2/3); exact `cron-detect-loop/SKILL.md` + `register.md` line-level changes to bring 4 unarmed crons under auto-re-arm coverage. Re-sequenced §8 so item 9 (fleet re-arm) runs explicitly last, after any greenlit corrections are implemented+verified.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` (updated, same file) → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only
