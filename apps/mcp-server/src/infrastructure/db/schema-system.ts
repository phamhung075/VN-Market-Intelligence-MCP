/**
 * schema-system.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - cron_job_runs            — scheduler job observability (Task 1100)
 *   - agent_feedback           — agent-submitted problem reports (Task 1022)
 *   - agent_work_log           — agent session lifecycle log (Task 1108)
 *   - evidence_fragments       — prediction evidence accumulation (Task 1116)
 *   - evidence_scores          — nightly aggregated evidence scores
 *   - evidence_likelihood_ratios — calibration likelihood ratios (Task 1121)
 *   - prediction_claims        — forward price/direction claims (Task 1123)
 *   - calibration_snapshots    — weekly calibration statistics (Task 1127)
 *   - system_logs              — application-level log table
 *   - system_changelog         — dev fix changelog (Task 233)
 *   - audit_state              — singleton state for dataAuditJob (Task 1041)
 *   - ask_queue                — /ask FIFO question queue (Task 1072)
 *   - user_requests            — DEPRECATED (Task 238) superseded by ask_queue (Sprint 1920)
 *   - telegram_reports         — dev Report Channel messages (Task 226)
 *   - vps_push_log             — VPS proxy observability
 *   - scheduler_locks          — distributed scheduler lock table (Task 1457)
 *
 * NOTE: A table named `skips` was referenced in Sprint 1920 planning as a
 * zombie table candidate. Investigation confirmed it DOES NOT EXIST in any
 * schema file. No CREATE TABLE, no writers, no readers. No migration needed.
 * The word "skips" in this file (line ~365) refers to SQLite IF NOT EXISTS
 * semantics, not a table name.
 */

import type { Database } from "bun:sqlite";

