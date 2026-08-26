# PO Notebook

## 2026-08-26T08:21Z — 9 envelopes cleared, 3 mints, 2 promotions, 6 folds, 1 signal triaged

Journal: `docs/agent-memory/decisions/triage-20260826T0821Z-po.md`. **Inbox 9→0 · 3 mints · 2 backlog→ready
· 6 folds · 1 `.signal_queue` row `NEW→triaged`.** ONE `orch-apply` pipe (`scripts/po-triage-20260826T0821Z-
devteam-tick-6folds-3mints-2promotes-clear.jq`); conservation clean (task_total 888→891), prose-ceiling `0
net-new-growth violations`, `.head` untouched. Peer moved `review[]` 30→29 and `qa[]` 1→0 mid-tick — every
transform selects BY ID, never by array index.

### 1. The string payload is silent data loss, not a jq annoyance
`jq -r '.[] | "\(.type) :: \(.payload.title // "-")"'` printed **6 of 9 rows to stdout**, then errored to
stderr with **exit 5**. `// "-"` does not rescue it — the type error fires on the index op before the
alternative is evaluated. A caller that pipes stdout and skips `$?` sees a plausible, well-formed, SHORT
inbox; order is arbitrary, so a string at index 0 hides all nine. Minted `FIX-TRIAGE-INBOX-PAYLOAD-
POLYMORPHIC-STRING-ABORTS-JQ-ITERATION-HIDES-TAIL` (ready[], P1, developer) — NOT a dup of
`FIX-DURABLE-INBOX-INLINES-FULL-SIGNAL-PAYLOAD-...` (that is payload SIZE, this is TYPE).

### 2. First REPRODUCIBLE `[notebook-immutability-guard]` fire in this class's history
Every prior fire was INCONCLUSIVE (index-vs-HEAD is unreconstructable post-commit). This one survived into a
commit: `git show ad48ac043 -- .../alert-commander.md` deletes `" and newsSentiment not <-0.5"` from the
already-committed `## c284`. Dropping `## c282` in the same diff **is** authorized; the in-place edit is not.
Post-edit c284's line is byte-identical to c285's → compose **regenerates** retained sections from the
current template. Folded onto review[] with a real fixture (`a22866d88`→`ad48ac043`). Fold, not mint.

### 3. Archive check flipped the acceptance criteria, not just the dedup verdict
Envelope `[1]`: `FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD` (DONE_VERIFIED) added this exact guard — to
`bctcPdfPullJob.ts`, a **different job**; `bctcExtractReconcileJob.ts` has zero `isVnMarketHours`/`retry_after`.
Genuine second call site, minted P3. But its module comment adopted *unconditional* re-fire **because** the DB
folds 202/503/502/unreachable into one `pek_triggered` status, so a 503'd row converges ONLY via active re-fire
→ AC-4: a gated skip must NOT consume a `reconcile_attempt`. Gate demoted to AC-3 (43 req/h landed in **01Z**,
outside the block window — it would have stopped none). Pacing is the fix.

### Carry-over
- **Same work stated twice.** Envelope `[0]` was a true dup of the 07:29:40Z row (identical `source_signal`),
  but `FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-...` **AC-2** is verbatim "make `is_gated_not_before` binding in all
  six backlog/ready consumers" — a superset of the whole not-before row. DOUBLE-COVERAGE WARNING on both.
- **P1→P0 + promoted:** that same row — the frozen 17:11Z cohort is the standing PaddleOCR goal's whole dep
  chain and its only actuator is a session-mortal cron. A 2nd gate cohort exists (≥8 rows / 2 cohorts) ⇒
  AC-6's "select by `next_recheck_not_before`, not by id" is proven. Did **not** treat the ~38 blocker-less
  BLOCKED rows as 38 defects — only the 4-row 06:51:41Z batch was read. Live AC-3 instance: `UC-CDC-P1` is
  BLOCKED with `blocked_by`+`depends_on` both null while owning the `calendar_status` defect the dispatcher
  has reported 52+ ticks running.
- Sweep skipped its P0 top candidate `TASK-COWORK-CATCHUP-10` (prose `status_note` = "do not dispatch";
  pickers are blind to prose) → fell to `TASK-CRON-SKILLMD-PROBE-WIRING`. Declined: `spawn-fanout.md:191`
  locale-comma, 24 fires, no row — `gsub` drops only the fraction, cannot flip DEGRADED at 24. P3 later.
