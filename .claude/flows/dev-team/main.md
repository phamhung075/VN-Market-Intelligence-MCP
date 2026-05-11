# Dev Team — Cron Orchestration Flow

## Input
`read_telegram_reports(status="new")` | Unresolved reports: `WHERE resolution NOT IN ('fixed','wontfix','duplicate') AND status='processed'` | docs/TASKS.md | git log (last 30 commits) | `git branch` (stale branch audit)

## Output
Tasks executed → docs/TASKS.md updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Step 0: Drain Signals + Pipeline Resume

### Step 0a — Drain `docs/signals/` (before anything else)

Glob `docs/signals/*.json`. For each signal file (sorted by `createdAt` ascending):

1. Read the JSON file
2. Log to notebook: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
3. Append to an in-memory `pendingSignals[]` array
4. **Move** the signal file to `docs/signals/processed/` with added fields:
   ```
   mv docs/signals/{filename} → docs/signals/processed/{filename}
   ```
   Before moving, append treatment metadata to the JSON:
   ```json
   {
     ...original fields,
     "processedAt": "{ISO timestamp}",
     "processedBy": "dev-team",
     "result": "routed-to-po|skipped-duplicate|skipped-stale"
   }
   ```
   - `routed-to-po`: signal passed to PO triage
   - `skipped-duplicate`: identical signal already in pendingSignals (same `from` + `type` + `payload`)
   - `skipped-stale`: `createdAt` older than 24h

5. **Prune** `docs/signals/processed/`: delete any processed files older than 7 days

If `pendingSignals` is non-empty, these signals feed into Step 1 (PO triage). PO receives them as additional input alongside Telegram reports and TASKS.md.

### Step 0b — Pipeline Resume — Check `docs/pipeline-state.json`

- If `status == "in_progress"` AND `nextAgent` present AND `updatedAt < 24h` → spawn `nextAgent` immediately. Skip Step 1.
- If `status == "in_progress"` AND `updatedAt >= 24h` → stale crash, reset to `"idle"`. Fall through to Step 1.
- If `"idle"` or missing → fall through to Step 1.

**Session Gate:** PO cannot self-initiate if TASKS.md empty AND no Telegram reports AND `pendingSignals` is empty. `send_telegram(work, "Dev loop idle.")` → EXIT.

---

## Step 1: PO Triage

Launch `po`. Triage inputs:
- `pendingSignals[]` from Step 0a (if any — pass as context in spawn prompt)
- `read_telegram_reports(status="new")`
- Unresolved reports: `listUnresolvedReports()` → `WHERE resolution NOT IN ('fixed','wontfix','duplicate') AND status='processed'`
- docs/TASKS.md
- `git log --oneline -30`
- `git branch` — list all branches; flag any non-main branch as a **CLEAN** task if it has 0 unmerged commits (`git log main..<branch> --oneline` returns empty) or is a stale worktree branch

Return EXACTLY ONE of:

`NOTHING` → `send_telegram(work, "Dev loop idle.")` → EXIT

`BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`
- `zone`: optional service name (e.g. `"stock-price"`, `"alert-engine"`) — drives agent routing in Step 3

- **FIX**: ≤10 lines ≤3 files no new types — skip planning
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
- **UNBLOCK**: blocker + `route_to` agent
- **CLEAN**: stale branch list to delete + worktrees to remove → route to `qa`
- Priority: recurring bugs → UNBLOCK → FIX → CLEAN → S → M/L

---

## Step 2: Planning loop (sequential by nature — each needs previous output)

**FIX** → skip to Step 3

**SPRINT-S**:
1. Spawn `architect` → read return
2. Spawn `pm` → read return (contains task list + deps) → Step 3

**SPRINT-M/L**:
1. Spawn `ba` → read return
2. Spawn `architect` → read return
3. Spawn `pm` → read return → Step 3
   - L only: after last merge → spawn `architect` post-merge review

**UNBLOCK** → spawn `{route_to}` (use `dev-*` agent if zone-specific, else generic) → read return → `send_telegram(work, "Unblocked: [brief]")` → EXIT

**CLEAN** → spawn `qa` with branch list → qa runs:
```
for each branch:
  unmerged=$(git log main..<branch> --oneline | wc -l)
  if unmerged == 0: git branch -d <branch>
  if worktree: git worktree remove --force <path> && git branch -D <branch>
  if unmerged > 0: report to WORK — "Branch <name> has N unmerged commits — manual review needed"
git push origin --prune  # clean up remote refs
```
→ EXIT

