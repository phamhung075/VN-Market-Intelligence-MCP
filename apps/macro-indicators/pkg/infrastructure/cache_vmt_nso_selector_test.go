// Package infrastructure — unit tests for reBaiTop selector + extractLatestPressURL.
//
// Regression guard for F-NSO-SELECTOR: NSO WordPress theme switched from relative
// paths (/bai-top/…) to absolute URLs (https://www.nso.gov.vn/bai-top/…) in mid-2026.
// The old reBaiTop returned 0 matches against absolute URLs, aborting the 3-step
// discovery chain and returning degraded-200.  These tests pin the corrected behaviour.
//
// Tests use only stdlib + the package's own unexported function (same package).
// No DB, no VPS, no network — pure in-memory HTML fixture.
//
// Fence-C: pkg/infrastructure test; imports only stdlib.
package infrastructure

import (
	"fmt"
	"testing"
)

// TestReBaiTop_MatchesAbsoluteURL verifies that reBaiTop matches the live absolute-URL
// format emitted by NSO WordPress since mid-2026, and that the capture groups are correct.
func TestReBaiTop_MatchesAbsoluteURL(t *testing.T) {
	// Fixture: HTML fragment from live NSO index page (step-1 fetch, 2026-06-15).
	// Uses the shape confirmed by ops-vps-fetch recon (F-NSO-SELECTOR recon.md).
	html := []byte(`
<div class="archive-container">
  <p><a href="https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/"></p>
  <section class="item">
    <h3>Báo cáo tình hình kinh tế - xã hội tháng Năm và 5 tháng đầu năm 2026</h3>
    <p>
      <span class="archive-issue-date">Ngày đăng: 03/06/2026</span>
      <span class="archive-reference-period">Kỳ tham chiếu: 5/2026</span>
    </p>
  </section>
  <p><a href="https://www.nso.gov.vn/bai-top/2026/05/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-tu-va-4-thang-dau-nam-2026/"></p>
  <p><a href="https://www.nso.gov.vn/bai-top/2026/04/bao-cao-tinh-hinh-kinh-te-xa-hoi-quy-i-nam-2026/"></p>
</div>
`)

	m := reBaiTop.FindSubmatch(html)
	if m == nil {
		t.Fatal("reBaiTop returned nil — absolute NSO URL not matched; regex is broken")
	}

	wantURL := "https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/"
	wantYYYY := "2026"
	wantMM := "06"

	if got := string(m[1]); got != wantURL {
		t.Errorf("m[1] (full URL) = %q, want %q", got, wantURL)
	}
	if got := string(m[2]); got != wantYYYY {
		t.Errorf("m[2] (YYYY) = %q, want %q", got, wantYYYY)
	}
	if got := string(m[3]); got != wantMM {
		t.Errorf("m[3] (MM) = %q, want %q", got, wantMM)
	}
}

// TestReBaiTop_RejectsRelativePath verifies that the old relative-path shape
// (/bai-top/YYYY/MM/…) no longer matches — it should NOT be accepted by the new regex.
// This is a regression guard: if the regex ever regresses to matching relative paths
// but the URL-building logic is removed, it would silently return a malformed pressURL.
func TestReBaiTop_RejectsRelativePath(t *testing.T) {
	// Old HTML format (pre-mid-2026 NSO WordPress theme).
	html := []byte(`<p><a href="/bai-top/2026/06/some-article/"></p>`)

	m := reBaiTop.FindSubmatch(html)
	if m != nil {
		t.Errorf("reBaiTop matched a relative path %q — should only match absolute https://www.nso.gov.vn URLs",
			string(m[1]))
	}
}

// TestExtractLatestPressURL_AbsoluteURL is the integration-level test: the full
// extractLatestPressURL function must return the correct pressURL and period from
// a multi-article NSO index page fixture.
func TestExtractLatestPressURL_AbsoluteURL(t *testing.T) {
	cases := []struct {
		name       string
		html       string
		wantURL    string
		wantPeriod string
		wantErr    bool
	}{
		{
			name: "single article — newest is first",
			html: `<p><a href="https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/"></p>`,
			wantURL:    "https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/",
			wantPeriod: "2026-06",
		},
		{
			name: "multi-article — returns first (newest)",
			html: `
<p><a href="https://www.nso.gov.vn/bai-top/2026/06/bao-cao-thang-6/"></p>
<p><a href="https://www.nso.gov.vn/bai-top/2026/05/bao-cao-thang-5/"></p>
<p><a href="https://www.nso.gov.vn/bai-top/2026/04/bao-cao-thang-4/"></p>`,
			wantURL:    "https://www.nso.gov.vn/bai-top/2026/06/bao-cao-thang-6/",
			wantPeriod: "2026-06",
		},
		{
			name: "different year and month — generic, not hardcoded",
			html: `<p><a href="https://www.nso.gov.vn/bai-top/2025/11/bao-cao-thang-11-2025/"></p>`,
			wantURL:    "https://www.nso.gov.vn/bai-top/2025/11/bao-cao-thang-11-2025/",
			wantPeriod: "2025-11",
		},
		{
			name:    "empty body — error",
			html:    `<div>no links here</div>`,
			wantErr: true,
		},
		{
			name:    "old relative-path format — error (not matched)",
			html:    `<p><a href="/bai-top/2026/06/some-article/"></p>`,
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pressURL, period, err := extractLatestPressURL([]byte(tc.html))
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error, got pressURL=%q period=%q", pressURL, period)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pressURL != tc.wantURL {
				t.Errorf("pressURL = %q, want %q", pressURL, tc.wantURL)
			}
			if period != tc.wantPeriod {
				t.Errorf("period = %q, want %q", period, tc.wantPeriod)
			}
		})
	}
}

// TestExtractLatestPressURL_ErrorMessage_IncludesBodySize verifies that the error
// returned when no bai-top link is found includes the body size for debuggability.
func TestExtractLatestPressURL_ErrorMessage_IncludesBodySize(t *testing.T) {
	body := []byte("no links")
	_, _, err := extractLatestPressURL(body)
	if err == nil {
		t.Fatal("expected error")
	}
	want := fmt.Sprintf("%d bytes", len(body))
	if got := err.Error(); !containsString(got, want) {
		t.Errorf("error %q does not contain body size %q", got, want)
	}
}

// containsString is a helper because we cannot use strings package in test assertions
// without importing it — just inline a simple check.
func containsString(s, substr string) bool {
	for i := range s {
		if i+len(substr) > len(s) {
			break
		}
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
