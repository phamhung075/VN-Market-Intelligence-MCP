---
sprint: SHG
task_id: SHG-3
owner: agent-father
zone: docs/agents/ + .claude/skills/ + scripts/
size: S
priority: HIGH
depends_on: [SHG-1]
blocks: [SHG-5]
---

## TLDR

Wire `scripts/orch-state-validate.sh` into all 7 orch-state write paths. Each path calls the validation gate BEFORE atomic rename with pattern: `validate.sh "$TMP" || { rm -f "$TMP"; exit 1; }`.

## [PM] Planning Context

**Source brief:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4.3–4.4

**Zone:** Multiple — requires modifications to agent and skill files

**Acceptance Criteria:**
- [ ] All 7 write paths listed in § 4.3 of brief call validate.sh before atomic rename
- [ ] Write paths: pm/main, pm/task-archive, dev-team/post-cycle, po/sprint-signoff, signal-dashboard, system-auditor, orch-cold-evict.sh
- [ ] Pattern correct: `bash scripts/orch-state-validate.sh "$TMP" || { rm -f "$TMP"; exit 1; }`
- [ ] orch-cold-evict.sh (HSC-1 script) includes the wire-in
- [ ] No write path bypasses the gate
- [ ] Verified by: triggering a known-bad write (e.g., inject invalid JSON) and confirming ABORTED message + no rename occurs

**Files to read first:**
- `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4.3 (complete write-path list)
- Each target file to understand its write pattern:
  - `docs/agents/pm/flow/main.md` — atomic write pattern in Step 3
  - `docs/agents/pm/flow/task-archive.md` — atomic write in Step 4
  - `docs/agents/dev-team/flow/post-cycle.md` — orch-state writes
  - `docs/agents/po/flow/sprint-signoff.md` — orch-state writes
  - `.claude/skills/signal-dashboard/SKILL.md` — signal_queue writes
  - `docs/agents/system-auditor/handlers.md` — orch-state writes
  - `scripts/orch-cold-evict.sh` — will be created by HSC-1

**Files to modify:**
- `docs/agents/pm/flow/main.md` (main.md atomic write)
- `docs/agents/pm/flow/task-archive.md` (task-archive atomic write)
- `docs/agents/dev-team/flow/post-cycle.md` (post-cycle writes)
- `docs/agents/po/flow/sprint-signoff.md` (sprint-signoff writes)
- `.claude/skills/signal-dashboard/SKILL.md` (signal-dashboard writes)
- `docs/agents/system-auditor/handlers.md` (auditor writes)
- `scripts/orch-cold-evict.sh` (if not already present; verify HSC-1 completion status)

**Dependencies:**
- SHG-1 must be complete (validate.sh must exist)

**Knowledge needed:**
- `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md` (HSC-1 context on orch-cold-evict.sh)
- `docs/protocols/fail-loud-protocol.md` (error handling pattern)

**Note:**
This task can run in parallel with SHG-2 (status migration). Both are ready after SHG-1 lands. Verify that SHG-2 has completed before proceeding to SHG-4 (sprint eviction rule), since eviction predicate depends on canonical status values.

---

## Handoff Detail

Each of the 7 write paths follows this pattern for atomic writes:

```bash
# Old pattern (no validation):
jq '.path_to_update |= ...' orch-state.json > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json

# New pattern (with validation):
jq '.path_to_update |= ...' orch-state.json > "$TMP"
bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
  || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
mv "$TMP" docs/data/orch/orch-state.json
```

The validation gate is a hard fail — if validate.sh exits non-zero, the temp file is deleted and the write is aborted before rename.

### Known write paths:

1. **pm/main.md** — Step 3 (when adding tasks to board)
2. **pm/task-archive.md** — Step 4 (when archiving done tasks)
3. **dev-team/post-cycle.md** — (when marking tasks DONE/DONE_VERIFIED after dev work)
4. **po/sprint-signoff.md** — (when closing sprint, updating status)
5. **signal-dashboard** — (when writing signal rows to signal_queue)
6. **system-auditor/handlers.md** — (when writing audit signals)
7. **scripts/orch-cold-evict.sh** — (HSC-1 output; verify it includes the gate)

Grep and confirm each file contains the pattern. If found, no change needed. If missing, add the validation call.

