// Package http contains the HTTP interface layer for the api-gateway.
package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	ndr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/not-deployed-rerouter"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// newReverseProxy builds a *httputil.ReverseProxy targeting target, wiring errorWriter as the
// JSON error responder. Collapses the two near-identical reverse-proxy setup blocks into one.
func newReverseProxy(target *url.URL, errorWriter func(w http.ResponseWriter, err error)) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		errorWriter(w, err)
	}
	return proxy
}

// serveProxied also collapses the two near-identical timeout+serve blocks into one.
func serveProxied(proxy *httputil.ReverseProxy, w http.ResponseWriter, r2 *http.Request, overrideMs, timeoutMs int64) {
	effectiveMs := overrideMs
	if effectiveMs == 0 {
		effectiveMs = timeoutMs * 5
	}
	ctx := r2.Context()
	cancel := func() {}
	if effectiveMs > 0 {
		ctx, cancel = context.WithTimeout(ctx, time.Duration(effectiveMs)*time.Millisecond)
	}
	defer cancel()
	proxy.ServeHTTP(w, r2.WithContext(ctx))
}

// HandleProxy handles ANY /:service/* reverse proxy requests.
func (h *GatewayHandlers) HandleProxy(w http.ResponseWriter, r *http.Request) {
	serviceName := rsm.ExtractServiceName(r.URL.Path, "/")
	svc := h.registry.GetService(serviceName)
	if svc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("Unknown service: %s", serviceName)})
		return
	}

	// NOT_DEPLOYED re-route: SSOT notDeployedSet drives this; removing the service
	// from NOT_DEPLOYED_SERVICES restores direct routing without a code change.
	if h.registry.IsNotDeployed(serviceName) {
		reroutedPath, hasMapping := ndr.Reroute(r.URL.Path, r.URL.RawQuery, serviceName)
		if !hasMapping {
			// No mcp-server fallback for this service — honest 503.
			writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
				"error": "not_deployed", "service": serviceName,
				"detail": fmt.Sprintf("Service %q is not deployed on this host and has no mcp-server alternative", serviceName),
			})
			return
		}
		mcpSvc := h.registry.GetService("mcp")
		if mcpSvc == nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "mcp-server not configured — cannot reroute"})
			return
		}
		mcpBase, err := url.Parse(mcpSvc.BaseURL)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("mcp-server URL invalid: %s", err.Error())})
			return
		}
		h.logger.Info("not-deployed reroute", "service", serviceName, "original_path", r.URL.Path, "rerouted_path", reroutedPath)
		proxy := newReverseProxy(mcpBase, func(w http.ResponseWriter, err error) {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("mcp-server unreachable during reroute for %s: %s", serviceName, err.Error())})
		})

		r2 := r.Clone(r.Context())
		r2.URL.Scheme = mcpBase.Scheme
		r2.URL.Host = mcpBase.Host
		// reroutedPath already contains the query string — don't re-append r.URL.RawQuery.
		if idx := strings.IndexByte(reroutedPath, '?'); idx >= 0 {
			r2.URL.Path = reroutedPath[:idx]
			r2.URL.RawQuery = reroutedPath[idx+1:]
		} else {
			r2.URL.Path = reroutedPath
			r2.URL.RawQuery = ""
		}
		r2.Host = mcpBase.Host

		serveProxied(proxy, w, r2, mcpSvc.ProxyTimeoutMs, mcpSvc.TimeoutMs)
		return
	}

	targetBase, err := url.Parse(svc.BaseURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("Upstream %s unreachable: %s", serviceName, err.Error())})
		return
	}

	// verbatim=true when the service is a virtual alias (NoProbe) OR the upstream
	// registers routes under its own prefix (PreservePath).
	downstreamPath := ppr.ResolveProxyPath(r.URL.Path, svc.NoProbe || svc.PreservePath)

	proxy := newReverseProxy(targetBase, func(w http.ResponseWriter, err error) {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("Upstream %s unreachable: %s", serviceName, err.Error())})
	})

	r2 := r.Clone(r.Context())
	r2.URL.Scheme = targetBase.Scheme
	r2.URL.Host = targetBase.Host
	r2.URL.Path = downstreamPath
	r2.Host = targetBase.Host

	serveProxied(proxy, w, r2, svc.ProxyTimeoutMs, svc.TimeoutMs)
}
