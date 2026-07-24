// Package infrastructure — SBV policy-rates HTML parser + DB fallback (VMT-5a).
//
// Two components:
//
//  1. ParseSBVPolicyRatesHTML / FetchSBVPolicyRatesFromHTML — parses the SBV Liferay
//     HTML page for the three key policy rates.
//     Source: www.sbv.gov.vn (direct, no VPS proxy — same domain as BOP, confirmed reachable).
//     TLS: buildDirectTLSConfig (VPS_CACERT_PATH pattern, NEVER -k / InsecureSkipVerify=false).
//     Parses: refi_rate_pct, discount_rate_pct, lombard_rate_pct from SBV HTML tables.
//     Falls back to sbv_rates DB values when HTML parse fails.
//
//  2. FetchSBVPolicyRatesFromDB / ParseVNRate — sbv_rates DB fallback used when the HTML
//     fetch/parse above fails (ParseOK=false is not an error — it signals DB fallback).
//
// Split from adapters_vmt_sjc_fx.go (FACTORY-MACRO-split-or-justify-over-cap, 2026-07-24) —
// this file used to bundle the SJCGoldFXAdapter DB adapter (still in adapters_vmt_sjc_fx.go,
// same package) with this SBV policy-rates parse/fetch/TLS logic. Same package — no
// import-graph change; buildDirectTLSConfig and extractText are also reused by
// parsers_vmt_sbv_interbank_omo.go (same package, unaffected by this split).
//
// size-justification: ~330L — one cohesive concern (SBV policy-rates: HTML fetch, TLS,
// HTML-AST walk/parse, and its DB fallback) that shares the SBVPolicyRatesResult /
// SBVPolicyRatesDBResult domain and the same rate-parsing helpers (extractFirstNumber,
// ParseVNRate); the HTML-AST helpers (collectRates, extractSiblingRate, findParentByTag,
// extractText, containsAny) exist ONLY to support ParseSBVPolicyRatesHTML and have no
// other caller — splitting them into their own file would separate a parser from its
// only client for zero reuse benefit.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// ---------------------------------------------------------------------------
// SBV policy rates HTML fetch + parse
// ---------------------------------------------------------------------------

// sbvPolicyRatesURL is the SBV Liferay portal page for key policy interest rates.
// Same domain as BOP (www.sbv.gov.vn) — direct fetch, no VPS proxy needed.
// The page includes the refinancing rate, discount rate, and Lombard rate tables.
const sbvPolicyRatesURL = "https://www.sbv.gov.vn/webcenter/portal/vi/menu/trangchu/tk/ls"

// SBVPolicyRatesResult holds the parsed values from the SBV HTML page.
type SBVPolicyRatesResult struct {
	// RefiRatePct is the SBV refinancing rate (lãi suất tái cấp vốn).
	RefiRatePct float64
	// DiscountRatePct is the SBV discount rate (lãi suất chiết khấu).
	DiscountRatePct float64
	// LombardRatePct is the SBV Lombard/pledge rate (lãi suất cầm cố).
	LombardRatePct float64
	// ParseOK is true when at least refi + discount were successfully parsed.
	ParseOK bool
}

// FetchSBVPolicyRatesFromHTML fetches the SBV policy rates HTML page and parses the rates.
//
// TLS hardening: uses the VPS_CACERT_PATH env var (same as VpsFetchAdapter.buildTLSConfig).
// NEVER uses -k / InsecureSkipVerify. Returns SBVPolicyRatesResult with ParseOK=false on any error.
//
// Fallback: caller should fall back to sbv_rates DB values when ParseOK=false.
func FetchSBVPolicyRatesFromHTML(ctx context.Context) (SBVPolicyRatesResult, error) {
	caCertPath := os.Getenv("VPS_CACERT_PATH")

	tlsCfg, err := buildDirectTLSConfig(caCertPath)
	if err != nil {
		return SBVPolicyRatesResult{}, fmt.Errorf("sbv_policy_rates: TLS config: %w", err)
	}

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
		Timeout:   30 * time.Second,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sbvPolicyRatesURL, nil)
	if err != nil {
		return SBVPolicyRatesResult{}, fmt.Errorf("sbv_policy_rates: build request: %w", err)
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "text/html")

	resp, err := client.Do(req)
	if err != nil {
		return SBVPolicyRatesResult{}, fmt.Errorf("sbv_policy_rates: fetch %s: %w", sbvPolicyRatesURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SBVPolicyRatesResult{}, fmt.Errorf("sbv_policy_rates: HTTP %d from %s", resp.StatusCode, sbvPolicyRatesURL)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return SBVPolicyRatesResult{}, fmt.Errorf("sbv_policy_rates: read body: %w", err)
	}

	return ParseSBVPolicyRatesHTML(body), nil
}

