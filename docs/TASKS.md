# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- **BCTC-TRUST-RED** ✅ SIGNED OFF 2026-05-30 (TRUST-EXIT). Data-integrity RED closed: trust layer green-stamped fabricated FPT/ACB refine data. Shipped TR-0 (ingest gate `validateBctcUnit`→REJECTED_SANITY in `pushBctcRefinedUnitTool.ts`; publish guard `checkPublishability` PUB-1..4 in `bctcFullTools.ts`; FPT+ACB purged→PENDING) + TR-1 (DDD-pure `bctcSanityValidator` DT-1 + `bctcMagnitudeValidator` DT-2/3/4). Brief `docs/architecture-briefs/2026-05-30-bctc-trust-red.md`, spec `docs/REQ_BCTC-TRUST-RED.md`. Commits 4c8cfaf7·dde8fbcd·4278b61a·ebbdabbf·04fc08db·b08ab73a·15dfc434·caf6865d·a3f83b88. QA re-sweep a3f83b88 APPROVED (bun test exit 0). **PO live spot-check:** `get_bctc_full(FPT/ACB)`→"Chưa có dữ liệu BCTC" (no numbers), `get_bctc_refined(e8ea3df5…)`→purged. 🔄 **FU-TRUST-REFRESH** — FPT+ACB now PENDING/empty, need genuine re-refine (real OCR, off-HOSE) to restore data. TR-2 coverage folded into BCTC-LAYOUT-FIRST (below).
- **BCTC-AI-INPUT-TAB** ✅ SIGNED OFF 2026-05-30 (AIT-EXIT). Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect`: per selected page shows the agent-input PNG + OCR text + page-window the refine AI received. QA cycle-157 all 7 gates @ b4ed9266 + path-fix cbe96137. Live-verified: page-image route → real 336KB `image/png` (magic `89 50 4e 47`), miss → honest 404 `png_not_found`, page-window → `bctc_refined_units`; FPT report `e8ea3df5…` pages 6-11 rasterized; DB row untouched (`confirm_status=PENDING`); 6 prior tabs intact; repo==live image.
- **BCTC-HUMAN-CONFIRM** ✅ SIGNED OFF 2026-05-30 (HC-EXIT). Human-in-the-loop correction layer on `/api/bctc-inspect`: review red/yellow flagged cells, hand-correct, lock "ĐÃ XÁC NHẬN"; corrections survive cron refine re-runs (3-layer lock); 50/50 viewer + 6 tabs. QA HC-QA-3 cycle-156 all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154. Brief `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` (+ADDENDUM HC-ARCH-2 transaction-ordering). Commits 4c40939c·89100e07·ae3c5039·dca93898·7a3734ed·204344ec·9234e9c2·d5976d1e·441f8e18. 🔄 follow-up = AR-FU-DETERMINISM (below, shared with BCTC-AGENTIC-REFINE).
- **BCTC-AGENTIC-REFINE** ✅ SIGNED OFF 2026-05-30. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`. 🔄 **AR-FU-DETERMINISM** (MED, `apps/mcp-server` + `docs/agents/refine_bctc_md`): Haiku refine fan-outs emit non-deterministic markdown coverage (FPT run-1=91 vs run-2=18); store-correctness unaffected, coverage variance a trust follow-up. Lower temp / determinism guard / golden-markdown snapshot. DEFERRED.
- **DATA-PIPELINE-INTEGRITY** ✅ SIGNED OFF 2026-05-30. 🔄 FU-C (MED test-debt, `ohlcvForeignFlowStore.ts`, DEFERRED) · ⏳ FU-MON (Monday: DPI-3 Brent/Gold + DPI-4 `get_foreign_flow` live-probe).
- **BCTC-TABLE-BOUNDARY** ✅ SIGNED OFF 2026-05-30. Over-merge bug resolved (FPT=31/ACB=22, 0 dup). FU-BTB-OCR registered. Brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.

---

## Sprint DYN-WF-FOUNDATION — Multi-session-safe orchestration + demand-driven SSOT instrumentation

