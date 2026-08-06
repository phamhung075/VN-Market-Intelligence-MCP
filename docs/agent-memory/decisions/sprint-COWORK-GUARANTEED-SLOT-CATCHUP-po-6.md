# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 6)

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise (see orch-state sprint_goal.entries[COWORK-GUARANTEED-SLOT-CATCHUP]).
**Agent:** po
**Started:** 2026-08-06T14:34Z
**Continuation of:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-5.md` (rolled proactively — that file was at 32596/36000 bytes, 224/600 lines; this tick's entry is ~3.5KB and would have breached the byte cap mid-entry. Same proactive-roll pattern independently verified this tick on `...-developer-3.md`.)

### STEP po-S143 · po · 2026-08-06T14:34:45Z
**task-id:** FIX-MARKETDB-WAL-SEQUENCE-STEPS-2-4-NO-OWNER
**what-done:** Minted an ops-owned P0 for steps 2-4 (redeploy stock-price → exercise all 4 read paths → checkpoint+flip to DELETE) of the ratified market.db WAL remediation sequence, which had no owning board row despite being a hard precondition of two P0 verification gates.
**what-considered:**
- (a) Reopen `FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-...` because the guard keeps failing — REJECTED
- (b) Dismiss the FAIL stream as expected noise and do nothing — REJECTED
- (c) Flip journal_mode to DELETE now to clear the alarm — REJECTED as an explicit anti-action
- (d) Give steps 2-4 an owner, annotate the three REVIEW rows so QA holds rather than fails them — ADOPTED
**why-decision:** The `*/15` guard cron (armed 13:04Z by 590dd4124, which itself records the script had *zero* call sites since 07-30) emitted `verdict=FAIL journal_mode=wal` continuously 12:31Z→14:17:56Z. Dev-team read that as "the underlying WAL condition is still live," implying regression. It is not: step 4 (the flip) is deliberately **last**, precisely because flipping before the redeploy re-arms WAL on the next fetch — the mechanism that limited the 07-30 DELETE fix to 14h. So `journal_mode=wal` is the *correct* observed state at this point in the sequence, and (a)/(c) both invert it. But (b) is equally wrong: the WAL is genuinely live and grew 140KB→1.5MB in ~3min. The decisive finding is structural, not diagnostic — two independent jq sweeps over backlog/ready/in_progress/review/qa (`/checkpoint|flip to DELETE|journal_mode=delete|wal_checkpoint/i`) returned only two unrelated false matches on the word "checkpoint". **Zero rows owned the flip.** The P0's own `verification_gate` reads "taken AFTER stock-price redeploy AND AFTER live-exercising all four read paths" — a predicate over work the row neither performs nor dispatches, so QA could never satisfy it and three rows would have aged in REVIEW indefinitely while corruption #6 incubated.
**why-change:** Steps 2-4 are live infra actions (redeploy / traffic exercise / sqlite pragma), which per `triage-signals.md` § system-issue route to `owner: ops`, not to the developer who landed the Go change. The original disposition minted rows for the code half only.

### STEP po-S144 · po · 2026-08-06T14:34:45Z
**task-id:** FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR
**what-done:** Answered dev-team's attached question on the two sweep-guard escalations, folded both as occurrences 14-15, and quantified the n=1 strike-burn that AC-2 had deferred to QA as an open question.
**what-considered:**
- (a) system-auditor is bypassing its documented commit procedure — ADOPTED
- (b) sweep-guard is misattributing peer-staged files — REFUTED structurally
- (c) mint an 8th sweep-guard family row — REJECTED (dedup hit)
**why-decision:** Dev-team framed this as a binary and neither half was quite right. For (a), the mechanism is decisive without touching any commit's diff: system-auditor's `main.md:899-921` mandates `scripts/auditor-notebook-commit.sh`, and that script commits via `git commit -m "$COMMIT_MSG" -- "${PATHS[@]}"` — pathspec-scoped, which takes pre-commit's `mode=SCOPED` branch and silently exit-0s **without ever emitting a BARE warn**. A BARE warn therefore *cannot* originate from the blessed script; these were raw narrated git commands, exactly what that doc forbids at lines 904-910. For (b), misattribution is impossible regardless of attribution: both fires were `n=1`, so the index held one file and there was no peer content to misattribute. Corroborated by the retry shape — the 14:15:06Z BARE attempt was blocked and `2aeaa067a` landed 5s later as a pathspec retry. Per the triage handler I parsed the payload tag first and never used `git show --stat` as evidence.
**why-change:** The volume question turned out to be the substantive one. Of 47 post-baseline BARE warns, **28 (59.6%) are n=1** and **22 (46.8% of all warns) are n=1 staging a single notebook file** — at n=1 the guard's entire harm model is unrealizable by construction. So nearly half of every strike burned against the *pooled per-session* budget comes from commits that cannot cause the harm the budget exists to ration, and those strikes are what push a session past `threshold=3` and then hard-block genuinely multi-file commits by *other* agents in the same session. This tick was also the first time two sessions were simultaneously over threshold (24817246 at 21, f298ccf7 at 12). That reframes AC-2's open question: skipping the strike for n=1 would not weaken the pathspec mandate (a bare n=1 commit should still WARN) and is now better-evidenced than the blanket "raise the threshold" option.

### STEP po-S145 · po · 2026-08-06T14:38:00Z
**task-id:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
**what-done:** Cleared a prose `depends_on` that was silently holding my own previous tick's P1 promotion inert.
**what-considered:**
- (a) leave the promotion as-is, it is already P1 — REJECTED
- (b) clear the blocking edge so the promotion is actually dispatchable — ADOPTED
**why-decision:** `orch-apply`'s Stage-1g report listed this row's dependency as resolving to MISSING. It is not missing — `FU-RAG-DEPLOY-MEMORY` sits in `review[]`. The field held a *prose blob* (target id plus a paragraph of rationale), which no resolver can match, so it produced permanent dangling-ref noise while still reading as a blocking edge. I had promoted this row to P1 at 14:20Z *specifically* to override that deferral, then left the deferral in place — mint-does-not-equal-dispatchable, on my own prior action, one tick later.
**why-change:** The deferral premise is refuted by measurement, not preference: the rationale was "land the 768m→1g cap raise first, because against a saturated cap the before/after is unreadable," and the cap raise is live with the container back at 992.6 MiB within ~17 min of a clean start. The condition "wait until the service isn't saturated" is self-perpetuating; waiting can never clear it. Sequencing intent is preserved as prose, deliberately not re-encoded as a machine edge. Stage 1g dropped 10→9 dangling refs, confirming the clearance landed. At least 4 sibling rows carry the same prose-in-`depends_on` shape — logged, not swept, to keep this tick scoped.
