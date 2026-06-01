# Handoff — TSH-6: Kinh Dịch honest-omit on :5005 unreachable (FIX)

**Date:** 2026-06-01T17:23:50Z · **From:** PO · **To:** dev-mcp-server (via PM) · **Type:** FIX (operator-reported) · **Sprint:** TOOL-SURFACE-HYGIENE · **Zone:** `apps/mcp-server/` · **Pri:** MEDIUM

## Why this is a FIX, not a sprint needing architect
The disposition is already ruled. The architect brief `docs/architecture-briefs/2026-05-31-tool-surface-hygiene.md` (ARCH-DECIDE-1, FR-1=**1b DEREGISTER**) governs the SAME dead-:5005 dependency on the standalone `get_market_hexagram` tool (TSH-1). Its rationale is binding precedent here:
- "an oracle that is absent is strictly safer than one that lies"
- wiring kinh-dich-service:5005 is deferred to a future feature sprint **KINH-DICH-MARKET** "once kinh-dich-service has an owner sprint slot — not squeezed into a hygiene sprint."

So for the EMBEDDED path (this defect): **no new architect cycle.** Approaches A and B are pre-rejected:
- **(A) deploy :5005 — REJECTED.** Violates host-memory panic constraint (16GB Mac kernel-panics under fleet load; this host runs ONLY mcp-server + mcp-gateway per A-01-EXPECTED-SET intended-runtime). kinh-dich-service is dev-kinh-dich Factory-v2 pilot 4, in-repo but intentionally not deployed.
- **(B) inline revert — REJECTED.** Re-introduces the exact G5 domain→infra violation the P1-F refactor removed (old `appendKinhDich` read local SQLite). Would require an architect ruling that ARCH-DECIDE-1 has already pre-decided against (wire-later-as-feature).
- **(C) minimal-honest OMIT — CHOSEN.** Surgical, in-zone, closes the operator-visible defect, kills the silent-swallow.

## The defect (router raw-verified, NOT relayed)
`get_market_snapshot` always shows `Kinh Dịch: Chưa đủ dữ liệu để tính quẻ` because :5005 is connection-refused → `fetchWithRetry` exhausts retries → throws → bare `catch {}` swallows it → emits the fallback constant, which FALSELY implies a data shortage. Truth = service-unreachable. Same pattern at 3 sites.

## The 3 sites (all bare-catch, all in scope)
| File | Function | Lines | Fallback const |
|---|---|---|---|
| `interface/mcp/tools/market-data/marketTools.ts` | `appendMarketHexagram` | 62–69 | `KINH_DICH_FALLBACK` (L49) |
| `interface/mcp/tools/market-data/marketTools.ts` | `appendStockHexagram` | 72–80 | `KINH_DICH_FALLBACK` (L49) |
| `interface/mcp/tools/news-analysis/analysis.ts` | `appendStockHexagramHttp` | 63–78 | `KINH_DICH_FALLBACK_ANALYSIS` (L60) |

Backing client calls in `infrastructure/microservices/clients.ts`: `getMarketHexagram` (L505), `getKinhDichReading` (L496). DO NOT touch clients.ts logic — only the interface-layer catch behaviour. (Note: TSH-1 may remove the `getMarketHexagram` EXPORT if orphaned — coordinate so TSH-6 does not depend on a symbol TSH-1 deletes. `getMarketHexagram` stays USED by `appendMarketHexagram`, so it remains live regardless — confirm in grep before TSH-1 deletes any export.)

## Required behaviour (Approach C-omit)
Distinguish **service-down** from **genuine insufficient-data** — this is the whole point (kills silent-swallow, `feedback_silent_swallow_serial_bugs`):
1. **Connection-refused / fetch throw / non-200 from :5005** → OMIT the entire Kinh Dịch block. Return `baseOutput` unchanged (no `---`, no fallback line). Log one `logger.warn("[kinhdich] service unreachable — omitting hexagram block", { error })`.
2. **200 OK but the service itself reports insufficient data** (e.g. genuine low-sample response) → render an HONEST plain-Vietnamese line (the existing "Chưa đủ dữ liệu để tính quẻ" is acceptable here because it is now TRUE). User is non-technical → plain VN, no jargon (`feedback_market_report_plain_vietnamese`).
3. **NEVER** a bare `catch {}`. Every catch logs the real cause.

## Acceptance criteria
- **AC1** — While :5005 is down (current host state), `get_market_snapshot` output has NO trailing Kinh Dịch fallback line. Block omitted cleanly.
- **AC2** — A genuine 200-insufficient-data response still renders the honest VN line (prove with a stubbed/fake 200 in a unit test or injected client).
- **AC3** — All 3 catch sites log `logger.warn` with the real error; zero bare `catch {}` remain (grep `catch {` / `catch (` in the 2 files → all have a logged body).
- **AC4** — `bun tsc --noEmit` (or build step): 0 new errors.
- **AC5** — LIVE: ops rebuilds (`docker build --no-cache` + `up --force-recreate`, NEVER restart — `feedback_rebuild_after_dev_change`); QA calls `mcp__claude_ai_gateway__call_tool(server="vn-market", tool="get_market_snapshot", arguments={})` and reads the RAW output — confirms no fallback line. NOT a green badge (`feedback_router_verify_raw_not_badges`, RISK-2 in the sprint brief).

## Build standard
BUILD-STANDARD: lean (brownfield, existing microservice, no new primitives/deps).

## Routing
PM → dev-mcp-server (implement) → ops (rebuild) → qa (live raw-verify) → PO sign-off.
Sequencing vs TSH-1/2/3/4: TSH-6 touches `marketTools.ts` (also touched by TSH-4 description-only) — can land in the same dev pass/rebuild as TSH-4 if dev-mcp-server chooses; TSH-6 control-flow change is independent of TSH-1's deregister block. No hard dependency, but ONE rebuild can cover TSH-6 + TSH-2/3/4 if batched.
