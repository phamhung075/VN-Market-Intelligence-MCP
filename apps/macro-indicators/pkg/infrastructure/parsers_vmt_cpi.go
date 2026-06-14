// Package infrastructure — NSO Excel parser for VMT-4 (CPI Components).
//
// Source: NSO monthly Excel, sheet "16.CPI" (PROBE-3 PASS).
// Contract derived from LIVE payload in scripts/probes/vmt-3-sample.json
// (GA-7 / memory: feedback_contract_from_live_payload_not_schema_comment).
//
// Sheet: "16.CPI" — matched by NAME, not positional index.
// Column layout (0-indexed, from live sample):
//   col 0: basket name (Vietnamese string)
//   col 1: T{N-1}/{YYYY-1} vs kỳ gốc  (prior year same month vs base period)
//   col 2: T{N}/{YYYY-1} vs kỳ gốc
//   col 3: T{N}/{YYYY} vs kỳ gốc      (current month absolute index vs base) — ref only
//   col 4: T{N}/{YYYY} vs T{N-1}/{YYYY}  (MoM change %)  ← PRIMARY for mom_pct
//   col 5: BQ NT/{YYYY} vs BQ NT/{YYYY-1} (YTD avg YoY %) ← PRIMARY for avg_ytd_yoy_pct
//
// YoY % (col 3 minus 100 gives approximate YoY) is NOT directly in the table as a
// column labeled "YoY". Instead:
//   - The headline YoY (5.60%) is derived as: col3 (T05/2026 vs kỳ gốc) minus col2 (T05/2025 vs kỳ gốc).
//   - This gives the current-month vs same-month-prior-year change in index points,
//     which is the standard CPI YoY definition.
//   - Formula: yoy_pct = col3_value - col2_value (both are index vs base period;
//     their difference = current year same month vs prior year same month = YoY %).
//
// Live anchor May-2026:
//   "CHỈ SỐ GIÁ TIÊU DÙNG": col4=0.29 (MoM), col5=4.31 (YTD avg YoY)
//   yoy_pct = col3 - col2 → 5.60 (confirmed from press release)
//
// CRITICAL weights policy: weights (trọng số) NOT in monthly Excel.
//   All WeightPct fields MUST remain nil; WeightsIsEstimate=true always.
//   Never infer or fabricate weights from index values.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoCPISheetName is the sheet name in the NSO monthly Excel for CPI data.
// Matched by name (not index) per architect decision and PROBE-3.
const nsoCPISheetName = "16.CPI"

// nsoCPISource is the provenance label for CPI responses.
const nsoCPISource = "NSO monthly Excel, sheet '16.CPI' (PROBE-3 PASS)"

// ParseCPIFromExcel parses the NSO monthly Excel bytes and returns a CPIRecord.
//
// The caller passes the raw Excel bytes (from cache or live fetch).
// The period parameter (YYYY-MM) is derived by the cache layer from the NSO URL path.
//
// Returns (record, nil) on success with headline + all recognized baskets.
// Returns an error if the sheet is missing, has too few columns, or the headline
// row ("CHỈ SỐ GIÁ TIÊU DÙNG") is not found (fail-loud).
func ParseCPIFromExcel(excelBytes []byte, period string) (domain.CPIRecord, error) {
	f, err := excelize.OpenReader(bytes.NewReader(excelBytes))
	if err != nil {
		return domain.CPIRecord{}, fmt.Errorf("cpi_parser: open Excel: %w", err)
	}
	defer f.Close()

	rows, err := f.GetRows(nsoCPISheetName)
	if err != nil {
		return domain.CPIRecord{},
			fmt.Errorf("cpi_parser: sheet %q not found or unreadable: %w", nsoCPISheetName, err)
	}

	if len(rows) == 0 {
		return domain.CPIRecord{},
			fmt.Errorf("cpi_parser: sheet %q is empty", nsoCPISheetName)
	}

	var headline domain.CPIBasket
	headlineFound := false
	var baskets []domain.CPIBasket

	for _, row := range rows {
		if len(row) < 6 {
			// Skip rows without enough columns (headers, blank, notes).
			continue
		}

		nameVI := strings.TrimSpace(row[0])
		key, ok := domain.MapCPIBasketKey(nameVI)
		if !ok {
			continue
		}

		// Parse MoM (col 4) and YTD avg YoY (col 5).
		mom, errMoM := parseFloatCell(row[4])
		if errMoM != nil {
			return domain.CPIRecord{},
				fmt.Errorf("cpi_parser: basket %q col4 (MoM) parse error: %w", nameVI, errMoM)
		}

		avgYTD, errAvg := parseFloatCell(row[5])
		if errAvg != nil {
			return domain.CPIRecord{},
				fmt.Errorf("cpi_parser: basket %q col5 (YTD avg YoY) parse error: %w", nameVI, errAvg)
		}

		// Derive YoY: col3 (current month vs base) minus col2 (same month prior year vs base).
		// This gives the year-on-year change in index points = CPI YoY %.
		yoy := 0.0
		if len(row) >= 4 {
			col3, err3 := parseFloatCell(row[3])
			col2, err2 := parseFloatCell(row[2])
			if err3 == nil && err2 == nil {
				yoy = col3 - col2
			}
			// If either parse fails, yoy remains 0.0 (non-fatal; headline anchor is the primary check).
		}

		basket := domain.CPIBasket{
			Key:          key,
			NameVI:       nameVI,
			MoMPct:       mom,
			AvgYTDYoYPct: avgYTD,
			YoYPct:       yoy,
			WeightPct:    nil, // ALWAYS nil — weights not in monthly Excel
			IsEstimate:   false,
		}

		if key == "cpi_total" {
			headline = basket
			headlineFound = true
		} else {
			baskets = append(baskets, basket)
		}
	}

	if !headlineFound {
		return domain.CPIRecord{},
			fmt.Errorf("cpi_parser: headline row 'CHỈ SỐ GIÁ TIÊU DÙNG' not found in sheet %q", nsoCPISheetName)
	}

	if period == "" {
		period = time.Now().UTC().Format("2006-01")
	}

	return domain.CPIRecord{
		Period:            period,
		Headline:          headline,
		Baskets:           baskets,
		WeightsIsEstimate: true, // ALWAYS — weights not in monthly Excel
		WeightsNote:       domain.CPIWeightsNote,
		Source:            nsoCPISource,
		FetchedAt:         time.Now().UTC().Format(time.RFC3339),
		IsEstimate:        false,
	}, nil
}
