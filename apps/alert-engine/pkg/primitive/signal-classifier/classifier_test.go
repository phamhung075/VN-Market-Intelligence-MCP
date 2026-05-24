package signalclassifier_test

import (
	"testing"

	sc "github.com/vn-market-intelligence/alert-engine/pkg/primitive/signal-classifier"
)

func TestClassify(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		wantSeverity sc.AlertSeverity
		wantChannel  sc.TelegramChannel
		wantValid    bool
	}{
		{
			name:         "high routes to market and is valid",
			input:        "high",
			wantSeverity: sc.SeverityHigh,
			wantChannel:  sc.ChannelMarket,
			wantValid:    true,
		},
		{
			name:         "critical routes to market and is valid",
			input:        "critical",
			wantSeverity: sc.SeverityCritical,
			wantChannel:  sc.ChannelMarket,
			wantValid:    true,
		},
		{
			name:         "low routes to work and is valid",
			input:        "low",
			wantSeverity: sc.SeverityLow,
			wantChannel:  sc.ChannelWork,
			wantValid:    true,
		},
		{
			name:         "medium routes to work and is valid",
			input:        "medium",
			wantSeverity: sc.SeverityMedium,
			wantChannel:  sc.ChannelWork,
			wantValid:    true,
		},
		{
			name:         "INVALID is not valid",
			input:        "INVALID",
			wantSeverity: "",
			wantChannel:  "",
			wantValid:    false,
		},
		{
			name:         "empty string is not valid",
			input:        "",
			wantSeverity: "",
			wantChannel:  "",
			wantValid:    false,
		},
		{
			name:         "mixed case HIGH is not valid (case-sensitive)",
			input:        "HIGH",
			wantSeverity: "",
			wantChannel:  "",
			wantValid:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sc.Classify(tt.input)
			if got.Valid != tt.wantValid {
				t.Errorf("Classify(%q).Valid = %v, want %v", tt.input, got.Valid, tt.wantValid)
			}
			if got.Severity != tt.wantSeverity {
				t.Errorf("Classify(%q).Severity = %q, want %q", tt.input, got.Severity, tt.wantSeverity)
			}
			if got.Channel != tt.wantChannel {
				t.Errorf("Classify(%q).Channel = %q, want %q", tt.input, got.Channel, tt.wantChannel)
			}
		})
	}
}
