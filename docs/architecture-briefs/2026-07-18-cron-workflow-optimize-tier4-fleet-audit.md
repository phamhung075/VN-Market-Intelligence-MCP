## Architecture Brief — `cron-workflow-optimize`: Tier-4 Fleet Performance & Cooperation Audit (Pilot)

**Sprint:** CRON-WORKFLOW-OPTIMIZE
**Date:** 2026-07-18
**Author:** agents-architect
**Status:** DESIGN ONLY — zero code, zero `.md` edits (this brief only)
**Coordination session:** 95ab3ca8-b51f-4863-b8a6-95d5f33d2a2c
**Task input:** four design axes pre-resolved by user (placement, data sources, output routing, cadence) — this brief designs WITHIN those constraints, does not re-litigate them.

---

## 0. Prior-Art Disambiguation (read first — avoids duplication)

Two existing systems look adjacent to this brief. Neither is duplicated; both are named here so a future reader does not re-propose them.

| System | Scope | Axis | Relationship to this brief |
|---|---|---|---|
| `.claude/skills/self-critique/SKILL.md` (T1–T5) | End-of-cycle **self**-review by a single agent about its **own** just-completed cycle. PLAN-ONLY, PILOT-scoped to exactly 2 agents (`news-scout`, `dev-team`) per brief `2026-06-01-agent-self-critique-detect-source.md`. | One agent, one cycle, in-the-moment | Tier-4 is a **fleet-wide rollup ACROSS ALL agents**, run on-demand, looking at accumulated telemetry over a window — not a per-cycle self-check. Tier-4 does not replace or widen the self-critique pilot's 2-agent scope; that stays a separate PO-gated decision (brief §8 promote criteria, untouched here). Both feed the SAME improvement-proposal pipeline (§3 below) — no fork. |
| `docs/architecture-briefs/2026-06-10-quality-audit-framework.md` (D1–D10, ISO 25010) | **External-auditor** stance: does the SYSTEM behave correctly from the outside (38 capabilities × 10 quality lenses, ~275 checks) — functional suitability, freshness, security, contract integrity. | System quality, black-box | Tier-4 is an **internal-auditor** stance: is the FLEET OF AGENTS authoring correct, cooperating well, and converging (not churning)? Tier-4 never re-derives D1–D10 checks (runtime health, freshness SLA, etc. stay system-auditor D1/D2/D3 as already defined). Tier-4 consumes agent-authored telemetry (notebooks, task_board, tool calls, verdicts) that the quality-audit-framework brief does not touch. |

Also checked and **not duplicated**: `docs/architecture-briefs/2026-06-14-workflow-protocol-coherence-audit.md` (lock/protocol mechanics, not performance/precision) and `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` (one-time manual audit producing a 49-row backlog, not a repeatable dimension). No live "Tier-4" or "fleet-wide performance" mechanism exists today — confirmed by grep across `docs/` before authoring this brief.

---

## 1. Correction to Task Premise (verified before designing on top of it)

The task brief for this design states data source (a) is "cycle-level telemetry (`cycles_run`, `signals_emitted/suppressed`, `exit_status`) already written by all 46 `docs/agent-memory/notebooks/*.md` files. No new instrumentation needed here, just a cross-agent rollup."

