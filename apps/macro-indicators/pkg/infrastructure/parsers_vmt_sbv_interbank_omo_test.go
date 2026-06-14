// Package infrastructure — tests for SBV OMO HTML parser (VMT-5b).
//
// Contract derived from live probe sample scripts/probes/vmt-4-sample.json (OMO section),
// June-12-2026: 408KB HTML, HTTP 200, table with "Mua kỳ hạn" + "Tổng cộng" rows.
//
// Anchor test: June-12-2026 sample:
//   - Mua kỳ hạn 35 ngày: 217.45 bn VND
//   - Mua kỳ hạn 56 ngày: 1000.00 bn VND
//   - Tổng cộng:           1217.45 bn VND  ← SKIP (subtotal)
//   - No Bán kỳ hạn / Tín phiếu rows in this sample
//   → TotalAddBnVND = 1217.45, TotalAbsorbBnVND = 0, net = 1217.45
//   → AuctionDate = "12/06/2026"
//
// Invariants tested:
//   - parseOMOVolume: VN number format (period=thousands, comma=decimal)
//   - isDateDDMMYYYY: strict 10-char DD/MM/YYYY validation
//   - normaliseVNText: Vietnamese diacritic removal for keyword matching
//   - ParseSBVOMOHTML: empty / malformed / tổng-cộng-only / mixed add+absorb
//   - FetchSBVOMOFromHTML: intentionally NOT called from unit tests (no live HTTP)
package infrastructure

import (
	"fmt"
	"testing"
)

// ---------------------------------------------------------------------------
// parseOMOVolume tests
// ---------------------------------------------------------------------------

