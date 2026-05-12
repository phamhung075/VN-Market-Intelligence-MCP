# Dev Team — Cron Orchestration Flow

## Input
`read_telegram_reports(status="new")` | Unresolved reports: `WHERE resolution NOT IN ('fixed','wontfix','duplicate') AND status='processed'` | docs/TASKS.md | git log (last 30 commits) | `git branch`

## Output
Tasks executed → docs/TASKS.md updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Dispatch

| Spawn context | Entry step |
|---|---|
| Cold start / cron tick | Step 0a |
| Pipeline resume (`in_progress`) | Step 0b |
| FIX / direct task | Step 3 |
| Post-execution verification only | Step 4 |

---

## Step 0a — Drain `docs/signals/`

Spec: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` | DB degradation: `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory

**Rationale:** Sources may re-emit across cycles. In-memory dedup covers only the current pass. Fingerprint check against `signals_processed` in `docs/signals/signals.db` gates cross-cycle duplicates.

**0a-0 — Open signals.db:**
```
db_path = docs/signals/signals.db
try: open READ_WRITE → db_available = true
catch (ENOENT | SQLITE_CANTOPEN | locked after 3×200ms):
  db_available = false
  log: "[dev-team] WARN: signals.db unavailable — skipping drain, inbox retained for retry"
  pendingSignals = [] | files untouched | continue with empty signals
```

**0a-1 — Glob and iterate** (`docs/signals/*.json`, sorted by `createdAt` ascending):

For each file:
1. Read JSON. Log: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
2. **Fingerprint check:** `sha256(from + type + JSON.stringify(payload) + createdAt)`
   - Match in `signals_processed` → skip PO routing | mv to `processed/{name-replay}.json` | no INSERT
   - No match → dual-record write:
     - **Filesystem:** append `{fingerprint, processedAt, processedBy:"dev-team", result}` then mv to `docs/signals/processed/{filename}` — result ∈ {`routed-to-po`, `skipped-duplicate`, `skipped-duplicate-replay`, `skipped-stale`}
     - **DB INSERT** into `signals_processed(fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename)` — INSERT fail is non-fatal (file move is SSOT)
3. Append to `pendingSignals[]`

**0a-2 — Prune** (after batch, both stores):
```sql
DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days');
```
Delete `docs/signals/processed/` files with `processedAt` older than 7 days.

**Escape hatches:** Delete `processed/` copy + DB row → re-routes on next cycle. Or bump `createdAt` → new fingerprint.

Non-empty `pendingSignals` feeds into Step 1.

---

## Step 0b — Pipeline Resume + Session Gate

- `in_progress` AND `nextAgent` AND `updatedAt < 24h` → spawn `nextAgent` immediately. Skip Step 1.
- `in_progress` AND `updatedAt ≥ 24h` → stale crash, reset to `"idle"`. Fall through to Step 1.
- `"idle"` or missing → fall through to Step 1.

**Session Gate:** TASKS.md empty AND no Telegram reports AND `pendingSignals` empty → `send_telegram(work, "Dev loop idle.")` → EXIT.

---

## Step 1: PO Triage

→ Spawn `po` with: `pendingSignals[]`, `read_telegram_reports(status="new")`, `listUnresolvedReports()`, `docs/TASKS.md`, `git log --oneline -30`, `git branch`
→ PO contract: `.claude/flows/po/main.md` § Role in dev-team flow
→ Return: `NOTHING` (→ idle EXIT) | `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`

---

## Step 2: Planning

| Type | Sequence | Notes |
|---|---|---|
| FIX | (skip) | direct to Step 3 |
| SPIKE | (skip) | direct to developer with `feature-spike.md`; throwaway branch, findings doc only |
| SPRINT-S | architect → pm | each reads own flow |
| SPRINT-M | ba → architect → pm | sequential |
| SPRINT-L | ba → architect → pm; post-merge architect review | sequential |
| UNBLOCK | spawn `{route_to}` | `send_telegram(work, "Unblocked: [brief]")` → EXIT |
| CLEAN | spawn `qa` with branch list | qa flow handles cleanup → EXIT |

Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow

