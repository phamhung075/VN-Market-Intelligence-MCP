-- Migration: 20260520-coordination-task-locks
-- Database: coordination.db (NEW — separate from market.db)
-- Purpose: Cross-session agent task-lock coordination
--
-- Creates task_locks table with full TTL + heartbeat semantics.
-- This DB is accessible from both Docker container (/app/data/coordination.db)
-- and host filesystem (apps/mcp-server/data/coordination.db) via shared volume.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS task_locks (
  task_id          TEXT    NOT NULL,
  task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row')),
  owner_session    TEXT    NOT NULL,   -- Claude Code session UUID, injected server-side
  owner_agent      TEXT    NOT NULL,   -- agent name, e.g. "cowork-team", "dev-mcp-server"
  claimed_at       INTEGER NOT NULL,   -- Unix epoch seconds UTC
  expires_at       INTEGER NOT NULL,   -- claimed_at + ttl_seconds
  heartbeat_at     INTEGER NOT NULL,   -- last successful heartbeat epoch seconds
  ttl_seconds      INTEGER NOT NULL DEFAULT 3600,
  payload          TEXT,               -- JSON blob: {slot_id?, task_title?, row_hash?, notes?}
  PRIMARY KEY (task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at   ON task_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent   ON task_locks(task_kind, owner_agent);
