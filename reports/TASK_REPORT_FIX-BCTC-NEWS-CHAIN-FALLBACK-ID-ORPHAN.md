# Task Report: FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN

date: 2026-07-13
dev commit: 727648e6a (dev-mcp-server)
outcome: APPROVED

## Scope verification

`git show 727648e6a --stat` = exactly 3 files, matches dispatch scope exactly:
- `apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts` (fix)
- `apps/mcp-server/src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` (new, RED→GREEN)
- `docs/architecture/microservice/mcp-server/usecases.md` (doc note)

No extra files, no `orch-state.json`/board touch in the dev commit.

## Diff inspection (read line-by-line, not trusted from stat/summary)

`git show 727648e6a -- .../newsChainFallback.ts` confirms:
1. A pre-check `SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?`
   supplies `reportId` (`existingReportRow?.id ?? randomUUID()`), used for the in-memory
   `fallbackReport.id` returned to the caller — mirrors `parseBctcReport()`'s own pre-check.
2. `INSERT OR REPLACE INTO financial_reports` was replaced with
   `INSERT INTO financial_reports (...) VALUES (...) ON CONFLICT(action_code, sort_key) DO UPDATE SET ...`.
3. Read the full current file (lines 373-474): the `SET` clause enumerates every one of the
   64 non-key columns from the `INSERT` column list — `id`, `action_code`, `sort_key` are
   correctly the ONLY three columns absent from `SET` (the first two because `id` must survive
   the conflict, the latter two because they are the `ON CONFLICT` target itself). Confirmed
   `INSERT OR REPLACE` is fully gone (`grep -c "INSERT OR REPLACE"` on the file = 0).

This is the exact same shape as the D1 fix in `parseBctcReport.ts::storeReport()` — no deviation.

## Test Results (all re-run myself, not trusted from dev report)

**1. Targeted new test + declared sibling id-stability suites:**
```
bun test src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts \
  src/__tests__/1294b-bctc-fallback.test.ts \
  src/__tests__/FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts
→ 13 pass / 0 fail / 62 expect() calls, 3 files [1.89s]
```

**2. Wider adjacent-suite sweep** (every suite that imports `newsChainFallback`/`fetchParseAndStoreBctc`
directly, discovered via `grep -rl "usecases/bctc/newsChainFallback\|fetchParseAndStoreBctc" src/__tests__`):
20 files (the 3 above + `1181-financial-reports-persist`, `048-ssc-pipeline`, `1112-bctc-vps-proxy`,
`293-ocr-fallback-pipeline`, `289-fetch-pdfurl-bypass`, `p2-f-rag-http-rewire`,
`1352a-async-extraction-race`, `1002-pdf-attribution`, `hotfix-bctc-integrity`, `085-tool-reports`,
`FIX-1267-ssc-circuit-breaker`, `1068-reparse-ocr-fallback`, `124-test-ssc-pipeline`,
`1945d-reparse-pipeline-gap`, `1352b-pdf-extractor-wiring`, `FIX-CTG-3-STEP-D`,
`290-check-ssc-quarter-derive`):
```
170 pass / 2 skip / 0 fail / 446 expect() calls, 20 files [11.83s]
```

**3. `bun tsc --noEmit`** (apps/mcp-server): exit 0, 0 errors.

**4. mock-guard** (`bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts apps/mcp-server/src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts"`):
`PASS — no fabricated-data patterns found in production source.` (exit 0)

**5. Full-suite disposition (partial capture, `RUST_LOG=off bun test`):**
Full run confirmed to be genuinely slow/long in this sandboxed environment (many
network-dependent suites hitting real 5s/30s timeouts — no outbound internet/VPS/chromium
available here) — consistent with the documented structurally-un-green disposition. Captured
21,461 lines / 234 of ~1169 files before intentionally terminating (bounded capture, per
gate instructions — "capture whatever partial full-suite output you can"):
- **31 `(fail)` lines**, ALL in named pre-existing/unrelated categories: `pollNews`
  newsapi-fallback (Task 1345a), `send_telegram` channel routing (235), News Polling Job
  (Task 102), push-news VPS wiring (9-source + AC-8 handler), `logVpsPush`/`vps_push_log`
  (FIX-2 block + Task 1858c — pre-existing DB-race class, matches prior QA precedent
  `TASK_REPORT_FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md`), `get_insider_transactions` (Task 1146),
  `get_company_profile` foreign_holding_ratio (TSU-DEV-U5), `record_signal_outcome` dispatch
  registry guard (1875c), `daily-foreign-flow` view integration (TASK_2005). None reference
  BCTC/PDF-extraction at all.
- `grep -aiE "newschainfallback|financial_reports" <log> | grep -aiE "fail|error"` → **0 hits**.
  (The one `(fail)` line containing the word "fallback" is `pollNews newsapi fallback`, an
  unrelated news-polling retry mechanism, not the BCTC news-chain fallback under review.)
- **Changed-domain regression = 0** across the sampled ~20% of the suite, on top of the 100%
  clean targeted (13/13) and adjacent (170/170) results above which directly exercise the
  changed write path end-to-end.

## DDD Compliance: PASS
`newsChainFallback.ts` lives in `application/usecases/bctc/` — correct layer for orchestration
(`docs/policies/dev-standards.md` DDD table). Diff touches only the pre-existing SQL statement
body and one pre-select — no new imports added (import block unchanged; pre-existing imports:
`node:crypto`, `infrastructure/logger.js`, `domain/services/signalToBctcMapper.js`,
`infrastructure/db/schema.js`). No domain-layer file touched by this commit at all.

## Security: PASS
- `grep -n "process\.env"` on the changed file → 0 hits (Bun.env-only codebase convention, N/A here — file has no env reads at all)
- `grep -in "password|secret|api[_-]key"` on the changed file → 0 hits
- SQL fully parameterized (`$id`, `$actionCode`, ... bound params via `stmt.run({...})`) — the
  new pre-select also uses bound params (`.get(actionCode, period.sortKey)`), no string
  interpolation into SQL anywhere in the diff.

## Behavioral correctness: PASS
- Pre-SELECT reuses existing id when present (`existingReportRow?.id ?? randomUUID()`) — confirmed by reading the code, and by test assertions in `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` (id stable across two fallback runs of the same `(action_code, sort_key)`; a differing `sort_key` still gets its own id).
- `ON CONFLICT(action_code, sort_key) DO UPDATE SET` — `id` is NOT in the SET list (verified column-by-column against the INSERT list, see Diff inspection above).
- `INSERT OR REPLACE` is fully removed from the file (0 occurrences).

## Verdict: APPROVED

All 6 gate checks pass on my own re-run (not the dev's reported numbers): targeted+adjacent
suites 183/183 pass on the changed write path, `tsc` clean, mock-guard PASS, DDD golden rule
holds, upsert semantics verified correct by direct code read, and the partial full-suite capture
shows zero new/changed-domain failures against a fail set matching documented pre-existing
categories exactly.

Board flip (review → done_verified) and `orch-state.json` `.task_board` update left to the
router per the dispatch boundary — QA did not touch `orch-state.json`, `docs/data/*`, notebooks,
session logs, or any peer-dirty file.
