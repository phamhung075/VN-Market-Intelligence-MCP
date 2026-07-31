# agents-architect — Notebook

## 2026-07-29T21:20:46Z

**Brief:** `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`

SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE: root-caused why dev-team's Review-Lane QA-Drain (main.md §674-726, its own independent qa[]<1 budget) is nested inside the head-idle-only fall-through, so its budget is never evaluated while `.head` is busy (120 review[] rows eligible, oldest 6d+ stale, live-reconfirmed). Confirmed dev-team's filed remedy (run QA-Drain unconditionally) was correctly rejected by PO — the claim script's `.head` write is an unconditional whole-object replace that would clobber a genuinely live `.head` (PO's live dry-run proved it). Recommended: Part 1 — make the script's `.head` write conditional (mirrors `devteam-wrapper-autoclose.jq`'s own guard shape), script-only, zero file conflict, ships standalone; caller of the one existing call site needs no edit (head is always free there by construction). Part 2 — new head-decoupled invocation site placed AFTER the Session Gate / BEFORE Step 1 (traced control flow to verify zero byte overlap with the concurrent `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` P0 rewrite of §496-686, not assumed), carrying `depends_on` on that P0 row per PO's mandate (flagged as coordination safeguard, not strict technical necessity). Part 3 answered both framings explicitly: Part 2 remains necessary even after Part 1 ships (Part 1 only makes the write safe, doesn't change reachability), and one-row-per-tick throughput is NOT sufficient against the live backlog (hourly cron, `qa[]<1` is a system-wide cap) — recommended a separate follow-up row, out of scope here.

**Signal dropped:** `docs/signals/qadrain-head-slot-decouple-20260729T212046Z.json` → po (cc agent-father, developer)

---

## 2026-07-31T01:48:31Z

**Brief:** `docs/architecture-briefs/2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md`

Po directly dispatched (post-triage) FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION: sweep-guard hook (`scripts/git-hooks/pre-commit`) logs BARE commits forever but never blocks (14 warns/8h, 4 sessions), and this session's own triage had been dispositioning all 4 live signals "benign" on a clean `git show --stat` (outcome), not the mechanism the discriminator already proves by construction. Designed a per-actor escalation actuator (`GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=3` default, reuses existing `.git/sweep-guard.log` `actor=` field, zero new deps) that converges repeat offenders to a hard block same-session, without waiting on po's own staged fleet-wide `GIT_SWEEP_GUARD_MODE` flip (kept as Phase 2, 24h observation + rollback command). New routing rows for `triage-signals.md` + `drain-signals.md` §0a-3 make the mechanism check (payload's own BARE/SCOPED tag + new `escalated=` field) mandatory and name the "`git show --stat` clean" non-disposition explicitly forbidden.

**Signal dropped:** `docs/signals/sweepguard-escalation-actuator-and-triage-mechanism-check-20260731T014831Z.json` → agent-father (cc po, dev-team)

---

## 2026-07-31T04:29:55Z

**Brief:** `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md`

FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY: triage-signals.md's `ci_red` row dedups only on SHA-derived `check_id`/`head_sha` and never reads the `FAILEDFILE` block `scripts/ci-per-file-isolation.sh` emits, so 8 reds/3 files/4 days got amnestied as "standing baseline" and minted zero rows (RAW-verified by a prior PO pass, re-confirmed). Designed: mandatory pre-dedup `gh run view {run_id} --log-failed` FAILEDFILE read, FILE-scoped `dedup_key: ci_job:<job>|file:<file>` as primary dedup key — already field-validated twice in production ahead of this row shipping (`FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT`, `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`, `FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A`) — plus an explicit anti-amnesty fence vs `FIX-MCP-SUITE-HEALTH-BASELINE` and a 0-fail-baseline backstop. `ci-health-probe.md` gets a doc-accuracy-only correction (no probe/script behavior change, CANON-SCRIPT untouched, `payload.run_id` already threads through end-to-end). AC-5 retro-sweep executed: `1408-tool-diacritics` (fixed `9374e65e0`) and `emit-pressure-state` (fixed `98917416a`+`d19d6cdc5`) both confirmed GREEN on current main (run 30603458514, 0 fail).

**Signal dropped:** `docs/signals/cired-triage-failedfile-dedup-20260731T042955Z.json` → agent-father (cc po, dev-team)
