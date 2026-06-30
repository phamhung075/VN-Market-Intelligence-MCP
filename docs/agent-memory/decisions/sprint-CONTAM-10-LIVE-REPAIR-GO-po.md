# CONTAM-10 — Live ×1000 Whole-Row OHLCV Repair — PO Authorization

- **Date:** 2026-06-30T21:38Z
- **Decider:** po (coordination session e71c7736-a95a-4040-b741-1d48454354f6)
- **Subject:** Authorize the destructive `--live` ×1000 UPDATE on live `market.db`
  (`scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts`)
- **Verdict:** **GO — CONDITIONAL** (4 hard preconditions below; GO is void if any fails)

## Verdict: GO (conditional)

The destructive live repair is **authorized** subject to the 4 preconditions. This is the
PO/human gate satisfaction of record — the dispatcher may re-dispatch ops to fire the
`--live` run only when ALL four preconditions are met. If any precondition cannot be met,
fall back to **NO-GO this pass** → close EXEC as dry-run-only with a deferred-live follow-up.

### Why GO (not NO-GO / DEFER)
- **Evidence is RAW-verified by the dispatcher's own read-only DB probe, not an agent badge.**
  7,897 candidate rows across 52 tickers; per-ticker counts + anchors match the DB exactly
  (FPT 414/70200, DHG 619/93200, VHM 150/146000, VIC 241/214000, ACV 206/44000).
- **Predicate is conservative and self-limiting.** Repair only fires where a recent (≤180d)
  clean anchor (close≥1000, volume>0) exists AND anchor/close ≥ 100 AND all four OHLC > 0
  AND ticker ∉ INDEX_TICKERS. A legitimately-cheap or anchor-less stock is **skipped**, not
  touched — false-positive risk is low by construction.
- **Active user-facing harm today.** Contamination distorts computed-on-read serving values
  (DHG h63 RS ~922, VHM/VIC 52w ~-99.9% from high). These self-heal post-repair via the Go TA
  layer (no reflow), so the benefit is immediate and the blast radius is bounded.
- **Safety rails are real:** dry-run default, `--live` literal-"yes" readline gate, single
  `BEGIN IMMEDIATE` transaction with ROLLBACK-on-error, post-repair verify (expect 0 remaining).
- Dry-run was confirmed read-only (17,766 sub-1000 non-index rows still present → no mutation).

## The 4 specifics

### 1. Backup — **REQUIRED (mandatory, blocking)**
The ×1000 UPDATE is a single transaction whose ONLY clean rollback is a pre-run backup.
Before the `--live` run, ops MUST:
- Take an online snapshot of the **live** DB inside the named volume (NOT host `data/market.db`):
  `sqlite3` `.backup` (or `VACUUM INTO`) executed via `docker exec` against the container's
  `/app/data/market.db`, written to a timestamped file and copied out of the container.
- **Verify the backup before proceeding:** `PRAGMA integrity_check` = `ok`, and the candidate
  count probed on the backup must equal the pre-run live count.
- **Drift guard:** if the pre-run live candidate count diverges materially from **7,897**, ABORT
  and re-surface to PO — the authorization is scoped to the verified 7,897-row / 52-ticker set.
- **Retention:** keep the backup until post-repair serving values (FPT/DHG/VHM RS·ROC·52w) are
  confirmed normalized; only then may it be aged out.

### 2. Window — RF-3 off-hours (UTC)
Per RF-3 (script lines 34–35) the trading hours to **avoid** are **02:00–09:00 UTC**
(09:00–16:00 ICT; covers session + post-close settlement writes).
- **Eligible window:** after **09:00 UTC** through before **02:00 UTC** the next day.
- **Recommended concrete window:** **09:30–23:30 UTC** (30-min buffer past the close-settlement
  boundary; well clear of the 02:00 pre-open). Deep off-hours (~16:00–22:00 UTC) preferred.
- **As of this decision (2026-06-30T21:38Z) the window is OPEN** and stays open until
  ~02:00 UTC on 2026-07-01. If preconditions 1/3/4 cannot all be met before ~01:30 UTC, the
  next eligible window opens **09:30 UTC on 2026-07-01**.
- **Additional gate (concurrency):** the in-flight **CONTAM-10-SANITY** dev rebuild on
  mcp-server MUST be fully complete and the container **healthy/stable** before the run, so the
  migration sees a settled DB and does not race the rebuild's own DB touch. Do NOT fire during
  the rebuild.

### 3. Execution mechanism — authorized
PO will NOT type "yes"; the dispatcher will NOT auto-fire. **This recorded GO is the
authorization of record.** Either path satisfies the readline gate, ONLY after preconditions
1+2+SANITY-done are met:
- (a) A human at a terminal types `yes` at the prompt, **or**
- (b) Ops pipes a confirmed `yes` into the live run via docker exec against the named volume:
  `printf 'yes\n' | docker exec -i vn-market-intelligence-mcp-mcp-server-1 bun run /app/repair-ohlcv-wholerow.ts --live`
  (use `-i`, NOT `-it`, when piping — no TTY).
- The run MUST target the **named-volume DB via docker exec** (the container's
  `/app/data/market.db`), NOT host `data/market.db` (which is not the live serving DB).
- **Post-run verify (blocking sign-off):** script post-verify must report **0 remaining**;
  then, AFTER the SANITY rebuild settles, spot-re-probe serving values (FPT/DHG/VHM RS·ROC·52w)
  to confirm normalization. Capture the run log (`repair-ohlcv-wholerow-contam-lt1000.log`).

### 4. Residual ~9,869 unanchored sub-1000 rows — **ACCEPT out-of-scope + spin follow-up**
17,766 total sub-1000 non-index rows − 7,897 anchored candidates = **9,869 conservatively
skipped**. **Do NOT widen the predicate before going live.** The anchor requirement is exactly
what makes this pass safe; loosening it would import false-positive risk against
legitimately-cheap / penny stocks that have no clean >1000 anchor.
- **Decision:** accept the 9,869 as out-of-scope for THIS pass; spin a **separate follow-up
  investigation task (CONTAM-11, PLAN-ONLY / investigation — NOT auto-repair)** to bucket them:
  (a) legitimately sub-1000 stocks → leave alone; (b) genuinely contaminated but anchor-less →
  needs a different strategy (longer anchor window, cross-source / sector-peer reference price,
  or manual review). Ship the safe pass now; track the residual without losing it.

## Fallback (NO-GO this pass)
If backup cannot be taken+verified, the window cannot be honored, or the SANITY rebuild does not
stabilize: **close EXEC as dry-run-only**, record a **deferred-live follow-up**, and re-surface
to PO for re-authorization in the next eligible window. No `--live` without all 4 preconditions.
