# FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED

**Architect:** design cycle 2026-08-25T03:24Z | **Zone:** cross-service/ (scripts/agents-flow/, no `apps/<service>/`) | **BUILD-STANDARD:** not-applicable (bug-fix/scoring-model change, no new primitives)

**Row:** `docs/data/orch/orch-state.json` `.task_board.in_progress[]` id `FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED` (P1, po_expedited, claimed by dev-team incident-lane consumer, dispatch_lane=architect). No BA spec / no `docs/handoffs/` file exists for this row — findings recorded here (architecture brief) per the "direct PO mint, no handoff" convention (architect flow §5), and the row's `architect_review_note` field carries a pointer to this file.

## HARD CONSTRAINT (verbatim from status_note — binding on every implementer)

NEVER re-arm `com.vn-market.fleet-push` (no plist Disabled-key edit, no `launchctl enable/load/bootstrap`). The disabled state is an intentional, user-made policy decision (re-arming would push ~224 unpushed commits to origin/main unattended — PUSH-AUTONOMY-1). The fix is a **scoring change**, not an infra change. Also forbidden: adding/retargeting an ack-ledger entry for fleet-push — an ack requires "degraded + open fix row"; a deliberately disarmed job is neither.

## 1. Root cause (brownfield findings, verified by read + live execution)

`scripts/agents-flow/auditor-tier1-probe.sh` `_check_launchd_agents()` (script L694-757) discovers labels from the **repo** plist directory (`$LAUNCHD_DIR`, default `$REPO_ROOT/launchd/`, L257) and tests each against `launchctl list` (L718). A label absent from `launchctl list` and absent from the ack ledger (`docs/data/auditor-launchd-ack.json` `.acked[]`) falls straight into the bare `bad="${bad}${label}(not-loaded) "` branch (L729) — there is no third classification. The only existing "this is fine" escape hatches are (a) `obsolete_labels` (L696, a hardcoded allow-list, semantically wrong for a job that is *loaded-but-disabled-by-choice* rather than *retired*) and (b) the ack ledger (semantically wrong per the hard constraint above — it is for tracked degradations, not policy decisions).

`com.vn-market.fleet-push`'s ack entry was already removed 2026-08-24T18:44:23Z (commit `930297f37`, per PO's staleness-rule ruling `po_ruling_20260824T1310Z`) once the sibling spawn-debounce row landed, to "reinstate visibility... [pending] the durable fix." That durable fix is this row. Since the removal, every 30-min Tier-1 tick has scored `verdict=FAILURE` on signature `launchd_agents:com.vn-market.fleet-push` — confirmed live this cycle:

