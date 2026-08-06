# BA Spec — TE-T05

**cowork-end-cycle: merge 6-file/385L end-of-cycle skill chain into one composite end-0-cowork**

## Source

- Board row: `.task_board.backlog[]` id `TE-T05` — sprint `TOKEN-ECONOMY-AUDIT`, wave 3, type `SPRINT-M`, size M, priority P1, zone `.claude/skills/`, `owner: agent-father`, `next_agent: agent-father` (LIVE — unchanged by this pass, see Blocker B1).
- Origin brief: `docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md` §T-05.
- Triage tick 2026-08-06T18:07Z (`docs/agent-memory/decisions/triage-20260806T1807Z-po.md`, STEP po-S7): PO stamped `TE-T05` as the manual-dispatch-sweep's top-of-sort BATCH candidate, class `DRS-STRANDED-OFF-ALLOWLIST`, third same-day surfacing (07:23Z, 07:52Z, 18:29Z per `docs/agent-memory/notebooks/po.md`).

## Figure verification (live, 2026-08-06, vs brief 07-12)

The 6-file count is confirmed accurate. The **385L figure is stale** — live total is **511L (+126, +33%)**:

| File | Brief L | Live L | Δ |
|---|---|---|---|
| `cowork-end-cycle/SKILL.md` | 16 | 16 | 0 |
| `decision-journal/SKILL.md` | 77 | 99 | +22 |
| `session-log-cowork/SKILL.md` | 33 | 33 | 0 |
| `notebook-write/SKILL.md` | 94 | 198 | +104 |
| `doc-self-heal/SKILL.md` | 47 | 47 | 0 |
| `self-critique/SKILL.md` | 118 | 118 | 0 |
| **Total** | **385** | **511** | **+126** |

Growth is concentrated in `notebook-write` (+104L, more than doubled) via three intervening hardened-invariant fixes landed since 07-12 (git log): AC-2a immutability invariant + pre-commit hash-diff gate (`FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`, commits `a502b82ad`/`e80bc123a`), `c<NNN>` UUID-provenance rule + mechanical pre-commit backstop (`FIX-AGENT-NOTEBOOK-UUID-PROVENANCE`, commit `be9b90953`), and a system-auditor notebook-compose actuator interim guard (commit `bdc48880f`). `decision-journal` grew +22L via a dual-axis (line+byte) Cap Check fix + a LAYER2 pathspec-scope fix.

Reference count also drifted: brief cites "30 flow files" referencing `cowork-end-cycle`; live grep (`find docs/agents -path "*/flow/*.md" | xargs grep -l cowork-end-cycle`) = **29**. `session-log-cowork` reconfirmed live at **0** direct flow references (brief's claim holds) — reachable only via `cowork-end-cycle` Step 1.

Net effect: the ~130-165k tok/day estimate (built on 385L) is a floor, not a ceiling — current waste is larger — but the blast radius of mis-folding `notebook-write` is also larger than it was on 07-12, because three hard-won correctness gates now live there that didn't exist then.

## Functional Requirements

**FR-1** — Build composite `.claude/skills/end-0-cowork/SKILL.md` (~110L target; naming/shape mirrors the ratified `step-0-cowork/SKILL.md` precedent) inlining:
- (a) decision-journal flush — condensed to a pointer + one-line reminder (decision-journal itself stays standalone: it has independent dev-team call sites, e.g. `docs/agents/ba/flow/main.md` invokes it directly — never fork its logic).
- (b) merged notebook write — a POINTER to `notebook-write/SKILL.md` (not an inlined copy — see NFR-1), replacing the separate `session-log-cowork` append+commit step entirely.
- (c) doc-self-heal — condensed checklist (4-category table + "never remove safety checks" + "skip silently if nothing to fix", ~10-15L inlined).
- (d) self-critique — TRIGGER-CHECK only (SC-0 pilot-scope gate + T1-T5 taxonomy, ~15-20L inlined); full 118L file lazy-loaded only when in-scope AND a trigger fires.
DDD layer: **infrastructure** (shared cross-cutting orchestration capability, not domain/business logic).

**FR-2** — Keep `notebook-write/SKILL.md` and `doc-self-heal/SKILL.md` standalone/unmodified for dev-team flows that reference them directly; the composite is additive for cowork agents, not a replacement.
DDD layer: **infrastructure** (backward-compat boundary for a second consumer class).

**FR-3** — Delete `.claude/skills/session-log-cowork/SKILL.md` after the fold (0 direct flow refs, reconfirmed live).
DDD layer: **infrastructure** (dead-skill removal).

**FR-4** — Repoint every flow file's "End of cycle" step from `cowork-end-cycle/SKILL.md` to `end-0-cowork/SKILL.md` — re-run the reference grep at implementation time (live = 29 files, not the brief's 30). **Naming caveat (EC-7):** despite the file's name, its 29 live consumers span all four `dev-team/flow/main.md` lanes, not just "cowork" — cowork 17 (digest-predict×5, unified-agent×4, market-watcher×2, news-scout, tran-ngoc-bau, alert-commander, qa-responder, bctc-analyst, market-analyst), **dev-core 6** (ba, pm, architect, developer, qa, fixer), maintenance 5 (system-auditor, claude-manager-helper, idea-forge, cowork-refactory-expert, code-janitor), ops 1. The composite's proposed name `end-0-cowork` (mirroring the cowork-specific `step-0-cowork` precedent) may misdescribe its actual dev-core/maintenance/ops audience — a naming call for architect, not prescribed here.
DDD layer: **interface** (the flow-file to skill-invocation contract, one call site per agent flow).

