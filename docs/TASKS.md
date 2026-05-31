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
- ✅ **DWF-TSC-DEBT** RESOLVED / NO-OP 2026-05-31 (PO dev-team triage, verified-not-dispatched). The promoted-FIX premise ("19 TS18048 errors, `lastRule` possibly undefined") was **already satisfied at triage time** — PO ran raw checks, not badges: `tsc --noEmit` over `apps/mcp-server` = **0 errors total / 0 TS18048 / 0 in `DWF-routing-policy-fence.test.ts`**; the file already carries `!` non-null assertions at L92 (`rules[rules.length-1]!`) + L137 — that IS the type-narrowing the DV demanded. `bun test DWF-routing-policy-fence.test.ts` = **7 pass / 0 fail**. Both DV conditions met. Spinning a fixer would have been a false-RED dispatch → not dispatched, no code change, no commit. Likely narrowed during the DWF-PHASE1 commit range (5a19485e..d8892afc) after the 8105f8fd debt landed.
- 🔄 **pressure-state seed** (finding #2, ACCEPTED — no task): seed `calendar_status:"unknown"` is initial-state-only; populates on next live cowork tick when Step 4.8 calls `is_trading_day`. No defect, no follow-up.

---

## Sprint DWF-PHASE1 — Adaptive cadence (heartbeat consults Cadence Policy)

**Status:** ✅ DONE / SHIPPED 2026-05-31 (PO, P1-PO-EXIT). **Priority: HIGH.** Unblocked because DWF Phase 2 leader lock is live + QA-stable → the mandatory 0→2→1 ordering is satisfied (Phase 1 without Phase 2 is strictly worse than today — raises market-hours fire rate → more collision windows; that hazard is now closed by the live leader lock + per-work-item idempotent token). Zone: **cross-service/** (cowork heartbeat + Cadence Policy). Brief: `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` § Phase 1. Consumes Phase 0 SSOTs (`pressure-state.json`, `is_trading_day`, deterministic-router constraint). **NO container rebuild** — cron-read scripts/flow/config only (`.claude/scripts/*.js`, flow `.md`, `docs/data/*.json`); zero `apps/mcp-server/` production code touched (NFR-P1-5).

- ✅ **P1-BA** DONE 2026-05-31: spec at `docs/REQ_DYN-WF-PHASE1.md`. FRs: cadence-policy table (FR-P1-1), policy_id+last_fired in schedule (FR-P1-2), due-based matcher (FR-P1-3), calendar suppression (FR-P1-4), freshness silent-downgrade (FR-P1-5), legacy cron fallback (FR-P1-6), last_fired write (FR-P1-7). 4 BLOCKING architect questions (insertion order, policy completeness, write-contention, test zone). 3 PO-level open questions (fire-rate, staleness threshold, bctc-analyst holiday). 12 BLOCKING ACs each with DV proof idea.
- ✅ **P1-ARCH** DONE 2026-05-31: blueprint at `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md`. All 4 BLOCKERs resolved (suppression before claim; 14-slot policy_id table; batched Step 5b atomic write; cadence-policy.js in .claude/scripts/ + bun:test harness). OQ-P1-2 (20-min staleness) + OQ-P1-3 (bctc-offmarket policy) encoded. NFR-P1-1 verified: Phase 2 invariants untouched.
- ✅ **P1-PM** DONE 2026-05-31: blueprint decomposed into 8 atomic subtasks. Handoffs: TASK_P1-DEV-1..7 + TASK_P1-QA (9 files total). Zone assignment:
  - **Parallel tier-1** (can run together): P1-DEV-1 (docs/data/cadence-policy.json, ~220 lines, SSOT config), P1-DEV-2 (.claude/scripts/cadence-policy.js, ~180 lines, evaluator module), P1-DEV-4 (docs/data/cowork-schedule.json, +policy_id/last_fired, ~40 lines). All independent, no blocking deps.
  - **Sequential tier-2** (depends on tier-1): P1-DEV-3 (cowork-match-slots.js adaptive mode, ~40 lines, requires evaluator from DEV-2) → P1-DEV-5 (flow Steps 4.2–4.5b, ~120 lines, requires schedule + matcher) → P1-DEV-6 (flow Step 5b, ~50 lines, requires finalized CADENCE_MATCHES).
  - **Parallel tier-3** (test, can run after tier-1): P1-DEV-7 (DWF-phase1-cadence.test.ts, ~350 lines, 13 unit/integration DV tests RED→GREEN).
  - **Final gate**: P1-QA (integration verification, live cowork tick trace, 8 verification gates).
  - **DV test mapping:** All 12 BLOCKING ACs from spec § 9 + 1 NFR-P1-1 mapped to tests T-1..T-13 (unit 1–12, integration stubs 13/13b/13c). Each test has explicit RED proof idea.
  - **WIP enforcement:** Max 2 In Progress (tier-1 runs 3 but are atomically independent; tier-2 enforced serial; tier-3 parallel after tier-1). No blockers detected; all BLOCKERs (1–4) resolved in architect brief.
- ✅ **P1-DEV-1..7** DONE 2026-05-31 (commits 5a19485e..d8892afc on main): `cadence-policy.json` (19 rules / 3 policy IDs), `cadence-policy.js` evaluator (deterministic, safe-default 240), `cowork-match-slots.js` adaptive `--mode` + legacy fallback, `cowork-schedule.json` (14 slots all assigned `policy_id`+`last_fired`), flow Steps 4.2–4.5b (suppression before per-work-item claim) + Step 5b (batched atomic last_fired write), `DWF-phase1-cadence.test.ts` (48 assertions, 13 groups, all DV-proofed RED→GREEN).
- ✅ **P1-QA** DONE 2026-05-31 (commits fbdba703, 7a461eb7 on main): `reports/TASK_REPORT_P1-QA.md` — 8 gates GREEN, 48/48 tests, RED proofs T-2/T-8/T-12 verified, NFR-P1-1 Phase 2 safety intact, NFR-P1-5 zero mcp-server production change, BLOCKER-3 atomic write verified, legacy fallback tested.
- ✅ **P1-PO-EXIT** DONE 2026-05-31 (PO, critique-before-approve): **CLOSE — APPROVE.** Independently verified (raw values, not badges): ran suite myself (48/48 GREEN), executed own RED proof on EC-6 chef-intraday open/low null-injection (→ 2 fail, restored → 48/48) proving the audit test is load-bearing not a stub. All 12 BLOCKING ACs genuinely satisfied. All 3 PO decisions correctly encoded: chef-intraday open/high=60 + never-suppress-on-open (EC-6); `_staleness_threshold_minutes=20`; bctc-offmarket holiday→null / weekend→1440 / open+half_day+unknown→`_cron_fallback`. BLOCKER-1 confirmed: zero `task_claim`/`task_release` in suppression band (Steps 4.2–4.6) — suppression strictly before claim. Adaptive cadence is additive over Phase 2 (no regression): leader lock + suffix-free `cowork-slot:` token + `published:` marker all intact (13 refs). NO container rebuild required (cron-read only). Sign-off: `docs/handoffs/P1-PO-EXIT-signoff.md`.
- ⛔ STILL DEFERRED (NOT Phase 1): Phase 3 content-router consuming `routing-policy.json` · Phase 4 persistent workgraph DAG · Phase 5 backpressure governor + per-zone commit lanes · `*/15`→`*/5` floor shortening · persistent leader daemon.

---

## Sprint FF-DEAD — Foreign-flow pipeline dead fleet-wide

**Status:** ✅ FIXED — pending FU-MON in-the-wild confirm (PO live-verified 2026-05-31T00:33Z). Root cause was VPS field-name drift; FF-DIAG fix shipped commit `0cbce0b4`, service redeployed. **PO raw-value re-probe THIS tick (not a badge):** `get_foreign_flow(FPT)` now returns a REAL daily history — `2026-05-30` net vol **−37905** shares, foreign room **34.75M**, with per-day rows back to 05-19. No longer `source_tier:2 "never collected"`. Pipeline is live and producing rows. Zone: VPS-crawls (`vps-scripts/`). ⏳ **FU-MON** (Monday VN open): probe `get_foreign_flow` for a non-zero net during live trading hours to confirm in-the-wild (the −37905 was a single populated day on a closed market — confirms ingest works, FU-MON confirms continuous collection). NOT dispatchable until Monday open. Source report: `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P1.

- ✅ FF-DIAG (dev-vps-crawls) — DONE, field-name drift fix `0cbce0b4` live, foreign_flow rows confirmed non-empty via live `get_foreign_flow(FPT)`.

---

## Sprint MACRO-CMDTY-DELTA — Brent/Gold change% stuck at +0.00%

**Status:** ✅ DONE / SHIPPED — PO-EXIT sign-off 2026-05-31T01:34Z (APPROVE, critique-before-approve, raw-verified). **Priority: LOW.** Real root cause was in **`apps/mcp-server/`** (NOT `apps/macro-indicators/` — the zone-handoff hypothesis was correctly disproven). Source report `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P4; DASHBOARD row cow-20260529T221054-MCP-P4 → RESOLVED. Commits: **e510e5df** (prod fix + YF-14/15 regression tests) · **dab1bf86** (test-only cross-day timestamp shift) · **fdc17265** (dev notebook). Production image **802d6463e665** (ops rebuilt + force-recreated, healthy, 12-service fleet healthy).

- ✅ MACRO-CMDTY-DELTA-FIX (dev-mcp-server): RESOLVED. **Root cause** (not the original macro-indicators hypothesis): Yahoo returns the same daily close repeatedly off-market; the old prev-close query `WHERE source='yahoo' AND fetched_at < ? ORDER BY fetched_at DESC LIMIT 1` matched a ~1h-old identical row → `computeDelta(x,x)=0` permanently. **Fix:** prev-close now uses the previous-calendar-day latest row — `AND date(fetched_at) < date(?) AND brent_crude_usd > 0` (and `gold_usd_per_oz > 0`) — so day-over-day delta is always meaningful. **PO raw-verified at EXIT** (not a QA badge): (1) live `get_cycle_bootstrap` MACRO = `BRENT 91,12 (+0.00%)` / `GOLD 4.593 (+0.00%)` — HONEST flat-weekend zero (prices genuinely unchanged since 2026-05-30, market closed); (2) prod fix logic confirmed in `yahooFinance.ts`; (3) DPI-3 ran by PO = 4 pass / 0 fail, assertions are real non-zero deltas (25.0% / -20.0% / amt 20·500), NOT neutered; (4) git scope: dab1bf86 = test-only 1 file 6 lines, `yahooFinance.ts` untouched since e510e5df. DV met (verified-honest 0.00% + correct logic + green tests + clean scope). **FU:** signed-non-zero in-the-wild verification on the next real Brent/Gold move (next trading session, ~Monday open). Fleet-suite 346 fails are pre-existing baseline drift, zero overlap with commodity/delta.

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
