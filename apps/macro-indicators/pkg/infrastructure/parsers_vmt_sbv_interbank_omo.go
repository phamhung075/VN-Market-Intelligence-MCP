// Package infrastructure — SBV OMO + interbank parsers for VMT-5b.
//
// Two components:
//
//  1. FetchSBVOMOFromHTML — fetches www.sbv.gov.vn nghiep-vu-thi-truong-mo Liferay HTML
//     and parses the most-recent OMO auction result table.
//     Source: same SBV domain as BOP + policy rates — direct fetch, NO VPS proxy.
//     TLS: buildDirectTLSConfig (VPS_CACERT_PATH pattern, NEVER -k, InsecureSkipVerify=false).
//     Parses: Mua kỳ hạn (reverse-repo add) + Bán kỳ hạn/Tín phiếu (absorb/drain).
//     net_outstanding_bn_vnd = sum(add) - sum(absorb), maturity-date aware tally.
//     URL pattern: /vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F
//     (stable monthly-release page — per-month release confirmed from June-12-2026 408KB HTML probe).
//
//  2. ParseSBVOMOHTML — pure parser for the fetched HTML bytes (testable without network).
//     Contract derived from live probe sample scripts/probes/vmt-4-sample.json (OMO section):
//     - Table columns: Loại hình giao dịch | Số thành viên | Khối lượng (Tỷ đồng) | Lãi suất
//     - Operation type keywords: "mua kỳ hạn" (add), "bán kỳ hạn" (absorb), "tín phiếu" (absorb)
//     - "tổng cộng" rows are SKIPPED (subtotals, not individual positions).
//     - Auction date: parsed from "ngày DD/MM/YYYY" in heading text near the table.
//
//  3. InterbankRate — PERMANENTLY blocked (architect Decision B):
//     dttktt.sbv.gov.vn (Oracle WebCenter, 202.58.245.101) = 100% packet loss from Vinahost VPS.
//     NO fetch is attempted. The domain function BuildInterbankRate() returns is_estimate=true +
//     rate_1w_pct=null + blocked_reason permanently. This file provides no new HTTP call for interbank.
//
// Fail-closed: OMOParseResult.ParseOK=false on any fetch or parse error.
// is_estimate=true is set by the use case (via domain.BuildOMOFailed) when ParseOK=false.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"

	"golang.org/x/net/html"
)

// sbvOMOURL is the SBV Liferay portal page for Open Market Operations (nghiệp vụ thị trường mở).
// Same domain as www.sbv.gov.vn — direct fetch, no VPS proxy.
// URL structure is stable: per-month OMO results are published on this single page.
// Confirmed reachable (June-12-2026 probe: HTTP 200, 408KB HTML, OMO table present).
const sbvOMOURL = "https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F"

// omoFetchTimeout is the HTTP timeout for the SBV OMO page fetch.
// 408KB page + Liferay overhead — 45s is conservative but safe.
const omoFetchTimeout = 45 * time.Second

// OMOParseResult holds the parsed values from the SBV OMO Liferay HTML page.
type OMOParseResult struct {
	// TotalAddBnVND is the total Mua kỳ hạn (reverse-repo add) volume in billion VND.
	// Sum of all "mua kỳ hạn" rows, excluding "tổng cộng" subtotals.
	TotalAddBnVND float64

	// TotalAbsorbBnVND is the total Bán kỳ hạn + Tín phiếu (absorb/drain) volume in billion VND.
	// Sum of all "bán kỳ hạn" and "tín phiếu" rows, excluding "tổng cộng" subtotals.
	TotalAbsorbBnVND float64

	// AuctionDate is the most-recent auction date string (e.g. "12/06/2026") parsed from the
	// heading text near the OMO results table ("Kết quả đấu thầu thị trường mở ngày DD/MM/YYYY").
	AuctionDate string

	// ParseOK is true when at least one add or absorb row was successfully parsed.
	ParseOK bool
}

// FetchSBVOMOFromHTML fetches the SBV OMO Liferay HTML page and parses the auction result table.
//
// TLS hardening: uses VPS_CACERT_PATH env var (same pattern as buildDirectTLSConfig in adapters_vmt_sjc_fx.go).
// NEVER uses -k / InsecureSkipVerify. Returns OMOParseResult with ParseOK=false on any error.
//
// Fail-closed: caller (use case) treats ParseOK=false as is_estimate=true via domain.BuildOMOFailed.
// NO VPS proxy — SBV www.sbv.gov.vn is directly reachable (confirmed PROBE-4).
func FetchSBVOMOFromHTML(ctx context.Context) (OMOParseResult, error) {
	caCertPath := os.Getenv("VPS_CACERT_PATH")

	tlsCfg, err := buildDirectTLSConfig(caCertPath)
	if err != nil {
		return OMOParseResult{}, fmt.Errorf("sbv_omo: TLS config: %w", err)
	}

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
		Timeout:   omoFetchTimeout,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sbvOMOURL, nil)
	if err != nil {
		return OMOParseResult{}, fmt.Errorf("sbv_omo: build request: %w", err)
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return OMOParseResult{}, fmt.Errorf("sbv_omo: fetch %s: %w", sbvOMOURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return OMOParseResult{}, fmt.Errorf("sbv_omo: HTTP %d from %s", resp.StatusCode, sbvOMOURL)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return OMOParseResult{}, fmt.Errorf("sbv_omo: read body: %w", err)
	}

	return ParseSBVOMOHTML(body), nil
}

