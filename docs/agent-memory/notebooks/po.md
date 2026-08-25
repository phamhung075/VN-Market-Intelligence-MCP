# PO Notebook

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
