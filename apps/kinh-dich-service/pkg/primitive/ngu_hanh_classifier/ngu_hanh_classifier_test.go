package ngu_hanh_classifier

import "testing"

// TestClassifyNguHanh_Golden tests the golden case: Thuy generates Moc.
// Matches scenario: ngu-hanh-classifier-golden.json
func TestClassifyNguHanh_Golden(t *testing.T) {
	result := ClassifyNguHanh("Thuy", "Moc")

	if result.Dynamic != TUONG_SINH {
		t.Errorf("expected dynamic TUONG_SINH, got %s", result.Dynamic)
	}

	if result.Score != 0.3 {
		t.Errorf("expected score 0.3, got %f", result.Score)
	}
}

// TestClassifyNguHanh_Edge tests same element case: Kim + Kim.
// Matches scenario: ngu-hanh-classifier-edge.json
func TestClassifyNguHanh_Edge(t *testing.T) {
	result := ClassifyNguHanh("Kim", "Kim")

	if result.Dynamic != SAME {
		t.Errorf("expected dynamic SAME, got %s", result.Dynamic)
	}

	if result.Score != 0.1 {
		t.Errorf("expected score 0.1, got %f", result.Score)
	}
}

// TestClassifyNguHanh_Failure tests unknown element case.
// Matches scenario: ngu-hanh-classifier-failure.json
func TestClassifyNguHanh_Failure(t *testing.T) {
	result := ClassifyNguHanh("InvalidElement", "Moc")

	if result.Dynamic != NEUTRAL {
		t.Errorf("expected dynamic NEUTRAL, got %s", result.Dynamic)
	}

	if result.Score != 0.0 {
		t.Errorf("expected score 0.0, got %f", result.Score)
	}
}

// TestGenerationCycle verifies the five-element generation cycle.
func TestGenerationCycle(t *testing.T) {
	tests := []struct {
		lower    string
		upper    string
		dynamic  NguHanhDynamic
		minScore float64
	}{
		// Lower generates upper (score 0.3)
		{"Moc", "Hoa", TUONG_SINH, 0.3},
		{"Hoa", "Tho", TUONG_SINH, 0.3},
		{"Tho", "Kim", TUONG_SINH, 0.3},
		{"Kim", "Thuy", TUONG_SINH, 0.3},
		{"Thuy", "Moc", TUONG_SINH, 0.3},
		// Upper generates lower (score 0.2)
		{"Hoa", "Moc", TUONG_SINH, 0.2},
		{"Tho", "Hoa", TUONG_SINH, 0.2},
		{"Kim", "Tho", TUONG_SINH, 0.2},
		{"Thuy", "Kim", TUONG_SINH, 0.2},
		{"Moc", "Thuy", TUONG_SINH, 0.2},
	}

	for _, tc := range tests {
		t.Run(tc.lower+"-"+tc.upper, func(t *testing.T) {
			result := ClassifyNguHanh(tc.lower, tc.upper)
			if result.Dynamic != tc.dynamic {
				t.Errorf("expected %s, got %s", tc.dynamic, result.Dynamic)
			}
			if result.Score != tc.minScore {
				t.Errorf("expected score %f, got %f", tc.minScore, result.Score)
			}
		})
	}
}

// TestDestructionCycle verifies the five-element destruction cycle.
func TestDestructionCycle(t *testing.T) {
	tests := []struct {
		lower   string
		upper   string
		dynamic NguHanhDynamic
	}{
		// Lower destroys upper
		{"Moc", "Tho", TUONG_KHAC},
		{"Tho", "Thuy", TUONG_KHAC},
		{"Thuy", "Hoa", TUONG_KHAC},
		{"Hoa", "Kim", TUONG_KHAC},
		{"Kim", "Moc", TUONG_KHAC},
		// Upper destroys lower
		{"Tho", "Moc", TUONG_KHAC},
		{"Thuy", "Tho", TUONG_KHAC},
		{"Hoa", "Thuy", TUONG_KHAC},
		{"Kim", "Hoa", TUONG_KHAC},
		{"Moc", "Kim", TUONG_KHAC},
	}

	for _, tc := range tests {
		t.Run(tc.lower+"-"+tc.upper, func(t *testing.T) {
			result := ClassifyNguHanh(tc.lower, tc.upper)
			if result.Dynamic != tc.dynamic {
				t.Errorf("expected %s, got %s", tc.dynamic, result.Dynamic)
			}
			if result.Score != -0.3 {
				t.Errorf("expected score -0.3, got %f", result.Score)
			}
		})
	}
}

// TestSameElement verifies same element returns SAME with score 0.1.
func TestSameElement(t *testing.T) {
	elements := []string{"Kim", "Moc", "Thuy", "Hoa", "Tho"}

	for _, el := range elements {
		t.Run(el+"-"+el, func(t *testing.T) {
			result := ClassifyNguHanh(el, el)
			if result.Dynamic != SAME {
				t.Errorf("expected SAME, got %s", result.Dynamic)
			}
			if result.Score != 0.1 {
				t.Errorf("expected score 0.1, got %f", result.Score)
			}
		})
	}
}

// TestUnknownElements verifies unknown elements return NEUTRAL.
func TestUnknownElements(t *testing.T) {
	tests := []struct {
		lower string
		upper string
	}{
		{"Unknown", "Kim"},
		{"Kim", "Unknown"},
		{"Invalid", "NotValid"},
		{"", "Kim"},
		{"Kim", ""},
	}

	for _, tc := range tests {
		t.Run(tc.lower+"-"+tc.upper, func(t *testing.T) {
			result := ClassifyNguHanh(tc.lower, tc.upper)
			if result.Dynamic != NEUTRAL {
				t.Errorf("expected NEUTRAL, got %s", result.Dynamic)
			}
			if result.Score != 0.0 {
				t.Errorf("expected score 0.0, got %f", result.Score)
			}
		})
	}
}
