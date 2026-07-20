# agents-architect — Notebook

## 2026-07-18T19:34:15Z

**Brief:** `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md`

CRON-WORKFLOW-OPTIMIZE: designed Tier-4 "D-FLEET" fleet-performance/cooperation dimension bolted onto system-auditor (no new agent/cron), per 4 pre-resolved axes. Corrected a false task premise on the way in: notebook cycle-telemetry (`cycles_run`/`exit_status`) is structured in only 2/45 notebooks (market-watcher, qa-responder), not 46/46 — rollup designed tolerant of this. Flagged 2 of the 4 mandated data sources as real LANE-B code prerequisites out of agent-father's zone: (c) per-agent `tool-usage-stats.json` breakdown needs `apps/mcp-server` caller-identity threading (none exists today — SSE-per-call model has no agent dimension), (d) full alert-accuracy generalization needs a new `alertSource` enum value (server-validated) — pilot v1 avoids new server code via existing generic tools (`create_prediction_claim`/disposition-proxy reusing task_board data) instead. On-demand pilot only (1-2 manual `AUDIT_TIER=4` runs, zero cron registration), 6 graduation criteria gate any future permanent-cadence ask to PO. Output routes through the existing D-IMPROVE/improvement-proposal pipeline verbatim — zero new signal type, zero new PO-flow row.

**Signal dropped:** `docs/signals/cron-workflow-optimize-tier4-fleet-audit-20260718T192722Z.json` → agent-father

---

## 2026-07-20T05:51:07Z

**Brief:** `docs/architecture-briefs/2026-07-20-signalqueue-persistent-finding-collapse-and-tally-accuracy.md`

Batched non-urgent design: (1) collapse 26 live append-always pdf-extractor A-11/A-20 rows (one persistent condition) → new downstream compaction pass modeled on `orch-cold-evict.sh`, status=NEW-only (frozen once triaged), never touches append-always E-3 emit path; found `check_id`/`dedup_key` are never persisted onto the row today (`emit-audit-signal.sh` discards them) — schema-blocker for any collapse design. (2) OUTPUT-CONTRACT `signal_queue_rows_written` 0/2/2 flakiness root-caused to a `flow/main.md` instruction gap, NOT a script bug — `emit-audit-signal.sh` is deterministic (a `SKIP-dedup` marker still means E-3 wrote a row; only `ABORT` means it didn't). Fix: doc-only counting-rule edit (agent-father, ship now) + optional `E3-ROW-WRITTEN` marker (developer, batched with the schema work). FOLD-vs-FRESH: fresh — `FIX-SIGNALQUEUE-DUP-ID-GUARD` is a distinct id-collision/ts-format class (no id collisions found live); `FU-AUDITOR-D4-SIGNAL-ID` cross-referenced as related-but-narrower prior art, not folded, not mutated.

**Signal dropped:** `docs/signals/signalqueue-persistent-finding-collapse-and-tally-accuracy-20260720T055107Z.json` → agent-father

---

## 2026-07-20T22:29:51Z

**Brief:** `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md`

GLOBAL-GEOPOLITICAL-SIGNAL-COVERAGE: 2026-07-20 war/trade-war VN selloff (44up/263down) surfaced zero global-cause coverage in any cowork agent — root cause (b) schema/flow gap, no event category models "war/geopolitical" anywhere. Split into LANE A (6 doc-only items, agent-father, ZERO code dependency — found `event_type:"trade_war"` already live+server-accepted, unused only for lack of a trigger rule, so LANE A ships a functionally complete pipeline today, not a dormant contract): news-scout dedicated-Reuters-slice (stage-fetch.md) + Geopolitical/War dispatch block (stage-signals.md) + alert-commander no-ticker carve-out (stage-signals.md, with a field-precision correction — carve-out must key off top-level `stock_code` omission, NOT `finding_data.affected_stocks` which is schema-required non-empty `min(1)` and never surfaces to alert-commander's text-rendering path) + CHEF US-stack 4th element/L2_OK extension + CHEF 5th convergence rule + new `docs/policies/data-sources-coverage.md`. LANE B (PO backlog, dev-mcp-server): geopolitical domain-tag + `geopolitical_conflict` enum + detector (bundle, mirrors legalRiskDetector.ts pattern) + new US-equity-index/VIX tool (no existing tool surfaces S&P/Nasdaq/VIX). LANE C: ops probe of `news-fetch`/Reuters reachability — dated unresolved carry-over (dev-mainserver-crawls notebook, 2026-06-08, 43d stale) is a material dependency for LANE A's real-world value.

**Signal dropped:** `docs/signals/global-geopolitical-signal-coverage-20260720T222951Z.json` → agent-father
