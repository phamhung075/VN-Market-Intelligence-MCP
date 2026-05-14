# PM — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c91 ACTIVE (dispatch 2026-05-14T05:12Z)

## Current state

- WIP: 0 / 2 (CLEAN) — SPIKE 1908a complete, c91 dispatch ready
- **c91 DISPATCH (2026-05-14T05:12Z):** 1908a SPIKE → Done (triage doc, no code). Carry-forward 1908b (HIGH OPS-FIX, architect-routed per recurring-bug rule).
- **BCTC RECURRING-BUG ESCALATION:** VNM Q4 2025 low-confidence = schema drift in extractSplitBlockAll (code "270" mapped to sub-item 957M vs grand total 53T) → VAL-07 hard-fail (liab > assets*5). Prior fix 1815 (VAL-01-POSITION guard) exists; VAL-07 unprotected. Banking cohort filing window 2026-05-15 — architect rethink required before fix attempt (1908b brief expected).
- Backlog: 1908b (HIGH OPS-FIX, architect), 1907b (LOW OPS observational), 1897b-carry (F1 USER + architect, URGENT-F1), JANITOR-{011,014,020}, TASK-BCTC-3
- Todo: 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F} (OPS, user-blocked)
- **TASKS.md:** 79L (under 80L cap). Archive not required.
- **Status:** c91 active. WIP=0/2. 1908b awaiting architect brief before dev can start.

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

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
