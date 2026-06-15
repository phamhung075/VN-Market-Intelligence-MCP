# PO Notebook

## 2026-06-15T15:52Z — User BUG triage: signal confidence frozen at 50 → minted FIX-SIGNAL-CONFIDENCE-DEFAULT-50 (P1, ready)

**Router-delivered user BUG (RAW-verified by router): dashboard SIGNALS(LAST 10) shows Confidence=50% on EVERY row, every source, every direction/date.** Context said don't re-investigate; I verified the load-bearing claims myself instead of relaying:
- `agentSignalStore.ts:341` — `_postSignalInner` destructures `confidence_score = 50` (Task 230 default). CONFIRMED.
- `schema-news.ts:104` — column `DEFAULT 50`; `server.ts:1393` dashboard read `?? 50`. CONFIRMED.
- Only **1 of 13** producers passes a real confidence: `agentSignalTools.ts:361`. The other ~12 (cascade, news poll, BCTC mapper, verified_decision, kinh-dich, chain-synth) omit it → literal 50 stored.
- **Smoking gun** `intelligenceCycleJob.ts:1290` — posts `verified_chain` when `chain.conviction>=0.7` but does NOT pass `confidence_score`; conviction is in scope (logged 2 lines down). Class = "computed-but-not-wired default → non-empty but wrong".

**Decision: minted `FIX-SIGNAL-CONFIDENCE-DEFAULT-50` → ready[]** (P1 not router's P2 — blast radius = every signal's confidence dead across ALL sources). route_to=dev-mcp-server, zone=apps/mcp-server/, mode=recon-first, size=M. Board: ready 0→1, entries 417→418 (conservation clean). No dup (REVIEW-PPC-Q4-LOW-CONFIDENCE is unrelated BCTC).

**WIP honored:** 2 board lanes (ARCH-CRON-SCHEDULER-RELIABILITY, BA-VN-MACRO-TOOLING) but both NON-coding (architect design + BA spec) = **0 active coding lanes**. FIX-VNSTOCK + FIX-ALERT-RSI in review gated 2026-06-16. Did NOT dispatch — left for next dev-team tick (:07) / router per ASK.

**Spec carries** /goal#2 generic mandate (EVERY producer wires its real confidence, normalized 0–100 int, NO allowlist/literal) + /goal#1 plausibility gate (live SIGNALS-last-10 must show a SPREAD by source+strength vs named-volume market.db NOT host decoy, RAW get-signals, post-rebuild). Triage script: `scripts/po-s59-signal-confidence-default50-triage.jq` (atomic temp→[ -s ]→jq empty→all-lane id-guard→conservation→rename; commit orch-state by EXPLICIT PATH). Renumbered s56→s59 (s56/s57/s58 taken).

### Carry-over
- `FIX-SIGNAL-CONFIDENCE-DEFAULT-50` ready → dispatch next tick. Recon-first: dev reads all 13 postSignal sites + each producer's confidence source BEFORE editing. done_verified GATED on live SPREAD (not column-of-50) RAW-verified vs named-volume DB + post-rebuild.
- After 2026-06-16T01:00Z RSI gate clears `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT`: release `FIX-ALERT-OPEN-ZERO-PRICE-RACE` HELD→ready. Then push held bundle AFTER both 06-16 gates (RSI 01:00Z + vnstock 08:30Z) close green.
- `FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK` (backlog HELD-for-BA): unpark to ready once a BA/architect lane frees. Bus-dark = why signals.db empty.
- `ARCH-SHIP-WAVE-REAUDIT` correctly PARKED (zone:multi serialized behind mcp-server lane). Unpark only after ARCH-CRON + BA-MACRO close.
