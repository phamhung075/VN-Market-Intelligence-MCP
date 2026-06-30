package domain_test

import (
	"testing"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// mockForeignFlowRepo is a mock implementation of ForeignFlowRepository.
type mockForeignFlowRepo struct {
	data map[string][]domain.ForeignFlowBar
}

func (m *mockForeignFlowRepo) GetForeignFlow(codes []string, limit int) (map[string][]domain.ForeignFlowBar, error) {
	result := make(map[string][]domain.ForeignFlowBar)
	for _, code := range codes {
		if bars, ok := m.data[code]; ok {
			if len(bars) > limit {
				bars = bars[:limit]
			}
			result[code] = bars
		}
	}
	return result, nil
}

// mockRoomEventRepo is a mock implementation of RoomEventRepository.
type mockRoomEventRepo struct {
	events map[string]*domain.RoomEvent
}

func (m *mockRoomEventRepo) GetLatestRoomEvent(code string) (*domain.RoomEvent, error) {
	event, ok := m.events[code]
	if !ok {
		return nil, nil // honest-null: no event row
	}
	return event, nil
}

// helper to create float64 pointer
func floatPtr(f float64) *float64 {
	return &f
}

// generateBars creates n bars with specified foreign flow values.
func generateBars(code string, n int, foreignNet float64, volume float64) []domain.ForeignFlowBar {
	bars := make([]domain.ForeignFlowBar, n)
	for i := 0; i < n; i++ {
		buy := foreignNet / 2
		if buy < 0 {
			buy = 0
		}
		sell := buy - foreignNet
		bars[i] = domain.ForeignFlowBar{
			Code:           code,
			Date:           "2026-06-" + string(rune('0'+30-i/10)) + string(rune('0'+i%10)),
			ForeignBuyVol:  floatPtr(buy),
			ForeignSellVol: floatPtr(sell),
			ForeignNetVol:  floatPtr(foreignNet),
			Volume:         volume,
		}
	}
	return bars
}

func TestForeignAccumService_InsufficientFlowHistory(t *testing.T) {
	// FR-10: <5 bars = null + null_reason
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 3, 1000, 10000), // Only 3 bars
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Tickers) != 1 {
		t.Fatalf("expected 1 ticker, got %d", len(result.Tickers))
	}

	ticker := result.Tickers[0]
	if ticker.NullReason == nil || *ticker.NullReason != "insufficient_flow_history" {
		t.Errorf("expected null_reason='insufficient_flow_history', got %v", ticker.NullReason)
	}
	if ticker.CumNetFlow5dNormalized != nil {
		t.Errorf("expected nil cum_net_flow_5d_normalized for <5 bars")
	}
}

func TestForeignAccumService_Partial20dHistory(t *testing.T) {
	// FR-11: >=5 but <20 bars: 5d real, 20d null
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 8, 1000, 10000), // 8 bars
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ticker := result.Tickers[0]

	// 5d should be real
	if ticker.CumNetFlow5dNormalized == nil {
		t.Error("expected real cum_net_flow_5d_normalized for 8 bars")
	}

	// 20d should be null with reason
	if ticker.CumNetFlow20dNormalized != nil {
		t.Error("expected null cum_net_flow_20d_normalized for <20 bars")
	}
	if ticker.NullReason20d == nil || *ticker.NullReason20d != "insufficient_20d_history" {
		t.Errorf("expected null_reason_20d='insufficient_20d_history', got %v", ticker.NullReason20d)
	}
}

func TestForeignAccumService_ZeroADTV(t *testing.T) {
	// FR-12: zero ADTV = null + null_reason for normalized flow
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 10, 1000, 0), // Zero volume -> zero ADTV
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ticker := result.Tickers[0]
	if ticker.NullReasonNormalize == nil || *ticker.NullReasonNormalize != "zero_adtv" {
		t.Errorf("expected null_reason_normalize='zero_adtv', got %v", ticker.NullReasonNormalize)
	}
}

func TestForeignAccumService_DegeneratePopulation(t *testing.T) {
	// FR-13: <3 tickers with >=5 bars = z-score null for all
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 10, 1000, 10000), // 1 valid ticker
			"VIC": generateBars("VIC", 3, 500, 5000),    // <5 bars, not counted
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM", "VIC"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// VNM has valid 5d flow but z-score should be null due to degenerate population
	for _, ticker := range result.Tickers {
		if ticker.Code == "VNM" {
			if ticker.CumNetFlow5dNormalized == nil {
				t.Error("VNM should have real 5d flow")
			}
			if ticker.NullReasonZScore == nil || *ticker.NullReasonZScore != "insufficient_cross_section" {
				t.Errorf("expected null_reason_z_score='insufficient_cross_section' for VNM, got %v", ticker.NullReasonZScore)
			}
		}
	}
}

