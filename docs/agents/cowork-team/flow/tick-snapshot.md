<!-- size-justification: 61L — Step 4.7: shared tick snapshot write. Child of main.md.
     FU-TICK-SNAPSHOT-EMIT-DARK hardening: both gateway calls were lifted OUT of the bash fence on the
     premise that "pure bash cannot call MCP". SUPERSEDED — that premise was false when written and is
     false now: scripts/agents-flow/mcp-call.sh (first committed f7d34918d, 2026-07-02) is a sourceable
     bash JSON-RPC-over-curl transport, and scripts/agents-flow/cowork-tick-preflight.sh:71 — the script
     the cron prompt runs ONE STEP EARLIER in this same tick — already sources it. Both calls are back
     inside the fence (FIX-COWORK-TICKSNAPSHOT-STEP47-FALSE-PREMISE-PURE-BASH-CANNOT-CALL-MCP, 2026-08-23).
     EMIT-DARK-RECURRING 2026-06-05: cycle-snapshot-latest.json promotion moved to telemetry.md Step 6. -->

## Step 4.7 — Write shared tick snapshot (L-6, 1968c-P01)

<!-- Writes docs/data/cycle-snapshot-<HH:MM>.json before agent spawn.
     Agents read this file instead of calling get_cycle_bootstrap independently.
     File is pruned after 24 h by this step. Not git-committed (.gitignore).
     cycle-snapshot-latest.json is promoted from this file in telemetry.md Step 6 (EMIT-DARK-RECURRING).
     Fallback: if this step fails, agents fall back to direct get_cycle_bootstrap — zero blocker.
     HARDENED 2026-05-25: All scratch/staging MUST be project-local under docs/data/ — NEVER /tmp or any path outside the repo. -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

**STAGING FILE LOCATIONS (critical hardening):** All scratch must land under `docs/data/`. Never use `/tmp` or paths outside the repo.

**NO AGENT-INTERPRETED PRE-STEP.** Both gateway calls run inside the bash fence below via
`scripts/agents-flow/mcp-call.sh` (contract: `mcp_call <tool_name> <json_args>`, emits
`.result.content[0].text` on stdout, non-zero exit on isError/transport failure). Neither payload
enters the dispatcher's context — only the byte counts do. Measured 2026-08-23: the two payloads are
~15.9KB + ~4.4KB, so the deleted pre-step was burning ~20KB of context on EVERY non-silent tick.
Run from the project root — the fence uses repo-relative paths, same as the preflight script that
already sourced this helper one step earlier in the same tick.

```bash
# Step 4.7 — Fetch both payloads and assemble the cycle snapshot. Pure bash end-to-end.
source scripts/agents-flow/mcp-call.sh   # provides mcp_call(); do NOT reinvent the transport
FILE_TICK=$(date -u +%H:%M)
MC_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.mc.stage"
MACRO_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.macro.stage"
SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"
TMPFILE="${SNAPSHOT_FILE}.tmp"

# Clean up any stale staging files (success or failure)
trap 'rm -f "$MC_STAGE" "$MACRO_STAGE" "$TMPFILE"' EXIT

# Fetch both payloads straight to disk — stdout is redirected, never captured into a shell var
mcp_call get_cycle_bootstrap '{"agent_name":"unified-agent"}' > "$MC_STAGE" \
  || { echo "[cowork-team] tick-snapshot: get_cycle_bootstrap failed — skipping snapshot"; exit 0; }
mcp_call get_macro_snapshot '{}' > "$MACRO_STAGE" \
  || { echo "[cowork-team] tick-snapshot: get_macro_snapshot failed — skipping snapshot"; exit 0; }

# Assemble final snapshot from staged files
# jq --rawfile reads MC_STAGE as a raw string, --slurpfile reads MACRO_STAGE as JSON array
jq -n \
  --arg tick "$FILE_TICK" \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --rawfile market_context_raw "$MC_STAGE" \
  --slurpfile macro_snapshot_raw "$MACRO_STAGE" \
  '{tick: $tick, created_at: $created_at, market_context: ($market_context_raw | fromjson | .market_context // {}), macro_snapshot: $macro_snapshot_raw[0]}' \
  > "$TMPFILE" && mv "$TMPFILE" "$SNAPSHOT_FILE"
find docs/data -maxdepth 1 -name 'cycle-snapshot-*.json' ! -name 'cycle-snapshot-latest.json' -mmin +1440 -delete
```

**On any error in this step** (tool failure, jq error, write failure): log `"[cowork-team] tick-snapshot write failed: <error>"` and continue to Step 4.8. Do NOT block spawns — agents fall back to direct `get_cycle_bootstrap` via the Step -1 miss path in `cycle-bootstrap/SKILL.md`. Staging files are cleaned via trap EXIT in all cases.
