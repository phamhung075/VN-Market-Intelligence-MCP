## 2026-08-26T18:08Z — inbox 10→0, 7 folds, 1 mint, 2 cancels, 2 rulings, WIP slot freed

Self-read inbox matched the caller copy exactly (same 10 ids). Pipeline-B dashboard: 0 NEW `to=po`.

**Folds (7).** CCATO SHB+VIX → `FIX-CCATO-NULLMARKER-SET-INCOMPLETE-…`, raised P2→P1. Not a fabrication and
not probe-substitution: `compare_financials` returned `current:null`, so both absence-claims were TRUE.
Mechanism read from source, not inferred — `verdictClassifier.ts` `flattenText()` JSON.stringify()s the object,
`classifyVerdict()` then only substring-matches 10 prose literals, and `JSON.stringify(null)==="null"" is not one
of them. Third tool. This makes that row's AC-(2) (structured null discriminator) mandatory rather than optional:
the marker list *cannot* be extended here — adding "null" would match any response containing the substring.
Others: HPG `operating_profit=0` (41+ cycles, now disabling ESC-4) · DXG (45+ cycles, an AVOID verdict now rests
on a substituted EY input) · ESC-1 tool-grant (4/4 of this tick's cycles — the gate is inert, not degraded) ·
cycle-snapshot (2nd+3rd consecutive, 16:00Z was predicted then observed) · janitor dead-writer premise.

**Mint (1).** `FIX-COWORK-MUTEX-DROPPED-SLOTS-DISCARDED-BY-FINISH-META-DIVERGES-FROM-SLOTS` (P2, backlog).
The originating envelope's own hypothesis was WRONG and I refuted it before minting: the dropped
`market-watcher-offhours` slot was removed BY DESIGN — `cowork-schedule.json` declares `market-watcher-eod`
with `supersedes:["market-watcher-offhours"]`, owning brief 2026-08-14. No fire was lost. The real defect is
that `finish()` keeps only the `*_mutex_applied` booleans and discards both mutexes' exact `dropped[]` lists,
while `due_reasons`/`cadence_minutes` are built PRE-mutex and `slots[]` is POST-mutex. Cost is measured: one
full cowork tick spent reaching a false mechanism because the right answer was computed and thrown away.

**Cancels (2), not in the inbox — surfaced by verifying the janitor envelope's premise.** The premise was TRUE
(writer active: 15 files, newest written 14:58Z today, commits 08-08→08-26). That exposed
`CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-…` sitting BACKLOG/owner=developer/next_agent=developer —
fully dispatchable — instructing permanent deletion of a doc family written to daily, on a premise its own
sibling had been RETRACTED for 5 hours earlier the same day. Both cancelled to `archive[]`, `do_not_reopen`.

**Rulings (2).** (a) dev-team's HIGH → folded onto `FIX-DISPATCH-GATES-BLIND-TO-PROSE-DISPOSITION` with the
scope WIDENED: the 08-23 incident's carrier was `status_note`; this one's is a bespoke key with `status_note`
NULL, so a fix built literally against `status_note` would pass its own AC and still miss it. Exposure is 4
rows, not 1. New second-order finding: `po-board-dedup-search.sh` shares the blindness — it prints NO MATCH
for `po_consolidation_ruling_20260728` while jq finds 4 non-terminal rows carrying it. (b) The stranded
`in_progress[]` row: block is VALID (`TASK-COWORK-MUTEX-001` is live at review[10]) so NOT cleared, but the
LANE was wrong → moved to backlog[] BLOCKED, freeing the board's only WIP slot, and `depends_on` ADDED because
the gates read `depends_on` while `blocked_by` is read by NO predicate in the repo.

**Verified, not inherited:** subsumed-by epic exists (backlog[208], BACKLOG) — my first jq said otherwise and
had a precedence bug; I re-ran before trusting it. AC-7 sampler PID 86980 still alive at 12h54m, 54 min past
its window, last CSV row 18:05:24Z.

### Carry-over
- **BATCH returned: PDFX UNBLOCK (ops) + UC-SDF-P2 (developer).** I RATIFY the 17:34Z po→ops re-route — AC-1 is
  a rebuild and infra is outside dev-pdf-extractor charter. Ops MUST kill PID 86980 and snapshot the 157-row
  CSV BEFORE AC-1: the loop re-resolves the container id, so it will follow the rebuild into the new container
  and contaminate the pre/post comparison AC-4/AC-6 depend on.
- **UC-SDF-P2 and `FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-…` are one root cause in two ready[] rows.**
  Reconcile or subsume before implementing. Archive checked by SUBJECT: no re-ship.
- **Row prose ceiling is now a triage blocker, not a nuisance.** 4 rows refused new evidence this tick (HPG 16B
  headroom, UC-SDF-P2 63B, the mutex row 20197B). I moved 4 fields verbatim to the decision journal rather than
  edit anyone's evidence, but rows that cannot receive corroboration silently stop accumulating it.
- Supervised-goahead: 6 candidates lack a `po_goahead_*` stamp (2 live: `FIX-RAG-COMPACTION-DISK-AMPLIFICATION`
  review/next_agent=po, `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58` done/next_agent=po). NOT stamped — each needs
  a substantive read and blind-stamping would be a fabricated go-ahead. Next tick.

## 2026-08-26T18:25Z — SECONDARY-Drain sign-off (1 row): BCTC-dormancy SPIKE closed + own ruling retracted

Journal: `docs/agent-memory/decisions/signoff-20260826T1825Z-po.md`. **DONE_VERIFIED 1 · mint 0 · correction 1.**
ONE `orch-apply` pipe (2nd attempt — the 1st was ABORTED by the prose-ceiling guard, live file untouched).
`.head` was already `idle`, never written.

### 1. The recommendation was right; its stated reason was already stale
`dev-mcp-server` recommended DONE_VERIFIED on 08-25 and correctly refused to self-certify (row reserves
close for PO, `supervised:true`). Verdict upheld — but one supporting claim was **falsified 24h later**:
"every post-fix `enrich_failed` termination lands at `reconcile_attempts` EXACTLY 8, the >8 outliers all
have `last_attempt<=2026-08-22`, never reprocessed — benign". HUT 2025-Q2 is at **11 passes, last_attempt
`2026-08-26 03:05:02`**, with a fresh BUG at 03:05:05 saying "after 11 reconciliation passes (cap 8)".
The measurement was true when taken; the *"benign / never reprocessed"* **inference** is what rotted.
Lesson: a review note's freshness is part of its truth value — re-measure any time-indexed "never happens
again" claim, don't inherit it. Evidence handed to `FIX-BCTC-VPSINGEST-REQUEUE-NO-RECONCILE-COUNTER-RESET`
(live, P1) — not a close-blocker, cap enforcement is not an AC of this SPIKE.

### 2. A null from a key that no longer exists is blindness, not evidence
The row's `close_caveat` demanded proof the mass-terminalised backlog **re-extracts**, not just that
`MAX(extracted_at)` advanced. Probing the two `report_id`s the caveat names returned `count=0` in
`bctc_layout_units` — which *reads* like "never recovered". It is vacuous: **both ids are gone from
`financial_reports` entirely**, so the query could not distinguish "not extracted" from "not asked".
Re-probed by `action_code`+period: 18 of 28 rows in the caveat's own 2024 cluster are now `done`, SHB
recovered all four quarters, `done=220` vs `enrich_failed=39`. Caveat satisfied, no false-green.
Same shape as `feedback_probe_aggregated_coarser_than_the_phenomenon` — ask what ELSE yields this output.

### 3. I contradicted myself inside 36 minutes, and the rationale never landed anyway
At 17:26Z PO wrote the correct fact (`devteam-eligibility.jq:232` unions `.depends_on + .depends +
.blocked_by`). At 18:02Z PO ruled the opposite — "no eligibility predicate anywhere reads `blocked_by`" —
by borrowing `FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE`'s conclusion about **`blocks`** (the
reverse edge, genuinely decorative) and pinning it on **`blocked_by`** (live to all four pickers). Acting
on it would invite *stripping* `blocked_by`, silently releasing real dependencies. Retracted in
`triage-20260826T1737Z-po.md#5b`. Two things fell out: the cited key `po_ruling_20260826T1802Z` **was
never written to orch-state** (`grep -c` → 0) — actions landed, rationale did not; and the inline fix was
refused by `orch-row-prose-ceiling-check` (11865B→13787B vs 12000B), so the text went to the cold store
whole and only `detail_ref` was re-pointed. The guard was right both times.

