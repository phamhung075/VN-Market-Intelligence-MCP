# PO Notebook

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

## 2026-08-26T12:28Z — 1 envelope cleared, 0 mints, 2 folds, 1 duplicate found, 1 prose migration

Journal: `docs/agent-memory/decisions/triage-20260826T1228Z-po.md`. **Inbox 1→0 · 0 mints · 2 folds.**
ONE `orch-apply` pipe after a first attempt was hard-rejected by the prose-ceiling gate. `.head` never
written — a peer flipped it to idle at 12:26Z mid-tick and my write preserved that. Every transform
selects BY ID.

### 1. The caller said "no tracked row" for `calendar_status` — there was one
`UC-CDC-P1` (backlog, BLOCKED) is exactly this defect and *I had already folded it at 03:48Z today*.
A keyword grep would have missed it; the path-resolved lane scan found it. **Do not accept a caller's
"no row located" as a dedup result** — it is an input to the scan, never a substitute for one.

### 2. My own 03:48Z fold on that row rests on a FALSE premise, now corrected
It said the wrong value is "non-binding" because `pressure-read.md` Step 4.3 is a SUPERSEDED no-op. But
Step 4.3's own banner says the logic MOVED into `cadence-policy.js` + `cadence-policy.json`, whose 29
rules all branch on `calendar_status`. **A SUPERSEDED banner names the new owner — read it before
concluding "no consumer".** Consumer-ness moved, it did not vanish.

### 3. …but the blast radius is SMALL, and measuring it is what kept a row out of `ready[]`
`cowork-match-slots.js:328` makes cron "always the first gate" and the adaptive loop iterates only
cron-matched slots, so cadence can ONLY throttle DOWN, never speed up. 3 of 4 policies are cron-confined
or `_cron_fallback`. Real cost ≈ **6 avoidable spawns/day** on two gatherer slots (git history of
`cowork-schedule.json`: `news-scout-offhours` fired 6x/day on 08-25 and 08-26, exactly its 240-min cron).
That does NOT outrank a 114-deep starving `ready[]` → folded, did not mint. The alarm was real; the
magnitude was 1/10th of what the envelope's framing implied.

### 4. Found a duplicate the 2026-08-24 mint missed
`FIX-CYCLE-SNAPSHOT-...` (ready, P0, next_agent=architect) duplicates `UC-SDF-P2` (ready, P1,
next_agent=developer) — same defect, and UC-SDF-P2 has a BA spec **and an architect brief delivered at
10:28Z TODAY** carrying the identical fix shape. The P0 row would have burned a DRS dispatch redoing it.
Cross-linked + warned inline; did NOT touch `next_agent`/`dispatch_lane` (DRS' fields, 2 live agents).

### Carry-over
- Prior carry-over's prescription WORKS: `FIX-CYCLE-SNAPSHOT-...` hit the same 12000B wall (11464→14658B).
  Fix = move prose to `detail_ref` + archive the old `status_note` VERBATIM in the cold file. Row now 9.8KB.
  `FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-...` at 11738B still needs the same treatment.
- **Merge decision open for the caller:** re-point or close `FIX-CYCLE-SNAPSHOT-...` into `UC-SDF-P2` unit 1.
- `SESSION_STATUSES` has no member for "trading day, session closed" — the enum, not the wiring, is the
  real `calendar_status` defect, and no row owns it. Recorded on UC-CDC-P1 §(d) for whenever it unblocks.

## 2026-08-26T15:08Z — SECONDARY-Drain sign-off (1 row) + inbox 5→0 (3 folds, 2 DEFER), 1 mint

Journal: `docs/agent-memory/decisions/triage-20260826T1508Z-po.md`. **DONE_VERIFIED 1 · mint 1 · inbox 5→0
· folds 3 · DEFER 2.** ONE `orch-apply` pipe (`scripts/po-triage-20260826T1500Z-secondary-drain-signoff-
and-inbox-clear.jq`); prose-ceiling rejected the first attempt on 2 near-cap rows, shortened and retried
clean. `.head` untouched.

### 1. Notebook-UUID-provenance row: AC-1/AC-2 verified, AC-3 correctly still refused
Re-ran `verify-notebook-uuid-provenance-gate.sh` myself instead of trusting the review_note: the 3 named
files (agent-father/dev-team/qa) are clean at HEAD; fleet-wide the ONLY live producer is `tran-ngoc-bau.md`,
10 hits incl. its newest commit (c136, 2026-08-25). That **overrules** my own 2026-08-24 `po_fold` note
telling the next closer to flip the guard to reject — flipping now would hard-block tran-ngoc-bau's very
next commit. Signed off DONE_VERIFIED on the row's own 3-file scope; minted a narrow follow-up
(`FIX-TNB-NOTEBOOK-UUID-HEADING-ACTIVE-PRODUCER-SCRUB`, agent-father) as the actual AC-3 gate.

### 2. pdf-extractor A-30: verify the trend yourself before ruling on it
Coordinator flagged mem_creep 92→95.56%, "still climbing, not reclaiming." `docker stats`/`docker logs`
run 5 min later showed 76.41%, tied to a live 61-page extract job that finished 7s before the probe fired
— bursty, not monotonic. Didn't fully accept the framing, but didn't wave off the risk either: the same
container class already had two real kernel OOM-kills of worker processes (2026-08-23), invisible to the
docker plane. Held the existing plan (no ack — refused 4x already; no cap raise; no early redeploy before
17:11Z); tried the read-only dmesg/nsenter probe myself and it failed in-sandbox (execve:ENOENT even on
`/bin/ls`) — authorized in principle, execution deferred to a host-capable session.

### 3. The envelope id in the dispatch prompt did not match the real envelope_id
Router's prompt named `rtr-20260826T1435-pdfxa30dedupoverturned`; the actual field on disk was a hash
(`ab2cb52e...`). Resolved by reading the live inbox directly rather than grepping for the prose name — 5
envelopes were present, not the 4 claimed.

### Carry-over
- `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` is now ~13.9KB after this fold — next writer should route
  through `detail_ref`, not append more inline.
- Kernel-log/cgroup probe for CONSTRAINT_MEMCG on container 417febec1a03 is still unexecuted — needs a
  session with real host docker access (`--privileged --pid=host` failed in this sandbox).
