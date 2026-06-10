package fetcher_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"testing"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
)

func newsAPIResponseJSON(status string, articles []map[string]string) string {
	articlesJSON := "["
	for i, a := range articles {
		if i > 0 {
			articlesJSON += ","
		}
		articlesJSON += `{"title":"` + a["title"] + `","url":"` + a["url"] + `","publishedAt":"` + a["publishedAt"] + `","description":"` + a["description"] + `"}`
	}
	articlesJSON += "]"
	return `{"status":"` + status + `","articles":` + articlesJSON + `}`
}

// ─── Stub path ───────────────────────────────────────────────────────────────

func TestNewsAPIFetcher_StubPath_DisabledNoKey(t *testing.T) {
	f := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{
		APIKey:  "",
		Enabled: false,
	}, nil)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("stub path: unexpected error: %v", err)
	}
	if items != nil {
		t.Errorf("stub path: expected nil items, got %v", items)
	}
}

func TestNewsAPIFetcher_StubPath_EnabledButNoKey(t *testing.T) {
	f := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{
		APIKey:  "",
		Enabled: true,
	}, nil)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if items != nil {
		t.Errorf("expected nil (stub), got %v", items)
	}
}

// ─── Live-like path (mocked HTTP) ────────────────────────────────────────────

type singleResponseClient struct {
	body   string
	status int
}

func (c *singleResponseClient) Do(_ *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: c.status,
		Body:       io.NopCloser(bytes.NewBufferString(c.body)),
	}, nil
}

func TestNewsAPIFetcher_ReturnsArticles(t *testing.T) {
	articles := []map[string]string{
		{"title": "Vietnam GDP grows 7%", "url": "https://newsapi.example/1", "publishedAt": "2026-06-10T08:00:00Z", "description": ""},
		{"title": "VN-Index hits 1300", "url": "https://newsapi.example/2", "publishedAt": "2026-06-10T09:00:00Z", "description": ""},
	}
	body := newsAPIResponseJSON("ok", articles)

	client := &singleResponseClient{body: body, status: 200}
	f := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{APIKey: "testkey", Enabled: true}, client)

	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].Source != "newsapi" {
		t.Errorf("expected source=newsapi, got %q", items[0].Source)
	}
	if items[0].Title != "Vietnam GDP grows 7%" {
		t.Errorf("unexpected title: %q", items[0].Title)
	}
	if items[0].ID == "" {
		t.Error("expected non-empty ID")
	}
}

func TestNewsAPIFetcher_APIStatusError(t *testing.T) {
	body := newsAPIResponseJSON("error", nil)
	client := &singleResponseClient{body: body, status: 200}
	f := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{APIKey: "testkey", Enabled: true}, client)

	_, err := f.Fetch(context.Background())
	if err == nil {
		t.Error("expected error for API status=error, got nil")
	}
}

func TestNewsAPIFetcher_HTTP429(t *testing.T) {
	client := &singleResponseClient{body: "", status: 429}
	f := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{APIKey: "testkey", Enabled: true}, client)

	_, err := f.Fetch(context.Background())
	if err == nil {
		t.Error("expected error for HTTP 429, got nil")
	}
}
