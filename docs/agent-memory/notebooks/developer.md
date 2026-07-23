# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN (launchd_agents check now asserts exit status, not just presence)

## Session 2026-07-23 — TE-T17 (dev-team direct-execute, zone=multi) — REVIEW

**Task:** ops.md notebook hit 701L (3.5x cap) — PostToolUse auto-prune hook only matches Write|Edit, Bash-heredoc writes (07-11 Docker incidents) bypass it; class bug across all 30 notebooks.

**Actions taken:** (1) ops.md 1197L→29L (had grown past the 701L in the original finding) — 23 `## ` sections moved verbatim to new `docs/incidents/<date>-<slug>.md` files, one-line pointer left per incident. (2) New `scripts/agents-flow/notebook-linecap-sweep.sh` wired into `code-janitor/flow/main.md`'s existing 6h cron — sweeps all notebooks, delegates over-cap files to `notebook-auto-prune.sh`'s own drop-oldest logic via synthetic PostToolUse JSON (no duplicated pruning code, write-path-agnostic). (3) Blocking `wc -l` pre-commit gate added to ops's notebook-commit step. (4) `.test-notebook-prune-debug/` already absent — verified no-op.

**Verification:** `wc -l` ops.md = 29 (≤200L). 5/5 pre-existing `test-notebook-auto-prune.sh` cases still GREEN after the cross-reference comment edit. New `notebook-linecap-sweep.test.sh` 7/7 GREEN (fixture scoped via `NOTEBOOK_SWEEP_PATTERN` — never touches real notebooks), idempotent second run clean.

**Board:** `task_board.in_progress[TE-T17]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Two OTHER real notebooks (`agent-father.md` 303L, `system-auditor.md` 204L) are currently also over cap — left untouched (out of this task's named scope; will be caught by the new sweep on its next 6h cron fire) rather than expanding scope mid-task.

Zone health: notebook prune-bypass class closed — hot notebook (ops) under cap, sweep mechanism proven against synthetic fixtures + reuses tested hook logic, ops commit path gated | HEALTHY

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