// ParseSBVPolicyRatesHTML parses the raw SBV policy rates HTML body.
//
// Contract derived from live SBV domain (www.sbv.gov.vn — same as BOP, PROBE-4 confirmed reachable).
// The page contains HTML tables with Vietnamese interest rate labels.
//
// Rate identification keywords (Vietnamese):
//   - "tái cấp vốn" or "tai cap von" → refi_rate_pct
//   - "chiết khấu" or "chiet khau" → discount_rate_pct
//   - "cầm cố" or "cam co" or "lombard" → lombard_rate_pct
//
// Fallback: if the target URL is a Liferay portal page, rates may also appear
// in the sbv_rates DB table (existing crawler). ParseOK=false triggers DB fallback.
//
// This is a best-effort parser — ParseOK=false is not an error; it signals DB fallback.
func ParseSBVPolicyRatesHTML(body []byte) SBVPolicyRatesResult {
	var result SBVPolicyRatesResult

	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return result // ParseOK=false → caller falls back to DB
	}

	// Walk the HTML tree collecting table cells that contain rate labels and values.
	// Strategy: find text nodes near rate keywords and extract the adjacent number.
	collectRates(doc, &result)

	// ParseOK when at least refi+discount were found.
	result.ParseOK = result.RefiRatePct > 0 && result.DiscountRatePct > 0

	return result
}

// collectRates walks the HTML AST collecting rate values from text nodes.
// Rate label keywords (Vietnamese + transliterated) identify the row context.
func collectRates(n *html.Node, result *SBVPolicyRatesResult) {
	if n == nil {
		return
	}

	if n.Type == html.TextNode {
		text := strings.ToLower(strings.TrimSpace(n.Data))

		// Look for rate value after a label keyword.
		// SBV HTML patterns: the rate label and value appear in adjacent table cells (td).
		rateVal := extractSiblingRate(n)
		if rateVal <= 0 {
			return
		}

		if containsAny(text, "tái cấp vốn", "tai cap von", "tái cấp", "refinancing") {
			if result.RefiRatePct == 0 {
				result.RefiRatePct = rateVal
			}
		}
		if containsAny(text, "chiết khấu", "chiet khau", "discount") {
			if result.DiscountRatePct == 0 {
				result.DiscountRatePct = rateVal
			}
		}
		if containsAny(text, "cầm cố", "cam co", "lombard", "cầm") {
			if result.LombardRatePct == 0 {
				result.LombardRatePct = rateVal
			}
		}
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		collectRates(c, result)
	}
}

// extractSiblingRate looks for a numeric rate value in the adjacent or parent cell.
// Returns 0 if no parseable rate is found.
func extractSiblingRate(n *html.Node) float64 {
	// Try the parent td/tr context: look for next sibling text nodes or td.
	if n.Parent == nil {
		return 0
	}
	// Walk forward siblings of the parent td for the rate value.
	parentTD := findParentByTag(n, "td")
	if parentTD == nil {
		return 0
	}
	sibling := parentTD.NextSibling
	for sibling != nil {
		if sibling.Type == html.ElementNode && sibling.Data == "td" {
			val := extractFirstNumber(sibling)
			if val > 0 {
				return val
			}
		}
		sibling = sibling.NextSibling
	}
	return 0
}

// findParentByTag walks up the tree to find the nearest ancestor with the given tag.
func findParentByTag(n *html.Node, tag string) *html.Node {
	for p := n.Parent; p != nil; p = p.Parent {
		if p.Type == html.ElementNode && p.Data == tag {
			return p
		}
	}
	return nil
}

// extractFirstNumber extracts the first parseable float64 from a node's text content.
// Returns 0 if no valid number is found.
func extractFirstNumber(n *html.Node) float64 {
	text := strings.TrimSpace(extractText(n))
	// Remove common non-numeric characters (spaces, %, nbsp).
	text = strings.ReplaceAll(text, "%", "")
	text = strings.ReplaceAll(text, " ", "") // non-breaking space
	text = strings.TrimSpace(text)

	// Try comma-as-decimal (VN format) then dot-as-decimal.
	// VN rate: "4,5" or "4.5" — both mean 4.5%.
	text = strings.ReplaceAll(text, ",", ".")
	var val float64
	_, err := fmt.Sscanf(text, "%f", &val)
	if err == nil && val > 0 && val < 50 { // sanity: interest rates < 50%
		return val
	}
	return 0
}

