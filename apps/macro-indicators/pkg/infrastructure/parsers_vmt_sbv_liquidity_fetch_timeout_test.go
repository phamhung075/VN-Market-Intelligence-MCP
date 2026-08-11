// Package infrastructure — F-MACRO-FETCH-DEADLINE gate test for the liquidity-state
// upstream SBV HTML client-level timeouts (belt-and-suspenders backstop).
//
// FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE: omoFetchTimeout was
// previously a hardcoded 45s and the policy-rates http.Client.Timeout was a hardcoded
// 30s — both well over the mcp-server cron's 15s deadline. The application layer
// (usecases_vmt_liquidity.go) now wraps both calls' ctx in a shared domain.FetchBudgetSec
// window, which is the operative bound in production; this test guards the redundant
// client-level Timeout so it can never silently regress back above the shared budget
// for callers that pass a ctx without a deadline (e.g. context.Background()).
//
// No live HTTP: pure constant-value assertions (mirrors the existing convention in
// parsers_vmt_sbv_interbank_omo_test.go — "FetchSBVOMOFromHTML: intentionally NOT
// called from unit tests").
package infrastructure

import (
	"testing"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// TestOMOFetchTimeout_BoundedByFetchBudget guards omoFetchTimeout against regressing
// above the shared domain.FetchBudgetSec SSOT.
func TestOMOFetchTimeout_BoundedByFetchBudget(t *testing.T) {
	want := time.Duration(domain.FetchBudgetSec) * time.Second
	if omoFetchTimeout != want {
		t.Errorf("omoFetchTimeout = %v; want %v (domain.FetchBudgetSec) — a value above the shared "+
			"budget re-opens FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE for any "+
			"caller that passes a ctx without a deadline", omoFetchTimeout, want)
	}
}

// TestPolicyRatesFetchTimeout_BoundedByFetchBudget guards sbvPolicyRatesFetchTimeout
// (FetchSBVPolicyRatesFromHTML's http.Client.Timeout) against regressing above the
// shared domain.FetchBudgetSec SSOT.
func TestPolicyRatesFetchTimeout_BoundedByFetchBudget(t *testing.T) {
	want := time.Duration(domain.FetchBudgetSec) * time.Second
	if sbvPolicyRatesFetchTimeout != want {
		t.Errorf("sbvPolicyRatesFetchTimeout = %v; want %v (domain.FetchBudgetSec) — a value above "+
			"the shared budget re-opens FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE "+
			"for any caller that passes a ctx without a deadline", sbvPolicyRatesFetchTimeout, want)
	}
}
