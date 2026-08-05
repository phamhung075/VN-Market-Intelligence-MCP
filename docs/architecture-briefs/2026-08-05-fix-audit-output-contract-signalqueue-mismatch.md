# audit-output-contract V1 cross-check — bidirectional mismatch is NOT concurrency skew

**Task:** `FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH` (`docs/data/orch/orch-state.json` → `task_board.backlog`) — P2, size S, zone=cross-service/, owner=architect
**Author:** architect | **Date:** 2026-08-05
**Scope:** Design only, no code shipped this session. `scripts/audit-output-contract.sh`, `scripts/emit-audit-signal.sh`, their two `.test.sh` suites, and 6 call sites in `docs/agents/system-auditor/flow/{main,tier1-probe,page-freshness}.md` + one `docs/policies/dev-standards.md` CANONICAL entry.

---

## 0. PO's instruction, and what "ruling out" means here

PO asked to first rule out **ordinary concurrent-write timing skew** (a peer session appending/draining a `.signal_queue.rows[]` row between the audited cycle's own write and the script's re-read) before concluding the reconciliation rule itself is wrong. I ruled it out by **reproducing both mismatch directions with the real, unmodified production script, in a fully serial, single-process, zero-peer-writer harness** — no second agent, no cron, no drain running. Both directions reproduce 100% of the time given the right (very common) input shape. That is definitionally not a race.

```bash
# Repro A (marker-parsed HIGHER than independent re-read — occurrences 4412, 4415)
bash scripts/audit-output-contract.sh --markers-file markers.txt \
  --cycle-start-ts "2026-08-05T06:00Z" --orch-state-file orch-state.json
# rows: sys-a ts=2026-08-05T06:00:03Z, sys-b ts=2026-08-05T06:01:10Z — BOTH genuinely written
# and BOTH already read-back-verified by emit-audit-signal.sh's own E-3 step this cycle.
# -> [OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=2 independent=1

# Repro B (independent re-read HIGHER than marker-parsed — occurrence 4420)
# rows: sys-a ts=...T06:02:03Z (this cycle's own write) + sys-x-from-peer-tier1-cycle
#       ts=...T06:02:40Z (an UNRELATED row, simulating a different tier/session that
#       also defaults to from="system-auditor" — never touched by this cycle at all)
# -> [OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=1 independent=2
#    signal_queue_rows_written=2   <- final reported count now FALSELY credits this cycle
#                                     with a row it never wrote.
```

Both are **deterministic structural defects** in `scripts/audit-output-contract.sh`'s V1 check, not timing. Two independent bugs, one per direction.

---

## 1. Bug A — ISO8601 minute-vs-second string-compare mismatch (explains 4412, 4415)

**Root cause:** every tier's `FIRE_TICK` (`main.md` Step 0d, lines 140/147/152/165) is **minute-precision**: `date -u +"%Y-%m-%dT%H:%MZ"` or `"...%H:00Z"`. Every `.signal_queue.rows[].ts` (`emit-audit-signal.sh:529`, `now_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")`) is **second-precision**. `audit-output-contract.sh:198` compares them with a raw jq string `>=`:
```jq
select(.from == $from and .ts >= $ts)
```
Lexicographically, `"...T06:00:03Z"` (row) sorts **below** `"...T06:00Z"` (tick) — `:` (0x3A) < `Z` (0x5A) at the byte position right after `HH:MM`. Any row written in the **same clock-minute as the tick fired** — the common case, since Tier-2's own wall-time target is <300s and the agent typically starts emitting within seconds of winning fire-election — silently vanishes from the independent re-read. Verified empirically:
```
jq -n '"2026-08-05T06:00:03Z" >= "2026-08-05T06:00Z"'   # false
jq -n '"2026-08-05T06:01:00Z" >= "2026-08-05T06:00Z"'   # true (next minute — masks the bug most of the time)
```
**Not a new defect class** — `emit-audit-signal.sh::_ledger_prune_and_lookup()` (lines 472-478) already solved the *identical* precision mismatch for the dedup ledger, with a `to_epoch` helper:
```jq
def to_epoch:
  if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
  then (sub("Z$"; ":00Z") | fromdateiso8601)
  else fromdateiso8601
  end;
```
`audit-output-contract.sh`'s V1 check was written later (UC-ASL-P2/FIX-AUDITOR-DASHBOARD-APPEND) and never adopted it — it re-derives a raw string comparison instead of reusing the repo's own established fix for this exact defect class. **Fix: port `to_epoch` verbatim, apply it to both operands, compare as epoch integers.**

Also note: the existing regression test `audit-output-contract.test.sh` T9/T10 use `--cycle-start-ts "2026-07-29T09:55:00Z"` — **already second-precision** — so the suite never exercised the real `FIRE_TICK` shape and never caught this.