- `docs/data/auditor-tier1-last-trigger.json` (written 2026-08-25T03:00:23Z): `"verdict": "FAILURE"`, `"detail": "launchd_agents: launchd not loaded/unhealthy: com.vn-market.fleet-push(not-loaded) (also acknowledged-degraded, tracked: com.vn-market.docker-events(exit-status:143) ); "`, `"checks":{"launchd_agents":"FAIL", ...all others PASS}`.
- `docs/data/auditor-tier1-spawn-debounce.json`: signature `launchd_agents:com.vn-market.fleet-push` at `spawn_count: 9`, `first_seen_at: 2026-08-24T16:40:57Z`, still within its debounce window (`window_expires_at: 2026-08-25T03:26:52Z`) — debounce is bounding *spawn churn*, not the wrong verdict itself, exactly as the debounce row's own AC-3 requires ("verdict stays FAILURE... never touches the verdict"). It cannot converge Tier-1 back to green; only this row can.
- Live plist re-verified this cycle (2026-08-25T03:2xZ, same result as PO's 2026-08-24T16:48Z check): `plutil -p ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` → `"Disabled" => 1`; `launchctl list | grep fleet-push` → no output (absent, i.e. not-loaded); `launchctl print-disabled gui/$(id -u) | grep fleet-push` → `"com.vn-market.fleet-push" => disabled` (membership confirms the plist-key reading independently). Regression control: `plutil -p ~/Library/LaunchAgents/com.vn-market.docker-events.plist | grep -i disabled` → **no output** — docker-events (the other acked label, exit-status 143, still tracked by `FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP`) has no Disabled key and is untouched by this design; it keeps going through the existing ack-ledger path.

## 2. Design — EXPECTED-DISABLED as a third classification (read live, not hardcoded)

Add a distinct disposition that sits **before** the ack-ledger lookup in the not-loaded branch, so a deliberately-disabled label never reaches `bad` or the ack path at all:

```
for each label discovered from repo $LAUNCHD_DIR (unchanged):
  skip if in $obsolete_labels (unchanged)
  match_line = launchctl list | field3==label (unchanged)
  if match_line is empty (not-loaded):
      NEW: if _launchd_label_expected_disabled(label):
             expected_disabled += "label(disabled-by-plist) "   # or "(disabled-by-launchctl)"
             continue                                            # never touches bad/acked/entity side-channel
      [existing ack lookup unchanged]
  else (loaded): [existing exit-status branch UNCHANGED — see §4 scope note]
```

### New function `_launchd_label_expected_disabled()`

```bash
# Returns 0 (EXPECTED-DISABLED) if the label's LIVE installed plist carries
# Disabled=>1, OR the label is a member of `launchctl print-disabled`'s
# per-user disable database. Either signal is a legitimate, user-initiated
# disarm mechanism (AC-3) — checked independently because they are two
# DIFFERENT mechanisms (plist key vs. launchctl's disabled-database), not
# because either alone is unreliable. Reads the INSTALLED plist
# ($LAUNCHD_INSTALLED_DIR/<label>.plist), never the repo copy (AC-2) — the
# repo copy never carries a live Disabled=1 (verified: the repo's
# com.vn-market.fleet-push.plist has no Disabled key at all; only the
# installed copy under ~/Library/LaunchAgents does, so reading the repo
# copy would silently miss every real disarm). Uses `plutil -p` (never
# `grep -i disabled` against the binary plist — that already produced one
# false negative per the row's evidence: absent-key and Disabled=false both
# print nothing to grep, only plutil -p's structured `"Disabled" => N`
# line distinguishes them).
_launchd_label_expected_disabled() {
  local label="$1" installed_plist disabled_val uid
  installed_plist="$LAUNCHD_INSTALLED_DIR/${label}.plist"
  if [ -f "$installed_plist" ]; then
    disabled_val=$(plutil -p "$installed_plist" 2>/dev/null \
      | awk -F'=> ' '/"Disabled"/{print $2; exit}')
    [ "$disabled_val" = "1" ] && return 0
  fi
  uid=$(id -u)
  if launchctl print-disabled "gui/$uid" 2>/dev/null | grep -q "\"${label}\" => disabled"; then
    return 0
  fi
  return 1
}
```

New env-override var, added to the file's existing "Env overrides (test seams)" header table (L88-124) in the same style as `LAUNCHD_DIR_PATH`/`LAUNCHD_ACK_PATH`:

```bash
LAUNCHD_INSTALLED_DIR="${LAUNCHD_INSTALLED_DIR_PATH:-$HOME/Library/LaunchAgents}"
```

Placed alongside `LAUNCHD_DIR`/`LAUNCHD_ACK` (near script L257-258). Making the *directory* overridable (not stubbing `plutil` itself) matches the existing test-seam convention exactly: `LAUNCHD_DIR_PATH` already lets `auditor-tier1-probe.test.sh` point the label-discovery loop at a fixture directory instead of `launchd/`. The same pattern lets a future test drop a real fixture `.plist` (with a real `Disabled` key, written via `plutil -create`/`PlistBuddy` in test setup) at `LAUNCHD_INSTALLED_DIR_PATH`, so `plutil -p` runs for real against a fixture — no `plutil` stub needed. `launchctl print-disabled` still needs a stub-branch added to the test file's existing `launchctl()` function override (it currently only branches on `list`, per `auditor-tier1-probe.test.sh:626` and its restores at L746/827/1006) — **that is test-file surface, owned by the sibling row `FIX-AUDITOR-TIER1-PROBE-TEST-INVERTED-ASSERTION-L1422-FALSE-GREEN`; flag it there via the board, do not edit the test file from this row.**

### Verdict / detail-string integration (reuse existing rc=0-with-note pattern)

`_check_launchd_agents()`'s existing structure already has a rc=0-yet-something-to-say path for the acked case (L752-755: `if [ -n "$acked" ]; then echo "..."; return 0; fi`) which `run_probe()` already treats as PASS-with-transparency-note, never touching `st_launchd`/`checks_json` (L1032-1038, comment: "check PASSED (rc=0) but has something to say... ALL_GREEN verdict, honest detail"). Reuse this mechanism verbatim — do not invent a second signalling channel:

```bash
if [ -n "$bad" ]; then
  echo "launchd not loaded/unhealthy: ${bad}${acked:+(also acknowledged-degraded, tracked: $acked)}${expected_disabled:+(also expected-disabled, no fix needed: $expected_disabled)}"
  return 1
fi
if [ -n "$acked" ] || [ -n "$expected_disabled" ]; then
  echo "${acked:+acknowledged-degraded (suppressed — open backlog fix-task tracks it): $acked}${expected_disabled:+expected-disabled (deliberately disabled by user policy, self-expiring, no tracked_by/staleness): $expected_disabled}"
  return 0
fi
return 0
```

Wording deliberately keeps "expected-disabled" and "acknowledged-degraded" as **distinct clauses with distinct words** in the detail string (AC-4: transparency) — an auditor/human reading `detail` must not mistake a policy decision for a tracked bug. This also means `expected_disabled` labels are **never appended to `$_SIG_ENTITY_FILE`** (unlike the `bad`-branch labels at L727/730/741/744) — they must never enter the spawn-debounce signature (`docs/policies/dev-standards.md` CANONICAL:SSOT-AUDITOR-TIER1-SPAWN-DEBOUNCE: signature is built only from FAILING-check entities). Since this label no longer fails the check at all, it is structurally excluded by construction, not by a new exclusion rule.

## 3. `docs/data/auditor-launchd-ack.json` — one doc-only edit, no logic change

No `.acked[]` entry to add or remove for `fleet-push` (already removed, commit `930297f37`, confirmed absent from the live file this cycle). Add one line to the ledger's `_comment` closing the loop so a future PO/developer never re-adds a fleet-push ack entry believing that is still the remedy (this is the file's own documented edit pattern — "edited by hand (PO/developer) when a launchd death gets triaged..."):

