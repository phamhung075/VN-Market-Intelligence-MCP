---
task_id: FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE
parent: FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION
owner: developer
size: M
zone: cross-service/
branch: none — NO BRANCHES, all work on `main` (project CLAUDE.md rule)
depends_on: []
blocks: []
---

# FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE — spawn-fanout.md Step 5.3 two-arm gate + last-fired.md comment

## §1-tldr

`spawn-fanout.md` Step 5.3 is the ONE exogenous, load-bearing observer against narrate-not-execute
spawns. Today it is a 6-string positive match on ONE narration shape (router-latch vocabulary) —
proven insufficient by a confabulated first-person completion report that carried no marker at
all. You are rewriting Step 5.3 into a **two-arm gate**: Arm 1 (cheap marker fast-path, advisory
only) + Arm 2 (load-bearing, per-slot `delivery_proof` artifact-delta conjunction check, driven by
a NEW script `scripts/agents-flow/cowork-delivery-proof-probe.sh`). You are also generalizing one
sentence in `last-fired.md`. **Full design of record:**
`docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-gate-artifact-conjunction-design.md`
— read it in full before writing any code; this handoff summarizes it, it does not replace it.

---

## §2-hard-constraints-read-first

- **Arm 2 SHIPS IN SHADOW MODE FIRST.** Compute the verdict, log it, `send_telegram(channel="bug")`
  on FAIL — but do **NOT** exclude the slot from `WON_SLOTS` yet. Run for at least one full cadence
  cycle across all guaranteed slots before flipping to enforcing. This is deliberate risk
  management (brief §0) — do not "simplify" by shipping enforcing-mode directly.
- **Arm 2 is a CONJUNCTION, never OR.** Every declared `delivery_proof` kind for a slot must pass.
  A single-plane check (e.g. only `notebook`) falsely PASSed a genuine partial write in the
  occurrence that motivated this row (synthesis JSON landed, notebook did not) — see brief §1.
- **A slot missing `delivery_proof` entirely must FAIL LOUD**, not silently skip the gate. This
  mirrors the existing `trigger_prompt`/`flow_path` mismatch refusal already in Step 5.2.
- Reuse, do not reimplement: the `published_marker` probe kind reuses `TASK-COWORK-CATCHUP-6`
  (FR-7)'s own `task_list_held(task_kind="cowork-slot")` read verbatim.
- Do **not** hand-roll Arm 2 inline in the flow doc — implement it as
  `scripts/agents-flow/cowork-delivery-proof-probe.sh`, a script of record (brief §2.2 — two prior
  silent-corruption incidents in this exact file already trace to ad-hoc inline schedule-mutation
  logic; same lesson applies here).
- `last-fired.md` gets **ONLY** the one-sentence AC-P1-7-4 generalization (brief §4) — zero write-
  mechanism change. Do not touch Step 5b's write semantics; that surface belongs to
  `TASK-COWORK-CATCHUP-6`/FR-7 (still BACKLOG, a different row — do not duplicate or preempt it).
- **Explicitly out of scope, already rejected on this row:** no new in-flow "confirm you made N
  tool calls" self-check (vacuous reader-is-writer). No fleet-wide `docs/agents/*/flow/main.md`
  sweep. No edits to `.claude/agents/*.md`.

---

## §3-design

### Arm 1 (cheap, advisory only — NOT load-bearing)

Extend `OFFFLOW_MARKERS` with the shapes observed this week: a `STATUS:` token not in the slot
agent's own RETURN enum (e.g. `PARTIAL_EXIT`), and the literal phrases `"next actions (for the
LLM"` / `"would require"` / `"would normally follow"`. Purely a fast/cheap telemetry classifier —
never the sole reason a slot is excluded from `WON_SLOTS`, and absence of a marker is never
evidence of a real completion (occurrence 3 proved this). Note: live Step 5.3 has already grown a
`>=2-DISTINCT-marker` requirement and an identity-preamble mitigation since this brief was written
(commits `add3f13a1`, `4ae46cedc`, plus the 2026-08-23 timing-contract work) — read the CURRENT
Step 5.3 in full before editing; do not clobber that work, extend it.

### Arm 2 (load-bearing) — per-slot artifact-delta conjunction

Runs unconditionally for every slot in the batch, immediately after Arm 1, over the SAME window
Arm 1 already has (`since_ts` = Step 5.2 dispatch time, `until_ts` = now, bounded not open-ended).

For each slot, read its `delivery_proof` declaration from `cowork-schedule.json` (schema landed by
the sibling task `FIX-COWORK-DELPROOF-2-SCHEDULE-SCHEMA`, agent-father) and evaluate every declared
kind — ALL must pass:

- **5 native planes** (`notebook`, `commit`, `signal_queue`, `ledger`, `extra_file`): invoke
  `scripts/audits/detect-analysis-only-exit.sh --agent-id <slot.agent_id> --since-ts <since_ts>
  --until-ts <until_ts>` plus the relevant path flags, **and the caller-supplied mandatory-plane
  subset knob that `FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES`
  already shipped (DONE_VERIFIED — confirm its exact CLI knob name at the script before wiring;
  do not infer it).** `rc=1` on any slot with a non-empty declared subset → Arm 2 FAIL for that slot.
