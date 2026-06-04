# Task Report: DATA-SERVE-INTEGRITY — QA Live-Verify Gate

**QA agent:** qa  
**Date:** 2026-06-04T19:58Z  
**Sprint:** DATA-SERVE-INTEGRITY  
**Commits in scope:** a6b86ed0 (SLA guard), fb7e16d0 (macro carry/regime gating), 45a35641 (stock-price DTO), b16d6a89 (frontend types), 2873b6c3 (sector/fin fixtures)  
**Deploy:** mcp-server rebuilt + healthy (:3000 toolCount=160), macro-indicators running+healthy (:5004), frontend rebuilt+healthy (:3001). stock-price container NOT running.

---

## PART A — CARRY SPREAD / REGIME (user's core complaint)

**Verdict: PASS (complaint resolved — no fabricated regime emitted)**

Live call: `POST http://localhost:5004/snapshot` (macro-indicators Go service, which is the direct serve path for `get_macro_snapshot`).

**Actual served values:**

```json
"carry": {
  "regime": "UNKNOWN",
  "carrySpread": null,
  "vndDepositRate": 5,
  "fedFundsRate": 5.33,
  "reasoning": "Carry inputs unavailable — one or more rates are estimated from fixture fallback; regime suppressed per DSI-INV-1",
  "computedAt": "2026-06-04T19:55:06Z",
  "is_estimate": true,
  "source_tier": 4,
  "fetched_at_source": "2026-05-28T00:00:00Z"
},
"dataSource": "estimate"
```

**Analysis:**

- `fedFundsRate = 5.33` — this IS the fixture fallback value. The EFFR DB row date is `2026-05-28`, which is 188 hours ago, exceeding the 96h staleness bound. `GetFedFundsRate()` therefore returns `(0, nil)` → `resolveFedFundsRate()` falls back to `fixtureFedFundsRate=5.33`, sets `fedFundsLive=false`.
- FR-MAC-1 gate fires: `carryInputsLive = fedFundsLive(false) && vndDepositLive = false`. `buildCarryDTO(isEstimate=true)` → `regime="UNKNOWN"`, `carrySpread=nil` (JSON: `null`), `is_estimate=true`, `source_tier=4`.
- `fetched_at_source = "2026-05-28T00:00:00Z"` — correct FRED MAX(date), NOT time.Now().
- `dataSource = "estimate"` — correct downgrade (not "live").
- **NO FII_OUTFLOW_RISK emitted from fixture arithmetic.** The fabricated carry signal that triggered the user complaint is gone.

**Note on expected spread direction:** When EFFR eventually refreshes from FRED (current live rate ~3.58-3.62%), with SBV deposit ~5.0%, the spread will be +1.4pp → regime would be NEUTRAL (0.5%–2.5% band), not HOT_MONEY_INFLOW or FII_OUTFLOW_RISK. The carry gate will produce an honest signal as soon as FRED data is fresh enough (<96h).

**The central user complaint is resolved.**

---

## PART B — DATA-PROVENANCE CHECKLIST (DSI-S3 sector/fin)

### B-1: get_credit_flow_signal — is_estimate / provenance flags

**Verdict: PASS**

Live response includes:
```
[ƯỚC TÍNH] Tăng trưởng tín dụng YoY: dùng mặc định ±15% — không có dữ liệu NHNN thực.
is_estimate=true, source_tier=4
[static_seed] Tỷ lệ tín dụng BĐS: 20%/19% là hằng số ước tính
```

FR-SEC-1 requirement met: yoyGrowthPct defaults carry `is_estimate=true, source_tier=4`; `reCreditRatioPct` carries `static_seed: true`. Fabricated NHNN statistics are no longer served as bare live numbers.

### B-2: get_bond_maturity_calendar — [SEED DATA] label

**Verdict: PASS**

Live response:
```
[SEED DATA — không xác minh thị trường thực] Dữ liệu minh họa; cơ sở dữ liệu trái phiếu chưa được cập nhật từ nguồn thực.
[GIA HẠN] Novaland JSC (NVL) ... Lãi suất: 10.5%/năm
```

FR-SEC-3 requirement met. `static_seed: true` on all SEED_BONDS entries; `[SEED DATA]` label present in alert message header. Code confirmed at `bondMaturityTracker.ts:60,69,78,87,96,105` and `bondMaturityTools.ts:39`.

### B-3: get_energy_grid_signals — [ƯỚC TÍNH] estimate marker

