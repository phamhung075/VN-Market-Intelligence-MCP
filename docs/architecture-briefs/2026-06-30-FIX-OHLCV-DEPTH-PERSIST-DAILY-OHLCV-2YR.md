# Architecture Brief — FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Priority:** P0 · blocking · user_prioritized
**Author:** architect
**Date:** 2026-06-30T08:xZ
**Coordination session:** e71c7736-a95a-4040-b741-1d48454354f6

---

## 1. Root-Cause Finding

### 1.1 RAW-CONFIRM (live named volume, 2026-06-30T08:xxZ)

```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...'
→ ALL 1431 tickers: cnt=48-49, min_d="2026-04-23", max_d="2026-06-30"
→ SELECT COUNT(*) WHERE date < "2026-04-23" → 0 rows
→ ohlcv_backfill_queue last 10 rows: ALL done=1
→ total daily_ohlcv rows: 20920 / 1431 tickers
```

Uniform 2026-04-23 floor across 1431 tickers (incl. non-watchlist SSI/MWG) confirms:
- NOT a coverage gap (non-watchlist tickers have data)
- NOT a startup-purge signature (real trading bars with vol > 0 survive `purgeStrandedSeedRows`)
- The named volume was initialized 2026-04-23 with no prior history; VPS backfill has not filled depth

### 1.2 Hypothesis Verdict

| Hypothesis | Verdict | Confirmed via |
|---|---|---|
| (1) startup purge trims daily_ohlcv | SECONDARY CULPRIT ONLY — purgeStrandedSeedRows deletes vol=0 AND O=H=L=C rows; does NOT touch real bars | `allzeroOhlcvBackfill.ts:196-208` |
| (2) scheduled retention DELETE | RULED OUT — no retention DELETE found in any scheduler or startup path | full codebase scan |
| (3) ohlcvHistoryBackfillJob per-ticker lookback ~50 bars | MISATTRIBUTED — the job uses HISTORY_TARGET_BARS=500 correctly; the ~50 bar issue is in `taOhlcvBackfillJob` | `ohlcvHistoryBackfillJob.ts:46`, `taOhlcvBackfillJob.ts:46` |

### 1.3 Exact Defects (file:line)

**DEFECT-1 (PRIMARY) — `vps-scripts/ohlcv-backfill-poll.sh:70-79`**

The poll script marks `done=1` **regardless of exit code**:
```bash
# Signal done regardless of exit code so the server unblocks
DONE_RESP=$(curl ... POST /api/ohlcv-backfill-done)
exit 0
```

If `/root/fetch-ohlcv-backfill.sh` is absent on VPS, or if the TCBS fetch returns zero bars, or if the push endpoint rejects all bars — the done signal fires anyway. 457 queue entries all `done=1` with ZERO historical bars proves this masking is active.

**DEFECT-2 (PRIMARY) — `apps/mcp-server/src/interface/mcp/server.ts:1433-1435`**

The `/api/ohlcv-backfill-done` endpoint:
```typescript
db.prepare("UPDATE ohlcv_backfill_queue SET done = 1 WHERE done = 0").run();
res.end(JSON.stringify({ ok: true }));
```

No inserted-count verification. Server cannot distinguish a real backfill from a zero-bars push. The pipeline is a fire-and-forget black box with no feedback loop.

**DEFECT-3 (CONFIRMED) — `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:46`**

```typescript
export const TA_MIN_ROWS = 35;
// ...line 244:
if (cnt >= TA_MIN_ROWS && corruptCnt === 0) {
  covered++;  // skip fetch
  continue;
}
```

All watchlist tickers have 49 bars (≥ 35), so `taOhlcvBackfillJob` marks them ALL "covered" and fetches NOTHING. This gate exists for TA-indicator viability (MACD/RSI/BB need 35 bars), but not for 252-bar momentum depth. Additionally, VNDirect is geo-blocked from Docker (`api-finfo.vndirect.com.vn` returns snapshot not per-ticker history from France), making this job a double-failure: wrong threshold AND blocked API.

**DEFECT-4 (VPS-SIDE, SUSPECTED) — `vps-scripts/fetch-ohlcv-backfill.sh:117-128`**

