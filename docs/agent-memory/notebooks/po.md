# PO Notebook

## 2026-08-26T01:16-01:24Z — The row was blocked on a measurement its own fix never needed

Journal: `docs/agent-memory/decisions/triage-20260826T0116Z-po.md`.
**3 minted · 1 unblocked+rerouted · 2 closed · 3 folded · inbox 16→0 read back off disk.**

### The gate was real, it was just the wrong gate
`FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` was not waiting on adjudication with no blocker
recorded — `blocked_by` was null but `depends[]` and `blocked_reason` both named the ops B1-B4
measurement. The mistake was mine from 08-24: I serialized two independent questions. Whether the
container idles safely (measurement, ops) and why the Paddle rescue grows with fire count
(structural, readable at source) never depended on each other. 18 days lost to that ordering.

### Read the source and the answer was one missing keyword argument
`main.py:154` builds `ProcessPoolExecutor(max_workers=1)` with no `max_tasks_per_child`, so its one
child is immortal for the container life. `ocr_worker.py:207-208` justifies caching a global
PaddleOCR inside it: *"process lives for the duration of the ProcessPoolExecutor; safe to cache
here."* The premise is true. The memory conclusion drawn from it is the bug — immortal worker means
an arena never returned to the OS. And **both** malloc_trim(0) calls are wired only into PID 1
(`pek_run_helper.py:133`, `routes_extract.py:112`); the executor child has zero mitigation. That is
why fire-count growth survived the malloc_trim fix. Recycling reclaims 100% of the address space
without anyone ever identifying the leak. `python3 -V` in-container = 3.12.3, so the kwarg exists.

### Two fallbacks, and only the one that must classify is broken
The confidence discriminator failed because `AutoFallbackOcrBackend` has to tell broken from
legitimately-sparse at a ~0.4% base rate. But `ocr_worker.py:455-495` already ships a different
rescue: fire below `LOW_TESSERACT_PAGE_CHARS`, keep whichever output is longer. It never classifies,
it only compares — a false fire costs latency, never correctness. The bounded rescue the user asked
for is already written. Only memory stands between it and production.

### The restart-hides-it trap, and the claim that was false in the other direction
Four envelopes were one DB-corruption incident. The cowork-team envelope warned that restarting
mcp-server makes the symptom vanish while the tree stays corrupt, and that this is probably how
07-19/07-30/08-06 were each falsely closed. mcp-server had restarted 36 min before I looked, so live
`quick_check = ok` proved nothing on its own. Running the same check against the preserved 00:31Z
snapshot **did** report Tree 96 + Tree 180 damage — instrument non-blind, live ok is real.
But the ops recovery commit says *"no uncommitted data lost"*, and that is false: live vs snapshot,
`intraday_foreign_flow_5m` 137,890 vs 150,095 = **12,205 rows gone**, `evidence_fragments` max id
1509 vs 1563 = **54 gone** — exactly the writes the incident report logged as having *succeeded*.
The snapshot evidence_fragments b-tree is intact, so those 54 are recoverable **until it is pruned**,
and five older corrupt snapshots already sit beside it as prune bait. P0 to ops.

### Carry-over
- `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` → ready[1], architect. Burst verification is
  market-hours gated to ≥09:00Z; design+impl are not.
- `FIX-MARKETDB-20260826-RESTORE-DROPPED-...` → ready[0], ops, P0. Time-decaying: snapshot must not
  be pruned before AC-1/AC-2 close.
- Corpus sweep row is deliberately `BLOCKED`, not READY-with-a-warning — pickers are blind to prose
  `status_note` and have auto-claimed a contraindicated row before.
- Prose ceiling (12000B/row) fired on my first transform and was right to. Shed four superseded PO
  fields to the cold store instead of splitting the write; hot file got smaller, not larger.


## 2026-08-25T21:44-21:56Z — The row that says over-ceiling rows are unbumpable is itself 486 bytes from becoming unbumpable

Triage of 20 envelopes. Journal: `docs/agent-memory/decisions/triage-20260825T2144Z-po.md`.
**4 minted · 16 folded/deferred · 1 AC ruling · 1 manual-dispatch stamp · inbox 20→0 read back off disk.**

