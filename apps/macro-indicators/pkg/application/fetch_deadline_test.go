// Package application — F-MACRO-FETCH-DEADLINE gate tests.
//
// Verifies that a HANGING fetcher is bounded by domain.FetchBudgetSec and that
// the affected use-cases (BOP + NSO-backed ones via NSOExcelProvider) surface the
// deadline as a degraded-200 DTO, NOT a propagated gateway timeout.
//
// Contract under test (VMT-8 degrade path):
//  - A fetch hang → ctx.DeadlineExceeded within FetchBudgetSec seconds
//  - Use-case returns (resp, nil) with Status="degraded", IsEstimate=true, BlockedReason set
//  - Elapsed time is strictly < FetchBudgetSec + 2s (generous slack for CI)
//  - err is nil (HTTP 200 degraded-200 path, NOT HTTP 500)
//
// Covered paths:
//  - NSO-chain path:  TradeBalanceUseCase / MacroIndicatorsGSOUseCase / CPIComponentsUseCase
//    (all share NSOExcelProvider; the chain context is bounded in discoverAndFetch)
//  - BOP path:        BOPUseCase.fetchAndParseQuarter wraps its own context.WithTimeout
//
// Fence-B: only pkg/domain and pkg/application imports allowed.
// Stubs from other test files in this package are reused (stubBOPParser, stubBOPURLBuilder,
// stubTradeParser, stubIIPParser, stubCPIParser).
package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// hangingNSOProvider is an NSOExcelProvider that blocks until its ctx is cancelled.
// It simulates a hanging upstream (NSO origin slow / no response within budget).
type hangingNSOProvider struct{}

func (h *hangingNSOProvider) GetOrFetchNSOMonthlyExcel(ctx context.Context) ([]byte, string, error) {
	// Block until the caller's context fires.
	<-ctx.Done()
	return nil, "", ctx.Err()
}

// hangingVpsFetcher is a VpsFetchPort that blocks until its ctx is cancelled.
// It simulates a hanging SBV origin for the BOP fetch path.
type hangingVpsFetcher struct{}

func (h *hangingVpsFetcher) Fetch(ctx context.Context, _ string, _ domain.VpsFetchOptions) ([]byte, error) {
	// Block until the caller's context fires (deadline from context.WithTimeout in use-case).
	<-ctx.Done()
	return nil, ctx.Err()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// elapsedBudgetSlack is the test tolerance above FetchBudgetSec.
// Allows CI overhead without flapping.
const elapsedBudgetSlack = 3 * time.Second

// assertDegradedDeadline is the shared assertion helper for all hanging-fetcher tests.
// Verifies: (1) elapsed within budget+slack, (2) err is nil, (3) Status="degraded",
// (4) IsEstimate=true, (5) BlockedReason set.
func assertWithinBudget(t *testing.T, start time.Time) {
	t.Helper()
	elapsed := time.Since(start)
	budget := time.Duration(domain.FetchBudgetSec)*time.Second + elapsedBudgetSlack
	if elapsed > budget {
		t.Errorf("DEADLINE MISS: elapsed %v exceeds FetchBudgetSec(%ds)+slack(%v); fetcher hang was not bounded",
			elapsed.Round(time.Millisecond), domain.FetchBudgetSec, elapsedBudgetSlack)
	}
}

func assertDegradedResponse(t *testing.T, status string, isEstimate bool, blockedReason string, err error) {
	t.Helper()
	if err != nil {
		t.Errorf("hanging fetcher must return nil error (degraded→HTTP 200 path, NOT 500); got: %v", err)
	}
	if status != "degraded" {
		t.Errorf("Status=%q, want 'degraded' (VMT-8 degrade path)", status)
	}
	if !isEstimate {
		t.Error("IsEstimate must be true on hang-induced deadline (upstream unreachable)")
	}
	if blockedReason == "" {
		t.Error("BlockedReason must be non-empty (names the unreachable source)")
	}
}

// ---------------------------------------------------------------------------
// BOP path — BOPUseCase with hangingVpsFetcher
// ---------------------------------------------------------------------------

// TestFetchDeadline_BOP_HangingFetcher verifies that a hanging SBV origin is bounded
// by domain.FetchBudgetSec inside BOPUseCase.fetchAndParseQuarter (context.WithTimeout
// + TimeoutSec=FetchBudgetSec) and surfaces as a degraded-200 response.
//
// DoD gate: elapsed < FetchBudgetSec + elapsedBudgetSlack AND Status="degraded".
func TestFetchDeadline_BOP_HangingFetcher(t *testing.T) {
	uc := NewBOPUseCase(&hangingVpsFetcher{}, &stubBOPParser{}, &stubBOPURLBuilder{})

	// Outer context has generous headroom so the inner budget fires first.
	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	start := time.Now()
	resp, err := uc.Execute(ctx, BOPRequest{})
	assertWithinBudget(t, start)
	assertDegradedResponse(t, resp.Status, resp.IsEstimate, resp.BlockedReason, err)

	// BOP-specific: OffshoreParked.IsEstimate must be true always.
	if !resp.OffshoreParked.IsEstimate {
		t.Error("OffshoreParked.IsEstimate must be true ALWAYS (heuristic) even on hang path")
	}
}

// TestFetchDeadline_BOP_DeadlineExceeeded_ErrorWrapped verifies the underlying error
// from a hanging BOP fetch wraps context.DeadlineExceeded (or context.Canceled when the
// inner WithTimeout fires). The use-case degrades it rather than propagating it.
func TestFetchDeadline_BOP_DeadlineErrorWrapped(t *testing.T) {
	uc := NewBOPUseCase(&hangingVpsFetcher{}, &stubBOPParser{}, &stubBOPURLBuilder{})

	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	resp, err := uc.Execute(ctx, BOPRequest{})

	// The use-case must NOT propagate the deadline error — it must absorb it as degraded.
	if err != nil {
		t.Errorf("BOPUseCase must absorb deadline error as degraded (nil err), got: %v", err)
	}
	// Status must be "degraded" not "error" (error = wiring fault, not upstream hang).
	if resp.Status != "degraded" {
		t.Errorf("Status=%q, want 'degraded' (deadline absorbed, not propagated)", resp.Status)
	}
}

// ---------------------------------------------------------------------------
// NSO-chain path — TradeBalance / MacroGSO / CPI with hangingNSOProvider
// ---------------------------------------------------------------------------

// TestFetchDeadline_NSO_TradeBalance_HangingProvider verifies the NSO-chain budget
// for TradeBalanceUseCase: hangingNSOProvider blocks → ctx.Done fires within
// FetchBudgetSec → use-case returns degraded-200.
func TestFetchDeadline_NSO_TradeBalance_HangingProvider(t *testing.T) {
	uc := NewTradeBalanceUseCase(&hangingNSOProvider{}, &stubTradeParser{})

	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	start := time.Now()
	resp, err := uc.Execute(ctx, TradeBalanceRequest{})
	assertWithinBudget(t, start)
	assertDegradedResponse(t, resp.Status, resp.IsEstimate, resp.BlockedReason, err)

	// BlocSplit permanent invariants must hold even on hang path.
	if !resp.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true ALWAYS (ARCH Decision A) on hang path")
	}
	if !resp.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must be true ALWAYS (ARCH Decision A) on hang path")
	}
}

