# MCP Tool / Source Problems — 2026-05-29T22:10Z

**Reporter:** cowork-team (main terminal), live-probed via `call_tool(server="vn-market", ...)` through claude.ai gateway.
**Recipient:** dev-team (po triage → dev-macro-indicators / dev-vps-crawls / dev-mcp-server).
**Method:** All findings are from live tool calls this session, not visual inspection.

---

## P1 — `get_foreign_flow` returns NO DATA for any ticker (most severe)

- **Call:** `get_foreign_flow(code="HPG")`
- **Result:** `{"source_tier":2,"note":"No data available for HPG: foreign investor volume has not been collected yet. Data is populated by the VPS push-foreign-flow pipeline (Task 1132/1135). Check back after the pipeline has run at least one day."}`
- **Impact:** Foreign net buy/sell is completely dead fleet-wide. Any agent relying on foreign-flow signal gets nothing.
- **Likely zone:** dev-vps-crawls (push-foreign-flow pipeline on Vinahost VPS) + dev-stock-price (ingest). Task 1132/1135 pipeline appears to have never run or stopped.
- **Suggested check:** Is the VPS push-foreign-flow cron alive? Has it ever written rows? Verify `foreign_flow` table row count in market.db.

## P2 — USD/VND inconsistent across two tools (same metric, 16s apart)

- **`get_macro_snapshot`** → `usdVnd: 26255` (`dataSource:"live"`, fetchedAt 22:04:58Z). The 12:45 MACRO alert also used 26255.
- **`get_cycle_bootstrap(agent_name="market-watcher")`** → MACRO block `USD_VND 26115`.
- **Impact:** Two source paths disagree by 140 VND on the same FX rate. The bootstrap macro block is serving a stale/divergent value vs the live macro snapshot. Agents reading bootstrap (most cowork agents via step-0) see a different FX than agents calling get_macro_snapshot.
- **Likely zone:** dev-mcp-server (bootstrap assembly — which source does the bootstrap MACRO block read?) + dev-macro-indicators (FX source of truth).

## P3 — carry / yield macro signals stale (6 days, not recomputing)

- **Call:** `get_macro_snapshot` → `signals.carry.computedAt = "2026-05-23T00:00:00Z"` and `signals.yield.computedAt = "2026-05-23T00:00:00Z"`.
- **Today is 2026-05-29/30** → both regime signals are ~6 days old and not refreshing.
- **Impact:** carry (FII_OUTFLOW_RISK) and yield (CHEAP) regime signals feed agent macro context; a 6-day freeze means regime classification may be wrong.
- **Likely zone:** dev-macro-indicators (carry/yield recompute schedule). Check the cron/job that recomputes these — appears stalled at 2026-05-23.

## P4 — Brent/Gold change% = +0.00% (no delta computed)

- **`get_cycle_bootstrap` MACRO block:** `BRENT 91,7 (+0.00%)` and `GOLD 4.569,9 (+0.00%)`.
- Absolute values are live and match get_macro_snapshot (91.7 / 4569.9), but the change-% is flat 0.00%.
- **Impact:** Violates the "[Market data needs direction]" rule — agents can't show change direction + delta for commodities. (Note: market closed could explain *equity* flat-change, but Brent/Gold are 24h global and the news feed shows gold "tăng rất mạnh" — so a real delta exists and is being lost.)
- **Likely zone:** dev-macro-indicators (commodity change-% calc).

---

## Already-logged (NOT a new report — reference only)

- **CW-DISPATCH-STEP47-BOOTSTRAP-ENUM** (DASHBOARD.md line 75, ## agent-father, status NEW): `get_cycle_bootstrap` enum rejects `agent_name="cowork-team"`. Confirmed still failing this session — Step 4.7 tick-snapshot dies on every dispatcher fire that spawns. Already on the dashboard; not duplicated here.

## NOT system bugs (operator-side, excluded from report)

- `get_latest_financials` → "Tool not found" — wrong tool name guess by caller, not a server fault.
- `get_foreign_flow` requires `code` arg — correct schema, caller omitted it first try.
- `search_tools` not found via call_tool wrapper — expected; it's a gateway-level tool, not a vn-market downstream tool.
