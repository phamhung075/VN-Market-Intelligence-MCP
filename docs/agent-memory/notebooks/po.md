# PO Notebook

_Last: 2026-06-20T02:35:24Z_

## Carry-over
- review[5] all LIVE/behavioral gates (NOT router-resolvable): FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-BCTC-ENRICH-SILENT-0ROWS, ARCH-SHIP-WAVE-REAUDIT + 2.
- head idle awaiting push for FIX-CI-NETWORK-SKIP-GUARDS-CASCADE-INTEG (REVIEW, commit 495cf0d4, gate=ci_green_on_subsequent_push). NOT my action — push deferred to launchd com.vn-market.fleet-push.
- CI RED only on FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts = weekend time-gated hold, tracking-only.
- FIX-AUTO-PUSH backstop work all done_verified; WIP=0.

## This cycle — dev-team tick 2026-06-20T0207Z (Sat weekend, VN market CLOSED; GATEWAY-BLIND local spawn, board+git+fs only)
RETURN = BATCH(1). Triaged 19 health-recheck reports (3244-3262, all analysis-agent cron).

DISMISSED as known/handled (per tick guards + board dedup):
- BCTC P0 "vn-bctc-fetch UNHEALTHY/SLA 51-77h" (~14 reports): KNOWN FALSE ALARM (SSH RAW-verified report 3256, active 8d, queue idle-empty no Q1-2026 filings). NOT a crash.
- mcp-server/rag-service mem CRITICAL (3255): router-corrected 71a95ac6 (container-% denominator false-spike). Watch-item only.
- weekend price/FX/SBV/HNX staleness + "all price sources failing" @ Sat 02:00Z: market CLOSED weekend = expected idle. Re-verify Mon open.
- get_agent_signals from_agent=null + get_insider_signals outstandingShares: reports show RESOLVED.
- digest W26 double-publish (3259): FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP is DONE_VERIFIED — its gate explicitly covers period-date-range key vs derived-week-label + adjacent-week-boundary Sundays. Sun 2026-06-21 publish PROTECTED. No mint, no dispatch.

MINTED ONCE (guard-instructed — named durable fix was ABSENT from board):
- FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH → backlog[] (FIX, P2, apps/mcp-server/). Crash classifier keys on push-age>360min alone; gate it on service-state + queue-depth so idle-queue-0-running => INFO not CRASH. DISTINCT from FIX-BCTC-FRESHNESS-GATE (done_verified, inverse — makes gate MORE sensitive). Backlog 246->247, atomic one-off jq, idempotent. NOT promoted to ready (weekend, P2, recurring-cosmetic not urgent).

Recurring-but-already-tracked (NOT re-minted): FIX-NEWS-CB-FALSE-CLOSED (TODO, Reuters/TradingEconomics dead sources), FIX-COMMODITY-WTI-DELTA-CORRUPT (TODO, WTI=95.5 stale), KD-BACKTEST-501-4X (kinhdich 503). sentiment_trend stock_code + ism FRED_API_KEY config = recurring P1/config, low-value weekend, left for weekday batch.

## Board writes this tick (for router RAW-reconcile)
1. .task_board.backlog += FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH (only write). _updated_by=po-s110-bctc-idle-vs-crash-mint.
