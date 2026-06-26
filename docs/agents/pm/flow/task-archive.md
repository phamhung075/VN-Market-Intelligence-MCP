# PM — Task Archive Sub-Flow

**Trigger:** terminal-lane bloat — `done[] > 10` OR `done_verified[] > 0`
**Parent flow:** `docs/agents/pm/flow/main.md`

## Input
- Terminal-lane counts detected by pm/flow/main.md Step 1 bloat gate

## Output
- Terminal tasks, sprints, and signal rows cold-evicted to `docs/data/orch/archive/YYYY-MM.json`
- Hot file `.task_board.done[]` trimmed to last 10 items; `.task_board.done_verified[]` emptied
- Single commit per `docs/policies/commit-convention.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** pm/flow/main.md when terminal-lane bloat is detected (done[] > 10 OR done_verified[] > 0), or Step 4.1 housekeeping  
**Receives:** bloat detection signal (done_n, done_verified_n counts) from Step 1 gate  
**Produces:** cold archive updated (`docs/data/orch/archive/YYYY-MM.json`); hot file trimmed; git commit  
**Hand off to:** main terminal → resume original flow path (planning or housekeeping)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`  
**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

## docs_required
> Read in parallel before Step 1.
- `docs/data/orch/orch-state.json` — structural sentinel + lane counts via jq slice only (NEVER cat full file to model context — `docs/standards/orch-state-access.md §1`)

## § Sprint Eviction (runs before done/done_verified eviction)

**Source:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 2  
**Triggered:** always on entry to task-archive (sprint check is cheap; skips if zero evictable).

**TERMINAL_SET:** `["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]`

1. Run eviction predicate to identify evictable sprints (all tasks in TERMINAL_SET):
   ```bash
   TERMINAL='["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]'
   EVICTABLE=$(jq --argjson T "$TERMINAL" '
     [.task_board.active_sprints[]
      | select(.id != null)
      | select([ .tasks[]?.status ] | all(. as $s | $T | index($s) != null))
      | .id
     ]' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   ```

2. For each evictable sprint:
   - Write full sprint object to `docs/data/orch/archive/YYYY-MM.json` under `.closed_sprints[]`
   - Write one-line stub to `task_board.closed_sprints[]` in hot file:
     ```json
     { "id": "<id>", "title": "<label>", "closed_at": "<ISO-8601 UTC>",
       "task_count": <n>, "detail_ref": "docs/data/orch/archive/YYYY-MM.json#closed_sprints/<id>" }
     ```
   - Remove from `active_sprints[]`

3. Quarantine null-id sprints unconditionally (do not check task statuses):
   - Write to cold archive under `.quarantine_nullid[]` as
     `{ "id": "QUARANTINED-NULL-ID-<index>", "quarantine_reason": "null id", "tasks": [...] }`
   - Remove from `active_sprints[]` (no hot-file stub — corrupt artifacts)

4. **Validate before rename:** run `bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP"`.
   On non-zero exit: `rm -f "$TMP"` and abort (leave live SSOT untouched).

5. Atomic rename: `mv "$TMP" "$PROJECT_ROOT/docs/data/orch/orch-state.json"`

**If zero evictable sprints and zero null-id sprints:** skip section, proceed to Step 1.

---

## Steps

1. **Verify bloat condition** — confirm trigger via jq slices:
   ```bash
   DONE_N=$(jq '.task_board.done | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   DV_N=$(jq '.task_board.done_verified | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   if [ "$DONE_N" -le 10 ] && [ "$DV_N" -eq 0 ]; then
     echo "[pm/task-archive] No bloat — done=$DONE_N, done_verified=$DV_N; skipping"
     exit 0
   fi
   echo "[pm/task-archive] Bloat detected — done=$DONE_N, done_verified=$DV_N; cold eviction required"
   ```

2. **Claim commit-mutex** (required before running eviction script):
   ```
   task_claim(task_kind="commit-mutex", task_id="pm-archive-<ISO8601slug>",
     owner_agent="pm", ttl_seconds=180)
   ```

3. **Run eviction script** (called while commit-mutex is held):
   ```bash
   bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
   # Script atomically: evicts done_verified[] (ALL items — terminal by definition),
   # trims done[] to last 10 by created_at desc (evicts items beyond rank 10 AND older than 7 days),
   # evicts terminal active_sprints (status IN DONE/done/DONE-WITH-CAVEATS/completed/SIGNED-OFF-PARTIAL/BCTC-*)
   # and terminal signal_queue rows → docs/data/orch/archive/YYYY-MM.json
   # Structural sentinel (.head .task_board .signal_queue) is checked inside the script;
   # script aborts before any rename on any validation failure.
   ```

4. **Verify post-eviction state** (includes validate.sh gate — SHG-3):
   ```bash
   # Full schema validation gate (SHG-3 — runs on the live file post-rename)
   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
     || { echo "[pm/task-archive] ABORT: post-eviction validation failed"; exit 1; }

   DV_POST=$(jq '.task_board.done_verified | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   DONE_POST=$(jq '.task_board.done | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   if [ "$DV_POST" -gt 0 ] || [ "$DONE_POST" -gt 10 ]; then
     echo "[pm/task-archive] ERROR: post-eviction counts unexpected (done=$DONE_POST, done_verified=$DV_POST)"
     task_release(task_id: "pm-archive-<ISO8601slug>")
     exit 1
   fi
   echo "[pm/task-archive] Post-eviction OK — done=$DONE_POST, done_verified=$DV_POST"
   ```

5. **Commit (mutex still held)**:
   ```bash
   YYYYMM=$(date -u +%Y-%m)
   # own_paths: docs/data/orch/orch-state.json + docs/data/orch/archive/YYYY-MM.json
   git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
   git commit -m "chore(tasks): cold-evict ${DV_N} done_verified + excess done tasks → archive/${YYYYMM}.json"
   ```

6. **Release mutex**:
   ```
   task_release(task_id: "pm-archive-<ISO8601slug>")
   ```

## RETURN

```
DONE: Cold-evicted {DV_N} done_verified + excess done tasks → docs/data/orch/archive/YYYY-MM.json
HOT FILE: done[]={DONE_POST}, done_verified[]=0
NEXT: <resume original flow target>
PIPELINE: continue
```