**Verified live (2026-07-18):** `docs/agent-memory/notebooks/*.md` currently contains **45** files (not 46 — live glob count, do not hardcode). Of those 45, exactly **2** (`market-watcher.md`, `qa-responder.md`) carry the literal structured `## Metrics` table with `cycles_run` / `signals_emitted` / `signals_suppressed` / `exit_status` fields. The other 43 use free-form prose cycle logs (per `notebook-write` skill's OVERWRITE/APPEND two-class contract, which governs section-boundary/retention/atomic-write mechanics only — it does **not** mandate any particular field schema for cycle content).

This does not block the design — it changes it. §2a below is designed to be **tolerant of this heterogeneity** rather than assume a uniform schema that does not exist. This finding is itself flagged as the pilot's likely first dogfood output (§6).

---

## 2. Data Sources (all four incorporated, per constraint)

### 2a. Notebook Aggregation — Fleet Cycle Telemetry Rollup

**Mechanism:** Glob `docs/agent-memory/notebooks/*.md` (live count each run — never hardcode "45" or "46"). For each file:

- **Structured path** (`market-watcher.md`, `qa-responder.md` today — set may grow): parse the `## Metrics` table, sum `cycles_run`, `signals_emitted`, `signals_suppressed` over whatever cycles remain in the retained window (notebook-write retention keeps only the last 3 `## ` sections — historical cycles beyond that are already pruned; the rollup is a **recent-window snapshot**, not a lifetime total, and must be labeled as such). Classify `exit_status` distribution (complete / empty / error / partial / BLOCKED).
- **Free-form path** (the other ~43): heuristic proxy only — count `## ` cycle-section headers in the retained window as a `cycles_observed` proxy; grep for friction tokens (`BLOCKED`, `ABORT`, `ERROR`, `FAIL`, `stale`, `workaround`) as an `exit_friction_hits` proxy. Tag every row `structured: false`.
- **Never fabricate:** an agent with zero parseable signal gets `cycles_observed: null, note: "no structured or heuristic signal found"` — not a zero (per STANDING `feedback_no_fake_data_real_fetch` / `feedback_empty_read_is_not_evidence`).

**Output shape (in-memory during the cycle, not a new state file):**
```json
{ "agent_id": "market-watcher", "structured": true, "cycles_observed": 3, "signals_emitted_total": 0, "signals_suppressed_total": 0, "exit_status_histogram": {"complete": 3} }
{ "agent_id": "bctc-analyst", "structured": false, "cycles_observed": 3, "exit_friction_hits": 0 }
```

**Finding trigger:** an agent whose `exit_status_histogram` (structured) or `exit_friction_hits` (heuristic) is majority error/BLOCKED across the retained window → precision candidate, routed per §3.

### 2b. task_board / signal_queue Derived Metrics (cooperation/handoff friction)

**Mechanism:** Read-only `jq` over `docs/data/orch/orch-state.json` (per `docs/standards/orch-state-access.md §1` — absolute path, never assume CWD). Tier-4 **never writes** `task_board` — read-only, consistent with system-auditor's existing write boundary (notebook + signal_queue + improvement-proposals only, per the D-IMPROVE precedent already established in `2026-05-27-gated-self-improvement-loop.md`).

Metrics, grouped by `owner` / `next_agent` / `completed_by` / `dispatched_by` (field present varies by lane — tolerant read, skip missing):

| Metric | Derivation | Caveat |
|---|---|---|
| Cycle time | `completed_at`/`closed_at` − `dispatched_at` (fallback `created_at`) for `done`/`done_verified`/`closed_sprints` rows | Only computed when both timestamps present; rows missing either are counted separately as `insufficient_telemetry`, never imputed |
| Rework / bounce-back proxy | Presence of `withheld_at` / `withhold_note` / `po_adjudication` / multiple accumulated `*_note` fields on one row | **orch-state.json is a live snapshot, not an append-only event log** — there is no queryable state-transition history in the hot file. This is a textual-marker PROXY, explicitly labeled as an approximation. A higher-fidelity version (mining `git log -p -- docs/data/orch/orch-state.json` for per-`task_id` status diffs) is named here as an optional future enhancement, **not required for pilot v1** (expensive, out of scope for an on-demand pilot's resource budget). |
| Review-to-done latency | Best-effort: `dispatched_at` → `completed_at`/`closed_at` for rows that passed through `review[]`/`qa[]` lanes | Rows lacking a clean review-entry timestamp are flagged `insufficient_telemetry`, not fabricated |
| Handoff friction (cooperation lens) | Count of distinct `next_agent` reassignments / `zone` vs `owner` mismatches / `depends[]` fan-out per task | Cross-agent cooperation proxy — a task bouncing across ≥3 agents before DONE is a cooperation-friction candidate |

**Finding trigger:** an agent/zone pair with disproportionate cycle time, review latency, or bounce-back markers relative to the fleet median → cooperation-friction candidate, routed per §3.

### 2c. `tool-usage-stats.json` Per-Agent Redesign (precision analysis substrate)

**Current state (verified live):** `docs/agent-memory/modules/tool-usage-stats.json` is generated every 8h by `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts`, reading `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts` — an in-memory `Map<toolName, count>` incremented by a handler-proxy installed in `apps/mcp-server/src/interface/mcp/server.ts` (line ~329, `incrementTool(toolName)`). **There is no agent-identity dimension anywhere in this path.** The gateway dials a fresh SSE connection per call and drops it (root cause documented in the file's own header comment, TSU-DEV-U1) — this is precisely why the counter had to move off session-keyed caching to a stateless per-call proxy in the first place. No caller-identity channel exists today to attribute a call to an agent.

**This means: the redesign constraint 2c asks for is NOT a doc/config change — it is a code change in `apps/mcp-server/`, which is constitutionally forbidden to agent-father** (same boundary already documented for D4 in `docs/agents/system-auditor/audit-dimensions.md`: *"Zone owner for the actual fix = `dev-mcp-server`, not agent-father — agent-father is constitutionally forbidden from writing `apps/**/*.ts`"*). This is a **LANE-B prerequisite**, routed through the existing dev-team chain (po → ba → architect → pm → dev-mcp-server → qa), not something Phase 1 of this brief can ship.

**Prerequisite scope (small, scoped, additive/back-compat — see §7 Phase 0):**
1. Calling convention: add an optional, additive passthrough field (e.g. `arguments._callerAgent`) to the `mcp__gateway__call_tool` contract in `docs/standards/mcp-tools.md` + `docs/standards/gateway-call-contract.md`. Stripped before forwarding to tool business logic; read only by the telemetry proxy. Absent = `agentId: "unknown"` (never breaks existing callers).
2. `perCallCounterStore.ts`: compound key `${agentId}:${toolName}`; add an **error counter** (increment on handler throw, not just entry — today there is no error tracking at all, only call counts).
3. `trackSessionToolUsageJob.ts`: additive output schema — keep top-level `generatedAt`/`uniqueTools`/`toolCounts` for existing readers, add `byAgent: { "<agent-id>": { toolCounts: {...}, errorCounts: {...} } }`.
4. QA GATE-PROOF (per `2026-05-27-gated-self-improvement-loop.md §5`): inject a deliberate wrong-`agentId` call and prove it does **not** silently misattribute to the wrong bucket, before this is trusted.

**Pilot decision:** Pilot Run #1 MAY execute with (c) in **degraded mode** — global-only counts, zero per-agent attribution, explicitly labeled as a gap rather than fabricated — so the pilot is not blocked end-to-end on a code merge landing first. Full (c) coverage is a **graduation-gate requirement** (§6, G5) before any permanent-cadence ask reaches PO.

### 2d. Generalizing Alert/Prediction Accuracy Scoring to Non-Alert Outputs

**Current tools (verified live):**
- `get_alert_accuracy` / `write_alert_verdict` — `alertSource` is a server-side **Zod-validated enum** (`urgent_news`, `verified_chain`, `chain_catalyst`, `price_anomaly`, `position_danger`, `watchlist_opportunity`, `legal_risk`, `crisis_velocity` — hardcoded in `apps/mcp-server/src/interface/mcp/tools/alerts/alertVerdictTools.ts`). Adding a new category value is a code change (same LANE-B constraint as §2c).
- `create_prediction_claim` / `get_prediction_accuracy` — already **more generic** (stock + claim_text + probability + `resolution_criteria` JSON), not restricted to "alert" semantics, but still bound to a price/resolution metric.
- `get_label_accuracy_report` — signal-label precision/recall/F1, scoped to market-analyst.
- `get_evidence_summary` — directional evidence fragments, scoped to digest-predict.

**Pilot-v1 scope (no new server code — "where applicable" qualifier honored pragmatically):**

| Output class | Scoring path | New code needed? |
|---|---|---|
| Non-alert outputs with a directional/price-checkable claim (e.g. digest-predict predictions, market-watcher anomaly calls that never fired a MARKET alert) | Route through the **already-generic** `create_prediction_claim`/`get_prediction_accuracy` pair | No — pure usage-pattern extension in the owning agent's flow doc |
| Non-alert, non-price-checkable outputs (system-auditor findings, bctc-analyst extraction confidence, agents-architect brief adoption) | **Disposition-based precision proxy** — reuse §2b's task_board/signal_queue read: does the corresponding signal_queue row / task_board row / improvement-proposal end `CONFIRMED`/`DONE_VERIFIED` (≈HIT) vs `REJECTED`/`false-positive`/self-resolved-without-action (≈MISS) vs still-open (≈UNKNOWN)? Same three-way semantic as `get_alert_accuracy`, keyed to row disposition instead of price movement. Zero new tool — reuses (b)'s data under a different lens. |
| True first-class generalization (new `get_agent_output_accuracy` tool, or a new `alertSource` enum bucket) | **LANE-B follow-up candidate ONLY if** the disposition-proxy above proves insufficient after the pilot — not built in pilot v1 | Yes — deferred |

This keeps (d) fully achievable via existing tools + doc-level convention (agent-father buildable), satisfying "generalize... where applicable" without new server code for the pilot.

---

## 3. Output Routing — Reuse the Existing Gated Pipeline, Verbatim

**No new route.** Tier-4 findings are emitted through the **identical mechanism already live for D-IMPROVE** (system-auditor Tier-2 add-on, per `2026-05-27-gated-self-improvement-loop.md` EDIT-1 and the live schema confirmed in `docs/improvement-proposals/IMP-20260603-news-scout-T4-lancedb-restore.md`):

```
Tier-4 handler produces a candidate
  → classify LANE-A/B/C (three-lane rule, §1 of 2026-05-27 brief)
  → write docs/improvement-proposals/IMP-<YYYYMMDD>-<target-agent>-<slug>.md
    (frontmatter: Created by: system-auditor | Status: DRAFT | Triggered: <ISO> | Cycle: tier4-pilot-<N>)
    (body: Weakness / Evidence / Proposed Change / Lane + Rationale / Success Signal / Rollback)
  → append docs/data/orch/orch-state.json .signal_queue.rows[] row
    (type: improvement_proposal, from: system-auditor, to: po, payload_ref: <path>)
  → agents-architect Improvement-Proposal Review (existing handler, handlers.md § Improvement-Proposal Review)
  → po triage-signals.md mandatory-critique gate (existing row, EDIT-3 of 2026-05-27 brief — zero change needed, already keyed on type=improvement_proposal, not on which agent originated it; Created-by already accepts "system-auditor | agents-architect")
  → LANE-A APPROVED → agent-father | LANE-B APPROVED → dev-team chain | LANE-C/REJECTED → WORK Telegram, human decision
```

**One-target-per-proposal rule (dedup discipline):** if a Tier-4 pass identifies a cross-cutting issue touching multiple agents (e.g. "43/45 notebooks lack structured Metrics tables"), it MUST be split into N separate single-`target_agent` proposals — never one multi-agent proposal — and is subject to the existing self-critique SC-0 cooldown (one open proposal per agent per VN day; glob `docs/improvement-proposals/IMP-<YYYYMMDD>-<agent-id>-*.md` before writing).

**Zero new PO-flow change, zero new signal type, zero new proposal schema.** This is the direct answer to constraint 3.

---

## 4. Placement — Tier-4 Bolted onto system-auditor (not a new agent)

Tier-4 is a **fourth dimension check inside the existing `system-auditor` agent definition**, invoked the exact same way Tier-1/2/3 already are — differing only in the `AUDIT_TIER` value read at the existing "AUDIT_TIER extraction" step in `docs/agents/system-auditor/flow/main.md`. It sits alongside the existing Tier-2 D-IMPROVE add-on (same emit mechanism, §3) and the D1–D5 registry in `docs/agents/system-auditor/audit-dimensions.md`, as a new entry: **D-FLEET (Tier-4, PILOT)**.

### Why this satisfies the binding constraint from `2026-05-27-gated-self-improvement-loop.md §6`

That brief's Host-Load Budget Rule explicitly rejected *"a new dedicated `self-improver` cowork agent running on a new cron slot... out of scope (host load, token cost, see SPIKE_1947 §3 Option B: REJECTED for Phase 1-2)."* Tier-4 as designed here is checked against that exact rejection:

| Rejected pattern | Tier-4 as designed |
|---|---|
| New standalone agent (new `.claude/agents/*.md`, new identity, new notebook, new session log) | **None.** Zero new agent files. Tier-4 runs inside `system-auditor`'s existing identity, existing notebook (`docs/agent-memory/notebooks/system-auditor.md`), existing session log. |
| New always-on cron slot (new `cronConfig.ts` entry, new fire-election `task_id` namespace at a fixed cadence) | **None during pilot.** `AUDIT_TIER=4` is manually spawned on-demand only — no `cronConfig.ts` change, no recurring fire-election boundary. (Tier-1/2/3 already have `cron:auditor-t{1,2,3}:<tick>` fire-election namespaces; Tier-4 pilot deliberately does NOT get one — see §5.) |
| New signal-writing / governance mechanism | **None.** Reuses D-IMPROVE's existing improvement-proposal emit path verbatim (§3) — zero new signal type, zero new PO-flow row. |
| New host process / container | **None.** Rides the same Claude agent session invocation already budgeted for Tier-1/2/3 (same `haiku` model, same container-less LLM session — system-auditor is not itself a Docker service). |

Tier-4 therefore adds **zero new pieces to the fleet's always-on footprint** — it is a conditional branch inside an already-approved, already-running detector, invoked manually. This is the structural reason bolting onto Tier-4 (rather than a new agent/cron) keeps this design inside the brief's constraint, and it is why the resource-budget line item below (§5) can honestly read "no new cron/agent."

---

## 5. Pilot Cadence — On-Demand Only, 1–2 Runs, No Cron Registration

**Invocation:** identical mechanism to Tier-1/2/3 (spawn `docs/agents/system-auditor/flow/main.md` with `AUDIT_TIER=4` in the spawn prompt) — triggered by explicit manual request (user, PO, or agents-architect), **never** by a scheduled cron tick during the pilot phase.

**Fire-election:** Tier-1/2/3 each have a live cron-boundary fire-election (`cron:auditor-t{1,2,3}:<tick>`) to arbitrate concurrent firings at the SAME cron boundary across the fleet. A manually-invoked one-off run has no such boundary to collide on. For hygiene only (cheap, reuses an existing primitive, zero new design), a lightweight one-off claim is recommended: `task_claim(task_id="cron:auditor-t4:pilot-run-<N>", task_kind="sprint-task", ttl_seconds=600)` — so two people invoking the pilot simultaneously do not double-write the notebook/signal_queue. This is NOT a recurring fire-election namespace; each pilot run gets its own literal `<N>` (1, 2, ...), not a cron-boundary tick.

**Scope:** run ONCE, then again a few days later (per the user's own framing) — first run validates the mechanism end-to-end without crashing and produces a sane, non-noisy output; second run measures real deltas (does cycle time move? does a genuine finding repeat or resolve?) and gives real, measured incremental cost to replace the estimate in §6.

**Explicit non-goal:** no `cronConfig.ts` entry, no `AUDIT_TIER=4` cadence in any scheduler, during this brief's Phase 1. A permanent cadence is a **separate, future** ask to PO (§7 Graduation Criteria), gated exactly like any other new cron per the Host-Load Budget Rule.

---

## 6. Resource Budget — Pilot Run Itself (line-itemed, per constraint)

Using the exact template from `2026-05-27-gated-self-improvement-loop.md §6`:

```
New cron/agent: NONE — Tier-4 is a dimension bolted onto the existing system-auditor agent/process.
  Zero new agent, zero new container, zero new always-on cron (see §4 table above).
Schedule: on-demand only (pilot). Manual AUDIT_TIER=4 invocation, 1–2 runs total during the pilot window.
RAM: ~0 MB incremental resident. Rides the SAME system-auditor Claude session already budgeted
  for Tier-1/2/3 invocations — no new process, no new container.
Disk:
  - Notebook append: ≤60L added to docs/agent-memory/notebooks/system-auditor.md per run
    (existing ≤200L cap + existing 3-section retention already prunes it — zero net long-run growth).
  - Improvement-proposal doc(s): ~2-5 KB per emitted proposal — identical cost profile to any
    existing lane-a/b proposal (self-critique already produces these at this cost today).
  - signal_queue row(s): ~200 bytes/row — existing mechanism, existing cost.
  - NO new persistent state file. The fleet rollup is computed FRESH each pilot run from
    existing sources (notebooks, orch-state.json, tool-usage-stats.json) — nothing cached/stored
    between runs beyond the notebook's own carry-over line.
Tick cost: 1 additional on-demand Claude session per pilot run (same haiku model system-auditor
  already uses for Tier-1/2/3). Estimated wall time <5 min/run: ~45 notebook file reads +
  1 jq pass over orch-state.json + 1 read of tool-usage-stats.json + a bounded handful of MCP
  calls for §2d disposition scoring. Recommend max_wall_time_tier4_seconds: 300 (same order as
  Tier-2's existing 300s budget in .claude/agents/system-auditor.md).
Fleet context: current Docker cap = 8GB (project_host_memory_panic memory). This pilot adds
  ZERO new Docker services/processes.
Decision: APPROVED (within budget) for Phase 1 doc-scaffolding + Pilot Run #1/#2 (bounded,
  on-demand, zero new infrastructure). PROMOTION to a permanent cron cadence is NOT approved
  by this brief — that is a separate future ask, gated on §7 Graduation Criteria, with the
  ESTIMATE above replaced by Pilot #1/#2's MEASURED wall-clock + disk delta, going through the
  standard PO mandatory-critique gate exactly like any other new cron request.
```

---

## 7. Graduation Criteria — What the Pilot Must Show Before Asking PO for a Permanent Cadence

Only when **all six** hold does agents-architect (or system-auditor) file a **new**, separate improvement-proposal ("promote Tier-4 to a permanent Tier-2 or Tier-3-adjacent cadence") through the SAME pipeline (§3), lane-a (it is a cadence/flow change, not code), carrying the §6 budget table with ESTIMATE replaced by MEASURED numbers:

| # | Criterion | Why it matters |
|---|---|---|
| G1 | ≥1 clean on-demand run completes end-to-end: all four data-source steps execute without ABORT, notebook section lands ≤60L, ≤200L cap respected | Proves the dimension is operationally sound before asking for recurring resource commitment |
| G2 | At least ONE genuinely actionable, non-duplicate improvement-proposal reaches ARCHITECT-REVIEWED — **or** the pilot legitimately finds "fleet clean," which is also valid evidence, not a failure | Proves the analysis produces signal, not noise (anchor: `project_systemic_review_0704_churn_without_convergence` — Tier-4 must not become a new churn source) |
| G3 | Zero duplicate/overlapping proposals with self-critique (T1–T5) or existing D1–D5/D-IMPROVE dimensions | Proves Tier-4 occupies a genuinely distinct niche (§0) rather than re-detecting what already fires elsewhere |
| G4 | Measured real cost (wall-clock seconds, notebook delta bytes, proposal count/bytes) from BOTH Pilot Run #1 and #2 is recorded and within (or a documented, explained multiple of) the §6 estimate | A >2x budget overrun without explanation blocks graduation |
| G5 | §2c Lane-B prerequisite (per-agent `tool-usage-stats.json`) has SHIPPED and been exercised in at least Pilot Run #2 — Run #1 in degraded mode is acceptable for initial validation, but a permanent-cadence ask MUST demonstrate all four data sources live, not three-of-four | Constraint 2 requires ALL FOUR sources incorporated — a recurring cron cannot launch on a permanently-degraded (c) |
| G6 | PO's own mandatory critique fields (break-risk, false-green, gameability, host-load) can be answered CONCRETELY from the two real pilot runs' data, not hypothetically | Matches the existing PO Critique Gate contract (`2026-05-27` §4) — no rubber-stamping |

No self-promotion: exactly like the existing loop's lane-c logical barrier (`2026-05-27 §7`), Tier-4 cannot authorize its own permanent cron — only PO, reading measured evidence, can.

---

## 8. Implementation Sequence + Flow-Edit Map

### Phase 0 — LANE-B prerequisite (dev-team chain, NOT agent-father; blocks only full §2c coverage, not Pilot Run #1)

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts` | Compound key `${agentId}:${toolName}`; add error counter |
| `apps/mcp-server/src/interface/mcp/server.ts` | Handler-proxy reads optional `arguments._callerAgent`, defaults `"unknown"` |
| `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` | Additive output schema: keep existing top-level fields, add `byAgent` |
| `docs/standards/mcp-tools.md` + `docs/standards/gateway-call-contract.md` | Document the new optional `_callerAgent` convention |
| QA | GATE-PROOF per `2026-05-27 §5` (inject wrong-agentId, prove no silent misattribution) before trusted |

This phase is **out of agent-father's zone** (`apps/**` forbidden — same boundary already on record for D4 in `docs/agents/system-auditor/audit-dimensions.md`). Agent-father, on receiving this brief, should raise Phase 0 to PO/pm as a SPRINT-XS backlog item for `dev-mcp-server`, citing this brief — agents-architect does not dispatch dev-team directly (not this agent's job, per `not_my_job`).

### Phase 1 — LANE-A doc scaffolding (agent-father, this brief's direct actionable deliverable)

**EDIT-1: `docs/agents/system-auditor/audit-dimensions.md`** — add new section after D5:
```
## D-FLEET (Tier-4, PILOT): Fleet-Wide Agent Performance & Cooperation Audit

Tier: 4 (on-demand PILOT only — NOT cron-registered; see brief 2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md §5)
Check IDs: T4-A (notebook rollup) / T4-B (task_board/signal_queue derived metrics) /
           T4-C (tool-usage-stats.json precision, degraded-mode aware) / T4-D (accuracy/disposition
           scoring) / T4-E (synthesis + improvement-proposal emit)
Scope: cross-agent rollup of cycle telemetry, cooperation/handoff friction, tool-call precision,
  and output-accuracy disposition across the full agent fleet (live glob count, currently 45
  notebooks — never hardcode).
Pass condition: N/A (this is an analysis pass, not a pass/fail gate) — output is zero or more
  improvement-proposal docs routed per §3 of the source brief.
Finding category (dedup namespace): fleet_performance_finding (routed as type=improvement_proposal,
  target_agent varies per finding — one proposal per target agent, never multi-target)
Pilot status: on-demand only. Graduation criteria (source brief §7) gate any future cron proposal.
```

**EDIT-2: `docs/agents/system-auditor/flow/main.md`** — add `TIER=4` row to the Tier Dispatch table + AUDIT_TIER extraction table, explicitly noting: *"AUDIT_TIER=4 → PILOT ONLY, manual invocation — not present in any cron config. Run §D-FLEET handler → notebook (label: Tier-4-PILOT) → RETURN."*

**EDIT-3: `docs/agents/system-auditor/handlers.md`** — new handler section `## Step D-FLEET: Fleet Performance & Cooperation Audit (Tier-4, PILOT)` with steps FA-1..FA-6 (mirrors the D5 handler's Steps D5-1..D5-3 style):
- FA-1: notebook rollup (§2a) — tolerant multi-pattern parse, `structured: true/false` tagging, never fabricate.
- FA-2: task_board/signal_queue derived metrics (§2b) — read-only jq, `insufficient_telemetry` tagging for incomplete rows.
- FA-3: tool-usage-stats.json read (§2c) — branch on presence of `byAgent` key; if absent, log `"[D-FLEET] T4-C degraded mode: byAgent not yet shipped — global counts only"` and continue (never ABORT the whole pass for a missing prerequisite).
- FA-4: accuracy/disposition scoring (§2d) — route price-checkable outputs through `get_prediction_accuracy`, non-price outputs through the §2b-reused disposition proxy.
- FA-5: synthesize findings → for each candidate, apply the one-target-per-proposal rule (§3) and the existing self-critique SC-0 daily cooldown glob check before writing; emit via the identical D-IMPROVE-2/3/4 steps (referenced, not re-specified).
- FA-6: notebook append (≤60L, per notebook-write skill) + pilot-run counter (`Tier-4 pilot runs: N` line, so future runs can see how many pilot cycles have occurred for §7 G1/G4 tracking).

**EDIT-4: `docs/agents/tools/package/system-auditor.md`** — add read-only note: Tier-4 additionally reads `docs/agent-memory/notebooks/*.md` (all), `docs/agent-memory/modules/tool-usage-stats.json`, and pre-catalogues these MCP tools for §2d (per the doc's existing "Anti-discovery constraint" — no runtime `list_server_tools`/`search_tools`):
```
get_prediction_accuracy   | 4 | Price-checkable non-alert output scoring → Dimension D-FLEET T4-D
create_prediction_claim   | 4 | Log a prediction claim for a non-alert-fired signal → Dimension D-FLEET T4-D
get_alert_accuracy        | 4 | Cross-check alert-sourced outputs already scoreable today → Dimension D-FLEET T4-D
```
Write boundary section: unchanged (still notebook + signal_queue + improvement-proposals only, per existing D-IMPROVE precedent — Tier-4 adds zero new write targets).

**EDIT-5: `.claude/agents/system-auditor.md`** — single additive line in `description:` noting the Tier-4 pilot dimension exists (minimal, does not restructure the existing frontmatter).

**No `cronConfig.ts` change in Phase 1.** That only happens after §7 graduation criteria are met AND PO approves a NEW, separate proposal — not part of this brief.

---

## Constraints Summary

| Constraint | Source | Status |
|---|---|---|
| Placement = Tier-4 on system-auditor, not a new agent/cron | Task input axis 1 | Enforced §4, verified against `2026-05-27 §6` rejection table |
| All four data sources incorporated | Task input axis 2 | §2a–§2d, with premise correction (§1) and Lane-B prerequisite flagged honestly (§2c) rather than assumed away |
| Output routes through existing gated pipeline, no bypass | Task input axis 3 | §3 — zero new signal type, zero new PO-flow row |
| On-demand pilot first, explicit graduation criteria before cron ask | Task input axis 4 | §5, §7 |
| Resource-budget line-item for the pilot run itself | Binding constraint | §6, using the exact `2026-05-27 §6` template |
| Bolting onto Tier-4 keeps inside the standalone-self-improver rejection | Binding constraint | §4 comparison table |
| No new always-on agent/cron | `project_host_memory_panic`, `2026-05-27 §6` | Verified zero in §4/§6 |
| Reuse Sprint self-improve substrate, no re-litigation | `2026-05-27` brief | §3 reuses verbatim |
| DESIGN ONLY (no code, no `.md` edits in this brief) | Agent role constraint | This brief is the only output |

---

## Signal to Agent-Father

Signal file: `docs/signals/cron-workflow-optimize-tier4-fleet-audit-20260718T192722Z.json`

```json
{
  "from": "agents-architect",
  "to": "agent-father",
  "type": "brief_complete",
  "payload": "docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md",
  "priority": "normal",
  "createdAt": "2026-07-18T19:27:22Z",
  "notes": "Implement Phase 1 only (§8): EDIT-1..EDIT-5, all docs/.md scaffolding for the Tier-4 D-FLEET pilot dimension on system-auditor. Zero cron registration, zero apps/** changes — Phase 0 (tool-usage-stats.json per-agent redesign, §2c) is LANE-B and OUT OF agent-father's zone (apps/mcp-server/**); raise it to po/pm as a SPRINT-XS backlog item for dev-mcp-server citing this brief, do not attempt it directly. After Phase 1 ships, Pilot Run #1 (AUDIT_TIER=4, on-demand) may execute in tool-usage-stats degraded mode per §2c — do not block on Phase 0 landing first. Permanent cron cadence is NOT authorized by this brief — any future ask must pass §7 Graduation Criteria + a fresh PO critique with MEASURED (not estimated) budget numbers."
}
```

---

## Designer Notes (Architect Record)

The four data sources arrived from the task with one factual premise (notebook telemetry uniformity) that did not hold on inspection (2/45, not 46/46) — corrected in §1 rather than silently designed around, and turned into a design feature (tolerant heuristic parsing + a natural first dogfood finding) rather than a blocker. Two of the four sources (§2c tool-usage-stats per-agent breakdown, and the fully-general form of §2d) turned out to require real code changes in `apps/mcp-server/` that agent-father cannot make — these are named explicitly as LANE-B prerequisites routed through the existing dev-team chain, rather than glossed over as "just docs work." The pilot is designed to still be useful and cheap in degraded mode (3-of-4 sources live) rather than gated on that code landing first, while graduation to a permanent cadence explicitly requires all four sources live (G5) before PO is asked for a recurring budget.

Nothing in this design adds a new agent, a new container, or a new always-on cron slot. The single new artifact is a conditional `AUDIT_TIER=4` branch inside an agent (system-auditor) that already exists, already has notebook/signal_queue write access, and already feeds the exact governance pipeline this fleet uses for every other self-detected improvement. That is the concrete, checkable answer to why this stays inside the `2026-05-27` brief's standing rejection of a standalone self-improver.
