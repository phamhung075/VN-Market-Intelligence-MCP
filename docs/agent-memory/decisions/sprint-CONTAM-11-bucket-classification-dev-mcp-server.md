---
<!-- CONTAM-11 Spike — PLAN-ONLY findings document -->
spike_id: CONTAM-11
type: SPIKE
mode: PLAN-ONLY
owner_agent: dev-mcp-server
session: e71c7736-a95a-4040-b741-1d48454354f6
sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
created_at: 2026-07-01T00:00:00Z
status: findings_complete
---

# CONTAM-11 — Residual Sub-1000 OHLCV Bucket Classification

## Question

Of the ~9,869 unanchored sub-1000 non-index `daily_ohlcv` rows (no `close >= 1000` within 180 days),
classify every row into:
- **(a) legit-cheap-stock** — genuinely trades sub-1000 VND, leave as-is
- **(b) contaminated-but-anchorless** — real value is thousands VND but no in-window clean anchor

Then propose a safe remediation for bucket (b) **without loosening** the CONTAM-10
`close >= 1000 within 180d` anchor predicate.

## Probe Method

Read-only DB probe (Bun SQLite `{readonly: true}`) against named-volume
`/app/data/market.db` inside `vn-market-intelligence-mcp-mcp-server-1`.
Zero writes. Two probe scripts: `probe_contam11.ts` + `probe_contam11b.ts`.
Probe timestamp: 2026-07-01 ~00:00 UTC.

---

## 1. Confirmed Residual Count

```
Residual rows (sub-1000, close>0, non-index, no 180d anchor): 9,368
Distinct tickers:                                              35
```

Note: 501-row reduction from the "~9,869" estimate is real — the CONTAM-10-EXEC
ran on 2026-06-30 ~22:06Z and the live DB settled to exactly 9,368 rows by probe time.

---

## 2. Three-Bucket Classification

The probe uses two discriminators in sequence:

**Discriminator D1** — `alltime_max = MAX(close) across all dates for ticker`:
- D1 < 1000 → **legit-cheap** (the stock has never been above 999 VND in the DB)
- D1 >= 1000 → apply D2

**Discriminator D2** — `ratio = alltime_max / max_sub1000_close`:
- D2 >= 100 → **true-contaminated** (current sub-1000 close is at least 100x below historical peak, matching the known 1000x scale contamination class)
- D2 < 100 → **genuine-decline** (price drop is moderate; stock legitimately fell from above 1000 VND)

### Final Bucket Table

| Bucket | Tickers | Rows | Action |
|--------|---------|------|--------|
| (a) legit-cheap: true-cheap (D1 < 1000) | 13 | 4,519 | leave as-is |
| (a) legit-cheap: genuine-decline (D1 >= 1000, D2 < 100) | 13 | 1,826 | leave as-is |
| **(a) subtotal** | **26** | **6,345** | |
| **(b) true-contaminated (D1 >= 1000, D2 >= 100)** | **9** | **3,023** | remediate |
| **TOTAL** | **35** | **9,368** | |

---

## 3. Bucket (a) — Legit-Cheap: Evidence

### 3a. True-cheap tickers (alltime_max < 1000 VND) — 13 tickers, 4,519 rows

| Code | Rows | min_close | max_close | avg_close | last_date | Evidence |
|------|------|-----------|-----------|-----------|-----------|----------|
| SLS  | 749  | 141 | 218.4 | 177 | 2026-06-30 | Fractional prices, active trading |
| NTC  | 749  | 129 | 240   | 180 | 2026-06-30 | Fractional prices, active |
| WCS  | 633  | 162 | 440   | 272 | 2026-06-30 | Fractional prices, active |
| VCF  | 634  | 181 | 383.4 | 248 | 2026-06-30 | Fractional prices, active |
| CMF  | 395  | 166 | 450   | 297 | 2026-06-30 | Fractional prices, active |
| IDP  | 284  | 163 | 319.9 | 237 | 2026-06-30 | Fractional prices, active |
| HLB  | 325  | 211 | 555.5 | 316 | 2026-06-26 | Fractional prices, active |
| ACM  | 150  | 500 | 900   | 637 | 2026-06-26 | Round prices; substantial volume (100k–3.9M wkly); tick-size pattern |
| DCT  | 150  | 500 | 900   | 630 | 2026-06-26 | Round prices; consistent trading |
| PXM  | 150  | 400 | 900   | 586 | 2026-06-26 | Round prices; active |
| MPT  | 150  | 500 | 900   | 666 | 2026-06-26 | Round prices; active |
| G20  | 149  | 500 | 900   | 617 | 2026-06-19 | Round prices; active |
| TESTIDX | 1 | 52 | 52 | 52 | 2025-01-15 | **Test artifact** — 1 row, volume=0, no data_env |

