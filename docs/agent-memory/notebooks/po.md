# PO Notebook

## 2026-08-24T23:55Z — 4 envelopes → 1 mint, 3 folds; the briefed dedup hit was the WRONG row

Busy-tick triage (dev-team S2 bypass). Inbox read fresh as SSOT; all 4 envelopes routed; CLEAR landed (`inbox_count=0`, `_updated_by=po`).

### The dedup lesson, again — verify the row is ABOUT the thing
Caller briefed envelope 4 (`context_bloat_breach` on `.claude/skills/notebook-write/SKILL.md`) as colliding with `FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-...`, disposition DEFER. That collision is real but **incidental** — the file is item 3 of 4 in that row's `files[]` only because the row documents the prune contract; it will never shrink the file. Proof: the developer working it grew the file 262L→265L at 23:45:23Z. The real coverage is `CLEAN-CTXBLOAT-NOTEBOOK-WRITE-SKILL-215L-OVER-200L-CAP`, carrying the exact canonical `dedup_key context_bloat_breach|file:...`. Same conclusion (no mint), different row — folding onto the autoprune row would have buried the breach permanently. Matches `feedback_auditor_dedup_citation_resolves_to_nonexistent_row_id`: resolve by SUBJECT, never by an id someone handed me.

### Answered the caller's open question (the 1205 cap)
Not a literal — grep can never find it. `upper = baseline + max(baseline/10,5)` computed in `scripts/audits/size-lint-justification.sh` cmd_check; baseline `1096` lives in `docs/data/size-lint-baseline.json` under **`.entries[...]`** (a top-level jq probe returns nothing, which is why it looked absent). NOT in `file-size-caps.json` — different registry. 1096+109=1205, actual 1206.

### Two guards caught me; both were right
`orch-apply` aborted twice with **zero** writes: once on a shell-quoting break (apostrophe closed my single-quoted jq — fixed by moving the program to a file), once on `orch-row-prose-ceiling-check`. The second is the interesting one.

### manual-dispatch-sweep cannot stamp its own top candidate — occurrence 3, NOT a new finding
I nearly reported this as novel. It is not: `FIX-PO-MANUAL-DISPATCH-SWEEP-STAMP-REJECTED-BY-PROSE-CEILING-ON-ITS-OWN-TOP-CANDIDATE` was minted 11:00Z today and folded at 20:44Z. **I only caught it because I opened a prior tick's decision journal for formatting** — my board dedup scans had all missed it. Folded as occurrence 3 (occ 2→3) with new quantification: 3 of the 8 P0 DRS-stranded candidates are unstampable, all three PO-triage-infrastructure rows. The sweep orders by `[rank, idx]` with no size term, so the more often a stranded row is re-triaged the fatter it gets and the more certainly it wedges — self-reinforcing starvation. On the worst offender `status_note` **alone** is 15085B, larger than the whole ceiling, so only a `detail_ref` migration unblocks it; shrinking the ~308B stamp is treating the wrong side.
Per the 20:30Z precedent I fell through rather than skipping, and stamped `FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-...` (P0) — which is, fittingly, the very bug I sidestepped in my own CLEAR this tick.

### Same row: a reasoned reroute was silently reverted
`po_reroute_20260813T1629Z` moved `next_agent` agent-father→architect *specifically* because agent-father is off the DRS allowlist. Live row today reads `next_agent=owner=agent-father`, last touched `2026-08-23T18:07:40Z by po` **with no note explaining it**. So a P0 that had been given an automated picker was pushed back to having none. Not minted this tick (out of triage scope) — flagged to caller.

### Self-disclosure
My fold onto `FIX-TRIAGESIGNALS-PIPELINEA-...` consumed most of its remaining prose headroom (it sat at 11501/12000B). Caught it, trimmed the note 432B→148B across two corrective writes. Lesson: **check a row's prose headroom before folding, not after** — on this board, folding is a scarce resource.

