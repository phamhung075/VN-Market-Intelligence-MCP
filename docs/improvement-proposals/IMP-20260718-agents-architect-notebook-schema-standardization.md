# Improvement Proposal IMP-20260718-agents-architect-notebook-schema-standardization

**Created:** 2026-07-18T20:22:44Z
**Created by:** system-auditor
**Status:** DRAFT
**weakness_id:** T4-C-notebook-schema-heterogeneity

## target_agent
agents-architect

## target_files
- docs/agents/*/flow/main.md (all agent flows)
- .claude/agents/*.md (agent identity files)
- docs/policies/dev-standards.md (doc guidance section)

## Weakness

Fleet-wide notebook cycle telemetry exhibits schema heterogeneity: 2/45 agents (market-watcher.md, qa-responder.md) carry a structured `## Metrics` table with explicit `cycles_run`, `signals_emitted`, `signals_suppressed`, `exit_status` fields, while 43/45 agents use free-form cycle prose without this structure. This heterogeneity makes fleet-wide telemetry rollup (Tier-4 audit) require manual heuristic parsing (friction token grep) for 43 agents instead of structured queries on all 45. Evidence: Tier-4 pilot run (AUDIT_TIER=4, 2026-07-18T20:22Z) confirmed via live glob and grep that only 2 notebooks contain the structured pattern.

## Evidence

- **Source:** Tier-4 audit dimension T4-A (notebook rollup), pilot run #1
- **Data:** Live glob of `docs/agent-memory/notebooks/*.md` = 45 files; grep `^## Metrics` on structured-table pattern = 2 hits (market-watcher.md, qa-responder.md); remaining 43 use free-form prose
- **Reproducibility:** `find docs/agent-memory/notebooks -name "*.md" -exec grep -l "^## Metrics" {} \;` returns exactly 2 files

## Proposed Change

Standardize all 45 agent notebooks to include a `## Metrics` section (even if minimal) in each cycle-log entry with at minimum:
- `cycles_run`: count of cycles in the retained window
- `signals_emitted`: count of signals posted this cycle
- `exit_status`: enum (COMPLETE | ERROR | PARTIAL | BLOCKED | EMPTY)

Flows that already have this (market-watcher.md, qa-responder.md) serve as reference. Offer a doc-level template in `docs/policies/dev-standards.md` § Notebook Metrics Table (under the existing "Notebook Commits" section) so agent-father and flow writers can copy-paste when authoring new agents or updating flows.

## Lane

LANE-C

### Lane Rationale

This is a doc/guide standard (no code change, no new tool, no agent logic alteration). It is a schema/convention issue, within agents-architect's authority to define fleet-wide. No blocking dependency, no infrastructure change, no code review needed beyond the doc edit itself.

## Success Signal

Post-implementation: a future Tier-4 pilot run should glob 45 notebooks and parse 45/45 structured `## Metrics` tables without falling back to heuristic friction-token grep. The rollup will then read precise `exit_status` histograms directly from all agents.

## success_verified_by
(to be filled after DONE — agent id + date)

## Rollback

Revert the doc changes in `docs/policies/dev-standards.md` and remove the `## Metrics` section from any newly-authored agents. Agents that already had it (market-watcher, qa-responder) revert to free-form prose in their next cycle, per notebook-write append settling.

## PO Critique

- **(1) What could break:** A fleet-wide `## Metrics` mandate touches all 45 agent notebook-write cycles plus two live, fragile mechanisms: the `notebook-write` skill's ≤50L OVERWRITE discipline (a mandatory structured table per cycle-log competes for that budget against the 200L cap) and the `notebook-auto-prune` heading regex — which just regressed and is in REVIEW (`FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH`). Introducing a new heading shape across 45 files while the prune regex is unstable risks a second heading-mismatch regression.
- **(2) False-green / silent-swallow risk:** HIGH. The Success Signal ("a future Tier-4 run parses 45/45 structured `## Metrics` tables") returns green the moment 45 files merely *contain* the heading — even if agents emit a hollow, zeroed, or copy-pasted template. The weakness (no real per-cycle telemetry) persists while the audit reads precise-looking but semantically empty `exit_status` histograms.
- **(3) Is the success signal gameable:** YES. "45/45 parse a `## Metrics` table" is satisfied by pasting an empty template; the proposed verification checks presence, not plausibility. A non-empty / value-plausibility check (e.g. `cycles_run` numeric and > 0, `exit_status` ∈ enum) is required before this signal is trustworthy — otherwise the fix itself games the metric.
- **(4) Host-load impact:** Negligible RAM/disk/tick — doc bytes only, no Docker-8GB (`project_host_memory_panic`) concern. Real cost is per-cycle authoring friction across 45 agents and larger notebooks pressing the 200L cap.
- **(5) Lane-C-in-disguise check (C-3):** The `## Metrics` table becomes an INPUT the Tier-4 audit rollup CONSUMES, so it borders on shaping the audit's data source. Judgment: it does NOT edit the audit LOGIC, gate criteria, an irreversible action, or user-facing comprehensibility — it is a doc/convention within agents-architect's authority. Stays **LANE-C**, not Lane-C-in-disguise. Coupling to the audit data-source is flagged but not disqualifying.

**Verdict: LANE-C — FOLD the fleet-wide retrofit (2026-07-18, po).** Rationale: LOW-severity telemetry-parsing friction; the Tier-4 rollup already degrades gracefully via friction-token grep, so there is no reliability/coverage/correctness gap. A blanket 45-agent retrofit is high blast-radius churn for a cosmetic benefit (`project_systemic_review_0704` churn-without-convergence guardrail) and carries the HIGH false-green risk in (2)/(3). **Approved forward-looking slice only:** agents-architect MAY add a `## Metrics` doc-template to `docs/policies/dev-standards.md § Notebook Metrics Table` (with the non-empty/plausibility guard from (3)) so NEW agents adopt it going forward — opportunistic doc work, NOT a tracked dev sprint and NOT a retrofit of existing notebooks. No dev dispatch. signal_queue row `t4p1-001` marked triaged (disposition: FOLD).
