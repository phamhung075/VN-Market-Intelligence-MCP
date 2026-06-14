// Package domain — GSO IIP domain service functions for VMT-3b.
//
// Pure functions: no imports from application, infrastructure, or interface layers.
// All IIP domain logic lives here; use cases call these functions after parsing Excel.
//
// Key function:
//   - MapIIPSectorKey: maps a Vietnamese sector label to a machine-readable key.
//     Returns ("", false) when the label is not one of the 4 target sectors.
//
// Target sectors (stable labels from live PROBE-3 sample and architect handoff):
//   "Toàn ngành công nghiệp"         → "iip_all_industry"
//   "Công nghiệp chế biến, chế tạo"  → "iip_manufacturing"
//   "Công nghiệp khai khoáng"         → "iip_mining"
//   "Sản xuất và phân phối điện"      → "iip_electricity"
//
// Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

import "strings"

// iipSectorKeyMap maps Vietnamese IIP sector labels to machine-readable keys.
// Keys match the BA spec output field names.
// Trimmed and lowercased for robust matching against raw Excel cell content.
var iipSectorKeyMap = map[string]string{
	"toàn ngành công nghiệp":          "iip_all_industry",
	"công nghiệp chế biến, chế tạo":  "iip_manufacturing",
	"công nghiệp khai khoáng":         "iip_mining",
	"sản xuất và phân phối điện":      "iip_electricity",
}

// MapIIPSectorKey maps a Vietnamese IIP sector label to its machine-readable key.
//
// Match is case-insensitive and whitespace-trimmed.
// Returns (key, true) when the label is one of the 4 target sectors.
// Returns ("", false) for any other label (sub-sector, header, total rows, etc.).
//
// The caller (parser or use case) must only include sectors where ok=true in the
// output IIPSector slice.
func MapIIPSectorKey(nameVI string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(nameVI))
	key, ok := iipSectorKeyMap[normalized]
	return key, ok
}
