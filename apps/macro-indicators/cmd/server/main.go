// Package main — macro-indicators composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No business logic.
//
// P2-X3: DI wiring complete — infrastructure adapters injected into use case,
// use case injected into router. All routes live, 501 stubs resolved.
//
// VMT-2 (BOP): BOPUseCase wired with VpsFetchAdapter + BOP parser + URL builder.
// Route POST /bop added to RouterConfig. No excelize dep (pure JSON API, PROBE-2).
//
// VMT-3b (GSO/IIP): MacroIndicatorsGSOUseCase wired with NSOExcelFetcher + IIP parser.
// Route POST /macro-indicators added. excelize dep added (NSO Excel parse, Entry 10).
//
// VMT-4 (CPI): CPIComponentsUseCase wired with shared NSOExcelFetcher + CPI parser.
// Route POST /cpi-components added. Shares NSOExcelFetcher instance with VMT-3b.
// CPI weights=null, is_estimate=true (architect handoff § VMT-4 weights_policy).
//
// VMT-1a + VMT-1b (trade balance + bloc_split): TradeBalanceUseCase wired with SHARED
// NSOExcelFetcher (same instance as VMT-3b + VMT-4 — Entry 11, cache hit within 6h TTL).
// Route POST /trade-balance added. No new excelize dep (reuses existing from A2).
// trade totals + HS breakdown: is_estimate=false (VMT-1a, primary NSO source).
// bloc_split FDI share: is_estimate=true PERMANENT (VMT-1b, ARCH Decision A).
//
// VMT-5a (liquidity-state): LiquidityStateUseCase wired with policyRatesAdapter
// (SBV HTML direct + sbv_rates DB fallback) and SJCGoldFXAdapter (market.db reads only).
// Route POST /liquidity-state added. No new excelize dep (HTML + SQLite only).
// policy_rates: SBV HTML (direct, no VPS proxy); fallback = sbv_rates DB.
// sjc_gold_gap + fx_coupling: EXISTING market.db reads (DD-7, no new crawl).
// irs: is_estimate=true PERMANENT (DD-6, HNX OTC IRS not machine-readable).
//
// VMT-5b (interbank+OMO): extends POST /liquidity-state — no new route.
// omo: SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy); omoAdapter.
// interbank_1w: PERMANENTLY blocked (architect Decision B — dttktt.sbv.gov.vn 100% packet loss).
// is_estimate=true + rate_1w_pct=null PERMANENT. No fetch attempted. go.mod UNCHANGED.
//
// Sandbox security (charter §Security Clause macro-specific addition):
// reads ZERO secrets — only PORT (default 5004) and LOG_LEVEL (default "INFO").
// No DB credentials, no API keys, no external service credentials in this process env.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
	"github.com/vn-market-intelligence/macro-indicators/pkg/infrastructure"
	iface "github.com/vn-market-intelligence/macro-indicators/pkg/interface/http"

	_ "modernc.org/sqlite"
)

