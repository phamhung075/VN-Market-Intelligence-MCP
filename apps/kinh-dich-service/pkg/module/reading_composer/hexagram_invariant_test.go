package reading_composer

import (
	"testing"
)

// TestQueDataMapInvariant verifies queDataMap has exactly 64 entries with valid keys 1..64.
func TestQueDataMapInvariant(t *testing.T) {
	if len(queDataMap) != 64 {
		t.Errorf("queDataMap: got %d entries, want 64", len(queDataMap))
	}

	for id := 1; id <= 64; id++ {
		data := queDataMap[id]
		if data == nil {
			t.Errorf("queDataMap[%d] is nil", id)
			continue
		}

		// Each entry must have exactly 6 lines
		if len(data.lines) != 6 {
			t.Errorf("queDataMap[%d].lines: got %d, want 6", id, len(data.lines))
		}

		// coreMeaning must be non-empty
		if data.coreMeaning == "" {
			t.Errorf("queDataMap[%d].coreMeaning is empty", id)
		}

		// trend must be non-empty
		if data.trend == "" {
			t.Errorf("queDataMap[%d].trend is empty", id)
		}

		// Each line must have non-empty outcome and action
		for i, line := range data.lines {
			if line.outcome == "" {
				t.Errorf("queDataMap[%d].lines[%d].outcome is empty", id, i)
			}
			if line.action == "" {
				t.Errorf("queDataMap[%d].lines[%d].action is empty", id, i)
			}
		}
	}
}

// TestQueMetaListInvariant verifies queMetaList has exactly 64 entries with IDs 1..64.
func TestQueMetaListInvariant(t *testing.T) {
	if len(queMetaList) != 64 {
		t.Errorf("queMetaList: got %d entries, want 64", len(queMetaList))
	}

	seenIDs := make(map[int]bool)
	for i, meta := range queMetaList {
		// Check ID in valid range
		if meta.id < 1 || meta.id > 64 {
			t.Errorf("queMetaList[%d].id=%d out of range [1,64]", i, meta.id)
		}

		// Check for duplicates
		if seenIDs[meta.id] {
			t.Errorf("queMetaList has duplicate id=%d", meta.id)
		}
		seenIDs[meta.id] = true

		// name must be non-empty
		if meta.name == "" {
			t.Errorf("queMetaList[%d] (id=%d): name is empty", i, meta.id)
		}

		// chinese must be non-empty
		if meta.chinese == "" {
			t.Errorf("queMetaList[%d] (id=%d): chinese is empty", i, meta.id)
		}

		// upper must be a valid trigram
		if _, ok := trigrams[meta.upper]; !ok {
			t.Errorf("queMetaList[%d] (id=%d): upper=%q is not a valid trigram", i, meta.id, meta.upper)
		}

		// lower must be a valid trigram
		if _, ok := trigrams[meta.lower]; !ok {
			t.Errorf("queMetaList[%d] (id=%d): lower=%q is not a valid trigram", i, meta.id, meta.lower)
		}
	}

	// Verify all IDs 1..64 are present
	for id := 1; id <= 64; id++ {
		if !seenIDs[id] {
			t.Errorf("queMetaList missing id=%d", id)
		}
	}
}

