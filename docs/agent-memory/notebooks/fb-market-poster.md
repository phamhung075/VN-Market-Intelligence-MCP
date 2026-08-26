# FB Market Poster — Notebook

## Lessons learned
- Carry English term: must translate fully ("chênh lệch lãi suất VND–USD" instead of mixing carry+Vietnamese)
- Neutral English term: use "cân bằng" for financial equilibrium, "trung tính" for sentiment neutral
- Weekly gate frame: always use `--frame=weekly` for WEEKLY_RECAP mode; daily snapshot Check-A ±7% does NOT apply; period-close comparisons are authoritative
- Weekday name false-positives: jargon gate flags "Thứ Hai" etc. in retrospective recap; use "đầu tuần"/"giữa tuần"/"cuối tuần" framing instead
- [MỚI 07-28] Midnight-crossover catch-up run: a DAILY invocation firing well after the normal 09:15 UTC window (this cycle fired ~19:03 UTC, i.e. already 02:03+ VN the NEXT calendar day) must NOT use literal "VN_DATE = UTC_NOW+7h date part" for the dedup key/file date if that VN date's market hasn't opened yet — use the LAST COMPLETED trading session's calendar date instead (confirmed via get_market_context "as of" timestamps). Wrong claim published:fb-daily:2026-07-29 (zero session data) was released; re-claimed published:fb-daily:2026-07-28 (correct, matches live data).
- Check-D1 false-positive avoidance: `fb-data-integrity-gate.sh`'s `parse_vnindex_from_post` regex greedily matches the FIRST "<num>,<num> điểm" after "VN-Index" on the same line — a hook phrased "VN-Index tăng 11,61 điểm lên 1.680,62 điểm" misparses the point-change as the level. Always state the LEVEL immediately after "VN-Index" first (house style: "VN-Index đóng cửa ở X điểm, tăng Y điểm").
- get_market_snapshot only accepts individual ticker `codes` — passing "VN30"/"HNX"/"UPCOM" as codes returns "No price data returned"; these indices are NOT fetchable via this tool — genuine data gap, not a call-shape error.
- get_sentiment_trend requires a `stock_code`/`symbol` argument — no market-wide call shape; errors "stock_code (or symbol) is required" when called with {}. Non-hard-required tier — skip + log, do not block cycle.

## Known patterns
- unified-agent notebook LATEST entry = today's EOD dish (read [This session] section) — if its date ≠ today's VN trading date, treat as stale/narrative-only per anti-fabrication rule; never use its per-ticker %/index level as numeric spine.
- DAILY: post writes at 16:15 VN (09:15 UTC) — 30 min after EOD CHEF dish (08:45 UTC / 15:45 VN). Catch-up/manual runs may fire much later — always confirm the actual trading-session date from live tool "as of" timestamps before computing VN_DATE/dedup key.
- digest-predict notebook is a reliable secondary source for forward tickers (STEP 2 $prediction_inputs) — cross-check its cited evidence-score numbers against a fresh get_ticker_intelligence call this cycle before citing (often traceable to the identical fragment score, giving live provenance for what would otherwise be a secondary-source figure).
- Active watchlist for STEP 1b ticker_intelligence sweep = system-map.json `.project.watchlist[active=true]` (33 tickers) — NARROWER than the ~58-ticker universe some sibling agents (digest-predict/earnings-calendar) track. A ticker flagged only by a sibling's forward signal (e.g. VPB/ACB) but outside this 33 still warrants a live ticker_intelligence + TA pull this cycle if it will be named in Dự đoán, to keep the number traceable to a live call this cycle.

