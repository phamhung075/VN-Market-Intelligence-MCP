# TASK_FIX-DRAINESC-SEVERITY-RECURRENCE-GATE — Handoff

**Origin:** router-dispatched SPRINT-S, PO-minted `FIX-DRAINESC-SEVERITY-RECURRENCE-GATE`
(`origin_signal: router-esc4-fu-drainesc-severity-gate-20260704T0016Z`).

## [Architect] Brownfield Findings

- **Zone:** `cross-service` (`scripts/` + `docs/agents/*.md` — no `apps/` code path; matches
  `docs/data/system-map.json` `.project.zones[]` id=`cross-service`, path=`scripts/`,
  specialist=`developer`). Single zone, no split needed.
- **Verified paths:**
  - `docs/agents/dev-team/flow/drain-esc-dispatch.md:31-38` (Step 1 payload extraction — missing
    `severity` read), `:40-55` (Step 2 mutex — insertion point starts right after), `:57-80`
    (Step 3-6 spawn/release/mark — GATE-A/B insert before Step 3, Terminal Exit reuses Step 5/6
    release+mark pattern)
  - `scripts/agents-flow/drain-signals.js:1-18` (requires + ROOT/SIG/PROC/DB/NOW/PROCESSED_BY
    consts — insertion point for the new CLI subcommand, right after line 18, before the existing
    line 20 DB-availability gate), `:32` (existing `sqlEsc()` — pattern to mirror, not relocate)
  - `docs/agents/bctc-analyst/flow/main.md:105-113` (signal_row shape — confirms `severity` is a
    top-level field, sibling of `payload`, currently unread by the dispatcher)
  - `docs/agents/bctc-analyst/flow/esc-4-nonop-heuristic.md` (the already-shipped
    `ESC4-HEURISTIC-FIX-TAXBASIS-SOE` severity downgrade this gate must honor, not re-escalate)
  - `apps/mcp-server/src/infrastructure/orchStateSchema.ts:40-64` (`StatusEnum`/`TERMINAL_SET` —
    canonical non-terminal predicate for GATE-B Tier 1), `:172-181` (`SignalSeverityEnum` —
    canonical severity vocabulary for GATE-A)
  - `docs/signals/signals.db` `signals_processed` table (live-queried: JSON1 `json_extract`
    confirmed working on the deployed sqlite3 3.43.2 build; real rows for
    `MBB|Q1-2026|ESC-2` (2 rows, byte-identical `context`) and `GVR|Q1-2026|ESC-4` (4 rows,
    **`context` JSON keys drift every cycle** — load-bearing finding, see brief §1)
  - `docs/data/orch/orch-state.json` `.task_board.backlog[]` — `REFLOW-MBB-Q1-2026`
    (`status: "BLOCKED"`, non-terminal) already live-tracks the exact MBB recurrence this task
    must gate on; proves the `REFLOW-<ticker>-<quarter>` convention is already in production use
    by PO, not a hypothetical.
- **Reuse patterns:**
  - GATE-B Tier 1 (board-row-exists): reuse the EXISTING `REFLOW-<ticker>-<quarter>` task-board
    convention PO already uses manually — zero new state.
  - GATE-B Tier 2 (recurrence-count bootstrap net): reuse the EXISTING `signals_processed` table
    (already populated by `drain-signals.js` §0a-1) via a read-only `json_extract` query — zero
    schema change, zero new file.
  - GATE-A severity vocabulary: reuse `SignalSeverityEnum` (`orchStateSchema.ts:172`), not a new
    ad hoc enum.
  - Terminal-status predicate: reuse `TERMINAL_SET` (`orchStateSchema.ts:58-64`) verbatim rather
    than re-deriving a parallel list.
- **Design decisions:**
  - Full design + exact pseudocode/jq filters/JS subcommand →
    `docs/architecture-briefs/2026-07-04-drainesc-severity-recurrence-gate.md`
  - GATE-B state-location: **two-tier** (board-row-exists PRIMARY, self-healing; signals_processed
    count-based bootstrap net SECONDARY) — cheaper than either single option framed in the task
    ticket, and avoids a "stuck forever after reflow" risk a pure count-based design would have.
  - Layer: both changes are `interface`-adjacent agent-flow pseudocode + a small infra CLI helper
    (`scripts/agents-flow/`) — no domain/application/infrastructure DDD layer in `apps/` is touched.
    No DDD violation risk (confirmed: zero `apps/` files in scope).
  - Dependency injection: n/a (flow-doc pseudocode, not application code).
- **Scan clean:** true ✓ (both files read in full; live signals.db + orch-state.json queried
  directly, not assumed)

**Standard Detection:** BUG-FIX / REFACTOR (in-zone, no new primitives) → `BUILD-STANDARD:
not-applicable`.

## RETURN
DONE: Technical design complete, brownfield findings written to
docs/handoffs/TASK_FIX-DRAINESC-SEVERITY-RECURRENCE-GATE.md
ZONE: cross-service
NEXT: pm | break design into atomic dev task(s) (single unit — both files land together per
brief §5) and create developer handoff. Note for PM: precedent
(`docs/agent-memory/decisions/po-decisions.md`) routed a prior `scripts/agents-flow/` drain-helper
task to `dev-mcp-server` (established owner of this directory) rather than generic `developer`
despite zone=cross-service — PM's call on final dev-agent routing.
HANDOFF: docs/handoffs/TASK_FIX-DRAINESC-SEVERITY-RECURRENCE-GATE.md
PIPELINE: continue
