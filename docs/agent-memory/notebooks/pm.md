# PM — Notebook

**Last updated:** 2026-05-14 (PM bookkeeping, post-1912-program-complete) | **Sprint:** 1912 Go migration CLOSED

## Current state

- **WIP: 0/2 (CLEAN)** — 1912 Go migration program CLOSED 2026-05-14. All 4 services migrated: 1912a (api-gateway, CLOSED c106), 1912b (alert-engine, CLOSED c108), 1912c (stock-price, CLOSED c108), 1912d (cutover+cleanup, CLOSED c106). Architect post-merge SPRINT-L review PASS (commit 738b6eee). Program-complete signal: `docs/signals/20260514T182941Z-1912-go-migration-program-complete.json`. 2 non-blocking janitor flags: stock-price legacy TS tests + alert-engine tracked server binary → janitor-1912 task queued. docker-compose.yml zero Dockerfile.go refs remain. 1910a (HIGH FEATURE ISM) now eligible for dispatch; 1909c (CRITICAL OPS reparse) in Todo pending 2026-05-16 Q1-2026 PDFs.
- **c95 DISPATCH (2026-05-14T04:00Z):** Sprint 1909a/b execution complete + APPROVED. Both entered In Progress c94, both shipped + QA gate passed c95. 1909a (cashFlowExtractor.ts multi-layout + VAL-07 protection, 45 fixtures). 1909b (get_bctc_ocf tool, 8 tests / 29 assertions, architect SD-2 honored). Container rebuild queued post-c95.
- **BCTC OCF (Sprint 1909):** Bottleneck item from TNB c50 #1. Banking deadline 2026-05-15 COVERED by 1908c (deployed c92) + 1890a (deployed c90). 1909 extends OCF analysis layer 7 gate (NI vs OCF ratio).
- **FRED ISM + EFFR package (Sprint 1910):** TNB c50 #2 + #3 bundled. 1910a requires FRED API key (free registration). 1910b auto-cure 3-cycle threshold (D-step carry evidence FA/UA/NS c05-c14). Sequenced after 1909b to avoid merge conflicts.
- **Backlog:** 1907a (HIGH OPS escalated, TNB c49), 1907b (LOW OPS observational), 1909c (CRITICAL OPS, blocked), 1910a (HIGH FEATURE, user-action blocked), JANITOR-{021,011,014,020}, 1897b-carry (F1 USER + architect, URGENT-F1), TASK-BCTC-3
- **Todo:** 1910b (HIGH CHORE, sequential after 1909b), 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F} (OPS, user-blocked)
- **TASKS.md:** 73L (compact: archived 18 pre-c80 tasks + 1903a stale note). WIP=2/2. No blockers.
- **Status:** c94 DISPATCH COMPLETE. 1909a + 1909b in In Progress. Handoff files created. PM ready for dev-team flow Step 3 execution.

---

## Cycle 109 — 2026-05-14 Post-Merge Bookkeeping: 1912 Program Close (WIP=0/2 CLEAN)

**Input:** Architect post-merge SPRINT-L review PASS (commit 738b6eee). Program-complete signal: `docs/signals/20260514T182941Z-1912-go-migration-program-complete.json`. All 4 services verified on Go 1.22 stack. 2 non-blocking janitor flags from architect.

**Actions:**
1. **Closed 4 cutover tasks in TASKS.md In Progress → Done:**
   - 1912a-cutover (api-gateway, api-gateway-go retire, c106)
   - 1912b-cutover (alert-engine, 6h smoke PASS, c108)
   - 1912c-cutover (stock-price, 6h smoke PASS, c108)
   - 1912d-cutover (cleanup, c106) — **NOTE:** moved to Done with parent program entry
