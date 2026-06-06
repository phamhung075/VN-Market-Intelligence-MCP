# TASK_AF-ORCH-F1B — Jq Migration to Canonical Schema

**Sprint:** ORCH-TASK-CANON  
**Owner:** agent-father  
**Type:** SPRINT-S  
**Status:** TODO  
**Created:** 2026-06-06T20:45:00Z  
**Zone:** `docs/data/orch/`  
**Size:** S  
**Priority:** high  
**Depends:** [`AF-ORCH-F1A-F4`]

---

## Summary

One-shot jq migration of `docs/data/orch/orch-state.json` `.task_board.done[]` rows (66 rows) from freeform status strings to canonical 7-value enum + normalized field names. Atomic temp→rename with sentinel verification. Must complete before F2 TypeScript interface rename (which assumes `id` is the canonical field in JSON).

---

## Migration Scope

**Source:** `docs/data/orch/orch-state.json` (live SSOT)  
**Target array:** `.task_board.done[]` (66 confirmed rows)  
**Changes:**
1. Normalize `task_id` → `id` (canonical field rename)
2. Normalize status strings to closed 7-value enum (see task-schema.md normalization rules)
3. Move freeform status detail to `status_note`
4. Flatten nested container `ORCH-DASH-DECISION-DRILLDOWN` (6 child tasks extracted, container row removed)
5. Ensure all rows have `title` (coalesce from `desc` or `label` if needed)
6. Remove banned fields (`desc`, `label`, `summary`, `resolved_id`)
7. Normalize `created_at` (use `closed_at` as fallback if missing)

---

## Jq Script

Create `docs/data/orch/migrate-done-canonical.jq`:

```jq
# ORCH-TASK-CANON F1B migration script
# Input: orch-state.json
# Output: migrated orch-state with .task_board.done[] normalized to canonical schema

def normalize_status:
  if test("^DONE") then "DONE"
  elif test("^RESOLVED|^SUPERSEDED|^SHIPPED") then "DONE"
  elif test("^IN_PROGRESS") then "IN_PROGRESS"
  elif test("^REVIEW|READY_FOR_REVIEW") then "REVIEW"
  elif test("^BLOCKED") then "BLOCKED"
  elif test("^CANCELLED") then "CANCELLED"
  elif test("DEFERRED|POSTPONED|FUTURE") then "DEFERRED"
  else "TODO"
  end;

def flatten_done_tasks:
  . as $root |
  .task_board.done |
  map(
    if .id == "ORCH-DASH-DECISION-DRILLDOWN" then
      # Container row — extract children and omit container
      (.children // [] | map(
        {
          id: .id,
          title: (.title // .desc // .label // .resolvedId),
          owner: .owner,
          status: (.status | normalize_status),
          zone: .zone,
          created_at: (.created_at // .closed_at // "unknown"),
          closed_at: .closed_at,
          type: .type,
          size: .size,
          priority: .priority,
          status_note: (if (.status | normalize_status) != .status then (.status + (if .closed_at then " (\(.closed_at))" else "" end)) else empty end),
          depends: .depends,
          files: .files,
          commit: .commit,
          note: .note,
          sprint: .sprint
        } |
        del(..|select(. == null or . == empty or . == []))
      ))
    else
      # Regular task row — normalize
      {
        id: (.id // .task_id),
        title: (.title // .desc // .label // .resolvedId),
        owner: .owner,
        status: (.status | normalize_status),
        zone: .zone,
        created_at: (.created_at // .closed_at // "unknown"),
        closed_at: .closed_at,
        type: .type,
        size: .size,
        priority: .priority,
        status_note: (if (.status | normalize_status) != .status then (.status + (if .closed_at then " (\(.closed_at))" else "" end)) else empty end),
        depends: .depends,
        files: .files,
        commit: .commit,
        note: .note,
        sprint: .sprint
      } |
      del(..|select(. == null or . == empty or . == []))
    end
  ) |
  flatten;

# Main transform
. |
.task_board.done |= flatten_done_tasks |
.task_board._updated_at = now | strftime("%Y-%m-%dT%H:%M:%SZ") |
.task_board._updated_by = "agent-father"
```

---

## Execution Steps

1. **Pre-migration assertions:**
   ```bash
   jq '.task_board.done | length' docs/data/orch/orch-state.json  # Should be 66
   jq '[.task_board.done[] | select(has("status") | not)] | length' docs/data/orch/orch-state.json  # Should be 0
   ```

2. **Run migration:**
   ```bash
   jq -f docs/data/orch/migrate-done-canonical.jq docs/data/orch/orch-state.json > /tmp/orch-migrated.json
   ```

