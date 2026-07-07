# Task Report: KD-OBS-01-FIX

Kinh-dich MCP tools + HTTP routes caught genuine DB/data errors and only sent them to the
structured logger — never surfaced to a human (WORK/BUG). Silent-drop bug.

Commits: `6c1cd6aa9` (impl, 8 files), `a66880029` (notebook + journal), `cbc1c2751`
(orch-state task_board IN_PROGRESS→REVIEW). Already on `main` (no branch — direct-to-main
sprint-task pattern).

## 1. Diff review (git show 6c1cd6aa9, all 8 files read in full)

- New `kinhDichErrorNotify.ts` (`notifyKinhDichError`): wraps `sendTelegramBug` (dynamic
  import) in a try/catch that swallows ALL errors — never rejects, even if `sendBugFn` itself
  throws. Confirmed by code read, not just docstring claim.
- All 5 `kinhDichTools.ts` catch blocks (`get_kinhdich_reading`, `get_market_hexagram`,
  `get_hexagram_history`, `get_transition_probabilities`, `run_hexagram_backtest`) call
  `void notifyError(...)` (fire-and-forget, never awaited) immediately after the existing
  `logger.error(...)`, before constructing the SAME graceful text response that existed
  pre-diff — confirmed byte-identical response construction in all 5 hunks (only the
  `message` variable was factored out, value unchanged).
- All 3 HTTP route handlers (`kinhDichReadingHandler.ts`, `kinhDichSignalsHandler.ts`,
  `kinhDichMarketHandler.ts`) call `void notifyError(...)` before the SAME `500 db_error` JSON
  body that existed pre-diff — confirmed `detail: message` is value-identical to the prior
  inline `err instanceof Error ? err.message : String(err)` expression.
- `registerKinhDichTools(server, notifyError?)` and each of the 3 handlers take the notifier
  as a trailing OPTIONAL param (default = real notifier) — grepped every non-test call site:
  `registry.ts:195` (`registerKinhDichTools` passed by reference, single-arg convention) and
  `server.ts:1019/1024/1029/1034/1225` (3-or-4-arg calls, no notifyError passed) — all use the
  default, zero call-site breakage.
- Non-fatal contract confirmed structurally: `notifyKinhDichError`'s only `await` is inside its
  own try, wrapped by a catch-all that returns `undefined` — cannot propagate to the caller's
  `catch` block, cannot change the caller's returned/written response.

**Verdict: claim holds exactly as described. No response-body or return-value behavior change
beyond the added notification side-effect.**

## 2. appendMarketHexagram/appendStockHexagram exclusion (marketTools.ts)

Read both functions in full. Their catch blocks wrap `getMarketHexagram()`/
`getKinhDichReading()` — HTTP calls to a separate kinh-dich microservice — and only fire on
`ECONNREFUSED`/timeout/non-200 (ie. the service is unreachable), at which point the block is
silently omitted from the composed output (`logger.warn` only, by comment and design). This is
a structurally different failure class from the DB-error catches in scope (direct
`bun:sqlite` queries inside the tool/route implementations themselves) — confirmed genuinely
benign degrade-gracefully behavior, not the silent-drop bug in scope. Exclusion correctly
scoped — not a gap.

## 3. New test file — re-run myself (not trusted from report)

```
bun test src/__tests__/KD-OBS-01-FIX-kinhdich-bug-notify.test.ts
11 pass / 0 fail / 43 expect() calls
```
Matches claim exactly. Read all 11 tests: AC-1..3 unit-test the notifier contract (marker
format, non-fatal even when `sendBugFn` rejects, safe default-path no-op with no
`TELEGRAM_BOT_TOKEN`); AC-4..8 force each of the 5 MCP tool catches via a deterministic
`DB_PATH`-pointed-at-a-directory trigger + injected spy, asserting `source`/`category`/`detail`
AND that the tool still returns its normal graceful text (no throw to MCP caller); AC-9..11
force each of the 3 HTTP handlers via the pre-existing stale-closed-db-handle trick, asserting
the notifier fired AND the handler still returns its normal `500 db_error` JSON. Meaningful
assertions, not trivial passes.

## 4. `bun tsc --noEmit`

Exit 0, 0 errors.

## 5. Targeted suite

```
bun test <12 kinhdich/hexagram-named files>   → 261 pass / 0 fail / 6489 expect
bun test 308-tool-registry + layerBCronRegistry + tool-registry-parity → 40 pass / 0 fail
```

## 6. Full suite — 3 independent runs (per-file isolation, matches CI harness)

Ran `scripts/ci-per-file-isolation.sh` myself 3x (2 accidentally overlapped/contended each
other from a background-job cleanup mistake on my end; 1 clean uncontended run):

