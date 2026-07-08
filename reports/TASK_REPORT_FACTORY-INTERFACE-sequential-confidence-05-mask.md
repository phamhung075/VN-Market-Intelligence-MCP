# Task Report: FACTORY-INTERFACE-sequential-confidence-05-mask — stop fabricating 0.5 confidence

date: 2026-07-08
outcome: DONE_VERIFIED — post-swap sanity check PASS (docker inspect image match, `/health` 200/`toolCount` 183 unchanged); optional live-wire probe surfaced an unrelated, pre-existing `sequential_market_analysis` dead-tool bug, filed separately as `FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER` (does not block this task)

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

## Post-Swap Sanity Check (2026-07-08T03:34:45Z) — DONE_VERIFIED

ops swapped the live `mcp-server` container (`675451c2c`, image `4c8ea4cfd41f` →
`180382145ee7`). Independently re-verified, not trusted:

- **Image match**: `docker inspect vn-market-intelligence-mcp-mcp-server-1 --format
  '{{.Image}}'` → `sha256:180382145ee7157c3206a98ada7c1c8a8d354e192da63d402ff6afbb3030c9cb`
  — exact match to the rebuilt + QA-approved image. Container `Up (healthy)`.
- **Health/tool count**: `curl http://localhost:3000/health` → **200**,
  `{"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,...}` — tool count
  unchanged.
- **Optional live-wire probe** (left to QA's judgment per task instructions): attempted a
  real `tools/call` POST to `/mcp` for `sequential_market_analysis` with a stated hypothesis
  and confidence deliberately omitted, to visually confirm no confidence leak in a real call.

### New finding — unrelated, pre-existing dead-tool bug

The live call never reached `handle()`: `MCP error -32602` on a malformed first probe, then
`originalHandler is not a function` on a correctly-shaped one. Root cause:
`registerSequentialMarketAnalysisTools` calls
`server.registerTool("sequential_market_analysis", {title,description,inputSchema,handler:tool.handle})`
— the real `@modelcontextprotocol/sdk@1.29.0` signature is `registerTool(name, config, cb)`
(`.../dist/esm/server/mcp.js:699` + `.d.ts:150-157`); `config.handler` is not a recognized
field (only `title/description/inputSchema/outputSchema/annotations/_meta` are destructured)
and no 3rd `cb` argument is ever passed, so the SDK's internal `registeredTool.handler` is
permanently `undefined`. `server.ts`'s per-call telemetry wrapper
(`const originalHandler = toolDef.handler; ...; return originalHandler(args);`) then throws on
every real invocation, over every transport (registration bug, not a routing bug).

**Confirmed pre-existing, unrelated to this diff**: `git show
1b1397025^:apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts`
shows a byte-identical broken `registerTool` call before this fix landed — `1b1397025` never
touches `registerSequentialMarketAnalysisTools`. Also confirmed not a systemic `/mcp`-route
issue: `get_market_snapshot` (registered via the correct `server.tool(name,description,
schema,handler)` 4-arg legacy API) called over the same route on the same container returned
real, correct live data.

This *reinforces* the REVIEW-stage verdict rather than contradicting it: `sequential_market_analysis`
never had ANY live wire surface at all (broader than "no surface for `confidence`
specifically") — a full RAW HTTP probe genuinely could not have added signal for this task's
own DoD. The confidence-fabrication fix itself remains correctly verified at the unit level
(`tool.handle()` called directly — the exact code path production traffic hits once the
unrelated wiring bug is fixed) — zero regression introduced by `1b1397025`.

Filed as a new backlog task rather than blocking this one: **`FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER`**
(`task_board.backlog[]` + `backlog-detail.json`, owner `dev-mcp-server`, priority `high`, zone
`mcp-server-interface`) — exact repro, root cause, and suggested fix (pass `tool.schema` +
`tool.handle` as separate positional args, matching the working pattern in
`marketTools.ts:147`) included in the detail entry.

**Board write**: `FACTORY-INTERFACE-sequential-confidence-05-mask` flipped `REVIEW` →
`DONE_VERIFIED` via `scripts/qa-factory-interface-sequential-confidence-05-mask-done-verified.jq`
+ `scripts/orch-apply.sh` (array-move `task_board.review[]` → `task_board.done_verified[]`).
`.head` idle-reset (`status:"done"`, `active_task_id:null`, `next_agent:"router"`) pointing at
the new follow-up task — not dispatched here, router's job.

DJ: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-qa.md` §qa-S7 (DJ-GATE-1).
