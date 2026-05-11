# TASK 1796d — Delete stale DB backups + harden .gitignore

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~30 min

---

## Context

Stale SQLite backup files matching `data/market.db.fresh-*` and `data/market.db.pre-repair-*` are consuming disk space and are no longer needed. Additionally, .gitignore should be hardened to prevent these patterns from being committed again.

---

## Acceptance Criteria

1. All files matching the following patterns are deleted:
   - `data/market.db.fresh-*`
   - `data/market.db.pre-repair-*`
2. `.gitignore` is updated to include rules that prevent these patterns from ever being tracked:
   ```
   data/*.db.fresh-*
   data/*.db.pre-repair-*
   data/*.db-shm
   data/*.db-wal
   ```
   (Add only entries that are not already present.)
3. Verify `git status` shows the deleted files as removed and .gitignore change as modified.

---

## Files

- Delete: `data/market.db.fresh-*` (glob)
- Delete: `data/market.db.pre-repair-*` (glob)
- Update: `.gitignore`

---

## Dependencies

None — Wave 1, no blocking tasks.

---

## Definition of Done

- [ ] `ls data/market.db.*` returns no `fresh-*` or `pre-repair-*` files
- [ ] `.gitignore` contains patterns for both glob families
- [ ] `git status` confirms deletions are staged correctly
- [ ] Commit: `task(1796d): delete stale DB backups + harden .gitignore`
