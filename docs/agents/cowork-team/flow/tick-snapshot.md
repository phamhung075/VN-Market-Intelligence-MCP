<!-- size-justification: 59L — Step 4.7: shared tick snapshot write. Child of main.md.
     FU-TICK-SNAPSHOT-EMIT-DARK hardening: both gateway calls lifted OUT of bash fence (pure bash cannot call MCP).
     Agent pre-computes BOOTSTRAP_RESULT + MACRO_RESULT then writes stage files; bash block is pure bash. -->

## Step 4.7 — Write shared tick snapshot (L-6, 1968c-P01)

<!-- Writes docs/data/cycle-snapshot-<HH:MM>.json before agent spawn.
     Agents read this file instead of calling get_cycle_bootstrap independently.
     File is ephemeral (overwritten each tick). Not git-committed (.gitignore).
     Fallback: if this step fails, agents fall back to direct get_cycle_bootstrap — zero blocker.
     HARDENED 2026-05-25: All scratch/staging MUST be project-local under docs/data/ — NEVER /tmp or any path outside the repo.
     Executor receives MCP tool output as text and stages it to project-local files for jq. -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

**STAGING FILE LOCATIONS (critical hardening):** All scratch must land under `docs/data/`. Never use `/tmp` or paths outside the repo.

**Pre-step (agent-interpreted, before bash):** call the gateway to get both payloads, then write stage files:

```
FILE_TICK_PRE = shell: date -u +%H:%M
MC_STAGE_PRE  = "docs/data/.cycle-snapshot-" + FILE_TICK_PRE + ".mc.stage"
MACRO_STAGE_PRE = "docs/data/.cycle-snapshot-" + FILE_TICK_PRE + ".macro.stage"

BOOTSTRAP_RESULT = call_tool(server="vn-market", tool="get_cycle_bootstrap",
  arguments={"agent_name": "unified-agent"})
# Write raw JSON string to MC_STAGE_PRE (agent writes file directly)
write_file(MC_STAGE_PRE, BOOTSTRAP_RESULT)

MACRO_RESULT = call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
# Write raw JSON string to MACRO_STAGE_PRE (agent writes file directly)
write_file(MACRO_STAGE_PRE, MACRO_RESULT)
# On any tool failure or write failure: log "[cowork-team] tick-snapshot pre-step failed: <error>" and skip bash block entirely → continue to Step 4.8.
```

```bash
# Step 4.7 — Assemble cycle snapshot from pre-staged files
# MC_STAGE and MACRO_STAGE were written by the agent pre-step above (never inline MCP call)
FILE_TICK=$(date -u +%H:%M)
MC_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.mc.stage"
MACRO_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.macro.stage"
SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"
TMPFILE="${SNAPSHOT_FILE}.tmp"

# Clean up any stale staging files (success or failure)
trap "rm -f \"$MC_STAGE\" \"$MACRO_STAGE\"" EXIT

# Assemble final snapshot from staged files
# jq --rawfile reads MC_STAGE as a raw string, --slurpfile reads MACRO_STAGE as JSON array
jq -n \
  --arg tick "$FILE_TICK" \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --rawfile market_context_raw "$MC_STAGE" \
  --slurpfile macro_snapshot_raw "$MACRO_STAGE" \
  '{tick: $tick, created_at: $created_at, market_context: ($market_context_raw | fromjson | .market_context // {}), macro_snapshot: $macro_snapshot_raw[0]}' \
  > "$TMPFILE" && mv "$TMPFILE" "$SNAPSHOT_FILE"
```

**On any error in this step** (tool failure, jq error, write failure): log `"[cowork-team] tick-snapshot write failed: <error>"` and continue to Step 4.8. Do NOT block spawns — agents fall back to direct `get_cycle_bootstrap` via the Step -1 miss path in `cycle-bootstrap/SKILL.md`. Staging files are cleaned via trap EXIT in all cases.