The TCBS bars-long-term API may return prices in thousand-VND scale. The script comment says "full VND — do NOT multiply" but this was never verified against a live TCBS response from the VPS. If TCBS close=49.5 (thousand-VND for a 49500 VND stock), the France server's `validateOhlcvUnit` at `server.ts:1297` rejects it (STOCK_MIN_VND=100), returning `{ok:true, inserted:0}`. VPS script checks only `ok`, not `inserted`, so it logs "OK" and moves on with zero bars written.

Additionally, the script uses `type=stock` for ALL tickers including VNINDEX. TCBS may reject index tickers with this parameter, causing 0 bars for VNINDEX.

**DEFECT-5 (SECONDARY) — `apps/mcp-server/src/interface/mcp/server.ts:1297-1306`**

The `validateOhlcvUnit` guard in push-ohlcv-history is unguarded for thousand-VND input with no pre-normalization. Other write paths (Writer A via pushPricesHandler, ohlcvWriteService) call `normalizeOhlcvToVnd` BEFORE the guard. Writer H (push-ohlcv-history) does not, relying entirely on the VPS script to send full-VND data. If TCBS is thousand-VND, every bar is rejected silently.

---

## 2. Durable Fix Design

### 2.1 Principle

LESSON APPLIED: "Fix the WRITER not the residue." The historical backfill pipeline must be:
1. **Verifiable** — France server must confirm actual bar depth increased after VPS done signal
2. **Self-healing** — re-queue trigger on depth-check failure (not just one-shot)
3. **Scale-safe** — normalize TCBS bars before unit guard (same as other writers)
4. **Threshold-correct** — depth gate must target 252-bar FLOOR (momentum floor), not 35-bar TA minimum
5. **Universe-complete** — backfill must cover FULL traded universe, not just watchlist (trigger all observed tickers)

### 2.2 Fix Architecture

#### Component A: VPS script hardening (`vps-scripts/fetch-ohlcv-backfill.sh`)

1. Add `normalizeThousandVnd` inline to jq pipeline: if `close < 100`, multiply all OHLCV ×1000.
2. Filter flat zero-vol reference bars before push: `select(.volume > 0 or (.open != .close))`.
3. Fix VNINDEX: use `type=index` for VNINDEX ticker in TCBS request.
4. Report actual bars pushed: include `{"ticker": "VCB", "inserted": N}` in summary output.
5. Pass `bars_pushed_total` to the `/api/ohlcv-backfill-done` POST body.

#### Component B: Server-side verification (`apps/mcp-server/src/interface/mcp/server.ts`)

1. Change `/api/ohlcv-backfill-done` to accept `{bars_pushed_total: number}` body.
2. After marking done: query actual depth for each watchlist ticker.
3. If any ticker depth < 252 after done, log WARN with depth report and insert a NEW done=0 queue row (re-queue) with a `retry_count` increment.
4. If `retry_count >= 5`: emit BUG Telegram alert — VPS backfill permanently stalled.

#### Component C: taOhlcvBackfillJob threshold split (`apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`)

1. Add `MOMENTUM_MIN_BARS = 252` constant alongside `TA_MIN_ROWS = 35`.
2. Coverage gate becomes two-pass:
   - Skip TA fetch if `cnt >= TA_MIN_ROWS && corruptCnt === 0` (existing TA gate)
   - Do NOT mark "covered" if `cnt < MOMENTUM_MIN_BARS` (depth deficit)
3. However: since VNDirect is geo-blocked from Docker, this job cannot fill 252-bar depth directly. This fix ensures the job DOES NOT mask depth insufficiency for downstream depth-check logic. Real depth fill still comes from VPS push (Component A+B).
4. Add a separate `momentumDepthCheck(db)` helper: queries depth per ticker, logs deficit count to INFO.

#### Component D: ohlcvHistoryBackfillJob depth floor (`apps/mcp-server/src/scheduler/market-data/ohlcvHistoryBackfillJob.ts`)

1. Change the depth-check trigger threshold from `HISTORY_TARGET_BARS=500` to also re-trigger if actual written bars after last VPS done < `DEPTH_FLOOR=252`.
2. This is already partially correct (HISTORY_TARGET_BARS=500 > 252), but the post-VPS verification in Component B is the real fix. No change needed here unless the retry logic moves to this file.

#### Component E: Startup depth-check observability

