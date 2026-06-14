// Package infrastructure — NSO Excel parser for VMT-3b (GSO/IIP).
//
// Source: NSO monthly Excel, sheet "2.IIPthang" (PROBE-3 PASS).
// Contract derived from LIVE payload in scripts/probes/vmt-3-sample.json
// (GA-7 / memory: feedback_contract_from_live_payload_not_schema_comment).
//
// Sheet: "2.IIPthang" — matched by NAME, not positional index.
// Column layout (0-indexed, from live sample):
//   col 0: sector name (Vietnamese string)
//   col 1: prior month YoY (tháng N-1 vs cùng kỳ năm trước, %)
//   col 2: current month YoY (tháng N vs cùng kỳ năm trước, %)  ← PRIMARY
//   col 3: YTD YoY (N tháng vs cùng kỳ năm trước, %)
//   col 4: MoM (tháng N vs tháng trước, %)
//
// Live anchor (May-2026 from vmt-3-sample.json):
//   ["Toàn ngành công nghiệp", "109.3", "103.27", "108.79", "109.08"]
//   → iip_all_industry YoYPct=103.27, YTDYoYPct=108.79, MoMPct=109.08
//
// Target rows (4 stable Vietnamese labels):
//   "Toàn ngành công nghiệp"         → key: iip_all_industry
//   "Công nghiệp chế biến, chế tạo"  → key: iip_manufacturing
//   "Công nghiệp khai khoáng"         → key: iip_mining
//   "Sản xuất và phân phối điện"      → key: iip_electricity
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoIIPSheetName is the sheet name in the NSO monthly Excel for IIP data.
// Matched by name (not index) per architect decision and PROBE-3.
const nsoIIPSheetName = "2.IIPthang"

// nsoGSOSource is the provenance label for GSO/IIP responses.
const nsoGSOSource = "NSO monthly Excel, sheet '2.IIPthang' (PROBE-3 PASS)"

// ParseIIPFromExcel parses the NSO monthly Excel bytes and returns a MacroIndicatorsGSORecord.
//
// The caller passes the raw Excel bytes (from cache or live fetch).
// The period parameter (YYYY-MM) is derived by the cache layer from the NSO URL path.
//
// Returns (record, nil) on success with all 4 target sectors populated.
// Returns an error if the sheet is missing, has too few columns, or no target
// sector rows are found (fail-loud: empty results are errors, not silent empties).
func ParseIIPFromExcel(excelBytes []byte, period string) (domain.MacroIndicatorsGSORecord, error) {
	f, err := excelize.OpenReader(bytes.NewReader(excelBytes))
	if err != nil {
		return domain.MacroIndicatorsGSORecord{}, fmt.Errorf("iip_parser: open Excel: %w", err)
	}
	defer f.Close()

	rows, err := f.GetRows(nsoIIPSheetName)
	if err != nil {
		return domain.MacroIndicatorsGSORecord{},
			fmt.Errorf("iip_parser: sheet %q not found or unreadable: %w", nsoIIPSheetName, err)
	}

	if len(rows) == 0 {
		return domain.MacroIndicatorsGSORecord{},
			fmt.Errorf("iip_parser: sheet %q is empty", nsoIIPSheetName)
	}

	var sectors []domain.IIPSector

	for _, row := range rows {
		if len(row) < 5 {
			// Skip rows without enough columns (header rows, blank rows, etc.).
			continue
		}

		nameVI := strings.TrimSpace(row[0])
		key, ok := domain.MapIIPSectorKey(nameVI)
		if !ok {
			continue
		}

		yoy, errYoY := parseFloatCell(row[2])
		if errYoY != nil {
			return domain.MacroIndicatorsGSORecord{},
				fmt.Errorf("iip_parser: sector %q col2 (YoY) parse error: %w", nameVI, errYoY)
		}

		ytd, errYTD := parseFloatCell(row[3])
		if errYTD != nil {
			return domain.MacroIndicatorsGSORecord{},
				fmt.Errorf("iip_parser: sector %q col3 (YTD YoY) parse error: %w", nameVI, errYTD)
		}

		mom, errMoM := parseFloatCell(row[4])
		if errMoM != nil {
			return domain.MacroIndicatorsGSORecord{},
				fmt.Errorf("iip_parser: sector %q col4 (MoM) parse error: %w", nameVI, errMoM)
		}

		sectors = append(sectors, domain.IIPSector{
			Key:        key,
			NameVI:     nameVI,
			YoYPct:     yoy,
			YTDYoYPct:  ytd,
			MoMPct:     mom,
			IsEstimate: false, // primary source, PROBE-3 confirmed
		})
	}

	if len(sectors) == 0 {
		return domain.MacroIndicatorsGSORecord{},
			fmt.Errorf("iip_parser: no target IIP sectors found in sheet %q (expected 4: all_industry, manufacturing, mining, electricity)", nsoIIPSheetName)
	}

	if period == "" {
		period = time.Now().UTC().Format("2006-01")
	}

	return domain.MacroIndicatorsGSORecord{
		Period:     period,
		Sectors:    sectors,
		Source:     nsoGSOSource,
		FetchedAt:  time.Now().UTC().Format(time.RFC3339),
		IsEstimate: false,
	}, nil
}

// parseFloatCell trims a cell string and parses it as float64.
// Handles VN decimal format (comma = decimal separator in some cells) as well as
// the standard period-decimal format used in IIP sheets.
// Returns an error if the cell is empty or unparseable.
func parseFloatCell(cell string) (float64, error) {
	s := strings.TrimSpace(cell)
	if s == "" {
		return 0, fmt.Errorf("empty cell")
	}
	// IIP values are plain floats (e.g. "103.27") — NOT VN thousands-separator format.
	// The VN thousands-separator format (7.654=7654) applies to monetary BOP fields only.
	// IIP index values use standard period-as-decimal: "103.27" = 103.27 (plain float).
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		// Try comma-as-decimal fallback.
		s2 := strings.ReplaceAll(s, ",", ".")
		v2, err2 := strconv.ParseFloat(s2, 64)
		if err2 != nil {
			return 0, fmt.Errorf("cannot parse %q as float: %w", s, err)
		}
		return v2, nil
	}
	return v, nil
}
