// capability_manifest.go — capability-manifest types (capabilityManifestEntry,
// systemMapFragment) and loadManifest, the system-map.json reader/parser that
// feeds CapabilityProber. Split from capability_prober.go per
// FACTORY-APIGW-split-capability-prober.
package infrastructure

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
)

// ── Manifest types ─────────────────────────────────────────────────────────────

// capabilityManifestEntry mirrors one entry in capability_manifest in system-map.json.
type capabilityManifestEntry struct {
	Capability     domain.CapabilityStatus `json:"capability"`
	ProbeType      string                  `json:"probe_type"`
	Probe          *string                 `json:"probe"` // null for probe_type "none"
	CapabilityNote string                  `json:"capability_note,omitempty"`
}

// systemMapFragment is the minimal shape of system-map.json needed to read
// the capability_manifest.  The manifest map is decoded as raw JSON first so
// that metadata string keys (e.g. "_note", "_ground_truth_date") are silently
// skipped rather than causing a type-mismatch unmarshal error.
type systemMapFragment struct {
	Project struct {
		Infrastructure struct {
			Docker struct {
				HostRuntimeSet struct {
					CapabilityManifest map[string]json.RawMessage `json:"capability_manifest"`
				} `json:"host_runtime_set"`
			} `json:"docker"`
		} `json:"infrastructure"`
	} `json:"project"`
}

// ── Manifest loading ───────────────────────────────────────────────────────────

// loadManifest reads and parses system-map.json on first call; cached after that.
// Must be called with p.mu held.
//
// The capability_manifest object may contain metadata string keys (e.g. "_note",
// "_ground_truth_date") alongside service-entry object keys.  Each raw value is
// decoded individually; non-object values (strings, numbers) are silently skipped
// so that metadata keys never abort the load with a type-mismatch error.
func (p *CapabilityProber) loadManifest() (map[string]*capabilityManifestEntry, error) {
	if p.manifest != nil {
		return p.manifest, nil
	}

	data, err := os.ReadFile(p.systemMapPath)
	if err != nil {
		return nil, fmt.Errorf("capability_manifest: read %s: %w", p.systemMapPath, err)
	}

	var fragment systemMapFragment
	if err := json.Unmarshal(data, &fragment); err != nil {
		return nil, fmt.Errorf("capability_manifest: parse %s: %w", p.systemMapPath, err)
	}

	rawMap := fragment.Project.Infrastructure.Docker.HostRuntimeSet.CapabilityManifest
	if len(rawMap) == 0 {
		return nil, fmt.Errorf("capability_manifest: empty or missing in %s", p.systemMapPath)
	}

	// Decode each value individually.  Skip keys whose value is not a JSON object
	// (e.g. "_note" / "_ground_truth_date" metadata strings).
	m := make(map[string]*capabilityManifestEntry, len(rawMap))
	skipped := 0
	for key, raw := range rawMap {
		// A JSON object starts with '{'; anything else (string, number, null) is metadata.
		if len(raw) == 0 || raw[0] != '{' {
			skipped++
			continue
		}
		var entry capabilityManifestEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			// Malformed entry — skip rather than aborting the whole load.
			skipped++
			continue
		}
		m[key] = &entry
	}

	if len(m) == 0 {
		return nil, fmt.Errorf("capability_manifest: no valid service entries found in %s (skipped %d non-object keys)", p.systemMapPath, skipped)
	}

	// Startup diagnostic: always log how many entries were loaded so silent-empty
	// is never invisible in production logs.
	slog.Info("capability_manifest loaded",
		"path", p.systemMapPath,
		"entries", len(m),
		"skipped_metadata_keys", skipped,
	)

	p.manifest = m
	return p.manifest, nil
}