### The archived row told me it was not a duplicate, in its own words
`FIX-PDFX-OCR-ORIENTATION` went DONE_VERIFIED at 21:14Z and cold-evicted minutes later — invisible to
any hot-lane dedup. Grepping the archive by SUBJECT found it, and its own AC-6 note does the work:
page-image leg WIRED, text leg **structurally cannot be** from that zone (`pdf-extractor` opens
`market.db` mode=ro by design), and it names `pdfOcrWorker.ts::ocrOnePage` as a FOURTH site it did not
know about. I verified at source anyway — `:93` pipes `pdftoppm` into `tesseract … -l vie+eng` at
`:103`, no `--psm`, so psm 3 (layout, not orientation). Reached from `composition-root.ts:101` on every
mcp-server start. **The archived row did not fail to fix this; it filed it.**

### An AC no work can satisfy is not a high bar, it is a park
QA asked me directly: accept the fixture proof for AC-4, or hold. Holding was unreachable — the
done[]-origin arm fires only when the union's oldest happens to be done[]-origin, and the current
oldest is review-origin. No commit changes which row is oldest. But accepting outright would launder
"not yet seen live" into "verified live". Split it: **code claim certified** on the fixture re-run
against shipped code; **durability claim explicitly not certified**, carried as a bounded 72h watch.
What made accepting safe is AC-6 — it removed the silent swallow, so the residual risk is now a
*detectable* miss rather than an invisible one. Detectability was the missing property all along.

### Wrote a 1,879-byte ruling onto a row with 148 bytes of headroom
`verify_note` is in `STRUCTURAL_FIELDS`, so the prose ceiling does not measure it. A `status_note`
append would have hard-rejected the entire write, including the four mints in the same transform.

### The sweep is blind to its own most-discussed candidates
Manual-dispatch Step 2 aborted on candidate #1 (34589B → 35314B). #2 has 323 bytes against a ~700-byte
stamp. Third recorded occurrence, deterministic. The write then told me the scale: **19 rows on this
board are already over the 12000B ceiling**, and the sweep can stamp none of them — so its blind spot
is exactly the set of rows that accumulated the most discussion. Fell through to
`FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE` (P0, stale-flagged 7.7h, never dispatched). Logged the
instance on the row that owns the defect, in ~250 bytes, because that row has 486 left.

### The caller's ownership premise was wrong and the right answer minted nothing
`CHORE-PRUNE-SPRINT-COWORK-…` targets `-agent-father.md` (widened to `-qa-21.md`), **not** `-qa-29.md`.
But the standing DEFER policy settles both breach envelopes anyway: the sprint is `active` and QA wrote
into that journal minutes ago. And `ls` shows **90+ roll-forward journals for this one sprint** — each
rolls at the cap by design, so a per-file CHORE would mint one row per roll forever.

### Traps avoided
Never used the `echo "$json" | jq` idiom for the CLEAR — ids to a file, `--slurpfile`, and a pre-write
check that `unmatched_new = 0` so nothing landing mid-triage could be dropped. Supplied
`ORCH_APPLY_CALLER_BASELINE_HASH` on both writes to close the CAS window. Truncating a dedup search
with `head -40` hid `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` at `ready[100]` on the first pass;
re-ran untruncated before ruling it a distinct direction.

### Carry-over
- `FIX-MCPSERVER-PDFOCRWORKER-…-4TH-OCR-SITE` P0 → dev-mcp-server. **Must land before**
  `FIX-REFINEBCTC-SKIPSET-NO-STATUS-FILTER-…`; skip-set alone re-fails the same rotated pages.
- 905e32be1 is **landed but NOT deployed** — `/app` is baked into the image.
  `OPS-MCPSERVER-IMAGE-PREDATES-REAPER-FIX-9-COMMITS-13H-STALE` (P0, ops, DRS-stranded) is the blocker.
- `FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-…` → qa for the 7/7 flip; 72h watch is on me.
- Still open on me: `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` (review[], BLOCKED, next_agent=po).
- User's BCTC goal: the confidence-mask row is live under dev-pdf-extractor; this tick added the
  stored-text leg. Neither reaches production until the image is rebuilt.

## 2026-08-25T19:37-20:00Z — Two "confirmed" findings inverted when I checked the wiring instead of the age

Triage of 15 envelopes (6 re-delivered from the 18:5xZ run that died on ENOTFOUND).
Journal: `docs/agent-memory/decisions/triage-20260825T1937Z-po.md`.
**3 minted · 2 promoted · 1 adjudicated (sign-off REFUSED) · 7 folded · inbox 15→0 read back.**

