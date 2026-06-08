/**
 * schema-news.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - rag_analyses       — RAG memory entries (vectors in LanceDB)
 *   - agent_signals      — inter-agent signal bus
 *   - mention_velocity   — hourly mention count per ticker
 *   - reputation_scores  — daily reputation score per ticker
 *   - market_messages    — MARKET channel message log for quality review
 *   - cascade_rule_hits  — cascade rule firing log + outcome tracking
 *   - trade_exposures    — per-stock trade exposure percentages
 *   - insider_transactions — SSC insider disclosure rows
 */

import type { Database } from "bun:sqlite";

export function initNewsTables(db: Database): void {
  // ── RAG Analyses ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_rag_created   ON rag_analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_rag_level     ON rag_analyses(level);
    CREATE INDEX IF NOT EXISTS idx_rag_sentiment ON rag_analyses(sentiment);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses(source_url)
      WHERE source_url IS NOT NULL AND source_url != '';
  `);

  // ── EI-P2-2: data_env column on rag_analyses ─────────────────────────────
  // Idempotent: guarded ALTER TABLE (try/catch on column-exists error).
  // Existing rows get NULL. New rows stamped by pollNews / analysis write paths.
  try { db.exec("ALTER TABLE rag_analyses ADD COLUMN data_env TEXT"); } catch { /* already exists */ }

  // ── DFR-P1-MCP / FR-6: body_text column on rag_analyses ──────────────────
  // Phase 2 deep-fetch executors will populate this column. Phase 1 adds the
  // column additively (nullable, NULL for all existing rows) so the ALTER TABLE
  // path is exercised and verified before Phase 2 write paths are implemented.
  // Idempotent: guarded ALTER TABLE (try/catch on column-exists error).
  try { db.exec("ALTER TABLE rag_analyses ADD COLUMN body_text TEXT"); } catch { /* already exists */ }

  // ── Agent Signal Bus (Task 242) ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);

  // Task 244 — outcome columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_detail TEXT`); } catch {}

  // Enrichment chain columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN finding_data TEXT DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_ref INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN chain_depth INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN processed INTEGER DEFAULT 0`); } catch {}

  // Task 1105 — causal root columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_label TEXT`); } catch {}

  // Task 1106 — signal class column
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN signal_class TEXT`); } catch {}

  // Task 230 — signal validation columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN validated_at TEXT DEFAULT CURRENT_TIMESTAMP`); } catch {}

  // Task 1328c — new signal context columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN news_sentiment REAL`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN kinh_dich_confidence REAL`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN agent_signals_majority TEXT`); } catch {}

  // TNB critic gate columns
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_score REAL DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_notes TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN retry_count INTEGER DEFAULT 0`); } catch {}

  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_cycle ON agent_signals(cycle_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_chain ON agent_signals(causal_ref)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_stock ON agent_signals(stock_code, created_at)`);

  // ── Mention Velocity (Task 265) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS mention_velocity (
      code           TEXT    NOT NULL,
      hour           TEXT    NOT NULL,
      mention_count  INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (code, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_mv_code ON mention_velocity(code);
    CREATE INDEX IF NOT EXISTS idx_mv_hour ON mention_velocity(hour);
  `);

  // ── Reputation Scores (Task 265) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_scores (
      code        TEXT NOT NULL,
      date        TEXT NOT NULL,
      score       REAL NOT NULL,
      trend       TEXT NOT NULL DEFAULT 'stable',
      risk_level  TEXT NOT NULL DEFAULT 'safe',
      computed_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE INDEX IF NOT EXISTS idx_rep_code ON reputation_scores(code);
    CREATE INDEX IF NOT EXISTS idx_rep_date ON reputation_scores(date);
  `);

  // ── Market Messages (Sprint 068) ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      message_type TEXT    NOT NULL,
      ticker       TEXT,
      content      TEXT    NOT NULL,
      sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      verdict      TEXT,
      verdict_note TEXT,
      reviewed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent);
    CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
  `);

  // Task 1311a — verdict columns (added after initial table creation in some DBs)
  // Must run BEFORE idx_mm_verdict creation so the column exists on pre-migration DBs.
  // FIX-1265: reviewed_at must be TEXT (not INTEGER) to match the CREATE TABLE DDL
  // and to ensure datetime('now') stores as a TEXT string on all DB lineages.
  for (const sql of [
    `ALTER TABLE market_messages ADD COLUMN verdict      TEXT`,
    `ALTER TABLE market_messages ADD COLUMN verdict_note TEXT`,
    `ALTER TABLE market_messages ADD COLUMN reviewed_at  TEXT`,
  ]) {
    try { db.exec(sql); } catch {}
  }

  // idx_mm_verdict deferred until after ALTER TABLE migration so column exists
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mm_verdict ON market_messages(verdict)`);

  // Sprint 191 — impact tracking columns
  for (const sql of [
    `ALTER TABLE market_messages ADD COLUMN impact_score     REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_at_message REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_3d_after   REAL`,
  ]) {
    try { db.exec(sql); } catch {}
  }

  // ── Cascade Rule Hits (Task 1044) ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rule_hits (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key         TEXT NOT NULL,
      matched_text     TEXT NOT NULL DEFAULT '',
      affected_sector  TEXT,
      affected_stocks  TEXT,
      hit_at           TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_rule ON cascade_rule_hits(rule_key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_at   ON cascade_rule_hits(hit_at)`);

  // Sprint 191 — outcome tracking columns
  for (const sql of [
    `ALTER TABLE cascade_rule_hits ADD COLUMN source_rag_id   TEXT`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_3d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_7d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN outcome_correct INTEGER`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN confidence      REAL`,
  ]) {
    try { db.exec(sql); } catch {}
  }

  // ── Trade Exposures (Task 1043) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_exposures (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      market       TEXT NOT NULL,
      revenue_pct  REAL NOT NULL DEFAULT 0,
      type         TEXT NOT NULL DEFAULT 'export',
      products     TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT 'seed',
      updated_at   TEXT NOT NULL,
      UNIQUE(code, market)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trade_code   ON trade_exposures(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trade_market ON trade_exposures(market)`);

  // ── Insider Transactions (Task 1141) ─────────────────────────────────────
  {
    const cols: { name: string }[] = db.query("PRAGMA table_info(insider_transactions)").all() as { name: string }[];
    const hasFromDate = cols.some(c => c.name === "from_date");
    if (cols.length > 0 && !hasFromDate) {
      db.exec("DROP TABLE IF EXISTS insider_transactions");
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                  TEXT PRIMARY KEY,
      code                TEXT NOT NULL,
      insider_name        TEXT NOT NULL,
      position            TEXT NOT NULL,
      type                TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
      registered_volume   INTEGER NOT NULL DEFAULT 0,
      executed_volume     INTEGER NOT NULL DEFAULT 0,
      price               REAL NOT NULL DEFAULT 0,
      from_date           TEXT NOT NULL,
      to_date             TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_it_code_from_date
      ON insider_transactions(code, from_date DESC);
    CREATE INDEX IF NOT EXISTS idx_it_type_from_date
      ON insider_transactions(type, from_date DESC);
  `);

  // ── Signal Rejections (Task 1293c) ────────────────────────────────────────
  // Audit log for signals rejected by validation in post_agent_signal MCP tool.
  // Helps identify agent prompt failures and validation patterns.
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_rejections (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent        TEXT NOT NULL,
      signal_type       TEXT NOT NULL,
      stock_code        TEXT,
      reason            TEXT NOT NULL,
      payload_preview   TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rejections_agent
      ON signal_rejections(from_agent);
    CREATE INDEX IF NOT EXISTS idx_rejections_created_at
      ON signal_rejections(created_at DESC);
  `);

  // ── Signal Outcomes (2026-05-17 outcome feedback loop) ────────────────────
  // Captures T+24h and T+48h price verification for every directional signal.
  // Seeded immediately after agent_signals INSERT via seedSignalOutcome().
  // Resolved hourly by signalOutcomeResolutionJob scanning pending rows.
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_outcomes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id           INTEGER NOT NULL REFERENCES agent_signals(id),
      stock_code          TEXT    NOT NULL,
      signal_type         TEXT    NOT NULL,
      from_agent          TEXT    NOT NULL,
      predicted_direction TEXT    NOT NULL,
      price_at_signal     REAL    DEFAULT NULL,
      price_at_24h        REAL    DEFAULT NULL,
      price_at_48h        REAL    DEFAULT NULL,
      outcome_24h         TEXT    NOT NULL DEFAULT 'pending',
      outcome_48h         TEXT    NOT NULL DEFAULT 'pending',
      checked_at          TEXT    DEFAULT NULL,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id
      ON signal_outcomes(signal_id);
    CREATE INDEX IF NOT EXISTS idx_signal_outcomes_stock_code
      ON signal_outcomes(stock_code, signal_type);
    CREATE INDEX IF NOT EXISTS idx_signal_outcomes_created_at
      ON signal_outcomes(created_at);
  `);
}
