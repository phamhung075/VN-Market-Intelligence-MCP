# Decision Journal — PO signal-queue triage + inbox drain (2026-08-24T14:41:37Z)

## task_id: FIX-PO-TRIAGE-BUGESCALATION-HEARTBEAT-GUARD-PAYLOAD-CLASS-UNROUTED
- **what-considered:** (a) fold into the existing `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED` row; (b) treat the `[heartbeat-guard]` REJECT as benign since the marker file self-corrected; (c) mint a dedicated row.
- **why-change:** chose (c). (a) is a different defect — that row is about an unrouted signal *type*, this is an unrouted *payload class* inside a routed type. (b) is invalid: the guard REJECT blocked a commit, and `triage-signals.md` enumerates exactly 4 payload classes while explicitly warning that the `escalated=` parse "will always fail" outside them. Verified by `grep -c heartbeat-guard` = 0 in BOTH `triage-signals.md` and `triage-signals-longtail.md`. The highest-consequence class (only one that hard-blocks) had no rule.

## task_id: CLEAN-CTXBLOAT-CRON-DETECT-LOOP-REGISTER-12349B-OVER-12000B-BYTECAP
- **what-considered:** (a) suppress as a false positive under `FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS`; (b) fold into a sibling `CLEAN-CTXBLOAT-*` row; (c) mint.
- **why-change:** chose (c). (a) refuted — `grep -c size-justification` = 0, so the header-suppression path cannot apply. (b) refuted — the three siblings each name a *different* file. Six rows mention this filename but all six are incidental auditor-tier1 mentions, not size coverage. Live `wc -lc` = 173L/12349B, matching the payload exactly; byte-cap only.

## decision: do NOT mint for the 6 auto-push-abort envelopes, and RETRACT my own fold text
- **what-considered:** the routing rule says a still-diverging premise (`ahead=236, behind=0` — re-measured, not read off the stale envelope) directs a FIX naming the rejecting gate.
- **why-change:** no row minted, because the gate rows already exist. **But my first fold asserted those rows are the live blockers, from their stale titles, without re-measuring.** Measured after the fact: all three offenders are under cap and all three doc-shaped pre-push gates return EXIT 0. Retracted in-row rather than deleted so the error remains auditable. Standing lesson recorded in the notebook: verifying a write landed is not the same as verifying the claim is true.

## decision: flip 11 signal rows READ -> triaged
- **what-considered:** leave them READ (the 13:20Z tick's deliberate choice) vs mark terminal.
- **why-change:** flipped, but only after confirming `triaged` is in `TERMINAL_SIGNAL_STATUSES` (`scripts/orch-cold-evict.sh:181`) exactly like `READ` — so eviction behaviour is unchanged and no row is stranded hot. Added target-row-id back-pointers to `disposition` so the dispositions stay falsifiable after cold-evict.

## decision: bespoke timestamped field names are unreachable — fold, do not preserve
- **what-considered:** leave them (harmless) vs fold into conventionally-read fields.
- **why-change:** folded 83 signal rows + 5 board rows. Content in `po_triage_20260824T1320Z`-style keys is invisible to every conventional reader — `backlog[516]`'s genuine alertDigest scope extension was hidden this way, which is precisely how a real coverage claim became unverifiable.
