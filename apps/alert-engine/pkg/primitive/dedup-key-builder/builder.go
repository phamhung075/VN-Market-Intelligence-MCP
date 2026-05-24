// Package dedupkeybuilder is a pure primitive that produces a stable dedup
// fingerprint (key) for an alert.
//
// Fence-A: imports only stdlib (fmt, sort, strings). No infrastructure, no
// application, no interface, no CGO extensions, no credential values of any kind.
//
// The fingerprint mirrors brownfield domain.ComputeFingerprint exactly:
//   - raw = stock + "|" + sorted(signalTypes, joined ",") + "|" + first-50-rune(message)
//   - djb2 hash: seed=5381 (uint32), hash = ((hash<<5)+hash) ^ charCode, 8-hex lowercase.
//
// The djb2 seed (5381) is a CRITICAL constant — a wrong seed yields a different
// fingerprint and breaks deduplication in production. Output is byte-identical to
// the TS computeFingerprint for the same inputs.
package dedupkeybuilder

import (
	"fmt"
	"sort"
	"strings"
)

// djb2Seed is the canonical djb2 initial hash value. Do not change.
const djb2Seed uint32 = 5381

// messagePrefixRunes is the number of leading Unicode runes of the message
// folded into the fingerprint.
const messagePrefixRunes = 50

// djb2Hash implements the djb2 algorithm exactly matching the TS port:
//
//	seed=5381, hash = ((hash<<5)+hash) ^ charCode, unsigned 32-bit, 8-hex lowercase.
//
// Unexported (package-private) per AC-1.
func djb2Hash(s string) string {
	hash := djb2Seed
	for _, ch := range s {
		hash = ((hash << 5) + hash) ^ uint32(ch)
	}
	return fmt.Sprintf("%08x", hash)
}

// BuildKey produces a stable dedup fingerprint for an alert.
// stock + sorted(signalTypes) + message prefix (50 runes) → djb2 8-hex lowercase.
//
// signalTypes are sorted alphabetically (stable) and joined with "," before
// hashing, so two alerts with the same set of signals in any order produce the
// same key. The message contributes only its first 50 Unicode runes.
//
// Pure function — no I/O, no env reads, no network, no DB. Deterministic:
// identical inputs always yield identical output.
//
// Must produce byte-identical output to the TS computeFingerprint and the
// brownfield Go domain.ComputeFingerprint for the same inputs.
func BuildKey(stock string, signalTypes []string, message string) string {
	sorted := make([]string, len(signalTypes))
	copy(sorted, signalTypes)
	sort.Strings(sorted)
	signalsPart := strings.Join(sorted, ",")

	messagePart := message
	if len([]rune(messagePart)) > messagePrefixRunes {
		runes := []rune(messagePart)
		messagePart = string(runes[:messagePrefixRunes])
	}

	raw := stock + "|" + signalsPart + "|" + messagePart
	return djb2Hash(raw)
}
