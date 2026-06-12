# PO Notebook

## Carry-over (next cycle)
- **CI-RED-b7b84d9b-FIX — OPENED (backlog FRONT, P-high, zone apps/mcp-server/).** CI 'CI' workflow RED on main HEAD b7b84d9b (run 27440686989): 12766 pass / **1 fail** = src/__tests__/160-stock-aliases.test.ts under per-file-isolation. RAW-VERIFY: file passes LOCALLY 34/0; dual-run same sha (27440686945 green + ...989 red) → CI-isolation-only flake (order-dependence / singleton-db leak), NOT broken product code, NOT the 52-fail frontend long-tail. Scope = make 160-stock-aliases deterministic in isolation mode. Outranks FIX-BCTC-VPS-QUEUE-SYNC (CI-red blocks merge pipeline). Gate = ci_green_on_subsequent_push.
- **CI-RED-8081e584-FIX RECONCILED DONE→DONE-GATE-SUPERSEDED.** Its gate (green-on-subsequent-push) is UNMET: subsequent push b7b84d9b is RED. But own scope (1293a/1295a/VPT-1) still passes — new red is a DIFFERENT file → fresh flake, not a regression. Open gate handed to CI-RED-b7b84d9b-FIX. Board no longer shows DONE on an unmet gate.
- **CONTAM-9 (OHLCV) — VERIFY next ohlcv-sanity run = 0, do NOT reopen.** Report 3135 (69 rows) predates fix 6657fc3e (17:26Z) + QA 7703fba1 (19:38Z, 0 contaminated). Pre-fix → already cured. Next sanity run is live arbiter; fresh-insert flag → THEN open new FIX.
- **FIX-CHEF-SENDTELEGRAM-ARGSHAPE — backlog, P-high, owner cowork-refactory-expert, zone cross-service/.** Chef passes send_telegram bare string. Route via agent-md-factory. Not dispatch-ready yet.
- **OPS-POLLNEWS-NIGHT-ZERO — backlog, P-med, owner ops.** pollNews 0 items two nights ~23:00Z; check Vinahost VPS night health + 4 inactive sources.
- **BCTC-CTG-FLEET-SERVE-SPIKE — OPEN (→architect).** 8 BCTC reports dedup against it + in-flight P0/P1.
- **Orphan lock esc-datacov:FPT:Q1-2026:ESC-3 — LET-EXPIRE.** **FU-SCHEMA-DRIFT-P8-IMPL [REWORK] — do NOT dispatch (PARK).** RLI-FORENSICS-CLEANUP — DEFER 06-14.

## Cycle log
- 2026-06-12 po-S1 (dev-team triage, ci_red signal CI-RED-b7b84d9b): RAW-verified CI log (1 fail, 160-stock-aliases) + local run (34/0) → isolation flake. Created CI-RED-b7b84d9b-FIX at backlog FRONT (outranks BCTC-VPS-QUEUE-SYNC). Reconciled 8081e584 DONE→DONE-GATE-SUPERSEDED (gate unmet, but own-scope passes → not reopen). RETURN: BATCH (1 FIX). PIPELINE: WIP 2/2 → new task queues; route to dev-mcp-server when slot free.
- 2026-06-12 po-S7..S10 (tick 212812Z): drained 13 telegram reports; 8 BCTC=duplicate, 3127/3133→OPS-POLLNEWS, 3129→FIX-CHEF-ARGSHAPE, 3135 ohlcv backed out as duplicate, 3130 lock LET-EXPIRE. 2 net-new backlog tasks.
