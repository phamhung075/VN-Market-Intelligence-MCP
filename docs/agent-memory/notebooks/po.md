# PO Notebook

_Last: 2026-07-25T12:19Z (router-referred mint-vs-fold on Tier-1 heartbeat writer gap — FOLD, 0 rows minted)_

## Tick 2026-07-25T12:15–12:20Z

| Input | Disposition |
|---|---|
| Router: `auditor-tier1-last-healthy.json` has no writer on the live Tier-1 path | **FOLD** — not a new row |
| `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` (READY/P2/developer) | `+ .live_path_evidence_20260725`; status/lane/owner/priority **unchanged** |
| Board totals | `task_total` 652→652, `ready[]` 44→44 — conservation flat, nothing minted |

**Ruling:** the finding is real and I re-verified it independently, but the READY row minted 2026-07-21 (`po/ruling-20260721T2050`) already owns the surface — its `.why_the_obvious_fixes_are_wrong` states verbatim *"No tier-1 heartbeat writer exists anywhere in the repo … system-auditor spawns every 30min forever"*, and its `.ownership_two_party` + AC(4) already own the register.md-vs-live-cron divergence. Commit `339c34d32`.

## Lessons

- **Case-sensitive prior-art grep is a duplicate-row generator.** Router grepped `HEARTBEAT|LAST-HEALTHY|TIER1-PROBE|SUPPRESS` and honestly reported ZERO matches; the owning row's title carries lowercase `heartbeat`, so it was invisible. Same needle, `-i`, found it in one pass. **Always grep the board case-insensitively, and on the defect's *nouns* (`pre.?gate`, `preflight`, `tier-1`), not just the router's chosen ID tokens.** This is the 3rd tick in a row where grep-before-mint prevented a mint.
- **A handed-down CONSEQUENCE is a claim, not evidence — re-derive it.** Router predicted "from ~13:00Z Job 2 force-spawns every tick forever." That cannot fire: if Job 2 were live it would run `auditor-tier1-probe.sh`, which writes the heartbeat on green — so a frozen heartbeat is *proof Job 2 is not live*, and a not-live guard cannot leak. The router's own fact #2 contradicted its consequence; nobody had checked the two against each other.
- **Git history of a state file is the cheapest liveness test there is.** Values: 07-02T12:40, 13:14, 16:43, 07-04T19:14, 07-12T07:43, 07-25T07:38, 07-25T11:37. Every one off the `*/30` boundary, gaps in days → the file has **never** had a periodic writer, so the WU-3 pre-gate has been dormant since the day it shipped (23d). That reframes "today's regression" into "a 23-day-old unarmed optimization" and is what killed the urgency case.
- **Two scripts, similar names, opposite contracts.** The tick's raw-probe block comes from `docs/agents/system-auditor/probe.sh` (no heartbeat write); the heartbeat writer is `scripts/agents-flow/auditor-tier1-probe.sh`. Seeing a real probe block in the notebook is **not** evidence the probe script ran. Confirm by the emitting line, not by the artifact's shape.
- **Folding earns its keep only if it adds something the original ruling could not see.** Here: OH-3.5 (scope item 2) will read a file with no live writer → ships as a permanent-stale **false positive** unless the router re-arm lands first. That sequencing risk is new, and it is the reason "decline, record nothing" was wrong.

## Carry-over

- **`FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` is two-party and must not be collapsed.** Developer does the 2 edits; **ROUTER must then re-arm via `/cron-detect-loop`** — `register.md` is a registration source, not the live cron. Do not let it close on file edits alone (its own AC(4) forbids it).
- **Sequence the re-arm BEFORE or WITH OH-3.5**, then verify the heartbeat advances across 2 ticks. Shipping OH-3.5 against the current live path manufactures an auditor FP.
- **Do NOT "fix" the tier-1 heartbeat by dropping the `AUDIT_TIER` 2/3 gate at `main.md:748`** or by porting `suppress_heartbeat` to tier-1 — the 07-21 ruling rejects that direction explicitly.
- **`FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (P0) still CANNOT self-dispatch** — needs an out-of-band `architect` spawn. Do not clear `supervised`/`plan_only`; the classification is correct. Do not re-open its (a)/(b)/(c) option set.
- **If architect rejects the durable inbox** in favour of the narrow BOUNDED-1 guard → re-open `FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` from `archive[]`; do not silently narrow AC-2.
- **`ready[]` is a trap lane (44) and `review[]` is write-only (107, `qa[]`=0).** Unchanged this tick and still worsening — both unblock only via the P0 above. `in_progress` is now **0**.
- **`UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` MUST CO-SHIP.** `UC-SDF-P2` has a 2nd failure mode beyond the filename (on-grid file lacks `fetchedAt`/`created_at`); fixing only the name leaves it dark.
- Head untouched. I dispatched no agent, touched no container. **Nothing pushed** — push stays gated.
