// Package fetcher — VPS proxy passthrough for news from the Vinahost VPS.
//
// The VPS runs a fetch-news.sh / news cron that pushes RSS results to an
// endpoint on VPS_HOST. This fetcher is a pure HTTP passthrough:
//   - GET {vpsHost}/news → JSON array of RssItem-shaped objects
//   - No transformation, no SQLite on the VPS side
//   - Stub path: returns nil when vpsHost is empty
//
// VPS reference: docs/references/vps-setup.md, project_vps_api_gateway_502_socat.md
package fetcher

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// VPSProxyFetcher fetches news items from the VPS news endpoint.
// It is a transparent passthrough — no analysis or transformation is performed.
type VPSProxyFetcher struct {
	vpsHost string
	client  HTTPClient
}

// vpsNewsItem mirrors the JSON shape returned by the VPS news endpoint.
// The VPS script (fetch-news.sh) emits objects compatible with RssItem.
type vpsNewsItem struct {
	Title       string `json:"title"`
	URL         string `json:"url"`
	PublishedAt string `json:"published_at"`
	Source      string `json:"source"`
}

// NewVPSProxyFetcher creates a VPSProxyFetcher.
// vpsHost must be the base URL of the VPS, e.g. "http://125.212.251.27:8765".
// An empty vpsHost enables the stub path (returns nil, nil).
// client may be nil to use the default production HTTP client.
func NewVPSProxyFetcher(vpsHost string, client HTTPClient) *VPSProxyFetcher {
	if client == nil {
		client = newDefaultHTTPClient(20 * time.Second)
	}
	return &VPSProxyFetcher{vpsHost: strings.TrimRight(vpsHost, "/"), client: client}
}

// Fetch fetches news items from the VPS proxy endpoint.
// Returns nil, nil when vpsHost is empty (stub path).
func (f *VPSProxyFetcher) Fetch(ctx context.Context) ([]RssItem, error) {
	if f.vpsHost == "" {
		// Stub path — VPS not configured
		return nil, nil
	}

	endpoint := f.vpsHost + "/news"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("vps_proxy: build request: %w", err)
	}
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vps_proxy: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vps_proxy: HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("vps_proxy: read body: %w", err)
	}

	var items []vpsNewsItem
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, fmt.Errorf("vps_proxy: json parse: %w", err)
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	result := make([]RssItem, 0, len(items))
	for _, it := range items {
		source := it.Source
		if source == "" {
			source = "vps_proxy"
		}
		ri := RssItem{
			ID:          dedupKey(it.URL, it.Title, source),
			Title:       it.Title,
			URL:         it.URL,
			PublishedAt: normalizeRFC(it.PublishedAt),
			FetchedAt:   fetchedAt,
			Source:      source,
		}
		result = append(result, ri)
	}
	return result, nil
}
