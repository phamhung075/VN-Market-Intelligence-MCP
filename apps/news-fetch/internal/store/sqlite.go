// Package store — SQLite persistence layer for news-fetch.
//
// Uses modernc.org/sqlite (pure-Go, CGO_ENABLED=0).
// Writes raw news items into the shared rag_analyses table consumed by mcp-server.
//
// Schema contract: must match mcp-server schema-news.ts rag_analyses DDL.
// Key columns written by this service: id, created_at, source_url, source_title,
// source_type, published_at, level.
// Analysis columns (sentiment, impact_score, summary, …) are left NULL —
// they are filled later by mcp-server's fetch_and_analyze flow.
package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // pure-Go SQLite driver; CGO_ENABLED=0
)

// NewsItem is the minimal record written by news-fetch to rag_analyses.
// Only the columns owned by this service are populated; the rest remain NULL
// until mcp-server runs the analysis pipeline.
type NewsItem struct {
	// ID is a deterministic dedup key: sha-like hex derived from URL or
	// "source:title" when URL is absent. Must be globally unique per article.
	ID string
	// SourceURL is the canonical article URL (may be empty string when absent).
	SourceURL string
	// SourceTitle is the raw headline from the feed.
	SourceTitle string
	// SourceType identifies the feed: "vneconomy", "vnexpress", "newsapi", "vps_proxy".
	SourceType string
	// PublishedAt is the RFC-3339 publish timestamp from the feed (empty when absent).
	PublishedAt string
	// CreatedAt is the fetch time (UTC ISO-8601).
	CreatedAt string
}

// Store wraps a *sql.DB and provides insert operations for news items.
type Store struct {
	db *sql.DB
}

// Open opens (or creates) the SQLite database at dbPath and runs the schema
// migration to ensure rag_analyses exists.
func Open(dbPath string) (*Store, error) {
	if dbPath != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
			return nil, fmt.Errorf("store.Open: mkdir %s: %w", filepath.Dir(dbPath), err)
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("store.Open: sql.Open: %w", err)
	}

	// Single writer — avoids SQLITE_BUSY on concurrent reads.
	db.SetMaxOpenConns(1)

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store.Open: migrate: %w", err)
	}
	return s, nil
}

// Close releases the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// migrate ensures the rag_analyses table and its required index exist.
// Idempotent — uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
// Only the columns consumed/written by news-fetch are included here;
// the full schema (with analysis columns) is managed by mcp-server.
func (s *Store) migrate() error {
	ddl := `
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
  ON rag_analyses(source_url)
  WHERE source_url IS NOT NULL AND source_url != '';
`
	_, err := s.db.Exec(ddl)
	return err
}

// UpsertNewsItem inserts a raw news item into rag_analyses using INSERT OR IGNORE
// (source_url unique constraint deduplicates on URL; ID deduplicates on primary key).
// Analysis columns are left NULL; mcp-server fills them later.
func (s *Store) UpsertNewsItem(item NewsItem) error {
	if item.CreatedAt == "" {
		item.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	const q = `
INSERT OR IGNORE INTO rag_analyses
  (id, created_at, level, source_url, source_title, source_type, published_at)
VALUES
  (?, ?, 'global', ?, ?, ?, ?)
`
	var sourceURL, publishedAt interface{}
	if item.SourceURL != "" {
		sourceURL = item.SourceURL
	}
	if item.PublishedAt != "" {
		publishedAt = item.PublishedAt
	}

	_, err := s.db.Exec(q,
		item.ID,
		item.CreatedAt,
		sourceURL,
		item.SourceTitle,
		item.SourceType,
		publishedAt,
	)
	return err
}