> "`com.vn-market.fleet-push` is no longer suppressed via this ledger — it is classified EXPECTED-DISABLED by `_check_launchd_agents()` (read live from the installed plist's `Disabled` key / `launchctl print-disabled` membership, FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED, 2026-08-25). Do NOT re-add an ack entry for it: EXPECTED-DISABLED is deterministic and self-expiring (the label leaves this state the instant the plist is re-armed), whereas an ack here requires an open tracked fix row and a staleness rule that does not apply to a deliberate user policy decision."

## 4. Scope decision — loaded-but-nonzero-exit branch is UNCHANGED (deliberate)

The EXPECTED-DISABLED check is added only to the **not-loaded** branch. A `Disabled=1` label is never bootstrapped by launchd, so it structurally cannot appear in `launchctl list` — the not-loaded branch is the only reachable path for this state. If a label were somehow both `Disabled=1` in its plist AND currently loaded with a bad exit status (e.g. disabled *after* being loaded, before next logout/reboot), that is still a live, possibly-crashing process — silently reclassifying it as EXPECTED-DISABLED would hide a real, currently-running failure, which the hard constraint's "generalises to every future intentionally-disarmed job" intent does not ask for. Leaving the exit-status branch untouched is the conservative reading; flagging it here so it is a documented decision, not an oversight.

## 5. Files (unchanged from row mint)

- `scripts/agents-flow/auditor-tier1-probe.sh` — new `LAUNCHD_INSTALLED_DIR` var + header table row; new `_launchd_label_expected_disabled()` function; `_check_launchd_agents()` modified per §2 (new `local expected_disabled=""`, new check in not-loaded branch, final verdict block enriched); header comment block above `_check_launchd_agents()` (L671-693) gets one new paragraph documenting this fix, same style as the existing FIX-* paragraphs there.
- `docs/data/auditor-launchd-ack.json` — `_comment` addition only (§3). No `.acked[]`/`.acked_memory[]` array change.

Do NOT touch `scripts/agents-flow/auditor-tier1-probe.test.sh` — owned by the parallel sibling row.

## 6. Risk flags

