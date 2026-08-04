# agents-architect — Notebook

## 2026-08-04T18:16:13Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md`

Ad-hoc user request ("right moment, not all the time") across cowork-team/dev-team/system-auditor: 15-cron inventory found cowork's DWF-Phase1 `cadence-policy.json` engine and dev-team/system-auditor's independently-reinvented bespoke idle/health gates (dev-team RUN-IDLE; `auditor-tier1-probe.sh` ALL_GREEN+fresh-heartbeat) already adaptive; one naively-fixed cron found (`cron-db-data-integrity.md` — zero conditioning, full agent spawn every 30min 24/7); one latent config gap (alert-commander `policy_id` has zero matching `cadence-policy.json` rows — masked today only because the fleet is in legacy-cron fallback); and one distinct operational finding kept separate from the design question per the brief's own instruction: fleet crons (cowork-team, dev-team, auditor Tier-1/2/3) have been unarmed ~3 days (`CronList` empty, `pressure-state.json` 72h stale, independently corroborated via a git-log gap since commit `02d9ac3c7`) — a re-arm gap, not a broken design. Verdict on whether this is the deferred Phase 3+ greenlight: NO — the ask is Phase-1's domain (already shipped for cowork); Phase 3/4/5 solve routing/DAG/backpressure, a different problem, and correctly stay deferred. Brief ends with a 7-item numbered candidate list for user confirmation — PLAN-ONLY, nothing implemented, no cron/flow/`.task_board` file touched.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only

---

## 2026-08-04T19:28:44Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (updated in place, no new file)

User follow-up (via coordinator): widen to ALL crons and make the confirmed-worth-fixing items implementation-ready, with the fleet re-arm explicitly sequenced LAST. Widened inventory 15→18 rows: added `cron-agent-father.md` (`23 14 * * *` daily, unconditional `keep.md` orphan+roster sweep, no diff-gate — naively fixed, lower severity), `cron-claude-manager-helper.md` (`30 19 * * 1,4`, ALREADY best-in-class adaptive — real `git diff --name-only HEAD~3..HEAD` mutation-delta routing + per-pass SKIP-IF stubs, no change needed), `cron-code-janitor.md` (`0 */6 * * *` 4x/day, mixed — 3 of 4 sweep legs self-gate via internal script thresholds but the core DRY-duplication grep scan has no diff-gate, 2nd clearest naive-fix gap found, with claude-manager-helper's own pattern as a ready precedent). Turned the 3 already-confirmed items into implementation-ready specs: literal 10-row JSON block for the alert-commander `cadence-policy.json` gap (`_cron_fallback:true` mirroring `bctc-offmarket`, preserves current behavior, no regression); full contract for a new `db-integrity-probe.sh` pre-gate script (COUNT(*)-diff v1 against a new dedicated snapshot file, not the unstable `db-integrity-history.json`; FAIL-OPEN SPAWN/SKIP-SPAWN shape mirroring Tier-2/3); exact `cron-detect-loop/SKILL.md` + `register.md` line-level changes to bring 4 unarmed crons under auto-re-arm coverage. Re-sequenced §8 so item 9 (fleet re-arm) runs explicitly last, after any greenlit corrections are implemented+verified.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` (updated, same file) → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only

---

## 2026-08-04T19:41:52Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (updated in place, no new file)

User re-scoped again (via coordinator): raw cron SCHEDULES themselves, not just runtime pre-gates — "cron run all time on all day, is not need for do like this... replan correct time for cron run." Added §9 (Schedule Re-Timing): for all 18 inventoried crons (38 individual cron-expressions once multi-slot rows are expanded), computed exact fires/24h + fires/7d arithmetic, converted UTC→ICT against real VN market hours (09:00–11:30/13:00–15:00 ICT Mon-Fri), and assessed market-hours-awareness at the cron-expression level (not runtime gate). Found current total ≈2,187 fires/wk vs proposed ≈1,938 fires/wk (−249/wk, ≈−11.4%) — nearly the entire delta from ONE concrete fix: `cron-db-data-integrity.md` (336→87/wk, proposed `15,45 2-9 * * 1-5` weekday session+settlement window + `15 22 * * *` daily off-hours backstop — watched tables provably can't change outside trading hours). Also found `news-scout-sentiment` mislabeled ("pre-market batch" but fires 05:00 UTC=12:00 ICT, 3h after open, during lunch closure — proposed shift to 01:30 UTC=08:30 ICT, frequency unchanged). Flagged (not fixed, insufficient evidence) `chef-evening` (2/7 weekly fires preview non-trading Sat/Sun mornings) and `market-watcher-eod` (fires 8h after close, purpose unverified). Explicitly held the line on NOT changing cowork heartbeat/dev-team/auditor Tier-1-2-3/alert-commander — all individually justified as "fires often because it needs to" (off-hours guaranteed-slot wakeup, infra can crash any hour per existing memory lesson, live position monitoring, 24/7 legal/crisis coverage) — reconciled explicitly that §8's pre-gates and §9's re-timing are additive not substitutable for db-data-integrity (pre-gate cuts spawn-per-fire; re-timing cuts fire-count itself; compounds). §8's ordering constraint (corrections before re-arm) left unchanged, still governs §9's findings too.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` (updated, same file) → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only
