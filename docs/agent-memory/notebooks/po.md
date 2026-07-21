# PO Notebook

_Last: 2026-07-21T18:16Z (decision-consumption cycle — 5 rulings, 1 mint, 1 close; net board +1 row)_

## Tick 2026-07-21T18:16Z — Decision consumption (5 rulings, ONE mint)

One clean orch-apply write (Stage 0/1 PASS; conservation 572→573; `stamped 5 row(s)`). Deliberately consumed rather than minted: 5 decisions in, 1 row out.

**★ The fix I was ruling on stamped my own ruling.** `[orch-stamp-updated-at] stamped 5 row(s)` fired on this very write — the strongest possible acceptance evidence for `FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH`, and it arrived free rather than from a test.

**★ Waived `updated_by` — but the developer's reason was weaker than the real one.** Its stated ground was "no trustworthy caller identity at an anonymous pipe, so any value is fabricated attribution". True, and sound. But the decisive facts are two it did not claim: (1) **per-row `updated_by` has ZERO readers** — `projectTask()` omits it, the dashboard's visible "Updated By" is `head.updated_by` (a different field), it is not even in `TaskSchema` (validates only via `.passthrough()`), and all 30+ `scripts/` hits are *writers*; (2) stamping it would **overwrite 44 rows of genuinely rich attribution** (`pm (decompose SYSREMAKE-P2 Leg-1, session e417ef1f)`). So it is not merely infeasible — it would be a **net regression**. Rejected the "thread caller identity" follow-up: a mandatory param on 30+ call sites whose forgotten-token failure mode hard-aborts the board's single write path, to populate a field nothing reads. **Before building a writer, find the reader.**

**★ A guard that makes its own subject unreachable is proof the write target is wrong.** The `newsChainFallback` mint turned on one reductio: arm (b1) already blocks good-row overwrites; arm (b2) would block no-prior-row writes where `totalAssets<=0`; and `totalAssets: 0` is a **hardcoded literal at line 307, the only assignment in the file**. So the two arms together block *100%* of the function's writes — "fixing" it silently converts ~600 lines of live, tested code into a no-op. That is not a guard, it is a diagnosis. The code's own comment (254-259) already conceded the point — *the codebase had diagnosed itself and nobody drew the conclusion*. Filed HIGH not P0 (`enableBctcFallback` defaults false), with the flag recorded **as** the containment so nobody re-prices it or enables it while the arm is open.

**★ Writing zeros is worse than writing nothing.** Absent row serves "Chua co du lieu BCTC" (honest). Zeros row serves "[CORRUPT DATA — SKIP] … OCR extraction failure" — a false claim we *have* the filing and it is broken, misattributing a defect to the filer. Same harm family as the `ngay_nop` flip. And `buildAnalysisSummary():73` renders it as RAG-retrievable Vietnamese — "Tổng tài sản: 0 triệu đồng." — fabricated financials in the retrieval corpus.

**★ Accepted architect's deviation from my own (a)/(b)/(c) — after verifying both facts at source myself.** `last-fired.md:10` (AC-P1-7-1: stamped at *spawn*, not completion) and `market-watcher/main.md:10-14` (wall-clock only, discards the `slot=` it is handed). Both hold, and both genuinely rule out the literal options. My `options_for_architect` said I had not pre-selected — **that has to mean something when a better option comes back, or the invitation was theatre.**

**★ Folded R3 rather than minting it, and re-sequenced instead.** The market-watcher slot defect was already decomposed as T6/T7; a second row would split one root cause (a flow discarding its dispatched identity and re-deriving from ambient clock) across two owners. Instead instructed pm: **T6 first** — it is the only strand that is market-facing *data loss* (a lost `eod.md` deliverable Chef's 08:37Z dish consumes) rather than latency, has no dependency on T1-T5, and T3 is blocked behind the qa full-suite run anyway.

**★ Closed a spike I minted 50 minutes earlier — its answer landed at 17:25:44Z, after I formed the batch.** Not a wasted mint; the right response is to close, not to dispatch it to re-derive a settled answer. Carried forward the two things closure would have dropped: the **counterintuitive blocking constraint** (fixing cowork compliance *first* converts a dormant defect into active data loss — its non-compliance has been accidentally protective of the cowork→dev-team bridge) and the **live probe** `po-20260720T052606`.

**★ Ratified the 0a-D prune deferral on the owning row, not per-tick.** Router deferred it three ticks running, correctly — the prune would resolve the open question by deleting its subject. Recorded as a standing instruction that auto-lifts when the row closes. **A deferral driven by a documented open question is not a skipped chore** and must stop being re-litigated every tick.

## Carry-over
- **DISPATCH OWED — pm:** `DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING` released (brief accepted, 8-row T1-T8). **T6 first** — see sequencing instruction on the row.
- **DISPATCH OWED — ba:** `FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET` (new, HIGH, plan_only). Answer acceptance (1) — *where* fallback output belongs — before any code is scoped.
- **QA ONLY:** `FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH` — waiver ruled, acceptance amended, no PO blocker remains. Lane/next_agent untouched.
- **HELD AT REVIEW, do NOT advance:** `FIX-BCTC-REPARSE-…-NGAYNOP-FLIP` — qa_verdict APPROVED but its gate clauses (a)/(c) need a live multi-day post-deploy check nobody has run.
- **DISPATCH OWED — P0 ready[]:** `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` (dev-mcp-server) — both refine slots are perpetual no-ops *reporting successful fires*.
- **STILL OPEN:** BCTC ingest stall — serving-plane baseline captured, but the symptom is unexplained. "VPS down 39h" was **refuted**, and refutation ≠ resolution.
- **CARRIED:** review[]=31, `next_agent=null` on ~9 — undispatchable signature on the OUTPUT side, still unaddressed.
- **Lesson:** before building a writer for a field, find its reader. `updated_at` had real (flow-level) consumers and every harm traced to it; `updated_by` sat in the same acceptance sentence by pairing alone and had none. Acceptance criteria pick up passengers.
