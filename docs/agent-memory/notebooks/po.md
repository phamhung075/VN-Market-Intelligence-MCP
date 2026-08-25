# PO Notebook

## 2026-08-25T03:05Z — a correction block that shipped a fresh falsified claim; a CRITICAL that measured the wrong database

Inbox read fresh as SSOT: **15 entries → 0**. Journal: `docs/agent-memory/decisions/triage-20260825T0305Z-po.md`.
Verdict on `TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION`: **REWORK** (6/7 AC pass), review[] → agent-father.

### The one AC that failed was the one nobody re-derived
Row's job was to delete a falsified prose claim. It did — and shipped another in the same paragraph:
"the two largest type classes in the whole ~100+-type namespace". By the block's **own stated method**
(`grep -c` over the 3 archive months + hot): `signal_feedback` 230, `narrative_contradiction` 144,
`microservice_degraded` 121, then 115/115. **Ranks 4 and 5.** Already false at the row's own commit
(226 vs 112/108) — so not drift, never verified. It came verbatim from the architect brief line 56.
**Generalises: when a task's deliverable is "correct a false claim", the numbers get re-derived and the
adjectives around them get copy-pasted.** Verify the ranking, the superlative and the "top N" too.
Note the block's *disclaimer* ("do not treat these counts as current") is excellent and stays — but a
rank is exactly as perishable as the count it sits next to, so the fix is to delete the clause, not restate it.

### Verify the mechanism, not the markdown
AC-6 said a table row landed "inside the guard-parsed section". Reading the table proves nothing about
what the parser sees. Replayed the guard's own `pipeline_b_section` awk + `extract_type_column` sed/grep
against the live doc → `audit-handoff` is in the parsed set. That is the check; eyeballing is not.

### Running the "check" wrote to the board
`guard-signal-type-coverage.sh --check` minted **4 backlog rows** during my verification. All 4 duplicated
an existing row that names one of them in its own title — its dedup is `dedup_key`-exact, so it is blind
to subject. Could not fold the evidence in: the target is already **12156B**, over the 12000B ceiling, so
any append is rejected as net-new growth. Removed all 4, filed the guard defect. **Confirmed the diagnosis
by re-running post-CLEAR: Pipeline-A FAIL gone, zero mints** — its input is a drain-to-zero queue, and
dev-team's drain re-envelopes Pipeline-B rows into it carrying their type, so every drain manufactures
a Pipeline-A "gap" that erases itself. A guard whose finding disappears when you fix nothing.

### `daily_ohlcv: 0 distinct codes` — CRITICAL, and false
C-01 verbatim on both planes: live container `/app/data/market.db` → **99** (PASS, threshold ≥25);
host `./data/market.db` → **0**, max date 2026-08-12, 13 days stale. Same filename, different databases
(443MB vs 14MB). Ruled out a timing race: the 99 rows for 08-24 carry `updated_at` 09:00–15:03 on 08-24,
11+h before the 02:40:42Z probe (used only as an upper bound on existence — it is mutation time, backfill
rewrites most rows, so it is never arrival time). **The dangerous part is the mixture, not the miss**:
`bctc_vps_queue: 1 stale >72h` from the *same cycle* reproduces exactly on the live plane (host says 513).
One cycle, two checks, two databases → false CRITICALs one way and false GREENs the other.
`CLEAN-HOST-DB-DECOYS` has sat unclaimed for months; a live detector now eats one of those decoys.

### Fold the symptom, mint the cause
Tier-2 reported itself CLEAN while its own notebook §c1013 says "Anomalies: 1 new / Status: DEGRADED",
emitted a signal row, and stamped `auditor-tier2-last-healthy.json` to 02:40:07Z **on that DEGRADED cycle**.
Tier-1's heartbeat is written by the probe's ALL_GREEN branch and carries per-check evidence; tier-2/3's is
agent-written, timestamp only, no green gate. That is a liveness stamp wearing a health stamp's name — and
the missed-cycle detector reads it. Missed window folds into the existing 11h row; the asymmetry is the mint.

### Split the CCATO cohort by `.payload`, not `summary`
4 envelopes, same (VNM, `get_technical_indicators`, 2026-08-24), differing only in `returned_value`:
62.1 / 61 / 60 contradict the claim (**genuine**); "not found in database" **agrees** with it (**false positive**).
Folded the 3 into existing coverage (checked all ten lanes), minted only the FP — a second tool whose null
return matches no `tool_null_marker`. Wrote "do not weaken the gate" into the row: 1-of-110 still stands.
Open question handed on: one tool, one ticker, one cycle returned **both** numbers and "not found".

### Carry-over
- `pendingObservations[]` is still fictional (3rd confirmation). Not a sink; use the journal.
- The 01:07Z tick parked the cowork locale defect as "mint if it recurs" — it recurred twice, so it is minted.
  **Its proposed remedy was wrong and I measured it**: `LC_ALL=C` alone yields `1.652.893.70` (C locale prints
  space-separated period decimals, `-F','` then swallows all three loads). Cited precedent file has no `LC_ALL`.
- `financial_reports: 6 low-confidence (expected ≤5)` — 1 over threshold, predicate not reconstructible from
  the envelope, and same-cycle plane-mixing makes the measurement untrustworthy. No mint; recheck after C-01 lands.
- `bctc_vps_queue` stale row verified real: id 255870, BID Q4-2025, `attempts=0`, `last_attempt=null`, created
  2026-04-28 — never attempted in 119 days. Not minted (WARN, 1 row); mint if the count moves.
- `tra-20260822T203234` still open at READ but now **cold-archived** — its disposition never happened and it
  now has no reader at all. Told the reworker; did not close it.
