# Agent Father — Notebook

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

## c266 · 2026-05-24

**Task:** F1–F7 — Microservice Build Standard Promotion (size-gated FULL/LEAN profiles)
**Signal:** docs/signals/agents-architect-microservice-build-standard-promotion-20260524T073308Z.json (CLOSED)

**F1 (create):** `docs/standards/microservice-build-standard.md` — 7 sections, 90L (≤120L). Profile Selection gate at top with FULL/LEAN decision logic. Thin pointers to pilot-charter.md and 07-phases.md (no duplication). Sandbox clause inline. Commit: 63fe61b0.

**F2 (edit):** `docs/references/tree-map.md` — added microservice-build-standard.md entry before ARCHITECTURE.md in tree (sibling/child of ARCHITECTURE subtree). Added Write Ownership row (Architect, methodology change or closed pilot lesson). Commit: ceb6cf19.

**F3a (edit):** 8 dev-* frontmatter agents — added single lazy-load entry each (trigger: new_service_or_feature_build, fail_loud: true). Agents: dev-technical-analysis, dev-macro-indicators, dev-stock-price, dev-api-gateway, dev-frontend, dev-mainserver-crawls, dev-vps-crawls, dev-rag-service. Commit: 9482958a.

**F3b (edit):** 4 knowledge.md children — added same lazy-load entry to lazy_load table in each. Files: docs/agents/dev-mcp-server/knowledge.md, dev-alert-engine/knowledge.md, dev-pdf-extractor/knowledge.md, dev-kinh-dich/knowledge.md. Commit: 8d136928.

**F4 (edit):** `.claude/flows/architect/main.md` Step 5 — added Standard Detection block with three-branch emit (NEW SERVICE → full + PILOT-STATUS-SSOT + ROLE-RELAY; NEW FEATURE → lean + solo-dev note; BUG-FIX/MAINTENANCE → not-applicable). Commit: 11a07b09.

**F5 (edit):** `.claude/flows/dev-team/main.md` Step 2 matrix — added Tag emitted column + NEW-SERVICE row (full, ba→architect→pm→dev-svc→qa) + NEW-FEATURE row (lean, pm→dev-svc only). Commit: 6122b934.

**F6 (edit):** `.claude/flows/developer/microservice-main.md` Step 0c — replaced single-branch with three-branch dispatch (full/lean/absent). Commit: 176fcf6c.

**F7 (verify):** No-op — F2 Write Ownership row already covers microservice-build-standard.md. No separate commit needed.

**Git safety:** Explicit `git add <path>` for every commit. No `git add -A`. No pilot-status-*.json touched. No --amend used. Signal CLOSED.

---

## c265 · 2026-05-24

**Task:** P0-AG-3 — Reconcile dev-api-gateway agent + flow for SCALE Go three-tier pilot (api-gateway)

**Agent file (.claude/agents/dev-api-gateway.md):** Version bumped 2026-05-14→2026-05-24. description updated to reflect Go three-tier ownership (HONEST 3 primitives: overall-status-computer, proxy-path-resolver, route-service-matcher), pkg/module/gateway, cmd/server composition root, cmd/sandbox, dashboard. capabilities rewritten with anti-creep mandate ("do NOT manufacture a 4th"). identity mindset updated: G12 gate non-negotiable, honest-3 only. lazy_load: two new entries (api-gateway-charter.md + api-gateway-brownfield.md with appropriate triggers). size-justification updated 154L→165L.

**Flow file (.claude/flows/dev-api-gateway/main.md):** Expanded 17L→145L with size-justification (mirrors dev-kinh-dich as factory template). Sections added: Three-Tier Ownership table, Notebook Read step, Smoke Checks (6-row table), G12 DoD Gate (blocking Day 0), Security Rule (zero-creds clause, CGO_ENABLED=0, scenario JSON grep), Depguard Fence Gate (Fence-A/B/C via golangci-lint, net/http banned at Fence-A per api-gateway calibration), References table.

**Key facts for PO:** G12 DoD gate exact line: "Do not mark task DONE / do not RETURN until sandbox dashboard shows all api-gateway scenarios GREEN."

**Commit:** c9cac80b (both files). pilot-status g12Streak.ruleEffectiveAfter = c9cac80b to be set by PO.

