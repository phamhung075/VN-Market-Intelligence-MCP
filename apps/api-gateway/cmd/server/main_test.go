// Package main — unit tests for composition-root helpers.
// Tests serviceURLOverrides: the FACTORY-APIGW-dedup-default-urls sparse-map
// builder that lets StaticServiceRegistry (pkg/infrastructure/registry.go)
// remain the sole SSOT for default docker-compose URLs — this file must never
// duplicate the 9-entry default-URL literal again.
package main

import (
	"testing"
)

// TestServiceURLOverrides_AllUnset verifies that when none of the known
// service env vars are set, the sparse map is empty — every key is left for
// StaticServiceRegistry's own get(key, fallback) to fill in.
func TestServiceURLOverrides_AllUnset(t *testing.T) {
	for _, envVar := range serviceEnvVars {
		t.Setenv(envVar, "")
	}

	got := serviceURLOverrides()
	if len(got) != 0 {
		t.Fatalf("expected empty sparse map when no env vars set, got %v", got)
	}
}

// TestServiceURLOverrides_OnlySetKeysIncluded verifies that only keys whose
// env var is actually non-empty appear in the returned map, with the exact
// override value — every other known key must be absent.
func TestServiceURLOverrides_OnlySetKeysIncluded(t *testing.T) {
	for _, envVar := range serviceEnvVars {
		t.Setenv(envVar, "")
	}
	t.Setenv("PDF_URL", "http://localhost:9001")
	t.Setenv("ALERT_URL", "http://localhost:9006")

	got := serviceURLOverrides()

	want := map[string]string{
		"pdf":   "http://localhost:9001",
		"alert": "http://localhost:9006",
	}
	if len(got) != len(want) {
		t.Fatalf("expected exactly %v, got %v", want, got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("key %q: expected %q, got %q", k, v, got[k])
		}
	}
}

// TestServiceURLOverrides_AllSet verifies that when every known env var is
// set (the docker-compose.yml deployed shape), the sparse map is fully
// populated with the exact override values — matching the pre-refactor
// literal's resolved output 1:1.
func TestServiceURLOverrides_AllSet(t *testing.T) {
	want := map[string]string{
		"mcp":       "http://mcp-server:3000",
		"pdf":       "http://pdf-extractor:5001",
		"rag":       "http://rag-service:5002",
		"ta":        "http://technical-analysis:5003",
		"macro":     "http://macro-indicators:5004",
		"stock":     "http://stock-price:5000",
		"kinh-dich": "http://kinh-dich-service:5005",
		"alert":     "http://alert-engine:5006",
		"news":      "http://news-fetch:5008",
	}
	for key, envVar := range serviceEnvVars {
		t.Setenv(envVar, want[key])
	}

	got := serviceURLOverrides()
	if len(got) != len(want) {
		t.Fatalf("expected %d keys, got %d: %v", len(want), len(got), got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("key %q: expected %q, got %q", k, v, got[k])
		}
	}
}

// TestServiceURLOverrides_APIKeyNeverPresent verifies "api" is never a key in
// the returned map — it is a virtual alias with no dedicated env var; its
// default (and any override) is resolved entirely inside
// StaticServiceRegistry via get("api", mcpURL).
func TestServiceURLOverrides_APIKeyNeverPresent(t *testing.T) {
	for _, envVar := range serviceEnvVars {
		t.Setenv(envVar, "http://example:1")
	}

	got := serviceURLOverrides()
	if _, ok := got["api"]; ok {
		t.Error(`expected "api" key to never be present in serviceURLOverrides()`)
	}
}
