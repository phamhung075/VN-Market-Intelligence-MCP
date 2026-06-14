// Package application — unit tests for BOPUseCase (VMT-2).
//
// Test anchors are derived from the LIVE Q4-2025 probe payload in
// scripts/probes/vmt-2-sample.json (CONTRACT-FROM-LIVE-PAYLOAD rule GA-7).
//
// Test strategy:
//   - Inject stub VpsFetchPort returning the live Q4-2025 JSON fixture.
//   - Inject real parser logic via stub (avoids infrastructure import; Fence-B clean).
//   - Assert that the use case output matches the live sample anchors:
//       current_account_total_mn_usd = 7654.0
//       errors_omissions_mn_usd      = -12375.0
//       fx_incidence.label           = "FDI_BENIGN"
//       offshore_parked.is_estimate  = true
//       is_estimate                  = false (primary source)
//
// Fence-B: this test is in pkg/application — no pkg/infrastructure imports.
// The stub parser wraps domain.ParseBOPResponse-equivalent logic inline.
package application

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Q4-2025 live fixture JSON (from scripts/probes/vmt-2-sample.json)
// Numbers are VN-formatted (period=thousands, comma=decimal).
// ---------------------------------------------------------------------------

const q4_2025_fixture_json = `{
  "items": [{
    "articleId": "10133276",
    "fields": {
      "Select02257401": "quyIV",
      "Date48362898": "2025-12-25",
      "canCanVangLai": "7.654",
      "hangHoaXuatKhau": "126.318",
      "hangHoaNhapKhau": "117.183",
      "hangHoaRong": "9.135",
      "dichVuXuatKhau": "8.260",
      "dichVuNhapKhau": "10.547",
      "dichVuRong": "-2.287",
      "thuNhapDauTuThu": "1.407",
      "thuNhapDauTuChi": "4.382",
      "thuNhapDauTuRong": "-2.975",
      "chuyenGiaoVangLaiThu": "4.801",
      "chuyenGiaoVangLaiChi": "1.020",
      "chuyenGiaoVangLai": "3.781",
      "canCanVon": "0",
      "canCanVonThu": "0",
      "canCanVonChi": "0",
      "tongCanCanVangLaiVaCanCanVon": "7.654",
      "canCanTaiChinh": "7.076",
      "dauTuTrucTiepRaNuocNgoaiTaiSanCo": "-190",
      "dauTuTrucTiepRaNuocNgoaiTaiSanNo": "7.040",
      "dauTuTrucTiepRong": "6.850",
      "dauTuGianTiepRaNuocNgoaiTaiSanCo": "-22",
      "dauTuGianTiepVaoVietNamTaiSanNo": "-828",
      "dauTuGianTiepRong": "-850",
      "dauTuKhacTaiSanCo": "-2.700",
      "dauTuKhacTaiSanNo": "3.776",
      "dauTuKhacRong": "1.076",
      "loiVaSaiSot": "-12.375",
      "canCanTongThe": "2.355",
      "duTruVaCacHangMucLien": "-2.355",
      "taiSanDuTru": "-2.355",
      "tinDungVaVayNoTuIMF": "",
      "taiTroDacBiet": ""
    }
  }],
  "page": 1,
  "totalCount": 1
}`

// ---------------------------------------------------------------------------
// Stub implementations — no infrastructure imports (Fence-B compliant)
// ---------------------------------------------------------------------------

// stubVpsFetcher returns a fixed payload for any URL.
type stubVpsFetcher struct {
	payload []byte
	err     error
}

func (s *stubVpsFetcher) Fetch(_ context.Context, _ string, _ domain.VpsFetchOptions) ([]byte, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.payload, nil
}

// stubBOPParser wraps the real parsing logic inline (avoids infrastructure import).
// Uses domain.ParseVNNumber which is in pkg/domain (allowed by Fence-B).
type stubBOPParser struct{}