1. Add depth summary to `ohlcvStartupProbe`: count tickers below 252 bars and log with counts.
2. Send Telegram WORK alert if >50% of watchlist tickers have < 252 bars after restart (single message, not per-ticker).

### 2.3 Constraint: Geo-blocked APIs from Docker

VNDirect (`api-finfo.vndirect.com.vn`): geo-blocked from France Docker → returns all-market snapshot, not per-ticker history.
TCBS (`apipubaws.tcbs.com.vn`): returns HTTP 404 from France Docker.

**All historical OHLCV must flow through VPS push pathway.** Do NOT attempt direct fetch from Docker for historical bars.

---

## 3. Sub-Task Decomposition

All sub-tasks: owner = `dev-mcp-server`, zone = `apps/mcp-server/` + `vps-scripts/`.

### SUBTASK-A: VPS Script Hardening (P0, BLOCKING)

**File:** `vps-scripts/fetch-ohlcv-backfill.sh`
**What:** Add jq-level normalization (×1000 if close < 100), filter flat seed bars (vol=0 AND O=H=L=C), fix VNINDEX type=index, pass bars_pushed_total to done endpoint.
**Acceptance:** Manual VPS test — `DAYS=730 bash fetch-ohlcv-backfill.sh` for VCB → server logs show `inserted > 0` for recent AND historical bars.
**Risk:** TCBS API schema may differ from assumed; validate field names against live response before shipping.

### SUBTASK-B: Server-side Verification in ohlcv-backfill-done (P0, BLOCKING)

**Files:** `apps/mcp-server/src/interface/mcp/server.ts:1423-1444`
**What:**
- Accept optional `{bars_pushed_total: number}` in POST body.
- Post-done: query `SELECT code, COUNT(*) as cnt FROM daily_ohlcv WHERE code IN (watchlist) GROUP BY code`.
- If any ticker cnt < 252: log WARN with ticker list + counts, insert new done=0 queue row (re-queue).
- If re-queue count for same session ≥ 5: skip re-queue, send Telegram BUG alert.
**Acceptance:** After VPS pushes real data, server logs `[ohlcv-backfill-done] depth verified: all watchlist tickers ≥252 bars`. Subsequent restarts show no re-queue.

### SUBTASK-C: taOhlcvBackfillJob Threshold Split (P1, MOMENTUM GATE)

**File:** `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:46,244`
**What:**
- Add `export const MOMENTUM_MIN_BARS = 252` constant.
- Split the coverage gate: TA skip stays at 35 (no regression); add `momentumDepthInsufficient` flag when `cnt < MOMENTUM_MIN_BARS`.
- Log depth-insufficient tickers to INFO: `[taOhlcvBackfill] depth-insufficient: ${code} has ${cnt} bars < ${MOMENTUM_MIN_BARS}`.
- This is observability only — the VPS push path (SUBTASK-A+B) provides actual fill.
**Acceptance:** With 49 bars, job logs depth-insufficient for all watchlist tickers. After VPS backfill to 252+ bars, no more depth-insufficient logs.

### SUBTASK-D: ohlcvStartupProbe Depth Alert (P1, OBSERVABILITY)

**File:** `apps/mcp-server/src/scheduler/market-data/ohlcvStartupProbe.ts`
**What:**
- Add `DEPTH_FLOOR = 252` check alongside the existing `< 8` sparse check.
- If any watchlist ticker has 8 ≤ cnt < 252: include in Telegram WORK alert as "shallow" (distinct from "sparse" which is < 8).
- Single alert per startup, not per-ticker.
**Acceptance:** After restart with 49-bar depth, probe sends WORK alert listing all tickers with 49 bars as "shallow (need 252)."

### SUBTASK-E: VPS Script Deployment Gate (P0, PREREQUISITE)

**NOT a code change — ops procedure.**
Verify `/root/fetch-ohlcv-backfill.sh` exists and is executable on the Vinahost VPS.
**If absent:** `scp vps-scripts/fetch-ohlcv-backfill.sh root@<vps>:/root/` then `chmod +x /root/fetch-ohlcv-backfill.sh`.
**Gate:** SSH into VPS, run `ls -la /root/fetch-ohlcv-backfill.sh`, confirm executable.
**Owner:** dev-mcp-server must SSH verify before triggering any queue row.

