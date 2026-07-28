package domain

import "testing"

// FACTORY-ALERT-dedup-window-config: DedupWindowMinutes is a named field,
// distinct from CooldownMinutes — the dedup window must not silently reuse
// the (unrelated) cooldown window value. Default 60 mirrors the live
// mcp.config.json `alertQuality.dedupWindowMinutes` (see
// apps/mcp-server/src/infrastructure/config.ts numVal(aq, "dedupWindowMinutes", 60)),
// the confirmed real TS-side default — kept separate from CooldownMinutes=30
// (alertQuality.cooldownMinutes) and MaxAlertsPerStockPerDay=3.
func TestDefaultCooldownConfig_DedupWindowMinutes(t *testing.T) {
	if DefaultCooldownConfig.DedupWindowMinutes != 60 {
		t.Errorf("DefaultCooldownConfig.DedupWindowMinutes=%d want=60 (mcp.config.json alertQuality.dedupWindowMinutes)", DefaultCooldownConfig.DedupWindowMinutes)
	}
	if DefaultCooldownConfig.DedupWindowMinutes == DefaultCooldownConfig.CooldownMinutes {
		t.Errorf("DedupWindowMinutes (%d) must stay a distinct named window from CooldownMinutes (%d), not an accidental reuse", DefaultCooldownConfig.DedupWindowMinutes, DefaultCooldownConfig.CooldownMinutes)
	}
}
