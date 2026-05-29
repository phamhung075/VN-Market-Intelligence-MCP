# Agent Father — Notebook

## c276 · 2026-05-29 — Edit fb-market-poster (3-section predict-first structure)

- Change: Restructured post composition from flat single-flow to mandatory 3-section order: Tóm tắt nhanh (brief recap, shortest) → Phân tích (causal analysis, bridge) → Dự đoán (prediction, LONGEST/main value). STEP 2 upgraded from sparse lazy-load to mandatory forward-looking source reads (digest-predict, CHEF outlook, analysis-briefs) with $prediction_inputs working-memory label. STEP 4 validation expanded from 11 to 15 checks (added: 3-sections present in order, Dự đoán has ≥1 concrete forward call, earned-prediction trace, recap-not-dominant guard). Word ceiling lifted 650 → 700 (trim rule: cut recap first, never cut Dự đoán). STEP 8 notebook format updated to log section-order/earned-prediction/recap-not-dominant check results.
- Files modified: 1 (docs/agents/fb-market-poster/flow/main.md — 287L → 367L)
- Cascade: none — no name/routing/inter_agent/roster/dispatch change; tool package unchanged (no new tools added, existing 4 live-tool calls sufficient)
- Validation: 7/7 passed (frontmatter line 1 ✓, flow has error boundary + RETURN ✓, tool package unchanged ✓, no new always_load paths ✓, no jargon added ✓, word-count rule consistent across STEP 3 hard rules + STEP 4 check 4 ✓, 15-check count consistent across STEP 4 + STEP 8 notebook format ✓)
- Decision: User feedback: "analyse before prediction" + "add value on prediction than resume" — post was a recap-heavy summary without earned forward view. New structure enforces facts→analysis→prediction causal chain; validation checks prevent orphan forecasts and recap dominance. No spelling step per user prior decline.

---

## c275 · 2026-05-29 — Edit fb-market-poster (detail-floor uplift)

- Change: Raised content-detail bar — added STEP 1b (live enrichment via 4 vn-market read tools), rewrote STEP 3 with 7-field detail floor, replaced STEP 4 with 11-check validation (4 structural + 6 detail-floor + 1 anti-filler), relaxed word count 200-350 → 150-650.
- Files modified: 2 (docs/agents/fb-market-poster/flow/main.md + docs/agents/tools/package/fb-market-poster.md)
- Cascade: none — no name/routing/inter_agent/roster/dispatch change; tool package updated with 4 new read tools (get_market_snapshot, get_market_breadth, get_foreign_flow, get_top_movers)
- Validation: 7/7 passed (frontmatter line 1 ✓, flow has error boundary + RETURN ✓, tool package ✓, no new always_load paths added ✓, no jargon added ✓, word-count rule consistent across STEP 3 + STEP 4 ✓, filler-check added ✓)
- Decision: User feedback "too generic" after first test post — permanent detail-floor ensures every future post carries all quantitative fields (indices, breadth, liquidity, foreign flow, ≥5 named tickers, ≥2 named news) sourced first from live tools then fallback to notebooks. No spelling step added per user explicit decline.

---

## c274 · 2026-05-29 — Create fb-market-poster

- Type: cowork
- Files created: 7 (agent def + init.md + flow/main.md + tool-package + notebook + cron skill + feedback sink)
- Dirs created: docs/social/ (new), docs/agents/fb-market-poster/flow/ (new)
- Registration: roster (Analysis Team +1 = 10) + dispatch SKILL.md + system-map.json agents[] + project-stats.json analysisAgentCount + tree-map.md + docs-organization-location-table.md
- Validation: 7/7 passed (frontmatter line 1 ✓, flow has error boundary + RETURN ✓, tool package ✓, notebook ✓, always_load paths resolve ✓, flow.default resolves ✓, appears in roster+dispatch+system-map ✓)
- Decision: cowork type (read-mostly synthesis, runs on cron, no code writing); haiku model (synthesis from pre-digested notebooks, not complex reasoning); purple color (social/content layer, distinct from existing agents); cron 7 13 * * 1-5 (13:07 UTC = 20:07 VN, after EOD dish 08:37 UTC, before FB prime-time)
- Open: frontend dashboard wiring (dev-frontend task needed to surface docs/social/ draft); Phase 2 Graph API auto-publish; Phase 2 FB comment ingestion to feedback sink

---

## c273 · 2026-05-29 — BCTC Analyst Merge (MERGE-OK-v2)

**Task:** Implement architect brief 2026-05-29-bctc-analyst-merge.md. Signal: bctc-analyst-merge-20260529T042613Z.json. Prior partial state (H-1..H-7) verified and extended.

