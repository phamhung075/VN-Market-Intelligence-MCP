// Tests for StaticServiceRegistry — mirrors static-service-registry.test.ts
package infrastructure_test

import (
	"sort"
	"testing"

	"github.com/vn-market-intelligence/api-gateway/pkg/infrastructure"
)

func TestStaticServiceRegistry_Returns9Services(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	services := reg.GetAllServices()
	if len(services) != 9 {
		t.Errorf("expected 9 services (excluding 'api' virtual), got %d", len(services))
	}
}

func TestStaticServiceRegistry_ServiceNames(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	names := make([]string, 0)
	for _, s := range reg.GetAllServices() {
		names = append(names, s.Name)
	}
	sort.Strings(names)

	want := []string{"alert", "kinh-dich", "macro", "mcp", "news", "pdf", "rag", "stock", "ta"}
	if len(names) != len(want) {
		t.Fatalf("expected names %v, got %v", want, names)
	}
	for i, n := range names {
		if n != want[i] {
			t.Errorf("name[%d]: expected %s, got %s", i, want[i], n)
		}
	}
}

func TestStaticServiceRegistry_CustomURLs(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"mcp": "http://localhost:3000",
		"ta":  "http://localhost:5003",
	})

	mcp := reg.GetService("mcp")
	if mcp == nil {
		t.Fatal("expected mcp service")
	}
	if mcp.BaseURL != "http://localhost:3000" {
		t.Errorf("expected http://localhost:3000, got %s", mcp.BaseURL)
	}

	ta := reg.GetService("ta")
	if ta == nil {
		t.Fatal("expected ta service")
	}
	if ta.BaseURL != "http://localhost:5003" {
		t.Errorf("expected http://localhost:5003, got %s", ta.BaseURL)
	}
}

func TestStaticServiceRegistry_DefaultDockerURLs(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	pdf := reg.GetService("pdf")
	if pdf == nil {
		t.Fatal("expected pdf service")
	}
	if pdf.BaseURL != "http://pdf-extractor:5001" {
		t.Errorf("expected default docker URL, got %s", pdf.BaseURL)
	}
}

func TestStaticServiceRegistry_UnknownService(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	if reg.GetService("nonexistent") != nil {
		t.Error("expected nil for unknown service")
	}
}

func TestStaticServiceRegistry_AllHave2000msTimeout(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{})
	for _, svc := range reg.GetAllServices() {
		if svc.TimeoutMs != 2000 {
			t.Errorf("service %s: expected 2000ms timeout, got %d", svc.Name, svc.TimeoutMs)
		}
	}
}

func TestStaticServiceRegistry_ApiVirtualExcludedFromProbes(t *testing.T) {
	reg := infrastructure.NewStaticServiceRegistry(map[string]string{
		"api": "http://mcp-server:3000",
	})
	// api must be accessible via GetService
	apiSvc := reg.GetService("api")
	if apiSvc == nil {
		t.Fatal("expected api virtual service to exist")
	}
	if !apiSvc.NoProbe {
		t.Error("api virtual service must have NoProbe=true")
	}
	// api must NOT appear in GetAllServices (health probe list)
	for _, s := range reg.GetAllServices() {
		if s.Name == "api" {
			t.Error("api virtual service must be excluded from GetAllServices()")
		}
	}
}
