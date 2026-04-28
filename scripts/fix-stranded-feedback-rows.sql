-- fix-stranded-feedback-rows.sql
-- TASK_1402: Resolve stranded agent_feedback rows (IDs 73, 76, 77)
--
-- Background:
--   These three rows have status='new' with title matching '[AUDIT] stranded_bctc_pdf%'.
--   bctcReparseJob has attempted reparse 6 times (reparse_attempts=6) for each row.
--   The underlying PDF extraction failed for each file (FPT Q4-2025, VCB Q4-2025, VCB Q1-2025).
--   The rows remain stuck as 'new', blocking the disk-scan fallback path each cycle.
--
-- FK analysis:
--   PRAGMA foreign_key_list('agent_feedback') returns empty — no outgoing FKs.
--   system_changelog.related_feedback_id references none of IDs 73, 76, 77.
--   Safe to UPDATE with no cascade effects.
--
-- Decision: UPDATE (preserves audit trail). No resolved_at/resolution_note columns exist;
--   the schema only supports status, so we set status='resolved' per the established pattern
--   used for all prior stranded_bctc_pdf resolutions in this table.
--
-- Verification query at end confirms zero rows remain in 'new' state for these IDs.

-- Pre-flight: confirm the target rows exist and are 'new' before patching
SELECT
  id,
  status,
  reparse_attempts,
  title
FROM agent_feedback
WHERE id IN (73, 76, 77);

-- Apply fix: mark all three rows resolved
UPDATE agent_feedback
SET
  status   = 'resolved',
  priority = 'medium'
WHERE id IN (73, 76, 77)
  AND status = 'new'
  AND title LIKE '[AUDIT] stranded_bctc_pdf%';

-- Verification: confirm none of the three IDs retain status='new'
SELECT
  id,
  status,
  reparse_attempts,
  title
FROM agent_feedback
WHERE id IN (73, 76, 77);

-- Guard: this query MUST return 0 rows; any result means the fix did not apply
SELECT id, status
FROM agent_feedback
WHERE id IN (73, 76, 77)
  AND status != 'resolved';