**Files created/modified (34 file changeset, commit 3e90e27c):**
- `.claude/agents/bctc-analyst.md` — frontmatter line 1, model=sonnet, E2 guard note added
- `docs/agents/bctc-analyst/init.md` — extended with trick_pass_schema + idempotency_cache + schedule updated to 0 15,18,21,0
- `docs/agents/bctc-analyst/flow/cycle.md` — E2 market-hours guard added as first step (before bootstrap)
- `docs/agents/bctc-analyst/flow/stage-analyze.md` — E3 cache-check + E1 pass invocation loop added; 117L (within 120L cap)
- 7 new stage files: stage-pass-balance-sheet.md, stage-pass-pl.md, stage-pass-cashflow.md, stage-pass-rpt.md, stage-pass-footnote.md, stage-pass-segment.md, stage-consolidate.md
- `docs/agents/tools/package/bctc-analyst.md` — union of FA + RA tool packages
- `docs/agent-memory/notebooks/bctc-analyst.md` — bootstrap with c001 migration entry
- `docs/agents/unified-agent/flow/chef.md` — dual-accept OR clause (transition window H-18→H-19)
- `docs/data/cowork-schedule.json` — 4 bctc-analyst slots added (0 15,18,21,0 UTC); FA slots disabled for soak
- `docs/data/system-map.json` + `docs/references/agent-roster.md` — FA+RA removed, bctc-analyst added
- `.gitignore` — explicit data/bctc-analysis-cache/ entry (OQ-5)
- `docs/signals/bctc-analyst-oq4-extractor-sprint-20260529T000000Z.json` — PM signal for dev-pdf-extractor sprint

**Deleted (PO directive — no archive):** financial-analyst.md, report-analyzer.md, all flow dirs, tool packages, notebooks. Last cycles preserved inline in bctc-analyst c001.

**Open gates:** H-19..H-24 (flip cron, remove chef dual-accept, delete old schedule entries) — trigger ONLY after 24h parallel soak shows ≥1 valid bctc-analyst signal.

**Cowork refresh needed:** YES — bctc-analyst.md new agent, chef.md updated, cowork-schedule changed.

---

## c272 · 2026-05-27 — SIG-IMPL-MD (Gated Self-Improvement Loop, Phase 1)

**Task:** EDIT-1 through EDIT-5 — implement gated self-improvement loop into flow files per `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §9 Phase 1. Signal unblocked by PO at 2026-05-27T20:47:27Z.

**Files edited (5 files, 6 edits):**
1. `docs/agents/system-auditor/flow/main.md` — added `### Improvement Proposal Emit (D-IMPROVE)` block to Tier-2 sweep (after stale-source emit, before Existing Doc/Memory Audit). Includes D-IMPROVE-4 cooldown guard first, D-IMPROVE-1 candidate collection, D-IMPROVE-2 per-candidate try/catch with structured schema (target_agent + target_files as machine-readable fields), D-IMPROVE-3 outcome log.
2. `docs/agents/agents-architect/flow/main.md` — added `improvement_proposal` dispatch row to Dispatch table routing to handlers.md § Improvement-Proposal Review.
3. `docs/agents/agents-architect/handlers.md` — added `## Improvement-Proposal Review` handler (Steps IP-1 through IP-8): lane validation, structured-field validation (target_agent + target_files), architect-review section fill, signal emit to PO, DASHBOARD mark READ, atomic commit.
4. `docs/agents/po/flow/triage-signals.md` — added `improvement_proposal` routing row with ALL FIVE mandatory PO critique fields enforced: break-risk, false-green, gameability, host-load, and the C-3 fifth field `lane-C-in-disguise check`. Empty/placeholder on any field → auto-reject "critique incomplete".
5. `docs/agents/agent-father/flow/main.md` — added `signal type=improvement_approved_md` route to dispatch table with full C-1 contract (structured target_agent/target_files fields ONLY, FAIL-LOUD reject if missing/invalid) and C-2 two-phase status lifecycle (IMPLEMENTING after clean edit, DONE only after success_verified_by + date confirmed).
6. `docs/agents/dev-team/flow/drain-signals.md` — added `improvement_proposal_lane_b` row to 0a-3 routing table; SELF_IMPROVE_AUTO_DISPATCH documented as per-dispatch-path default-false, deferred to Phase 2 / SIG-IMPL-GATE.

