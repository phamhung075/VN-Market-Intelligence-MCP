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
	got := ppr.ResolveProxyPath("/stock/health", svc.NoProbe)
	want := "/health"
	if got != want {
		t.Errorf("ResolveProxyPath /stock/health: got %s, want %s", got, want)
	}
}

func TestProxyPath_VirtualAlias_FullPath(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "api", NoProbe: true}
	got := ppr.ResolveProxyPath("/api/push-news", svc.NoProbe)
	want := "/api/push-news"
	if got != want {
		t.Errorf("ResolveProxyPath /api/push-news: got %s, want %s", got, want)
	}
}

func TestProxyPath_MultiSegment(t *testing.T) {
	svc := &domain.ServiceConfig{Name: "macro", NoProbe: false}
	got := ppr.ResolveProxyPath("/macro/indicators", svc.NoProbe)
	want := "/indicators"
	if got != want {
		t.Errorf("ResolveProxyPath /macro/indicators: got %s, want %s", got, want)
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
