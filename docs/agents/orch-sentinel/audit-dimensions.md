> Parent: [../../../.claude/agents/orch-sentinel.md](../../../.claude/agents/orch-sentinel.md)

# Orch Sentinel — Audit Dimensions

This file is the canonical registry of what orch-sentinel checks and why. Each dimension maps to check
IDs in the matching `docs/agents/orch-sentinel/flow/dim-oh*.md` sub-flow and to the full spec in
`docs/architecture-briefs/2026-07-21-orchestration-health-agent.md` §2.

---

## OH-1: Feedback-Loop Throughput

**Mode:** FULL + LITE (runs every cycle — fastest-moving dimension)
**Check IDs:** OH-1.1 through OH-1.6
**Scope:** Signal→task mint rate, signal-born task BACKLOG age, ATB liveness (corroboration-gated),
file-plane drain backpressure, queue-plane prune health, NEW-row max age per recipient.
**Answers:** Do findings from loops 2/3/4 reach loop 1 (dev-team)?
**Finding category (dedup namespace):** `orch-health-finding` (signal_queue `type` field; check_id carried in `summary` prefix)
**Handler:** `docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md`

---

## OH-2: Behavioral-Verification Coverage Map

**Mode:** FULL only
**Check IDs:** OH-2.1 through OH-2.3
**Scope:** Live 4-belief-axis (policy/architecture/tools/file-location) × agent-population coverage
matrix; D-FLEET pilot graduation staleness; T4-C per-agent tool-stats dependency status.
**Answers:** Does anything verify agents work correctly / respect policy / respect architecture /
understand their tools / write correct files+locations?
**Finding category (dedup namespace):** `orch-health-finding`
**Handler:** `docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md`

---

## OH-3: Auditor Blind-Spot Meta-Check

**Mode:** FULL only
**Check IDs:** OH-3.1 through OH-3.4
**Scope:** system-map.json vs system-auditor probe-coverage diff; VPS route count 3-way compare;
Tier-4/D-FLEET self-promotion guard (binary invariant); heartbeat granularity regression.
**Answers:** Does system-auditor cover all zones?
**Structural note:** cannot live inside system-auditor itself — see brief §0 for the full precedent
comparison against D-FLEET and the self-resolve conflict-of-interest this avoids.
**Finding category (dedup namespace):** `orch-health-finding`
**Handler:** `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md`

---

## OH-4: Capability Utilization

**Mode:** FULL only
**Check IDs:** OH-4.1 through OH-4.4
**Scope:** Tool-usage-stats vs registry/grant-list snapshot; delta vs previous scorecard run;
persistent high-value dormancy (3+ consecutive runs); doc-coverage drift.
**Answers:** Does cowork use the app's full capability?
**Finding category (dedup namespace):** `orch-health-finding`
**Handler:** `docs/agents/orch-sentinel/flow/dim-oh4-capability-utilization.md`

---

## Cross-Dimension Invariants

- **Anti-flood guarantee:** at most one signal_queue row per genuinely new/state-changed check per run
  — dogfoods OH-1.5 (never contributes to the queue-congestion problem it measures). Gate spec:
  `docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` § Anti-Flood Guarantee.
- **Corroboration gate:** only OH-3.3 may emit `CRITICAL` directly (binary invariant-presence read).
  Every other check tops out at `HIGH` unless a second independent plane corroborates escalation —
  worked example: OH-1.3's corroboration box.
- **No self-resolve:** a finding that later reads clean is marked `RESOLVED-OBSERVED` in the scorecard
  only — the original signal_queue row's `status` field is never touched by orch-sentinel after `NEW`.
- **Trend/delta mechanism:** OH-2.2/OH-4.2/OH-4.3's "N consecutive runs" counters live in the
  scorecard's `<!-- OH-STATE: {json} -->` block (self-referential diff, same technique as
  system-auditor's D-BCTC-EVAL snapshot) — the notebook is OVERWRITE-class and holds none.
