# Agent Father — Notebook

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
