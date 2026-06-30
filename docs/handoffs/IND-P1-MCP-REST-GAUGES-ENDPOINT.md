# Dev Task — IND-P1 MCP REST Gauges Endpoint (`GET /api/indicator-gauges`)

**Task ID:** IND-P1-MCP-REST-GAUGES-ENDPOINT
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Tier:** P1
**Zone:** apps/mcp-server (TypeScript)
**Dev Agent:** dev-mcp-server
**Created:** 2026-06-30T02:48:19Z (PO-authored — contract already pinned by frontend, no BA/architect cascade needed)
**Spec author:** po (direct — pm-spec-equivalent)

> **Dispatch ordering (router-owned, NOT a code dependency):** the router will dispatch this
> AFTER the in-flight `IND-P1-MCP-PROXY-INDICATORS` task + its mcp-server rebuild complete,
> so mcp-server rebuilds stay serial. This row therefore sits in `backlog[]` (status BACKLOG),
> NOT `ready[]` — do not self-promote.

---

## Why this exists (the gap)

`IND-P1-FRONTEND-GAUGE-CARDS` shipped (done_verified): `dashboard.indicator-gauges.tsx`
renders 6 P0 indicator gauge-cards. Its data path is:

```
page loader → frontend proxy app/routes/api.indicator-gauges.tsx
            → GET ${MCP_SERVER_BASE_URL}/api/indicator-gauges  (mcp-server :3000)
```

**That mcp-server endpoint does not exist** → 404 → the proxy faithfully forwards it →
the dashboard degrades to honest-NULL **permanently**. This task builds that endpoint so the
gauge dashboard can finally display real data. "Ship completion, not slices."

---

## Scope

Add a single read-only REST endpoint to mcp-server:

```
GET /api/indicator-gauges
```

It aggregates the **5 P0 indicator sources** (already LIVE) into the exact JSON DTO the
frontend already consumes, preserving the honest-NULL contract per section.

This is a **pure interface/aggregation task** — NO new domain logic, NO new tools, NO DB
schema change. It reuses the existing application usecases that back the 5 P0 MCP tools.

---

## File pointers (mcp-server REST architecture)

Existing REST endpoints follow a fixed pattern (e.g. `/api/news-sentiment`, `/api/macro-regime`):

1. **New handler file:**
   `apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts`
   exporting `export async function handleGetIndicatorGauges(req, res, db) { ... }`.
   Model on the structure of `routes/macroRegimeHandler.ts` / `routes/newsSentimentHandler.ts`.

2. **Register in `apps/mcp-server/src/interface/mcp/server.ts`:**
   - Add the import near the other route imports (~line 108-110 block).
   - Add the dispatch branch in the request handler (mirror the `/api/news-sentiment` block ~line 2138-2145):
     ```ts
     if (method === "GET" && pathname === "/api/indicator-gauges") {
       await handleGetIndicatorGauges(req, res, db);
       return;
     }
     ```

> The frontend proxy strips/forwards `4xx/5xx` as-is and returns `502` only on network
> failure; the Cloudflare prefix `/vn-market/api/*` is already normalized to `/api/*` by
> `stripCloudflarePathPrefix` in server.ts — no extra routing work.

---

## The 5 source functions (reuse — do NOT re-invoke via MCP)

Call the SAME application usecases the P0 MCP tools call. Run all 5 **in parallel**
(`Promise.allSettled`) — see Error/Timeout below.

| Section | Source function | Module | Notes |
|---|---|---|---|
| `volatility` | `computeVolatilityIndicators({ tickers })` (returns `ComputeVolatilityResponse`) | `infrastructure/microservices/clients.js` | call with default tickers (whole watchlist) |
| `sentiment` | `getMarketSentimentIndex(db)` | `application/usecases/getMarketSentimentIndex.js` | fields map 1:1 |
| `breadth` | `getBreadthThrust(db)` | `application/usecases/getBreadthThrust.js` | returns `{error}` when history empty → section null |
| `foreign_room` | `getForeignRoom(db)` (no `code` arg → market-wide object) | `application/usecases/getForeignRoom.js` | **project from `.market` — do NOT forward `.tickers[]`** |
| `liquidity` | `macroFetch(baseUrl, "/liquidity-state", {}, {deadlineMs})` | `infrastructure/fetchers/fetchDeadline.js` + `tools/macro/macroHttpClient.js` (`getMacroBaseUrl`) | **remote HTTP POST to macro-indicators :5004 — the timeout-prone section** |

