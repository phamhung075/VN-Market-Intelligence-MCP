<!-- size-justification: 10L — Step 4.8 stub. Emit relocated to telemetry.md Step 6.0 via call_tool emit_pressure_state (EMIT-DARK-v2 Option C, 2026-06-05). Child of main.md. -->

## Step 4.8 — Pressure-state emit (NO-OP)

**SUPERSEDED:** `docs/data/pressure-state.json` and `docs/data/cycle-snapshot-latest.json` are written in telemetry.md Step 6.0 via `call_tool(server="vn-market", tool="emit_pressure_state", ...)`. The tool is invoked directly by the dispatcher (proven execution path), computes shell-only fields server-side, and is un-skippable and independent of the SILENT guard (EMIT-DARK-v2 Option C).

**This step is a no-op.** Proceed immediately to Step 5.
