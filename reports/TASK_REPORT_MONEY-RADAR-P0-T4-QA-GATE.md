# Task Report MONEY-RADAR-P0-T4-QA-GATE

QA terminal Phase-0 gate for sprint MONEY-RADAR-P0. RAW-verified independently against
`docs/architecture-briefs/2026-07-01-money-radar.md` §6. All commands run live by this
agent — no relayed badges.

## Test suites (RAW)

```
cd apps/mcp-server && bun test src/__tests__/MONEY-RADAR-P0-T2-COMPOSITE.test.ts src/__tests__/money-radar-api.test.ts
→ 30 pass / 0 fail / 79 expect() calls

cd apps/frontend && bun test app/__tests__/money-radar-cards.test.ts
→ 39 pass / 0 fail / 88 expect() calls

cd apps/mcp-server && bun tsc --noEmit  → 0 errors (empty output)
cd apps/frontend && bun run typecheck (tsc --noEmit) → 0 errors (empty output)
```

DDD scan (domain→infra/app imports) on the 5 new money-radar source files → 0 hits.
Security scan (`process.env`, password/secret/api-key) → 0 hits. SQL is parameterized
(`sqlInClause` + bound `.all(...codes)` / `.run(sessionDate, score)`).

---

## (a) Composite non-null on live data + coverage-gate null path — **PASS**

Live REST (fresh, independent call, not reusing dispatcher's number):
```
curl -s http://localhost:3000/api/money-radar
→ {"score":-0.02005157574744573,"delta_5d":null,
   "divergence":{"flag":"AMBER","severity":1,"detectors":["D4"]},
   "coverage_pct":0.7692307692307692,"source_tier":2,"is_estimate":false,"null_reason":null,
   "components":{"foreign_net_direction":0.2,"foreign_accum_z_market":-6.00120553851436e-18,
   "foreign_outflow_z_5d":null,"obv_slope":0.08108108108108109,"rel_vol_z_20":-0.9279356705836327,
   "up_down_vol_ratio":-0.0809857360120175,"degraded_vwap_proxy_z":0.4988268191078914,
   "carry_regime":0,"credit_flow_direction":null,"volatility_regime":0},
   "generated_at":"2026-07-01T11:27:05.946Z"}   HTTP 200
```
Real non-null score; `foreign_accum_z_market`, `obv_slope`, `rel_vol_z_20`,
`volatility_regime` all contribute non-null (confirmed above — `volatility_regime:0` is a
real NORMAL-regime mapping, not a null-fill). `foreign_outflow_z_5d` and
`credit_flow_direction` are null but honestly *excluded* (see components map — still
present as explicit `null`, never coerced to 0), consistent with HN-1/HN-3.

**Gateway MCP tool cross-check — tool not bound in this session's tool surface**
(`mcp__gateway__call_tool` was not present among the tools available to this QA
sub-session; consistent with the known class `feedback_local_cowork_subagents_gateway_blind`).
Substituted with source-level proof of byte-identity instead of a second black-box call:
```
apps/mcp-server/src/interface/mcp/tools/market-data/moneyRadarTools.ts:23,55
  import { getMoneyRadarComposite } from "../../../../application/usecases/getMoneyRadarComposite.js";
  const result = await getMoneyRadarComposite(resolvedDb);

apps/mcp-server/src/interface/mcp/routes/moneyRadarHandler.ts:38-40,69
  import { getMoneyRadarComposite, ... } from "../../../application/usecases/getMoneyRadarComposite.js";
  const body = await getMoneyRadarComposite(db);
```
Both interfaces call the identical usecase function — proof by construction, not just a
one-time output match.

**Coverage-gate null path (HN-2)** — inspected + test-verified, not fabricated:
```
apps/mcp-server/src/domain/services/market-data/moneyRadarCalculator.ts:124-134
  if (coverage_pct < COVERAGE_GATE) {
    return { score: null, coverage_pct, source_tier: minTier,
      null_reason: `coverage_pct ${...}% < 50% threshold — missing: ${missing.join(", ")}`,
      ... };
  }
```
Test evidence (both green in the 30-pass run above):
- `MONEY-RADAR-P0-T2-COMPOSITE.test.ts:216-229` (DoD-2): all downstream calls fail →
  `coverage_pct < 0.5`, `score === null`, `null_reason` is a string, **and explicitly
  `expect(result.score).not.toBe(0)`** — zero-fill is asserted against, not just null-checked.
- `MONEY-RADAR-P0-T2-COMPOSITE.test.ts:390-400` (PURE-2): pure `fuseComponents()` unit
  test, same contract.

No zero-fill anywhere in either the live payload or the gate path.

---

## (b) D2 divergence fires on a real historical example — **CONDITIONAL (mechanics proven on real history; live wiring cannot ever reach D2 — route to dev-mcp-server / MONEY-RADAR-P0-T2-COMPOSITE)**

Note: a prior QA cycle on this same task (`docs/agent-memory/decisions/sprint-MONEY-RADAR-P0-qa.md`
STEP qa-S1, 2026-07-01T10:35Z) already independently hit this exact
`market_prices_history` ~1-day-depth limitation and used the same daily_ohlcv-replay
workaround to prove D2 mechanics — logged as an observation, not the blocking reason for
that round's CHANGES_REQUESTED (which was a since-fixed `foreign_accum_z_market` ticker-arg
bug, confirmed fixed: live `foreign_accum_z_market` is non-null in the (a) evidence
above). This QA pass treats the underlying data-source gap as more serious on
independent review — see severity note at the end of this section.