**Status:** ✅ SIGNED OFF 2026-05-31 (DWF-EXIT, PO). **Phase 0 + Phase 2 SHIPPED.** Closes the duplicate-publish class + session-scoped SPOF (4× chef-morning dup, 2026-05-29). Zone: multi. Goal: `docs/SPRINT_GOAL.md` § DYN-WF-FOUNDATION (status header). Brief: `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md`. Spec: `docs/REQ_DYN-WF-FOUNDATION.md`. QA: `reports/TASK_REPORT_DWF-QA.md` APPROVED (all FR-P0-1..4 + FR-P2-5/6/7 PASS; both BLOCKING re-proven; all DV suites RED→GREEN; mcp-server force-recreated). **PO critique-before-approve on live container (not trusted from ledger):** `is_trading_day(2025-01-27)`→holiday, `(2025-01-06)`→open; TTL-cap fix LIVE (`task_claim ttl_seconds=691200`→`claimed:true`, ops-found Zod 86400 silent cap gone); `routing-policy.json` `.routing_policy`=8 rules + catch-all→po; 14 enabled slots; `pressure-state.json` 9 fields. Commits: 84643927·8105f8fd·fa25aa5f·288e8888·e0f200c3·c937599b·149f64e8·eee22112.

- ✅ DWF-BA / DWF-ARCH / DWF-PM / DWF-DEV / DWF-QA — all CLOSED, sign-off above.
- 🔄 **DWF-TSC-DEBT (PROMOTED to active FIX, PO call at DWF-EXIT):** 19 TS18048 errors in `DWF-routing-policy-fence.test.ts` (`lastRule` possibly undefined), introduced by commit 8105f8fd, pre-existing at `caf6865d~1`. Test-only, no production impact (suite GREEN via bun test) — did NOT block sign-off. Spin a fixer NOW (not deferred): type-narrowing in the test file only. Zone: `apps/mcp-server/`. DV: tsc clean on the file (0 errors) + suite still 7/0 GREEN.
- 🔄 **pressure-state seed** (finding #2, ACCEPTED — no task): seed `calendar_status:"unknown"` is initial-state-only; populates on next live cowork tick when Step 4.8 calls `is_trading_day`. No defect, no follow-up.

---

## Sprint DWF-PHASE1 — Adaptive cadence (heartbeat consults Cadence Policy)

**Status:** 🟢 GREENLIT 2026-05-31 (PO, DWF-EXIT). **Priority: HIGH.** Unblocked because DWF Phase 2 leader lock is live + QA-stable → the mandatory 0→2→1 ordering is satisfied (Phase 1 without Phase 2 is strictly worse than today — raises market-hours fire rate → more collision windows; that hazard is now closed by the live leader lock + per-work-item idempotent token). Zone: **cross-service/** (cowork heartbeat + Cadence Policy). Brief: `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` § Phase 1. Consumes Phase 0 SSOTs (`pressure-state.json`, `is_trading_day`, deterministic-router constraint).

- 🔄 **P1-BA** (BA, NEXT): decompose Phase 1 — heartbeat consults Cadence Policy (`policy_id` + `last_fired`; `due = now - last_fired >= cadence(pressure)`); calendar suppression via `is_trading_day` (no fire on holiday/weekend); freshness silent-downgrade. Deterministic-only (no LLM router, CLAUDE.md §3). Every AC a deliberate-violation proof, not "exit 0". → PO review. Then P1-ARCH → P1-PM → P1-DEV → P1-QA → P1-EXIT.
- ⛔ STILL DEFERRED (NOT Phase 1): Phase 3 content-router consuming `routing-policy.json` · Phase 4 persistent workgraph DAG · Phase 5 backpressure governor + per-zone commit lanes · `*/15`→`*/5` floor shortening · persistent leader daemon.

---

## Sprint FF-DEAD — Foreign-flow pipeline dead fleet-wide

**Status:** OPEN — PO triage 2026-05-30T10:14Z. **Priority: HIGH** (live-confirmed: `get_foreign_flow(code=FPT)` → source_tier 2, "never collected"; foreign net buy/sell dead for every ticker). Zone: **VPS-crawls (`vps-scripts/`) — UNCONTENDED** (separate from AR-* apps/ fan-out). Producer = `fetch-foreign-flow.sh` + `vn-foreign-flow.service`; receiver handler already exists in mcp-server.

- 🔄 FF-DIAG (dev-vps-crawls): live diagnose — is `vn-foreign-flow.service` running? read `/var/log/vn-foreign-flow.log`; has the producer ever pushed 200-OK? verify field-name drift (`fBuyVol/fSellVol/fRoom` vs current VPS API) + `select(>0)` market-closed exit-0 vs real failure; confirm `foreign_flow` DB row count. Fix root cause in `vps-scripts/`. Source report: `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P1.

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
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter. **LF-QA absorbs TR-2** (from BCTC-TRUST-RED): refine_status=DONE must yield non-zero opex codes 11/24/25/26, non-zero equity+liab, non-zero EBITDA, ≥1 OCF row from page 9/10/16.

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
