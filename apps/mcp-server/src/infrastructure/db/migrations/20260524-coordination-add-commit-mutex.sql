-- Migration: 20260524-coordination-add-commit-mutex
-- Database: coordination.db
-- Purpose: Add 'commit-mutex' as a valid task_kind for fleet-wide git-index serialization.
--
-- Problem: SQLite cannot ALTER a CHECK constraint in-place.
-- Approach: CREATE new table with updated CHECK → INSERT rows → DROP old → RENAME.
-- All inside a single transaction — zero existing rows are lost on failure.
--
-- This migration is run automatically by coordinationStore.migrateCoordinationTable()
-- on every server startup if the live schema lacks 'commit-mutex' in the CHECK clause.
-- Safe to run multiple times (idempotent detection via sqlite_master inspection).
--
-- Design brief: docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md
-- PO decision:  docs/po-decisions/2026-05-24-commit-mutex-smoke-test-hold.md

BEGIN;

CREATE TABLE task_locks_v2 (
  task_id          TEXT    NOT NULL,
  task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex')),
  owner_session    TEXT    NOT NULL,
  owner_agent      TEXT    NOT NULL,
  claimed_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  heartbeat_at     INTEGER NOT NULL,
  ttl_seconds      INTEGER NOT NULL DEFAULT 3600,
  payload          TEXT,
  PRIMARY KEY (task_id)
);

INSERT INTO task_locks_v2
  SELECT task_id, task_kind, owner_session, owner_agent,
         claimed_at, expires_at, heartbeat_at, ttl_seconds, payload
  FROM task_locks;

DROP TABLE task_locks;

ALTER TABLE task_locks_v2 RENAME TO task_locks;

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent  ON task_locks(task_kind, owner_agent);

COMMIT;
