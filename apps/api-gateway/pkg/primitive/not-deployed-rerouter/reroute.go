// Package notdeployedrerouter provides a pure function for rewriting paths
// from not-deployed microservice slots to the mcp-server fallback endpoints.
//
// Zero I/O — stdlib only; no net/http or httputil imports.
// No import from pkg/domain — primitives are the base tier and must not
// create circular dependencies with domain-layer consumers.
package notdeployedrerouter

import "strings"

// Reroute maps an incoming not-deployed-service path to the mcp-server
// target path.  Returns the full rewritten path (including query string)
// when a mapping exists, or ("", false) when no mcp-server fallback is
// defined for that service.
//
// Path-rewrite table:
//
//	/kinh-dich/market                    → /mcp/api/kinh-dich/market
//	/kinh-dich/reading/{code}            → /mcp/api/kinh-dich/reading/{code}
//	/stock/price/history?code=X&days=N   → /mcp/api/prices/history?code=X&days=N
//	/stock/price/batch?tickers=X,Y       → /mcp/api/prices/batch?tickers=X,Y
//	/news/reuters/headlines              → /mcp/api/news/headlines?source=reuters
//	/news/bloomberg/headlines            → /mcp/api/news/headlines?source=bloomberg
//
// For services with no mcp equivalent (e.g. "ta", "pdf", "rag", "alert"),
// the function returns ("", false) — the caller must emit an honest 503.
//
// The rawQuery argument MUST be the raw query string (r.URL.RawQuery), NOT
// URL-encoded.  Pass "" when there is no query string.
func Reroute(originalPath, rawQuery, serviceName string) (string, bool) {
	switch serviceName {
	case "kinh-dich":
		// /kinh-dich/market           → /mcp/api/kinh-dich/market
		// /kinh-dich/reading/FPT      → /mcp/api/kinh-dich/reading/FPT
		suffix := strings.TrimPrefix(originalPath, "/kinh-dich")
		return "/mcp/api/kinh-dich" + suffix + queryPart(rawQuery), true

	case "stock":
		// /stock/price/history?...    → /mcp/api/prices/history?...
		// /stock/price/batch?...      → /mcp/api/prices/batch?...
		suffix := strings.TrimPrefix(originalPath, "/stock/price")
		return "/mcp/api/prices" + suffix + queryPart(rawQuery), true

	case "news":
		// /news/reuters/headlines     → /mcp/api/news/headlines?source=reuters
		// /news/bloomberg/headlines   → /mcp/api/news/headlines?source=bloomberg
		// Strip the leading "/news/" prefix, then take the first segment as source.
		inner := strings.TrimPrefix(originalPath, "/news/")
		parts := strings.SplitN(inner, "/", 2)
		source := parts[0] // e.g. "reuters", "bloomberg"
		base := "/mcp/api/news/headlines?source=" + source
		if rawQuery != "" {
			base += "&" + rawQuery
		}
		return base, true

	default:
		// No mcp-server fallback for this service (ta, pdf, rag, alert, …).
		return "", false
	}
}

// queryPart returns "?"+rawQuery when rawQuery is non-empty, else "".
func queryPart(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return "?" + rawQuery
}
