# TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES

**Type:** TASK · **Priority:** high · **Size:** S · **Zone:** `apps/mcp-server/src/infrastructure/`
**Parent:** `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (architect brief
`docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md`)
**Decomposed by:** pm, commit `6617edbd4` — task 1 of 5 (tasks 2-5 depend on this one, not yet dispatched)

## Task

Schema + utility jq functions for the 5-consumer aged round-robin (replaces the
fixed-priority BOUNDED-1 -> SLS -> RLC -> QA-Drain -> Step1 sequential
fall-through that starves everything behind whichever lane claims first):

1. `dev_team_idle_chain: z.record(z.unknown()).optional()` on `OrchStateSchema`
   root (architect brief §2.1) — same precedent as `narrative`/
   `dashboard_section_cache`/`session_handoff_status`.
2. `rotation_selected($doc)` in `scripts/lib/devteam-eligibility.jq` (architect
   brief §2.2) — selects, among the 5 idle-path consumers
   (bounded1/sls/rlc/qa_drain/step1_triage), the one with the oldest
   `last_served_tick` (missing/null defaults to the epoch).
3. NEW `scripts/devteam-idle-chain-stamp.jq` (architect brief §2.3) — per-tick
   stamp-update writer, run after the selected consumer's block executes.

**Constraint:** PLAN-ONLY for dev-team/flow docs — no edits to
`docs/agents/dev-team/flow/main.md` or `drain-signals.md` (that is task 2/3).

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** `apps/mcp-server/src/infrastructure/` (+ `scripts/` per the task's
  own `files` list — schema-backing jq utilities, no dev-team/flow doc touch)
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/orchStateSchema.ts:352-358` — added
    `dev_team_idle_chain: z.record(z.unknown()).optional()` to `OrchStateSchema`
    root (`.strict()` object), alphabetically between `decision_journal` and
    `head`.
  - `scripts/lib/devteam-eligibility.jq` — appended `rotation_selected($doc)`
    at end of file (verbatim architect-brief §2.2 algorithm: default missing
    stamps to `"1970-01-01T00:00:00Z"`, `sort_by(.stamp)`, take `.[0].id`).
- **Files created:**
  - `scripts/devteam-idle-chain-stamp.jq` — per-tick stamp writer. Takes
    `--arg now` / `--arg c` (consumer id). Sets
    `.dev_team_idle_chain.rotation[$c].last_served_tick = $now` +
    `_updated_at`/`_updated_by`. Self-healing on the bootstrap tick (jq `=`
    creates missing intermediate objects). Guards `$c` against the fixed
    5-id set — unrecognized id is a no-op (refuses to write a garbage
    rotation key).
- **Tests written:** none new (schema-only additive change + jq utilities;
  existing `orchStateSchema.test.ts` (104 tests) already exercises the
  `.strict()` root-key enumeration and continues to pass unchanged). jq
  functions verified via `jq -n` scenario probes (see Evidence below) —
  bootstrap/absent-key default, all-null tie-break, mid-rotation selection,
  and a full 5-tick cycle asserting each of the 5 ids is selected exactly
  once in fixed declared order.
- **Git commits:** (pending — see RETURN)
- **Type check:** clean (`bun tsc --noEmit`, 0 errors)
- **bun test:** targeted `orchStateSchema.test.ts` 104/104 pass, 0 fail.
  Full-suite `bun test`: 14885 pass / 40 skip / 55 fail / 1238 files (564s) —
  matches the standing, tracked `FIX-MCP-SUITE-HEALTH-BASELINE` red
  (pinned CANONICAL reading, `docs/policies/dev-standards.md:610`: targeted/
  merge-gate suite governs, not literal full-suite 0-fail — band has drifted
  40→59 across recent sibling tasks; this run's 55 sits inside it). Confirmed
  unrelated: none of the 55 failing tests reference
  `orchStateSchema`/`dev_team_idle_chain`/`devteam-eligibility` (failures are
  in `vnstock` stores, VPS proxy health, news polling, insider transactions,
  backtest runs, `_deprecated/1302-technical-indicators.test.ts` — all
  pre-existing, disjoint from this diff's file set).
- **Tool count:** 184 — matches pre-task baseline (no new tool; schema-only).
- **Scheduler count:** 88 cron jobs — matches pre-task baseline (no new
  cron; schema-only).
- **Docs updated:** NONE — `docs/architecture/microservice/mcp-server/
  infrastructure.md` does not separately enumerate `OrchStateSchema` root
  keys (the schema file's own header comments are the SSOT for this;
  `narrative`/`dashboard_section_cache`/`session_handoff_status` — the
  precedent this addition follows — are likewise undocumented there).
- **Graphify:** skipped (no docs impacted).

### Evidence — jq scenario probes (run from repo root)

```
$ jq -n --arg now "2026-07-29T06:00:00Z" 'include "scripts/lib/devteam-eligibility"; {} as $doc | $doc | rotation_selected($doc)'
"bounded1"   # bootstrap tick, dev_team_idle_chain entirely absent — self-heals to fixed declared order

$ # 5-tick cycle simulation (stamp after each selection) -> each id exactly once:
["bounded1","sls","rlc","qa_drain","step1_triage"]

$ jq -n --arg now "2026-07-29T06:00:00Z" --arg c "qa_drain" -f scripts/devteam-idle-chain-stamp.jq
{
  "dev_team_idle_chain": {
    "rotation": { "qa_drain": { "last_served_tick": "2026-07-29T06:00:00Z" } },
    "_updated_at": "2026-07-29T06:00:00Z",
    "_updated_by": "dev-team"
  }
}

$ echo '{"foo":"bar"}' | jq --arg now "2026-07-29T06:00:00Z" --arg c "not_a_real_consumer" -f scripts/devteam-idle-chain-stamp.jq
{"foo":"bar"}   # unrecognized consumer id -> refused, no-op
```

### Evidence — Zod schema probe

```
OrchStateSchema.safeParse({..., dev_team_idle_chain: { rotation: {...5 consumers...}, pending_triage_inbox: [] } })  -> PASS
OrchStateSchema.safeParse({...})  # key absent entirely -> PASS (optional, self-healing)
OrchStateSchema.safeParse({..., dev_team_idle_chain: { anything: 123, nested: {...} } })  -> PASS (z.record(z.unknown()) looseness)
bun scripts/orch-validate.mjs  -> Stage 0 + Stage 1 PASS (live orch-state.json still valid post-schema-change)
```

### Evidence — Gate 2 (tool-suite integrity)

```
$ curl -s http://localhost:3099/health  # DB_PATH=:memory:, fresh boot
{"status":"ok","name":"vn-market","version":"1.0.0","toolCount":184,"sessions":0,"uptime":6.01}
$ curl -s http://localhost:3099/api/bctc-inspect | head -c 200      # 200, HTML
$ curl -s http://localhost:3099/dashboards/news-fetch/ | head -c 200 # 200, HTML
```

## Scope note

This task's `files` list (`orchStateSchema.ts`, `devteam-eligibility.jq`,
`devteam-idle-chain-stamp.jq`) matched exactly — no other files touched.
`docs/agents/dev-team/flow/main.md` and `drain-signals.md` were NOT edited
(plan_only constraint honored — `git status` confirms both untouched).
Tasks 2-5 (main.md rotation-dispatch wiring, drain-signals.md durable-append
ordering, `scripts/agents-flow/drain-signals.js`, `orch-conservation-check.mjs`
widening, test coverage) remain NOT dispatched, per the parent decomposition.
