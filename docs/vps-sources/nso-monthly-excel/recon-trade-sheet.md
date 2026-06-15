---
source: nso-monthly-excel
task_id: FIX-NSO-TRADE-SHEET
recon_date: 2026-06-15
agent: ops-vps-fetch
status: PASS — sheet names identified, content patterns extracted
---

# Recon — NSO Monthly Excel Sheet Names (FIX-NSO-TRADE-SHEET STEP1)

## Problem Statement

The current trade_parser in `apps/macro-indicators/pkg/infrastructure/parsers_vmt_trade.go` hardcodes three sheet names:
- `14.XK` (exports) — expected but **NOT found in current NSO Excel**
- `15.NK` (imports) — expected but **NOT found in current NSO Excel**
- `12.FDI` (FDI) — exists

When these sheets are not found by exact name match, the parser returns an error and the trade data is marked as `is_estimate=true` with a `blocked_reason`.

## Root Cause Analysis

The NSO monthly Excel uses **sheet name format with spacing** that drifts month-to-month:

| Expected (hardcoded) | Actual in 2026-06 Excel | Match |
|---|---|---|
| `14.XK` | `14. XK` | NO — space after period |
| `15.NK` | `15. NK` | NO — space after period |
| `12.FDI` | `12.FDI` | YES — no space |

The sheet name drift is **structural**: NSO worksheets are numbered with a heading pattern like "14. " (number + period + space) as a category prefix, not a fixed identifier. Sheet labels change month-to-month as NSO reorders or renames sections.

## Live Evidence (2026-06-15 NSO Monthly Excel)

**Source file:** `https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx`
**Downloaded:** 2026-06-15 05:38 UTC
**File size:** 631 KB
**Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

### Complete Sheet Roster

```
 1. '1.Nong nghiep'
 2. '2.IIPthang'
 3. '3.SPCNthang'
 4. '4.LĐCN'
 5. '5. LĐCN_DP'
 6. '6. Chi tieu DN'
 7. '7. DN DK thanh lap'
 8. '8. DN quay lai hoat dong'
 9. '9. DN Ngừng có thời hạn'
10. '10. DN giải thể'
11. '11. VĐT'
12. '12.FDI'                    ← FDI sheet (MATCHES hardcoded name)
13. '13. Tongmuc'
14. '14. XK'                    ← Export sheet (hardcoded name = '14.XK', actual = '14. XK')
15. '15. NK'                    ← Import sheet (hardcoded name = '15.NK', actual = '15. NK')
16. '16.CPI'
17. '17. VT HK'
18. '18. VT HH'
19. '19. KQT'
```

## Content-Based Identification Patterns

The solution is to identify sheets by **header content + numeric column structure**, not by sheet name string match.

### Export Sheet (14. XK) — Identification Rule

**Header (A1):** Contains Vietnamese keywords `"xuất khẩu"` (exports) in the first cell.

Live evidence:
```
A1: "14. Hàng hóa xuất khẩu"
```

**Structure signature:**
- Row 9: Contains `"TỔNG TRỊ GIÁ"` (Total Value) in column A → national trade total
- Column C (col index 2): Contains trade values in "tỷ USD" format (e.g., `46929.345966`)
- Column E (col index 4): Contains YoY% values
- Data rows follow the pattern: empty col A (for HS codes) + numeric col C + numeric col E

### Import Sheet (15. NK) — Identification Rule

**Header (A1):** Contains Vietnamese keyword `"nhập khẩu"` (imports).

Live evidence:
```
A1: "15. Hàng hóa nhập khẩu"
```

**Structure signature:** Identical to export sheet (same column layout, same "TỔNG TRỊ GIÁ" pattern).

### FDI Sheet (12.FDI) — Identification Rule

**Header (A1):** Contains Vietnamese keyword `"đầu tư nước ngoài"` (foreign investment) **OR** `"đầu tư"` (investment).

Live evidence:
```
A1: "12. Đầu tư nước ngoài vào Việt Nam được cấp phép từ 01/01- 31/5/2026"
```

**Structure signature:**
- Row 7: Contains `"TỔNG SỐ"` (Total) in column A → national FDI total
- Column C: Numeric count of projects
- Column D/E: FDI value in millions USD

## Generic Selection Algorithm

To **survive month-to-month sheet name drift**, use this pattern-based algorithm:

```pseudocode
for each sheet in workbook.sheets():
    a1_header = sheet.cell(1, 1).value  # (row 1, col A)
    
    if a1_header contains "xuất khẩu":
        export_sheet = sheet
    
    if a1_header contains "nhập khẩu":
        import_sheet = sheet
    
    if a1_header contains "đầu tư nước ngoài" OR "đầu tư":
        fdi_sheet = sheet

if export_sheet and import_sheet and fdi_sheet:
    proceed_to_parse()
else:
    fail_loud("Required trade sheets not found by content pattern")
```

### Anchor Validation (May-2026 data)

After selecting sheets via the pattern above, verify the parse result matches the known anchor values:

- Export total: ~27,400 M USD (~27.4 bn USD)
- Import total: ~24,100 M USD (~24.1 bn USD)
- FDI registered capital: ~24,810 M USD

These anchors come from the live `orch-state.json` live_contract (VMT-1a / VMT-1b) and are stable across months (the USD values differ by month, but the order of magnitude is consistent).

