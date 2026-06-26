---
sprint: SHG
task_id: SHG-4
owner: agent-father
zone: docs/agents/pm/
size: S
priority: HIGH
depends_on: [SHG-2]
blocks: []
---

## TLDR

Add deterministic sprint eviction rule to `docs/agents/pm/flow/task-archive.md` and execute the eviction: 13 terminal sprints + 2 null-id corrupts → cold archive, stubs remain in hot `closed_sprints[]`. Reduce active_sprints from 18 to ≤5 (only live-work sprints remain).

## [PM] Planning Context

**Source brief:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 2

**Zone:** docs/agents/pm/ — PM flow documentation + orch-state mutation

**Acceptance Criteria:**
- [ ] task-archive.md gains `§ Sprint Eviction` section before Step 1 (exact spec in brief § 2.5)
- [ ] Section describes eviction predicate (TERMINAL_SET = DONE|DONE_VERIFIED|CANCELLED|DEFERRED|SKIPPED)
- [ ] Eviction logic: all tasks in a sprint are TERMINAL → evict whole sprint to cold
- [ ] Null-id sprints (2 corrupt sprints with id=null) quarantined unconditionally
- [ ] closed_sprints[] stub format: { id, title, closed_at, task_count, detail_ref }
- [ ] Full sprint objects written to `docs/data/orch/archive/2026-06.json` under `.closed_sprints[]`
- [ ] Post-eviction active_sprints count drops from 18 to ≤5
- [ ] 13 named evictable sprints confirmed evicted:
  - MCP-SURFACE-GAPS (3 tasks)
  - ENV-ISOLATION (7 tasks)
  - SELF-IMPROVE-GATE (1 task)
  - NB-PRUNE-FIX (10 tasks)
  - BCTC-LAYOUT-FIRST (19 tasks)
  - COWORK-RELIABILITY (6 tasks)
  - BCTC-FETCH-CORRECTNESS (5 tasks)
  - OPS-DASHBOARD-TRUTH (4 tasks)
  - GO-FLEET-DEPLOY (13 tasks)
  - EVIDENCE-ACCUM-SILENT-CRON (1 task)
  - LOG-HYGIENE (1 task)
  - (2 null-id sprints separately quarantined)
- [ ] Commit message: "chore(pm): sprint eviction rule — deterministic terminal-set predicate"
- [ ] Validation: jq `.task_board.active_sprints | length` shows ≤5 remaining

**Files to read first:**
- `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 2.1–2.5 (eviction rule, predicate, stubs, null-id handling)
- `docs/agents/pm/flow/task-archive.md` (current structure to understand where to insert the section)

**Files to create:**
- `docs/data/orch/archive/2026-06.json` (if not already present) — cold archive for closed sprints

**Files to modify:**
- `docs/agents/pm/flow/task-archive.md` — add `§ Sprint Eviction` section before Step 1
- `docs/data/orch/orch-state.json` — evict 13+2 sprints (atomic write via pm logic)

**Dependencies:**
- SHG-2 (status enum migration) must be COMPLETE before this task runs — eviction predicate checks TERMINAL_SET against canonical enum values

**Knowledge needed:**
- `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md` (HSC-1 companion brief on hot/cold file mechanics)
- Brief § 2.4 table of evictable sprints (reference for verification)

**Note:**
This task executes the eviction (not just writes the rule). The rule insertion into task-archive.md is lightweight; the heavy lifting is the jq predicate that identifies terminal sprints + the atomic write to move them to cold archive.

---

## Handoff Detail

### 1. Update task-archive.md

Add this section immediately before Step 1 of `docs/agents/pm/flow/task-archive.md`:

```markdown
## § Sprint Eviction (runs before done/done_verified eviction)

Triggered: always on entry to task-archive (sprint check is cheap).

1. Apply canonical status migration (if not yet done — SHG-2 prerequisite)
2. Run eviction predicate (see brief § 2.1) to identify evictable sprints
3. For each evictable sprint: write full object to cold; write stub to closed_sprints[]; remove from active_sprints[]
4. Quarantine null-id sprints unconditionally
5. Validate (scripts/orch-state-validate.sh) before rename
```

### 2. Identify evictable sprints

Per brief § 2.4, these 13 sprints are evictable AFTER status migration (SHG-2):

| Sprint ID | Task count | Status after migration |
|---|---|---|
| MCP-SURFACE-GAPS | 3 | All DONE |
| ENV-ISOLATION | 7 | All DONE |
| SELF-IMPROVE-GATE | 1 | All DONE |
| NB-PRUNE-FIX | 10 | All DONE |
| BCTC-LAYOUT-FIRST | 19 | All DONE |
| COWORK-RELIABILITY | 6 | All DONE |
| BCTC-FETCH-CORRECTNESS | 5 | All DONE |
| OPS-DASHBOARD-TRUTH | 4 | All DONE |
| GO-FLEET-DEPLOY | 13 | All DONE |
| EVIDENCE-ACCUM-SILENT-CRON | 1 | All DONE |
| LOG-HYGIENE | 1 | All DONE |

Plus 2 null-id sprints: quarantine unconditionally (id=null is corrupt).

### 3. Eviction predicate (jq)

```bash
TERMINAL='["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]'
jq --argjson T "$TERMINAL" '
  [.task_board.active_sprints[]
   | select(.id != null)
   | select(
       [ .tasks[]?.status ]
       | all(. as $s | $T | index($s) != null)
     )
   | .id
  ]' docs/data/orch/orch-state.json
```

This returns an array of evictable sprint IDs.

### 4. Archive format

Full sprint objects → `docs/data/orch/archive/2026-06.json#closed_sprints[]`

Hot file stubs → `docs/data/orch/orch-state.json#task_board.closed_sprints[]` (alongside active_sprints):

```json
{
  "id": "<sprint-id>",
  "title": "<sprint-title>",
  "closed_at": "2026-06-27T00:20:00Z",
  "task_count": <n>,
  "detail_ref": "docs/data/orch/archive/2026-06.json#closed_sprints/<sprint-id>"
}
```

### 5. Verification

After eviction, verify:

```bash
jq '.task_board.active_sprints | length' docs/data/orch/orch-state.json
# Expected: ≤5 (only BCTC-ANALYTICS-LAYER, FLEET-HOST-SAFETY, VN-MACRO-TOOLING, CHEF-ATTN, AUDIT-FB-GATE-PROSE-HARDENING remain)

# Verify closed_sprints[] count increased
jq '.task_board.closed_sprints | length' docs/data/orch/orch-state.json
# Expected: 15+ (original closed + 13 new + 2 quarantined null-id as separate entries)
```

**Expected size reduction:** ~120–150 KB from hot file (per brief estimate, orch-state moved from 538 KB to ~80 KB target).

