# PO Notebook

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

## 2026-08-25T17:40-18:00Z — I ruled YES on n=1. Document #2 killed it in 30 minutes.

Re-ruling my own 17:00Z decision. Journal: `docs/agent-memory/decisions/triage-20260825T1752Z-po.md`.
**Auto-mode OCR REJECTED · 2 rows CANCELLED→archive · 1 un-stranded from `in_progress[]` · 3 unspawnable rows repaired.**

### My rollback triggers fired before deployment
At 17:00Z I wrote "roll back on >10% rescue fire rate, or any cgroup hard-limit hit (baseline 0)".
On the second document ever measured: **46%** and **494 `memory.max` events**. A change its own
criteria would revert on day one does not ship. That was the whole ruling; everything below is why
it is not fixable by tuning.

### The metric measures the wrong thing, and the code says so itself
`_ink_coverage` divides ink-inside-word-boxes by **all** Otsu foreground in the crop — so the
denominator carries rule lines, shaded bands, seals, speckle: ink the engine was *right* to skip.
That term is issuer-styling, orthogonal to read quality. Hence FPT's legit-floor 0.674 vs DBC's
0.329 on two documents both read correctly. And `_recall_adjusted_confidence`'s own docstring
defends `min()` with *"a region read perfectly but only 34% covered … is rescued"*. DBC page 14 **is**
that region. The spec is wrong, not the implementation. At n=2 the bands already overlap — no
constant separates them, so retuning is arithmetically dead, not merely disallowed.

### Two things nobody had named
**Memory is superlinear in fire count.** 1 fire = +112 MiB / 0 events; 6 fires = +1493 MiB / 494
events. Residency cancels (PaddleOCR is constructed in both arms). If that is retention, *no* fire
rate is safe — a perfect discriminator still OOMs. `OCR_FALLBACK_THRESHOLD` is env-driven, so the
decisive sweep costs no code change and no rebuild. **The winner-pick can't protect the negative
control:** `paddle_conf >= tesseract_conf` compares two `min(precision, coverage)` scores, but
Tesseract's boxes are word-level and PaddleOCR's are line-level — coverage is biased upward by box
granularity alone, worst exactly where the rescue fires, ties going to PaddleOCR.

### Resolve numbers, don't average them
Dev's +3.8% vs qa's +54.9%: **struck dev's**. Not because two disagree, but because qa's *tesseract*
arm was faster while its *auto* arm was 44% slower — contention slows both, so the asymmetry is real
— and because ~8s/region from the valid lang=vi bench makes "one PaddleOCR page cost 4.3s total"
impossible. Then the harder call: my criterion #3 was **unmeasurable** on either dataset. Both are
single-fire measurements of a fire-count-dependent cost. Withdrew the criterion rather than score it.

### What I got wrong at 17:00Z
Four gates, none bounding the *generalization* claim or memory. Both that resolved did so on
FPT-only evidence. **The gate that saved this was not one I wrote** — qa chose to run a second
document beyond its brief. When a fix is tuned on a sample, "passes its ACs" is not a gate; the ACs
were written against that sample.

### Traps hit
`in_progress[]` has **no picker** — qa's CHANGES_REQUESTED move stranded the row *and* held a WIP
slot. But `orch-row-prose-ceiling-check.mjs` measures only backlog/ready/review and scores a row
arriving from elsewhere as `liveBytes=0`, so lane-moving a 13,965B row **hard-rejects**. Had to
shrink to 11,173B first. Also: `jq '{next_agent}'` renders an *absent* key as `null`, which is how I
"confirmed" archive rows carry `next_agent: null` — the validator caught it. Use `has()`.

### Carry-over
- `ready[0]` FIX-PDFX-TESSERACT-CONFIDENCE → dev-pdf-extractor, **measurement-only**, AC-0 memory
  sweep first. Row has 827B ceiling headroom — next writer must use `detail_ref`, not inline.
- Router's "13 unspawnable ready rows" = **over-count of 10**; `effective_owner` resolves them. 3 real, repaired.
- Still open on me: `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` (review[], BLOCKED, next_agent=po).
- Honest status of the user's BCTC goal: **no ready path**; one cheap, specific experiment would open one.