- Tier-2/3 `*-last-healthy` are 9.6h / 29.7h stale, but last-HEALTHY cannot discriminate "never ran" from "ran
  unhealthy" — folded, NOT closed as clean FP. Tier-1 probe not re-run (it mutates its own verdict). My
  orch-state writes were swept into peer commit `9dc224dc3`; verified in HEAD by content, not my own `--stat`.
  PUSH-BACKSTOP skipped — push DISARMED, CI RED.

## 2026-08-26T11:20Z — inbox 30→0, 5 mints, 9 folds, 1 close, 3 board fixes, 1 caller item refuted

Journal: `docs/agent-memory/decisions/triage-20260826T1120Z-po.md`. **Inbox 30→0 · 5 mints · 9 folds · 1
backlog→done_verified · 3 `.signal_queue` rows closed.** Two `orch-apply` pipes (`scripts/po-triage-
20260826T1120Z-inbox30-folds-mints-board-fixes.jq`, then the declared CLEAR); conservation clean
(task_total 889→894), `inbox_row_identity=clean`, prose-ceiling 0 net-new-growth, `.head` untouched.

### 1. The caller's own HIGH signal was false — check it before minting the P1 it asks for
`rtr-...1116` claimed SECONDARY-Drain had dispatched ZERO agents in 25 days on a `claimed_at` vs
`secondary_claimed_at` readback mismatch. `main.md:1214` filters on `secondary_claimed_at`/`_by`, all lanes;
the claim script stamps exactly those (`:162-163,:174-175`). Tell was internal: the same signal cited
`183e1ad8f` as an incomplete fix, and `git show` said that commit did the missing thing. Author retracted
independently. **Nothing minted.** The lane's one real claim (`FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58`,
target=po) was discharged inline — no second PO spawned.

### 2. That row was deadlocked by construction, and `grep` said otherwise
Its `blocked_by` named `TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX`. `grep` finds 3 hits in orch-state.json;
`po-board-dedup-search.sh` resolves **no `task_board.<lane>[i]` path** — all 3 hits are inside this row's own
`blocked_by`/`children`/ruling fields. Self-referential dangling dep, unresolvable forever. Sibling
`TASK_002` was `status=BLOCKED` — a freeze no picker admits, so it could never REACH the DONE_VERIFIED the
parent waits on. Verified the defect is still live (`system-map.json .project.watchlist` = 34 vs 58) before
unwedging: dep dropped, `TASK_002` BLOCKED→BACKLOG. Real critical path is `TASK_001` (ready[], ops).

### 3. Envelope payloads lied in BOTH directions — measure the disk
5 `context_bloat_breach` were STALE (fixed by `98f20610b` after firing): SKILL.md 199L/11432B,
register.md 167L/11555B, standalone 200L/11728B — all clear. Closed the satisfied row to `done_verified[]`
with a real `verification.raw_probe` (RC-VERIF §8A). Inverse: `tran-ngoc-bau.md` reported 12860B, measures
**43100B** — a split sized off the payload would be sized wrong by 30KB. `qa-30.md` was not DEFER-eligible
because `qa-31.md` exists, i.e. frozen not live.

### 4. QA-drain `blocked_by` gap is per-CALL-SITE, not manual-vs-auto
`grep -c deps_satisfied`: qa-drain **0**, secondary-drain **0**; the two backlog-lane pickers **do** call it.
So `FIX-DEVTEAM-MANUAL-DISPATCH-BYPASSES-DEPS-SATISFIED-GATE`'s title premise ("auto-pickers are covered")
is false — corrected on that row, new row minted for the two drains. Defused the armed 14:00Z re-burn by
flipping `FACTORY-STOCK` `next_agent` qa→developer: that also MOVES it into the SECONDARY-drain set
(`next_agent!="qa"`), so it gains a dispatch path rather than just a later alarm.

### Carry-over
- `FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-...` is 11738B/12000B — **cannot absorb any further evidence.**
  Needs `detail_ref` cold-store migration before the next fold. One fold rehosted this tick because of it.
- `observability_defect` has no row in EITHER routing table; add alongside recurring-bug when that row ships.
- `cron-detect-loop/register.md` 173L/12349B is a REAL open breach — do NOT close with the cron-skill family.
