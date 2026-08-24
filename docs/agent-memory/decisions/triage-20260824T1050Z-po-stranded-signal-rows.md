# PO triage — 7 stranded `to: po` signal_queue rows + 82-envelope durable inbox, 2026-08-24T10:50-11:03Z

Session `7be6b4cd-057e-419b-a967-4810daf2b646`. Router hand-dispatch (not cron, not a chain): the
rows had been held at `status=NEW` across six consecutive cowork ticks because **`po` has no
cron-armed dispatch path in any of the three session-armed cron families**, and
`cowork-schedule.json` has zero `po` slots. Pre-checks run: signal dashboard, supervised-goahead
(`.head` idle → no-op), manual-dispatch-sweep (106 candidates — see ruling 2 below), Step 0-TNB
(latest handoff already carries a PO ACK at 01:37Z, no new findings), Step 0-SIG.

Writes landed via three `orch-apply.sh` pipes:
`scripts/po-triage-20260824T1050Z-signalqueue-dispositions.jq`,
`scripts/po-triage-20260824T1056Z-board-mints-and-folds.jq`,
`scripts/po-triage-20260824T1105Z-mint-snapshot-nominal-key.jq`.
Per-row reasoning lives inline on each row (`disposition` / `retraction_reason` /
`po_occurrence_*` / `po_expedite_*` / `po_corroboration_*`). This file records the four rulings
that have **no row to live on**.

---

## RULING 1 — the dispatch's fact #2 is wrong on 5 of 6 rows. Corrected, not adopted.

The router asserted that each of the six `narrative_contradiction` rows "asserts
`get_technical_indicators` *returned non-null data* while its own payload records
`returned_value: "not found in database"`". Re-measured at source: **exactly one of the six** does
(`…-62a037`). The other five carry real indicator values — `62.1`, `62.1`, `61`, `61`, `60` — and
are genuine FAIL-shaped rows whose accusation against chef is, on its face, sound.

That distinction is load-bearing, not pedantic: the inverted row is a **false accusation against a
peer agent** and the established remedy is `RETRACTED` with a `retraction_reason` (12 prior
instances). Folding all six identically would have preserved one false accusation and retracted
five true ones. Disposition split accordingly: 1 RETRACTED, 5 `triaged`/FOLD.

The router's fact #1 (the BCTC row is wrong about its own subject) **was** confirmed independently
via a live `get_bctc_refined` call, and it is worse than reported — see ruling 3.

## RULING 2 — the manual-dispatch sweep cannot stamp its own #1 candidate. Reproduced, then minted.

`manual-dispatch-sweep.md` § Step 1 returns 106 candidates and § Step 2 mandates stamping exactly
the top one. The top one is `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED`, whose prose is
34589B. The four `po_manual_dispatch_*` stamp fields are **absent from
`scripts/orch-row-prose-ceiling-check.mjs`'s `STRUCTURAL_FIELDS`**, so the stamp counts as net-new
prose growth on an already-over-ceiling row and `orch-apply.sh` hard-aborts.

Probed live rather than inferred: the Step-2 jq was run verbatim and returned
`[orch-row-prose-ceiling-check] ABORTED … [orch-apply] ABORTED … live file untouched`, with
`po_manual_dispatch_flagged_at` still `null` on re-read. Because `flag_reentrant()` only excludes
rows carrying a *fresh* stamp, an unstampable row stays permanently eligible at rank 1 — every
future sweep re-selects it and 105 candidates (including two more P0s) never get a turn.

This is the **second** stamp family to hit the same gap; `secondary_claimed_*` was added to
`STRUCTURAL_FIELDS` on 2026-08-15 for the identical reason, and that fix's own header calls the
result a "deterministic livelock". Minted as
`FIX-PO-MANUAL-DISPATCH-SWEEP-STAMP-REJECTED-BY-PROSE-CEILING-ON-ITS-OWN-TOP-CANDIDATE`, and this
tick stamped rank-2 instead with the skip recorded on the row rather than left silent.

## RULING 3 — the `<=0.6` confidence cap is asserted in three places and enforced in none.

`bctcImageFetchDegradedSignalWriter.ts`'s header calls the cap "BY DESIGN" and two flow docs
(`table-page.md`, `continuation-stitch.md`) instruct the refine subagent to apply it. Live
`get_bctc_refined(1f53ef33…)` returns three `image_unavailable`-flagged units at **0.75 / 0.65 /
0.70**. There is no server-side clamp anywhere on the `push_bctc_refined_unit` path.

The consequence is worse than a wrong sentence in a signal: any consumer filtering
`confidence <= 0.6` to find image-degraded units returns **zero** for a report that has three of
them. That is a silent false-green, and it is why the emitter half was split out to its own row
(`FIX-BCTC-IMGDEG-SIGNAL-SUMMARY-CONTRADICTS-ITS-OWN-LIVE-CONFIDENCES`, AC-4) rather than folded
into the fetch-plane row, which owns a different question.

Second-order note worth keeping: the emitter's hardcoded-summary defect is **byte-for-byte the same
shape** as CCATO defect (C) at `narrative-truth-gate.sh:421-423` — a summary template that asserts a
conclusion without ever reading the payload it is describing. Two independent emitters, same bug,
found the same day. Whoever fixes either should read the other.

## RULING 4 — inbox CLEAR: 55 cleared, 27 held back, deliberately leaving CI red.

`guard-signal-type-coverage.sh` derives its Pipeline-A live-type set from the same
`pending_triage_inbox[]` array this step clears, so **clearing an envelope whose type has no
Pipeline-A routing row turns the guard green with the routing table untouched** —
green-because-the-input-was-deleted is indistinguishable from green-because-fixed. The 08-23 tick
established this precedent by holding back 3 of 44; today it is 27 of 82, across nine types.

The unrouted set has grown **2 → 9 in 17 hours**, and the growth is a *different sub-class*: five of
the seven new types (`narrative_contradiction`, `cron_fire_gap`, `db_integrity_breach`,
`auditor_cycle_missing`, plus the `system_issue` underscore twin) have perfectly good Pipeline-**B**
rows. They read as unrouted only because the guard's deliberate per-pipeline scoping (added
2026-08-22) refuses to count a B-row as coverage for an A-arrival. That scoping is correct as a
detector, but it converts every cross-pipeline type into a hand-written bridge row — the doc already
carries two such bridges. Recorded on
`FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS`; the structural
answer stays with the architect/registry rows and was not collapsed into the tactical one.

The CLEAR itself was written to the *fixed* shape, not the documented one:
`FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP` (P0) records that the
doc's `echo "$json" | jq` block silently no-ops under zsh behind its own `|| true`. Ids were read
straight out of the file with `jq`, `printf` replaced `echo`, the `|| true` was dropped, and a
post-write re-read confirmed `inbox 82 → 27` with zero residual routed types. The doc is still
wrong; the row is now manual-dispatch-flagged.

---

## Not done this tick, with reasons

- **Step PUSH-BACKSTOP skipped.** `ahead=212 > 20`, so the threshold fires, but the pre-push
  size-lint gate is red on two committed files and each attempt writes another `auto-push-abort`
  signal (~48/day by the dispatcher's own measurement). The step is documented SECONDARY
  best-effort and the dedicated launchd timer already retries every 30 min. Both blockers are now
  tracked P0; pushing again from here would add noise with no chance of success.
- **`po-decision-bug5468-2026-08-23T15:27:38Z` left at `NEW`.** It is addressed `to: ops`, not
  `to: po`, and its own `po_ruling_20260824T0737Z` explains the hold: its MITIGATION clause is a
  standing, still-unactuated instruction. Not PO's to close.
