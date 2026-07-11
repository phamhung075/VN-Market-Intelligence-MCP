# PM Decomposition — ANALYSIS-QUALITY-CONVERGENCE

**Date:** 2026-07-11
**Task:** pm sprint ANALYSIS-QUALITY-CONVERGENCE decomposition
**Coordination session:** 3dce23eb-6a30-4f92-aec0-51c1393dc399
**Upstream:** agents-architect brief (docs/architecture-briefs/2026-07-11-analysis-quality-convergence-lanes.md)

---

## Lane Decomposition Summary

| Lane | Scope | Action | Status |
|---|---|---|---|
| A | FR-1 (6-flow indicator wiring) + FR-2 (CHEF AF-1 gate) | Mint FR-1-CHEF-LEG-FR-2-ATOMIC (atomic commit) + FR-1-REMAINING-5-FLOWS (independent wiring) | MINTING |
| C | FR-4 (CCATO-T2 skill) | Dispatch existing CCATO-T2-CLAIM-TRUTH-SKILL (developer lane, unblocked) | NO MINT — existing row |
| B | FR-5 (CCATO-T3, 6-pt claim-truth-gate wiring) | Dispatch existing CCATO-T3-FLOW-WIRING-6PT (cowork-refactory-expert, sequenced after FR-4 DONE_VERIFIED + Lane A chef.md/cycle.md/daily-predict.md edits landed) | NO MINT — existing row |
| D | FR-3 (GAP-CHEF-SYNTHESIS-B endpoint+card) | Hold dispatch: GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST is REVIEW (live-cycle-verification pending). No new board action needed; gate already on row. | HOLD |
| E | FR-7 (recon SPIKE) | Mint FR-7 via orch-apply.sh (brief §6 spec) — PLAN-ONLY, ops-mainserver-fetch primary owner | MINTING |
| F | FR-6 (Phase-2 note) | Prose passthrough, no action | SKIP |

---

## Key Decisions

### 1. IND-P1-MOMENTUM-CONSUMER-WIRING Disposition

**Status:** BACKLOG, held_by:po-s135 (3/4 tools cleared per BA §0.1-0.2)

**Finding:** Three material divergences from BA's FR-1 §0.4 fresh matrix:
1. Its wiring_map targets alert-commander + tran-ngoc-bau (FR-1 excludes both).
2. Its wiring_map assigns get_foreign_accum_rank to 4 flows (FR-1 defers this tool everywhere, blocked on FIX-FOREIGN-FLOW-COVERAGE per BA §0.2).
3. It excludes market-analyst ("pending tool-call verification") — BA §0.5 confirms this exclusion is stale; market-analyst is now IN SCOPE.

**Action:** Supersede IND-P1-MOMENTUM-CONSUMER-WIRING to SUPERSEDED status with cross-reference to FR-1 task(s), since FR-1's §0.4 table is the corrected, live-verified version (brief §3).

### 2. FR-1 Task Atomicity Constraint

**Requirement:** FR-1's chef.md leg (adding roc/z_score/decile, rs/percentile, pct_from_52w_*, insider net_sentiment_score to chef.md Step 0/3/4) and FR-2 (extending chef.md Step 6.7 Rule AF-1's blocked-token regex) MUST land in the same commit/task. Shipping FR-1's CHEF wiring without FR-2 reopens FIX-CHEF-FABRICATED-TA-NUMBERS (zero-day regression window, brief §2.2).

**Minting strategy:** 
- One atomic task **FR-1-CHEF-LEG-FR-2-ATOMIC** containing both chef.md 0/3/4 wiring and Step 6.7 Rule AF-1 regex extension.
- One independent task **FR-1-REMAINING-5-FLOWS** (or 5 smaller tasks as queue prefers) for bctc-analyst/market-watcher/news-scout/digest-predict/market-analyst — these are NOT coupled to the CHEF pair per brief §2.2 (NFR-3 additive-only makes them safe independently after CHEF ships).

### 3. CCATO-T2 / CCATO-T3 — No Duplicate Mint

**Finding:** Both rows already exist in BACKLOG (sprint NARRATIVE-TRUTH-CCATO-GATE):
- CCATO-T2-CLAIM-TRUTH-SKILL (developer lane, .claude/skills/ zone) — unblocked, dependency CCATO-T1 is DONE_VERIFIED.
- CCATO-T3-FLOW-WIRING-6PT (cowork-refactory-expert lane) — depends on CCATO-T2 DONE_VERIFIED.

