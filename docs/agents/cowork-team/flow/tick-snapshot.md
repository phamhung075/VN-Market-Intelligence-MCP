<!-- size-justification: 55L — Step 4.7: shared tick snapshot write. Child of main.md. -->

## Step 4.7 — Write shared tick snapshot (L-6, 1968c-P01)

<!-- Writes docs/data/cycle-snapshot-<HH:MM>.json before agent spawn.
     Agents read this file instead of calling get_cycle_bootstrap independently.
     File is ephemeral (overwritten each tick). Not git-committed (.gitignore).
     Fallback: if this step fails, agents fall back to direct get_cycle_bootstrap — zero blocker.
     HARDENED 2026-05-25: All scratch/staging MUST be project-local under docs/data/ — NEVER /tmp or any path outside the repo.
     Executor receives MCP tool output as text and stages it to project-local files for jq. -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

**STAGING FILE LOCATIONS (critical hardening):** All scratch must land under `docs/data/`. Never use `/tmp` or paths outside the repo.

```bash
# Resolve tick key (floor-15min, same math as nominal_tick above)
FILE_TICK=$(date -u +%H:%M)

# Staging file paths — project-local only, never /tmp
MC_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.mc.stage"
MACRO_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.macro.stage"
SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"
TMPFILE="${SNAPSHOT_FILE}.tmp"

# Clean up any stale staging files (success or failure)
trap "rm -f \"$MC_STAGE\" \"$MACRO_STAGE\"" EXIT

# Call get_cycle_bootstrap once for the snapshot payload
# Executor receives as conversation text; stage to MC_STAGE for jq --rawfile
BOOTSTRAP_RESULT=$(call_tool(server="vn-market", tool="get_cycle_bootstrap",
  arguments={"agent_name": "unified-agent"}))
echo "$BOOTSTRAP_RESULT" > "$MC_STAGE"

# Call get_macro_snapshot once for the macro payload
# Executor receives as conversation text; stage to MACRO_STAGE for jq --slurpfile
MACRO_RESULT=$(call_tool(server="vn-market", tool="get_macro_snapshot", arguments={}))
echo "$MACRO_RESULT" > "$MACRO_STAGE"

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
