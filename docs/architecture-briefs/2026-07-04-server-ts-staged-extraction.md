# server.ts Staged Extraction — Planning Brief

ZONE: `apps/mcp-server/`
Task: `FACTORY-INTERFACE-split-server-ts` (P0, orch-state: IN_PROGRESS). `backlog-detail.json` ref is NOT_FOUND — **this document is the missing spec.**
Status: **PLANNING ONLY.** No code changes land from this brief. User-gated structural change — implementation requires explicit approval, then one stage at a time.

Companion/prior-art tickets (found in `docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md:141`, orch-state `task_board`):
- `FACTORY-INTERFACE-confidence-score-50-mask` — **already done** (verified: `routes/stockSignalsHandler.ts:224` serializes `confidence_score: row.confidence_score ?? null`, not the old `?? 50` mask).
- `FACTORY-INTERFACE-vps-auth-guard-dedup` — **BACKLOG, not started** (verified: zero hits for `requireVpsApiKey` anywhere in `apps/mcp-server/src`). Folded into Stage 1 below rather than run standalone (see Stage 1 rationale).
- `FACTORY-INTERFACE-delete-bak-files` — **BACKLOG, not started.** Addressed in §3 below (flagged, not executed by this brief).

---

## 1. Inventory of `server.ts` (2527 lines)

`server.ts` is one file with three concerns wedged together:

| Concern | Lines (approx) | Status |
|---|---|---|
| Imports (mostly `routes/*Handler.ts` re-imports) | 23–156 | N/A |
| HTTP↔Web-standard transport glue (`incomingToWebRequest`, `pipeWebResponseToNode`, `stripCloudflarePathPrefix`) | 165–244 | Core hot-path infra — **out of scope**, do not touch |
| `parseMultipartFields` helper | 255–293 | Used by exactly one route (`push-bctc-pdf`) — moves with it in Stage 4 |
| `createBunServer()` bootstrap (McpServer factory, tool-count probe, reaper, DB open, thresholds load, pdf backfill) | 325–439 | Core hot-path infra — **out of scope** |
| `/mcp`, `GET /sse`, `POST /messages`, `GET /health`, `GET /` | 466–764 | **The actual MCP tool-serving hot path** — out of scope, never touched by any stage |
| ~55 already-extracted REST routes (one-line delegation to `routes/*Handler.ts`) | scattered 536–2467 | Already follows the target pattern — no work needed |
| **~18 routes still inline** (business logic embedded directly in `handleRequest`) | scattered 617–2060 | **This is the extraction target** |
| `httpServer` bootstrap + graceful close | 2474–2528 | Core hot-path infra — **out of scope** |

### 1a. Already-extracted routes (reference — no action needed)
Confirmed one-liner delegation pattern already in place for ~55 routes: `handleVpsNewsHealth`, `handleNewsFetchLive/Dashboard`, all 8 `handleBctcInspect*`, `handlePushBctcTable/MdTables/Layout`, `handleBctcInspectFlags/Correct/Confirm/ConfirmReset`, `handleWebhook`, `handlePushPrices/ForeignFlow/News/SbvRates`, all 5 `handleBctcEval*` + `bctcEvalPageHandler`, `handleBctcRefineOnDemand`, `handleGetOrchestration/CronStatus/QualityChecklist`, `handleVpsProxyHealth`, `handleFetchStatus`, `handleKinhDichReading/Market`, `handlePriceHistory/Batch`, `handleNewsHeadlines`, and all 19 `TASK17-PAGE*` frontend REST endpoints (`handleGetMarketDigest`, `AnalysisBrief(Index)`, `NewsSentiment`, `MacroRegime`, `IndicatorGauges`, `MomentumIndicators`, `MoneyRadar`, `PriceHistory`, `Alerts`, `ForeignFlow`, `AgmPlanActual`, `PredictionClaims`, `ConvictionHistory`, `MarketSummaries`, `SectorRotation`, `SectorCascade`, `KinhDichSignals`, `GlobalMarkets`, `CorporateEvents`, `Shareholders`, `Officers`, `Financials`, `FedRates`, `Reputation`, `NewsBuzz`). `GET /api/foreign-flow-status` (line 785) is also effectively already extracted (Pattern B — see §2) — only its 14-line wiring stays in server.ts, nothing to move.

### 1b. Inline routes — the extraction target (18 routes, ~1300 lines)

