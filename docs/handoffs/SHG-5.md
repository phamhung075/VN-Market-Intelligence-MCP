---
sprint: SHG
task_id: SHG-5
owner: developer
zone: scripts/
size: XS
priority: NORMAL
depends_on: [SHG-2, SHG-3]
blocks: []
---

## TLDR

Uncomment `exit 5` in `scripts/orch-state-validate.sh` line ~373 to promote G-5 (status enum check) from WARN-only to hard gate. After this, any orch-state write with non-canonical status values will ABORT before rename.

## [PM] Planning Context

**Source brief:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4.4

**Zone:** scripts/ — validation gate hardening

**Acceptance Criteria:**
- [ ] Line `# exit 5` in scripts/orch-state-validate.sh uncommented (becomes bare `exit 5`)
- [ ] Verification: create a test by injecting status="done" (lowercase, non-canonical) into a temp orch-state.json copy
- [ ] Run validate.sh against the bad copy → confirm it exits 5
- [ ] Verify write is blocked: `jq ... > "$TMP"` followed by validate.sh exit 5 → no rename occurs
- [ ] From this point forward, any agent writing non-canonical status to orch-state is blocked at gate before rename
- [ ] Commit message: "chore(validate): promote G-5 status-enum check to hard gate"

**Files to read first:**
- `scripts/orch-state-validate.sh` — current state (G-5 check at ~line 364–374)
- `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` § 4.4 (phase-in protocol)

**Files to create:**
- None (uncomment only)

**Files to modify:**
- `scripts/orch-state-validate.sh` — uncomment `exit 5` on line ~373

**Dependencies:**
- SHG-2 (status migration MUST be complete so all existing values are canonical before gate becomes hard)
- SHG-3 (all write paths must have validate.sh wired in before this hard gate activates)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (script conventions)

**Note:**
This is the final hardening step. G-5 starts as WARN in SHG-1 to allow SHG-2 migration to run before the gate becomes hard. Once SHG-2 and SHG-3 are complete, this task flips the gate to hard, preventing future enum drift.

---

## Handoff Detail

### Current G-5 implementation (SHG-1 as created)

In `scripts/orch-state-validate.sh`, around line 364–374:

```bash
# G-5: Task status values are in canonical enum (warn-only until migration complete; change to exit 5 post-migration)
ENUM='["BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE","DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED"]'
BAD_COUNT=$(jq --argjson E "$ENUM" '
  [.task_board.active_sprints[].tasks[]?.status
   | select(. != null)
   | select(. as $s | $E | index($s) == null)]
  | length' "$FILE")
if [ "$BAD_COUNT" -gt 0 ]; then
  echo "[validate] G-5 WARN: $BAD_COUNT non-canonical status value(s) — run migration" >&2
  # exit 5  # UNCOMMENT after one-time migration is complete (SHG-3 AC)
fi
```

### Action required

1. Uncomment line `# exit 5` → becomes `exit 5`
2. Result:

```bash
if [ "$BAD_COUNT" -gt 0 ]; then
  echo "[validate] G-5 WARN: $BAD_COUNT non-canonical status value(s) — run migration" >&2
  exit 5  # NOW ACTIVE — blocks non-canonical writes
fi
```

### Testing the change

Create a test to verify the gate works:

```bash
# Create a copy of orch-state with a non-canonical status
jq '.task_board.backlog[0].status = "done"' docs/data/orch/orch-state.json > /tmp/test-bad.json

# Run validate.sh — should exit 5
bash scripts/orch-state-validate.sh /tmp/test-bad.json
echo "Exit code: $?"  # Should be 5
```

Expected output:
```
[validate] G-5 WARN: 1 non-canonical status value(s) — run migration
```
Exit code: 5

### Impact

After this task lands:
- Any orch-state write with a non-canonical status will be ABORTED before rename
- Agents must use canonical enum values: BACKLOG, TODO, IN_PROGRESS, REVIEW, QA, DONE, DONE_VERIFIED, BLOCKED, DEFERRED, CANCELLED, SKIPPED
- This prevents future enum drift and makes sprint eviction predicate deterministic

### Rollback plan (if needed)

If a write path is found that still uses non-canonical values:
1. Comment out `exit 5` again (revert to WARN-only)
2. Fix the write path to use canonical values
3. Re-uncomment `exit 5` after fix is verified

