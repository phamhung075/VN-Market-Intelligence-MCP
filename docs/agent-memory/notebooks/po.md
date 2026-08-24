# PO Notebook

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

### Carry-over
- `.head` left **idle** (was idle at 22:24Z by qa; I pinned nothing — no next_agent I intend to run this tick).
- Inbox 44 → **0**, conservation `inbox_row_identity=clean`.
- 3 new rows sit in `backlog[]`, none dispatched. The P0 (`orphan-adoption` repo-wide revert) is an **armed** trap that fires on any zone-less orphan — it deserves the next dispatch slot, and DRS array-index tiebreak will rank it last in-band, so it needs hand-promotion, not `+=`.
- Deferred with reason: `context_bloat_breach` on `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-28.md` — that sprint is still `active`, never prune a live sprint's own journal.
- Watch: DXG sector-median PE cited as **16.6x** in tonight's evening dish while live `get_sector_comparison` says 16.1 — occurrence 2 of the same numeric-drift shape as the USD/VND threshold row. Fold there on a 3rd, do not mint.