| Route | Method | Lines | Size | Notes |
|---|---|---|---|---|
| `/api/trigger-pek-extract` | POST | 617–698 | 82L | body parse, DB lookup, cross-service `fetch` to pdf-extractor:5001 |
| `/api/watchlist` | GET | 801–840 | 40L | auth, DB query, config file read |
| `/api/bctc-fetch-queue` | GET | 855–995 | 141L | auth, quarter-boundary calc, DB queries, dynamic import of `bctcQueueEnricher` |
| `/api/push-bctc-pdf` | POST | 998–1146 | 149L | auth, multipart parse (`parseMultipartFields`), file write, fire-and-forget pipeline trigger |
| `/api/enrich-queue-item` | POST | 1153–1218 | 66L | auth, body parse, DB update |
| `/api/push-ohlcv-history` | POST | 1222–1331 | 110L | auth, body parse, `validateOhlcvUnit` guard, batch upsert |
| `/api/ohlcv-backfill-queue` | GET | 1334–1354 | 21L | auth, single DB read |
| `/api/signals/stock/:code` | GET | 1359–1407 | 49L | *partial* — core query already delegated to `querySignalsForStock`; only accuracy-map + response wiring is inline |
| `/api/accuracy/digest` | GET | 1413–1428 | 16L | *partial* — delegates to `getSystemAccuracyDigestStats`; thin wiring only |
| `/api/ohlcv-backfill-done` | POST | 1434–1542 | 109L | auth, body parse, depth-probe, retry-storm cap + `sendTelegramBug` |
| `/api/push-reuters` | POST | 1545–1608 | 64L | auth, body parse, SHA-1 id hash, DB insert loop |
| `/api/push-tradingeconomics` | POST | 1611–1686 | 76L | auth, body parse, column-allowlist upsert |
| `/api/push-gso` | POST | 1689–1761 | 73L | auth, body parse, column-allowlist upsert (near-duplicate of push-tradingeconomics) |
| `/api/trigger-bctc-debug` | POST | 1764–1826 | 63L | auth + parse wrapper around already-extracted `handleTriggerBctcDebug` + inline SSH-command build |
| `/api/trigger-price-debug` | POST | 1829–1887 | 59L | same wrapper shape around `handleTriggerPriceDebug` |
| `/api/trigger-news-debug` | POST | 1890–1943 | 54L | same wrapper shape around `handleTriggerNewsDebug` |
| `/api/trigger-sbv-debug` | POST | 1946–1999 | 54L | same wrapper shape around `handleTriggerSbvDebug` |
| `/api/trigger-foreign-flow-debug` | POST | 2002–2060 | 59L | same wrapper shape around `handleTriggerForeignFlowDebug` |

