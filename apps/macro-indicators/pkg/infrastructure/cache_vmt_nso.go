// Package infrastructure — NSO monthly Excel cache (macro_vmt_cache SQLite table).
//
// Implements the shared getOrFetchNSOMonthlyExcel() helper that serves
// VMT-1a, VMT-1b, VMT-3b, and VMT-4 from a single cached Excel download.
//
// Architecture decision Entry 11 (architect handoff, sprint-VN-MACRO-TOOLING.md):
//   - ONE vpsFetch per monthly Excel release cycle.
//   - All four NSO-backed tools read from the same cache table row.
//   - TTL: 6 hours (monthly data changes at most once per release cycle).
//   - Cache miss: 3-step NSO discovery → fetch Excel → write to macro_vmt_cache.
//   - Cache hit: return cached bytes directly (no VPS fetch).
//
// NSO 3-step discovery (from PROBE-3):
//   Step 1: GET https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/
//            → regex latest bai-top/{YYYY}/{MM}/ link
//   Step 2: GET press release page → regex \.xlsx download URL
//   Step 3: GET Excel → cache bytes
//
// TLS: GlobalSign intermediate CA via VPS_CACERT_PATH_NSO env var (NEVER -k).
//   See PROBE-3 tls_note: www.gso.gov.vn SAN=nso.gov.vn (mismatch);
//   use nso.gov.vn domain + combined_ca.pem (system + GlobalSign intermediate).
//
// Cache table schema (macro_vmt_cache in market.db):
//   endpoint TEXT    — e.g. "nso_monthly_excel"
//   period TEXT      — e.g. "2026-06" (YYYY-MM, from URL pattern)
//   fetched_at TEXT  — RFC3339 UTC
//   payload BLOB     — raw Excel bytes
//   PRIMARY KEY (endpoint, period)
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoMonthlyExcelEndpoint is the cache key for the NSO monthly Excel.
const nsoMonthlyExcelEndpoint = "nso_monthly_excel"

// nsoExcelCacheTTL is the cache time-to-live for the NSO monthly Excel bytes.
// Monthly data changes at most once per NSO release cycle (~monthly).
// 6 hours strikes the balance between freshness and VPS fetch cost.
const nsoExcelCacheTTL = 6 * time.Hour

// nsoIndexURL is the NSO monthly report index page (discovery Step 1).
const nsoIndexURL = "https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/"

// reBaiTop matches the latest bai-top/{YYYY}/{MM}/ press release link on the NSO index page.
// Example match: "/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam..."
var reBaiTop = regexp.MustCompile(`href="(/bai-top/\d{4}/\d{2}/[^"]+)"`)

// reXlsxLink matches the .xlsx download link on the NSO press release page.
// Example: href="https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx"
var reXlsxLink = regexp.MustCompile(`href="(https?://[^"]+\.xlsx)"`)

// NSOExcelFetcher wraps VpsFetchPort and a SQLite DB path to provide
// the shared GetOrFetchNSOMonthlyExcel() function.
//
// Instantiate via NewNSOExcelFetcher in the composition root (cmd/server/main.go).
// Opens the market.db SQLite connection on demand (same pattern as SBVRateSQLiteAdapter).
type NSOExcelFetcher struct {
	fetcher domain.VpsFetchPort
	dbPath  string // path to market.db (from DB_PATH env or default)
}

// NewNSOExcelFetcher creates a new NSOExcelFetcher.
// fetcher: the VPS proxy adapter (VpsFetchPort from pkg/domain/ports.go).
// dbPath: path to market.db for macro_vmt_cache read/write (from DB_PATH env).
func NewNSOExcelFetcher(fetcher domain.VpsFetchPort, dbPath string) *NSOExcelFetcher {
	return &NSOExcelFetcher{
		fetcher: fetcher,
		dbPath:  dbPath,
	}
}

// openDB opens a read-write connection to market.db.
// Used for macro_vmt_cache table read/write.
// Pattern mirrors SBVRateSQLiteAdapter.openDB.
func (n *NSOExcelFetcher) openDB() (*sql.DB, error) {
	return sql.Open("sqlite", fmt.Sprintf("file:%s", n.dbPath))
}

