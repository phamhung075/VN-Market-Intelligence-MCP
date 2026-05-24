// Package application contains the application layer DTOs and use cases.
package application

// ReadingRequest is the request DTO for getting a reading.
type ReadingRequest struct {
	StockCode string `json:"stockCode"`
	Days      int    `json:"days,omitempty"` // defaults to 30 if not specified
}

// ReadingResponse is the response DTO for a reading.
type ReadingResponse struct {
	Stock          string  `json:"stock"`
	Hexagram       int     `json:"hexagram"`
	Name           string  `json:"name"`
	Trend          string  `json:"trend"`
	Signal         string  `json:"signal"`
	Confidence     float64 `json:"confidence"`
	ActionNote     string  `json:"actionNote"`
	OverallReading string  `json:"overallReading"`
	Timestamp      string  `json:"timestamp"`
}

// MarketReadingResponse is the response DTO for a market reading.
type MarketReadingResponse struct {
	Hexagram   int     `json:"hexagram"`
	Name       string  `json:"name"`
	Trend      string  `json:"trend"`
	Signal     string  `json:"signal"`
	Confidence float64 `json:"confidence"`
	Timestamp  string  `json:"timestamp"`
}

// HistoryRequest is the request DTO for reading history.
type HistoryRequest struct {
	StockCode string `json:"stockCode"`
	Days      int    `json:"days,omitempty"` // defaults to 30
}

// HistoryEntryDTO represents a single entry in reading history.
type HistoryEntryDTO struct {
	Timestamp  string  `json:"timestamp"`
	Hexagram   int     `json:"hexagram"`
	Name       string  `json:"name"`
	Signal     string  `json:"signal"`
	Confidence float64 `json:"confidence"`
}

// HistoryResponse is the response DTO for reading history.
type HistoryResponse struct {
	Stock        string            `json:"stock"`
	Days         int               `json:"days"`
	Total        int               `json:"total"`
	Readings     []HistoryEntryDTO `json:"readings"`
	MostFrequent string            `json:"mostFrequent"`
}

// TransitionsRequest is the request DTO for hexagram transitions.
type TransitionsRequest struct {
	HexagramNumber int    `json:"hexagramNumber"`
	StockCode      string `json:"stockCode,omitempty"` // defaults to VNINDEX
	TopN           int    `json:"topN,omitempty"`      // defaults to 10
}

// TransitionEntryDTO represents a single transition entry.
type TransitionEntryDTO struct {
	ToHexagram  int     `json:"toHexagram"`
	Name        string  `json:"name"`
	Probability float64 `json:"probability"`
	Count       int     `json:"count"`
}

// TransitionsResponse is the response DTO for hexagram transitions.
type TransitionsResponse struct {
	Hexagram    int                  `json:"hexagram"`
	Name        string               `json:"name"`
	Stock       string               `json:"stock"`
	Transitions []TransitionEntryDTO `json:"transitions"`
}

// BacktestRequest is the request DTO for backtesting.
type BacktestRequest struct {
	StockCode string `json:"stockCode"`
	Days      int    `json:"days,omitempty"` // defaults to 30
}

// HexagramStats represents statistics for a hexagram in backtesting.
type HexagramStats struct {
	Number  int     `json:"number"`
	Name    string  `json:"name"`
	WinRate float64 `json:"winRate"`
	Count   int     `json:"count"`
}

// BacktestResponse is the response DTO for backtesting.
type BacktestResponse struct {
	Stock         string         `json:"stock"`
	Days          int            `json:"days"`
	TotalReadings int            `json:"totalReadings"`
	Accuracy      float64        `json:"accuracy"`
	AvgReturn5d   float64        `json:"avgReturn5d"`
	BestHexagram  *HexagramStats `json:"bestHexagram"`
	WorstHexagram *HexagramStats `json:"worstHexagram"`
}

// ExplainRequest is the request DTO for hexagram explanation.
type ExplainRequest struct {
	HexagramNumber int `json:"hexagramNumber"`
}

// ExplainResponse is the response DTO for hexagram explanation.
type ExplainResponse struct {
	Number         int    `json:"number"`
	Name           string `json:"name"`
	Chinese        string `json:"chinese"`
	Upper          string `json:"upper"`
	Lower          string `json:"lower"`
	CoreMeaning    string `json:"coreMeaning"`
	Trend          string `json:"trend"`
	TradingContext string `json:"tradingContext"`
}
