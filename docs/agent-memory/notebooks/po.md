# PO Notebook

## 2026-06-14T18:10Z — S52: open VN-MACRO-TOOLING sprint (07-06 roundtable methodology gap, tools+data lane)
Initiative from `docs/analysis-briefs/07-06-methodology-gap.md` (## New MCP tools requested, ranked by
leverage + bonus EXTEND). My lane = tools + data ONLY; the 2 new cowork skills (macro-health-read,
trade-fx-pressure-decomp) are agents-architect's parallel lane and run DEGRADED (is_estimate=true) off
existing tools until these land.

**Opened sprint VN-MACRO-TOOLING (PLANNING, 7 tasks)** via idempotent
`scripts/po-vn-macro-tooling-sprint-open.jq` (atomic temp→[ -s ]→jq empty→rename). Routed
**BA-VN-MACRO-TOOLING** spec gate to ready[]. Sprint_goal entry added (PLANNING).

Task breakdown (leverage order = brief order):
- VMT-1-TRADE-BALANCE (L/high, dev-macro-indicators+dev-vps-crawls) — HIGHEST; HS-group + FDI/domestic
  bloc split + processing-margin ratio. GSO/Customs → VPS.
- VMT-2-BOP (L/high, dev-macro-indicators+dev-vps-crawls) — BOP lines + offshore-parked/E&O proxy. SBV/IMF → VPS.
- VMT-3-MACRO-INDICATORS (L/high, +dev-mainserver-crawls) — pmi/iip/retail(nom+real)/pub-inv/fdi w/ ma3/ma5/yoy/ytd pre-computed. GSO+S&P PMI.
- VMT-4-CPI-COMPONENTS (M/med) — 11 baskets weight+contribution + cpi_peaked. GSO → VPS.
- VMT-5-LIQUIDITY-STATE (M/med, +mainserver) — interbank 1w/OMO/refi/IRS/SJC-vs-world gap/CNY-DXY.
- VMT-6-CREDIT-FLOW-EXTEND (M/med, dev-mcp-server) — EXTEND: real {mean,dispersion,hawk/dove} not static-seed.
- VMT-7-REGISTER (M/high, dev-mcp-server, depends all 5) — RUN-LAST gate; mirrors TOOL-SURFACE-UPGRADE
  U2-PARITY. Verify each tool LIVE via call_tool gateway + registry parity.

**Global acceptance (load-bearing):** (1) VN geo-blocked via Vinahost VPS only (project_bctc_vps_proxy);
(2) gateway-only surface (call_tool wrapper, discoverable); (3) SCHEMA-CONTRACT — each tool exposes the
clean schema the 2 cowork skills switch from DEGRADED→live with no code change; (4) honest per-series
is_estimate (no static-seed masquerade); (5) direction+delta + server-side transforms.

### Carry-over
- NEXT: BA decomposes → docs/REQ_VN-MACRO-TOOLING.md (per-tool I/O contract, VPS routing, edge cases,
  skill-switch-on acceptance) → returns to me for spec review → architect (multi-zone split) → pm → dev.
- Coordination: each shipped tool must expose stable schema BEFORE the cowork skills flip off DEGRADED;
  VMT-7 verifies LIVE. Notify agents-architect when VMT-1 schema lands (first switch-on candidate).
- Sprint is PLANNING until BA spec approved; flip to active on approval.
- Prior (S50/S51): ARCH-CRON-SCHEDULER-RELIABILITY umbrella HOLD-OPEN, Monday 2026-06-15 G1/G2/G3 LIVE
  re-verify. FIX-REFINE-LOCK-TTL-RECLAIM = next dev-mcp-server pull (mcp-server zone serialized) — note
  VMT-6/VMT-7 also dev-mcp-server; sequence behind refine-lock + digest-dedup pair on that single zone slot.
