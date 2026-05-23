package pricestalenessclassifier_test

import (
	"testing"
	"time"

	classifier "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-staleness-classifier"
)

func mustParseRFC3339(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic("mustParseRFC3339: " + err.Error())
	}
	return t
}

func TestClassifyStaleness(t *testing.T) {
	t.Parallel()

	// Reference "now" used across all non-malformed test cases.
	now := mustParseRFC3339("2026-05-24T01:00:00Z")

	tests := []struct {
		name                 string
		fetchedAt            string
		now                  time.Time
		freshThresholdSeconds int
		staleThresholdSeconds int
		wantLabel            classifier.StalenessLabel
		wantErr              bool
	}{
		{
			// AC-2 row 1: recent timestamp within freshThreshold → FRESH
			name:                  "recent quote within freshThreshold is FRESH",
			fetchedAt:             "2026-05-24T00:59:30Z", // 30 seconds ago
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Fresh,
		},
		{
			// AC-2 row 2: timestamp between fresh and stale thresholds → STALE
			name:                  "quote between fresh and stale thresholds is STALE",
			fetchedAt:             "2026-05-24T00:58:30Z", // 90 seconds ago
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Stale,
		},
		{
			// AC-2 row 3: timestamp beyond staleThreshold → EXPIRED
			name:                  "quote beyond staleThreshold is EXPIRED",
			fetchedAt:             "2026-05-23T20:00:00Z", // 5 hours ago
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Expired,
		},
		{
			// AC-2 row 4: exactly at freshThreshold boundary → FRESH (≤ threshold)
			name:                  "quote exactly at freshThreshold boundary is FRESH",
			fetchedAt:             "2026-05-24T00:59:00Z", // exactly 60 seconds ago
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Fresh,
		},
		{
			// AC-2 row 5: malformed RFC3339 string → returns error
			name:                  "malformed fetchedAt returns error",
			fetchedAt:             "not-a-date",
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantErr:               true,
		},
		{
			// Extra row: exactly at staleThreshold boundary → STALE (≤ threshold)
			name:                  "quote exactly at staleThreshold boundary is STALE",
			fetchedAt:             "2026-05-23T00:00:00Z", // well beyond both thresholds placeholder — override below
			now:                   now,
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Expired, // > 3600 s
		},
		{
			// Extra row: exactly 3600s ago → STALE (age == staleThreshold)
			name:                  "quote exactly at staleThreshold 3600s is STALE",
			fetchedAt:             "2026-05-23T00:00:00Z", // placeholder; override now
			now:                   mustParseRFC3339("2026-05-24T01:00:00Z"),
			freshThresholdSeconds: 60,
			staleThresholdSeconds: 3600,
			wantLabel:             classifier.Expired, // 25 hours > 3600
		},
	}

	// Override row index 5 and 6 with precise fetchedAt values.
	// Row 5 (index 5): 3601 seconds ago → EXPIRED
	tests[5].fetchedAt = now.Add(-3601 * time.Second).Format(time.RFC3339)
	tests[5].wantLabel = classifier.Expired

	// Row 6 (index 6): exactly 3600 seconds ago → STALE (age == staleThreshold ≤ threshold)
	tests[6].fetchedAt = now.Add(-3600 * time.Second).Format(time.RFC3339)
	tests[6].wantLabel = classifier.Stale

	for _, tt := range tests {
		tt := tt // capture range variable
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotLabel, gotErr := classifier.ClassifyStaleness(
				tt.fetchedAt,
				tt.now,
				tt.freshThresholdSeconds,
				tt.staleThresholdSeconds,
			)

			if tt.wantErr {
				if gotErr == nil {
					t.Errorf("ClassifyStaleness() err = nil, want non-nil error for fetchedAt=%q", tt.fetchedAt)
				}
				if gotLabel != "" {
					t.Errorf("ClassifyStaleness() label = %q, want empty on error", gotLabel)
				}
				return
			}

			if gotErr != nil {
				t.Errorf("ClassifyStaleness() unexpected error: %v", gotErr)
				return
			}
			if gotLabel != tt.wantLabel {
				t.Errorf("ClassifyStaleness() label = %q, want %q (fetchedAt=%q, now=%s, fresh=%d, stale=%d)",
					gotLabel, tt.wantLabel, tt.fetchedAt, tt.now.Format(time.RFC3339),
					tt.freshThresholdSeconds, tt.staleThresholdSeconds)
			}
		})
	}
}