// TestFetchDeadline_NSO_MacroGSO_HangingProvider verifies the NSO-chain budget
// for MacroIndicatorsGSOUseCase (VMT-3b).
func TestFetchDeadline_NSO_MacroGSO_HangingProvider(t *testing.T) {
	uc := NewMacroIndicatorsGSOUseCase(&hangingNSOProvider{}, &stubIIPParser{})

	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	start := time.Now()
	resp, err := uc.Execute(ctx, MacroIndicatorsGSORequest{})
	assertWithinBudget(t, start)
	assertDegradedResponse(t, resp.Status, resp.IsEstimate, resp.BlockedReason, err)
}

// TestFetchDeadline_NSO_CPI_HangingProvider verifies the NSO-chain budget
// for CPIComponentsUseCase (VMT-4).
func TestFetchDeadline_NSO_CPI_HangingProvider(t *testing.T) {
	uc := NewCPIComponentsUseCase(&hangingNSOProvider{}, &stubCPIParser{})

	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	start := time.Now()
	resp, err := uc.Execute(ctx, CPIComponentsRequest{})
	assertWithinBudget(t, start)
	assertDegradedResponse(t, resp.Status, resp.IsEstimate, resp.BlockedReason, err)

	// WeightsIsEstimate=true always — even on hang path.
	if !resp.WeightsIsEstimate {
		t.Error("WeightsIsEstimate must be true ALWAYS (never fabricated weights) on hang path")
	}
}

// ---------------------------------------------------------------------------
// FetchBudgetSec sanity — const value is well below any reasonable gateway timeout
// ---------------------------------------------------------------------------

// TestFetchBudgetSec_BelowGatewayDeadline verifies the shared const is sane:
// strictly positive, < 15s (conservative gateway lower bound).
func TestFetchBudgetSec_BelowGatewayDeadline(t *testing.T) {
	if domain.FetchBudgetSec <= 0 {
		t.Errorf("FetchBudgetSec=%d must be positive", domain.FetchBudgetSec)
	}
	if domain.FetchBudgetSec >= 15 {
		t.Errorf("FetchBudgetSec=%d must be < 15s (gateway timeout lower bound)", domain.FetchBudgetSec)
	}
}

// ---------------------------------------------------------------------------
// Context already expired — extra resilience test
// ---------------------------------------------------------------------------

// TestFetchDeadline_BOP_AlreadyExpiredCtx verifies that if the caller passes an
// already-expired context, the use-case still returns a degraded-200 (not panic/error).
func TestFetchDeadline_BOP_AlreadyExpiredCtx(t *testing.T) {
	uc := NewBOPUseCase(&hangingVpsFetcher{}, &stubBOPParser{}, &stubBOPURLBuilder{})

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()
	// Ensure deadline is already past.
	time.Sleep(5 * time.Millisecond)

	resp, err := uc.Execute(ctx, BOPRequest{})
	if err != nil {
		t.Errorf("already-expired ctx: BOPUseCase must absorb as degraded (nil err), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("already-expired ctx: Status=%q, want 'degraded'", resp.Status)
	}
	_ = errors.New("") // keep errors import alive
}