2. **Closed parent program row:** 1912-go-migration-program (Backlog → Done, completion date 2026-05-14).
3. **Created janitor task:** janitor-1912 in Backlog. Scope: (1) remove apps/stock-price/__tests__/*.ts legacy bun:test files (paths ref removed src/), (2) git rm --cached apps/alert-engine/server (binary tracked before .gitignore). Priority=LOW, Size=SMALL (FIX).
4. **Updated project-stats.json:** sprintGoal + lastUpdated reflect program closure + janitor queued.
5. **TASKS.md final:** 44L (well under 80L cap). Backlog + Todo + Done sections. WIP=0/2 CLEAN.
6. **PM notebook updated:** Header, current state, this cycle entry. Ready for next dev dispatch.

**Status:** Bookkeeping COMPLETE. Program archive ready. Janitor task queued. WORK channel notification sent. Next dev dispatch: 1910a (HIGH FEATURE, ISM tool) eligible, or ops 1909c reparse (CRITICAL, blocked Q1-2026 PDFs awaiting 2026-05-16).

---

## Cycle 108-tick1 — 2026-05-14 c108 Dispatch: 1912b-cutover sequential (WIP=1/2)

**Input:** PO signal `20260514T200000Z-1912bc-cutover-dispatched.json` — sequential strategy, 1912b first (single Dockerfile, q30s cron higher cutover risk), 1912c gated on 1912b 6h smoke pass per BA spec §6. QA APPROVED both (37/37 + 31/31 pkg test PASS). User confirmed cutover go-ahead 2026-05-14.

**Recurring-bug check:** Per feedback_recurring_bug_escalation.md: 0 prior cutover commits on alert-engine zone. N/A — no escalation needed.

**Actions:**
1. **1912b-cutover status → in_progress** (TASKS.md L35): Owner=dev-alert-engine confirmed. Recurring-bug rule N/A documented.
2. **Created dispatch signal** `docs/signals/20260514T201530Z-pm-dispatch-1912b-cutover.json` with: from=pm, to=dev-alert-engine, type=sprint-dispatch, task_id=1912b-cutover, tasks_row=docs/TASKS.md#L35, spec=docs/specs/1912b-alert-engine-go-migration.md §6 + coupled scope, smoke_gate_hours=6, smoke_pass_criteria=[/health 200, 0 SQLITE_BUSY in 6h logs, alert-engine cron rows continuous], next_action=dispatch 1912c-cutover on smoke pass, recurring_bug_check={prior_commits:0, status:N/A}.
3. **Moved PO signal** `20260514T200000Z-1912bc-cutover-dispatched.json` → `docs/signals/processed/` via git mv.
4. **PM notebook updated** (header, current state, cycle entry).

**WIP Status:** 1/2 (OPEN). 1912c held in Backlog pending 1912b smoke gate (6h).

**Status:** Dispatch COMPLETE. Signal queue ready. dev-alert-engine picks up via signal queue next cycle (dev-team flow). No spawn of dev agent per feedback_agent_autonomy.md.

---

## Cycle 98 — 2026-05-14 c98 Sprintify: 1912a-gateway-spec dispatched (WIP=1/2)

**Input:** Upstream gates all cleared. Spec REQ_1912a.md landed (11 ACs). Architect review APPROVE (commit `813053b6`). agent-father Go competency installed (commit `253060bf`). BA + architect + dev role decisions all resolved. Blocker D-1 (/healthz k8s alias, Go-only) and D-2 (dev role = extend dev-api-gateway) both resolved.

**Actions:**
1. **Created handoff TASK_1912a-gateway-go-migration.md** (≤200L per split policy). Frontmatter: sprint=1912, branch=task/1912a-gateway-go-migration, size=M, zone=apps/api-gateway/, blocks=[1912b-alert-engine, 1912c-stock-price]. TLDR, PM Planning Context (zone, ACs, files to read/create/modify, dependencies, knowledge), Implementation Checklist (high-level, DDD layers), Risk Flags (R-G1 to R-G5 from spec § 6), Sequencing & Blockers (AC-10 24h smoke window gate P2/P3), AC Reference table.
2. **Updated TASKS.md:**
   - 1912-go-migration-program (Backlog): annotation "Phase 1 dispatched c98" + note on 1912a entry moved to In Progress
   - 1912a-gateway-spec: moved Todo → In Progress. Updated row: Owner=dev-api-gateway, Handoff=docs/handoffs/TASK_1912a-gateway-go-migration.md, Blocked by=—. Row text updated to reflect APPROVE brief + resolved blockers + Go competency lazy-load installed.
3. **WIP check:** 0/2 (before) → 1/2 (after). Within capacity. No parallel task touches apps/api-gateway/ zone. Clear.
4. **TASKS.md line count:** 84L (acceptable for critical phase-1 dispatch; will compact if >85L next cycle).
5. **PM notebook:** Updated header (c98) + current-state entry (WIP=1/2, 1912a IN PROGRESS, Go competency installed, P2+P3 blocked on AC-10 smoke window).

**Status:** Sprintify COMPLETE. Handoff ready. 1912a dispatched to dev-api-gateway. Pre-flight checks PASS. Ready for dev flow Step 3 (execute).

**Dispatch signal:** PM will drop `docs/signals/{ts}-1912a-pm-to-dev-api-gateway.json` with: from=pm, to=dev-api-gateway, type=dispatch-ready, task=1912a-gateway-go-migration, handoff=docs/handoffs/TASK_1912a-gateway-go-migration.md, branch=task/1912a-gateway-go-migration, commit=<sha> (to be filled in post-commit).

**Carry-over to c99:** 1912a (In Progress), 1909c (HOLD, blocked Q1-2026 PDFs), 1910a (TODO, user-pending FRED_API_KEY), 1907a (CRITICAL OPS escalated TNB-c51), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (HIGH F1 USER), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F} (user-blocked).

---

## Cycle 96 — 2026-05-14 c96 Close: 1910b SHIPPED + 1909c HOLD (WIP=0/2 CLEAN)

**Input:** QA c96 completion. 1910b (effr-package-reg) APPROVED. Ops c96 1909c reparse-validation report: AC-1/2/3 PASS, AC-4/5 HOLD (Q1-2026 PDFs awaiting SSC, banking deadline 2026-05-15).

**Outcomes:**
1. **1910b-effr-package-reg-SHIPPED-c96 (HIGH CHORE, agent-md-editor):** Zero-build config-only. Added `get_fed_liquidity_spread` to 3 agent bootstrap arrays (financial_analyst L77, news_scout L45, unified_coordinator L271) in agentBootstrap.ts + 3 package docs (financial-analyst.md, news-scout.md, unified-agent.md) + SKILL_MANIFEST.md mirror. Auto-cure 3-cycle evidence confirmed (FA c05–13, UA c14, NS c13). Commits: config `e7fd1718` + notebook `961c62ec` + news-scout-nb `b6daa3e7`. QA APPROVED 9/9 AC. Container rebuild dispatched in parallel ops cycle.
2. **1909c-reparse-validation [PARTIAL PASS + HOLD]:** AC-1/2/3 PASS (pipeline verified, Q4-2025 sample 9/9 tickers extract OK, tool registered, toolCount=140). AC-4/5 HOLD: Q1-2026 BCTC PDFs not yet at SSC (banking deadline 2026-05-15 = tomorrow); scheduled reparse trigger 2026-05-16 post-deadline. FA Layer 7 G-step gate remains open. Commit `b3d1fa47` (ops). Recommendation: Trigger `bctcReparseJob` 2026-05-16 morning, evaluate AC-4 (≥30/37 non-zero OCF target) at that time.

**Actions:**
- Moved 1910b from Todo → Done with c96 tag + commit SHAs + QA APPROVED 9/9.
- Updated 1909c in Todo: Added [HOLD] marker, updated Blocked by to "Q1-2026 BCTC PDFs at SSC + next FA cycle". Kept CRITICAL priority — ship-completion gate still open. Added note: AC-1/2/3 PASS already.
- Moved 1910a from Backlog → Todo (FRED_API_KEY confirmed in .env line 23). Unblocked.
- TASKS.md final: 78L (under 80L cap). WIP=0/2.
- PM notebook updated (c96 entry).

**Container deploy NOTE:** Router will trigger ops rebuild in post-cycle. Do NOT spawn ops myself per feedback_agent_autonomy.md.

**Carry-over to c97:** 1909c HOLD (reparse trigger 2026-05-16), 1910a (HIGH FEATURE ready for dev dispatch), 1907a (HIGH OPS escalated TNB-c49), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (F1 USER + architect), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**Status:** c96 CLOSED. WIP=0/2 CLEAN. Pipeline ready. 1910b config deployed (awaiting container rebuild). 1909c await-only gate blocking until 2026-05-16. 1910a now unblocked + ready for dev dispatch. No code-path blockers.

---

## Cycle 95 — 2026-05-14 c95 Close: 1909a + 1909b SHIPPED (WIP=0/2 CLEAN)

**Input:** Dev-team + QA c95 completion. 1909a-extractor + 1909b-tool APPROVED.

**Outcomes:**
1. **1909a-extractor-SHIPPED-c95 (CRITICAL, dev-pdf-extractor):** `cashFlowExtractor.ts` multi-layout support (7-block detection + sub-line balance logic) + implicit VAL-07 protection from 1908c-pattern drift. 22 new + 23 baseline fixtures (VNM/DIG/VCB Q4-2025). Domain zero-I/O. tsc 0. Minor console.warn format deviation (non-blocking). Commits: impl `148d1e99` + notebook `3b8d76f7`. QA APPROVED 7/7 AC.
2. **1909b-tool-SHIPPED-c95 (CRITICAL, dev-mcp-server):** New `get_bctc_ocf` MCP tool (#132). **Architect SD-2 honored**: `extraction_method` SELECT'd from DB enum (pdf-parse/ocr-200/ocr-300/news_inference), never hardcoded. Registered in registry + agentBootstrap + financial-analyst.md + SKILL_MANIFEST.md. 8 tests / 29 assertions PASS, 4 enum values covered. tsc 0. Cherry-pick union-merge applied for 1890a-B compatibility. Commits: impl `d285cc68` + notebook `a3381005`. QA APPROVED 11/11 AC.

**Actions:**
- Removed 1909a-extractor + 1909b-tool from In Progress → Done. WIP becomes 0/2 (CLEAN).
- Moved 1909c-reparse-validation from Backlog → Todo. Blocked by "Container deploy" (once mcp-server container rebuilt, ops can run reparse).
- Updated 1910b-effr-package-reg Blocked by from "1909b-tool deployed" → "Container deploy" (sequential after ops rebuild, shared agentBootstrap.ts).
- TASKS.md final: 77L (under 80L cap). Zero archive trigger.
- PM notebook updated: WIP=0/2, c95 CLOSED, container deploy context set for next cycle.

**Container deploy NOTE:** Router will trigger ops in post-cycle if appropriate. Do NOT spawn ops myself per feedback_agent_autonomy.md.

**Carry-over to c96:** 1909c (CRITICAL OPS, blocked container deploy), 1910b (HIGH CHORE, blocked container deploy), 1910a (HIGH FEATURE, blocked USER-ACTION FRED_API_KEY), 1907a (HIGH OPS escalated TNB-c49), 1907b (LOW OPS observational), JANITOR-{021,011,014,020}, 1897b-carry (F1 USER + architect), TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**Status:** c95 CLOSED. Pipeline clean. BCTC OCF extraction layer 7 gate ready for ops reparse. No blockers on developer side — container deploy sequence required.

---

## Cycle 94 — 2026-05-14 c94 Decomposition: 1909+1910 sub-tasks entered, WIP-2 1909a+1909b In Progress

**Input:** BA decomp + architect rubber-stamp for 1909 (3 sub-tasks) + 1910 (2 sub-tasks). Dev-team flow Step 2 complete. PM entry required.

**Actions:**
1. **TASKS.md compacted:** Archived 18 pre-c80 tasks + 1903a stale bundled note into single line. From 82L → 73L (under 80L cap).
2. **Entered 1909a-extractor + 1909b-tool → In Progress (WIP=2/2 AT CAPACITY).** Parallel-eligible zones (domain/services/financial-reports vs interface/mcp/tools/financial-reports). Both CRITICAL for BCTC OCF gate.
3. **Entered 1909c-reparse-validation → Backlog (CRITICAL OPS, blocked on 1909a+1909b deploy).** Completion gate: Layer 7 G-step PASS in financial-analyst notebook.
4. **Entered 1910a-ism-tool → Backlog (HIGH FEATURE, USER-ACTION blocked: FRED_API_KEY env var).** Architect SD-1 resolved: PATH (a) FRED REST API + free key.
5. **Entered 1910b-effr-package-reg → Todo (HIGH CHORE, sequential after 1909b deployed).** Zero-build. Shares agentBootstrap.ts with 1909b → PM sequenced 1910b AFTER 1909b merge.
6. **Created 5 handoff files:** TASK_1909a-extractor.md, TASK_1909b-tool.md, TASK_1909c-reparse-validation.md, TASK_1910a-ism-tool.md, TASK_1910b-effr-package-reg.md. All include zone, dependencies, file lists, acceptance criteria.
7. **Updated PM notebook:** c94 state + WIP status + BCTC deadline coverage + user-action blockers flagged.

**WIP gate (≤2):**
- Dispatched 1909a + 1909b (CRITICAL: banking deadline 2026-05-15 covered by prior 1908c + 1890a, this extends Layer 7 gate).
- Justified by 1908c precedent (similar extractor refactor took ~1 cycle). Both tasks disjoint file paths.
- 1910a blocked on user-action (FRED API key registration). 1910b blocked on 1909b deploy (shared file conflict). 1909c blocked on both 1909a+1909b deploy.

**Carry-over to c95:** 1909a+1909b (In Progress), 1909c (Backlog, reparse validation), 1910a (Backlog, user-action), 1910b (Todo, sequential), 1907a (HIGH OPS escalated, TNB c49), 1907b (LOW OPS), JANITOR-{021,011,014,020}, 1897b-carry, TASK-BCTC-3, 1900c, 1899a-bloomberg-test-split, 1862c-{E,F}.

**TASKS.md:** 73L (under cap). WIP=2/2. Blockers: 1907a TNB escalation (observational), 1910a user-action (FRED API), 1862c-E user-action (Cloudflare), 1897b-carry F1 (Docker .git/ exclusion).

**Status:** c94 dispatch complete. Dev-team flow Step 3 execution ready.

---

## Cycle 92 — 2026-05-14 c92 Post-Cycle Housekeeping: 1908b Brief DONE + 1908c FIX Queued (banking deadline 2026-05-15)

**Input:** Architect brief 2026-05-14 landed. Recurring-bug escalation resolved. FIX task 1908c ready for dev-pdf-extractor.

**Outcome:**
1. **1908b-bctc-val07-extractor-rethink → Done.** Architect brief delivered 2026-05-14: `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md` (109L). Recommendation: **Option B (upstream plausibility override in extractor)** is primary fix. Reasoning: (a) keeps bad data out of DB, (b) mirrors `liabPlausible` pattern (lines 765-776), (c) prevents drift on other fields, (d) ships in time for banking deadline 2026-05-15.
2. **1908c-bctc-val07-totalassets-plausibility-override → Backlog HIGH.** New FIX task created. Implementation: 3-line guard after line 716 (`if (totalAssets > 0 && computedFromSubtotals > 0 && computedFromSubtotals / totalAssets > 5)` → override). Golden test fixtures: VNM Q4 2025 (55x ratio trigger) + DIG Q4 2025 (28,460x trigger) + VCB + FPT (regression). Baseline pass: 042-bctc-balance-sheet.test.ts + 1120-split-block + 287-balance-sheet-unit-header. New test: `1908c-totalassets-plausibility-override.test.ts`. Zone: `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` (primary) + `financialFiguresValidator.ts` (optional secondary). Effort: S.
3. **Parallel execution model:** PM commits TASKS.md on main; dev-pdf-extractor starts task/1908c branch in parallel. No file conflicts (separate branches, separate files).

**Actions:**
- Moved 1908b from Backlog → Done with architect brief ref + 2026-05-14 completion.
- Inserted 1908c in Backlog HIGH (FIX type, dev-pdf-extractor owner) with full implementation spec from architect brief.
- Updated TASKS.md header to reflect ready state: WIP=0/2, 1908c queued, banking urgency noted.
- Created TASK_1908c.md handoff file (from architect brief atomic change spec + test strategy).
- PM notebook updated (current state + cycle entry).

**TASKS.md:** 79L (under 80L cap).

**WIP Status:** 0/2 (CLEAN). 1908c in Backlog (not In Progress), ready for execute-tier dispatch to dev-pdf-extractor.

**Carry-over to c93:** 1908c (now executing), 1907b (LOW OPS observational), 1897b-carry (URGENT-F1), 1900c (LOW), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c92 CLOSED. Recurring-bug rethink shipped. FIX task ready. Banking deadline 2026-05-15 covered. No blockers.

---

## Cycle 91 — 2026-05-14 c91 Dispatch: 1908a-SPIKE DONE + 1908b Backlog Architect-Routed (recurring-bug rule)

**Input:** dev-pdf-extractor c91 spike completion. VNM Q4 2025 low-confidence triage report filed.

**Findings:**
- Root cause = (c) extractor schema drift in `balanceSheetExtractor.ts:extractSplitBlockAll`
- Code "270" (TONG TAI SAN) mapped to wrong sub-item value: 957M (Tài sản dài hạn khác) vs 53T grand total
- VAL-07 hard-fail triggered (liabilities 18.8T > assets 957B * 5)
- Systemic risk: DIG Q4 same pattern; banking cohort 2026-05-15 at risk
- Spike mode: triage doc only, no production code merged

**Recurring-bug escalation (per feedback_recurring_bug_escalation.md):**
- Prior fix 1815 (BCTC-VAL-01-POSITION guard) protects VAL-01; VAL-07 unprotected
- Root cause = positional extraction protocol drift (not threshold misfire)
- Architect must rethink before new fix attempt
- Recommended: Brief exploring Option B (plausibility override in extractBalanceSheet) vs Option A (VAL-07 downstream guard)

**Actions:**
- Moved 1908a from Todo → Done (SPIKE tag, c91 completion, report ref)
- Created 1908b-bctc-val07-extractor-fix in Backlog, HIGH OPS-FIX, architect owner
- TASKS.md finalized at 79L (under 80L cap)
- PM notebook updated (current state + cycle entry)

**Carry-over to c92:** 1908b (awaiting architect brief), 1907b (LOW OPS observational), 1897b-carry (URGENT-F1), 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c91 dispatched. WIP=0/2. Architect brief expected 2026-05-14 or 2026-05-15.

---

## Cycle 90 — 2026-05-14 c90 Close: 1890a-A + 1890a-B SHIPPED + DEPLOYED (WIP=0/2 CLEAN)

**Input:** Dev-team + ops c90 completion. 1890a sprint SHIPPED and DEPLOYED.

**Outcomes:**
1. **1890a-A (CRITICAL, dev-mcp-server, BUILD-DONE):** `get_cash_flow` tool live. Commit `fd7cbe44` + QA approval `07a1af9a`. Full CF statement (operating_cf/investing_cf/financing_cf/capex/free_cash_flow) + OCF/NI ratio (null-safe). DDD pattern verified. 5/5 tests PASS (happy path + missing quarter + unknown ticker + zero NP + null NP). source_tier=1 invariant VERIFIED. Zone: apps/mcp-server/.
2. **1890a-B (HIGH, agent-md-editor, MANIFEST-DONE):** 3 manifest additions (get_macro_snapshot / get_bond_maturity_calendar / get_investment_clock_phase) + doc-verify get_insider_signals. Commit `915763a2`. agentBootstrap.ts + SKILL_MANIFEST.md + financial-analyst.md all synchronized. 26/26 spot-check tests PASS. Zone: apps/mcp-server/ + docs/.
3. **Ops deploy (2026-05-14T04:26:26Z):** Image SHA `9ecc5371...`. Container restart successful. toolCount 130→139 (get_cash_flow #131 + 8 waterfall tools). Post-rebuild health check: 9/9 services UP, mcp-server /health=200 OK. Deploy report: `reports/TASK_REPORT_1890a-deploy.md`. Deploy commit `4a786039`.
4. **BCTC Q1/2026 banking deadline (2026-05-15) COVERED** — get_cash_flow live in production for BCTC extraction pipeline.

**Actions:**
- Moved 1890a-A from In Progress → Done (SHIPPED tag + code `fd7cbe44` + QA `07a1af9a` + deploy `4a786039`).
- Moved 1890a-B from In Progress → Done (SHIPPED tag + code `915763a2` + deploy `4a786039`).
- TASKS.md: Removed In Progress section (WIP=0). Final line count 58L (under 80L cap).
- project-stats.json: Updated previousSprint from 1867 to 1889, toolCount confirmed 139.
- PM notebook: Updated header and current state (WIP=0, c90 CLOSED).
- Status: WIP=0/2 CLEAN. Ready for c91 dispatch.

**Carry-over to c91:** 1897b-carry (URGENT-F1, blocks architecture), 1907b (LOW observational), 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c90 CLOSED + DEPLOYED. Pipeline clean. BCTC covered. Ready for PO/architect to prioritize c91.

---

## Cycle 90 — 2026-05-14 c90 Finalize: 1907a DIAG + 1890a SPEC DONE, Dispatch 1890a-A + 1890a-B (WIP=2/2 CRITICAL)

**Input:** QA verdicts: 1907a diagnostic complete (root cause = Claude Desktop external trigger, no code bug). 1890a spec + brief landed (5-tool audit: 1 new BUILD, 3 manifest additions, 1 doc-verify).

**Decisions:**
1. **1907a-digest-predict-silence → Done.** Diagnostic complete c90, root cause documented. Spawned follow-up 1907b-digest-predict-cowork-trigger-investigate (LOW OPS, observational).
2. **1890a-spec-expanded → Done.** Spec-only phase complete. Split into subtasks as architect + BA recommended.
3. **1890a-A + 1890a-B → In Progress (dispatch NOW).** CRITICAL: BCTC Q1/2026 banking deadline TODAY (2026-05-15). Both tasks execute in parallel **structurally** but MUST sequence **logically**: 1890a-A (BUILD get_cash_flow, CRITICAL) deploys first → 1890a-B (manifest edits, HIGH) follows after merge to avoid shared-file conflicts (agentBootstrap.ts, SKILL_MANIFEST.md, financial-analyst.md).

**Actions:**
- Moved 1907a to Done with c90 QA note + report ref.
- Moved 1890a-spec-expanded to Done with spec+brief commits.
- Moved 1890a-A + 1890a-B to In Progress. WIP becomes 2/2 (AT CAPACITY).
- Created follow-up 1907b in Backlog (LOW priority observational task).
- Created handoff files: TASK_1890a-A.md (BUILD get_cash_flow, blocks 1890a-B), TASK_1890a-B.md (manifest edits, depends_on 1890a-A), TASK_1907b-investigate.md (observational follow-up).
- TASKS.md finalized at 80L (at cap). Sequencing constraint documented in both handoffs.
- PM notebook updated (ULTRA format).

**WIP Status:** 2/2 FULL. Next tier (1890a-B) held until 1890a-A merges + deploys. No new dispatch until A ships.

**Dispatch Ready:** 1890a-A (dev-mcp-server) → execute immediately (CRITICAL deadline). 1890a-B queued (agent-md-editor) → start after 1890a-A merge.

---

## Cycle 89 — 2026-05-14 c89 Close: 1906a-headlock-cure-permanent DONE (recurring-bug escalation resolved)

**Input:** Preflight recurring-bug escalation (HEAD.lock 3rd cycle c87/c88/c89 — 14 total occurrences). Architect brief 2026-05-13 + PO triage already complete c88. PO chose Rec #2 (PREFLIGHT permanent policy).

**1906a outcome:** Developer edited `docs/protocols/head-lock-self-cure.md` (+13L): reclassified from "temporary workaround" → PERMANENT OPERATIONAL POLICY. Added § (f) Policy Classification: 3-cycle recurrence evidence, 100% cure rate (14/14), architect brief ref, structural cure tracked in 1897b-carry. Merge `3538ce5b`. QA APPROVED. No code touched.

**Actions:**
- Recurring-bug signal drained: `docs/signals/processed/2026-05-14T02-12-54Z-headlock-recurrence.json` → processed.
- 1906a moved In Progress → Done. Routed signal to PO (escalation resolved by doc-only chore).
- 1897b-carry note in TASKS.md refreshed: 3-cycle evidence + 1906a ref + permanent policy callout. F1 USER action remains only structural cure.
- PM notebook updated (ULTRA).

**TASKS.md:** 77L (under 80L cap). WIP=0/2 (clean).

**Carry-over to c90:** 1890a (HIGH), 1897b-carry (HIGH, F1+architect), 1900c (LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c89 CLOSED. Recurring-bug policy locked. Ready for c90 cron.

---

## Cycle 88 — 2026-05-14 c88 Close: 1905a + 1904a SHIPPED (stealth-fix + deploy)

**Signal drain → task open → task close cycle:**
1. **Signal input:** `ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json` routed to PO → opened 1905a-news-fetch-stealth-fix.
2. **Developer action:** Removed broken playwright-stealth v0.0.1 (CJS placeholder, never-functional). Replaced with inline stealth pattern: `context.addInitScript()` patches `navigator.webdriver = undefined` in PlaywrightBrowserFactory. 172 tests pass (6 new TDD ACs RED→GREEN). Code merge `580771ae`.
3. **QA approval:** 1905a APPROVED. Squash merged as `580771ae`. Branch deleted.
4. **Ops deploy:** Rebuilt news-fetch container, bumped playwright base image v1.44.0→v1.60.0 to match npm-resolved runtime. Fixed stale Dockerfile (missing unzip + curl re-added post-c87). Deploy commit `166dd89f`. newsHeadlinesRefreshJob verified HTTP 200.
5. **1904a unblocked:** AC4 now PASS. All ACs verified. Moved to Done with both code+deploy SHAs.

**Outcome:** c88 SHIPPED, WIP=0, ready for c89 dispatch.

---

## Cycle 87 — 2026-05-14 c87 Post-Cycle Closure: 1903-doc-pair DONE + 1904a PARTIAL (playwright-stealth blocker → c88)

**Input:** QA + ops c87 completion. Two outcomes:
1. **1903-doc-pair (MEDIUM, CHORE, DONE):** Alert-commander [UNVERIFIED] label removed + macro-snapshot regime-fallback note added. Merge `54e255e4`. QA APPROVED.
2. **1904a-deploy-gap-news (HIGH, OPS, PARTIAL):** MCP rebuild + scheduler verified (AC1-3 PASS). newsHeadlinesRefreshJob registered. **AC4 blocked:** news-fetch code bug (playwright-stealth ESM default import). Root: v0.0.1 CJS, Bun incompatible. Signal queued: `docs/signals/ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json`. Job fires q30m, fails gracefully until dev fixes import. Escalation: developer responsibility (code bug).

**Actions:**
- Moved 1904a from In Progress → Done (PARTIAL) with blocker note + signal ref.
- Moved 1903-doc-pair from In Progress → Done.
- TASKS.md final: 68L (under 80L cap).
- WIP: 0/2 (clean).

**Carry-over to c88:** 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3, 1890a, 1897b-carry.

**Status:** c87 CLOSED. Pipeline clean. WIP=0. Ready for c88 cron dispatch at :07.

---

## Cycle 86 — 2026-05-14 c86 Post-Cycle Closure: AUTOCURE-C86-MW-DEDUP + SPIKE_C86_MCP_REG SHIPPED

**Input:** Developer + ops c86 completion. Two outcomes:
1. **AUTOCURE-C86-MW-DEDUP (HIGH, CHORE):** `.claude/flows/market-watcher/cycle.md` Step 4 off-hours duplicate-signal guard (suppress same stock_code + same move_pct within ±5min during market CLOSED). Merge commit `b5151e1d`. Report: `reports/TASK_REPORT_AUTOCURE-C86-MW-DEDUP.md`. QA APPROVED.
2. **SPIKE_C86_MCP_REG (HIGH, SPIKE):** Investigation findings: cowork agent .md `MCP:` header is documentation-only label, not platform registration. Real config in Cowork Desktop. Recommendations: (a) low-cost doc-drift fix for 9 stale headers, (b) inspect Cowork Desktop config, (c) Cloudflare tunnel 404 as separate ticket. Output: `docs/spikes/SPIKE_C86_MCP_REG.md` (116L). Merge commit `346bf916`.

**Actions:**
- Moved both AUTOCURE-C86-MW-DEDUP and SPIKE_C86_MCP_REG from In Progress → Done with c86 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). No archive trigger.
- WIP: 0/2 (clean), Blockers: visible but not blocking (user-action 1862c-E, container-rebuild 1862c-F, escalation 1897b-carry).
- Carry-over untouched: 1903a-labels, 1903b-doc-self-heal, 1890a (bumped to HIGH + get_cash_flow), 1862c-{E,F}, 1897b-carry (HIGH), JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c86 CLOSED. Pipeline clean. Zero blockers. Ready for c87 dispatch.

---

## Cycle 85 — 2026-05-14 c85 Post-Cycle Housekeeping: 1881a-impl-{mcp,ssot} SHIPPED

**Input:** Dev-team + QA c85 completion. Two QA-APPROVED + SHIPPED outcomes:
1. **1881a-impl-mcp (M, HIGH, feature):** 16 MCP tool handlers + contract test file. JSON envelope pattern (source_tier: 1|2|3 as const, first field). 20/20 contract tests pass, 9234/9268 full suite, tsc 0 errors. Merge commit `c2e2fb08`. Report: `reports/TASK_REPORT_1881a-impl-mcp.md`.
2. **1881a-impl-ssot (S, MEDIUM, chore):** Layer 9 doc update `docs/standards/tnb-methodology-layers.md` source_tier hierarchy explained, enum documented, backwards-compat note (additive field only). Merge commit `6a700f15`. Report: `reports/TASK_REPORT_1881a-impl-ssot.md`.

**Actions:**
- Removed 1881a-impl-ssot from Todo (was stale after merge).
- Moved both 1881a-impl-{mcp,ssot} from Review → Done with c85 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). Archive threshold not reached.
- WIP: 0/2 (clean), Blockers: none (both user-action and container-rebuild remain deferred).

**Carry-over to c86:** 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F} (OPS, blocked), JANITOR-{011,014,020,} (DRY), TASK-BCTC-3 (feature), 1890a (toolpkg, MEDIUM), 1897b-carry (blocked: user-action).

**Status:** c85 CLOSED. Pipeline clean. No zombie tasks. Headroom verified for c86.

---

## Cycle 84 — 2026-05-13 c84 Post-Cycle Housekeeping: 1888l SHIPPED + 1881a-impl SPLIT

(See full notes in prior commit.)

---

## Cycle 93 — 2026-05-14 c93 Post-Cycle Close: 1907a ESCALATED + JANITOR-021 OPENED (WIP=0/2 CLEAN)

**Input:** TNB c49 user-facing outage escalation + c92 tree-verify procedural failure follow-up.

**Outcomes:**
1. **1907a-digest-predict-silence → ESCALATED LOW→HIGH.** TNB c49 finding #3: 4-day user-facing outage (digest-predict silent 2026-05-11 21:38 UTC → 2026-05-14 17:30 UTC). Root cause confirmed: cron unwired by design, Claude Desktop external trigger. Recommendation: (1) immediate verification ITerm2/launchctl trigger active next 3 cycles, (2) if recurs → architect rethink on Claude Desktop reliability (cowork heartbeat, session capture, firewall). Task note: `TNB-c49 escalation: 4d user-facing outage`. Follow-up: 1907b (LOW OPS observational).
2. **JANITOR-021 → OPENED (NEW, LOW REFACTOR).** c92 tree-verify exit=1 failure was procedural, not code bug: audit checks HEAD diff payload vs cherry-pick payload; fails when PM close commit lands on top of merge commit. Audit tool needs window adjustment for `merge-commit + PM-close` shape. Non-blocking — fix on idle cycle. Files: `scripts/audits/tree-verify.sh`. Owner: code-janitor.

**Actions:**
- Edited 1907a entry in Backlog: priority LOW→HIGH, added TNB-c49 escalation note, added root-cause context.
- Created JANITOR-021 entry in Backlog: LOW REFACTOR, code-janitor owner, c92 procedural root-cause explanation.
- TASKS.md final: 82L (slight over 80L cap due to escalation + new janitor; acceptable for critical escalation. Will compact Done entries next cycle if >85L).
- PM notebook updated (current state + cycle entry).
- WIP: 0/2 (clean). No new dispatch until 1908c completes.

**Banking deadline 2026-05-15 status:** Covered. 1908c FIX active (dev-pdf-extractor). 1890a deployed (live + reparse triggered c92). BCTC Q1 banking window prepared.

**Carry-over to c94:** 1908c (HIGH FIX, dev-pdf-extractor), 1907a (HIGH OPS escalated), 1907b (LOW OPS observational), JANITOR-021 (LOW), JANITOR-{011,014,020}, 1897b-carry (F1 USER), TASK-BCTC-3, 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F} (user-blocked).

**Status:** c93 CLOSED. No blockers. Banking window prepared. Escalation noted for user attention (1907a digest-predict silence critical for market timing alerts).

---

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
