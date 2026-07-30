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
// VMT-5a (liquidity-state): LiquidityStateUseCase wired with application.PolicyRatesResolver
// (SBV HTML direct + sbv_rates DB fallback, FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL) and
// SJCGoldFXAdapter (market.db reads only).
// Route POST /liquidity-state added. No new excelize dep (HTML + SQLite only).
// policy_rates: SBV HTML (direct, no VPS proxy); fallback = sbv_rates DB.
// sjc_gold_gap + fx_coupling: EXISTING market.db reads (DD-7, no new crawl).
// irs: is_estimate=true PERMANENT (DD-6, HNX OTC IRS not machine-readable).
//
// VMT-5b (interbank+OMO): extends POST /liquidity-state — no new route.
// omo: SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy);
// application.omoResolver wraps omoRawAdapter (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL).
// interbank_1w: PERMANENTLY blocked (architect Decision B — dttktt.sbv.gov.vn 100% packet loss).
// is_estimate=true + rate_1w_pct=null PERMANENT. No fetch attempted. go.mod UNCHANGED.
//
// Sandbox security (charter §Security Clause macro-specific addition):
// reads ZERO secrets — only PORT (default 5004) and LOG_LEVEL (default "INFO").
// No DB credentials, no API keys, no external service credentials in this process env.
//
// Composition-root adapter shim types moved to the sibling adapters.go
// (FACTORY-MACRO-split-or-justify-over-cap, 2026-07-24) — see that file's doc comment.
//
// size-justification: ~208L — func main is ONE composition-root wiring sequence: it
// must construct every adapter (7 VMT feature slices' worth) in dependency order and
// pass them to exactly one use-case constructor each, then start the HTTP server. G3
// (see line 4) forbids this file from doing anything BUT DI wiring + server startup —
// there is no independent sub-concern inside main() to extract; splitting the wiring
// sequence across files would only obscure the single startup order this function
// documents inline (each VMT-N comment block explains why its adapters are constructed
// where they are). adapters.go already absorbed the one genuinely separable piece (the
// shim type declarations).
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
	// S2-DATA-HONESTY: inject SQLiteCommodityHistoryRepository — reads prev-session
	// commodity close from commodity_prices_history for oil/gold/usdVnd delta computation.
	commodityHistoryRepo := infrastructure.NewSQLiteCommodityHistoryRepository()
	useCase := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, marketIndexRepo, carryYieldRepo, commodityHistoryRepo)

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
	// PolicyRatesResolver: SBV HTML direct fetch (www.sbv.gov.vn, no VPS proxy) + sbv_rates DB
	// fallback + is_estimate decision (pkg/application — FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL
	// moved this decision out of the composition root; policyRatesHTMLAdapter/policyRatesDBAdapter
	// below are now pure delegation, see adapters.go).
	// sjcGoldFXAdapter: reads EXISTING market.db commodity_prices + sbv_rates (DD-7, no new crawl).
	// omoResolver: SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy, VMT-5b) +
	// ParseOK/error fail-closed decision (pkg/application, same COMPROOT-LOGIC-IMPL move);
	// omoRawAdapter below is now pure delegation, see adapters.go.
	// interbank_1w: PERMANENTLY blocked (architect Decision B) — no adapter needed (domain builds it).
	// No new excelize dep (HTML + SQLite only). go.mod UNCHANGED.
	//
	// P0-3-OMO-CURVE: omoDailyRepo opens macro_indicators.db (MACRO_DB_PATH env, default /app/data/macro_indicators.db).
	// Safe-degrade: if repo init fails, omoDailyRepo=nil → LiquidityStateUseCase skips persistence
	// and returns OMOCurve rates-only (no 5d net injection or stress score).
	liquidityPolicyAdapter := application.NewPolicyRatesResolver(&policyRatesHTMLAdapter{}, &policyRatesDBAdapter{}, logger)
	liquiditySJCFXAdapter := &sjcFXAdapter{inner: infrastructure.NewSJCGoldFXAdapter()}
	liquidityOMOAdapter := application.NewOMOResolver(&omoRawAdapter{}, logger)

	macroDBPath := envStr("MACRO_DB_PATH", "/app/data/macro_indicators.db")
	omoDailyRepo, repoErr := infrastructure.NewSQLiteOMODailyRepository(macroDBPath)
	if repoErr != nil {
		slog.Warn("P0-3-OMO-CURVE: macro_indicators.db repo init failed — OMOCurve persistence disabled",
			"error", repoErr, "macro_db_path", macroDBPath)
		omoDailyRepo = nil
	}

	liquidityStateUseCase := application.NewLiquidityStateUseCase(
		liquidityPolicyAdapter,
		liquiditySJCFXAdapter,
		liquidityOMOAdapter,
		&omoDailyRepoAdapter{inner: omoDailyRepo},
	)

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
		// P0-3-OMO-CURVE: close macro_indicators.db on graceful shutdown
		// (RISK-MACRO-DUAL-DB-LIFECYCLE mitigation — ensures WAL checkpoint completes).
		if omoDailyRepo != nil {
			if err := omoDailyRepo.Close(); err != nil {
				slog.Warn("macro_indicators.db close error on shutdown", "error", err)
			}
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

// Composition-root adapter shim types (bopParserAdapter, bopURLBuilderAdapter,
// iipParserAdapter, cpiParserAdapter, tradeBalanceParserAdapter, policyRatesHTMLAdapter,
// policyRatesDBAdapter, sjcFXAdapter, omoRawAdapter, omoDailyRepoAdapter, plus the free
// helper convertOMOTenorRows) live in the sibling file adapters.go — same package (main),
// Fence-C preserved, no import-graph change (FACTORY-MACRO-split-or-justify-over-cap,
// 2026-07-24; split further into pure-delegation pairs by
// FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL, 2026-07-30).