3. **Sentinel verification (MANDATORY — prevents clobber):**
   ```bash
   # Check file not empty
   [ -s /tmp/orch-migrated.json ] || { echo "ERROR: migrated file is empty"; exit 1; }
   
   # Check canonical structure
   jq -e '.task_board.done[0].id' /tmp/orch-migrated.json > /dev/null || { echo "ERROR: no .id field"; exit 1; }
   
   # Check status enum
   jq '[.task_board.done[].status] | unique | .[]' /tmp/orch-migrated.json | \
     grep -v -E '^(TODO|IN_PROGRESS|REVIEW|DONE|BLOCKED|CANCELLED|DEFERRED)$' && \
     { echo "ERROR: non-enum status found"; exit 1; } || true
   ```

4. **Atomic move:**
   ```bash
   mv /tmp/orch-migrated.json docs/data/orch/orch-state.json
   ```

5. **Post-migration assertions (verify migration success):**
   ```bash
   jq '[.task_board.done[] | select(has("id") | not)] | length' docs/data/orch/orch-state.json  # Should be 0
   jq '[.task_board.done[] | select(has("title") | not)] | length' docs/data/orch/orch-state.json  # Should be 0
   jq '[.task_board.done[] | select(has("zone") | not)] | length' docs/data/orch/orch-state.json  # Should be 0 (or acceptable for legacy)
   jq '[.task_board.done[] | select(.id == "ORCH-DASH-DECISION-DRILLDOWN")] | length' docs/data/orch/orch-state.json  # Should be 0 (container removed)
   jq '[.task_board.done[] | select(has("task_id"))] | length' docs/data/orch/orch-state.json  # Should be 0 (old field removed)
   jq '[.task_board.done[] | select(.status | test("DONE-LIVE-VERIFIED|DONE-VERIFIED|DONE-PENDING|RESOLVED-BY"))] | length' docs/data/orch/orch-state.json  # Should be 0 (no freeform variants)
   ```

---

## Acceptance Criteria

1. **Pre-migration:**
   - `jq '.task_board.done | length'` = 66 (unchanged)

2. **Sentinel verify:**
   - `[ -s /tmp/orch-migrated.json ]` = true (file exists and >0 bytes)
   - `jq -e '.task_board.done[0].id' /tmp/orch-migrated.json` = success (has .id)
   - All `.status` values match enum

3. **Post-migration (after mv):**
   - `jq '[.task_board.done[] | select(has("id") | not)] | length'` = 0
   - `jq '[.task_board.done[] | select(has("title") | not)] | length'` = 0
   - `jq '[.task_board.done[] | select(has("owner") | not)] | length'` = 0 or <10 (acceptable)
   - `jq '[.task_board.done[] | select(has("zone") | not)] | length'` = 0 or acceptable (legacy tolerance)
   - `jq '[.task_board.done[] | select(.id == "ORCH-DASH-DECISION-DRILLDOWN")] | length'` = 0 (container removed)
   - `jq '[.task_board.done[] | select(has("task_id"))] | length'` = 0 (old field cleaned)
   - No freeform status variants remain (no `DONE-LIVE-VERIFIED`, etc.)

4. **Git commit:**
   - Single atomic commit with both migration script file + migrated JSON
   - Commit message follows convention
   - Commit signed under commit-mutex

---

## Risk Mitigation

- **jq-empty-guard lesson:** The sentinel verify step `[ -s tmp ] && jq -e '.sentinel_key' tmp` prevents the jq-empty-clobber bug (erroneous filter writes 0 bytes; `jq empty` accepts empty input as valid JSON; old SSOT deleted). Current guard is comprehensive.

- **Backup:** Before running migration, `git cp docs/data/orch/orch-state.json docs/data/orch/orch-state.json.backup` (never committed, just for manual recovery if needed).

- **Field removal caution:** `task_id` is being removed from JSON (renamed to `id`). Verify no bash/jq scripts in active flows directly reference `.task_board.done[].task_id` before commit. (Architect brief R-2 mitigation: agent-father greps flows.)

---

## Commit Message

```
chore(data): ORCH-TASK-CANON F1b — migrate done[] to canonical schema (jq atomic, sentinel verified)

- Normalize task_id → id (canonical field)
- Normalize status strings to closed 7-value enum (freeform variants → status_note)
- Flatten ORCH-DASH-DECISION-DRILLDOWN nested container (6 children extracted, container removed)
- Ensure all rows have title/owner/created_at with fallback rules
- Remove banned fields (desc, label, summary, resolved_id)
- Sentinel: [ -s tmp ] && jq -e '.task_board.done[0].id' tmp before atomic mv
- Post-migration: all 71 rows (66 + 6 from container - 1 container) in canonical form
```

---

## Commit-Mutex

This task MUST acquire commit-mutex before executing the atomic migration. Release after commit succeeds. This is a SSOT write on a live file — serialize with any concurrent orch-state writes (unlikely in a PM-dispatch, but belt-and-suspenders).

---

## Handoff to F2

After this commit is merged and verified live, the F2 developer can proceed with TypeScript interface rename (`task_id?: string` → `id: string` mandatory). The JSON data is already in the canonical form.