### The envelope told me which finding was real. It was wrong.
A dev-team correction refuted 3 of 4 stale findings and kept polymarket as "the ONE real find" —
55.9 days against a 0.5h cadence, and market hours cannot explain 55.9 days. True, and irrelevant:
`predictionTools.ts:10-18` records **architect RULING: RETIRE, 2026-07-31**, ISP-blocked by France's
ANJ regulator, `predictionMarkets.enabled: false`. The last fetch (2026-06-30T22:02Z) predates the
ruling by a month. 4/4 false positives. The lesson is not "verify the refutation" — the refutation
was right about its three. It is that **an age is never evidence of a defect until you know whether
the source is supposed to be running.**

### The guard I was asked to add already existed, two lines below the compare that failed
The brief's root cause was "B-01..B-13 has no trading-calendar guard, route it through
vnTradingCalendar.ts". `flow/main.md:425` already says "Skip foreign-flow check outside VN market
hours"; the next bullet already points at the calendar-aware script; the runbook already lists this
under "False-positive patterns"; system-map already sets `market_hours_only: true`. Three guards,
all bypassed. Had I taken the premise I would have shipped a **fourth prose instruction into an
LLM-executed flow** and called it a fix. The real gap: `market_hours_only` is declared on **1 of 28
sources** while ssc-iboard and yahoo-finance share the identical 0.25h cadence. AC-1 now forbids the
prose fix explicitly.

### The tool the flow doc names does not carry the field it says to read
Auditor said 12/28 sources lack a queryable `last_fetch_ts`. `get_pipeline_health` — the instrument
`main.md:423` designates — returns per-TICKER OHLCV and **zero of 28**. The other three tools are
keyed by signal-type and service name, never source id. I minted the row asking for the real count
rather than swapping one unverified number for another.

### The read-back the router ordered is the only reason the CLEAR was honest
Step 0-SIG's documented block died on `echo "$json" | jq` under zsh (2 of 15 payloads carried
escapes). `orch-apply` refused the write, but the block's `|| true` swallowed it — I would have
reported clearing 15 envelopes that never cleared. Occurrence 4 of an already-open P0. That
instruction is not in the doc, and **AC-4 on that row is what makes it structural rather than
dependent on whoever dispatches me.**

### Refused a sign-off that read as correct on every individual branch
The resume-key keepalive renews on `not outer_claim.claimed` — i.e. it renews the very lock whose
absence WF-4's own comment names as its safety net, while `resume_attempts` increments only on the
success branch. Dead-but-once-committed agents strand a WIP slot forever; `commit-convention.md:78`
makes the required `Task:` trailer the common case, not an edge one. Direction upheld, bound added,
P0. Every branch reads fine in isolation — that is exactly why control-flow inspection was not
enough.


## 2026-08-25T18:15-18:30Z — The signal was right. It was also too cautious in one direction and too broad in the other.

Triage of 22 envelopes. Journal: `docs/agent-memory/decisions/triage-20260825T1815Z-po.md`.
**2 minted · 7 folded/widened · 0 duplicates · inbox 22→0 · head IDLE.**

### I read the pages myself, and that is the only reason I found the extra half
A cowork-team CRITICAL said BCTC pages are OCR'd upside-down. I checked the mechanism (3 sites,
`use_angle_cls=False`, premise comment intact), then read the DB through `get_bctc_page_text` rather
than trusting any RETURN. p60 decodes to `Dau tu, xay dung va kinh doanh bat dong san`; p67 the same
shape. 36 pushed, 11 DONE, 25 FAILED — the report finalizes 11/40, **marked complete**.

Then I checked the cluster the signal explicitly refused to attribute. **p11 and p34 are also 180°
rotated** — and unit-0007's own flag has said `..._upside_down_or_encoding_error` since 08-24T09:04Z,
a day before anyone raised a signal. But **p41 is clean**. So the 08-24 cluster is two populations,
and the signal's caution was right in kind, too broad in scope. Its own count was one unit generous
the other way (unit-0026 is prose-mismatch, not garble). Verified: 11, not 10, not 25.