**Detector logic is correct** — confirmed two independent ways:
1. Existing seeded unit test `MONEY-RADAR-P0-T2-COMPOSITE.test.ts:232-274` (DoD-3):
   synthetic index-up + OBV-down window → `divergence.flag==="AMBER"`,
   `detectors===["D2"]`, `severity===1`. PASS (in the 30-pass run above).
2. **Independent replay against REAL production data** (not seeded/synthetic) — queried
   the live `market.db` (403MB, updated `2026-07-01T11:26`) inside the running
   `mcp-server` container via `bun -e` (bun:sqlite, read-only), replicating the exact
   production formulas (`computeIndexReturn`, `computeObvSeries`,
   `computeObvSlopeSign`/`computeMarketObvSlope`, `detectD2PriceVsObv` condition
   `indexReturn5d>0 && obvSlope<0`) against `daily_ohlcv` (VNINDEX: 754 daily bars,
   2023-06-27→2026-07-01; 41-ticker watchlist, same table). Result:
   **99 real historical trading days** where D2 would have fired. Most recent:
   ```
   2026-06-26: index_return_5d=+2.60%, market_obv_slope_agg=-0.2973 (37/41 tickers resolved) → D2 FIRES
   2026-06-25: +1.78% / -0.4595 → D2 FIRES
   2026-06-24: +3.98% / -0.5135 → D2 FIRES
   2026-06-23: +3.38% / -0.4595 → D2 FIRES
   2026-06-22: +3.26% / -0.1351 → D2 FIRES
   ```
   This proves the detector code (`moneyRadarCalculator.ts:340-349`) genuinely fires on
   real VN-market data, using the same algorithm as production — no fabrication.

