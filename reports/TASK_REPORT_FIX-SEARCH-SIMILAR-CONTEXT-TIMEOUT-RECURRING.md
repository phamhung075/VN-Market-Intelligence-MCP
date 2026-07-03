# Task Report: FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING
date: 2026-07-03
outcome: APPROVED
commits: 31caeefcd, 1a9cda30b (already on main)

## Scope reviewed
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts:576-605` — `ragSearch()` call in `search_similar_context` wrapped in its own try/catch.
- `apps/mcp-server/src/__tests__/FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING.test.ts` — 7 tests / 16 expects.
- `docs/architecture/microservice/mcp-server/news-analysis.md` invariant #5.
- `docs/agent-memory/decisions/sprint-MERGE-MONEY-RADAR-INTO-MOMENTUM-dev-mcp-server.md` — DJ-GATE-1 entry present (`task-id:** FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING` at line 10).
- `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` confirmed untouched (git diff on the two commits touches only `analysis.ts` + test + arch doc; ragHttpClient.ts has zero diff hunks).

## 1. New test file
```
$ cd apps/mcp-server && bun test src/__tests__/FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING.test.ts
 7 pass
 0 fail
 16 expect() calls
Ran 7 tests across 1 file. [1.87s]
```
Warn-log tail confirms the degrade path fires (not the hard error): `"[search_similar_context] rag-service unreachable — returning empty result"` × 4 (timeout, ECONNREFUSED, non-200, bounded-fetch cases).

## 2. pnpm check (repo root)
```
$ pnpm check
> vn-market-intelligence@1.0.0 check
> pnpm --filter vn-market check
> vn-market@1.0.0 check
> bun tsc --noEmit
EXIT:0
```
0 tsc errors.

## 3. Graceful-degrade genuinely covers the ERROR path
Read `analysis.ts:576-605`:
- `ragSearch(...)` call is inside a nested `try { … } catch (ragError) { … }` (not the outer handler try/catch).
- Catch body: `logger.warn("[search_similar_context] rag-service unreachable — returning empty result", …)` then `rawResults = [];` — no re-throw, no `logger.error`.
- `rawResults.length === 0` (line 607) → returns `"No similar context found."` — same shape as a genuine zero-hit query, not a synthetic marker.
- The outer catch (line 646, `logger.error("[search_similar_context] Error", …)` → `"Error searching context: …"`) is now unreachable from a rag-service-down condition; it still exists to catch genuine post-search bugs (recency-weighting/formatting), per the decision-journal's explicit "only path" note — correctly scoped, not blanket-swallowed.
- Test suite exercises all 3 real failure modes via `global.fetch` mocking (`mockFetchTimeout` — DOMException TimeoutError via AbortSignal listener; `mockFetchConnectionRefused` — TypeError ECONNREFUSED; `mockFetchNon200` — HTTP 503) plus asserts `errorMessages` never contains `[search_similar_context]` (test file lines 169-199) and the happy path is unchanged (test file lines 215-251, asserts real VCB result still returned, not the degrade string). This is a genuine interception, not a re-labeled/masked assertion.

## 4. Bounded fetch < caller timeout
`ragHttpClient.ts:148` — `ragSearch()`'s `fetch()` call still carries `signal: AbortSignal.timeout(8_000)`, confirmed unchanged by this diff (zero hunks touch this file). 8s bound sits well under any realistic MCP tool-call budget (60s precedent cited in code comments from `fetch_and_analyze`). Test "resolves well within the caller's tool-call budget" (test file line 201) empirically confirms `elapsedMs < 2000ms` against the mock's 500ms fallback — degrade path never hangs the caller.

## 5. Full suite / known baseline (informational, non-blocking)
```
$ bun test   (apps/mcp-server, full suite)
 14208 pass
 42 skip
 71 fail
 5 errors
 44561 expect() calls
Ran 14321 tests across 1167 files. [634.00s]
```
71 fail well under the 348-failure baseline ceiling — no new regressions detected. Confirmed the 3 network-bound cases are exactly the ones flagged as expected in scope:
```
(fail) Task 083 — Analysis MCP Tools > search_similar_context > returns 'No similar context found.' when vector store is empty
(fail) Task 083 — Analysis MCP Tools > search_similar_context > returns error text (not a throw) when embedding fails
(fail) Task 083 — Analysis MCP Tools > search_similar_context > accepts optional level and actionCode filters
```
(these 083 tests require a live rag-service and time out at their own 5000ms budget — pre-existing, unrelated to this fix's client-side try/catch). Remaining 68 fail / 5 errors are unrelated pre-existing baseline noise (vps_push_log schema drift, DSI-S3, Task 1146/1518/1858c/262/125/251, etc. — none touch `analysis.ts` or `ragHttpClient.ts`). Bun 1.3.13 C++ teardown panic occurred after the summary line printed (`panic(main thread): A C++ exception occurred`) — known pre-existing Bun runtime issue, not a code defect.

## DDD / Security
- DDD: `analysis.ts` is `src/interface/mcp/tools/...` (interface layer) — pre-existing infra imports (fetchers, ragHttpClient, clients.ts) unchanged; diff adds zero new imports. No domain→infrastructure violation introduced.
- Security: no `process.env`, no hardcoded secrets in the diff. `grep -n "process\.env"` and `grep -n "password\|secret\|token"` on `analysis.ts` → no matches.
- `mock-guard.sh --files apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` → `PASS — no fabricated-data patterns found in production source.` (exit 0)

## Verdict
APPROVED — all in-scope checks green, no regressions beyond known baseline, scope boundary respected (rag-service itself, part (b), untouched).
