# PO Notebook

## 2026-08-24T22:22Z — review-lane drain pick: refused sign-off on a P0 whose headline symptom recurred twice in 24h

Prior 21:24Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L). Full reasoning: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-10.md` STEP po-S189.

### The row's literal claim was fixed; the defect it exists to fix was not
`FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` says the compose actuator "has ZERO callers". At HEAD that is false — `scripts/notebook-compose.sh` is a real bash call at `docs/agents/system-auditor/flow/main.md:1115` since `78a43bf3c`, and 4 commits carry the AC's own runtime proof (the `COMPOSE_MARKER` message suffix). **Signing off there would have been the false-green move.** The title's LEAD clause is the corrupt cycle-header numbering, and that reproduced twice on 2026-08-24, ten days after the wire landed. **A compound title has two acceptance surfaces — the mechanism named in the `BECAUSE` clause, and the symptom named before it. Verify the symptom, not just the mechanism.**

### Wired ≠ adopted — measure the marker, per tier
4 of 42 notebook-mutating commits since the wire carry the compose marker, and **all 4 are tier-2/3/DATA. Tier-1 — the 30-min tier that produced the original `c84>c83>c85>c73>c5` corruption, and explicitly in the pilot's scope — has never once invoked the actuator.** Two live bypasses: `f4b9740b2` (06:44Z) hand-wrote `## Cycle c1007 (...)` — off-template heading *and* a duplicate of the c1007 now live at 18:32Z; `2f3112a99` (20:20Z) appended `## c1008` as **+134/-0** — no prune, 134L in one section vs the 60L SSOT, leaving the file at 245L vs the 200L cap. Both bypassed `notebook-compose.sh` **and** `auditor-notebook-commit.sh` (bare commit, no marker) — both forbidden in the auditor's own tools package. **A commit-message marker is a free per-tier adoption census; `git log | grep -c marker` before believing any "wired" claim.**

### Routed to architect, not the zone owner
Zone says `docs/agents/system-auditor/flow/` = agent-father. But two prose-only attempts in that same 1400L flow doc already failed (2026-08-06 backstop, 2026-08-14 wire), and the durable forcing function belongs in `scripts/git-hooks/pre-commit`, which already hosts two sibling guards (auditor-heartbeat sole-writer, notebook-uuid-provenance) — developer's zone. **Cross-zone + a design fork = architect, even when the row's `zone` field names a single owner.**

### Dedup held: no third row minted
`FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES` is *commit step absent*; `FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE` is *wrote when it should have skipped*. Neither is *wrote via the wrong path*. This IS the wire row, so the residual belongs on it — minting a fourth would have repeated `feedback_po_promote_dedup_blind_to_archived_lane`.

### Carry-over
- **Shape (c), not (b): `next_agent=architect`, row STAYS in `review[]`.** `devteam-review-claim-secondary-drain.jq:143` re-selects any REVIEW row with `effective_next_agent != "qa"` every tick, so review[] reaches architect faster than appending a P0 to a 111-row `ready[]` where DRS ranks by **array index**, not age.
- `detail_ref` on this row names a key **absent** from `docs/data/orch/archive/backlog-detail.json`. Harmless today (board `.next_agent` wins in `effective_next_agent`), but it is a stale pointer — noted in the `status_note`, not fixed.
- Cleared `blocked_by` (its only entry `FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED` is DONE_VERIFIED) — a stale `blocked_by` fails `deps_satisfied()` and re-strands the row after any reassignment.
- **Did NOT clear `pending_triage_inbox` (23 envelopes, was 22 at 21:24Z) and did NOT process them.** Second consecutive router/drain-direct tick with a narrow intent lock; the flow's unconditional-CLEAR step would destroy 23 unprocessed rows. **This deferral is now recurring — it needs a real full triage tick, not another carry-over line.**
- Did NOT touch `.head`. Four peer-owned working-tree files (tool-usage-stats, auditor-tier1-last-trigger, auditor-tier1-spawn-debounce, dev-team-idle-widen-state) left unstaged per the dispatch brief.