// extractText recursively extracts all text content from a node.
func extractText(n *html.Node) string {
	if n == nil {
		return ""
	}
	if n.Type == html.TextNode {
		return n.Data
	}
	var sb strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		sb.WriteString(extractText(c))
	}
	return sb.String()
}

// containsAny returns true if s contains any of the given substrings.
func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// buildDirectTLSConfig creates a *tls.Config for direct (non-proxied) HTTPS requests.
// Same TLS hardening as VpsFetchAdapter.buildTLSConfig:
//   - InsecureSkipVerify is ALWAYS false.
//   - If VPS_CACERT_PATH is set, the PEM is loaded into RootCAs.
//
// "Direct" means no proxy tunnel — but the same CA cert path applies for
// sites with non-standard TLS chains (www.sbv.gov.vn uses standard chain per PROBE-4).
func buildDirectTLSConfig(caCertPath string) (*tls.Config, error) {
	cfg := &tls.Config{
		InsecureSkipVerify: false, //nolint:gosec // explicitly false — TLS hardening
	}

	if caCertPath == "" {
		// System CA bundle — Go default.
		return cfg, nil
	}

	pem, err := os.ReadFile(caCertPath)
	if err != nil {
		return nil, fmt.Errorf("read CA cert %s: %w", caCertPath, err)
	}

	pool, err := x509.SystemCertPool()
	if err != nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("CA cert file %s: no valid PEM blocks", caCertPath)
	}
	cfg.RootCAs = pool
	return cfg, nil
}

// ---------------------------------------------------------------------------
// FetchSBVRatesFromDB — fallback for policy rates when HTML parse fails.
// ---------------------------------------------------------------------------

// SBVPolicyRatesDBResult holds the policy rates read from sbv_rates DB table.
// Used as fallback when HTML parse returns ParseOK=false.
type SBVPolicyRatesDBResult struct {
	// RefiRatePct from sbv_rates.refinancing_rate_pct.
	RefiRatePct float64
	// DiscountRatePct from sbv_rates.discount_rate_pct.
	DiscountRatePct float64
	// FetchedAt from sbv_rates.fetched_at (for is_estimate stamping).
	FetchedAt string
	// OK is true when at least refi > 0.
	OK bool
}

// FetchSBVPolicyRatesFromDB reads refi + discount from sbv_rates DB table.
// Uses DB_PATH env var; falls back to /app/data/market.db.
// Lombard rate is NOT stored in sbv_rates — will be 0 in DB fallback path.
func FetchSBVPolicyRatesFromDB(ctx context.Context) SBVPolicyRatesDBResult {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}

	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", dbPath))
	if err != nil {
		return SBVPolicyRatesDBResult{}
	}
	defer db.Close()

	const query = `
		SELECT refinancing_rate_pct, discount_rate_pct, fetched_at
		FROM sbv_rates
		WHERE source = 'sbv'
		LIMIT 1`

	var (
		refi      sql.NullFloat64
		discount  sql.NullFloat64
		fetchedAt sql.NullString
	)

	if err := db.QueryRowContext(ctx, query).Scan(&refi, &discount, &fetchedAt); err != nil {
		return SBVPolicyRatesDBResult{}
	}

	var result SBVPolicyRatesDBResult
	if refi.Valid && refi.Float64 > 0 {
		result.RefiRatePct = refi.Float64
		result.OK = true
	}
	if discount.Valid && discount.Float64 > 0 {
		result.DiscountRatePct = discount.Float64
	}
	if fetchedAt.Valid {
		result.FetchedAt = fetchedAt.String
	}
	return result
}

// ParseVNRate parses a VN-format rate string (e.g. "4,5" → 4.5, "4.5" → 4.5).
// Used by the HTML parser when extracting numbers from Vietnamese text.
// Returns 0 on any parse error.
func ParseVNRate(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "%", "")
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, ",", ".")
	s = strings.TrimSpace(s)
	var val float64
	if _, err := fmt.Sscanf(s, "%f", &val); err == nil && val > 0 && val < 50 {
		return val
	}
	return 0
}