---

## Response DTO — authoritative contract

The frontend DTO is the SSOT. It is defined verbatim in
`apps/frontend/app/routes/dashboard.indicator-gauges.tsx` (interfaces `VolatilityGauge`,
`SentimentGauge`, `BreadthGauge`, `BreadthZScore`, `ForeignRoomGauge`, `LiquidityGauge`,
`IndicatorGaugesDto`) and documented in the proxy header
`apps/frontend/app/routes/api.indicator-gauges.tsx`. **Match it field-for-field.**

```jsonc
{
  "generated_at": "<ISO string — server now, ALWAYS set>",
  "error": "<optional top-level string — only on catastrophic failure>",

  "volatility": {            // null only if compute yields no usable data
    "rv_20d_percentile": <number|null>,   // 0–1
    "rv_20d_pct": <number|null>,
    "vol_regime": <"LOW"|"NORMAL"|"ELEVATED"|"CRISIS"|null>,
    "vol_regime_pct": <number|null>,
    "asof": "<YYYY-MM-DD|null>",           // derive from tool fetched_at date portion
    "null_reason": <string|null>,          // set when rv_20d_percentile is null
    "source_tier": <number>                // from tool source_tier
  } | null,

  "sentiment": {             // null only when history EMPTY / fn errors
    "news_sentiment_z": <number|null>,
    "history_quality": "EMPTY"|"INSUFFICIENT"|"SUFFICIENT",  // required, non-null
    "sentiment_ema_5d": <number|null>,
    "bull_ratio_5d": <number|null>,        // 0–1
    "bear_ratio_5d": <number|null>,        // 0–1
    "asof": "<YYYY-MM-DD>",
    "null_reason": <string|null>,
    "source_tier": <number>
  } | null,

  "breadth": {               // null when underlying tool returns {error} (history accruing)
    "breadth_z_score": {
      "value": <number|null>,              // null when <21 sessions / osc not warmed
      "unit": "<string>",
      "asof": "<YYYY-MM-DD|null>",
      "confidence": <number|null>,
      "null_reason": <string|null>
    },
    "mclellan_osc": <number|null>,         // null when <39 sessions
    "history_quality": "INSUFFICIENT"|"WARMUP"|"SUFFICIENT",
    "asof": "<YYYY-MM-DD|null>",
    "source_tier": <number>
  } | null,

  "foreign_room": {          // null only if getForeignRoom errors entirely
    "market_saturation_pct": <number|null>,   // from .market.market_saturation_pct
    "foreign_outflow_z_5d": <number|null>,     // from .market.foreign_outflow_z_5d (null when <20 sessions)
    "as_of_date": "<YYYY-MM-DD|null>",         // from TOP-LEVEL .as_of_date
    "null_reason": <string|null>,              // from .market.null_reason
    "source_tier": <number>                    // from .market.source_tier (=2)
  } | null,

  "liquidity": {             // null when macroFetch !result.ok (service down / timeout)
    "omo_net_outstanding_bn_vnd": <number|null>,  // from .omo.net_outstanding_bn_vnd (null when blocked)
    "policy_refi_rate_pct": <number|null>,        // from .policy_rates.refi_rate_pct
    "fetched_at": "<ISO|null>",                   // from .fetched_at
    "null_reason": <string|null>,                 // e.g. from .omo.blocked_reason when omo null
    "source_tier": <number>                       // ENDPOINT-ASSIGNED (tool has no source_tier — see below)
  } | null
}
```

### Per-section projection mapping (verified against live tool output 2026-06-30)

- **volatility** — fields map 1:1 from `computeVolatilityIndicators()` (`rv_20d_percentile`,
  `rv_20d_pct`, `vol_regime`, `vol_regime_pct`, `source_tier`). `asof` is NOT a tool field →
  derive `YYYY-MM-DD` from the tool's `fetched_at` ISO date portion. `null_reason` is NOT a
  tool field → synthesize when `rv_20d_percentile` is null (e.g. from `history_sessions`).
