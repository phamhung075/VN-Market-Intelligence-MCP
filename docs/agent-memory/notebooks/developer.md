# Developer — Notebook

**Last updated:** 2026-07-24 | **Cycle:** FACTORY-NEWS-fix-source-logging (news-fetch ingestHeadlines log-tag bug, zone-routed generic developer)

## Session 2026-07-24 — FACTORY-NEWS-fix-source-logging — REVIEW

**Task:** `apps/news-fetch/src/module/news_ingest/index.ts` `ingestHeadlines(_source, ...)` ignored its `source` param and unconditionally emitted BOTH `[reuters/headlines]` and `[bloomberg/headlines]` `console.warn` in every RSS-fallback branch — a Bloomberg ingest printed spurious Reuters log lines and vice-versa. Zone-routed (no dev-news-fetch specialist).

**Actions taken:** RED test first (2 new tests in `index.test.ts` — capture `console.warn`, assert tag matches the actual source, confirmed failing pre-fix). Fix: renamed `_source`→`source` (now used), value-imported `NewsSource` (was type-only, needed at runtime for the enum compare), computed `tag` once (`source===NewsSource.REUTERS ? '[reuters/headlines]' : '[bloomberg/headlines]'` — confirmed exactly 2 enum members in `domain/models.ts`), collapsed 3 duplicated warn-pairs (6 calls total — task text said 4 pairs, actual grep count was 3) to 3 single `console.warn` calls. Control flow byte-diffed unchanged. Also updated 3 pre-existing source-text-scan assertions in `__tests__/fix-reuters-url-bloomberg-timeout.test.ts` that hardcoded the buggy reuters-prefixed literal — now check the source-agnostic message body (same text), since the hardcoded tag was literally the bug being fixed.

**Verification:** `bun test` 235 pass/0 fail/6 skip (was 233/0/6, +2 net new). `bun tsc --noEmit` 0 errors. `eslint lint:ci --max-warnings 0` clean. `bun run sandbox --tier=all --module=news-fetch` 16/16 PASS. Security clause: env grep for DB_/API_KEY/SECRET/TOKEN/PASSWORD/NEWS_API_KEY returned no credential matches.

**Board:** `task_board.in_progress[FACTORY-NEWS-fix-source-logging]` → `review`, `.head` synced to idle, via `orch-apply.sh` (dispatcher-owned commit, not committed by this cycle).

**Scope discipline:** Touched exactly the target file + its unit test + the one pre-existing regression test whose assertions encoded the bug's premise. Code-only landed per task constraint — `rebuild_required=true` but PENDING-USER-GATED, no docker rebuild performed.

Zone health: no drift detected

## Session 2026-07-23 — FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION — REVIEW

**Task:** `auditor-tier1-probe.sh`'s launchd check (fixed same day, FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN, to check exit-status not just presence) started returning `FAILURE` EVERY ~30min Tier-1 tick because 2 already-tracked dead backstops persist: `com.vn-market.docker-events` (exit-1, `FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP`) + `com.vn-market.fleet-push` (exit-78, `FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD`) — fail-opening the passive-health guard into spawning a full system-auditor subagent ~48x/day for zero new signal.

**Actions taken:** New ACK LEDGER `docs/data/auditor-launchd-ack.json` (`{acked:[{label,tracked_by,acked_at}]}`, live-seeded with both entries). `_check_launchd_agents` in `scripts/agents-flow/auditor-tier1-probe.sh` now label-exact-matches each unhealthy launchd label against the ledger — acked labels report "acknowledged" instead of "bad"; if EVERY unhealthy label this pass is acked, the check still PASSes (verdict stays `ALL_GREEN`, detail names the acked labels for transparency). A new/unacknowledged label always still fails, even mixed with acked ones. Chose the ALL_GREEN-remap (not a new verdict enum) — the live-registered Tier-1 cron prompt already treats `ALL_GREEN AND heartbeat<=60min` as skip-eligible, zero prompt/re-arm change needed. New `LAUNCHD_ACK_PATH` test seam mirrors the existing `LAUNCHD_DIR_PATH` pattern.

