<!-- size-justification: 390L — operator-directed design brief (ORCH-STATE-HOT-COLD-SPLIT). Covers: measured evidence (verified 2026-06-26), all 4 root causes, hot/cold target schema, mutex-safe cutover plan, full reader-impact inventory, rollback, and 7-task decomposition for PM + agent-father. All content load-bearing for implementer handoff. -->

# Architecture Brief — ORCH-STATE-HOT-COLD-SPLIT

**Date:** 2026-06-26
**Author:** agents-architect
**Status:** DESIGN COMPLETE — handoff to PM + agent-father
**Supersedes:** Router diagnosis 2026-06-26 (router's measurements verified and extended here)

---

## 0. TL;DR

`docs/data/orch/orch-state.json` is **2.46 MB / 26,185 lines**. 53% is evictable terminal dead weight that burns agent context windows, invites stale-data hallucination, and forces every mutation to read+rewrite 2.46 MB. Target: **< 150 KB hot file** + append-only cold archive at `docs/data/orch/archive/YYYY-MM.json`. Four root causes → seven mechanical changes → five atomic tasks.

---

## 1. Measured Evidence (verified 2026-06-26T15:28Z)

### 1.1 File dimensions

| Metric | Value |
|---|---|
| File size | 2,461,925 bytes (2.46 MB) |
| Line count | 26,185 |
| Top-level key count | 20 (including 10 meta-tracking variants) |

### 1.2 Lane breakdown

| Lane | Items | Bytes | State |
|---|---|---|---|
| `task_board.done_verified` | 141 | 697,621 | **TERMINAL** — avg 4,951 bytes/item |
| `task_board.backlog` | 313 | 490,890 | **STALE** — avg 507-char prose desc/note fields |
| `task_board.done` | 241 | 427,706 | **TERMINAL** — avg 304-char verification field |
| `task_board.active_sprints` (truly active) | 13 sprints | 216,013 | HOT — keep |
| `task_board.active_sprints` (terminal) | 15 sprints | 86,410 | **EVICTABLE** — DONE/completed/done/SIGNED-OFF-PARTIAL |
| `task_board.archive` | 1 | 1,217 | Vestigial in-file archive |
| `signal_queue.rows` (terminal) | 96 of 97 | 84,703 | **TERMINAL** — READ/RESOLVED/SUPERSEDED/ACUTE-RESOLVED |
| `signal_queue.rows` (active) | 1 | ~900 | HOT — keep |
| `signal_queue.archive` | 45 | ~41,000 | **IN-FILE ARCHIVE** — same problem |
| `head` + related sections | — | ~20,000 | HOT — keep |

**Total evictable:** ~1,297,850 bytes (53% of file)

**Estimated hot file after eviction + backlog stubbing:** ~150 KB (see §2.1)

### 1.3 Confirmation of router diagnosis discrepancies

Router estimated 2.3 MB; actual is 2.46 MB (+6%). Router cited 3 root causes; this brief identifies 4. Router did not count 15 terminal sprints inside `active_sprints` (86 KB additional evictable). Router cited 8 meta keys; actual count is 10 (`_meta`, `meta`, `metadata`, `_updated_at`, `updated_at`, `meta_updated_at`, `_updated_by`, `updated_by`, `_ssot`, `_schema` — plus a separate top-level `tasks_backlog` key which is a third parallel-backlog artifact). **All four router root causes confirmed correct; this brief extends them.**

---

## 2. Root Causes

### RC-1 — In-file archive: eviction moves data within the same 2.46 MB blob

`pm/flow/task-archive.md` moves done tasks to `.task_board.archive[]` — a sibling array **inside the same file**. No file shrinkage occurs. The trigger (`active_sprints tasks > 80`) counts only tasks inside active sprints, never touches the top-level `done`/`done_verified` lanes (the real 697 KB + 427 KB). Current `archive[]` n=1 → the flow has effectively never fired against the real bloat. The same pattern applies to `signal_queue.archive[]` (45 items inline).

### RC-2 — Whole-file rewrite per mutation

Every writer reads 2.46 MB → modifies one field → rewrites 2.46 MB (atomic temp-then-rename per §2.3 of `2026-06-01-orch-state-consolidate.md`). PM and dev-team load the full 1.95 MB `task_board` on every planning cycle, including all terminal done/done_verified prose. The signal-dashboard skill added a two-phase delta-read for `signal_queue` — `task_board` has no equivalent protection.

### RC-3 — Schema meta-key sprawl

10 top-level tracking keys survive from successive migrations: `_meta`, `meta`, `metadata`, `_updated_at`, `updated_at`, `meta_updated_at`, `_updated_by`, `updated_by`, `_ssot`, `_schema`. Each writer stamps a different subset; `last-key-wins` semantics mean the ground-truth timestamp is ambiguous (memory: `feedback_ssot_duplicate_key`). The top-level `tasks_backlog` key is a third parallel-backlog artifact left over from an earlier schema version.

### RC-4 — Backlog prose inflation

Backlog items carry full free-text prose in `desc`, `note`, and `root_cause` fields (avg 507 chars/item × 313 items = 158 KB of in-file prose). This prose is load-bearing for PM planning but not for routine task-status reads by dev-team, system-auditor, and po sprint agents.

---

## 3. Target Schema

### 3.1 Hot file target — `docs/data/orch/orch-state.json` — < 150 KB

```jsonc
{
  "_schema": "v4",
  "_meta": {
    "updated_at": "<ISO-8601 UTC>",
    "updated_by": "<agent-id>",
    "ssot": true
  },

  "head": { /* unchanged — ~323 bytes */ },
  "dashboard_section_cache": { /* unchanged */ },
  "narrative": { /* unchanged */ },
  "session_handoff_status": { /* unchanged */ },
  "sprint_goal": { /* unchanged */ },
  "last_tick": { /* unchanged */ },
  "decision_journal": { /* unchanged */ },

  "task_board": {
    "_updated_at": "<ISO-8601 UTC>",
    "_updated_by": "<agent-id>",
    "active_sprints": [
      /* ONLY sprints with status IN (active, IN_PROGRESS, paused, pending-gate) */
      /* Sprint object unchanged — task fields unchanged */
    ],
    "backlog": [
      /* STUB ONLY: id + title + priority + size + type + zone + status + sprint */
      /* NO desc / note / root_cause / files — those live in cold backlog-detail */
      { "id": "<slug>", "title": "<≤80 chars>", "priority": "high|normal|low",
        "size": "XS|S|M|L|null", "type": "<type>", "zone": "<zone>",
        "status": "<status>", "sprint": "<sprint-id>",
        "detail_ref": "docs/data/orch/archive/backlog-detail.json#<id>" }
    ],
    "done": [
      /* LAST 10 ONLY — evict remainder to cold on every write */
    ]
    /* done_verified REMOVED from hot — all items go to cold on completion */
    /* archive[] REMOVED — replaced by external cold file */
  },

  "signal_queue": {
    "_updated_at": "<ISO-8601 UTC>",
    "_updated_by": "<agent-id>",
    "rows": [
      /* ONLY status IN (NEW, TRIAGED) — evict READ/RESOLVED/SUPERSEDED to cold */
    ]
    /* archive[] REMOVED — replaced by external cold file */
  }
}
```

**Removed from hot:** `_updated_at`, `updated_at`, `meta_updated_at`, `_updated_by`, `updated_by`, `meta`, `metadata`, `_ssot` (folded into `_meta`), `tasks_backlog` (dead key).

### 3.2 Cold file — `docs/data/orch/archive/YYYY-MM.json` — append-only

```jsonc
{
  "month": "YYYY-MM",
  "created_at": "<ISO-8601 UTC>",
  "done_tasks": [ /* full task objects evicted from done/done_verified */ ],
  "closed_sprints": [ /* full sprint objects evicted from active_sprints */ ],
  "signal_rows": [ /* full row objects evicted from signal_queue.rows + archive */ ],
  "backlog_detail": [ /* full backlog items with desc/note/root_cause */ ]
}
```

**Write contract:** append-only. Never read in the hot path. No agent loads this file during planning or execution cycles. Readable by system-auditor for forensic audit only (lazy-load, scoped query).

---

## 4. Migration / Cutover Plan

### 4.1 Sequencing (dependency order)

```
HSC-1 (create cold store + eviction script)  [dev — scripts/]
  └─→ HSC-2 (one-time migration: evict current bloat)  [pm triggers / dev runs]
        └─→ HSC-3 (repoint task-archive.md + pm flow)  [agent-father]
HSC-4 (backlog stub enforcement + cold detail write)  [agent-father — parallel after HSC-1]
HSC-5 (meta-key collapse + schema v4 bump)  [dev + agent-father — last, highest risk]
HSC-6 (evict-on-terminal rule in pm/dev-team flows)  [agent-father — parallel after HSC-1]
HSC-7 (signal_queue cold eviction in signal-dashboard skill)  [agent-father — parallel after HSC-1]
```

### 4.2 Mutex safety

Every write to `orch-state.json` MUST use the atomic temp-then-rename protocol from `2026-06-01-orch-state-consolidate.md §2.3`. The structural sentinel guard (`jq -e '.head and .task_board and .signal_queue'`) must be updated to also assert `._meta` presence after HSC-5 lands.

**Migration window lock:** HSC-2 (one-time eviction) must be run while no other agent holds the commit-mutex. PM claims `commit-mutex:main` via task_claim before running the eviction script, releases after atomic write + git commit.

**Schema version gate:** After HSC-5 bumps `_schema` to `v4`, any writer still stamping the old 8 meta keys will produce harmless extra fields (no data loss) until reader cleanup is complete — safe to roll forward incrementally.

### 4.3 Hot-path reader protection during transition

Between HSC-2 (eviction) and HSC-3 (flow repoint), pm/flow/task-archive.md may attempt to move items to the now-empty `done`/`done_verified` lanes. This is safe — the lanes still exist in the hot file (just capped to last 10); the archive flow will find nothing to move. No reader break during transition.

---

## 5. Reader-Impact Inventory

### 5.1 Reads that touch terminal lanes (breaking after HSC-2)

| Reader | File | Impact | Migration |
|---|---|---|---|
| pm task-archive trigger | `docs/agents/pm/flow/task-archive.md` | Trigger counts wrong denominator; target is wrong (in-file array) | HSC-3: rewrite trigger + destination |
| pm planning cycle | `docs/agents/pm/flow/main.md` | Loads done/done_verified into context | Add jq filter: read only `active_sprints` + `backlog[].{id,title,priority}` |
| po sprint-signoff | `docs/agents/po/flow/sprint-signoff.md` | Reads active_sprints for DONE sprints | After HSC-2: terminal sprints absent from hot — signoff reads cold (lazy-load ok) |
| system-auditor D4 | `docs/agents/system-auditor/audit-dimensions.md` | Cross-checks done lane for orphan task_ids | Re-point done-lane checks to cold file; hot-file check scope = active_sprints + backlog only |
| dev-team post-cycle | `docs/agents/dev-team/flow/post-cycle.md` | Writes task status updates | No lane-read change; write path unchanged (writes to active_sprints tasks only) |

### 5.2 Reads that touch backlog prose (affected by HSC-4)

| Reader | File | Impact | Migration |
|---|---|---|---|
| pm backlog planning | `docs/agents/pm/flow/main.md` | Reads full backlog desc for sprint selection | PM must lazy-load `backlog-detail.json` when planning a task (load by id via detail_ref) |
| po triage | `docs/agents/po/flow/triage-signals.md` | Reads backlog to check for duplicate tasks | Check against stub (id + title); no need for full desc |
| ba spec | `docs/agents/ba/flow/main.md` | Reads backlog for spec context | Load detail_ref lazily when writing spec |

### 5.3 Reads that touch signal_queue terminal rows (affected by HSC-7)

| Reader | File | Impact | Migration |
|---|---|---|---|
| signal-dashboard §READ | `.claude/skills/signal-dashboard/SKILL.md` | Reads rows[] for NEW rows | After HSC-7: rows[] only has active rows; §READ unaffected (it filters by status anyway) |
| signal-dashboard §PRUNE | `.claude/skills/signal-dashboard/SKILL.md` | Currently archives to inline `archive[]` | HSC-7: rewrite §PRUNE to evict to cold file instead |
| system-auditor signal scan | `docs/agents/system-auditor/handlers.md` | Reads all rows for audit | Re-point full-history scan to cold file (lazy-load) |

### 5.4 Reads that touch removed meta keys (affected by HSC-5)

183 `.task_board.` references exist across docs/. The meta keys (`_updated_at`, `updated_at`, etc.) appear in writer patterns across pm, po, and system-auditor flows. **HSC-5 must inventory these before executing.** Known high-risk writers: any agent that stamps `updated_at` or `updated_by` at top level must be updated to write `_meta.updated_at` + `_meta.updated_by`. Preserving `_schema` and `_ssot` inside `_meta.ssot`/`_meta.schema` is safe since no reader parses these as booleans at top level.

---

## 6. Rollback Plan

**Per task rollback:**
- HSC-1/HSC-2: git revert the eviction commit; cold archive files are purely additive (no agent reads them); revert leaves hot file restored. Risk: LOW.
- HSC-3/HSC-4/HSC-6/HSC-7: flow .md edits via agent-father; revert via git revert. Risk: LOW.
- HSC-5: meta-key collapse is the highest-risk change. Before executing, agent-father must snapshot the list of all writers that stamp the 8 old keys (grep for `_updated_at\|updated_at\|meta_updated_at\|_updated_by\|updated_by` in docs/agents/ + .claude/skills/). Rollback: git revert + writers continue stamping old keys; schema stays at v3 until next attempt.

**Abort condition:** If any writer produces an orch-state.json that fails the structural sentinel (`jq -e '.head and .task_board and .signal_queue and ._meta'`), atomic-write ABORTS before rename. Hot file is never clobbered.

---

## 7. Task Batch for PM

### HSC-1 — Create cold archive store + eviction script
```
id: HSC-1
title: Create cold archive directory + orch-cold-evict.sh script
zone: scripts/
owner: developer
priority: high
size: S
depends: none
ac:
  - docs/data/orch/archive/ directory exists
  - scripts/orch-cold-evict.sh evicts items matching criteria to docs/data/orch/archive/YYYY-MM.json
  - Script uses atomic write (temp-then-rename) + commit-mutex (task_claim commit-mutex:main)
  - Structural sentinel check on both source (before eviction) and cold file (after append)
  - Script is idempotent (re-run evicts nothing if already evicted)
criteria:
  - Evict from done[]: items older than 7 days; retain last 10 by created_at desc
  - Evict from done_verified[]: ALL items (terminal by definition)
  - Evict from active_sprints[]: sprints with status IN (DONE, done, DONE-WITH-CAVEATS, completed, SIGNED-OFF-PARTIAL, BCTC-*)
  - Evict from signal_queue.rows[]: status IN (READ, RESOLVED, SUPERSEDED, ACUTE-RESOLVED-ROOT-TRACKED)
  - Evict from signal_queue.archive[]: all 45 items
```

### HSC-2 — One-time cold migration (run script against current bloat)
```
id: HSC-2
title: One-time eviction of current orch-state.json terminal bloat
zone: docs/data/orch/
owner: pm (triggers) + developer (runs)
priority: high
size: XS
depends: HSC-1
ac:
  - scripts/orch-cold-evict.sh runs successfully under commit-mutex
  - docs/data/orch/orch-state.json post-eviction size < 500 KB (interim target — backlog prose still present)
  - docs/data/orch/archive/2026-06.json created with all evicted items
  - jq . orch-state.json exits 0
  - git show --stat HEAD shows orch-state.json as modified (not created)
note: Run immediately after HSC-1. Do NOT run while any agent holds commit-mutex.
```

### HSC-3 — Repoint pm/flow/task-archive.md + pm planning read scope
```
id: HSC-3
title: Repoint task-archive.md trigger+destination + narrow pm planning reads
zone: docs/agents/pm/
owner: agent-father (via agent-md-factory discipline)
priority: high
size: S
depends: HSC-1
ac:
  - task-archive.md trigger: fire when done[] > 10 OR done_verified[] > 0
  - task-archive.md destination: invoke scripts/orch-cold-evict.sh (not in-file archive[])
  - task-archive.md removes .task_board.archive[] lane references
  - pm/flow/main.md planning step reads only: active_sprints + backlog[].{id,title,priority,size,type,zone,status}
  - No reference to done_verified[] or done[] in pm hot-path reads
```

### HSC-4 — Backlog stub enforcement + cold detail store
```
id: HSC-4
title: Strip backlog prose to stubs; write full desc to cold backlog-detail.json
zone: docs/agents/pm/ + docs/data/orch/archive/
owner: agent-father + developer
priority: normal
size: M
depends: HSC-1
ac:
  - pm/flow/main.md: when adding backlog item, write stub (id+title+priority+size+type+zone+status+sprint+detail_ref) to hot file + full object (with desc/note/root_cause) to docs/data/orch/archive/backlog-detail.json
  - One-time migration: strip prose from existing 313 backlog items in hot file; write full objects to backlog-detail.json
  - detail_ref format: docs/data/orch/archive/backlog-detail.json#<id>
  - pm/flow/main.md loads backlog-detail.json lazily when planning (reads only the item being promoted to sprint)
  - Post-migration backlog bytes < 50 KB
```

### HSC-5 — Collapse 10 meta keys → _meta + schema v4
```
id: HSC-5
title: Collapse top-level meta-tracking keys to single _meta object; bump _schema to v4
zone: docs/data/orch/ + docs/agents/ + .claude/skills/
owner: agent-father (flow/skill edits) + developer (atomic write guard update)
priority: normal
size: M
depends: HSC-2 (hot file must be clean before schema rename)
risk: HIGHEST of all tasks — must inventory all 8 old-key writers before executing
ac:
  - All 8 old keys (_meta/meta/metadata/_updated_at/updated_at/meta_updated_at/_updated_by/updated_by) removed from top level
  - tasks_backlog top-level key removed (dead artifact)
  - New structure: _meta: {updated_at, updated_by, schema: "v4", ssot: true}
  - _ssot and _schema keys removed (folded into _meta)
  - Atomic write structural sentinel updated: jq -e '.head and .task_board and .signal_queue and ._meta'
  - All writers updated to stamp _meta.updated_at + _meta.updated_by
  - Pre-execution: agent-father produces inventory of all files that write any of the 8 old keys
  - Post-execution: grep -r '"_updated_at":\|"updated_at":\|"meta_updated_at":\|"_updated_by":\|"updated_by":' docs/agents/ .claude/skills/ scripts/ → 0 hits targeting orch-state.json
```

### HSC-6 — Evict-on-terminal rule in pm + dev-team flows
```
id: HSC-6
title: Add evict-on-terminal hook: when PM marks task DONE_VERIFIED → immediate cold eviction
zone: docs/agents/pm/ + docs/agents/dev-team/
owner: agent-father
priority: normal
size: S
depends: HSC-1
ac:
  - pm/flow/main.md: after writing task to done_verified[], call scripts/orch-cold-evict.sh (evicts done_verified immediately)
  - dev-team/flow/post-cycle.md: after sprint seal, call evict script for that sprint's terminal items
  - done_verified[] lane never grows beyond 5 items in hot file after this rule activates
```

### HSC-7 — Signal-dashboard §PRUNE → cold file eviction
```
id: HSC-7
title: Rewrite signal-dashboard §PRUNE to evict to cold file (not inline archive[])
zone: .claude/skills/signal-dashboard/
owner: agent-father
priority: normal
size: S
depends: HSC-1
ac:
  - signal-dashboard/SKILL.md §PRUNE: evict rows older than 24h with status IN (READ, RESOLVED, SUPERSEDED) to cold archive via scripts/orch-cold-evict.sh (or inline jq equivalent)
  - signal_queue.archive[] lane removed from schema
  - system-auditor signal scan loads cold file lazily when doing full-history audit
  - Existing auditor write path (signal_queue.rows[] append) is UNCHANGED
```

---

## 8. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| HSC-2 concurrent writer during one-time migration | HIGH | Claim commit-mutex:main before running; check heartbeat freshness first |
| HSC-5 writer misses old-key inventory — stale writer stamps removed keys | HIGH | Pre-execution inventory mandatory (agent-father grep before editing); old keys harmless if still present (JSON last-key-wins safe for writers) |
| HSC-3 task-archive.md fires mid-migration (between HSC-1 and HSC-3) | MED | Window is short; if it fires, it writes to in-file archive[] (still safe — just doesn't shrink file further); HSC-3 cleanup handles it |
| Cold file grows unboundedly | LOW | Monthly rotation (YYYY-MM.json); no reader loads full cold file in hot path; launchd docker-cleanup covers disk pressure |
| System-auditor reads empty done/done_verified post-HSC-2 | LOW | Auditor cold-file lazy-load (HSC per ac above); forensic audit only, not hot-path |

---

## 9. Incident Relation

This brief directly addresses the agent context-bloat failure modes recorded in:
- `feedback_auditor_orchstate_fulldoc_overwrite_collapses_ssot` — full-file overwrite risk amplified by 2.46 MB size
- `feedback_signal_row_status_lags_groundtruth` — 96 terminal rows polluting signal_queue context
- `feedback_auditor_reemit_clobbers_router_triage` — stale done-task prose re-cited as live state

**Context-keeping benefit:** After HSC-2, pm and dev-team load ~500 KB instead of 2.46 MB. After HSC-4, the final hot file is ~150 KB — a 94% context reduction. Stale done-task verification prose (the primary hallucination vector) is in cold storage, unreachable during normal planning cycles.

---

_Brief owner: agents-architect. Signal: `docs/signals/orch-state-hot-cold-split-20260626T152808Z.json` → pm._
_Implementation routing: HSC-1/HSC-2 → developer; HSC-3/HSC-4/HSC-6/HSC-7 → agent-father; HSC-5 → agent-father + developer (coordinated)._
