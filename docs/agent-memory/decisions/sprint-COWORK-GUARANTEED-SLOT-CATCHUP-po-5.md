# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 5)

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise (see orch-state sprint_goal.entries[COWORK-GUARANTEED-SLOT-CATCHUP]).
**Agent:** po
**Started:** 2026-08-01T03:00Z
**Continuation of:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-4.md` (rolled — BYTE_CAP breached at 37332/36000 bytes, 279/600 lines; see CAP-REACHED marker there)

---

### STEP po-S115 · po · 2026-08-01T02:58:55Z
**task-id:** FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST
**what-done:** Minted P1 row owning the BCTC acquisition defect behind the 19 period-mismatch refusals (ids 4244-4267); root cause RAW-verified at source — `listSscDocuments` (ssc.ts:85-90) has no quarter param, `fetchParseAndStoreBctc.ts:68` takes `docs[0]` unconditionally.
**what-considered:**
- Fold into FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT (what 3 prior ticks chose)
- Fold into FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T (11/12 tickers overlap that cohort)
- Mint a new row owning document SELECTION
**why-decision:** Board grep for listSscDocuments/docs[0]/quarter-blind returned ZERO rows; the detector row is in review/qa and cannot route a developer to ssc.ts. Detector-right/actuator-blind — the guard kept accruing evidence while the thing that must change had no owner.
**why-change:** Prior ticks declined to mint on "don't fragment one defect"; that held for an UNLOCATED defect, not for a pinned call site.

### STEP po-S116 · po · 2026-08-01T02:58:55Z
**task-id:** FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR
**what-done:** Ran manual-dispatch-sweep Steps 1-3 (38 candidates), stamped this P0 as top candidate and folded it into this tick's BATCH; added 2 corroborations, occurrence_count 4→6.
**what-considered:**
- Stamp top candidate only (sub-flow rule: exactly ONE per invocation)
- Skip stamping since WIP was 1 at sweep time
**why-decision:** Sub-flow mandates one stamp/tick regardless of WIP; head went idle at 02:57:29Z anyway, so the BATCH is dispatchable now.
**why-change:** no change from plan.

### STEP po-S117 · po · 2026-08-01T03:00:37Z
**task-id:** FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT
**what-done:** Added live proof-of-life note for qa (19 confident refusals = AC-2 satisfied verbatim, AC-3 inconclusive-branch explicitly NOT covered) plus `po_actuator_row_ref` redirecting future acquisition evidence to the new row.
**what-considered:**
- Add a 4th evidence block only
- Add evidence + explicitly re-scope the row to its own detector ACs
**why-decision:** Three prior ticks each appended acquisition evidence here without the row being able to act on it; re-scoping stops the accretion and unblocks qa signoff.
**why-change:** no change from plan.

### STEP po-S118 · po · 2026-08-01T03:0xZ
**task-id:** (ambient — TNB c121 ACK correction)
**what-done:** Corrected the 2026-07-31T23:04:15Z PO ACK on `docs/handoffs/tnb-audit-latest.md`, which answered TNB's "confirm c120's Telegram landed" by citing report id 4243 — but 4243 IS c121's own report, so it evidences c121's delivery, not c120's.
**what-considered:**
- Leave it (TNB already self-cured the file-plane issue)
- Correct it and record the git-verified file-plane finding
**why-decision:** Using a message's own arrival as proof that a DIFFERENT earlier message arrived is a non-sequitur; leaving it would let a false "verified" close the loop.
**why-change:** no change from plan.

### STEP po-S119 · po · 2026-08-01T03:56:29Z
**task-id:** FIX-SWEEPGUARD-SAMEFILE-HUNK-PATHSPEC-ONLY-SEMANTICS-NONGOAL-AND-DETECTOR
**what-done:** Rejected dev-team's "expected/correct behavior, not a bug" read of the first SAME-FILE DIVERGENCE fire; root-caused a structural false-positive class in the new AC-3 detector.
**what-considered:**
- Accept dev-team's relayed `git diff` verdict (benign, archive as clean first fire)
- Re-derive from the detector source + scratch-repo reproduction
**why-decision:** `pre-commit:501`'s `[ -z "$real_blob" ] && continue` fail-open is DEAD for tracked paths — `git rev-parse ":$f"` returns the HEAD blob, never empty. Live fire's real_blob `cdd10362` == `git rev-parse a5abe7f36^:<path>` → nothing was ever staged, no peer content existed. Scratch repo: unstaged pathspec commit FIRES, `git add`+pathspec silent, stale-stage FIRES. T12's own header shows the negative control only covers the staged idiom, so the FP class is untested. Discriminator `skip when real_blob == HEAD:$f` verified to kill the FP while preserving both peer-staged (T11 repro) and stale-stage true positives.
**why-change:** Relayed verdict was outcome-evidence about one commit, not the mechanism — same class as the invalid-disposition fence the triage table already forbids for BARE payloads.

### STEP po-S120 · po · 2026-08-01T03:56:29Z
**task-id:** FIX-BCTC-BANK-SUMMARY-MAPPING
**what-done:** Routed EIB 2026-Q2 reports 4271/4272 into the existing BLOCKED row as fresh recurrence evidence; UNBLOCK rather than new mint.
**what-considered:**
- Mint a new EIB/OCR-corruption FIX (the alert text's VNM/VEA hint)
- Dedup into the existing bank B02-TCTD scalar-mapping row
**why-decision:** EIB is Banking (stock-classification.json), and the alert's VNM/VEA non-bank pattern (assets<equity, margin>100%) is a red herring — the symptom is total_assets=0, which this row's title names verbatim. Live probe: CTG corrupt, VCB clean — reproducing the row's own recorded per-form-edge finding, so scope already matches. Row is stranded: hot board BLOCKED/next_agent=null vs detail BACKLOG/next_agent=ba, "blocked on ops re-ingest" premise stale.
**why-change:** Report 4272 (write refused, no corrupt row) is the guardrail working — live `get_bctc_full(EIB)` returns "Chưa có dữ liệu BCTC", confirming no fabricated row landed. No task for that half.

### STEP po-S121 · po · 2026-08-01T03:56:29Z
**task-id:** TE-T05
**what-done:** manual-dispatch-sweep Step 2 stamp + Step 3 BATCH fold of top DRS-STRANDED-OFF-ALLOWLIST candidate.
**what-considered:** only path: sub-flow mandates exactly one top-priority candidate per tick
**why-decision:** TE-T05 top by [rank, idx] (P1, idx 30, next_agent=agent-father, reflag=false); stamp applied via orch-apply.sh, conservation check OK 765/765.
**why-change:** no change from plan

### STEP po-S122 · po · 2026-08-01T04:03:05Z
**task-id:** FIX-SWEEPGUARD-SAMEFILE-DETECTOR-UNSTAGED-PATH-FALSE-POSITIVE
**what-done:** Applied the two board writes S119/S120 had only *decided* — minted the row (P1/S/cross-service//next_agent:developer, task_total 765→766) and flipped FIX-BCTC-BANK-SUMMARY-MAPPING BLOCKED→BACKLOG +next_agent:ba. Both re-read off disk.
**what-considered:**
- Treat `BATCH` as the whole deliverable and let the router mint (what I actually did — wrong)
- Write the board myself, since PO already owns orch-apply writes elsewhere in this same flow
**why-decision:** dev-team RAW-verified and found neither row on the board. `BATCH` is a dispatch *hand-off*, not a persistence mechanism — and this flow's own manual-dispatch-sweep and triage-signals steps both write `.task_board` directly, so "PO doesn't write the board" was never true. A disposition that exists only in prose is `feedback_po_notebook_mint_never_reaches_orchstate_board`.
**why-change:** Deviation from S119/S120, which stated dispositions in the RETURN without persisting them. Analysis was independently confirmed sound; only the mechanical write was missing.

### STEP po-S123 · po · 2026-08-01T04:12:27Z
**task-id:** FIX-PO-MAINFLOW-ORPHANS-TELEGRAM-REPORTS-RESOLVER-SUBFLOW
**what-done:** Resolved reports 4271/4272 (`duplicate`/`duplicate`, `delete_telegram_message:false`), then root-caused why they were never resolved and minted the flow fix; appended occurrences 5+6 to the existing P0 rather than duplicating it.
**what-considered:**
- Just call `process_telegram_report` and move on (treat as my own lapse)
- Check whether the resolver step is reachable from the triage entry path at all
**why-decision:** Second instance of decide-without-actuate in ONE tick — that is a mechanism, not a lapse. `docs/agents/po/flow/telegram-reports.md` is the sole owner of `process_telegram_report` and has **zero** inbound refs from any flow/agent/skill file, while `main.md:20/105` wires only the reader and says "handle first". Reader wired, resolver orphaned — 6th instance of this flow's own documented-consumer-no-producer family. Distinct plane from FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR (board writes) and FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE (server-side ack), so deliberately not deduped into either.
**why-change:** Chose `delete_telegram_message:false` against the tool's `true` default — the underlying defect is still open (row BACKLOG), so destroying the channel trace of an unfixed bug is an irreversible act with no upside; clearing the queue was the actual ask.

### STEP po-S124 · po · 2026-08-01T04:25:15Z
**task-id:** FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR
**what-done:** Renumbered my `occurrences_5_6` → `occurrences_7_8` (incl. the labels inside the prose) and corrected `occurrence_count` 6→8; separately re-derived the task_total delta and held my 765→767 against dev-team's 766→767 flag.
**what-considered:**
- Apply dev-team's correction as given (both items)
- Verify each against the row/commits first, then apply only what holds
**why-decision:** Item 1 held — the row's own `po_corroboration_20260801T025855` says "occurrence_count raised 4 -> 6" and binds 5/6 to the QA-DRAIN and TNB incidents, so my labels collided and the counter was undercounting the `feedback_recurring_bug_escalation` threshold by 2. Item 2 did NOT hold: `orch-conservation-check.mjs` against `cdbc14190` (last orch-state commit before my first write) gives task_total=765 vs live 767, +2 for two mints. dev-team re-ran the real formula and confirmed; their 766→767 was a narrower span.
**why-change:** Deviation from "accept the coordinator's correction" — a relayed number is a claim, same as a relayed verdict. My own first re-derivation was ALSO wrong (passed a local-time `--until` to `git log`, picked baseline 757); redone under `TZ=UTC`. Commit dates render `+02:00` and read as Z.
