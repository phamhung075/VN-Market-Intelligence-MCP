// Package infrastructure — SBV BOP parser for VMT-2.
//
// Source: SBV Liferay headless article API (PROBE-2 PASS + F-BOP-QUERY-RECON PASS).
// Format: Direct JSON — NO Excel, NO PDF. excelize NOT added.
//
// Contract derived from LIVE payload in scripts/probes/vmt-2-sample.json
// (GA-7 / memory: feedback_contract_from_live_payload_not_schema_comment).
//
// Fetch recipe (quarter-generic, F-BOP-QUERY-RECON fix):
//   GET https://www.sbv.gov.vn/o/article/v1.0/articles
//     ?scopeKey=20117
//     &contentStructureId=10063168
//     &pageSize=100
//     &filter=status eq 0 and Date48362898 gt ''
//     &sort=datePublished:desc
//   Headers: Accept: application/json, User-Agent: browser-UA
//
// Response root key: "articles" (NOT "items") — confirmed by F-BOP-QUERY-RECON STEP1.
// Liferay returns ~3-4 duplicate rows per article (multi-locale). Dedup by articleId
// before selecting articles[0] (latest-published quarter after sort=datePublished:desc).
//
// DO NOT use date-range filter: Date48362898 is a mid-quarter reference date, not a
// quarter-end boundary. Calendar quarter windows reliably miss real rows (recon STEP1).
//
// Number format: VN period=thousands separator, comma=decimal.
//   "7.654" = 7654 M USD (domain.ParseVNNumber handles this).
//
// E&O sign convention: BPM6, confirmed by PROBE-2.
//   loiVaSaiSot negative = unexplained outflows. NO sign flip.
//
// Adapter structs (SBVBOPParserAdapter, SBVBOPURLBuilderAdapter):
// Bridge the application-layer interfaces (BOPParser, BOPURLBuilder) to the
// concrete infrastructure functions. Only cmd/server/main.go constructs them (Fence-C).
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// sbvBOPAPIBase is the SBV Liferay headless article endpoint for BOP data (no query string).
// All query parameters are assembled via url.Values in BuildBOPFetchURL.
const sbvBOPAPIBase = "https://www.sbv.gov.vn/o/article/v1.0/articles"

// BuildBOPFetchURL constructs the quarter-generic SBV BOP API URL.
//
// F-BOP-QUERY-RECON fix: no date-range filter. Date48362898 is a mid-quarter
// reference date (e.g. 2025-12-25 for Q4 2025) — calendar quarter windows reliably
// miss real rows. Instead we fetch ALL published articles (sort=datePublished:desc)
// and select the latest after deduplicating by articleId in ParseBOPResponse.
//
// The quarterStart/quarterEnd parameters are RETAINED for interface compatibility
// (BOPURLBuilder.BuildURL contract) but are IGNORED in the filter. The use-case
// layer is already updated to pass empty strings and rely on articles[0] selection.
//
// All OData query parameters are assembled via url.Values so every value —
// including spaces and reserved OData chars such as single-quotes, parentheses,
// and operators — is percent-encoded uniformly (F-BOP-ENCODING root-cause fix).
func BuildBOPFetchURL(quarterStart, quarterEnd string) string {
	// quarterStart/quarterEnd accepted for interface compat but not used in filter.
	// Broad filter: all published articles, sorted newest-first.
	_ = quarterStart
	_ = quarterEnd
	q := url.Values{}
	q.Set("scopeKey", "20117")
	q.Set("contentStructureId", "10063168")
	q.Set("pageSize", "100")
	q.Set("filter", "status eq 0 and Date48362898 gt ''")
	q.Set("sort", "datePublished:desc")
	return sbvBOPAPIBase + "?" + q.Encode()
}

// CurrentQuarterWindow returns the quarter-start and quarter-end ISO dates
// for the quarter that contains the given date t.
// Retained for BOPURLBuilder interface compatibility; BuildBOPFetchURL no longer
// uses date-range filtering (F-BOP-QUERY-RECON fix — Date48362898 is mid-quarter).
func CurrentQuarterWindow(t time.Time) (start, end string) {
	year := t.Year()
	month := t.Month()

	var qStart, qEnd time.Time
	switch {
	case month <= 3:
		qStart = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		qEnd = time.Date(year, 3, 31, 0, 0, 0, 0, time.UTC)
	case month <= 6:
		qStart = time.Date(year, 4, 1, 0, 0, 0, 0, time.UTC)
		qEnd = time.Date(year, 6, 30, 0, 0, 0, 0, time.UTC)
	case month <= 9:
		qStart = time.Date(year, 7, 1, 0, 0, 0, 0, time.UTC)
		qEnd = time.Date(year, 9, 30, 0, 0, 0, 0, time.UTC)
	default:
		qStart = time.Date(year, 10, 1, 0, 0, 0, 0, time.UTC)
		qEnd = time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
	}

	return qStart.Format("2006-01-02"), qEnd.Format("2006-01-02")
}

// PrevQuarterWindow returns the start and end ISO dates for the quarter
// immediately before the current quarter. Retained for BOPURLBuilder interface
// compatibility; no longer used for date-range filtering (F-BOP-QUERY-RECON fix).
func PrevQuarterWindow(t time.Time) (start, end string) {
	// Subtract 3 months to land in the previous quarter.
	prev := t.AddDate(0, -3, 0)
	return CurrentQuarterWindow(prev)
}

