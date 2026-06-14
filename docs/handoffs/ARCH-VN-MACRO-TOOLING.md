---
task_id: ARCH-VN-MACRO-TOOLING
sprint: VN-MACRO-TOOLING
status: READY
author: architect
created_at: 2026-06-14
handoff_to: pm
ba_spec: docs/REQ_VN-MACRO-TOOLING.md
---

# [Architect] Brownfield Findings — VN-MACRO-TOOLING

## Zone

**Multi-zone — PM must split into per-zone subtasks.**

| Zone | Path | Language | Role |
|---|---|---|---|
| **Zone D** | `apps/macro-indicators/pkg/infrastructure/` | Go | VPS proxy wrapper `vpsFetch` — new shared egress; FIRST, no deps |
| **Zone A** | `apps/macro-indicators/` | Go, :5004 | 5 new HTTP endpoints + domain logic + use-cases |
| **Zone B** | `apps/mcp-server/src/interface/mcp/tools/macro/` | TypeScript | 5 new MCP handlers + VMT-7 registration |
| **Zone C** | `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` | TypeScript, in-place extend | VMT-6 VIRA/VARA survey_distribution extension |

---

## Zone-Split Rationale

The BA zone-split recommendation (A/B/C/D) is **CONFIRMED with one structural clarification**: Zone D is physically inside Zone A's infrastructure layer but is called out as a separate PM task because it is a strict dependency of all Zone A tool handlers and must land first (parallel to ops-vps-fetch probes). Dev cannot write any parser handler in Zone A until Zone D's `vpsFetch` wrapper is in place. Naming it Zone D preserves the dependency ordering that PM needs to enforce.

### Confirmed rationale per zone

**Zone D (vpsFetch wrapper, `apps/macro-indicators/pkg/infrastructure/`):**
The existing infrastructure layer already has the Go fetcher-adapter pattern (see `HTTPCommodityFetcher`, `SBVRateSQLiteAdapter` in `repositories.go`). The VPS proxy pattern in mcp-server uses `VPS_HOST=125.212.251.27` and `VPS_PUSH_API_KEY` env vars, but this is a push-inbound pattern for BCTC PDF fetch. The new macro vpsFetch is an outbound proxy path: the macro-indicators Go service must route all VN-source HTTP calls through the Vinahost VPS HTTP proxy. This is a new Go infrastructure adapter, distinct from the TS push-handler pattern. Zone D must be standalone with no deps — any Zone A handler file that needs to fetch GSO/Customs/SBV will import it from the same `pkg/infrastructure` package.

**Zone A (`apps/macro-indicators/`, Go):**
The macro-indicators service is a live Go service at :5004 using chi router. The existing router pattern (`router.go`, `handlers_external.go`) is: `NewRouter(useCase, logger)` returning a chi router; each route calls a handler closure that takes the use-case. All new VMT-1..5 endpoints follow this exact pattern. Domain logic for processing-margin, FX-incidence, CPI-peak, retail-real, SJC-gap, negative-margin-trap lives in Go because: (a) it is pure computation (DDD: domain layer, zero infra imports), (b) it is served as an HTTP endpoint consumed by Zone B MCP tools, and (c) Go math on Go structs avoids cross-language serialization for mid-computation state. Application-layer use-cases orchestrate fan-out to multiple vpsFetch calls + transform computation.

**Zone B (`apps/mcp-server/src/interface/mcp/tools/macro/`, TypeScript):**
The existing `macroTools.ts` + `macroHttpClient.ts` pattern is the exact reference: `getMacroBaseUrl()` reads `MACRO_INDICATORS_URL` env var, handler calls `fetch(url, {method:"POST"})`, returns JSON wrapped in `{content:[{type:"text",text:JSON.stringify(...)}]}`. All 5 new MCP handlers follow this pattern verbatim. Zone B owns only the MCP interface surface; no domain logic, no fetching of VN sources — 100% proxy to Zone A endpoints.

**Zone C (`creditFlowTools.ts`, in-place extend):**
The existing `getCreditFlowSignalHandler` (L104) already has `mortgageIsEstimate`, `yoyIsEstimate` provenance flags and `static_seed` comments correctly placed. Zone C adds a `survey_distribution` field to the OUTPUT of the existing handler. The VIRA/VARA fetch (if source confirmed) goes in `apps/mcp-server/src/infrastructure/fetchers/` (TS infrastructure layer), not inside the handler — handler stays interface-only.

