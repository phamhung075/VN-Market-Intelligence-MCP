# Cowork Guaranteed-Slot Firer — Invocation Status Findings

**Task:** `SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER` (Task 1 of 2, $0-cost diagnostic)
**Date:** 2026-08-11
**Question answered:** Is `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` / `com.vn-market.cowork-guaranteed-slot-firer` being INVOKED at all since the 2026-08-08T20:23:36Z outage-onset timestamp?

---

## Section 1 — Launchd output (verbatim)

```
$ launchctl list | grep -i cowork-guaranteed-slot-firer
-	0	com.vn-market.cowork-guaranteed-slot-firer
```

```
$ launchctl print gui/501/com.vn-market.cowork-guaranteed-slot-firer
gui/501/com.vn-market.cowork-guaranteed-slot-firer = {
	active count = 0
	path = /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/launchd/com.vn-market.cowork-guaranteed-slot-firer.plist
	type = LaunchAgent
	state = not running

	program = /bin/bash
	arguments = {
		/bin/bash
		/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/scripts/agents-flow/cowork-guaranteed-slot-firer.sh
	}

	working directory = /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
	stdout path = /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log
	stderr path = /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log
	...
	domain = gui/501 [100004]
	minimum runtime = 10
	exit timeout = 5
	runs = 2457
	last exit code = 0
	spawn type = daemon (3)
	run interval = 900 seconds
	properties = inferred program
}
```

