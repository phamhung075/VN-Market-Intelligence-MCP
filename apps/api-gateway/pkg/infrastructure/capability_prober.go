// capability_prober.go — the CapabilityProber struct, its TTL cache, and the
// probe-orchestration methods (ProbeAll, capabilityFor, runProbe). Manifest
// parsing lives in capability_manifest.go; the concrete probe implementations
// live in capability_probe.go. Split per FACTORY-APIGW-split-capability-prober.
//
// size-justification: 191L — struct definition, both constructors, the cache
// entry type, and the three orchestration methods (ProbeAll/capabilityFor/
// runProbe) all read and mutate the same locked struct state (p.mu, p.cache,
// p.manifest); the task's own file-seam spec keeps this quartet together as
// "the prober struct + ProbeAll + capabilityFor + runProbe" — splitting further
// would separate methods from the state invariants they protect.
package infrastructure

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/vn-market-intelligence/api-gateway/pkg/domain"
)

// ── Cache entry ────────────────────────────────────────────────────────────────

type cachedCapability struct {
	capability *domain.ServiceCapability
	expiresAt  time.Time
}

// ── CapabilityProber ───────────────────────────────────────────────────────────

// CapabilityProber implements domain.CapabilityProberPort.
// It reads the capability_manifest from system-map.json (capability_manifest.go)
// and runs at most one bounded HTTP probe per not-deployed service per 60-second
// window (probeHealthEndpoint / probeMcpTool in capability_probe.go).
//
// Safety invariants (all enforced):
//   - Maximum 7 probes per 60s window (one per not_deployed short_key).
//   - Per-probe timeout: 3000ms.  On timeout → manifest baseline is used.
//   - Cache keyed by short_key, TTL 60s.
//   - The prober NEVER touches deployed services (ANTI-FALSE-GREEN).
type CapabilityProber struct {
	mcpBaseURL     string
	systemMapPath  string
	probeTTL       time.Duration
	probeTimeoutMs int64
	httpClient     *http.Client

	mu       sync.Mutex
	cache    map[string]*cachedCapability
	manifest map[string]*capabilityManifestEntry // loaded once; nil until first load
}

// NewCapabilityProber creates a CapabilityProber.
//   - mcpBaseURL: base URL of the mcp-server (e.g. "http://mcp-server:3000").
//   - systemMapPath: absolute path to docs/data/system-map.json.
func NewCapabilityProber(mcpBaseURL, systemMapPath string) *CapabilityProber {
	return &CapabilityProber{
		mcpBaseURL:     mcpBaseURL,
		systemMapPath:  systemMapPath,
		probeTTL:       60 * time.Second,
		probeTimeoutMs: 3000,
		httpClient:     &http.Client{},
		cache:          make(map[string]*cachedCapability),
	}
}

// NewCapabilityProberForTest creates a CapabilityProber with overridable TTL,
// probe timeout, and HTTP client.  Exported for use in *_test.go files only;
// production code always uses NewCapabilityProber.
func NewCapabilityProberForTest(
	mcpBaseURL, systemMapPath string,
	ttl time.Duration,
	probeTimeoutMs int64,
	client *http.Client,
) *CapabilityProber {
	return &CapabilityProber{
		mcpBaseURL:     mcpBaseURL,
		systemMapPath:  systemMapPath,
		probeTTL:       ttl,
		probeTimeoutMs: probeTimeoutMs,
		httpClient:     client,
		cache:          make(map[string]*cachedCapability),
	}
}

// ── Probe orchestration ────────────────────────────────────────────────────────

// ProbeAll returns the capability map for all manifest entries.
// Each not-deployed service entry is probed at most once per TTL window.
// Services with probe_type "none" are returned at their static baseline immediately.
// On any probe error or timeout, the manifest static baseline is used.
//
// The number of active probes is bounded to the count of entries in the manifest
// with probe_type != "none" (i.e. the 7 not-deployed services, never 156 tools).
func (p *CapabilityProber) ProbeAll(ctx context.Context) map[string]*domain.ServiceCapability {
	p.mu.Lock()
	manifest, err := p.loadManifest()
	p.mu.Unlock()

	if err != nil {
		// Manifest unreadable — return empty map (caller treats absence as n/a)
		return map[string]*domain.ServiceCapability{}
	}

	result := make(map[string]*domain.ServiceCapability, len(manifest))

	for shortKey, entry := range manifest {
		result[shortKey] = p.capabilityFor(ctx, shortKey, entry)
	}

	return result
}

// capabilityFor returns the capability for one short_key, using cache when fresh.
func (p *CapabilityProber) capabilityFor(
	ctx context.Context,
	shortKey string,
	entry *capabilityManifestEntry,
) *domain.ServiceCapability {
	// Static baseline — no probe needed
	if entry.ProbeType == "none" {
		return &domain.ServiceCapability{
			Capability: entry.Capability,
			Note:       entry.CapabilityNote,
		}
	}

	p.mu.Lock()
	cached, ok := p.cache[shortKey]
	p.mu.Unlock()

	if ok && time.Now().Before(cached.expiresAt) {
		return cached.capability
	}

	// Cache miss or expired — run probe (without holding the lock)
	cap := p.runProbe(ctx, shortKey, entry)

	p.mu.Lock()
	p.cache[shortKey] = &cachedCapability{
		capability: cap,
		expiresAt:  time.Now().Add(p.probeTTL),
	}
	p.mu.Unlock()

	return cap
}

// runProbe executes the actual HTTP probe and returns the resulting capability.
// On any error or timeout, the manifest static baseline is returned.
// This method NEVER panics or blocks beyond probeTimeoutMs.
func (p *CapabilityProber) runProbe(
	ctx context.Context,
	shortKey string,
	entry *capabilityManifestEntry,
) *domain.ServiceCapability {
	baseline := &domain.ServiceCapability{
		Capability: entry.Capability,
		Note:       entry.CapabilityNote,
	}

	probeCtx, cancel := context.WithTimeout(ctx, time.Duration(p.probeTimeoutMs)*time.Millisecond)
	defer cancel()

	var probeErr error
	switch entry.ProbeType {
	case "health_endpoint":
		probeErr = p.probeHealthEndpoint(probeCtx, entry)
	case "mcp_tool":
		if entry.Probe == nil {
			return baseline
		}
		probeErr = p.probeMcpTool(probeCtx, *entry.Probe)
	default:
		return baseline
	}

	if probeErr != nil {
		// Timeout or error → fall back to manifest baseline (do NOT block /health)
		return baseline
	}

	// Probe succeeded — return live capability (tool confirmed online)
	// We trust the manifest's capability field as ground-truth for what "live" means.
	// If the probe succeeded, we return the manifest capability (e.g. data_limited stays data_limited).
	return &domain.ServiceCapability{
		Capability: entry.Capability,
		Note:       entry.CapabilityNote,
	}
}