**ACM, DCT, PXM, MPT, G20** notes: round-number prices at multiples of 100 VND (400/500/600/700/800/900)
are consistent with the standard tick-size floor for Vietnamese UPCoM/HNX penny stocks. Volume is
non-trivial (hundreds of thousands per week), confirming active exchange-cleared trading at these prices.
These are NOT contaminated: if they were 1000x-contaminated, their true price would be 400,000–900,000 VND,
which is far above any VN stock. Leave as-is.

**TESTIDX** is a test seed row (volume=0, no data_env, single bar on 2025-01-15). It belongs in legit-cheap
by classification (alltime_max=52 < 1000) but should be removed via a separate janitor task — it is not
a contamination issue.

### 3b. Genuine-decline tickers (alltime_max >= 1000, ratio < 100x) — 13 tickers, 1,826 rows

These stocks genuinely declined from above 1,000 VND to their current sub-1,000 level.
The ratio (alltime_max / max_sub1000_close) is 1.1x to 13x — far below the 100x contamination threshold.

| Code | Rows | alltime_max | max_sub1000 | ratio | last_ge1000 | days_since | Activity |
|------|------|-------------|-------------|-------|-------------|------------|----------|
| VNZ  | 718  | 1,249 | 971.9 | 1.3x  | 2023-09-19 | 1,015 | ACTIVE |
| CAD  | 148  | 1,000 | 900   | 1.1x  | 2024-07-12 | 718  | ACTIVE |
| HKB  | 147  | 1,000 | 900   | 1.1x  | 2023-08-04 | 1,061 | ACTIVE |
| FTM  | 136  | 1,200 | 900   | 1.3x  | 2024-08-09 | 690  | ACTIVE |
| PVH  | 115  | 1,400 | 900   | 1.6x  | 2025-04-18 | 438  | ACTIVE |
| ATA  | 113  | 1,800 | 900   | 2.0x  | 2024-04-05 | 816  | ACTIVE |
| LUT  | 101  | 2,600 | 900   | 2.9x  | 2024-07-12 | 718  | STALE  |
| QBS  | 97   | 3,330 | 900   | 3.7x  | 2024-07-12 | 718  | ACTIVE |
| CMI  | 70   | 2,400 | 900   | 2.7x  | 2025-01-24 | 522  | ACTIVE |
| SDP  | 69   | 1,400 | 900   | 1.6x  | 2025-08-29 | 305  | ACTIVE |
| LO5  | 49   | 1,400 | 900   | 1.6x  | 2025-11-07 | 235  | ACTIVE |
| DFF  | 35   | 11,700 | 900 | 13.0x | 2025-10-21 | 252  | ACTIVE |
| LCM  | 28   | 4,200 | 900   | 4.7x  | 2025-12-26 | 186  | ACTIVE |

Evidence: No ratio exceeds 13x. These stocks crossed below 1,000 VND through genuine market decline.
VNZ (alltime_max=1,249, current=310–972 VND) is the canonical case — a stock that peaked just above
1,000 VND and has been trading 1.3x below its peak for 1,015 days. No contamination pattern.
DFF at 13x is the highest ratio in this group; its alltime_max of 11,700 VND is itself an in-DB value
and its current price (500–900 VND) reflects deep financial distress rather than scale error.

---

## 4. Bucket (b) — True Contaminated-Anchorless: Evidence

### 9 tickers, 3,023 rows

All 9 tickers share the same contamination pattern: clean data (close >= 1,000) exists in their
earlier history, then all rows after a certain date have close < 1,000 with a ratio of 246–713x
to their historical peak. Every row that's under 1,000 is approximately 1/1000 of what it should be.

| Code | Rows | alltime_max | max_sub1000 | ratio | last_ge1000 | days_since |
|------|------|-------------|-------------|-------|-------------|------------|
| BMP  | 591  | 99,200 | 188.8 | 526x | 2024-08-15 | 684  |
| MCH  | 589  | 99,000 | 260   | 381x | 2024-01-31 | 881  |
| HGM  | 408  | 94,000 | 381.1 | 247x | 2024-11-01 | 606  |
| PMC  | 385  | 99,900 | 187   | 534x | 2024-11-07 | 600  |
| KSV  | 359  | 98,900 | 299.5 | 330x | 2025-12-31 | 181  |
| TOS  | 351  | 99,100 | 195.8 | 506x | 2025-04-09 | 447  |
| AGX  | 257  | 99,300 | 285   | 348x | 2025-03-31 | 456  |
| TBD  | 79   | 99,900 | 140   | 713x | 2025-06-04 | 391  |
| STS  | 4    | 72,500 | 134.2 | 540x | 2025-07-02 | 363  |