### The leg nobody named
`get_bctc_page_text` serves `source: "sqlite_ocr"`. **The garble is already persisted.** Fixing the
constructor re-reads nothing. So it is three legs — generation, stored-text invalidation, retention —
and orientation+skip-set *both* landing still recovers zero units. That is AC-6 on the new row.

### Sequencing: orientation first, and not only because it is bigger
The recall-proxy cycle asks whether any proxy separates broken from legitimate regions. A 180° read
scores **high precision and high coverage** — the engine reads flipped glyphs confidently. Rotated
pages inside its frozen "broken" sample are unseparable by construction, so it would return a
correct-looking "none does" **for the wrong reason** — which is the answer I already expect, so the
wrong reason would never surface. Re-freeze that sample after orientation lands.

### Ranked the TTL bug at ready[1] because it fires on the row above it
`resume_key ttl=3600`, no heartbeat. The 16:37Z tick landed inside a live 7m50s window today. The
only thing that stopped a duplicate was the router knowing out-of-band that the process was alive.
The P0 I just minted is a multi-document OCR bench that will again run >60min. The guard is scheduled
to fail on it.

### Traps hit
The 17:00Z CLEAR **provably never landed** — 4 envelope_ids re-delivered verbatim while their files
sat in `processed/`. A failed CLEAR is not free; it costs a whole duplicate triage pass. Read ids
from the file, never an `echo`-piped variable. Separately, `orch-apply` hard-rejected me **twice** on
the prose ceiling (fail-loud, live file untouched); fixed by consolidating three 08-24 fold blocks
into one with a git pointer — not by `orch-backlog-stub.sh`, which would have stripped the P0 I had
just minted.

### Carry-over
- `ready[0]` orientation P0 → dev-pdf-extractor. `ready[1]` TTL P1 → agent-father, **needs hand-dispatch** (off DRS allowlist).
- Two ready[] rows I folded into are unreachable by any picker (`dispatch_lane: null` + off-allowlist `next_agent`). Next promote review.
- Still open on me: `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` (review[], BLOCKED, next_agent=po).
- User's BCTC goal: **first ready path in days** — orientation is verified, bounded and recoverable.


## 2026-08-25T23:23-23:36Z — 29 envelopes, 12 real subjects, and a detector that cannot tell "closed for the night" from "dead"

Triage of 29 envelopes. Journal: `docs/agent-memory/decisions/triage-20260825T2329Z-po.md`.
**1 minted · 9 rows folded onto · 1 deferred · 0 lane moves · inbox 29→0 read back off disk.**
(Appended at the FILE END, not the top — this file is newest-at-top, but the tick spec mandated
`printf >>` and I would not full-overwrite a notebook to fix ordering. Heading carries a real
timestamp so the pruner can still rank it.)

### The auditor cannot read a crontab
Five `cron_fire_gap` STALE signals, "overdue 13.8h" against thresholds of 0.1-0.4h. All five are
`*/N 2-8 * * 1-5` in `cronConfig.ts` — VN market hours, weekdays. Their last runs at 08:45-08:55Z
are the last **scheduled** fire of the day. Not one was overdue by a second. A-29 computes overdue
as `now - last_run`, which is only meaningful for a continuous schedule; every windowed cron on the
fleet goes false-CRITICAL the moment its window closes, nightly, forever. That is a different bug
from the host-suspension one `FIX-A29-CRON-GAP-NO-OUTAGE-WINDOW-DISCRIMINATOR` was minted for, so I
widened that row to two discriminator axes rather than mint a third.

### Reading the schedule is also what stopped me over-refuting
The 6th cron signal in the same batch, `commodityTrackerRefresh`, looked identical. It is
`0 6 * * *` — continuous daily. `now - last_run` IS sound there and it genuinely missed one fire.
Same evidence source, opposite verdict. The discriminator is the cron expression, never the
"overdue" number, and never the batch it arrived in.

### The row I could not append to is itself the finding
`FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL` owns exactly the schedule-blindness axis and
was the natural fold target. It sits at 15580 prose bytes against a 12000 ceiling — grandfathered,
so it survives, but ANY append hard-aborts the whole orch-apply write. Second tick running that a
correct fold has been blocked by prose weight. I pre-measured all 10 touched rows before piping;
that is the only reason this batch landed on the first attempt instead of aborting.