func main() {
	port := envStr("PORT", "5004")
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	// DI wiring: select commodity adapter based on COMMODITY_LIVE_MODE env gate.
	// Fence-C: only this file (cmd/server/main.go) imports pkg/infrastructure.
	// COMMODITY_LIVE_MODE unset/false → HTTPCommodityFetcher (fixture, sandbox-safe DEFAULT).
	// COMMODITY_LIVE_MODE=true → SQLiteCommodityRepository (reads live market.db).
	var commodityFetcher domain.CommodityFetcherPort
	if os.Getenv("COMMODITY_LIVE_MODE") == "true" {
		commodityFetcher = infrastructure.NewSQLiteCommodityRepository()
	} else {
		commodityFetcher = infrastructure.NewHTTPCommodityFetcher("")
	}
	sbvRateRepo := infrastructure.NewSBVRateSQLiteAdapter()
	marketIndexRepo := infrastructure.NewSQLiteMarketIndexRepository()
	// DPI-2b: inject CarryYieldInputsSQLiteAdapter — reads live deposit/fed/earningYield
	// from market.db so carry/yield regimes recompute from real data, not frozen fixtures.
	carryYieldRepo := infrastructure.NewCarryYieldInputsSQLiteAdapter()
	useCase := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, marketIndexRepo, carryYieldRepo)

	// VMT-2: BOP use case wiring.
	// Fence-C: only this file imports pkg/infrastructure.
	// Adapter closures bridge the application-layer interfaces (BOPParser, BOPURLBuilder) to
	// the concrete infrastructure functions without pkg/infrastructure importing pkg/application.
	// All adapter types are defined here (composition root) to respect DDD layer isolation.
	vpsFetchAdapter := infrastructure.NewVpsFetchAdapter(logger)
	bopParser := &bopParserAdapter{}
	bopURLBuilder := &bopURLBuilderAdapter{}
	bopUseCase := application.NewBOPUseCase(vpsFetchAdapter, bopParser, bopURLBuilder)

	// VMT-3b (GSO/IIP) + VMT-4 (CPI): shared NSO Excel cache+fetcher.
	// Entry 11 (sprint-VN-MACRO-TOOLING.md): ONE NSOExcelFetcher instance serves both.
	// DB_PATH: path to market.db (read-write for macro_vmt_cache table).
	dbPath := envStr("DB_PATH", "/app/data/market.db")
	nsoExcelFetcher := infrastructure.NewNSOExcelFetcher(vpsFetchAdapter, dbPath)

	// VMT-3b: GSO/IIP use case wiring.
	iipParser := &iipParserAdapter{}
	macroIndicatorsGSOUseCase := application.NewMacroIndicatorsGSOUseCase(nsoExcelFetcher, iipParser)

	// VMT-4: CPI use case wiring (shares the same nsoExcelFetcher).
	cpiParser := &cpiParserAdapter{}
	cpiComponentsUseCase := application.NewCPIComponentsUseCase(nsoExcelFetcher, cpiParser)

	// VMT-1a + VMT-1b: trade-balance use case wiring (shares the SAME nsoExcelFetcher).
	// Entry 11 (REUSE): getOrFetchNSOMonthlyExcel is a cache HIT within 6h TTL.
	// No new excelize dep, no new fetcher (reuse A2 infrastructure).
	tradeParser := &tradeBalanceParserAdapter{}
	tradeBalanceUseCase := application.NewTradeBalanceUseCase(nsoExcelFetcher, tradeParser)

	// VMT-5a + VMT-5b: liquidity-state use case wiring.
	// policyRatesAdapter: SBV HTML direct fetch (www.sbv.gov.vn, no VPS proxy) + sbv_rates DB fallback.
	// sjcGoldFXAdapter: reads EXISTING market.db commodity_prices + sbv_rates (DD-7, no new crawl).
	// omoAdapter: SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy, VMT-5b).
	// interbank_1w: PERMANENTLY blocked (architect Decision B) — no adapter needed (domain builds it).
	// No new excelize dep (HTML + SQLite only). go.mod UNCHANGED.
	liquidityPolicyAdapter := &policyRatesAdapter{logger: logger}
	liquiditySJCFXAdapter := &sjcFXAdapter{inner: infrastructure.NewSJCGoldFXAdapter()}
	liquidityOMOAdapter := &omoAdapter{logger: logger}
	liquidityStateUseCase := application.NewLiquidityStateUseCase(liquidityPolicyAdapter, liquiditySJCFXAdapter, liquidityOMOAdapter)

	router := iface.NewRouter(iface.RouterConfig{
		Snapshot:           useCase,
		BOP:                bopUseCase,
		MacroIndicatorsGSO: macroIndicatorsGSOUseCase,
		CPIComponents:      cpiComponentsUseCase,
		TradeBalance:       tradeBalanceUseCase,
		LiquidityState:     liquidityStateUseCase,
		Logger:             logger,
	})

	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	idleConnsClosed := make(chan struct{})
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		sig := <-quit
		slog.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("HTTP server shutdown error", "error", err)
		}
		close(idleConnsClosed)
	}()

	slog.Info("macro-indicators starting", "port", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("HTTP server error", "error", err)
		os.Exit(1)
	}
	<-idleConnsClosed
	slog.Info("macro-indicators stopped")
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ---------------------------------------------------------------------------
// VMT-2 composition-root adapters
//
// These types bridge the application-layer interfaces (BOPParser, BOPURLBuilder)
// to the concrete infrastructure functions WITHOUT pkg/infrastructure importing
// pkg/application (which would be a DDD Fence-B violation).
//
// They live here — the composition root (cmd/server/main.go) is the only file
// allowed to import BOTH pkg/application AND pkg/infrastructure (Fence-C).
// ---------------------------------------------------------------------------

// bopParserAdapter implements application.BOPParser using infrastructure.ParseBOPResponse.
// Composition-root type: lives in cmd/server/main.go (Fence-C compliant).
type bopParserAdapter struct{}

