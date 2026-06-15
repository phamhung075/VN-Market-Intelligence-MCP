// Package infrastructure — unit tests for BOP parser and URL builder.
//
// Tests added by F-BOP-QUERY-RECON fix:
//   - TestParseBOPResponse_ArticlesKey: root key "articles" (NOT "items") is required.
//   - TestParseBOPResponse_DeduplicateByArticleId: Liferay ~3-4 locale copies per article.
//   - TestParseBOPResponse_ArticlesFirstIsLatest: articles[0] = latest quarter.
//   - TestBuildBOPFetchURL_GenericNoDateRange: URL uses broad filter, no quarter bounds.
//
// Original F-BOP-ENCODING gate tests retained unchanged (encoding correctness).
package infrastructure

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
)

// TestBuildBOPFetchURL_FilterIsPercentEncoded is the primary F-BOP-ENCODING gate.
// It verifies that the raw query string of the built URL contains no literal spaces
// or single-quotes — both reserved characters in RFC 3986 query strings.
//
// Updated by F-BOP-QUERY-RECON: BuildBOPFetchURL now uses a generic filter
// (no quarter date-range bounds). The encoding gates still apply; GATE 4/5 updated
// to assert the broad filter content instead of per-quarter dates.
func TestBuildBOPFetchURL_FilterIsPercentEncoded(t *testing.T) {
	cases := []struct {
		name       string
		start, end string
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

			// GATE 4: decoded filter must be present and contain the broad filter.
			// F-BOP-QUERY-RECON: quarter params are IGNORED — filter is now generic.
			filterVal := decoded.Get("filter")
			if filterVal == "" {
				t.Fatalf("decoded query has no 'filter' key (rawQuery=%q)", rawQuery)
			}

			// GATE 5: decoded filter must contain the broad OData keywords.
			// F-BOP-QUERY-RECON: no date-range keywords (ge/le) — generic filter only.
			for _, kw := range []string{"status eq 0", "Date48362898 gt"} {
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

// ---------------------------------------------------------------------------
// F-BOP-QUERY-RECON fix tests
// ---------------------------------------------------------------------------

// bopArticlesJSON builds a minimal SBV Liferay JSON payload using the "articles"
// root key (the actual live key, NOT "items"). Used by F-BOP-QUERY-RECON tests.
func bopArticlesJSON(articles []map[string]interface{}) []byte {
	payload := map[string]interface{}{
		"articles":   articles,
		"totalCount": len(articles),
		"page":       1,
	}
	b, _ := json.Marshal(payload)
	return b
}

// TestParseBOPResponse_ArticlesKey verifies that ParseBOPResponse reads from
// the "articles" root key (NOT "items").
//
// F-BOP-QUERY-RECON BUG1 gate: the old json:"items" tag caused json.Unmarshal to
// silently skip the array → len==0 → "0 items" error even with totalCount=15.
func TestParseBOPResponse_ArticlesKey(t *testing.T) {
	// Q4 2025 live anchor values (from recon sample).
	article := map[string]interface{}{
		"articleId":     "10133276",
		"datePublished": "2026-03-27T04:55:00+07:00",
		"fields": map[string]string{
			"Date48362898":    "2025-12-25",
			"Select02257401":  "quyIV",
			"canCanVangLai":   "7.654",
			"hangHoaRong":     "9.135",
			"dichVuRong":      "-2.287",
			"thuNhapDauTuRong": "-2.975",
			"chuyenGiaoVangLai": "3.781",
			"canCanVon":       "0",
			"canCanTaiChinh":  "7.076",
			"dauTuTrucTiepRong": "6.850",
			"dauTuGianTiepRong": "-850",
			"dauTuKhacRong":   "1.076",
			"loiVaSaiSot":     "-12.375",
			"canCanTongThe":   "2.355",
			"duTruVaCacHangMucLien": "-2.355",
		},
	}
	body := bopArticlesJSON([]map[string]interface{}{article})

	rec, err := ParseBOPResponse(body)
	if err != nil {
		t.Fatalf("ParseBOPResponse with 'articles' key: unexpected error: %v", err)
	}

	// Quarter and period from live sample.
	if rec.Quarter != "quyIV" {
		t.Errorf("Quarter=%q, want 'quyIV'", rec.Quarter)
	}
	if rec.Period != "2025-12-25" {
		t.Errorf("Period=%q, want '2025-12-25'", rec.Period)
	}

	// canCanVangLai = "7.654" → VN format → 7654 M USD.
	wantCA := 7654.0
	if rec.CurrentAccount.TotalMnUSD != wantCA {
		t.Errorf("CurrentAccount.TotalMnUSD=%.3f, want %.3f", rec.CurrentAccount.TotalMnUSD, wantCA)
	}

	// loiVaSaiSot = "-12.375" → -12375 M USD.
	wantEO := -12375.0
	if rec.ErrorsOmissionsMnUSD != wantEO {
		t.Errorf("ErrorsOmissionsMnUSD=%.3f, want %.3f", rec.ErrorsOmissionsMnUSD, wantEO)
	}
}

// TestParseBOPResponse_ItemsKeyReturnsError verifies that a payload using the OLD
// "items" root key produces a "0 articles" error (regression guard).
//
// If this test starts PASSING ParseBOPResponse without error, it means the parser
// is again reading from "items" — which is the original bug.
func TestParseBOPResponse_ItemsKeyReturnsError(t *testing.T) {
	// Payload with "items" key (old broken format — no "articles" key).
	oldFormatPayload := []byte(`{
		"items": [{"articleId":"X","fields":{"Select02257401":"quyIV","Date48362898":"2025-12-25","canCanVangLai":"7.654"}}],
		"totalCount": 1
	}`)

	_, err := ParseBOPResponse(oldFormatPayload)
	if err == nil {
		t.Error("expected error when payload uses 'items' key (not 'articles') — parser must NOT fall back to 'items'")
	}
}

// TestParseBOPResponse_DeduplicateByArticleId verifies that Liferay locale duplicates
// (same articleId, multiple rows) are collapsed to one before selecting articles[0].
//
// F-BOP-QUERY-RECON: Liferay returns ~3-4 rows per article across locales.
// Without dedup, duplicates of the LATEST article would fill slots 0..2 before
// the next quarter appears — but articles[0] would still be correct.
// This test ensures the dedup map works and doesn't double-count or skip.
func TestParseBOPResponse_DeduplicateByArticleId(t *testing.T) {
	// 3 entries: articleId "A" appears 3 times (locale duplicates), "B" once (older quarter).
	// After dedup: ["A", "B"]. articles[0] = "A" = Q4 2025.
	articles := []map[string]interface{}{
		{
			"articleId":     "A",
			"datePublished": "2026-03-27T04:55:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-12-25", "Select02257401": "quyIV",
				"canCanVangLai": "7.654", "loiVaSaiSot": "-12.375",
				"canCanTongThe": "2.355", "duTruVaCacHangMucLien": "-2.355",
			},
		},
		{
			"articleId":     "A", // locale duplicate #2
			"datePublished": "2026-03-27T04:55:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-12-25", "Select02257401": "quyIV",
				"canCanVangLai": "7.654", "loiVaSaiSot": "-12.375",
				"canCanTongThe": "2.355", "duTruVaCacHangMucLien": "-2.355",
			},
		},
		{
			"articleId":     "A", // locale duplicate #3
			"datePublished": "2026-03-27T04:55:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-12-25", "Select02257401": "quyIV",
				"canCanVangLai": "7.654", "loiVaSaiSot": "-12.375",
				"canCanTongThe": "2.355", "duTruVaCacHangMucLien": "-2.355",
			},
		},
		{
			"articleId":     "B",
			"datePublished": "2025-11-15T04:00:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-08-12", "Select02257401": "quyIII",
				"canCanVangLai": "5.000", "loiVaSaiSot": "-3.000",
				"canCanTongThe": "1.000", "duTruVaCacHangMucLien": "-1.000",
			},
		},
	}
	body := bopArticlesJSON(articles)

	rec, err := ParseBOPResponse(body)
	if err != nil {
		t.Fatalf("ParseBOPResponse with duplicates: unexpected error: %v", err)
	}

	// Should select the FIRST unique article (Q4 2025 = articleId "A"), not Q3 2025.
	if rec.Quarter != "quyIV" {
		t.Errorf("Quarter=%q after dedup, want 'quyIV' (articles[0] after dedup)", rec.Quarter)
	}
	if rec.Period != "2025-12-25" {
		t.Errorf("Period=%q after dedup, want '2025-12-25'", rec.Period)
	}
}

