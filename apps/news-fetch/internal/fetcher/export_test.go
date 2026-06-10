// export_test.go — exposes internal helpers for white-box testing.
// This file is compiled only during `go test`; it does not appear in production builds.
package fetcher

// TestDedupKey exposes the internal dedupKey function for unit tests.
var TestDedupKey = dedupKey

// TestNormalizeRFC exposes the internal normalizeRFC function for unit tests.
var TestNormalizeRFC = normalizeRFC
