// Package http — GET /health handler.
// FACTORY-TECHANALYSIS-fix-discarded-service-and-port: extracted out of
// router.go (file-per-handler convention already used by
// momentum_handler.go, money_flow_handler.go, proximity_handler.go,
// relative_strength_handler.go, volatility_handler.go) to keep router.go
// under the size-lint 120L cap — FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L.
package http

import (
	"encoding/json"
	"net/http"
)

// defaultPort is the service's documented default (see cmd/server/main.go
// header comment). Used by handleHealth when RouterConfig.Port is empty or
// not a valid integer — e.g. sandbox/test callers that don't wire a real
// listener port.
const defaultPort = 5003

// healthResponse is the JSON body for GET /health.
type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Port    int    `json:"port"`
}

// handleHealth builds the /health body once (the port is fixed for the
// process lifetime) via a struct + json.Marshal, from the real bound port.
func handleHealth(port int) http.HandlerFunc {
	body, err := json.Marshal(healthResponse{Status: "ok", Service: "technical-analysis", Port: port})
	if err != nil {
		// Unreachable in practice (healthResponse always marshals cleanly) —
		// fail safe rather than panic.
		body = []byte(`{"status":"ok","service":"technical-analysis"}`)
	}
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}