// TestParseBOPResponse_ArticlesFirstIsLatest verifies that when the API returns
// multiple unique quarters (sorted datePublished:desc by the request), articles[0]
// after dedup yields the most recently published quarter.
func TestParseBOPResponse_ArticlesFirstIsLatest(t *testing.T) {
	// Q4 2025 published 2026-03-27 (latest), Q3 2025 published 2025-11-15 (older).
	// The request uses sort=datePublished:desc so Q4 comes first.
	articles := []map[string]interface{}{
		{
			"articleId":     "Q4-2025",
			"datePublished": "2026-03-27T04:55:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-12-25", "Select02257401": "quyIV",
				"canCanVangLai": "7.654", "loiVaSaiSot": "-12.375",
				"canCanTongThe": "2.355", "duTruVaCacHangMucLien": "-2.355",
			},
		},
		{
			"articleId":     "Q3-2025",
			"datePublished": "2025-11-15T04:00:00+07:00",
			"fields": map[string]string{
				"Date48362898": "2025-08-12", "Select02257401": "quyIII",
				"canCanVangLai": "5.000", "loiVaSaiSot": "-3.000",
				"canCanTongThe": "1.000", "duTruVaCacHangMucLien": "-1.000",
			},
		},
	}
	body := bopArticlesJSON(articles)

	rec, err := ParseBOPResponse(body)
	if err != nil {
		t.Fatalf("ParseBOPResponse: unexpected error: %v", err)
	}

	if rec.Quarter != "quyIV" {
		t.Errorf("Quarter=%q, want 'quyIV' (articles[0] = latest published quarter)", rec.Quarter)
	}
}

