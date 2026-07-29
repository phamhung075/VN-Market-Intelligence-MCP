# Decision Journal — Sprint FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION · pm

**Sprint goal:** Decompose architect brief into atomic dev tasks for implementation dispatch.
**Agent:** pm (router-referred via Supervised-Lane Sweep)
**Started:** 2026-07-29T13:48:12Z
**Completed:** 2026-07-29T13:54:37Z (actual orch-apply stamp)

---

### STEP pm-S1 · pm · 2026-07-29T13:48:12Z–13:54:37Z

**task-id:** FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (parent row, plan_only)

**what-done:** Decomposed architect brief §6 file list into 7 atomic tasks spanning 4 dependency tiers:
- **Tier 1 (foundational):** S1-SCHEMA-SELECTION (schema + rotation_selected() jq)
- **Tier 2 (parallel after Tier 1):** P1A-MAIN-ROTATION (dispatcher chain rewrite) + P2A-DURABLE-DRAIN (drain-signals ordering)
- **Tier 3 (sequential after Tier 2):** P1B-STAMP (stamp script) + MAIN-COMPLETION (Step 1 consumption + integration)
- **Tier 4 (tests after Tier 3):** TEST-FAIRNESS (AC-1/AC-4 extension) + TEST-DURABLE (AC-2 harness + conservation guard + docs)

All 7 tasks marked P0, zone=docs/agents/dev-team/flow/, written to handoff files, and added to orch-state.json backlog[].

**what-considered:**

1. **Decomposition scope:** Chose dependency-aware tiers (not by specialism) per architect brief risk flag: "should be dispatched as ONE sequential unit... every file change coordinates around the same new dev_team_idle_chain key."

2. **Task consolidation:** Bundled AC-2 harness + conservation guard + docs in TEST-DURABLE (logically adjacent, all post-implementation). Kept TEST-FAIRNESS separate (heavier, different testing concern).

3. **AC-3 and AC-4 mapping:** AC-3 is diff verification (byte-proof of unchanged BOUNDED-1 cap), included in P1A acceptance criteria. AC-4 is "same instrument as AC-1" per PO — single TEST-FAIRNESS task (extends devteam-dispatch-gate-satisfiability.sh, no fork).

4. **Part 1/Part 2 inseparability:** Tasks can be developed in parallel within Tier 2 (different files, P1A + P2A), but both must ship together. Tier structure enforces this (both block MAIN-COMPLETION, final tests run against both).

**why-decision:**

Dependency tiers match architect brief's own coordination constraint without over-serialization. Handoff files serve as local decision-logs (developer doesn't re-read the 20-page brief). AC-mapping is literal to PO's ratified criteria.

**why-change:** No change from architect brief §6 or PO ruling — mechanical decomposition only.

**risk-flags:**

- **part-1 regression (HIGH):** Dispatcher chain change affects every idle tick; each test must prove gate FIRES (brief's own bounded1-supervised-lane-report.sh false-green lesson). TEST-FAIRNESS AC-4 is gate to this.
- **head-bottleneck coupling (MEDIUM):** Board note flags `.head` as single-writer slot; all lanes write by FULL REPLACEMENT (load-bearing today). Part 1/2 assume no `.head` schema change (user-gated escalation path if needed).
- **part-2 durability critical (HIGH):** Without it, rotation drops ~80% of signals. Both parts must ship together (Tier structure enforces).
- **test isolation (MEDIUM):** AC-2 harness must use mkdtemp, never live orch-state.json.

---

## RETURN

**DONE:** 7 atomic tasks + handoff files + orch-state updated.

**TASKS:**
- Tier 1: FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION
- Tier 2: FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION, FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN
- Tier 3: FIX-DEVTEAM-IDLE-CHAIN-P1B-STAMP, FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION
- Tier 4: FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS, FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE

**PIPELINE:** continue (dev-team controls next step)