---

## Verified Paths

### Zone D — New file
- `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` — **CREATE**
  - `VpsFetch(ctx context.Context, url string, opts VpsFetchOptions) ([]byte, error)` — port function + adapter
  - `VpsFetchOptions{TimeoutSec int, BrowserUA bool, AcceptHeader string}`
  - Routes through `http://VPS_HOST:VPS_PORT` configured from env vars `VPS_HTTP_HOST` (default `125.212.251.27`) and `VPS_HTTP_PORT` (default `3128` — standard squid/proxy port; confirm with ops-vps-fetch probe). **TLS hardening: `--cacert` pattern from memory `project_bctc_hnx_ssl_outage` must be applied for HTTPS targets via the proxy — set `InsecureSkipVerify: false`, pin cacert path from `VPS_CACERT_PATH` env var.**
  - `VpsFetchPort` interface in `pkg/domain/ports.go` (new port definition) — domain defines the contract, infra implements. Composition root wires in `cmd/server/main.go`.

### Zone A — Existing files to MODIFY
- `apps/macro-indicators/pkg/interface/http/router.go` — add 5 routes:
  ```
  r.Post("/trade-balance", handleTradeBalance(ucTradeBalance, logger))
  r.Post("/bop", handleBOP(ucBOP, logger))
  r.Post("/macro-indicators-vn", handleMacroIndicatorsVN(ucMacroInd, logger))
  r.Post("/cpi-components", handleCPIComponents(ucCPI, logger))
  r.Post("/liquidity-state", handleLiquidityState(ucLiquidity, logger))
  ```
  Note: `NewRouter` signature must accept the 5 new use-cases. Alternatively use a `Config` struct to avoid arity explosion — see Design Decisions below.
- `apps/macro-indicators/cmd/server/main.go` — wire 5 new use-case constructors + new `VpsFetchPort` adapter injection

### Zone A — New files to CREATE
- `apps/macro-indicators/pkg/interface/http/handlers_vmt.go` — all 5 route handlers (VMT-1..5 request decode → use-case call → JSON encode)
- `apps/macro-indicators/pkg/application/usecases_vmt.go` — 5 use-case structs + `Execute()` methods (orchestrate vpsFetch fan-out + transform; call domain services)
- `apps/macro-indicators/pkg/application/dtos_vmt.go` — request/response DTOs for all 5 use-cases (load-bearing field names per BA spec FR-2 schemas)
- `apps/macro-indicators/pkg/domain/models_vmt.go` — new domain models: `TradeBalance`, `BOP`, `MacroIndicators`, `CPIComponents`, `LiquidityState` + all embedded types
- `apps/macro-indicators/pkg/domain/services_vmt.go` — domain service functions: `ComputeProcessingMargin`, `ComputeFXIncidence`, `ComputeCPIPeaked`, `ComputeRetailSalesReal`, `ComputeSJCGap`, `ComputeNegativeMarginTrap`, `ComputeFXCoupling`, `ApplyTransform` (MA3/MA5/YoY/YTD-cumulative)
- `apps/macro-indicators/pkg/infrastructure/parsers_vmt.go` — source-specific parsers: one per data source (Customs, GSO, SBV-BOP, SBV-interbank, SBV-OMO). **PARSERS ARE GATED: each parser file MUST NOT be written until the ops-vps-fetch probe for that source returns a live payload sample.**
- `apps/macro-indicators/pkg/infrastructure/cache_vmt.go` — per-endpoint staleness-gated SQLite cache (same pattern as existing `SBVRateSQLiteAdapter`): read last-known row by period + freshness check; write on successful fetch.

### Zone A — New test files
- `apps/macro-indicators/pkg/domain/services_vmt_test.go` — unit tests for all domain service pure functions (table-driven; no infra deps)
- `apps/macro-indicators/pkg/application/usecases_vmt_test.go` — unit tests with mock `VpsFetchPort` (fixture JSON payloads from confirmed live probes)
- `apps/macro-indicators/pkg/interface/http/handlers_vmt_contract_test.go` — contract tests (mirrors `handlers_snapshot_contract_test.go` pattern)

