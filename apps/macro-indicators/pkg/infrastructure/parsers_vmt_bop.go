// Package infrastructure — SBV BOP parser for VMT-2.
//
// Source: SBV Liferay headless article API (PROBE-2 PASS).
// Format: Direct JSON — NO Excel, NO PDF. excelize NOT added.
//
// Contract derived from LIVE payload in scripts/probes/vmt-2-sample.json
// (GA-7 / memory: feedback_contract_from_live_payload_not_schema_comment).
//
// Fetch recipe:
//   GET https://www.sbv.gov.vn/o/article/v1.0/articles
//     ?scopeKey=20117
//     &contentStructureId=10063168
//     &pageSize=100
//     &filter=status eq 0 and Date48362898 gt '' and Date48362898 ge '{quarter_start}' and Date48362898 le '{quarter_end}'
//   Headers: Accept: application/json, User-Agent: browser-UA
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
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// sbvBOPAPIURL is the SBV Liferay headless article endpoint for BOP data.
// Quarter window is injected by BuildBOPFetchURL at call time.
const sbvBOPAPIURL = "https://www.sbv.gov.vn/o/article/v1.0/articles" +
	"?scopeKey=20117" +
	"&contentStructureId=10063168" +
	"&pageSize=100"

// BuildBOPFetchURL constructs the SBV BOP API URL for a given quarter window.
// quarterStart and quarterEnd are ISO date strings (YYYY-MM-DD).
// Caller computes the quarter window; this function assembles the OData filter.
func BuildBOPFetchURL(quarterStart, quarterEnd string) string {
	filter := fmt.Sprintf(
		"status eq 0 and Date48362898 gt '' and Date48362898 ge '%s' and Date48362898 le '%s'",
		quarterStart, quarterEnd,
	)
	return sbvBOPAPIURL + "&filter=" + filter
}

// CurrentQuarterWindow returns the quarter-start and quarter-end ISO dates
// for the quarter that contains the given date t.
// Used by the BOP use case to filter the SBV API to the most recent quarter.
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
// immediately before the current quarter. Used as fallback when the current
// quarter has no published data yet (SBV BOP is published with ~3-month lag).
func PrevQuarterWindow(t time.Time) (start, end string) {
	// Subtract 3 months to land in the previous quarter.
	prev := t.AddDate(0, -3, 0)
	return CurrentQuarterWindow(prev)
}

// sbvArticleResponse is the top-level JSON structure returned by the SBV Liferay API.
// Only the fields needed for BOP parsing are declared; extras are ignored.
type sbvArticleResponse struct {
	Items []sbvArticleItem `json:"items"`
	Page  int              `json:"page"`
	Total int              `json:"totalCount"`
}

// sbvArticleItem represents one article entry in the SBV BOP API response.
// The "fields" object contains the BOP data keyed by Liferay field names.
type sbvArticleItem struct {
	ArticleID string             `json:"articleId"`
	Fields    map[string]string  `json:"fields"`
}

// ParseBOPResponse parses the raw SBV Liferay JSON response body into a domain.BOPRecord.
//
// Returns the most recent record (highest Date48362898 value) when multiple items exist.
// Returns (zero, error) when the body is malformed or no items are present.
//
// Number parsing: uses domain.ParseVNNumber for all monetary fields.
// Empty-string rule: fields with value "" are treated as absent (zero value, not error).
// E&O sign convention: BPM6, NO sign flip (loiVaSaiSot negative = outflow).
func ParseBOPResponse(body []byte) (domain.BOPRecord, error) {
	var apiResp sbvArticleResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return domain.BOPRecord{}, fmt.Errorf("bop_parser: unmarshal SBV API response: %w", err)
	}

	if len(apiResp.Items) == 0 {
		return domain.BOPRecord{}, fmt.Errorf("bop_parser: SBV API returned 0 items (empty response)")
	}

	// Select the item with the latest Date48362898 value.
	// The SBV API may return multiple quarters; we want the most recent one.
	latest := apiResp.Items[0]
	for _, item := range apiResp.Items[1:] {
		if item.Fields["Date48362898"] > latest.Fields["Date48362898"] {
			latest = item
		}
	}

	return parseArticleFields(latest.Fields)
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
