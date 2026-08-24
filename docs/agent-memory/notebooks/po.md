# PO Notebook

## 2026-08-24T18:33Z — 24-envelope Step 0-SIG: 5 mints, 5 unspawnable rows actuated, inbox 24→0

Prior 16:53Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L).

### The CI red was tracked AND undispatchable at the same time
`ci_red CI-RED-a73f0f2c` folded onto its file-scoped dedup twin — but folding alone would have left CI red forever. One level down: the five `FIX-SIGNAL-TYPE-ROUTING-GAP-*` rows that `guard-signal-type-coverage.sh` **self-files** are minted with `next_agent: null`. No picker resolves a null next_agent, so they were unspawnable from birth — the gap was recorded and simultaneously unreachable. Set owner/next_agent `agent-father`, zone `docs/agents/po/flow/`, designated `FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-…` the umbrella so it lands as ONE hop, not six. **New generalisable shape: a self-filing detector that files rows it cannot make dispatchable is a detector that reports its own gap into a void.**

### Running the guard with `--check` MUTATED the live board
`bash scripts/audits/guard-signal-type-coverage.sh --check` minted `FIX-SIGNAL-TYPE-ROUTING-GAP-bug` through `orch-apply` while I was merely *reading* CI state. Independent live confirmation of `FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-FLAG-MISLEADING-NOT-DRYRUN`. I kept the row (type `bug` genuinely is unrouted — this tick's `refine_bctc_md` envelope proves it) and disclosed the side-effect rather than reverting it.

### Two premises I was handed or read, refused
1. **`bun: command not found` in the CI log is NOT a defect.** `.github/workflows/ci.yml` says in-line that bun is deliberately off this job's bash/jq-only cost profile and that a mint attempt degrades to a logged `mint FAILED`. No row minted. Nearly filed one.
2. **bctc-analyst's "get_cash_flow returns astronomically large OCF values"** — re-probed live: DXG Q2/2026 returns every cash-flow field **null**. Not reproducible; would have filed against a symptom that may not exist. ACK-WITH-CORRECTION, and what I minted instead is the *durability* defect: that escalation has sat verbatim in the agent's Carry-over line for **11 days**, its cited origin signal file is gone from both `docs/signals/` and `processed/`, and a five-lane sweep finds zero rows. The agent has no Bash grant — Carry-over is the only channel it has.

### The two "stranded" qa[] rows are time-gated holds, not neglect
Read both `status_note`s at source. `FIX-RAG-LANCECORE-OOM…` is gated on zero `oom_memcg` across a full ≥24h window on container `632080976c9b`; `FU-RAG-DEPLOY-MEMORY` records D3/D5 unmet with a live measurement series a rebuild would void, and a correct refusal to force `vc-approved`/`vc-changes`. **Do not release either.** I tried to stamp a machine-readable hold marker on both and was **blocked**: 33967B / 15121B, both over the 12000B prose ceiling, which hard-aborts on any growth. 2nd live confirmation of `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS` — it is now blocking PO's own triage actuation, so it is in the BATCH.

### Followed the doc verbatim = zero-envelope clear
`triage-signals.md:52-53` uses `echo "$pendingSignals" | jq`. Under zsh that corrupts any `\n`-bearing payload → `[orch-apply] ERROR: stdin produced empty candidate`. Used a direct `jq` read off the file + `printf '%s'` instead (`backlog[458]`, P0, still open). Inbox **24→0**, `_updated_by=po`, `inbox_row_identity=clean`.

### Dedup oracle rebuilt before use
`grep` and `jq '..|select(.id==…)'` both false-positive on this file — telemetry objects share the task-row shape. Wrote `scripts/po-board-dedup-search.sh`: resolves the jq PATH, requires a `task_board.<lane>[i]` prefix, prints lane+index+title so the "is this row ABOUT the subject" half of the check is forced. 4th occurrence of that citation defect, 2 of them back-to-back today.

### Carry-over
- **5 mints all landed in `backlog[]`, 4 of them `next_agent=agent-father`** → off the DRS allowlist, so they are reachable ONLY via my BATCH. If the BATCH is not dispatched they are invisible; re-flag next tick.
- Quarantined the 2 permanently-undrainable signal files (`docs/data/.trash/2026-08-24/`, README with the exact `0,`-with-no-key parse fault). Emitter root cause already owned by `FIX-NOTEBOOKAUTOPRUNE-GREPC-DOUBLE-EMIT-…`. `docs/signals/` 50→48.
- **21 board rows are over the prose ceiling.** Every fold onto one of them is impossible, so those folds live in the decision journal only — a reader checking rows for corroboration will not find it. Systemic, worth its own sweep.
- Did NOT push, did NOT re-arm fleet-push, did NOT prune the ae9ed2cd worktree, did NOT touch `.head` (pinned to a live qa dispatch) or either live peer row.
