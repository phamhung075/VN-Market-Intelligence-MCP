# TASK_601: coordinationStore.ts gcExpiredLocks cron-registration:* Exclusion

**Parent:** FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B (P2, size S)
**Zone:** apps/mcp-server/
**Scope:** 1 file, 2 locations
**Estimated:** ~45 min

---

## Acceptance Criteria (AC-1 from parent)

**coordinationStore.ts gcExpiredLocks Phase-1 scan gains `AND task_id NOT LIKE 'cron-registration:%'`** alongside the existing published:%/cron:%/dev-team-cron-singleton exclusions, and both the block comment above ORPHAN_EMIT_ALLOW_LIST (lines ~440-451) plus the inline Phase-1 comment (~504-508) must gain the new id class with its rationale, matching how cron:* and dev-team-cron-singleton are already self-documented there.

**Critical:** Add to the Phase-1 SELECT scan ONLY. Do NOT touch the Phase-2 DELETE — expired markers MUST still be garbage-collected, just silently. A fix that also excludes them from the DELETE would leak rows forever and is a **FAIL**.

---

## Changes Required

### 1. Phase-1 SELECT WHERE Clause

**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`
**Current Line:** ~521 (in the gcExpiredLocks function's WHERE clause)

**Current:**
```sql
WHERE created_at < @expiryTime
  AND task_id NOT LIKE 'published:%'
  AND task_id NOT LIKE 'cron:%'
  AND task_id != 'dev-team-cron-singleton'
```

**New:**
```sql
WHERE created_at < @expiryTime
  AND task_id NOT LIKE 'published:%'
  AND task_id NOT LIKE 'cron:%'
  AND task_id NOT LIKE 'cron-registration:%'
  AND task_id != 'dev-team-cron-singleton'
```

### 2. Block Comment Above ORPHAN_EMIT_ALLOW_LIST

**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`
**Location:** ~440-451 (the comment block above ORPHAN_EMIT_ALLOW_LIST definition)

Add documentation explaining that `cron-registration:*` is excluded from orphan-emission by the Phase-1 scan's WHERE clause to prevent stale markers (outliving the session that registered them by design, 8-day TTL) from minting orphan-signals after ≤30 min (session-presence expires).

Example text to incorporate:
> The Phase-1 scan further excludes `cron-registration:*` markers (cross-session cron dedup, 8-day backstop TTL) from orphan-signal emission — such markers are designed to outlive their owning session and should GC silently when expired, not trigger adoption work.

### 3. Inline Comment in Phase-1 Scan

**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`
**Location:** ~504-508 (the comment immediately before the WHERE clause)

Add a line referencing the new exclusion alongside the existing cron:* and dev-team-cron-singleton mentions.

Example:
```
  // Exclude: published:* (fire-election, cleared by winner), cron:* (tick markers),
  // cron-registration:* (cross-session marker lifecycle), dev-team-cron-singleton
```

---

## What NOT to Do

- **Do not filter Phase-2 DELETE.** The DELETE must still run on expired cron-registration:* rows. The WHERE clause in Phase-1 is sufficient to prevent orphan-signal emission; the marker itself must still be garbage-collected.
- Do not add any new Zod enum or SQLite CHECK constraint — the `sprint-task` kind is intentionally reused.
- Do not change any Phase-2 logic, heartbeat, release, or claim semantics.

---

## Testing

This task does not include test writing — that is AC-3b/AC-3a coverage (TASK_602 and TASK_603).

Basic verification before commit:
- `tsc` compiles without error in apps/mcp-server/
- The WHERE clause is syntactically valid SQL
- Comments are clear and reference the rationale from the parent brief

---

## Related Tasks

- **TASK_602:** AC-2 (tasksMdJanitorJob.ts KNOWN_LEGIT_PREFIXES)
- **TASK_603:** AC-3 tests + AC-4 full suite + AC-6 deploy

---

## Sequencing

**Blocked by:** None (can proceed in parallel with TASK_602)
**Blocks:** TASK_603 (must have both code changes before testing)

This is the first half of the code changes. TASK_602 must land alongside this for the fix to be complete.
