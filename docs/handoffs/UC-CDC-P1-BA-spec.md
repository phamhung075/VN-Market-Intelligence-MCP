# UC-CDC-P1 — BA Spec: Compute calendar_status server-side + unblock adaptive path

**Task:** `UC-CDC-P1` (SPRINT-M, P1, zone `multi`, sprint `ULTRACODE-AUDIT-FIXALL`)
**Root mechanism (settled — do not re-litigate):** `emitPressureStateTool.ts:387` writes `calendar_status: args.calendar_status ?? "unknown"` — purely caller-supplied, never server-computed. `cowork-tick-preflight.sh` reads `calendar_status` back OUT of `pressure-state.json` and writes it straight back in via `emit_pressure_state`. `telemetry.md` Step 6.0 does the same on the WORK path. Closed self-recycling loop, no producer. `vnTradingCalendar.ts`'s `isVnTradingDay(date).session_status` already returns the exact 5-value domain `{open, weekend, half_day, holiday, unknown}` and is simply not wired in.
**Full triage trail:** `docs/data/orch/orch-state.json` `.task_board` (search `UC-CDC-P1`) — `po_triage_20260725T0927`, `po_impact_evidence_20260725T0948`, `po_evidence_20260725T1507`.

This spec splits the row's scope into two work packages by blocking status, verified live this cycle (2026-08-14).

---

## WP-A — Producer + enum gate + de-circularize (READY NOW, no blockers)

### FR-A1: Compute `calendar_status` server-side
**DDD layer:** Application (orchestration) calling Domain (pure, unchanged).
**Files:** `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` (`runEmitPressureState`, ~L354-411); `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` (read-only reuse — `isVnTradingDay(date): TradingDayResult` L70, `session_status` L30, and `getTodayVnDate()` already used by `isTradingDayTool.ts`).
Replace the `args.calendar_status ?? "unknown"` fallback (L409 today) with: when `args.calendar_status` is omitted, compute via `isVnTradingDay(getTodayVnDate()).session_status` instead of the literal `"unknown"`. A present, enum-valid caller override (FR-A2) still wins — preserves the write path for tests/manual override while the DEFAULT becomes truth instead of a frozen literal.

### FR-A2: Enum-gate the caller override at the tool boundary
**DDD layer:** Interface (MCP tool Zod schema).
**File:** same, `calendar_status` field (~L484): `z.string().optional()` → `z.enum(["open","weekend","holiday","half_day","unknown"]).optional()`. Prefer deriving the literal tuple from `vnTradingCalendar.ts`'s own `SessionStatus` type (L21) rather than hand-typing a second copy that can drift. Effect: an out-of-domain literal is now rejected by Zod at call time instead of persisting into `pressure-state.json` forever (this is what let "closed"/"off_market" survive 3+ weeks live).

### FR-A3: Stop `cowork-tick-preflight.sh` recycling the file's own value
**DDD layer:** Infrastructure (script).
**File:** `scripts/agents-flow/cowork-tick-preflight.sh` Step 8 (SILENT-path last-known-values emit, L141-166). L147 reads `calendar_status=$(jq -r '.calendar_status // empty' "$PRESSURE_STATE_PATH")`, L152 defaults empty→`"unknown"`, L159-161 build `emit_args` that put that SAME value straight back into the `emit_pressure_state` call (`calendar_status:$cal`). Delete the read (L147) and its inclusion in `emit_args` (drop `--arg cal "$calendar_status"` + the `calendar_status:$cal` key, L159-161) — SILENT-path calls become shape-identical to the WORK path: omit `calendar_status`, let the FR-A1-armed server compute it fresh every tick.
**Explicitly OUT of scope (do not drive-by fix):** `last_regime`/`last_volatility_level` (same read-back pattern, L148-149/153/160-161) — no independent producer exists for those (that gap is UC-SDF-P2's WIDEN clause, restoring the `regime_status`/`volatility_level` writer dropped 2026-06-05); recycling their last-known value there is an intentional degrade-gracefully default (script's own R3 comment), not this row's defect.