- **2 NEW kinds, this task implements them:**
  - `published_marker` — probe `task_list_held(task_kind="cowork-slot")`, prefix-match
    `published:<slot_id>:` within the window. Reuse `TASK-COWORK-CATCHUP-6`/FR-7's exact
    read/logic — do not write a second implementation.
  - `db_probe` — caller-declared MCP tool name + before/after row-count comparison (e.g.
    `refine_bctc_md`: `get_bctc_pending_refine`/`get_bctc_refined` delta for the report the slot
    worked). Required because `refine_bctc_md` has no notebook file at all.

**On Arm 2 FAIL** (once out of shadow mode): same treatment as an off-flow router-latch hit — log,
`send_telegram(channel="bug")`, add to `errors[]` with error code `delivery_proof_gate_failed`
(kept distinct from `offflow_router_latch_detected` so telemetry shows which arm caught it), remove
the slot from `WON_SLOTS` before Step 5b runs. Conservative under-suppress — retries next due tick,
same posture as the existing AC-P1-7-3/AC-P1-7-4 contract.

### last-fired.md — one sentence only

`AC-P1-7-4`'s existing note ("a slot Step 5.3 flags as off-flow-router-latch-detected is already
removed from `WON_SLOTS` before this step runs") generalizes to cover either arm
(`off-flow-router-latch OR delivery-proof-gate-failed`). That is the entire change to this file.

---

## §4-files

- `docs/agents/cowork-team/flow/spawn-fanout.md` — Step 5.3 two-arm rewrite. Read the CURRENT
  (live) Step 5.3 first (it has grown since this brief was written — 2-distinct-marker requirement,
  identity preamble, timing contract) and extend it, do not overwrite.
- `docs/agents/cowork-team/flow/last-fired.md` — one-sentence AC-P1-7-4 generalization only.
- NEW `scripts/agents-flow/cowork-delivery-proof-probe.sh` — Arm 2's per-slot script of record,
  returns a single verdict + which declared kind(s) failed.
- NEW regression fixture, mirroring `detect-analysis-only-exit.test.sh`'s pattern, against
  disposable scratch repos (never the live repo): positive control (all declared planes real →
  PASS), RED-1 (one declared plane missing, others real → FAIL — guards the conjunction), opt-out
  control (`opt_out:true` → always PASS/skip, never gates).

**Do NOT touch:** `docs/data/cowork-schedule.json`'s `delivery_proof` field population (sibling
task, agent-father — you may read it, must not write it), Step 5b's write mechanism in
`last-fired.md` beyond the one sentence, `.claude/agents/*.md`.

---

## §5-acceptance-criteria

- [ ] **AC-1** Arm 1 extended with the 3 new shapes named in §3, still purely advisory (verify: a
      fixture with an Arm-1 marker but a real Arm-2 PASS is NOT excluded from `WON_SLOTS`).
- [ ] **AC-2** Arm 2 implemented as `scripts/agents-flow/cowork-delivery-proof-probe.sh`, callable
      per-slot, conjunction semantics proven by the RED-1 fixture (one missing plane → FAIL even
      when every other declared plane is real).
- [ ] **AC-3** `published_marker` and `db_probe` kinds implemented; `published_marker` demonstrably
      reuses FR-7's read (same query shape, not a parallel implementation — cite the reused
      function/query in the Implementation Record).
- [ ] **AC-4** A slot with NO `delivery_proof` field fails loud (visible refusal + schedule flagged
      defective), never silently ungated.
- [ ] **AC-5** SHADOW MODE confirmed: Arm 2 verdict computed + logged + telegrammed on FAIL, but
      `WON_SLOTS` exclusion code path is present but gated behind a shadow/enforcing switch that
      defaults to shadow. Do not flip to enforcing in this task.
- [ ] **AC-6** `last-fired.md` diff is exactly the one-sentence generalization — paste the full
      diff in the Implementation Record; anything beyond one sentence changed is a scope violation.
- [ ] **AC-7** Regression suite green: positive control, RED-1, opt-out control all pass.
- [ ] **AC-8** No edit to `docs/data/cowork-schedule.json`, `.claude/agents/*.md`, or any
      `docs/agents/*/flow/main.md` outside `cowork-team`.

---

## §6-context

- Architecture brief (full reasoning, rejected alternatives, sequencing rationale):
  `docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-gate-artifact-conjunction-design.md`
- Sibling task (same parent, independent file, coordinate merge but do not block on it — Arm 2's
  fail-loud-on-missing-declaration default is safe to land before the schema exists, as long as it
  stays in shadow mode): `FIX-COWORK-DELPROOF-2-SCHEDULE-SCHEMA` (agent-father).
- Parent's dependency `FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES`
  is DONE_VERIFIED (re-verified live 2026-08-24T17:57Z) — no longer a blocker, but its exact CLI
  contract (mandatory-plane subset knob) is what you must read before wiring the 5 native planes.

## §7-closure

- [ ] All ACs verified raw (real command output pasted into the Implementation Record)
- [ ] One commit, explicit pathspec
- [ ] Append `## §N-impl` Implementation Record to this file
- [ ] `NEXT: qa`
