# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- **BCTC-AI-INPUT-TAB** ✅ SIGNED OFF 2026-05-30 (AIT-EXIT). Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect`: per selected page shows the agent-input PNG + OCR text + page-window the refine AI received. QA cycle-157 all 7 gates @ b4ed9266 + path-fix cbe96137. Live-verified: page-image route → real 336KB `image/png` (magic `89 50 4e 47`), miss → honest 404 `png_not_found`, page-window → `bctc_refined_units`; FPT report `e8ea3df5…` pages 6-11 rasterized; DB row untouched (`confirm_status=PENDING`); 6 prior tabs intact; repo==live image.
- **BCTC-HUMAN-CONFIRM** ✅ SIGNED OFF 2026-05-30 (HC-EXIT). Human-in-the-loop correction layer on `/api/bctc-inspect`: review red/yellow flagged cells, hand-correct, lock "ĐÃ XÁC NHẬN"; corrections survive cron refine re-runs (3-layer lock); 50/50 viewer + 6 tabs. QA HC-QA-3 cycle-156 all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154. Brief `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` (+ADDENDUM HC-ARCH-2 transaction-ordering). Commits 4c40939c·89100e07·ae3c5039·dca93898·7a3734ed·204344ec·9234e9c2·d5976d1e·441f8e18. 🔄 follow-up = AR-FU-DETERMINISM (below, shared with BCTC-AGENTIC-REFINE).
- **BCTC-AGENTIC-REFINE** ✅ SIGNED OFF 2026-05-30. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`. 🔄 **AR-FU-DETERMINISM** (MED, `apps/mcp-server` + `docs/agents/refine_bctc_md`): Haiku refine fan-outs emit non-deterministic markdown coverage (FPT run-1=91 vs run-2=18); store-correctness unaffected, coverage variance a trust follow-up. Lower temp / determinism guard / golden-markdown snapshot. DEFERRED.
- **DATA-PIPELINE-INTEGRITY** ✅ SIGNED OFF 2026-05-30. 🔄 FU-C (MED test-debt, `ohlcvForeignFlowStore.ts`, DEFERRED) · ⏳ FU-MON (Monday: DPI-3 Brent/Gold + DPI-4 `get_foreign_flow` live-probe).
- **BCTC-TABLE-BOUNDARY** ✅ SIGNED OFF 2026-05-30. Over-merge bug resolved (FPT=31/ACB=22, 0 dup). FU-BTB-OCR registered. Brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.

---

## Sprint DYN-WF-FOUNDATION — Multi-session-safe orchestration + demand-driven SSOT instrumentation

**Status:** 🟢 GREENLIT — PO kickoff 2026-05-30T20:53Z. **Priority: HIGH** (closes the duplicate-publish class + session-scoped SPOF; 4× chef-morning dup, 2026-05-29). Zone: **multi** (architect must split: `apps/mcp-server/` for `is_trading_day` tool + leader/work-item lock seam + `published:<work-id>` marker; `cross-service/` for cowork/dev-team flow + schedule-slot + `routing-policy.json` + `pressure-state.json` instrumentation). Goal: `docs/SPRINT_GOAL.md` § DYN-WF-FOUNDATION. Brief: `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` (+ agents-architect Review 2026-05-30, CONDITIONAL ADOPT). **Settled — do NOT relitigate:** phase cut (0+2, defer 3/4/5), ordering 0→2→1, deterministic-router-only (OQ-6).

**Greenlit build scope = Phase 0 + Phase 2 ONLY. Phase 1 registered-blocked. 3/4/5 deferred.**

- 🔄 **DWF-BA** (BA, NEXT): decompose `docs/SPRINT_GOAL.md` § DYN-WF-FOUNDATION into a requirement spec `docs/REQ_DYN-WF-FOUNDATION.md` covering Phase 0 (4 deliverables: prune dead slots, `routing-policy.json` read-only SSOT, `is_trading_day` tool, per-tick `pressure-state.json` instrument-only) + Phase 2 (leader lock, per-work-item idempotent token, `published:<work-id>` belt) with R1/R3 folded as BLOCKING acceptance criteria and R2 as a documented ops invariant. Each AC must be a deliberate-violation proof, not "exit 0". → PO review.
- ⏳ DWF-ARCH (architect, after BA spec approved): design split — confirm `apps/mcp-server` vs `cross-service` zones; design the leader-lock + per-work-item token seam reusing `task_claim`/`task_heartbeat`/`task_release` (kind `cowork-slot`, NO new enum); design `is_trading_day` tool contract + VN-holiday data source; design `routing-policy.json` schema + `pressure-state.json` schema; specify the R1 explicit-TTL enforcement point + R3 suffix-free key + R2 dark-window runbook. Architect owns the multi-zone split (per main.md `multi` rule).
- ⏳ DWF-PM (pm, after arch): sequence into ordered tasks honoring 0→2→1 (Phase 0 deliverables first; Phase 2 leader-lock + token; `is_trading_day` is a Phase 0 dev-mcp-server prerequisite that gates the calendar-SSOT deliverable). WIP≤2.
- ⏳ DWF-DEV (dev-mcp-server + generic developer for cross-service, after pm): implement per the spec; DV deliberate-violation tests RED-before/GREEN-after in SAME commit (single-winner leader test; suffix-free-key dedup test + a tick-suffix-would-leak counter-test; explicit-short-TTL crash-frees-within-180s test + default-3600-would-starve counter-test; `published` marker blocks 2nd send). ops REBUILDs mcp-server after change.
- ⏳ DWF-QA (qa, after dev): verify all Phase 0 + Phase 2 success metrics live; prove the deliberate-violation gates actually fail when violated (no false-green); confirm zero current-behavior change for Phase 0; sign off the Phase 2-cutover-stable gate that UNBLOCKS Phase 1. → PO sign-off (DWF-EXIT).
- 🔒 **DWF-PHASE1 (BLOCKED on DWF-QA Phase-2-cutover sign-off):** heartbeat consults Cadence Policy / adaptive cadence (`policy_id`+`last_fired`, `due = now-last_fired >= cadence(pressure)`, calendar suppression + freshness silent-downgrade). Phase 1 without Phase 2 is strictly worse than today (raises market-hours fire rate → more collision windows). Do NOT start until Phase 2 is QA-stable.
- ⛔ DEFERRED (not this sprint): Phase 3 content-router consuming `routing-policy.json` · Phase 4 persistent workgraph DAG · Phase 5 backpressure governor + per-zone commit lanes · `*/15`→`*/5` floor shortening · persistent leader daemon.

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
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Sprint BCTC-TRUST-RED — Trust layer green-stamps fabricated data (ESCALATED)

**Status:** OPEN — PO re-triage 2026-05-30T (OVERTURNS prior DEFER 09353af0). **Priority: HIGHEST (data-integrity RED).** Zone: multi (refine-contract + mcp-server + pdf-extractor). Source: router re-read of FPT Q1-2026 (report `e8ea3df5-3f32-413d-a3eb-c71634c0438d`) + spot-check ACB. **Architect owns root-cause split.** Lead item = TR-0; coverage gaps demoted behind it.

**Determination — refined data is SEEDED/MOCK, not a genuine OCR extraction.** Evidence: (1) values are perfect ascending/cyclic digit runs (`12345678901234`, `2345678901234`, `8901234567890`, `5678901234567`) — OCR never emits ordered digit sequences; (2) all 15 units share one identical `refined_at` 2026-05-30 11:18:58 — a real fan-out refine writes units at staggered times; (3) these exact values are NOT in any committed fixture/seed source → pushed into live market.db at runtime via a manual/scripted `push_bctc_refined_unit`. Cross-report check: ACB `get_bctc_full` shows the same structured-feed pathology (gross=net_rev, opProfit/EBITDA/equity/liab/cash all 0); GAS+VHM = no BCTC data ("Chưa có dữ liệu"). So contamination is confirmed in ≥2 DONE reports (FPT, ACB).

- ✅ TR-BA: BA spec complete — `docs/REQ_BCTC-TRUST-RED.md`; 8 FR, 40+ AC, 3 blockers documented; DDD layer mapped; publishable definition binding. NEXT: pm.
- 🔄 TR-PM: pm breaks into atomic dev tasks (TR0-DEV-1/2, TR1-DEV-1/2/3, TRUST-QA-1). Context: `docs/REQ_BCTC-TRUST-RED.md` + architect brief `docs/architecture-briefs/2026-05-30-bctc-trust-red.md`.
- 🔄 TR-0 (LEAD, RED): no mock/placeholder data may carry refine_status=DONE and feed analysis. Quarantine/purge the FPT + ACB seeded refined rows; block the structured feed from publishing when decomposition is absent (equity/liab/cash=0 must NOT pass as a real report). Architect designs gate; this is NOT a cosmetic coverage gap.
- 🔄 TR-1 (was EC-2, ESCALATE DEFER→GO): semantic sanity gate — confidence + flags + balance-check all report GREEN on part-fabricated, self-contradictory data (3 irreconcilable prior-period revenues: 16,058 / 11,481 / 20,225 tỷ, none flagged). Confidence scores OCR legibility not semantic validity. Add monotonic-digit + magnitude + cross-statement-consistency detector that down-confidences/flags.
- 🔄 TR-2 (was EC-1/3/4/5, coverage — FEEDS BCTC-LAYOUT-FIRST, not parallel): P&L opex 11/24/25/26 uncaptured (100%-margin artifact); equity/liab decomposition absent; CF fragmentation pages 9/10/16; prior-period column drift (88,142→68,586 tỷ). Hand to architect as acceptance evidence under existing BCTC-LAYOUT-FIRST charter.

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close)
- KD-QREF-LANG — OPEN (EN/VI switch)
- Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
