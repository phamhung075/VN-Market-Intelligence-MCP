# PO Notebook

_Last: 2026-07-31T06:56Z (dev-team S3 triage, 4 signals). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-3.md` STEP po-S85._

## This cycle

- **4 signals, 1 mint.** ci_red CI-RED-5e97dbda → **2/2 FILE-scoped dedup hits, 0 mints**. FAILING_FILES read at source (`gh run view 30608987675 --log-failed`, bare — never wrap in `timeout` on this host): `apps/macro-indicators/pkg/application/usecases_vmt_liquidity_resolvers.go` (size-lint, new-offender 224L>120L) + `apps/frontend/bun.lock` (frontend-eslint, frozen-lockfile).
- **size-lint is now ONE row from green.** Run 30608987675 says `FAIL — 1 offending file(s) (scanned 1353)` and that file is MACRO-VMT's own. Both siblings shipped (ENERGYTOOLS at `f4feb6551`, SIX-UNCOVERED earlier — both REVIEW). Last tick's "needs exactly TWO rows" carry-over is **stale**; the row's own `status_note` was corrected in place.
- **Minted `FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS` (P1, cross-service/, na=developer).** The tiebreak signal and the byte-cap signal on `unified-agent.md` arrived **1 second apart from the same pruner run** — one causal chain, not two findings: derivation unresolvable → `exit 0` at `notebook-auto-prune.sh:478` without pruning → file grows past cap → bloat hook fires.
- **Did NOT take the signal's own `action_required`.** It asks for one JSON entry for `unified-agent.md`. Replayed the derivation over all **46 live notebooks**: **11 sit permanently in the TIE_COUNT≥2 / dec=0 / inc=0 bucket** — every `## ` heading lacks a parseable timestamp so all collapse to the sentinel key `99999999999999999` (`:403-404`). Override table has **3** entries and **no producer**. One-entry-per-tick is the opt-OUT-allowlist shape.
- **Refused to over-claim the `\>` bug.** Same live file: bash → dec=2/inc=1 → `newest_first` (correct, matches physical prepend order); zsh → `condition expected: >`, every differing pair silently books an `inc` → `oldest_first`, exact inverse. Shebang is `#!/usr/bin/env bash` ⇒ only reachable under an explicit non-bash interpreter. Filed as a hardening AC with both measurements, **not** as the diagnosis.
- **Sprint-journal bloat → DEFER, not skip.** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md` 91309B vs 36000B. Journal is sprint-SCOPED so `decision-journal-archive.sh` does fire at sprint close, and dev-mcp-server was mid-flight writing that exact file. Evidence onto `FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR`.
- **`.head` moved mid-tick**: `in_progress`/FDA-7 at 06:47Z → `idle` at 06:48:33Z (FDA-7 → REVIEW, na=qa). Re-read before running the WF-2 predicate; supervised-goahead correctly no-op'd. Never disposition a pre-check off a snapshot taken minutes earlier.
- **manual-dispatch-sweep, first live run: 40 unflagged candidates** (38 DRS-stranded backlog + 2 ready-XOR). Top by `[rank, idx]` = **TE-T12**, stamped + folded. Prior-art re-verified before folding: SKILL.md is 494L, no `size-justification` in first 12 lines, no `CARD.md`, `CLAUDE.md:7` still points 2.5 at SKILL.md, TE-T23 still BACKLOG. Not stale.
- Channel audit: all 4 `read_telegram_reports` calls return "Không có báo cáo mới" — the known structural defect, already tracked as `FIX-TNB-AUDIT-STEPS-ASSUME-NONEXISTENT-CHANNEL-PARAM` (READY since 07-21). No mint. TNB handoff unchanged since its 07-28T22:55Z ACK.
- orch-apply: Stage 0+1 PASS, 5 rows stamped, **741→742** tasks, 131→131 signals.

## Carry-over

- **`FIX-NOTEBOOK-AUTOPRUNE-...-ZERO-TS-NOTEBOOKS` gates two REVIEW rows.** `...LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES` and `...LINECAP-SWEEP-BYTE-BLIND-BACKSTOP` both fix the byte-vs-line **setpoint**; neither can converge on these 11 files because the pruner declines to run at all. **Do not let QA merge the three.**
- **This very notebook is one of the 11.** `po.md` = TIE_COUNT=2, dec=0, inc=0. It stays quiet only because it is under cap (27L/5252B this write) so the pruner never reaches the tie path; the moment it goes over cap it fail-louds and prunes nothing, exactly like `unified-agent.md`. Self-evidence, not a new finding.
- **Verification gate for that row is NOT "signal stopped firing."** The emitter is per-write and self-clears. Gate = corpus replay showing 0 files in the UNRESOLVED+TIE≥2 bucket, **plus** `unified-agent.md` and `digest-predict.md` back under 12000B.
- **`gh run view <run_id> --log-failed` remains the only disposition-grade read for a ci_red.** `failing_jobs[].name` carries zero file identity.
- **size-lint remedies are exactly two:** shrink under baseline-upper, or a literal `size-justification: <N>L` token in the **first 10 lines** (±10% of actual). A package doc comment does not satisfy it. **NEVER `--update`** — it launders every live offender.
- **Both CI rows re-folded into BATCH** for the 2nd tick. If either is still unstarted next tick the residual is provably **dispatch throughput**, not triage — they have been correctly triaged 8 consecutive times.
- **39 manual-dispatch candidates remain unflagged.** One per tick by design. If dev-team never picks up TE-T12, that backlog drains at 1/tick against a 40-row queue — worth revisiting the one-per-tick cap after 3-4 ticks of evidence.
- **Not run this tick** (scope = dev-team Step-1 triage): sprint-kickoff, review-ba-spec, sprint-signoff.
