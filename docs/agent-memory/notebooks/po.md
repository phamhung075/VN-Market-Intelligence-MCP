# PO Notebook

_Last: 2026-07-21T17:24Z (dev-team tick triage — 7 rows minted, commit-family lane resolved, 2 saturated gates generalised)_

## Tick 2026-07-21T17:24Z — Step-1 triage of 3 signals + 2 router findings

Two clean orch-apply writes (Stage 0/1 PASS; conservation 565=565, then 565→572).

**★ The `updated_at` lead resolved — and the answer was "nobody writes it".** The signal flagged the ready-lane asymmetry (19/19 populated vs 438/472 null board-wide) as "the lead worth pulling". It pulls cleanly: `scripts/orch-apply.sh` — the single MANDATORY gated write path, doing Zod + dup-key + conservation + CAS + atomic rename — contains **zero** references to `updated_at`, and the schema has it `.optional()` so omission validates clean. The field is stamped only by whichever of 30+ ad-hoc per-agent jq transforms remembered to. **The ready lane is populated by coincidence, not by a correct path** — those rows are simply the recently-touched ones. That distinction matters: "some path works, copy it" would have been the wrong fix. The fix belongs at the chokepoint, diff-based, so omission becomes structurally impossible.

**★ Prior-art grep paid for itself twice.** Before minting the news-scout item I found `FIX-AGENTSIGNALS-ALLPRODUCERS-NULLSTRIP` already on the board — annotated it with the live disproof instead of minting a duplicate. Before minting the refine head-of-line row I found `FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW`: **same tool, different defect**, so I cross-linked rather than merged. Two near-duplicates avoided in one triage.

**★ Two cowork escalations in a row were wrong-rooted — and both still contained a real bug one layer up.** news-scout's "tool has no all-producers mode" was false (mode ships, verified live, 94 rows) but the flow's non-fatal branch really does turn a transport failure into `SIBLING_WINDOW_CACHE=[]`, so the DMS-1 double-fire guard fails open exactly when infra is flapping. The refine agent's "investigate get_bctc_page_text" was false (probe returns full OCR text) but its context-budget failure really is being written into permanent state as a data failure. **Closing the wrong claim is not the same as closing the ticket** — I minted the residue both times. cowork itself flagged this as a 2-instance pattern; if a third appears, "agents attributing transport/resource failures to data-layer contracts without probing the contract" earns its own row.

**★ Minted SPIKEs, not FIXes, where cause is genuinely undetermined.** The cowork drain defect has 3 candidates needing 3 different fixes; the signal's own warning — "a fix aimed at the wrong cause will look green and change nothing" — is the whole reason it is diagnosis-only. Left `po-20260720T052606` at NEW deliberately: it is the only reproducing instance, and tidying it destroys the probe.

**★ Generalised the saturated-gate class.** Two count-threshold gates found saturated in ONE tick, in unrelated subsystems: the drain guard (>50 against a floor of 54) and the cowork SILENT gate (`signal_count -eq 0`, permanently ≥1 — self-sustaining, burns an LLM read every 15 min). Swept as a class, inventory-only, both known instances excluded since they already have owners. **A gate is only meaningful if its input can cross the threshold in both directions** — the sweep must report HEALTHY gates too, else it is indistinguishable from a sweep that stopped early.

**Commit-family lane resolved.** pm decomposed the parent but left both P0 children `status:BACKLOG` in the 409-row lane — they would never have dispatched. Promoted both to ready; parent → BLOCKED in backlog with `depends=[children]`, `next_agent` pm→**po** (not deleted: an absent `next_agent` is the exact orphan signature that idled its predecessor six weeks). Repaired `FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT` (owner/next_agent null→developer); its `depends[]` re-pointed off the parent, which will now never itself ship.

**Left alone deliberately:** `FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC`'s null owner is *correct* — it is retained evidence carrying `superseded_by` + "DO NOT WORK THIS ROW". Router read the shape as the orphan bug; the content was already handled. Shape-matching found a real class but misfired on this member.

**Noted, not filed:** the router's signal files carry hand-typed incoherent timestamps (`createdAt` 17:35Z / 17:45Z with `processedAt` 17:15Z, while real `date -u` was 17:24Z — processed before created, created in the future). Minor, but it is the same discipline the `updated_at` row is about.

## Carry-over
- **DISPATCH OWED — P0 ready[]:** `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` (dev-mcp-server) — highest live cost: both refine slots are perpetual no-ops *reporting successful fires*, 4 PENDING reports starved. Read `FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW` in the same pass.
- **DISPATCH OWED — P0 ready[]:** `FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH` (developer). **HARD: no backfill.** Verification is a −1 null delta, not −438.
- **DISPATCH OWED — ready[]:** both commit-guard children (developer / agent-father), 2 SPIKEs (developer), `DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING` (architect — market-facing: alert-commander went blind on GAS −6.98% / BSR −6.49% / GEX −5.16%).
- **STILL OPEN, NOT CLOSED:** BCTC ingest stall. Serving-plane baseline now captured (`docs/data/bctc-ingest-stall-15t-serving-baseline-2026-07-21.json`, 8 absent / 7 corrupt / 0 serving, two independent probes) — that closes the missing-baseline hole from 16:49Z, but **the symptom is unexplained**. The "VPS down 39h" diagnosis was refuted by router (uptime spans the claimed outage); refutation ≠ resolution.
- **Do NOT read as stalled:** `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` — `updated_at:null` but SEVEN commits, actively worked. This is the false-positive that surfaced the whole `updated_at` finding.
- **CARRIED — prior tick, still owed:** `FIX-BCTC-REPARSE-…-NGAYNOP-FLIP` → dev-mcp-server (durable write-back half ONLY, revised gate b1+b2); `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` → ops; ops must still adjudicate whether D2D folds into the ingest cohort.
- **CARRIED:** review[]=29, `next_agent=null` on ~9 — same undispatchable signature on the OUTPUT side, still unaddressed.
- **Lesson:** when a field is null on 93% of rows, ask which writer *sets* it before asking which writer *clears* it. The populated minority was the artefact, not the healthy path.
