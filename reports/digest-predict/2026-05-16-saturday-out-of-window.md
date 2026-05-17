# Digest & Predict — Saturday Run Report

**Trigger time:** 2026-05-16 21:37 UTC (Saturday, weekday=6)
**Status:** Off-window run — no Telegram writes. Dry-run report only.

---

## 1. Schedule conflict detected

The trigger time does not match any window in either dispatcher source:

| Source | File | Daily slot |
|---|---|---|
| Repo dispatcher | `.claude/flows/digest-predict/main.md` (May 12) | **15:30 UTC** |
| Uploaded task brief | `uploads/SKILL.md` (May 6) | **23:30 UTC** |

Current time 21:37 UTC is ~6h after main.md's 15:30 and ~2h before SKILL.md's 23:30. Per `main.md` precedence rules: *"Any other time → EXIT (no work outside scheduled windows)"*.

Saturday is also a **non-trading day** in Vietnam — VN market reported CLOSED on every snapshot call. Stored prices reflect Friday's close.

**Recommendation:** reconcile `SKILL.md` and `main.md` to a single canonical schedule, or set the scheduler's cron to one of the documented UTC windows. Until then this scheduled task will keep firing outside the dispatcher's accepted windows.

---

## 2. Data gathered (would have been used for daily.md)

### Macro snapshot (Thiên Thời)
- **Global Liquidity:** TIGHTENING
- **DXY:** 99.27 — USD STABLE
- **US 10Y:** 4.59% — RISK-OFF threshold (PE compression)
- **VND Carry Spread:** −0.33% (VND 5% − Fed 5.33%) — FII_OUTFLOW_RISK
- **Brent:** $109.26/bbl | **Gold:** $4,561.90/oz | **USD/VND:** 26,350
- **SBV rates:** Refi 4.50%, Max Deposit 5.00%, Official USD/VND 26,137

### Nhân Hòa score (computed)
| Criterion | Value | Pts |
|---|---|---|
| REGIME = EASING | TIGHTENING | 0 |
| CARRY = HOT_MONEY_INFLOW | FII_OUTFLOW_RISK | 0 |
| US10Y = RISK-ON | RISK-OFF | 0 |
| EY_SPREAD > 2% | estimated 1/12 − 5% ≈ 3.3% | +1 |
| currentMonthIsPivotWindow = false | May ≠ pivot | +1 |
| **Total** | | **2/5 → THẬN TRỌNG** |

Per flow rule: score ≤ 1 triggers "Thiên Thời bất lợi" override for Monday predictions. We are at 2/5 — caution warranted but not blocking. Monday predictions are not in scope for a daily Saturday run anyway.

### VN-Index (Friday close, stored)
- **VN-Index 1,921.60 (−0.20%)** | HNX +0.92% | VN30 −0.87%

### Notable movers (Friday close)
**Up:** POM +13.16%, GAS +6.94%, PLX +5.90%, BSR +4.96%, GVR +4.28%, NVL +3.90%, SAB +3.30%, OIL +3.27%, NT2 +2.43%, ACB +2.19%
**Down:** PNJ −3.17%, TMT −3.25%, MWG −2.61%, VTP −2.40%, VPB −2.13%, MSN −2.02%, VHC −1.96%, HPG −1.85%

### Asia context
KOSPI −6.0%, China 000001.SS −2.0%, HSI −1.0%, Nikkei −1.0% — Asia broadly risk-off Friday.

### Sector rotation
All 16 sectors flagged "ỔN ĐỊNH / chưa đủ 5 phiên" (insufficient history). Dầu khí (Oil & Gas) +3.94% the only sector with material 1d move, consistent with Brent at $109. Banks −0.62%, Retail −0.78%, Tech −0.52%.

### Open chain findings
- **HVN** — news-scout `urgent_news` + `chain_catalyst` (bearish, conf 0.8). 2 findings, depth 0. Status: awaiting confirmation. Format would be: *"Đang chờ xác nhận thêm: HVN — chuỗi tin xấu mới khởi tạo."*

### Earnings calendar — risk signal
**38 stocks QUÁ HẠN (overdue) for Q1-2026 BCTC**, including VCB, BID, CTG, MBB, ACB, ACV, FPT, GAS, HPG, HSG, HVN, MWG, NVL, SSI, VHM, VIC, VPB, VRE — i.e. most of the VN30. Deadlines 30/04 and 15/05 both passed with no submissions recorded. Either a feed gap or a market-wide reporting lag — worth a feedback ticket.

