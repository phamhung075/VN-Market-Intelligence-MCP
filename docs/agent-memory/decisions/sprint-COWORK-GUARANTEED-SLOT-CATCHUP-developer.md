# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** no active sprint goal matched this task; resolved per skill mechanical rule (latest active sprint_goal.entries row) — this task is an unrelated cross-service P1 FIX, ambient to this sprint slot.
**Agent:** developer
**Started:** 2026-07-23T10:03:26Z

---

### STEP developer-S1 · developer · 2026-07-23T10:03:26Z
**task-id:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY
**what-done:** Extracted drain-signals.js's inline "SKIP non-signal shape" check into a shared `isDrainableShape()` + read-only `--count-drainable` subcommand; both the drain-signals.md MANDATORY PERSIST GUARD and dev-team-tick-preflight.sh Step 5 idle-check now call it instead of a raw `ls docs/signals/*.json | wc -l`.
**what-considered:**
- Reimplement the from/type check in bash/jq inside the preflight script — rejected, task explicitly forbids forking a second predicate definition.
- Only fix drain-signals.md's own guard, leave preflight's idle-check raw-counting — rejected, preflight's own header comment says it mirrors the SAME guard fields, so leaving it raw would keep forcing Step 0a on litter-only ticks (the exact starvation symptom).
- Add `DRAIN_SIGNALS_DIR_OVERRIDE` env seam (mirrors existing `ORCH_APPLY_LIVE_FILE_OVERRIDE` convention) so the preflight's isolated test fixtures reach the shared script without touching live docs/signals/.
**why-decision:** Single source of truth for "is this a routable signal" — script is already the canonical drain implementation per drain-signals.md's own CANON-SCRIPT note; sharing it (not forking) is the only option consistent with that existing precedent and the task's explicit instruction.
**why-change:** Mid-implementation caught a real bug during verification: my first `sed -n 's/.../\+.../p'` extraction used GNU-only `\+` (BRE), which BSD/macOS `sed` silently fails to match — count came back empty on this host, masking the whole fix (idle-check always read 0, always "idle"). Replaced with portable bash parameter-expansion prefix-strip; caught only because I live-verified the guard decision on both fixtures per the task's hard gate, not by trusting green tests alone (the tests I'd hand-written matched the same buggy assumption until re-run against the real macOS sed).

### STEP developer-S2 · developer · 2026-07-23T10:22:58Z
**task-id:** FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN
**what-done:** `_check_launchd_agents()` in `auditor-tier1-probe.sh` now matches the LABEL column exactly (field 3 of `launchctl list`'s tab-separated PID/Status/Label output) then asserts field 2 (Status) == "0"; a present-but-nonzero-status label fails with `<label>(exit-status:<code>)`, distinct from the pre-existing `<label>(not-loaded)` absent case. Obsolete-allow-list `case` skip left byte-identical (PO's explicit do-not-change).
**what-considered:**
- Substring-match the whole `lc_out` blob for the status too — rejected: no reliable way to isolate which line's status belongs to which label without field-splitting, risk of matching a different label's status on partial-string collision.
- awk exact-match on field 3 (label) then read field 2 (status) from the same matched line — chosen: real `launchctl list` (verified live on this host) is tab-delimited 3 columns, PID\tStatus\tLabel; exact-match avoids the old substring-match's false-positive class entirely as a side benefit.
**why-decision:** Only option that answers both "is it loaded" and "is it healthy" from one already-captured `lc_out` read, with zero new external calls, matching PO's generic "exists != works" framing.
**why-change:** No change from plan — PO's mechanism_verified_by_po pointed straight at the discarded status column; live-verified against real `launchctl list` output first (confirmed tab-delimited PID/Status/Label header) before writing the awk field-match, so the fix targets the real format not an assumed one.
**live-verify:** Post-fix live probe run flipped ALL_GREEN→FAILURE (exit 1): 3 of 4 repo-tracked non-obsolete LaunchAgents currently show nonzero last-exit status — `com.vn-market.fleet-push(exit-status:78)` (the PO-confirmed EX_CONFIG case), plus `com.vn-market.docker-events(exit-status:1)` and `com.vn-market.cowork-guaranteed-slot-firer(exit-status:143)`, newly surfaced by this same fix (not investigated/remediated — out of this task's scope, reported not papered over per instruction). `com.vn-market.socat-bridge` correctly absent from the failure list (obsolete allow-list).
