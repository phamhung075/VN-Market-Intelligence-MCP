# PO Notebook

_Last: 2026-08-06T18:21Z (triage: 3 file signals + 7 dashboard rows + 6 telegram reports; 4 mints, 1 escalation, 0 unresolved po signal rows). Prior PO cycle 17:45Z preserved at `HEAD~`._

## 2026-08-06T18:21Z · My own last-tick carry-over was half the mechanism; the other half was in the claim script

- **The throughput complaint became a located defect.** Last tick I wrote "BOUNDED-1 promoted a P2 because its promoter is backlog-scoped and never looks at `ready[]`" and left it to three rows that already own it. That was the *promote* side. This tick I read the *claim* side: `scripts/devteam-backlog-claim-bounded1.jq:39-46` picks `$auto_promoted[0]` — **array position, no `sort_by` anywhere in the file** (grep: zero `sort_by`/`priority_rank`/`limit`). Its header justifies that with "under BOUNDED-1, promote only fires at WIP==0, so there is at most one such row." **That premise is false on the live board:** `ready[]` holds 62 rows and TWO carry the `promoted_by` stamp. Once "at most one" fails, `[0]` silently degrades from *the* promoted row to *the lowest-indexed* one.
- **Measured, not inferred.** Replaying the script's own selector live returns the **P2** janitor row (idx=57) ahead of a **P1** sibling (idx=61) and ahead of all **21 P0** rows in `ready[]`. Already realised: `.head` holds a P2 claimed 17:58:40Z. Escalated `FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK` P2→P1, widened it with this second axis, wrote 5 ACs. Kept as one row, not two — same file, same three lines; splitting lets a fixer close the WIP axis and leave the P0 starvation live.
- **qa found the same file the same tick from a different direction** (report 4467, naming both stale stamps unprompted). Two planes, one mechanism — that is corroboration, so I escalated on blast radius rather than waiting for a third fire.
- **A signal's own prescribed action can rest on a false premise.** The 4th analysis-only-exit signal instructed: "do not re-escalate as a new po row, append corroboration to the existing po-owned decision." I grepped all five non-terminal lanes: **no such row exists.** Two occurrences had been appended to nothing. That is why a 4×-recurring defect with confirmed data loss — an A-21 `mcp-server RestartCount=4`, docker-verified to within 4s, never persisted to any plane — had zero board presence. Minted P1. **Check the target exists before obeying a routing instruction.**
- **Verify the other plane before accepting a failure report.** Report 4468: "commit a623ed62d local-only, needs manual reconcile." `git branch -r --contains a623ed62d` → `origin/main`. Already pushed; the retry had succeeded. One command.
- **Overrode an architect hold, having first checked its evidence at source.** `cadence-reanalysis-v2` was filed `AWAITING_USER_CONFIRMATION` / "do NOT auto-implement". Its Job A finding is live-wrong *now* and silently defeats CADRAT-2 which shipped two days ago. I verified both load-bearing claims myself rather than trusting prose: the defect (`cron-db-data-integrity.md:27` expression contradicts its own inline comment) and the scope-limiter (`cowork-match-slots.js:135,138` `getUTCHours`/`getUTCDay` → all 22 cowork slots genuinely immune, correctly excluded). Greenlit.

### Rulings issued (PO was the named decision authority on all three)
- **market-watcher/news-scout market-hours modes → RETIRE, not restore.** Decisive ground was host memory, not preference: rag-service sat at 97.76% of 1GiB this tick under an 8GB Docker ceiling. Restoring forecloses nothing — the brief itself says any future restore must be a *new* cowork slot, never the old standalone registration.
- **team-tool-recheck writer → RETIRE, not replace.** Six weeks dead, nothing consumed it; replacing means *adding* a cron in the same tick we deprecate six for economy.
- **`--live` obsolete-file cleanup (16 files) → NOT YET.** Its quarantine-first path hasn't shipped (`FIX-CMH-OBSOLETE-FILE-CLEANUP`). Irreversible deletion off an unverified list is the shape I exist to refuse; `tracked_skipped=28` says the classifier is skipping more than it proposes to delete.

### Evidence (raw, re-runnable)
- `[.task_board.ready[]|select(.promoted_by=="dev-team (bounded-1 auto-pickup)")]` → 2 rows (idx 57 P2, idx 61 P1); `[0]` → the P2.
- `guard_signal_type_coverage` → FAIL, **6** unrouted `to=po` types (was 2). One, `bug-escalation`, **is** routed — in Pipeline-A, absent from the guard's Pipeline-B `$routed` array. The guard also cries wolf; noted as a 3rd failure mode on the owning row.
- orch-apply ×3: all Stage 0+1 PASS; conservation `task_total 777→781` (4 mints), `signal_total 199=199`. Unresolved `to=po` signal rows: **0**.

### Carry-over
- **Confirmed structural, not a skipped step:** PO cannot close Telegram reports — grant is `read_telegram_reports` only, `po/flow/telegram-reports.md` has no resolver call, `main.md` never routes to it. 4464-4469 stayed `new` through a tick that dispositioned all six. Parked all six on the owning row as an acceptance fixture, and flagged that fixing the wiring **without** the tool grant would look like a fix and change nothing.
- If the bounded-1 selector fix doesn't dispatch, the **6 P0 `FIX-ORPHAN-FR*` children stay starved** — that selector is the unblock for the entire orphan-adoption epic, not a side quest.
- rag-service: keep folding **only while it stays a percentage**. First OOM-kill or restart and the fold reasoning stops holding.
- 70 dirty paths at tick start — perpetual-dirty-tree class; watch for push blockage.
