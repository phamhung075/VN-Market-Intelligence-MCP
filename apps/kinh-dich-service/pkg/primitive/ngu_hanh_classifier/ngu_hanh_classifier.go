// Package ngu_hanh_classifier provides pure functions for classifying the
// Ngu Hanh (Five Elements) interaction between lower and upper trigram elements.
//
// Fence-A: pure compute only — lookup tables embedded inline, no I/O.
// Zero imports from application, interface, infrastructure, or module layers.
package ngu_hanh_classifier

// NguHanh represents one of the five elements.
type NguHanh string

const (
	Kim  NguHanh = "Kim"
	Moc  NguHanh = "Moc"
	Thuy NguHanh = "Thuy"
	Hoa  NguHanh = "Hoa"
	Tho  NguHanh = "Tho"
)

// NguHanhDynamic represents the dynamic relationship between two elements.
type NguHanhDynamic string

const (
	TUONG_SINH NguHanhDynamic = "TUONG_SINH" // Generation cycle
	TUONG_KHAC NguHanhDynamic = "TUONG_KHAC" // Destruction cycle
	SAME       NguHanhDynamic = "SAME"       // Same element
	NEUTRAL    NguHanhDynamic = "NEUTRAL"    // No special interaction or unknown
)

// NguHanhResult contains the classification result.
type NguHanhResult struct {
	Lower          NguHanh        `json:"lower"`
	Upper          NguHanh        `json:"upper"`
	Dynamic        NguHanhDynamic `json:"dynamic"`
	Score          float64        `json:"score"`
	Interpretation string         `json:"interpretation"`
}

// generation maps each element to the element it generates.
// Five-element generation cycle: Moc -> Hoa -> Tho -> Kim -> Thuy -> Moc
var generation = map[NguHanh]NguHanh{
	Moc:  Hoa,
	Hoa:  Tho,
	Tho:  Kim,
	Kim:  Thuy,
	Thuy: Moc,
}

// destruction maps each element to the element it destroys.
// Five-element destruction cycle: Moc -> Tho -> Thuy -> Hoa -> Kim -> Moc
var destruction = map[NguHanh]NguHanh{
	Moc:  Tho,
	Tho:  Thuy,
	Thuy: Hoa,
	Hoa:  Kim,
	Kim:  Moc,
}

// validNguHanh is a set of valid NguHanh values for input validation.
var validNguHanh = map[string]NguHanh{
	"Kim":  Kim,
	"Moc":  Moc,
	"Thuy": Thuy,
	"Hoa":  Hoa,
	"Tho":  Tho,
}

// ClassifyNguHanh classifies the Ngu Hanh interaction between lower and upper
// trigram elements.
//
// Returns NguHanhResult with dynamic relationship, score, and interpretation.
//
// Unknown/invalid element strings return NEUTRAL (score 0.0) — documented choice:
// returning a neutral classification is safer than throwing for downstream
// pipeline callers that may receive raw, unvalidated market data strings.
func ClassifyNguHanh(lower, upper string) NguHanhResult {
	// Validate inputs
	lowerEl, lowerOK := validNguHanh[lower]
	upperEl, upperOK := validNguHanh[upper]

	// Unknown input -> NEUTRAL (documented choice: no throw)
	if !lowerOK || !upperOK {
		// Default to Tho for display if unknown
		if !lowerOK {
			lowerEl = Tho
		}
		if !upperOK {
			upperEl = Tho
		}
		return NguHanhResult{
			Lower:          lowerEl,
			Upper:          upperEl,
			Dynamic:        NEUTRAL,
			Score:          0.0,
			Interpretation: "Phan tu khong xac dinh — trung tinh mac dinh",
		}
	}

	var dynamic NguHanhDynamic
	var score float64
	var interpretation string

	switch {
	case lowerEl == upperEl:
		dynamic = SAME
		score = 0.1
		interpretation = "Cung hanh — tang cuong xu huong hien tai"
	case generation[lowerEl] == upperEl:
		dynamic = TUONG_SINH
		score = 0.3
		interpretation = "Noi luc sinh ngoai luc — xu huong ben vung"
	case generation[upperEl] == lowerEl:
		dynamic = TUONG_SINH
		score = 0.2
		interpretation = "Ngoai luc ho tro noi luc — moi truong thuan loi"
	case destruction[lowerEl] == upperEl:
		dynamic = TUONG_KHAC
		score = -0.3
		interpretation = "Noi luc khac ngoai luc — mau thuan noi tai"
	case destruction[upperEl] == lowerEl:
		dynamic = TUONG_KHAC
		score = -0.3
		interpretation = "Ngoai luc triet tieu noi luc — ap luc ben ngoai"
	default:
		dynamic = NEUTRAL
		score = 0.0
		interpretation = "Trung tinh — khong tuong tac dac biet"
	}

	return NguHanhResult{
		Lower:          lowerEl,
		Upper:          upperEl,
		Dynamic:        dynamic,
		Score:          score,
		Interpretation: interpretation,
	}
}