// Parse delegates to infrastructure.ParseBOPResponse.
// Returns domain.BOPRecord — satisfies the application.BOPParser interface.
func (a *bopParserAdapter) Parse(body []byte) (domain.BOPRecord, error) {
	return infrastructure.ParseBOPResponse(body)
}

// bopURLBuilderAdapter implements application.BOPURLBuilder using infrastructure helpers.
// Composition-root type: lives in cmd/server/main.go (Fence-C compliant).
type bopURLBuilderAdapter struct{}

// BuildURL delegates to infrastructure.BuildBOPFetchURL.
func (b *bopURLBuilderAdapter) BuildURL(start, end string) string {
	return infrastructure.BuildBOPFetchURL(start, end)
}

// QuarterWindow delegates to infrastructure.CurrentQuarterWindow.
func (b *bopURLBuilderAdapter) QuarterWindow(t time.Time) (string, string) {
	return infrastructure.CurrentQuarterWindow(t)
}

// PrevQuarterWindow delegates to infrastructure.PrevQuarterWindow.
func (b *bopURLBuilderAdapter) PrevQuarterWindow(t time.Time) (string, string) {
	return infrastructure.PrevQuarterWindow(t)
}

// ---------------------------------------------------------------------------
// VMT-3b + VMT-4 composition-root adapters
//
// These bridge application.IIPParser and application.CPIParser to the concrete
// infrastructure parser functions without pkg/infrastructure importing pkg/application.
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// iipParserAdapter implements application.IIPParser using infrastructure.ParseIIPFromExcel.
type iipParserAdapter struct{}

// ParseIIP delegates to infrastructure.ParseIIPFromExcel.
// Returns domain.MacroIndicatorsGSORecord — satisfies the application.IIPParser interface.
func (a *iipParserAdapter) ParseIIP(excelBytes []byte, period string) (domain.MacroIndicatorsGSORecord, error) {
	return infrastructure.ParseIIPFromExcel(excelBytes, period)
}

// cpiParserAdapter implements application.CPIParser using infrastructure.ParseCPIFromExcel.
type cpiParserAdapter struct{}

// ParseCPI delegates to infrastructure.ParseCPIFromExcel.
// Returns domain.CPIRecord — satisfies the application.CPIParser interface.
func (c *cpiParserAdapter) ParseCPI(excelBytes []byte, period string) (domain.CPIRecord, error) {
	return infrastructure.ParseCPIFromExcel(excelBytes, period)
}

// ---------------------------------------------------------------------------
// VMT-1a + VMT-1b composition-root adapter
//
// Bridges application.TradeBalanceParser to the concrete infrastructure parser
// without pkg/infrastructure importing pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// tradeBalanceParserAdapter implements application.TradeBalanceParser
// using infrastructure.ParseTradeBalanceFromExcel.
// Composition-root type: lives in cmd/server/main.go (Fence-C compliant).
type tradeBalanceParserAdapter struct{}

// ParseTradeBalance delegates to infrastructure.ParseTradeBalanceFromExcel.
// Returns domain.TradeBalanceRecord — satisfies the application.TradeBalanceParser interface.
func (t *tradeBalanceParserAdapter) ParseTradeBalance(excelBytes []byte, period string) (domain.TradeBalanceRecord, error) {
	return infrastructure.ParseTradeBalanceFromExcel(excelBytes, period)
}

// ---------------------------------------------------------------------------
// VMT-5a composition-root adapters
//
// These bridge the application-layer interfaces (PolicyRatesProvider, SJCFXProvider)
// to the concrete infrastructure functions without pkg/infrastructure importing
// pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// policyRatesAdapter implements application.PolicyRatesProvider.
// Fetches SBV policy rates from HTML (direct, www.sbv.gov.vn — no VPS proxy needed).
// Falls back to sbv_rates DB values when HTML parse fails.
type policyRatesAdapter struct {
	logger *slog.Logger
}

