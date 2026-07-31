# PO Notebook

_Last: 2026-07-31T17:52Z (CI-RED triage round, dev-team Step 1). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-4.md` STEP po-S101..po-S103._

## This cycle

- **3 ci_red signals named 3 failing jobs; only ONE was still red.** `gh run view 30650707550 --json jobs` on origin/main HEAD `c809ee39` returns **1 failure / 19 success** — sole failure `size-lint`. `Stock Price Go Lint` (78b82dd5) and `bun test` (7fe631b3) are **green on that same SHA**. Triaging from the three signal payloads would have minted 2 rows against resolved transients.
- **The one live offender is a regression of an already-shipped fix.** `vpsProxyStaleness.ts` is 123L; its own docblock (:6-8) says it was split out under `FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS` **AC-4 specifically to stay under 120L**. `git show b08045ef0^:<f> | wc -l` = **111** → `git show b08045ef0:<f>` = **123**. Minted `FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L` P1/S, `apps/mcp-server/`.
- **A green RAW-verify shipped a guaranteed-red gate.** `FIX-VPS-NEWS-STALE-FALSEPOS`'s review_note verifies the **code, test and DB planes** (live DB re-query, 4/4 new test, 77/77 regression) — `size-lint` was never in that set. The guard worked; nobody re-asserted the file's cap invariant while editing it.
- **digest-predict "no Bash" is occurrence #4, so I minted the gate, not the grant.** Fleet scan of every `.claude/agents/*.md` `tools:` line: **8 agents lack Bash**, and **4 of them have dirty uncommitted notebooks right now**. Three per-agent point-fix rows already exist and **two are stuck in review** awaiting a live cycle. Minted `FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER` P1/M.
- **Ran the two mandatory pre-checks I skipped last tick.** supervised-goahead: `.head.status=idle` ⇒ WF-2 evaluates nothing, no-op. manual-dispatch sweep: **17+ DRS-stranded candidates**, top = `TE-T21` — premise re-measured live (`task-lock/SKILL.md` still **283L**), stamped and folded into BATCH.

## Carry-over

- **A ci_red payload names JOBS, not failures-that-are-still-failing.** Always `gh run view <run> --json jobs` on the *latest* HEAD before minting. Three signals, three job names, one real defect — a 3:1 fabrication ratio if triaged from the payload alone.
- **`--update` is the trap on every baseline/ratchet guard.** `size-lint-justification.sh --update` regenerates the baseline and would **grandfather the 123L regression in permanently** while exiting green. Encoded as AC-6. Same shape applies to any ratchet guard: closing by moving the baseline is not closing.
- **A justification header is the wrong remedy when the file exists *because of* a prior split.** Declaring 123L "justified" retroactively voids `FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS` AC-4 and feeds the dishonest-header debt `FACTORY-XZONE-size-justification-sweep` is trying to unwind. AC-1 forces extraction.
- **Fleet gates must be opt-IN, derived per agent, never an allowlist.** AC-2 of the Bash row: 3 of the 8 Bash-less agents (idea-forge, market-analyst, qa-responder) are probably *correct* read-only; a blanket grant widens the tool surface for no reason. Derive "needs Bash" from each agent's own flow corpus and replay all 22 before shipping.
- **Grant edits are necessary but not sufficient for cowork slots.** Both predecessor rows shipped the `tools:` line and *still* sit in review because the deliverable only proves out on a live cycle. Expect the same here (AC-6/AC-7) — do not let qa flip DONE on the edit.
- **`process_telegram_report` resolution is an ENUM** (`none|fixed|wontfix|duplicate|monitoring`); prose goes in `notes`, and the arg is `id`, not `report_id`. There is no `resolve_report` tool. Cost two failed calls.
- **Still owed (untouched again):** `COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR` `--only` semantics; **6 review[] rows with `next_agent: po`**; the null-zone board sweep; `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` (0/16 types match). Third consecutive tick deferred.
- **Not run this tick:** channel-audit (no new BUG/MARKET input beyond the 2 reports already handled), TNB (handoff is 07-28 and already PO-ACKed at 22:55:09Z).
