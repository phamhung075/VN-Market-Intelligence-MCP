# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · po

**Sprint goal:** FLOW-PRICE-ALPHA-LOOP — flow+price alpha loop; this task = CI-RED-29f92c5b merge-gate unblocker (bidirectional daily_ohlcv_with_flow view, Shape A).
**Agent:** po
**Started:** 2026-07-13T21:51:55Z

---

### STEP po-S1 · po · 2026-07-13T21:51:55Z
**task-id:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR
**what-done:** FINAL merge-gate signoff = APPROVED (sole CI-RED-29f92c5b unblocker); recorded PUSH_READINESS=ready — push is USER-GATED, NOT executed.
**what-considered:**
- APPROVE — supervised cascade complete, every gate RAW-verified GREEN by me
- HOLD — no unresolved blocker; holding would needlessly strand the whole pre-push fleet
**why-decision:** Independently re-ran the merge-gate pair POST qa-commit → 20 pass/0 fail/85 expect (zero drift); the 2 RED-by-design gate assertions in daily-foreign-flow-integration.test.ts pass; qa commit 8e905c31d scope = 3 docs only (no prod/test/orch); dev impl d71f45949 = 1 infra/db file (schema-market-data.ts, DDD PASS) + companion schema test; CI baseline GREEN thru 07-12, 29f92c5be first-red = this same gate freeze. Nothing left to fix.
**why-change:** no change from plan — tick-20:07Z triage predicted "land the view fix → flips the 2 gates GREEN", it did. Board move + chain-mutex lock release + `git push origin main` all DEFERRED: router owns the board/lane move + chain-mutex row lock; push is USER-GATED (record readiness, surface the single user action, never self-push).

### STEP po-S2 · po · 2026-07-15T04:55Z
**task-id:** ALPHA-S2-RAG-FTS-REBUILD-CRON
**what-done:** Triaged RAW-verified qa-BLOCK → parked ALPHA-S2 BLOCKED (in_progress→backlog) behind 2 minted P1 blockers; NOT a code defect (35cc8cd56 clean/on-main), so no fixer round on this row.
**what-considered:**
- Path #2 stream/chunk `_build_fts_index()` = the ONLY corpus-size-independent root fix (corpus 14k→56k in ~5wk and growing) → minted RAG-FTS-BUILD-MEMORY-BOUND (dev-rag-service).
- Path #1 raise 768m mem-limit (ops/user-gated) — REJECTED as standalone: alone it does NOT unblock (250s>90s deadline is memory-independent) + can't be sized until the rebuild footprint is reported → folded into the rootfix DoD as a possible belt-and-suspenders.
- Path #3 deadline retune — provably insufficient alone; folded into ALPHA-S2's own remaining mcp-server tail (retune to reported steady-state + margin).
- Latent landmine: cron code is already on main → next mcp-server redeploy arms a nightly 20:15Z rag OOM → minted ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE (dev-mcp-server, default-off enable flag, RUN-NOW/independent) so "parked BLOCKED" actually enforces non-deployment.
**why-decision:** Deploying as-is = nightly service-wide RAG/search outage, strictly worse than the silent BM25-staleness gap it fixes; the fix must be corpus-size-independent, so root-cause (rag capacity) + a real disarm gate beat any band-aid. Re-scoped the brief's 14k premise → 56k+/growing.
**why-change:** no change from qa's routing intent (architect/ops, not fixer) — refined it into 2 zoned, DAG-ordered backlog rows + a parked dependency instead of one vague hand-off.
