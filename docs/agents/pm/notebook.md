# PM Agent Notebook

## Lesson: Umbrella sprint note-append = EDIT existing sprint, never create sibling

**Date:** 2026-06-07

When appending a note to an umbrella sprint in orch-state.json, EDIT the sprint object in place — never create a duplicate. The d796dbb7 batch created a duplicate SPRINT-PPC-PDF-SOURCING with empty tasks and the new note, leaving the original with 6 tasks but stale note. This created a cascade of confusion.

**Fix:** Always merge note updates into the existing sprint object by index. Validate: exactly 1 PPC entry post-edit, 6 tasks present, updated note present.

**Tools:** jq with task-count gates prevents duplication; post-edit scan catches orphaned duplicates before commit.
