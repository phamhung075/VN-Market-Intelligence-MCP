# PO Notebook

## c · 2026-06-07T07:44:58Z — USER DEMAND lane-C: MCP tool-surface upgrade audit → TOOL-SURFACE-UPGRADE sprint

**Inputs:** live /health toolCount=162 == source-extracted 162 (161 server.tool + 1 registerTool); tool-usage-stats.json sessionCount=0 toolCounts={} (telemetry DEAD); tool-registry.json lastUpdated 2026-05-03 lists 125; 4-layer usage matrix per audit-mcp-tools skill; live probes get_market_snapshot/get_macro_snapshot/get_foreign_flow.

**Key findings (prioritized):**
- P1 U1: usage telemetry 100% blind — sessionToolCache empty since gateway call_tool cutover (per-call dial+drop); trackSessionToolUsageJob aggregates dead cache → fix = per-call counter at invocation layer.
- P1 U2: registry drift class — 38 live tools missing, ghost get_market_hexagram, counts 125/146/162 (registry/CLAUDE.md/live); TSH-6 hand-reconcile decayed in 6 days → generate registry + parity test, never hand-edit.
- P2 U3: 12 weak-claim tools (zero agent/flow/skill refs); read_bctc_pdf zero across ALL 4 layers = removal candidate; mark_alert_outcome merge into write_alert_verdict; get_market_foreign_flow vs get_foreign_flow overlap.
- P2 U4: get_macro_snapshot headline values (vnIndex/oil/gold/usdVnd) snapshot-only, no prev-session delta — violates direction+delta rule; sweep all market get_*.
- P2 U5: get_foreign_flow holding ratio serves 0.00% every row every day — dead field rendered as real (DSI violation).
- P3 U6: TSH leftover merges never executed (patterns/TA, trigger_*_vps_fetch x4, summary pair, insider pair).
- Stale fetch_ssc_reports refs in 3 docs/agents/tools/list files — NOT touched, owned by parallel doc-refresh lanes (cowork-refactory-expert + agent-father); flagged in sprint note.

**Dispatched:** sprint_goal entry TOOL-SURFACE-UPGRADE (active, lead ba, WIP_max=2, order U1+U2→U3→U4/U5→U6) + backlog task BA-TSU-1 (owner ba, SPRINT-M, P1, zone docs/agents/, sprint TOOL-SURFACE-UPGRADE). Umbrella lock task:TOOL-SURFACE-UPGRADE claimed (po, TTL 3600). Journal: sprint-TOOL-SURFACE-UPGRADE-po.md STEP po-S1.

**Carry-over (next PO cycle):**
- Review BA spec for BA-TSU-1 when ready (review-ba-spec flow); ensure U1/U2 stay framed as class fixes (generation+instrumentation), not another hand-reconcile.
- Any U3/U6 tool rename/removal MUST be signalled to the doc-refresh lanes before merge (they own docs/agents/tools/*).
- Prior cycle carry-over still open: LIVEDB recovery raw verify (PRAGMA ok + C-01 1599/C-02 3190 baselines); #3065 news-vps honest resolution; HPG Q4 re-parse after recovery; FIX-SBV-PUSH-TYPE-COERCE live proof; rtr-bctc-playwright queue-drain proof; FIX-BCTC-SLA-WEEKEND Sunday proof; CTG real figures post-refine (fleet cron 09:00 UTC); 10 yellow BCTC eval rows post-stage-4.
