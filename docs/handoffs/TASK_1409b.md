# TASK 1409b — Archive Old Sprint Prose from TASKS.md

**Sprint:** 1409 — Audit Remediation
**Tier:** 1 (parallel with 1409c, 1409d, 1409e)
**Owner:** claude-manager-helper
**Priority:** HIGH
**Type:** chore
**Estimated effort:** ~30 min

---

## Context

TASKS.md currently contains a large "Completed Sprints" prose block (lines 7–39) that lists all merged sprints from 1296 through 1408. This block grows every sprint and makes TASKS.md harder to scan. The policy is: TASKS.md = active sprint only. Historical prose belongs in docs/TASKS_ARCHIVE.md.

---

## Acceptance Criteria

1. The "Completed Sprints" block in TASKS.md is replaced with a single pointer line:
   `> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)`
2. The archived prose is appended to `docs/TASKS_ARCHIVE.md` under a new dated heading
3. TASKS.md still contains the header, Todo, In Progress, Review, Done sections intact
4. docs/TASKS_ARCHIVE.md is valid Markdown

---

## Files

- `TASKS.md` — remove prose block, insert pointer
- `docs/TASKS_ARCHIVE.md` — append archived block

---

## Instructions

1. Read TASKS.md fully
2. Copy the entire "Completed Sprints (summary — details in `docs/TASKS_ARCHIVE.md`)" section (lines 7–39) verbatim
3. Read docs/TASKS_ARCHIVE.md (may not exist yet — create if missing)
4. Append the copied block to docs/TASKS_ARCHIVE.md under heading: `## Archive — Added 2026-04-29 (Sprint 1409)`
5. In TASKS.md, replace the entire Completed Sprints prose block with:
   ```
   > Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)
   ```
6. Verify TASKS.md still has all active sections (Todo, In Progress, Review, Done)
7. Commit both files

---

## Definition of Done

- TASKS.md no longer contains multi-line completed sprint prose
- docs/TASKS_ARCHIVE.md contains the archived block
- Committed with message: `task(1409b): archive completed sprint prose from TASKS.md to TASKS_ARCHIVE.md`

---

## Dependencies

- Blocked by: none (Tier 1)
- Blocks: 1409a (1409a must run after archive is stable)
