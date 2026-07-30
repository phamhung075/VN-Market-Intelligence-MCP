<!-- size-justification: 186L — sequential eviction+archive sub-flow (sprint eviction, bloat verify, commit-mutex, signal closure, cold-evict, post-verify, decision-journal-archive pointer, commit, release); splitting fragments one atomic held-mutex operation. UC-MDH-P4 2026-07-23: pre-eviction id capture + Step 5.5 decision-journal-archive pointer + Step 6 pathspec extension (+17L total) — was a promised-but-missing archival step (docs/data/file-size-caps.json already claimed "Archived → docs/archive/decisions/ at sprint close by pm"); this wires it in for real. -->
# PM — Task Archive Sub-Flow

**Trigger:** terminal-lane bloat — `done[] > 10` OR `done_verified[] > 0`
**Parent flow:** `docs/agents/pm/flow/main.md`

## Input
- Terminal-lane counts detected by pm/flow/main.md Step 1 bloat gate

## Output
- Terminal tasks, sprints, and signal rows cold-evicted to `docs/data/orch/archive/YYYY-MM.json`
- Hot file `.task_board.done[]` trimmed to last 10 items; `.task_board.done_verified[]` emptied
- `signal_queue` rows referenced by a `done_verified[]` task's `origin_signal_id` flipped `READ→RESOLVED` in the same commit (no-op if `origin_signal_id` absent — additive, existing behaviour unchanged)
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

