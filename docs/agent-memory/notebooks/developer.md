# Developer — Notebook

**Last updated:** 2026-07-24 | **Cycle:** FACTORY-NEWS-dedup-handlers-maxitems (news-fetch handlers.ts dedup, zone-routed generic developer)

## Session 2026-07-24 — FACTORY-NEWS-dedup-handlers-maxitems — REVIEW

**Task:** `apps/news-fetch/src/interface/handlers.ts` had 4 near-identical POST/GET headline handlers (Reuters + Bloomberg) with the maxItems default hardcoded bare `15`/`10` inline in each. Board row was branch:null direct-execute (BOUNDED-1 auto-pickup), no TASK_NNN.md handoff. Zone-routed (no dev-news-fetch specialist).

**Actions taken:** RED test first (`domain-models.test.ts` — 6 new tests for `DEFAULT_MAX_ITEMS`/`resolveMaxItems`, confirmed failing pre-impl via a temporary `git checkout` revert of the not-yet-existing exports). GREEN: added `DEFAULT_MAX_ITEMS: Record<NewsSource, number>` (`{reuters:15, bloomberg:10}`, values unchanged) + `resolveMaxItems(raw: number|string|undefined, source)` to `domain/models.ts` — one function serves both channels: `number` (POST body) passes through with NO NaN guard (byte-matches legacy `typeof x==='number'` ternary), `string` (GET querystring) does `parseInt`+`isNaN` fallback (byte-matches legacy). Extracted `makeHeadlinesHandler(ingest, source)` in `handlers.ts` returning `{post, get}`; both routes now register the factory's output — grepped post-edit to confirm zero leftover inline handler bodies and exactly one `app.post`/`app.get` registration per route.

**Verification:** `bun test` 241 pass/6 skip/0 fail (baseline 235/6/0, +6 net new). `bun tsc --noEmit` 0 errors. `eslint lint:ci --max-warnings 0` clean. `bun run sandbox --tier=all --module=news-fetch` 16/16 PASS. Response-envelope + error-branch lines byte-diffed identical to all 4 originals via `git diff` (not asserted). `handlers.ts` 171L→118L (cap 120L). Security clause: grep for DB_/API_KEY/SECRET/TOKEN/PASSWORD/NEWS_API_KEY on both changed files → no matches.

**Board:** `task_board.in_progress[FACTORY-NEWS-dedup-handlers-maxitems]` → `review`, `.head` synced to idle (`next_agent:router`), via `orch-apply.sh` (dispatcher-owned commit, not committed by this cycle).

**Scope discipline:** Touched exactly the 2 FILES named in the task (`handlers.ts`, `domain/models.ts`) + the one paired unit test. Left the separately-duplicated 15/10 literals in `application/use-cases.ts` + the 4 scraper files (`reuters-rss.ts`, `bloomberg-rss.ts`, `reuters-stealth.ts`, `bloomberg-stealth.ts`) untouched — different call chain, not part of the 4-handler dedup, out of this task's explicit FILES scope. Code-only, `rebuild_required=true` but PENDING-USER-GATED, no docker rebuild performed.

Zone health: no drift detected

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
