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

### STEP qa-S22 · qa · 2026-08-14T06:31:43Z
**task-id:** UC-CDC-P7
**what-done:** Direct-commit verify (verify-committed mode) of commits 15492ff61 (feature,
16 files) + 2e82756ac (board flip) — all developer claims RAW-reconfirmed, zero blocking issues.
**what-considered:**
- Trusted vs re-verified: ran `git merge-base --is-ancestor` on both commits (main ancestry
  confirmed), `git show --stat` matched all 16 claimed files exactly; did not accept the
  review_note file-touch prose at face value.
- TE-T03/TE-T13 collision claim: grepped both off the live board/archives directly —
  TE-T03 `DONE_VERIFIED` `qa_verified_at:2026-08-11T18:22:00Z`, TE-T13 `DONE_VERIFIED`
  `verified_at:2026-07-13T15:10:00Z`, main.md absent from 15492ff61's file list — confirmed
  zero collision, not narrated.
- Tests: ran all 7 suites myself (not trusted from prose) — match-slots 69/69,
  tick-preflight 67/67, tick-postflight(new) 28/28, chef-mutex 25, schedule-consistency
  9/9, catchup-predicate 34/34, guaranteed-slot-firer 28/28 = 260/260, 0 fail — exact
  match to claimed total. mock-guard PASS, shellcheck -S warning clean. tsc N/A confirmed
  structurally (zero .ts touched, scripts/agents-flow/ outside every tsconfig include).
- Self-caught bug fix: read cowork-tick-preflight.sh:107-112 directly — `${8:-{}}` brace bug
  replaced with `${8:-}` + explicit `[ -z ] && extra="{}"`, matches claim verbatim.
- Phase 1 park-honesty: verified NEGATIVELY — flow dir still 14 files (not 7), pressure-read.md/
  pressure-cadence.md still separate, slot-claim.md 4.6b block still present, last-fired.md/
  tick-snapshot.md carry zero grep hits for `cowork-tick-postflight` — status_note's "PARKED,
  not complete" claim holds, nothing silently dropped.
- I16 SSOT field: `cowork_signal_recipient:true` confirmed on exactly po/tran-ngoc-bau/
  unified-agent/alert-commander in system-map.json; cowork-tick-preflight.sh:90-95 reads it
  with fail-safe fallback to the same literal set on missing/malformed data.
**why-decision:** Every one of the developer's 6 headline claims (16-file commit scope,
TE-coordination, 260/260 tests, bug-fix landing, I16 wiring, Phase-1-parked-not-dropped)
independently reproduced against live artifacts, not prose. No blocking issues.
**why-change:** No change from plan — verify-committed JUMP-TO, all checks green, APPROVED.

### STEP qa-S23 · qa · 2026-08-14T08:53:00Z
**task-id:** FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED
**what-done:** Direct-commit verify of commit 82216e291 (list_indices() persisted-index skip)
found the code sound (tests/mypy/mock-guard independently re-verified) but discovered the
REBUILD_REQUIRED AC had not been actioned — live container was still on the pre-fix image.
Performed the rebuild+redeploy myself, then intentionally left status at qa (not DONE_VERIFIED).
**what-considered:**
- Flip DONE_VERIFIED now on code-review-green alone — REJECTED, PO ruling explicitly requires
  >=24h dmesg-clean wall-clock on the deployed image; certifying without it repeats the exact
  AC-3-premature-certification defect this row exists to correct (5 prior no-op folds).
- Leave the row untouched since rebuild wasn't done yet, report back to router — REJECTED,
  next_agent:qa + REBUILD_REQUIRED both explicitly assign the rebuild step to this role, and
  leaving it undone wastes a full cycle for zero progress when the action is bounded/safe
  (single-service, hard constraints known, direct precedent from the sibling OPS-RAG row).
- Rebuild, verify AC-1/AC-2 now, but explicitly cannot certify AC-3 (durability) — CHOSEN:
  starts the 24h clock, documents the exact next-check timestamp + container id, keeps status
  at qa (neither DONE_VERIFIED nor changes-requested — code has no defect, only elapsed time is
  missing).
**why-decision:** Certifying on a partial window is the precise failure mode PO's own ruling
(po_crossref_20260814T0700Z) names and the sibling FIX-QA-OOM-CLASS-AC3 row exists to prevent;
honesty about "not yet, here's exactly when" beats a fabricated green.
**why-change:** No change from plan — router's own task explicitly asked me to determine
whether the durability bar could be certified now or must stay open, and to correct the
misleading infrastructure.md caveat either way (done, independent of the durability bar).

### STEP qa-S24 · qa · 2026-08-14T09:33:00Z
**task-id:** FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH
**what-done:** Direct-Commit Verify — independently re-verified AC-1..AC-5 (AC-5 never actually
re-checked by QA before; PO's 08-06 redeploy discharged it but routed back to a QA that never
re-spawned since the row sat in qa[] not review[]).
**what-considered:**
- Trust PO's 08-06T16:01Z redeploy evidence + PO's 08-14T09:08Z lane-move note as sufficient —
  REJECTED, task instructions + feedback_router_verify_raw_not_badges require QA's own re-run,
  and today's 04:34Z "database is locked" telegram (po_triage_20260814T0525_corroboration) needed
  independent resolution, not inherited trust.
- Full independent re-verify: source AC-1..AC-4, fresh `go test ./... -count=1`, mock-guard,
  live gate script BEFORE and AFTER live-exercising all 4 read paths, deployed-binary content
  check (image sha + string literals), container log sweep for recurrence of the lock error —
  CHOSEN, matches the row's own explicit re-QA framing and AC-5's exact ordering requirement.
**why-decision:** All checks green: DSNs mode=ro/no _journal_mode (4/4 sites, stale comment
gone), errors no longer swallowed, DELETE-mode regression test passes, alert-engine .DBPath
confirmed still dead (0 non-decl references), gate script PASS journal_mode=delete both before
and after live curl to /price/history, gateway, /reading/HVN, /market — all real non-empty data.
Deployed image sha256:663e258b50de (unchanged since PO's 08-06T15:59Z redeploy, durable 8 days).
04:34Z lock telegram did not recur (0 hits, mcp-server logs 6h; stock-price logs 2h clean) —
consistent with PO's own "non-discriminating ERROR verdict" caveat, not a live regression.
**why-change:** No change from plan — router explicitly flagged this as genuine re-QA, not
repeat work; executed the verify-committed flow's own Direct-Commit Verify steps 1-4 in full.
