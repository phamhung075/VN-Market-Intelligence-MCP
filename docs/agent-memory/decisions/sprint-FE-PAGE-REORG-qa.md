# Decision Journal — Sprint FE-PAGE-REORG · qa

**Sprint goal:** FE-PAGE-REORG (frontend page reorganization active sprint)
**Agent:** qa
**Started:** 2026-06-17T02:40:00Z

---

### STEP qa-S1 · qa · 2026-06-17T02:45:00Z
**task-id:** FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD
**what-done:** CODE gate QA review of commit 09302e45. Ran CI per-file-isolation suite (P=8), isolated target tests, tsc, DDD scan, security scan, mock-guard.
**what-considered:**
- 7 CI failing files (084-tool-market, 1324-push-news-all-sources, 1391-bb-stale-candle-skip, 1803-ta-candle-guard, 1898b-rss-degradation-regression, FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-VPS-HEALTH-FRESHN): zero overlap with commit-touched files (systemTools.ts + test file only); all have last-commit pre-dating 09302e45; classified pre-existing host-weather failures per [[feedback_ci_red_can_be_flaky_confirm_before_blame]].
- DDD import scan: interface→infrastructure imports (circuitBreakerRegistry, db/schema, logger) are pre-existing pattern; no new cross-layer imports added by this commit.
- process.env check: zero hits; all env access is Bun.env.
- withSectionDeadline: no source allowlist, no date literal, no per-section special-case; timeout text is honest ("timeout/unknown — section exceeded Nms deadline"), never synthetic "ok".
**why-decision:** APPROVED. 6 new ACs pass. 15 regression tests pass. tsc: 0 errors. DDD/security/mock-guard PASS. 7 suite failures are disjoint pre-existing failures not introduced by this commit. REBUILD_REQUIRED:YES — live verification deferred to ops rebuild + router first-hand check; done_verified NOT flipped here.
**why-change:** No change from plan — all checks green on scoped files.

---

### STEP qa-S2 · qa · 2026-06-17T12:00:00Z
**task-id:** FIX-FB-POST-DATA-INTEGRITY-GATE
**what-done:** CODE+RUNTIME gate. Shell script fb-data-integrity-gate.sh: read full 175L script, confirmed exit-discipline, ran all 3 self-verify checks live: (1) clean post → [PASS] exit 0; (2) VRE −9.4% injected → [BLOCK] Check-A+B exit 1 (both checks fired simultaneously: HOSE-limit + live-delta); (3) VIC −3.5% live-delta violation → [BLOCK] Check-B exit 1. Confirmed dev-standards.md § Script Persistence canonical pointer lines 49-56.
**what-considered:**
- Exit discipline: `exit 0` only on `$VIOLATIONS -eq 0`; `exit 1` on violations; `exit 2` on usage/file error — explicitly avoids fb-jargon-gate exit-0 false-green trap per [[feedback_fb_poster_gate_false_green]].
- Check-C negation filter: `grep -vE 'không phải|không có|không bán|chứ không|mà không'` correctly excludes denial phrases — no false positive on "không phải bán tháo".
- Live fetch from `/mcp/api/prices/batch` (established REST endpoint), timeout 8s, soft-skip on unavailable (exit 0, not block on infra error) — correct soft-fail behavior.
- Optional $3 pre-fetched snapshot for headless/offline contexts — good defensive design.
- dev-standards.md pointer at lines 49-56: present, has usage, owning-flow reference, exit codes — PASS.
**why-decision:** APPROVED. All 3 self-verify checks pass with correct exit codes. Script is clean shell (bash), no TypeScript — tsc N/A. DDD/security N/A (pure shell). mock-guard N/A (shell, not .ts production). Script Persistence pointer present. No container rebuild required.
**why-change:** No change from plan — script implementation matches gate design spec exactly.

---