// TestBuildBOPFetchURL_GenericNoDateRange verifies that BuildBOPFetchURL produces
// a quarter-generic URL with no date-range bounds in the filter.
//
// F-BOP-QUERY-RECON BUG2 fix: Date48362898 is a mid-quarter reference date;
// calendar quarter windows reliably miss real rows. The URL must use the
// broad filter "status eq 0 and Date48362898 gt ''" with sort=datePublished:desc.
func TestBuildBOPFetchURL_GenericNoDateRange(t *testing.T) {
	// Pass empty strings — interface compat, must be ignored.
	rawURL := BuildBOPFetchURL("", "")

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("url.Parse: %v", err)
	}

	decoded, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		t.Fatalf("url.ParseQuery: %v", err)
	}

	filterVal := decoded.Get("filter")

	// Must use the broad filter (no date-range).
	if !strings.Contains(filterVal, "status eq 0") {
		t.Errorf("filter missing 'status eq 0': %q", filterVal)
	}
	if !strings.Contains(filterVal, "Date48362898 gt ''") {
		t.Errorf("filter missing \"Date48362898 gt ''\": %q", filterVal)
	}

	// Must NOT contain date-range bounds (ge/le with specific dates).
	if strings.Contains(filterVal, " ge '20") || strings.Contains(filterVal, " le '20") {
		t.Errorf("filter must NOT contain calendar date-range bounds (F-BOP-QUERY-RECON BUG2): %q", filterVal)
	}

	// Must include sort=datePublished:desc.
	sortVal := decoded.Get("sort")
	if sortVal != "datePublished:desc" {
		t.Errorf("sort=%q, want 'datePublished:desc'", sortVal)
	}
}

// TestBuildBOPFetchURL_QuarterParamsIgnored verifies that different quarterStart/quarterEnd
// inputs produce the SAME generic URL (parameters are intentionally ignored).
func TestBuildBOPFetchURL_QuarterParamsIgnored(t *testing.T) {
	url1 := BuildBOPFetchURL("2025-10-01", "2025-12-31")
	url2 := BuildBOPFetchURL("2026-01-01", "2026-03-31")
	url3 := BuildBOPFetchURL("", "")

	if url1 != url2 {
		t.Errorf("BuildBOPFetchURL should produce identical URL regardless of quarter params\nurl1=%q\nurl2=%q", url1, url2)
	}
	if url1 != url3 {
		t.Errorf("BuildBOPFetchURL should produce identical URL regardless of quarter params\nurl1=%q\nurl3=%q", url1, url3)
	}
}