**Cross-cutting duplication found:** the 7-line `VPS_PUSH_API_KEY` auth-header check (`x-api-key` then `Bearer` fallback → 401) is copy-pasted verbatim in essentially every route above (15+ copies, matches `FACTORY-INTERFACE-vps-auth-guard-dedup`'s own count). The 5 debug-trigger routes additionally duplicate an SSH-command-builder block verbatim (differing only in script filename + arg shape). `push-tradingeconomics` and `push-gso` duplicate an allowlist-upsert pattern differing only in the allowed-column map.

**Important scope clarification for blast-radius reasoning:** none of these 18 inline routes are on the MCP *tool*-serving path. `task_claim`, `send_telegram`, `get_market_snapshot`, and every other `vn-market` tool are dispatched through `/mcp` (`WebStandardStreamableHTTPServerTransport`) and legacy `/sse` + `/messages`, which call `createMcpServerInstance()` → `toolRegistry` (`tools/registry.ts`) — a completely separate code path from the REST routes catalogued here. These 18 routes are VPS-proxy push/pull endpoints and ops debug triggers. They share the same file and the same `handleRequest` dispatcher function, which is *why* the blast radius is still whole-surface (see §5) — but no stage in this plan touches `/mcp`, `/sse`, `/messages`, or `createMcpServerInstance`.

---

## 2. Established extraction pattern (read from `routes/` + sibling `*Handler.ts`)

Two sibling patterns already coexist in the codebase; new extractions should follow whichever fits:

**Pattern A — side-effecting handler (majority pattern, ~55 existing examples).**
File: `apps/mcp-server/src/interface/mcp/routes/<name>Handler.ts`
```ts
export function handle<Name>(req: IncomingMessage, res: ServerResponse, db: Database /*, log?, ...extra*/): void {
  // or async, if it awaits I/O
  try {
    // business logic, writes directly to res
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "..." }));
  }
}
```
Wired in `server.ts`:
```ts
import { handle<Name> } from "./routes/<name>Handler.js";   // top of file, .js extension per ESM convention
// ...
if (method === "GET" && pathname === "/api/...") {
  handle<Name>(req, res, db);
  return;
}
```
Example read: `routes/vpsNewsHealthHandler.ts` (`handleVpsNewsHealth(req, res, db)`).

**Pattern B — pure function returning `{status, body}` (testable without HTTP mocking, used for diagnostic/status endpoints).**
File: `apps/mcp-server/src/interface/mcp/<name>Handler.ts` (sibling of `server.ts`, not under `routes/` — the 6 debug-trigger/status handlers use this location)
```ts
export function build<Name>Response(opts: {...}): { status: number; body: object } {
  // pure — no req/res — fully unit-testable
}
```
Wired in `server.ts`:
```ts
import { build<Name>Response } from "./<name>Handler.js";
// ...
const result = build<Name>Response({ db, apiKey, requestApiKey });
res.writeHead(result.status, { "Content-Type": "application/json" });
res.end(JSON.stringify(result.body));
```
Example read: `foreignFlowStatusHandler.ts` (`buildForeignFlowStatusResponse`), and `bctcDebugTriggerHandler.ts` (`handleTriggerBctcDebug(opts, db): Promise<Result>` — same idea, async).

**Naming/location note (pre-existing inconsistency, not to be "fixed" as part of this task):** the 5 debug-trigger handlers + `foreignFlowStatusHandler.ts` + `vpsServiceRestartHandler.ts` live directly in `interface/mcp/` rather than `interface/mcp/routes/`. New extractions in this plan will use `routes/` (the majority convention, and the one named explicitly in the dispatch instructions) — do not relocate the older sibling files as a side effect.

**DI/deps contract observed across all examples:** `db: Database` is passed in (never `getDb()` inside a handler — single shared instance opened once in `createBunServer`, per the Task-1839a comment at server.ts:395–398). `log` is passed in only when a handler needs to log. No handler imports `Bun.env` config beyond `VPS_PUSH_API_KEY` (auth) — everything else is DI'd.

---

## 3. `server.ts.bak` disposition

**Stale cruft — already independently flagged, not touched by this brief.** Confirmed:
- Git-tracked, 1569 lines, last modified 2026-05-06 (commit `d6ab44dda`), pre-dates the `FIX-MCP-500-SYMBOL-TO-STRING` sprint (2026-05-20) that rewrote the `/mcp` transport — so it's not just unused, it's now also *behaviorally wrong* relative to current `server.ts`.
- `.bak` extension is excluded from TS module resolution — confirmed not imported anywhere (`grep` clean).
- Already carries an open backlog ticket: `FACTORY-INTERFACE-delete-bak-files` (BACKLOG, zone `mcp-server-interface`, effort S, risk low) with an exact prescribed fix: `git rm apps/mcp-server/src/interface/mcp/server.ts.bak apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts.bak docker-compose.yml.bak docs/TASKS.md.bak` + add `*.bak` to `.gitignore`.

Recommendation: run `FACTORY-INTERFACE-delete-bak-files` independently (trivial, zero risk, zero coupling to this extraction) — do not bundle it into any extraction stage below.

---

## 4. Staged plan

Ordered smallest-and-safest-first per dispatch instructions (the June-15 audit brief suggested "largest first"; this plan supersedes that ordering — proving the pattern on the lowest-risk, most mechanical bundle first is safer for a file this central, and the auth-guard dedup naturally seeds the pattern for every later stage). Each stage = one PR-sized commit.

### Stage 1 (RECOMMENDED FIRST) — Ops debug-trigger routes + auth-guard extraction
**Routes moved (5):** `POST /api/trigger-bctc-debug`, `/api/trigger-price-debug`, `/api/trigger-news-debug`, `/api/trigger-sbv-debug`, `/api/trigger-foreign-flow-debug` — server.ts lines 1764–2060 (~290L → ~15L of one-liners + imports).
**Why first / lowest risk:** these 5 routes are already 80% extracted — their core logic lives in sibling files (`bctcDebugTriggerHandler.ts`, `priceDebugTriggerHandler.ts`, `newsDebugTriggerHandler.ts`, `sbvDebugTriggerHandler.ts`, `foreignFlowDebugTriggerHandler.ts`), all already unit-tested. Only the thin, near-identical wrapper (auth check → body parse → call handler → build SSH command → write response) remains inline, duplicated 5×. Moving + deduping this wrapper touches zero business logic and zero data writes beyond an optional advisory log line. Not on the `/mcp` hot path (VPS-key-gated ops endpoints).
**New file(s):**
- `routes/_shared/requireVpsApiKey.ts` — extracts the 7-line `x-api-key`/`Bearer` 401 guard (satisfies `FACTORY-INTERFACE-vps-auth-guard-dedup` for this stage's routes; later stages reuse it instead of re-copy-pasting). Exports `requireVpsApiKey(req, res): boolean` (writes 401 + returns `false` on failure, mirrors exact existing header precedence).
- `routes/debugTriggerRoutes.ts` — exports `handleTriggerBctcDebugRoute`, `handleTriggerPriceDebugRoute`, `handleTriggerNewsDebugRoute`, `handleTriggerSbvDebugRoute`, `handleTriggerForeignFlowDebugRoute` (Pattern A, `(req, res, db, log): Promise<void>`), plus one private `buildSshCommand(vinahostIp, script, tickerArgs, verboseFlag)` helper deduping the 5 near-identical SSH string builds.
**Wiring edit in server.ts:** replace lines 1764–2060 with 5 one-liner `if (...) { await handleTrigger*DebugRoute(req, res, db, log); return; }` blocks + 1 new import line for `debugTriggerRoutes.js`.
**Verification:** existing `FIX-BCTC-DEBUG-TRIGGER.test.ts` (confirm it still passes unmodified — it drives `createBunServer` + real `fetch`); add equivalent smoke coverage for the other 4 triggers if not already present (check before assuming). Concrete smoke check: `POST` all 5 endpoints with `{dry_run: true}` and header `x-api-key: <test key>` against a live `createBunServer({port: TEST_PORT})` instance, assert `200` + unchanged JSON shape (`queued`, `log_tail`, `dry_run`). Plus the universal per-stage gate (§below): `pnpm check` green, `GET /health` returns unchanged `toolCount`, and a live `/mcp` tool-list round-trip succeeds.
**Rollback:** `git revert` the single commit — pure mechanical move + dedup, no behavior change, no live external state (dry-run path never touches `VINAHOST_IP`/SSH; the SSH command is only ever logged, never executed, in both the current and extracted code).

### Stage 2 — Macro/news VPS-push routes
**Routes moved (3):** `POST /api/push-tradingeconomics` (1611–1686), `/api/push-gso` (1689–1761), `/api/push-reuters` (1545–1608). ~213L.
**New file(s):** `routes/macroPushHandler.ts` exporting `handlePushTradingEconomics`, `handlePushGso`, `handlePushReuters` (Pattern A), plus a private `upsertMacroIndicators(db, country, indicators, allowedCols)` helper deduping the near-identical TE/GSO allowlist-upsert logic. Uses `requireVpsApiKey` from Stage 1.
**Wiring edit:** replace the 3 blocks with 3 one-liners + import.
**Verification:** existing `1495-tradingeconomics-vps-push.test.ts`, `1499-gso-macro-vps-push.test.ts`, `1493-reuters-vps-push.test.ts` (all three already exist and drive real HTTP calls against `createBunServer`) — must pass unmodified. Smoke: POST minimal valid payload to each, assert `macro_indicators`/`rag_analyses` row upserted with identical column values to pre-extraction. Plus universal gate.
**Rollback:** `git revert`.

### Stage 3 — OHLCV backfill VPS lifecycle
**Routes moved (3):** `POST /api/push-ohlcv-history` (1222–1331), `GET /api/ohlcv-backfill-queue` (1334–1354), `POST /api/ohlcv-backfill-done` (1434–1542). ~240L.
**New file(s):** `routes/ohlcvBackfillHandler.ts` exporting `handlePushOhlcvHistory`, `handleOhlcvBackfillQueue`, `handleOhlcvBackfillDone` (Pattern A). Preserves the `validateOhlcvUnit` domain import and the retry-storm `sendTelegramBug` escalation verbatim — this bundle carries real business logic (unit-guard rejection, depth-probe, retry cap), not just wiring, hence Stage 3 not Stage 1.
**Wiring edit:** replace the 3 blocks with 3 one-liners + import.
**Verification:** existing `1360-ohlcv-backfill-queue.test.ts`, `1350-ohlcv-backfill-endpoint.test.ts`, `ohlcv-backfill-done-subtask-b.test.ts`, `TASK-OHLCV-WIC-2-writer-h-coerce.test.ts` (unit-guard coverage) — must pass unmodified. Smoke: push one known-good bar and one known-unit-contaminated bar, assert `inserted`/`skipped` counts match pre-extraction exactly; verify the retry-storm Telegram path is not accidentally live-fired by tests (must remain mockable/test-env-gated as it is today). Plus universal gate.
**Rollback:** `git revert`.

### Stage 4 — BCTC VPS proxy ingestion (largest, do last of the mandatory stages)
**Routes moved (4):** `GET /api/bctc-fetch-queue` (855–995), `POST /api/push-bctc-pdf` (998–1146) + its `parseMultipartFields` helper (255–293), `POST /api/enrich-queue-item` (1153–1218), `POST /api/trigger-pek-extract` (617–698). ~478L + 39L helper.
**New file(s):**
- `routes/_shared/multipartParser.ts` — moves `parseMultipartFields` verbatim (only current caller is `push-bctc-pdf`).
- `routes/bctcVpsQueueHandler.ts` — `handleBctcFetchQueue`, `handleEnrichQueueItem` (queue-management pair).
- `routes/bctcVpsIngestHandler.ts` — `handlePushBctcPdf` (uses `multipartParser.ts`), `handleTriggerPekExtract` (cross-service `fetch` to `pdf-extractor:5001`).
**Wiring edit:** replace the 4 blocks with 4 one-liners + imports.
**Verification:** this bundle has the widest side-effect surface (filesystem write to `data/pdfs/`, fire-and-forget async pipeline via `setImmediate`, cross-service HTTP call, multipart parsing). Run existing `FIX-BCTC-PIPELINE.test.ts`, `FIX-bctc-enrich-stall.test.ts`, `1945d-reparse-pipeline-gap.test.ts`, `pek-render-seam.test.ts`, `FIX-CTG-3-STEP-C.test.ts`, `FIX-CTG-3-STEP-D.test.ts`, `1782-bctc-q1-2026-seeding.test.ts`, `FIX-BCTC-SIZE-GUARD.test.ts` — all must pass unmodified. Smoke: multipart-POST a real small fixture PDF to `/api/push-bctc-pdf`, confirm `200` + `bctc_vps_queue` status transitions `pending → fetching → done`; `GET /api/bctc-fetch-queue` returns identical shape/enrichment. Given the wider surface, also run the **full** `bun test` suite (not just the targeted files) before merge, per `pnpm check` + full-suite gate. Plus universal gate.
**Rollback:** `git revert`. If the fire-and-forget pipeline already fired before revert is applied, no data-corruption risk — the extraction changes only where the code lives, not the queue-state machine's transitions.

### Stage 5 (optional, defer — low value/risk ratio, not scheduled)
`GET /api/watchlist` (40L), `GET /api/accuracy/digest` (16L, thin wiring cleanup only), `GET /api/signals/stock/:code` (49L, thin accuracy-map wiring only — core query already delegated), and relocating `GET /api/foreign-flow-status`'s one-line wiring from `./foreignFlowStatusHandler.js` into `routes/` for location-convention consistency (no logic change). Total ≈105L of genuinely new extraction + 1 cosmetic move. Small enough that the PR-review overhead exceeds the benefit — recommend leaving these as-is unless a future change already touches that code, at which point extract opportunistically.

**Net effect after Stages 1–4:** `server.ts` drops from 2527 → roughly 1500–1600 lines (still a large route table, but zero remaining routes with inline business logic beyond the two Stage-5 thin-wiring cases). Further shrinking the file below that floor would mean restructuring the `if/else-if` dispatch chain itself into a router/dispatch table — a materially different, higher-risk architectural change, explicitly out of scope here and worth its own separate brief if pursued later.

---

## 5. Blast radius & risk

**What could break the *entire* tool surface (all `vn-market` tools, not just the routes touched):**
1. **Compile failure.** `server.ts` and every new `routes/*Handler.ts` file are part of one `tsc` compilation unit. A single bad import path (missing `.js` extension, wrong relative depth after a file move) fails `bun tsc --noEmit` for the whole package — the server binary never starts, and *every* tool (`task_claim`, `send_telegram`, `get_market_snapshot`, all others) is down, not just the moved route. Mitigation: `pnpm check` is a hard gate on every stage before merge, no exceptions.
2. **Top-level throw during `createBunServer()` bootstrap.** If an extraction accidentally moves code that runs at *import time* (rather than at request time) into a module with a side-effecting top-level statement, or breaks one of the startup calls at lines 384–428 (`ensurePoisonedQueueCleanup`, `startPeriodicReaper`, threshold load, pdf backfill), the process can crash before ever binding the port — again, whole-surface outage. Mitigation: Stages 1–4 never touch lines 1–460 or 2474–2528 (the bootstrap/close code) — only the inline route bodies inside `handleRequest`'s `if`-chain move.
3. **Route-order / fallthrough regression.** `handleRequest` is one long `if (method === X && pathname === Y) { ...; return; }` chain. At least one existing route is explicitly order-dependent (`GET /api/bctc-eval/thresholds` at line 2074 **must** precede the `startsWith("/api/bctc-eval/")` catch-all at line 2086, per the inline comment) — this pattern likely recurs elsewhere in the un-catalogued already-extracted routes too. Extraction must preserve the exact registration ORDER when the `if` blocks are replaced by one-liners, not just move the code. Mitigation: each stage's diff should show the replaced `if` blocks in the *same relative position* in the chain; smoke tests hit the specific narrow-vs-prefix route pairs.
4. **Missing `return` after delegation.** If a one-liner replacement drops the trailing `return;`, execution falls through into the next `if` in the chain and/or eventually the 404 handler, corrupting the response (double `writeHead`/`end` throws, or wrong body). This is a mechanical but easy-to-miss mistake at this line count. Mitigation: `pnpm check`'s `noUnusedLocals`/control-flow is not sufficient here — rely on the concrete per-stage smoke checks (real HTTP round-trip against `createBunServer`) plus a explicit reviewer checklist item ("every replaced block still ends in `return;`").
5. **Auth-guard behavior drift.** The dedup in Stage 1 (`requireVpsApiKey`) touches the single most-copy-pasted block in the file. If the extracted guard doesn't reproduce the *exact* existing precedence (`x-api-key` header checked before `authorization: Bearer ...` fallback) or the exact 401 body shape, every VPS push/pull integration (price pusher, foreign-flow pusher, BCTC VPS proxy, macro pushers) silently starts rejecting real traffic from the VPS host. Mitigation: guard extraction is a pure line-for-line lift with a byte-identical diff of the auth check itself, verified against `1892b-vps-contract-push.test.ts` and the per-route push tests already listed above.

**Why staging bounds the risk (rather than one big-bang diff):** each stage is independently revertible via a single `git revert`, independently `pnpm check`-gated, and independently smoke-tested against the *specific* routes it touches before the next stage starts. A regression introduced in Stage 2 is caught and reverted before Stage 3 ever begins, so the blast radius of any one mistake is bounded to "the routes in that one stage were down for the time between merge and revert" rather than "the entire 2527-line dispatcher was rewritten in one shot with an unknown-location bug."

---

## Summary for dispatcher

- **4 mandatory stages** (+1 optional/deferred cleanup stage), each one PR-sized commit, smallest-and-safest-first.
- **Recommended Stage 1:** Ops debug-trigger routes bundle (`trigger-bctc-debug`, `trigger-price-debug`, `trigger-news-debug`, `trigger-sbv-debug`, `trigger-foreign-flow-debug` — 5 routes, ~290 lines) + extraction of the shared `requireVpsApiKey` guard (satisfies the separately-tracked `FACTORY-INTERFACE-vps-auth-guard-dedup` for this stage). Risk: LOW — core business logic already lives in already-tested sibling files; this stage only moves+dedupes thin wiring, off the MCP tool hot path.
- **Top risks (whole-surface):** (1) `tsc` compile failure from a bad import path taking down the entire binary/tool-surface, (2) route-order or missing-`return` regressions in the long `if`-chain silently misrouting requests, (3) auth-guard precedence drift breaking real VPS push traffic. None of the 4 stages touch `/mcp`, `/sse`, `/messages`, or `createMcpServerInstance` — the MCP tool-dispatch path itself is untouched throughout.
- **`server.ts.bak`:** confirmed stale (pre-dates the 2026-05-20 `/mcp` transport rewrite it claims to represent), not compiled, not imported, already has its own independent backlog ticket (`FACTORY-INTERFACE-delete-bak-files`, BACKLOG) with an exact `git rm` fix — not bundled into this extraction plan.
- **Brief:** `docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md`