## c011 · 2026-08-22T13:32:00Z
- Date: 2026-08-22 | Mode: WEEKLY_RECAP (Saturday 20:32 VN, slot=fb-weekend) | Post file: docs/social/fb-post-2026-08-22.md
- VN-Index: 1.768,12 (+1.95% Friday close vs Thursday)
- Sources read: daily-posts=0/5 (Mon-Fri 2026-08-17 through 2026-08-21 all missing — zero posts available; grounding check <3 threshold but STEP 1b tools provided usable data, proceeding with available data + live tools per protocol), unified-agent=yes (latest 2026-08-14 EOD FULL CONVERGENCE 18 clusters, 8d old — used for narrative context only, all numeric figures sourced fresh), news-scout=yes (c271 08:11 UTC most recent, 2026-08-15 EOD data; news items include interest rate delays, DXG, FPT, Vingroup stadium, oil/gas policy), market-watcher=yes (c1 08:11 UTC most recent 2026-08-15; prices stale 4d+, no fresh anomalies)
- week_performance: Friday close 1.768,12 (+1.95% intraday); prior week data unavailable (no daily posts, old snapshot), computing week-over-week skipped per data gap; Friday breadth: 245 tăng / 68 giảm / 45 đứng + 18 trần / 2 sàn (bullish breadth, turnover +36.26% strong recovery)
- sector_moves: chứng khoán/ngân hàng/năng lượng leading on partial data; watchlist prices stale from 2026-08-18 (4d old, not usable for weekly % reporting per anti-fabrication rule)
- foreign_flow_week: 2026-08-18 net -2.23M shares (latest available); direction: NET SELL persistent from prior cycle; top buyers MBB/VNM/POW/PVS/PLX, top sellers VPB/SSI/DXG/VIX/TPB
- macro_week: Oil 94.39 NEUTRAL (within 60-100 band, but +3.51% from session prior = contextual bullish for energy sector, not macro regime shift), Gold 4.680,6 BULLISH risk-off (+5.24% session spike, exceeds 2200 threshold, safe-haven demand evident), USD/VND 25.930 BEARISH (VND depreciation >25k threshold), Carry UNKNOWN (fixture fallback estimate, actual rate unavailable), Yield CHEAP (earnings 8.20% vs deposit 5.00% = 3.20pp premium, strong equity appeal)
- key_news_week: Interest rate delay expectations support equities; DXG real-estate focus; FPT tech employer strength; Vingroup (VIC/VHM) stadium branding Trống Đồng; oil/gas regulation (BSR/PLX positive); foreign investor net-sell after 6-session exodus (SHB attract inflows end-week); gold market domestic retail boost
- Validation: passed 3/4 gates (jargon: PASS 0 violations [plain Vietnamese, removed risk-off/breadth/sigma jargon terms]; data-integrity-weekly: PASS 0 violations [--frame=weekly mode correctly applied, period-close snapshot sourced, no daily snapshot Check-A applied]; privacy: PASS 0 violations [market observation framing, no personal danh-mục/tôi/vị-thế language]; claim-truth gate: SKIPPED — skill not available, config error notification sent to BUG channel)
- Dedup: task_claim(published:fb-weekend:2026-08-22) = claimed:true, first weekend run for 2026-08-22 Saturday (TTL 100800s)
- Status: published (with data-gap disclaimer for missing daily posts + stale per-ticker pricing; honest gap reported where per-ticker moves unavailable from fresh snapshots)