// ParseSBVOMOHTML parses the raw SBV nghiep-vu-thi-truong-mo HTML body.
//
// Contract (derived from live probe sample scripts/probes/vmt-4-sample.json, June-12-2026):
//
// Table structure:
//   - Loại hình giao dịch | Số thành viên tham gia/trúng thầu | Khối lượng trúng thầu (Tỷ đồng) | Lãi suất
//   - "Mua kỳ hạn" rows → add (reverse-repo, injects liquidity)
//   - "Bán kỳ hạn" rows → absorb (drains liquidity)
//   - "Tín phiếu NHNN" rows → absorb (NHNN bills, drains liquidity)
//   - "Tổng cộng" rows → SKIP (subtotals only)
//
// Auction date: extracted from heading text matching "ngày DD/MM/YYYY" pattern.
//
// net_outstanding_bn_vnd = TotalAddBnVND - TotalAbsorbBnVND.
// ParseOK=true when at least one non-subtotal add or absorb row parsed successfully.
func ParseSBVOMOHTML(body []byte) OMOParseResult {
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return OMOParseResult{ParseOK: false}
	}

	var result OMOParseResult
	collectOMOFromDoc(doc, &result)

	// ParseOK when at least one add or absorb row was found.
	result.ParseOK = result.TotalAddBnVND > 0 || result.TotalAbsorbBnVND > 0

	return result
}

// collectOMOFromDoc walks the HTML document collecting OMO table rows and the auction date.
func collectOMOFromDoc(n *html.Node, result *OMOParseResult) {
	if n == nil {
		return
	}

	// Extract auction date from heading text ("ngày DD/MM/YYYY").
	if n.Type == html.TextNode && result.AuctionDate == "" {
		if date := extractAuctionDate(n.Data); date != "" {
			result.AuctionDate = date
		}
	}

	// Process <tr> table rows.
	if n.Type == html.ElementNode && n.Data == "tr" {
		collectOMORow(n, result)
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		collectOMOFromDoc(c, result)
	}
}

// collectOMORow processes a single <tr> node to extract OMO operation type and volume.
//
// Contract from live probe:
//   - Column 0: Loại hình giao dịch (transaction type text)
//   - Column 2: Khối lượng trúng thầu (volume in billion VND)
//
// Rows identified as "tổng cộng" (subtotals) are skipped.
// Operation classification:
//   - "mua kỳ hạn" → add
//   - "bán kỳ hạn" → absorb
//   - "tín phiếu" → absorb
func collectOMORow(tr *html.Node, result *OMOParseResult) {
	// Collect all <td> cells in this row.
	var cells []*html.Node
	for c := tr.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.Data == "td" {
			cells = append(cells, c)
		}
	}

	// Need at least 3 columns (type | members | volume).
	if len(cells) < 3 {
		return
	}

	// Column 0: transaction type — normalise for keyword matching.
	rawType := strings.TrimSpace(extractText(cells[0]))
	typeText := strings.ToLower(normaliseVNText(rawType))

	// Skip subtotal rows.
	if strings.Contains(typeText, "tong cong") {
		return
	}

	// Column 2: volume in billion VND.
	volumeText := extractText(cells[2])
	volume := parseOMOVolume(volumeText)
	if volume <= 0 {
		return
	}

	// Classify operation type.
	switch {
	case strings.Contains(typeText, "mua ky han"):
		result.TotalAddBnVND += volume
	case strings.Contains(typeText, "ban ky han"):
		result.TotalAbsorbBnVND += volume
	case strings.Contains(typeText, "tin phieu"):
		result.TotalAbsorbBnVND += volume
	}
}

// extractAuctionDate scans a text node for the pattern "ngày DD/MM/YYYY".
// Returns the DD/MM/YYYY date string when found; empty string otherwise.
// Matches SBV heading format: "Kết quả đấu thầu thị trường mở ngày 12/06/2026".
func extractAuctionDate(text string) string {
	// Normalise to find the "ngay" keyword regardless of diacritics.
	lower := strings.ToLower(normaliseVNText(text))
	const prefix = "ngay "
	idx := strings.Index(lower, prefix)
	if idx < 0 {
		return ""
	}

	// Find the corresponding position in the original text.
	// Because normalisation is byte-length-changing, re-scan the original.
	// Simple approach: find "ngày " or "ngay " in the original text and extract after it.
	for _, needle := range []string{"ngày ", "Ngày ", "NGÀY ", "ngay "} {
		if i := strings.Index(text, needle); i >= 0 {
			after := strings.TrimSpace(text[i+len(needle):])
			if len(after) >= 10 && isDateDDMMYYYY(after[:10]) {
				return after[:10]
			}
		}
	}
	return ""
}