**PO conditions honored:**
- C-1: target_agent (kebab-case) + target_files[] defined as structured fields in proposal schema (EDIT-1 schema), validated by architect (EDIT-2), read by agent-father (EDIT-4) — never from free prose. FAIL-LOUD reject if absent/invalid.
- C-2: IMPLEMENTING status after clean edit, DONE only after Success Signal independently re-confirmed by system-auditor freshness tick (success_verified_by + date). Mis-targeted edit → rollback + DRAFT reset + BUG alert.
- C-3: Fifth mandatory critique field `lane-C-in-disguise check` added to EDIT-3 triage row. Empty/placeholder → auto-reject "critique incomplete" identical to other four fields.
- C-4: NOT implemented (Phase 2 / SIG-IMPL-GATE / dev-team QA). SELF_IMPROVE_AUTO_DISPATCH documented as per-dispatch-path default-false in EDIT-5.
- C-5: D-IMPROVE wrapped in try/catch per-candidate; on any exception: release mutex if held, log "[D-IMPROVE] SKIP candidate {id}: {error}", continue — NEVER re-raise, NEVER abort Tier-2 sweep. Cooldown guard (D-IMPROVE-4) prevents half-written proposals.

**SSOT/DRY:** Three-lane rule and proposal schema are NOT duplicated. All five flow edits reference `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §1 and §3 as the single source. No new agents, no new cron, no Docker.
**Writes:** ALL unstaged (no git add, no git commit) per main-terminal serialization rule.
**Cowork refresh needed:** YES — agent-father/flow/main.md, po/flow/triage-signals.md, system-auditor/flow/main.md, agents-architect/flow/main.md + handlers.md, dev-team/flow/drain-signals.md all changed. User should run /cron-cowork-team to refresh the cowork session.

---

## c271 · 2026-05-27

**Task:** Phase 1 Foundation (F1–F8) — Cowork-Team Daily Document Redesign
**Brief:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md` v2.1

**F1 (dirs):** 9 directories created with .gitkeep: docs/daily/, docs/outbox/{market/danger,market/normal,work,dead}, docs/recaps/{weekly,monthly,yearly}, docs/attention/.
**F2 (.gitignore):** Added docs/daily/ and docs/outbox/ entries (ephemeral, no git commits). docs/attention/ NOT gitignored.
**F3 (file-size-caps.json):** Added `docs/daily/*/*.md` entry, 200L cap, class=daily-agent-section.
**F4 (cowork-schedule.json):** Added 5 slot stubs (all enabled:false): daily-seed, delivery-cron-danger, delivery-cron-normal, monthly-recap, yearly-recap. Added retention object: daily_days=14, weekly_weeks=8, monthly_months=24, yearly=indefinite, attention_register=never_prune, prune_runner=digest-predict, fail_safe=verify_recap_before_delete.
**F5 (daily-document-spec.md):** Written at docs/standards/daily-document-spec.md (154L). Includes: folder structure, agent section append format, Language Rule block (Addition 6 — mandatory, with register boundary table), Bootstrap-Only Read Rule (Addition 7 — binding, with exemptions table), _header.md format, outbox format, CHEF _dish/ format, failure mode table.
**F6 (watch.md):** docs/attention/watch.md created with OPEN / TRIGGERED-RESOLVED / EXPIRED template + item schema table header.
**F7 (market-push-state.json):** docs/data/market-push-state.json created, all fields null/0.
**F8 (delivery-cron-delivered.json):** docs/data/delivery-cron-delivered.json created as empty {}.

**Deliverable gate PASSED:** daily-document-spec.md (154L, readable) + watch.md (18L, readable). Zero agent flow files modified (git diff HEAD confirms clean).
**Commit:** 93e0641e (11 files, 293 insertions)
**HARD STOP:** Phase 2 gated — cowork-refactory-expert (F9–F17) + PO sign-off required. daily-seed must run ≥1 full day before agent appends. Do NOT auto-start Phase 2.

---

## c270 · 2026-05-25

**Task:** Institutionalize user directive "rebuild container if dev team changes microservice code" — Restart ≠ Rebuild close-gate.

