# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · developer

**Sprint goal:** (ambient active sprint at time of write — these two tasks are their own PO brief-signoff, not part of this sprint's own goal)
**Agent:** developer
**Started:** 2026-07-07T21:20:00Z

---

### STEP developer-S1 · developer · 2026-07-07T21:20:00Z
**task-id:** F1-LAUNCHD-COWORK-BACKSTOP
**what-done:** Generalized scripts/cowork-fb-daily-firer.sh (fb-only, hardcoded UTC-window if-chain) into scripts/agents-flow/cowork-guaranteed-slot-firer.sh — calls cowork-match-slots.js (same matcher the live */15 dispatcher uses), filters to guaranteed===true, fires each match's trigger_prompt verbatim. Retired the fb-only script + plist into the generalized launchd/com.vn-market.cowork-guaranteed-slot-firer.plist.
**what-considered:**
- Copy the retired script's per-slot if-chain and add 4 more branches (chef/digest/tnb) — rejected per architecture brief §3: repeats the exact hardcode-accretion pattern that caused this outage class to recur, and every future guaranteed slot would need a script edit.
- Matcher-driven generalization (chosen) — one SSOT (cowork-schedule.json), zero drift between OS-level backstop and live dispatcher, zero script edits for future guaranteed slots.
**why-decision:** Matcher-driven design is the only option that actually closes the recurring-bug-escalation flag (brief §1) rather than deferring it to the next new slot.
**why-change:** No change from brief §3/§5.1-2. One addition beyond the brief text: discovered empirically (§3.7 told me to verify, not assume) that this macOS host has NEITHER `timeout` NOR `gtimeout` on PATH — implemented a pure-bash background-process + watchdog fallback in `_bounded_exec()`, proven by a regression test (T10) that a hung claude process is actually killed near the configured bound, not just documented as bounded.

### STEP developer-S2 · developer · 2026-07-07T21:20:30Z
**task-id:** FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED
**what-done:** Extended scripts/agents-flow/auditor-tier1-probe.sh with a 6th check (`_check_launchd_agents`) — every repo-tracked launchd/*.plist Label (read off the plist file itself, never hardcoded) must appear in `launchctl list` output. FAILURE verdict + detail naming the missing label(s) if not. Extended auditor-tier1-probe.test.sh with 19 new cases incl. the mandatory injected-fault pair (T25 FAILURE-on-missing, T26 ALL_GREEN-on-restore) per brief §6.7 / feedback_fence_false_green discipline.
**what-considered:**
- Hardcode the required label list (e.g. just "com.vn-market.cowork-guaranteed-slot-firer") — rejected: reintroduces the same hardcode-accretion problem Task 1 was built to avoid; a future new LaunchAgent would need a script edit to be covered.
- SSOT = this repo's own launchd/ directory (chosen) — every tracked *.plist's Label is required-loaded, read live each run. Matches Task 1's own "don't hardcode, read off the SSOT" design philosophy.
**why-decision:** Directly closes the gap the brief found: the old fb-daily-firer plist WAS loaded+firing 07-01→07-04, then silently unloaded with nothing detecting it — this check is the only mechanism in the pipeline that would have caught that unload (verdict=FAILURE → cron-detect-loop spawns system-auditor subagent → its flow alerts BUG channel; unchanged downstream path, no new alerting code needed inside this READ-ONLY pre-gate script per its own PURE SHELL/no-MCP-calls invariant).
**why-change:** No change from brief §3.8. Scoped the "+ bug alert" acceptance wording to what this specific script owns (verdict=FAILURE, detail names the label) — the actual Telegram alert is already inherited via the existing FAILURE→spawn-system-auditor pipeline (cron-detect-loop/SKILL.md Job 2), unchanged and out of this FIX task's file scope.

### STEP developer-S3 · developer · 2026-07-08T00:50:00Z
**task-id:** FIX-NEWS-CB-FALSE-CLOSED
**what-done:** Root-caused two live SOURCE HEALTH bugs in apps/mcp-server (verified apps/news-fetch/ is an unwired parallel pipeline via api-gateway NEWS_URL, not the owner). (A) intelligenceCycleJob.ts's defaultPollNews() re-injected no-op reuters/tradingeconomics stub fetchers every 15-min tick, which pollNews.ts's health loop treats as real failures (STUB_CAPABLE_KEYS doesn't cover them) — silently overwrote the Sprint-1833g recordDisabled() seed with an ever-climbing "down" count (79+, live-confirmed via get_system_status). Fixed by removing those 2 keys entirely, restoring pollNews.ts's own resolvedFetchers contract. (B) formatSourceHealthTable's 18-char name column truncates "Trading Economics" (17c) and "Trading Economics News" (22c) to the identical string — live-confirmed byte-identical duplicate row. Widened to 26c, header/separator now derived from the same constant.
**what-considered:**
- Re-widen the CB failure threshold (original 2026-06-13 filing's proposal) — rejected: the CB already correctly shows "down"; the real bug is a disabled source being re-touched at all, not a threshold miscalibration.
- Add teChromiumNews to STUB_CAPABLE_KEYS too (same class, also shows down/never) — deferred: that source has a real, non-deprecated fetcher (Task 1843 stub is CPU-protection only); its accuracy is a separate, unfiled concern outside this task's DoD (Reuters+TE-legacy only).
**why-decision:** Root-cause fix (stop the re-injection) matches DoD's explicit "fix at the actual call site, not by re-widening the CB threshold" instruction; matches pollNews.ts's own already-documented Sprint-1833g contract, so the fix is 2 deletions, not new logic.
**why-change:** No change from task brief. Original filing's "CB false-closed" framing was stale (dev-team's live pre-check already confirmed CB now correctly reports [OK]→"Ngưng"); root cause evolved into "disabled source shows as broken" — fixed that live bug instead per task's own note "symptom has evolved, build on this, don't re-derive."
