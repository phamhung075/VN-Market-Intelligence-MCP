# PO Notebook

## 2026-08-25T16:50-17:15Z — the block guarding the user's OCR goal was protecting a container that no longer exists

Router-direct triage. Journal: `docs/agent-memory/decisions/triage-20260825T1700Z-po.md`.
**6 rulings · 3 rows minted · 2 promoted+expedited · 1 P0 un-stranded · inbox 17→4 (13 cleared, 4 held).**

### Falsify the blocker before you route around it
The standing directive ("PaddleOCR for Vietnamese BCTC") had a measured, ratified fix sitting inert.
`OPS-PDFX-REDEPLOY-DEBT` was `depends_on` `UNBLOCK-PDFX-OPS-DEPLOY`, whose sequencing forbade any
rebuild because "AC-7's sampler needs ≥12h of cgroup counters that reset on recreation". I checked
both halves instead of honouring them. **AC-7 never ran** — its CSV must live in
`docs/incidents/data/`, which holds three files, all `rag-durability-*`. And the protected container
`2edf0c9c9905` is gone: `docker inspect` returns `e2801b67406c`, Created 08-24T13:35:05Z, StartedAt
08-25T06:33:03Z. There was no window to destroy, and the ordering was **backwards** — sampling a
container you are about to replace measures nothing. Removed the dep, P3→P1, `ready[0]`, expedited.
Also caught: the deployed label reads `vn.market.git_sha="unknown"`, so "verify by IMAGE ID" is
impossible on this service today.

### The ruling
`OCR_TEXT_BACKEND=auto`, set in **docker-compose.yml, not main.py** — one line to revert, readable in
`docker inspect`, and every `run --rm` container keeps the conservative default. Gated on G1 QA-green
(stated, not assumed), G2 a **second-document** probe (the dev's own caveat, promoted to a hard gate —
two of three rejected discriminators *inverted* on the only document measured), G3 the redeploy, G4
market hours. 7-day rollback triggers written with numbers, not adjectives.

### Count subjects, not envelopes
14 notebook-hook envelopes arrived as near-identical pairs 92s apart. Every one of those notebooks'
mtimes **predates** the window — the hook re-evaluated a standing STATE and emitted it as a
per-invocation EVENT, and `createdAt` inside the hash makes dedup structurally impossible. 8 subjects,
not 14 incidents. Folded all 10 actionable ones onto the existing actuator and did **not** mint the
duplication defect: the emitter-side dedup ledger already exists, just wired to the wrong signal
family. Then measured all 7 candidate notebooks with `wc` rather than trusting the row: **2 have
converged** (code-janitor 2621B, dev-team 11288B) and were dropped from scope, and the row's stated
`section_count=1` mechanism is false on all 4 survivors. Consolidated it 12,585B → 5,294B in the same
write, because at 12,585 it was over the ceiling and could not be annotated at all.

### Carry-over
- **`--check` is not read-only.** Running `guard-signal-type-coverage.sh --check` MUTATED the board:
  auto-minted a row and applied an orch-apply write (872→873). `FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-MODE-MUTATES-BOARD`
  already owns it. Treat every `audits/` script as a writer until proven otherwise.
- **Held 4 envelopes on purpose, and attached a terminator.** `guard-signal-type-coverage.sh` reads
  `pending_triage_inbox[]` as its ONLY Pipeline-A type source, so clearing an unrouted type falsely
  greens CI. But the inbox is not a CI fixture — so I promoted the row that ends the hold-back out of
  `backlog[]`, where `next_agent=agent-father` is off the DRS allowlist and **nothing could ever pick it**.
  If it holds a third tick, escalate the structural row instead.
- **Prose ceiling shapes where a finding can live, again.** `FIX-PDFX-TESSERACT-CONFIDENCE` has 174B
  headroom, so the second-document gate had to become its own row rather than an AC. Two ticks running.
- **A row-scoped claim key does not guard an agent instance.** Minted the generalisation with 4
  confirmed sites; the signal only scoped the PO case.
- Not run: TNB / channel-audit / signal-dashboard / goahead / manual-dispatch pre-checks. Scoped tick.
- **Left alone, reported not absorbed:** 8 `review[]` rows and 11 `ready[]` rows carry a null
  `next_agent`. Pre-existing, out of scope.
- Standing push disarm in force — committed, nothing pushed. `.head` idle.