func TestForeignAccumService_HappyPath_FullData(t *testing.T) {
	// Happy path: 20-bar tickers with real foreign flow
	// With 5 tickers, we can achieve z-scores exceeding 1.5/-1.5 thresholds
	// Distribution: -10000, -5000, 0, 5000, 10000 -> symmetric, stddev ~ 7071
	// z for +10000 = (10000 - 0) / 7071 = 1.41 (still borderline)
	// Use more extreme outlier: 20000 -> z = 20000/7071 = 2.83
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 20, 20000, 10000), // Extreme accumulation -> z > 1.5
			"VIC": generateBars("VIC", 20, -20000, 10000), // Extreme distribution -> z < -1.5
			"FPT": generateBars("FPT", 20, 0, 10000),     // Neutral
			"HPG": generateBars("HPG", 20, 1000, 10000),  // Slight positive
			"MSN": generateBars("MSN", 20, -1000, 10000), // Slight negative
		},
	}
	roomRepo := &mockRoomEventRepo{
		events: map[string]*domain.RoomEvent{
			"VNM": {Code: "VNM", EventDate: "2026-06-30", EventType: domain.RoomEventFull},
			"VIC": {Code: "VIC", EventDate: "2026-06-29", EventType: domain.RoomEventReopen},
			// FPT, HPG, MSN have no event -> honest-null
		},
	}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM", "VIC", "FPT", "HPG", "MSN"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.ADTVUnit != "shares" {
		t.Errorf("expected adtv_unit='shares', got %s", result.ADTVUnit)
	}

	// Check z-score and ranking
	var vnmResult, vicResult, fptResult *domain.ForeignAccumTickerResult
	for i := range result.Tickers {
		switch result.Tickers[i].Code {
		case "VNM":
			vnmResult = &result.Tickers[i]
		case "VIC":
			vicResult = &result.Tickers[i]
		case "FPT":
			fptResult = &result.Tickers[i]
		}
	}

	// VNM should have highest z-score (rank 1) and be ACCUMULATING
	if vnmResult.ZScore5d == nil {
		t.Error("VNM should have z-score")
	} else {
		t.Logf("VNM z-score: %f", *vnmResult.ZScore5d)
		if *vnmResult.ZScore5d < 1.5 {
			t.Errorf("VNM z-score should be >= 1.5, got %f", *vnmResult.ZScore5d)
		}
	}
	if vnmResult.Rank == nil || *vnmResult.Rank != 1 {
		t.Errorf("VNM should be rank 1, got %v", vnmResult.Rank)
	}
	if vnmResult.Label == nil {
		t.Error("VNM should have label")
	} else if *vnmResult.Label != domain.AccumLabelAccumulating {
		t.Errorf("VNM should be ACCUMULATING, got %s", *vnmResult.Label)
	}

	// VIC should have lowest z-score (rank 5) and be DISTRIBUTING
	if vicResult.ZScore5d == nil {
		t.Error("VIC should have z-score")
	} else {
		t.Logf("VIC z-score: %f", *vicResult.ZScore5d)
		if *vicResult.ZScore5d > -1.5 {
			t.Errorf("VIC z-score should be <= -1.5, got %f", *vicResult.ZScore5d)
		}
	}
	if vicResult.Rank == nil || *vicResult.Rank != 5 {
		t.Errorf("VIC should be rank 5 (lowest), got %v", vicResult.Rank)
	}
	if vicResult.Label == nil {
		t.Error("VIC should have label")
	} else if *vicResult.Label != domain.AccumLabelDistributing {
		t.Errorf("VIC should be DISTRIBUTING, got %s", *vicResult.Label)
	}

	// FPT should be NEUTRAL (z near 0)
	if fptResult.Label == nil {
		t.Error("FPT should have label")
	} else if *fptResult.Label != domain.AccumLabelNeutral {
		t.Errorf("FPT should be NEUTRAL, got %s", *fptResult.Label)
	}

	// Room exhaustion checks
	if vnmResult.RoomExhaustion == nil || !*vnmResult.RoomExhaustion {
		t.Error("VNM room_exhaustion should be true (ROOM_FULL)")
	}
	if vicResult.RoomExhaustion == nil || *vicResult.RoomExhaustion {
		t.Error("VIC room_exhaustion should be false (ROOM_REOPEN)")
	}
	if fptResult.RoomExhaustion != nil {
		t.Error("FPT room_exhaustion should be nil (no event)")
	}
	if fptResult.NullReasonRoom == nil || *fptResult.NullReasonRoom != "room_event_not_found" {
		t.Errorf("FPT should have null_reason_room='room_event_not_found', got %v", fptResult.NullReasonRoom)
	}
}

func TestForeignAccumService_ForeignAccumZMarket(t *testing.T) {
	// Test the aggregate scalar for Fear & Greed
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 20, 2000, 10000),
			"VIC": generateBars("VIC", 20, 2000, 10000),
			"FPT": generateBars("FPT", 20, 2000, 10000),
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM", "VIC", "FPT"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// All tickers have same positive flow -> mean z-score should be ~0 (all equal)
	if result.ForeignAccumZMarket == nil {
		t.Error("expected foreign_accum_z_market scalar")
	}
}

func TestForeignAccumService_RawFlowsComputed(t *testing.T) {
	// Verify raw flow values are computed correctly
	flowRepo := &mockForeignFlowRepo{
		data: map[string][]domain.ForeignFlowBar{
			"VNM": generateBars("VNM", 20, 1000, 10000), // 1000 net per day
		},
	}
	roomRepo := &mockRoomEventRepo{events: make(map[string]*domain.RoomEvent)}

	service := domain.NewForeignAccumService(flowRepo, roomRepo)
	result, err := service.ComputeRank([]string{"VNM"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ticker := result.Tickers[0]

	// 5d raw flow = 5 * 1000 = 5000
	if ticker.NetFlow5dRaw == nil || *ticker.NetFlow5dRaw != 5000 {
		t.Errorf("expected net_flow_5d_raw=5000, got %v", ticker.NetFlow5dRaw)
	}

	// 20d raw flow = 20 * 1000 = 20000
	if ticker.NetFlow20dRaw == nil || *ticker.NetFlow20dRaw != 20000 {
		t.Errorf("expected net_flow_20d_raw=20000, got %v", ticker.NetFlow20dRaw)
	}
}
