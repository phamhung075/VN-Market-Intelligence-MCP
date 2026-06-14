# Decision Journal — Sprint VN-MACRO-TOOLING · po

**Sprint goal:** Build 5 new VN macro MCP tools + 1 credit-flow EXTEND from the 07-06 roundtable methodology gap (leverage order, trade-balance first). VN geo-blocked via VPS; gateway-only surface.
**Agent:** po
**Started:** 2026-06-14T18:08:12Z

---

### STEP po-S1 · po · 2026-06-14T18:08:12Z
**task-id:** VN-MACRO-TOOLING
**what-done:** Opened VN-MACRO-TOOLING sprint (PLANNING, 7 tasks) from docs/analysis-briefs/07-06-methodology-gap.md tools-ranked section; routed BA-VN-MACRO-TOOLING spec gate to ready[].
**what-considered:**
- Single mega-tool vs 5 separate tools — kept 5 per brief; each maps to distinct source + distinct skill-consumer; separate = independent VPS-crawl deps + independent leverage ranking.
- Direct dev dispatch vs BA spec gate — chose BA gate (PO lane: code work never bypasses BA spec review; geo-block routing + per-tool I/O contracts + skill-switch-on schema need decomposition).
- Owner = dev-macro-indicators primary (4 of 5 are macro-series tools); EXTEND + REGISTER to dev-mcp-server; VPS/main-server crawls as co-owners per brief.
**why-decision:** Brief gives explicit per-tool I/O contracts + owners + leverage rank — directly map to 7 board tasks (5 tools + 1 EXTEND + 1 run-last REGISTER gate mirroring TOOL-SURFACE-UPGRADE U2-PARITY).
**why-change:** no change from initiative — scoped exactly as the brief ranked; added VMT-7 register/parity gate (not explicit in brief) so gateway-surface acceptance is verified LIVE, and made skill-switch-on schema a global acceptance criterion (parallel agents-architect cowork skills run DEGRADED until then).