- **Security/perimeter:** none — read-only `plutil -p` / `launchctl print-disabled` / `launchctl list`, no privilege escalation, no write to any plist.
- **DDD/layering:** n/a (ops script, not a service).
- **Footgun already fenced by the hard constraint:** any implementation that calls `launchctl enable`/`load`/`bootstrap` (even "just to verify") on `com.vn-market.fleet-push`, or edits its plist's `Disabled` key, is a constraint violation regardless of test intent — verification must be read-only (`launchctl list`, `plutil -p`, `launchctl print-disabled`) end to end.
- **Test-file coupling:** the new `launchctl print-disabled` code path is untestable by the existing test harness until its `launchctl()` stub gains a `print-disabled` branch — a real functional gap for the sibling test-fix row, not this one; call it out on the board so it isn't silently left uncovered.
- **Signature-drift correctness:** confirmed by construction (§2) that EXPECTED-DISABLED labels never enter `$_SIG_ENTITY_FILE`, so the spawn-debounce ledger's existing `launchd_agents:com.vn-market.fleet-push` entry simply stops recurring after this lands (it ages out per its own `window_expires_at`; no manual leger edit needed, and none is prescribed).

## 7. Acceptance Criteria

PO's mint-time AC-1..AC-5 (already on the row, reproduced for completeness) are the design constraints; the execution-verifiable ACs below (AC-6..AC-9) are architect-authored per the dispatcher's explicit ask, since none of AC-1..AC-5 assert an end-to-end probe run.

- **AC-1** (PO) — a label whose LOADED plist carries `Disabled=1` is classified EXPECTED-DISABLED; does not count as unhealthy; no `tracked_by`/`acked_at`/staleness rule needed.
- **AC-2** (PO) — flag read from the **installed** plist (`~/Library/LaunchAgents/<label>.plist`), never the repo copy; via `plutil -p` (binary plist — `grep -i disabled` silently false-negatives).
- **AC-3** (PO) — `launchctl print-disabled` membership is also treated as EXPECTED-DISABLED (the other legitimate disarm mechanism).
- **AC-4** (PO) — EXPECTED-DISABLED labels are still named in the probe's `detail` string for transparency, same as acked labels (but textually distinguishable from "acknowledged-degraded" — see §2 wording note).
- **AC-5** (PO) — `docs/data/auditor-launchd-ack.json`'s `com.vn-market.fleet-push` entry stays removed (already true; developer must not re-add it — verify by `jq '.acked[] | select(.label=="com.vn-market.fleet-push")' docs/data/auditor-launchd-ack.json` returning nothing, both before and after the change).
- **AC-6 (execution, MANDATORY)** — run the probe live end-to-end (`bash scripts/agents-flow/auditor-tier1-probe.sh` or `--tier=1`, whichever is this repo's standard top-level invocation) and confirm the printed/returned **verdict is `ALL_GREEN`, not `FAILURE`**, while `com.vn-market.fleet-push` remains disabled (`plutil -p ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` still shows `"Disabled" => 1`) and absent from `launchctl list` (`launchctl list | grep -c com.vn-market.fleet-push` → 0) at the moment of the run — this is the one AC that proves the GREEN was earned by correct classification, not by an accidental re-arm.
- **AC-7 (execution)** — the run's `checks.launchd_agents` field is `"PASS"`, and its detail/note text names `com.vn-market.fleet-push` under an EXPECTED-DISABLED clause distinguishable from the pre-existing `com.vn-market.docker-events` acknowledged-degraded clause (regression guard — docker-events must still go through the unmodified ack-ledger path since its installed plist has no `Disabled` key, confirmed in §1).
- **AC-8 (execution)** — after the run, `docs/data/auditor-tier1-spawn-debounce.json` gains **no new/refreshed entry** for signature `launchd_agents:com.vn-market.fleet-push` on the tick(s) following deployment (confirms the label no longer enters the failing-entity side-channel at all — verify signature absent or its `last_seen_at` stops advancing).
- **AC-9 (constraint self-check, MANDATORY)** — at no point during implementation or verification is `launchctl enable/load/bootstrap` invoked on `com.vn-market.fleet-push`, nor is its plist's `Disabled` key edited (installed or repo copy). Developer's own commit message/session notes must state this was verified read-only.

## 8. Handoff

`owner: developer`. Files: `scripts/agents-flow/auditor-tier1-probe.sh`, `docs/data/auditor-launchd-ack.json` (comment-only). Do not touch `auditor-tier1-probe.test.sh` (sibling row's file). Coordinate through the board if the test-harness `launchctl print-disabled` stub gap (§6) needs a companion row — do not silently absorb it into this one's scope.