// TestGetAllQueReferencesInvariant verifies GetAllQueReferences returns exactly 64 entries
// with IDs 1..64, non-empty Name/Chinese, 6 Phases per entry, and resolved elements.
func TestGetAllQueReferencesInvariant(t *testing.T) {
	refs := GetAllQueReferences()

	if len(refs) != 64 {
		t.Errorf("GetAllQueReferences: got %d entries, want 64", len(refs))
	}

	seenIDs := make(map[int]bool)
	for i, ref := range refs {
		// ID in valid range
		if ref.ID < 1 || ref.ID > 64 {
			t.Errorf("GetAllQueReferences[%d].ID=%d out of range [1,64]", i, ref.ID)
		}

		// Check for duplicates
		if seenIDs[ref.ID] {
			t.Errorf("GetAllQueReferences has duplicate ID=%d", ref.ID)
		}
		seenIDs[ref.ID] = true

		// Name must be non-empty
		if ref.Name == "" {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): Name is empty", i, ref.ID)
		}

		// Chinese must be non-empty
		if ref.Chinese == "" {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): Chinese is empty", i, ref.ID)
		}

		// Phases must have exactly 6 entries
		if len(ref.Phases) != 6 {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): Phases has %d entries, want 6", i, ref.ID, len(ref.Phases))
		}

		// Each Phase must have valid data
		for j, phase := range ref.Phases {
			if phase.Phase != j+1 {
				t.Errorf("GetAllQueReferences[%d] (ID=%d) Phases[%d]: Phase=%d, want %d", i, ref.ID, j, phase.Phase, j+1)
			}
			if phase.Action == "" {
				t.Errorf("GetAllQueReferences[%d] (ID=%d) Phases[%d]: Action is empty", i, ref.ID, j)
			}
			if phase.Outcome == "" {
				t.Errorf("GetAllQueReferences[%d] (ID=%d) Phases[%d]: Outcome is empty", i, ref.ID, j)
			}
		}

		// UpperElement must be non-empty (resolved from trigram)
		if ref.UpperElement == "" {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): UpperElement is empty", i, ref.ID)
		}

		// LowerElement must be non-empty (resolved from trigram)
		if ref.LowerElement == "" {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): LowerElement is empty", i, ref.ID)
		}

		// UpperElement and LowerElement must be valid NguHanh elements
		validElements := map[string]bool{"Kim": true, "Moc": true, "Hoa": true, "Thuy": true, "Tho": true}
		if !validElements[ref.UpperElement] {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): UpperElement=%q is not a valid element", i, ref.ID, ref.UpperElement)
		}
		if !validElements[ref.LowerElement] {
			t.Errorf("GetAllQueReferences[%d] (ID=%d): LowerElement=%q is not a valid element", i, ref.ID, ref.LowerElement)
		}
	}

	// Verify all IDs 1..64 are present
	for id := 1; id <= 64; id++ {
		if !seenIDs[id] {
			t.Errorf("GetAllQueReferences missing ID=%d", id)
		}
	}
}

// TestTrigramsInvariant verifies all 8 trigrams are present with valid element and symbol.
func TestTrigramsInvariant(t *testing.T) {
	expectedTrigrams := []string{"Qian", "Dui", "Li", "Zhen", "Xun", "Kan", "Gen", "Kun"}
	validElements := map[string]bool{"Kim": true, "Moc": true, "Hoa": true, "Thuy": true, "Tho": true}

	if len(trigrams) != 8 {
		t.Errorf("trigrams: got %d entries, want 8", len(trigrams))
	}

	for _, name := range expectedTrigrams {
		trig, ok := trigrams[name]
		if !ok {
			t.Errorf("trigrams missing %q", name)
			continue
		}

		if trig.element == "" {
			t.Errorf("trigrams[%q].element is empty", name)
		}
		if !validElements[trig.element] {
			t.Errorf("trigrams[%q].element=%q is not a valid element", name, trig.element)
		}

		if trig.symbol == "" {
			t.Errorf("trigrams[%q].symbol is empty", name)
		}
	}
}

// TestQueMetaMapInvariant verifies queMetaMap provides O(1) lookup for all 64 hexagrams.
func TestQueMetaMapInvariant(t *testing.T) {
	if len(queMetaMap) != 64 {
		t.Errorf("queMetaMap: got %d entries, want 64", len(queMetaMap))
	}

	for id := 1; id <= 64; id++ {
		meta := getQueMeta(id)
		if meta == nil {
			t.Errorf("getQueMeta(%d) returned nil", id)
			continue
		}
		if meta.id != id {
			t.Errorf("getQueMeta(%d).id=%d, want %d", id, meta.id, id)
		}
	}
}