---

## 4. Cross-Restart Verification Gate (DURABLE)

After SUBTASK-A+B+C deployed and container rebuilt+restarted:

### Gate 1: Immediate depth probe
```bash
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '
  const {Database}=require("bun:sqlite");
  const db=new Database("/app/data/market.db",{readonly:true});
  const r=db.query("SELECT code,COUNT(*) as cnt,MIN(date) as min_d FROM daily_ohlcv WHERE code IN (SELECT code FROM watchlist) GROUP BY code ORDER BY cnt ASC LIMIT 10").all();
  r.forEach(x=>console.log(JSON.stringify(x)));
'
```
Expected: all watchlist tickers cnt >= 252, min_d <= "2025-07-01" (1yr ago floor).

### Gate 2: Tool layer
```
get_price_history(ticker="VCB", days=730) → rows.length >= 252
```

### Gate 3: Indicator unlock
```
get_roc_momentum(tickers=["VCB","HPG","FPT"]) → momentum_score NOT null
get_relative_strength() → market_rs_composite NOT null
compute_52w_proximity(tickers=["VCB"]) → proximity NOT null
```

### Gate 4: Persistence (CRITICAL — durable fix test)
After Gate 1-3 pass → **restart container** → re-probe immediately:
```bash
docker restart vn-market-intelligence-mcp-mcp-server-1
# wait 60s for startup
# re-run Gate 1
```
Expected: same depth (252+ bars), no depth regression. Passes ONLY if startup purge does NOT destroy real bars.

### Gate 5: Non-watchlist universe
```bash
docker exec ... bun -e 'SELECT COUNT(*) WHERE date < "2025-07-01"'
```
Expected: > 0 rows (some historical bars for non-watchlist from VPS push).

---

## 5. Risk Flags

**R-1 (HIGH): TCBS thousand-VND scale unknown.**
The TCBS `bars-long-term` API may return thousand-VND. The VPS script assumes full-VND. Dev must verify by parsing one ticker's raw response from VPS before deploying. Normalization (×1000 if close < 100) must be added to the VPS script regardless.

**R-2 (HIGH): Universe scope — non-watchlist tickers.**
The VPS `fetch-ohlcv-backfill.sh` only fetches WATCHLIST tickers (from `/api/watchlist`). Non-watchlist tickers (SSI, MWG, 1400+ others) currently accumulate daily bars from intraday VPS push only. To fill historical depth for the FULL traded universe, the backfill script must be extended to fetch from TCBS for ALL tickers observed in daily_ohlcv (the `SELECT DISTINCT code FROM daily_ohlcv` pattern, as used by `ohlcvBackfill.ts`). This is a SCOPE EXTENSION — include in SUBTASK-A.

**R-3 (MEDIUM): purgeStrandedSeedRows on restart.**
If VPS pushes any flat seed bars (vol=0, O=H=L=C) — which TCBS may return for non-trading days — they are deleted on next restart. SUBTASK-A filter (`select(.volume > 0 or (.open != .close))`) prevents these from being pushed at all. This is belt-and-suspenders protection.

**R-4 (MEDIUM): taOhlcvBackfillJob geo-block.**
Even with raised threshold, VNDirect is geo-blocked from Docker, so `taOhlcvBackfillJob` cannot contribute to depth fill directly. SUBTASK-C is observability only. Actual fill relies entirely on VPS push.

**R-5 (LOW): Retry storm.**
SUBTASK-B re-queues done=0 on depth failure. If VPS is broken and keeps marking done without pushing data, this creates an infinite retry loop. The retry_count >= 5 BUG escalation gate prevents this. Cap must be enforced server-side.

---

## 6. DDD Layer Compliance

| Component | DDD Layer | Allowed imports |
|---|---|---|
| server.ts push-ohlcv-history | interface | infrastructure/db, domain services |
| ohlcvHistoryBackfillJob | scheduler | application/usecases, infrastructure, domain |
| taOhlcvBackfillJob | scheduler | application/usecases, infrastructure, domain |
| ohlcvStartupProbe | scheduler | infrastructure, domain |
| fetch-ohlcv-backfill.sh | VPS (outside DDD) | shell + curl only |

No DDD violations in the proposed fix design.
