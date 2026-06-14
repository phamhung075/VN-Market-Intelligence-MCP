// Package domain — tests for trade-balance domain service functions (VMT-1a + VMT-1b).
//
// Covers ComputeTradeBalance and ComputeBlocSplit.
// Anchor values from live_contract in orch-state.json and vmt-3-sample.json:
//   export_total May-2026: ~27400 M USD (27.4 bn)
//   import_total May-2026: ~24100 M USD (24.1 bn)
//   trade_balance May-2026: ~+3300 M USD (+3.3 bn)
//
// VMT-1b anchor: fdi_registered_5m_2026 = 24810 M USD (from vmt-3-sample.json).
//
// Fence-A: only the domain package is imported.
package domain

import (
	"math"
	"testing"
)

// TestComputeTradeBalance_Anchor tests the May-2026 anchor values.
func TestComputeTradeBalance_Anchor(t *testing.T) {
	// Anchors from live_contract: 27.4 bn export, 24.1 bn import, +3.3 bn balance.
	// All values in M USD.
	export := 27400.0
	importV := 24100.0
	balance := ComputeTradeBalance(export, importV)

	// Allow ±1 M USD tolerance for anchor comparison.
	if math.Abs(balance-3300.0) > 1.0 {
		t.Errorf("ComputeTradeBalance anchor: got %.2f M USD, want ~3300.0 M USD", balance)
	}
}

// TestComputeTradeBalance_Deficit tests a trade deficit scenario.
func TestComputeTradeBalance_Deficit(t *testing.T) {
	balance := ComputeTradeBalance(100.0, 150.0)
	if balance != -50.0 {
		t.Errorf("ComputeTradeBalance deficit: got %.2f, want -50.0", balance)
	}
}

// TestComputeTradeBalance_Surplus tests a trade surplus scenario.
func TestComputeTradeBalance_Surplus(t *testing.T) {
	balance := ComputeTradeBalance(200.0, 150.0)
	if balance != 50.0 {
		t.Errorf("ComputeTradeBalance surplus: got %.2f, want 50.0", balance)
	}
}

// TestComputeTradeBalance_Zero tests a zero-balance scenario.
func TestComputeTradeBalance_Zero(t *testing.T) {
	balance := ComputeTradeBalance(100.0, 100.0)
	if balance != 0.0 {
		t.Errorf("ComputeTradeBalance zero: got %.2f, want 0.0", balance)
	}
}

// TestComputeBlocSplit_IsEstimateAlwaysTrue verifies the PERMANENT is_estimate=true invariant.
// This is the critical ARCH Decision A compliance test.
func TestComputeBlocSplit_IsEstimateAlwaysTrue(t *testing.T) {
	cases := []struct {
		name    string
		fdi     float64
		exports float64
	}{
		{"normal", 24810.0, 27400.0},
		{"zero fdi", 0.0, 27400.0},
		{"zero exports", 24810.0, 0.0},
		{"both zero", 0.0, 0.0},
		{"large fdi", 50000.0, 30000.0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := ComputeBlocSplit(tc.fdi, tc.exports)
			if !result.FDI.IsEstimate {
				t.Errorf("BlocSplit.FDI.IsEstimate must be true ALWAYS (ARCH Decision A) — got false for %s", tc.name)
			}
			if !result.Domestic.IsEstimate {
				t.Errorf("BlocSplit.Domestic.IsEstimate must be true ALWAYS (ARCH Decision A) — got false for %s", tc.name)
			}
		})
	}
}

// TestComputeBlocSplit_Anchor tests the May-2026 anchor: fdi_registered=24810 M USD, export=27400 M USD.
// fdi_export_share_pct = 24810 / 27400 * 100 ≈ 90.5%
func TestComputeBlocSplit_Anchor(t *testing.T) {
	fdiMn := 24810.0    // from vmt-3-sample.json total_registered_5m_2026_mn_usd
	exportMn := 27400.0 // May-2026 export anchor

	result := ComputeBlocSplit(fdiMn, exportMn)

	expectedFDIShare := fdiMn / exportMn * 100 // ~90.55%
	if math.Abs(result.FDI.SharePct-expectedFDIShare) > 0.01 {
		t.Errorf("BlocSplit FDI share: got %.4f%%, want %.4f%%", result.FDI.SharePct, expectedFDIShare)
	}

	expectedDomShare := 100 - expectedFDIShare
	if math.Abs(result.Domestic.SharePct-expectedDomShare) > 0.01 {
		t.Errorf("BlocSplit domestic share: got %.4f%%, want %.4f%%", result.Domestic.SharePct, expectedDomShare)
	}

	if result.FDIRegisteredMnUSD != fdiMn {
		t.Errorf("BlocSplit FDIRegisteredMnUSD: got %.2f, want %.2f", result.FDIRegisteredMnUSD, fdiMn)
	}
}

// TestComputeBlocSplit_NoteContent verifies the bloc_split note is the required cross-join note.
func TestComputeBlocSplit_NoteContent(t *testing.T) {
	result := ComputeBlocSplit(1000.0, 5000.0)
	want := "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"
	if result.Note != want {
		t.Errorf("BlocSplit Note: got %q, want %q", result.Note, want)
	}
}

// TestComputeBlocSplit_ZeroExports_FailClosed verifies fail-closed behavior when exports=0.
func TestComputeBlocSplit_ZeroExports_FailClosed(t *testing.T) {
	result := ComputeBlocSplit(1000.0, 0.0)
	if result.FDI.SharePct != 0.0 {
		t.Errorf("BlocSplit zero exports: FDI.SharePct should be 0, got %.2f", result.FDI.SharePct)
	}
	if result.Domestic.SharePct != 0.0 {
		t.Errorf("BlocSplit zero exports: Domestic.SharePct should be 0, got %.2f", result.Domestic.SharePct)
	}
	// is_estimate must still be true on error path.
	if !result.FDI.IsEstimate || !result.Domestic.IsEstimate {
		t.Error("BlocSplit zero exports: is_estimate must be true even on error path (fail-closed)")
	}
}

// TestComputeBlocSplit_Shares100Pct verifies domestic + FDI shares sum to 100%.
func TestComputeBlocSplit_Shares100Pct(t *testing.T) {
	result := ComputeBlocSplit(10000.0, 30000.0)
	total := result.FDI.SharePct + result.Domestic.SharePct
	if math.Abs(total-100.0) > 0.001 {
		t.Errorf("BlocSplit FDI+Domestic shares sum: got %.4f%%, want 100%%", total)
	}
}