If the selected sheets produce grossly inconsistent values, log a diagnostic error and escalate to ops.

## Implementation Strategy for dev-macro-indicators

### Step 1: Refactor sheet selection in `parsers_vmt_trade.go`

Replace the hardcoded sheet name constants:
```go
const (
    nsoExportSheetName = "14.XK"      // ← DELETE: hardcoded name
    nsoImportSheetName = "15.NK"      // ← DELETE: hardcoded name
    nsoFDISheetName    = "12.FDI"     // ← KEEP: only one that matches
)
```

Add a new function `selectSheetsByContent`:
```go
func selectSheetsByContent(f *excelize.File) (exportSheet, importSheet, fdiSheet string, error) {
    // Iterate through all sheet names
    for _, sheetName := range f.GetSheetList() {
        rows, err := f.GetRows(sheetName)
        if err != nil || len(rows) == 0 {
            continue
        }
        
        header := strings.TrimSpace(rows[0][0])  // A1 value
        
        // Pattern match: Vietnamese keywords in first cell
        if strings.Contains(header, "xuất khẩu") {
            exportSheet = sheetName
        }
        if strings.Contains(header, "nhập khẩu") {
            importSheet = sheetName
        }
        if strings.Contains(header, "đầu tư nước ngoài") || 
           strings.Contains(header, "đầu tư") {
            fdiSheet = sheetName
        }
    }
    
    if exportSheet == "" || importSheet == "" || fdiSheet == "" {
        return "", "", "", fmt.Errorf("required trade sheets not found by content pattern")
    }
    
    return exportSheet, importSheet, fdiSheet, nil
}
```

### Step 2: Update `ParseTradeBalanceFromExcel`

Replace hardcoded sheet names with dynamic selection:
```go
func ParseTradeBalanceFromExcel(excelBytes []byte, period string) (domain.TradeBalanceRecord, error) {
    f, err := excelize.OpenReader(bytes.NewReader(excelBytes))
    if err != nil {
        return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: open Excel: %w", err)
    }
    defer f.Close()
    
    // ← NEW: Dynamic sheet selection
    exportSheetName, importSheetName, fdiSheetName, err := selectSheetsByContent(f)
    if err != nil {
        return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: sheet selection: %w", err)
    }
    
    // Use selected sheet names (no more hardcoded "14.XK" / "15.NK")
    exportTotal, exportYTD, exportYoY, hsExports, errXK := parseTradeSheet(f, exportSheetName)
    // ... rest of function unchanged
}
```

### Step 3: Update test helper `buildTradeTestExcel`

Test setup should still create sheets with the **actual sheet names** (with spaces):
```go
func buildTradeTestExcel(...) {
    // Use actual sheet names from live NSO Excel
    xkSheet, err := f.NewSheet("14. XK")    // ← Space after period
    nkSheet, err := f.NewSheet("15. NK")    // ← Space after period
    fdiSheet, err := f.NewSheet("12.FDI")   // ← No space (matches hardcoded)
    
    // Populate as before
    // ...
}

// Test case: verify selectSheetsByContent works
func TestSelectSheetsByContent(t *testing.T) {
    // Build a test Excel with sheets "14. XK", "15. NK", "12.FDI"
    // Call selectSheetsByContent
    // Verify: exportSheet=="14. XK", importSheet=="15. NK", fdiSheet=="12.FDI"
}
```

## Precedent & Rationale

**Why content-based, not regex/position-based?**
- Sheet names drift month-to-month (spacing, reordering) — hardcoding is fragile.
- NSO publishes a **fixed sheet set** with **stable content** (A1 headers are consistent).
- Content patterns (Vietnamese keywords: "xuất khẩu", "nhập khẩu", "đầu tư") are **semantic anchors** independent of formatting.

**Similar patterns in codebase:**
- `SBVRateSQLiteAdapter` (bop_adapter.go) queries by **header match**, not hardcoded column index.
- `parsers_vmt_bctc.go` uses **Vietnamese label matching** for row selection (e.g., "Tổng cộng").

## Migration Path

1. **Add** `selectSheetsByContent()` function to `parsers_vmt_trade.go`.
2. **Update** `ParseTradeBalanceFromExcel()` to call it (one-line change per sheet selection).
3. **Extend** test matrix with a new `TestSelectSheetsByContent` case.
4. **Remove** hardcoded sheet name constants after tests green.
5. **Commit** with message: `fix(macro-indicators): NSO trade sheet selection by content pattern (FIX-NSO-TRADE-SHEET) — survive month-to-month sheet-name drift via Vietnamese keyword matching in A1 header`.

## Risk Assessment

**Mitigation:**
- If `selectSheetsByContent()` fails, the error is **fail-loud** (same as current hardcoded-sheet failure).
- Anchor validation (May-2026 values) gates the parse result downstream.
- No change to column indexing or parsing logic — only sheet **selection**.

**Test coverage:**
- Unit test: `selectSheetsByContent()` with mock Excel (sheets "14. XK", "15. NK", "12.FDI").
- Integration test: Live NSO Excel (current month) + anchor value check.
- Regression: All existing trade-parser tests continue to pass (test Excel now uses `"14. XK"` / `"15. NK"`).

---

**Prepared by:** ops-vps-fetch (2026-06-15)  
**Status:** Ready for dev-macro-indicators implementation  
**Next step:** Create TASK_XXX for developer to implement content-based sheet selection.
