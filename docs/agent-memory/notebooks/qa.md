# QA — Notebook


## cycle-182 · 2026-06-01 · SELF-CRITIQUE-DETECT Phase-1 QA gate — PASS

Sprint: SELF-CRITIQUE-DETECT | Gate: static read (PLAN-ONLY, no code run, no merges)
Verdict: PASS — C1 and C5 both fully satisfied. Shadow pilot CLEARED TO ARM pending operator greenlight.
Report: reports/TASK_REPORT_SELF-CRITIQUE-QA.md

C1 (pilot-scope gate): allowlist exactly {news-scout, dev-team} confirmed at SKILL.md L18; gate is FIRST in SC-0 (L17-19) before daily-cap glob (L22); non-pilot cowork agents exit at SC-0 before SC-1; dev-team explicitly listed in allowlist.
C5 (commit safety): SC-5 explicit paths only + "NEVER -A or ." text present; commit-mutex Step 4 release-on-every-exit-path enforced; invocation contract (own_paths + intent via wiring pattern) matches commit-mutex schema; owner_agent/ttl_seconds supplied by skill itself as designed.
S1-S5 spot-check: all invariants present in both brief §5 and SKILL.md footer, consistent, no drift.

---

## cycle-183 · 2026-06-02T05:27Z · A-01b-4 not_deployed fix — PASS

Sprint: A-01 (Dashboard two data planes) | Task: A-01b-4 | Verdict: PASS

**Clause A — false-RED resolved (read-only)**
- `GET localhost:4000/health` → `status:"ok"`, exactly 7 services `not_deployed` (pdf/rag/ta/stock/kinh-dich/alert/news), mcp+macro both `ok`, latencies −1 for not_deployed set.
- `docker ps` → exactly 5 containers running, all healthy. Zero of the 7 not_deployed services started.
- Frontend `localhost:3001/dashboard/services` → top badge green `UP`, each of the 7 shows grey `NOT DEPLOYED` badge, loader stream confirms `overallStatus:"ok"` + `status:"not_deployed"` x7 in SSR JSON.

**Clause B — anti-false-green PROVEN-RED (controlled live test)**
- `docker stop vn-market-intelligence-mcp-macro-indicators-1` executed.
- POST-STOP `GET localhost:4000/health` → `status:"degraded"`, `macro:"down"`. Overall is NOT `ok`. Not_deployed set unchanged (all 7 still `not_deployed`). PROVEN-RED: real deployed-service outage is NOT suppressed.
- `docker start vn-market-intelligence-mcp-macro-indicators-1` → restored. POST-RESTORE health: `status:"ok"`, `macro:"ok"`. Final container count: 5 (all healthy). None of the 7 not_deployed services were started at any point.

Both clauses PASS. No critical false-green detected. Fix correctly limits suppression to the known not_deployed set only.

---

## cycle-184 · 2026-06-02T08:10Z · FE-RR-QA-1 — FE-REROUTE Phase 1 — PASS

Sprint: FE-REROUTE | Task: FE-RR-QA-1 | Verdict: PASS | Commits: mcp-server 1f27d188, api-gateway c7f19ea3

**Container count: 5** (mcp-server, api-gateway, frontend, macro-indicators, mcp-gateway). Zero of the 7 not-deployed services started.

**KD readings (per-ticker, not constant)**
- FPT: `{"hexagram":39,"name":"Kiển","trend":"BẤT LỢI","signal":"BAN (tiêu cực)","confidence":0.475,"timestamp":"2026-06-02 05:47:03"}`
- VCB: `{"hexagram":8,"name":"Tỷ","trend":"TRUNG TÍNH","signal":"THAN TRONG (tích cực)","confidence":0.475}`
- Differ: hex 39 vs 8, signal negative vs positive. Per-ticker DB data confirmed.

**DB spot-check (anti-mock)**
- `kinhdich_readings WHERE stock_code='FPT' ORDER BY timestamp DESC LIMIT 1` → hexagram_number=39, trading_signal="BAN (tiêu cực)", confidence=0.475, timestamp="2026-06-02 05:47:03". Matches endpoint exactly. No Math.random, no placeholder data in handler files.

**KD market aggregate**: `{"hexagram":29,"name":"Tập Khảm","derived":true}` — derived field present.

**Price history VNINDEX**: 4 rows, dates 2026-05-28→2026-06-02, close range 1836.1–1863.67 (plausible VN-Index). FPT: 5 rows, 2026-05-28→2026-06-02, close 71200–74900.

**Batch prices FPT/VCB/HPG**: FPT close=74900 changePct=+2.74 direction=up; VCB close=62100 changePct=-0.16 direction=down; HPG close=23850 changePct=-0.83 direction=down. Real per-ticker data.

**News Reuters**: `{"source":"reuters","count":0,"articles":[]}` — honest empty (no reuters rows in DB yet), HTTP 200, not 502, not fabricated.

**TA honest-503**: POST /ta/ta/indicators → HTTP 503 `{"error":"not_deployed","service":"ta","detail":"Service \"ta\" is not deployed..."}`. Not 502, not fabricated indicators.

**Frontend SSR** (localhost:3001/dashboard/analysis?stock=FPT): stream contains hexagram 39 "Kiển" for FPT, hex 29 "Tập Khảm" for market, VNINDEX=1836.1, FPT close=74900, all 30 watchlist tiles with real prices. Zero "502" error string in loader data. TA field present but data from mcp agent_signals (not TA service). No "Không tải được" error banner found in stream data.

**Anti-mock**: priceBatchHandler.ts "placeholders" = SQL parameterized `?` markers — correct security practice, not fake data. Zero Math.random / fabricated values in all 5 new handler files.

VERDICT: PASS — all 7 acceptance criteria met. Real DB-backed data via gateway re-route; TA honest-503; news honest-empty; 5 containers; SSR renders real values.