### Routed, did not decide
The `effective_next_agent` envelope: `parse_ts` returns null by design for a missing stamp, so
`($board_ts != null) and ($detail_ts != null) and ...` is unsatisfiable when the detail item has no
`updated_at` — the board branch is structurally unreachable and the stale archived value always
wins. The signal blamed "a board edit without an updated_at bump"; that is falsified, all 10
divergent rows have good board timestamps. I could not reproduce its 11/73-of-105 either: I measure
**10 live divergences and 72 of 104** routable detail items. Reported mine. Three directions go to
architect unranked — picking one is a fleet-wide routing-semantics call, not mine.

### Carry-over
- `backlog[588]` FIX-EFFNEXTAGENT-NULL-DETAIL-TS → **architect, needs hand-dispatch**. It is
  DRS-eligible but has 63 P0/P1 allowlist rows ahead of it at ~1 dispatch/tick.
- `ready[33]` CLEAN-NB-... still unreachable by any picker (`dispatch_lane: null` + off-allowlist
  `next_agent`). 4 notebooks; `tran-ngoc-bau.md` is now only 860B over and is the cheap win.
- DEFERRED, not triaged: `bctc_vps_queue` id=255870 BID Q4-2025, 0 attempts since 2026-04-28. WARN,
  no board coverage found. Flow rule says re-verify next tick before minting. Do that.
- `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL` and `FIX-A29-CRON-GAP-...` now overlap by
  construction. Merge or close one before either is worked.

### Addendum — the two mandatory pre-checks (run after the drain, not before)
- supervised-goahead: **no-op**. `.head.status=idle`, `.head.active_task_id=null`, so WF-2 evaluates
  no row and nothing is held. 20+ other rows are `supervised` with no `po_goahead_*`; the sub-flow
  says explicitly not to pre-emptively stamp those, and I did not.
- manual-dispatch-sweep: **146 candidates** (107 DRS-stranded, 37 backlog-XOR, 2 ready-XOR, 5
  re-admitted). #1 `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED` is STILL unstampable at
  34450 prose bytes — 2nd tick in a row it wedges its own sweep. Fell through to #2, P0 CI-RED
  `FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-...-DANGLING-IDS` (11232B after stamp, landed and read back).
  It was `reflag=true`: previously flagged, stamp went stale, i.e. its earlier BATCH never dispatched.
  `next_agent=agent-father` is off the DRS allowlist → router hand-dispatch only.

### Addendum 2 — Step 0-TNB c136: the audit asked me to mint a row that already exists
TNB c136 (Overall CRITICAL) finding #2, HIGH: chef-evening `last_fired` frozen through all of
2026-08-24 despite a genuine fire+publish, and today's 19:45Z dispatch (8fda9e649) read the stale
field and concluded "2d gap closed". The handoff says "No existing row found after targeted grep —
po to triage/mint". **False negative.** `FIX-COWORK-LASTFIRED-NO-STAMP-ON-A-GENUINELY-DELIVERED-FIRE`
was minted at 21:53:13Z, ~1h20m AFTER that audit cycle ended. Folded the c136 evidence there as the
reproduction fixture; ACK written into the handoff naming the grep failure mode and pointing at
`po-board-dedup-search.sh`. Second time today a `grep` on orch-state.json produced a wrong dedup
verdict — this one would have cost a duplicate P1.

## 2026-08-26T01:48-02:00Z — The dirty worktree was never dirty, and the correction was already answered

Journal: `docs/agent-memory/decisions/triage-20260826T0137Z-po.md`.
**0 minted · 5 folded · 1 row consolidated 34450B→4949B · 1 refuted · inbox 2→0 read back off disk.**

### `git status` in an orphaned worktree cannot answer "was this salvaged?"
`RECOVER-ORPHANED-WORKTREE-AGENT-AE9ED2CD6F04B3686` carried a fold from 08-24 saying, in bold, that the
sibling `CLEAN-SALVAGE-...` row reads DONE_VERIFIED but the work is *not* drained — 8 dirty paths still
in `git status --porcelain`. That premise is false and the error is mechanical: a worktree computes
status against **its own HEAD** (4a6d2174c, 08-12). The salvage copied the content into main and
committed it there without touching the worktree index, so it reports dirty forever, whether or not the
work landed. `cmp` on all 6 work-product paths: every one byte-identical to main. The untracked test file
is git-tracked in main. Landing commit `28f8509fc` names both row ids in its own message. The
DONE_VERIFIED verdict was right; the row that was minted 11h *before* that commit went stale in silence.
Same shape as trusting a clean `git show --stat`: outcome-blind. The discriminator is a content diff.

