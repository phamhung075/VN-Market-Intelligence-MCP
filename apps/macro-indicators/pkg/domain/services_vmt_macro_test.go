// Package domain — table-driven tests for GSO/IIP domain service functions (VMT-3b).
//
// Test anchors derived from LIVE May-2026 probe payload in
// scripts/probes/vmt-3-sample.json (CONTRACT-FROM-LIVE-PAYLOAD rule GA-7).
//
// Live anchors (May-2026):
//   "Toàn ngành công nghiệp" → iip_all_industry
//   "Công nghiệp chế biến, chế tạo" → iip_manufacturing
//   "Công nghiệp khai khoáng" → iip_mining
//   "Sản xuất và phân phối điện" → iip_electricity
//
// Fence-A: this test file is in package domain — zero infrastructure imports.
package domain

import "testing"

// TestMapIIPSectorKey covers all 4 target sectors + non-target pass-through.
func TestMapIIPSectorKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantKey  string
		wantOK   bool
	}{
		// Live probe anchors — exact labels from vmt-3-sample.json
		{
			name:    "all_industry exact label",
			input:   "Toàn ngành công nghiệp",
			wantKey: "iip_all_industry",
			wantOK:  true,
		},
		{
			name:    "manufacturing exact label",
			input:   "Công nghiệp chế biến, chế tạo",
			wantKey: "iip_manufacturing",
			wantOK:  true,
		},
		{
			name:    "mining exact label",
			input:   "Công nghiệp khai khoáng",
			wantKey: "iip_mining",
			wantOK:  true,
		},
		{
			name:    "electricity exact label",
			input:   "Sản xuất và phân phối điện",
			wantKey: "iip_electricity",
			wantOK:  true,
		},
		// Case-insensitive matching
		{
			name:    "all_industry uppercase",
			input:   "TOÀN NGÀNH CÔNG NGHIỆP",
			wantKey: "iip_all_industry",
			wantOK:  true,
		},
		// Trimming
		{
			name:    "all_industry with leading/trailing spaces",
			input:   "  Toàn ngành công nghiệp  ",
			wantKey: "iip_all_industry",
			wantOK:  true,
		},
		// Non-target rows → ok=false
		{
			name:    "sub-sector row not in target set",
			input:   "Sản xuất thiết bị điện",
			wantKey: "",
			wantOK:  false,
		},
		{
			name:    "header row",
			input:   "Chỉ số",
			wantKey: "",
			wantOK:  false,
		},
		{
			name:    "empty string",
			input:   "",
			wantKey: "",
			wantOK:  false,
		},
		{
			name:    "blank/spaces only",
			input:   "   ",
			wantKey: "",
			wantOK:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key, ok := MapIIPSectorKey(tc.input)
			if ok != tc.wantOK {
				t.Errorf("MapIIPSectorKey(%q): ok=%v, want %v", tc.input, ok, tc.wantOK)
			}
			if key != tc.wantKey {
				t.Errorf("MapIIPSectorKey(%q): key=%q, want %q", tc.input, key, tc.wantKey)
			}
		})
	}
}