### Zone B — New files to CREATE
- `apps/mcp-server/src/interface/mcp/tools/macro/tradeBalanceTools.ts` — `registerTradeBalanceTool(server)` → POST `/trade-balance` to macro-indicators
- `apps/mcp-server/src/interface/mcp/tools/macro/bopTools.ts` — `registerBopTool(server)` → POST `/bop`
- `apps/mcp-server/src/interface/mcp/tools/macro/macroIndicatorsVnTools.ts` — `registerMacroIndicatorsVnTool(server)` → POST `/macro-indicators-vn`
- `apps/mcp-server/src/interface/mcp/tools/macro/cpiComponentsTools.ts` — `registerCpiComponentsTool(server)` → POST `/cpi-components`
- `apps/mcp-server/src/interface/mcp/tools/macro/liquidityStateTools.ts` — `registerLiquidityStateTool(server)` → POST `/liquidity-state`

### Zone B — Existing files to MODIFY
- `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` — add exports for 5 new files (extend http-proxy barrel)
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add `registerTradeBalanceTool`, `registerBopTool`, `registerMacroIndicatorsVnTool`, `registerCpiComponentsTool`, `registerLiquidityStateTool` imports + calls (VMT-7)

### Zone C — Existing file to MODIFY
- `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` — add `survey_distribution` field to `getCreditFlowSignalHandler` output; add `fetchViraSurvey()` call (returns null if source not found); no changes to existing `mortgageIsEstimate` / `yoyIsEstimate` / `static_seed` flags

### Zone C — New file (if VIRA/VARA source confirmed)
- `apps/mcp-server/src/infrastructure/fetchers/viraSurveyFetcher.ts` — infrastructure fetch + parse for VIRA/VARA survey page (NOT geo-blocked; TS infrastructure layer)

---

## Design Decisions

### DD-1: `NewRouter` signature evolution — use Config struct

The current `NewRouter(useCase *application.ComputeMacroUseCase, logger *slog.Logger)` takes 2 args. Adding 5 new use-cases would make the signature `NewRouter(uc0, uc1, uc2, uc3, uc4, uc5, logger)` — a footgun for positional arg confusion. **Decision: introduce `RouterConfig` struct** in router.go:

```go
type RouterConfig struct {
  Snapshot       *application.ComputeMacroUseCase
  TradeBalance   *application.TradeBalanceUseCase
  BOP            *application.BOPUseCase
  MacroIndicators *application.MacroIndicatorsVNUseCase
  CPIComponents  *application.CPIComponentsUseCase
  LiquidityState *application.LiquidityStateUseCase
  Logger         *slog.Logger
}

func NewRouter(cfg RouterConfig) chi.Router { ... }
```

Existing callers in `cmd/server/main.go` update to named-field struct initialization — no API surface change visible externally; chi router is an internal concern.

### DD-2: VpsFetch as domain port, not free function

`vpsFetch` must be injected as a domain port (interface in `pkg/domain/ports.go`) rather than a direct function import from `pkg/infrastructure`. Reason: domain services (`services_vmt.go`) must have zero imports from `pkg/infrastructure` (DDD Fence-A, as noted in existing `ports.go` header). Use-cases receive `VpsFetchPort` via constructor injection. Composition root in `cmd/server/main.go` (already the only file importing `pkg/infrastructure`) wires the concrete `vpsFetch.go` adapter.

### DD-3: Cache in infrastructure as SQLite adapter (not in-memory)

New VMT tools require staleness-gated response caching (TTL 6h–24h per tool). Decision: SQLite cache table `macro_vmt_cache` (columns: `endpoint TEXT, period TEXT, fetched_at TEXT, payload BLOB`) in the shared `market.db`. Adapter pattern mirrors `SBVRateSQLiteAdapter`. Cache read happens before vpsFetch; cache write after successful parse. Avoids in-memory map (lost on restart) and avoids a separate Redis/cache service.

### DD-4: MCP handler endpoint path is `/macro-indicators-vn`

