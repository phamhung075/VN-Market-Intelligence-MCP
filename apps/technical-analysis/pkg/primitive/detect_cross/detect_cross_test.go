package detect_cross_test

import (
	"math"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/detect_cross"
)

func TestDetectCross(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		fastLine   []float64
		slowLine   []float64
		wantErr    error
		wantEvents []detect_cross.CrossEvent
	}{
		// --- Validation: mismatched lengths ---
		{
			name:     "mismatched lengths returns ErrMismatchedLengths",
			fastLine: []float64{1.0, 2.0, 3.0},
			slowLine: []float64{1.0, 2.0},
			wantErr:  detect_cross.ErrMismatchedLengths,
		},
		// --- Validation: length < 2 ---
		{
			name:     "empty slices returns ErrInsufficientData",
			fastLine: []float64{},
			slowLine: []float64{},
			wantErr:  detect_cross.ErrInsufficientData,
		},
		{
			name:     "single element returns ErrInsufficientData",
			fastLine: []float64{1.0},
			slowLine: []float64{1.0},
			wantErr:  detect_cross.ErrInsufficientData,
		},
		// --- Validation: NaN in fastLine ---
		{
			name:     "NaN in fastLine returns ErrInvalidValue",
			fastLine: []float64{1.0, math.NaN(), 3.0},
			slowLine: []float64{2.0, 2.0, 2.0},
			wantErr:  detect_cross.ErrInvalidValue,
		},
		// --- Validation: NaN in slowLine ---
		{
			name:     "NaN in slowLine returns ErrInvalidValue",
			fastLine: []float64{1.0, 2.0, 3.0},
			slowLine: []float64{2.0, math.NaN(), 2.0},
			wantErr:  detect_cross.ErrInvalidValue,
		},
		// --- Parallel lines always equal: 0 crosses ---
		{
			name:       "parallel lines always equal returns no crosses",
			fastLine:   []float64{1.0, 2.0, 3.0, 4.0, 5.0},
			slowLine:   []float64{1.0, 2.0, 3.0, 4.0, 5.0},
			wantEvents: []detect_cross.CrossEvent{},
		},
		// --- Parallel lines always fast > slow: 0 crosses ---
		{
			name:       "parallel lines fast always above slow returns no crosses",
			fastLine:   []float64{2.0, 3.0, 4.0, 5.0},
			slowLine:   []float64{1.0, 2.0, 3.0, 4.0},
			wantEvents: []detect_cross.CrossEvent{},
		},
		// --- Parallel lines fast always below slow: 0 crosses ---
		{
			name:       "parallel lines fast always below slow returns no crosses",
			fastLine:   []float64{0.0, 1.0, 2.0, 3.0},
			slowLine:   []float64{1.0, 2.0, 3.0, 4.0},
			wantEvents: []detect_cross.CrossEvent{},
		},
		// --- Single bullish cross ---
		// fast: [1, 2, 4]  slow: [3, 3, 3]
		// i=1: prev=(1-3)=-2<=0, curr=(2-3)=-1<=0 — no cross
		// i=2: prev=(2-3)=-1<=0, curr=(4-3)=+1>0  — BULLISH at index 2
		{
			name:     "single bullish cross at index 2",
			fastLine: []float64{1.0, 2.0, 4.0},
			slowLine: []float64{3.0, 3.0, 3.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 2, Direction: "bullish"},
			},
		},
		// --- Single bearish cross ---
		// fast: [5, 4, 2]  slow: [3, 3, 3]
		// i=1: prev=(5-3)=+2>=0, curr=(4-3)=+1>=0 — no cross
		// i=2: prev=(4-3)=+1>=0, curr=(2-3)=-1<0   — BEARISH at index 2
		{
			name:     "single bearish cross at index 2",
			fastLine: []float64{5.0, 4.0, 2.0},
			slowLine: []float64{3.0, 3.0, 3.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 2, Direction: "bearish"},
			},
		},
		// --- Multiple alternating crosses ---
		// fast: [1, 4, 1, 4, 1]  slow: [2, 2, 2, 2, 2]
		// i=1: prev=(1-2)=-1<=0, curr=(4-2)=+2>0 — BULLISH at 1
		// i=2: prev=(4-2)=+2>=0, curr=(1-2)=-1<0 — BEARISH at 2
		// i=3: prev=(1-2)=-1<=0, curr=(4-2)=+2>0 — BULLISH at 3
		// i=4: prev=(4-2)=+2>=0, curr=(1-2)=-1<0 — BEARISH at 4
		{
			name:     "multiple alternating crosses detected in order",
			fastLine: []float64{1.0, 4.0, 1.0, 4.0, 1.0},
			slowLine: []float64{2.0, 2.0, 2.0, 2.0, 2.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 1, Direction: "bullish"},
				{Index: 2, Direction: "bearish"},
				{Index: 3, Direction: "bullish"},
				{Index: 4, Direction: "bearish"},
			},
		},
		// --- Equal-then-cross edge case (bullish) ---
		// fast: [2, 2, 4]  slow: [2, 2, 2]
		// i=1: prev=(2-2)=0<=0, curr=(2-2)=0, 0 is NOT > 0 — no cross
		// i=2: prev=(2-2)=0<=0, curr=(4-2)=+2>0  — BULLISH at index 2
		{
			name:     "equal-then-bullish-cross: equality at i-1 counts",
			fastLine: []float64{2.0, 2.0, 4.0},
			slowLine: []float64{2.0, 2.0, 2.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 2, Direction: "bullish"},
			},
		},
		// --- Equal-then-cross edge case (bearish) ---
		// fast: [2, 2, 0]  slow: [2, 2, 2]
		// i=1: prev=(2-2)=0>=0, curr=(2-2)=0, 0 is NOT < 0 — no cross
		// i=2: prev=(2-2)=0>=0, curr=(0-2)=-2<0  — BEARISH at index 2
		{
			name:     "equal-then-bearish-cross: equality at i-1 counts",
			fastLine: []float64{2.0, 2.0, 0.0},
			slowLine: []float64{2.0, 2.0, 2.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 2, Direction: "bearish"},
			},
		},
		// --- Minimum valid input (2 elements) with cross ---
		// fast: [1, 3]  slow: [2, 2]
		// i=1: prev=(1-2)=-1<=0, curr=(3-2)=+1>0 — BULLISH at 1
		{
			name:     "minimum 2-element input with bullish cross",
			fastLine: []float64{1.0, 3.0},
			slowLine: []float64{2.0, 2.0},
			wantEvents: []detect_cross.CrossEvent{
				{Index: 1, Direction: "bullish"},
			},
		},
		// --- Minimum valid input (2 elements) with no cross ---
		{
			name:       "minimum 2-element input no cross",
			fastLine:   []float64{1.0, 1.5},
			slowLine:   []float64{2.0, 2.5},
			wantEvents: []detect_cross.CrossEvent{},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := detect_cross.DetectCross(tc.fastLine, tc.slowLine)

			if tc.wantErr != nil {
				if err == nil {
					t.Fatalf("want error %v, got nil", tc.wantErr)
				}
				if err != tc.wantErr {
					t.Fatalf("want error %v, got %v", tc.wantErr, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			// Normalize nil vs empty slice for comparison.
			if tc.wantEvents == nil {
				tc.wantEvents = []detect_cross.CrossEvent{}
			}
			gotNorm := got
			if gotNorm == nil {
				gotNorm = []detect_cross.CrossEvent{}
			}

			if len(gotNorm) != len(tc.wantEvents) {
				t.Fatalf("event count: want %d, got %d (events=%v)", len(tc.wantEvents), len(gotNorm), gotNorm)
			}
			for i, want := range tc.wantEvents {
				if gotNorm[i].Index != want.Index {
					t.Errorf("event[%d].Index: want %d, got %d", i, want.Index, gotNorm[i].Index)
				}
				if gotNorm[i].Direction != want.Direction {
					t.Errorf("event[%d].Direction: want %q, got %q", i, want.Direction, gotNorm[i].Direction)
				}
			}
		})
	}
}
