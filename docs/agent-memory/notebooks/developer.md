# Developer — Notebook

**Last updated:** 2026-07-25 | **Cycle:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON (fb-gate Check-C "chưa" negation-lexicon gap + \d→[0-9] BSD-grep portability, zone-routed generic developer)

## Session 2026-07-25 — FIX-DOWJONES-STALE-WRONG-VALUE — REVIEW

**Task:** Backlog's `zone: apps/macro-indicators/` tag was stale — verified the Go macro-indicators service has zero dow_jones references; real code is `apps/mcp-server/`. Live-verified root cause via `docker exec` into the named-volume DB: `tracked_indicators` dow_jones rows are news-mined garbage (10604/23750/23807/48221/76848, no ceiling gate) AND `get_system_status`'s "Auto-tracked Indicators" ran its own unguarded latest-row query serving 23750 as current (report 3237) — a separate bug from the already-shipped DSI-MACRO-PHANTOM-STALE-GUARD (only covers `buildMacroSection`).

**Actions taken:** New `infrastructure/db/indicatorPlausibility.ts` — shared, generic `isPlausibleIndicatorValue()` band gate (dow_jones 25000–60000) used by every `tracked_indicators` writer; `commodityTracker.ts` delegates to it (other indicators' bounds preserved byte-identical). Retired the dow_jones news-mining regex (precedent: brent's backlog-921 removal); `yahooFinance.ts` gained `fetchDowJonesIndex()`(live `^DJI`)+`storeDowJonesIndex()` (fail-closed, dedup-before-insert), wired into `commodityTrackerRefreshJob.ts` Block 3 (own try/catch, zero-arg production call site already picks it up — no scheduler change). `systemTools.ts` switched to the proven `listTrackedIndicatorsFromDb()` — stale rows now tagged `[STALE]`, generic across all indicators. Added dow_jones to audit-layer `INDICATOR_RANGES` (defense-in-depth).

**Verification:** New `FIX-DOWJONES-STALE-WRONG-VALUE.test.ts` 15/15 pass (band accept/reject on the literal phantom values, news-mining retirement, live fetch parse, fail-closed store + dedup, `[STALE]` tag). Extended `1920c-commodity-tracker-refresh-job.test.ts` +3. Full targeted+adjacent suite (7 files touching every changed module) 68/68 pass. `bun tsc --noEmit` clean. Simplicity-gate self-caught scope creep — trimmed 3 speculative ceiling additions (sp500/nasdaq/vnindex) not required by this AC. Full monorepo `bun test` kicked off as an extra background check but stalled/did not complete in-session (unrelated pre-existing suite characteristic, not this diff — every directly-dependent file already green); noted transparently, not claimed.

**Board:** `task_board.in_progress[FIX-DOWJONES-STALE-WRONG-VALUE]` → `review` (`next_agent:qa`), `.head` synced to idle, via `orch-apply.sh`. `REBUILD_REQUIRED: true` — live container swap + 2 elapsed daily-cron cycles needed for the LIVE-across-2-cycles portion of the verification_gate; ops-gated, flagged not fabricated.

Zone health: no drift detected

## Session 2026-07-25 — FIX-FB-GATE-POINT-PCT-MATH — REVIEW

**Task:** `scripts/fb-data-integrity-gate.sh` had no check for a post stating both a point delta ("giảm X điểm") and a % delta ("(±Y%)") for the same VN index that were internally inconsistent — lesson L2 (06-19): post said "giảm 0,32 điểm (−0,32%)" when −0,32% at that day's level is actually ≈ −5,9 điểm. Zone `cross-service/` — outside every dev-* zone, handled directly. Ticket minted "Check-F" (06-20), before letters F (currency-unit guard) and G (structural validator) shipped and claimed those letters.

**Actions taken:** New Check-H — BLOCKs when |stated point delta − pct×prev_close| > `POINT_PCT_MATH_TOLERANCE` (new header const, 1.0 index points). prev_close derived from the live snapshot only (`close/(1+changePct/100)`), never hardcoded. Generic `INDEX_ALIASES` mapping (VN-Index/VN30/HNX-Index/UPCOM) — new indices participate by adding one alias entry, check logic never names a ticker. `FETCH_TICKERS` widened to always include the 4 standard index codes.