---

## 2. Bug B — `from` is not a cycle-scoped identity (explains 4420)

**Root cause:** no call site anywhere in `main.md`/`tier1-probe.md` passes `--from-agent` to `emit-audit-signal.sh` (grep-confirmed, 6 call sites: `main.md:365,401,481,670`, `tier1-probe.md:89,215`) — every tier (1/2/3/5) and every off-tier site (D-IMPROVE, D-BCTC-EVAL) writes rows under the identical default `FROM_AGENT="system-auditor"`. `audit-output-contract.sh`'s own default `from_agent="system-auditor"` matches. V1's query `select(.from == $from and .ts >= $ts)` therefore counts **any** row from **any** concurrently-running tier or peer session sharing that literal string within the window — not just the rows *this specific invocation's* `$MARKERS_FILE` actually recorded (which is all a markers-file scoped per-tier-per-tick, `docs/agent-memory/.auditor-cycle-markers-${FIRE_TICK}.tmp`, can ever contain). Tier-1 fires far more frequently than Tier-2/3/5, so overlap during any longer-running tier's cycle is close to routine, not an edge case — this is the class of hazard already flagged for peer-session collisions elsewhere in this system (`project_peer_cowork_dispatcher_session_collision`), just showing up here via a different shared-identity mechanism (a hardcoded default string, not a session id).

**Fix:** every tier already computes a per-tier-per-tick unique identifier before any emit call — `FIRE_TASK_ID = "cron:auditor-t<N>:" + FIRE_TICK` (`main.md:141/148/153/166`), used today only for the fire-election `task_claim`/`task_release`. Thread it through as a cycle tag:
1. `emit-audit-signal.sh`: new optional `--cycle-tag <value>` flag → stored as a new passthrough field `audit_cycle_tag` on the row (`SignalRowSchema` at `orchStateSchema.ts:187-201` ends `.passthrough()` — **verified live this session**, zero migration needed, same precedent as the already-shipped `provenance:"detector"` field in the same `_build_row_json()`).
2. `audit-output-contract.sh`: new optional `--cycle-tag <value>` flag. When supplied, V1's independent query becomes `select(.audit_cycle_tag == $tag)` — an exact per-cycle match, no `from`/time-window guessing at all. Falls back to the current `from`+`to_epoch(ts)` path (Bug A fix applied) when `--cycle-tag` is absent, so this is backward-compatible for any caller not yet updated.
3. Every call site in `main.md`/`tier1-probe.md`/`page-freshness.md` (7 sites total: 6 emit + 1 contract) appends `--cycle-tag "$FIRE_TASK_ID"` — mechanical, one flag+value appended to an existing multi-line invocation each site already has.

---

## 3. Reconciliation rule verdict — JUSTIFY, do not replace (answers the row's AC-2)

The row's framing asks whether "trust the higher value" should become an asymmetric/direction-locked rule instead. **Position: keep take-the-max, but only once §1+§2 land — and say why in the code comment, which is the actual gap today.** Once both operands are trustworthy (marker = write-time read-back-verified per row; independent = exact-cycle-tag-scoped, not format-mangled), the **only** remaining legitimate sources of divergence both genuinely favor the higher number:
- `independent < marker`: a row this cycle verifiably wrote was later removed (drain/cold-evict — real mechanisms in this repo: `orch-cold-evict.sh`, `devteam-signalqueue-prune-bounded.jq`) before the re-read ran. A later deletion cannot retroactively un-write a verified append — marker (already the higher value here) must win, which the current `if independent -gt marker` guard already achieves by simply not overwriting.
- `independent > marker`: with exact cycle-tag scoping, this can no longer mean "a peer tier's row got misattributed" (that was Bug B). It can only mean this cycle's own `$MARKERS_FILE` is missing a row that legitimately carries its tag — a dropped marker line or a bypass of the one-blessed-script convention. That is real evidence the self-report undercounted, and the independent (now correctly scoped) value should win — which the current code already does.

**What was actually wrong is not the max-taking policy, it is that Bug A and Bug B fed it corrupted operands** — Bug A produced spurious `independent < marker` violations on **every** same-tick-minute cycle (noise, but happened to resolve correctly by luck of which direction the existing guard favors), and Bug B produced **genuinely wrong, inflated** `independent > marker` results that the current code then actively (and incorrectly) trusted. Recommend replacing the current comment (`"Never under-report a real write: ... wins on mismatch"` — states only half the invariant and doesn't explain why over-reporting isn't equally a risk, which is exactly the gap that let Bug B go unnoticed) with an explicit two-directional justification tied to the two now-trustworthy operand guarantees above.

---

## 4. Diffs (implementation surface)

