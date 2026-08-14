# Decision Journal — Sprint FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE · qa

**Sprint goal:** direct-commit FIX row, unrelated to any live `sprint_goal.entries[]` — TASK_ID used as SPRINT_ID per established precedent for direct-commit-verify rows.
**Agent:** qa
**Started:** 2026-08-14T04:56:24Z

---

### STEP qa-S1 · qa · 2026-08-14T04:56:24Z
**task-id:** FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`) — independently re-verified commits `6113890bb`+`0f8e8ee07`, did not trust `raw_verified_by=dev-team` prose at face value.
**what-considered:**
- Trust prior raw_verify note alone (dev-team's own 2026-07-30 independent verify) — rejected per task instruction, run own checks.
- Re-derive + re-run everything from source: commit ancestry, diff-vs-files match, own test run, own tsc/DDD/security/mock-guard sweep.
**why-decision:** Both commits real, ancestors of `main` AND `origin/main`; diff matches claimed files exactly (`vpsPushLogStore.ts`, `vpsProxyTools.ts`, later split into `vpsDemandQueue.ts`+`vpsProxyHealthFormat.ts` by an unrelated size-lint refactor — logic verified intact post-split). Targeted test 7/7 (own run, matches claim). Sibling suite 1113+VPT-1: 22/22 (matches claim). Broader downstream suite (1406b, FIX-BCTC-SERVING-GATE-VPSSTALE-*, FIX-BCTC-VPS-QUEUE-STALE-TRIAGE, -SYNC, FIX-VPS-HEALTH-FRESHN): 47/47 green — no regression from later work building on this fix. `tsc --noEmit` clean. DDD scan (domain→infra/application imports on touched files): 0 matches. Security scan (process.env, password/secret/token): 0 matches. `mock-guard.sh --files <4 touched prod files>`: PASS. `rebuild_required=true` is an orthogonal ops/deploy concern (live undeployed tool still reproduces pre-fix bug) — out of scope for QA's source-level gate, left untouched on the row.
**why-change:** No change from plan — verify-committed JUMP-TO per dev-team spawn context, all checks green, zero ISSUE → `vc-approved`.

### STEP qa-S2 · qa · 2026-08-14T04:58:03Z
**task-id:** (ambient — incidental discovery, not this task's own scope)
**what-done:** My own notebook Edit (cycle-709 insert) triggered `notebook-auto-prune.sh`'s byte-cap drop-oldest loop, which dropped `## cycle-708` instead of the chronologically-older `## cycle-705`.
**what-considered:**
- Self-repair by re-editing the notebook — rejected, would retrigger the identical bug (same commit-hash-in-heading collision) and risks duplicate-heading corruption.
- Leave as-is + report — content not actually lost (git commit `ba1e275c8` + `orch-state.json.task_board.done_verified[]` already hold the authoritative record for cycle-708's own task).
**why-decision:** Root-caused via direct repro: `lib/notebook-section-direction.sh`'s `nso_ts_key()` regex matches ANY 8-consecutive-digit run, and `tail -1` picks the LAST match in the heading. cycle-705's heading contains commit `` `761988143` `` (9 digits, no letters) AFTER its real ISO timestamp — the regex grabs `76198814` from inside the hash, producing sort-key `76198814000000000` (implausible far-future date), which made the middle section (cycle-708) look like the numeric minimum instead. Confirmed via direct `nso_sections_with_ts` invocation on the reconstructed pre-hook content. Not this task's scope to fix (QA `not_my_job`: infra diagnosis is developer/ops's job) — flagging for router/PO routing instead of silently absorbing.
**why-change:** Ambient — ad-hoc discovery, reported in RETURN block, not actioned by this session.