// TestQueReferenceMapInvariant verifies queReferenceMap provides O(1) lookup for all 64 hexagrams.
func TestQueReferenceMapInvariant(t *testing.T) {
	if len(queReferenceMap) != 64 {
		t.Errorf("queReferenceMap: got %d entries, want 64", len(queReferenceMap))
	}

	for id := 1; id <= 64; id++ {
		ref := GetQueReference(id)
		if ref == nil {
			t.Errorf("GetQueReference(%d) returned nil", id)
			continue
		}
		if ref.ID != id {
			t.Errorf("GetQueReference(%d).ID=%d, want %d", id, ref.ID, id)
		}
	}
}

// TestQueReferenceProseInvariant verifies localized prose fields are non-empty for all 64 hexagrams.
func TestQueReferenceProseInvariant(t *testing.T) {
	refs := GetAllQueReferences()

	for _, ref := range refs {
		// CoreMeaning must be non-empty in both languages
		if ref.CoreMeaning.En == "" {
			t.Errorf("ID=%d: CoreMeaning.En is empty", ref.ID)
		}
		if ref.CoreMeaning.Vi == "" {
			t.Errorf("ID=%d: CoreMeaning.Vi is empty", ref.ID)
		}

		// HoverSummary must be non-empty in both languages
		if ref.HoverSummary.En == "" {
			t.Errorf("ID=%d: HoverSummary.En is empty", ref.ID)
		}
		if ref.HoverSummary.Vi == "" {
			t.Errorf("ID=%d: HoverSummary.Vi is empty", ref.ID)
		}

		// StateInterpretation must be non-empty in both languages
		if ref.StateInterpretation.En == "" {
			t.Errorf("ID=%d: StateInterpretation.En is empty", ref.ID)
		}
		if ref.StateInterpretation.Vi == "" {
			t.Errorf("ID=%d: StateInterpretation.Vi is empty", ref.ID)
		}

		// Favorable must be non-empty in both languages
		if ref.Favorable.En == "" {
			t.Errorf("ID=%d: Favorable.En is empty", ref.ID)
		}
		if ref.Favorable.Vi == "" {
			t.Errorf("ID=%d: Favorable.Vi is empty", ref.ID)
		}

		// Warning must be non-empty in both languages
		if ref.Warning.En == "" {
			t.Errorf("ID=%d: Warning.En is empty", ref.ID)
		}
		if ref.Warning.Vi == "" {
			t.Errorf("ID=%d: Warning.Vi is empty", ref.ID)
		}

		// Each of 6 phases must have non-empty Gloss
		for j, phase := range ref.Phases {
			if phase.Gloss.En == "" {
				t.Errorf("ID=%d Phases[%d]: Gloss.En is empty", ref.ID, j)
			}
			if phase.Gloss.Vi == "" {
				t.Errorf("ID=%d Phases[%d]: Gloss.Vi is empty", ref.ID, j)
			}
		}
	}
}

// TestQueReferenceHexagram1Snapshot verifies hexagram 1 prose matches known values.
func TestQueReferenceHexagram1Snapshot(t *testing.T) {
	ref := GetQueReference(1)
	if ref == nil {
		t.Fatal("GetQueReference(1) returned nil")
	}

	// CoreMeaning EN snapshot
	wantCoreMeaningEn := "Pure creative force, strong yang energy advancing without rest"
	if ref.CoreMeaning.En != wantCoreMeaningEn {
		t.Errorf("ID=1 CoreMeaning.En:\ngot  %q\nwant %q", ref.CoreMeaning.En, wantCoreMeaningEn)
	}

	// First phase gloss snapshot
	if len(ref.Phases) != 6 {
		t.Fatalf("ID=1 Phases: got %d, want 6", len(ref.Phases))
	}
	wantPhase1GlossEn := "Hidden potential phase — accumulate resources, do not act yet"
	if ref.Phases[0].Gloss.En != wantPhase1GlossEn {
		t.Errorf("ID=1 Phases[0].Gloss.En:\ngot  %q\nwant %q", ref.Phases[0].Gloss.En, wantPhase1GlossEn)
	}
}
