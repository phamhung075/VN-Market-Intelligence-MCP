// Package reading_composer orchestrates the 5 extracted Go primitives into a complete
// KinhDichReading via a multi-step pipeline with MarkovPort dependency injection.
//
// Fence-B: imports ONLY from pkg/primitive/**, pkg/domain/**, and stdlib.
// Zero imports from pkg/application/**, pkg/interface/**, pkg/infrastructure/**.
//
// Pipeline:
//
//	Step 1 — Encode haos (hao_encoder primitive)
//	Step 2 — Extract binary signals from haos
//	Step 3 — Resolve que chinh hexagram number (hexagram_resolver primitive)
//	Step 4 — Compute ho que (nuclear_hexagram primitive)
//	Step 5 — Compute bien que (nuclear_hexagram primitive)
//	Step 6 — Classify ngu hanh (ngu_hanh_classifier primitive)
//	Step 7 — Score trend and outcomes (reading_scorer primitive)
//	Step 8 — Majority vote for trading signal (reading_scorer primitive)
//	Step 9 — Calculate base confidence
//	Step 10 — Fetch Markov blending data (MarkovPort, injected)
//	Step 11 — Blend confidence with Markov weights (post-processing)
package reading_composer

import (
	"fmt"
	"math"
	"time"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hao_encoder"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hexagram_resolver"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/ngu_hanh_classifier"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/nuclear_hexagram"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/reading_scorer"
)

// ReadingComposerDependencies contains the dependencies injected into ComposeReading().
// The concrete Markov adapter is wired at the composition root (cmd/server/main.go)
// and must NOT be imported here.
type ReadingComposerDependencies struct {
	Markov MarkovPort
}