**`scripts/emit-audit-signal.sh`**
```diff
 _parse_args() {
   ...
   FROM_AGENT="system-auditor"
   TO_AGENT="po"
   E3_ONLY="false"
   NO_TELEGRAM="false"
   DEDUP_KEY=""
+  CYCLE_TAG=""
   while [ $# -gt 0 ]; do
     case "$1" in
       ...
       --no-telegram) NO_TELEGRAM="true"; shift ;;
+      --cycle-tag) CYCLE_TAG="${2:-}"; shift 2 ;;
```
```diff
 _build_row_json() {
   local row_id="$1" now_ts="$2"
   jq -n \
     --arg id "$row_id" --arg ts "$now_ts" --arg from "$FROM_AGENT" --arg to "$TO_AGENT" \
     --arg type "$CATEGORY_TYPE" --arg summary "$SUMMARY" --arg severity "$SEVERITY" \
-    '{id:$id, ts:$ts, from:$from, to:$to, type:$type, summary:$summary, severity:$severity, status:"NEW", payload_ref:null, provenance:"detector"}'
+    --arg cycle_tag "$CYCLE_TAG" \
+    '{id:$id, ts:$ts, from:$from, to:$to, type:$type, summary:$summary, severity:$severity, status:"NEW", payload_ref:null, provenance:"detector", audit_cycle_tag: (if $cycle_tag == "" then null else $cycle_tag end)}'
 }
```

**`scripts/audit-output-contract.sh`**
```diff
   local orch_state_file="${REPO_ROOT}/docs/data/orch/orch-state.json"
   local from_agent="system-auditor"
+  local cycle_tag=""
   while [ $# -gt 0 ]; do
     case "$1" in
       ...
       --from-agent) from_agent="${2:-}"; shift 2 ;;
+      --cycle-tag) cycle_tag="${2:-}"; shift 2 ;;
```
```diff
   if [ -n "$cycle_start_ts" ] && [ -f "$orch_state_file" ]; then
     local independent_sqr
-    independent_sqr=$(jq --arg from "$from_agent" --arg ts "$cycle_start_ts" \
-      '[.signal_queue.rows[] | select(.from == $from and .ts >= $ts)] | length' \
-      "$orch_state_file" 2>/dev/null)
+    if [ -n "$cycle_tag" ]; then
+      # Exact-tag scoping (Bug B fix) — no from/time-window guessing, immune
+      # to cross-tier/cross-session identity collision.
+      independent_sqr=$(jq --arg tag "$cycle_tag" \
+        '[.signal_queue.rows[] | select(.audit_cycle_tag == $tag)] | length' \
+        "$orch_state_file" 2>/dev/null)
+    else
+      # Legacy from+ts-window fallback for callers not yet passing
+      # --cycle-tag. to_epoch ported verbatim from emit-audit-signal.sh's
+      # _ledger_prune_and_lookup() (Bug A fix — cycle_start_ts is always
+      # minute-precision FIRE_TICK, .ts is always second-precision; a raw
+      # string >= silently drops same-minute rows).
+      independent_sqr=$(jq --arg from "$from_agent" --arg ts "$cycle_start_ts" '
+        def to_epoch:
+          if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
+          then (sub("Z$"; ":00Z") | fromdateiso8601)
+          else fromdateiso8601
+          end;
+        ($ts | to_epoch) as $cutoff
+        | [.signal_queue.rows[] | select(.from == $from and ((.ts // "1970-01-01T00:00:00Z") | to_epoch) >= $cutoff)] | length
+      ' "$orch_state_file" 2>/dev/null)
+    fi
     if [ -n "$independent_sqr" ] && [ "$independent_sqr" != "null" ]; then
       if [ "$independent_sqr" -ne "$signal_queue_rows_written" ]; then
         echo "[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=${signal_queue_rows_written} independent=${independent_sqr}"
         _send_bug_telegram "..."
         violations=$((violations + 1))
-        # Never under-report a real write: the independent, ground-truth
-        # read of the artifact itself wins on mismatch.
+        # Take-the-max is sound ONLY because both operands are now
+        # trustworthy per-direction (see architecture-briefs/2026-08-05-
+        # fix-audit-output-contract-signalqueue-mismatch.md §3):
+        #   independent < marker -> a verified write was drained/pruned
+        #     AFTER this cycle wrote it; cannot un-write a real append,
+        #     marker (already higher) wins by construction (no-op below).
+        #   independent > marker -> this cycle's own $MARKERS_FILE is
+        #     missing a row that legitimately carries its cycle-tag
+        #     (dropped marker line / bypassed-script write); the scoped
+        #     ground-truth read wins.
         if [ "$independent_sqr" -gt "$signal_queue_rows_written" ]; then
           signal_queue_rows_written=$independent_sqr
         fi
```