// GetOrFetchNSOMonthlyExcel returns the raw NSO monthly Excel bytes.
//
// Flow:
//  1. Query macro_vmt_cache for endpoint="nso_monthly_excel" WHERE
//     fetched_at > NOW()-6h. If hit, return cached bytes.
//  2. If miss: run 3-step NSO discovery → fetch Excel → write to cache.
//  3. Return bytes (or error if any step fails).
//
// The period string (e.g. "2026-06") is derived from the discovered URL;
// it is stored in the cache row for audit traceability.
//
// TLS: VPS_CACERT_PATH must be set to the combined PEM (system CA + GlobalSign
// intermediate) for NSO fetches (PROBE-3 tls_note: nso.gov.vn requires GlobalSign
// intermediate CA; gso.gov.vn SAN mismatch; NEVER -k).
// In production: VPS_CACERT_PATH=/tmp/combined_ca.pem (see VpsFetchAdapter.buildTLSConfig).
func (n *NSOExcelFetcher) GetOrFetchNSOMonthlyExcel(ctx context.Context) ([]byte, string, error) {
	db, err := n.openDB()
	if err != nil {
		return nil, "", fmt.Errorf("nso_excel_cache: open DB: %w", err)
	}
	defer db.Close()

	// Ensure the cache table exists.
	if err := n.ensureCacheTable(ctx, db); err != nil {
		return nil, "", fmt.Errorf("nso_excel_cache: ensure table: %w", err)
	}

	// Step 1: check cache.
	cached, period, err := n.readCache(ctx, db)
	if err == nil && len(cached) > 0 {
		return cached, period, nil
	}

	// Step 2: cache miss → discover + fetch.
	excelBytes, discoveredPeriod, err := n.discoverAndFetch(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("nso_excel_cache: discover+fetch: %w", err)
	}

	// Step 3: write to cache (atomic upsert).
	if writeErr := n.writeCache(ctx, db, discoveredPeriod, excelBytes); writeErr != nil {
		// Non-fatal: continue — the bytes are available even if cache write fails.
		// The next call will re-fetch (cache miss recovery).
		_ = writeErr
	}

	return excelBytes, discoveredPeriod, nil
}

