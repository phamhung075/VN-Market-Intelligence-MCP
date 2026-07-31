# PO Notebook

_Last: 2026-07-31T23:03Z (dev-team Step 1 triage, cron tick 22:37Z). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-4.md` STEP po-S104..po-S107._

## This cycle

- **3rd consecutive tick for one ci_red, still zero board rows — the fence caught it.** Same `size-lint` defect fired at the 20:46Z, 21:18Z and 22:46Z drains. Verified at source that all three runs (30662758810 / 30664924688 / 30669964532, three advancing SHAs) name the **same sole offender**: `apps/technical-analysis/pkg/interface/http/router.go`, 143L > 120L. Minted `FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L` P1/S, `apps/technical-analysis/`.
- **Second regression-of-a-shipped-fix in one evening, same mechanism as this afternoon's.** `git show 39fbec098^:<f>|wc -l` = **112** → `git show 39fbec098:<f>` = **143**. Commit 39fbec098 (`FACTORY-TECHANALYSIS-fix-discarded-service-and-port`, still in review) self-reports verification on go build/vet/test/golangci-lint + sandbox — **size-lint was not in that set**. Identical shape to `FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L` 5h earlier.
- **TNB asked me to adjudicate the L5 finding; reading the artifact refuted its premise.** TNB reported the evening synthesis JSON has "ZERO Kinh Dịch/hexagram fields anywhere". The file (89L) carries them in **4 places** — including `conviction_calls[NVL]` "Kinh Dịch Tập Khảm reversal -100%" **verbatim at :52**, the exact claim called unbacked. Fabrication refuted; folded into `FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION` as a gap-token **over-scoping** defect, not a new row.
- **BCTC ingest quarantined 12 docs / 10 tickers in 23.5 min with 0 stores.** Queue grew **11 → 15 during this one triage run**. Supplied period never wins, margins to **68:2**, and 6/12 are a clean Q1→Q4-same-year skew. Attached to `FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT` (review) rather than minting — that row already owns the mechanism.
- **Both mandatory pre-checks ran.** supervised-goahead: `should_hold=false` on `FIX-FOREIGN-FLOW-DEAD-ENDPOINT`, no-op. manual-dispatch sweep: **41 candidates**, top = `TE-T14` via the **stale-reflag re-admission** branch (prior stamp 16:04:37Z aged past the 4h window without reaching dispatch) — stamped, folded into BATCH.

## Carry-over

- **"Prior ticks already saw it" is the amnesty the fence exists to block.** Two earlier PO spawns had this same signal and minted nothing. The fence's rule — pre-existence with **no matched row** is a fabricated disposition — is what converted tick 3 into an actual row. Never reason from "a peer probably handled it"; run the 5-lane check.
- **Backticks inside a double-quoted shell string get executed, silently corrupting a jq --arg note.** Cost one bad `orch-apply` write (it validated and landed *because* the corruption was well-formed JSON). For any prose >1 line or containing backticks: **write to a file, use `jq --rawfile`**. Then verify with `grep -cF` on fixed strings.
- **`grep -oE ".{0,N}pattern.{0,N}"` on a long single-line JSON value hangs the shell.** Catastrophic backtracking; killed 2 background jobs. Use `grep -cF` / read the file with the Read tool instead.
- **Verifying a jq result by piping jq → jq breaks on any multi-line string value.** The "Invalid string: control characters" error was my harness, not the data. Do the whole check in **one** jq pass.
- **A validator with a 0% pass rate is a suspect validator, not a proven guard.** Same shape as `feedback_cycle_snapshot_promote_conservative_default_refuses_every_input`. "It fired" ≠ "it is correct" — and quarantining under *neither* key discards data even when the detector is right.
- **Board saturation is now the binding constraint, not triage.** 355 backlog / 240 review / 51 ready = **646 open rows**, WIP 1 all tick. Both TNB HIGHs are P1 rows *already dispatchable since 07-21*. Minting more is churn; this tick deliberately produced **1 new row from 15 unresolved reports + 6 TNB findings**.
- **Still owed (4th consecutive tick deferred):** `COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR` `--only` semantics; **6 review[] rows with `next_agent: po`**; the null-zone board sweep; `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES`.
- **Not run this tick:** channel-audit (Telegram inputs already fully dispositioned above); push-backstop (not evaluated — no ahead-count check performed).
