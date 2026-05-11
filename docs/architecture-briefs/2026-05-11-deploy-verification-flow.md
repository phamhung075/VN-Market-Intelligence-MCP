# Deploy Verification Flow — Prevent Merged-Not-Deployed Sprints

**Date:** 2026-05-11
**Author:** architect
**Input:** TNB c36 finding #6 (severity=high), dev-team flow main.md
**Handoff:** PM → implement as follow-up sprint (task IDs proposed in §5)

---

## §1 — Pattern Evidence (last 7 days)

| Sprint | Merge SHA (abbrev) | Detected | Detection mechanism | Merge→detect gap |
|--------|--------------------|----------|---------------------|------------------|
| 1862a (vnstock RPM 50→80) | unknown — not recorded | 2026-05-10 | TNB c35 post-cycle review | ~48h |
| 1862f (Reuters/TE backoff) | unknown — not recorded | 2026-05-10 | TNB c35 post-cycle review | ~48h |
| 1862j (sigma threshold safeguard) | unknown — not recorded | 2026-05-10 | TNB c35 post-cycle review | ~48h |
| 1865a (UTC guard) | af26235b | 2026-05-10 (status uncertain) | git log inspection | <24h |
| 1869a (price_drop threshold tuning) | in main | 2026-05-11 ~12:00 UTC | 1876a-A4 diagnostic | 24–48h |
| 1869b (per-stock thresholds) | in main | 2026-05-11 ~12:00 UTC | 1876a-A4 diagnostic | 24–48h |
| 1869b-seed (watchlist defaults) | in main | 2026-05-11 ~12:00 UTC | 1876a-A4 diagnostic | 24–48h |

Detection is always post-hoc (TNB audit or explicit diagnostic). No proactive mechanism exists.

---

## §2 — Root Cause

### Why merge != deploy

1. **Docker container lifecycle.** The running containers (`mcp-server`, `alert-engine`, etc.) load the
   image that was built at last `docker-compose up --build`. Code merged to `main` after that build
   is never seen by running containers until the next explicit rebuild.

2. **Ops-gated rebuild.** `docker-compose up --build` is a manual ops action. The dev-team flow
   (main.md) states "Docker restart: after final sprint merge only" (Invariants block). This creates
   a structural gap: QA merges task branches one by one; container is rebuilt only at sprint boundary
   — or not at all if ops action is deferred.

3. **Task marked Done at merge, not at deploy.** The current flow (Step 3) transitions a task to Done
   after QA merge SHA is confirmed. There is no subsequent step that verifies the running binary
   reflects that merge. "SHIPPED" = merge + QA, not merge + running.

4. **Schema migrations silently skipped.** Migration code (seed jobs, DB alter statements) runs only
   at container startup. A merged migration that is never deployed never executes. The schema on prod
   diverges from the schema in source, with no alert.

### Why this isn't caught faster

- Behavior change surfaced only when a code path exercises the changed logic in production conditions.
  Rate limiter tuning (1862a) only manifests under real API call volume; threshold tuning (1869a/b)
  only manifests when a qualifying drop event occurs. Both can be silent for hours or days.
- No `/version` or image-fingerprint endpoint is exposed by any service. There is no programmatic
  way for dev-team to query "which commit is running?"
- TNB and unified-agent work from Telegram output and metric trends, not from binary introspection.
  They catch symptoms, never the deploy gap itself.

---

## §3 — Proposed Flow Change: Mechanism (b) — Smoke Probe

**Selected mechanism: (b) Smoke probe.**

Rationale: A fingerprint/version check (mechanism a) requires adding a version endpoint to every
service — non-trivial across 9 containers. Schedule sampling (mechanism c) accepts a detection lag
of N cycles. Mechanism (b) — running a deterministic behavioral check that exercises the changed code
path — works with existing MCP tools, requires no new service endpoints, and is implementable in one
flow step per task. It also catches "deployed but broken" as a bonus, which (a) and (c) do not.

### New Step 3.5 — Deploy Verification Gate (insert after Step 3, before Step 4)

Insert into `dev-team/main.md` between the Execution loop and Step 4 (Scan).

For each task that reached Done in Step 3: read the `smoke_check` field from QA's APPROVED block
(see QA flow change below). Execute the probe via MCP gateway. Decision:

