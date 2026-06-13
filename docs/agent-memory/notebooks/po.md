# PO Notebook

## 2026-06-13T22:28Z — DETECT→FIX bridge: promote health-recheck findings to task board

Closed the recurring detect→track gap (project_anomaly_task_bridge). The every-2h
health-recheck detector was firing but its output never reached the board — 32 open
findings accumulating while dev-team sat idle (0 in_progress).

### Promoted: 10 deduped FIX tasks (backlog 145→155, commit c68edcfa)
- **P0** (5d data-pipeline deaths, highest user-impact — silently rot served data):
  - FIX-FUNDAMENTALS-REFRESH-CRON-DEAD (B1, apps/mcp-server) — 0 refreshes since 06-08
  - FIX-BCTC-VPS-PIPELINE-STALE-5D (B5, apps/pdf-extractor) — 0 PDFs, Q1 window open
- **P1**: FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT (I13/I5), FIX-TA-INDICATORS-TIER3-ROUTING (B2),
  FIX-HNX-UPCOM-PRICE-SOURCES-DEAD (B4), FIX-OHLCV-DAILY-AGGREGATOR-STALE (I3)
- **P2**: FIX-MARKET-HEXAGRAM-TOOL-MISSING (B10), FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS
  (B3/6/7/8/9/11/12 bundled — 1 doc-fix class), FIX-COMMODITY-WTI-DELTA-CORRUPT (I10/I8/I4)
- **P3**: FIX-ALERT-CASCADE-OUTCOME-DEAD (M1/M2)

### Deduped-skipped (already tracked): I7→FIX-SBV-FX-VPS-FETCHER-UNHEALTHY,
I11→FIX-MCP-CRASH-LOOP-WRITEWAL. SCHEMA-DRIFT-P5/P8 are DDL self-heal (distinct from
the B-series tool-package param-doc drift — NOT deduped, correctly separate).

### Deferred (next pass): I1 (FRED key env), I2 (RSS endpoints), I6 (feedback backlog
drain), I9 (hydro), I12 (VCB reparse — overlaps VCB-MISSING-PDFS/FU-BCTC-RATIOS-N-A),
M3-M7 (lower-leverage doc/test debt). One-line reason: known-env or lower-impact than
the data-pipeline deaths; promote if they persist 2+ more recheck cycles.

### New reusable tooling
- scripts/po-s52-health-recheck-batch-triage.jq — GLOBAL-dedup batch backlog appender
  (skips any id present in ANY board array incl. active_sprints[].tasks). Reusable for
  any detector-report → board promotion. Payload: po-s52-health-recheck-batch-payload.json.

### Gates honored
JSON-valid · jq global-dedup (0 collisions) · tsc GREEN pre-push · explicit-stage (3 files)
· commit-mutex po-commit-s52 claimed+released · pushed c68edcfa.

### Carry-forward
- Next recheck pass (00:07Z) verifies these 10 ids present + ranks deferred set.
- B1/B5 are P0 — router should route to dev-mcp-server + dev-pdf-extractor first.
