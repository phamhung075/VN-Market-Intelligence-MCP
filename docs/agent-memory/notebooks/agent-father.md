# Agent Father — Notebook

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

## c256 · 2026-05-22T12:45Z

**Sprint:** 1967c | **Task:** 1967-08 (dispatcher-wrap try/finally)

**ITEM-17 + ITEM-22 FIXED:**
- execute-tier.md: Step 1 claim-loop now populates `spawned_batch[]` (claimed tasks only). Steps 2+3 wrapped in `try/finally` — release loop in `finally` block reachable on ALL exit paths (success + exception).
- dev-team/main.md pipeline-resume (S2): `Agent(nextAgent)` now wrapped in `try/finally` — `task_release(resume_key)` in `finally` block.
- Both sites now match cowork-team/main.md reference pattern (CORRECT).
- AC-1..AC-5 PASS. AC-6 (tsc): markdown-only zone, 0 .ts touched.

**Signal emitted:** docs/signals/agent-father-1967-08-done.json → NEXT=qa, QUALITY=smart-skip

## c257 · 2026-05-22T06:37Z

**Sprint:** 1967c | **Task:** 1967-09 (signal protocol fixes — ITEM-14 + ITEM-11 + ITEM-10)

**ITEM-14 (AC-1/AC-2):** mcp-tools.md Signal Bus section added with full naming contract rule (`{from}-{ISO-8601-timestamp}.json`). anti-pattern examples included. Cross-link to agent-chaining-protocol.md added.

**ITEM-11 (AC-4):** cowork-schedule.json — 4 API_MIN_INTERVAL dead slots disabled (handoff said 3; audit found 4: news-scout-market, market-watcher-market, market-watcher-prepost, alert-commander-market). All set `enabled=false` + `_disabled_by` field.

**ITEM-10 (AC-5) + ITEM-14 (AC-3):** cowork-team/main.md — `## §drift-min` section anchor added above Step 3b. Drift envelope threshold table (safe ≤10 / caution 11-14 / risk ≥15) added. size-justification comment updated to ~300L. po/main.md — signal write rule added with ISO-8601 timestamp enforcement instruction.

**Collision discipline:** §drift-min anchor scoped to drift commentary only. Spawn-guard region (Steps 4.6+) untouched — reserved for TASK_1967-10.

**Signal emitted:** docs/signals/agent-father-1967-09-done.json → NEXT=qa, QUALITY=smart-skip

## c258 · 2026-05-22T13:00Z

**Sprint:** 1967c | **Task:** 1967-10 (miscellaneous MED/LOW bundle)

**ITEM-06:** news-scout.md + market-watcher.md responsibilities L22 updated — "all watchlist tickers" → "reactive, event-driven tickers". 1-line edit per file. agent-md-factory applied.

**ITEM-16:** spawn-guard documentation notes added. dev-team/main.md: comment after NEVER-spawn line. cowork-team/main.md: comment at L115+ (pre-Step-4.6), §drift-min (L64-90) untouched per collision constraint. cowork-team now 303L (under 310L flag threshold).

**ITEM-18:** DEFERRED — apps/mcp-server is dev-mcp-server zone, out of agent-father scope. Flagged in handoff.

**ITEM-20:** NO ACTION — TTL analysis confirmed safe, documented as analysis-only finding.

**ITEM-21:** D-N dimension added to docs/agents/system-auditor/audit-dimensions.md. DN-W1 + DN-W2 checks for TASKS.md + pipeline-state.json mtime 15-min bucket detection. WORK alert + DASHBOARD po-row on violation. Tier-3 03:00Z alongside D4.

**Commits:** f47ed0bf (ITEM-06+16), c8b053d8 (ITEM-21)
**Signal:** docs/signals/agent-father-1967-10-done.json → NEXT=qa

## c259 · 2026-05-22T13:15Z

**Sprint:** 1963 follow-up | **Task:** 1963-MW-IDENTITY review

**Trigger:** PO commit 7c252993 routed market-watcher hallucination bug (4x consecutive cycles refusing own flow, claiming need for spawn_agent) to agent-father.

**Audit result:** Task already DONE. TASK_1967-04 (commit 70503631, QA approved 2026-05-21T23:45Z, PM closed commit 6c16ec49) fully resolved the bug:
- Step -0 identity assertion added to `.claude/flows/market-watcher/main.md` — fires before any MCP call, detects context overflow via YAML name field check
- YAML frontmatter verified complete (5 required fields: name/color/description/tools/model)
- `identity_role`, `no_self_abort`, `mcp_tool_available` constraints added to agent definition
- `mcp-tools.md` added to `always_load` with anti-hallucination note

**Compliance audit:** 5/5 checks passed — frontmatter valid, all `always_load` paths resolve, `flow.default` resolves, `inter_agent` routing present, version date current.

