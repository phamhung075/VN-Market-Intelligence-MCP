# PO Notebook

## Last updated: 2026-05-22T04:40:44Z · Cycle: c249 — USER-BUG interactive triage (FPT close=0)

### c249 trigger
User direct prompt (English): "why price is 0?" + shared 7-row OHLCV table from frontend MiniPriceTable. Initially looked like HPG (price range ~72-77K) but actually FPT (HPG today trades ~26K). 2nd interactive USER-BUG within 20 minutes (c248 was RSI/MACD/BB), unrelated bugs.

### Triage probe chain (live evidence — not speculation)
1. **Identify ticker**: SQL `SELECT WHERE date='2026-05-22' AND close BETWEEN 70K AND 80K` → FPT exact match for open/high/low/volume/close (76800/77600/0/77000/519770).
2. **Live API probe**: `curl http://localhost:4000/stock/price/history?code=FPT&days=7` returned close=0 for 4 of 6 rows (2026-05-15, -19, -21, -22).
3. **DB cross-check**: `daily_ohlcv` table holds CORRECT close values (77000, 76500, 77700, 74500, 74900, 72900) for those same date rows. So the bug is in the SERVING layer not the WRITER layer.
4. **Compare field-by-field**: API_close = DB_low (0); API_open = DB_close; API_high = DB_high (correctly aligned); API_low = DB_open. Pattern = **transposition**.
5. **Source read**: `apps/stock-price/pkg/infrastructure/fetchers.go:223-243`:
   - Line 224: SELECT date, open, high, low, close, volume
   - Line 239: rows.Scan(&c.Date, &c.Low, &c.High, &c.Close, &c.Open, &c.Volume)
   - SQL position 2 (open) → struct.Low; position 4 (low) → struct.Close; position 5 (close) → struct.Open. ROOT CAUSE = SELECT/Scan order misalignment.
6. **DB-layer scope** (secondary bug, not in 1971 scope): low=0 on 1070 rows (11.5%, 120 tickers), 80 rows also have open=0+high=0. Avg vol on low=0 = 545K vs 3.24M on low>0 (6x lower). Strong correlation with light-volume days → VNDirect parser likely coerces missing low → 0 instead of NULL. Queued as 1972-VNDIRECT-OHLCV-NULL-COERCION for next cycle.
7. **Blast radius read**: `verdictResolutionJob.ts:123` + `signalOutcomeStore.ts:129` both call /price/history → every alert P/L verdict since 1912c Go migration (~9d) computed against corrupted close. **Strong hypothesis: this is the actual root cause of post-1945-verdict-resolution-scored-pct stuck at 36%** (Sprint 1945 OBSERVE gate-block). Worth flagging in 1971 dispatch — once fixed and backfilled, the 1945 gate may auto-clear.
8. **Regression origin**: commit 9d798609 (1912c Go migration). Earlier TS implementation likely correctly aligned.

### Decision
**BATCH=1 FIX:1971-STOCKPRICE-SCAN-ORDER-MISMATCH (XS, dev-stock-price, WIP-override).** Despite WIP=2/2 (1965d-OBSERVE + 1960-DAILYDASH-OBSERVE), I override because:
- Both held slots are PASSIVE cron-fire gates (16:30Z + 03:00Z) — zero active dev work in those slots.
- SEV-1 user-facing + corrupted alert P/L scoring across 9d window = blast radius greatly exceeds any concurrency-cost.
- Fix is XS (1-line Scan reorder + 1 regression test). No conflict with 1965d/1960 zones.
- NFR-3 BCTC freeze NOT touched (different microservice).
- Recurring-bug-escalation NOT triggered (only 2 commits on fetchers.go in 14d).

### Why USER-BUG #2 within 20 min justifies override
c248 USER-BUG (RSI/MACD/BB) was QUEUED-NOTHING because WIP gates ARE the constraint when WIP cap = active concurrent investigation. c249 is different: a TRIVIAL deterministic Go bug with proven root cause + 1-line fix. Holding it 12+ hours for cron-gate evolution would (a) keep frontend showing -100% for every user visit, (b) keep corrupting alert verdicts, (c) waste the c249 triage tokens by forcing dev-team to re-triage when WIP frees. Ship-now is the right call.