// sbvArticleResponse is the top-level JSON structure returned by the SBV Liferay API.
// Root key is "articles" (NOT "items") — confirmed by F-BOP-QUERY-RECON STEP1 live probe:
//   ALL keys: ['articles', 'lastPage', 'page', 'pageSize', 'totalCount', 'xClassName']
// The "items" key is absent from the live response; using json:"items" causes
// json.Unmarshal to silently skip the array → len(Articles)==0 → "0 items" error.
type sbvArticleResponse struct {
	Articles []sbvArticleItem `json:"articles"` // root key is "articles" NOT "items"
	Page     int              `json:"page"`
	Total    int              `json:"totalCount"`
}

// sbvArticleItem represents one article entry in the SBV BOP API response.
// The "fields" object contains the BOP data keyed by Liferay field names.
type sbvArticleItem struct {
	ArticleID string             `json:"articleId"`
	Fields    map[string]string  `json:"fields"`
}

// ParseBOPResponse parses the raw SBV Liferay JSON response body into a domain.BOPRecord.
//
// F-BOP-QUERY-RECON fix: reads response.articles (NOT response.items).
// Liferay returns ~3-4 duplicate rows per article across locales; dedup by articleId
// before selecting articles[0] (latest-published quarter, already sorted by
// sort=datePublished:desc in the request URL).
//
// Returns (zero, error) when the body is malformed or no articles are present.
//
// Number parsing: uses domain.ParseVNNumber for all monetary fields.
// Empty-string rule: fields with value "" are treated as absent (zero value, not error).
// E&O sign convention: BPM6, NO sign flip (loiVaSaiSot negative = outflow).
func ParseBOPResponse(body []byte) (domain.BOPRecord, error) {
	var apiResp sbvArticleResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return domain.BOPRecord{}, fmt.Errorf("bop_parser: unmarshal SBV API response: %w", err)
	}

	if len(apiResp.Articles) == 0 {
		return domain.BOPRecord{}, fmt.Errorf("bop_parser: SBV API returned 0 articles (empty response — check root key is 'articles' not 'items')")
	}

	// Deduplicate by articleId. Liferay returns ~3-4 locale copies per article.
	// Preserve order (articles already sorted datePublished:desc by the request).
	seen := make(map[string]bool, len(apiResp.Articles))
	deduped := make([]sbvArticleItem, 0, len(apiResp.Articles))
	for _, item := range apiResp.Articles {
		if !seen[item.ArticleID] {
			seen[item.ArticleID] = true
			deduped = append(deduped, item)
		}
	}

	// articles[0] after dedup = latest-published quarter (sort=datePublished:desc).
	return parseArticleFields(deduped[0].Fields)
}

// parseArticleFields extracts a domain.BOPRecord from the Liferay article fields map.
// All monetary fields use domain.ParseVNNumber (VN format: period=thousands, comma=decimal).
// Empty-string fields → zero value (omit/null per parse_rules contract).
func parseArticleFields(fields map[string]string) (domain.BOPRecord, error) {
	f := func(key string) float64 {
		v, _ := domain.ParseVNNumber(fields[key])
		return v
	}

	// hangHoaXuatKhau and hangHoaNhapKhau — BPM6 convention: imports are negative
	// in the current account but SBV records them as positive in the goods line.
	// We store the raw absolute value; the net (hangHoaRong) is the BPM6-reconciled figure.
	record := domain.BOPRecord{
		Quarter: fields["Select02257401"],
		Period:  fields["Date48362898"],
		CurrentAccount: domain.BOPCurrentAccount{
			TotalMnUSD:              f("canCanVangLai"),
			GoodsExportsMnUSD:       f("hangHoaXuatKhau"),
			GoodsImportsMnUSD:       f("hangHoaNhapKhau"),
			GoodsNetMnUSD:           f("hangHoaRong"),
			ServicesExportsMnUSD:    f("dichVuXuatKhau"),
			ServicesImportsMnUSD:    f("dichVuNhapKhau"),
			ServicesNetMnUSD:        f("dichVuRong"),
			PrimaryIncomeNetMnUSD:   f("thuNhapDauTuRong"),
			SecondaryIncomeNetMnUSD: f("chuyenGiaoVangLai"),
		},
		CapitalAccountMnUSD: f("canCanVon"),
		FinancialAccount: domain.BOPFinancialAccount{
			TotalMnUSD:        f("canCanTaiChinh"),
			FDINetMnUSD:       f("dauTuTrucTiepRong"),
			PortfolioNetMnUSD: f("dauTuGianTiepRong"),
			OtherNetMnUSD:     f("dauTuKhacRong"),
		},
		// E&O: BPM6, NO sign flip. Negative = unexplained outflows (PROBE-2 confirmed).
		ErrorsOmissionsMnUSD: f("loiVaSaiSot"),
		OverallBalanceMnUSD:  f("canCanTongThe"),
		ReserveAssetsMnUSD:   f("duTruVaCacHangMucLien"),
	}

	if record.Quarter == "" && record.Period == "" {
		return domain.BOPRecord{}, fmt.Errorf("bop_parser: parsed record has empty quarter and period — likely wrong API response")
	}

	return record, nil
}