// isDateDDMMYYYY validates that s matches DD/MM/YYYY pattern (lenient digit check).
func isDateDDMMYYYY(s string) bool {
	if len(s) != 10 {
		return false
	}
	if s[2] != '/' || s[5] != '/' {
		return false
	}
	for _, i := range []int{0, 1, 3, 4, 6, 7, 8, 9} {
		if !unicode.IsDigit(rune(s[i])) {
			return false
		}
	}
	return true
}

// parseOMOVolume parses a Vietnamese number string representing volume in billion VND.
// VN numeric format: period (.) as thousands separator, comma (,) as decimal.
// Example: "1.217,45" → 1217.45; "1000" → 1000; "217,45" → 217.45.
// Returns 0 on parse failure.
func parseOMOVolume(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" || s == "–" {
		return 0
	}
	// Remove thousands separators (VN: period).
	s = strings.ReplaceAll(s, ".", "")
	// Replace decimal comma with dot.
	s = strings.ReplaceAll(s, ",", ".")
	// Remove any remaining non-numeric characters except the decimal dot.
	var buf strings.Builder
	dotSeen := false
	for _, r := range s {
		switch {
		case unicode.IsDigit(r):
			buf.WriteRune(r)
		case r == '.' && !dotSeen:
			buf.WriteRune(r)
			dotSeen = true
		}
	}
	cleaned := buf.String()
	if cleaned == "" {
		return 0
	}

	var val float64
	if _, err := fmt.Sscanf(cleaned, "%f", &val); err != nil {
		return 0
	}
	// Sanity: OMO volumes are 0–500000 billion VND (up to 500 trillion VND).
	if val < 0 || val > 500_000 {
		return 0
	}
	return val
}

// normaliseVNText replaces common Vietnamese accented characters with their ASCII equivalents
// for reliable keyword matching. Used only for operation-type and heading classification.
func normaliseVNText(s string) string {
	r := strings.NewReplacer(
		// a variants
		"à", "a", "á", "a", "ả", "a", "ã", "a", "ạ", "a",
		"ă", "a", "ắ", "a", "ặ", "a", "ằ", "a", "ẳ", "a", "ẵ", "a",
		"â", "a", "ấ", "a", "ầ", "a", "ẩ", "a", "ẫ", "a", "ậ", "a",
		"À", "a", "Á", "a", "Ả", "a", "Ã", "a", "Ạ", "a",
		"Ă", "a", "Ắ", "a", "Ặ", "a", "Ằ", "a", "Ẳ", "a", "Ẵ", "a",
		"Â", "a", "Ấ", "a", "Ầ", "a", "Ẩ", "a", "Ẫ", "a", "Ậ", "a",
		// e variants
		"è", "e", "é", "e", "ẻ", "e", "ẽ", "e", "ẹ", "e",
		"ê", "e", "ế", "e", "ề", "e", "ể", "e", "ễ", "e", "ệ", "e",
		"È", "e", "É", "e", "Ẻ", "e", "Ẽ", "e", "Ẹ", "e",
		"Ê", "e", "Ế", "e", "Ề", "e", "Ể", "e", "Ễ", "e", "Ệ", "e",
		// i variants
		"ì", "i", "í", "i", "ỉ", "i", "ĩ", "i", "ị", "i",
		"Ì", "i", "Í", "i", "Ỉ", "i", "Ĩ", "i", "Ị", "i",
		// o variants
		"ò", "o", "ó", "o", "ỏ", "o", "õ", "o", "ọ", "o",
		"ô", "o", "ố", "o", "ồ", "o", "ổ", "o", "ỗ", "o", "ộ", "o",
		"ơ", "o", "ớ", "o", "ờ", "o", "ở", "o", "ỡ", "o", "ợ", "o",
		"Ò", "o", "Ó", "o", "Ỏ", "o", "Õ", "o", "Ọ", "o",
		"Ô", "o", "Ố", "o", "Ồ", "o", "Ổ", "o", "Ỗ", "o", "Ộ", "o",
		"Ơ", "o", "Ớ", "o", "Ờ", "o", "Ở", "o", "Ỡ", "o", "Ợ", "o",
		// u variants
		"ù", "u", "ú", "u", "ủ", "u", "ũ", "u", "ụ", "u",
		"ư", "u", "ứ", "u", "ừ", "u", "ử", "u", "ữ", "u", "ự", "u",
		"Ù", "u", "Ú", "u", "Ủ", "u", "Ũ", "u", "Ụ", "u",
		"Ư", "u", "Ứ", "u", "Ừ", "u", "Ử", "u", "Ữ", "u", "Ự", "u",
		// y variants
		"ỳ", "y", "ý", "y", "ỷ", "y", "ỹ", "y", "ỵ", "y",
		"Ỳ", "y", "Ý", "y", "Ỷ", "y", "Ỹ", "y", "Ỵ", "y",
		// d
		"đ", "d", "Đ", "d",
	)
	return r.Replace(s)
}