---

## Step 3: Execution

Read `pm` return for task list + dependency map.

**Tier grouping:**
```
Tier 1: no deps → spawn ALL in one message (parallel)
Tier 2: depends on Tier 1 → spawn after Tier 1 Done
Tier 3: depends on Tier 2 → etc.
```

**Zone routing:**
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

**Mode flag:** Batches of type SPIKE carry `mode: "spike"` — the spawned developer (or dev-* zone agent) reads `feature-spike.md` instead of its default flow. All other batch types use the default flow.

**Per tier — all independent tasks in one message:**
```
→ Agent(dev-stock-price, taskA) + Agent(dev-alert-engine, taskB)   # devs parallel
→ Agent(qa, taskA) + Agent(qa, taskB)                               # QA parallel (different branches)
→ Agent(fixer, taskA) + Agent(fixer, taskB)                         # fixer if needed
```

**Parallel spawns:** add `isolation: "worktree"` to each Agent call. Main terminal merges worktree branches (fast-forward if disjoint) after tier returns. See `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`. Sequential MANDATORY until c44 pass (Phase 3); Phase 4 relaxes after c44+c45.

**Conflict check before parallel spawn:**
- Different files, disjoint scopes → parallel (`isolation: "worktree"`)
- Same file modified by both → sequential (omit `isolation`)
- Task B `depends_on` Task A → sequential
- Shared SSOT write (TASKS.md, project-stats.json, any agent .md, pipeline-state.json) → sequential
- Same test suite → parallel ok if different test files AND no shared SQLite DB

**Developer spawn constraint (invariant):** All developer agents MUST use `git commit -m "..."` (index-only). NEVER use `git commit -am` or `git commit -a` — the `-a` flag greedily stages untracked index content from other sources and violates C2 atomicity (root cause of c47 incident).

**After each tier — Merge Gate (sequential; enter only after ALL tier agents returned):**
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

---

## Step 4: Scan

**4.0 — Expire stale monitoring:**
```
expire_monitoring_reports()  # flips monitoring reports >72h to "wontfix"
log: "[dev-team] Expired {result.expired} monitoring reports"
```

**4.1 — Post-execution checks:**
1. Non-main branches remain → add CLEAN batch → Step 1.
2. `read_telegram_reports(status="new").length > 0` → `send_telegram(work, "Found N new report(s)")` → Step 1.
3. `listUnresolvedReports()` non-monitoring count > 0 → `send_telegram(work, "Found N unresolved")` → Step 1.
4. **Monitoring-only guard (C-6):** ALL unresolved are monitoring → `send_telegram(work, "N in monitoring — no action.")` → archive + exit. (Prevents infinite loop.)
5. **Archive resolved** (fixed/wontfix/duplicate): `process_telegram_report(id, delete_telegram_message=true)` for each.
6. Nothing remaining → `send_telegram(work, "Dev loop idle.")` → EXIT.

---

## Step 4.5: Compact Checkpoint

> Invariant: always `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never speculative.

Run after Step 4 exits cleanly, before re-entering Step 1:
```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write docs/agent-memory/notebooks/main.md
  3. git add docs/agent-memory/notebooks/main.md
     git commit -m "chore(memory/dev-team): notebook YYYY-MM-DD"
  4. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  5. Return  # hook: ctx>40% → /compact | ctx 30-40% → decision:block | ctx<30% → silent
```
After compact: resume from Step 1 via smart-compact-protocol.md.

**If ctx ≤ 25%:** skip → Step 1.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

---

## Invariants

- WIP ≤ 2 | docs/TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- Notify WORK at: fix shipped | sprint complete | blocker resolved | idle
