# A-21 Crash-Window Predecessor Bound — False-Negative Fix (Counting Query Only)

**Task:** `FIX-A21-CRASH-WINDOW-PREDECESSOR-BOUND-FALSE-NEGATIVE` (`docs/data/orch/orch-state.json` →
`task_board.backlog`) — P1, size S, zone=multi, plan_only=true, supervised=true, owner=architect
**Author:** agents-architect | **Date:** 2026-07-29
**Scope:** Design only. No app code, no flow-doc edit, no script edit, no container action in this
session — see Verification below for what WAS run (read-only).

---

## 1. Root cause (restated precisely, not as "loop starts at i=1")

The crash-vs-deploy discriminator classifies a startup `T` as a crash by checking whether a
`mcpServerCleanShutdown` row exists between `T` and its predecessor `P`. Today `P` is found by
fetching all `mcpServerStartup` rows inside a **fixed** `2 × WINDOW_HOURS` lookback (8h) and using
`rows[i-1]` as the predecessor of `rows[i]`. This only works if the true predecessor happens to sit
inside that same fixed 8h slice. The inter-startup gap is unbounded, so for any `T` whose gap to `P`
exceeds 8h, `P` is never fetched and `T` becomes permanently misclassified (silently, not an error).
This is a structural bound-mismatch, not an off-by-one: **the candidate window and the predecessor
lookup are the same query with the same fixed radius**, and no fixed radius can bound an unbounded
gap. Widening the constant (AC(1) explicitly rejects this) only moves the same failure to a larger
gap.

Consequence: the detector can only classify crashes that follow **less than 8h of uptime** — i.e. it
works inside an already-established fast crash loop and is blind on the first crash after any stable
period, which is exactly the highest-signal event it exists to catch.

## 2. Live re-measurement (read-only, this session, 2026-07-29)

Reproduced the row's own numbers directly against the live DB via `docker exec … bun -e` with
`readonly: true` — no writes, no Telegram send attempted.

**(a) Reproduced the defect using the exact hand-ported query at HEAD:**
```
CURRENT (HEAD, buggy) result: {"crashRestarts":0,"crashTimestamps":[],"fetchWindowRows":1}
```