| run | pass | skip | fail | failed files |
|---|---|---|---|---|
| contended #1 | 14100 | 40 | 71 | 19 |
| contended #2 | 14109 | 40 | 69 | 18 |
| **clean** | **14148** | **40** | **38** | **11** |

Dev's own self-reported number (14290/63, via bare `bun test`, a different methodology than
the per-file isolation harness this repo's own CI and prior QA precedent use) does not match
any of my 3 numbers exactly — expected, since bare `bun test` and per-file-isolated `bun test`
are known (documented in this repo's own prior incidents) to diverge due to shared-state/
mock-leak/resource-contention effects. What matters for the regression question:

- **Zero kinh-dich-related failures in any of the 3 runs.**
- The clean run's 11 failed files are a strict subset of the contended runs' failures, and ALL
  11 (`083-tool-analysis`, `102-job-news-poll`, `1227-source-health-empty-result`,
  `125-test-e2e-briefing`, `1288-poll-news-shape`, `1324-push-news-all-sources`,
  `1332-pollnews-source-display-name`, `1345a-reuters-fallback`,
  `1793-pollnews-cooldown-persist`, `1821a-pollnews-cold-start-retry`,
  `1898b-rss-degradation-regression`) are RSS/pollNews/news-source network-dependent tests.
  8 of these 11 (083/102/1227/1288/1324/1793/1821a/1898b) are the EXACT same file-name cluster
  independently confirmed as pre-existing baseline flake in `docs/agent-memory/notebooks/qa.md`
  cycle-379 (same day, 2026-07-07, a completely unrelated task) via real GitHub Actions log
  inspection.
- The extra failures seen only under contention (`030-pdf-extractor`,
  `1019-ssc-pdf-breaker-bypass`, `1294b-bctc-fallback`, `1347a-test-db-isolation`,
  `251-mcp-tools`, `293-ocr-fallback-pipeline`, `FIX-1267-ssc-circuit-breaker`,
  `bctc-eval-integration`, some via Bun-runtime "Illegal instruction" crashes) shrink to zero
  extra once contention is removed — consistent with local host-resource-contention flakiness,
  not a deterministic regression (a real regression from an 8-catch-block kinh-dich change
  would show up as a *kinh-dich* test failure, in every run, which never happened).

**Verdict: no regression. Failures are pre-existing baseline flakiness, cross-checked against
an independent same-day documented baseline, not caused by this change.**

## 7. DDD / security / mock-guard

- `grep "from.*infrastructure\|from.*application"` on the 6 touched/new production files:
  hits only in `interface/mcp/tools/kinhdich/kinhDichTools.ts` and the 3 route handlers — all
  are `interface/` layer files (not `domain/`), which is an allowed direction; matches the
  existing repo convention documented inline
  (`kinhDichErrorNotify.ts`: "interface → infrastructure, same as ohlcvBackfillHandler.ts").
  DDD PASS.
- `grep "process\.env"`: 0 hits. `grep "password\|secret\|token"`: 1 hit, a doc-comment word
  ("token(s)") in `kinhDichSignalsHandler.ts`, not a real secret. Security PASS.
- `bash scripts/audits/mock-guard.sh --files "<6 files>"`: `PASS — no fabricated-data patterns
  found in production source.` (exit 0).

## 8. DJ-GATE-1

`docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md` STEP
`dev-mcp-server-S4` contains `task-id:** KD-OBS-01-FIX` with substantive
what-done/what-considered (3 real alternatives with rejection reasons)/why-decision/why-change
— not a stub. Gate satisfied.

## 9. Commit hygiene

- `6c1cd6aa9`: 8 files, all in kinh-dich scope (impl + new notifier + new test + arch doc).
- `a66880029`: 2 files (dev-mcp-server journal + notebook).
- `cbc1c2751`: 1 file (`orch-state.json`).
No evidence of `git add -A` — every commit's file set matches its stated scope exactly.
`orch-state.json` diff (`cbc1c2751`) is a clean `task_board.in_progress`→`task_board.review`
array move (entry removed from one array, added to the other, `status`/`reviewed_*` fields
added) — surrounding document untouched, valid JSON, no duplicate keys (verified via
`python3 json.loads(..., object_pairs_hook=dup-check)`), consistent with an `orch-apply.sh`
jq-transform write, not a raw full-doc overwrite.

## Verdict: APPROVED

All 8 catch blocks genuinely wired, non-fatal, zero response-body change beyond the
notification side-effect. Exclusion of the 2 benign degrade paths correctly scoped. New tests
independently re-run and pass. tsc clean. No regression in the full suite across 3 independent
runs (0 kinh-dich failures in any). DJ-GATE-1 satisfied. Commit hygiene clean.

`docs/data/orch/orch-state.json` `task_board` flipped `KD-OBS-01-FIX` REVIEW → DONE_VERIFIED
via `scripts/orch-apply.sh` (direct-to-main sprint-task pattern — no branch to merge).
