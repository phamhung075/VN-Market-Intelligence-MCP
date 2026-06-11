// Tests for HTTP handlers — mirrors 1841a-health-dashboard.test.ts and 1892b-api-push-routes.test.ts
package http_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/application"
	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
	httphandler "github.com/vn-market-intelligence/api-gateway/pkg/interface/http"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
)

// ── Fixtures ─────────────────────────────────────────────────────────────────

var fixedHealth = &domain.AggregatedHealth{
	Status: domain.StatusOk,
	Services: map[string]domain.HealthStatus{
		"mcp": domain.StatusOk, "pdf": domain.StatusOk, "rag": domain.StatusOk,
		"ta": domain.StatusOk, "macro": domain.StatusOk, "stock": domain.StatusOk,
		"kinh-dich": domain.StatusOk, "alert": domain.StatusOk, "news": domain.StatusOk,
	},
	Latencies: map[string]int64{
		"mcp": 42, "pdf": 55, "rag": 33, "ta": 60,
		"macro": 70, "stock": 45, "kinh-dich": 80, "alert": 38, "news": 25,
	},
	CheckedAt: "2026-05-03T10:00:00.000Z",
}

var degradedHealth = &domain.AggregatedHealth{
	Status: domain.StatusDegraded,
	Services: map[string]domain.HealthStatus{
		"mcp": domain.StatusOk, "pdf": domain.StatusDown, "rag": domain.StatusDown,
		"ta": domain.StatusOk, "macro": domain.StatusOk, "stock": domain.StatusOk,
		"kinh-dich": domain.StatusOk, "alert": domain.StatusOk, "news": domain.StatusOk,
	},
	Latencies: map[string]int64{
		"mcp": 42, "pdf": -1, "rag": -1, "ta": 60,
		"macro": 70, "stock": 45, "kinh-dich": 80, "alert": 38, "news": 25,
	},
	CheckedAt: "2026-05-03T10:01:00.000Z",
}

// ── Mock use cases ────────────────────────────────────────────────────────────

type mockAggregateHealthService struct {
	health *domain.AggregatedHealth
}

func (m *mockAggregateHealthService) Aggregate(_ context.Context) (*domain.AggregatedHealth, error) {
	return m.health, nil
}

type mockHealthCheckerForUC struct {
	result *domain.ServiceHealthResult
}

func (m *mockHealthCheckerForUC) CheckHealth(_ context.Context, svc *domain.ServiceConfig) (*domain.ServiceHealthResult, error) {
	if m.result != nil {
		return m.result, nil
	}
	return &domain.ServiceHealthResult{Service: svc.Name, Status: domain.StatusOk, LatencyMs: 10}, nil
}

// ── Helper: build handler set with fixed health ───────────────────────────────

func buildHandlers(health *domain.AggregatedHealth) (*httphandler.GatewayHandlers, domain.ServiceRegistryPort) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"mcp":         "http://mcp-server:3000",
		"pdf":         "http://pdf-extractor:5001",
		"rag":         "http://rag-service:5002",
		"ta":          "http://technical-analysis:5003",
		"macro":       "http://macro-indicators:5004",
		"stock":       "http://stock-price:5000",
		"kinh-dich":   "http://kinh-dich-service:5005",
		"alert":       "http://alert-engine:5006",
		"news":        "http://news-fetch:5008",
		"api":         "http://mcp-server:3000",
	})

	mockSvc := &mockAggregateHealthService{health: health}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)

	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)

	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	return handlers, reg
}

func buildRouter(health *domain.AggregatedHealth) http.Handler {
	handlers, _ := buildHandlers(health)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return httphandler.NewRouter(handlers, logger)
}

// ── Dashboard tests (mirrors 1841a-health-dashboard.test.ts) ─────────────────

func TestDashboard_Returns200HTML(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Errorf("expected text/html content-type, got %s", ct)
	}
}

func TestDashboard_ContainsTitle(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, "<title>VN Market Intelligence") {
		t.Error("expected page title in response")
	}
}

func TestDashboard_ContainsAllServiceNames(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	names := []string{"mcp", "pdf", "rag", "ta", "macro", "stock", "kinh-dich", "alert", "news"}
	for _, name := range names {
		if !strings.Contains(body, name) {
			t.Errorf("expected service name %s in dashboard", name)
		}
	}
}

