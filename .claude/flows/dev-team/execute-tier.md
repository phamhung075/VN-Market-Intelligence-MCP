# Dev Team — Step 3: Execution (Tiered, Zone-Routed, Worktree-Parallel)

**Parent flow:** `.claude/flows/dev-team/main.md` (Step 3 dispatcher)

Read `pm` return for task list + dependency map. Each task carries `zone:` field (mandatory per PM/architect contract).

---

## Tier Grouping

```
Tier 1: no deps → spawn ALL in one message (parallel)
Tier 2: depends on Tier 1 → spawn after Tier 1 Done
Tier 3: depends on Tier 2 → etc.
```

## Zone Routing — 3-Tier Resolution

Read PM RETURN per task:

```
Tier 1 — EXPLICIT (preferred):    task has `zone: apps/<service>/`  → route to dev-<service>
Tier 2 — INFER (fallback):        no explicit zone → grep files list:
                                    ALL files start with `apps/<service>/`   → route to dev-<service>
                                    files span >1 zone or root/scripts/      → route to developer (generic)
Tier 3 — REPORT (last resort):    cannot determine → spawn `developer`, log WORK warning:
                                    "[dev-team] WARN: task NNN missing zone hint — PM did not propagate from architect"
                                    ALSO drop signal `docs/signals/zone-missing-{taskId}-{ts}.json`:
                                    {
                                      "from": "dev-team",
                                      "to": "po",
                                      "type": "zone_missing_tier3",
                                      "priority": "medium",
                                      "createdAt": "<ISO>",
                                      "payload": { "taskId": "<id>", "files": [...], "suggestedZone": "<best-guess from infer step>" }
                                    }
                                    Next dev-team cycle drains this signal → PO sees it via pendingSignals[] → revises emission policy for similar tasks.
```

**Zone → specialist map:**
```
apps/mcp-server/         → dev-mcp-server
apps/api-gateway/        → dev-api-gateway
apps/stock-price/        → dev-stock-price
apps/technical-analysis/ → dev-technical-analysis
apps/macro-indicators/   → dev-macro-indicators
apps/kinh-dich-service/  → dev-kinh-dich
apps/alert-engine/       → dev-alert-engine
apps/pdf-extractor/      → dev-pdf-extractor
apps/rag-service/        → dev-rag-service
cross-service or root/   → developer (generic)
```

Tier 3 firing on any task in a cycle = upstream bug (PO emitted zone-less FIX). Each Tier-3 spawn auto-drops a `zone_missing_tier3` signal. Cumulative count > 5 in one cycle = escalate to architect via WORK channel.

## Mode Flag

Batches of type SPIKE carry `mode: "spike"` — the spawned developer (or dev-* zone agent) reads `feature-spike.md` instead of its default flow. All other batch types use the default flow.

## Per-Tier Parallel Spawn

All independent tasks in one message:
```
→ Agent(dev-stock-price, taskA) + Agent(dev-alert-engine, taskB)   # devs parallel
→ Agent(qa, taskA) + Agent(qa, taskB)                               # QA parallel (different branches)
→ Agent(fixer, taskA) + Agent(fixer, taskB)                         # fixer if needed
```

**Worktree isolation:** add `isolation: "worktree"` to each Agent call. Main terminal merges worktree branches (fast-forward if disjoint) after tier returns. See `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`. Sequential MANDATORY until c44 pass (Phase 3); Phase 4 relaxes after c44+c45.

### Conflict Check Before Parallel Spawn

- Different files, disjoint scopes → parallel (`isolation: "worktree"`)
- Same file modified by both → sequential (omit `isolation`)
- Task B `depends_on` Task A → sequential
- Shared SSOT write (TASKS.md, project-stats.json, any agent .md, pipeline-state.json) → sequential
- Same test suite → parallel ok if different test files AND no shared SQLite DB

### Developer Spawn Constraint (Invariant)

All developer agents MUST use `git commit -m "..."` (index-only). NEVER use `git commit -am` or `git commit -a` — the `-a` flag greedily stages untracked index content from other sources and violates C2 atomicity (root cause of c47 incident).

## Merge Gate (After Each Tier — Sequential)

Enter only after ALL tier agents returned.

```
1. bash scripts/audits/index-check.sh  → abort + WORK alert if exit 1 (Control 1)
2. For each agent branch in tier order (one-by-one, NOT batch):
   a. git cherry-pick <sha>  OR  git merge --ff-only <branch>
   b. bash scripts/audits/tree-verify.sh <cherry-sha>  → if exit 1: STOP, WORK alert, Control 5
   c. git worktree remove <path>  (worktree agents only)
   d. git branch -d <branch>      (worktree agents only)
3. bash scripts/audits/c2-alert.sh <new-HEAD-sha>  (Control 4 — non-blocking, prints warning)
4. If Control 1 or Control 3 fired: STOP tier, WORK alert, await human.
   Recovery: bash scripts/audits/recovery-snapshot.sh  (operator-explicit only — Control 5)
5. All controls pass → spawn pm to update TASKS.md + unblock next tier
```