func (p *stubBOPParser) Parse(body []byte) (domain.BOPRecord, error) {
	var apiResp struct {
		Items []struct {
			ArticleID string            `json:"articleId"`
			Fields    map[string]string `json:"fields"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return domain.BOPRecord{}, fmt.Errorf("stub parser: unmarshal: %w", err)
	}
	if len(apiResp.Items) == 0 {
		return domain.BOPRecord{}, fmt.Errorf("stub parser: no items")
	}

	fields := apiResp.Items[0].Fields
	f := func(key string) float64 {
		v, _ := domain.ParseVNNumber(fields[key])
		return v
	}

	return domain.BOPRecord{
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
		ErrorsOmissionsMnUSD: f("loiVaSaiSot"),
		OverallBalanceMnUSD:  f("canCanTongThe"),
		ReserveAssetsMnUSD:   f("duTruVaCacHangMucLien"),
	}, nil
}

// stubBOPURLBuilder returns predictable URLs and quarter windows.
type stubBOPURLBuilder struct{}

func (b *stubBOPURLBuilder) BuildURL(start, end string) string {
	return fmt.Sprintf("https://stub.sbv.vn/bop?from=%s&to=%s", start, end)
}

func (b *stubBOPURLBuilder) QuarterWindow(_ time.Time) (string, string) {
	return "2025-10-01", "2025-12-31"
}

func (b *stubBOPURLBuilder) PrevQuarterWindow(_ time.Time) (string, string) {
	return "2025-07-01", "2025-09-30"
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestBOPUseCase_Q4_2025_LiveAnchor is the primary integration test.
// It exercises the full use-case path with the live Q4-2025 fixture and
// asserts all load-bearing field values from scripts/probes/vmt-2-sample.json.
func TestBOPUseCase_Q4_2025_LiveAnchor(t *testing.T) {
	uc := NewBOPUseCase(
		&stubVpsFetcher{payload: []byte(q4_2025_fixture_json)},
		&stubBOPParser{},
		&stubBOPURLBuilder{},
	)

	resp, err := uc.Execute(context.Background(), BOPRequest{})
	if err != nil {
		t.Fatalf("BOPUseCase.Execute: unexpected error: %v", err)
	}

	// Status must be "ok".
	if resp.Status != "ok" {
		t.Errorf("Status=%q, want 'ok'", resp.Status)
	}

	// Quarter and period from live sample.
	if resp.Quarter != "quyIV" {
		t.Errorf("Quarter=%q, want 'quyIV'", resp.Quarter)
	}
	if resp.Period != "2025-12-25" {
		t.Errorf("Period=%q, want '2025-12-25'", resp.Period)
	}

	// current_account_total_mn_usd: canCanVangLai="7.654" → 7654 M USD
	// NOT 7.654 — VN format (period=thousands separator).
	wantCurrentAccTotal := 7654.0
	if resp.CurrentAccount.TotalMnUSD != wantCurrentAccTotal {
		t.Errorf("current_account_total_mn_usd=%.3f, want %.3f", resp.CurrentAccount.TotalMnUSD, wantCurrentAccTotal)
	}

	// errors_omissions_mn_usd: loiVaSaiSot="-12.375" → -12375 M USD (NOT -12.375)
	wantEO := -12375.0
	if resp.ErrorsOmissionsMnUSD != wantEO {
		t.Errorf("errors_omissions_mn_usd=%.3f, want %.3f", resp.ErrorsOmissionsMnUSD, wantEO)
	}

	// goods_net_mn_usd: hangHoaRong="9.135" → 9135 M USD
	wantGoodsNet := 9135.0
	if resp.CurrentAccount.GoodsNetMnUSD != wantGoodsNet {
		t.Errorf("goods_net_mn_usd=%.3f, want %.3f", resp.CurrentAccount.GoodsNetMnUSD, wantGoodsNet)
	}

	// overall_balance_mn_usd: canCanTongThe="2.355" → 2355 M USD
	wantOverall := 2355.0
	if resp.OverallBalanceMnUSD != wantOverall {
		t.Errorf("overall_balance_mn_usd=%.3f, want %.3f", resp.OverallBalanceMnUSD, wantOverall)
	}

	// fx_incidence.label: E&O=-12375 < -1000 → FDI_BENIGN
	if resp.FXIncidence.Label != string(domain.FXIncidenceFDIBenign) {
		t.Errorf("fx_incidence.label=%q, want %q", resp.FXIncidence.Label, domain.FXIncidenceFDIBenign)
	}

	// fx_incidence.is_estimate must be false (primary source).
	if resp.FXIncidence.IsEstimate {
		t.Errorf("fx_incidence.is_estimate=true, want false (primary source, no estimation)")
	}

	// offshore_parked.is_estimate MUST always be true (heuristic).
	if !resp.OffshoreParked.IsEstimate {
		t.Errorf("offshore_parked.is_estimate=false, want true (ALWAYS — fail-closed rule)")
	}

	// offshore_parked: E&O=-12375<0, overall=2355>0 → parked=12375 M USD
	if resp.OffshoreParked.OffshoreParkedMnUSD == nil {
		t.Errorf("offshore_parked.offshore_parked_mn_usd is nil, want 12375.0")
	} else if *resp.OffshoreParked.OffshoreParkedMnUSD != 12375.0 {
		t.Errorf("offshore_parked.offshore_parked_mn_usd=%.3f, want 12375.0", *resp.OffshoreParked.OffshoreParkedMnUSD)
	}

	// is_estimate on the main response must be false.
	if resp.IsEstimate {
		t.Errorf("is_estimate=true, want false (all BOP fields are primary source, PROBE-2)")
	}

	// source must be non-empty.
	if resp.Source == "" {
		t.Errorf("source is empty — provenance field required")
	}

	// fetched_at must be a valid RFC3339 timestamp.
	if resp.FetchedAt == "" {
		t.Errorf("fetched_at is empty — timestamp required on successful fetch")
	}
}

// TestBOPUseCase_FetchError verifies graceful degradation on upstream-fetch failure.
//
// G1 gate: upstream-fetch failure must return (resp, nil) with Status="degraded",
// IsEstimate=true, BlockedReason non-empty.
// Handler will emit HTTP 200 (not 500) because err=nil.
func TestBOPUseCase_FetchError(t *testing.T) {
	uc := NewBOPUseCase(
		&stubVpsFetcher{err: fmt.Errorf("VPS proxy unreachable")},
		&stubBOPParser{},
		&stubBOPURLBuilder{},
	)

	resp, err := uc.Execute(context.Background(), BOPRequest{})
	// G1: upstream-fetch failure MUST return nil error (HTTP 200 degraded, not 500).
	if err != nil {
		t.Errorf("upstream fetch failure must return nil error (degraded path, not 500): %v", err)
	}
	// G1: Status must be "degraded".
	if resp.Status != "degraded" {
		t.Errorf("Status=%q, want 'degraded'", resp.Status)
	}
	// G1: IsEstimate must be true (upstream source unreachable).
	if !resp.IsEstimate {
		t.Errorf("IsEstimate must be true on upstream fetch failure (fail-closed)")
	}
	// G1: BlockedReason must be non-empty (names the unreachable source).
	if resp.BlockedReason == "" {
		t.Errorf("BlockedReason must be non-empty on upstream fetch failure")
	}
	// OffshoreParked.IsEstimate is always true (heuristic).
	if !resp.OffshoreParked.IsEstimate {
		t.Errorf("OffshoreParked.IsEstimate must be true ALWAYS (heuristic)")
	}
}

// TestBOPUseCase_NilFetcher returns error when fetcher is nil.
func TestBOPUseCase_NilFetcher(t *testing.T) {
	uc := NewBOPUseCase(nil, &stubBOPParser{}, &stubBOPURLBuilder{})

	resp, err := uc.Execute(context.Background(), BOPRequest{})
	if err == nil {
		t.Errorf("expected error for nil fetcher, got nil")
	}
	if resp.Status != "error" {
		t.Errorf("Status=%q, want 'error'", resp.Status)
	}
}

// TestBOPUseCase_ExplicitQuarterWindow uses explicit quarter_start/end in request.
func TestBOPUseCase_ExplicitQuarterWindow(t *testing.T) {
	uc := NewBOPUseCase(
		&stubVpsFetcher{payload: []byte(q4_2025_fixture_json)},
		&stubBOPParser{},
		&stubBOPURLBuilder{},
	)

	req := BOPRequest{
		QuarterStart: "2025-10-01",
		QuarterEnd:   "2025-12-31",
	}
	resp, err := uc.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("BOPUseCase.Execute with explicit window: unexpected error: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("Status=%q, want 'ok'", resp.Status)
	}
	// E&O anchor still must match.
	if resp.ErrorsOmissionsMnUSD != -12375.0 {
		t.Errorf("errors_omissions_mn_usd=%.3f, want -12375.0", resp.ErrorsOmissionsMnUSD)
	}
}

// TestBOPUseCase_OffshoreParked_AlwaysEstimate verifies the is_estimate rule
// holds across multiple scenarios (not just the Q4-2025 anchor).
func TestBOPUseCase_OffshoreParked_AlwaysEstimate(t *testing.T) {
	// Scenario: positive E&O → offshore_parked should be nil but is_estimate still true.
	positiveEO := `{
		"items": [{
			"articleId": "TEST",
			"fields": {
				"Select02257401": "quyI",
				"Date48362898": "2025-03-31",
				"canCanVangLai": "1.000",
				"hangHoaXuatKhau": "50.000",
				"hangHoaNhapKhau": "45.000",
				"hangHoaRong": "5.000",
				"dichVuXuatKhau": "2.000",
				"dichVuNhapKhau": "1.000",
				"dichVuRong": "1.000",
				"thuNhapDauTuRong": "-1.000",
				"chuyenGiaoVangLai": "2.000",
				"canCanVon": "0",
				"canCanTaiChinh": "3.000",
				"dauTuTrucTiepRong": "2.000",
				"dauTuGianTiepRong": "0",
				"dauTuKhacRong": "1.000",
				"loiVaSaiSot": "500",
				"canCanTongThe": "0",
				"duTruVaCacHangMucLien": "0"
			}
		}],
		"totalCount": 1
	}`

	uc := NewBOPUseCase(
		&stubVpsFetcher{payload: []byte(positiveEO)},
		&stubBOPParser{},
		&stubBOPURLBuilder{},
	)

	resp, err := uc.Execute(context.Background(), BOPRequest{})
	if err != nil {
		t.Fatalf("BOPUseCase.Execute: unexpected error: %v", err)
	}

	// offshore_parked.is_estimate MUST always be true regardless of E&O sign.
	if !resp.OffshoreParked.IsEstimate {
		t.Errorf("offshore_parked.is_estimate=false (positive E&O path), want true ALWAYS")
	}

	// When E&O > 0, offshore_parked_mn_usd should be nil (precondition not met).
	if resp.OffshoreParked.OffshoreParkedMnUSD != nil {
		t.Errorf("offshore_parked.offshore_parked_mn_usd should be nil when E&O>0, got %v",
			*resp.OffshoreParked.OffshoreParkedMnUSD)
	}

	// FX incidence for positive E&O=500 → NEUTRAL (within ±1000 band).
	if resp.FXIncidence.Label != string(domain.FXIncidenceNeutral) {
		t.Errorf("fx_incidence.label=%q, want NEUTRAL for E&O=500", resp.FXIncidence.Label)
	}
}