### FR-A4: Delete `telemetry.md` Step 6.0 arg line
**DDD layer:** Interface (cowork-team flow-doc, WORK-path emit call contract).
**File:** `docs/agents/cowork-team/flow/telemetry.md` L15: `"calendar_status": "<CALENDAR_STATUS from Step 4.3>",` inside the Step 6.0 `call_tool(emit_pressure_state)` args block. `CALENDAR_STATUS` at that point was itself just read out of `pressure-state.json` in Step 4.2 (`pressure-read.md` L65: `CALENDAR_STATUS = PRESSURE_STATE.calendar_status`) — passing it back on Step 6.0 is the WORK-path half of the same loop FR-A3 closes on SILENT. DELETE the line.

### FR-A5: `pressure-read.md` Step 4.3 fail-loud on out-of-domain value
**DDD layer:** Infrastructure (cowork-team flow-doc, calendar suppression gate).
**File:** `docs/agents/cowork-team/flow/pressure-read.md` Step 4.3 (L52-89). Today only `["holiday","weekend"]` is special-cased; every other value — including out-of-domain literals like the historically-observed `"closed"`/`"off_market"` — falls into the SAME "no suppression" branch as the legitimate `open`/`half_day`/`unknown` values (L89). Fix: enumerate the 5-value domain explicitly; anything NOT in `{open, half_day, weekend, holiday, unknown}` still takes the conservative no-suppression path for THAT tick (never worse than today — do not add a new blocking behavior on a fail-loud path) but must log + `send_telegram(channel="bug")` so the anomaly is visible instead of indistinguishable from a legitimate `"unknown"`. Largely defense-in-depth once FR-A2 lands (a bad literal can no longer enter via `emit_pressure_state`), but still the correct contract for a stale on-disk file predating the fix, a manual edit, or a future 6th value.

### WP-A co-ship (owned by a DIFFERENT row — documented here for sequencing, NOT mine to implement)
`FIX-COWORK-CADENCE-DANGLING-POLICY-ID` (BACKLOG, owner=po): add domain-value-axis validation in `scripts/agents-flow/cadence-policy.js` `evaluateCadence()` (L52-71) — today `calendarMatch` is literal equality per rule row only. Add a check that rejects/flags a `calendar_status` value absent from the ENTIRE rule value-set (config error), distinguishing it from a legitimate value with no matching rule row (existing safe 240-min default). Fixing the producer (WP-A above) without this domain validation re-arms the identical defect class the next time any caller invents a literal.
**New finding this cycle (flag to PM/PO, not touched here — different row):** `FIX-COWORK-CADENCE-DANGLING-POLICY-ID`'s own title still carries a superseded instance clause (`alert-commander-market(interval_minutes 15) + alert-commander-critical(240)`). `CADRAT-1` already delivered the real fix for that instance (commit `8c2acb44c`, 2026-08-04) — verified live: `cadence-policy.json` now carries both `policy_id`s as `calendar_status`-keyed `interval_minutes:null,_cron_fallback:true` rows, matching the architecture brief's decision, NOT the 15/240 instance clause. That row's own `po_reconcile_20260804T1953` note already instructed "whoever picks this up" to strip the stale clause before implementing — still not done as of this spec.

---

## WP-B — Decouple `stale_warning` from cycle-snapshot-promotion-refusal — BLOCKED

**Verified live this cycle:** `UC-SDF-P2` (`.task_board.backlog[]`) is still `status:"BACKLOG"`, `plan_only:true` (SPIKE — not yet an implementable fix task), `next_agent:"ba"`, NOT claimed/in_progress. **It has not landed.**

**Blocker (PO already ruled — this is an execution-order fact, not a re-litigation):** `UC-SDF-P2`'s own 2026-07-25T12:33Z note states: *"UC-CDC-P1 REQUIRED clause (decouple stale_warning from cycle-snapshot promotion refusal) treats a SYMPTOM of this row's cause; UC-CDC-P1 and this row must be sequenced with THIS ONE FIRST or UC-CDC-P1 will decouple a signal that was never being produced."* Confirmed live: `promoteCycleSnapshotFn`'s tickHHMM-keyed lookup (`emitPressureStateTool.ts` L232) can never find its file today because `UC-SDF-P2`'s filename-key defect (`tick-snapshot.md` fire-time filename vs. this tool's nominal-tick lookup key) is unfixed — `promoteResult.stale` is provably always `false`. There is no live `stale:true` state to decouple from or verify against yet.

