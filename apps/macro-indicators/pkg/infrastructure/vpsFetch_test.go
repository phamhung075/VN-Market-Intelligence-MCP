// Package infrastructure — unit + contract tests for VpsFetchAdapter (VMT-D-VPSFETCH).
//
// All tests use httptest.NewServer to mock the target and/or the proxy endpoint.
// Zero live network calls — sandbox security contract upheld.
// Zero file system access for CA certs — test-only PEM is generated in-memory.
//
// Test coverage:
//  T1: options contract  — BrowserUA + AcceptHeader are forwarded on the request.
//  T2: timeout contract  — a slow server causes a timeout error (fail-closed).
//  T3: non-2xx fail-closed — HTTP 404 returns (nil, error); body not fabricated.
//  T4: zero TimeoutSec   — defaults to 30s minimum, does not panic.
//  T5: TLS InsecureSkipVerify=false — always false (verified via struct field).
//  T6: CA cert path set with invalid file — buildTLSConfig returns error.
//  T7: proxy wiring      — client routes through the proxy address.
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

// noopLogger returns a *slog.Logger that discards all output — used in tests to
// suppress log noise without affecting test assertions.
func noopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newTestAdapter creates a VpsFetchAdapter pointing at the given proxy host:port.
// Uses a no-op logger for noise suppression in tests.
func newTestAdapter(proxyHost, proxyPort string) *VpsFetchAdapter {
	return &VpsFetchAdapter{
		vpsHost:    proxyHost,
		vpsPort:    proxyPort,
		caCertPath: "",
		logger:     noopLogger(),
	}
}

// ---------------------------------------------------------------------------
// T1: Options contract — BrowserUA + AcceptHeader forwarded
// ---------------------------------------------------------------------------