- **sentiment** — straight passthrough; the usecase already emits `news_sentiment_z`,
  `history_quality`, `sentiment_ema_5d`, `bull_ratio_5d`, `bear_ratio_5d`, `asof`,
  `null_reason`, `source_tier` with the exact DTO names.
- **breadth** — the live success shape is NOT observable right now (history empty → the
  usecase returns `{ "error": "no breadth history — ... accrual starts on next trading day" }`).
  **Read `getBreadthThrust`'s success return type from source** to map `breadth_z_score` /
  `mclellan_osc` / `history_quality` / `asof` / `source_tier`. When the usecase returns the
  `{error}` shape → emit `breadth: null` (honest-NULL).
- **foreign_room** — the usecase returns a heavy object `{ as_of_date, tickers[~105],
  market{...}, source_tier, coverage_note }`. **Project ONLY the two market-level scalars
  from `.market`** (`market_saturation_pct`, `foreign_outflow_z_5d`) + `.market.null_reason`
  + `.market.source_tier`, with `as_of_date` from the TOP level. **Never forward the
  `tickers[]` array** — the gauge needs only the two market scalars.
- **liquidity** — the macro fetch returns nested `{ policy_rates{refi_rate_pct, is_estimate},
  omo{net_outstanding_bn_vnd, blocked_reason, is_estimate}, fetched_at, ... }`. Map
  `policy_refi_rate_pct ← policy_rates.refi_rate_pct`, `omo_net_outstanding_bn_vnd ←
  omo.net_outstanding_bn_vnd` (often null/blocked → set `null_reason` from
  `omo.blocked_reason`), `fetched_at ← fetched_at`. The macro payload carries **no
  `source_tier`** → the endpoint MUST assign one explicitly (e.g. degrade the tier when
  `policy_rates.is_estimate === true` / DB-fallback). NEVER omit it and NEVER fabricate a value.

---

## Error / timeout behavior (per section — MANDATORY)

