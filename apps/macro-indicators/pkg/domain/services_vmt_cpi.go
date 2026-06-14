// Package domain — CPI domain service functions for VMT-4.
//
// Pure functions: no imports from application, infrastructure, or interface layers.
// All CPI domain logic lives here; use cases call these functions after parsing Excel.
//
// Key function:
//   - MapCPIBasketKey: maps a Vietnamese CPI basket label to a machine-readable key.
//     Returns ("", false) when the label is not one of the 15 recognized rows.
//
// CPI basket labels (from live PROBE-3 sample, sheet "16.CPI"):
//   Row 0  (headline): "CHỈ SỐ GIÁ TIÊU DÙNG"                           → "cpi_total"
//   Row 1:  "Hàng ăn và dịch vụ ăn uống"                                 → "food_dining"
//   Row 2:  "Lương thực"                                                   → "foodstuffs"
//   Row 3:  "Thực phẩm"                                                    → "food_products"
//   Row 4:  "Ăn uống ngoài gia đình"                                       → "dining_out"
//   Row 5:  "Đồ uống và thuốc lá"                                          → "beverages_tobacco"
//   Row 6:  "May mặc, giày dép và mũ nón"                                  → "clothing_footwear"
//   Row 7:  "Nhà ở, điện nước, chất đốt và VLXD"                          → "housing_utilities"
//   Row 8:  "Thiết bị và đồ dùng gia đình"                                 → "household_equipment"
//   Row 9:  "Thuốc và dịch vụ y tế"                                        → "health"
//   Row 10: "Giao thông"                                                    → "transport"
//   Row 11: "Thông tin và truyền thông"                                     → "communication"
//   Row 12: "Giáo dục"                                                      → "education"
//   Row 13: "Văn hoá, giải trí và du lịch"                                  → "culture_recreation"
//   Row 14: "Hàng hóa và dịch vụ khác"                                     → "other"
//
// CRITICAL weights policy: weights (trọng số) are NOT in the Excel.
// All CPIBasket.WeightPct fields MUST remain nil. is_estimate=true on WeightsIsEstimate.
// Never infer or fabricate weights from index values.
//
// Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

import "strings"

// cpiBasketKeyMap maps Vietnamese CPI basket labels to machine-readable keys.
// Keys match the BA spec output field names.
// Trimmed and lowercased for robust matching against raw Excel cell content.
var cpiBasketKeyMap = map[string]string{
	// Headline
	"chỉ số giá tiêu dùng": "cpi_total",
	// Main baskets
	"hàng ăn và dịch vụ ăn uống": "food_dining",
	"lương thực":                  "foodstuffs",
	"thực phẩm":                   "food_products",
	"ăn uống ngoài gia đình":      "dining_out",
	"đồ uống và thuốc lá":         "beverages_tobacco",
	"may mặc, giày dép và mũ nón": "clothing_footwear",
	// Housing — may appear with trailing content in some months; try both forms
	"nhà ở, điện nước, chất đốt và vlxd":                          "housing_utilities",
	"nhà ở, điện, nước, chất đốt và vật liệu xây dựng":           "housing_utilities",
	"thiết bị và đồ dùng gia đình":                                 "household_equipment",
	"thuốc và dịch vụ y tế":                                        "health",
	"giao thông":                                                    "transport",
	"thông tin và truyền thông":                                     "communication",
	"giáo dục":                                                      "education",
	"văn hoá, giải trí và du lịch":                                  "culture_recreation",
	"hàng hóa và dịch vụ khác":                                     "other",
}

// MapCPIBasketKey maps a Vietnamese CPI basket label to its machine-readable key.
//
// Match is case-insensitive and whitespace-trimmed.
// Returns (key, true) when the label is one of the 15 recognized CPI rows.
// Returns ("", false) for unrecognized labels (empty rows, notes, etc.).
//
// The caller uses the key to build CPIBasket.Key and categorize the row.
// Headline row ("cpi_total") should be assigned to CPIRecord.Headline;
// all other recognized keys go into CPIRecord.Baskets.
func MapCPIBasketKey(nameVI string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(nameVI))
	key, ok := cpiBasketKeyMap[normalized]
	return key, ok
}

// CPIWeightsNote is the standard note explaining why all weight_pct fields are null.
// Must be included in every CPIRecord.WeightsNote field.
const CPIWeightsNote = "Weights from CPI methodology PDF (updated ~every 5 years); " +
	"not in monthly Excel. All weight_pct fields are null. is_estimate=true."
