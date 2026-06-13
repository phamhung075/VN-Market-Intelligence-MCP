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
# 1. Read current state — NEVER cat full file to model context; bash-only pipeline is safe here
#    (This cat runs inside a bash write-path pipeline, not surfaced to the model.
#     Rule: docs/standards/orch-state-access.md §1)
CURRENT=$(cat docs/data/orch/orch-state.json) # bash-only pipeline — not surfaced to model

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

# 4. Atomic write
TMP=$(mktemp docs/data/orch/.orch-state-tmp-XXXXXX.json)
echo "$UPDATED" > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json

# 5. Validate
jq . docs/data/orch/orch-state.json > /dev/null || echo "ERROR: orch-state.json invalid after write"
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
# Compare to caller's stored last_read_mtime (from dashboard_section_cache or spawn-prompt)

if [ "$CURRENT_MTIME" == "$LAST_READ_MTIME" ]; then
  # → SKIP READ entirely
  # → log "[dashboard] no change since $LAST_READ_MTIME — skip"
  # → 0 tokens consumed; DONE
else
  # → Phase 2
fi
```

If no stored cache (first run, or cowork agent with no cache) → skip Phase 1, go straight to Phase 2.

**Phase 2 — JQ FILTER (~200 tokens):**
```bash
# 1. Read .signal_queue.rows[] filtered by to == my-agent-id AND status == "NEW"
STATE=$(cat docs/data/orch/orch-state.json) # bash-only pipeline — not surfaced to model (rule: docs/standards/orch-state-access.md §1)
NEW_ROWS=$(printf '%s' "$STATE" | jq \
  --arg agent "<my-agent-id>" \
  '[.signal_queue.rows[] | select(.to == $agent and .status == "NEW")]')

# 2. For each NEW row:
#    a. If payload_ref != null: Read payload file → add to context
#    b. Note: type + summary → route to relevant flow step

# 3. Mark each processed row NEW → READ (atomic write — modify only status of matched rows)
STATE=$(cat docs/data/orch/orch-state.json) # bash-only pipeline — not surfaced to model (rule: docs/standards/orch-state-access.md §1)
UPDATED=$(printf '%s' "$STATE" | jq \
  --arg agent "<my-agent-id>" \
  '(.signal_queue.rows[] | select(.to == $agent and .status == "NEW") | .status) |= "READ"')
TMP=$(mktemp docs/data/orch/.orch-state-tmp-XXXXXX.json)
echo "$UPDATED" > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json

# 4. Update stored cache: {last_read_mtime, row_count}
#    (in .dashboard_section_cache for dev-team; in spawn-prompt for cowork agents)

# 5. Log: "[dashboard] {N} new signals read: {id1}, {id2}, ..."
```

If `.signal_queue` absent → log `"[dashboard] No signal_queue in orch-state.json — skip"`.
If orch-state.json missing → log `"[dashboard] orch-state.json not found — skip"`. Never fail-loud.

**Cache contract (`dashboard_section_cache`):**
```json
{
  "section_name":   "po",
  "last_mtime":     "2026-06-01T08:09:00Z",
  "last_row_count": 12
}
```
- Stored in `docs/data/orch/orch-state.json` `.dashboard_section_cache` for dev-team.
- Passed via spawn-prompt field for cowork agents (optional — absent = Phase 2 standalone, no error).
- `last_row_count` is updated after each read.
- Absent cache = fall back to full Phase 2 scan. Zero breaking change.

---

## PRUNE — MANDATORY after every drain/consume cycle

**Called from:** `docs/agents/dev-team/flow/drain-signals.md` after row consumption.
Cowork equivalents must also call PRUNE after their consume step.

```bash
# 1. Identify rows to archive:
#    - status == "RESOLVED" (immediate — no aging required)
#    - status == "READ" AND ts < now() - 48h
# 2. Move them to .signal_queue.archive[] (atomic write)
# 3. Remove archived rows from .signal_queue.rows[]
# 4. Update .signal_queue._updated_at + ._updated_by
# 5. Enforce max 200 rows in .signal_queue.rows[] — prune oldest resolved/read first if at cap (RISK-6 guard)

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE=$(cat docs/data/orch/orch-state.json) # bash-only pipeline — not surfaced to model (rule: docs/standards/orch-state-access.md §1)
UPDATED=$(printf '%s' "$STATE" | jq \
  --arg now "$NOW" \
  --arg agent "<my-agent-id>" '
  . as $root |
  # Rows to archive: RESOLVED, or READ + older than 48h
  (.signal_queue.rows | map(select(
    .status == "RESOLVED" or
    (.status == "READ" and (.ts | fromdateiso8601) < (now - 172800))
  ))) as $to_archive |
  # Rows to keep: everything else (including NEW — never prune NEW)
  (.signal_queue.rows | map(select(
    .status != "RESOLVED" and
    not (.status == "READ" and (.ts | fromdateiso8601) < (now - 172800))
  ))) as $to_keep |
  $root |
  .signal_queue.rows = $to_keep |
  .signal_queue.archive += $to_archive |
  .signal_queue._updated_at = $now |
  .signal_queue._updated_by = $agent
')
TMP=$(mktemp docs/data/orch/.orch-state-tmp-XXXXXX.json)
echo "$UPDATED" > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json
jq . docs/data/orch/orch-state.json > /dev/null || echo "ERROR: orch-state.json invalid after prune"

# 6. Commit
git add docs/data/orch/orch-state.json
git commit -m "chore(signals): drain + prune $(date -u +%Y%m%dT%H%M%SZ)"
```

Prune thresholds:
- **RESOLVED** rows → moved to archive immediately
- **READ** rows → moved to archive after 48h aging (`ts < now() - 48h`)
- **NEW** rows → NEVER pruned

Archive: `.signal_queue.archive[]` — append-only log of pruned rows. Never read back for routing.
Dedup key: `id` (unique per signal).

**This step is mandatory, not optional.** `drain-signals.md` calls it after every consume pass.