// ensureCacheTable creates macro_vmt_cache if it does not exist.
// Safe to call multiple times (CREATE TABLE IF NOT EXISTS).
func (n *NSOExcelFetcher) ensureCacheTable(ctx context.Context, db *sql.DB) error {
	const ddl = `CREATE TABLE IF NOT EXISTS macro_vmt_cache (
		endpoint   TEXT NOT NULL,
		period     TEXT NOT NULL,
		fetched_at TEXT NOT NULL,
		payload    BLOB NOT NULL,
		PRIMARY KEY (endpoint, period)
	)`
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// readCache looks up the most recent cached Excel bytes for the NSO endpoint.
// Returns (nil, "", sql.ErrNoRows) when no fresh cache row exists.
// A row is fresh when fetched_at > NOW() - cacheTTL.
func (n *NSOExcelFetcher) readCache(ctx context.Context, db *sql.DB) ([]byte, string, error) {
	cutoff := time.Now().UTC().Add(-nsoExcelCacheTTL).Format(time.RFC3339)
	const q = `SELECT payload, period FROM macro_vmt_cache
	            WHERE endpoint = ? AND fetched_at > ?
	            ORDER BY fetched_at DESC LIMIT 1`

	var payload []byte
	var period string
	err := db.QueryRowContext(ctx, q, nsoMonthlyExcelEndpoint, cutoff).Scan(&payload, &period)
	if err != nil {
		return nil, "", err
	}
	return payload, period, nil
}

// writeCache upserts the Excel bytes into macro_vmt_cache for the given period.
// Uses a transaction for atomicity (DD-3, memory: feedback_jq_empty_guard_clobbers_ssot).
func (n *NSOExcelFetcher) writeCache(ctx context.Context, db *sql.DB, period string, payload []byte) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("nso_excel_cache: begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // rollback on non-commit path is safe

	const upsert = `INSERT INTO macro_vmt_cache (endpoint, period, fetched_at, payload)
	                VALUES (?, ?, ?, ?)
	                ON CONFLICT(endpoint, period) DO UPDATE SET
	                  fetched_at = excluded.fetched_at,
	                  payload    = excluded.payload`

	if _, err := tx.ExecContext(ctx, upsert,
		nsoMonthlyExcelEndpoint,
		period,
		time.Now().UTC().Format(time.RFC3339),
		payload,
	); err != nil {
		return fmt.Errorf("nso_excel_cache: upsert: %w", err)
	}

	return tx.Commit()
}

// discoverAndFetch runs the 3-step NSO Excel discovery and returns the raw Excel bytes.
//
// Step 1: GET NSO index page → extract latest bai-top/{YYYY}/{MM}/ link.
// Step 2: GET press release page → extract .xlsx download URL.
// Step 3: GET Excel URL → return raw bytes + period (YYYY-MM from URL path).
//
// Budget: the WHOLE 3-fetch chain is bounded by domain.FetchBudgetSec via a
// context.WithTimeout wrapping the caller ctx. Per-step TimeoutSec is also set
// to FetchBudgetSec so vpsFetch's http.Client respects the same ceiling
// (belt-and-suspenders). If the origin hangs, ctx.DeadlineExceeded surfaces and
// propagates to GetOrFetchNSOMonthlyExcel → use-case degrade path.
func (n *NSOExcelFetcher) discoverAndFetch(ctx context.Context) ([]byte, string, error) {
	// Belt-and-suspenders: bound the entire chain to FetchBudgetSec.
	chainCtx, chainCancel := context.WithTimeout(ctx, time.Duration(domain.FetchBudgetSec)*time.Second)
	defer chainCancel()

	fetchOpts := domain.VpsFetchOptions{
		TimeoutSec: domain.FetchBudgetSec,
		BrowserUA:  true,
	}

	// Step 1: GET NSO index page.
	indexBody, err := n.fetcher.Fetch(chainCtx, nsoIndexURL, fetchOpts)
	if err != nil {
		return nil, "", fmt.Errorf("step1 GET %s: %w", nsoIndexURL, err)
	}

	pressURL, period, err := extractLatestPressURL(indexBody)
	if err != nil {
		return nil, "", fmt.Errorf("step1 extract bai-top link: %w", err)
	}

	// Step 2: GET press release page → extract .xlsx URL.
	pressBody, err := n.fetcher.Fetch(chainCtx, pressURL, fetchOpts)
	if err != nil {
		return nil, "", fmt.Errorf("step2 GET %s: %w", pressURL, err)
	}

	xlsxURL, err := extractXLSXURL(pressBody)
	if err != nil {
		return nil, "", fmt.Errorf("step2 extract xlsx URL from %s: %w", pressURL, err)
	}

	// Step 3: GET Excel file.
	fetchOpts.AcceptHeader = "application/octet-stream"
	excelBytes, err := n.fetcher.Fetch(chainCtx, xlsxURL, fetchOpts)
	if err != nil {
		return nil, "", fmt.Errorf("step3 GET xlsx %s: %w", xlsxURL, err)
	}

	if len(excelBytes) < 1000 {
		return nil, "", fmt.Errorf("step3: suspicious Excel size %d bytes (expected ~646KB)", len(excelBytes))
	}

	return excelBytes, period, nil
}

// extractLatestPressURL finds the most recent bai-top press release URL from the NSO index page.
// Also extracts the period (YYYY-MM) from the URL path for cache key use.
func extractLatestPressURL(body []byte) (pressURL, period string, err error) {
	matches := reBaiTop.FindAllSubmatch(body, -1)
	if len(matches) == 0 {
		return "", "", fmt.Errorf("no bai-top link found in NSO index page (%d bytes)", len(body))
	}

	// The first match is the most recent (NSO lists newest first).
	path := string(matches[0][1])

	// Extract period from path: /bai-top/YYYY/MM/...
	rePeriod := regexp.MustCompile(`/bai-top/(\d{4})/(\d{2})/`)
	pm := rePeriod.FindStringSubmatch(path)
	if len(pm) < 3 {
		return "", "", fmt.Errorf("cannot extract YYYY/MM from bai-top path %q", path)
	}
	period = pm[1] + "-" + pm[2]

	// Build absolute URL if the path is relative.
	if len(path) > 0 && path[0] == '/' {
		pressURL = "https://www.nso.gov.vn" + path
	} else {
		pressURL = path
	}

	return pressURL, period, nil
}

// extractXLSXURL finds the first .xlsx download link in the NSO press release page body.
func extractXLSXURL(body []byte) (string, error) {
	matches := reXlsxLink.FindSubmatch(body)
	if len(matches) < 2 {
		return "", fmt.Errorf("no .xlsx link found in NSO press release page (%d bytes)", len(body))
	}
	return string(matches[1]), nil
}
