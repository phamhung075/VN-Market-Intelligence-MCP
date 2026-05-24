// Package infrastructure — 3-tier price fetchers + SQLite repositories.
// CGO required: mattn/go-sqlite3.
package infrastructure

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// ── Tier 1: VnDirect api-finfo ───────────────────────────────────────────────

// Tier1VnDirectFetcher calls https://api-finfo.vndirect.com.vn/v4/stocks
type Tier1VnDirectFetcher struct {
	client *http.Client
}

// NewTier1Fetcher creates a Tier1 fetcher with 3s timeout (NF-5).
func NewTier1Fetcher() *Tier1VnDirectFetcher {
	return &Tier1VnDirectFetcher{
		client: &http.Client{Timeout: 3 * time.Second},
	}
}

func (f *Tier1VnDirectFetcher) FetchPrice(code string) (*domain.PriceQuote, error) {
	start := time.Now()
	url := fmt.Sprintf("https://api-finfo.vndirect.com.vn/v4/stocks?q=code:%s&size=1", code)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	var payload struct {
		Data []struct {
			Code      string  `json:"code"`
			Close     float64 `json:"close"`
			Volume    float64 `json:"volume"`
			Change    float64 `json:"change"`
			PctChange float64 `json:"pctChange"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Data) == 0 {
		return nil, nil
	}
	item := payload.Data[0]
	return &domain.PriceQuote{
		Code:          item.Code,
		Price:         item.Close,
		Volume:        item.Volume,
		Change:        item.Change,
		ChangePercent: item.PctChange,
		Source:        domain.SourceHOSE,
		LatencyMs:     time.Since(start).Milliseconds(),
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ── Tier 2: VnDirect finfo-api legacy ───────────────────────────────────────

// Tier2VnDirectLegacyFetcher calls https://finfo-api.vndirect.com.vn/v4/stocks
type Tier2VnDirectLegacyFetcher struct {
	client *http.Client
}

// NewTier2Fetcher creates a Tier2 fetcher with 3s timeout (NF-5).
func NewTier2Fetcher() *Tier2VnDirectLegacyFetcher {
	return &Tier2VnDirectLegacyFetcher{
		client: &http.Client{Timeout: 3 * time.Second},
	}
}

func (f *Tier2VnDirectLegacyFetcher) FetchPrice(code string) (*domain.PriceQuote, error) {
	start := time.Now()
	url := fmt.Sprintf("https://finfo-api.vndirect.com.vn/v4/stocks?q=code:%s&size=1", code)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	var payload struct {
		Data []struct {
			Code          string  `json:"code"`
			MatchPrice    float64 `json:"matchPrice"`
			TotalVolume   float64 `json:"totalVolume"`
			PriceChange   float64 `json:"priceChange"`
			PctPriceChange float64 `json:"pctPriceChange"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Data) == 0 {
		return nil, nil
	}
	item := payload.Data[0]
	return &domain.PriceQuote{
		Code:          item.Code,
		Price:         item.MatchPrice,
		Volume:        item.TotalVolume,
		Change:        item.PriceChange,
		ChangePercent: item.PctPriceChange,
		Source:        domain.SourceHNX,
		LatencyMs:     time.Since(start).Milliseconds(),
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ── Tier 3: SQLite cache (readonly market.db) ────────────────────────────────

// Tier3CacheFetcher reads market_prices from market.db in readonly mode.
// DSN: file:path?mode=ro&_journal_mode=WAL&_busy_timeout=5000 (NF-2 / AC-7).
type Tier3CacheFetcher struct {
	dbPath string
}

// NewTier3Fetcher creates a Tier3 fetcher.
func NewTier3Fetcher(dbPath string) *Tier3CacheFetcher {
	return &Tier3CacheFetcher{dbPath: dbPath}
}

func (f *Tier3CacheFetcher) FetchPrice(code string) (*domain.PriceQuote, error) {
	start := time.Now()
	dsn := fmt.Sprintf("file:%s?mode=ro&_journal_mode=WAL&_busy_timeout=5000", f.dbPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		slog.Warn("tier3: failed to open market.db", "error", err)
		return nil, nil //nolint:nilerr
	}
	defer db.Close()

	var price, volume float64
	err = db.QueryRow(
		`SELECT price, volume FROM market_prices WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
		code,
	).Scan(&price, &volume)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		slog.Warn("tier3: query failed", "error", err)
		return nil, nil //nolint:nilerr
	}
	return &domain.PriceQuote{
		Code:          code,
		Price:         price,
		Volume:        volume,
		Change:        0,
		ChangePercent: 0,
		Source:        domain.SourceCache,
		LatencyMs:     time.Since(start).Milliseconds(),
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ── SQLite Price History Repository ─────────────────────────────────────────

// SQLitePriceHistoryRepository reads history from market.db (readonly)
// and writes quotes to stock_price.db (write-only cache).
type SQLitePriceHistoryRepository struct {
	marketDBPath    string // readonly — market.db
	ownDBPath       string // write — stock_price.db
}

// NewSQLitePriceHistoryRepository creates the dual-DB repository.
func NewSQLitePriceHistoryRepository(marketDBPath, ownDBPath string) *SQLitePriceHistoryRepository {
	return &SQLitePriceHistoryRepository{
		marketDBPath: marketDBPath,
		ownDBPath:    ownDBPath,
	}
}

// GetHistory reads OHLCV aggregates from market.db (readonly).
func (r *SQLitePriceHistoryRepository) GetHistory(code string, days int) ([]domain.DailyOHLCV, error) {
	dsn := fmt.Sprintf("file:%s?mode=ro&_journal_mode=WAL&_busy_timeout=5000", r.marketDBPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return []domain.DailyOHLCV{}, nil //nolint:nilerr
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT date, open, high, low, close, volume
		 FROM daily_ohlcv
		 WHERE code = ?
		   AND date >= date('now', ? || ' days')
		 ORDER BY date ASC`,
		code, fmt.Sprintf("-%d", days),
	)
	if err != nil {
		return []domain.DailyOHLCV{}, nil //nolint:nilerr
	}
	defer rows.Close()

	var result []domain.DailyOHLCV
	for rows.Next() {
		var c domain.DailyOHLCV
		if err := rows.Scan(&c.Date, &c.Open, &c.High, &c.Low, &c.Close, &c.Volume); err != nil {
			continue
		}
		result = append(result, c)
	}
	if result == nil {
		result = []domain.DailyOHLCV{}
	}
	return result, nil
}

// SaveQuote writes a quote to stock_price.db (market_prices_cache table).
// Write failure is silently ignored (fire-and-forget semantics, AC-6).
func (r *SQLitePriceHistoryRepository) SaveQuote(quote *domain.PriceQuote) error {
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL", r.ownDBPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil //nolint:nilerr
	}
	defer db.Close()

	_, err = db.Exec(
		`CREATE TABLE IF NOT EXISTS market_prices_cache
		 (code TEXT, price REAL, volume REAL, fetched_at TEXT)`,
	)
	if err != nil {
		return nil //nolint:nilerr
	}

	_, err = db.Exec(
		`INSERT INTO market_prices_cache (code, price, volume, fetched_at) VALUES (?, ?, ?, ?)`,
		quote.Code, quote.Price, quote.Volume, quote.FetchedAt,
	)
	// Ignore write errors — price cache is best-effort
	_ = err
	return nil
}
