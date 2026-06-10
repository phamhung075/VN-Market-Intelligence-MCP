// Package fetcher — NewsAPI.org integration for Vietnam-related news.
//
// Stub path: returns nil immediately when apiKey is empty or enabled=false.
// Zero I/O on the stub path — safe for deployments without a NewsAPI key.
//
// API docs: https://newsapi.org/docs/endpoints/everything
package fetcher

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// NewsAPIConfig holds the configuration for the NewsAPI fetcher.
type NewsAPIConfig struct {
	// APIKey is the newsapi.org API key. Empty string = stub path (returns nil).
	APIKey string
	// Enabled is a master switch. false = skip entirely, zero I/O.
	Enabled bool
	// Query overrides the default Vietnam news query when non-empty.
	Query string
}

// newsAPIResponse mirrors the top-level JSON from newsapi.org /v2/everything.
type newsAPIResponse struct {
	Status   string           `json:"status"`
	Articles []newsAPIArticle `json:"articles"`
}

// newsAPIArticle mirrors one article from the NewsAPI /everything response.
type newsAPIArticle struct {
	Title       string      `json:"title"`
	URL         string      `json:"url"`
	PublishedAt string      `json:"publishedAt"`
	Description string      `json:"description"`
	Source      *newsSource `json:"source"`
}

type newsSource struct {
	Name string `json:"name"`
}

const (
	newsAPIURL      = "https://newsapi.org/v2/everything"
	defaultQuery    = "Vietnam economy OR Vietnam stock market OR VN-Index"
	newsAPIPageSize = 20
	newsAPISource   = "newsapi"
)

// NewsAPIFetcher fetches Vietnam-related news from newsapi.org.
type NewsAPIFetcher struct {
	cfg    NewsAPIConfig
	client HTTPClient
}

// NewNewsAPIFetcher creates a NewsAPIFetcher with the given config.
// client may be nil to use the default production HTTP client.
func NewNewsAPIFetcher(cfg NewsAPIConfig, client HTTPClient) *NewsAPIFetcher {
	if client == nil {
		client = newDefaultHTTPClient(15 * time.Second)
	}
	return &NewsAPIFetcher{cfg: cfg, client: client}
}

// Fetch fetches Vietnam-related articles from newsapi.org.
// Returns nil, nil on the stub path (disabled or no API key).
func (f *NewsAPIFetcher) Fetch(ctx context.Context) ([]RssItem, error) {
	if !f.cfg.Enabled || f.cfg.APIKey == "" {
		// Stub path — zero I/O
		return nil, nil
	}

	query := f.cfg.Query
	if query == "" {
		query = defaultQuery
	}

	params := url.Values{}
	params.Set("q", query)
	params.Set("pageSize", fmt.Sprintf("%d", newsAPIPageSize))
	params.Set("language", "en")
	params.Set("sortBy", "publishedAt")
	params.Set("apiKey", f.cfg.APIKey)

	reqURL := newsAPIURL + "?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("newsapi: build request: %w", err)
	}
	req.Header.Set("User-Agent", browserUA)

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("newsapi: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("newsapi: HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("newsapi: read body: %w", err)
	}

	var apiResp newsAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("newsapi: json parse: %w", err)
	}

	if apiResp.Status != "ok" {
		return nil, fmt.Errorf("newsapi: API returned status=%q", apiResp.Status)
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	result := make([]RssItem, 0, len(apiResp.Articles))
	for _, a := range apiResp.Articles {
		title := a.Title
		if title == "" {
			title = a.Description
		}
		pubAt := ""
		if a.PublishedAt != "" {
			// NewsAPI returns RFC-3339 already; normalise for safety
			pubAt = normalizeRFC(a.PublishedAt)
		}

		ri := RssItem{
			ID:          dedupKey(a.URL, title, newsAPISource),
			Title:       title,
			URL:         a.URL,
			PublishedAt: pubAt,
			FetchedAt:   fetchedAt,
			Source:      newsAPISource,
		}
		result = append(result, ri)
	}
	return result, nil
}
