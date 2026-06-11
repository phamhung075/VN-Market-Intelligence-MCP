// Package infrastructure contains the infrastructure layer implementations.
package infrastructure

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// priceHistoryAPIResponse is the JSON shape from GET /stock/price/history.
// Example: {"code":"VNINDEX","history":[{"date":"2026-05-12","open":1895.5,"high":1898.04,"low":1875.59,"close":1882.02,"volume":452863189}, ...]}
type priceHistoryAPIResponse struct {
	Code    string              `json:"code"`
	History []priceHistoryOHLCV `json:"history"`
}

// priceHistoryOHLCV is a single OHLCV row from the API.
type priceHistoryOHLCV struct {
	Date   string  `json:"date"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume int64   `json:"volume"`
}

// HTTPPriceHistorySource fetches price history from an HTTP API.
// Implements the price source interface for injection into price score adapters.
type HTTPPriceHistorySource struct {
	baseURL string
	client  *http.Client
}

// NewHTTPPriceHistorySource creates a new HTTPPriceHistorySource.
// Reads PRICE_HISTORY_URL from environment (default: http://api-gateway:4000).
func NewHTTPPriceHistorySource() *HTTPPriceHistorySource {
	baseURL := os.Getenv("PRICE_HISTORY_URL")
	if baseURL == "" {
		baseURL = "http://api-gateway:4000"
	}
	return &HTTPPriceHistorySource{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// GetPriceHistory fetches price history from the HTTP API.
// Returns []domain.KinhDichPriceRow or nil on error (fail-loud via HTTP 503).
// Maps OHLCV.Close -> Price, OHLCV.Date -> Timestamp.
func (h *HTTPPriceHistorySource) GetPriceHistory(stockCode string, days int) ([]domain.KinhDichPriceRow, error) {
	url := fmt.Sprintf("%s/stock/price/history?code=%s&days=%d", h.baseURL, stockCode, days)

	resp, err := h.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("price history fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("price history API returned status %d", resp.StatusCode)
	}

	var apiResp priceHistoryAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("price history JSON decode failed: %w", err)
	}

	// Convert OHLCV to KinhDichPriceRow
	rows := make([]domain.KinhDichPriceRow, len(apiResp.History))
	for i, ohlcv := range apiResp.History {
		rows[i] = domain.KinhDichPriceRow{
			Price:     ohlcv.Close,
			Timestamp: ohlcv.Date,
		}
	}

	return rows, nil
}

// ParsePriceHistoryJSON parses a raw JSON body into []domain.KinhDichPriceRow.
// Exported for unit testing the JSON parsing logic.
func ParsePriceHistoryJSON(data []byte) ([]domain.KinhDichPriceRow, error) {
	var apiResp priceHistoryAPIResponse
	if err := json.Unmarshal(data, &apiResp); err != nil {
		return nil, fmt.Errorf("price history JSON parse failed: %w", err)
	}

	rows := make([]domain.KinhDichPriceRow, len(apiResp.History))
	for i, ohlcv := range apiResp.History {
		rows[i] = domain.KinhDichPriceRow{
			Price:     ohlcv.Close,
			Timestamp: ohlcv.Date,
		}
	}

	return rows, nil
}
