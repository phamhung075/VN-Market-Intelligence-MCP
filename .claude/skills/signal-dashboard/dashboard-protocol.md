---
# size-justification: 190L — §WRITE/§READ/§PRUNE are one atomic signal-queue contract;
# all three bodies are always loaded together (split would force 3-file load anyway).
# Protocol body companion to SKILL.md (not a skill file — 120L cap does not apply here).
# Grew from ~80L after orch-state read-discipline annotations were added in last pass.
name: signal-dashboard-protocol
---
# Signal Dashboard — Full Protocol Bodies

> Parent: `.claude/skills/signal-dashboard/SKILL.md`
> Target: `docs/data/orch/orch-state.json` `.signal_queue`
> Write constraint: ALL writes MUST use atomic temp-file-then-rename (§2.3 of orch-state-consolidate.md).

---

## WRITE — append a signal row

```
id     = {from[0:3]}-{YYYYMMDDTHHmmss}   # e.g. tnb-20260517T074033
ts     = ISO-8601 UTC compact             # e.g. 2026-05-17T07:40Z
status = NEW
```

**Atomic write procedure:**
```bash
# 1. Read current state (bash-only pipeline — rule: docs/standards/orch-state-access.md §1)
CURRENT=$(cat docs/data/orch/orch-state.json)

# 2. Build new row JSON
NEW_ROW=$(cat <<'EOF'
{
  "id": "<id>",
  "ts": "<ts>",
  "from": "<from-agent-id>",
  "to": "<to-agent-id>",
  "type": "<signal-type>",
  "summary": "<≤120 chars — NO raw payload>",
  "severity": "<CRITICAL|HIGH|MED|LOW|INFO>",
  "status": "NEW",
  "payload_ref": "<path or null>"
}
EOF
)

# 3. Append row to .signal_queue.rows[] and update _updated_at/_updated_by
UPDATED=$(echo "$CURRENT" | jq \
  --argjson row "$NEW_ROW" \
  '.signal_queue.rows += [$row] | .signal_queue._updated_at = now | .signal_queue._updated_by = "<agent-id>"')

# 4. Atomic write via single gated write path (SSOT-W1-ORCH-APPLY-WRAPPER)
# orch-apply.sh validates the candidate (Zod schema + dup-key + refs) BEFORE rename.
# No separate jq post-write check needed — validation is guaranteed by the wrapper.
printf '%s' "$UPDATED" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
  || { echo "[dashboard/WRITE] ABORTED: orch-apply.sh failed" >&2; exit 1; }

# 5. POST-WRITE READ-BACK (MANDATORY — verify row in .signal_queue.rows[] after write)
ROW_ID=$(echo "$NEW_ROW" | jq -r '.id')
if ! jq --arg id "$ROW_ID" -e '[.signal_queue.rows[] | select(.id == $id)] | length > 0' docs/data/orch/orch-state.json 2>/dev/null; then
  echo "[SIGNAL-ROW-ASSERT] FAIL: row '$ROW_ID' NOT in .signal_queue.rows[]" >&2
  exit 1
fi
```

**Rules:**
- One row per signal. Never batch multiple signals into one row.
- `summary` max 120 chars — NO raw payload data. Truncate + set payload_ref.
- `payload_ref` is a file path (`docs/handoffs/…`, `docs/signals/…`) or `null` if none.
- NEVER overwrite sibling sections (`.head`, `.task_board`, `.narrative`, `.dashboard_section_cache`).

---

## READ — two-phase delta-read (0–400 tokens vs full-file)

**Phase 1 — CHEAP CHECK (stat only, 0 tokens):**
```bash
CURRENT_MTIME=$(stat -f "%Sm" -t "%Y%m%dT%H%M%SZ" docs/data/orch/orch-state.json 2>/dev/null)
[ "$CURRENT_MTIME" == "$LAST_READ_MTIME" ] && { echo "[dashboard] no change — skip"; exit 0; }
# else → Phase 2
```
Skip Phase 1 if no cached last_read_mtime (first run or cowork without cache).