**Recommendation for PM/PO:** `UC-SDF-P2` is an un-dispatched BACKLOG spike (`next_agent:"ba"` but never promoted/claimed) — promote it so it can land ahead of WP-B. Until then WP-B stays BLOCKED; **WP-A ships independently and should not wait.**

**What FR-B1 will need to do once unblocked** (recorded now so architect doesn't re-derive): `emitPressureStateTool.ts` sets `stale_warning: promoteResult.stale` unconditionally (~L404-411) — the SAME boolean `cadence-policy.js`'s `isStale()` Gate 1 (~L129: `if (pressure_state.stale_warning === true) return true`) treats as an unconditional override forcing `PRESSURE_MODE="legacy"` in `pressure-read.md` Step 4.2 (AC-P1-6-3), regardless of the core fields' actual age. Once `UC-SDF-P2` lands (fixing both the filename-key mismatch and the on-grid-file-missing-`fetchedAt` second failure mode it names), `promoteResult.stale` flips from "always false" to "correctly reflects cycle-snapshot promotion health" — but that promotion is a narrower, OPTIONAL enrichment (regime/volatility carry), not core pressure-state health (which already has its own `emitted_at`-age gate, AC-P1-6-2). FR-B1: split into two independent fields — keep `stale_warning` scoped to core-field staleness only (drop the `promoteResult.stale` feed), surface promotion health under its own field (e.g. `cycle_snapshot_stale`, or reuse the existing `cycle_snapshot_promoted:false`) that `pressure-read.md`'s mode logic does NOT gate `PRESSURE_MODE` on. Update `pressure-read.md` AC-P1-6-3 wording + `cadence-policy.js` `isStale()` Gate 1 comment. Without this, once `UC-SDF-P2` lands, `stale_warning` would flip to permanently `true` and re-kill the adaptive path — literally the row's own note: *"decouple stale_warning from cycle-snapshot promotion refusal or both engines stay in legacy off-hours."*

---

## Blockers

- **Q1 (non-gating, execution-order — not a PO decision, already ruled):** WP-B cannot be verified/implemented meaningfully until `UC-SDF-P2` lands. Recommend PM prioritize `UC-SDF-P2`'s dispatch. Does not block WP-A.
- **Q2 (genuine open call, not yet on record — non-gating, defaulted):** FR-A2's enum gate — should an out-of-domain caller-supplied literal be a hard Zod validation ERROR (tool call fails; caller must handle a thrown error), or should the tool catch it and fall back to server-computing (same as omitted) with a logged WARN? The row's scope text ("rejected at write time") reads as ERROR, but `emit_pressure_state`'s own documented design principle ("NEVER throws — on internal error it returns `{success:false, reason}`") argues for WARN+recompute so one bad caller-supplied literal can't break the MANDATORY, un-skippable Step 6.0 call and leave `pressure-state.json` unwritten for that tick. **Default recommendation: WARN+recompute** (the never-throws principle is load-bearing elsewhere in this exact file) — flagging as open since it is a genuine behavior-shape decision for architect/PO, not a re-derivation of settled fact.

## Edge Cases

- Calendar data beyond `LAST_CALENDAR_YEAR` → `isVnTradingDay` already returns `session_status:"unknown"` (L76/91) — matches domain, no new handling needed.
- Legacy on-disk `pressure-state.json` still carrying `"closed"`/`"off_market"` from before this fix ships — FR-A5 covers the read side; FR-A1+FR-A2 prevent new writes; no one-time migration/backfill needed (next successful emit overwrites it).
- Date basis for the server-side compute: `isVnTradingDay(date)` takes an explicit date, not "always today" — confirm the implementation uses the TICK's own VN-local date (via `getTodayVnDate()` at emit time, which is what "today" means for a live dispatcher tick) rather than deriving from UTC `tick_id` naively, or a delayed/retried tick straddling VN midnight could compute the wrong day. Implementation detail for architect, not a blocker.

## MCP tool availability note

This BA spawn had Read/Edit/Write/Bash only — no `mcp__gateway__call_tool` binding. `task_claim`/`task_heartbeat`/`send_telegram` were not executed (same known limitation as prior BA cycles, e.g. `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` 2026-08-12). Row updated directly via `orch-apply.sh`; `.head` reset to idle in the same write so the row is not falsely pinned in-flight.
