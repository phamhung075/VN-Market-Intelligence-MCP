// Package domain contains the business types and ports for the kinh-dich-service.
// Pure types. No I/O, no infrastructure imports.
package domain

// -----------------------------------------------------------------------------
// Price scoring constants
// -----------------------------------------------------------------------------
// Extracted from inline literals for clarity, auditability, and naming.
// Provenance: FACTORY-KINHDICH-name-price-score-constants (2026-07-09).
const (
	// DailyReturnNormalizationBand is the divisor used to normalise daily returns
	// into [-1, +1]. A 5% return (0.05) maps to score=1.0, -5% to -1.0.
	// Basis: Vietnamese stock exchanges enforce a daily price-limit band of +/-7%
	// for HOSE, +/-10% for HNX/UPCOM. The 5% band is a conservative normalisation
	// anchor that keeps typical daily moves well within [-1, +1] while allowing
	// extreme (+7%) moves to saturate at the boundary.
	// Provenance: original literal `/0.05` in percentage-return normalisation.
	DailyReturnNormalizationBand = 0.05

	// MinPricePointsForScoring is the minimum number of price points required to
	// compute a valid reading. 7 price points yield 6 daily returns (one per hao),
	// which the hao_encoder primitive expects.
	// Provenance: original literal `7` in len(prices)<7 guard.
	MinPricePointsForScoring = 7
)

// HaoState represents the state of a single hao (line) in a hexagram.
type HaoState string

const (
	LaoDuong   HaoState = "LAO_DUONG"
	ThieuDuong HaoState = "THIEU_DUONG"
	ThieuAm    HaoState = "THIEU_AM"
	LaoAm      HaoState = "LAO_AM"
)

// NguHanh represents the five elements (Wu Xing).
type NguHanh string

const (
	Kim  NguHanh = "Kim"
	Moc  NguHanh = "Moc"
	Thuy NguHanh = "Thuy"
	Hoa  NguHanh = "Hoa"
	Tho  NguHanh = "Tho"
)

// NguHanhDynamic represents the interaction between two elements.
type NguHanhDynamic string

const (
	TuongSinh NguHanhDynamic = "TUONG_SINH"
	TuongKhac NguHanhDynamic = "TUONG_KHAC"
	Same      NguHanhDynamic = "SAME"
	Neutral   NguHanhDynamic = "NEUTRAL"
)

// HaoReading represents a single hao (line) in a hexagram reading.
type HaoReading struct {
	Position   int      `json:"position"`   // 1-6, bottom to top
	Label      string   `json:"label"`      // Vietnamese positional label
	RawScore   float64  `json:"rawScore"`   // Original score before classification
	State      HaoState `json:"state"`      // Classified state
	Binary     int      `json:"binary"`     // 0 (yin) or 1 (yang)
	IsChanging bool     `json:"isChanging"` // True if this is a changing line
}

// NguHanhResult represents the result of classifying the five-element relationship.
type NguHanhResult struct {
	Lower          NguHanh        `json:"lower"`
	Upper          NguHanh        `json:"upper"`
	Dynamic        NguHanhDynamic `json:"dynamic"`
	Score          float64        `json:"score"`
	Interpretation string         `json:"interpretation"`
}

// MarkovData represents Markov transition data for a hexagram.
type MarkovData struct {
	NextMostLikely int     `json:"nextMostLikely"`
	NextName       string  `json:"nextName"`
	Probability    float64 `json:"probability"`
}

// Trigram represents a trigram (3 lines) in a hexagram.
type Trigram struct {
	Name    string  `json:"name"`
	Element NguHanh `json:"element"`
	Symbol  string  `json:"symbol"`
}

// QueChinh represents the primary hexagram result.
type QueChinh struct {
	Number        int     `json:"number"`
	Name          string  `json:"name"`
	Chinese       string  `json:"chinese"`
	CoreMeaning   string  `json:"coreMeaning"`
	Trend         string  `json:"trend"`
	TradingSignal string  `json:"tradingSignal"`
	Confidence    float64 `json:"confidence"`
}

// QueSecondary represents a secondary hexagram (ho que or bien que).
type QueSecondary struct {
	Number      int    `json:"number"`
	Name        string `json:"name"`
	Chinese     string `json:"chinese"`
	CoreMeaning string `json:"coreMeaning"`
}

// KinhDichReading represents a complete I-Ching reading.
type KinhDichReading struct {
	StockCode     string        `json:"stockCode"`
	Timestamp     string        `json:"timestamp"`
	Haos          []HaoReading  `json:"haos"`
	LowerTrigram  Trigram       `json:"lowerTrigram"`
	UpperTrigram  Trigram       `json:"upperTrigram"`
	QueChinh      QueChinh      `json:"queChiNh"`
	HoQue         QueSecondary  `json:"hoQue"`
	BienQue       QueSecondary  `json:"bienQue"`
	NguHanh       NguHanhResult `json:"nguHanh"`
	ChangingLines []int         `json:"changingLines"`
	Markov        *MarkovData   `json:"markov"` // nil if no Markov data available
	ActionNote    string        `json:"actionNote"`
	OverallReading string       `json:"overallReading"`
}

// KinhDichStoredRow represents a stored row from the kinhdich_readings table.
type KinhDichStoredRow struct {
	HexagramNumber int      `json:"hexagram_number"`
	BienQueNumber  int      `json:"bien_que_number"`
	TradingSignal  *string  `json:"trading_signal"` // nil if NULL
	Confidence     *float64 `json:"confidence"`     // nil if NULL
}
