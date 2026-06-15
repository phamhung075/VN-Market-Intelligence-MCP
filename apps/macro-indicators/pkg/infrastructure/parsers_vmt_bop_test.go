// Package infrastructure — unit tests for BuildBOPFetchURL (F-BOP-ENCODING gate).
//
// Asserts that BuildBOPFetchURL produces a well-formed URL with all OData filter
// characters properly percent-encoded.  The un-encoded form (literal spaces, single-
// quotes, operators) was the confirmed root cause of "context deadline exceeded" when
// SBV Liferay never resolved the malformed request.
package infrastructure

import (
	"net/url"
	"strings"
	"testing"
)

// TestBuildBOPFetchURL_FilterIsPercentEncoded is the primary F-BOP-ENCODING gate.
// It verifies that the raw query string of the built URL contains no literal spaces
// or single-quotes — both reserved characters in RFC 3986 query strings.
func TestBuildBOPFetchURL_FilterIsPercentEncoded(t *testing.T) {
	cases := []struct {
		name        string
		start, end  string
	}{
		{"Q4-2025", "2025-10-01", "2025-12-31"},
		{"Q1-2026", "2026-01-01", "2026-03-31"},
		{"Q3-2025", "2025-07-01", "2025-09-30"},
		{"Q2-2025", "2025-04-01", "2025-06-30"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rawURL := BuildBOPFetchURL(tc.start, tc.end)

			// Must be parseable as a URL.
			parsed, err := url.Parse(rawURL)
			if err != nil {
				t.Fatalf("url.Parse failed: %v (url=%q)", err, rawURL)
			}

			// Query string must be present.
			if parsed.RawQuery == "" {
				t.Fatalf("BuildBOPFetchURL returned URL with empty query string: %q", rawURL)
			}

			rawQuery := parsed.RawQuery

			// GATE 1: no literal space in the raw query string.
			// Root cause: un-encoded spaces caused SBV Liferay to never resolve the request
			// → context deadline exceeded in FetchBudgetSec window → degraded-200.
			if strings.Contains(rawQuery, " ") {
				t.Errorf("raw query contains literal space (F-BOP-ENCODING root cause): %q", rawQuery)
			}

			// GATE 2: no literal single-quote in the raw query string.
			// OData filter uses '' (two singles) which must be encoded.
			if strings.Contains(rawQuery, "'") {
				t.Errorf("raw query contains literal single-quote (un-encoded): %q", rawQuery)
			}

			// GATE 3: url.ParseQuery must succeed — confirms well-formed query string.
			decoded, err := url.ParseQuery(rawQuery)
			if err != nil {
				t.Fatalf("url.ParseQuery failed: %v (rawQuery=%q)", err, rawQuery)
			}

			// GATE 4: decoded filter must round-trip the quarter window dates.
			filterVal := decoded.Get("filter")
			if filterVal == "" {
				t.Fatalf("decoded query has no 'filter' key (rawQuery=%q)", rawQuery)
			}
			if !strings.Contains(filterVal, tc.start) {
				t.Errorf("decoded filter missing quarterStart=%q: %q", tc.start, filterVal)
			}
			if !strings.Contains(filterVal, tc.end) {
				t.Errorf("decoded filter missing quarterEnd=%q: %q", tc.end, filterVal)
			}

			// GATE 5: decoded filter must contain required OData operator keywords.
			for _, kw := range []string{"status eq 0", "Date48362898 ge", "Date48362898 le", "Date48362898 gt"} {
				if !strings.Contains(filterVal, kw) {
					t.Errorf("decoded filter missing OData keyword %q: %q", kw, filterVal)
				}
			}

			// GATE 6: required static query params must be present and correct.
			if got := decoded.Get("scopeKey"); got != "20117" {
				t.Errorf("scopeKey=%q, want '20117'", got)
			}
			if got := decoded.Get("contentStructureId"); got != "10063168" {
				t.Errorf("contentStructureId=%q, want '10063168'", got)
			}
			if got := decoded.Get("pageSize"); got != "100" {
				t.Errorf("pageSize=%q, want '100'", got)
			}
		})
	}
}

// TestBuildBOPFetchURL_BaseURL asserts the endpoint base URL is correct.
func TestBuildBOPFetchURL_BaseURL(t *testing.T) {
	rawURL := BuildBOPFetchURL("2025-10-01", "2025-12-31")
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("url.Parse: %v", err)
	}
	wantBase := "https://www.sbv.gov.vn/o/article/v1.0/articles"
	got := parsed.Scheme + "://" + parsed.Host + parsed.Path
	if got != wantBase {
		t.Errorf("base URL=%q, want %q", got, wantBase)
	}
}
