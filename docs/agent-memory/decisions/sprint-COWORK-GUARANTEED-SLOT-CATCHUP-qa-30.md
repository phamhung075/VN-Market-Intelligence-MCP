# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation 30)

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-26T00:34:01Z (continuation — qa-29.md breached byte cap 59172/36000, rolled per decision-journal § Cap Check)

---

### STEP qa-S227 · qa · 2026-08-26T03:29:34Z
**task-id:** FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE
**what-done:** Direct-commit verify (qa[], branch:null): reproduced all 6 fixture cases myself (6/6 PASS), built an independent negative control (pre-fix bare-prefix logic) confirming T1/T3/T4 genuinely fail without the fix (3/3 fail) while T2/T5/T6 stay green — non-vacuous. Confirmed CADENCE_SEC_BY_BASIS matches live cowork-schedule.json basis values, MARKER_TTL untouched, mock-guard/shellcheck/secret-grep clean, all 3 commits ancestors of main, board write present.
**what-considered:**
- Trust router's pre-check narration vs re-derive every AC from artifacts myself — chose re-derive (feedback_router_verify_raw_not_badges).
- Whether to re-file the Axis C presence-permissive hazard — read the filed signal verbatim, matches my own code read exactly, already correctly scoped as non-AC by router; no re-file.
**why-decision:** AC-1 (T1 daily + T3 weekly no-block), AC-2 (T2 still-blocks), AC-3 (T4 stale-owner no-block), AC-4 (fixture covers both cadences), AC-5 (folded into full fix, not shipped separately since no design cycle was needed), AC-6 (T1 = exact chef-evening production case) all independently confirmed PASS against real code, not narration. No apps/mcp-server/TS files touched -> bun test/tsc/DDD N/A; not OOM/BCTC-class.
**why-change:** no change from plan.

### STEP qa-S229 · qa · 2026-08-26T03:30:17Z
**task-id:** FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED
**what-done:** Direct-commit verify (qa[], branch:null, 3 commits: 579e7c685 doc, 0bac54347 board, 52cd64926 memory). Confirmed AC-1/AC-2 by grep on committed blob (4 new Pipeline-B rows + Pipeline-A alias/bridge rows; zero rows for agent_flow_defect/db_anomaly_illiquid_ohlcv; cowork-fire untouched, 1 row) and re-measured live signal_queue counts myself (1/2/1/2, matches claim exactly). Confirmed AC-3 by reading the to==po branch text — closes the self-loop, mints backlog directly instead of re-addressing po. AC-4: ran guard-signal-type-coverage.sh --check against the REAL live orch-state.json myself (implementer only tested a scratchpad copy, explicitly declined the live run) -> PASS, zero mutation (script only mints on FAIL path, confirmed by reading source + a dry-run copy first); also ran the paired .test.sh, 32/32 incl. TEST10 live-integration PASS.
**what-considered:**
- Whether AC-4's literal wording (implementer must paste a live-file PASS) was unmet enough to CHANGES_REQUEST — chose to produce the missing evidence myself instead, since the underlying claim (fix works against live file) is what matters and I independently confirmed it true with zero risk (mint only fires on FAIL).
- Whether missing triage-signals-longtail.md edit (row's files[] names it) is an ISSUE — AC-1 text itself says "(or the longtail sibling)", so single-file edit is in-scope, not a gap.
**why-decision:** All 4 ACs independently verified against artifacts I produced, not the implementer's narration. No code files touched (markdown+board only) -> bun test/tsc/DDD/mock-guard N/A for this row's zone; guard script IS the domain-appropriate regression check and it passes.
**why-change:** no change from plan.

### STEP qa-S228 · qa · 2026-08-26T03:33:10Z
**task-id:** FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP
**what-done:** Direct-commit verify (qa[], branch:null, commit 9434b1b73). Independently rebuilt the zsh repro on a schema-valid fixture (ORCH_APPLY_LIVE_FILE_OVERRIDE, no live-file touch): pre-fix echo|jq block reproduces the exact control-char parse error, exits 0, leaves file unchanged (AC-1 PASS); post-fix printf|jq block drains both fixture envelopes to 0, `_updated_by=po` (AC-1/AC-2 PASS). AC-3 FAIL: `|| true` still present verbatim on the orch-apply pipe (grep-verified) — no fail-loud replacement shipped. AC-4 FAIL: no post-write self-verification/re-read block exists anywhere near the CLEAR (grepped whole file). AC-5 FAIL: commit swept only the one file it touched; my own fleetwide grep across docs/agents/**/flow/*.md + .claude/skills/**/SKILL.md found the identical `echo "$VAR" | jq` idiom still live in 5+ other flow docs (system-auditor/flow/main.md:354, cowork-team/flow/main.md:60, cowork-team/flow/match-slots.md x6, dev-team/flow/main.md x3 incl. a `pendingSignals`-shaped var at :1338, dev-team/flow/post-cycle.md x4) — none reported/fixed/waived, exactly the anti-pattern AC-5 cites.
**what-considered:**
- Approve since AC-1/AC-2 (the row's headline defect) are genuinely fixed and PO live-verified 16/16 drain — rejected: AC-3 explicitly states independence from AC-2 ("must not be dropped if AC-2 alone makes the current input pass"), and AC-4/AC-5 are separate mandatory ACs never addressed at all.
- Route back to `owner` (po) vs a more specific implementer — per flow spec, vc-changes routes to the row's own `owner` field regardless.
**why-decision:** 3 of 5 ACs (AC-3, AC-4, AC-5) unmet, independently verified by artifact — CHANGES_REQUESTED.
**why-change:** no change from plan.
