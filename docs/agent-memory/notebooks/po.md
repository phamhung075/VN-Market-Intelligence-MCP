# PO Notebook

## 2026-06-14T20:11Z — S55: FINAL SIGNOFF KINHDICH-HOVER-DETAIL → done_verified
Closed the lean chain (ba→dev-frontend→ops→qa→po). qa APPROVED (69e7a8b0). PO RAW-corroborated the
served-chunk LOAD-BEARING proof myself (not the qa badge): curl :3001/assets/QueName-CweIuF2T.js (67522B)
→ stateInterpretation x2 + favorable x2 + warning x2 + que-descriptions-detail import x1 + VN labels
Trạng thái/Cảnh báo/Xem chi tiết each x1, **phases=0** (6-hào table correctly reference-page only). Matches
user verbatim goal + sprint success_metric. Set board BA-KINHDICH-HOVER-DETAIL status=done_verified,
po_signoff=APPROVED, next_agent=null. Atomic temp→[ -s ]→jq -e→rename; id-line 722→722 UNCHANGED; .head
(VN-MACRO active_task_id=BA-VN-MACRO-TOOLING) UNTOUCHED. Committed by EXPLICIT PATH (orch-state + notebook +
journal); cowork dirty tree (ba/news-scout/fb-post/signals) preserved untouched. Lesson held: served-chunk
RAW grep is the done_verified bar — green rebuild reaching no browser = nothing.
Carry-over: KINHDICH chain CLOSED. VN-MACRO-TOOLING WAVE-2 A1=VMT-2-BOP in dev (router-owned, separate chain).

## 2026-06-14T19:42Z — S54: open KINHDICH-HOVER-DETAIL (user feature, actively waiting)
User req (verbatim): (1) Kinh Dịch reference 1-column — RAW-confirmed ALREADY LIVE (commit 1aa9dc31,
ops a334dc7a frontend rebuild; served chunk grid-cols-1, zero 4-col) → user only needs hard-refresh,
DO NOT re-touch. (2) NEW WORK: quẻ hover tooltip must show "Tra cứu Kinh Dịch" detail of the related
hexagram, not just today's one-line summary.

**PO product decision (autonomy, no user ask): Option (a) richer tooltip** = coreMeaning + Trạng thái
(stateInterpretation) + Thuận (favorable) + Cảnh báo (warning) + trend label; OMIT 6-hào table (tabular →
reference page), KEEP "Xem chi tiết →" deep-link. Click-expand/big-popover rejected (UX is hover-pure).

Key find: rich data **already in frontend bundle** — `QUE_DETAIL` in
apps/frontend/app/lib/que-descriptions-detail.generated.ts carries all VN fields. So NO codegen extension
needed — QueName.tsx just imports QUE_DETAIL + renders new fields. Near-pure single-component change.
SSOT preserved = apps/frontend/app/components/QueName.tsx (QUE-TOOLTIP-DRY).

Opened sprint via idempotent `scripts/po-s54-kinhdich-hover-detail-kickoff.jq` (atomic temp→[ -s ]→jq
empty→rename; mutates ONLY sprint_goal.entries + task_board.backlog; head + VN-MACRO-TOOLING untouched).
Routed **BA-KINHDICH-HOVER-DETAIL** (TODO, zone apps/frontend/). Umbrella lock task:KINHDICH-HOVER-DETAIL
claimed (ttl 3600). Lean chain: ba → dev-frontend → ops(frontend-only rebuild) → qa.
DONE BAR = done_verified: tsc green + qa + targeted frontend rebuild (build/up --no-deps/builder prune,
ps -a peer-survival, image-ID delta) + RAW-verify :3001 served chunk physically contains new VN strings
(curl route + grep stateInterpretation/favorable/warning). Wrong-surface lesson: green rebuild reaching
no browser = nothing.

Carry-over: BA writes thin spec for BA-KINHDICH-HOVER-DETAIL next.

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