**Verdict: PASS (label present in prose; signal object carry confirmed in code)**

Live response prose: `"Dữ liệu lưới điện (ước tính):"` and grid figures 40/22/45/85 present.  
Code confirms: `energyTools.ts:76` maps all raw signals as `{ ...s, is_estimate: true, source_tier: 4 }`. The `[ƯỚC TÍNH]` tag is appended in the rendered output at line 106.

FR-SEC-2 requirement met. Signal objects carry `is_estimate=true`, not just prose label.

### B-4: finalizeBctcRefineTool — extractionConfidence null → 0 (not 1)

**Verdict: PASS (code-verified; no safe live call exists without creating a test report)**

Code: `finalizeBctcRefineTool.ts:1039`:
```typescript
extractionConfidence: valSrc.extraction_confidence ?? 0,
```
Was `?? 1` (AC-SEC-5 target). Now `?? 0`. A missing confidence defaults to 0, which is gated by PUB-5 (conf < 0.5 → blocked from MARKET). FR-SEC-5 requirement met.

### B-5: get_bctc_full null roe/netMarginPct — comparison shows N/A

**Verdict: PASS**

Code at `bctcFullTools.ts:230-232`:
```typescript
netMarginPct: row.net_margin_pct ?? null,   // was ?? 0
roe: row.roe ?? null,                        // was ?? 0
debtToEquity: row.debt_to_equity ?? null,    // was ?? 0
```

`buildComparisonSection` at lines 466-468 applies NaN-sentinel guard (ratioChange propagates null→NaN):
```
isNaN(delta.roePP.changePP)
  ? `ROE: ... (N/A — ratio unavailable)`
```

Live FPT call: QoQ/YoY comparison is suppressed with `PUB-7: Period basis mismatch — comparison withheld` (different ground truth). VNM: `"Chỉ có một kỳ báo cáo. Không đủ dữ liệu để so sánh."` (honest). FR-SEC-4 requirement met; no false delta vs synthetic 0.

---

## PART C — TOPOLOGY GAPS

### C-1: macro-indicators Go container — IS RUNNING (HOT LANDMINE)

**Verdict: SCOPE GAP FOUND — escalation required**

`docker ps -a` confirms `vn-market-intelligence-mcp-macro-indicators-1` is Up + healthy at port 5004. This is the LIVE serve path for `get_macro_snapshot` (mcp-server routes via `POST http://macro-indicators:5004/snapshot`).

**Serve path trace:**
1. `get_macro_snapshot` → mcp-server `macroTools.ts:443` → `fetch(${baseUrl}/snapshot)` → macro-indicators :5004
2. macro-indicators `main.go:55` wires `CarryYieldInputsSQLiteAdapter` → reads `/app/data/market.db` (shared volume with mcp-server)
3. `GetFedFundsRate()` → `fred_series_daily WHERE series='EFFR'` → row exists (date=2026-05-28, value=3.62) but is 188h old (>96h staleness bound) → returns `(0, nil)` → fixture fallback `5.33`, `fedFundsLive=false`
4. `buildCarryDTO(isEstimate=true)` → `regime="UNKNOWN"`, `carrySpread=null`, `is_estimate=true`, `source_tier=4`

**The Go service IS serving the live path, and the DSI fix IS in the running container code (DSI-INV-1 suppression of carry when fixture).**

**However, the architect's `DSI-MACRO-INDICATORS-LATENT` concern was based on the assumption this container would NOT be running (R-4). It IS running.** The fix in the Go code (DSI-INV-1 carry suppression) is working correctly today. But the Go container was never supposed to be in the active runtime set per `docs/data/system-map.json`.

**R-4 Pre-check outcome:** Container is HOT. BA spec R-4 states: "If it is running, the latent landmine is HOT and dev-macro-indicators must be scheduled immediately." Since the carry suppression IS already implemented in the Go code (committed as part of this sprint), the immediate DSI-INV-1 risk is mitigated. However, a PO decision is needed on whether to:
  - (a) Keep macro-indicators in the runtime set (update system-map.json), or
  - (b) Stop it and route to the TS fallback path

Follow-up task recommendation: `DSI-MACRO-INDICATORS-RUNTIME-DECISION` → route to PO.

