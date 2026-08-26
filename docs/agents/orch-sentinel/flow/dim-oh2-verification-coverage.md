# Orch Sentinel — OH-2 Behavioral-Verification Coverage Map

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` — OH-2.1–2.3: MODE=FULL only. OH-2.4 (below): MODE=FULL **and** MODE=LITE (FIX-BEHAVIORAL-VERIFICATION-GATE-OH24-CADENCE 2026-08-26).
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

## OH-2.4 — Behavioral-Predicate Coverage & Pass Rate (runs in MODE=FULL **and** MODE=LITE)

`docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §6/§7. Unlike OH-2.1–2.3 above (FULL-only), this check is a cheap jq numeric scan + up to 11 `docker image inspect` calls (same shape as OH-1, no doc-parsing judgment) — cadence promoted to FULL+LITE so it gets real data daily, not only weekly. **On MODE=LITE, run ONLY this section; skip OH-2.1–2.3.**

**Enforcement cutoff:** every ratio below scopes to rows with `created_at`/`qa_verified_at` `>= BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z"` — rows minted before that instant never had the field to carry and are excluded from every denominator, never counted as a miss.

Three ratios, each with a real denominator:
1. **`declared/code_rows`** — of P0/P1 `apps/` `DONE_VERIFIED` rows in the trailing-7d window (live `done_verified[]` + this week's archive slice — fine to time-box, measures recent mint discipline), how many carry `verification.behavior_predicate`.
2. **`executed/declared`** — of those, how many have `verification.behavior_probe.observed_at` populated. **This is the ratio that would have flagged the anchor case** (`FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL`, `DONE_VERIFIED` 13 min before its image built). Population is **NOT** time-boxed — every row anywhere on the board or in ANY archive month with `behavior_predicate` present and `behavior_probe` absent stays in this denominator until probed, never dropped by age alone (`scripts/orch-cold-evict.sh` `DONE_MAX_AGE_DAYS=7` would otherwise drop a row from view at ~day 14, before 5 of the 6 stale-image services below even reach their next rebuild).
   **Escalation keyed on wall-clock age since `qa_verified_at`, not elapsed rebuild cycles** (a never-rebuilt service must still surface — "declared and never observed" is itself the finding). Per unprobed row: `MED` at age >3d, `HIGH` at age >7d.
3. **`passed/executed`** — of executed probes, how many `match:true`. Report `N/A (0 executed)` when the denominator is 0 — never a bare `0%`, which is indistinguishable from "ran and failed every time."

**Per-service rebuild-staleness output** (report every run, not left implicit): for each `apps/*` zone carrying ≥1 open (unprobed) predicate, `days_since_last_build` via `docker image inspect <svc> --format '{{.Created}}'` (same primitive ops's Behavior-Predicate Probe already runs, `docs/agents/ops/flow/docker.md` § Post-Rebuild Health Verification).
```bash
jq -r '.project.microservices[].id' docs/data/system-map.json | while read -r svc; do
  echo -n "$svc: "; docker image inspect "vn-market-intelligence-mcp-$svc" --format '{{.Created}}' 2>/dev/null || echo "N/A"
done
```
**Routing (mandatory, do not cross the two ladders below):** the age-based MED/HIGH flag on a stale-image service is an ops-cadence finding → signal_queue row `to: "ops"` (`"N behavior-predicates aging past Nd in <svc>, last rebuilt <days>d ago — schedule a rebuild"`). NEVER route a staleness-only flag to `agent-father`/`po`'s owner-quality ladder below (§7 sanity-check) — the code may be entirely correct, it has simply never been checked, and an unrebuilt image is not evidence against any agent's work.

**Remediation ladder (owner-quality, `match:false` findings ONLY — never staleness alone):** reuses the existing `<!-- OH-STATE: {json} -->` counter technique (same as OH-2.2/OH-4.2/OH-4.3), key `oh2_4_owner_fail_streak: {<owner_agent>: N}` — written by `emit-scorecard.md` Step 1.4, not this file.
- **Rung 0 (single `match:false`):** already actioned by ops (`docs/agents/ops/flow/docker.md` § Behavioral-Predicate Probe step 5 — row demoted to `review[]` in the same write). This dimension only needs to emit one informational signal_queue row to `po` (LOW), citing the row id.
- **Rung 1 (≥3 `match:false` failures, same `owner`, rolling 20-row/30d window):** signal_queue row to `agent-father` (MED): `"review flow doc/prompt for <owner> — N behavior-predicate failures in window, rows: [...]"`.
- **Rung 2 (a 2nd Rung-1 escalation for the same owner within 60d, fail streak not reduced):** signal_queue row to `po` (HIGH) with an explicit decision menu — tool-grant reduction, mandatory second-review pairing, or retirement-review of that agent identity. PO decides; this dimension never auto-retires anything.

## Output of this sub-flow

Return `[{check_id: "OH-2.1", severity, metric, summary}, ...]` for OH-2.1 through OH-2.4 (OH-2.1–2.3 only on MODE=FULL; OH-2.4 on both) to `main.md`. Same anti-flood dedup gate as OH-1 (`docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` § Anti-Flood Guarantee) applies before any signal_queue write in `emit-scorecard.md`.
