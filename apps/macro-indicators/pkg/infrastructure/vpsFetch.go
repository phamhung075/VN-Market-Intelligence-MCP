// Package infrastructure — VPS proxy HTTP adapter (VMT-D-VPSFETCH).
//
// VpsFetchAdapter routes outbound HTTP requests through the Vinahost VPS proxy
// so that geo-blocked Vietnamese data sources (GSO, Customs, SBV) are reachable
// from outside Vietnam.
//
// Design decisions:
//  - HTTP proxy via CONNECT tunneling: Go's http.Transport.Proxy handles this
//    automatically for HTTPS targets when a proxy URL is set.
//  - TLS hardening (project_bctc_hnx_ssl_outage): InsecureSkipVerify is always
//    false. When VPS_CACERT_PATH is set the CA cert is loaded into the TLS
//    RootCAs pool; otherwise the system CA bundle is used (Go default).
//  - Fail-closed: any error (transport, TLS, non-2xx status) surfaces as
//    (nil, error) — never fabricated response bodies.
//  - Env vars logged at DEBUG on startup for observability.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// browserUserAgent is the User-Agent string sent when VpsFetchOptions.BrowserUA is true.
// Matches a common desktop browser to reduce bot-detection rejections from VN portals.
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// vpsHTTPHostDefault / vpsHTTPPortDefault are the Vinahost VPS Squid proxy coordinates.
// Override with env vars VPS_HTTP_HOST and VPS_HTTP_PORT if the proxy is relocated.
const (
	vpsHTTPHostDefault = "125.212.251.27"
	vpsHTTPPortDefault = "3128"
)

// VpsFetchAdapter implements domain.VpsFetchPort.
// Concrete adapter — routes every Fetch call through the configured VPS HTTP proxy.
// Instantiate via NewVpsFetchAdapter; pass to use-case constructors as VpsFetchPort.
type VpsFetchAdapter struct {
	vpsHost    string
	vpsPort    string
	caCertPath string
	logger     *slog.Logger
}

// NewVpsFetchAdapter reads VPS proxy configuration from environment variables and
// returns a ready-to-use VpsFetchAdapter.
//
// Env vars consumed (all optional — defaults printed at DEBUG level on startup):
//   - VPS_HTTP_HOST   (default 125.212.251.27)
//   - VPS_HTTP_PORT   (default 3128)
//   - VPS_CACERT_PATH (default ""; falls back to system CA bundle when empty)
func NewVpsFetchAdapter(logger *slog.Logger) *VpsFetchAdapter {
	host := os.Getenv("VPS_HTTP_HOST")
	if host == "" {
		host = vpsHTTPHostDefault
	}
	port := os.Getenv("VPS_HTTP_PORT")
	if port == "" {
		port = vpsHTTPPortDefault
	}
	caCertPath := os.Getenv("VPS_CACERT_PATH")

	logger.Debug("vpsFetch config",
		"vps_host", host,
		"vps_port", port,
		"cacert_path_set", caCertPath != "",
	)

	return &VpsFetchAdapter{
		vpsHost:    host,
		vpsPort:    port,
		caCertPath: caCertPath,
		logger:     logger,
	}
}

// Fetch retrieves targetURL via the configured VPS HTTP proxy.
//
// Behaviour:
//   - Builds a per-request http.Client with the proxy URL and TLS config.
//   - Applies opts.TimeoutSec as an additional client-level timeout (≥1s enforced;
//     the context deadline continues to govern if tighter).
//   - Sets browser User-Agent when opts.BrowserUA is true.
//   - Sets Accept header when opts.AcceptHeader is non-empty.
//   - Returns (nil, error) on any transport or TLS error (fail-closed).
//   - Returns (nil, error) for HTTP status codes outside 200–299.
//   - Returns (body, nil) on success.
func (v *VpsFetchAdapter) Fetch(
	ctx context.Context,
	targetURL string,
	opts domain.VpsFetchOptions,
) ([]byte, error) {
	// --- build TLS config ---
	tlsCfg, err := v.buildTLSConfig()
	if err != nil {
		return nil, fmt.Errorf("vpsFetch: build TLS config: %w", err)
	}

	// --- build proxy transport ---
	proxyURL, err := url.Parse(fmt.Sprintf("http://%s:%s", v.vpsHost, v.vpsPort))
	if err != nil {
		return nil, fmt.Errorf("vpsFetch: parse proxy URL: %w", err)
	}

	transport := &http.Transport{
		Proxy:           http.ProxyURL(proxyURL),
		TLSClientConfig: tlsCfg,
	}

	// --- per-request timeout (in addition to the context deadline) ---
	timeout := time.Duration(opts.TimeoutSec) * time.Second
	if timeout < time.Second {
		// 0 or negative = use a safe minimum so callers cannot accidentally set
		// an unbounded timeout; context deadline remains the outer bound.
		timeout = 30 * time.Second
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	// --- build request ---
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("vpsFetch: build request: %w", err)
	}

	if opts.BrowserUA {
		req.Header.Set("User-Agent", browserUserAgent)
	}
	if opts.AcceptHeader != "" {
		req.Header.Set("Accept", opts.AcceptHeader)
	}

	v.logger.Debug("vpsFetch: outbound request",
		"url", targetURL,
		"proxy", proxyURL.Host,
		"timeout_sec", timeout.Seconds(),
	)

	// --- execute ---
	resp, err := client.Do(req)
	if err != nil {
		// Fail-closed: transport/TLS errors are always surfaced.
		return nil, fmt.Errorf("vpsFetch: request to %s via proxy %s:%s: %w",
			targetURL, v.vpsHost, v.vpsPort, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("vpsFetch: %s returned HTTP %d", targetURL, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("vpsFetch: read response body from %s: %w", targetURL, err)
	}

	v.logger.Debug("vpsFetch: response",
		"url", targetURL,
		"status", resp.StatusCode,
		"bytes", len(body),
	)

	return body, nil
}

// buildTLSConfig creates a *tls.Config appropriate for the current CA cert setting.
//
// TLS hardening (project_bctc_hnx_ssl_outage):
//   - InsecureSkipVerify is ALWAYS false — never skip certificate validation.
//   - If VPS_CACERT_PATH is set, the PEM file is loaded and appended to the
//     system CA pool so the VPS proxy's self-signed cert is trusted without
//     disabling verification globally.
//   - If VPS_CACERT_PATH is empty, the system CA bundle is used (Go default).
func (v *VpsFetchAdapter) buildTLSConfig() (*tls.Config, error) {
	cfg := &tls.Config{
		InsecureSkipVerify: false, //nolint:gosec // explicitly false — this is the hardening line
	}

	if v.caCertPath == "" {
		// System CA bundle — Go default, no extra configuration needed.
		return cfg, nil
	}

	pem, err := os.ReadFile(v.caCertPath)
	if err != nil {
		return nil, fmt.Errorf("read CA cert %s: %w", v.caCertPath, err)
	}

	pool, err := x509.SystemCertPool()
	if err != nil {
		// SystemCertPool can fail on some platforms; start with an empty pool.
		pool = x509.NewCertPool()
	}

	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("CA cert file %s: no valid PEM blocks found", v.caCertPath)
	}

	cfg.RootCAs = pool
	return cfg, nil
}
