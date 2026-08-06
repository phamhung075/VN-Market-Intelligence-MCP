# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · qa (continuation 2)

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** qa
**Started:** 2026-08-06T21:00:09Z
**Rolled from:** sprint-ULTRACODE-AUDIT-FIXALL-qa.md (byte-cap breach 45376B > 36000B cap, dual-axis check, line-count 558 < 600 cap)

---

### STEP qa-S21 · qa · 2026-08-06T21:00:09Z
**task-id:** UC-ASL-P6
**what-done:** Review-Lane QA-Drain (branch:null, row carries no status_note/review_note/commit/
files[]/owner — derived landing commit via git-log fallback). Found `2728636fd`, main-ancestor
confirmed, `git show --stat` touches exactly the 5 files claimed in agent-father's own prior
board-move commit (040be366d). init.md's 3 bare `DASHBOARD.md` mentions (lines ~49/95/142) now
correctly name `docs/data/DASHBOARD.md` + `scripts/emit-dashboard-row.sh`; flow/main.md's phantom
RETURN line ("NEXT: po (via DASHBOARD.md)") corrected to ".signal_queue row" — both re-grepped
live today, durable through 6 days of later unrelated edits (2026-08-05/06), no regression.
tier1-probe.md correctly needed no change (re-confirmed no live phantom mandate there).
**Found BLOCKING gap:** the row's own cited architecture brief (auditor-signal-loop-P6) "Change"
item (2) specifies TWO edits to `.claude/skills/signal-dashboard/SKILL.md`: (a) line 11 write-
protocol text → orch-apply.sh [DONE, confirmed live] AND (b) trim the `:22-24` manual-CAS
instruction to name orch-apply.sh as the CAS-guard provider [NOT DONE — `git blame` confirms
lines 22-24 unchanged since 2026-06-07 commit `8a46965519`, untouched by `2728636fd` or any later
commit]. Live text still reads "Shell/flow code MUST record mtime before read, check mtime again
before rename, retry up to 3 times if changed. Never use bare temp→rename without the CAS guard"
— this tells shell/flow code to hand-roll its own manual mtime-CAS as an alternative path,
directly contradicting line 11's own absolute mandate 2 lines above ("MUST route through ...
orch-apply.sh ... NEVER a raw temp-file-then-rename", no manual-CAS exception) and the project's
CANONICAL SSOT-W1-ORCH-APPLY-WRAPPER rule. Exactly the SKILL.md hot-path/orch-apply-contract
misalignment class this row exists to close — partially fixed, not fully. Verdict:
**CHANGES_REQUESTED**.
**what-considered:**
- Trust agent-father's own board-move commit message (040be366d) as sufficient self-report —
  rejected: that message only claims the line-11 edit landed, is silent on the :22-24 sub-edit;
  re-read the architecture brief's literal Change spec directly instead of the narrower self-report.
- Treat the :22-24 gap as cosmetic/non-blocking — rejected: the brief's Verifier paragraph
  separately labels 4 items "non-blocking notes... does not invalidate the proposal" (init.md
  purge, OUTPUT-CONTRACT counter, 2 sibling-file pointers) — the :22-24 trim is NOT one of those,
  it is bundled inside the core "Change" item (2) itself.
- Run bun test/tsc/mock-guard — N/A, explicit: `git show --stat 2728636fd` = 5 files, all
  `.md`/notebook, zero `.ts`/production source touched; Smart-Skip doc-only category confirmed.
**why-decision:** Grep + `git blame` independently confirm the exact internal contradiction this
row was chartered to close (SKILL.md hot-path text vs orch-apply contract) is still half-live in
the file today; the other 4 files' fixes are all independently RAW-reconfirmed live and durable.
**why-change:** Escalation from default PASS — moved `UC-ASL-P6` `.task_board.qa[]` ->
`.task_board.review[]` (status QA -> REVIEW, owner/next_agent=agent-father, `redispatch_count`
0->1, `status_note` with file:line + fix guidance) via `jq | scripts/orch-apply.sh` (validator
PASS, conservation PASS task_total 771=771/signal_total 202=202). Did NOT approve, did NOT merge
(nothing to merge — already on main), did NOT push. `send_telegram`/`task_release` not called —
no `mcp__gateway__call_tool` binding in this QA specialist sub-session (INV-GATEWAY-1); flagged
to the calling dev-team dispatcher to release `task:UC-ASL-P6` itself.
