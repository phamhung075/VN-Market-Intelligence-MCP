# Dev Team — Execute

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                                                    # why: task list + dependency tiers
- docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md # why: worktree isolation rationale + Phase 3/4 mandate

## Step 1: Execution loop (parallel where possible)

Read `pm` return to get task list + dependency map. Then:

**Group tasks by dependency tier:**
```
Tier 1: tasks with no deps → spawn ALL developers in one message (parallel)
Tier 2: tasks that depend on Tier 1 → spawn after Tier 1 Done
Tier 3: tasks that depend on Tier 2 → etc.
```

**Agent routing — pick the right developer:**
```
Route by zone:
  apps/mcp-server/        → dev-mcp-server
  apps/api-gateway/       → dev-api-gateway
  apps/stock-price/       → dev-stock-price
  apps/technical-analysis/→ dev-technical-analysis
  apps/macro-indicators/  → dev-macro-indicators
  apps/kinh-dich-service/ → dev-kinh-dich
  apps/alert-engine/      → dev-alert-engine
  apps/pdf-extractor/     → dev-pdf-extractor
  apps/rag-service/       → dev-rag-service
  cross-service or root/  → developer (generic)
```

**Per tier — main terminal spawns all independent tasks together:**
```
# Example: Tier 1 has task A (stock-price) and task B (alert-engine)
→ ONE message: Agent(dev-stock-price, task A) + Agent(dev-alert-engine, task B)
→ Read both returns

# QA for completed tasks — also parallel if different branches:
→ ONE message: Agent(qa, task A) + Agent(qa, task B)
→ Read both returns

# Fixer if needed — parallel per task:
→ ONE message: Agent(fixer, task A) + Agent(fixer, task B)
```

**Parallel spawns use SDK-native worktree isolation** — add `isolation: "worktree"` to each Agent call for parallel tasks. SDK handles worktree lifecycle (create + cleanup). Main terminal merges each worktree branch (fast-forward if disjoint) after all agents in the tier return. Sequential dispatch remains MANDATORY until c44 verification (Phase 3). After c44+c45 pass, Phase 4 relaxes the mandate.

**Conflict check before parallel spawn** (main terminal must verify):
- Different files, disjoint scopes → ✅ parallel — use `isolation: "worktree"` on each Agent call
- Same file modified by both → ❌ sequential — omit `isolation`, spawn one at a time
- Task B `depends_on` Task A → ❌ sequential (wait for A Done)
- Shared SSOT write (docs/TASKS.md, docs/data/project-stats.json, any agent .md, docs/pipeline-state.json) → ❌ sequential
- Same test suite → ⚠️ parallel ok if different test files AND tests do not share a SQLite DB

**After each tier completes:**
- Spawn `pm` to update docs/TASKS.md + unblock next tier → read return → spawn next tier

## Step 2: Scan transition

After all tasks Done → proceed to scan flow.

## RETURN

```
DONE: All tiers executed
PIPELINE: continue → scan
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/dev-team/scan.md        # when: all task tiers completed and changes need post-execution verification
- → STOP                          # when: UNBLOCK or CLEAN batch exited early (no code changes to scan)
