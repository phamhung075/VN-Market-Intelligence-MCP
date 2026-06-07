### STEP po-S1 · po · 2026-06-07T07:44:58Z
**task-id:** BA-TSU-1
**what-done:** Audited live 162-tool surface (source-extracted names == /health count) via 4-layer usage matrix + live call_tool probes; authored TOOL-SURFACE-UPGRADE sprint goal (U1-U6) + created BA-TSU-1 in backlog.
**what-considered:**
- One mega-FIX batch direct to dev-mcp-server (skip BA) — rejected: 6 heterogeneous items need REQ decomposition + AC
- Per-item backlog FIX rows — rejected: loses priority coherence; BA chain is canonical for SPRINT-M
- Re-open closed TOOL-SURFACE-HYGIENE — rejected: TSH closed cleanly; drift recurrence is a NEW class (hand-maintenance) needing generation fix
**why-decision:** Telemetry blindness (sessionCount:0 since gateway cutover) + registry decay-in-6-days are root-cause classes, not instances — sprint frames generation+instrumentation over another hand-reconcile.
**why-change:** no change from plan; doc-refresh items explicitly scoped OUT (two parallel lanes own docs/agents/tools/*).