// ComposeReading composes a full KinhDich reading for a stock from 6 normalised scores.
//
// Parameters:
//   - stockCode: Stock ticker (e.g., "VCB")
//   - scores: Exactly 6 normalised floats in [-1, +1]
//   - deps: Injected dependencies (MarkovPort)
//
// Returns:
//   - *domain.KinhDichReading with all fields populated
//   - error if scores.length != 6 or hexagram cannot be resolved
func ComposeReading(stockCode string, scores []float64, deps *ReadingComposerDependencies) (*domain.KinhDichReading, error) {
	if len(scores) != 6 {
		return nil, fmt.Errorf("composeReading: expected exactly 6 scores, got %d", len(scores))
	}

	// Step 1: Encode haos using extracted primitive
	haos, err := hao_encoder.EncodeHaos(scores)
	if err != nil {
		return nil, fmt.Errorf("encodeHaos failed: %w", err)
	}

	// Step 2: Extract binary signals from encoded haos
	signals := make([]int, 6)
	for i, h := range haos {
		signals[i] = h.Binary
	}

	// Step 3: Resolve que chinh hexagram number using extracted primitive
	queChinhNumber, err := hexagram_resolver.ResolveHexagram(signals)
	if err != nil {
		return nil, fmt.Errorf("resolveHexagram failed: %w", err)
	}

	// Get hexagram metadata
	queMeta := getQueMeta(queChinhNumber)
	queData := getQueData(queChinhNumber)
	if queMeta == nil || queData == nil {
		return nil, fmt.Errorf("no metadata for hexagram %d", queChinhNumber)
	}

	// Build trigrams
	lowerTrigramMeta := trigrams[queMeta.lower]
	upperTrigramMeta := trigrams[queMeta.upper]
	lowerTrigram := domain.Trigram{
		Name:    queMeta.lower,
		Element: domain.NguHanh(lowerTrigramMeta.element),
		Symbol:  lowerTrigramMeta.symbol,
	}
	upperTrigram := domain.Trigram{
		Name:    queMeta.upper,
		Element: domain.NguHanh(upperTrigramMeta.element),
		Symbol:  upperTrigramMeta.symbol,
	}

	// Step 4: Compute ho que (nuclear hexagram)
	hoQueNumber, err := nuclear_hexagram.ComputeHoQue(signals)
	if err != nil {
		return nil, fmt.Errorf("computeHoQue failed: %w", err)
	}
	hoQueMeta := getQueMeta(hoQueNumber)
	hoQueData := getQueData(hoQueNumber)
	hoQue := domain.QueSecondary{
		Number:      hoQueNumber,
		Name:        safeQueName(hoQueMeta, hoQueNumber),
		Chinese:     safeQueChinese(hoQueMeta),
		CoreMeaning: safeQueCoreMeaning(hoQueData),
	}

	// Step 5: Compute bien que (transformed hexagram)
	bienQueNumber, err := nuclear_hexagram.ComputeBienQue(haos)
	if err != nil {
		return nil, fmt.Errorf("computeBienQue failed: %w", err)
	}
	bienQueMeta := getQueMeta(bienQueNumber)
	bienQueData := getQueData(bienQueNumber)
	bienQue := domain.QueSecondary{
		Number:      bienQueNumber,
		Name:        safeQueName(bienQueMeta, bienQueNumber),
		Chinese:     safeQueChinese(bienQueMeta),
		CoreMeaning: safeQueCoreMeaning(bienQueData),
	}

	// Step 6: Classify ngu hanh (five elements interaction)
	nguHanhResult := ngu_hanh_classifier.ClassifyNguHanh(string(lowerTrigram.Element), string(upperTrigram.Element))
	nguHanh := domain.NguHanhResult{
		Lower:          domain.NguHanh(nguHanhResult.Lower),
		Upper:          domain.NguHanh(nguHanhResult.Upper),
		Dynamic:        domain.NguHanhDynamic(nguHanhResult.Dynamic),
		Score:          nguHanhResult.Score,
		Interpretation: nguHanhResult.Interpretation,
	}

	// Identify changing lines
	changingLines := getChangingLines(haos)

	// Step 7: Score trend and outcomes using reading_scorer primitive
	trendRaw := queData.trend
	baseScore := reading_scorer.ExtractTrendScore(trendRaw)

	// Determine active lines (changing lines or default to line 5)
	activeIndices := changingLines
	if len(activeIndices) == 0 {
		activeIndices = []int{5} // Default to line 5 (index 4 in 0-based, but our position is 1-indexed)
	}

	// Collect outcome scores and actions from active lines
	var outcomeScores []float64
	var actions []string
	for _, pos := range activeIndices {
		idx := pos - 1 // Convert 1-indexed position to 0-indexed
		if idx >= 0 && idx < len(queData.lines) {
			line := queData.lines[idx]
			outcomeScores = append(outcomeScores, reading_scorer.ExtractOutcomeScore(line.outcome))
			actions = append(actions, reading_scorer.ExtractAction(line.action))
		}
	}

	// Average outcome score
	avgOutcome := 0.0
	if len(outcomeScores) > 0 {
		sum := 0.0
		for _, s := range outcomeScores {
			sum += s
		}
		avgOutcome = sum / float64(len(outcomeScores))
	}
	combinedScore := baseScore + avgOutcome

	// Step 8: Majority vote for trading signal
	tradingSignal := reading_scorer.MajorityVote(actions)

	// Step 9: Calculate base confidence
	confidence := math.Min(math.Abs(combinedScore)/0.8, 1.0)

	// Step 10 & 11: Fetch Markov data and blend confidence
	var markovResult *domain.MarkovData
	if deps != nil && deps.Markov != nil {
		markovBlend, err := deps.Markov.GetMarkovData(queChinhNumber)
		if err == nil && markovBlend != nil {
			// Blend confidence: blended = base * 0.7 + avg(transitionProb, historicalConfidence) * 0.3
			markovWeight := (markovBlend.TransitionProb + markovBlend.HistoricalConfidence) / 2
			confidence = confidence*0.7 + markovWeight*0.3
		}
		// Note: markovResult (for domain.MarkovData) is a different shape;
		// we leave it nil for now since we don't have nextMostLikely/probability data
	}

	// Round confidence to 3 decimal places
	confidence = math.Round(confidence*1000) / 1000

	// Build trading signal display
	signSuffix := "(tich cuc)"
	if combinedScore < 0 {
		signSuffix = "(tieu cuc)"
	}
	tradingSignalDisplay := fmt.Sprintf("%s %s", tradingSignal, signSuffix)

	// Convert primitive HaoReadings to domain HaoReadings
	domainHaos := make([]domain.HaoReading, 6)
	for i, h := range haos {
		domainHaos[i] = domain.HaoReading{
			Position:   i + 1,
			Label:      h.Label,
			RawScore:   scores[i],
			State:      domain.HaoState(h.State),
			Binary:     h.Binary,
			IsChanging: h.IsChanging,
		}
	}

	// Build action note
	actionNote := fmt.Sprintf("KHUYEN NGHI: %s — Que %s (%d) %s, xu huong: %s. Do tin cay: %d%%.",
		tradingSignal, queMeta.name, queChinhNumber, signSuffix,
		simplifyTrend(trendRaw), int(confidence*100))

	// Build changing lines description
	changingDesc := "Khong co hao dong — que on dinh."
	if len(changingLines) > 0 {
		changingDesc = fmt.Sprintf("Hao dong: %v — bien chuyen sang %s.", changingLines, bienQue.Name)
	}

	// Build overall reading
	overallReading := fmt.Sprintf("[%s] Que %s (%d) %s. %s Xu huong: %s. Ho que (an sau): %s — %s. %s Ngu Hanh: %s. %s",
		stockCode, queMeta.name, queChinhNumber, queMeta.chinese,
		queData.coreMeaning, trendRaw,
		hoQue.Name, truncate(hoQue.CoreMeaning, 80),
		changingDesc,
		nguHanh.Interpretation,
		actionNote)

	queChiNh := domain.QueChinh{
		Number:        queChinhNumber,
		Name:          queMeta.name,
		Chinese:       queMeta.chinese,
		CoreMeaning:   queData.coreMeaning,
		Trend:         trendRaw,
		TradingSignal: tradingSignalDisplay,
		Confidence:    confidence,
	}

	return &domain.KinhDichReading{
		StockCode:      stockCode,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Haos:           domainHaos,
		LowerTrigram:   lowerTrigram,
		UpperTrigram:   upperTrigram,
		QueChinh:       queChiNh,
		HoQue:          hoQue,
		BienQue:        bienQue,
		NguHanh:        nguHanh,
		ChangingLines:  changingLines,
		Markov:         markovResult,
		ActionNote:     actionNote,
		OverallReading: overallReading,
	}, nil
}

// getChangingLines extracts positions of changing lines (1-indexed).
func getChangingLines(haos []hao_encoder.HaoReading) []int {
	var result []int
	for i, h := range haos {
		if h.IsChanging {
			result = append(result, i+1) // 1-indexed position
		}
	}
	return result
}

// simplifyTrend extracts the main trend keyword.
func simplifyTrend(trend string) string {
	// Remove any suffix after dash
	for i, c := range trend {
		if c == '-' || c == '—' {
			return trend[:i]
		}
	}
	return trend
}

// truncate limits string to maxLen characters.
func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}

// Safe accessor helpers
func safeQueName(meta *queMeta, fallback int) string {
	if meta != nil {
		return meta.name
	}
	return fmt.Sprintf("Que %d", fallback)
}

func safeQueChinese(meta *queMeta) string {
	if meta != nil {
		return meta.chinese
	}
	return ""
}

func safeQueCoreMeaning(data *queData) string {
	if data != nil {
		return data.coreMeaning
	}
	return ""
}