**Action:** Dispatch existing rows directly (no mint), NOT as FR-4/FR-5 duplicates. Sequencing: CCATO-T2 → [FR-1/FR-2 chef.md/cycle.md/daily-predict.md land] → CCATO-T3.

### 4. FR-7 SPIKE Mint (PM Authority)

**Rationale:** Architect's brief §6 specifies pm mints via orch-apply.sh (architect does not write orch-state.json per task write-boundary constraint).

**Spec:** SPIKE-EARNINGS-REV-VALUATION-PCTILE-FEASIBILITY (BACKLOG, PLAN-ONLY, size S, ops-mainserver-fetch primary, recon-only, no build/compute allowed).

**Minting:** Via orch-apply.sh transform (see docs/policies/dev-standards.md CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER).

### 5. Lane A Ordering (WIP=2, Parallel C)

**Constraint:** WIP=2 enforcement — sequence dispatches, don't flood.

**Parallel ready:** Lane A (FR-1 tasks) and Lane C (CCATO-T2) can start in parallel (disjoint zones: docs/agents/* vs .claude/skills/). Lane B (CCATO-T3) sequenced after both Lane C (CCATO-T2 DONE_VERIFIED) and Lane A overlapping files (chef.md/cycle.md/daily-predict.md edits landed).

**Dispatch order (WIP=2):**
1. First batch: FR-1-CHEF-LEG-FR-2-ATOMIC + CCATO-T2-CLAIM-TRUTH-SKILL (parallel, different zones)
2. Next batch (after first batch starts/completes): FR-1-REMAINING-5-FLOWS
3. After FR-4 DONE_VERIFIED + overlapping files landed: CCATO-T3-FLOW-WIRING-6PT

### 6. FR-3 Gated — No Action This Sprint

**Finding:** GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST is REVIEW (live-cycle-verification pending). Zero docs/data/unified-agent-synthesis-*.json files exist on disk (BA §0.6).

**Status:** GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD already has blocked_by relationship on board. No new gate needed; pm defers dispatch until A reaches DONE_VERIFIED.

---

## Orch-State Changes Required

1. **Supersede IND-P1-MOMENTUM-CONSUMER-WIRING:** status → SUPERSEDED, add note cross-referencing FR-1 task id(s).
2. **Mint FR-1-CHEF-LEG-FR-2-ATOMIC:** task row (cowork-refactory-expert, ANALYSIS-QUALITY-CONVERGENCE sprint).
3. **Mint FR-1-REMAINING-5-FLOWS:** task row (cowork-refactory-expert, ANALYSIS-QUALITY-CONVERGENCE sprint).
4. **Mint FR-7 SPIKE:** SPIKE-EARNINGS-REV-VALUATION-PCTILE-FEASIBILITY (ops-mainserver-fetch, ANALYSIS-QUALITY-CONVERGENCE sprint).

No new rows for FR-4/FR-5 (dispatch existing CCATO-T2/T3).

---

## Commit Strategy

**Atomicity:** FR-1-CHEF-LEG-FR-2-ATOMIC's DoD includes "Lands in a single commit with no other unrelated changes." This ensures the regression guard (FR-2) ships with the new chef.md wiring (FR-1's chef leg).

**Minting commit:** All board writes (IND-P1 supersede + FR-1 mint + FR-7 mint) via single orch-apply.sh call, captured in one pm commit (explicit paths: docs/data/orch/orch-state.json + docs/agent-memory/decisions/this-file).

---

## Verification Checklist (AC mapping)

- AC-1..5: FR-1's 6 flows per BA §0.4 wiring table (grep verify in dispatch phase).
- AC-6: chef.md Step 6.7 Rule AF-1 regex coverage (FR-2, atomic with FR-1's chef leg).
- AC-7: additive-only, no regression (tsc + existing gates pass).
- AC-8: FR-3 QA starts only after GAP-CHEF-SYNTHESIS-A DONE_VERIFIED.
- AC-9: CCATO-T2/T3 full wiring per documented anchors (dispatch phase verification).
- AC-10: Cross-reference discipline (architect brief captures, pm does not re-diagnose).
- AC-11: Phase-2 prose passthrough (no code, no board mutation).
- AC-12: FR-7 SPIKE minted (PLAN-ONLY, zero code this cycle).