### And the row whose code already shipped was queued for a requirements spec
That same salvage implements `FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG`, which sits in
`ready[]` with `next_agent=ba`. Its AC-1..AC-4 are all runtime-verification criteria. I did not flip it to
qa — qa is off the DRS allowlist and the flip would have stranded it with no picker. Told ba instead.

### The correction was honest, stale, and already answered
The peer withdrew two of its own claims about the market.db corruption — both withdrawals are right, and
the writer-defect steer it retracts is *my own* fold item (1) from 01:16Z, now superseded. But the
envelope re-asserts −12205 as real lost rows; it is 3917, the other 8288 are PK-duplicates and *are* the
corruption. And its one open test — is the damage tail-localised, in-flight fault or bit-rot — was
answered by the architect brief committed at 00:56Z, **42 minutes before the envelope was filed**:
non-atomic multi-page-commit fingerprint, explicitly not disk scatter. Corroborated, not open. No dispatch.

### The load-bearing item was the third bullet, not the correction
`CLEAN-MARKETDB-FORENSIC-COPIES` is P1 on a 95%-full volume, so it can fire any time. Its AC-3 says do not
delete a copy a still-open row cites — but it was written 08-24, names no file, and the snapshot two open
rows depend on did not exist yet. A generic "check first" is only as good as the agent remembering to.
Named the file, named both dependents, named the release condition.

### A P0 that could not be stamped because it was too fat to touch
Top of 145 manual-dispatch candidates, and `orch-row-prose-ceiling-check` rejects net-new growth on an
over-ceiling row — 34450B vs a 12000B ceiling, so the stamp itself was unappliable. Consolidating was not
a workaround, it was the fix: of its 6 ACs, one type had shipped, two were dead, AC-2 was obsolete (no
`$routed` array exists any more, the guard parses the tables) and AC-4 had shipped (wired at
`.github/workflows/ci.yml:556-602`). Re-measured: 4 different types unrouted now, 6 live rows. Third
rotation of this namespace. The real root cause is that the catch-all routes an unknown type to its own
`to` field — for `to=po` that hands the signal back to the step that could not route it.

### Carry-over
- `FIX-PO-TRIAGE-SIGNALS-...-UNROUTED` → P0, agent-father, stamped + folded into BATCH. Scope is now 4 ACs.
- Supervised-hold `should_hold=true` on `FIX-PDFX-...-HEADROOM`: **not** ratified — architect is producing
  the very deliverable the checkpoint gates. Self-heals when the brief lands. Do not re-derive.
- TNB c136 outage findings deferred a 3rd tick. Dedup says covered; no fresh ACK block appended.
- Push backstop skipped: standing disarm, and `FIX-PO-PUSHBACKSTOP-FLOWDOC-INSTRUCTS-PUSH-AGAINST-STANDING-DISARM` is open.

### Correction to the carry-over above, same tick (02:03Z)
I wrote that the supervised hold "self-heals when the brief lands" as though that were future. It is not —
the brief landed **during** this tick: `docs/architecture-briefs/2026-08-26-fix-pdfx-parent-process-memory-
burst-headroom-worker-recycling.md`, 19445B, commit `bc68809ba` at 01:53Z. The row then moved
`in_progress[]` → `ready[]` (router, 01:56Z), owner/next_agent now `dev-pdf-extractor`, and `.head` went
idle. I did **not** stamp `po_goahead` even though the deliverable now exists and is verifiable, because
`supervised-goahead.md` Step 1 is explicit that WF-2 evaluates only the row `.head.active_task_id` names,
and its own note forbids pre-emptively stamping rows that are not currently head. Next PO tick: this row
is ratifiable on sight — the artifact exists, the commit is real, and the implementability claim
(`main.py:154` builds `ProcessPoolExecutor(max_workers=1)` with no `max_tasks_per_child`; in-container
`python3 -V` = 3.12.3 so the kwarg exists) was already verified at source on the 01:16Z tick. Do not
          re-derive it; just confirm the brief still matches and stamp.
Note it is also now a READY-XOR manual-dispatch candidate (`supervised=true`, `plan_only=false` — exactly one).