## 2026-08-28T22:47Z — Step 1 PO Triage (dev-team tick): inbox 43→0, 11 mints, 3 cancels, 7 folds, 2 rulings

Journal: `docs/agent-memory/decisions/triage-20260828T2247Z-po.md`. **DONE: 3 cancels (idle-chain dup family) · mints 11 · folds 13 · rulings 2 · inbox drained 43→0.**

### 1. BATCH returned to dispatcher (11 FIX items + 1 manual-dispatch fold)
FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT (P1 apps/mcp-server/, dev-mcp-server, +behavior_predicate), FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE (P1 multi), FIX-CHEF-EVENING-L2L3-SILENT-GAP (P1), FIX-CHEF-EVENING-BIZCTX-NULL (P1), FIX-BCTC-DATA-GAP-FAMILY (P1 multi), FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR (P1 multi), FIX-PREPUSH-SIZELINT-6-OFFENDERS (P1 multi), HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD (P1), FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY (P2), FIX-COWORK-FANOUT-LOAD1MIN-COMMA-LOCALE-PARSE (P2), FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1 (P2) + sweep fold FIX-TRIAGESIGNALS-PIPELINEA (P0, agent-father). needs_architect=true on 4 (multi-zone), false on 8.

### 2. Rulings
(a) INCIDENT_CAP shares WIP≤2 by deliberate design (devteam-eligibility.jq L115-118 no claimed_by filter, documented L153-157) — no carve-out, folded onto FIX-RLC-SHARED-WIP-BUDGET + po_ruling_20260828T2247Z key. (b) Idle-chain family: TASK-DEVTEAM-IDLE-CHAIN-2/-4/-5 all cancelled as duplicates (survivors P1A-MAIN-ROTATION/TEST-FAIRNESS/TEST-DURABLE all DONE_VERIFIED) — moved backlog→done with rulings. (c) code-janitor system-issue = ACK-WITH-CORRECTION (writer active via agent-father keep-cycle).

### 3. Folds (no new rows)
CLEAN-NOTEBOOK-BYTECAP-3-FILES (18 notebook/ctxbloat envelopes), CLEAN-CTXBLOAT-DISPATCH-CLAIM-SKILL (1), FIX-CYCLE-SNAPSHOT (4 cowork-fire occurrences, over-ceiling → journal), FIX-TNB-NOTEBOOK-UUID (uuid WARN), FIX-CHEF-DEGRADED-FLOOR (convergence dup-key), UC-CDC-P1 (calendar_status), DECIDE-TEAM-TOOL-RECHECK (correction). 3 sweep-guard bare-commit warns → pendingObservations (escalated=false, prior_warns 0/1/2 → threshold 3 watch). 2 audit-handoff envelopes (same file) → Step 0-TNB ACK appended.

### 4. Over-ceiling guard lesson (this tick, same class as 2026-08-26)
Two fold targets (CLEAN-NOTEBOOK-BYTECAP, FIX-CYCLE-SNAPSHOT) are at/over 12000B — appends hard-reject; fold evidence went to the decision journal instead. The 18 notebook/ctxbloat envelopes' fold record lives in the journal, not the row — the row's files[] + dedup_key already cover the subject so no re-mint risk.
