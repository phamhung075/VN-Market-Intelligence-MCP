# PO Notebook

_Last: 2026-07-25T07:17Z (user demand — "Dự báo AI & Kết quả" Loại trừ bucket + per-prediction updated-at; 4 rows minted)_

## Tick 2026-07-25T07:11–07:17Z — prediction-claims triage (user demand, router-dispatched)

**The user was right and it is worse than the complaint.** Live `curl http://localhost:3001/api/prediction-claims` @07:11:04Z: `total=17, correct=4, wrong=2, pending=5, excluded=6, hitRate=0.6667, avgBrier=0.2135`.

**ROOT CAUSE — router's hypothesis was wrong; re-derived it.** Router pointed at `intelligenceCycleJob.ts:938` hardcoded `creation_price: null`. That path writes `agent_id:"chain-synthesizer"`; **zero live rows carry it** — all 17 are `08-prediction-synthesizer` from `evidenceTools.ts:435`. Real but DORMANT; fixing only it would have left the user-visible bug 100% intact. Actual 4-layer chain, each read at source:
1. `daily-predict.md:110` prescribes `create_prediction_claim(stock, claim_text, probability, horizon_days, resolution_criteria)` — 5 args.
2. `docs/agents/tools/list/create_prediction_claim.md` param table lists those same 5; `direction` + `expected_move_pct` absent from table AND example — header claims "verified live 2026-07-17", i.e. re-verified and still missed them.
3. `evidenceTools.ts:397` gates the entry-price SELECT behind `if (direction != null && expected_move_pct != null)`. Both OPTIONAL. Omitted ⇒ `creationPrice` null, `direction` falls back to `"neutral"`.
4. `predictionClaimStore.ts:142` binds `creation_price ?? null` with **zero validation** → `predictionResolutionJob.ts:308` `excludeClaim()` → `is_excluded=1` → "Loại trừ".

**The discriminator is entry-price capture, not age.** Every non-null-`creationPrice` claim (ids 2-7, created 04-27/05-03) is bullish/bearish and scored. Every null one (1, 8-17) is "neutral" and excluded or heading there. **Ids 8→17 = 10 consecutive claims, 2026-06-14→07-24, 0% scoreable — a 6-week silent outage.** All 5 pending rows have `creation_price=null`, so excluded goes 6/17 → **11/17** as they resolve; id 13 converts on the **2026-07-28 16:35Z** tick (3 days out).

**Minted 4 rows** (one `jq | orch-apply.sh`; Zod PASS, conservation 645→649 exactly, signals 127↔127):
- `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` P1/M/`apps/mcp-server/`/dev-mcp-server — ungate price capture + Zod contract at the **store** boundary (insert AND update) + fail-loud + dormant :938 + doc sync + kill the false "legacy" comment.
- `FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE` P1/S/`apps/mcp-server/`/dev-mcp-server — deadline-bearing.
- `FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY` P1/S/`apps/frontend/`/dev-frontend — independent, ships now.
- `FEAT-PREDCLAIM-UPDATED-AT` P2/S/`multi`/architect — the user's second ask.

**Prior art CLEARED, not skipped.** `FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY` (done_verified 2026-06-21; c40f90062→a41e09a91→baff449ae→f6c376bec) scoped itself to the **consumer** leg only — it is *why the user can now see* "Loại trừ". Its closing commit recorded `excluded=3`; today 6, with 5 more guaranteed. Sibling review rows `FIX-PREDICTION-SIGNALS-EMPTY` / `FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED` cover different **tables** (prediction_signals, signal_outcomes) — no overlap, but all three share a 2026-06-14 freeze date worth a look.

## Carry-over
- **A display fix made the rot legible and nobody read it.** The 06-21 fix surfaced the exclusion bucket, the count then doubled, and no signal fired for 5 weeks. Making a failure *visible* is not making it *noticed* — that needed a threshold alert, not a label. Worth asking which other "surfaced" dashboard buckets are similarly unwatched.
- **Optional params that gate a required side-effect are a defect class.** `direction`/`expected_move_pct` read as cosmetic (they compute `target_price`) but silently also gate entry-price capture — the one field scoring depends on. Grep for other `if (optA != null && optB != null)` blocks guarding a persistence write. Server-computed beats caller-supplied (`feedback_pressure_state_caller_supplied_fields_dead_server_computed_live.md`).
- **A doc header saying "verified live <date>" earned unwarranted trust.** `create_prediction_claim.md` was re-verified 07-17 and still omitted 2 of 7 params, because the verifier confirmed the params it already knew about. Re-verification must enumerate the live schema, not tick off the existing table.
- **"Legacy" in a code comment is an unfalsifiable excuse-label.** `predictionClaimsHandler.ts:22` called the excluded rows "legacy"; the newest claims were the broken ones. That one word let an active outage read as settled history. Same block still hardcodes a stale `3/3/0/3, hitRate 0.50` worked example against a live 4/2/5/6.
- **Frozen ≠ healthy.** A hit-rate that structurally *cannot* move still renders green. Any calibration/accuracy figure needs a last-scored-at beside it, or it is an assertion about the past wearing the present tense.
