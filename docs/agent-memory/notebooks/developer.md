# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE (BOUNDED-1 now withholds prose-only-sequenced rows until PO encodes the dep)

## Session 2026-07-23 — FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** dev-team MANDATORY PERSIST GUARD counted RAW `docs/signals/*.json` files, not drainable (from/type-shaped) signals — cowork telemetry/tick residue (55 files live, e.g. `cowork-team-*`/`price_anomaly_*`) inflated the count past the >50 threshold and forced a full drain every tick even with nothing routable, feeding Step-1 triage starvation.

**Actions taken:** Extracted `drain-signals.js`'s inline "SKIP non-signal shape" check into a shared `isDrainableShape()` + new read-only `--count-drainable` subcommand (zero DB/file mutation). `drain-signals.md` guard item 1 and `dev-team-tick-preflight.sh` Step 5 idle-check field (a) both now call it instead of a raw `ls | wc -l` — single predicate, not forked, per the task's explicit instruction. Added `DRAIN_SIGNALS_DIR_OVERRIDE` env seam (mirrors `ORCH_APPLY_LIVE_FILE_OVERRIDE`) so preflight's isolated test fixtures reach the shared script.

**Verification:** Live-confirmed against the real inbox: raw=55, drainable=0 (matches the reported symptom exactly). 3 new fixtures in `drain-signals.test.js` (residue-only→0, genuine+litter mixed→1 negative control, missing-dir→0) — 31/31 GREEN. `dev-team-tick-preflight.test.sh`: T14 fixture upgraded `{}`→genuine `from`+`type` signal (negative control, still trips RUN); new T32 proves litter-only `SIGNALS_DIR` resolves RUN-IDLE — 91/91 GREEN. Self-caught mid-verification: first `sed \+` extraction is GNU-only BRE, silently no-op on BSD/macOS `sed` (this host) — always returned empty, masking the fix; replaced with portable bash parameter-expansion prefix-strip.

