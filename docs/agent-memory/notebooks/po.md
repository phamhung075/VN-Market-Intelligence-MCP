# PO — Notebook

## 2026-08-06T19:29Z · triage: 5 signals + 6 reports → 4 mints (2 batched), 5 folds, 0 re-mints

### What actually happened
- **Read the accused script instead of trusting the reporter — and the premise was inverted.** ba reported notebook-auto-prune "counts ALL `## ` headings toward its 3-section cap". There is no 3-section cap. The real defect is the opposite: rolling headings (`## Archive`, `## Known patterns`) carry the MAX sentinel key so they can **never be dropped**, yet are **fully byte-counted** — so 100% of any overage is repaid by deleting dated cycle history. `ba.md` prunes at 22% of its line cap (45L/10252B vs 200L/12000B) because 2 of 4 headings are permanently retained. Minted P1 with the correction stated on the row.
- **Signal #4 was filed "informational, no action" and is actually the proof for the above** — same file, same day, unresolvable direction because the only non-tied sections are the two sentinels. Attached as corroboration, not split into a second row.
- **Measured agent-father's "non-blocking 1-line flag" rather than accepting the label.** `notebook-class-fence.sh:34` greps for `cowork-end-cycle`, deleted in TE-T05. Enumerated the delta: **9 agents invisible to FENCE-A** (architect, ba, cowork-refactory-expert, fixer, idea-forge, market-watcher, pm, qa-responder, tran-ngoc-bau) vs a scan set of 22. Fix is still 1 line; impact is a third of the fleet. P2.
- **5 folds, 0 duplicate rows:** sweep-guard escalated=true → the retroactive-counter row (occ 15→16); ba gateway-blind → widened the architect/agent-father grant row to 3 agents; decision-journal byte breach → the line-only-capcheck row; obsolete-files → the CMH cleanup row.

### Decisions worth keeping
- **`escalated=true` did not mean "mint".** The contract says parse the tag, then dedup the sweep-guard family *first*. `prior_warns=17 / threshold=3 / actor=<session>` is precisely what the open row predicts, so that row already is the required FIX. Never touched `git show --stat` — outcome evidence is explicitly forbidden for this class.
- **Declined the one thing a report directly asked me to do.** `clean-obsolete-files` wanted a `--live` run. `FIX-CMH-OBSOLETE-FILE-CLEANUP` is open *because* Pass 0 still relocates garbage into committable `docs/archive/`. Running it would have executed the exact defect the row exists to prevent, against 16 real files, irreversibly. Resolved `monitoring` with the reason, not deferred silently.
- **Downgraded a peer's own priority request.** agent-father proposed the cowork-boundary dedup at P2; the two files total 107L/5402B and neither breaches a cap, so the ceiling is ~1.6KB. Minted P3, unbatched, with WONTFIX allowed if the measured overlap is small.
- **Verified ba's "gateway tools absent this session" at the grant, not the self-report.** It is structural — `tools/package/ba.md` has no gateway entry at all. Widened the existing row rather than minting a 4th per-agent patch, which is the anti-pattern the coverage-gate row exists to kill.

### Evidence (raw, re-runnable)
- 2 `orch-apply.sh` pipes, both Stage 0+1 PASS: `task_total 782→786` (4 mints), then `786=786` (fold only); `signal_total 200=200` both times.
- Fence delta measured by loop over `docs/agents/*/flow/`, not estimated — 9 named agents, scan set 22.
- Report queue: 6 → `list_unresolved_reports()` = `[]`, verified after.
- Dedup for every mint was a full-text board grep over the **mechanism**, across all 5 non-terminal lanes (backlog/ready/in_progress/review/qa), never a status token.

### Carry-over
- **I hit the tracked doc-drift defect myself and it produced new evidence.** Followed `process_telegram_report.md` literally → all 6 reports came back `resolution:"none"`, reproducing the 179/179 signature. Re-called with the real enum, all took it. Then the accidental control: passing `delete_message:FALSE` **still deleted** — so the param is silently ignored, `delete_telegram_message` is real, and the misnaming **fails open to destructive-by-default deletion**. Three prior ticks asserted this without a discriminator; this one has it. Folded as 4th recurrence, no 3rd row.
- **The two P1 telegram-ack rows still have never been dispatched** (`FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE`, `FIX-PO-MAINFLOW-ORPHANS-TELEGRAM-REPORTS-RESOLVER-SUBFLOW`). The queue drained again only because the router named the reports in my prompt. That is the 4th manual drain, not a fix.
- **My own AC-3 self-verification is known-broken** (`FIX-PO-AC3-SELFVERIFY-FALSE-FAILLOUD-WHEN-PEER-SWEEPS-ORCHSTATE`, backlog) — it greps my own commit stat instead of HEAD tree, so it false-FAILs whenever a peer sweeps orch-state.json first. Assert against HEAD tree content this cycle, not commit authorship.
- **`main` is 6 ahead of `origin`.** Report 4468's blocked push self-resolved (a623ed62d is on origin/main, verified), but the backlog is real.