**Pre-eviction sprint-id capture** (feeds Step 5.5's decision-journal-archive pointer below — must run BEFORE either eviction path so the later diff is accurate):
```bash
PRE_EVICT_ACTIVE_IDS=$(jq -r '.task_board.active_sprints[]?.id // empty' "$PROJECT_ROOT/docs/data/orch/orch-state.json" | sort -u)
```

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

4. **Apply via gated wrapper:** pipe candidate through orch-apply.sh (validates + CAS-mtime + atomic rename).
   NARROW NAMED BYPASS: this write moves sprints out of `active_sprints[]` into one-line
   `closed_sprints[]` stubs (no `tasks[]`), which legitimately shrinks `task_total` — set
   `ORCH_APPLY_ALLOW_SHRINK` (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER) so the
   conservation guard does not reject it. This is one of only 2 call sites in the repo
   permitted to set this env var — do not copy this pattern elsewhere without architect sign-off.
   ```bash
   cat "$TMP" | ORCH_APPLY_ALLOW_SHRINK="pm/task-archive.md:sprint-eviction" \
     bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
     || { rm -f "$TMP"; echo "[pm/task-archive] ABORTED: orch-apply.sh failed" >&2; exit 1; }
   rm -f "$TMP"
   ```
   On non-zero exit: candidate is NOT applied; live SSOT untouched.

**If zero evictable sprints and zero null-id sprints:** skip section, proceed to Step 1.

---

## Steps

0. **Resolve `owner_client_session`** — REQUIRED, no default (coordinationTools.ts:104-110,
   P1-FINAL/TASK_1980). Substitute the ACTUAL resolved value of your session's
   `CLAUDE_CODE_SESSION_ID` (Bash: `echo $CLAUDE_CODE_SESSION_ID`, or the literal value your
   dispatcher already substituted into your spawn prompt as a coordination parameter). NEVER write
   the literal text `$CLAUDE_CODE_SESSION_ID` inside a `task_claim`/`task_release` call — an
   LLM-issued call is a direct function call, not a shell command, so the variable is NOT expanded
   (session memory: `feedback_llm_issued_call_tool_does_not_expand_session_id_variable`). Reuse this
   ONE resolved value for every claim/release below.

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
   task_claim(task_id="pm-archive-<ISO8601slug>", task_kind="commit-mutex",
     owner_agent="pm", owner_client_session="<resolved value from Step 0>", ttl_seconds=180)
   ```

3. **Signal closure back-reference** (additive — runs BEFORE the eviction script moves `done_verified[]` off the hot file, while commit-mutex is still held; no-op if no task carries `origin_signal_id`):
   ```bash
   SIGNAL_IDS=$(jq -r '[.task_board.done_verified[]? | select(.origin_signal_id != null) | .origin_signal_id] | unique | .[]' \
     "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   if [ -z "$SIGNAL_IDS" ]; then
     echo "[pm/task-archive] No origin_signal_id on done_verified[] — signal closure no-op"
   else
     for SID in $SIGNAL_IDS; do
       jq --arg sid "$SID" \
         '.signal_queue.rows |= map(if .id == $sid and .status == "READ" then .status = "RESOLVED" else . end)' \
         "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
         | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
         || echo "[pm/task-archive] WARN: signal closure flip failed for ${SID} — continuing eviction"
       echo "[pm/task-archive] Signal closure: ${SID} READ→RESOLVED (origin task DONE_VERIFIED)"
     done
   fi
   ```
   CLOSE semantics (`READ→RESOLVED`) per `.claude/skills/signal-dashboard/SKILL.md` § CLOSE — reference only, do not duplicate its body here. This write lands on disk now (uncommitted); Step 6 below stages `docs/data/orch/orch-state.json` regardless, so the flip rides in the SAME commit as the archive/eviction write — no separate commit, no manual step.

4. **Run eviction script** (called while commit-mutex is held):
   ```bash
   bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
   # Script atomically: evicts done_verified[] (ALL items — terminal by definition),
   # trims done[] to last 10 by created_at desc (evicts items beyond rank 10 AND older than 7 days),
   # evicts terminal active_sprints (status IN DONE/done/DONE-WITH-CAVEATS/completed/SIGNED-OFF-PARTIAL/BCTC-*)
   # and terminal signal_queue rows → docs/data/orch/archive/YYYY-MM.json
   # Structural sentinel (.head .task_board .signal_queue) is checked inside the script;
   # script aborts before any rename on any validation failure.
   ```

5. **Verify post-eviction state** (includes validate.sh gate — SHG-3):
   ```bash
   # Full schema validation gate (SHG-3 — runs on the live file post-rename)
   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
     || { echo "[pm/task-archive] ABORT: post-eviction validation failed"; exit 1; }

   DV_POST=$(jq '.task_board.done_verified | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   DONE_POST=$(jq '.task_board.done | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
   if [ "$DV_POST" -gt 0 ] || [ "$DONE_POST" -gt 10 ]; then
     echo "[pm/task-archive] ERROR: post-eviction counts unexpected (done=$DONE_POST, done_verified=$DV_POST)"
     task_release(task_id: "pm-archive-<ISO8601slug>", owner_client_session: "<resolved value from Step 0>")
     exit 1
   fi
   echo "[pm/task-archive] Post-eviction OK — done=$DONE_POST, done_verified=$DV_POST"
   ```

5.5. **Archive newly-closed sprint journals** (pointer only — full contract in `scripts/agents-flow/decision-journal-archive.sh`; sprints close via BOTH §Sprint Eviction above AND Step 4's `orch-cold-evict.sh`, so this diff must run here, after both, not after the §Sprint Eviction orch-apply block):
   ```bash
   POST_EVICT_ACTIVE_IDS=$(jq -r '.task_board.active_sprints[]?.id // empty' "$PROJECT_ROOT/docs/data/orch/orch-state.json" | sort -u)
   comm -23 <(echo "$PRE_EVICT_ACTIVE_IDS") <(echo "$POST_EVICT_ACTIVE_IDS") \
     | bash "$PROJECT_ROOT/scripts/agents-flow/decision-journal-archive.sh"
   # Read-only w.r.t. orch-state (jq queries only); moves land via git mv — ride the SAME commit at Step 6.
   ```

6. **Commit (mutex still held)**:
   ```bash
   YYYYMM=$(date -u +%Y-%m)
   # own_paths: docs/data/orch/orch-state.json + docs/data/orch/archive/YYYY-MM.json
   # + decision-journal moves from Step 5.5 (old+new paths — pathspec must cover
   #   renames per feedback_pathspec_commit_drops_rename_deletion)
   git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json" \
     "$PROJECT_ROOT/docs/agent-memory/decisions/" "$PROJECT_ROOT/docs/archive/decisions/"
   git commit -m "chore(tasks): cold-evict ${DV_N} done_verified + excess done tasks → archive/${YYYYMM}.json" \
     -- docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json" \
        "$PROJECT_ROOT/docs/agent-memory/decisions/" "$PROJECT_ROOT/docs/archive/decisions/"
   ```

7. **Release mutex**:
   ```
   task_release(task_id: "pm-archive-<ISO8601slug>", owner_client_session: "<resolved value from Step 0>")
   ```

## RETURN

```
DONE: Cold-evicted {DV_N} done_verified + excess done tasks → docs/data/orch/archive/YYYY-MM.json
HOT FILE: done[]={DONE_POST}, done_verified[]=0
NEXT: <resume original flow target>
PIPELINE: continue
```