---

## Step 3: Execution loop (parallel where possible)

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

**Conflict check before parallel spawn** (main terminal must verify):
- Different files → ✅ parallel
- Same file modified by both → ❌ sequential
- Task B `depends_on` Task A → ❌ sequential (wait for A Done)
- Same test suite → ⚠️ parallel ok if different test files

**After each tier completes:**
- Spawn `pm` to update docs/TASKS.md + unblock next tier → read return → spawn next tier

---

## Step 4: Scan

### Step 4.0: Expire stale monitoring reports

Before anything else in Step 4, call `expire_monitoring_reports` via MCP gateway:

```
result = expire_monitoring_reports()
log to notebook: "[dev-team] Expired {result.expired} monitoring reports (>72h)"
```

This flips stale monitoring reports (resolution="monitoring", age >72h) to "wontfix" so the archive loop below can pick them up in Step 4 sub-step 5.

---

After all tasks Done:
1. `git branch` — any non-main branches remain? → add CLEAN batch → Step 1.

2. **Check new reports:**
   ```
   new = read_telegram_reports(status="new")
   if new.length > 0:
     send_telegram(work, f"Found {new.length} new report(s)")
     → Step 1 (retriage)
   ```

3. **Check unresolved (non-terminal) reports:**
   ```
   unresolved = listUnresolvedReports()  # resolution NOT IN (fixed, wontfix, duplicate) AND status != processed
   non_monitoring = [r for r in unresolved if r.resolution != "monitoring"]

   if non_monitoring.length > 0:
     send_telegram(work, f"Found {non_monitoring.length} unresolved report(s)")
     → Step 1 (escalation)
   ```

4. **Monitoring-only guard (C-6):** If `listUnresolvedReports()` returns ONLY monitoring reports (resolution="monitoring"), do NOT re-trigger Step 1.
   ```
   monitoring_only = [r for r in unresolved if r.resolution == "monitoring"]
   if monitoring_only.length > 0:
     send_telegram(work, f"{monitoring_only.length} report(s) in monitoring — no action needed.")
     # Do NOT re-enter Step 1 — proceed to archive + exit
   ```
   This prevents infinite cron loops from perpetually-unresolved reports.

5. **Archive resolved reports** (fixed / wontfix / duplicate only):
   ```
   for each report with resolution IN (fixed, wontfix, duplicate):
     process_telegram_report(id, delete_telegram_message=true)
   ```
   Resolution guide:
   - Fixed after code change → `process_telegram_report(id, resolution="fixed")`
   - Transient/informational → `process_telegram_report(id, resolution="wontfix")`
   - Deferred for observation → `process_telegram_report(id, resolution="monitoring")`

6. Nothing remaining → `send_telegram(work, "Dev loop idle.")` → EXIT

---

## Step 4.5: Proactive Compact Checkpoint

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook + pipeline-state timestamp guard
- Before writing `docs/pipeline-state.json` or `docs/agent-memory/notebooks/main.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculatively round up, NEVER pick a future minute, NEVER guess "approximate close time"
- This applies to `updatedAt` in pipeline-state.json AND to the `**Written:** YYYY-MM-DD HH:MM UTC` header line in notebooks/main.md
- If notebook contains task table rows with timestamps (e.g. "cycle finished 04:55 UTC"), each timestamp must reflect actual measured UTC at that step

Run this **after Step 4 exits cleanly and before re-entering Step 1** (i.e., when more work exists):

```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write: docs/agent-memory/notebooks/main.md (current tier, next sprint intent)
  3. git add docs/agent-memory/notebooks/main.md && git commit -m "chore(memory/dev-team): notebook YYYY-MM-DD"
     (Convention: .claude/knowledge/commit-convention.md § Notebook Commits)
  4. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  5. Return
     → stop-context-advisor.sh fires automatically on every response end
     → ctx >40%: osascript types /compact into main terminal (iTerm2 only)
     → ctx 30-40%: injects decision:block warning
     → ctx <30%: no action needed, hook exits silently
```

After compact, resume from Step 1 using the Resume Protocol in smart-compact-protocol.md.

**If ctx ≤ 25%:** skip — proceed directly to Step 1.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

---

## Invariants

- WIP ≤ 2 | docs/TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- notify work at: fix shipped | sprint complete | blocker resolved | idle