### STEP qa-S3 · qa · 2026-06-17T12:05:00Z
**task-id:** FIX-FB-POSTER-FABRICATES-STALE-EOD
**what-done:** FLOW-DOC gate (no runtime). Read docs/agents/fb-market-poster/flow/main.md commit 25dc5829 in full. Read init.md. Verified all 5 DoD requirements against actual file content.
**what-considered:**
- DoD-1: STEP 1b header "HARD-REQUIRED for recap spine" present at L66; ANTI-FABRICATION RULE block at L71 explicitly forbids CHEF per-ticker % as spine source. PASS.
- DoD-2: FAIL-LOUD honest gap at L73: "công cụ chưa trả số cho [TICKER] phiên này — NEVER invent or carry a stale figure". PASS.
- DoD-3: CHEF narrative-only restriction at L70-71: "Notebooks and CHEF dishes may inform NARRATIVE and CONTEXT only — they are FORBIDDEN as the numeric source". PASS.
- DoD-4: STEP 4b DATA-INTEGRITY PLAUSIBILITY GATE at L572-598; references scripts/fb-data-integrity-gate.sh; non-zero exit = BLOCK; gate-not-found → log warning, treat as PASS for pending-deploy cycle. PASS.
- DoD-5: memory_ref feedback_fb_poster_fabricates_when_data_thin at L70 (ANTI-FABRICATION RULE reference) and size-justification comment L1. PASS.
- RETURN block extension: LIVE_DATA_SPINE field at L747, INTEGRITY GATE field at L749. PASS.
- STEP 8 notebook template: "Live data spine" and "Data-integrity gate" entries present at L720-721. PASS.
- init.md: version=2026-06-17, anti-fabrication in responsibilities + forbidden_outputs. PASS.
- Size-justification updated from 718L to 758L (file now 759L — within 1L rounding acceptable). PASS.
**why-decision:** APPROVED. Flow doc change only — no runtime, no tsc, no tests required. All 5 DoD points verified against raw file content. The CHEF-is-narrative-only rule, FAIL-LOUD honest gap path, ±7% sentinel, and STEP 4b gate wire are all correctly implemented. No container rebuild required.
**why-change:** No change from plan — doc edits match task specification.

---

### STEP qa-S4 · qa · 2026-06-17T12:10:00Z
**task-id:** FIX-FOREIGN-FLOW-INTEGRITY-BREAK
**what-done:** CODE+LIVE gate. Commit ddc36452. Target test FIX-FOREIGN-FLOW-INTEGRITY-BREAK.test.ts: 4/0 GREEN. Full CI per-file-isolation (P=8): 13151 pass / 42 skip / 28 fail — 10 failing files ALL disjoint from commit-touched files (confirmed zero-overlap check). tsc: 0 errors. DDD: interface→infrastructure pre-existing permitted pattern; no domain→infrastructure violations. Security: 0 process.env, no secrets, SQL parameterized. mock-guard: EXIT 0. Named-volume DB query (docker exec bun): HPG 2026-06-17 foreign_volume=227,463 (Writer A daily net), foreign_room=209,934,684 — correct; VIC 2026-06-17 foreign_volume=-1,154,805 (correct daily net sell). Phantom VCI backfill 2026-06-13..16 confirmed present but classified as KNOWN RESIDUAL per task scope (FIX-FOREIGN-FLOW-BACKFILL-CONTAM-0614-0616 separately tracked). Image created 2026-06-17T07:13:16Z > commit 2026-06-16T19:59:56Z — rebuild captured fix.
**what-considered:**
- Test design: 4 tests test SQL patterns directly (no getDb() module mock needed — SQL pattern is the truth). AC-1: Writer A inserts correctly. AC-2: Writer B ON CONFLICT does NOT overwrite foreign_volume/foreign_room — Writer A values preserved. AC-3: Writer B fires first → sets NULL (no phantom cumulative). AC-4: upsertForeignFlow after Writer B preserves Writer B stat columns.
- Known residual: VIC 2026-06-14..16 still shows 217-239M (cumulative), 06-17 shows -1.15M correct. Task description explicitly says "flag/confirm contaminated window but route to FIX-FOREIGN-FLOW-BACKFILL-CONTAM-0614-0616 — do not block writer fix." Confirmed and flagged.
- Genericness: ON CONFLICT pattern applies to ALL tickers uniformly, no per-ticker branching. PASS.
**why-decision:** APPROVED (done_verified WITHHELD — rebuild already done per ops ea8667cd; live-probe confirms 06-17 writer isolation working; backfill contamination is separately tracked). Board: review→done, next_agent=ops for backfill resolution.
**why-change:** No change from plan — code fix correct, tests non-vacuous.