**Decision:** No edit required. 1963-MW-IDENTITY is DONE per DASHBOARD collapsed comment. This invocation correctly resolves to a no-op review.

## 2026-05-23 · SI-1 Fleet Pilot-Status SSOT Schema

**Program:** fleet-factory-rollout | **Prework:** SI-1 | **Dispatch:** po-si1-dispatch-agentfather-schema-20260523T215642Z.json

**DONE.** Authored `docs/data/pilot-status-schema.json` — canonical template for all fleet pilot-status files.

- Reconciled TA v1 + macro v2 closed pilots. Two structural divergences found + resolved (D1: close fields; D2: language fields) — macro v2 shape adopted as fleet canonical.
- 12 G-goals present: Track A G1-G5 (Trust Foundation), Track B G6-G9 (Dashboard Trust), Track C G10-G12 (AI-Fixability).
- decisionMatrix block with §4.5 authorship rule embedded verbatim.
- Phase 0 deliverable skeleton matches macro v2 pattern.
- All service-specific values marked `<SERVICE:...>` — no hardcoded service data.
- Completion signal: docs/signals/agentfather-si1-schema-done-20260523T220318Z.json
- Commit: df6ad8dc
- Gates pilot-3 (stock-price) Phase 0 — PO can now instantiate docs/data/pilot-status-stock-price.json.

## c-P0-SP-3 · 2026-05-24T00:23Z

**Task:** P0-SP-3 — Bake G12 DoD Gate + factory disciplines into dev-stock-price agent/flow

**Actions:**
- `.claude/agents/dev-stock-price.md` CONFIRMED: added `zone` to YAML frontmatter, updated `model` to `claude-opus-4-5`, added `pilot_constraints` block (g12_dod_gate, cgo_boundary, fence_rules, pre_revert_tags, sandbox_security), added factory pilot lazy-load references.
- `.claude/flows/dev-stock-price/main.md` CONFIRMED: transformed thin pointer into full macro-indicators-pattern flow. Added: Language Mode, Smoke Checks, G12 DoD Gate (blocking), R-CGO Gate (pre-check sequence + escalation), Security Rule, Fence Rules (A/B/C with grep commands), Pre-Revert Tag Protocol (stock-price-pre-ci/-delete/-inject).
- Signal emitted: docs/signals/pm-p0-sp3-agent-flow-baking-complete-20260523T222357Z.json

**Gates verified (all PASS):**
- YAML valid: yes (frontmatter has name/color/description/tools/model/zone)
- G12 DoD present: yes (both sandbox tiers CGO_ENABLED=0 must exit 0 GREEN)
- R-CGO documented: yes (3-step pre-check + escalation path)
- Fence-A/B/C baked: yes
- Pre-revert tags: yes (3 tags documented)
- Flow loads: yes (valid markdown, head-1 check passed)
- Commit SHA: 83770aa1 (changes landed in HEAD via P0-SP-5 session)

**AC status:** AC-1 through AC-7 PASS.

## c263 · 2026-05-24

**Task:** P0-NF-3 — Bake G12 DoD Gate into dev-news-fetch per-service flow (NO new agent .md)

**Actions:**
- Created `.claude/flows/dev-news-fetch/main.md` (135L, size-justification present). Thin pointer + TS/Bun pilot enforcement: Language Mode (TS-only), Smoke Checks (bun test + bun tsc + sandbox), G12 DoD gate (blocking, `bun run sandbox --tier=all --module=news-fetch`), Security Clause (NEWS_API_KEY named), Fence Rules (ESLint G4 AC gated on SI-3 — documented, not blocking), Pre-Revert Tag Protocol (news-fetch-pre-ci/-delete/-inject).
- Updated `docs/data/pilot-status-news-fetch.json`: `dev_agent_flow_file` DONE + `g12Streak.ruleEffectiveAfter` = bca30508 2026-05-24.
- Updated `docs/handoffs/TASK_P0-NF-3-flow-baking.md`: completion + all 6 AC verdicts.
- AC-1 verified: NO dev-news-fetch.md agent file created (confirmed absent). All 6 ACs PASS.
**Commit:** bca30508 (flow); docs updated in follow-up commit.

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification
- 1968c-P01/P02: await qa ratification (AC-6..8 pending)
- 1968d-P01/P02: QA APPROVED, DONE (Round-2 verified)
- 1968d-P03: DONE — awaiting qa approval
- 1967-07: IMPL_DONE — awaiting smart-skip qa
- 1967-08: IMPL_DONE — awaiting smart-skip qa
- 1967-09: IMPL_DONE — awaiting smart-skip qa
- SI-5 (dev-news-fetch agent): DEFERRED — before pilot-6 charter. Clone dev-macro-indicators pattern.