**SSOT placed:** `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate (new section, 28L). Canonical rule: microservice code change is NOT done until ops rebuilds the container (`docker compose up -d --build <svc>`, ONE at a time, 8 GB cap, ops-not-user) AND qa verifies live container build-time > commit-time + /health + tool count. 6-step close-gate table with actor column. Delegation rule explicit.

**References wired (DRY — no prose duplication):**
1. `.claude/flows/po/sprint-signoff.md` — pre-approve container rebuild check block added before approve/reject branch. Points to SSOT section. 46L → 51L (well under 120L cap).
2. `.claude/flows/developer/microservice-main.md` — `REBUILD_REQUIRED: true` line + SSOT pointer added to RETURN block. 159L → 160L (size-justification present at line 1, unchanged).

**Commit:** 6a919ea4 (3 files: docker-deployment-runbook.md + sprint-signoff.md + microservice-main.md)
**Cap compliance:** protocols/ has no cap; sprint-signoff.md 51L ≤ 120L; microservice-main.md 160L size-justified.
**No agent .md files touched** — no Cowork refresh prompt needed.
**Note:** agent-md-factory skill confirmed absent (see c263/c264/c265/c269 notes); proceeded from guide directly.

---

## c269 · 2026-05-25

**Task:** P0-FE-3 — Bake G12 DoD gate into dev-frontend flow (SCALE pilot Phase 0 deliverable)

**Agent registration check (.claude/agents/dev-frontend.md):**
- Line 1 = `---` (PASS)
- name: dev-frontend, color: cyan, description present, tools: Read/Edit/Write/Glob/Grep/Bash, model: sonnet (all PASS)
- No fix required — already compliant.

**Flow file (.claude/flows/dev-frontend/main.md):**
Expanded 142L → 192L (size-justification updated). Sections added between "After code" commit block and "Documentation review":

1. **G12 DoD Gate (MVR — Playwright render-green — mandatory — blocking from Day 0):** Two-command gate table (npm test Vitest + npm run test:e2e Playwright 3/3), both must exit 0. Blocking logic for Vitest non-zero AND Playwright non-zero separately stated. Evidence requirement: paste both summary lines into handoff before RETURN. MVR Streak Rule: P1-B1/P1-B2/P1-C each must carry render-gate evidence before marked DONE; broken streak = reopen + re-paste. References pilot-charter §G12 and frontend-phase-1-task-plan §MVR-vs-FULL + §G12 Streak Tasks.

2. **ESLint Fence (G4 — Phase 2 concern for MVR track):** Phase 1 defers G4. Phase 2 target = eslint-plugin-import or eslint-plugin-boundaries blocking domain/formatters → lib/api imports. Explicitly noted as TS-service → ESLint (NOT depguard which is Go-only, per SI-3 design). Lazy-load trigger documented. Hard gate: DO NOT implement ESLint fence during Phase 1 tasks.

**Commit:** e4812778
**Template used:** dev-kinh-dich/main.md G12 gate pattern adapted for MVR/Playwright/Vitest context.
**Note:** agent-md-factory skill does not exist at .claude/skills/agent-md-factory/SKILL.md — proceeded from guide + factory template patterns directly (same as c263/c264/c265).

---

## c268 · 2026-05-25

### Edit (market-analyst) — tools frontmatter defect fix

- Change: Added `mcp__claude_ai_gateway__call_tool` to `tools:` frontmatter line
- Files modified: 1 (`.claude/agents/market-analyst.md`)
- Cascade: none — tools-only change, no name/routing/flow path/inter_agent impact; tool package already documents MCP usage
- Validation: 5/5 passed — YAML frontmatter valid, head-1=`---`, tools line correct, all knowledge.always_load paths intact, version date bumped to 2026-05-25
- Decision: Genuine defect. Flow calls 9 MCP tools (get_macro_snapshot, fetch_and_analyze, run_impact_chain, get_alerts, get_bctc_full, get_financial_summary, get_sector_comparison, compare_backtest_runs, export_backtest_run_csv) all via call_tool(server="vn-market"). Guide §5.1 cowork analysis tool set = `Read, Write, mcp__claude_ai_gateway__call_tool`. Missing MCP tool blocked ALL live analysis calls at the allowlist.

---

## c267 · 2026-05-25

**Task:** Frontmatter-ordering fix — 7 cowork agents unregistrable (line-1 HTML comment)

**Root cause:** c261 Stage-1 JUSTIFY pass (claude-manager-helper) inserted `<!-- size-justification: -->` on line 1 of agent files, pushing the YAML `---` opener to line 2. Claude Code agent loader requires frontmatter to start on byte 0 (line 1 = `---`). Affected agents had no name/tools visible to the loader and were never registered as spawnable subagent types.

**Files fixed (7 total — comment moved from line 1 to immediately after closing `---`):**
- `.claude/agents/financial-analyst.md`
- `.claude/agents/news-scout.md`
- `.claude/agents/market-watcher.md`
- `.claude/agents/report-analyzer.md`
- `.claude/agents/ba.md` (additional — same defect class, found by full-dir scan)
- `.claude/agents/pm.md` (additional)
- `.claude/agents/system-auditor.md` (additional)

**Verification:** `head -1` on all 7 = `---`. Full `.claude/agents/*.md` scan = zero remaining defects.
**Cascade:** None — no name, routing, tools, or content change. Comment text preserved verbatim.
**No commit made** — flow edit-apply notebook step only; commit not instructed by task.

---

## Carry-over (c262–c266 summary)

- c266: Microservice Build Standard F1–F7 FULL/LEAN promotion (commits 63fe61b0..176fcf6c)
- c265: dev-api-gateway agent+flow — G12 DoD gate, three-tier ownership (c9cac80b)
- c264: dev-rag-service agent+flow — G12 gate, Python lock, env-audit (0b5ef802)
- c263: dev-pdf-extractor flow — G12 gate service-specific override (e7541786)
- c262: claude-manager-helper — Pass-5b carve-out contradiction fix (b7d647a6)