**Read:** agent is **loaded** (`state = not running` is expected/idle between 900s ticks, not unloaded — `launchctl list`'s `-` column is PID, not status). `runs = 2457` × 900s ≈ 614h of continuous 15-min-interval scheduling since the plist was loaded — this is a large, actively-incrementing counter, not a stalled one. `last exit code = 0` is the **firer script's own** exit code (the script itself always exits 0 per its `set +e`-wrapped invocation loop — this field does NOT reflect whether the inner `claude` CLI call succeeded; see Section 2).

---

## Section 2 — Firer log evidence

Log location (confirmed via plist `StandardOutPath`/`StandardErrorPath` and script's own `LOG_FILE`/`LOG_ERR_FILE` variables at `scripts/agents-flow/cowork-guaranteed-slot-firer.sh:93-94`):
- stdout: `docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log` (213,468 bytes, 2005 lines, mtime 2026-08-11 11:21:57 local/CEST = **2026-08-11T09:21:57Z**)
- stderr: `docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log` (968 bytes, mtime 2026-08-08 22:31 local — only contains 8× unrelated `Background tasks still running after 600s; terminating` lines, no fatal errors)

**Entries exist well after the 2026-08-08T20:23:36Z cutoff** — the firer has continued invoking `claude` on schedule, matching each guaranteed slot's own cron window, right up to the most recent log line:

```
[2026-08-11T08:51:29Z] --- guaranteed-slot-firer: slot=chef-eod ---
[2026-08-11T08:51:29Z] invoking (bounded 1800s): /Users/admin/.local/bin/claude --dangerously-skip-permissions -p 'slot=chef-eod'
You've hit your weekly limit · resets 2pm (Europe/Paris)
[2026-08-11T08:51:46Z] flow exited (slot=chef-eod exit_code=1)
[2026-08-11T09:21:47Z] --- guaranteed-slot-firer: slot=fb-daily ---
[2026-08-11T09:21:47Z] invoking (bounded 1800s): /Users/admin/.local/bin/claude --dangerously-skip-permissions -p 'slot=fb-daily'
You've hit your weekly limit · resets 2pm (Europe/Paris)
[2026-08-11T09:21:57Z] flow exited (slot=fb-daily exit_code=1)
```

(No log lines between 09:21:57Z and current time 2026-08-11T16:34Z is expected/benign — most 15-min ticks are no-ops when no guaranteed slot's cron matches; the next slots due after fb-daily 09:15 UTC are digest-daily 17:30 UTC and chef-evening 19:45 UTC, neither reached yet at time of writing.)

**Critical finding — every single invocation since the outage onset fails with the SAME error, printed verbatim to stdout by the `claude` CLI itself:**

```
You've hit your weekly limit · resets 2pm (Europe/Paris)
```

- Last **successful** fire (`exit_code=0`) in the entire log: `[2026-08-08T20:31:19Z] flow exited (slot=tnb-audit exit_code=0)` — matches `cowork-schedule.json`'s `tnb-audit.last_fired = "2026-08-08T20:23:36Z"` (invocation-start timestamp vs. exit timestamp, expected small offset).
- Every distinct invocation (deduplicating the script's own `log()`/`tee -a` double-write of each line — every event appears twice verbatim in the raw file) since `2026-08-08T20:31:19Z` **fails**: 14 distinct fires across all 8 guaranteed slots, spanning `2026-08-09T13:17:17Z` (fb-weekend) through `2026-08-11T09:21:47Z` (fb-daily) — **0 successes**, all `exit_code=1` bearing the identical "weekly limit" message.
- This is **not a novel failure mode** — the same "weekly limit" string appears earlier in the log (`resets Jul 28 at 2pm`, 10 occurrences; `resets Aug 4 at 2pm`, 10 occurrences), each time followed by a resumption of `exit_code=0` fires once the weekly window reset (e.g. fires resumed cleanly `2026-07-28T17:47:41Z` onward, right after the "resets Jul 28" window). The current occurrence (`resets Aug 11 at 2pm` → `resets 2pm`, 23 occurrences combined) has not yet resolved as of this findings doc's writing (16:34 UTC / 18:34 CEST 2026-08-11 — just past the stated 14:00 CEST reset, but no post-reset invocation has occurred yet since no guaranteed slot's cron window has landed since the reset time).

**Corroboration — downstream agent notebooks** (per checklist item 4):
| Notebook | mtime | Last entry |
|---|---|---|
| `docs/agent-memory/notebooks/unified-agent.md` | 2026-08-08 21:57 | `2026-08-08T19:55:23Z` chef-evening — matches last successful chef-evening fire |
| `docs/agent-memory/notebooks/fb-market-poster.md` | 2026-08-08 20:27 | No dated session entries found (lessons-only notebook) — mtime confirms no write since 08-08 |
| `docs/agent-memory/notebooks/digest-predict.md` | 2026-08-08 20:27 | `Last updated: 2026-08-08 17:40 UTC` daily-predict |

All three notebooks are stuck at 2026-08-08, exactly matching the last `exit_code=0` log entries. Zero downstream cycle activity since — fully consistent with "invoked, but the `claude` CLI process itself fails before any downstream work happens."

---

## Section 3 — Diagnosis

**INVOKED BUT NO FIRES (wiring/failure issue) — invocation has NOT stopped.**

The launchd agent is loaded and firing on its 900s schedule without interruption (`runs=2457`, log entries continuous through 2026-08-11). Every guaranteed slot's cron window since 2026-08-08T20:23:36Z has been correctly matched and a `claude --dangerously-skip-permissions -p '...'` invocation attempted. **100% of those invocations since 2026-08-08T20:31:19Z have failed** with `exit_code=1` and the CLI's own printed message: `You've hit your weekly limit · resets 2pm (Europe/Paris)`.

This is **not** a launchd/plist invocation problem (ruled out — Section 1/2 evidence). This is also **not, on the evidence gathered here, a code-level "wiring" bug in `cowork-guaranteed-slot-firer.sh` or `cowork-match-slots.js`** in the traditional sense — the script and matcher are demonstrably working correctly (correct slot selected, correct cron match, correct invocation, correct logging). The actual failure is external to this repo's code: the `claude` CLI binary invoked under this plist's environment is hitting an **Anthropic account/plan weekly usage-limit ceiling**, and every invocation since then exits immediately with that message before any downstream work (published-marker claim, dish generation, telegram post) can occur.

## Section 4 — Evidence summary

- `launchctl list`/`print`: agent loaded, `runs=2457`, actively scheduled every 900s — invocation has **not** stopped.
- Firer stdout log has continuous entries through `2026-08-11T09:21:57Z` (most recent guaranteed-slot cron match at time of this diagnostic), well past the 2026-08-08T20:23:36Z cutoff.
- Firer stderr log shows only benign `Background tasks still running after 600s` notices — no fatal script/launchd errors.
- Last `exit_code=0` (successful) fire anywhere in the log: `2026-08-08T20:31:19Z` (slot=tnb-audit) — matches `cowork-schedule.json`'s recorded `last_fired` timestamps for all 8 guaranteed slots exactly.
- Every invocation since that timestamp (14 distinct fires across all 8 slots, spanning 08-09 through 08-11) exits `exit_code=1` with the identical `claude` CLI message: `You've hit your weekly limit · resets 2pm (Europe/Paris)`.
- Same failure signature (with earlier reset dates `Jul 28`/`Aug 4`) appears twice previously in the log history, each time self-resolving once the weekly window reset and normal `exit_code=0` fires resumed — this is a recurring, external, account-level rate-limit pattern, not a one-off code regression.
- Three independent downstream-agent notebooks (unified-agent, fb-market-poster, digest-predict) are all stuck at 2026-08-08, fully corroborating zero successful downstream cycles since the last successful fire.
- `cowork-schedule.json`'s 8 guaranteed-slot `last_fired` fields all read 2026-08-07/08 — consistent with (updated only on success) matching the log's last-`exit_code=0` timestamps.

## Section 5 — Next step

Per this SPIKE's decision tree: invocation entries exist with no successful fires since the outage onset → hand off to **`SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING`** (Task 2, `next_agent: architect`) for the wiring trace, **with this finding pre-loaded as the primary lead**: the "wiring" investigation should start from the `claude` CLI weekly-usage-limit exhaustion (`You've hit your weekly limit · resets 2pm (Europe/Paris)`), not from `cowork-guaranteed-slot-firer.sh`/`cowork-match-slots.js` internals, which this diagnostic found to be functioning correctly (correct slot selection, correct invocation, correct logging). Recommend Task 2 confirm/rule out:
1. Whether this plist's `claude` CLI invocation is sharing an account-level weekly quota with other high-frequency callers in this fleet (e.g. the live cowork dispatcher, code-janitor, or other launchd/cron agents), and whether that quota is being exhausted faster than intended.
2. Whether a plan upgrade / quota increase / invocation-rate reduction is the appropriate fix, in which case this may ultimately route to **ops** (account/plan/quota scope) rather than a code wiring fix — Task 2 should make that call explicitly once it traces which caller(s) are consuming the shared weekly budget.
3. Cross-reference `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` (dual-plane double-fire ticket) — if both the live cowork dispatcher AND this firer are independently invoking `claude` for the same slots, that would accelerate weekly-quota exhaustion; worth checking whether dedup (the published-marker `task_claim` gate cited in the plist's own `DEDUP` comment) still requires BOTH invocations to spend one full `claude` call each before the marker is checked, doubling quota burn per slot.
