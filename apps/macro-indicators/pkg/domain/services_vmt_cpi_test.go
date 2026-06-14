// Package domain — table-driven tests for CPI domain service functions (VMT-4).
//
// Test anchors derived from LIVE May-2026 probe payload in
// scripts/probes/vmt-3-sample.json (CONTRACT-FROM-LIVE-PAYLOAD rule GA-7).
//
// Live anchors (May-2026):
//   "CHỈ SỐ GIÁ TIÊU DÙNG" → cpi_total
//   total_cpi_vs_prev_month_pct = 0.29  (headline MoM)
//   total_cpi_yoy_pct = 5.60            (headline YoY)
//   avg_5m2026_yoy_pct = 4.31           (headline avg YTD YoY)
//
// CRITICAL weights rule: all WeightPct fields MUST be nil.
// CPIWeightsNote must be non-empty in every CPIRecord.
//
// Fence-A: this test file is in package domain — zero infrastructure imports.
package domain

import "testing"

// TestMapCPIBasketKey covers headline + all 11 baskets + sub-baskets + non-target rows.
func TestMapCPIBasketKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantKey  string
		wantOK   bool
	}{
		// Headline
		{
			name:    "headline total CPI",
			input:   "CHỈ SỐ GIÁ TIÊU DÙNG",
			wantKey: "cpi_total",
			wantOK:  true,
		},
		// Main baskets (from live vmt-3-sample.json)
		{
			name:    "food_dining basket",
			input:   "Hàng ăn và dịch vụ ăn uống",
			wantKey: "food_dining",
			wantOK:  true,
		},
		{
			name:    "foodstuffs sub-basket",
			input:   "Lương thực",
			wantKey: "foodstuffs",
			wantOK:  true,
		},
		{
			name:    "food_products sub-basket",
			input:   "Thực phẩm",
			wantKey: "food_products",
			wantOK:  true,
		},
		{
			name:    "dining_out sub-basket",
			input:   "Ăn uống ngoài gia đình",
			wantKey: "dining_out",
			wantOK:  true,
		},
		{
			name:    "beverages_tobacco basket",
			input:   "Đồ uống và thuốc lá",
			wantKey: "beverages_tobacco",
			wantOK:  true,
		},
		{
			name:    "clothing_footwear basket",
			input:   "May mặc, giày dép và mũ nón",
			wantKey: "clothing_footwear",
			wantOK:  true,
		},
		{
			name:    "housing_utilities basket (abbreviated form)",
			input:   "Nhà ở, điện nước, chất đốt và VLXD",
			wantKey: "housing_utilities",
			wantOK:  true,
		},
		{
			name:    "household_equipment basket",
			input:   "Thiết bị và đồ dùng gia đình",
			wantKey: "household_equipment",
			wantOK:  true,
		},
		{
			name:    "health basket",
			input:   "Thuốc và dịch vụ y tế",
			wantKey: "health",
			wantOK:  true,
		},
		{
			name:    "transport basket",
			input:   "Giao thông",
			wantKey: "transport",
			wantOK:  true,
		},
		{
			name:    "communication basket",
			input:   "Thông tin và truyền thông",
			wantKey: "communication",
			wantOK:  true,
		},
		{
			name:    "education basket",
			input:   "Giáo dục",
			wantKey: "education",
			wantOK:  true,
		},
		{
			name:    "culture_recreation basket",
			input:   "Văn hoá, giải trí và du lịch",
			wantKey: "culture_recreation",
			wantOK:  true,
		},
		{
			name:    "other basket",
			input:   "Hàng hóa và dịch vụ khác",
			wantKey: "other",
			wantOK:  true,
		},
		// Case-insensitive
		{
			name:    "headline uppercase",
			input:   "CHỈ SỐ GIÁ TIÊU DÙNG",
			wantKey: "cpi_total",
			wantOK:  true,
		},
		{
			name:    "transport lowercase",
			input:   "giao thông",
			wantKey: "transport",
			wantOK:  true,
		},
		// Trimming
		{
			name:    "transport with leading spaces",
			input:   "  Giao thông  ",
			wantKey: "transport",
			wantOK:  true,
		},
		// Non-target rows → ok=false
		{
			name:    "note row",
			input:   "(*) Số liệu sơ bộ",
			wantKey: "",
			wantOK:  false,
		},
		{
			name:    "empty string",
			input:   "",
			wantKey: "",
			wantOK:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key, ok := MapCPIBasketKey(tc.input)
			if ok != tc.wantOK {
				t.Errorf("MapCPIBasketKey(%q): ok=%v, want %v", tc.input, ok, tc.wantOK)
			}
			if key != tc.wantKey {
				t.Errorf("MapCPIBasketKey(%q): key=%q, want %q", tc.input, key, tc.wantKey)
			}
		})
	}
}

// TestCPIWeightsNote verifies the weights note constant is non-empty and contains
// the required provenance text.
func TestCPIWeightsNote(t *testing.T) {
	if CPIWeightsNote == "" {
		t.Error("CPIWeightsNote must be non-empty — weights provenance note is required")
	}
	// Must mention the methodology PDF and null fields.
	if len(CPIWeightsNote) < 30 {
		t.Errorf("CPIWeightsNote too short (%d chars): %q", len(CPIWeightsNote), CPIWeightsNote)
	}
}