**Template used:** .claude/flows/dev-kinh-dich/main.md (Factory v2, G12 Day-0 pattern). agent-md-factory skill not present at .claude/skills/agent-md-factory/SKILL.md — proceeded from guide directly (same note as c263/c264).

---

## c264 · 2026-05-24

**Task:** P0-RAG-3 — Calibrate dev-rag-service agent file + bake G12 DoD gate into flow (SCALE pilot Phase 0 deliverable)

**Sub-task 1 — Agent file calibration (.claude/agents/dev-rag-service.md):**
Drift found: version stale (2026-05-06), no pilot context, no three-tier refactor mandate, no determinism/env-audit awareness, no G12 DoD constraint. Fixed: version → 2026-05-24; description updated with SCALE pilot + Python lock note; three-tier refactor capabilities added (5 primitives + retrieval module + env-audit); constraints block expanded with pilot_language=Python, g12_dod=binding_day_0, determinism_gate, env_audit_forbidden_keys; two lazy-load entries added (scale charter + pilot charter, both guarded triggers).

**Sub-task 2 — Flow file G12 gate (.claude/flows/dev-rag-service/main.md):**
Replaced 19L thin pointer with 124L pilot-enforcement flow (explicit size-justification, schedule-for-split note, mirrors macro/TA canonical pattern). Sections: Language Mode (Python fixed Day 0), Smoke Checks (pytest+mypy+JSON+sandbox both tiers), G12 DoD Gate (blocking — sandbox-green AND env-audit-empty BOTH required before RETURN, evidence paste mandatory), Security Rule (LANCEDB_*/HF_TOKEN/HUGGINGFACE_*/OPENAI_API_KEY + standard keys, HF_HUB_OFFLINE hardening retained), Fence Rules (Python import-linter, Fence-A+B, SI-4 gate note), Pre-Revert Tag Protocol (rag-pre-ci/delete/inject), References table.

**Pilot-status updated:** dev_agent_file + dev_agent_flow_file → DONE; g12Streak.ruleEffectiveAfter populated.

**Commit:** 0b5ef802 (agent + flow files); pilot-status in HEAD.
**Note:** agent-md-factory skill does not exist at .claude/skills/agent-md-factory/SKILL.md — proceeded from guide directly (same note as c263).

---

## c263 · 2026-05-24

**Task:** P0-PDF-4 — Bake G12 DoD gate into dev-pdf-extractor flow (SCALE pilot Phase 0 deliverable)

**Action:** Service-specific gate added to `.claude/flows/dev-pdf-extractor/main.md`. File expanded from 18L → 88L (within 120L cap; size-justification comment present). Gate structure mirrors `dev-macro-indicators/main.md` with Python-correct substitutions: `python sandbox_runner.py` instead of `go run ./cmd/sandbox`, pdf-extractor-specific Security Clause credential list (adds VPS_|VINAHOST|PDF_EXTRACTOR_DB to base pattern). Shared `microservice-main.md` confirmed NOT to contain a G12 gate — service-specific override is correct (not duplication).

**Gate outcome:** SERVICE-SPECIFIC override (not inheritance). The shared flow has no G12 gate. Macro pattern followed verbatim.

**Commit:** e7541786
**Staged:** `.claude/flows/dev-pdf-extractor/main.md` only — explicit git add per L84 constraint.
**Note:** agent-md-factory skill referenced in project memory but file does not exist at `.claude/skills/agent-md-factory/SKILL.md` — proceeded using guide patterns directly; flagged for BUG if needed.

---

## c262 · 2026-05-24

**Task:** claude-manager-helper.md — Pass-5b carve-out in forbidden_outputs (contradiction fix)

**Change:** Single-line edit to line 74 `forbidden_outputs`. Blanket "NEVER modify other agents' notebooks" contradicted the Pass-5b capability granted at line 22. Added explicit exception: "EXCEPT size-driven Pass-5b pruning of agent-notebook class (authorized at line 22)".

**Scope check:** No cascade — no routing, roster, dispatch, or CLAUDE.md impact. Single file.
**Size:** 130L, size-justification present (comment says 130L — exact match post-edit).
**Commit:** b7d647a6 (note: commit swept existing untracked working-tree files — agent-file change is included)
**Outcome:** Contradiction resolved. Zero new capability. Guide §5.7 boundary_rules compliant.

---

## c261 · 2026-05-24

**Task:** Fleet size-cap remediation — STAGE 1 (JUSTIFY) + STAGE 2 pilot splits