**Verification:** `auditor-tier1-probe.test.sh` extended with a default nonexistent-ledger seam (kept T1-T35 byte-identical — first confirmed 102/102 baseline green BEFORE adding new tests, since the real ack ledger would otherwise silently flip T33's fleet-push-exit-78 fixture to ALL_GREEN) + T36-T39 (acked-only→ALL_GREEN, mixed acked+new→FAILURE, ledger-present-but-uncovered→FAILURE, all-healthy+ledger-present→ALL_GREEN no false noise) — 120/120 total PASS. Live-verified against the real running system: `bash scripts/agents-flow/auditor-tier1-probe.sh` now returns `ALL_GREEN` with both acknowledged labels named in `detail` (previously `FAILURE` every tick).

**Board:** `task_board.in_progress[FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION]` → `review`, `next_agent=qa`, `.head` synced to idle, via `orch-apply.sh` (separate commit).

**Scope discipline:** Touched exactly the new ack ledger + probe script's Check-6 function + `run_probe`'s detail-line assembly + paired test + `WORK.md`/journal/notebook. Did NOT touch the heartbeat-write/freshness code paths (constraint #2) — verified T31/T32 (tier-2/3 stale-heartbeat dead-branch tests) still green, proving zero collateral change there. Did NOT touch `cron-detect-loop/register.md` (ALL_GREEN-remap choice makes that unnecessary).

Zone health: Tier-1 probe no longer churns a full system-auditor spawn on 2 known, already-owned launchd deaths; ack ledger is a live, hand-edited SSOT with an explicit staleness rule (remove entry at DONE_VERIFIED) so this can never become a permanent blind spot | HEALTHY

## Session 2026-07-23 — FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE — REVIEW

**Task:** `execute-tier.md` § MUST — Status-Flip = Lane-Move clause (b) told every flip-executing agent to "sync head to idle, or the next legitimate active_task_id/next_agent" — ambiguous enough that a `branch:null` REVIEW self-closeout could legally mirror the task's own new status onto `.head.status`. `"review"` IS a valid `.head.status` enum value (orch-state-access.md §5) but matches neither dev-team/main.md's `in_progress` branch nor its `idle/done` fall-through, so BOUNDED-1→SLS→RLC→QA-Drain never runs and the row strands. Confirmed live, not hypothetical: `review[]=47`/`qa[]=0` today, and commit `38f081ec1` shows the exact incident (`UC-GCP-P1`, `.head.status` left `"review"`, dispatcher hand-reset required) — this board row's own `origin_signal_id`.

**Actions taken:** Added explicit branch:null sub-rule to `execute-tier.md` § MUST (b): a `branch:null` REVIEW flip MUST set `head={status:idle, active_task_id:null, next_agent:router}`, never mirror the task's status; branch-carrying (worktree) tasks keep the prior latitude unchanged (scoped strictly, per task instruction — did not touch worktree-task semantics). No generic executable flip-helper exists to patch directly — grepped `scripts/`, confirmed 40+ one-off `*-review.jq` files and zero shared call site; every flip is hand-written jq per agent per tick, so the SSOT prose text itself (bound to pm/qa/developer/fixer via the existing "do NOT duplicate" pointer in `main.md`) is the only lever. Left `pm/flow/main.md`'s per-task "Task → Review" line untouched — architecture-brief audit already ruled duplicating this clause elsewhere violates the anti-copy-paste invariant.

**Verification:** New `scripts/audits/execute-tier-branchnull-review-headidle-verify.sh` — synthetic before/after fixture (no live-file writes) replaying the `UC-GCP-P1` incident shape: OLD ambiguous pattern reproduces `head.status="review"`; NEW documented pattern yields `head={status:idle, active_task_id:null, next_agent:router}` + lane-move (a) satisfied (`in_progress[]=0, review[]=1`). Ran live: PASS, exit 0. Honest limitation stated in script header: this proves the pattern is sound, not that every future hand-written flip complies (no code-enforced call site to test directly).

**Board:** `task_board.in_progress[FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE]` → `review`, `next_agent=qa`, `branch:null`, `.head` synced to idle, via `orch-apply.sh` (separate commit — this fix's own closeout exercises the very guarantee it ships).

**Scope discipline:** Touched exactly `execute-tier.md` § MUST (b) + the new regression-verifier script + journal/notebook. Did NOT touch `pm/flow/main.md`, `dev-team/main.md`'s Pipeline Resume gate, or any per-task one-off `*-review.jq` script (out of scope — SSOT text is the single lever, not each historical flip site).

Zone health: branch:null REVIEW→head-idle guarantee now explicit in the one SSOT text every flip-executing agent reads; 47-row review-lane stall's root cause is now documented+guarded (drain itself is QA-Drain's job, tracked separately) | HEALTHY
