# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- **BCTC-TRUST-RED** ✅ SIGNED OFF 2026-05-30. Data-integrity RED closed (ingest gate `validateBctcUnit`→REJECTED_SANITY + publish guard `checkPublishability` PUB-1..4; FPT+ACB purged→PENDING; DDD `bctcSanityValidator` + `bctcMagnitudeValidator`). Brief `docs/architecture-briefs/2026-05-30-bctc-trust-red.md`. PO live spot-check: `get_bctc_full(FPT/ACB)`→no numbers. 🔄 **FU-TRUST-REFRESH** — FPT+ACB PENDING/empty, need genuine re-refine (real OCR, off-HOSE).
- **BCTC-AI-INPUT-TAB** ✅ SIGNED OFF 2026-05-30. Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect` (per-page agent-input PNG + OCR text + page-window). QA cycle-157 all 7 gates @ b4ed9266. Live-verified real PNG / honest 404 / DB row untouched.
- **BCTC-HUMAN-CONFIRM** ✅ SIGNED OFF 2026-05-30. Human correction layer on `/api/bctc-inspect` (review red/yellow cells, hand-correct, lock "ĐÃ XÁC NHẬN"; 3-layer lock survives cron re-runs; 50/50 viewer + 6 tabs). QA HC-QA-3 cycle-156 all 9 gates @ 441f8e18. Brief `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md`.
- **BCTC-AGENTIC-REFINE** ✅ SIGNED OFF 2026-05-30. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`. 🔄 **AR-FU-DETERMINISM** (MED, DEFERRED): Haiku refine non-deterministic markdown coverage (FPT run-1=91 vs run-2=18); store-correctness unaffected.
- **DATA-PIPELINE-INTEGRITY** ✅ SIGNED OFF 2026-05-30. 🔄 FU-C (MED test-debt, DEFERRED) · ⏳ FU-MON (Monday: DPI-3 Brent/Gold + DPI-4 `get_foreign_flow` live-probe).
- **BCTC-TABLE-BOUNDARY** ✅ SIGNED OFF 2026-05-30. Over-merge bug resolved (FPT=31/ACB=22, 0 dup). FU-BTB-OCR registered. Brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.
- **DYN-WF-FOUNDATION** ✅ SIGNED OFF 2026-05-31 (DWF-EXIT). Phase 0 + Phase 2 SHIPPED — closes duplicate-publish + session-scoped SPOF (4× chef-morning dup). Brief `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md`. PO live-verified `is_trading_day` holiday/open, TTL-cap fix, routing-policy 8 rules, 14 enabled slots. Commits 84643927·8105f8fd·fa25aa5f·288e8888·e0f200c3·c937599b·149f64e8·eee22112. **DWF-TSC-DEBT** RESOLVED/NO-OP 2026-05-31 (verified-not-dispatched: `tsc --noEmit` = 0 TS18048, file uses `!` assertions L92/137; `bun test` 7 pass — false-RED, not dispatched).
- **DWF-PHASE1** ✅ DONE/SHIPPED 2026-05-31 (P1-PO-EXIT). Adaptive cadence (heartbeat consults Cadence Policy); zero `apps/mcp-server/` prod code, NO rebuild. `cadence-policy.json` (19 rules/3 IDs) + `cadence-policy.js` evaluator + `cowork-match-slots.js` adaptive `--mode` + 14 slots `policy_id`+`last_fired` + flow Steps 4.2–4.5b/5b + `DWF-phase1-cadence.test.ts` (48 assertions). QA P1-QA 8 gates GREEN. PO critique-before-approve: ran suite (48/48), own RED proof on EC-6 chef-intraday null-injection (load-bearing). Brief `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md`, sign-off `docs/handoffs/P1-PO-EXIT-signoff.md`. Commits 5a19485e..d8892afc · fbdba703 · 7a461eb7 · 38d241c5. ⛔ Phase 3+ (content-router/workgraph/backpressure) DEFERRED — operator-gated.
- **MACRO-CMDTY-DELTA** ✅ DONE/SHIPPED 2026-05-31T01:34Z (PO-EXIT APPROVE). Brent/Gold change%=+0.00% root cause in `apps/mcp-server/` (NOT macro-indicators): off-market repeated-close prev-close query matched ~1h-old identical row → fixed with previous-calendar-day baseline (`date(fetched_at) < date(?) AND brent/gold > 0`). PO raw-verified honest-flat 0.00% + correct logic + DPI-3 4 pass + clean scope. Report `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P4, DASHBOARD cow-20260529T221054-MCP-P4 RESOLVED. Commits e510e5df · dab1bf86 · fdc17265, image 802d6463e665. 🔄 FU: signed-non-zero in-the-wild on next real move (~Monday open).
- **FF-DEAD** ✅ FIXED 2026-05-31 (PO live-verified). Foreign-flow pipeline dead fleet-wide; root cause VPS field-name drift; FF-DIAG fix `0cbce0b4` live + redeployed. PO raw-reprobe: `get_foreign_flow(FPT)` returns real daily history (2026-05-30 net −37905, foreign room 34.75M). Zone `vps-scripts/`. ⏳ **FU-MON** (Monday open): probe non-zero net during live trading to confirm in-the-wild. Report `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P1.

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO: APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). X-1 open. **Priority: HIGH.** Zone: `apps/mcp-server/`.

- ✅ Phase 1 (flow wiring → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`) + Phase 2 code (`selfImproveOrchestratorJob` + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED)
- 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic-data dry-run, D-IMPROVE emit path end-to-end

---

## Sprint PEK-INTEGRATE — Re-engine apps/pdf-extractor on PDF-Extract-Kit

**Status:** ✅ DONE-PENDING-G9 (2026-05-28). Render-seam fix LIVE; all 12 corpus `has_pek:true`; mcp-server rebuilt. **Condition:** USER verbal G9. All phases DONE (spec `docs/REQ_PEK-INTEGRATE.md` + 8535b175 + 2e228f0d + ed347661 + QA 12/12).

---

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY (LF-DESIGN done). **Priority: HIGH (recurring-bug RCA).** Zone: multi (pdf-extractor + mcp-server). Brief `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`.

- 🔄 LF-EXTRACT (dev-pdf-extractor): Tier 0-3 + zone-geometry JSON
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle. **= root of report #3011 BTB-OPS 0-units persist blocker** (28 extracted, 0 in `bctc_layout_units`; handler `pushBctcLayoutHandler.ts` exists, units don't persist — write-wedge per project_mcp_server_write_wedge). Wants architect diagnosis of `POST /api/push-bctc-layout`.
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter. **LF-QA absorbs TR-2** (BCTC-TRUST-RED): refine_status=DONE must yield non-zero opex codes 11/24/25/26, non-zero equity+liab, non-zero EBITDA, ≥1 OCF row from page 9/10/16.

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
