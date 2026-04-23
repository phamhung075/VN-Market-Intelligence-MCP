---
name: Memory MEMORY.md stale after sprint jump
description: Memory line 3 cites old stats (sprint 220, 100 tools, 38 scheduler files). Actual current sprint 1295, 105 tools, 42 scheduler files. Update pointer annually or per sprint baseline change.
type: infrastructure
detection_method: Audit on 2026-04-23 compared MEMORY.md line 3 claim to docs/data/project-stats.json actual values
status: KNOWN
recurrence: 1
---

## Problem

`/Users/admin/.claude/projects/.../memory/MEMORY.md` line 3 claims:
> "currently sprint 220, 100 tools, 38 scheduler files"

Actual from `docs/data/project-stats.json` (2026-04-23):
- `currentSprint`: 1295
- `toolCount`: 105
- `schedulerFileCount`: 42

Delta: 1075 sprints, 5 tools, 4 scheduler files. Memory reference file `project_sprint_034_status.md` (from 2026-04-11) is also stale.

## Recovery Steps

1. **Auto-refresh**: System auditor will update MEMORY.md line 3 when sprint baseline changes (every N sprints)
2. **Manual refresh**: User can paste new stats from `docs/data/project-stats.json` into MEMORY.md
3. **Prevent**: Remove hardcoded numbers from memory; always point to docs/data/*.json

## Example Fix

Replace:
```
- [Sprint 055+056 status](project_sprint_034_status.md) — Sprint 055+056 COMPLETE 2026-04-11. (stats now in docs/data/project-stats.json — currently sprint 220, 100 tools, 38 scheduler files)
```

With:
```
- [Project Stats](../data/project-stats.json) — Current sprint, tool count, scheduler file count (SSOT)
```

## Context

Sprint numbering was compacted 2026-04-20: previous 56 sprints collapsed into modular monolith task groups (209–220). Current system uses sequential sprint IDs 1290+. Memory reference files created 2026-04-11 with old numbering and will not auto-sync.
