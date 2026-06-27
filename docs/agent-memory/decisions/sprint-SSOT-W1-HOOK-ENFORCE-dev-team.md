# Decision Journal — SSOT-W1-HOOK-ENFORCE dispatch (dev-team router)

**task-id:** SSOT-W1-HOOK-ENFORCE
**date:** 2026-06-27T21:14Z
**actor:** dev-team router
**outcome:** RE-QUEUED (dispatch failed mid-flight; reverted to known-good)

## What happened
PO BATCH (po aec6630260aa140c5) approved SSOT-W1-HOOK-ENFORCE; router RAW-verified (rank-3, dep ZOD-SCHEMA-MODEL=DONE, brief present, WIP=0) and dispatched dev-mcp-server (a9a65f) at 20:58Z. Worker ran 54 tool-uses / ~11min then **died on a terminal "tool call could not be parsed" error** — no STATUS return, no commit.

## RAW-probe of what it left (uncommitted)
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` — MODIFIED (32-line diff): dead `finally{}` → `process.on('exit')` temp-cleanup (correct: finally never runs under `process.exit` in Bun/Node); bun/validator-spawn-failure allow-through → **block-hard**; added catch-all block. Syntax-OK, brief-aligned, but **zero tests run, unverified**.
- `scripts/agents-flow/orch-state-hook.test.mjs` — UNTRACKED (the QA-5 test, never committed/run-proven).
- `scripts/agents-flow/orch-schema-live-probe.mjs` — UNTRACKED probe helper.

## Decision + rationale
Reverted `orch-state-hook-prewrite.mjs` to known-good HEAD. This is a **live SSOT-guarding PreToolUse hook**; the untested change alters blocking semantics such that if `bun` were absent from a spawned agent's PATH, **every orch-state Write would block** — a potential system-wide wedge. Router does not ship unverified hook semantics, and router-only discipline means I verify/route, not reconstruct+bless code. Left the two untracked artifacts in place (not router-authored; head-start for re-dispatch) and surfaced them in the board note.

## Continuation contract for re-dispatch
Reproduce the 3 hardening changes **with a passing QA-5 block-proof** (Write of bad status e.g. `PARKED` → BLOCKED + deny reason + never hits disk), **verify bun-missing block-hard cannot wedge legit orch-apply writes**, evaluate/reuse the untracked test, commit atomically, return STATUS. Parse-error likely transient — fresh re-dispatch advised next tick.