func TestDashboard_AllOk_ShowsStatusUp(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, `class="card status-up"`) {
		t.Error("expected status-up class for ok services")
	}
	if strings.Contains(body, `class="card status-down"`) {
		t.Error("did not expect status-down class when all services are ok")
	}
}

func TestDashboard_Degraded_ShowsBothClasses(t *testing.T) {
	router := buildRouter(degradedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, `class="card status-up"`) {
		t.Error("expected status-up class for ok services")
	}
	if !strings.Contains(body, `class="card status-down"`) {
		t.Error("expected status-down class for down services")
	}
}

func TestDashboard_MetaRefresh60(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, `http-equiv="refresh"`) {
		t.Error("expected http-equiv=refresh")
	}
	if !strings.Contains(body, `content="60"`) {
		t.Error("expected content=60 on meta refresh")
	}
}

func TestDashboard_SelfContained_NoCDN(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	// Extract link and script tags and check no external URLs
	lines := strings.Split(body, "\n")
	for _, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "<link") || strings.Contains(lower, "<script") {
			if strings.Contains(lower, "http://") || strings.Contains(lower, "https://") {
				t.Errorf("found external URL in link/script tag: %s", line)
			}
		}
	}
}

func TestDashboard_PlaceholderSections(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health-dashboard", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	body := rec.Body.String()
	for _, id := range []string{`id="signals"`, `id="prediction"`, `id="alerts"`} {
		if !strings.Contains(body, id) {
			t.Errorf("expected section %s in dashboard", id)
		}
	}
	if !strings.Contains(body, "N/A — MCP data not wired in this sprint") {
		t.Error("expected placeholder text in dashboard")
	}
}

// ── BuildDashboardHTML unit tests ─────────────────────────────────────────────

func TestBuildDashboardHTML_UPBadge(t *testing.T) {
	html := httphandler.BuildDashboardHTML(fixedHealth)
	if !strings.Contains(html, ">UP<") {
		t.Error("expected UP badge for ok services")
	}
	if strings.Contains(html, ">DOWN<") {
		t.Error("did not expect DOWN badge when all services ok")
	}
}

func TestBuildDashboardHTML_DOWNBadge(t *testing.T) {
	html := httphandler.BuildDashboardHTML(degradedHealth)
	if !strings.Contains(html, ">UP<") {
		t.Error("expected UP badge")
	}
	if !strings.Contains(html, ">DOWN<") {
		t.Error("expected DOWN badge for down services")
	}
}

func TestBuildDashboardHTML_CheckedAt(t *testing.T) {
	html := httphandler.BuildDashboardHTML(fixedHealth)
	if !strings.Contains(html, fixedHealth.CheckedAt) {
		t.Error("expected checkedAt timestamp in HTML")
	}
}

func TestBuildDashboardHTML_LatencyMs(t *testing.T) {
	html := httphandler.BuildDashboardHTML(fixedHealth)
	if !strings.Contains(html, "42 ms") {
		t.Error("expected 42 ms latency for mcp service")
	}
}

func TestBuildDashboardHTML_LatencyNA(t *testing.T) {
	html := httphandler.BuildDashboardHTML(degradedHealth)
	if !strings.Contains(html, "N/A") {
		t.Error("expected N/A for down services (latency=-1)")
	}
}

// ── Health endpoint JSON tests ────────────────────────────────────────────────

func TestHealth_Returns200WhenOk(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestHealth_Returns503WhenDown(t *testing.T) {
	downHealth := &domain.AggregatedHealth{
		Status:    domain.StatusDown,
		Services:  map[string]domain.HealthStatus{"mcp": domain.StatusDown},
		Latencies: map[string]int64{"mcp": -1},
		CheckedAt: "2026-05-03T10:00:00.000Z",
	}
	router := buildRouter(downHealth)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

func TestHealth_JSONShape(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	for _, key := range []string{"status", "services", "latencies", "checkedAt"} {
		if _, ok := result[key]; !ok {
			t.Errorf("expected JSON key %s", key)
		}
	}
}

func TestHealthz_IsAliasToHealth(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("/healthz expected 200, got %d", rec.Code)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode /healthz JSON: %v", err)
	}
	if _, ok := result["status"]; !ok {
		t.Error("/healthz must return same JSON shape as /health")
	}
}

// ── /health/:service endpoint tests ──────────────────────────────────────────

func TestServiceHealth_KnownService_200(t *testing.T) {
	handlers, _ := buildHandlers(fixedHealth)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/health/mcp", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	// The mock checker returns ok for known services
	if rec.Code != http.StatusOK && rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 200 or 503 for known service, got %d", rec.Code)
	}
}

