package notdeployedrerouter_test

import (
	"testing"

	rerouter "github.com/vn-market-intelligence/api-gateway/pkg/primitive/not-deployed-rerouter"
)

// ── kinh-dich rewrites ───────────────────────────────────────────────────────

func TestReroute_KinhDich_Market(t *testing.T) {
	got, ok := rerouter.Reroute("/kinh-dich/market", "", "kinh-dich")
	if !ok {
		t.Fatal("expected ok=true for kinh-dich/market")
	}
	want := "/mcp/api/kinh-dich/market"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_KinhDich_ReadingFPT(t *testing.T) {
	got, ok := rerouter.Reroute("/kinh-dich/reading/FPT", "", "kinh-dich")
	if !ok {
		t.Fatal("expected ok=true for kinh-dich/reading/FPT")
	}
	want := "/mcp/api/kinh-dich/reading/FPT"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_KinhDich_ReadingVCB(t *testing.T) {
	got, ok := rerouter.Reroute("/kinh-dich/reading/VCB", "", "kinh-dich")
	if !ok {
		t.Fatal("expected ok=true for kinh-dich/reading/VCB")
	}
	want := "/mcp/api/kinh-dich/reading/VCB"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ── stock rewrites ────────────────────────────────────────────────────────────

func TestReroute_Stock_PriceHistory_WithQuery(t *testing.T) {
	got, ok := rerouter.Reroute("/stock/price/history", "code=VNINDEX&days=30", "stock")
	if !ok {
		t.Fatal("expected ok=true for stock/price/history")
	}
	want := "/mcp/api/prices/history?code=VNINDEX&days=30"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_Stock_PriceBatch_WithQuery(t *testing.T) {
	got, ok := rerouter.Reroute("/stock/price/batch", "tickers=FPT,VNM,HPG", "stock")
	if !ok {
		t.Fatal("expected ok=true for stock/price/batch")
	}
	want := "/mcp/api/prices/batch?tickers=FPT,VNM,HPG"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_Stock_PriceHistory_NoQuery(t *testing.T) {
	got, ok := rerouter.Reroute("/stock/price/history", "", "stock")
	if !ok {
		t.Fatal("expected ok=true")
	}
	want := "/mcp/api/prices/history"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ── news rewrites ─────────────────────────────────────────────────────────────

func TestReroute_News_Reuters(t *testing.T) {
	got, ok := rerouter.Reroute("/news/reuters/headlines", "", "news")
	if !ok {
		t.Fatal("expected ok=true for news/reuters/headlines")
	}
	want := "/mcp/api/news/headlines?source=reuters"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_News_Bloomberg(t *testing.T) {
	got, ok := rerouter.Reroute("/news/bloomberg/headlines", "", "news")
	if !ok {
		t.Fatal("expected ok=true for news/bloomberg/headlines")
	}
	want := "/mcp/api/news/headlines?source=bloomberg"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestReroute_News_PreservesExtraQuery(t *testing.T) {
	got, ok := rerouter.Reroute("/news/reuters/headlines", "limit=5", "news")
	if !ok {
		t.Fatal("expected ok=true")
	}
	want := "/mcp/api/news/headlines?source=reuters&limit=5"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ── no-mapping cases → 503 contract (ok=false) ───────────────────────────────

func TestReroute_TA_NoMapping(t *testing.T) {
	_, ok := rerouter.Reroute("/ta/indicators", "", "ta")
	if ok {
		t.Error("expected ok=false for ta (no mcp fallback)")
	}
}

func TestReroute_PDF_NoMapping(t *testing.T) {
	_, ok := rerouter.Reroute("/pdf/extract", "", "pdf")
	if ok {
		t.Error("expected ok=false for pdf (no mcp fallback)")
	}
}

func TestReroute_RAG_NoMapping(t *testing.T) {
	_, ok := rerouter.Reroute("/rag/search", "", "rag")
	if ok {
		t.Error("expected ok=false for rag (no mcp fallback)")
	}
}

func TestReroute_Alert_NoMapping(t *testing.T) {
	_, ok := rerouter.Reroute("/alert/fire", "", "alert")
	if ok {
		t.Error("expected ok=false for alert (no mcp fallback)")
	}
}

// ── anti-regression: deployed/virtual paths must NOT pass through rerouter ───
//
// These service names should NEVER reach Reroute() in production — the
// handler only calls Reroute when IsNotDeployed() is true.  But to prove
// the primitive is safe we call it directly and verify the "no-mapping"
// path falls through to default (ok=false) so callers can detect the bug.

func TestReroute_Macro_IsNotInSwitch(t *testing.T) {
	_, ok := rerouter.Reroute("/macro/snapshot", "", "macro")
	if ok {
		t.Error("macro must not be rerouted (it is deployed); Reroute must return ok=false")
	}
}

func TestReroute_MCP_IsNotInSwitch(t *testing.T) {
	_, ok := rerouter.Reroute("/mcp/api/signals", "", "mcp")
	if ok {
		t.Error("mcp must not be rerouted (it is deployed); Reroute must return ok=false")
	}
}
