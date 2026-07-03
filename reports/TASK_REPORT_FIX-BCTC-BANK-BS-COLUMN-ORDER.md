## Task Report FIX-BCTC-BANK-BS-COLUMN-ORDER

**QA deep-verify** (post router RAW-verify) — commits `d69b13f41` (code) + `e73a53688` (docs), already on `main` HEAD.

changed:
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` (+189) — `resolveColumnLayout()` for label-first bank Mẫu B02a/TCTDHN forms + label-only tables; `parseVnNumber` bold-strip + comma/dot auto-detect
- `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts` (+18) — `isBankFormFromRows` strips bold `*`/`_` before Roman-numeral test
- `apps/mcp-server/src/application/utils/bctcRowRepair.ts` (+22, doc-only header comment correction)
- `apps/mcp-server/src/__tests__/FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts` (new, +406, 16 tests / 54 expect, real CTG markdown byte-identical to live `get_bctc_refined(96e36139-5dac-414d-8e4d-20a4725890d1)`)
- `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-BS-COLUMN-ORDER-dev-mcp-server.md`, `docs/agent-memory/notebooks/dev-mcp-server.md`, `docs/handoffs/FIX-BCTC-BANK-BS-COLUMN-ORDER.md`

Commit scope re-check: `git diff --name-only d69b13f41~1 e73a53688` returns exactly these 7 files — matches router RAW-verify (no push/deploy/dirty-add).

### 1. tsc
`bun tsc --noEmit` (apps/mcp-server) — **0 errors**, clean exit.

### 2. Targeted BCTC suite (independent re-run, 23-file superset of dev's 22)
Built file set via `grep -rl` on all changed symbols (`refinedMarkdownParser|bctcFormType|bctcRowRepair|isBankFormFromRows|parseVnNumber|resolveColumnLayout|detectSection|SECTION_HEADERS|FOLDED_SECTION_KEYWORDS|TCTDHN|B02a|bank-form|bankForm`) across `src/__tests__/`:
```
389 pass / 0 fail / 1172 expect() calls
Ran 389 tests across 23 files. [1.76s]
```
`FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts` run standalone:
```
16 pass / 0 fail / 54 expect() calls
Ran 16 tests across 1 file. [101.00ms]
```
report_id `ctg-96e36139-real-e2e`, `total_assets`/`total_liabilities`/`equity_total` scalar-backfill columns updated in `finalize_bctc_refine` log — matches router's independent re-run (16/0/54) exactly.

### 3. FULL suite
```
14230 pass / 42 skip / 65 fail / 6 errors / 44638 expect() calls
Ran 14337 tests across 1168 files. [620.76s]
```
Followed immediately by the known Bun-1.3.13 `panic(main thread): A C++ exception occurred` teardown crash (post-summary, matches dev's reported signature both runs).

**Ceiling check:** `testBaselineFail = 348` (docs/data/project-stats.json) — 65 << 348. Router's cited historical `baseline_pass=9408` correctly discarded as stale (actual suite ~14171-14337 tests / 1164-1168 files, growing).

**Changed-domain regression check (mandatory):**
- Extracted all 65 `(fail)` lines to a file, grepped for `bctc|bank|refinedmarkdown|parsevnnumber|resolvecolumnlayout|column.?order|balance.?sheet|detectsection|bctcformtype|bctcrowrepair` → **0 hits**.
- Independently mapped every fail line to its nearest preceding test-file header (awk nearest-match) → all 65 land in: `1146-get-insider-transactions.test.ts` (9), `1324-push-news-all-sources.test.ts` (8), `1113-vps-proxy-health.test.ts` (6), `1518-get-foreign-flow-ohlcv-source.test.ts` (4), `1858c-logvpspush-fix.test.ts` (4), `262-mcp-tools-042.test.ts` (3), `RAPID-B2-get-market-cap-tool.test.ts` (3), `1405b-bctc-vps-fixes.test.ts` (3), `102-job-news-poll.test.ts` (3), plus 10 more single/double-fail files (`1332-pollnews-source-display-name`, `1302-technical-indicators` [_deprecated], `251-mcp-tools`, `083-tool-analysis`, `1892a-pushNewsHandler`, `TSU-DEV-U5-foreign-flow-null-holding-ratio`, `1345a-reuters-fallback`, `1288-poll-news-shape`, `VPT-1-vps-proxy-health-endpoint`, `125-test-e2e-briefing`, `1193-push-prices-persist`, `1410-tool-diacritics-sweep`, `1875c-record-signal-outcome-routing`, `DSI-S3-sector-fin`, `235-telegram-send-merge`).
- One filename false-positive check: `1405b-bctc-vps-fixes.test.ts` has "bctc" in its name — inspected directly (`describe("FIX 2 — logVpsPush writes news push events to vps_push_log")`, imports `vpsPushLogStore.js`/`vpsHealthPoller.js` only, no import of `refinedMarkdownParser`/`bctcFormType`/`bctcRowRepair`/`parseVnNumber`). Failures are `vps_push_log` DB-row-not-found races, unrelated to the bank-form parser change.
- All failure text confirms network/timing flake class dev claimed: `[pollNews] ragInsert failed ... "error":"The operation timed out."`, `error: Telegram down`, `error: Network error`, `error: simulated INSERT failure`, 5000ms per-test timeouts on news/VPS/insider/foreign-flow/climate tools.
- Sample verified inline (Task 1332 TC-3): assertion fails because the mocked network op timed out mid-test, not because of any BCTC-domain code path.
- **Conclusion: zero fails/errors touch the changed domain (refinedMarkdownParser.ts, bctcFormType.ts, bctcRowRepair.ts, parseVnNumber).**

### 4. DDD / security / mock-guard
```
grep -n "from.*infrastructure\|from.*application" <3 changed src files>   → 0 hits
grep -n "process\.env" <3 changed src files>                              → 0 hits
grep -n "password\|secret\|token" <3 changed src files> | grep -v "//"    → 1 false-positive ("numeric tokens" in a doc comment, bctcRowRepair.ts:19/73/80/83 — not a credential)
bash scripts/audits/mock-guard.sh --files "<3 changed src files>"         → PASS (exit 0), no fabricated-data patterns
```

### 5. DJ-GATE-1
`docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-BS-COLUMN-ORDER-dev-mcp-server.md` present, contains `task-id:** FIX-BCTC-BANK-BS-COLUMN-ORDER` — gate satisfied.

### Deploy-gated follow-up (out of scope, noted per dispatcher instruction)
A post-deploy `finalize_bctc_refine` re-run against the live CTG report (`96e36139-5dac-414d-8e4d-20a4725890d1`) in the named-volume `market.db` is required before the live report's `total_assets` actually unfreezes. NOT run — ops/deploy-gated, tracked by the task's `unblocks` list (`TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST`, `W5-FU-CTG-REFINE-96e36139`).

### Verdict
**PASS**

tests: 389 pass / 0 fail (targeted, 23-file superset) + 14230 pass / 42 skip / 65 fail / 6 errors (full, all 65 confirmed pre-existing network/timing flake, unrelated domain) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS (exit 0)

Board boundary observed: did not touch `docs/data/orch/orch-state.json` `.task_board`/`.head` — router owns `review` → `done_verified` promotion on this PASS.