1. **Parallel, isolated.** Resolve all 5 sources with `Promise.allSettled` so one slow
   source (liquidity's remote macro fetch) cannot block the other four, and the total stays
   well under the frontend proxy / gateway timeout. Give `macroFetch` a bounded deadline
   (the existing tool uses `deadlineMs: 15_000`; keep it strictly below the proxy budget).
2. **Section-local failure → that section = `null` with `null_reason` + best-effort
   `source_tier`.** A rejected/thrown/timed-out source NEVER fails the whole response.
   The other 4 sections still return their data.
3. **Endpoint returns `200` whenever ANY section resolved** — never convert a single
   source failure into a `500`. `generated_at` (server now) is ALWAYS set.
4. **Catastrophic failure only** (e.g. DB unopenable, all 5 reject) → still prefer `200`
   with all-`null` sections AND the top-level optional `error` string set; a `5xx` is
   acceptable only if the handler itself cannot construct a response.

---

## Honest-NULL contract (STANDING RULE — baked into DoD)

Any section whose underlying P0 source returns insufficient / accruing / blocked data
**MUST** be emitted as `null` (section) or with `null` scalars carrying an explicit
`null_reason` **and** a `source_tier` — **NEVER fabricated, NEVER default-filled** (no `0`,
no placeholder string, no synthetic estimate). The frontend already renders honest-NULL per
section (gray "chưa có dữ liệu" badge); the endpoint must preserve that exactly.

Examples valid TODAY (2026-06-30 live state):
- `breadth: null` (history empty, accrual starts next trading day).
- `foreign_room.foreign_outflow_z_5d: null` + `null_reason: "Only 7 sessions available (need ≥20)"` (section non-null, scalar null).
- `liquidity.omo_net_outstanding_bn_vnd: null` + `null_reason` from `omo.blocked_reason` (refi rate still present).

---

## Definition of Done

- [x] `GET /api/indicator-gauges` registered in `server.ts` + handler in
      `routes/indicatorGaugesHandler.ts`.
- [x] Response matches the frontend `IndicatorGaugesDto` field-for-field (5 sections +
      `generated_at`); verified by reading
      `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` interfaces.
- [x] All 5 sources called in parallel via `Promise.allSettled`; one section failing/timing
      out does NOT fail the others; endpoint returns 200 with partial data.
- [x] `foreign_room` projects only `.market` scalars (no `tickers[]` array leak).
- [x] `liquidity` assigns an explicit `source_tier` (macro payload lacks one) and never blocks
      on the remote fetch beyond its bounded deadline (deadlineMs: 15_000).
- [x] Honest-NULL preserved: every null section/scalar carries `null_reason` + `source_tier`;
      zero fabricated / default-filled values.
- [x] `pnpm --filter vn-market check` (tsc) green. (bun tsc --noEmit exit 0)
- [ ] **Live verification (post-rebuild gate):** after ops rebuilds mcp-server, RAW-probe
      `GET http://localhost:3000/api/indicator-gauges` returns 200 with the DTO; cross-check
      each section against the corresponding live MCP tool output; load
      `dashboard.indicator-gauges.tsx` and confirm the 6 cards render real data where
      available + honest-NULL where accruing (breadth gray today).
- [ ] Coverage-map closes: `docs/data/frontend-data-coverage-map.json` 5 `indicator-gauges`
      rows flip `status: "GAP"` → `"OK"` with `asof` populated (post-live).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts` [NEW — handler + types + 5 section builders + IndicatorGaugesDeps]
  - `apps/mcp-server/src/interface/mcp/server.ts` [+import + dispatch block GET /api/indicator-gauges]
  - `apps/mcp-server/src/__tests__/IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts` [NEW — 35 tests]
  - `docs/architecture/microservice/mcp-server/testing.md` [REST Endpoint Handlers section added]
- **Tests written:** `IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts` — 35 assertions, GREEN (96 expect() calls)
- **Git commits:** 08a27cca feat(IND-P1-MCP-REST-GAUGES-ENDPOINT) | adc3eec0 chore(memory)
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test (new file):** 35 pass / 0 fail
- **bun test (full suite):** 14033 tests / exit 0 (known Bun JIT/C++ crash post-summary — NOT a code failure)
- **Tool count:** 182 tools — unchanged (REST endpoint, not MCP tool)
- **Scheduler count:** 3 cron.schedule entries — unchanged (no scheduler changes)
- **Docs updated:** `docs/architecture/microservice/mcp-server/testing.md` — REST Endpoint Handlers section
- **Graphify:** skipped (docs/architecture/ section was incremental table update, no graph topology change)
- **Simplicity gate:** PASS — Q1 scope clean, Q2 section builders justified by codebase pattern + readability (same as macroRegimeHandler), Q3 senior-test clean, Q4 ratio <50% overhead

**Design decisions:**
- `IndicatorGaugesDeps`: all 5 source functions injectable — enables 35 tests with zero real HTTP or DB calls.
- `foreign_room.tickers[]`: explicitly excluded; projection maps only `.market.market_saturation_pct` + `.market.foreign_outflow_z_5d` + top-level `.as_of_date`.
- `liquidity.source_tier`: endpoint-assigned — 2 when `policy_rates.is_estimate=false` (live SBV), 3 when `is_estimate=true` (DB fallback). NEVER omitted.
- `breadth`: returns `null` when `getBreadthThrust` returns `{error}` (NFR-BR-3 — history accruing).
- `volatility.null_reason`: synthesized from `history_sessions` when `rv_20d_percentile` is null.

**REBUILD REQUIRED:** ops must rebuild mcp-server before QA can live-verify the endpoint.

---

## References

- Frontend DTO SSOT: `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` (interfaces L45-133)
- Proxy + documented shape: `apps/frontend/app/routes/api.indicator-gauges.tsx` (header L13-34)
- Coverage-map GAP rows: `docs/data/frontend-data-coverage-map.json` (5 `indicator-gauges` entries)
- REST pattern to mirror: `routes/macroRegimeHandler.ts`, `routes/newsSentimentHandler.ts` + dispatch in `server.ts`
- Roadmap: `docs/roadmaps/vn-market-indicator-roadmap.md`
- Honest-NULL standing rule: memory `project_frontend_freshness_transparency`, `feedback_no_fake_data_real_fetch`
