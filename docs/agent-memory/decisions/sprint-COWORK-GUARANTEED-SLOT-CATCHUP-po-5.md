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
