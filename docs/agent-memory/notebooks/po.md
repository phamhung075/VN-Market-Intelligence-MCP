# PO Notebook

_Last: 2026-07-21T16:49Z (router escalation — BCTC reparse gate reconciled to mechanism-only, ingest-stall row unblocked)_

## Tick 2026-07-21T16:49Z — BCTC acceptance-gate reconciliation (router escalation, 4 decisions)

Two clean orch-apply writes (Stage 0/1 PASS, conservation 562=562 both). No lane moves, no status flips — field edits only, so Status-Flip=Lane-Move never engaged.

**★ The contradiction was MINE and QA was right.** `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP` carried acceptance(3)+gate(b) written 14:51:20Z that both demanded remediating the 16 tickers, while my own `po_scope_adjudication_20260721T1537` — 46 min later — narrowed the row to the mode-1 mechanism and said "Do NOT widen it to the broad servability problem". I narrowed the scope and never updated the gate. QA applied the gate it was given and failed the row correctly. **A stale acceptance clause is a PO defect that gets charged to the executor.** When I narrow a live row, the gate is part of the narrowing — not a separate later chore.

**★ Verified the router's self-flagged weak link before using its argument.** Router warned its ingest-15 ticker list came from a regex over a row body with `detail=null`. Checked: the 15 names appear verbatim and consistently in TWO independent fields (`.note` and `.status_note`). The 13/16 overlap holds. Router was right to flag it and right on the substance — but I only know that because I looked.

**★ All 16 attribute to PRE-EXISTING rows — harm (a) has ZERO confirmed instances.** 13/16 → the ingest-stall row (filed 07-15, four days pre-reparse). CTG → `W5-FU-CTG-REFINE-96e36139`, created **2026-07-01**, 18 days pre-reparse. D2D — router's one genuinely open ticker — → `OPS-BCTC-REFINE-REPASS-NONBANK-5T` (updated 07-12, names "D2D 2026-Q1" in its title) and carries the ingest signature (`D2D_2026_Q1.pdf`, stored 06-07). VCB serves fine. So the row's premise that the batch "replaces good stored financials with a zero/failed extraction" has **no confirmed instance anywhere in the cohort**. The observed transition is absent → *manufactured* zero-row. That is why the shipped guard (`existing>0 AND new<=0`) never bites: with no prior row it never evaluates. **The real unfixed defect was hiding inside the mis-stated one.**

**★ Natural control settled it.** HUT and PLX are on the ingest-stall list but were never touched by the reparse. Both return "Chua co du lieu BCTC" live. The ingest defect ALONE reproduces the "absent" state QA read as reparse damage.

**Withdrew my own 15:37Z SSI/NVL watch-spread claim.** Re-probed SSI/NVL/KBC — all absent — but their only 07-15 baseline was CALENDAR-plane ("correctly DA NOP"), never serving-plane. So regression is unproven, not disproven. Same hole as QA's claim. **Root cause of the whole day's churn: no serving-plane baseline was ever captured for this cohort** (07-15 sampled get_bctc_full for 3 of 15). Every regression argument today — QA's, router's, mine — was argued from calendar data or absence of records.

**Dispatch trap defused.** Row A's gate required an ingest owned by row B; row B had `next_agent=NULL`, owner ops, 6 days idle. Set `next_agent=ops` and rewrote row B's AC clause 1 off the corrupted calendar discriminator onto the serving plane, with HUT+PLX as mandatory controls.

## Carry-over
- **DISPATCH OWED (a):** `FIX-BCTC-REPARSE-…-NGAYNOP-FLIP` → dev-mcp-server, **durable write-back half ONLY**, against revised gate (b1)+(b2). Do NOT ask it for non-zero total_assets across the 16. qa_verdict stays CHANGES_REQUESTED — still accurate, (b2) is genuinely unfixed.
- **DISPATCH OWED (b):** `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` → ops, now `next_agent=ops`. Capture get_bctc_full for all 15 BEFORE any reprocess — that is the missing baseline.
- **ops must adjudicate:** whether D2D folds into the ingest cohort (16) or stays with the nonbank repass row. Do not silently widen the AC.
- **SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS** still owns the cross-watchlist serving-plane baseline; BSR is a SCALE-error signature (`total_assets=166.52 < equity_total`), belongs to the VALIDATION-GATE row, not the zero-write mode.
- **CARRIED — DISPATCH OWED:** `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD` P0 in ready[], needs router→architect spawn, still idle.
- **CARRIED — REVIEW lane:** review[]=31, `next_agent=null` 9 — same undispatchable signature on the OUTPUT side.
- **Lesson:** when a gate cannot be met by the row's own owner, that is a scope bug, not an executor failure. Check gate-vs-owner reachability at narrowing time.
