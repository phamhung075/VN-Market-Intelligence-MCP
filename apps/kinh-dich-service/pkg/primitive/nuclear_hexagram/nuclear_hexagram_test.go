package nuclear_hexagram

import (
	"strings"
	"testing"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hao_encoder"
)

// TestComputeHoQue_Golden tests all-yang signals -> hoQue=1.
// Matches scenario: nuclear-hexagram-computer-golden.json
func TestComputeHoQue_Golden(t *testing.T) {
	signals := []int{1, 1, 1, 1, 1, 1}

	result, err := ComputeHoQue(signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != 1 {
		t.Errorf("expected hoQue=1, got %d", result)
	}
}

// TestComputeBienQue_Golden tests all-stable-yang haos -> bienQue=1.
// Matches scenario: nuclear-hexagram-computer-golden.json
func TestComputeBienQue_Golden(t *testing.T) {
	haos := []HaoReading{
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 1"},
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 2"},
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 3"},
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 4"},
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 5"},
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 6"},
	}

	result, err := ComputeBienQue(haos)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != 1 {
		t.Errorf("expected bienQue=1, got %d", result)
	}
}

// TestComputeHoQue_Edge tests all-yin signals -> hoQue=2.
// Matches scenario: nuclear-hexagram-computer-edge.json
func TestComputeHoQue_Edge(t *testing.T) {
	signals := []int{0, 0, 0, 0, 0, 0}

	result, err := ComputeHoQue(signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != 2 {
		t.Errorf("expected hoQue=2, got %d", result)
	}
}

// TestComputeBienQue_Edge tests all-LAO_DUONG haos flip to yin -> bienQue=2.
// Matches scenario: nuclear-hexagram-computer-edge.json
func TestComputeBienQue_Edge(t *testing.T) {
	// All LAO_DUONG (binary=1, changing) flip to 0
	haos := []HaoReading{
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 1"},
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 2"},
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 3"},
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 4"},
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 5"},
		{State: hao_encoder.LAO_DUONG, Binary: 1, IsChanging: true, Label: "Hao 6"},
	}

	result, err := ComputeBienQue(haos)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// All flipped to 0 -> [0,0,0,0,0,0] -> hexagram 2
	if result != 2 {
		t.Errorf("expected bienQue=2, got %d", result)
	}
}

// TestComputeHoQue_Failure tests error case: signals length != 6.
// Matches scenario: nuclear-hexagram-computer-failure.json
func TestComputeHoQue_Failure(t *testing.T) {
	signals := []int{1, 0} // length 2

	result, err := ComputeHoQue(signals)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if result != 0 {
		t.Error("expected result 0 on error")
	}

	expectedMsg := "computeHoQue requires exactly 6 signals, got 2"
	if err.Error() != expectedMsg {
		t.Errorf("expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

// TestComputeBienQue_Failure tests error case: haos length != 6.
// Matches scenario: nuclear-hexagram-computer-failure.json
func TestComputeBienQue_Failure(t *testing.T) {
	haos := []HaoReading{
		{State: hao_encoder.THIEU_DUONG, Binary: 1, IsChanging: false, Label: "Hao 1"},
		{State: hao_encoder.THIEU_AM, Binary: 0, IsChanging: false, Label: "Hao 2"},
	}

	result, err := ComputeBienQue(haos)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if result != 0 {
		t.Error("expected result 0 on error")
	}

	expectedMsg := "computeBienQue requires exactly 6 HaoReading objects, got 2"
	if err.Error() != expectedMsg {
		t.Errorf("expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

// TestComputeBienQue_LAO_AM_Flip tests that LAO_AM lines flip to yang.
func TestComputeBienQue_LAO_AM_Flip(t *testing.T) {
	// All LAO_AM (binary=0, changing) flip to 1
	haos := []HaoReading{
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 1"},
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 2"},
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 3"},
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 4"},
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 5"},
		{State: hao_encoder.LAO_AM, Binary: 0, IsChanging: true, Label: "Hao 6"},
	}

	result, err := ComputeBienQue(haos)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// All flipped to 1 -> [1,1,1,1,1,1] -> hexagram 1
	if result != 1 {
		t.Errorf("expected bienQue=1, got %d", result)
	}
}

// TestComputeHoQue_MixedSignals tests nuclear hexagram with mixed signals.
func TestComputeHoQue_MixedSignals(t *testing.T) {
	// signals = [1,0,1,0,1,0] (alternating)
	// hoSignals = [signals[1], signals[2], signals[3], signals[2], signals[3], signals[4]]
	//           = [0, 1, 0, 1, 0, 1]
	// lower trigram: [0,1,0] = Kan
	// upper trigram: [1,0,1] = Li
	// Kan|Li lookup should give hexagram 64
	signals := []int{1, 0, 1, 0, 1, 0}

	result, err := ComputeHoQue(signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Looking up Li|Kan in the table (upper=Li, lower=Kan)
	// Wait, the resolution is ResolveHexagram which does upper=signals[3:6], lower=signals[0:3]
	// So hoSignals = [0,1,0,1,0,1]
	// lower = [0,1,0] = Kan
	// upper = [1,0,1] = Li
	// Li|Kan -> hexagram 64
	if result != 64 {
		t.Errorf("expected hoQue=64, got %d", result)
	}
}

// TestSisterPrimitiveImports documents the Fence-A exception.
func TestSisterPrimitiveImports(t *testing.T) {
	// This test documents that nuclear_hexagram imports from sister primitives
	// (hexagram_resolver, hao_encoder) are legitimate Fence-A exceptions.
	//
	// Sister primitive imports are pure-function siblings in the same primitive layer,
	// not higher-layer imports from module/application/infrastructure/interface.
	//
	// depguard allowlist must include: pkg/primitive/* -> pkg/primitive/*
	t.Log("Fence-A exempt: nuclear_hexagram imports hexagram_resolver and hao_encoder (sister primitives)")

	// Verify we can use types from both packages
	var _ HaoReading // from hao_encoder
	if strings.Contains("test", "sister") {
		t.Log("Sister primitive import documentation test")
	}
}