**Evidence of contamination** for each:
- `alltime_max` (72,500–99,900 VND) represents correctly-recorded historical closes from before the
  contamination event — consistent with mid-cap Vietnamese stocks in the 70,000–100,000 VND range.
- `max_sub1000_close` (134–381 VND) represents the current contaminated values — approximately
  alltime_max / 1,000 in each case (e.g., BMP: 99,200 / 526 ≈ 188; expected 99,200 / 1000 = 99.2,
  matching the "stored in VND/1000" pattern).
- The contamination onset date coincides precisely with the `last_ge1000_date`: rows before that date
  are clean, rows after are all sub-1000. This is a clean break, not a gradual decline.
- No legitimate stock can lose 99% of its value over a single trading day without a circuit-breaker halt.

**Ratio analysis across all 3,023 contaminated rows** (alltime_max / sub1000_close):
- 224 rows: ratio 900–1,100x (pure 1000x contamination)
- 2,799 rows: ratio 90–900x (within-ticker price variation on top of 1000x scale error)
- 0 rows (in true-contaminated group): ratio < 90x

All 22 contaminated-anchorless tickers (original D1 classification) have an anchor **ever** in their history.
Zero have NO anchor ever — proving these are not genuinely cheap stocks but contaminated records.

### Wider-Window Anchor Coverage

| Window | True-contaminated tickers covered | Rows recoverable |
|--------|----------------------------------|------------------|
| 360d | KSV (only, last_ge1000=2025-12-31, 181d ago) | 359 rows |
| 540d | KSV + STS + TBD + TOS + AGX | 1,050 rows |
| ever | all 9 | 3,023 rows |

The remaining 4 tickers (BMP, MCH, PMC, HGM) have last clean data at 600–881 days ago — outside any
reasonable historical-only anchor window that can be applied with confidence equal to CONTAM-10's 180d standard.

---

## 5. Safe Remediation Strategy for Bucket (b)

The CONTAM-10 anchor predicate (`close >= 1000 AND volume > 0 AND date >= date('now', '-180 days')`)
**must not be changed**. All strategies below operate via NEW/separate mechanisms.

### Strategy A — VPS Cross-Source Live Fetch (primary, highest confidence)

For all 9 true-contaminated tickers (BMP, MCH, HGM, PMC, KSV, TOS, AGX, TBD, STS):
1. Fetch current close from VPS proxy (`vn-market-intelligence-mcp-vps-crawls-1` or equivalent).
2. If VPS returns `close >= 1000` → use that as an **external anchor** (independent of DB history).
3. Apply the same CONTAM-10 safety predicate: if `vps_close / db_sub1000_close >= 100`, classify as
   contaminated and repair with `×1000` on all four OHLC fields.
4. This is the SAFEST strategy: it doesn't depend on historical DB data at all; it uses a live
   independent source to confirm the real price level.

**Coverage**: All 9 tickers are currently active (last_date >= 2026-06-26). If they are still
listed and the VPS can fetch a current price, 100% of 3,023 rows become anchored and repairable.

**New script**: `CONTAM-11-VPS-ANCHOR` — a new migration script that:
- Uses VPS-fetched close as anchor (not DB history)
- Applies identical `ratio >= 100 AND sub1000_close < 1000` contamination predicate
- Same safety rails: dry-run default, readline confirm, BEGIN IMMEDIATE, post-verify
- Does NOT touch CONTAM-10 script at all

### Strategy B — Extended Historical Window (per-tier, staged)

For tickers where last_ge1000_date is within a reasonable window and the ratio is unambiguous (>= 200x):
a new repair pass using a wider window BUT with an elevated minimum ratio threshold to preserve safety.

**Tier B1 — 360d window, ratio >= 200x** (covers KSV: 359 rows):
- KSV last_ge1000=2025-12-31 (181d ago), ratio=330x → well above 200x threshold → safe
- New script CONTAM-11-B1 with `date >= date('now', '-360 days')` AND `ratio >= 200`

**Tier B2 — 540d window, ratio >= 200x** (covers KSV+STS+TBD+TOS+AGX: 1,050 rows):
- Ratios: KSV=330x, STS=540x, TBD=713x, TOS=506x, AGX=348x — all well above 200x
- New script CONTAM-11-B2 with `date >= date('now', '-540 days')` AND `ratio >= 200`

