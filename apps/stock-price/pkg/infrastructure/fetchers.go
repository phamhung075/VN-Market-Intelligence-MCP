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

// ── Tier 1: VnDirect api-finfo stock_prices ──────────────────────────────────

// Tier1VnDirectFetcher calls https://api-finfo.vndirect.com.vn/v4/stock_prices
// This endpoint returns OHLCV data for HOSE, HNX, and UPCOM exchanges.
// FIX-HNX-UPCOM-PRICE-SOURCES-DEAD: Changed from /v4/stocks (company info, no prices)
// to /v4/stock_prices (OHLCV data with close, volume, change, pctChange).
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
	// Use stock_prices endpoint with date filter for today's data.
	// The endpoint requires date filtering to return current prices.
	today := time.Now().Format("2006-01-02")
	url := fmt.Sprintf("https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:%s~date:gte:%s&size=1", code, today)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	// Set browser User-Agent to avoid 503 from Vietnamese sites.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

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

	// stock_prices endpoint returns OHLCV data with these fields:
	// code, date, time, floor, type, close, open, high, low, nmVolume, change, pctChange
	// type: "STOCK" for VN stocks (price in thousands VND), "INDEX" for indices (actual value)
	var payload struct {
		Data []struct {
			Code      string  `json:"code"`
			Floor     string  `json:"floor"`
			Type      string  `json:"type"`
			Close     float64 `json:"close"`
			NmVolume  float64 `json:"nmVolume"`
			Change    float64 `json:"change"`
			PctChange float64 `json:"pctChange"`
			Date      string  `json:"date"`
			Time      string  `json:"time"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Data) == 0 {
		return nil, nil
	}
	item := payload.Data[0]
	// DSI-INV-1: use pointers so 0 is distinguishable from nil (unavailable)
	change := item.Change
	pctChange := item.PctChange

	// Determine source from floor field (HOSE, HNX, UPCOM)
	source := domain.SourceHOSE
	switch item.Floor {
	case "HNX":
		source = domain.SourceHNX
	case "UPCOM":
		source = domain.SourceUPCOM
	}

	// FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL: Scale price based on asset type.
	// VN stocks (type="STOCK", floor in HOSE/HNX/UPCOM) return prices in thousands VND.
	// Indices and other assets (type="INDEX", non-VN floors like BLOOMBERG) return actual values.
	price := item.Close
	if item.Type == "STOCK" && (item.Floor == "HOSE" || item.Floor == "HNX" || item.Floor == "UPCOM") {
		price = item.Close * 1000
	}

	return &domain.PriceQuote{
		Code:          item.Code,
		Price:         price,
		Volume:        item.NmVolume,
		Change:        &change,
		ChangePercent: &pctChange,
		Source:        source,
		LatencyMs:     time.Since(start).Milliseconds(),
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ── Tier 2: VnDirect api-finfo stock_prices (historical fallback) ───────────

// Tier2VnDirectLegacyFetcher calls https://api-finfo.vndirect.com.vn/v4/stock_prices
// without date filter to get the most recent available data (for after-hours or
// when today's data is not yet available).
// FIX-HNX-UPCOM-PRICE-SOURCES-DEAD: Changed from finfo-api.vndirect.com.vn/v4/stocks
// (which returns company info, not prices) to api-finfo.vndirect.com.vn/v4/stock_prices
// (which returns OHLCV data). This tier omits date filter to get latest available data.
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
	// Use stock_prices endpoint WITHOUT date filter to get most recent data.
	// This is the fallback when Tier 1 (today's data) returns empty.
	url := fmt.Sprintf("https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:%s&size=1", code)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil //nolint:nilerr
	}
	// Set browser User-Agent to avoid 503 from Vietnamese sites.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

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

	// stock_prices endpoint returns OHLCV data with these fields:
	// code, date, time, floor, type, close, open, high, low, nmVolume, change, pctChange
	// type: "STOCK" for VN stocks (price in thousands VND), "INDEX" for indices (actual value)
	var payload struct {
		Data []struct {
			Code      string  `json:"code"`
			Floor     string  `json:"floor"`
			Type      string  `json:"type"`
			Close     float64 `json:"close"`
			NmVolume  float64 `json:"nmVolume"`
			Change    float64 `json:"change"`
			PctChange float64 `json:"pctChange"`
			Date      string  `json:"date"`
			Time      string  `json:"time"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Data) == 0 {
		return nil, nil
	}
	item := payload.Data[0]
	// DSI-INV-1: use pointers so 0 is distinguishable from nil (unavailable)
	change := item.Change
	pctChange := item.PctChange

	// Determine source from floor field (HOSE, HNX, UPCOM)
	source := domain.SourceHOSE
	switch item.Floor {
	case "HNX":
		source = domain.SourceHNX
	case "UPCOM":
		source = domain.SourceUPCOM
	}

	// FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL: Scale price based on asset type.
	// VN stocks (type="STOCK", floor in HOSE/HNX/UPCOM) return prices in thousands VND.
	// Indices and other assets (type="INDEX", non-VN floors like BLOOMBERG) return actual values.
	price := item.Close
	if item.Type == "STOCK" && (item.Floor == "HOSE" || item.Floor == "HNX" || item.Floor == "UPCOM") {
		price = item.Close * 1000
	}

	return &domain.PriceQuote{
		Code:          item.Code,
		Price:         price,
		Volume:        item.NmVolume,
		Change:        &change,
		ChangePercent: &pctChange,
		Source:        source,
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
	var updatedAt string
	var changeAmt, changePct sql.NullFloat64
	// FIX-HNX-UPCOM-PRICE-SOURCES-DEAD: market_prices schema uses updated_at (not fetched_at)
	// and has change_amt, change_pct columns. Query matches actual schema.
	err = db.QueryRow(
		`SELECT price, volume, updated_at, change_amt, change_pct FROM market_prices WHERE code = ?`,
		code,
	).Scan(&price, &volume, &updatedAt, &changeAmt, &changePct)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		slog.Warn("tier3: query failed", "error", err)
		return nil, nil //nolint:nilerr
	}

	// DSI-INV-1 FR-PRICE-3: Change/ChangePercent are pointers.
	// Use actual values from DB if available, otherwise nil.
	var change, pctChange *float64
	if changeAmt.Valid {
		change = &changeAmt.Float64
	}
	if changePct.Valid {
		pctChange = &changePct.Float64
	}

	return &domain.PriceQuote{
		Code:          code,
		Price:         price,
		Volume:        volume,
		Change:        change,
		ChangePercent: pctChange,
		Source:        domain.SourceCache,
		LatencyMs:     time.Since(start).Milliseconds(),
		FetchedAt:     updatedAt, // true source timestamp from DB, not time.Now()
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