### Carry-over
- Envelope 1 (`bug-escalation`, `escalated=false`) → `pendingObservations[]` per flow doc. **That array does not exist** in orch-state or this notebook — the sink is fictional fleet-wide. Recorded here instead. Worth a row if it recurs.
- `head` went idle 23:45:23Z, `in_progress[]` now **empty** — next dev-team tick is an idle rotation, not a busy bypass.
- Known-live `FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP`: sidestepped the documented `echo | jq` CLEAR form. This tick's payloads had 0 backslash escapes, so the bug is **payload-dependent/intermittent**, not always-on.

## 2026-08-24T23:05Z — 44-envelope inbox → 3 real defects; signed off the BIZCTX P0 and split out its residue

Prior 22:22Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L). Full reasoning: `docs/agent-memory/decisions/triage-20260824T2258Z-po.md`.

### Signed off FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (P0, review → done_verified)
Gate: "a subsequent evening/morning dish, known_gaps WITHOUT `[gap:business_context_absent]` AND ≥1 conviction_call citing a product/customer/ops/mgmt fact — RAW-verify the JSON." The 19:49:27Z evening dish meets both. I refused to stop at the two-way match (`feedback_chef_fabricated_publish`): opened the cited source file — its `ops` field literally reads "ROE 16.7% dưới trung vị ngành ngân hàng 17.6%" — then ran an **independent live `get_sector_comparison(VCB)`**, which returned ROE 16.7% vs 17.6% and PE 14.1 vs 9.0. Four planes agree, so the citation is real. tran-ngoc-bau c134 had independently flagged the precondition as met (its Persisting-blocker #3 asked PO to run exactly this).

### The residue that would have been buried by a clean sign-off
The **EOD** dish (08:52Z) emits `[gap:business_context_absent]` **in the same run** that populates `conviction_calls[0].business_context_cited`. `chef-dish.md:702` defines `BIZ_CTX_OK = (≥1 call has business_context_cited != null)`; `:774` appends that token only when NOT BIZ_CTX_OK. Both landed 2026-08-14, **ten days before that run** — so a run cannot satisfy :702 and still take the :774 branch. The gate is *narrated* on the eod path, not evaluated from the array the same run just wrote. **Different defect from the wiring gap this row owned**, so: sign off the met P0, mint `FIX-CHEF-EOD-BIZCTXOK-GATE-NARRATED-NOT-EVALUATED` (P1) for the desync. Reopening a row whose stated criteria are demonstrably met is how P0s become immortal.

### Caller's inbox inventory was wrong in a way that would have cost 6 duplicate rows
Spawn prompt: "8 further cron_fire_gap WARNs at ~13.7h staleness". Live: **3** cron_fire_gap in the inbox, all from the 22:35Z batch. The other six are `.signal_queue.rows[]` at status READ from 02:4xZ and were already folded into `FIX-CRONS-FIVE-STALE-...` whose `dedup_key` is literally `cron-fire-gap-cluster-20260824`. Batches are ~19.9h apart, not 13.7h. **The ONE-STALL instinct was still right** and I wrote it onto the cluster row as the question to answer before producing eleven per-job verdicts — it just spans 11 jobs across 2 batches, not 8 envelopes in one inbox. Self-read the inbox; a caller's array is a convenience copy, never SSOT.

### 44 → 3 mints. The inbox's real shape is permanently-firing detectors, not missing coverage
17 of 44 were notebook-auto-prune fires across 5 files, all owned. Mints: `FIX-ORPHANADOPTION-TREEHYGIENE-EMPTY-ZONE-REPOWIDE-REVERT` (**P0** — unresolvable `task_zone` makes DoD-P15-1 run `git status -- <empty>` = whole repo then `git checkout --` on every hit; would have reverted 4 live peer files incl. the adopting tick's own preflight), `FIX-COWORKFIRE-TELEMETRY-SERVERCOMPUTED-FIELDS-FABRICATED-30PCT` (P2), `FIX-CHEF-EOD-BIZCTXOK-...` (P1). Everything else folded onto an owning row.

### Prose ceiling forced a filing decision, and "split the write" is not the escape hatch
The `signal_backlog` permanent-floor finding belongs on `FIX-SIGNAL-INBOX-NON-DRAINABLE-...` — that row sits at 11728B of a 12000B ceiling and the append HARD-ABORTED. The check's own message forbids splitting the write to dodge it. So I filed the finding as a labelled second section on the new cowork telemetry row instead of dropping it. **Measure prose bytes with the checker's own exclude-set before composing folds** — `tojson|length` overcounts badly (it includes `title`), and I nearly skipped two safe folds on that mismeasurement.

### I ran the push script against a standing user disarm. Reporting it, because the flow doc told me to and that is the actual bug
`push-backstop.md` says: ahead > 20, two guards clear (git-op in progress; commit-mutex held) → `bash scripts/fleet-worktree-push.sh`. I followed it at 23:09Z with ahead=117. **Neither guard, and no line in that doc, asks whether pushing is WANTED.** `com.vn-market.fleet-push` is absent from `launchctl list` because the user **deliberately disabled it** — `plutil -p ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` → `"Disabled" => 1` — and `FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED` says verbatim "NEVER re-arm ... Re-arming would push ~224 unpushed commits to origin/main unattended." The push was rejected by an unrelated red size-lint gate, so nothing reached origin — that is luck, not a control. **Absence from `launchctl list` is not evidence of death; check the plist first, and use `plutil -p` because the installed plist is BINARY and `grep -i disabled` reads as key-absent.** Minted `FIX-PO-PUSHBACKSTOP-FLOWDOC-INSTRUCTS-PUSH-AGAINST-STANDING-DISARM` (P1). **Disarming a timer while leaving a flow doc that hand-invokes the same script every tick does not implement the decision — it just moves the trigger to whichever agent reads the doc next.**

### Self-corrected a P0 I had minted 5 minutes earlier, before anyone picked it up
The size-lint red is real: `bctcScalarAggregator.ts` baseline=1096 upper=1205 **actual=1206, one line over**, traced to `28f8509fc`, the orphaned-worktree salvage commit belonging to a row that is **DONE_VERIFIED** — verified against its own ACs, never against the gate its diff had to clear. That finding stands (AC-4 generalises it). What was wrong was my framing: I called it P0 "117 commits stranded, push actuator aborting every run", when the unpushed backlog is **intended**. Re-priced P1 and **withdrew my own AC-3**, which had demanded `ahead` drop to 0 — i.e. it would have directed an implementer to do the exact thing the standing constraint forbids. **A wrong premise inside a correct finding is still an instruction someone will follow.**

### Carry-over
- `.head` left **idle** (was idle at 22:24Z by qa; I pinned nothing — no next_agent I intend to run this tick).
- Inbox 44 → **0**, conservation `inbox_row_identity=clean`.
- **5** new rows in `backlog[]`, none dispatched. Serial size-lint pattern confirmed live: the two prior blockers (tasksMdJanitorJob.ts, ocr_gateway.py) are now well under cap and this third tripped straight behind them — re-measure at fix time, never assume a prior pass. The P0 (`orphan-adoption` repo-wide revert) is an **armed** trap that fires on any zone-less orphan — it deserves the next dispatch slot, and DRS array-index tiebreak will rank it last in-band, so it needs hand-promotion, not `+=`.
- Deferred with reason: `context_bloat_breach` on `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-28.md` — that sprint is still `active`, never prune a live sprint's own journal.
- Watch: DXG sector-median PE cited as **16.6x** in tonight's evening dish while live `get_sector_comparison` says 16.1 — occurrence 2 of the same numeric-drift shape as the USD/VND threshold row. Fold there on a 3rd, do not mint.
