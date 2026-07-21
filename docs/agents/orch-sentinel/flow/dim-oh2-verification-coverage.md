# Orch Sentinel — OH-2 Behavioral-Verification Coverage Map

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` (MODE=FULL only)
**Answers:** Does anything verify agents work correctly / respect policy / respect architecture / understand their tools / write correct files+locations?

---

## OH-2.1 — Coverage Matrix: 4 Belief Axes × Agent Population

The 4 belief axes: (1) policy compliance runtime, (2) architecture adherence runtime, (3) tool understanding, (4) file/location correctness.

Build the matrix live each run — never a hardcoded prior copy:
```bash
Glob docs/agents/*/init.md      # agent population (live count, never hardcode)
Read docs/agents/agent-father/flow/review-setup.md    # structure-only scope declaration
Read docs/agents/tran-ngoc-bau/init.md                # runtime-narrative scope declaration
Read .claude/skills/self-critique/SKILL.md            # pilot roster + T1-T5 scope
Read .claude/skills/claim-truth-gate/SKILL.md         # narrative-agents scope
```
For each of the 4 axes, determine which verifier (if any) covers which agent-class, from the declared scopes above — not from memory of the 2026-07-21 audit findings (those findings are the STARTING baseline, this cycle must re-derive live).

**Flag:** `INFO` row per axis × agent-class with zero matching verifier.

## OH-2.2 — D-FLEET Pilot Graduation Status

```bash
grep -n "Tier-4 pilot runs:" docs/agent-memory/notebooks/system-auditor.md | tail -1
```
Cross-reference against the 6 G1-G6 criteria in `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §7.
Delta mechanism: compare this run's pilot-run count against the value stored in the PRIOR scorecard's OH-STATE block (read in `main.md` Step 0b) — if unchanged AND > 30 days since that stored value's timestamp AND no graduation decision recorded → flag.
**Flag:** `LOW` if pilot run count unchanged for > 30d without a graduation decision either way (staleness, not failure — pilots are allowed to sit).

## OH-2.3 — T4-C Dependency (per-agent tool-usage-stats)

```bash
jq 'has("byAgent")' docs/agent-memory/modules/tool-usage-stats.json
```
**Flag:** `INFO` "still degraded mode" while absent — feeds OH-2.2's graduation-readiness read as context, never escalated past `INFO` on its own (already-flagged LANE-B backlog item, not a new discovery each run).

---

## Output of this sub-flow

Return `[{check_id: "OH-2.1", severity, metric, summary}, ...]` for OH-2.1 through OH-2.3 to `main.md`. Same anti-flood dedup gate as OH-1 (`docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` § Anti-Flood Guarantee) applies before any signal_queue write in `emit-scorecard.md`.
