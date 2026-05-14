# Architect — Notebook

**Last updated:** 2026-05-14 04:30 UTC | **Sprint:** 1890a-spec-expanded

## Last session summary (1890a-spec-expanded — FA tool-package +5 tools)

Brownfield audit complete. 5 tools assessed for financial-analyst SKILL_MANIFEST.
Key finding: `get_insider_signals` already in SKILL_MANIFEST (agentBootstrap.ts:64) — doc gap only.
`get_cash_flow` does NOT exist as MCP tool — must build. Pattern: computeAccrualsTool.ts.
Other 3 (get_macro_snapshot, get_bond_maturity_calendar, get_investment_clock_phase) exist in
registry but missing from `financial_analyst` manifest array — manifest + doc additions only.
Task split: 1890a-A (dev-mcp-server, CRITICAL — BCTC banking Q1/2026 window today) +
1890a-B (agent-md-editor, HIGH — manifest 3 additions + doc verify).
Specs: docs/REQ_1890a.md, docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md.
Risk R1: Subtask A must ship before 03:30 UTC FA cycle (BCTC G-step 5th cycle gap).
Risk R4: agentBootstrap.ts line 27 requires docs/SKILL_MANIFEST.md updated in same commit.

## Previous session summary (1881a-impl-arch-brief — source_tier schema decision)

BLK-1 resolved. Chose option (a) JSON wrapper for text-output tools over option (b) header
line. Rationale: FR-5 compile-time constant + AC-7 tsc enforcement only achievable with
typed object literal. Text preserved verbatim in `.text` field — zero content loss.
Brief: `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md`
Sub-tasks split: 1881a-impl-mcp (all 16 tool edits + tests, zone: apps/mcp-server/) is
the sole implementation zone — apps/macro-indicators has no MCP tools (spec-confirmed).
1881a-impl-ssot is a companion docs-only task (zone: docs/).
Parallel dispatch approved for -mcp and -ssot after brief lands.
Branch: task/1881a-impl-arch-brief. Commit pending.

## Previous session summary (SPIKE_006-c60 — alert accuracy 22% RCA)

SPIKE_006 findings complete. Primary verdict: H-A methodology bug (CONFIRMED, HIGH confidence).
Three root defects identified:
1. Two independent scoring paths (alertAccuracy.ts Path 2 on-the-fly vs alertOutcomeScorer domain
   vs verdictResolutionJob → alert-verdicts.json) never share state. alert-verdicts.json = empty [].
2. Intraday fallback (1-12h window) biases same-session alerts to MISS (VN market close creates
   artificial recovery within session).
3. hitThresholdPct=0.1% for price-signal class is noise-floor, not meaningful direction threshold.
4. Accuracy denominator = hits/(hits+misses) on n=9 scoreable — too small for 60% threshold to mean anything.

H-B partial: verdictResolutionJob confirmed inert (empty alert-verdicts.json). High skip rate in
alertOutcomeJob plausible but unconfirmed without live run.

Brief: `docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md` (≤120L)
Commits: `07c10bfe` (findings doc) + `2d91c859` (TASKS.md Done row)
Phase 5: c2-alert GREEN both commits. tree-verify passes.
Telegram report 2869: claimed=architect / resolution=monitoring / status=processed.
c61 task proposal: BA spec (M) — scoring unification + intraday fallback gate + threshold tuning.

## Previous session summary (ARCH-BRIEF-UPDATE-H4-c58 — Tier 3)

H4 CONFIRMED brief update. Updated `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`:
- Status bumped to RESOLVED-MECHANISM, OPEN-FIX-PICK
- Tally corrected: 5 cycles → 7 cycles (c52–c58)
- H1/H2/H3 marked REJECTED/ELIMINATED; H4 CONFIRMED with VirtioFS mechanism
- F1-F4 ranked: F2 PRIMARY (named volumes, phased F2a+F2b), F4 SECONDARY (retry wrapper)
- F3 REJECTED (too disruptive), F1 BLOCKED (user action)
- c59+ impl plan added (c59-T1: F2a, c59-T2: F4, c60-T1: F2b)
- Q1+Q2 closed (both resolved c57)
- c58 orphan `.claude/worktrees/agent-a0f89162/` noted in Section 5
- Cross-link to `2026-05-13-container-restart-rca-v2.md` added (both touch Docker Desktop VM)
- 118L → 139L (within 140L cap)

## Previous session summary (ARCH-1896-RE-RCA-c58 — Tier 2)

Re-RCA for TNB c43 CRITICAL escalation ("3rd restart in <24h, 1896c-impl insufficient").
Loaded docker-events log (1896c-impl start: 17:31:34 UTC 2026-05-12). Found 5 die events,
zero OOM events, zero health_status:unhealthy events. All post-1896c-impl die events are
exit=0 (clean stop) or exit=137-via-SIGKILL (Docker stop-timeout, NOT kernel OOM):
- api-gateway 17:31 UTC: SIGTERM hang → SIGKILL during 1862c-DE deploy (ops action)
- mcp-server 19:58+20:00 UTC: 1876a-A5 exec-only migration restart (ops action)
- mcp-server 20:29 UTC: 1876a-A6 docker-compose up --build (ops action)
TNB c43 saw 20:29 restart, computed uptime=2h18m at 22:47, misclassified as crash.
VERDICT: false-alarm-h4-batch. 1896c-impl logging is working correctly.
Brief: `docs/architecture-briefs/2026-05-13-container-restart-rca-v2.md` (117L)
c40 status: unchanged — inconclusive (pre-log, no ops evidence in window).
Recommendation: MONITOR c59+c60, then close 1896 fully.
c59 fix (if opened): TNB recalibration — add `# TNB-PLANNED-RESTART` tag convention to ops
flow. SPRINT-S, ≤20 LOC, zone: `.claude/flows/ops/`.

---

## Known patterns / preferences

- Phase-gate: SPRINT-L always split Phase 1 (design) + Phase 2+ (impl). Never single-phase.
- `domain/repositories/` = clean boundary. Repository interfaces in domain, SQLite impls in infra.
- Default-param injection: `constructor(private repo = new SqliteRepo())`. Tests inject mocks.
- `initDatabase()` is the migration runner. Container restart = migration execution.
- `server.ts` bootstrap: all new MCP tools registered there. Single wiring point.
- DDD layer audit before design: `grep -r "from.*infrastructure" src/domain/`.

## Carry-over for next session

- ARCH-1884 brief: Hybrid decision. Calculators in mcp-server domain; BTN detectors in
  forensic-analysis service (port 5007). Sprint 1887 (Virtual Capital) → forensic-analysis.
- 1878b `compute_accruals` spec: `docs/specs/1878b-compute-accruals.md`.
- c40 container restart: inconclusive (pre-log). Re-evaluate if TNB flags again post-c60.
- TNB recalibration (1896 close gate): SPRINT-S pending — `# TNB-PLANNED-RESTART` convention.
- Headlock F2a + F4: c59-T1 (ops/developer) + c59-T2 (dev-team). F2b after writer-audit c60.
- F1 (Docker Desktop .git/ exclusion): user-queue carry item.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob).
  Primary: merge Path 2 to domain scorer. Secondary: gate intraday fallback (≥1 trading day). Tertiary: hitThresholdPct 0.1%→1.0%.
  Open Q before BA spec: confirm with user whether 60% threshold is hits/(hits+misses) or hits/total.