**But the deployed live composite can NEVER produce this today.** The D1/D2 index axis
(`indexReturn5d`) is sourced by `getVnIndexDailyCloses()`
(`apps/mcp-server/src/infrastructure/db/moneyRadarStore.ts:48-66`) from
`market_prices_history WHERE code='VNINDEX'` — NOT from `daily_ohlcv` (which has the
754-day depth used in the replay above). `market_prices_history` is explicitly a
**rolling 24-hour ticks cache by design**, per
`apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:231-243`:
```
// Consolidate: keep only the last 24 h of ticks, delete older ones.
// (daily OHLCV already preserves the day summary for 2+ years)
const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
db.prepare(`DELETE FROM market_prices_history WHERE fetched_at < ?`).run(cutoff);
```
Live-verified on the running container:
```
docker exec ...mcp-server-1 bun -e '... SELECT price, fetched_at FROM market_prices_history WHERE code="VNINDEX" ...'
→ distinct days: [ [ "2026-07-01", 1867.21 ] ]   // exactly 1 calendar day
```
`computeIndexReturn()` requires `closesAsc.length >= window+1 = 6`
(`moneyRadarCalculator.ts:295-301`). With `market_prices_history` structurally pruned to
~24h every push, this table can **never** accumulate 6 distinct calendar days —
`indexReturn5d` is **permanently null** on the live tool, not "not yet warmed up." This
silently disables **both D1 and D2** (both consume `indexReturn5d`) on every live call,
regardless of real market conditions — today's live divergence is `[D4]` only because D3
also resolved CLEAR and D1/D2 are UNKNOWN-but-masked (per `aggregateDivergence()`, an
UNKNOWN axis is only surfaced in `null_reason` when **zero** detectors fire; today D4
fired so the UNKNOWN state of D1/D2 is invisible in the payload).

**Root cause / fix (file:line):** `apps/mcp-server/src/infrastructure/db/moneyRadarStore.ts:48-66`
`getVnIndexDailyCloses()` should source from `daily_ohlcv WHERE code='VNINDEX'`
(confirmed live: 754 rows, 2023-06-27→2026-07-01, clean EOD closes) instead of
`market_prices_history` (confirmed live: 1-day rolling cache only). One-line data-source
swap, no schema change. Note: `correlationTools.ts:62-90` (`loadPriceHistory`) has the
same `market_prices_history` sourcing pattern and inherits the identical limitation —
pre-existing debt this sprint's `moneyRadarStore.ts` copied rather than introduced, but
it is the blocking cause for D2's Phase-0 DoD item specifically and should not ship
un-flagged.

**Verdict: CONDITIONAL for item (b).** The literal ask — "find/replay a real historical
session that triggers D2" — is fulfilled (99 real fire-days, algorithm-identical replay).
The condition: this is not merely "today isn't a D2 day" (the escape valve the dispatch
instructions anticipated) — it is a **structural, permanent** gap: `market_prices_history`
is pruned to ~24h by design on every price push, so it can never reach the 6-day depth
`computeIndexReturn()` requires, meaning **D1 and D2 can never fire via the live tool on
any day** until fixed. Given D1/D2 are 2 of the 4 "centerpiece" L2 divergence detectors
(brief §3), this is treated as a genuine blocking gap for the overall sprint DoD (see
Summary), not a cosmetic note. Bounce to **dev-mcp-server** (task
`MONEY-RADAR-P0-T2-COMPOSITE`) to swap the index-close source in `moneyRadarStore.ts`.

---

## (c) Dashboard route-load — **CONDITIONAL (stale frontend image — needs single-svc rebuild)**

Frontend container **is running** (`vn-market-intelligence-mcp-frontend-1`, healthy,
28h uptime) — not a "service down" case.
```
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/dashboard/money-radar → 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/money-radar        → 404
```
Root cause — stale image predates the route commit:
```
docker inspect vn-market-intelligence-mcp-frontend-1 --format '{{.Created}}'
→ 2026-06-30T07:31:02Z   (image sha256:447eda538788, built before this sprint's frontend commit)

git log -1 --format="%H %ad" -- apps/frontend/app/routes/dashboard.money-radar.tsx apps/frontend/app/routes/api.money-radar.tsx
→ a0e34a87 Wed Jul 1 13:02:52 2026 +0200  (= 2026-07-01T11:02:52Z, ~28h AFTER the image build)
```
`git log --oneline` confirms both new routes + the card test landed in one commit:
`a0e34a87 feat(dev-frontend/MONEY-RADAR-P0-T3): add /dashboard/money-radar consumer surface`.
The 404 is expected and explained — the container has simply not been rebuilt since the
commit landed; it is not a code defect.

