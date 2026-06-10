package fetcher_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"testing"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
)

func vpsJSON(items []map[string]string) string {
	s := "["
	for i, it := range items {
		if i > 0 {
			s += ","
		}
		s += `{"title":"` + it["title"] + `","url":"` + it["url"] + `","published_at":"` + it["published_at"] + `","source":"` + it["source"] + `"}`
	}
	s += "]"
	return s
}

type vpsClient struct {
	body   string
	status int
}

func (c *vpsClient) Do(_ *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: c.status,
		Body:       io.NopCloser(bytes.NewBufferString(c.body)),
	}, nil
}

// ─── Stub path ───────────────────────────────────────────────────────────────

func TestVPSProxyFetcher_StubPath_EmptyHost(t *testing.T) {
	f := fetcher.NewVPSProxyFetcher("", nil)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("stub path: unexpected error: %v", err)
	}
	if items != nil {
		t.Errorf("stub path: expected nil items, got %v", items)
	}
}

// ─── Live-like path ───────────────────────────────────────────────────────────

func TestVPSProxyFetcher_ReturnsItems(t *testing.T) {
	payload := vpsJSON([]map[string]string{
		{"title": "VnExpress via VPS", "url": "https://vnexpress.net/vps-art.htm", "published_at": "2026-06-10T07:00:00Z", "source": "vnexpress"},
	})
	client := &vpsClient{body: payload, status: 200}

	f := fetcher.NewVPSProxyFetcher("http://125.212.251.27:8765", client)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Title != "VnExpress via VPS" {
		t.Errorf("unexpected title: %q", items[0].Title)
	}
	if items[0].Source != "vnexpress" {
		t.Errorf("expected source=vnexpress (from payload), got %q", items[0].Source)
	}
	if items[0].ID == "" {
		t.Error("expected non-empty ID")
	}
}

func TestVPSProxyFetcher_EmptySourceFallback(t *testing.T) {
	// When VPS item has no source field, it should default to "vps_proxy"
	payload := vpsJSON([]map[string]string{
		{"title": "Unknown source item", "url": "https://example.com/art.htm", "published_at": "", "source": ""},
	})
	client := &vpsClient{body: payload, status: 200}

	f := fetcher.NewVPSProxyFetcher("http://vps-host:8765", client)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Source != "vps_proxy" {
		t.Errorf("expected source=vps_proxy fallback, got %q", items[0].Source)
	}
}

func TestVPSProxyFetcher_HTTP502(t *testing.T) {
	client := &vpsClient{body: "", status: 502}
	f := fetcher.NewVPSProxyFetcher("http://vps-host:8765", client)

	_, err := f.Fetch(context.Background())
	if err == nil {
		t.Error("expected error for HTTP 502, got nil")
	}
}

func TestVPSProxyFetcher_EmptyArray(t *testing.T) {
	client := &vpsClient{body: "[]", status: 200}
	f := fetcher.NewVPSProxyFetcher("http://vps-host:8765", client)

	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items, got %d", len(items))
	}
}