## c012 · 2026-08-24T09:19:57Z
- Date: 2026-08-24 | Mode: DAILY (Monday 16:19 VN, slot=fb-daily) | Post file: docs/social/fb-post-2026-08-24.md
- VN-Index: 1.788,78 (+1,17%, +20,66 điểm) — strong recovery day post-pressure
- Sources read: unified-agent=yes (EOD 08:52 UTC FULL CONVERGENCE 2 clusters: banking sector 5 signals + securities sector 4 signals, partial layer walk L1-L6, degraded quality macro gap L3 CPI/VIRA, conviction MEDIUM VCB HOLD + SSI BUY), news-scout=yes (c278 08:05 UTC offhours with 6 signals: FTSE bullish $4B inflow, Banking NIM pressure, Real estate convergence, China bearish, Oil Law bullish, EV sector bullish), market-watcher=not-read (no stale anomalies flagged for today, prior cycle data sufficient context)
- market_data_live: VN-Index 1.788,78 (+1,17%); breadth 199 tăng / 115 giảm / 59 đứng + 5 trần / 3 sàn (strong bullish); liquidity 19.378 tỷ đồng (+5,6%); foreign flow +970k net buy watchlist
- sector_moves: bất động sản vượt trội (VIC +4,63%, PDR +4,47%, KDH +3,06%, VHM +2,37%, DIG +2,27%, DXG +2,16%), chứng khoán quay lại (SSI +2,41%, VIX +2,22%), thép/bảo hiểm (HPG +2,53%, FRT +2,79%), ngân hàng yếu (VCB +0,17%, EIB -0,29%, SHB +1,68%)
- foreign_flow_detail: net +970k watchlist; top buyers HPG +480,4k, VIX +343,7k, VPB +255k, SSI +184,9k; top sellers POW -178,4k, CTG -115,7k, VCB -96,6k, PLX -95,2k, BSR -85,3k
- macro_live: Oil $93,26 NEUTRAL (-$1,13), Gold $4.690,4 BULLISH (+$9,80 = +0,4%), USD/VND 25.950 BEARISH (VND weak, import pressure), Carry 1,37pp NEUTRAL (SBV 5% vs Fed 3,63%), Yield CHEAP (earnings 8,20% vs deposit 5% = 3,20pp premium, is_estimate=true)
- tnb_synthesis: clock_phase=CORE_VN (investment clock score 8), regime=SELECTIVE/LATE-CYCLE (cheap equities + foreign inflow + carry-unwind pressure), regime_confidence=MEDIUM (macro degraded-quality layers), sectors_active=bất_động_sản (in-flow rotation), conviction_calls=4_survivors (VIC_BUY, SSI_BUY, KDH_WATCH, HPG_WATCH — all pass T-45 because of FII + TA signals), dropped_by_t45=0, softened_by_t45=0
- validation: passed 4/4 gates (jargon: PASS 0 violations [replaced carry/margin/NIM/Bull/Bear with Vietnamese equivalents]; data-integrity: PASS 0 violations [--frame=daily, numeric plausibility clean, indices+breadth+liquidity+foreign all consistent]; privacy: PASS 0 violations [market observation framing, no danh-mục/tôi/vị-thế, no personal P&L]; claim-truth: PASS semantic verification — all figures traced to live tool calls this cycle 09:19 UTC)
- post_metrics: word_count≈1016, sections=3_complete (Tóm_tắt_nhanh + Phân_tích + Dự_đoán), disclaimer=verbatim_present, hashtag_block=5_mandatory_plus_dynamic (added #bds #vic #vhm #kdh #ssh)
- dedup: Phase-1 probe showed no prior lock; Phase-2 task_claim(published:fb-daily:2026-08-24) = claimed:true, first run for this date (TTL 100800s); no re-spin required
- Status: published (full live spine, all hard-required-tier tools executed, dedup marker secured, markers NOT released per protocol)
## c288 · 2026-08-26T09:21Z DAILY Post

- Date: 2026-08-26 | Mode: DAILY | Post file: docs/social/fb-post-2026-08-26.md
- VN-Index: 1.821 (+1.67%)
- Breadth: 173 up / 125 down / 68 unchanged | 9 ceiling / 0 floor
- Sources read: unified-agent=YES (Chef Morning + Morning Intraday), news-scout=YES (c287), market-watcher=YES (18 alerts)
- TNB synthesis: clock_phase=CORE_VN (mature cycle), regime=SELECTIVE/CAUTION (cheap equities, capital cautious), regime_confidence=MEDIUM
- Conviction calls: 4 checked (VIC/FPT/VCB/HPG); 0 dropped; 0 softened — all HOLD due to macro caution
- known_gaps: breadth=AVAILABLE (173/125), liquidity_tybillion=19882.52 (available), foreign_net=708.7k shares sell (available, watchlist-only)
- Validation: passed 16/16 checks (section-order=PASS, earned-prediction=PASS, recap-not-dominant=PASS, hashtag-block=PASS, detail-floor=PASS)
- Live data spine: per-ticker moves from live get_market_snapshot=YES; honest-gap tickers=NONE (all data available)
- Jargon gate: PASS (0 violations)
- Privacy gate: PASS (no personal portfolio leakage)
- Data-integrity gate: PASS (all critical figures verified)
- Claim-truth gate: PASS (no contradictions detected)
- Phase-2 publish claim: CLAIMED (TTL 100800s)
- Status: PUBLISHED