**Verification:** RAW fence (both injected fixtures, pre-fetched snapshot file, no network dependency) — prev_close=1800: `'giảm 0,32 điểm (−0,32%)'` → `[BLOCK] Check-H point-pct-math: ... delta=5.44 > 1.0pt tolerance`, exit 1; `'giảm 5,90 điểm (−0,32%)'` → `[PASS] fb-data-integrity-gate: 0 violations`, exit 0. RED confirmed via `git stash`: pre-fix script falsely PASSed the inconsistent fixture. Regression: real `docs/social/fb-post-2026-07-24.md` (VN-Index −13 điểm/−0,78%) + matching live snapshot → 0 violations; same file with live API unreachable → graceful skip. `bash -n` + `shellcheck` clean.

**Board:** `task_board.in_progress[FIX-FB-GATE-POINT-PCT-MATH]` → `review` (`next_agent:qa`), `.head` synced to idle (`next_agent:router`), via `orch-apply.sh`.

**Scope discipline:** Touched exactly `scripts/fb-data-integrity-gate.sh` (single file per task). `rebuild_required=false` — shell script, no container rebuild gate.

Zone health: no drift detected

## Session 2026-07-25 — FIX-FB-GATE-CHECKC-NEGATION-LEXICON — REVIEW

**Task:** BOUNDED-1 auto-pickup, dispatcher-confirmed root cause at source. Check-C's `SELLOFF_AFFIRM_LINES` negation-strip set (line 617) was missing Vietnamese "chưa" (not yet/not) — an explicitly-negated panic statement ("lực bán chưa hoảng loạn", "chưa phải bán tháo") survived the strip, was miscounted AFFIRMATIVE, and FALSE-BLOCKED a correct orderly-pullback post on a mild day (lesson L4, 2026-06-25, happened twice). Separately, line 636's floor-stock regex used `chỉ \d mã sàn` inside a real bash `grep -ciE` — non-portable on grep builds where `\d` is literal.

**Actions taken:** FIX(1) — added `chưa( phải| từng)?` alternation to the negation-strip set (generic, not a 2-phrase literal). FIX(2) — `chỉ \d mã sàn` → `chỉ [0-9] mã sàn`. Audited all 25 `\d` occurrences in the 1751L script: 1 real bash-grep context (line 636, fixed), 24 confirmed inside `python3 <<'PYEOF'` heredocs (Python `re` raw strings) — skipped, untouched (correct as-is). New persistent regression harness `scripts/test-fb-gate-checkc-negation.sh` (3 assertions, no network dependency).

**Verification:** RED→GREEN A/B via pathspec-limited `git stash push/pop -- scripts/fb-data-integrity-gate.sh` (not whole-tree — 200+ pre-existing peer stash entries from concurrent agent sessions in this repo). GREEN (fixed): 6/6 pass. RED (stashed pre-fix): 4/6 pass — assertion (1) fails, reproducing the exact false-BLOCK message. GREEN (popped): 6/6 pass again. Caught + fixed an own fixture-design confound (first draft accidentally put the negated clause on the same line as a pre-existing "không có" marker, masking the true RED). FIX(2)'s BSD-`\d`-literal bug does not reproduce on this sandbox's `/usr/bin/grep` (BSD grep 2.6.0-FreeBSD build accepts `\d` as an extension) — documented transparently as informational, not fabricated; `[0-9]` applied regardless since it is the only universally-portable form. `bash -n` clean both files; `shellcheck -S style` before/after diff on the gate script = empty (0 new warnings). Live sanity: gate run against real `docs/social/fb-post-2026-07-24.md` with the live MCP server → 0 violations, no crash.

**Board:** `task_board.in_progress[FIX-FB-GATE-CHECKC-NEGATION-LEXICON]` → `review` (`next_agent:qa`), `.head` synced to idle (`next_agent:router`), via `orch-apply.sh`.

**Scope discipline:** Touched `scripts/fb-data-integrity-gate.sh` (2-line fix) + new `scripts/test-fb-gate-checkc-negation.sh`. `rebuild_required=false` — host shell script, no container rebuild gate.

Zone health: no drift detected
