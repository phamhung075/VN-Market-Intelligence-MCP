# PO — Notebook

## 2026-08-11T13:04Z · A "4-file gap" that is really 3 dead + 3 by-design, behind a gate that cannot see its own input

### What actually happened
- Triaged agent-father keep-cycle `2026-08-11T12:53Z` (3 CRITICAL tool-boundary mismatches, the 46-vs-42 notebook gap, semble-search LOW) into **3** backlog rows, ONE `orch-apply.sh` write, task_total 755→758. All `next_agent=agent-father`. **No dispatch** — agent-father is on-demand maintenance lane (fires daily `23 14 * * *`), and its own rows are the DRS-STRANDED class.
- Journal: `docs/agent-memory/decisions/triage-20260811T1300Z-po.md`.

### Decisions worth keeping
- **★ THE COMMIT MESSAGE ANSWERED THE QUESTION THE AUDIT HAD BEEN ASKING FOR 11 DAYS.** The report escalated "grant vs description mismatch — is it intentional?" as a PO decision. `git log -1 610110e16` is titled *`fix(claude/agents): grant Bash to ...`* and its body names the two shipped S4 rows the grant actuates. The report cited that SHA as "Origin" and never read the message. **Ruled: grant accepted, description is the defect — `tools:` line stays byte-identical.**
- **★ THE "SAFE" FIX WAS THE DESTRUCTIVE ONE.** Narrowing the grant re-breaks both P1s: alert-commander loses commit-mutex *and* the session-id for its published-marker `task_claim` → verified CRITICAL alerts fire with no duplicate-publish mutex (user-facing); news-scout/market-watcher lose `coverage-stamp.sh` (29/29 green → inert). The stale text is an *armed instruction* to make exactly that regression — disarming it is the point of the row, not tidiness.
- **★ "NO OTHER FILESYSTEM WRITES PERMITTED" IS FALSE TODAY, NOT JUST IMPRECISE.** `scripts/agents-flow/coverage-stamp.sh:95` writes `docs/data/coverage-state.json` under its own `task_claim("coverage-state:main")` mutex. Checked the actuator, not the claim.
- **★ A GATE THAT CANNOT SEE ITS OWN INPUT SURFACE.** `keep.md:33` scopes the Pre-Check on `.claude/agents/*.md | docs/agents/*/flow/*.md`; `scan-orphans.md` reads **five** surfaces — notebooks, tool packages and the roster are all outside it. So an ORPHAN_NOTEBOOK finding can never open the gate that guards its own detection. Verified live at HEAD: last 3 commits = **0** gate-scope hits, **2** notebook changes. The 3-cycle skip streak was the symptom; this is the cause. agent-father read the streak as bad luck and asked for a manual run.
- **★ THE ARITHMETIC HID AN INVERSE DEFECT.** 46−42=4 nets **5** orphan notebooks against **1** missing one. Only 3 are real (dead 27-32d). The other 3 are by-design: `dev-team` (CLAUDE.md: "There is no dev-team agent type"), `main` (router isn't a registered agent) — both **live**, written 08-09/08-07 — and `refine_bctc_md`, whose `init.md:110` declares `notebook: none`, making its MISSING_NOTEBOOK a false positive. Correct steady state is **43 vs 42**, permanently. Flagged in the CLEAN row: anyone chasing 43==42 deletes a live log.
- **★ DECLINED THE RECOMMENDED ACTION BY PERFORMING IT.** The ask was "dispatch an explicit `scan-orphans.md` run". The deliverable was the finding list — produced inline here in four `Bash` calls. Dispatching would have spent a cycle regenerating information already in hand, then left both structural causes standing.
- **★ FOLDED THE LOW FINDING INSTEAD OF MINTING IT.** semble-search re-flags for the *same* missing-allowlist gap as the other three → 4th allowlist entry, no new row. Declined the proposed "Tool Agent template class": `AF-SEMBLE-INIT-DEF` already owns that pattern decision.

### NEXT
- agent-father owns all 3. Row 1 (`FIX-COWORK-AGENT-DESC-STALE-VS-DELIBERATE-BASH-GRANT`, P1/XS) is a 3-line text fix and stops a daily false-CRITICAL — cheapest first. Row 2 (gate + opt-IN allowlist, P1/S) then row 3 (CLEAN, P2/XS); no ordering dependency between 2 and 3.
- Maintenance-lane routing caveat: these will sit DRS-STRANDED (`FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE` withholds agent-father rows). Cleanest actuator is agent-father's own next daily keep cycle via `sweep-fixes.md`, else `manual-dispatch-sweep.md`.
- **Blocker still not cleared** (carried from 12:54Z, now 2 ticks old): 4 `TASK-COWORK-SIGNAL-*` rows in `review[]`, `supervised=true`, **zero** `po_goahead`. Needs its own tick.

### Carry-over
- **★ WHEN AN AUDIT ESCALATES "IS THIS INTENTIONAL?", READ THE ORIGIN COMMIT MESSAGE FIRST.** Both of today's escalations were answerable from evidence the report had already cited but not opened — the commit body for finding 1, the gate's own scope line for finding 2. Cf. 08-11 12:54Z: "read the 20 lines around the line the brief cites". Same failure, second consecutive tick.
- **★ A PERSISTENT FINDING'S REAL DEFECT IS OFTEN IN THE DETECTOR, NOT THE TARGET.** 3 cycles of "gap persists" described a broken gate, not a broken fleet. Ask what the check *can* see before minting against what it reported.
- Standing (held): re-read each row on disk after `orch-apply.sh`; assert the AC-3 SHA is the one I just created, never a peer's sweeping commit.
- **★ VERIFY THAT A VERIFIER CAN FAIL** (held from 08-09): empty output is not evidence of absence until the check is proven able to produce output.
- Prior section (08-11 12:54Z, `CHORE-COMMIT-OVERHEAD` brief triage) dropped WHOLE per AC-2 — po is the OVERWRITE class (preamble + 1 section). It remains in git; it was not shrunk in place (AC-2a).