**Board:** `task_board.in_progress[FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Touched exactly the 3 named root-cause files + their paired tests + `drain-signals.md` guard line + `docs/WORK.md` — no fork of the shape predicate, no live `docs/signals/` mutation from `--count-drainable` (read-only by design).

Zone health: dev-team persist-guard no longer litter-sensitive — drainable-only count verified against real inbox (55 raw / 0 drainable) and both fixture directions (litter-only no-trip, genuine signal still-trips) test-proven | HEALTHY

## Session 2026-07-23 — FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** `auditor-tier1-probe.sh` `_check_launchd_agents()` only asserted a repo-tracked plist's Label appeared somewhere in `launchctl list` output — the PID/Status/Label output's Status column was captured then discarded. `com.vn-market.fleet-push` sat loaded at EX_CONFIG(78) for 522 consecutive runs, verdict stayed ALL_GREEN the whole time. Presence != works.

**Actions taken:** Rewrote the check to `awk`-match the LABEL column exactly (field 3 of the tab-delimited `PID\tStatus\tLabel` output, confirmed live against real `launchctl list` on this host), then read field 2 (Status) from that same matched line and require `== "0"`. A present-but-unhealthy label now fails as `<label>(exit-status:<code>)`, distinct from the pre-existing `<label>(not-loaded)` absent case. The obsolete-label allow-list `case` skip (`com.vn-market.socat-bridge`) is untouched — left exactly as-is per PO's explicit do-not-change.

**Verification:** Full `auditor-tier1-probe.test.sh` 102/102 GREEN, including 3 new cases (T33 loaded+status78→FAIL naming label+code, T34 loaded+status0→PASS restore, T35 obsolete-allow-listed+absent→PASS), plus all 30 pre-existing launchd/non-launchd cases unchanged. Live probe run post-fix: verdict flipped ALL_GREEN→FAILURE (exit 1) — 3 of 4 tracked non-obsolete LaunchAgents currently carry nonzero last-exit status: `com.vn-market.fleet-push(exit-status:78)` (the confirmed EX_CONFIG case), plus newly-surfaced `com.vn-market.docker-events(exit-status:1)` and `com.vn-market.cowork-guaranteed-slot-firer(exit-status:143)`. Not investigated/remediated — reported per instruction, out of this task's scope; `com.vn-market.socat-bridge` correctly stayed off the failure list.

**Board:** `task_board.in_progress[FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Touched exactly the one check function + its test file. Did not chase the 3 newly-surfaced nonzero-exit LaunchAgents (docker-events, cowork-guaranteed-slot-firer) — that's new signal for a follow-up task, not this fix's job.

Zone health: launchd_agents check now closes the "exists != works" gap generically — live-proven it catches the real fleet-push EX_CONFIG incident plus 2 more previously-invisible nonzero-exit agents in one pass | DEGRADED (3 LaunchAgents newly confirmed unhealthy live — detector fixed, underlying jobs not yet fixed)

## Session 2026-07-23 — FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** PO-authored ordering constraints written as prose (`po_sequencing_YYYYMMDD` keys) are invisible to `scripts/lib/devteam-eligibility.jq`'s `effective_depends_on()` — 2026-07-22 BOUNDED-1 blind-promoted UC-CDC-P5 (ordering lived only in `.po_sequencing_20260722`) then had to be reverted; hand-fixed with `depends_on` after the fact, gate blind-spot remained for the next such row.

**Actions taken:** Added `has_unbacked_sequencing_prose($detail_items)` to the shared library (board-OR-detail `po_sequencing_*` key present AND `effective_depends_on` empty) as a new conjunct in `is_bounded1_eligible` ONLY (SLS/RLC compose their own predicate subsets, don't call `is_bounded1_eligible` — def lives in the shared file per one-shared-contract principle so they CAN adopt it later, but this incident was BOUNDED-1-specific so only BOUNDED-1 gates on it now). Extended `bounded1-supervised-lane-report.sh` with a non-gating TERTIARY section listing every unbacked-prose row. Added `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` (SYNTHETIC unbacked/backed/detail-side/control fixtures + LIVE dynamic-discovery check, no hardcoded task IDs). Deliberately does NOT regex-parse the prose to infer a predecessor id — forces PO to encode `depends_on` instead.

**Verification:** New verifier 5/5 PASS (AC-1/1b/1c/AC-2-live/control). Live-verified UC-CDC-P5 (already hand-fixed 07-22) now evaluates `has_unbacked_sequencing_prose=false, is_bounded1_eligible=false` — correctly still held by pre-existing `deps_satisfied`, not double-gated. Live TERTIARY report surfaces exactly 1 row (`PDF-AVAIL-02-FIX`, also `supervised:true`). Ran full suite: `devteam-dispatch-gate-satisfiability.sh` 100% PASS, `bounded1-supervised-lane-report.sh` PASS, all 4 shared-library callers (BOUNDED-1/SLS/RLC/QA-Drain) parse+run clean. Dry-run of `devteam-backlog-promote-bounded1.jq` against live board still resolves a normal pick (unaffected). Pre-existing sibling verifier `devteam-bounded1-detail-disposition-gate-verify.sh` CONTROL assertion fails — confirmed via `git stash` this is IDENTICAL pre-fix (harness bug: `make_isolated_fixture()` never clears `.task_board.ready[]`, so `ready[0]` reads a stale leftover id on no-op runs) — unrelated to this change, reported not fixed (out of scope).

**Board:** `task_board.backlog[FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE]` → `review`, `next_agent=qa`, `branch:null`, `.head` synced to idle, via `orch-apply.sh` (dispatcher-owned write, not committed by this cycle).

**Scope discipline:** Touched exactly `scripts/lib/devteam-eligibility.jq` + `scripts/audits/bounded1-supervised-lane-report.sh` + new verifier + `docs/agents/dev-team/flow/main.md` doc update. No regex-mining of prose (explicitly forbidden by spec). No orch-state.json commit (dispatcher's file).

Zone health: BOUNDED-1's prose-sequencing blind spot closed generically — next PO-prose-only-sequenced row is withheld + surfaced instead of blind-promoted; SLS/RLC/QA-Drain unaffected (verified) | HEALTHY
