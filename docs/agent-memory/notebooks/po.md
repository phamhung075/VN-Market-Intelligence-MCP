# PO Notebook

## c264 · 2026-05-22T15:22:00Z — cron-1507Z dev-team triage (sys-auditor tier-2 14:30Z, 4 anomalies)

### Trigger
dev-team cron-1507Z spawn; sys-auditor tier-2 14:30Z appended 4 rows (B-01 + B-08 recurring; C-06 + C-07 net-new). WIP 0/2. Pipeline-state idle.

### Live-probe verdicts (L70/L72 reconcile — no trust of prior snapshot)
1. **B-01 CRITICAL** ssc-iboard 5.5h stale → **OBSERVE-MARKET-HOURS**. Current 15:22Z = 22:22 VN, market closed 08:30Z (6h52m post-close). 09:00Z VPS push = end-of-session dribble. Same context as 1960-B-04 / 1973 / 1959-B-01. No-dispatch; re-check Wed 02:00Z market open.
2. **B-08 CRITICAL** bctc-push 78.9h stale → **DEFER-FREEZE confirmed**. 1953-G-FAIL + 1954c standing; sys-auditor self-class matches.
3. **C-06 WARN** news_articles 0/3h → **FALSE-POSITIVE (probe-design)**. `sqlite3 market.db .tables` enumerates 60 tables, ZERO match `news_articles`. `grep apps/**/*.{ts,go,py,sql}` = ZERO matches. Probe references a non-existent table → returns 0 → WARN. Same class as A-11 + A-30.
4. **C-07 WARN** agent_signals 0/24h → **FALSE-POSITIVE (legacy substrate)**. Table EXISTS (60 rows total) but MAX(created_at)=2026-05-14T21:01Z = 8d stale. Frozen at Go-migration cutover. Live agent-bus = JSON files in docs/signals/ (not this SQLite). Probe targets unused legacy table.

### Verdict
**BATCH=NOTHING.** 4/4 reduce to non-dispatch. 2 probe-design FP + 1 market-hours-OBSERVE + 1 architect-freeze.

### Actions
- `docs/signals/po-20260522T152200Z.json` (po.triage.v1 — full 4-anomaly evidence + meta-fix appendix)
- DASHBOARD ## po row `c264-TRIAGE-B01-B08-C06-C07` (DISPATCHED-NOTHING)
- DASHBOARD ## system-auditor 4 rows annotated with PO verdicts (status updated: B-01→OBSERVE-MARKET-HOURS, B-08→DEFER-FREEZE, C-06→OBSERVE-FALSE-POSITIVE, C-07→OBSERVE-FALSE-POSITIVE)
- DASHBOARD header rewritten with c264 summary (c263 carried as prior-context)
- pipeline-state.json: NO change (idle, WIP=0/2 unchanged, next gate DAILYDASH 22T16:30Z)
- TASKS.md: NO change
- Telegram: NONE (4 anomalies all non-actionable for users)

### Lessons
- **L73 (NEW c264)**: system-auditor probe-design false-positive class now has 3 distinct flavors — (a) wrong-host-port (A-11), (b) wrong-URL-path (A-30), (c) wrong-table-name OR dead-legacy-table (C-06 + C-07). Until probe-map override per service+DB+table ships, EVERY system-auditor anomaly requires live-probe of the EXACT substrate before classification. c264 saved 2 false dispatches.
- **L72 applied** (c263→c264): live-probe every candidate surface before classification. Worked again.
- **L71 retained** (c262): probe map needs per-service overrides — meta-fix backlog now 4 items.
- **L70 retained** (c254): cron-prompt is t=0; reconcile live state every cycle.

### Carry-over
- OBSERVE windows (UTC): 22T16:30Z DAILYDASH AC-5.2 (~68min); 22T21Z triple unlock (1955e + 1967-06 + watchdog-4); 23T03Z 1965d errors=0; 23T07:05Z 1957d BCTC tracker; 23T18Z 1965c soak end.
- FROZEN: NFR-3 BCTC freeze (1953-G-FAIL), recurring-bug rule, NO-BRANCHES.
- Branch carry-over: task/1972-vndirect-ohlcv-null-coercion in ## maintenance (code-janitor pending).
- Backlog: 1967-10-ITEM18 LOW (marketScanJob finally-guard, XS, dev-mcp-server); 1954c anchor for BCTC unblock.
- Meta-fix probe-map backlog now 4 items (A-11 + A-30 + C-06 + C-07) — SPIKE threshold reached, LOW-prio (zero user-value impact).
- WIP: 0/2 unchanged.
