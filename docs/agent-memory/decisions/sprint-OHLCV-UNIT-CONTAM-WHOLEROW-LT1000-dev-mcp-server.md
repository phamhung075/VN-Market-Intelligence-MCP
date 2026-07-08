# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · dev-mcp-server

**Sprint goal:** daily_ohlcv whole-row thousands-format contamination (close<1000) repair + reflow + durable writer guard
**Agent:** dev-mcp-server
**Started:** 2026-07-08T01:33Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-08T02:00Z
**task-id:** CONTAM-10-WRITER-H
**what-done:** Swapped handlePushOhlcvHistory's raw INSERT...ON CONFLICT for writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"}); WIC-2 pre-pass preserved verbatim, response derived from writeResult; new CONTAM-10-WRITER-H-backfill-scale-guard.test.ts (TC-WH-1/2/3); rebuilt mcp-server image (not swapped — ops-gated).
**what-considered:**
- keep manual validateOhlcvUnit pre-call alongside writeOhlcvBatch — rejected: it runs on raw un-normalized values, so whole-row-LT1000 bars (all fields individually >=100) pass it undetected, defeating the fix's purpose
- drop-in swap only (architect-confirmed) vs broader rewrite — chose drop-in; UPSERT_BACKFILL_SQL already semantically identical to prior raw INSERT
**why-decision:** architect Round-2 explicitly scoped this as a routing change, not a rewrite; writeOhlcvBatch's normalize→scale-detect→validate pipeline is the SSOT already used by Writers A/C/D.
**why-change:** found+fixed 1 real regression not anticipated in the handoff: TASK-VNINDEX-RS-B-durability.test.ts FR-B1-TC2 asserted old reject-on-open<100 semantics; writeOhlcvBatch's normalizeOhlcvToVnd correctly auto-corrects x1000 instead (consistent with Writers A/C/D) — updated the test assertion + added inline rationale rather than reverting the fix.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-08T02:05Z
**task-id:** CONTAM-10-WRITER-H
**what-done:** Flipped task to REVIEW (not done_verified) via orch-apply.sh; set .head next_agent=qa.
**what-considered:**
- mark done_verified since code/tests/tsc/build all green — rejected: DoD requires live-container health verify, and docker compose up -d is a gated swap (standing policy, ops-owned) I cannot self-authorize
- full bun test suite exit 0 — rejected as literal blocker: 57 pre-existing failures spread across unrelated domains (news/RSS/insider/telegram/IMF/verdict-job), confirmed via git-stash-to-baseline isolation testing to be pre-existing full-suite-only flakiness + a Bun 1.3.13 engine crash-at-teardown bug, not caused by this task
**why-decision:** handoff itself instructs REVIEW when a live-container verification step is user/ops-gated; documenting exactly what's pending (QA RAW-probe + ops swap) is more honest than a false done_verified.
**why-change:** no change from plan — this was the anticipated fallback path per the handoff's own REVIEW-gate clause.