export function initSystemTables(db: Database): void {
  // ── Cron Job Runs (Task 1100) ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error','crashed')),
      rows_written  INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
      ON cron_job_runs(job_name, started_at DESC)
  `);

  // Migration guard (Task 1955b): if the existing table has the old CHECK constraint
  // that does not include 'crashed', recreate the table preserving all existing rows.
  //
  // Detection strategy: string-match the old constraint substring in the DDL from
  // sqlite_master. This is the same pattern used for vps_service_health (lines ~405-437)
  // and sla_breach_audit (lines ~495-541) — robust against whitespace variations.
  {
    const ddlRow = db
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='cron_job_runs'",
      )
      .get();

    const oldDdl = ddlRow?.sql ?? "";
    // Old DDL contains 'running','success','error' but NOT 'crashed'
    const hasOldConstraint =
      oldDdl.includes("'running'") &&
      oldDdl.includes("'success'") &&
      oldDdl.includes("'error'") &&
      !oldDdl.includes("'crashed'");

    if (hasOldConstraint) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cron_job_runs_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          job_name     TEXT NOT NULL,
          started_at   TEXT NOT NULL,
          finished_at  TEXT,
          status       TEXT NOT NULL CHECK(status IN ('running','success','error','crashed')),
          rows_written  INTEGER,
          error_msg    TEXT,
          duration_ms  INTEGER
        )
      `);
      db.exec(`
        INSERT OR IGNORE INTO cron_job_runs_new
          SELECT id, job_name, started_at, finished_at, status,
                 rows_written, error_msg, duration_ms
          FROM cron_job_runs
      `);
      db.exec(`DROP TABLE cron_job_runs`);
      db.exec(`ALTER TABLE cron_job_runs_new RENAME TO cron_job_runs`);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
          ON cron_job_runs(job_name, started_at DESC)
      `);
    }
  }

  // ── Agent Feedback (Task 1022) ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent             TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium',
      status            TEXT NOT NULL DEFAULT 'new',
      created_at        TEXT NOT NULL,
      reparse_attempts  INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent)`);
  try { db.exec(`ALTER TABLE agent_feedback ADD COLUMN reparse_attempts INTEGER NOT NULL DEFAULT 0`); } catch {}

  // ── Agent Work Log (Task 1108) ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_work_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name   TEXT NOT NULL,
      session_id   TEXT,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      summary      TEXT,
      findings     TEXT,
      actions_json TEXT,
      status       TEXT NOT NULL DEFAULT 'running'
                   CHECK(status IN ('running','completed','error'))
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_work_log_agent_started ON agent_work_log(agent_name, started_at DESC)`,
  );

  // ── Evidence Fragments (Task 1116) ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      evidence_type  TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp      TEXT NOT NULL,
      source_agent   TEXT NOT NULL,
      ttl_days       INTEGER NOT NULL DEFAULT 30,
      expires_at     TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_stock_ts ON evidence_fragments(stock, timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_expires  ON evidence_fragments(expires_at)`);

  // ── Evidence Scores ───────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0.0,
      bearish_score  REAL NOT NULL DEFAULT 0.0,
      neutral_score  REAL NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL,
      UNIQUE(stock, score_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_es_stock ON evidence_scores(stock, score_date DESC)`);

  // ── Evidence Likelihood Ratios (Task 1121) ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_likelihood_ratios (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      evidence_type    TEXT NOT NULL,
      direction        TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      horizon_days     INTEGER NOT NULL CHECK(horizon_days IN (5, 10, 20)),
      likelihood_ratio REAL NOT NULL DEFAULT 1.0,
      sample_size      INTEGER NOT NULL DEFAULT 0,
      last_updated     TEXT NOT NULL,
      UNIQUE(evidence_type, direction, horizon_days)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_elr_type_dir ON evidence_likelihood_ratios(evidence_type, direction)`);

  // ── Prediction Claims (Task 1123) ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_outcome INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_stock      ON prediction_claims(stock)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_agent      ON prediction_claims(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_resolution ON prediction_claims(resolution_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_outcome    ON prediction_claims(resolution_outcome)`);
  // Task 1150: creation_price column
  try { db.exec(`ALTER TABLE prediction_claims ADD COLUMN creation_price REAL`); } catch {}

  // ── Calibration Snapshots (Task 1127) ─────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration_snapshots (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date          TEXT NOT NULL,
      total_resolved         INTEGER NOT NULL,
      avg_brier_score        REAL,
      avg_brier_by_agent     TEXT NOT NULL,
      avg_brier_by_stock     TEXT NOT NULL,
      avg_brier_by_direction TEXT NOT NULL,
      calibration_curve      TEXT NOT NULL,
      trend_delta            REAL,
      top_predictions        TEXT NOT NULL,
      worst_predictions      TEXT NOT NULL,
      computed_at            TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cs_snapshot_date ON calibration_snapshots(snapshot_date DESC)`);

  // ── System Logs ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
      level        TEXT NOT NULL,
      source       TEXT NOT NULL,
      message      TEXT NOT NULL,
      details_json TEXT,
      resolved     INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_system_logs_ts       ON system_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level    ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_system_logs_resolved ON system_logs(resolved);
  `);

  // ── System Changelog (Task 233) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_changelog (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fix_type            TEXT    NOT NULL DEFAULT 'bugfix',
      title               TEXT    NOT NULL,
      detail              TEXT    NOT NULL DEFAULT '',
      files               TEXT    NOT NULL DEFAULT '[]',
      commit_hash         TEXT,
      fixed_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      related_feedback_id INTEGER
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_fixed_at ON system_changelog(fixed_at)`);

  // ── Audit State (Task 1041) ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_state (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      last_daily_audit_at   TEXT,
      last_weekly_audit_at  TEXT,
      last_daily_findings   TEXT,
      last_weekly_findings  TEXT
    )
  `);

  // ── Ask Queue (Task 1072) ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ask_queue (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                TEXT    NOT NULL DEFAULT 'default',
      message                TEXT    NOT NULL,
      received_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      status                 TEXT    NOT NULL DEFAULT 'pending',
      answered_at            TEXT,
      answer_text            TEXT,
      processing_started_at  TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_ask_queue_proc_started ON ask_queue(processing_started_at)
       WHERE status = 'processing'`,
  );

  // ── User Requests (Task 238) — DEPRECATED as of Sprint 1920 ─────────────
  // Superseded by `ask_queue` (Task 1072). The /ask and /why Telegram commands
  // were removed in Task 1063. Zero writers in production code.
  // Retained as CREATE TABLE IF NOT EXISTS for backward-compat with existing DBs.
  // DO NOT add new writers. Do NOT query this table. See ask_queue for replacem.
  // freshnessSlaMonitor: excluded from coverage check (no active writer).
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      response    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      answered_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status)`);

  // ── Telegram Reports (Task 226) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL DEFAULT 0,
      text        TEXT    NOT NULL,
      from_agent  TEXT    NOT NULL DEFAULT 'unknown',
      priority    TEXT    NOT NULL DEFAULT 'normal',
      status      TEXT    NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at)`);
  // Task 231 — ownership lock columns
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_by TEXT`); } catch {}
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_at TEXT`); } catch {}
  // Task 1849a — resolution tracking columns
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN resolution TEXT NOT NULL DEFAULT 'none'`); } catch {}
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN resolved_at TEXT`); } catch {}
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_resolution ON telegram_reports(status, resolution)`);

  // ── VPS Push Log ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service      TEXT    NOT NULL,
      items_count  INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'ok',
      error_msg    TEXT,
      duration_ms  INTEGER,
      pushed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vpl_service_ts ON vps_push_log(service, pushed_at)`);

  // Task 1566: Extend vps_push_log with 8 new observability columns (safe IF NOT EXISTS)
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN truncation_detected INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN schema_errors_count INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN failed_item_indices TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN parse_time_ms INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN validation_time_ms INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN db_time_ms INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN vps_response_size_bytes INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE vps_push_log ADD COLUMN circuit_breaker_state TEXT`);
  } catch {}

  // ── Scheduler Locks (Task 1457) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_locks (
      job_name     TEXT PRIMARY KEY,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
      released_at  TEXT
    )
  `);

  // ── Signal Quality Audit (Task 233b) ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_quality_audit (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id          TEXT NOT NULL,
      signal_type        TEXT NOT NULL CHECK(
        signal_type IN ('price','news','bctc','fx','foreign_flow')
      ),
      ticker             TEXT,
      source_primary     BOOLEAN,
      source_fallback    BOOLEAN,
      fallback_tier      INTEGER,
      fallback_source    TEXT CHECK(
        fallback_source IS NULL OR
        fallback_source IN ('cache','yahoo','domestic_rss','congbao')
      ),
      confidence_score   REAL NOT NULL,
      confidence_score_final REAL NOT NULL,
      confidence_penalty REAL NOT NULL,
      price              REAL,
      price_age_minutes  INTEGER,
      vps_breaker_state  TEXT,
      coverage_gap       TEXT,
      staleness_warning  BOOLEAN,
      created_at         TEXT NOT NULL,
      UNIQUE(signal_id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signal_quality_audit_created_at
      ON signal_quality_audit(created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signal_quality_audit_source
      ON signal_quality_audit(source_fallback, signal_type, ticker)
  `);

  // ── VPS Service Health (Task 234, updated Bug 2 fix) ──────────────────────
  // 'idle' added to health_status CHECK: market-hours-only services
  // (vn-price-fetch, vn-foreign-flow) return 'idle' outside trading window.
  // SQLite CHECK constraints cannot be altered; we must DROP + re-CREATE.
  // Safe because CREATE TABLE IF NOT EXISTS skips on existing DBs — we use
  // a migration guard to recreate only when the old constraint is present.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_service_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL CHECK(
        service_name IN ('vn-price-fetch', 'vn-bctc-fetch', 'vn-news-fetch', 'vn-sbv-fetch', 'vn-foreign-flow')
      ),
      polled_at TEXT NOT NULL DEFAULT (datetime('now')),
      health_status TEXT NOT NULL CHECK(
        health_status IN ('healthy', 'unhealthy', 'unreachable', 'idle')
      ),
      response_time_ms INTEGER,
      last_successful_run TEXT,
      uptime_seconds INTEGER,
      error_message TEXT
    )
  `);

  // Migration guard: if the table already existed with the old CHECK (no 'idle'),
  // recreate it.
  //
  // Why not BEGIN/INSERT/ROLLBACK via exec():
  //   Bun's db.exec() silently swallows the inner CHECK constraint error from
  //   the INSERT — exec() itself succeeds, the guard never throws, and the
  //   migration never runs.  (Confirmed in live DB 2026-04-28.)
  //
  // Fix: read the DDL from sqlite_master and check whether the health_status
  // CHECK already contains 'idle'. If not, the schema is old — migrate.
  {
    const ddlRow = db
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vps_service_health'",
      )
      .get();

    if (ddlRow && !ddlRow.sql.includes("'idle'")) {
      // Old CHECK constraint — recreate table preserving existing rows
      db.exec(`
        ALTER TABLE vps_service_health RENAME TO vps_service_health_old;
        CREATE TABLE vps_service_health (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL CHECK(
            service_name IN ('vn-price-fetch', 'vn-bctc-fetch', 'vn-news-fetch', 'vn-sbv-fetch', 'vn-foreign-flow')
          ),
          polled_at TEXT NOT NULL DEFAULT (datetime('now')),
          health_status TEXT NOT NULL CHECK(
            health_status IN ('healthy', 'unhealthy', 'unreachable', 'idle')
          ),
          response_time_ms INTEGER,
          last_successful_run TEXT,
          uptime_seconds INTEGER,
          error_message TEXT
        );
        INSERT INTO vps_service_health
          SELECT id, service_name, polled_at, health_status,
                 response_time_ms, last_successful_run, uptime_seconds, error_message
          FROM vps_service_health_old;
        DROP TABLE vps_service_health_old;
      `);
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vps_health_service_polled
      ON vps_service_health(service_name, polled_at DESC)
  `);

  // ── BCTC Signal Debounce (Task 1792) ─────────────────────────────────────
  // Per-ticker+quarter cooldown for the [BCTC-1345b] low-confidence alert.
  // Prevents the same bug report firing 10× in 1 minute when a retry loop
  // re-evaluates the same ticker+quarter in rapid succession.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_signal_debounce (
      action_code  TEXT NOT NULL,
      period_key   TEXT NOT NULL,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (action_code, period_key)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bctc_signal_debounce_sent
      ON bctc_signal_debounce(action_code, period_key, sent_at DESC)
  `);

  // ── SLA Breach Audit (Task 234, extended Task 1920i) ─────────────────────
  // Task 1920i: signal_type CHECK extended from 5 → 12 types.
  // Idempotent migration: detect old constraint via sqlite_master and recreate.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sla_breach_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL CHECK(
        signal_type IN (
          'price', 'bctc', 'news', 'sbv_fx', 'foreign_flow',
          'vnstock_fundamentals', 'bond_maturity', 'commodity_prices',
          'broker_sanctions', 'backtest_runs', 'signal_quality_audit',
          'prediction_claims'
        )
      ),
      breached_at TEXT NOT NULL DEFAULT (datetime('now')),
      age_minutes INTEGER NOT NULL,
      threshold_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'breach_open' CHECK(
        status IN ('breach_open', 'recovered')
      ),
      severity TEXT NOT NULL CHECK(
        severity IN ('HIGH', 'CRITICAL')
      ),
      escalation_callback_sent INTEGER DEFAULT 0,
      recovered_at TEXT,
      UNIQUE(signal_type, breached_at)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sla_breach_signal_status
      ON sla_breach_audit(signal_type, status, breached_at DESC)
  `);

  // Idempotent migration: if existing DB has the old 5-type CHECK constraint,
  // recreate the table with the expanded 12-type CHECK (preserve all existing rows).
  {
    const oldDdl = (db.query<{ sql: string }, []>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='sla_breach_audit'`
    ).get())?.sql ?? "";
    const hasOldConstraint =
      oldDdl.includes("'price', 'bctc', 'news', 'sbv_fx', 'foreign_flow'") &&
      !oldDdl.includes("'vnstock_fundamentals'");
    if (hasOldConstraint) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sla_breach_audit_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          signal_type TEXT NOT NULL CHECK(
            signal_type IN (
              'price', 'bctc', 'news', 'sbv_fx', 'foreign_flow',
              'vnstock_fundamentals', 'bond_maturity', 'commodity_prices',
              'broker_sanctions', 'backtest_runs', 'signal_quality_audit',
              'prediction_claims'
            )
          ),
          breached_at TEXT NOT NULL DEFAULT (datetime('now')),
          age_minutes INTEGER NOT NULL,
          threshold_minutes INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'breach_open' CHECK(
            status IN ('breach_open', 'recovered')
          ),
          severity TEXT NOT NULL CHECK(
            severity IN ('HIGH', 'CRITICAL')
          ),
          escalation_callback_sent INTEGER DEFAULT 0,
          recovered_at TEXT,
          UNIQUE(signal_type, breached_at)
        )
      `);
      db.exec(`
        INSERT OR IGNORE INTO sla_breach_audit_new
          SELECT id, signal_type, breached_at, age_minutes, threshold_minutes,
                 status, severity, escalation_callback_sent, recovered_at
          FROM sla_breach_audit
      `);
      db.exec(`DROP TABLE sla_breach_audit`);
      db.exec(`ALTER TABLE sla_breach_audit_new RENAME TO sla_breach_audit`);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sla_breach_signal_status
          ON sla_breach_audit(signal_type, status, breached_at DESC)
      `);
    }
  }
}
