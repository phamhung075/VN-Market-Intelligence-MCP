// Package vndirectquotemapper maps VnDirect API JSON payload to domain.PriceQuote.
//
// Fence-A: imports ONLY stdlib and the domain package.
// Strictly no: SQLite driver, higher DDD layers, network calls, or time.Now() side-effects.
// fetchedAt and latencyMs are injected by the caller (measured at the infra boundary).
//
// Build constraint: zero native extensions. Builds under CGO_ENABLED=0.
//
// The mapping logic is extracted from infrastructure/fetchers.go Tier1/Tier2 fetchers.
// VnDirect stock_prices endpoint returns:
//   - type="STOCK" for VN stocks (price in thousands VND) - requires *1000 scaling
//   - type="INDEX" for indices (actual value) - no scaling needed
//   - floor="HOSE"|"HNX"|"UPCOM" for VN exchanges, other values for non-VN
package vndirectquotemapper

import (
	"encoding/json"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// VnDirectItem represents a single item from the VnDirect stock_prices API response.
// Fields match the actual API response structure.
type VnDirectItem struct {
	Code      string   `json:"code"`
	Floor     string   `json:"floor"`
	Type      string   `json:"type"`       // "STOCK" or "INDEX"
	Close     float64  `json:"close"`      // price in thousands VND for STOCK
	NmVolume  float64  `json:"nmVolume"`   // trading volume
	Change    *float64 `json:"change"`     // price change (nil if unavailable)
	PctChange *float64 `json:"pctChange"`  // percent change (nil if unavailable)
	Date      string   `json:"date"`       // trading date
	Time      string   `json:"time"`       // trading time
}

// VnDirectPayload represents the full VnDirect stock_prices API response.
type VnDirectPayload struct {
	Data []VnDirectItem `json:"data"`
}

// MapResult holds the result of mapping a VnDirect payload.
// Quote is nil if the payload is empty or invalid.
// Err is set only for malformed JSON.
type MapResult struct {
	Quote *domain.PriceQuote
	Err   error
}

// MapPayload maps a raw VnDirect stock_prices API JSON payload to a domain.PriceQuote.
//
// Parameters:
//   - rawJSON    - raw JSON bytes from the VnDirect API response
//   - fetchedAt  - RFC3339 timestamp captured by the caller (no time.Now() here)
//   - latencyMs  - round-trip milliseconds measured by the caller
//
// Returns:
//   - Quote: *domain.PriceQuote (nil if empty data array or no items)
//   - Err: non-nil only for malformed JSON
//
// Behavior:
//   - Empty data array returns nil quote, nil error (not an error condition)
//   - Malformed JSON returns nil quote, non-nil error
//   - VN stocks (type="STOCK" + floor in HOSE/HNX/UPCOM) get *1000 price scaling
//   - Indices (type="INDEX") and non-VN floors get no price scaling
//   - null change/pctChange in JSON maps to nil pointers (DSI-INV-1)
func MapPayload(rawJSON []byte, fetchedAt string, latencyMs int64) MapResult {
	var payload VnDirectPayload
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		return MapResult{Quote: nil, Err: err}
	}

	if len(payload.Data) == 0 {
		return MapResult{Quote: nil, Err: nil}
	}

	item := payload.Data[0]
	return MapResult{
		Quote: mapItemToQuote(item, fetchedAt, latencyMs),
		Err:   nil,
	}
}

// MapItem maps a single VnDirectItem to a domain.PriceQuote.
// This is useful when you already have a parsed item (e.g., from a test).
//
// Parameters:
//   - item       - parsed VnDirectItem struct
//   - fetchedAt  - RFC3339 timestamp captured by the caller
//   - latencyMs  - round-trip milliseconds measured by the caller
func MapItem(item VnDirectItem, fetchedAt string, latencyMs int64) *domain.PriceQuote {
	return mapItemToQuote(item, fetchedAt, latencyMs)
}

// mapItemToQuote is the internal mapping function.
func mapItemToQuote(item VnDirectItem, fetchedAt string, latencyMs int64) *domain.PriceQuote {
	// Determine source from floor field (HOSE, HNX, UPCOM)
	source := domain.SourceHOSE
	switch item.Floor {
	case "HNX":
		source = domain.SourceHNX
	case "UPCOM":
		source = domain.SourceUPCOM
	}

	// FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL: Scale price based on asset type.
	// VN stocks (type="STOCK", floor in HOSE/HNX/UPCOM) return prices in thousands VND.
	// Indices and other assets (type="INDEX", non-VN floors like BLOOMBERG) return actual values.
	price := item.Close
	if item.Type == "STOCK" && (item.Floor == "HOSE" || item.Floor == "HNX" || item.Floor == "UPCOM") {
		price = item.Close * 1000
	}

	// DSI-INV-1: Change/PctChange are already pointers in VnDirectItem.
	// If the JSON has null, they will be nil. If JSON has a value (including 0), they will be non-nil.
	// We copy them to new pointers to avoid aliasing.
	var change, pctChange *float64
	if item.Change != nil {
		v := *item.Change
		change = &v
	}
	if item.PctChange != nil {
		v := *item.PctChange
		pctChange = &v
	}

	return &domain.PriceQuote{
		Code:          item.Code,
		Price:         price,
		Volume:        item.NmVolume,
		Change:        change,
		ChangePercent: pctChange,
		Source:        source,
		LatencyMs:     latencyMs,
		FetchedAt:     fetchedAt,
	}
}