- **Probe passes** → log `[deploy-verify] Task NNNx: LIVE`. Status = Done (confirmed deployed).
- **Probe fails / returns pre-merge value** → status = `merged-pending-deploy` (NOT Done). Create
  ops task "Deploy sprint NNN batch — container rebuild required." Send:
  `send_telegram(work, "[deploy-gap] Task NNNx merged but NOT running. Ops task created.")`.
  Do NOT mark Done until ops rebuilds container and probe re-runs clean.
- **No probe defined** (doc-only, flow-only) → skip. Log `[deploy-verify] Task NNNx: no probe —
  skipped`. Flag in PM handoff for next similar task.

### QA Flow Change (complementary)

Extend QA's APPROVED block with a mandatory `smoke_check` field:

```
APPROVED
  commit: <sha>
  smoke_check:
    tool: <mcp_tool_name | "sql">
    call: <arguments or SQL>
    expected: <value that only the new code produces>
```

`smoke_check: none` is valid for pure doc/flow tasks (must include a brief reason). This makes the
deploy probe a first-class artifact of every task, defined at review time, not after-the-fact.

---

## §4 — Migration-Specific Concern

Seed/migration tasks (`*-seed` suffix) require a stronger probe than behavioral checking — they must
confirm the migration executed on the prod DB. SQL row-count or `PRAGMA table_info` probes are the
right idiom:

- `SELECT COUNT(*) FROM watchlist WHERE alert_drop_pct IS NOT NULL` — expected `>0` (1869b-seed)
- `PRAGMA table_info(table)` — assert new column present (future ALTER TABLE tasks)

If SQL probe returns 0 / column absent → migration never ran. The ops task created by Step 3.5 must
explicitly state: "migration only runs on container restart — re-run probe after rebuild."

QA `smoke_check` for seed tasks must set `type: migration` — Step 3.5 uses this to enforce the
stricter failure path (always creates ops task; never accepts `smoke_check: none`).

---

## §5 — Sequencing: 3 Atomic Tasks

| ID | Type | Zone | Owner | AC summary |
|----|------|------|-------|------------|
| **TNB6-A** | SPRINT-S | `.claude/flows/dev-team/main.md` + `.claude/flows/qa/main.md` | agent-father | Step 3.5 inserted in dev-team flow; `smoke_check` field in QA APPROVED template; next task verdict uses it |
| **TNB6-B** | SPRINT-S | `apps/mcp-server` interface layer | dev-mcp-server | `run_diagnostic_probe(type, query, expected)` MCP tool added; read-only SQL enforced (SELECT/PRAGMA only); unit tests cover pass/fail/bad-SQL |
| **TNB6-C** | FIX (doc only) | ops backlog for 1862a/f/j, 1865a, 1869a/b/seed | QA role | Retroactive `smoke_check` defined for all 7 undeployed sprints; attached to ops rebuild task (1876a-A5); checks re-run + logged after rebuild |

**Order:** TNB6-A first (zero infra, flow-only). TNB6-B after A (provides the MCP tool Step 3.5
calls). TNB6-C can run in parallel with B — it is doc-only and depends only on ops completing the
rebuild, not on TNB6-B being shipped.

DDD note for TNB6-B: new tool lives in `interface/mcp/tools/diagnostics/` (interface layer) and
calls `getDb()` from `infrastructure/db/schema.js` (existing pattern). No domain layer touch.

---

## §6 — Out of Scope

The existing 7 undeployed sprint instances (1862a, 1862f, 1862j, 1865a, 1869a, 1869b, 1869b-seed)
are NOT addressed by this brief. They are tracked separately:

- **1876a-A5** (diagnostic): confirm which sprints are undeployed
- **Ops backlog**: container rebuild to deploy all pending merged sprints

This brief addresses only the systemic process gap — it does not unblock or reschedule any existing
ops action. Do not conflate.

---

## ACs for This Brief

- [ ] Step 3.5 added to dev-team/main.md (Task A)
- [ ] `smoke_check` field added to QA APPROVED template (Task A)
- [ ] `run_diagnostic_probe` MCP tool exists, read-only, returns `{passed, actual, expected}` (Task B)
- [ ] 7 retroactive smoke_checks documented for ops rebuild (Task C)
- [ ] No task is marked Done without either a passing probe or an explicit `smoke_check: none` reason
- [ ] Migration tasks (`type: migration`) fail louder — ops task created + Telegram alert fired
