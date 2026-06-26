---
task_id: HSC-1
title: Create cold archive directory + orch-cold-evict.sh script
owner: developer
zone: scripts/
sprint: ORCH-STATE-HOT-COLD-SPLIT
priority: high
size: S
status: READY
created_at: "2026-06-26T15:28:08Z"
created_by: pm
depends_on: null
---

# TASK-HSC-1: Create cold archive directory + orch-cold-evict.sh script

## Context

`docs/data/orch/orch-state.json` is 2.46 MB (26,185 lines), with 53% evictable terminal dead weight. This task is the **first of 7** in the ORCH-STATE-HOT-COLD-SPLIT sprint. HSC-1 unblocks all others.

**Reference architecture brief:** docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md

## What to build

Create two deliverables:

### 1. Directory: `docs/data/orch/archive/`
- Create empty directory that will hold cold archive files
- Archive files will be named `YYYY-MM.json` (e.g., `2026-06.json`)

### 2. Script: `scripts/orch-cold-evict.sh`
- Eviction script that moves terminal items from hot orch-state.json to cold archive
- **Atomic write contract:** read source → create temp file → validate sentinel → rename to live
- **Idempotent:** re-run evicts nothing if items already evicted
- **Commit-mutex safe:** designed to be called via `task_claim("commit-mutex:main")` wrapper

#### Eviction criteria (§3 of brief):

```
From done[]:        evict items >7 days old; retain last 10 by created_at DESC
From done_verified[]: evict ALL items (terminal by definition)
From active_sprints[]: evict sprints with status IN (DONE, done, DONE-WITH-CAVEATS, completed, SIGNED-OFF-PARTIAL, BCTC-*)
From signal_queue.rows[]: evict rows with status IN (READ, RESOLVED, SUPERSEDED, ACUTE-RESOLVED-ROOT-TRACKED)
From signal_queue.archive[]: evict ALL items (inline archive is the problem)
```

#### Cold file format (§3.2 of brief):

```json
{
  "month": "YYYY-MM",
  "created_at": "<ISO-8601 UTC>",
  "done_tasks": [ /* full task objects from done/done_verified */ ],
  "closed_sprints": [ /* full sprint objects from active_sprints */ ],
  "signal_rows": [ /* full row objects from signal_queue.rows + archive */ ],
  "backlog_detail": [ /* for HSC-4 use; initially empty */ ]
}
```

#### Atomic write guards:

1. **Structural sentinel (before eviction):**
   ```bash
   jq -e '.head and .task_board and .signal_queue' "$ORCH_STATE" || exit 1
   ```

2. **Atomic write sequence:**
   ```bash
   # Read + filter + write to temp
   jq '. ... (filtering logic)' "$ORCH_STATE" > "$TEMP_FILE"
   
   # Validate temp
   jq -e '.head and .task_board and .signal_queue' "$TEMP_FILE" || exit 1
   
   # Validate cold archive structure
   jq -e '.month and .done_tasks and .closed_sprints and .signal_rows' "$COLD_FILE" || exit 1
   
   # Atomic rename
   mv "$TEMP_FILE" "$ORCH_STATE"
   ```

3. **Idempotency check:**
   - Query by id: if item already exists in cold file, skip eviction
   - Or: check done_verified[] length == 0 before evicting (already done)

## Acceptance Criteria

- [ ] `docs/data/orch/archive/` directory exists
- [ ] `scripts/orch-cold-evict.sh` is executable
- [ ] Script validates input orch-state.json structure (sentinel jq -e)
- [ ] Script creates/appends to `YYYY-MM.json` with correct schema
- [ ] Script validates cold file structure before write
- [ ] Script is idempotent (re-run evicts nothing if already evicted)
- [ ] Script uses atomic temp-then-rename protocol
- [ ] No hardcoded paths; use relative-to-repo or absolute-from-env
- [ ] Script usage: `scripts/orch-cold-evict.sh [--dry-run]` (optional)
- [ ] Dry-run produces cold file temp, shows counts, exits 0 without write
- [ ] Live run validates, writes, commits via `git add docs/data/orch/ && git commit -m "..."`
- [ ] Post-execution: `jq . docs/data/orch/orch-state.json` exits 0

## Files to create/modify

| File | Action |
|---|---|
| `docs/data/orch/archive/` | Create directory |
| `scripts/orch-cold-evict.sh` | Create executable script |

## Dependencies

None. This task unblocks HSC-2 (one-time eviction), HSC-3 (repoint flows), HSC-4 (backlog stubs), HSC-6 (evict-on-terminal hook), HSC-7 (signal-dashboard prune).

## Notes

- **Risk:** LOW. Script is pure eviction logic; no live dependencies yet.
- **Testing:** After script works, HSC-2 will run it against the actual 2.46 MB file.
- **Rollback:** git revert the eviction commit; cold files are append-only (no agent reads them yet).

---

## Related documents

- **Sprint brief:** docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md
- **Signal:** docs/signals/orch-state-hot-cold-split-20260626T152808Z.json
- **Atomic write contract:** docs/standards/orch-state-atomic-write.md (§2.3 of consolidate brief)

---

## [Developer] Implementation Record

- **Files created:**
  - `docs/data/orch/archive/.gitkeep` — cold-store directory placeholder
  - `scripts/orch-cold-evict.sh` (470 lines) — reusable eviction script (executable)
- **Files modified:**
  - `docs/policies/dev-standards.md` — added CANONICAL pointer in §Script Persistence
- **Verification:**
  - `bash -n scripts/orch-cold-evict.sh` → PASS
  - `shellcheck scripts/orch-cold-evict.sh` → PASS (0 warnings)
  - `bash scripts/orch-cold-evict.sh --dry-run` → EXIT 0, preview counts valid
  - Hot file byte-identical after dry-run (md5 verified)
- **Dry-run eviction preview (live orch-state.json — 2,469,067 bytes):**
  - done[]: 223 items would evict from hot
  - done_verified[]: 141 items would evict from hot
  - active_sprints[]: 15 terminal sprints would evict from hot
  - signal_queue.rows[]: 63 terminal rows would evict from hot
  - signal_queue.archive[]: 45 items would evict from hot
  - New items to cold: 487 total
  - Projected hot-file size: 957,211 bytes (−1,511,856 bytes / −61% reduction)
- **Git commits:** a3953bb6 feat(scripts/orch-cold-evict): HSC-1 cold archive dir + eviction script / d02104d6 chore(orch-state): HSC-1 task → REVIEW lane
- **Task lane:** HSC-1 moved in_progress → review in orch-state.json
- **HSC-2..HSC-7 unblocked:** scripts/orch-cold-evict.sh exists and is verified
