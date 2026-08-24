# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · pm (continuation 2)

**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-pm.md` (32142 B; +5813 B of new entries would have taken it to 37956 B, past BYTE_CAP = LINE_CAP 600 × 60 = 36000).
**Agent:** pm
**Started:** 2026-08-23T10:47:21Z
**STEP numbering continues across the chain** (last in base: `pm-S11`).

---
### STEP pm-S12 · pm · 2026-08-23T10:47:21Z
**task-id:** FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER
**what-done:** Split into 3 children (developer / agent-father / qa) and wrote the design SUBSTANCE into the handoff files rather than a pointer to the brief.
**what-considered:**
- Split `drain-signals.md` (spec) from `drain-signals.js` (script) as two tasks vs one — chose ONE: `drain-signals.js:183-188` declares `ROUTING_TABLE` a hand-kept mirror and requires both change *in the same commit*. Splitting would violate the file's own rule. Precedent `5ad4a3f92` co-edited them.
- Route `docs/standards/mcp-tools.md` to agent-father with `spawn-fanout.md` vs keep it with the core — chose core: it is a technical description of the mechanism being built, and `897d1811a` already co-edited it with `drain-signals.js`. Only `spawn-fanout.md` (a cowork-team flow doc) goes to agent-father.
- Fold AC-5 (live-inbox first run) into the developer task vs mint a qa child — chose mint: it is the row's own `verification_gate`, it is a statement about the live inbox that fixtures cannot prove, and the first run fires one escalation per stuck file into PO's queue in a single tick.
**why-decision:** PO's ruling measured that this row's `note` is literally null and `architect_handoff` has zero readers fleet-wide, so the handoff file is the ONLY channel to a developer. The realistic failure was not a stall but a plausible WRONG implementation — with only `files[]` visible, the obvious fix is exactly the reader-widening the brief rejects. So §2 of the core handoff is a named hard constraint, not a footnote.
**why-change:** No change to the design. PM added the same-commit mirror rule as an explicit anti-split rationale, and a "do not hardcode 51/49/26/21/2" AC because the inbox moved between two measurements taken 8 minutes apart during design.

### STEP pm-S13 · pm · 2026-08-23T10:47:21Z
**task-id:** FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS
**what-done:** Decomposed brief §3 ONLY into 2 sequential children, D3-first; deferred §4 to one `backlog[]` row and carried §8-step-5 as an AC on the second child instead of minting a third row.
**what-considered:**
- Ship §3.1 (value-shape measure) first vs §3.2 (widened live baseline) first — chose §3.2 first: it is ~10 lines, fixes the live D3 block that has two rows parked BLOCKED-in-place right now, and is independent of the measure change. §3.1 is the larger change and gains nothing from going first.
- One task for all of §3 vs two — chose two: both touch `orch-row-prose-ceiling-check.mjs`, so `depends_on` serialises them anyway, and each has its own disjoint AC set (AC-4/5/6 vs AC-1/2/3).
- Bundle `--list-over-ceiling` into §3 (it is listed in the brief's §5 file table) vs defer — chose defer: the brief's §4 is where it is *described*, it has no consumer until `--over-ceiling-only` exists, and the mandate was §3 first and alone.
**why-decision:** Router independently confirmed the D3 mechanism at source (`PROSE_CEILING_LANES` at `:105` omits `in_progress[]` → `liveBytes=0` at `:267` → hard reject at `:269`), and PO captured the abort verbatim on a write that changed only `status` and `blocked_by` — both in `STRUCTURAL_FIELDS`, zero byte growth. §3 depends on nothing open and makes no orch-state write, so it is landable against three concurrent writers.
**why-change:** Corrected the row's own framing before writing the handoffs: `occurrence_count: 1 → 2` ALREADY passes (same digit count, zero delta). A fix scoped to integer increments would fix none of the live blocks. Both handoffs state this so no implementer designs against the title.

### STEP pm-S14 · pm · 2026-08-23T10:47:21Z
**task-id:** FIX-PM-BLOAT-GATE-NO-UNCLEARABLE-BRANCH-REFIRES-ON-STRUCTURALLY-UNEVICTABLE-LANES
**what-done:** Ran flow Step 1's terminal-lane bloat gate, ran `orch-cold-evict.sh --dry-run` (read-only), measured 0 evictable in every category, and did NOT run the live eviction.
**what-considered:**
- Run the live eviction anyway (gate tripped 4 cycles running, `done_verified[]=30` vs a stated invariant of 5) vs decline — chose decline: the dry-run projects a byte-identical hot file (3,203,251 → 3,203,251, reduction 0). A no-op write taken under commit-mutex with `ORCH_APPLY_ALLOW_SHRINK` set, against a live peer, for zero bytes, is pure risk.
- Mint a new row for the deadlock vs attach to `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (ready[], P0) — chose neither exactly: that P0 row already owns the root cause AND already lists `scripts/orch-cold-evict.sh` in `files[]`, so a duplicate would be a dedup failure. Minted only the narrower pm-flow defect (gate has no unclearable branch, no state) and put the full measurement in its `note` with an explicit DO-NOT-DUPLICATE pointer.
- Append the measurement to the P0 row where it belongs vs put it on the new row — forced to the new row: the P0 row measures 11732B of prose against a 12000B ceiling, so the append would have crossed it and hard-rejected this cycle's entire 7-mint write. That is a live instance of the very defect pm-S13 decomposes, hit while working around it.
**why-decision:** Root cause measured, not inferred: the FIX-DEPSSATISFIED referential eviction guard (`orch-cold-evict.sh:214-229`, applied `:467`/`:491`) holds 30/30 `done_verified[]` ids and 4/4 rank-eligible `done[]` ids. Zero evictable is STRUCTURAL. The gate's thresholds are right; its remediation tool cannot reach them.
**why-change:** Prior three pm cycles logged this as "deferred, peer-write hazard". That framing was incomplete — at least this cycle it was not deferrable, it was impossible, and no mechanism existed to record the difference. Hence the row.

### STEP pm-S15 · pm · 2026-08-24T17:59:13Z
**task-id:** FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION
**what-done:** Review-lane triage: row was `plan_only`, architect brief complete, zero implementation trace anywhere in the tree, parked in review[] by mistake since 2026-08-12. Decomposed into 2 children (developer: Step 5.3 two-arm rewrite; agent-father: delivery_proof schema) per the brief's own explicit routing, closed parent to done[] with `children[]`.
**what-considered:**
- Sign off DONE_VERIFIED as-is — REJECTED: commit=null, branch=null, plan_only=true, zero grep hits for delivery_proof/Arm2/artifact-delta anywhere live. Nothing to verify.
- Leave in review[], just reassign next_agent — REJECTED: review[] means "awaiting sign-off on landed work"; this row never had an implementation phase, so no next_agent value fixes the lane mismatch.
- Decompose now vs park for a later cycle — chose now: dependency (FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES) re-verified live as DONE_VERIFIED, brief is fully specified, row stuck since 2026-08-12 per its own po_starvation notes.
**why-decision:** Brief §7/§8 names the exact 2-way split (developer vs agent-father, per cowork-schedule.json's own `_maintained_by` stamp) and explicitly says PM should not wait on the sibling epic. Both children are immediately actionable (dep satisfied) → BACKLOG lane, matching the FIX-A21-PREDBOUND-1/2 precedent shape.
**why-change:** No change from the architect's design. PM's only addition is carrying the SHADOW-MODE-first constraint into child 1's handoff as a hard constraint, not just a brief footnote.

---
