# Developer Handoff — Task 1344b: Add `## Step 0-b` Sections to Agent Files

**Sprint:** 1344
**Date:** 2026-04-27
**Task Size:** XS (Extra Small)
**Parallel:** YES — 1344a, 1344b, 1344c run concurrently (no shared files)

---

## Summary

Add a new section `## Step 0-b: Handle Bootstrap Errors` to three agent .md files. This section documents the fail-loud bootstrap decision tree (market_context error → STOP; agent_signals error only → CONTINUE).

**Failures fixed:** 1 (230-bootstrap-verify.test.ts AC-4c)

---

## Files to modify

- `.claude/agents/developer.md`
- `.claude/agents/ops.md`
- `.claude/agents/qa.md`

---

## Exact section to add

**Heading (literal string — test asserts this):**
```
## Step 0-b: Handle Bootstrap Errors
```

**Full section content:**

```markdown
## Step 0-b: Handle Bootstrap Errors

If `getCycleBootstrap` returns an error object, apply this decision tree before any analysis:

| Error field | Action |
|-------------|--------|
| `error.market_context` present | STOP — do not proceed. Send bug alert and return early. |
| `error.agent_signals` only (no market_context error) | CONTINUE — proceed with available data. Log the signal gap. |
| No error field | CONTINUE — full data available. |
```

---

## Placement rules

For each file:

1. **developer.md:** If a `## Step 0` or `## Step 0-a` section exists, insert immediately after it. Otherwise, append after the last step block or at the end of the file (before the RETURN section if one exists).

2. **ops.md:** If a `## Step 0` section exists, insert after it. Otherwise, append at the end of the file before the RETURN section.

3. **qa.md:** If a `## Step 0` section exists, insert after it. Otherwise, append at the end of the file before the RETURN section.

**Important:** Developer.md already contains `## KNOWLEDGE LOAD FAILURE PROTOCOL` — this is a separate section covering bootstrap errors (runtime fetch failures), not knowledge file load failures. Keep both sections.

---

## Acceptance Criteria

- [ ] `bun test --filter "230-bootstrap-verify"` → 13 pass, 0 fail (AC-4c passes)
- [ ] All three files contain the exact string `## Step 0-b: Handle Bootstrap Errors`
- [ ] No other content in the files is altered
- [ ] No other tests regress

---

## Notes

- **Pure documentation:** This task is a text addition only. No code logic changes.
- **Section distinction:** This is distinct from the existing `## KNOWLEDGE LOAD FAILURE PROTOCOL` in developer.md (which handles file load failures). This new section handles runtime bootstrap errors.
- **DDD layer:** Interface (agent prompt files).

---

## Branch

`task/1344b-bootstrap-errors-section`

---

## Return block (when done)

```
DONE: Added `## Step 0-b: Handle Bootstrap Errors` section to developer.md, ops.md, and qa.md; 1 failure fixed (230-bootstrap-verify AC-4c)
NEXT: [developer] task 1344c
HANDOFF: docs/handoffs/TASK_1344b.md
PIPELINE: continue
```
