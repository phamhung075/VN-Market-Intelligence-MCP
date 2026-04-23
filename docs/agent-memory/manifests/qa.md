# QA Memory Manifest

**Load when:** Running test suite, reviewing PR, or validating before merge.

| Task Type | Load |
|-----------|------|
| test-run, validation | modules/[RELEVANT].md (if analyzing test failures) |
| pr-review, merge-check | sessions/LATEST.md |
| (none) | — |

**Load sequence:**
1. Check PR task ID from TASKS.md
2. Load relevant module if PR touches that area (e.g., PR 1298 touches scheduler → load modules/scheduler.md)
3. Load latest session for recent fixes/patterns

**Total load cost:** 50–100 tokens (manifest) + 0–200 tokens (task-specific)

---

**Notes:** Most QA work is code-level (no agent-memory needed). Load memory only if diagnosing a recurring pattern from modules/ or issues/.
