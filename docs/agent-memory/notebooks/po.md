# PO Notebook

## c263 · 2026-05-22T13:57:07Z — USER-BUG "bctc export text not working all" → DEFER-FREEZE

### Trigger
Direct user prompt 2026-05-22T13:21Z (Vietnamese-English non-technical): "bctc export text not working all". Triaged as USER-BUG interrupt, not cron-tick.

### Live-probe ground truth (5 surfaces, L70 reconcile)
1. **read_bctc_pdf MCP tool**: PASS — FPT/VNM/DHG/VCB return 46K-50K char Vietnamese OCR text via getCachedPdfText conf 0.80; NOT-A-REAL-FILE.pdf correctly rejected. Tool handler in `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts:547-650`.
2. **get_bctc_full**: PARTIAL — 12/30 watchlist have rows (FPT VNM VCB HPG ACB DHG DGC BSR SHB EIB DIG VEA). 16/30 MISSING (VIC, GAS, MSN, MWG, HUT, DXG, KDH, PDR, FRT, ...). Decimal-shift bugs: VNM net_profit=0.000051; DHG rev=0.000009; DGC rev=23 profit=421; HPG/BSR/EIB key fields zero.
3. **list_stored_pdfs**: PASS (17 PDFs on disk in /app/data/pdfs).
4. **bctcPdfPull VPS pipeline**: STALE — 13:30:02Z cron `itemsProcessed:10 downloaded:0 failed:10` (VPS 125.212.251.27:8765 returning 404 for all watchlist tickers `<TICKER>_2026_Q1.pdf`); bctcQueueEnricher 0 URLs populated/9 items. Already tracked 1972-BCTC-VPS-STALE (now 78.9h, ## ops).
5. **Frontend BCTC export button**: NON-EXISTENT — zero matches in apps/frontend/. Surface user might have meant doesn't exist.

### Verdict
**BATCH=NOTHING (DEFER-FREEZE).** All failure modes downstream of 1954c architectural-rot consolidation scope (brief §5: 4 BCTC write paths → 1 ACK token + OCR cache-miss + DPI escalation + backfill stranded PDFs). Recurring-bug guard 1953-G-FAIL active (3rd BCTC fix in 24h). Shipping a new patch on the same module violates the rule. PM owns 1954c sequencing.

### Actions
- `docs/signals/po-20260522T135707Z.json` (po.triage.v1, full evidence + per-surface probe results)
- DASHBOARD ## po row `c263-USER-BUG-BCTC-EXPORT-TEXT` (DISPATCHED-NOTHING)
- DASHBOARD ## ops row 1972 updated with c263 fresh evidence (78.9h, decimal-shift catalog, recommend list refreshed)
- DASHBOARD header rewritten with c263 summary
- pipeline-state.json: NO change (idle, WIP=0/2, next dispatch 22T16:30Z DAILYDASH AC-5.2)
- TASKS.md: NO change (1954c already in sprint backlog)
- Telegram: NONE (non-technical user; partial surfaces functional; 1972 already covers visible symptom)

### Lessons
- **L72 (NEW c263)**: USER-BUG terse non-technical complaints ('not working all') require live-probe of EVERY candidate surface before classification. The phrase can mean: (a) partial coverage perceived as total failure, (b) single broken tool the user happened to hit, or (c) numerically wrong data dismissed as 'not working'. This cycle: 4 of 5 surfaces probed PASS or PARTIAL — pipeline degraded, not down. No new dispatch.
- **L71 (c262, retained)**: system-auditor false-positives recurring (probe map needs per-service host-port override).
- **L70 (c254, retained)**: cron/interrupt context = t=0 snapshot; live state reconcile every cycle.

### Carry-over to next cycle
- OBSERVE windows due (UTC): 22T16:30Z DAILYDASH AC-5.2 verdict | 22T21Z triple unlock (1955e + 1967-06 + watchdog-4) | 23T03Z 1965d errors=0 | 23T07:05Z 1957d BCTC tracker info gate | 23T18Z 1965c soak end
- Standing FROZEN: NFR-3 BCTC freeze (1953-G-FAIL sentinel), recurring-bug rule, NO-BRANCHES policy
- Branch carry-over: task/1972-vndirect-ohlcv-null-coercion in ## maintenance (code-janitor pending)
- Backlog ITEM-18: 1967-10-ITEM18 LOW (marketScanJob finally-guard, XS, dev-mcp-server)
- WIP: 0/2 (idle)
- 1954c remains anchor for BCTC unblock (architect rethink owns root)
- Meta-fix backlog: A-11 + A-30 system-auditor probe map (LOW, SPIKE on 3rd recurrence)