func TestServiceHealth_UnknownService_404(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodGet, "/health/nonexistent", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown service, got %d", rec.Code)
	}
	var result map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if !strings.Contains(result["error"], "Unknown service: nonexistent") {
		t.Errorf("expected Unknown service error, got %s", result["error"])
	}
}

// ── Proxy path helper tests (delegated to primitive) ─────────────────────────
// ProxyPath was extracted from handlers.go to pkg/primitive/proxy-path-resolver.
// These tests are kept here for integration coverage and now call the primitive
// directly via the ppr import. Exhaustive unit tests live in the primitive package.

func TestProxyPath_RealService_StripPrefix(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "stock", NoProbe: false}
	got := ppr.ResolveProxyPath("/stock/health", svc.NoProbe || svc.PreservePath)
	want := "/health"
	if got != want {
		t.Errorf("ResolveProxyPath /stock/health: got %s, want %s", got, want)
	}
}

func TestProxyPath_VirtualAlias_FullPath(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "api", NoProbe: true}
	got := ppr.ResolveProxyPath("/api/push-news", svc.NoProbe || svc.PreservePath)
	want := "/api/push-news"
	if got != want {
		t.Errorf("ResolveProxyPath /api/push-news: got %s, want %s", got, want)
	}
}

func TestProxyPath_MultiSegment(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "macro", NoProbe: false}
	got := ppr.ResolveProxyPath("/macro/indicators", svc.NoProbe || svc.PreservePath)
	want := "/indicators"
	if got != want {
		t.Errorf("ResolveProxyPath /macro/indicators: got %s, want %s", got, want)
	}
}

// TestProxyPath_TA_PreservePath is the F2 regression test.
// ta has PreservePath=true — the gateway must forward /ta/indicators verbatim.
func TestProxyPath_TA_PreservePath(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "ta", NoProbe: false, PreservePath: true}
	got := ppr.ResolveProxyPath("/ta/indicators", svc.NoProbe || svc.PreservePath)
	want := "/ta/indicators"
	if got != want {
		t.Errorf("F2 regression: ResolveProxyPath /ta/indicators with PreservePath: got %s, want %s", got, want)
	}
}

// ── Proxy routing tests (mirrors 1892b-api-push-routes.test.ts) ──────────────
// These use a real httptest.Server to simulate upstream services.

func TestProxy_ApiPushNews_VerbatimPath(t *testing.T) {
	var capturedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"api": upstream.URL,
		"mcp": upstream.URL,
	})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodPost, "/api/push-news", strings.NewReader(`{"ticker":"VNM"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if capturedPath != "/api/push-news" {
		t.Errorf("expected verbatim path /api/push-news, got %s", capturedPath)
	}
	if strings.Contains(capturedPath, "push-news") && !strings.HasPrefix(capturedPath, "/api/") {
		t.Error("path must NOT strip /api/ prefix")
	}
}

func TestProxy_StockHealth_StripsPrefix(t *testing.T) {
	var capturedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer upstream.Close()

	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"stock": upstream.URL,
	})
	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/stock/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if capturedPath != "/health" {
		t.Errorf("expected /health (prefix stripped), got %s", capturedPath)
	}
}

func TestProxy_UnknownService_404(t *testing.T) {
	router := buildRouter(fixedHealth)
	req := httptest.NewRequest(http.MethodPost, "/unknownservice/path", strings.NewReader("{}"))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown service, got %d", rec.Code)
	}
	var result map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if !strings.Contains(result["error"], "Unknown service") {
		t.Errorf("expected Unknown service error, got %s", result["error"])
	}
}

func TestProxy_UpstreamError_502(t *testing.T) {
	// No upstream server started — connection will be refused
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"stock": "http://localhost:19999", // nothing listening here
	})
	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/stock/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Errorf("expected 502 when upstream unreachable, got %d", rec.Code)
	}
	var result map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if !strings.Contains(result["error"], "Upstream stock unreachable") {
		t.Errorf("expected Upstream unreachable error, got %s", result["error"])
	}
}

// ── Not-deployed reroute tests ────────────────────────────────────────────────

// TestProxy_NotDeployed_KinhDich_ReroutesToMCP verifies that a request to a
// not-deployed service (kinh-dich) is transparently proxied to mcp-server
// at the rewritten path, NOT forwarded to the dead microservice.
func TestProxy_NotDeployed_KinhDich_ReroutesToMCP(t *testing.T) {
	var capturedPath string
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"hexagram":42}`))
	}))
	defer mcpUpstream.Close()

	// mcp points at the test upstream; kinh-dich is NOT in the URL map,
	// so it keeps its docker default (dead address) — but IsNotDeployed should
	// redirect it to mcp before any dial to kinh-dich happens.
	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": mcpUpstream.URL,
	}, []string{"kinh-dich", "stock", "ta", "news", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/kinh-dich/reading/FPT", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 from mcp upstream, got %d", rec.Code)
	}
	if capturedPath != "/mcp/api/kinh-dich/reading/FPT" {
		t.Errorf("expected mcp-server to receive /mcp/api/kinh-dich/reading/FPT, got %q", capturedPath)
	}
}

