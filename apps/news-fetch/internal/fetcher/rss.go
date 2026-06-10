// Package fetcher — RSS feed fetchers for vneconomy-rss and vnexpress-rss.
//
// Both sources are Vietnamese financial news portals. Each scraper:
//   1. HTTP GET the RSS feed URL with a browser User-Agent (Vietnamese sites
//      block bot UAs with 503 — see dev-standards.md).
//   2. Parses RSS 2.0 XML using stdlib encoding/xml.
//   3. Returns []RssItem ready for the store layer.
//
// No external dependencies beyond stdlib and the store package.
// CGO_ENABLED=0 compatible.
package fetcher

import (
	"context"
	"crypto/sha256"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// RssItem is a parsed RSS article shared across all feed sources.
type RssItem struct {
	// ID is a deterministic dedup key (hex prefix of SHA-256 of URL or title).
	ID string
	// Title is the raw headline text.
	Title string
	// URL is the article link (may be empty when the feed omits it).
	URL string
	// PublishedAt is the RFC-3339 publish timestamp (empty when absent or unparseable).
	PublishedAt string
	// FetchedAt is the UTC time this item was fetched.
	FetchedAt string
	// Source is the feed identifier: "vneconomy" or "vnexpress".
	Source string
}

// browserUA mimics a real browser so Vietnamese news sites return 200 instead of 503.
const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const fetchTimeoutSeconds = 15

// rssChannel is the XML shape of an RSS 2.0 <channel>.
type rssChannel struct {
	Items []rssItem `xml:"item"`
}

// rssItem is the XML shape of an RSS 2.0 <item>.
type rssItem struct {
	Title   string `xml:"title"`
	Link    string `xml:"link"`
	PubDate string `xml:"pubDate"`
}

// rssFeed is the root XML envelope.
type rssFeed struct {
	Channel rssChannel `xml:"channel"`
}

// fetchRSS fetches a single RSS feed URL and returns parsed items.
// On HTTP or parse error it returns (nil, error); callers decide whether to
// continue to next feed or abort.
func fetchRSS(ctx context.Context, client HTTPClient, feedURL, source string, maxItems int) ([]RssItem, error) {
	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("fetchRSS %s: build request: %w", source, err)
	}
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "application/rss+xml, text/xml, application/xml, */*")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetchRSS %s: http: %w", source, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetchRSS %s: HTTP %d", source, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("fetchRSS %s: read body: %w", source, err)
	}

	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("fetchRSS %s: xml parse: %w", source, err)
	}

	items := feed.Channel.Items
	if maxItems > 0 && len(items) > maxItems {
		items = items[:maxItems]
	}

	result := make([]RssItem, 0, len(items))
	for _, it := range items {
		title := strings.TrimSpace(it.Title)
		url := strings.TrimSpace(it.Link)

		ri := RssItem{
			ID:          dedupKey(url, title, source),
			Title:       title,
			URL:         url,
			PublishedAt: normalizeRFC(it.PubDate),
			FetchedAt:   fetchedAt,
			Source:      source,
		}
		result = append(result, ri)
	}
	return result, nil
}

// dedupKey produces a deterministic short hex string from url (primary) or
// source+title (fallback). Matches the dedup logic expected by rag_analyses.
func dedupKey(url, title, source string) string {
	key := url
	if key == "" {
		key = source + ":" + title
	}
	sum := sha256.Sum256([]byte(key))
	return fmt.Sprintf("%x", sum[:8]) // 16 hex chars
}

// normalizeRFC attempts to parse an RFC-822 / RFC-2822 pubDate string into
// RFC-3339 format. Returns empty string if parsing fails.
func normalizeRFC(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// Common RSS date formats
	formats := []string{
		time.RFC1123Z, // "Mon, 02 Jan 2006 15:04:05 -0700"
		time.RFC1123,  // "Mon, 02 Jan 2006 15:04:05 MST"
		time.RFC3339,
		"Mon, 02 Jan 2006 15:04:05 +0000",
		"02 Jan 2006 15:04:05 +0000",
		"02 Jan 2006 15:04:05 MST",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, raw); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

// VnEconomyFetcher fetches from vneconomy.vn RSS feeds.
// Two feeds: stocks (chung-khoan) and finance (tai-chinh).
type VnEconomyFetcher struct {
	client   HTTPClient
	maxItems int
}

// NewVnEconomyFetcher creates a VnEconomyFetcher.
// client may be nil to use the default production HTTP client.
func NewVnEconomyFetcher(client HTTPClient, maxItems int) *VnEconomyFetcher {
	if client == nil {
		client = newDefaultHTTPClient(fetchTimeoutSeconds * time.Second)
	}
	if maxItems <= 0 {
		maxItems = 20
	}
	return &VnEconomyFetcher{client: client, maxItems: maxItems}
}

// Fetch fetches both vneconomy RSS feeds and returns deduplicated items.
// Errors from individual feeds are logged but do not abort the other feed.
func (f *VnEconomyFetcher) Fetch(ctx context.Context) ([]RssItem, error) {
	const source = "vneconomy"
	feeds := []string{
		"https://vneconomy.vn/chung-khoan.rss",
		"https://vneconomy.vn/tai-chinh.rss",
	}

	seen := map[string]struct{}{}
	var all []RssItem

	for _, url := range feeds {
		items, err := fetchRSS(ctx, f.client, url, source, f.maxItems)
		if err != nil {
			// Non-fatal: log and continue to next feed
			fmt.Printf("[vneconomy] feed error %s: %v\n", url, err)
			continue
		}
		for _, it := range items {
			if _, dup := seen[it.ID]; !dup {
				seen[it.ID] = struct{}{}
				all = append(all, it)
			}
		}
	}
	return all, nil
}

// VnExpressFetcher fetches from vnexpress.net business/finance RSS feed.
type VnExpressFetcher struct {
	client   HTTPClient
	maxItems int
}

// NewVnExpressFetcher creates a VnExpressFetcher.
// client may be nil to use the default production HTTP client.
func NewVnExpressFetcher(client HTTPClient, maxItems int) *VnExpressFetcher {
	if client == nil {
		client = newDefaultHTTPClient(fetchTimeoutSeconds * time.Second)
	}
	if maxItems <= 0 {
		maxItems = 20
	}
	return &VnExpressFetcher{client: client, maxItems: maxItems}
}

// Fetch fetches the VnExpress kinh-doanh RSS feed and returns items.
func (f *VnExpressFetcher) Fetch(ctx context.Context) ([]RssItem, error) {
	const (
		source  = "vnexpress"
		feedURL = "https://vnexpress.net/rss/kinh-doanh.rss"
	)
	return fetchRSS(ctx, f.client, feedURL, source, f.maxItems)
}

// HTTPClient is the interface accepted by all fetchers, enabling test injection.
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

// newDefaultHTTPClient returns a stdlib http.Client with the given timeout.
func newDefaultHTTPClient(timeout time.Duration) HTTPClient {
	return &http.Client{Timeout: timeout}
}
