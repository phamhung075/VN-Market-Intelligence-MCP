---
sprint: SHG
task_id: SHG-1
owner: developer
zone: scripts/
size: XS
priority: HIGH
depends_on: []
blocks: [SHG-2, SHG-3]
---

## TLDR

Create `scripts/orch-state-validate.sh` with 6 validation checks (G-1…G-6) that gates all writes to orch-state.json. JSON validity, structural sentinel, lane types, null sprint IDs, canonical status enum (warn-only initially), and last_tick skew check.

## [PM] Planning Context

**Source brief:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4

**Zone:** scripts/ — standalone shell utility

**Acceptance Criteria:**
- [ ] File exists at `scripts/orch-state-validate.sh`, executable (`chmod +x`)
- [ ] G-1 (JSON validity) implemented as hard exit 1
- [ ] G-2 (structural sentinel: .head, .task_board, .signal_queue present) as hard exit 2
- [ ] G-3 (lane types are arrays) as hard exit 3
- [ ] G-4 (no null sprint IDs in active_sprints) as hard exit 4
- [ ] G-5 (task status values in canonical enum) as WARN-only (exit 0) initially
- [ ] G-6 (last_tick and head.last_tick within 2 hours) as hard exit 6
- [ ] Script is idempotent and side-effect-free (read-only probe)
- [ ] Signature: `bash scripts/orch-state-validate.sh <path-to-json>` exits 0 on valid, non-zero on fail
- [ ] Test: pass snapshot of current orch-state.json → exit 0; inject null sprint id → exit 4; inject invalid JSON → exit 1

**Files to read first:**
- `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4.1–4.2 (contract + checks)
- `docs/standards/orch-state-access.md` (read patterns, jq slicing)

**Files to create:**
- `scripts/orch-state-validate.sh` — the validation gate

**Files to modify:**
- None (SHG-1 is creation-only)

**Dependencies:**
- None — this is the foundation task

**Knowledge needed:**
- `docs/policies/dev-standards.md` § Script Persistence
- Brief § 4.3 wire-in points (for context on where this script will be called)

**Note:**
After this task lands, SHG-2 (pm-owned status migration) will be executable. Then SHG-3 and SHG-5 depend on this script being wired into write paths. Do not proceed with SHG-4 (sprint eviction) until SHG-2 status migration is verified complete.

---

## Handoff Detail

The script is a validation gate that prevents invalid orch-state writes. It performs 6 checks in order:

1. **G-1: JSON validity** — `jq empty` on the file
2. **G-2: Structural sentinel** — `.head != null AND .task_board != null AND .signal_queue != null`
3. **G-3: Lane types are arrays** — `.task_board.active_sprints`, `.task_board.backlog`, `.task_board.done`, `.signal_queue.rows` are all arrays
4. **G-4: No null sprint IDs** — count sprints with `.id == null` in `active_sprints[]`, exit 4 if any found
5. **G-5: Status enum check** — task statuses must be in canonical enum `["BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE","DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED"]`; WARN-only for now (exit 0), will be hard gate after SHG-2 migration + SHG-3 completion
6. **G-6: last_tick skew** — `|head.last_tick - last_tick| < 7200` (2 hours)

The script is called from every orch-state write path BEFORE atomic rename:

```bash
bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
  || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
```

Full jq logic and pattern in brief § 4.2.

---

**Wire-in after this task lands:** SHG-3 will add calls to this script in 7 write paths (pm/main, pm/task-archive, dev-team/post-cycle, po/sprint-signoff, signal-dashboard, system-auditor, orch-cold-evict.sh).

