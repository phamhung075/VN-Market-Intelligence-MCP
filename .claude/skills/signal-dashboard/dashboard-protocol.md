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

# 5. Validate JSON structure
jq . docs/data/orch/orch-state.json > /dev/null || echo "ERROR: orch-state.json invalid after write"

# 6. POST-WRITE READ-BACK SELF-CHECK (MANDATORY — kills false-green "row written")
#    Assert the new row id is present inside .signal_queue.rows[] — NOT a top-level numeric key.
ROW_ID=$(echo "$NEW_ROW" | jq -r '.id')
FOUND=$(jq --arg id "$ROW_ID" '[ .signal_queue.rows[] | select(.id == $id) ] | length' docs/data/orch/orch-state.json 2>/dev/null)
if [ "${FOUND:-0}" -lt 1 ]; then
  echo "[SIGNAL-ROW-ASSERT] FAIL: row '$ROW_ID' NOT found in .signal_queue.rows[] after write — orphan key bug or write failure"
  # Emit BUG-channel Telegram (do not swallow — this is the false-green kill switch)
  # The caller's ANTI-SKIP block must also fire: log + BUG telegram before exiting cycle.
  exit 1
fi
echo "[SIGNAL-ROW-ASSERT] OK: row '$ROW_ID' confirmed in .signal_queue.rows[]"
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

## PRUNE — MANDATORY after every drain/consume cycle (HSC-7)

**Called from:** `docs/agents/dev-team/flow/drain-signals.md` after row consumption.
Cowork equivalents must also call PRUNE after their consume step.

**SCHEMA NOTE (HSC-7):** `.signal_queue.archive[]` lane is REMOVED from the hot file schema.
Terminal rows are evicted to `docs/data/orch/archive/YYYY-MM.json` (cold file) via the eviction script.
Do NOT write to `.signal_queue.archive[]` — that inline pattern was RC-1 root cause of file bloat.

### Option A — Script (preferred)

```bash
# Claim commit-mutex before calling script (script MUST run under mutex)
# Call the eviction script — it handles cold write + hot trim atomically
bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
# Commits both hot + cold files:
YYYYMM=$(date -u +%Y-%m)
git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
git commit -m "chore(signals): drain + prune $(date -u +%Y%m%dT%H%M%SZ)"
# Release commit-mutex after commit
```

### Option B — Inline jq (when script unavailable — e.g. cowork agent without bash exec)

Eviction criteria: status IN (`READ`, `RESOLVED`, `SUPERSEDED`) AND `ts` older than 24h.

```bash
# 1. Identify rows to evict (status IN READ/RESOLVED/SUPERSEDED AND ts < now() - 24h)
# 2. Remove evicted rows from .signal_queue.rows[] (atomic write — mtime-CAS guard required)
# 3. Update .signal_queue._updated_at + ._updated_by
# 4. Enforce max 200 rows in .signal_queue.rows[] — evict oldest terminal first if at cap
# 5. Cold file append is the responsibility of the caller (write evicted rows to archive/YYYY-MM.json)
# NOTE: .signal_queue.archive[] must be set to [] (not appended to — lane removed from schema)

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CUTOFF_24H=$(($(date -u +%s) - 86400))

STATE=$(cat docs/data/orch/orch-state.json) # bash-only pipeline — not surfaced to model (rule: docs/standards/orch-state-access.md §1)
UPDATED=$(printf '%s' "$STATE" | jq \
  --arg now "$NOW" \
  --argjson cutoff "$CUTOFF_24H" \
  --arg agent "<my-agent-id>" '
  . as $root |
  # Rows to evict: READ/RESOLVED/SUPERSEDED AND older than 24h
  (.signal_queue.rows | map(select(
    (.status | IN("READ","RESOLVED","SUPERSEDED")) and
    ((try (.ts | fromdateiso8601) catch 0) < $cutoff)
  ))) as $to_evict |
  # Rows to keep: NEW (never evict) + terminal rows younger than 24h
  (.signal_queue.rows | map(select(
    .status == "NEW" or
    not ((.status | IN("READ","RESOLVED","SUPERSEDED")) and
         ((try (.ts | fromdateiso8601) catch 0) < $cutoff))
  ))) as $to_keep |
  $root |
  .signal_queue.rows = $to_keep |
  .signal_queue.archive = [] |
  .signal_queue._updated_at = $now |
  .signal_queue._updated_by = $agent
')
TMP=$(mktemp docs/data/orch/.orch-state-tmp-XXXXXX.json)
printf '%s' "$UPDATED" > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json
jq . docs/data/orch/orch-state.json > /dev/null || echo "ERROR: orch-state.json invalid after prune"

git add docs/data/orch/orch-state.json
git commit -m "chore(signals): drain + prune $(date -u +%Y%m%dT%H%M%SZ)"
```

Eviction thresholds (HSC-7 — replaces old 48h/immediate split):
- **READ / RESOLVED / SUPERSEDED** rows older than 24h → evicted to cold
- **NEW** rows → NEVER evicted (regardless of age)

Cold store: `docs/data/orch/archive/YYYY-MM.json` — append-only (via script or manual append).
Full-history audit (system-auditor forensic scan): load cold file lazily; NEVER load in hot-path planning.
Dedup key: `id` (unique per signal).

**This step is mandatory, not optional.** `drain-signals.md` calls it after every consume pass.