**Call-site threading** (`docs/agents/system-auditor/flow/main.md:365,401,481,670`; `tier1-probe.md:89,215`) — append `--cycle-tag "$FIRE_TASK_ID" \` to each existing `emit-audit-signal.sh` invocation; (`main.md:749-753`) append the same to the `audit-output-contract.sh` call. `page-freshness.md:86` prose pointer needs no edit beyond mentioning the new flag (it already says "SAME way as every other tier").

**`docs/policies/dev-standards.md`** — CANONICAL "Audit OUTPUT-CONTRACT parser" entry (~line 754): update the shown CLI signature to include `[--cycle-tag <value>]`, add one sentence naming both fixed bugs and pointing at this brief.

---

## 5. Test plan

`scripts/audit-output-contract.test.sh` — two new cases, both must currently FAIL against the unmodified script (confirmed live this session, §0 repro):
- **T12** — same-tick-minute row, `--cycle-start-ts "2026-08-05T06:00Z"` (bare FIRE_TICK shape, no `--cycle-tag`), row `.ts` in the same clock-minute → after fix, no VIOLATION, `signal_queue_rows_written` matches marker exactly.
- **T13** — `--cycle-tag` supplied; scratch orch-state has one row tagged with this cycle's tag and one unrelated row sharing `from="system-auditor"` with a DIFFERENT tag → independent count must equal 1 (the peer row must not be picked up), no VIOLATION.
- Keep T9/T10 as regression coverage for the legacy (no `--cycle-tag`) path, but fix their `--cycle-start-ts` fixture to also include one same-tick-minute case so the suite would have caught Bug A.

`scripts/emit-audit-signal.test.sh` — one new case: `--cycle-tag X` supplied → row's `audit_cycle_tag=="X"`; flag omitted → field is `null` (backward-compat, existing T1-T10 unaffected since none assert on this key's absence).

---

## 6. Files to modify

| File | Change | Size |
|---|---|---|
| `scripts/audit-output-contract.sh` | `--cycle-tag` flag + dual-path V1 query (§4) | +~20L |
| `scripts/emit-audit-signal.sh` | `--cycle-tag` flag + `_build_row_json()` field (§4) | +~4L |
| `scripts/audit-output-contract.test.sh` | T12, T13 + T9/T10 fixture fix | +~25L |
| `scripts/emit-audit-signal.test.sh` | 1 new case | +~6L |
| `docs/agents/system-auditor/flow/main.md` | `--cycle-tag "$FIRE_TASK_ID"` on 5 call sites | +5L |
| `docs/agents/system-auditor/flow/tier1-probe.md` | `--cycle-tag "$FIRE_TASK_ID"` on 2 call sites | +2L |
| `docs/policies/dev-standards.md` | CANONICAL entry CLI signature + note | +~3L |

No `apps/*` code, no DB migration, no container rebuild. Zone = `cross-service/` (scripts/ + docs/agents/ + docs/policies/, no single microservice) — matches the row's own zone.

## 7. Verification performed this session (read-only + scratch repro, never the live orch-state.json)

- Read `scripts/audit-output-contract.sh` in full (255L) and `scripts/emit-audit-signal.sh` in full (551L).
- Read `docs/agents/system-auditor/flow/main.md` Step 0d (FIRE_TICK/FIRE_TASK_ID computation, lines 134-197) and the OUTPUT-CONTRACT section (746-757); grep-confirmed all 6 `emit-audit-signal.sh` call sites and the 1 `audit-output-contract.sh` call site, and that none pass `--from-agent`.
- Read `apps/mcp-server/src/infrastructure/orchStateSchema.ts:187-201` — confirmed `SignalRowSchema.passthrough()` live, independently (not inherited from a prior brief's claim).
- Reproduced both mismatch directions against the real, unmodified `scripts/audit-output-contract.sh` in an isolated scratch directory (`/private/tmp/claude-501/.../scratchpad/aoc-repro-*`), single bash process, zero peers, zero cron — ruling out concurrency per PO's explicit instruction before concluding the rule needs to change.
- Read `scripts/audit-output-contract.test.sh` in full — confirmed T9/T10's `--cycle-start-ts` fixture is already second-precision, explaining why the existing suite never caught Bug A.

## 8. Handoff recommendation

- **Recommended `next_agent`: `developer` (generic), zone=`cross-service/`.** Same shape as the closest precedent, `FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD` (flow-doc + script change, no single `apps/<service>`, routed to generic `developer`).
- Did not self-mint a child task, did not flip board lane, did not touch `.head`. `architect_review_note` written directly onto this row per the direct-PO-mint convention (no BA spec, no handoff file existed for this row).
- Verification gate (row's own): after the fix, replay §0's two repro scenarios — both must produce **no VIOLATION and an exact match** (T12/T13 above are that replay, scripted).
