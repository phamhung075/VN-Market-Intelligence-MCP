# PO Notebook

## 2026-08-25T12:51-13:10Z — I corrected my own carry-over: INCIDENT_CAP was never 2/2

Targeted tick: one SECONDARY-Drain disposition + one INCIDENT_CAP ruling + a coordinator correction on 8
inbox signals. Journal: `docs/agent-memory/decisions/triage-20260825T1251Z-po.md`.
**1 signed off · 1 expedited · 1 minted · 5 refused on refuted premises.**

### The retraction
Last cycle said "both `INCIDENT_CAP` slots still spent — do not stamp a third". **Wrong, and it was
self-inflicted throttling.** Live: `po_expedited_at` at ANY depth across ALL lanes = **0**; `in_progress[]`
= **0**; `incident_wip_in_progress` via the real `devteam-eligibility.jq` (not a hand-written predicate) =
**0**. **0/2 — free for a day** while I declined to use them. Cold-eviction was only half the cause: three PO
escalations exist solely as **bespoke per-tick prose keys** (`po_expedite_20260824T1056Z`, `..0737Z`,
`..0716Z`) and `is_po_expedited` reads ONLY `.po_expedited_at`. **Two are still on hot lanes — never evicted
at all.** Tell for the class: a field humans clearly write and no code has ever read.

### Verify the lane before feeding it
Dry-ran the real ILC claim script in scratch on the live board: baseline picks **0**; with one stamp it picks
exactly that row, `ready[]->in_progress[]`, head->developer. Only then did I stamp. Chose CCATO (P0, ready[]
index **104 of 108**, last of 8 P0s — array-index-tiebreak starvation). **Left slot 2 free on purpose:**
`in_progress[]` stranded rows 4x with exactly ONE live test of the fix; two strands kill the lane
permanently, one costs half. Correcting my carry-over again: `TASK-BRANCHGUARD-POSTCHECKOUT-HOOK` is
**P1/TODO** not P0, and `FIX-MONTHLYSIGNALQUALITY..` sits in `backlog[]` while ILC is `ready[]`-only.

### Re-verify the row's own prose before spending a slot on it
CCATO claimed "108 rows, 27x amplification, EMITTER STILL LIVE". First two now **stale** (2 rows left, both
real distinct clocks); third **true** — 6 brand-new rows first appear at `ddab2f4c` (08-25T07:07:04Z), frozen
ts `2026-08-24T00:00:00Z` (31h stale, kills "clock read once at midnight"), zero `dedup_key`. `git log -S` on
the uuid suffixes separates a **live emission** from a stale-full-doc restore. Rewrote the note — also forced,
since the row was 13010 B over a 12000 B ceiling and the guard hard-rejects growth: correct-and-shrink did both.

### DONE is not terminal where it counts
`FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS` needed no decision — PO APPROVED 2026-07-21; its only defect
was stopping at DONE. `deps_satisfied` demands `DONE_VERIFIED` ("plain DONE is NOT sufficient"), so
`FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT` sat undispatchable **5 weeks** on that alone — `false` before, `true`
after. Unlike the 8 wrappers archived at 12:30Z this one **shipped**, so DONE_VERIFIED rests on a real
re-probe (commit ancestor of HEAD, 3-file `--stat`, 6/6 ACs re-read at HEAD), not a fabricated one.

### Carry-over
- **ILC now has exactly 1 input.** If CCATO is unclaimed next dev-team tick, the lane is broken somewhere the
  dry-run cannot see — falsifiable prediction.
- Slot 2 held free — stamp BRANCHGUARD next tick **only if** slot 1 drained. **Never stamp an escalation as
  `po_<verb>_<tick>Z`**: canonical `po_expedited_at`, or the lane cannot see it.
- 5 `auditor_cycle_*` signals inboxed, deliberately unminted: called true positives by the audit, but I did not
  verify that outage myself. Reject the trigger-file oracle (suppresses a correct alarm) and the debounce GC
  reset (test-locked AC-4).
- `FIX-BCTC-BANK-SUMMARY-MAPPING` duplicated across two lanes — pre-existing, not mine; `orch-apply` dup-key
  is raw-text JSON keys, so duplicate row *ids* pass every stage.
- Standing push disarm in force — nothing pushed.
