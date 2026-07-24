// capability_probe.go — probeHealthEndpoint (GET/2xx) and probeMcpTool (JSON-RPC
// tools/call, SSE-aware), the two concrete probes CapabilityProber.runProbe
// dispatches to. Split from capability_prober.go per FACTORY-APIGW-split-capability-prober.
//
// size-justification: 130L — the mcp_tool probe alone (types + probeMcpTool)
// is ~65L of inherently sequential HTTP-request/response handling (build body
// → POST → bound-read → content-type branch → JSON-RPC envelope check); pairing
// it with the smaller probeHealthEndpoint keeps "the two probe_type implementations"
// as one file per the task's own file-seam spec rather than fragmenting one
// probe's request/response types away from the function that uses them.
package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Health-endpoint probe ──────────────────────────────────────────────────────

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

// ── MCP tool probe ─────────────────────────────────────────────────────────────

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
	if strings.HasPrefix(ct, "text/event-stream") {
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
