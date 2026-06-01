# PO Notebook

## 2026-06-01T21:06Z — EXIT FRONTEND-BCTC-TAB — APPROVE, sprint CLOSED (38642fc2)

**Verdict: APPROVE.** BCTC Inspect viewer now a dashboard tab on :3001 via A2 server-side proxy, ZERO mcp-server edits — operator request met with no regression surface.
- Evidence raw-verified by me (not relayed): dev 80f2911b = frontend-only (+205L, 2 router-caught brief defects fixed pre-dev: /api prefix kept; 2nd /api/bctc-eval/* splat). QA 5046a7da APPROVED 5/5 — PDF 16.6MB + PNG 273KB MD5-identical :3001 vs :3000, 7 sub-paths parity, eval 200 parity, human-confirm POST round-trip proven via bun:sqlite DB read+reset, mcp-server img SHA distinct + :3000 still 200. Brief `…/2026-06-01-frontend-bctc-inspect-tab.md` present (A2 locked, affirms no mcp-server edit).
- Closed sprint in TASKS.md (collapsed 8-line OPEN block → 1 closed-sprint line); pruned 77→69L (≤80 cap). task_release ok=false (TTL expired across sprint — acceptable per flow). EXIT commit 38642fc2.
- DEFERRED/OUT-OF-SCOPE (recorded, NOT blocking): 13 docs lack rasterized PNG → page-image 404 on those (only FPT/ACB Q1 have PNGs) = pre-existing data-coverage gap, NOT a proxy bug. Tab label "BCTC Inspect" English for casing consistency.
- No new follow-up sprint warranted; data-coverage PNG gap belongs to the BCTC rasterization pipeline, not this proxy.

## 2026-06-01T20:43Z — SCOPE FRONTEND-BCTC-TAB (operator: BCTC viewer as :3001 dashboard tab)

Operator: "need move this page to new tab on localhost:3001". Router pre-verified "this page" = BCTC inspect viewer served ONLY by mcp-server `:3000/api/bctc-inspect` (`bctc-inspector.html`, 6 tabs + human-confirm + Task#18 prose fix a10448b0 closed today). Want it as a tab in the Remix dashboard on :3001.

**DECISION (raw-verified, not relayed):** Option **A — EMBED via A2 frontend server-side PROXY route**. NOT iframe-direct (A1), NOT native re-port (B).
- Raw evidence I checked myself: viewer is one self-contained 2692L HTML, all JS inline, **`const BASE = ""` (L1043)** → ALL data calls (`/api/bctc-inspect/*`: page-window/table/md/zones/docs + hc-correct/confirm/reset POSTs) are same-origin relative. Frontend already has the proxy convention (`app/lib/api/bctc-eval-client.ts` uses `MCP_SERVER_BASE_URL`=`http://mcp-server:3000`) + simple `NAV_ITEMS` array in `dashboard.tsx`.
- A2 proxies HTML + `/api/bctc-inspect/*` through Remix → everything same-origin on :3001 → `BASE=""` untouched + env-agnostic (dev vs CF-tunnel prod). A1 hardcodes a browser-reachable :3000 host = fragile. B = re-implement 6 tabs+human-confirm+today's prose fix = regression surface. **ZERO mcp-server edit** in all variants.
- Why architect FIRST (thin brief, not skip): A1-vs-A2 + the proxy-path contract (which sub-paths incl. POST human-confirm + PDF page-window streaming + content-type passthrough) + iframe-vs-inline-render is a real bounded design call. One page, no impl.

**Opened sprint FRONTEND-BCTC-TAB (MEDIUM, zone `apps/frontend/` only):** FBT-ARCH (brief) → FBT-DEV (route `dashboard.bctc-inspect.tsx` + proxy resource route + NAV_ITEMS entry) → FBT-QA (live: tab loads all 6 tabs + ≥1 human-confirm round-trip; :3000 byte-for-byte unregressed) → FBT-OPS (REBUILD frontend down→build→up, never restart-stale).
**SERIALIZE NOTE:** VPS-DEPLOY-PLACEHOLDER-GUARD already CLOSED today; if any VPS/mcp-server work re-opens, serialize COMMITS (shared git index) — disjoint zone so no tree collision.

**Dispatch:** po→agents-architect (FBT-ARCH) → dev-frontend (FBT-DEV) → qa (FBT-QA) → ops (FBT-OPS).

## 2026-06-01T17:35Z — INTAKE router-found MCP defects A–E → MCP-SURFACE-GAPS + bumped AUD-ND-1

Router handed 5 router-verified MCP defects. I re-confirmed A/B/C/D LIVE via gateway myself (raw, not relayed):
- **A** `get_foreign_flow {}` → `code` Required (per-ticker only); no market aggregate. → **MSG-1 (dev-mcp-server, HIGH, FEATURE)** — extend or add `get_foreign_flow_market`; NEEDS BA; may pull dev-stock-price/VPS source. Highest product value (daily FB/MARKET headline "khối ngoại bán ròng N tỷ").
- **B** `get_market_snapshot {3 codes}` → **4** trailing "Kinh Dịch: Chưa đủ dữ liệu" lines (N+1, worse than reported). **= SAME defect as TSH-6** (bare-catch :5005-down fallback). NOT a new task → folded as QA evidence onto TSH-6 (its OMIT-on-down AC kills all the lines). MSG-2 = placeholder only.
- **C** `source_tier:2` always (never tier-1). **= read-path VPS-SOCAT-PERSIST already owns** ("tier-1 restoration unconfirmed"). Folded as C-TIER1-CEILING doc-only AC there. NO new sprint. Decide-and-document, not "fix".
- **D** `get_market_breadth`/`get_top_movers` "not found via gateway" — root-caused: they **DO NOT EXIST in source** (0 `server.tool` match, NOT in 154 count). So NO count-vs-resolve mismatch — prior agent expected phantom tools. Reframed: discoverability gap, not registration bug. → **MSG-3 (dev-mcp-server, LOW, DOC)**: record absence in mcp-tools.md; if breadth/movers wanted = feature → fold into MSG-1's market-aggregate family.
- **E** AUD-ND-1 already tracked (FLEET-HOST-SAFETY). NEW evidence: Monday 2026-06-01 trading-hours auditor `docker stop` → live-only-no-backfill → PERMANENT intraday data loss (3rd manifestation, downtime→data-loss). **Bumped AUD-ND-1 HIGH→CRITICAL/top-of-queue** in TASKS + SPRINT_GOAL; added data-loss AC addendum (regression must run in simulated market-open). Did NOT duplicate.

NOTE honored: macro-indicators-unavailable + VPS-SOCAT acute = ops live infra; I only left the conditional "dev task ONLY if ops says code rebuild needed."

**Recommended sprint order:** AUD-ND-1 (CRITICAL, ships first) → TSH-1/TSH-6 (in-flight, includes B) → MSG-1 (HIGH feature, after mcp rebuilds settle) → MSG-3 + C doc (LOW, ride-along). MSG-2 dormant.
ENOSPC hit mid-session (per-task tmpfs full) — root disk fine; bash output unreliable, used repo-file redirect workaround.

## 2026-06-01T17:23Z — TRIAGE operator-bug → opened TSH-6 (FIX) + TSH-7 (backlog)

**Operator-reported product defect:** `get_market_snapshot` always shows misleading "Kinh Dịch: Chưa đủ dữ liệu để tính quẻ". Router raw-diagnosed (NOT relayed): kinh-dich-service:5005 not deployed (docker ps = only mcp-server + mcp-gateway, host-panic constraint / A-01-EXPECTED-SET) → fetch connection-refused → bare `catch {}` swallows → emits fallback that FALSELY implies data shortage. 3 sites: marketTools.ts appendMarketHexagram(62-69)/appendStockHexagram(72-80) + analysis.ts appendStockHexagramHttp(63-78). I confirmed docker ps + grep'd the 3 sites raw myself.

**Verdict: Approach C-omit. FIX-class, NO new architect cycle.** Rationale: the architect ALREADY ruled the SAME dead-:5005 dep for the standalone tool (TSH-1, ARCH-DECIDE-1 FR-1=1b DEREGISTER in `…/2026-05-31-tool-surface-hygiene.md`): "absent is safer than lying"; wire :5005 later as feature sprint KINH-DICH-MARKET, "not squeezed into a hygiene sprint." That precedent governs the embedded path too.
- (A) deploy :5005 — REJECTED (host-memory panic + intended-runtime).
- (B) inline revert — REJECTED (re-introduces the P1-F G5 domain→infra violation; ARCH-DECIDE-1 already pre-decided against).
- (C) honest-omit — CHOSEN. On connection-refused/non-200 → OMIT block entirely + logger.warn (kills silent-swallow `feedback_silent_swallow_serial_bugs`); on genuine 200-insufficient-data → keep honest VN line. Plain VN (`feedback_market_report_plain_vietnamese`).

**Opened:** TSH-6 under TOOL-SURFACE-HYGIENE (dev-mcp-server, MEDIUM, operator-reported). Handoff `docs/handoffs/TSH-6-kinhdich-honest-omit.md`. 5 ACs incl. live gateway raw-verify (not badge, RISK-2 / `feedback_router_verify_raw_not_badges`). Ops REBUILD required. Can batch rebuild with TSH-2/3/4/TSH-4 (same marketTools.ts).
**Opened (backlog):** TSH-7 — secondary UX, default get_market_snapshot to watchlist when no `codes`. SPRINT-S, NOT gating. GOTCHA: watchlist NOT inline in system-map.json (only `_ssot` pointers) — tickers live in SQLite `watchlist` table. Needs BA spec.

**Routing:** PM → dev-mcp-server → ops rebuild → qa live raw-verify → PO sign-off.

**Carry-over / queued ahead/alongside:**
- TSH-1 (dev-mcp-server) SHIPS FIRST in this sprint — deregister get_market_hexagram tool; getMarketHexagram export stays LIVE (still used by appendMarketHexagram) so TSH-6 safe.
- ENV-ISOLATION-P2 schedulable — SERIALIZE EI-P2-2 mcp-server rebuild vs all TOOL-SURFACE-HYGIENE rebuilds (same zone, never parallel).
- HIGH backlog ahead: VPS-DEPLOY-PLACEHOLDER-GUARD (T1 ops-recon HARD GATE) · NB-PRUNE-FIX.
