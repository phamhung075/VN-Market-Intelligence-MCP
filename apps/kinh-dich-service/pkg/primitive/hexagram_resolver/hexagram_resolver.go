// Package hexagram_resolver provides pure functions for resolving hexagram numbers
// from 6 binary line signals via trigram lookup tables.
//
// Fence-A: pure compute only — all lookup tables embedded inline, no I/O.
// Zero imports from application, interface, infrastructure, or module layers.
//
// R-FENCE: This file is the Phase 2 G4 deliberate-violation target.
// Phase 2 G4 will inject a Fence-A violation to verify depguard catches it.
package hexagram_resolver

import "fmt"

// trigramLines maps trigram name to its [3]int binary pattern.
var trigramLines = map[string][3]int{
	"Qian": {1, 1, 1},
	"Dui":  {1, 1, 0},
	"Li":   {1, 0, 1},
	"Zhen": {1, 0, 0},
	"Xun":  {0, 1, 1},
	"Kan":  {0, 1, 0},
	"Gen":  {0, 0, 1},
	"Kun":  {0, 0, 0},
}

// queMeta stores hexagram metadata for building the lookup map.
type queMeta struct {
	id    int
	upper string
	lower string
}

// All 64 hexagrams with their upper and lower trigram names.
var queMetaList = []queMeta{
	{1, "Qian", "Qian"}, {2, "Kun", "Kun"}, {3, "Kan", "Zhen"}, {4, "Gen", "Kan"},
	{5, "Kan", "Qian"}, {6, "Qian", "Kan"}, {7, "Kun", "Kan"}, {8, "Kan", "Kun"},
	{9, "Xun", "Qian"}, {10, "Qian", "Dui"}, {11, "Kun", "Qian"}, {12, "Qian", "Kun"},
	{13, "Qian", "Li"}, {14, "Li", "Qian"}, {15, "Kun", "Gen"}, {16, "Zhen", "Kun"},
	{17, "Dui", "Zhen"}, {18, "Gen", "Xun"}, {19, "Kun", "Dui"}, {20, "Xun", "Kun"},
	{21, "Li", "Zhen"}, {22, "Gen", "Li"}, {23, "Gen", "Kun"}, {24, "Kun", "Zhen"},
	{25, "Qian", "Zhen"}, {26, "Gen", "Qian"}, {27, "Gen", "Zhen"}, {28, "Dui", "Xun"},
	{29, "Kan", "Kan"}, {30, "Li", "Li"}, {31, "Dui", "Gen"}, {32, "Zhen", "Xun"},
	{33, "Qian", "Gen"}, {34, "Zhen", "Qian"}, {35, "Li", "Kun"}, {36, "Kun", "Li"},
	{37, "Xun", "Li"}, {38, "Li", "Dui"}, {39, "Kan", "Gen"}, {40, "Zhen", "Kan"},
	{41, "Gen", "Dui"}, {42, "Xun", "Zhen"}, {43, "Dui", "Qian"}, {44, "Qian", "Xun"},
	{45, "Dui", "Kun"}, {46, "Kun", "Xun"}, {47, "Dui", "Kan"}, {48, "Kan", "Xun"},
	{49, "Dui", "Li"}, {50, "Li", "Xun"}, {51, "Zhen", "Zhen"}, {52, "Gen", "Gen"},
	{53, "Xun", "Gen"}, {54, "Zhen", "Dui"}, {55, "Zhen", "Li"}, {56, "Li", "Gen"},
	{57, "Xun", "Xun"}, {58, "Dui", "Dui"}, {59, "Xun", "Kan"}, {60, "Kan", "Dui"},
	{61, "Xun", "Dui"}, {62, "Zhen", "Gen"}, {63, "Kan", "Li"}, {64, "Li", "Kan"},
}

// linesToTrigram maps "b0,b1,b2" string to trigram name.
var linesToTrigram map[string]string

// trigramsToQue maps "upper|lower" string to hexagram id.
var trigramsToQue map[string]int

func init() {
	// Build linesToTrigram map
	linesToTrigram = make(map[string]string)
	for name, bits := range trigramLines {
		key := fmt.Sprintf("%d,%d,%d", bits[0], bits[1], bits[2])
		linesToTrigram[key] = name
	}

	// Build trigramsToQue map
	trigramsToQue = make(map[string]int)
	for _, meta := range queMetaList {
		key := fmt.Sprintf("%s|%s", meta.upper, meta.lower)
		trigramsToQue[key] = meta.id
	}
}

// ResolveHexagram resolves a hexagram number from 6 binary line signals.
//
// Parameters:
//   - signals: 6-element slice of binary values (0 | 1).
//     signals[0..2] = lower trigram (bottom 3 lines)
//     signals[3..5] = upper trigram (top 3 lines)
//
// Returns:
//   - hexagram number in range 1-64
//   - error if input length != 6 or trigram pattern is unknown
func ResolveHexagram(signals []int) (int, error) {
	if len(signals) != 6 {
		return 0, fmt.Errorf("resolveHexagram requires exactly 6 signals, got %d", len(signals))
	}

	lowerKey := fmt.Sprintf("%d,%d,%d", signals[0], signals[1], signals[2])
	upperKey := fmt.Sprintf("%d,%d,%d", signals[3], signals[4], signals[5])

	lowerName, ok := linesToTrigram[lowerKey]
	if !ok {
		return 0, fmt.Errorf("unknown trigram pattern lower=%s upper=%s", lowerKey, upperKey)
	}

	upperName, ok := linesToTrigram[upperKey]
	if !ok {
		return 0, fmt.Errorf("unknown trigram pattern lower=%s upper=%s", lowerKey, upperKey)
	}

	queKey := fmt.Sprintf("%s|%s", upperName, lowerName)
	queID, ok := trigramsToQue[queKey]
	if !ok {
		return 0, fmt.Errorf("unknown trigram pattern upper=%s lower=%s", upperName, lowerName)
	}

	return queID, nil
}

// HexagramCount returns the total number of hexagrams in the lookup table.
// Used for verification that all 64 entries are present.
func HexagramCount() int {
	return len(trigramsToQue)
}