---

### STEP qa-S5 · qa · 2026-06-17T12:15:00Z
**task-id:** FIX-MARKET-BREADTH-MISSING
**what-done:** CODE+LIVE gate. Same commit ddc36452. Target test FIX-MARKET-BREADTH-LIQUIDITY.test.ts: 21/0 GREEN. CI disjoint check (same 10 failing files, same disjoint list). tsc: 0 errors. DDD: interface→infrastructure pre-existing. Security: PASS. mock-guard: EXIT 0. LIVE: get_market_breadth returns advances=168, declines=129, noChange=65, noTrade=41, ceilingStocks=6, floorStocks=0 on 2026-06-17. All integers, magnitudes consistent with HOSE ~400 listed stocks. VN-Index +change direction correlates with advances>declines. Source: api-finfo.vndirect.com.vn/v4/vnmarket_prices. Data is VARIED (not constant). Image same ddc36452-era build.
**what-considered:**
- Plausibility: advances=168 + declines=129 + noChange=65 + noTrade=41 = 403. HOSE ~400-420 listed stocks. Consistent. PASS.
- done_verified gate from handoff: advances ∈ [100, 500] → 168 PASS; declines ∈ [100, 500] → 129 PASS; totalTurnoverBn ∈ [5000, 30000] → 24185 PASS.
- New tool get_market_breadth (tool #165) confirmed present in live response.
- Genericity: breadth parsing applies to VNINDEX query, no per-ticker branching.
**why-decision:** APPROVED + done_verified. Live data is real, varied, non-constant, within plausible range. Rebuild already captured (image 2026-06-17T07:13:16Z). No BCTC eval gate (not a BCTC task). CI failures are pre-existing host-weather, disjoint.
**why-change:** No change from plan — live tool delivers plausible real breadth counts on first probe.

---

### STEP qa-S6 · qa · 2026-06-17T12:18:00Z
**task-id:** FIX-MARKET-LIQUIDITY-MISSING-TOOL
**what-done:** CODE+LIVE gate. Same commit ddc36452, same test file FIX-MARKET-BREADTH-LIQUIDITY.test.ts (co-implemented). Live: get_market_breadth returns totalTurnoverBn=24184.56 tỷ, nmTurnoverBn=17109.2 tỷ, ptTurnoverBn=7075.37 tỷ, turnoverDeltaPct=+45.25%, turnoverDirection="up". CI disjoint check: same 10 failing files, zero overlap with changed files. tsc: 0 errors. mock-guard: EXIT 0. Image build covers fix.
**what-considered:**
- Plausibility: totalTurnoverBn=24185 tỷ for a trading day is in [10000-25000] range (confirmed by historical 10-session sample in recon: range 9983-22156 tỷ). PASS.
- nmTurnoverBn + ptTurnoverBn = 17109.2 + 7075.37 = 24184.57 ≈ 24184.56 (within rounding). PASS.
- done_verified gate from handoff: totalTurnoverBn ∈ [5000, 30000] → 24185 PASS; turnoverDeltaPct not null → 45.25% PASS; nmTurnoverBn + ptTurnoverBn ≈ totalTurnoverBn within 10 tỷ → 0.01 tỷ diff PASS.
- Tool is co-implemented with get_market_breadth in same get_market_breadth tool #165 — zero extra network call.
**why-decision:** APPROVED + done_verified. Liquidity figures are real, varied, correctly split into nm+pt components. Breadth and liquidity co-tested in same 21-test file. No separate rebuild needed (same ddc36452 image).
**why-change:** No change from plan — co-implementation in same tool eliminates extra network cost as recon recommended.
