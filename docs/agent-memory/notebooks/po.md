# PO Notebook

## 2026-08-26T02:22-02:38Z — Three handed-down premises, and the probe falsified two of them

Journal: `docs/agent-memory/decisions/triage-20260826T0228Z-po.md`.
**1 minted · 6 folded · inbox 4→0 · 2 caller premises corrected · TNB ACK #2 appended.**

### "20 telegram reports" is 101, and 80% are permanently unreachable
`read_telegram_reports(status="new")` → 20 rows, ids 5068-5087. `list_unresolved_reports()` → **101**,
ids 5068-5168. Same first id, so it is a LIMIT not a filter: default `limit=20`, Zod hard cap 50
(`limit:200` is rejected). Nothing is ever acked, so the head never advances, so ids 5088+ are
unreachable by PO's own flow-documented call **forever** — 81/101 = 80%; even at `limit=50`, 50/101.
That turns `FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE` from a noise bug into a *starvation* bug and
changes its fix shape: acking alone cannot fix it, one unackable head row re-starves the queue. Needs
paging, or point `telegram-reports.md:19` at the unbounded call. Never seen by any PO tick: C-01
`daily_ohlcv: 0 distinct codes` CRITICAL, A-32 `mcp-server 13h older code`, `orch-cold-evict exit 1`.

### The HPG row was not "waiting for qa" — its ACs are unsatisfiable as written
I ran AC-1 rather than trusting "impl landed 28f8509fc, only qa remains". `get_bctc_full(HPG)` at 02:2xZ,
33h post-impl: Operating Profit **0**, EBITDA **0**, `operating_cf` **0**, against a populated
`profit_before_tax` 10.762.183,84. AC-4's own trigger (`net_profit > gross_profit AND op_profit == 0`)
is satisfied exactly and it still only warns. The tell is one field down the payload:
`fetchedAt: 2026-06-07`, `refine_status: PARTIAL`. The served row is a **stored artifact from 11 weeks
before the fix**, and `28f8509fc` changed the *extraction* path — which by construction cannot reach it.
No AC asks for a re-extraction, so no amount of correct code can turn those ACs green. Re-disposed
BACKLOG / `blocked_by` cleared / `next_agent`→developer, **kept in `backlog[]`**: the ready-lane consumer
reads no prose, so lane placement is the only enforceable guard. Discriminator handed down, not guessed:
re-extract HPG 2026-Q1 vs. stale image (telegram 5163 says mcp-server ran 13h-old code — check that first).

### The row that says over-ceiling rows are unbumpable is itself unbumpable now
First apply ABORTED: 3 rows over the 12000B prose ceiling. Headroom measured —
cycle-snapshot **47B**, telegram 998B, HPG 1264B. Trimmed two to fit; the cycle-snapshot row took only
its `occurrence_count` 3→4 (free: one digit → one digit). Structural fields are exempt, which is why the
whole HPG re-disposition cost **zero** bytes and landed unconditionally — worth remembering, the escape
hatch is often the field you already needed. `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-
OVER-CEILING-ROWS` sits at 11810B/12000B: **the fix row cannot record its own recurrence without becoming
an instance of it.** I did not paste a 189-byte token to dodge that — the point is the self-sealing.

### AC-4 stopped being hypothetical at 02:05Z
The cycle-snapshot prior-day collision fired live: consumer looked up `cycle-snapshot-02:05.json`, HIT a
2026-08-25 file exactly 24h+0m old, ignored the valid 1-min-old `02:04` file beside it. Only the
consumer's own inside-the-file date check stopped 24h-old macro data being served as current. Two things
that upgrades: prior folds were all *misses* (degrade gracefully), this is a stale *hit* (does not); and
prune window (1440min) **==** filename period (1440min), so the twin is structural — prune by DATE, never
by a wider age. Full text is in the journal because the row would not take it.

### Carry-over
- **BATCH dispatched:** `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED` (P0, agent-father,
  off the DRS allowlist so no picker can reach it). `flow-defect` is a **5th** live unrouted type and was
  50% of this tick's inbox — both instances were high-quality router findings, not junk.
- **Did NOT satisfy:** the cycle-snapshot evidence never reached its row (ceiling); `CLEAN-NB-TRIM-BCTC-ANALYST`
  is measurably resolved (8715B vs a claimed 14162B) but I stamped it instead of closing the lane.
- **Verified moot, not relayed:** WF-2 `should_hold=false` on the PDFX head row (`supervised:null`, no
  `po_goahead*` on row or `.head`). Pipeline-B dashboard: 0 NEW.

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