**Phase 2 — JQ FILTER (~200 tokens):**
```bash
# 1. Read .signal_queue.rows[] filtered by to == my-agent-id AND status == "NEW" (bash-only)
STATE=$(cat docs/data/orch/orch-state.json)
NEW_ROWS=$(printf '%s' "$STATE" | jq '[.signal_queue.rows[] | select(.to == $agent and .status == "NEW")]' --arg agent "<my-agent-id>")

# 2. Process each NEW row; if payload_ref != null: read payload file

# 3. Mark each processed row NEW → READ (atomic write via orch-apply.sh)
STATE=$(cat docs/data/orch/orch-state.json)
UPDATED=$(printf '%s' "$STATE" | jq '(.signal_queue.rows[] | select(.to == $agent and .status == "NEW") | .status) |= "READ"' --arg agent "<my-agent-id>")
printf '%s' "$UPDATED" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || { echo "[dashboard/READ] ABORTED" >&2; exit 1; }

# 4. Update cache: {last_read_mtime, row_count} in dashboard_section_cache or spawn-prompt

# 5. Log new signals read
```

If `.signal_queue` absent or orch-state.json missing → log `"[dashboard] skip"`. Never fail-loud.

**Cache contract** (`dashboard_section_cache`): `{section_name, last_mtime, last_row_count}` in orch-state or spawn-prompt. Absent cache = full Phase 2 scan (no error).

---

## PRUNE — MANDATORY after every drain/consume cycle (HSC-7)

**Schema:** `.signal_queue.archive[]` is REMOVED. Terminal rows evict to `docs/data/orch/archive/YYYY-MM.json` (cold).
**Called from:** `docs/agents/dev-team/flow/drain-signals.md` (cowork agents also call after consume).

### Option A — Script (preferred)
Claim commit-mutex, call `bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"` (handles atomic cold+hot), commit both files, release mutex.

### Option B — Inline jq (when script unavailable) — BLOCKED live, 2026-08-26 (tran-ngoc-bau c137)
Live-confirmed: `orch-apply.sh`'s conservation-check hard-rejects any signal_queue row removal
that isn't declared via `ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS` — only `scripts/orch-cold-evict.sh`
sets that env var for its own removals. A manually-built candidate that drops rows aborts with
`row-identity violation ... route it through scripts/orch-cold-evict.sh`. Treat Option B as
dead in practice; use Option A always. Formula kept below for reference only (do not use for a
live write).

Evict: status IN (READ, RESOLVED, SUPERSEDED) AND ts < now-24h. Keep: NEW rows always.

```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CUTOFF_24H=$(($(date -u +%s) - 86400))
STATE=$(cat docs/data/orch/orch-state.json)
UPDATED=$(printf '%s' "$STATE" | jq --arg now "$NOW" --argjson cutoff "$CUTOFF_24H" --arg agent "<my-agent-id>" '
  . as $root | (.signal_queue.rows | map(select((.status | IN("READ","RESOLVED","SUPERSEDED")) and ((try (.ts | fromdateiso8601) catch 0) < $cutoff)))) as $evict |
  (.signal_queue.rows | map(select(.status == "NEW" or not ((.status | IN("READ","RESOLVED","SUPERSEDED")) and ((try (.ts | fromdateiso8601) catch 0) < $cutoff))))) as $keep |
  $root | .signal_queue.rows = $keep | .signal_queue.archive = [] | .signal_queue._updated_at = $now | .signal_queue._updated_by = $agent
')
printf '%s' "$UPDATED" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || { echo "[dashboard/PRUNE] ABORTED" >&2; exit 1; }
git add docs/data/orch/orch-state.json && git commit -m "chore(signals): drain + prune $(date -u +%Y%m%dT%H%M%SZ)" -- docs/data/orch/orch-state.json
```
Cold store: `docs/data/orch/archive/YYYY-MM.json` (append-only). Dedup key: `id`. Mandatory step per HSC-7.