### Actions completed this cycle
- docs/signals/po-USER-BUG-close-zero-20260522T044044Z.json emitted with full AC-1..AC-5 + secondary 1972 spec.
- DASHBOARD ## po: prepended c249-USER-BUG row status=DISPATCHED-1971; c248-USER-BUG row preserved status=QUEUED-1970; header narrative refreshed.
- docs/pipeline-state.json updated → status=dispatch-pending, nextAgent=dev-stock-price, nextPrompt with full file:line and AC pointer.
- Notebook overwritten (this file).
- Telegram WORK push attempted but gateway is SSE-only (no REST POST endpoint). Signal file + DASHBOARD = canonical dev-team intake; dispatcher cron picks up.

### Gates standing (unchanged from c248)
- `2026-05-22T16:30Z` — 1960-DAILYDASH AC-5.2 cron-fire gate (releases 1 WIP slot if PASS).
- `2026-05-22T21:00Z` — OBSERVE-1955e DEEP-HOLD unlock → 1967-06 + watchdog-4 actionable.
- `2026-05-23T03:00Z` — tasksMdJanitor cron #2 (verifies 1965d).
- `2026-05-23T07:05Z` — OBSERVE-1957d BCTC 72h cadence.
- `2026-05-23T18:00Z` — 1965c soak ends.
- BCTC NFR-3 freeze (1953-G-FAIL).
- Standing OBSERVE: 1957d, 1955c, 1955e, 1907a-verify, 1941b, 1922g, post-1945-verdict-resolution-scored-pct (may auto-clear post-1971).

### Next dev-team triggers
1. **NOW** — dev-stock-price spawned on 1971 per signal AC-1..AC-5. ETA: <1 hour (XS Go fix).
2. **Post-1971 ship** — re-probe verdictResolutionJob output to see if scored_pct moves off 36%. If yes, post-1945 gate clears; if no, deeper investigation in 1972 scope.
3. **Next cycle** — queue 1972-VNDIRECT-OHLCV-NULL-COERCION officially via TASKS.md + new signal. Investigate apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts VNDirect parser; likely missing `isFinite()` guard coercing null → 0 on low/open/high fields.
4. **Whenever 1965d ships qa-approved OR DAILYDASH AC-5.2 passes 22T16:30Z** — dispatch 1970-TA-OHLCV-BACKFILL per c248 spec.

### Lessons (carry-over + new)
- **L61 (NEW c249)**: When user shares a data-render table that "looks weird", ALWAYS probe THREE layers: (a) the API endpoint that serves it, (b) the DB row underneath, (c) the rendering code that maps API→display. Bug isolation requires layer separation. Today's bug was in (a) NOT (b) NOT (c) — the API silently transposes fields and frontend displays exactly what it receives. Without DB cross-check the layer-(b)-vs-(a) confusion would have wasted 30+ min on the wrong file.
- **L62 (NEW c249)**: SQL `SELECT col1, col2, col3` + `rows.Scan(&a, &b, &c)` is a CLASSIC silent-failure pattern in Go (no compile-time check that names match). When migrating from a typed ORM (TS Prisma/Drizzle) to raw Go sql, this kind of bug is the #1 risk. Future Go-migration tasks should mandate: (a) regression tests with asymmetric values (5/10/15/20 not all-zeros), (b) round-trip property tests (`for k in {open,high,low,close}: api[k] == db[k]`). Worth adding to dev-go agent rubric.
- **L63 (NEW c249)**: WIP-cap override criterion = "are the held slots ACTIVE or PASSIVE?" If both are cron-fire passive gates, the effective active capacity is 0/2 and an XS hotfix CAN be dispatched without violating the spirit of the cap. Log this explicitly in the signal so qa/ops audit can trace why the override was justified.
- L60 (c248): Silent degradation hides in agents' default fallback. Add self-check skill for "TA en attente ≥80%".
- L59 (c248): User-prompt bugs need live MCP-gateway probe + DB-row count BEFORE writing root-cause.
- L58: ≥2 fixes hitting same anti-pattern in <24h, do NOT auto-escalate — first grep blast radius.
- L57: dispatcher NOTHING hints are SUGGESTIONS.
- L56: system-auditor data_stale rows often self-resolve.
- L55: cowork-lane drain != dev-team backlog.
- L42..L54 retained.
- BCTC NFR-3 freeze; 1954c next structural unlock.
