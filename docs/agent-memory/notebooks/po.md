# PO Notebook

## Last updated: 2026-05-18T21:15Z · Cycle: c202 — fire-drift signal triage + cutover block

### c202 session summary

**Spawn:** User-directed signal triage. Input: `docs/signals/cowork-team-1951-fire-drift-detected.json` (architectural-concern, HIGH, from cowork-team to PO 2026-05-18T21:07Z). Evidence: two consecutive master-cron fires drifted ~7min past nominal tick (20:52Z vs 20:45Z; 21:07Z vs 21:00Z), defeating matcher's `now ±2min` window in `.claude/scripts/cowork-match-slots.js`. Hypothesis: CronCreate jobs fire only when REPL idle — Claude mid-query at nominal tick → deferred fire.

**Routing decision:** Signal type `architectural-concern` not in standard table; signal explicitly asks PO to consult architects-architect. Per agents-architect role (designs comms / improvements; outputs briefs; agent-father implements), opened SPIKE for architect to pick A/B/C/D + follow-on FIX task gated on the brief. Did NOT pre-pick Option B despite signal recommendation — that's architect's call.

**Updates applied (TASKS.md):**
1. **SPIKE-1951f-fire-drift-resolution (NEW Backlog, HIGH).** Architect picks A/B/C/D. Time-box 2h. Output: brief + AC including collision rule, parallel-run idempotency interaction, jitter-budget margin, regression test plan. Zone=`.claude/scripts/` + `.claude/flows/cowork-team/`.
2. **1951g (NEW Backlog, HIGH FIX, dev-mcp-server).** Implements chosen option after SPIKE-1951f brief lands. Zone=`.claude/`. BLOCKED on SPIKE-1951f.
3. **1951b (In Progress).** Added **AC-7 CUTOVER-BLOCK**: 1951d cutover gate held until 1951g merges, regardless of AC-6 idempotency outcome. AC-6 evaluation continues (parallel-run still produces useful "no-double-publish" data since lane B publishes nothing during drift). Priority bumped MEDIUM→HIGH. Handoff `TASK_1951b.md` updated with full root-cause section + drift evidence table + next-steps trail.
4. **1951d (Backlog).** Block list updated: now depends on `1951b AC-6 PASS + 1951g + 2026-05-19T20:34Z window close`.

**Signal disposition:** Moved `cowork-team-1951-fire-drift-detected.json` → `docs/signals/processed/`. Router note (kept master cron `ed39cbcf` active during parallel-run) ACK — no production gap because legacy RemoteTriggers still cover slots during 24h window.

**Architectural reasoning (for SPIKE input):**
- Option A (widen ±10min): brittle — adjacent `*/15` ticks at :00 and :15 would overlap (matcher hits both at :07), forcing a new dedup rule. Spec leakage.
- Option B (nominal-tick rounding): minimum diff — change `M = now.getUTCMinutes()` to `M = Math.floor(now.getUTCMinutes() / 15) * 15` for `*/15` matching, OR a more general "round down to next active slot expression". Keeps ±2min window semantics intact. **Risk:** breaks if cron has non-`*/15` minute fields (e.g., explicit `13`). Architect must spec the rounding granularity precisely.
- Option C (per-slot CronCreate): loses master-dispatch architecture; sub-hourly RemoteTrigger collision returns (was the original 1951 driver). Effectively rolls back the pivot.
- Option D: e.g. dispatcher self-records nominal target on fire + re-runs matcher with that target. Heavier. Probably overkill.

**Files modified this cycle:**
- `docs/TASKS.md` — +SPIKE-1951f, +1951g (Backlog); 1951b body rewritten with AC-7; 1951d body+block-list updated. Capacity 74L → 76L (cap=80).
- `docs/handoffs/TASK_1951b.md` — appended AC-7 section: source signal, evidence table, root-cause, cutover decision, next-steps.
- `docs/signals/cowork-team-1951-fire-drift-detected.json` → `docs/signals/processed/` (moved).
- `docs/agent-memory/notebooks/po.md` — this entry (overwrite per skill).

**WIP discipline:** WIP=2 unchanged (1951b OBSERVE + 1951c blocked on 1951b). SPIKE-1951f waiting for architect bandwidth; 1951g waiting for SPIKE.

**WORK Telegram:** SEND on commit — one-liner: Cowork master-cron fires ~7min late (drift exceeds jitter spec). Cutover 1951d BLOCKED until SPIKE-1951f (architect) + 1951g (fix) land. AC-7 added to 1951b. Signal processed.

### Carry-over for next cycle

- **Architect queue priority (UPDATED):** **SPIKE-1951f-fire-drift-resolution (HIGH, urgent — blocks cutover at 2026-05-19T20:34Z)** comes ahead of SPIKE-1952a/b/d and 1952e. SPIKE-1951f should land within 2h of architect spawn.
- **WATCH 2026-05-19T05:15Z** — chef-morning master-dispatch tick 2/3. Under drift, expect silent-exit (no MARKET dish from lane B). Lane A (legacy RemoteTrigger) should still publish — AC-6 remains evaluable as "lane A unique, lane B silent" = no duplicate (idempotency holds trivially).
- **WATCH 2026-05-19T08:45Z** — chef-eod tick 3/3. Same prediction as above.
- **WATCH 2026-05-19T20:34Z** — 24h window CLOSES. Likely outcome: AC-6 PASS (because lane B never publishes), AC-7 FAIL (because 1951g not yet merged). Cutover blocked; possibly need a follow-up re-validation sprint after 1951g lands.
- **WATCH 2026-05-18T23:00Z** — FA cycle: verify HPG `get_cash_flow` non-zero (post-1942c gate). Pass → auto-close in Todo.
- **GATE 2026-05-20T07:22Z** — post-1945-verdict-resolution-scored-pct + bug-storm silence. Unblocks 1948a/b/c chain.
- **GATE 2026-05-25** — 1939 critic-gate stability window. Unblocks 1952c business-context-mandatory.
- **USER-action blockers:** 1907a (Claude Desktop restart), 1897b (Docker VirtioFS `.git/`). Unchanged.
- **WIP discipline:** strict cap=2. Do NOT promote SPIKE-1951f/1951g into In Progress until 1951c clears OR until 1951b closes its OBSERVE column (AC-6 verdict locked).