**STAGE 1 — JUSTIFY (15 files, zero behaviour change):**
Inserted `<!-- size-justification: -->` comments in first 8 lines of 15 files:
ops-mainserver-fetch/main.md (178L), system-auditor.md (160L), pm.md (156L),
news-scout/stage-signals.md (154L), system-map-query/SKILL.md (150L),
ops-vps-fetch/main.md (150L), pm/main.md (149L), signal-dashboard/SKILL.md (147L),
ba.md (147L), dev-frontend/main.md (142L), developer/main.md (141L),
dev-macro-indicators/main.md (138L), financial-analyst.md (137L),
microservice-main.md (135L), news-scout.md (133L), market-watcher.md (132L),
report-analyzer.md (129L).
Commit: bundled into 179f7cd1 (concurrent git race with alert-engine signal).

**STAGE 2 — SPLIT pilot (2 files):**
- chef.md (278L→228L): telemetry scaffolding (ENTRY/CLOSE/FAILED/SILENT/try-catch) extracted to chef-telemetry.md (74L). Pointer at 3 call sites in chef.md. Size-justification added to both files.
- dev-mainserver-crawls/main.md (235L→203L): Step 3b research protocol + code scaffolding extracted to technique-research.md (96L). Sub-flow pointer replaces inline content at 4 locations. Size-justification added to both files.
Commit: 6becd6b0

**Verification results:**
- chef.md: pointer confirmed at 3 locations, chef-telemetry.md exists (74L), no dangling ENTRY/CLOSE/FAILED headers remain in parent.
- dev-mainserver-crawls/main.md: pointer confirmed at 4 locations, technique-research.md exists (96L), no dangling WebSearch/playwright inline content in parent.
- Both parents still exceed 120L (228L, 203L) — size-justification comments added per brief guidance.

**HELD:** dev-vps-crawls, dev-stock-price, dev-kinh-dich — await pilot verification.

## c260 · 2026-05-23T23:04Z

**Task:** P0-KD-3 — dev-kinh-dich agent + flow baking (Factory v2 pilot 4)

**BOTH FILES UPDATED (factory audit + rewrite):**
- `.claude/agents/dev-kinh-dich.md`: added `pilot_constraints` (g12_dod_gate, r_fence/Fence-A/B/C, g7_zero_creds, pre_revert_tags), `doc_maintenance`, `language: TypeScript`, `runtime: bun`, `model: claude-opus-4-5`, factory lazy_load (charter, brownfield, phase-1-plan, pilot-status), updated capabilities/skills for primitive/module/sandbox work.
- `.claude/flows/dev-kinh-dich/main.md`: baked G12 DoD Gate (sandbox-green-before-RETURN, both tiers), R-FENCE section (eslint-plugin-boundaries Fence-A/B/C, R-2 fallback, lazy-load gate note), pre-revert tag protocol (kinh-dich-pre-ci/-delete/-inject), smoke checks, security/zero-credentials clause.

**System facts:** zone=apps/kinh-dich-service, runtime=bun, language=ts, port=5005 (all from system-map.json via jq).

**Commit:** 2382b6d2 (L84 explicit-file staging — 2 files only)
**Signal:** docs/signals/agent-father-kinh-dich-p0-kd-3-done-20260523T230414Z.json
**All 6 ACs PASS. Hard gates: FACTORY SUCCESS + FILES EXIST + ZONE+RUNTIME SET + DOD GATE ACTIVE — all PASS.**

**Note:** agent-md-factory skill not registered as standalone SKILL.md — patterns applied inline per guide + reference templates (dev-stock-price.md, dev-macro-indicators.md). Expected warning; not a hard gate blocker.

## Carry-over

- SI-5 (dev-news-fetch agent): DEFERRED — before pilot-6 charter. Clone dev-macro-indicators pattern.
- 1967-07/08/09/10: IMPL_DONE — awaiting smart-skip qa (signals emitted).
- c256–c259 (2026-05-22 1967c sprint): DONE — dispatcher-wrap try/finally, signal protocol, misc MED/LOW bundle, MW-identity no-op review. See git log f47ed0bf..c8b053d8.
- c-P0-SP-3 / SI-1: DONE — stock-price G12 gate (83770aa1), pilot-status-schema.json (df6ad8dc).
- c263 (P0-NF-3): DONE — dev-news-fetch flow baked (bca30508).