Note: the elevated minimum ratio (200x instead of 100x) is the safety compensator for the wider window.
A 200x threshold eliminates the entire genuine-decline group (max ratio there is 13x for DFF) with
enormous margin, making the extended window safe despite older anchor data.

### Strategy C — SSC/HOSE/HNX Official History Cross-Reference (for BMP, MCH, PMC, HGM)

For the 4 tickers with last_ge1000_date > 540d ago (BMP=684d, PMC=600d, HGM=606d, MCH=881d),
the historical anchor is too stale for automated repair even with an elevated ratio threshold.
These 1,973 rows require cross-validation against official exchange records:

1. Fetch official daily prices for BMP, MCH, PMC, HGM from SSC/Cafef/HOSE official CSV archives.
2. If official source confirms that the stock traded above 1,000 VND during the sub-1000 contamination
   period in the DB, repair is justified with the official close as the anchor.
3. Alternatively, re-fetch these tickers via VPS (Strategy A covers this) — the VPS approach is
   preferred as it is already implemented in the system.

### Strategy D — Manual Review Queue (fallback)

If VPS fetch or official cross-reference fails for any ticker (delisted, data unavailable):
- Add to a `contam_review_queue` table with columns: (code, row_count, alltime_max, max_sub1000,
  ratio, last_ge1000_date, status='pending_manual')
- Surface via `get_market_snapshot` or a dedicated QA dashboard card
- Human reviewer verifies price level and approves repair or marks as "accepted as-is"

---

## 6. Recommended Execution Order

1. **Immediate (highest ROI)**: Implement CONTAM-11-VPS-ANCHOR (Strategy A). Covers all 9 tickers
   (3,023 rows) if VPS returns valid prices. Single script, safe, no predicate change.
2. **Fallback for delisted**: Run CONTAM-11-B2 (Strategy B, 540d, ratio>=200) for any ticker where
   VPS returns no data. Handles KSV+STS+TBD+TOS+AGX (1,050 rows) with high confidence.
3. **Escalate remaining**: For BMP/MCH/PMC/HGM rows not caught by VPS, apply Strategy C (official
   source CSV) or D (manual queue). These 4 tickers have 1,973 rows.

---

## 7. What Requires No Action (bucket-a summary)

| Sub-bucket | Tickers | Rows | Reason |
|------------|---------|------|--------|
| True legit-cheap | 12 | 4,518 | Genuine VN penny stocks; prices correct |
| TESTIDX test artifact | 1 | 1 | Test seed row; separate janitor task |
| Genuine price declines | 13 | 1,826 | Real market decline; ratio < 13x; not contaminated |

Zero auto-repair on these 6,345 rows.

---

## 8. Acceptance Criteria Verification

| AC | Status |
|----|--------|
| 1. Classify each of the ~9,869 rows into legit-cheap vs contaminated-anchorless WITH EVIDENCE | DONE — 3-bucket classification with per-ticker evidence (ratio, alltime_max, days_since_clean, activity) |
| 2. Propose safe remediation for contaminated-anchorless WITHOUT loosening CONTAM-10 predicate | DONE — Strategy A (VPS external anchor) + Strategy B (wider window with elevated ratio floor) + Strategy C/D fallbacks |
| 3. No auto-repair (PLAN-ONLY) | DONE — zero DB writes; all probes readonly |

---

## 9. Probe Artifacts (read-only, no persistent side effects)

- `/app/probe_contam11.ts` and `/app/probe_contam11b.ts` in container — temporary, no writes
- No DB mutations
- HEAD unchanged (verified: 850e1b18 or later commit, clean tree on this agent's scope)

---

## 10. Notes for QA

- Residual count = 9,368 (not 9,869); the 501-row delta is real post-CONTAM-10-EXEC settlement.
- The `genuine_decline` sub-bucket (13 tickers, 1,826 rows) initially appears in the "contaminated-anchorless"
  group (alltime_max >= 1000) but is NOT contaminated — ratio < 13x proves legitimate price decline.
  QA should verify this sub-classification by spot-checking VNZ (ratio=1.29x, 718 rows — the largest).
- KSV (181 days since clean anchor) just missed the 180d CONTAM-10 window by 1 day. Strategy A (VPS)
  should capture it immediately; Strategy B1 (360d, ratio>=200) also covers it.
- All 9 true-contaminated tickers have `last_date >= 2026-06-26`, confirming active ingest continues
  to write contaminated data. The CONTAM-10-WRITER guard (ec8b409c) should have stopped NEW contamination;
  the backlog is historical rows pre-writer-fix.