// TestProxy_NotDeployed_Stock_PriceHistory_ReroutesToMCP verifies stock/price/history
// is rerouted to /mcp/api/prices/history with query preserved.
func TestProxy_NotDeployed_Stock_PriceHistory_ReroutesToMCP(t *testing.T) {
	var capturedPath, capturedQuery string
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"history":[]}`))
	}))
	defer mcpUpstream.Close()

	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": mcpUpstream.URL,
	}, []string{"stock", "kinh-dich", "ta", "news", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/stock/price/history?code=VNINDEX&days=30", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if capturedPath != "/mcp/api/prices/history" {
		t.Errorf("expected /mcp/api/prices/history, got %q", capturedPath)
	}
	if capturedQuery != "code=VNINDEX&days=30" {
		t.Errorf("expected query code=VNINDEX&days=30, got %q", capturedQuery)
	}
}

// TestProxy_NotDeployed_News_Reuters_ReroutesToMCP verifies news/reuters/headlines
// is rerouted to /mcp/api/news/headlines?source=reuters.
func TestProxy_NotDeployed_News_Reuters_ReroutesToMCP(t *testing.T) {
	var capturedPath, capturedQuery string
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"articles":[]}`))
	}))
	defer mcpUpstream.Close()

	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": mcpUpstream.URL,
	}, []string{"news", "stock", "kinh-dich", "ta", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/news/reuters/headlines", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if capturedPath != "/mcp/api/news/headlines" {
		t.Errorf("expected /mcp/api/news/headlines, got %q", capturedPath)
	}
	if capturedQuery != "source=reuters" {
		t.Errorf("expected source=reuters query, got %q", capturedQuery)
	}
}

// TestProxy_NotDeployed_TA_NoMapping_Returns503 verifies that a not-deployed service
// with NO mcp fallback (ta) returns an honest 503, not a raw 502.
func TestProxy_NotDeployed_TA_NoMapping_Returns503(t *testing.T) {
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Should never be reached for ta with no mapping.
		w.WriteHeader(http.StatusOK)
	}))
	defer mcpUpstream.Close()

	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": mcpUpstream.URL,
	}, []string{"ta", "kinh-dich", "stock", "news", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodPost, "/ta/ta/indicators", strings.NewReader(`{"code":"FPT"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 for ta (no mcp fallback), got %d", rec.Code)
	}
	var body map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("expected JSON body: %v", err)
	}
	if body["error"] != "not_deployed" {
		t.Errorf("expected error=not_deployed, got %v", body["error"])
	}
	if body["service"] != "ta" {
		t.Errorf("expected service=ta, got %v", body["service"])
	}
}

// ── Anti-regression: deployed service paths must NOT be rerouted ──────────────

// TestProxy_DeployedMacro_NotRerouted verifies that a DEPLOYED service (macro)
// is proxied directly to its own upstream, NOT through the not-deployed rerouter.
// This is the key anti-regression: rerouting must be SSOT-driven, not hardcoded.
func TestProxy_DeployedMacro_NotRerouted(t *testing.T) {
	var macroHit bool
	macroUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		macroHit = true
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"macro":"snapshot"}`))
	}))
	defer macroUpstream.Close()

	var mcpHit bool
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mcpHit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer mcpUpstream.Close()

	// macro is NOT in the not-deployed list → it must be routed directly.
	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"macro": macroUpstream.URL,
		"mcp":   mcpUpstream.URL,
	}, []string{"kinh-dich", "stock", "ta", "news", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/macro/snapshot", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if !macroHit {
		t.Error("macro upstream must be hit directly for deployed service")
	}
	if mcpHit {
		t.Error("mcp-server must NOT be hit for a deployed service (macro)")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

// TestProxy_TA_PreservesFullPath is the F2 regression test (TASK-17).
// Before fix: POST /ta/indicators → upstream received /indicators → upstream 404.
// After fix:  POST /ta/indicators → upstream receives /ta/indicators → upstream 200.
// The technical-analysis service registers routes at its own /ta/* prefix.
func TestProxy_TA_PreservesFullPath(t *testing.T) {
	var capturedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"rsi":62.5,"macd":0.12}`))
	}))
	defer upstream.Close()

	// ta is deployed (NOT in notDeployed list) → direct proxy with PreservePath=true.
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"ta": upstream.URL,
	})
	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodPost, "/ta/indicators", strings.NewReader(`{"code":"FPT"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("F2: expected 200, got %d", rec.Code)
	}
	if capturedPath != "/ta/indicators" {
		t.Errorf("F2: upstream must receive /ta/indicators (verbatim), got %q (was /indicators before fix)", capturedPath)
	}
}