**Static verification performed (route file + live upstream JSON contract):**
- `apps/frontend/app/routes/dashboard.money-radar.tsx` — read in full. Structure mirrors
  `dashboard.momentum.tsx`: `PageHeader` + `FreshnessBadge(slaTierKey="daily")` in
  actions, `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`, 4 `GaugeCard`s (Dòng
  Tiền / Dòng Vốn Ngoại / Khối Lượng Nội Địa / Tín Hiệu Phân Kỳ), `InfoCardExpand` per
  card. `parseMoneyRadarCompositeDto()` matches the live JSON shape verified in (a)
  field-for-field. `formatScalar2` → `'—'` on null; `formatCompositeScoreBadge` /
  `formatForeignAccumBadge` / `formatRelVolBadge` / `formatDivergenceBadge` all return
  `{label:'Chưa có dữ liệu', color:'gray'}` on the null branch (lines 234-282). Divergence
  `UNKNOWN` is explicitly treated as the null-equivalent state (HN-4), never green
  (`formatDivergenceBadge:270-277`).
- `apps/frontend/app/routes/api.money-radar.tsx` — pure `proxyUpstream` to
  `${MCP_SERVER_BASE_URL}/api/money-radar`. Live-verified env inside the frontend
  container: `MCP_SERVER_BASE_URL=http://mcp-server:3000` — correct docker-network target.
- CSS class names scanned for diacritics — none found (`w-full space-y-6`,
  `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`, `text-xs text-slate-400`, etc.
  — all ASCII).
- Test evidence: `apps/frontend/app/__tests__/money-radar-cards.test.ts` — 39 pass / 0
  fail (run above), covers the parser/formatter/fetch functions exported from the route.

**Verdict: CONDITIONAL.** Code is correct by static + unit-test inspection and matches
the live API contract exactly, but the actual page cannot be RAW-verified end-to-end
(no live render) until the frontend service is rebuilt. **Action: single-service rebuild
of `vn-market-intelligence-mcp-frontend`** (ops/PO, per standing single-svc rebuild
policy), then re-probe `GET /dashboard/money-radar` for HTTP 200 + visual confirmation.

---

## (d) Momentum no-regression — **PASS**

```
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/dashboard/momentum         → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/momentum-indicators     → 200
```
`dashboard.momentum.tsx` is untouched by this sprint (absent from `git status` /
sprint diff — only `dashboard.money-radar.tsx`, `api.money-radar.tsx`, and the new test
file were added). `apps/mcp-server` tsc noEmit and `apps/frontend` typecheck both clean
(0 errors), so the new `server.ts` route addition for `/api/money-radar` did not break
the existing momentum route. No regression.

---

## Honest-NULL spot-checks

**HN-2 (coverage gate, score=null not zero)** — **PASS**. See (a) above — code
(`moneyRadarCalculator.ts:124-134`) + 2 passing tests (DoD-2, PURE-2), explicit
`expect(result.score).not.toBe(0)` assertion.

**HN-4 (divergence UNKNOWN not GREEN when axis null)** — **PASS**.
```
apps/mcp-server/src/domain/services/market-data/moneyRadarCalculator.ts:402-423
  aggregateDivergence(): if (unknown.length > 0) return { flag: "UNKNOWN", ... };
  // GREEN only returned when fired.length===0 AND unknown.length===0
```
Test evidence (both PASS in the 30-pass run): `MONEY-RADAR-P0-T2-COMPOSITE.test.ts:276-289`
(DoD-4: all 4 detectors UNKNOWN → `flag==="UNKNOWN"`, explicit
`expect(result.divergence.flag).not.toBe("GREEN")`); `:426-434` (PURE-6, same contract at
the pure-function level). Cross-referenced against finding (b): today's live D1/D2 axes
are silently null (masked because D4 fired) — this is the exact scenario HN-4 exists to
guard, and the guard code is correct; the gap is only in the upstream data source, not
this honesty rule.