The BA spec says GET/POST `/macro-indicators` but this would shadow the intent of the existing `/snapshot` conceptually and could cause endpoint confusion. The bare name `/macro-indicators` is too generic. **Decision: use `/macro-indicators-vn`** in the Go service. The MCP tool name remains `get_vn_macro_indicators` (the bare name is the tool identifier, not the HTTP path). Both must be documented in the same commit.

### DD-5: retail_sales_real derived in domain, not application

`retail_sales_real = nominal / (1 + cpi_yoy/100)` crosses two tool boundaries (requires CPI from `get_cpi_components`). Decision: the application use-case for `MacroIndicatorsVN` calls BOTH the GSO macro-indicators fetch AND the GSO CPI fetch via `VpsFetchPort`. The domain service `ComputeRetailSalesReal(nominal, cpiYoY float64) (real float64, isEstimate bool)` remains pure. When CPI is unavailable, `isEstimate=true` on the `retail_sales_real` series only (not the whole response). The CPI tool (VMT-4) is a separate tool with its own endpoint; the GSO fetch in VMT-3's use-case calls the CPI parser inline (not the VMT-4 HTTP endpoint — avoid internal HTTP loop).

### DD-6: IRS rate — defer to `is_estimate=true` fallback immediately

BLOCKER-5 asks whether HNX publishes IRS quotes machine-readably. Given HNX TLS history (memory `project_bctc_hnx_ssl_outage`: incomplete chain, required `-k curl` workaround), IRS quote availability is uncertain. **Decision: implement `irs.is_estimate=true` as the default path.** The field is present in the output schema (skill switch-on requires it to exist but does not require it to be live). If the ops-vps-fetch probe confirms an HNX IRS URL, the parser can be added in a follow-up ticket without a schema change.

### DD-7: SJC gap — reuse existing crawler, no new Zone A fetch

The SJC crawler already exists in mcp-server (TS side). The SJC price in VND is already fetched. The gap computation (`sjc_price_mn_vnd - world_price_mn_vnd`) is a pure math operation in the Go domain layer using inputs: (a) sjc_price read from the shared `market.db` SJC table (SQLite adapter, no new fetch), (b) world_gold_usd from existing commodity_prices table, (c) usd_vnd from existing sbv_rates table. **Decision: no new SJC crawl in Zone A.** Domain service `ComputeSJCGap(sjcVND, worldGoldUSD, usdVND float64) float64` is pure. The liquidity-state use-case reads all three inputs via SQLite adapters (existing pattern).

---

## Blocker Design Resolutions

### BLOCKER-1 — FDI-bloc vs domestic-bloc trade split (VMT-1 gate)

**Resolution: DESIGN DECISION (architect), then ops-vps-fetch probe to confirm source feasibility.**

The FDI/domestic bloc split in Vietnam's Customs data is NOT a direct column. Customs (Tổng cục Hải quan) publishes trade statistics broken down by enterprise type (doanh nghiệp FDI vs. doanh nghiệp nội địa) in their monthly statistical reports. This is a two-series cross-join: (a) total trade by HS group (main Customs page), (b) trade by enterprise type (a secondary report page on the same Customs portal). Design resolution:

