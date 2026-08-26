package reading_composer

// size-justification: 163L — types (localized, phaseReference, queReference, proseEntry ~55L) +
// helpers (mapTrendToEnum, buildPhases ~25L) + loader init (~55L) + exports (~10L) are tightly
// coupled; splitting produces circular imports. Loader portion is ~55L (within 60L target).

// Reference data for 64 hexagrams with localized prose loaded from embedded JSON.
// Source: hexagram_prose.json (go:embed asset)
// This file backs the dashboard que-reference panel and /hexagram/{number}/explain route.
// KD-QREF-LANG: localized EN/VI fields for language switch feature.

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed hexagram_prose.json
var hexagramProseJSON []byte

// localized carries one text field in two languages.
type localized struct {
	En string `json:"en"`
	Vi string `json:"vi"`
}

// phaseReference describes a single hao in trading terms.
type phaseReference struct {
	Phase   int       `json:"phase"`   // 1-6
	Action  string    `json:"action"`  // reuse from queDataMap: TIEN/GIU/CHO/THAN/LUI
	Outcome string    `json:"outcome"` // reuse from queDataMap: CAT/HUNG/VO CUU/HOI/LE
	Gloss   localized `json:"gloss"`   // one-line trading meaning in EN and VI
}

// queReference holds the full trading-reference record for one hexagram.
type queReference struct {
	ID                  int              `json:"id"`
	Name                string           `json:"name"`                // Vietnamese name, verbatim
	Chinese             string           `json:"chinese"`             // Han zi glyph, verbatim
	Upper               string           `json:"upper"`               // trigram name (Qian/Kan/...)
	Lower               string           `json:"lower"`               // trigram name
	UpperElement        string           `json:"upperElement"`        // Kim/Moc/Hoa/Thuy/Tho
	LowerElement        string           `json:"lowerElement"`        // Kim/Moc/Hoa/Thuy/Tho
	CoreMeaning         localized        `json:"coreMeaning"`         // one-clause core meaning
	HoverSummary        localized        `json:"hoverSummary"`        // 1-3 plain-VN sentences for glanceable dashboard row
	MarketTrend         string           `json:"marketTrend"`         // "favorable"|"neutral"|"unfavorable"
	MarketTrendLabel    localized        `json:"marketTrendLabel"`    // EN: "Favorable (THUAN LOI)", VI: "Thuan loi (THUAN LOI)"
	StateInterpretation localized        `json:"stateInterpretation"` // 1-3 sentence trading-state prose
	Favorable           localized        `json:"favorable"`           // one-line condition for entry/hold
	Warning             localized        `json:"warning"`             // one-line risk/warning
	Phases              []phaseReference `json:"phases"`              // len==6, index 0=phase1...index5=phase6
}

// proseEntry is the JSON structure for embedded prose data.
type proseEntry struct {
	ID                  int         `json:"id"`
	CoreMeaning         localized   `json:"coreMeaning"`
	HoverSummary        localized   `json:"hoverSummary"`
	StateInterpretation localized   `json:"stateInterpretation"`
	Favorable           localized   `json:"favorable"`
	Warning             localized   `json:"warning"`
	Glosses             []localized `json:"glosses"`
}

// mapTrendToEnum converts the ASCII trend string from queDataMap to the enum value.
// Uses prefix matching per architect spec (handles "THUAN LOI - manh" variants).
func mapTrendToEnum(trend string) (marketTrend string, marketTrendLabel localized) {
	t := strings.ToUpper(trend)
	if strings.HasPrefix(t, "THUAN LOI") {
		return "favorable", localized{En: "Favorable (THUAN LOI)", Vi: "Thuan loi (THUAN LOI)"}
	}
	if strings.HasPrefix(t, "BAT LOI") {
		return "unfavorable", localized{En: "Unfavorable (BAT LOI)", Vi: "Bat loi (BAT LOI)"}
	}
	return "neutral", localized{En: "Neutral (TRUNG TINH)", Vi: "Trung tinh (TRUNG TINH)"}
}

// buildPhases constructs phase references from queDataMap lines + localized glosses.
func buildPhases(id int, glosses []localized) []phaseReference {
	qd := getQueData(id)
	if qd == nil || len(qd.lines) != 6 {
		return nil
	}
	phases := make([]phaseReference, 6)
	for i := 0; i < 6; i++ {
		phases[i] = phaseReference{
			Phase:   i + 1,
			Action:  qd.lines[i].action,
			Outcome: qd.lines[i].outcome,
			Gloss:   glosses[i],
		}
	}
	return phases
}

// queReferenceList is the ordered slice of all 64 queReference entries.
var queReferenceList []queReference

// queReferenceMap provides O(1) lookup by hexagram ID.
var queReferenceMap map[int]*queReference

func init() {
	var proseData []proseEntry
	if err := json.Unmarshal(hexagramProseJSON, &proseData); err != nil {
		panic("hexagram_prose.json unmarshal: " + err.Error())
	}

	proseMap := make(map[int]*proseEntry, 64)
	for i := range proseData {
		proseMap[proseData[i].ID] = &proseData[i]
	}

	queReferenceList = make([]queReference, 64)
	for i := 0; i < 64; i++ {
		id := i + 1
		prose := proseMap[id]
		meta := getQueMeta(id)
		data := getQueData(id)

		if prose == nil || meta == nil || data == nil {
			queReferenceList[i] = queReference{ID: id}
			continue
		}

		trend, trendLabel := mapTrendToEnum(data.trend)
		upperEl, lowerEl := "", ""
		if t, ok := trigrams[meta.upper]; ok {
			upperEl = t.element
		}
		if t, ok := trigrams[meta.lower]; ok {
			lowerEl = t.element
		}

		queReferenceList[i] = queReference{
			ID:                  id,
			Name:                meta.name,
			Chinese:             meta.chinese,
			Upper:               meta.upper,
			Lower:               meta.lower,
			UpperElement:        upperEl,
			LowerElement:        lowerEl,
			CoreMeaning:         prose.CoreMeaning,
			HoverSummary:        prose.HoverSummary,
			MarketTrend:         trend,
			MarketTrendLabel:    trendLabel,
			StateInterpretation: prose.StateInterpretation,
			Favorable:           prose.Favorable,
			Warning:             prose.Warning,
			Phases:              buildPhases(id, prose.Glosses),
		}
	}

	queReferenceMap = make(map[int]*queReference, 64)
	for i := range queReferenceList {
		queReferenceMap[queReferenceList[i].ID] = &queReferenceList[i]
	}
}

// GetQueReference returns the reference record for a hexagram by ID.
func GetQueReference(id int) *queReference {
	return queReferenceMap[id]
}

// GetAllQueReferences returns all 64 records in canonical order (id 1..64).
func GetAllQueReferences() []queReference {
	return queReferenceList
}