// FetchPolicyRates implements application.PolicyRatesProvider.
// Primary: SBV HTML direct fetch → parse refi + discount + lombard rates.
// Fallback: sbv_rates DB table (refi + discount only; lombard = 0 in fallback).
// is_estimate=false on HTML success; is_estimate=true on fallback.
func (a *policyRatesAdapter) FetchPolicyRates(ctx context.Context) (domain.PolicyRates, error) {
	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	htmlResult, fetchErr := infrastructure.FetchSBVPolicyRatesFromHTML(ctx)
	if fetchErr == nil && htmlResult.ParseOK {
		// HTML fetch + parse succeeded.
		return domain.PolicyRates{
			RefiRatePct:     htmlResult.RefiRatePct,
			DiscountRatePct: htmlResult.DiscountRatePct,
			LombardRatePct:  htmlResult.LombardRatePct,
			Source:          "www.sbv.gov.vn Liferay HTML (direct, no VPS proxy)",
			FetchedAt:       fetchedAt,
			IsEstimate:      false, // primary source confirmed
		}, nil
	}

	// HTML fetch failed or parse returned ParseOK=false → fall back to DB.
	if a.logger != nil {
		a.logger.Warn("sbv_policy_rates: HTML fetch/parse failed, falling back to sbv_rates DB",
			slog.Any("fetch_err", fetchErr),
			slog.Bool("parse_ok", htmlResult.ParseOK),
		)
	}

	dbResult := infrastructure.FetchSBVPolicyRatesFromDB(ctx)
	if dbResult.OK {
		return domain.PolicyRates{
			RefiRatePct:     dbResult.RefiRatePct,
			DiscountRatePct: dbResult.DiscountRatePct,
			LombardRatePct:  0, // not in sbv_rates table
			Source:          "sbv_rates DB fallback (HTML parse failed)",
			FetchedAt:       dbResult.FetchedAt,
			IsEstimate:      true, // fallback path = is_estimate=true
		}, nil
	}

	// Both HTML and DB failed — return zero-value with is_estimate=true (fail-closed).
	return domain.PolicyRates{
		IsEstimate: true,
		Source:     "no source available (HTML + DB both failed)",
		FetchedAt:  fetchedAt,
	}, fmt.Errorf("sbv_policy_rates: HTML fetch/parse failed and DB fallback empty")
}

// sjcFXAdapter implements application.SJCFXProvider.
// Bridges infrastructure.SJCGoldFXAdapter → application.SJCFXInputs (Fence-C).
type sjcFXAdapter struct {
	inner *infrastructure.SJCGoldFXAdapter
}

// FetchInputs implements application.SJCFXProvider.
// Converts infrastructure.SJCFXInputs → application.SJCFXInputs.
func (a *sjcFXAdapter) FetchInputs(ctx context.Context) (application.SJCFXInputs, error) {
	infraInputs, err := a.inner.FetchInputs(ctx)
	if err != nil {
		return application.SJCFXInputs{}, err
	}
	return application.SJCFXInputs{
		GoldUSDPerOz:  infraInputs.GoldUSDPerOz,
		USDVNDRate:    infraInputs.USDVNDRate,
		DXY:           infraInputs.DXY,
		CNYVNDRate:    infraInputs.CNYVNDRate,
		SBVCenterRate: infraInputs.SBVCenterRate,
		SBVFetchedAt:  infraInputs.SBVFetchedAt,
		SJCPriceMnVND: infraInputs.SJCPriceMnVND,
	}, nil
}

// ---------------------------------------------------------------------------
// VMT-5b composition-root adapter
//
// Bridges application.OMOProvider to the concrete infrastructure function
// infrastructure.FetchSBVOMOFromHTML without pkg/infrastructure importing
// pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// omoAdapter implements application.OMOProvider using infrastructure.FetchSBVOMOFromHTML.
// Fetches the SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy).
// Fail-closed: ParseOK=false → use case calls domain.BuildOMOFailed (is_estimate=true).
type omoAdapter struct {
	logger *slog.Logger
}

// FetchOMO implements application.OMOProvider.
// Delegates to infrastructure.FetchSBVOMOFromHTML and converts OMOParseResult → application.OMOInputs.
// Returns ParseOK=false on any fetch or parse error (fail-closed).
func (a *omoAdapter) FetchOMO(ctx context.Context) (application.OMOInputs, error) {
	result, err := infrastructure.FetchSBVOMOFromHTML(ctx)
	if err != nil {
		if a.logger != nil {
			a.logger.Warn("sbv_omo: fetch/parse failed", slog.Any("error", err))
		}
		return application.OMOInputs{
			ParseOK:    false,
			ParseError: err.Error(),
		}, err
	}
	if !result.ParseOK {
		if a.logger != nil {
			a.logger.Warn("sbv_omo: parse returned ParseOK=false (no add/absorb rows found)")
		}
		return application.OMOInputs{
			ParseOK:    false,
			ParseError: "OMO HTML parse: no add/absorb rows found",
		}, nil
	}
	return application.OMOInputs{
		TotalAddBnVND:    result.TotalAddBnVND,
		TotalAbsorbBnVND: result.TotalAbsorbBnVND,
		AuctionDate:      result.AuctionDate,
		ParseOK:          result.ParseOK,
	}, nil
}