**HN-5 (degraded VWAP is_proxy=true)** — **PASS**, live-verified on the real Go TA
service (not a test fixture):
```
curl -s -X POST http://localhost:5003/ta/money-flow-oscillators -d '{"tickers":["VCB","FPT"]}'
→ {"tickers":[
     {"code":"VCB","obv":17926690,"rel_vol_z_20":-2.10,"up_down_vol_ratio":1.39,
      "degraded_vwap":61654.55,"is_proxy":true,"bars_used":100},
     {"code":"FPT","obv":-277586950,"rel_vol_z_20":-1.80,"up_down_vol_ratio":0.36,
      "degraded_vwap":72518.27,"is_proxy":true,"bars_used":100}
   ]}
```
`is_proxy:true` on real production data for both tickers. Backed by
`apps/technical-analysis/pkg/domain/money_flow_service.go:6,139` (comment: "is_proxy=true
always") and `money_flow_service_test.go:74,113,159` (asserts `is_proxy=true` on every
path including the null-history path). The composite's own component key
`degraded_vwap_proxy_z` self-labels the aggregated value (never presented as a canonical
VWAP), per `moneyRadarCalculator.ts:176-181` docstring.

---

## Summary

| Item | Verdict | One-liner |
|---|---|---|
| (a) composite non-null + coverage gate | **PASS** | live score=-0.0201, coverage=0.769, 4 named components non-null; gate code+tests return null+null_reason, never 0 |
| (b) D2 fires on real history | **CONDITIONAL** | detector logic proven correct on 99 real historical days (incl. 2026-06-26), but live wiring reads `market_prices_history` (rolling-24h cache, 1 day depth) instead of `daily_ohlcv` (754 days) — D1+D2 permanently dead on the live tool |
| (c) dashboard route-load | **CONDITIONAL** | route/proxy code + tests correct and matches live API contract; frontend image predates the commit (built 06-30T07:31Z vs commit 07-01T11:02Z) → 404 until single-svc rebuild |
| (d) momentum no-regression | **PASS** | `/dashboard/momentum` 200, `/api/momentum-indicators` 200, file untouched, tsc clean both packages |
| HN-2 coverage-gate null | **PASS** | code + DoD-2/PURE-2 tests, explicit not-zero assertion |
| HN-4 divergence UNKNOWN≠GREEN | **PASS** | code + DoD-4/PURE-6 tests; explains why (b)'s D1/D2 gap is masked, not silently wrong |
| HN-5 degraded VWAP is_proxy | **PASS** | live curl to :5003 confirms `is_proxy:true` on real VCB/FPT data |

## SPRINT-DoD: **REJECT**

Blocking item: **(b)** — D1/D2 divergence axis is structurally dead on the live
`get_money_radar_composite` tool (wrong data-source table, `market_prices_history`
instead of `daily_ohlcv`, in `apps/mcp-server/src/infrastructure/db/moneyRadarStore.ts:48-66`
`getVnIndexDailyCloses()`). Route to **dev-mcp-server** (task
`MONEY-RADAR-P0-T2-COMPOSITE`) for a data-source fix; re-run this QA gate after the fix
(cheap re-verify: re-run the live curl + re-check `market_prices_history` distinct-day
count, no new test-writing needed since DoD-3's seeded test already exercises the
detector — just needs the real wiring to reach it).

Secondary (non-blocking for merge, but must clear before item (c) can be marked PASS):
**(c)** needs a single-service rebuild of `vn-market-intelligence-mcp-frontend` (ops/PO)
— code is correct, only the deployed image is stale.

(a), (d), and all 3 honest-NULL spot-checks are clean PASS with live/raw evidence above.
