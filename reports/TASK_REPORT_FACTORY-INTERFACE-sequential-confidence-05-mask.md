# Task Report: FACTORY-INTERFACE-sequential-confidence-05-mask — stop fabricating 0.5 confidence

date: 2026-07-08
outcome: APPROVED (code+tests) — held REVIEW (ops-gated mcp-server image swap pending; no live HTTP surface for this field, so post-swap gate is a lighter sanity check, not a RAW HTTP probe)

## Summary

`sequential_market_analysis`'s `handle()` used `result.confidence = input.confidence ?? 0.5`,
fabricating a mid-point confidence whenever a hypothesis was stated without one. Fix (commit
`1b1397025`): only assigns `result.confidence` when `input.confidence !== undefined`; init
default changed `confidence: 0` → `undefined` (type `number` → `number | undefined`);
`generateRecommendations` now emits `"No confidence stated: ... — requires an explicit
confidence assessment"` instead of mislabeling the unstated case as `"Low confidence"`.
Added test-only `_analysisState` (the internal `Map<string, AnalysisResult>`) on the returned
tool object purely so this internal state is unit-testable.

## Independent re-verification (not trusting the self-report)

- **`handle()` response contract confirmed unchanged / confidence confirmed internal-only** —
  read the full current file (`apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts`):
  `handle()`'s return type is `Promise<{status, thought, progress, nextSteps}>` — `confidence`
  is never included. `AnalysisResult` (which holds `confidence`) is only ever stored in the
  closure-scoped `analysisState` Map and exposed via `_analysisState` for tests. The DoD's
  "served payload shows null/absent confidence" RAW-verify language does not map to any live
  HTTP route for this field — **confirmed true**, not just relayed.
- **Consumer sweep** — grepped for every import of `sequential-market-analysis.js` /
  `analysis/index.ts` (barrel) / `_analysisState` / `AnalysisResult`: only
  `registry.ts` imports `registerSequentialMarketAnalysisTools` (the register function, not the
  tool object), and the barrel `analysis/index.ts` (which re-exports `AnalysisResult` +
  `createSequentialMarketAnalysisTool`) has **zero importers** anywhere in `apps/`. No other
  caller relied on the old `?? 0.5` fallback — confirmed no silent breakage elsewhere.
- **Targeted regression**: `FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts` — **5/5
  pass, 12 expect()** (omitted confidence stays undefined; supplied confidence unchanged;
  explicit `0` preserved — not treated as omitted; recommendation text honest; response
  contract unchanged).
- **Adjacent-file regression**: `tool-registry-parity.test.ts` (extracts
  `server.registerTool()` pattern from this same source file) run together with the above —
  **22/22 pass, 51 expect()**, no interference.
- **TypeScript**: `bun tsc --noEmit` — **0 errors**.
- **Full `bun test`**: kicked off in background; per this repo's own established precedent
  (bare full-suite runs are known to be slow/host-contended and non-authoritative for a
  narrowly-scoped, single-file change — see `sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md`
  S2/S4 and `sprint-SYSTEMIC-REMAKE-P1-qa.md` CONTAM-10-WRITER-H entry), this is corroborating
  only, not load-bearing — the targeted + adjacent-caller suites (the only files that actually
  exercise this diff, confirmed exhaustively via the consumer sweep above) are complete and
  green.

## DDD Compliance: PASS
Only pre-existing import in the modified file is `createLogger` from
`../../../../infrastructure/logger.js` — present before this diff (unrelated to the
confidence-fabrication fix), and a repo-wide convention (60 other interface-layer tool files
import the same logger path) — not a new violation introduced here. No `application` import.

## Security: PASS
No `process.env`, no hardcoded secrets/passwords/tokens in either modified file.
`mock-guard.sh --files apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts`
→ **PASS, exit 0** ("no fabricated-data patterns found in production source").

## Code Review Findings
- Explicit `confidence: 0` is correctly preserved (`input.confidence !== undefined` guard, not
  `if (input.confidence)`) — falsy-but-stated values are not conflated with omitted values.
  Verified both by reading the diff and by the dedicated test case.
- A later revision's hypothesis that omits `confidence` does NOT clobber a previously-stated
  real value back to `undefined` (the assignment is inside `if (input.confidence !== undefined)`,
  never an unconditional reset) — correct "never fabricate, never silently discard a real
  value" behavior.
- `_analysisState` is additive-only: not read by `registerSequentialMarketAnalysisTools` or the
  MCP SDK handler wiring — zero risk to the real tool contract.

## Issues Found
### Blocking
None.

### Non-Blocking
- `mcp-server` image rebuilt (`180382145ee7`) but **not yet swapped** into the running
  container (still `4c8ea4cfd41f`, serving `CONTAM-10-WRITER-H`) — `docker compose up -d` is
  an ops-gated live-container swap per standing policy; QA does not self-authorize it.
- Because `confidence` has no live HTTP surface (confirmed above), the **post-swap QA hop for
  this task does not need a RAW HTTP probe** — a lighter sanity check (server boots healthy,
  tool count unchanged) is sufficient and has been reflected in `.head.next_action`.

## Merge Status
No branch merge required — dev-mcp-server committed directly to `main` (`1b1397025`, already
on `main`). Task held at **REVIEW** (`status_note: "code/tests QA-approved, pending ops
swap; post-swap gate is a lighter sanity check — no live HTTP surface for confidence"`).
`.head.next_agent` set to `"ops"` to request the container swap.