### Kinh Dịch — VN-Index
Quẻ **Khôn (2) ☷** → MUA (100% conf), biến quẻ Khôn (stable). However, flow rule requires regime overlay:
> BUY signal + REGIME=TIGHTENING → "Thiên thời bất lợi — chờ xác nhận"

Final framing: *"Kinh Dịch: VN-Index — Quẻ Khôn (2). Tín hiệu mua nội tại nhưng Thiên Thời bất lợi — chờ xác nhận."*

### Dev team
Most recent fix: 2026-05-12 (HEADLOCK-c52, stale `.git/HEAD.lock`). No new issues to report. Earlier batch (May 1–2) concerns vn-news-fetch VPS recovery and Docker chromium — already addressed. **No `submit_feedback` call would be triggered.**

---

## 3. Dry-run daily digest text (NOT sent)

```
Daily Digest — 2026-05-16 (Saturday, non-trading)
[Thiên Thời] TIGHTENING | DXY USD STABLE | US10Y 4.59% (RISK-OFF) | Carry -0.33% (FII outflow risk)
[Nhân Hòa] THẬN TRỌNG (2/5)
VN-Index: 1.921,60 (-0,20%, đóng cửa thứ Sáu) | Brent: $109,26 | Vàng: $4.561,90 | USD/VND: 26.350

Top tăng (thứ Sáu): POM +13,2% | GAS +6,9% | PLX +5,9% | BSR +5,0% | GVR +4,3% | NVL +3,9% | SAB +3,3%
Top giảm (thứ Sáu): PNJ -3,2% | TMT -3,3% | MWG -2,6% | VTP -2,4% | VPB -2,1% | MSN -2,0%

Châu Á: KOSPI -6,0% | Shanghai -2,0% — risk-off rộng

Chuỗi tín hiệu: Đang chờ xác nhận thêm: HVN — chuỗi tin xấu mới khởi tạo (conf 0,8 bearish)

Cảnh báo BCTC: 38 mã QUÁ HẠN Q1-2026 (VCB/BID/CTG/MBB/ACB/FPT/HPG/VHM/VIC/VPB/VRE…). Cần kiểm tra feed BCTC.

Kinh Dịch: VN-Index — Quẻ Khôn (2). Tín hiệu mua nội tại nhưng Thiên Thời bất lợi — chờ xác nhận.

Ghi chú: thị trường VN nghỉ cuối tuần. Giá hiển thị là phiên đóng cửa thứ Sáu 2026-05-15.
```

```
[Digest & Predict] 21:37 UTC — DAILY digest DRY-RUN (off-window Saturday)
  Stocks tracked: 38 | Chains: 0 complete, 1 partial (HVN), 0 failed
  Predictions: 0 (not Monday) | Nhân Hòa: 2/5 | BCTC overdue: 38
  Schedule conflict: trigger 21:37 UTC vs main.md 15:30 / SKILL.md 23:30 — needs reconciliation.
```

---

## 4. Decisions made autonomously (per scheduled-task brief)

1. **Did NOT send to Telegram** (MARKET or WORK). Rationale: trigger outside both documented daily windows; Saturday is a non-trading day; user prefers truth over noise. Brief says "when in doubt, producing a report of what you found is the correct output."
2. **Skipped per-stock Kinh Dịch readings** for the 38-stock watchlist — would have cost ~38 tool calls for a Saturday non-trading recap with no live prices to overlay. Market-level hexagram (Khôn) is the meaningful signal.
3. **Skipped domain risk tools** (`get_legal_risk_signals`, `get_crisis_early_warning`, `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals`) — same reasoning. These belong to a full live-day digest.
4. **`get_data_freshness` not available** on the server (`MCP error -32602: Tool not found`). Not a blocker; logged here for awareness.
5. **No `submit_feedback` call** — no new dev issues since 2026-05-12 (BASE_CONTEXT_FRESH not present; got_recent_fixes shows nothing new).

---

## 5. Action items for the user

1. **Reconcile the daily-digest UTC time** between `.claude/flows/digest-predict/main.md` (15:30) and `uploads/SKILL.md` (23:30). One of them is stale.
2. **Inspect the BCTC feed** — 38 overdue Q1-2026 reports across VN30 is implausible. Likely a feed-status or status-update bug, not actual market-wide non-compliance.
3. **HVN bearish chain** is the only live actionable signal — worth a manual look on Monday open.
4. **Decide cron policy for non-trading days.** Saturday/Sunday daily digests currently regurgitate Friday's close. Options: (a) skip with EXIT marker, (b) run a lightweight "weekend status" variant, (c) keep current behavior with explicit "non-trading" tag.

---

*Generated by Digest & Predict scheduled run, off-window Saturday 2026-05-16 21:37 UTC. No writes performed.*