**(b) Reproduced the defect by importing and invoking the REAL production module directly**
(`/app/src/scheduler/system/restartCadenceAlertJob.ts`, injected with a readonly `Database` and an
inert `sendFn` that never fires — the module's own doc says "Injectable deps: db + sendFn for
unit-test isolation", so this is exactly what that injection point is for):
```
LIVE MODULE (HEAD, buggy, injected readonly db + inert sendFn) result: {"restartCount":0,"alertSent":false}
```
This confirms the bug lives in the shared logic itself, not merely in the flow-doc's hand-port of
it — and confirms (§5) that the module can be invoked safely, read-only, from outside its own
scheduler.

**(c) Verified the proposed fix (below) against the same live data, same connection, same instant:**
```
PROPOSED (LAG unbounded predecessor) result: {"crashRestarts":1,"crashes":[{"cur":"2026-07-29 05:43:21","prev":"2026-07-28 22:58:42"}],"candidateRows":1}
```
This matches the row's stated ground truth exactly: 1 true crash restart, predecessor
`2026-07-28 22:58:42`, 18 minutes outside the old 8h fetch bound.

## 3. Proposed fix — single query, unbounded predecessor, bounded candidate set

Reject the naive "predecessor via `SELECT MAX(started_at) … WHERE started_at < <oldest candidate>`"
shape offered as an *example* in AC(1) in favor of a single `LAG()` window-function query. Both
satisfy AC(1)'s requirement (predecessor resolved without a time bound), but the window-function
form does it in one round trip instead of N+1, and is not a new pattern for this codebase — `LAG()`
and `ROW_NUMBER() OVER (...)` are already established idioms here (`foreignRoomStore.ts:145`,
`insiderSentimentStore.ts:138`, `moneyRadarStore.ts:125`, `ohlcvSanityCheckJob.ts:267`,
`portfolioTools.ts:305`). SQLite in the running container is 3.51.2 (window functions landed in
3.25, 2018), so there is no capability risk. `cron_job_runs` already carries
`idx_cron_job_runs_job_started ON cron_job_runs(job_name, started_at DESC)`, which covers this query
(table is 122 rows total at measurement time — cost is a non-issue regardless, but the index means
it stays a non-issue at scale too).

```sql
WITH ordered AS (
  SELECT started_at,
         LAG(started_at) OVER (ORDER BY started_at ASC) AS prev_started_at
  FROM cron_job_runs
  WHERE job_name = 'mcpServerStartup'
)
SELECT started_at, prev_started_at
FROM ordered
WHERE started_at >= <windowCutoff>      -- same 4h ALERT window, unchanged constant
ORDER BY started_at ASC
```

- The `LAG` window is computed over **all** `mcpServerStartup` rows ever recorded (no time
  predicate inside the CTE) — this is the "unbounded predecessor lookup" AC(1) requires.
- The outer `WHERE started_at >= windowCutoff` is the **only** place a time bound remains, and it
  now does exactly one job: selecting which startups are *candidates for alerting* (the 4h window).
  It no longer doubles as (and therefore no longer corrupts) the predecessor lookup.
- `prev_started_at IS NULL` (no earlier startup row exists anywhere in history) replaces today's
  `if (i === 0) continue` — same conservative "cannot classify, skip" semantics, but now genuinely
  means "this is the very first startup ever recorded," not "the first row in whatever slice we
  happened to fetch."
- The existing clean-shutdown `BETWEEN` subquery (`started_at > prev AND started_at < current`) is
  untouched — it was already unbounded, per AC(1).
- The bootstrap guard (`firstCleanShutdown IS NULL → classify nothing`, AC(5)) runs exactly as
  today, before this query, using its own untouched query.
- Minor documented caveat, not a defect: `LAG` ties on identical `started_at` values would pick an
  arbitrary sibling. `started_at` is second-resolution and two startups of the same process cannot
  share a timestamp, so this is not reachable in practice; note it in the implementation PR so a
  future reviewer doesn't have to re-derive it.

This removes the `WINDOW_HOURS * 2` fetch bound and its associated comment block entirely (both
artifacts) — there is no longer a "capture the startup that preceded the oldest in-window startup"
concern to caveat, because the predecessor lookup no longer shares a radius with the candidate
window.

## 4. AC(2) — both artifacts, must not diverge

Files in scope for the fix, confirmed identical in structure by direct read this session:

1. `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts:170-232` — the production
   Telegram alert path. Replace steps 1–2 (`startupRows` fetch + `for` loop) with the `LAG`-based
   query and a plain iteration over its rows (no more `i===0` index check; test `prev_started_at ===
   null` instead). Update the module-header comment at `:170-173` — it currently *asserts* the false
   guarantee ("Extend the lookback one extra window to capture the startup that preceded the oldest
   in-window startup") and must be rewritten to describe the `LAG` approach, not merely deleted,
   since a future reader needs to know why the old shape is gone.
2. `docs/agents/system-auditor/flow/tier1-probe.md:112-131` — the inline `bun -e` heredoc. Two
   options, ranked:
   - **Preferred (also answers AC(6)):** stop hand-porting the SQL. Replace the heredoc with
     `docker exec "$MCP_CTR" bun -e "…"` that imports the real exported function
     `runRestartCadenceAlertJob` from the production module (path inside the container confirmed
     live this session: `/app/src/scheduler/system/restartCadenceAlertJob.ts` — the image runs `bun
     run src/index.ts` directly, no build/dist step, so the `.ts` source is present and importable
     at that exact path), injects the SAME `readonly: true` `Database` the flow doc already opens,
     and injects an inert `sendFn` (`async () => true`, never actually calls Telegram — the auditor's
     own `emit-audit-signal.sh` remains the sole decision-maker for whether to notify). This was
     proven live and read-only this session (§2b) with zero side effects. It structurally satisfies
     "must not diverge" — there is only one copy of the predicate to diverge *from*.
   - **Fallback**, if the implementer judges the container-import path too fragile for the flow-doc's
     `docker exec` execution model (e.g. TS import resolution inside a raw `bun -e` string is judged
     too brittle for a probe script that must degrade to `TOOL-UNAVAILABLE` rather than crash): port
     the `LAG` query verbatim into the heredoc, byte-identical to the TS version's SQL, same as
     today's porting convention. This satisfies AC(1)/(2)/(3)/(4) but not the stronger reading of
     AC(6).
   A fix landing in only one of these two files is rejected per AC(2) — the flow doc's own text
   claims a "1:1" port and that claim must remain true either way.
3. `docs/architecture-briefs/2026-07-23-auditor-a30-reclamation-gate-a21-windowed-restart.md:178-181`
   — this is a **design record**, not an executable artifact; it is not "fixed," it is superseded.
   Add a dated addendum line at the top of its A-21 section pointing at this brief and this task id,
   so a future reader who greps that brief for the A-21 query does not re-copy the disproven shape a
   fourth time (this is exactly how the defect reached three artifacts in the first place, per the
   row's own `note`). This is a documentation append, not a rewrite of that brief's history.

## 5. AC(6) — stop hand-porting; recommendation stated and proven feasible

`runRestartCadenceAlertJob(db?, sendFn?)` was already built with exactly this reuse in mind — its
own header says "Injectable deps: db + sendFn for unit-test isolation," and its non-injected
defaults only reach for the live `getDb()`/`sendTelegramWork` via **lazy dynamic import**, so nothing
fires until you fail to inject. This session proved, live and read-only, that the auditor's `docker
exec` probe can `import()` this exact module and call it with a readonly DB and a no-op send
function, reproducing the correct (buggy, at HEAD) production number with zero side effects (§2b).
**Recommendation: adopt the single-shared-actuator shape** (§4 item 2, "Preferred"). This is not a
stylistic preference — three artifacts sharing one hand-copied predicate is the row's own stated
reason this defect recurred, and `git log` on `restartCadenceAlertJob.ts` already shows three prior
commits in this exact discriminator's history (`babe54c6c`, `2d494f77e`, `ff874c821`). A second
hand-maintained copy is the mechanism by which the *next* recurrence would happen, not a hedge
against it.

## 6. AC(4) — regression test

No test file for `restartCadenceAlertJob.ts` exists today (confirmed by search). Add one following
this repo's established fixture convention for this exact table
(`apps/mcp-server/src/__tests__/1103-cron-health-alert-job.test.ts` is the closest sibling: in-memory
`:memory:` `Database`, local `CREATE TABLE cron_job_runs` matching production schema, an `insertRun`
helper using `datetime('now', '-${hoursAgo} hours')`, calling the exported function directly with an
injected DB and a mock `sendFn`). Next available numeric prefix per `ls __tests__` at time of writing
is `2028-` (highest existing is `2027-scheduler-lock-finally-sweep.test.ts`) — implementer should
re-check at PR time since this is a shared, actively-growing directory.

Required cases (per AC(4), both must be RED against current HEAD and GREEN after the fix):
1. **The exact live shape that failed:** one clean-shutdown row (bootstrap satisfied), one startup
   at `now - 5h` (predecessor, deliberately placed so it falls outside the current buggy 8h fetch
   bound is not even needed — placing it at `now - 9h` makes the point unambiguously), one startup
   inside the 4h alert window, no clean-shutdown row between them → `restartCount === 1`. Current
   code returns `0` for this fixture; this is the RED assertion.
2. **Mirror case:** clean-shutdown satisfied, one startup at `now - 13 days` (long stable uptime),
   then two crash startups inside the 4h window with no intervening clean-shutdown → `restartCount
   === 2` and `alertSent === true` (crosses `ALERT_THRESHOLD`). Current code returns `1` for this
   fixture (drops the first of the two, or drops the 13-day predecessor depending on which end of
   the window is hit — either way, undercounts) — this is the second RED assertion.
3. **Non-regression, unchanged behavior:** a graceful deploy (clean-shutdown row present between two
   startups, one inside the window) must still resolve to `restartCount === 0` — proves the fix did
   not weaken the discriminator, only its window mechanics.
4. **Bootstrap guard unchanged (AC(5)):** no `mcpServerCleanShutdown` row anywhere →
   `{restartCount: 0, alertSent: false}`, unchanged from today.

## 7. Ordering ruling vs `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` (mandatory per `cross_row_interaction`)

**Ruling: ship together, gated by an added STALE-SENTINEL caveat on the alert message itself — not
full sequencing-block, and not unconditional ship-first.**

Traced concretely (not asserted) what happens if only the window/predecessor fix ships, using the
row's own live numbers: right now, fixing the query changes `crashRestarts` from `0` to `1` for the
single in-window startup — `1 < ALERT_THRESHOLD(2)`, so **no alert fires today**. But
`mcpServerCleanShutdown` has not fired since 2026-07-22 17:48:42 (`OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`,
independently confirmed by PO). Since the discriminator's only crash evidence is absence-of-sentinel,
and that sentinel is frozen, the **very next restart** — traced step-by-step for a hypothetical
`08:00Z` restart — would push `crashRestarts` to `2` under the *fixed* query (both the `05:43:21` and
the new restart lack an intervening clean-shutdown row) and **fire the WORK-channel alert**, whereas
the *current buggy* query would still under-report `1` in that same scenario (it drops whichever row
lands at the edge of its shifting 8h fetch snapshot — the same defect, just relocated). In other
words: fixing the window mechanics does not, by itself, create a new false-positive *class* — the
false-positive exposure already exists today for any two startups whose gap is under 8h, because
that exposure is driven by the broken clean-shutdown sentinel, not by the window bound. What the fix
changes is that it stops *hiding* that exposure behind an unrelated bug; it makes the counter
correctly reachable, including reaching it on ordinary/benign restarts while the sentinel is dark.

Rejected options and why:
- **(c) Ship first, unconditionally — rejected.** The counting fix alone would very plausibly turn
  the next legitimate quick redeploy pair into a WORK-channel page, on a detector whose own git
  history already shows three prior fix→break→fix cycles
  (`babe54c6c` → `2d494f77e` → `ff874c821`) and whose sibling row explicitly names this family a
  candidate **recurring failed fix**. Shipping blind risks becoming the fourth recurrence of the
  same underlying class the row exists to close.
- **(a) Full block behind `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` — rejected.** That row is an open,
  unscheduled P1 investigation (`plan_only`, `supervised`, root cause not yet determined — its own
  text states the death could be a voluntary exit that never reaches the sentinel write, *or* the
  sentinel write itself failing/racing, and it explicitly reserves the option to re-route to the ops
  lane entirely). Gating a well-scoped, already-measured, S-size counting fix behind an
  open-ended diagnosis leaves the DOCUMENTED, MEASURED false negative (crash after long uptime — the
  highest-signal event by the row's own root-cause text) open indefinitely on a P1 detector whose own
  doc asserts a guarantee that is provably false. That is a worse position than a guarded ship.
- **(b) Ship together with a guard — adopted.** The counting fix is correct unconditionally (it does
  not depend on sentinel health — it only changes how far back the predecessor is looked up, not the
  crash/deploy predicate itself), so there is no reason to withhold it. Pair it with a narrow,
  same-file addition that changes the alert message's *confidence framing*, not its firing logic — so
  the newly-reachable "every restart looks like a crash" state pages *with an explicit caveat*
  instead of silently presenting stale, possibly-wrong evidence as if it were high-confidence.

Concrete guard shape (recommended, not a re-scope of the sentinel investigation itself — it reads
data this query already touches, and does not modify or diagnose `composition-root.ts:254`, which
remains entirely `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`'s job): alongside the existing
`firstCleanShutdown` query, also compute `lastCleanShutdown = MAX(started_at)` for the same
`CLEAN_SHUTDOWN_JOB_NAME`. If `restartCount >= ALERT_THRESHOLD` (the alert is about to fire) **and**
every counted crash timestamp is more recent than `lastCleanShutdown` **and** the count of
`mcpServerStartup` rows since `lastCleanShutdown` is itself `>= ALERT_THRESHOLD` (reusing the
existing constant — deliberately not inventing a new arbitrary number, same philosophy as the
existing `ALERT_THRESHOLD` reuse in the A-21 verdict text) — append one sentence to the Telegram
message: `"clean-shutdown sentinel has not fired since <lastCleanShutdown> across <N> restarts —
crash/deploy discrimination may be unreliable, see OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN"`. This
does **not** suppress the alert (suppressing would reintroduce a new false negative — exactly the
mistake this row exists to remove) and does **not** touch the sentinel writer. It only changes what a
human reading the WORK channel is told about the evidence quality. This addition belongs in the same
implementation PR as the counting fix (both touch the same function/heredoc and the same
`firstCleanShutdown`-style query pattern) but is explicitly a design recommendation for the
implementer to accept or reject with reasoning, not a new AC — the row's own AC(1)-(6) do not mention
it, and it must not be read as blocking sign-off if the implementer judges it unnecessary; it must,
however, be explicitly accepted or declined in the implementation PR, not silently dropped.

`OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` remains entirely responsible for the actual repair (why
`composition-root.ts:254`'s sentinel write is not landing) — this brief does not touch that file,
does not diagnose the writer, and does not duplicate that row's scope. The two rows compose exactly
as the cross-row note describes: that row owns *why the shutdown is unrecorded*; this row owns *why
the counter drops records that do exist*, plus (new, this section) a caveat so the counter is honest
about the interaction between the two while both are in flight.

## 8. Scope-fence compliance (explicit)

- Verdict mapping (`tier1-probe.md:133-142`, `ALERT_THRESHOLD=2`) — **untouched.** Nothing in this
  design changes the `>=2 → WARN` rule; only the value feeding it changes, per
  `po_scope_amend_20260729T0721` on `FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`,
  read in full before drafting this brief.
- This row's surface is the counting query (`tier1-probe.md:112-131`,
  `restartCadenceAlertJob.ts:170-232`) plus the brief-addendum in §4 item 3 — nothing else.
- Not folded into `EPIC-AUDITOR-DETECTOR-CORRECTNESS-DRAIN`.
- No new row minted duplicating `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`,
  `FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`,
  `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE`,
  `FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP`, or
  `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`.

## 9. Recommended implementation split (zone=multi → two specialists)

1. **`apps/mcp-server/` half** — the production TS fix (§3), the header-comment rewrite, the §7
   staleness-caveat addition, and the regression test (§6). Owner: **dev-mcp-server**. Ships as code
   + test; per the row's own `verification_gate`, the TS half waits for a user-gated deploy window
   outside VN market hours (02:00-09:00Z) — no container action in this task.
2. **`docs/agents/system-auditor/flow/tier1-probe.md` half** — the mirrored query/import change
   (§4 item 2) plus the doc-addendum on the 2026-07-23 brief (§4 item 3). Owner: **agent-father** —
   this matches the established routing precedent for this exact file: the sibling
   `2026-07-23-auditor-a30-reclamation-gate-a21-windowed-restart.md` brief (which introduced this
   very heredoc) itself returned `NEXT: agent-father` for `tier1-probe.md` edits, not
   dev-mcp-server. `dev-mcp-server` owns the app-code half; `agent-father` owns the flow-doc half.

Both halves must land referencing the same task id so QA can verify AC(2) ("must not diverge")
across both PRs together, not in isolation.

## 10. Verification performed this session (read-only, no side effects)

- Reproduced HEAD's bug via the hand-ported flow-doc query — matches row's stated `crashRestarts:0`.
- Reproduced HEAD's bug by importing and calling the real exported `runRestartCadenceAlertJob`
  function with an injected readonly DB and inert `sendFn` — matches, and proves §5's reuse path is
  live-viable today, before any code changes.
- Ran the proposed `LAG`-based corrected query against the same live DB, same instant — returned
  `crashRestarts:1`, predecessor `2026-07-28 22:58:42`, exactly the row's stated ground truth. This
  is the row's own `verification_gate` requirement ("re-run the corrected query read-only … show it
  returns crashRestarts=1"), satisfied.
- No `docker stop/kill/rm/restart`, no compose action, no writes of any kind were issued. All three
  checks used `new Database(path, { readonly: true })` and, where the live module was invoked, an
  inert `sendFn` that never reached a network call.

## RETURN

DONE: Design complete. Root cause is the shared 2x-lookback/predecessor-bound defect in
`restartCadenceAlertJob.ts` and its 1:1 port in `tier1-probe.md`; fix is a single unbounded `LAG()`
predecessor lookup with the 4h alert window retained only as the candidate filter. Live-verified
read-only this session: HEAD reproduces `crashRestarts:0`, corrected query reproduces
`crashRestarts:1` matching stated ground truth.
ZONE: multi — `apps/mcp-server/` (dev-mcp-server) + `docs/agents/system-auditor/flow/` (agent-father)
ORDERING RULING vs OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN: ship together, not sequenced — add a
same-PR staleness caveat on the alert message (§7) rather than blocking on, or ignoring, the frozen
clean-shutdown sentinel.
FIX SPANS: all three named artifacts, per AC(2) — `restartCadenceAlertJob.ts` (code fix + test),
`tier1-probe.md` (mirrored fix, preferably by calling the same production function instead of
re-hand-porting SQL — see §5), and the 2026-07-23 architecture brief (addendum pointer only, not a
rewrite, since it is a historical design record).
NEXT: dev-mcp-server (TS half) + agent-father (flow-doc half) — both supervised, both plan_only at
mint; PO/router to dispatch per the split in §9. Row left in `backlog` (no lane move) with this
brief's path and the split recommendation recorded on the row via `architect_review_note` — I did not
self-mint the two implementation rows or flip status, consistent with this row's `supervised:true`
and the precedent set by the most recent comparable supervised P1 board-mint in this agent's own
notebook (`FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR`, 2026-07-28: findings written to
`architect_review_note`, status/lane left unchanged, "Router/PO must dispatch next").
PIPELINE: continue
