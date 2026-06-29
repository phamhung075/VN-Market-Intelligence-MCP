// Package infrastructure — P0-3-OMO-CURVE parser extension tests.
//
// Tests for the new functions added in P0-3-OMO-CURVE:
//   - parseTenorDays: "7 ngày" → 7, "14 ngày" → 14, "28 ngày" → 28, unknown → -1
//   - parseOMORate: VN decimal comma normalisation, % suffix strip, sanity cap
//   - parseMembersXY: "X/Y" split, single-number fallback, empty input
//   - ParseSBVOMOHTML Tenors: per-row OMOTenorRow populated from anchor HTML
//   - ParseSBVOMOHTML ParseWarnings: missing rate cell adds warning, ParseOK stays true
//
// All tests use pure-function / HTML-fixture inputs (no live HTTP calls).
package infrastructure

import (
	"fmt"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// parseTenorDays tests
// ---------------------------------------------------------------------------

func TestParseTenorDays(t *testing.T) {
	tests := []struct {
		name  string
		input string // must be normalised (lower-case ASCII) as collectOMORow passes it
		want  int
	}{
		{"7 day", "mua ky han - ky han 7 ngay", 7},
		{"14 day", "mua ky han - ky han 14 ngay", 14},
		{"28 day", "mua ky han - ky han 28 ngay", 28},
		{"35 day non-standard", "mua ky han - ky han 35 ngay", 35},
		{"91 day tin phieu", "tin phieu nhnn - 91 ngay", 91},
		{"56 day", "mua ky han - ky han 56 ngay", 56},
		{"no tenor text", "mua ky han", -1},
		{"ban ky han no tenor", "ban ky han", -1},
		{"empty", "", -1},
		{"ngay without preceding number", "ngay", -1},
		{"word before ngay", "abc ngay", -1}, // "abc" is not a number
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseTenorDays(tt.input)
			if got != tt.want {
				t.Errorf("parseTenorDays(%q) = %d; want %d", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// parseOMORate tests
// ---------------------------------------------------------------------------

func TestParseOMORate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  float64
	}{
		{"VN comma decimal with %", "4,75%", 4.75},
		{"VN comma decimal no %", "4,75", 4.75},
		{"integer rate", "4", 4.0},
		{"lower comma", "4,5", 4.5},
		{"period then comma (thousands.decimal)", "10,25", 10.25},
		{"empty", "", 0},
		{"dash", "-", 0},
		{"en-dash", "–", 0},
		{"whitespace only", "   ", 0},
		{"rate above 50 (implausible)", "55%", 0},
		{"zero", "0", 0},
		{"negative rate (implausible)", "-4,5%", 0},
		{"non-numeric", "N/A", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseOMORate(tt.input)
			if fmt.Sprintf("%.4f", got) != fmt.Sprintf("%.4f", tt.want) {
				t.Errorf("parseOMORate(%q) = %.4f; want %.4f", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// parseMembersXY tests
// ---------------------------------------------------------------------------

func TestParseMembersXY(t *testing.T) {
	tests := []struct {
		name             string
		input            string
		wantParticipating int
		wantWinning      int
		wantWarn         bool // whether a non-empty warn is returned
	}{
		{"2/2", "2/2", 2, 2, false},
		{"6/6", "6/6", 6, 6, false},
		{"3/2", "3/2", 3, 2, false}, // more participated than won
		{"8/8", "8/8", 8, 8, false},
		{"single number fallback", "5", 5, 5, true},
		{"empty string", "", 0, 0, true},
		{"dash", "-", 0, 0, true},
		{"non-numeric", "abc/def", 0, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, w, warn := parseMembersXY(tt.input, "test-row")
			if p != tt.wantParticipating {
				t.Errorf("participating = %d; want %d", p, tt.wantParticipating)
			}
			if w != tt.wantWinning {
				t.Errorf("winning = %d; want %d", w, tt.wantWinning)
			}
			if (warn != "") != tt.wantWarn {
				t.Errorf("warn presence = %v; want %v (warn=%q)", warn != "", tt.wantWarn, warn)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ParseSBVOMOHTML Tenors population test
// ---------------------------------------------------------------------------

func TestParseSBVOMOHTML_TenorRows_AnchorJune2026(t *testing.T) {
	// Re-use the anchor HTML from the original test file (buildAnchorOMOHTML).
	// The anchor has 2 mua-ky-han rows (35-day and 56-day) + 1 tong-cong subtotal.
	// Expected Tenors: 2 entries (subtotal skipped).
	html := buildAnchorOMOHTML()
	result := ParseSBVOMOHTML(html)

	if !result.ParseOK {
		t.Fatal("ParseOK=false; want true")
	}

	if len(result.Tenors) != 2 {
		t.Fatalf("len(Tenors) = %d; want 2 (tong-cong row skipped)", len(result.Tenors))
	}

	// Row 0: Mua kỳ hạn - Kỳ hạn 35 ngày, vol=217.45, rate=4.5, members=2/2
	r0 := result.Tenors[0]
	if r0.OperationType != "mua ky han" {
		t.Errorf("Tenors[0].OperationType = %q; want %q", r0.OperationType, "mua ky han")
	}
	if r0.ParsedTenorDays != 35 {
		t.Errorf("Tenors[0].ParsedTenorDays = %d; want 35", r0.ParsedTenorDays)
	}
	if fmt.Sprintf("%.2f", r0.VolumeBnVND) != "217.45" {
		t.Errorf("Tenors[0].VolumeBnVND = %.2f; want 217.45", r0.VolumeBnVND)
	}
	if fmt.Sprintf("%.2f", r0.WinningRatePct) != "4.50" {
		t.Errorf("Tenors[0].WinningRatePct = %.2f; want 4.50", r0.WinningRatePct)
	}
	if r0.MembersParticipating != 2 {
		t.Errorf("Tenors[0].MembersParticipating = %d; want 2", r0.MembersParticipating)
	}
	if r0.MembersWinning != 2 {
		t.Errorf("Tenors[0].MembersWinning = %d; want 2", r0.MembersWinning)
	}
	if fmt.Sprintf("%.4f", r0.MemberWinRatio) != "1.0000" {
		t.Errorf("Tenors[0].MemberWinRatio = %.4f; want 1.0000", r0.MemberWinRatio)
	}

	// Row 1: Mua kỳ hạn - Kỳ hạn 56 ngày, vol=1000, rate=4.5, members=6/6
	r1 := result.Tenors[1]
	if r1.ParsedTenorDays != 56 {
		t.Errorf("Tenors[1].ParsedTenorDays = %d; want 56", r1.ParsedTenorDays)
	}
	if fmt.Sprintf("%.2f", r1.VolumeBnVND) != "1000.00" {
		t.Errorf("Tenors[1].VolumeBnVND = %.2f; want 1000.00", r1.VolumeBnVND)
	}
	if r1.MembersParticipating != 6 {
		t.Errorf("Tenors[1].MembersParticipating = %d; want 6", r1.MembersParticipating)
	}
}

func TestParseSBVOMOHTML_TenorRows_WithAbsorb(t *testing.T) {
	// HTML with add + ban-ky-han + tin-phieu rows.
	// Verifies OperationType is set correctly for each row type.
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
		t.Fatal("ParseOK=false")
	}
	if len(result.Tenors) != 3 {
		t.Fatalf("len(Tenors) = %d; want 3", len(result.Tenors))
	}

	opTypes := []string{"mua ky han", "ban ky han", "tin phieu"}
	tenorDays := []int{7, 7, 91}
	for i, row := range result.Tenors {
		if row.OperationType != opTypes[i] {
			t.Errorf("Tenors[%d].OperationType = %q; want %q", i, row.OperationType, opTypes[i])
		}
		if row.ParsedTenorDays != tenorDays[i] {
			t.Errorf("Tenors[%d].ParsedTenorDays = %d; want %d", i, row.ParsedTenorDays, tenorDays[i])
		}
	}

	// Tín phiếu rate: "4,25" → 4.25
	if fmt.Sprintf("%.2f", result.Tenors[2].WinningRatePct) != "4.25" {
		t.Errorf("Tenors[2].WinningRatePct = %.2f; want 4.25", result.Tenors[2].WinningRatePct)
	}
}

func TestParseSBVOMOHTML_TenorRows_UnknownTenor(t *testing.T) {
	// A row with no ngày in the type text gets ParsedTenorDays = -1.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả ngày 05/05/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn</td><td>1/1</td><td>100</td><td>4,5</td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if len(result.Tenors) != 1 {
		t.Fatalf("len(Tenors) = %d; want 1", len(result.Tenors))
	}
	if result.Tenors[0].ParsedTenorDays != -1 {
		t.Errorf("ParsedTenorDays = %d; want -1 for unknown tenor", result.Tenors[0].ParsedTenorDays)
	}
}

func TestParseSBVOMOHTML_ParseWarning_MissingRateCell(t *testing.T) {
	// Row with only 3 cells (no rate column) → ParseWarning added, ParseOK still true.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả ngày 10/06/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn - Kỳ hạn 7 ngày</td><td>2/2</td><td>300</td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if !result.ParseOK {
		t.Error("ParseOK=false; want true (missing rate does not abort parse)")
	}
	if len(result.Tenors) != 1 {
		t.Fatalf("len(Tenors) = %d; want 1", len(result.Tenors))
	}
	if result.Tenors[0].WinningRatePct != 0 {
		t.Errorf("WinningRatePct = %.2f; want 0 (no rate column)", result.Tenors[0].WinningRatePct)
	}
	if len(result.ParseWarnings) == 0 {
		t.Error("ParseWarnings should be non-empty when rate column is absent")
	}
	// Verify warning mentions the row.
	found := false
	for _, w := range result.ParseWarnings {
		if strings.Contains(w, "no rate column") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("ParseWarnings doesn't contain 'no rate column'; got: %v", result.ParseWarnings)
	}
}

func TestParseSBVOMOHTML_ParseWarning_EmptyRateCell(t *testing.T) {
	// Row with 4 cells but empty rate cell → ParseWarning, WinningRatePct=0, ParseOK true.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả ngày 10/06/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn - Kỳ hạn 7 ngày</td><td>2/2</td><td>300</td><td></td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if !result.ParseOK {
		t.Error("ParseOK=false; want true")
	}
	if result.Tenors[0].WinningRatePct != 0 {
		t.Errorf("WinningRatePct = %.2f; want 0 (empty rate cell)", result.Tenors[0].WinningRatePct)
	}
	if len(result.ParseWarnings) == 0 {
		t.Error("ParseWarnings should be non-empty for empty rate cell")
	}
}

func TestParseSBVOMOHTML_TenorRows_EmptyResult(t *testing.T) {
	// Empty HTML → no Tenors.
	result := ParseSBVOMOHTML([]byte{})
	if len(result.Tenors) != 0 {
		t.Errorf("Tenors should be empty for empty HTML; got %d entries", len(result.Tenors))
	}
}

func TestParseSBVOMOHTML_MembersXYParsed(t *testing.T) {
	// Verify member X/Y correctly split for a 3/2 case.
	html := []byte(`<!DOCTYPE html>
<html><body>
<h3>Kết quả ngày 15/06/2026</h3>
<table><tbody>
  <tr><td>Mua kỳ hạn - Kỳ hạn 7 ngày</td><td>3/2</td><td>500</td><td>4,75</td></tr>
</tbody></table>
</body></html>`)

	result := ParseSBVOMOHTML(html)
	if len(result.Tenors) != 1 {
		t.Fatalf("Tenors len = %d", len(result.Tenors))
	}
	r := result.Tenors[0]
	if r.MembersParticipating != 3 {
		t.Errorf("MembersParticipating = %d; want 3", r.MembersParticipating)
	}
	if r.MembersWinning != 2 {
		t.Errorf("MembersWinning = %d; want 2", r.MembersWinning)
	}
	if fmt.Sprintf("%.4f", r.MemberWinRatio) != "0.6667" {
		t.Errorf("MemberWinRatio = %.4f; want 0.6667", r.MemberWinRatio)
	}
}
