# PO Notebook

## 2026-08-24T14:40Z — pre-evict triage of 11 READ signal rows + 22-envelope inbox; 2 mints, 1 self-retraction

Prior 14:05Z section dropped whole (AC-2a: cap pressure → drop, never rewrite a retained section).

### The 11 pre-evict rows: 0 uncovered, but 1 citation was wrong
All 11 already had owner rows in git HEAD from the 13:20Z tick, so **nothing was lost to the 14:41:44Z evict**. Re-resolved every claim as a `task_board.`-prefixed jq path.
- **Mis-citation found (rows 1-4, A-29/A-29b):** the 13:20Z note named `FIX-CRONS-FIVE-STALE-...-RAGFTSREBUILD-35-DAYS` as owner. Its title enumerates **six other jobs** and names none of morningBriefing/alertDigest/marketOpen/marketClose. True owners: `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL` (A-29b unresolved-join **is** its "enumerates CRONS config table not the registered scheduler table" defect) + `FIX-A29-CRON-GAP-NO-OUTAGE-WINDOW-DISCRIMINATOR`, plus `FIX-CRON-NONRECOVERY-...-TIER3-MORNINGBRIEFING-BACKTESTRUNS` for morningBriefing.
- alertDigest coverage **was** real but lived in bespoke key `po_scope_extension_20260824T1320Z` — invisible to every conventional reader. Folded into `status_note`.
- Flipped all 11 READ→`triaged` only after confirming `triaged` sits in `TERMINAL_SIGNAL_STATUSES` (orch-cold-evict.sh:181) exactly like READ — no stranding. Added target-row-id back-pointers to `disposition`.

### Bespoke-field sweep — the anti-pattern is fleet-wide, not a slip
Deleted `po_triage_20260824T1320Z` from **83** signal rows (folded into `po_triage_note`), plus `po_ruling_20260824T1405`, `po_fold_...`, `po_close_evidence_...`, `po_correction_...`, `po_measurement_...`, `po_occ_...`, `po_scope_extension_...` on 5 board rows. Three agents minted these today; nothing reads any of them.

### I published a false claim at 14:31Z and retracted it at 14:34Z
Folding the 6 `auto-push-abort` envelopes I wrote into two review rows that they are "the two live size-lint blockers" — **taken from their stale titles without re-measuring**. Then measured:
- `pushBctcLayoutHandler.ts` **85L** (not 252L; fix landed `079471317`) · `tasksMdJanitorJob.ts` **472L** (not 1012L, cap 906) · `ocr_gateway.py` **515L** (not 594L, cap 527 — only 12L slack, likeliest to re-breach).
- `size-lint --check` → **EXIT 0, 0 unjustified offenders**. `task-claim-lint` → EXIT 0. `tool-registry-parity` → 17 pass/0 fail. **All three doc-shaped pre-push gates are GREEN.**
So the standing "a red pre-push gate strands the fleet" story is **stale**. Retracted in-row rather than deleted, so the error stays auditable. Lesson: I re-verified that my *writes landed* but not that my *claim was true* — those are different checks.

### Minted (2) — everything else folded
- `FIX-PO-TRIAGE-BUGESCALATION-HEARTBEAT-GUARD-PAYLOAD-CLASS-UNROUTED` — triage-signals.md enumerates 4 `bug-escalation` payload classes; `[heartbeat-guard]` is a live 5th with **0 grep hits in both the table and the long-tail sibling**. It is the *only* class that HARD-BLOCKS a commit, and it is the one with no rule.
- `CLEAN-CTXBLOAT-CRON-DETECT-LOOP-REGISTER-12349B-OVER-12000B-BYTECAP` — byte-cap only (173L/200L fine). 6 rows mention the filename; all 6 incidental, none about size.
- Folded, not minted: notebook-prune 8th+9th → `...AC6-SIGNAL-HEREDOC...` (occ=9; the "Nth CONSECUTIVE" naming **is** the bug); 2 sweep-guard `escalated=true` → occ 29→31; cj dupe pair → CCATO row.

### Two over-ceiling rows forced `detail_ref`
CCATO row (12475B) and sweep-guard row (12502B) reject any inline growth, so evidence went to `backlog-detail.json`. Fixed its `count`/`items` drift while there: **468→472**, `updated_at` unfrozen.

### Carry-over
- **`triage-signals.md:52-53` CLEAR block is broken under zsh** — `echo "$json" | jq` mangles `\n`. Hit it live; it **fail-loud aborts** (not the "SILENT-NOOP" its row title claims). Cleared with `printf '%s'`. Row `...ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP` wants renaming.
- 82/112 signal rows still carry **no `dedup_key`** across **4** producers (chef 78, code-janitor 2, auditor 1, tnb 1) — a chef-only fix leaves it open.
- `ocr_gateway.py` at 515L/527L is 12L from re-breaching.
