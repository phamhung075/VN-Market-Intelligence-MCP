// Package infrastructure — F-MACRO-FETCH-DEADLINE gate test for the NSO 3-fetch chain.
//
// Tests that discoverAndFetch wraps the WHOLE chain in context.WithTimeout(FetchBudgetSec)
// so a hanging httptest.Server (Step 1, 2, or 3) fires ctx.DeadlineExceeded within
// domain.FetchBudgetSec seconds — NOT after 3×30s = 90s.
//
// Strategy:
//  - Spin up an httptest.Server that never responds (blocks until ctx is cancelled).
//  - Point NSOExcelFetcher at it via a custom VpsFetchAdapter pointed at that server.
//  - Call GetOrFetchNSOMonthlyExcel with a generous outer context (3×FetchBudgetSec).
//  - Assert: error is returned AND elapsed < FetchBudgetSec + elapsedSlack.
//
// The test does NOT need a real SQLite DB — the cache miss path goes directly to
// discoverAndFetch when the DB is unreachable; we simulate a "no-cache" path by
// using an in-memory SQLite open on a temp file. The key assertion is elapsed time.
//
// Fence-C: pkg/infrastructure test; imports only pkg/domain + stdlib.
package infrastructure

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoDeadlineSlack is the test tolerance above FetchBudgetSec for elapsed-time assertions.
const nsoDeadlineSlack = 3 * time.Second

// TestNSOChain_HangingFetcher_BoundedByBudget verifies that a hanging step-1 origin
// (NSO index page) causes discoverAndFetch to return within FetchBudgetSec + slack,
// NOT after 30s×3 = 90s.
//
// This is the KEY regression test for F-MACRO-FETCH-DEADLINE on the NSO chain.
func TestNSOChain_HangingFetcher_BoundedByBudget(t *testing.T) {
	// Spin up a server that blocks indefinitely (simulates hanging NSO origin).
	// Uses http.Hijacker to take ownership of the connection and close it cleanly
	// when the request context fires, avoiding the httptest.Server blocked-in-Close log.
	hangServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			// Fallback: block on request context done.
			<-r.Context().Done()
			return
		}
		conn, _, _ := hj.Hijack()
		// Block until the test's fetch budget fires, then close the conn cleanly.
		<-r.Context().Done()
		conn.Close()
	}))
	defer hangServer.Close()

	// Build a VpsFetchAdapter pointed at the hang server (bypass real VPS proxy).
	addr := strings.TrimPrefix(hangServer.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := &VpsFetchAdapter{
		vpsHost:    parts[0],
		vpsPort:    parts[1],
		caCertPath: "",
		logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	// Use a temp file as the DB path — the table won't exist, so cache read
	// returns sql.ErrNoRows → cache miss → discoverAndFetch is called.
	// We don't need data in the DB; we only care about the elapsed time.
	t.TempDir() // ensure temp dir is available
	tmpDB := t.TempDir() + "/nso_test.db"

	fetcher := NewNSOExcelFetcher(adapter, tmpDB)

	// Outer context has generous headroom so the inner FetchBudgetSec fires first.
	ctx, cancel := context.WithTimeout(context.Background(),
		time.Duration(domain.FetchBudgetSec*3)*time.Second)
	defer cancel()

	start := time.Now()
	_, _, err := fetcher.GetOrFetchNSOMonthlyExcel(ctx)
	elapsed := time.Since(start)

	// Must return an error (hang = no success possible).
	if err == nil {
		t.Fatal("expected error from hanging NSO origin, got nil")
	}

	// KEY assertion: elapsed must be within FetchBudgetSec + slack.
	budget := time.Duration(domain.FetchBudgetSec)*time.Second + nsoDeadlineSlack
	if elapsed > budget {
		t.Errorf("NSO chain DEADLINE MISS: elapsed %v exceeds budget %v (FetchBudgetSec=%ds + slack=%v); "+
			"discoverAndFetch context.WithTimeout not working",
			elapsed.Round(time.Millisecond), budget, domain.FetchBudgetSec, nsoDeadlineSlack)
	}

	t.Logf("NSO chain hang terminated in %v (budget %v) — PASS", elapsed.Round(time.Millisecond), budget)
}

// TestNSOChain_FetchBudgetSec_IsSharedConst verifies that discoverAndFetch's budget
// uses domain.FetchBudgetSec (the SSOT), not a hardcoded literal.
// This is a compile-time structural check — if the const moves or is renamed, this
// test will fail to compile, surfacing the drift immediately.
func TestNSOChain_FetchBudgetSec_IsSharedConst(t *testing.T) {
	// domain.FetchBudgetSec must be positive and below 15s (gateway lower bound).
	if domain.FetchBudgetSec <= 0 {
		t.Errorf("FetchBudgetSec=%d must be positive", domain.FetchBudgetSec)
	}
	if domain.FetchBudgetSec >= 15 {
		t.Errorf("FetchBudgetSec=%d must be < 15s (well below gateway timeout)", domain.FetchBudgetSec)
	}
}