// TestProxy_TA_OtherServices_StillStrip is an anti-regression check.
// Deploying PreservePath=true for ta must NOT affect other services (macro, stock, etc.)
// which still expect the /service prefix to be stripped.
func TestProxy_TA_OtherServices_StillStrip(t *testing.T) {
	var capturedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"snapshot":true}`))
	}))
	defer upstream.Close()

	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"macro": upstream.URL,
	})
	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/macro/snapshot", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("anti-regression: expected 200, got %d", rec.Code)
	}
	// macro does NOT have PreservePath — prefix must be stripped to /snapshot
	if capturedPath != "/snapshot" {
		t.Errorf("anti-regression: macro upstream must receive /snapshot (stripped), got %q", capturedPath)
	}
}

// TestProxy_MCP_VirtualAlias_NotRerouted verifies that /mcp/* virtual alias
// passes through normally (verbatim path, not intercepted by rerouter).
func TestProxy_MCP_VirtualAlias_NotRerouted(t *testing.T) {
	var capturedPath string
	mcpUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer mcpUpstream.Close()

	reg := infrastructure.NewStaticServiceRegistryWithNotDeployed(map[string]string{
		"mcp": mcpUpstream.URL,
		"api": mcpUpstream.URL,
	}, []string{"kinh-dich", "stock", "ta", "news", "pdf", "rag", "alert"})

	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	req := httptest.NewRequest(http.MethodGet, "/mcp/api/signals", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	// /mcp is NOT in not-deployed set → handled via normal proxy (path stripped to /api/signals)
	if capturedPath != "/api/signals" {
		t.Errorf("expected mcp upstream to receive /api/signals (prefix stripped), got %q", capturedPath)
	}
}

func TestProxy_AuthHeaderForwarded(t *testing.T) {
	var capturedAuth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer upstream.Close()

	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"api": upstream.URL,
	})
	mockSvc := &mockAggregateHealthService{health: fixedHealth}
	aggrUC := application.NewAggregateHealthUseCaseFromService(mockSvc)
	checker := &mockHealthCheckerForUC{}
	serviceUC := application.NewServiceHealthUseCase(reg, checker)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	handlers := httphandler.NewGatewayHandlers(aggrUC, serviceUC, reg, logger)
	router := httphandler.NewRouter(handlers, logger)

	const token = "Bearer secret-token-xyz"
	req := httptest.NewRequest(http.MethodPost, "/api/push-news", strings.NewReader(`{}`))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if capturedAuth != token {
		t.Errorf("expected Authorization header forwarded, got %q", capturedAuth)
	}
}

func TestProxy_ApiServiceExcludedFromHealthProbes(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"api": "http://mcp-server:3000",
	})
	apiSvc := reg.GetService("api")
	if apiSvc == nil {
		t.Fatal("expected api service to exist in registry")
	}
	if apiSvc.BaseURL != "http://mcp-server:3000" {
		t.Errorf("expected api baseURL=http://mcp-server:3000, got %s", apiSvc.BaseURL)
	}
	// api must NOT appear in health probe list
	for _, s := range reg.GetAllServices() {
		if s.Name == "api" {
			t.Error("api must be excluded from health probes")
		}
	}
}