**FR-5** — Per PO's ratified `audit_ref` amendment (P6-Piece2, 2026-07-12):
- (i) add an explicit NO-OP rule to the composite: "notebook write + session summary are ONE write; skip when the flow already landed its settled notebook write this cycle";
- (ii) delete the 3 ad-hoc skip-parentheticals once the composite ships — **live locations** (drifted from the brief's cited numbers): `docs/agents/news-scout/flow/stage-log-notify.md:101` (brief: :96), `docs/agents/unified-agent/flow/chef-dish.md:704` (brief: "chef.md:672" — file renamed chef.md→chef-dish.md since), `docs/agents/bctc-analyst/flow/stage-log-notify.md:68` (brief: :66);
- (iii) give `fb-market-poster` doc-self-heal + self-critique parity — confirmed live: **zero** invocations of `cowork-end-cycle`/`doc-self-heal`/`self-critique`/`session-log-cowork` across all 4 of its flow files (`main.md`, `daily.md`, `weekly-recap.md`, `weekly-prediction.md`) — this is a net-new addition, not a repoint.
DDD layer: **application** (cross-agent behavioral rule governing when/whether the end-of-cycle sequence fires).

**FR-6** — Dedup `cowork-boundary/SKILL.md` (29L) vs `cowork-error-boundary/SKILL.md` (78L) — two overlapping boundary files both loaded every cowork cycle (secondary "Merge note" item on the same board row, ~20k tok/day, file pair unrelated to the end-of-cycle chain). See Blocker B2.
DDD layer: **infrastructure**.

**FR-7 (explicit non-goal)** — Deleting the DEPRECATED `append-session-record/SKILL.md` skill is OUT OF SCOPE here. The row's live `note` field still names it as a deletion target, but the same row's own `audit_ref.note` (ratified 07-12, memory-docs-hygiene-P2 disposition) says this row "must DROP its 'DEPRECATED append-session-record' deletion clause (UC-MDH-P2 absorbs it)" — UC-MDH-P2 is a separately-scoped row doing a full 9+-consumer sweep (AGENT_STARTUP.md, INDEX.md, README.md, digest-predict init/tools-package, market-analyst init, briefings.md, tool-registry regen, MCP tool deregistration). TE-T05 must not duplicate that work. See Blocker B3.

## Non-Functional Requirements

**NFR-1 (no-copy-paste / SSOT)** — The composite MUST reference `notebook-write/SKILL.md`'s hardened logic (AC-2a immutability invariant, AC-5 line-cap gate, `c<NNN>` UUID-provenance rule + pre-commit backstop) via pointer only, never an inlined condensed duplicate. Duplicating recreates exactly the SSOT-drift class AC-2a itself was written to eliminate (2026-07-29 ruling, `ultracode-workflow-improvement-audit.md:932-934`).

**NFR-2 (pilot-scope integrity)** — self-critique's SC-0 allowlist (`{news-scout, dev-team}`, brief §8, 14-day shadow pilot) is a live, time-bounded, PO-owned constraint pending a "Phase-2 promote" decision. The composite's condensed TRIGGER-CHECK copy must not become a second, independently-maintained copy of that allowlist.

**NFR-3 (citation freshness)** — Any line-number citation inherited from the 07-12 brief must be re-verified live before use — 3/3 spot-checked citations in this pass had already drifted 25 days later, and total L-count grew 33%.

## Blockers (PO-only)

**B1 — ROUTING-CLASS CONFLICT (blocks proceeding to architect).** This row's `owner` and `next_agent` are both `agent-father` (live, unchanged) — consistent with PO's 2026-07-21 artifact-class routing ruling (any `.claude/skills/**/SKILL.md` deliverable routes to agent-father, who owns full create/edit/review/maintain lifecycle end-to-end) and with **all 26 other `TOKEN-ECONOMY-AUDIT` rows sharing `owner=agent-father`** — every one of them dispatches agent-father directly to REVIEW/QA; **zero** go through a ba→architect→pm relay, despite several (including TE-T05 itself) carrying `type: "SPRINT-M"` (SPRINT-M/L reads as a pure size/effort tag for this sprint's artifact class, not a relay trigger). Dispatching this specific instance through the ba→architect→pm relay — as this BA pass was instructed to do — contradicts both the explicit ruling and unanimous sibling-row precedent (0/26 exceptions). Per BA's own flow contract ("blockers must be resolved before returning"), this pass has **not** mutated `next_agent` on the live board row and is **not** handing off to architect. Recommend PO either (a) confirm this one row is a deliberate, documented exception (and amend its fields accordingly), or (b) redirect dispatch to agent-father directly (on-demand maintenance-lane spawn, mutex-wrapped, per `docs/agents/dev-team/flow/main.md` "maintenance lane") — this BA-spec doc is then optional input agent-father may or may not need.

**B2 — SCOPE/BUNDLING.** Should the `cowork-boundary`/`cowork-error-boundary` dedup (FR-6, ~20k tok/day, files unrelated to the end-of-cycle chain) ship in the same ticket/commit as the end-of-cycle composite (FR-1..5, ~130-165k tok/day, materially higher risk now given `notebook-write`'s 3 hardened invariants), or split into a sibling row?

**B3 — Stale note clause (informational, non-blocking to this spec).** The row's `note` has not yet had the audit-mandated append-session-record deletion clause dropped (see FR-7). Recommend applying via `orch-apply.sh` per `audit_ref.note`'s own instruction, independent of B1.

## Edge Cases

- **EC-1** — fb-market-poster: net-new addition (0 existing invocations across all 4 flow files) — implementer adds the End-of-cycle step from scratch, not a repoint.
- **EC-2** — self-critique SC-0 allowlist must survive condensation unchanged (NFR-2).
- **EC-3** — notebook-write stays pointer-only in the composite (NFR-1).
- **EC-4** — decision-journal likewise stays pointer-only (independent dev-team call sites, e.g. `ba/flow/main.md`).
- **EC-5** — Live flow-file reference count for `cowork-end-cycle` = 29, not the brief's 30; re-grep at implementation time.
- **EC-6** — All 3 cited skip-parentheticals have drifted line numbers (FR-5); locate by content-grep, not the cited line number.
- **EC-7** — `cowork-end-cycle`'s 29 live consumers span all 4 `dev-team` lanes, not just cowork (17 cowork / 6 dev-core / 5 maintenance / 1 ops — see FR-4). This BA's own flow (`docs/agents/ba/flow/main.md`) is itself one of the 6 dev-core consumers.

## Disposition

Spec complete; routing blocker (B1) open. Board row `TE-T05` left untouched (no `next_agent`/`ba_spec_complete` write) pending PO ruling — mutating it now would bake in a disputed relay path ahead of that ruling.