- Parser must join two table reads from the same Customs VPS response or two sequential vpsFetch calls to the Customs monthly stats pages.
- If the Customs site does NOT publish the enterprise-type breakdown in a machine-readable table (possible: some breakdowns are PDF-only), the FDI-bloc split falls back to: use GSO monthly report FDI-attributed export data (GSO publishes the FDI sector's export contribution separately) cross-joined with total Customs figures. This is a 2-source join, NOT a direct column.
- `bloc_split.fdi.is_estimate` and `bloc_split.domestic.is_estimate` are set honestly: `false` only when the enterprise-type breakdown is live from the source; `true` when derived via cross-join estimate.

**Ops-vps-fetch probe required:** Dev must fetch `https://www.customs.gov.vn/` (VPS-routed) and locate the enterprise-type breakdown table in the monthly stats. Probe output must capture: URL of the breakdown page, table column headers, whether data is HTML or Excel. Until probe returns, Zone A parser for `bloc_split` MUST default to `is_estimate=true` with null values.

**VMT-1 gate:** Yes — this blocker gates the `bloc_split` sub-field of VMT-1. The `total` and `hs_attribution` sub-fields are NOT gated (Customs total trade table is well-known machine-readable HTML); dev can implement those in parallel.

### BLOCKER-2 — SBV BOP format (VMT-2 gate)

**Resolution: ops-vps-fetch probe FIRST; architect decides parse path after probe.**

The SBV BOP page (`https://www.sbv.gov.vn/`) is known to publish data in multiple formats depending on the report type. Two paths:

**Path A (preferred): Excel download** — SBV publishes quarterly BOP data as Excel (`.xlsx`) in Vietnamese. If confirmed, the Go infra layer must parse Excel. Go does not have a stdlib Excel parser; options are: (a) `github.com/qax-os/excelize` (maintained, no CGO — compatible with modernc.org/sqlite DI pattern), (b) delegate Excel parse to the existing `pdf-extractor` Python service via HTTP if that service has been extended for Excel. **Decision: use `excelize` in Go if probe confirms Excel format. Do NOT call `pdf-extractor` for Excel — keep parse latency in the Go service itself.**

**Path B: PDF** — if SBV BOP is PDF-only, the Go handler must proxy the PDF bytes to `apps/pdf-extractor` (Python, port 8765 on VPS based on memory `reference_pdf_ocr_vps_architecture`) and parse the extracted text. This adds an async hop and introduces latency. **Decision: if PDF path is required, implement as a two-step vpsFetch (download PDF) + HTTP call to pdf-extractor on VPS, with a 30s timeout and `is_estimate=true` on fields that fail parse.**

**E&O sign convention:** SBV historically uses IMF BPM6 sign convention (E&O is a residual — positive means unexplained inflows, negative means unexplained outflows). The probe must confirm this or flag reversal. The domain discriminator logic (`FDI_BENIGN` when `errors_omissions_bn_usd < -1.0`) assumes BPM6 convention. If SBV uses the opposite sign, the discriminator threshold flips to `> +1.0`. **This is a hard blocker for the FX-incidence discriminator — do not hardcode the sign until the probe confirms.**

**VMT-2 gate:** Full gate. The probe must return before the BOP parser is written. The use-case scaffolding (DTOs, routing, handler skeleton) can be written in parallel.

### BLOCKER-3 — GSO monthly report format (VMT-3 gate)

**Resolution: ops-vps-fetch probe; PMI NOT gated (not geo-blocked).**

GSO (`https://www.gso.gov.vn/`) publishes monthly socio-economic data via:
- Press release HTML page (`bai-viet/` path) with embedded tables
- Separate Excel download link (`/documents/` path) on the same press release

The key question is whether IIP, retail, public-investment, and FDI are all on ONE press-release page or split across multiple. Based on GSO's historical format, they are typically all in one monthly `"Tình hình kinh tế – xã hội"` press release with multiple embedded HTML tables — but the URL and table structure vary monthly.

**Decision: probe the most recent GSO monthly release URL. If HTML tables are consistent (same table IDs / ordering) month-to-month, write a CSS-selector-based parser. If not, prefer the Excel download path (more stable column structure).** The parser MUST be driven by a config map (column indices / table positions) read from a JSON config file, NOT hardcoded offsets.

**PMI is not geo-blocked:** S&P Global PMI press page (`https://www.pmi.spglobal.com/` or `https://www.spglobal.com/market-intelligence/`) is globally accessible. Dev can probe and write the PMI parser from the main-server (no VPS needed). This can proceed in parallel with GSO VPS probing.

**VMT-3 gate:** GSO-sourced indicators (IIP, retail, public-investment, FDI) are gated. PMI is NOT gated — dev can implement PMI series first.

### BLOCKER-4 — GSO CPI basket format (VMT-4 gate)

**Resolution: ops-vps-fetch probe (same VPS call as BLOCKER-3, may reuse the same GSO press-release page).**

GSO publishes CPI as part of the same monthly socio-economic press release that covers IIP/retail/FDI (BLOCKER-3). The 11-basket breakdown with individual weights is in a dedicated table within that same release page. **The BLOCKER-3 and BLOCKER-4 probes can be merged into a single ops-vps-fetch task** (one probe call to GSO monthly page answers both). The probe must confirm: (a) basket names in Vietnamese (they are stable but need to be mapped to English keys), (b) whether weights (trọng số) are in the table or require a separate CPI methodology PDF.

**VMT-4 gate:** Full gate for basket-level data. The `overall_cpi` (headline) field may appear in a different table position than the basket breakdown — probe must confirm both are in the same HTML page.

### BLOCKER-5 — SBV interbank + OMO + IRS (VMT-5 gate)

**Resolution: ops-vps-fetch probe for interbank + OMO. IRS deferred by design.**

SBV publishes:
- Interbank rates: `https://www.sbv.gov.vn/webcenter/portal/en/home/rm/ir` or equivalent Vietnamese-language rates page — daily fixing by tenor
- OMO auction results: separate page or section on the SBV site

Probe must confirm: (a) 1-week tenor is explicitly labeled in the tenor grid (not derived), (b) OMO net outstanding is stated directly or must be summed from individual auction add/drain entries.

**IRS (Interest Rate Swap) decision:** HNX publishes limited OTC derivative data. The IRS market in Vietnam is OTC and not consistently machine-readable. **Decision as stated in DD-6: `irs.is_estimate=true` permanently until a confirmed machine-readable URL is found.** Do NOT block VMT-5 on IRS resolution. The field exists in the schema, returns `rate_1y_pct: null, is_estimate: true`. This is correct and honest per GA-4.

**VMT-5 gate:** Interbank + OMO fields are gated on probe. Policy rates (refi_rate, discount_rate) are likely already in the existing `sbv_rates` DB table (the current `SBVRateSQLiteAdapter` reads this) — these are NOT gated; they can be surfaced immediately from the existing DB. SJC gap and fx_coupling are NOT gated (existing data sources, DD-7 confirmed).

### BLOCKER-6 — VIRA/VARA machine-readable URL (VMT-6 design)

**Resolution: ACCEPT IS_ESTIMATE DEGRADED MODE. No manual-input PUT endpoint.**

Decision rationale:
- VIRA and VARA are research bodies that publish survey results primarily in Vietnamese financial media (VnExpress Finance, CafeF, Tài chính doanh nghiệp). No stable machine-readable API or consistent URL pattern is known.
- A PUT `/vira-survey-data` manual-input endpoint would require a separate authenticated endpoint, documentation, and a workflow for the user to update it — this is scope beyond what the BA spec warrants.
- The correct response is: `survey_distribution: { is_estimate: true, note: "VIRA/VARA no machine-readable source confirmed — manual data required" }`.
- **If** a live VPS probe by the dev (as part of the BLOCKER probing phase) finds a confirmed machine-readable URL, the dev reports back to PO who opens a follow-up ticket for the fetcher. The VMT-6 task itself ships with `is_estimate=true` as the accepted degraded state.
- The existing `static_seed` masquerade on `reCreditRatioPct: 20/19` and `yoyGrowthPct: ±15` MUST remain flagged with `is_estimate=true` as they currently are — BLOCKER-6 resolution does NOT remove these flags.

**VMT-6 gate:** NOT gated on BLOCKER-6. VMT-6 can proceed immediately in Zone C: add `survey_distribution: null` with honest `is_estimate: true` note to the existing handler output. The VIRA/VARA source can be wired later without a schema change.

---

## DDD Risk Review

### Zone D (vpsFetch wrapper) — Risk: LOW

- New Go adapter follows identical DDD pattern as existing `SBVRateSQLiteAdapter` (infrastructure adapter, implements domain port).
- Domain port interface in `pkg/domain/ports.go` — zero infra import from domain. Fence-A preserved.
- Only `cmd/server/main.go` wires the concrete adapter (Fence-C: only composition root imports `pkg/infrastructure`).
- No business logic in the adapter — pure HTTP proxy routing.
- TLS risk: mitigated by `VPS_CACERT_PATH` env var + `--cacert` pattern (not `-k`).
- **Recurring-bug risk on this module is LOW** — the adapter is small (< 60L) and structurally identical to existing adapters.

### Zone A (Go domain + application + handlers) — Risk: MED

- Five new use-cases + domain service + handler files in the same `pkg/` tree. Each use-case adds a new constructor that must be wired in `cmd/server/main.go` — arity creep. **Mitigation: RouterConfig struct (DD-1) keeps wiring explicit and named.**
- Processing-margin division-by-zero trap (BA spec noted): `import_bn_usd = 0` edge case must be guarded in `ComputeProcessingMargin`. Domain test must cover this explicitly. **Risk of silent division by zero in Go: MED.** Mitigation: unit test with zero-denominator case; function returns `(nil, true)` (isEstimate).
- Multi-source fan-out in use-cases (VMT-3 uses 3 sources: GSO-macro, GSO-CPI, S&P PMI) — if one fails, partial result must not silently drop the other series. Application layer must use `errgroup` or sequential fetch with per-series error tracking. **Risk of silent partial data: MED.** Mitigation: per-series `is_estimate=true` on the failed series; remaining series return normally.
- Parser files are the highest-risk surface — parsers written from schema comments (not live payloads) are class-F1 fails (memory: `feedback_contract_from_live_payload_not_schema_comment`). **Hard mitigation: parsers MUST NOT be committed before the ops-vps-fetch probe payload is in `scripts/probes/vmt-<n>-sample.json`.** PM enforces this as a pre-merge gate per parser file.
- SQLite cache uses `market.db` shared volume — write pattern must be atomic (temp file + rename, as per `feedback_jq_empty_guard_clobbers_ssot`). Go: use `database/sql` `BEGIN`/`COMMIT` transaction for the cache write. No raw file writes.
- **Recurring-bug watch:** Zone A has 5 new use-case + handler pairs. If 2+ commits touch the same `handlers_vmt.go` or `usecases_vmt.go` file for bug fixes, **PM must escalate to architect before a 3rd fix** (memory: `feedback_recurring_bug_escalation`).

### Zone B (TS MCP handlers) — Risk: LOW

- Each handler is a thin HTTP proxy — identical pattern to existing `macroTools.ts`. No domain logic.
- 5 new files, each < 80L. Registry extension is additive (import + one function call).
- `tsc --noEmit` must pass after addition (VMT-7 NFR-1 parity gate). Zod schema must match FR-1 input contract exactly.
- Risk of field-name drift between Zone A DTOs and Zone B Zod schema: **MED** if not reviewed together. Mitigation: PM assigns Zone A + Zone B to the same dev pair for each tool so the TS Zod schema is written after the Go DTO is committed and stable.

### Zone C (creditFlowTools.ts extend) — Risk: LOW

- In-place extend: one new output field, existing fields untouched.
- Risk: accidentally removing or overwriting the `mortgageIsEstimate` / `yoyIsEstimate` / `static_seed` flags. **Mitigation: PR diff review gate — any diff that removes `is_estimate=true` on the existing fields is a regression blocker.**
- VIRA/VARA fetcher (if added later) goes in `apps/mcp-server/src/infrastructure/fetchers/` — NOT inside the handler. If a dev puts fetch logic directly in the handler file, that is a DDD violation (interface layer must not contain infra fetch logic).

---

## BUILD-STANDARD Classification

```
NEW FEATURE (apps/macro-indicators/ and apps/mcp-server/ already exist)
→ BUILD-STANDARD: lean
→ BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
→ NOTE: dev-macro-indicators (Zone A/D) + dev-mcp-server (Zone B/C) drive end-to-end per zone
  dev-vps-crawls (probe + parser review) is co-owner, not lead
```

---

## Ops-VPS-Fetch Probe Dispatch Plan

**Recommendation: fan out ALL probes as the FIRST execution step, before any parser code is written.**

PM should dispatch the following probe tasks to ops (or dev-vps-crawls) in PARALLEL with Zone D implementation:

| Probe ID | Target | VPS required | Answers | Gates |
|---|---|---|---|---|
| PROBE-1 | `https://www.customs.gov.vn/` monthly stats + enterprise-type breakdown | Yes | BLOCKER-1: FDI-bloc column structure | VMT-1 `bloc_split` parser |
| PROBE-2 | `https://www.sbv.gov.vn/` BOP quarterly publication | Yes | BLOCKER-2: PDF vs Excel, E&O sign, table structure | VMT-2 full parser |
| PROBE-3 | `https://www.gso.gov.vn/` most recent monthly socio-economic release | Yes | BLOCKER-3+4: IIP/retail/FDI table structure + 11-basket CPI table | VMT-3 GSO parser + VMT-4 full parser |
| PROBE-4 | `https://www.sbv.gov.vn/` interbank rate + OMO auction pages | Yes | BLOCKER-5: 1w tenor explicit, OMO net outstanding | VMT-5 interbank+OMO parser |
| PROBE-5 | S&P Global VN PMI press page | No (not geo-blocked) | PMI release URL + table format | VMT-3 PMI parser (not gated on VPS) |

**Script persistence rule:** Each probe script that fetches and saves the live payload MUST be saved to `scripts/probes/vmt-probe-<N>.sh` (or `.ts`). Payload sample saved to `scripts/probes/vmt-<N>-sample.json` (or `.html`). Both files committed before the parser is written. This is the enforcement mechanism for GA-7.

---

## Execution Order

```
[PARALLEL FIRST WAVE — no blocking deps]
  Zone D: vpsFetch Go adapter + VpsFetchPort interface
  PROBE-1..5: ops-vps-fetch probes (all 5 in parallel)
  Zone C: VMT-6 survey_distribution stub (is_estimate=true, no source probe needed)
  Zone B: MCP handler stubs (return 503 until Zone A endpoints exist — skeleton only)

[SECOND WAVE — after PROBE-3+4 return]
  Zone A VMT-3 (GSO path) + VMT-4 (CPI): share same GSO probe output
  Zone A VMT-3 (PMI path) in parallel (PROBE-5 independent, likely faster)

[THIRD WAVE — after PROBE-1 returns]
  Zone A VMT-1: trade-balance (total + hs_attribution first; bloc_split waits for PROBE-1 confirmation)

[FOURTH WAVE — after PROBE-2 returns and format confirmed]
  Zone A VMT-2: BOP (may require excelize dep add to go.mod — check license + CGO-free status)

[FIFTH WAVE — after PROBE-4 returns]
  Zone A VMT-5: liquidity-state (SJC + fx_coupling + policy_rates can proceed NOW; interbank+OMO wait for PROBE-4)

[SIXTH WAVE — after all 5 Zone A endpoints return 200]
  Zone B: wire all 5 MCP handler stubs to live Zone A endpoints
  Zone B VMT-7: registry addition + gateway discoverability test

[FINAL GATE — VMT-7 acceptance]
  QA: live call_tool to each tool; confirm all load-bearing fields present and non-null
  Skill switch-on verification: macro-health-read + trade-fx-pressure-decomp flip is_estimate=false
```

---

## Scan Clean

- No existing Zone A endpoint conflicts with the 5 new routes (`/trade-balance`, `/bop`, `/macro-indicators-vn`, `/cpi-components`, `/liquidity-state` are all new paths; no shadowing of `/snapshot`, `/external`, `/health`, `/macro-calendar`).
- No existing Zone B tool name conflicts: `get_vn_trade_balance`, `get_vn_bop`, `get_vn_macro_indicators`, `get_cpi_components`, `get_vn_liquidity_state` are all new bare names (confirmed: none appear in registry.ts).
- Zone C: `getCreditFlowSignalHandler` exists and is exported — extend only; no rename, no new registration needed.
- Zone D: `VpsFetch` name does not conflict with any existing Go symbol in `pkg/infrastructure/` or `pkg/domain/`.
- `go.mod` module name: `github.com/vn-market-intelligence/macro-indicators` — all new Go package paths must use this prefix.
- `excelize` dependency (if BOP format is Excel): must be CGO-free to stay compatible with `modernc.org/sqlite` build chain. `github.com/qax-os/excelize` v2 is pure Go — **approved for go.mod addition if probe confirms Excel format.** Confirm with `go get github.com/qax-os/excelize/v2` after probe result; do not add to go.mod speculatively.

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/ARCH-VN-MACRO-TOOLING.md
ZONE: multi (Zone A: apps/macro-indicators/ | Zone B: apps/mcp-server/src/interface/mcp/tools/macro/ | Zone C: apps/mcp-server/src/interface/mcp/tools/sector/ | Zone D: apps/macro-indicators/pkg/infrastructure/)
NEXT: pm | break into per-zone atomic dev tasks; enforce probe-gate before parser commits
HANDOFF: docs/handoffs/ARCH-VN-MACRO-TOOLING.md
PIPELINE: continue
```