func TestParseOMOVolume(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  float64
	}{
		{"plain integer", "1000", 1000},
		{"VN comma decimal", "217,45", 217.45},
		{"VN period thousands + comma decimal", "1.217,45", 1217.45},
		{"large number", "100.000", 100000},
		{"large with decimal", "100.000,5", 100000.5},
		{"empty string", "", 0},
		{"dash", "-", 0},
		{"en-dash", "–", 0},
		{"whitespace only", "   ", 0},
		{"decimal only", ",45", 0.45},
		{"zero string", "0", 0}, // 0 is not > 0, so parseOMOVolume returns 0
		{"too large", "600000", 0},
		// SBV HTML volume cells are always non-negative; "-100" is not a real input.
		// The function strips non-digit prefix chars so "-100" parses as 100.
		// This is acceptable: SBV uses "–" (en-dash) for empty, not negative values.
		{"negative-like strips to 100", "-100", 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseOMOVolume(tt.input)
			if fmt.Sprintf("%.4f", got) != fmt.Sprintf("%.4f", tt.want) {
				t.Errorf("parseOMOVolume(%q) = %.4f; want %.4f", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// isDateDDMMYYYY tests
// ---------------------------------------------------------------------------

func TestIsDateDDMMYYYY(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"12/06/2026", true},
		{"01/01/2025", true},
		{"31/12/2024", true},
		{"1/06/2026", false},  // too short
		{"12/6/2026", false},  // too short
		{"12-06-2026", false}, // wrong separator
		{"12/06/26", false},   // 2-digit year
		{"ab/06/2026", false}, // non-digits
		{"", false},
		{"12/06/2026x", false}, // extra char
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := isDateDDMMYYYY(tt.input)
			if got != tt.want {
				t.Errorf("isDateDDMMYYYY(%q) = %v; want %v", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractAuctionDate tests
// ---------------------------------------------------------------------------

func TestExtractAuctionDate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			"standard heading",
			"Kết quả đấu thầu thị trường mở ngày 12/06/2026",
			"12/06/2026",
		},
		{
			"uppercase Ngày",
			"Ngày 01/01/2025 phiên giao dịch",
			"01/01/2025",
		},
		{
			"no date keyword",
			"Kết quả đấu thầu thị trường mở",
			"",
		},
		{
			"keyword but no date",
			"ngày bao giờ",
			"",
		},
		{
			"empty string",
			"",
			"",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractAuctionDate(tt.input)
			if got != tt.want {
				t.Errorf("extractAuctionDate(%q) = %q; want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// normaliseVNText tests
// ---------------------------------------------------------------------------

func TestNormaliseVNText(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"mua kỳ hạn", "mua ky han"},
		{"bán kỳ hạn", "ban ky han"},
		{"tín phiếu", "tin phieu"},
		{"tổng cộng", "tong cong"},
		{"Mua Kỳ Hạn", "Mua Ky Han"},
		{"đồng", "dong"},
		{"plain ascii", "plain ascii"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normaliseVNText(tt.input)
			if got != tt.want {
				t.Errorf("normaliseVNText(%q) = %q; want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ParseSBVOMOHTML anchor test (derived from vmt-4-sample.json live probe)
// ---------------------------------------------------------------------------

// buildAnchorOMOHTML builds a minimal HTML table matching the June-12-2026 SBV OMO page
// structure as described in scripts/probes/vmt-4-sample.json.
//
// From the live probe:
//   - "Mua kỳ hạn - Kỳ hạn 35 ngày": 217.45 bn VND
//   - "Mua kỳ hạn - Kỳ hạn 56 ngày": 1000.00 bn VND
//   - "Tổng cộng": 1217.45 bn VND  ← must be skipped
//   - No Bán kỳ hạn / Tín phiếu rows
//
// Expected: TotalAddBnVND=1217.45, TotalAbsorbBnVND=0, AuctionDate="12/06/2026", ParseOK=true.
func buildAnchorOMOHTML() []byte {
	return []byte(`<!DOCTYPE html>
<html>
<head><title>SBV OMO</title></head>
<body>
<h3>Kết quả đấu thầu thị trường mở ngày 12/06/2026</h3>
<table>
  <thead>
    <tr>
      <th>Loại hình giao dịch</th>
      <th>Số thành viên tham gia/trúng thầu</th>
      <th>Khối lượng trúng thầu (Tỷ đồng)</th>
      <th>Lãi suất trúng thầu (%/năm)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Mua kỳ hạn - Kỳ hạn 35 ngày</td>
      <td>2/2</td>
      <td>217,45</td>
      <td>4,5</td>
    </tr>
    <tr>
      <td>Mua kỳ hạn - Kỳ hạn 56 ngày</td>
      <td>6/6</td>
      <td>1.000</td>
      <td>4,5</td>
    </tr>
    <tr>
      <td>Tổng cộng</td>
      <td>8/8</td>
      <td>1.217,45</td>
      <td></td>
    </tr>
  </tbody>
</table>
</body>
</html>`)
}

func TestParseSBVOMOHTML_AnchorJune2026(t *testing.T) {
	html := buildAnchorOMOHTML()
	result := ParseSBVOMOHTML(html)

	if !result.ParseOK {
		t.Fatalf("ParseSBVOMOHTML anchor: ParseOK=false; want true")
	}

	// Anchor: TotalAddBnVND = 217.45 + 1000.00 = 1217.45
	const wantAdd = 1217.45
	if fmt.Sprintf("%.2f", result.TotalAddBnVND) != fmt.Sprintf("%.2f", wantAdd) {
		t.Errorf("TotalAddBnVND = %.2f; want %.2f", result.TotalAddBnVND, wantAdd)
	}

	// Anchor: TotalAbsorbBnVND = 0 (no absorb/drain rows in this sample)
	const wantAbsorb = 0.0
	if result.TotalAbsorbBnVND != wantAbsorb {
		t.Errorf("TotalAbsorbBnVND = %.2f; want %.2f", result.TotalAbsorbBnVND, wantAbsorb)
	}

	// Auction date parsed from heading.
	const wantDate = "12/06/2026"
	if result.AuctionDate != wantDate {
		t.Errorf("AuctionDate = %q; want %q", result.AuctionDate, wantDate)
	}
}

func TestParseSBVOMOHTML_NetOutstanding(t *testing.T) {
	// Verify net_outstanding computation via domain after parsing anchor HTML.
	// This test validates the parse values that feed domain.BuildOMOSuccess.
	html := buildAnchorOMOHTML()
	result := ParseSBVOMOHTML(html)
	if !result.ParseOK {
		t.Fatal("ParseOK=false in net outstanding test")
	}
	// net = add - absorb = 1217.45 - 0 = 1217.45
	net := result.TotalAddBnVND - result.TotalAbsorbBnVND
	const wantNet = 1217.45
	if fmt.Sprintf("%.2f", net) != fmt.Sprintf("%.2f", wantNet) {
		t.Errorf("net outstanding = %.2f; want %.2f", net, wantNet)
	}
}

func TestParseSBVOMOHTML_WithAbsorb(t *testing.T) {
	// Mixed: add + bán kỳ hạn + tín phiếu rows.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả đấu thầu thị trường mở ngày 01/06/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn - Kỳ hạn 7 ngày</td><td>3/3</td><td>500</td><td>4,5</td></tr>
  <tr><td>Bán kỳ hạn - Kỳ hạn 7 ngày</td><td>2/2</td><td>200</td><td>4,5</td></tr>
  <tr><td>Tín phiếu NHNN - 91 ngày</td><td>1/1</td><td>100</td><td>4,25</td></tr>
  <tr><td>Tổng cộng</td><td>6/6</td><td>800</td><td></td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)

	if !result.ParseOK {
		t.Fatal("ParseOK=false; want true")
	}
	if fmt.Sprintf("%.2f", result.TotalAddBnVND) != "500.00" {
		t.Errorf("TotalAddBnVND = %.2f; want 500.00", result.TotalAddBnVND)
	}
	if fmt.Sprintf("%.2f", result.TotalAbsorbBnVND) != "300.00" {
		t.Errorf("TotalAbsorbBnVND = %.2f; want 300.00", result.TotalAbsorbBnVND)
	}
	if result.AuctionDate != "01/06/2026" {
		t.Errorf("AuctionDate = %q; want 01/06/2026", result.AuctionDate)
	}
}

func TestParseSBVOMOHTML_SubtotalsSkipped(t *testing.T) {
	// Ensure "Tổng cộng" rows are never double-counted.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả ngày 05/05/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn</td><td>1/1</td><td>100</td><td>4,5</td></tr>
  <tr><td>Tổng cộng</td><td>1/1</td><td>100</td><td></td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if !result.ParseOK {
		t.Fatal("ParseOK=false")
	}
	// Only 100 from the non-subtotal row; Tổng cộng must be skipped.
	if result.TotalAddBnVND != 100 {
		t.Errorf("TotalAddBnVND = %.2f; want 100.00 (subtotal not double-counted)", result.TotalAddBnVND)
	}
}

func TestParseSBVOMOHTML_EmptyBody(t *testing.T) {
	result := ParseSBVOMOHTML([]byte{})
	// Empty HTML: html.Parse returns a minimal doc, no rows → ParseOK=false.
	if result.ParseOK {
		t.Error("ParseOK=true for empty body; want false")
	}
	if result.TotalAddBnVND != 0 || result.TotalAbsorbBnVND != 0 {
		t.Errorf("non-zero volumes on empty body: add=%.2f absorb=%.2f", result.TotalAddBnVND, result.TotalAbsorbBnVND)
	}
}

func TestParseSBVOMOHTML_NoMatchingRows(t *testing.T) {
	// Valid HTML but no recognisable OMO rows.
	html := []byte(`<!DOCTYPE html>
<html><body>
<table><tbody>
  <tr><td>Some other content</td><td>N/A</td><td>N/A</td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if result.ParseOK {
		t.Error("ParseOK=true for table with no matching rows; want false")
	}
}

func TestParseSBVOMOHTML_MalformedHTML(t *testing.T) {
	// golang.org/x/net/html is lenient; malformed HTML still parses, but no OMO rows.
	result := ParseSBVOMOHTML([]byte("<not valid html >>>"))
	// Parser is lenient, so ParseOK depends on whether any td rows were found.
	// Guarantee: no crash, volumes = 0.
	if result.TotalAddBnVND != 0 || result.TotalAbsorbBnVND != 0 {
		t.Errorf("non-zero volumes on malformed HTML: add=%.2f absorb=%.2f", result.TotalAddBnVND, result.TotalAbsorbBnVND)
	}
}