**TS fix (mcp-server macroTools.ts `buildCarryProvenance`) is NOT the active path.** The TS functions `buildCarryProvenance` and `computeMacroDataSource` exist in macroTools.ts but are NOT called in the get_macro_snapshot tool handler — that handler delegates entirely to the Go service. Those TS helpers exist for test compatibility only. The Go service is the live carry computation engine.

### C-2: stock-price Go container — NOT RUNNING (DSI-S2-PRICE is latent)

**Verdict: LATENT GAP — DSI-S2-PRICE code is correct but not in live path**

Port 5000 is occupied by Apple AirTunes (403), not the Go stock-price service. The stock-price container does not appear in `docker ps` output.

**Live price serve path today:** `get_market_snapshot` is the active price tool (confirmed via tools/list — no `get_stock_price` tool registered). This routes through `mcp-server`'s own TS fetchers (yahooFinance.ts / tradingeconomics.ts), not the Go stock-price service.

**yahooFinance.ts audit findings (live gap, NOT covered by DSI-S2-PRICE):**
- Per-symbol failures return `null` (safe, not 0) — the calling code in `macroIndicatorRefreshJob.ts` uses the `COALESCE`-style upsert guard (FR-MAC-5 fix in scope). OK.
- `cnyVndRate` is hardcoded `= 0` at line 315, always. Comment at line 53 acknowledges this: "not a valid symbol. cnyVndRate is always stored as 0." No `is_estimate` flag on this field. This is a pre-existing structural gap not in DSI scope.
- Served `get_market_snapshot` response carries `source_tier: 2` but no per-symbol `is_estimate` or `staleness` field. The DSI-S2-PRICE code (Staleness propagation in Go DTO) is correct but inactive since the container is not running.

**UNFIXED LIVE GAP:** The yahooFinance.ts path that actually serves prices today has no `staleness` field, no `is_estimate` per-symbol, and a permanent `cnyVndRate=0` with no provenance label. This is outside DSI-S2-PRICE scope (which targets the Go service). However, per DSI-INV-1, served values without provenance metadata are violations.

Follow-up task recommendation: `DSI-S2-PRICE-TS-GAP` → route to dev-mcp-server. Scope: add `is_estimate` + `staleness` to yahooFinance.ts commodity snapshot output; label `cnyVndRate=0` as `is_estimate:true, source_tier:4`.

---

## Summary Verdict

| Part | Check | Verdict |
|------|-------|---------|
| A | Carry spread / regime (user complaint) | **PASS** — regime=UNKNOWN, carrySpread=null, is_estimate=true. No FII_OUTFLOW_RISK from fixtures. |
| B-1 | creditFlow is_estimate + static_seed | **PASS** |
| B-2 | bondMaturity [SEED DATA] label | **PASS** |
| B-3 | energyGrid [ƯỚC TÍNH] + signal is_estimate | **PASS** |
| B-4 | extractionConfidence null → 0 (not 1) | **PASS** (code) |
| B-5 | BCTC null roe → N/A not false delta | **PASS** (code + live) |
| C-1 | macro-indicators Go container runtime | **SCOPE GAP** — container IS running (not latent); carry suppression works but PO must decide runtime set membership |
| C-2 | stock-price Go container not running | **LATENT GAP** — DSI-S2-PRICE code correct but inactive; yahooFinance.ts live path has no staleness/is_estimate |

**Overall sprint DATA-SERVE-INTEGRITY:** CONDITIONALLY COMPLETE. Parts A+B all pass. Two follow-up tasks needed for router to route to PO.

---

## Follow-up Tasks

1. **DSI-MACRO-INDICATORS-RUNTIME-DECISION** (PO): macro-indicators container is running but not in system-map.json intended runtime set. Decide: keep it (update system-map.json + document) or stop it (ops). The carry suppression DSI-INV-1 fix IS active in the running code so no immediate data integrity risk, but the runtime inconsistency needs resolution.

2. **DSI-S2-PRICE-TS-GAP** (dev-mcp-server, P2): yahooFinance.ts is the live price serve path (stock-price Go container not running). It emits no `staleness` / `is_estimate` per commodity symbol and hardcodes `cnyVndRate=0` with no provenance label — DSI-INV-1 violation in live path. Scope: add provenance fields to commodity snapshot output from yahooFinance.ts.

---

## Orch-State Update

- Sprint DATA-SERVE-INTEGRITY: DONE (Parts A+B verified), with 2 open follow-up tasks escalated to PO.
- head.next_agent: po (for follow-up routing + sprint closeout sign-off)
- head.status: idle
