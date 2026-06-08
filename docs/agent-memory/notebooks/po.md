# PO Notebook

## c · 2026-06-08T16:20Z — Triage tick: 2 real defects DISPATCH, 1 PLAN-ONLY + 1 CLEAN backlog, SBV closed

**Trigger:** dev-team cron tick 16:15:30Z — board idle WIP0, may dispatch ≤2. 3 pendingSignals + 4 NEW signal_queue rows.

**Raw-verify (not badges):**
- price_anomaly_20260608T1600.json: `node JSON.parse` **FAILS** (leading-+ at L115 VCB yoy +2.17, L144 NVL daily +2.21). jq is lenient (accepts +) but drain-signals.js uses JSON.parse → whole 10-ticker EOD payload silently dropped. Producer = `docs/agents/market-watcher/flow/eod.md` template (no emit-raw-number rule). REAL defect.
- BCTC B-01 stale 38.5h: dpe decision doc root-caused — enricher WHERE (`source_url IS NULL/MISSING/test-%`) misses 18 placeholder VPS URLs from backfillBctcQ12026.ts → pull job 404-loops forever. Both in apps/mcp-server/. 8 null-source rows = unpublished content (no fix).
- SBV B-12 (c112 53min stale + vn-sbv-fetch unhealthy 49m uptime): dev-macro-indicators NB says "B-12 N/A, sbv_rates already fresh"; c114 (16:05 latest) all 6 svc healthy. VPS-cron post-restart blip — continuation of S10 no-task. CLOSED.
- cowork-schedule: market-watcher-offhours (0 */4) + market-watcher-eod (0 16 * * 1-5) BOTH match 16:00 weekday (same last_fired 16:06:05Z). SSOT _maintained_by agent-father via brief only.

**Decisions (board mutated, atomic temp→rename):**
- **DISPATCH#1 FIX-BCTC-ENRICHER-PLACEHOLDER-URL** zone:apps/mcp-server/ — folds sau-c112-b01(TRIAGED) + b13(TRIAGED) + dpe-row(TRIAGED). Recurring-bug but already architect-root-caused via dpe spike → direct FIX.
- **DISPATCH#2 FIX-PRICE-ANOMALY-JSON-PLUS** route_to agent-father — eod.md emit-raw-number rule (agent-md-factory). Do NOT delete stuck file (re-emit after fix).
- **BACKLOG** FIX-CADENCE-COWORK-DUP-MARKET-WATCHER (PLAN-ONLY, architect→agent-father) + CLEAN-NB-TRIM-PDFX-2 (240L→≤200, claude-manager-helper). Both low-pri, WIP budget=2 spent.
- **CLOSED** sau-c112-b12 (RESOLVED, dup/transient).

**Carry-over:**
- pdfx NB re-breached 240L after CLEAN-NB-TRIM-BATCH deferred it (4/5) last tick — now CLEAN-NB-TRIM-PDFX-2.
- cowork-schedule SSOT has structural same-agent slot overlap (offhours cron */4 always collides with any 4h-aligned guaranteed slot) — architect should generalize the dedup, not just patch market-watcher.
- 8 null-source BCTC rows (ACV/BDI/DAG/DLC/JSH/SIS/VDC/VNH) blocked on unpublished content — not code, leave in queue (no-silent-deletion).