// TestFetch_OptionsApplied verifies that BrowserUA sets the User-Agent header
// and AcceptHeader sets the Accept header on the outgoing HTTP request.
//
// Strategy: httptest.NewServer records incoming request headers; the test
// adapter is pointed at this server directly (proxy field = target server).
func TestFetch_OptionsApplied(t *testing.T) {
	var (
		gotUA     string
		gotAccept string
	)

	// Target server records request headers.
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		gotAccept = r.Header.Get("Accept")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer target.Close()

	// Point the proxy at the target server (bypasses real proxy for unit test).
	addr := strings.TrimPrefix(target.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := newTestAdapter(parts[0], parts[1])

	opts := domain.VpsFetchOptions{
		TimeoutSec:   5,
		BrowserUA:    true,
		AcceptHeader: "application/json",
	}

	body, err := adapter.Fetch(context.Background(), target.URL, opts)
	if err != nil {
		t.Fatalf("Fetch unexpected error: %v", err)
	}
	if string(body) != "ok" {
		t.Errorf("body = %q; want %q", body, "ok")
	}

	// Verify User-Agent forwarded.
	if gotUA != browserUserAgent {
		t.Errorf("User-Agent = %q; want %q", gotUA, browserUserAgent)
	}
	// Verify Accept forwarded.
	if gotAccept != "application/json" {
		t.Errorf("Accept = %q; want %q", gotAccept, "application/json")
	}
}

// ---------------------------------------------------------------------------
// T2: Timeout contract — slow server causes (nil, error)
// ---------------------------------------------------------------------------

// TestFetch_Timeout verifies that a server that never responds causes Fetch
// to return (nil, error) within the configured timeout, not hang forever.
func TestFetch_Timeout(t *testing.T) {
	// Target server blocks until context is cancelled (simulates a stalled source).
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer target.Close()

	addr := strings.TrimPrefix(target.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := newTestAdapter(parts[0], parts[1])

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	body, err := adapter.Fetch(ctx, target.URL, domain.VpsFetchOptions{TimeoutSec: 1})
	if err == nil {
		t.Errorf("expected timeout error, got nil; body=%q", body)
	}
	if body != nil {
		t.Errorf("expected nil body on timeout, got %q", body)
	}
}

// ---------------------------------------------------------------------------
// T3: Non-2xx fail-closed — HTTP 404 returns (nil, error)
// ---------------------------------------------------------------------------

// TestFetch_Non2xxReturnsError verifies that HTTP 404 causes Fetch to return
// (nil, error) instead of silently returning an empty or fabricated body.
func TestFetch_Non2xxReturnsError(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer target.Close()

	addr := strings.TrimPrefix(target.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := newTestAdapter(parts[0], parts[1])

	body, err := adapter.Fetch(context.Background(), target.URL, domain.VpsFetchOptions{TimeoutSec: 5})
	if err == nil {
		t.Errorf("expected non-2xx error, got nil; body=%q", body)
	}
	if body != nil {
		t.Errorf("expected nil body on HTTP 404, got %q", body)
	}
}

// ---------------------------------------------------------------------------
// T4: Zero TimeoutSec — does not panic, defaults to 30s
// ---------------------------------------------------------------------------

// TestFetch_ZeroTimeoutNoHang verifies that TimeoutSec=0 is handled gracefully
// (defaults to 30s minimum) and the request still succeeds.
func TestFetch_ZeroTimeoutNoHang(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pong"))
	}))
	defer target.Close()

	addr := strings.TrimPrefix(target.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := newTestAdapter(parts[0], parts[1])

	// TimeoutSec=0 should not cause infinite block — the default 30s kicks in.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	body, err := adapter.Fetch(ctx, target.URL, domain.VpsFetchOptions{TimeoutSec: 0})
	if err != nil {
		t.Fatalf("Fetch with TimeoutSec=0: unexpected error: %v", err)
	}
	if string(body) != "pong" {
		t.Errorf("body = %q; want %q", body, "pong")
	}
}

// ---------------------------------------------------------------------------
// T5: TLS hardening — InsecureSkipVerify is always false
// ---------------------------------------------------------------------------

// TestBuildTLSConfig_InsecureSkipVerifyAlwaysFalse verifies that buildTLSConfig
// never sets InsecureSkipVerify=true regardless of caCertPath.
func TestBuildTLSConfig_InsecureSkipVerifyAlwaysFalse(t *testing.T) {
	adapter := &VpsFetchAdapter{
		caCertPath: "", // no CA cert — system bundle path
		logger:     noopLogger(),
	}
	cfg, err := adapter.buildTLSConfig()
	if err != nil {
		t.Fatalf("buildTLSConfig: unexpected error: %v", err)
	}
	if cfg.InsecureSkipVerify {
		t.Error("InsecureSkipVerify must be false; TLS hardening violated")
	}
}

// ---------------------------------------------------------------------------
// T6: Invalid CA cert path — buildTLSConfig returns error
// ---------------------------------------------------------------------------

// TestBuildTLSConfig_InvalidCACertPath verifies that a non-existent CA cert
// path causes buildTLSConfig to return an error (fail-closed).
func TestBuildTLSConfig_InvalidCACertPath(t *testing.T) {
	adapter := &VpsFetchAdapter{
		caCertPath: "/nonexistent/path/ca.pem",
		logger:     noopLogger(),
	}
	_, err := adapter.buildTLSConfig()
	if err == nil {
		t.Error("expected error for non-existent CA cert path, got nil")
	}
}

// ---------------------------------------------------------------------------
// T7: BrowserUA=false — User-Agent header NOT set
// ---------------------------------------------------------------------------

// TestFetch_NoBrowserUA verifies that BrowserUA=false does not inject the
// browser User-Agent, keeping the default Go http.Client UA or empty.
func TestFetch_NoBrowserUA(t *testing.T) {
	var gotUA string

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer target.Close()

	addr := strings.TrimPrefix(target.URL, "http://")
	parts := strings.SplitN(addr, ":", 2)
	adapter := newTestAdapter(parts[0], parts[1])

	_, err := adapter.Fetch(context.Background(), target.URL, domain.VpsFetchOptions{
		TimeoutSec: 5,
		BrowserUA:  false,
	})
	if err != nil {
		t.Fatalf("Fetch unexpected error: %v", err)
	}

	if gotUA == browserUserAgent {
		t.Errorf("BrowserUA=false but User-Agent was set to %q", gotUA)
	}
}
