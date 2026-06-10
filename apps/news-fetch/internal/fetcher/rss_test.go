package fetcher_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
)

// mockHTTPClient implements fetcher.HTTPClient using an in-memory response map.
type mockHTTPClient struct {
	responses map[string]*http.Response
	errors    map[string]error
}

func newMockClient() *mockHTTPClient {
	return &mockHTTPClient{
		responses: map[string]*http.Response{},
		errors:    map[string]error{},
	}
}

func (m *mockHTTPClient) Do(req *http.Request) (*http.Response, error) {
	u := req.URL.String()
	if err, ok := m.errors[u]; ok {
		return nil, err
	}
	if resp, ok := m.responses[u]; ok {
		return resp, nil
	}
	// Default: 200 with empty RSS
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(minimalRSS(""))),
	}, nil
}

func (m *mockHTTPClient) setResponse(url, body string) {
	m.responses[url] = &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewBufferString(body)),
	}
}

func (m *mockHTTPClient) setError(url string, status int) {
	m.responses[url] = &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader("")),
	}
}

// minimalRSS builds a minimal RSS 2.0 feed with one optional <item>.
func minimalRSS(item string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>` + item + `</channel></rss>`
}

func rssItem(title, link, pubDate string) string {
	return `<item><title>` + title + `</title><link>` + link + `</link><pubDate>` + pubDate + `</pubDate></item>`
}

// ─── VnEconomy tests ─────────────────────────────────────────────────────────

func TestVnEconomyFetcher_ReturnsItems(t *testing.T) {
	client := newMockClient()
	client.setResponse(
		"https://vneconomy.vn/chung-khoan.rss",
		minimalRSS(rssItem("Cổ phiếu VNM tăng mạnh", "https://vneconomy.vn/vnm.htm", "Mon, 09 Jun 2026 10:00:00 +0700")),
	)
	client.setResponse(
		"https://vneconomy.vn/tai-chinh.rss",
		minimalRSS(rssItem("Lãi suất ngân hàng giảm", "https://vneconomy.vn/ls.htm", "Mon, 09 Jun 2026 11:00:00 +0700")),
	)

	f := fetcher.NewVnEconomyFetcher(client, 10)
	items, err := f.Fetch(context.Background())

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].Source != "vneconomy" {
		t.Errorf("expected source=vneconomy, got %q", items[0].Source)
	}
	if items[0].Title != "Cổ phiếu VNM tăng mạnh" {
		t.Errorf("unexpected title: %q", items[0].Title)
	}
	if items[0].ID == "" {
		t.Error("expected non-empty ID")
	}
}

func TestVnEconomyFetcher_DedupsAcrossFeeds(t *testing.T) {
	sameURL := "https://vneconomy.vn/shared.htm"
	sameTitle := "Shared Article"

	client := newMockClient()
	client.setResponse(
		"https://vneconomy.vn/chung-khoan.rss",
		minimalRSS(rssItem(sameTitle, sameURL, "")),
	)
	client.setResponse(
		"https://vneconomy.vn/tai-chinh.rss",
		minimalRSS(rssItem(sameTitle, sameURL, "")),
	)

	f := fetcher.NewVnEconomyFetcher(client, 10)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 deduplicated item, got %d", len(items))
	}
}

func TestVnEconomyFetcher_HTTPError_ContinuesToNextFeed(t *testing.T) {
	client := newMockClient()
	client.setError("https://vneconomy.vn/chung-khoan.rss", 503)
	client.setResponse(
		"https://vneconomy.vn/tai-chinh.rss",
		minimalRSS(rssItem("Finance news", "https://vneconomy.vn/fin.htm", "")),
	)

	f := fetcher.NewVnEconomyFetcher(client, 10)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should still return items from the second feed
	if len(items) != 1 {
		t.Errorf("expected 1 item from second feed, got %d", len(items))
	}
}

func TestVnEconomyFetcher_EmptyFeed(t *testing.T) {
	client := newMockClient()
	client.setResponse("https://vneconomy.vn/chung-khoan.rss", minimalRSS(""))
	client.setResponse("https://vneconomy.vn/tai-chinh.rss", minimalRSS(""))

	f := fetcher.NewVnEconomyFetcher(client, 10)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items, got %d", len(items))
	}
}

// ─── VnExpress tests ─────────────────────────────────────────────────────────

func TestVnExpressFetcher_ReturnsItems(t *testing.T) {
	client := newMockClient()
	client.setResponse(
		"https://vnexpress.net/rss/kinh-doanh.rss",
		minimalRSS(rssItem("Thị trường chứng khoán hôm nay", "https://vnexpress.net/ck.htm", "Tue, 10 Jun 2026 08:00:00 +0700")),
	)

	f := fetcher.NewVnExpressFetcher(client, 10)
	items, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Source != "vnexpress" {
		t.Errorf("expected source=vnexpress, got %q", items[0].Source)
	}
	if items[0].PublishedAt == "" {
		t.Error("expected non-empty publishedAt")
	}
}

func TestVnExpressFetcher_HTTP503Error(t *testing.T) {
	client := newMockClient()
	client.setError("https://vnexpress.net/rss/kinh-doanh.rss", 503)

	f := fetcher.NewVnExpressFetcher(client, 10)
	_, err := f.Fetch(context.Background())
	if err == nil {
		t.Error("expected error on HTTP 503, got nil")
	}
}

func TestVnExpressFetcher_MaxItemsRespected(t *testing.T) {
	items := ""
	for i := 0; i < 5; i++ {
		items += rssItem("title", "https://vnexpress.net/art"+string(rune('0'+i))+".htm", "")
	}
	client := newMockClient()
	client.setResponse("https://vnexpress.net/rss/kinh-doanh.rss", minimalRSS(items))

	f := fetcher.NewVnExpressFetcher(client, 3)
	result, err := f.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 3 {
		t.Errorf("expected 3 items (maxItems=3), got %d", len(result))
	}
}

// ─── dedupKey + normalizeRFC exported via test hooks ─────────────────────────

func TestDedupKey_URLPrimary(t *testing.T) {
	// Two items with same URL must get same ID regardless of title
	id1 := fetcher.TestDedupKey("https://example.com/a", "Title A", "src")
	id2 := fetcher.TestDedupKey("https://example.com/a", "Title B", "src")
	if id1 != id2 {
		t.Errorf("same URL must produce same ID: %q != %q", id1, id2)
	}
}

func TestDedupKey_TitleFallback(t *testing.T) {
	// Empty URL → falls back to source:title
	id1 := fetcher.TestDedupKey("", "Title A", "vneconomy")
	id2 := fetcher.TestDedupKey("", "Title A", "vneconomy")
	id3 := fetcher.TestDedupKey("", "Title B", "vneconomy")
	if id1 != id2 {
		t.Errorf("same source+title must produce same ID: %q != %q", id1, id2)
	}
	if id1 == id3 {
		t.Error("different titles must produce different IDs")
	}
}

func TestNormalizeRFC_RFC822(t *testing.T) {
	cases := []struct {
		raw  string
		want string // non-empty = must parse; "empty" = must return ""
	}{
		{"Mon, 02 Jan 2006 15:04:05 -0700", "2006-01-02T22:04:05Z"},
		{"", ""},
		{"not-a-date", ""},
	}
	for _, c := range cases {
		got := fetcher.TestNormalizeRFC(c.raw)
		if c.want == "" {
			if got != "" {
				t.Errorf("normalizeRFC(%q) = %q, want empty", c.raw, got)
			}
		} else {
			if got != c.want {
				t.Errorf("normalizeRFC(%q) = %q, want %q", c.raw, got, c.want)
			}
		}
	}
}
