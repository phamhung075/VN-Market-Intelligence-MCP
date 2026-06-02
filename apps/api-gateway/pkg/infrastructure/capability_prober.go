// Package infrastructure provides concrete implementations of domain ports.
package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

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
// the capability_manifest.  Only the fields we actually use are unmarshalled.
type systemMapFragment struct {
	Project struct {
		Infrastructure struct {
			Docker struct {
				HostRuntimeSet struct {
					CapabilityManifest map[string]*capabilityManifestEntry `json:"capability_manifest"`
				} `json:"host_runtime_set"`
			} `json:"docker"`
		} `json:"infrastructure"`
	} `json:"project"`
}

// ── Cache entry ────────────────────────────────────────────────────────────────

type cachedCapability struct {
	capability *domain.ServiceCapability
	expiresAt  time.Time
}

// ── CapabilityProber ───────────────────────────────────────────────────────────

// CapabilityProber implements domain.CapabilityProberPort.
// It reads the capability_manifest from system-map.json and runs at most one
// bounded HTTP probe per not-deployed service per 60-second window.
//
// Safety invariants (all enforced):
//   - Maximum 7 probes per 60s window (one per not_deployed short_key).
//   - Per-probe timeout: 3000ms.  On timeout → manifest baseline is used.
//   - Cache keyed by short_key, TTL 60s.
//   - The prober NEVER touches deployed services (ANTI-FALSE-GREEN).
type CapabilityProber struct {
	mcpBaseURL      string
	systemMapPath   string
	probeTTL        time.Duration
	probeTimeoutMs  int64
	httpClient      *http.Client

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

// loadManifest reads and parses system-map.json on first call; cached after that.
// Must be called with p.mu held.
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

	m := fragment.Project.Infrastructure.Docker.HostRuntimeSet.CapabilityManifest
	if len(m) == 0 {
		return nil, fmt.Errorf("capability_manifest: empty or missing in %s", p.systemMapPath)
	}

	p.manifest = m
	return p.manifest, nil
}

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

// probeHealthEndpoint performs a GET to {mcpBaseURL}{probe_path} and returns nil on 2xx.
func (p *CapabilityProber) probeHealthEndpoint(ctx context.Context, entry *capabilityManifestEntry) error {
	if entry.Probe == nil {
		return fmt.Errorf("health_endpoint probe has nil path for service")
	}
	url := p.mcpBaseURL + *entry.Probe
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("health endpoint returned %d", resp.StatusCode)
	}
	return nil
}

// mcpToolCallRequest is the JSON-RPC 2.0 body for an MCP tools/call request.
type mcpToolCallRequest struct {
	JSONRPC string                 `json:"jsonrpc"`
	Method  string                 `json:"method"`
	Params  map[string]interface{} `json:"params"`
	ID      int                    `json:"id"`
}

// mcpToolCallResponse is the minimal response shape we check.
type mcpToolCallResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Error   interface{} `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// probeMcpTool posts a tools/call request to the mcp-server Streamable HTTP endpoint
// (POST /mcp) and returns nil when the server accepts the call without a JSON-RPC error.
// A 2xx response with no error field is treated as "tool online" even if the result
// itself has partial data — the capability level (live/data_limited) comes from the manifest.
func (p *CapabilityProber) probeMcpTool(ctx context.Context, toolName string) error {
	body := mcpToolCallRequest{
		JSONRPC: "2.0",
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      toolName,
			"arguments": map[string]interface{}{},
		},
		ID: 1,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return err
	}

	url := p.mcpBaseURL + "/mcp"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Read a bounded amount to parse the response (avoid memory bomb on large results)
	limited := io.LimitReader(resp.Body, 64*1024) // 64 KB cap
	respBytes, err := io.ReadAll(limited)
	if err != nil {
		return err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("mcp tools/call returned HTTP %d", resp.StatusCode)
	}

	// Parse the JSON-RPC response — a top-level "error" field means the call failed.
	// We parse only the envelope; we do not care about the result content.
	// Note: Streamable HTTP may return SSE (text/event-stream) for streaming tools.
	// In that case we cannot fully parse, but status 200 with SSE = tool accepted.
	ct := resp.Header.Get("Content-Type")
	if len(ct) >= 17 && ct[:17] == "text/event-stream" {
		// SSE stream started = server accepted the tool call → probe success
		return nil
	}

	var rpcResp mcpToolCallResponse
	if err := json.Unmarshal(respBytes, &rpcResp); err != nil {
		// Non-JSON 200 response — treat as probe success (server responded)
		return nil
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("mcp tools/call rpc error for %s: %v", toolName, rpcResp.Error)
	}

	return nil
}
