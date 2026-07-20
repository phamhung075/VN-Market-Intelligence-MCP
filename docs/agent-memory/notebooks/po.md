# PO Notebook

_Last: 2026-07-20T22:44Z (LANE-B backlog intake — geopolitical/US-equity signal coverage; 2 FEAT mints, dev-mcp-server; ZERO code, plan-only)_

## Tick 2026-07-20T22:44Z — LANE B of global-geopolitical-signal-coverage brief

Router-directed backlog intake. Source brief: `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md` §3. Context: 2026-07-20 war/trade-war VN selloff (44 up/263 down) missed by all cowork agents — no geopolitical/war/US-equity signal category. LANE A doc-fix already live (47c703fca, `trade_war` enum server-accepted). LANE B = code-layer precision/completeness.

**Prior-art: FRESH.** Both target ids + `geopolitical` (0 hits) absent from ALL board lanes + cold storage/archive. `war`/`global` grep hits were incidental substrings (`aWARe`, `gap`); `macro` hits are the pre-existing VN-MACRO-TOOLING rows (FRED/calendar/commodity/ISM) — none touch US-equity indices. Matches brief §1 verdict.

**2 MINTS → `.task_board.backlog[]` (orch-apply.sh, conservation 554→556 PASS; commit d0618b6f0, pushed):**
- `FEAT-NEWS-GEOPOLITICAL-CLASSIFICATION` (SPRINT-S, **high**, dev-mcp-server, zone apps/mcp-server/, next=ba) — B1+B2 bundle: `'geopolitical'` DomainType (SHARED root bctc-schema.ts → compiler-forced exhaustiveness on Record<DomainType,…> incl DOMAIN_KEYWORD_MAP + VN label map) + `'geopolitical_conflict'` event_type enum + NEW pure-domain `geopoliticalRiskDetector.ts` (mirror legalRiskDetector). Scope reserved: ship detector WITHOUT MCP-tool wrapper (matches chain_catalyst pattern). Follow-up (agent-father, gated on ship): switch interim trade_war/macro → geopolitical_conflict in 4 LANE-A flow docs.
- `FEAT-MACRO-US-EQUITY-INDEX-TOOL` (SPRINT-S, **medium**, dev-mcp-server, zone apps/mcp-server/, next=ba) — B4: extend macroTools.ts Yahoo fetch with ^GSPC/^IXIC/^VIX + tool-doc. Gate: market-watcher US_EQUITY_SIGNAL wiring is OUT OF SCOPE until tool ships (future follow-up).

**Priority rationale:** both independent, no ordering dep (brief §5). ROW1=high (precision upgrade directly sharpening the live incident-response pipeline; pure domain, zero I/O, low-risk). ROW2=medium (tool alone changes no agent output until the gated wiring follow-up). Plan-only — dev chain NOT started (sprint capacity not signalled; rows-on-board = deliverable).

## Carry-over
- **KEY BOUNDARY (STANDING):** signal-file retention OWNED by dev-team `drain-signals.md`; cleanup pass is DETECT-ONLY. Do NOT create a second lifecycle owner.
- **A-30 TRIPWIRE (STANDING):** mcp-server mem FOLD holds only while GC ceiling intact — escalate ops if baseline >93% no-dip / peak >97% no-reclaim / OOMKilled.
- **DO NOT flip GAP-CHEF-SYNTHESIS-A DONE_VERIFIED** on one good cycle — need 3 consecutive non-empty conviction_calls[]+sector_phases[].
- `FIX-CMH-OBSOLETE-FILE-CLEANUP` (07-20) minted → agent-father; brief `docs/handoffs/2026-07-20-obsolete-file-cleanup-janitor-pass.md`.
- pdf-extractor + dashboard-tier PLAN-ONLY (supervised:true blocks idle auto-pickup).
- Session c106f5a6 (router coord). Committed MY scoped paths only (orch-state.json by explicit path); pushed main.
