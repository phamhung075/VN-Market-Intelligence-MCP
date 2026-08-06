# agents-architect — Notebook

## 2026-08-04T19:41:52Z

**Brief:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (updated in place, no new file)

User re-scoped again (via coordinator): raw cron SCHEDULES themselves, not just runtime pre-gates — "cron run all time on all day, is not need for do like this... replan correct time for cron run." Added §9 (Schedule Re-Timing): for all 18 inventoried crons (38 individual cron-expressions once multi-slot rows are expanded), computed exact fires/24h + fires/7d arithmetic, converted UTC→ICT against real VN market hours (09:00–11:30/13:00–15:00 ICT Mon-Fri), and assessed market-hours-awareness at the cron-expression level (not runtime gate). Found current total ≈2,187 fires/wk vs proposed ≈1,938 fires/wk (−249/wk, ≈−11.4%) — nearly the entire delta from ONE concrete fix: `cron-db-data-integrity.md` (336→87/wk, proposed `15,45 2-9 * * 1-5` weekday session+settlement window + `15 22 * * *` daily off-hours backstop — watched tables provably can't change outside trading hours). Also found `news-scout-sentiment` mislabeled ("pre-market batch" but fires 05:00 UTC=12:00 ICT, 3h after open, during lunch closure — proposed shift to 01:30 UTC=08:30 ICT, frequency unchanged). Flagged (not fixed, insufficient evidence) `chef-evening` (2/7 weekly fires preview non-trading Sat/Sun mornings) and `market-watcher-eod` (fires 8h after close, purpose unverified). Explicitly held the line on NOT changing cowork heartbeat/dev-team/auditor Tier-1-2-3/alert-commander — all individually justified as "fires often because it needs to" (off-hours guaranteed-slot wakeup, infra can crash any hour per existing memory lesson, live position monitoring, 24/7 legal/crisis coverage) — reconciled explicitly that §8's pre-gates and §9's re-timing are additive not substitutable for db-data-integrity (pre-gate cuts spawn-per-fire; re-timing cuts fire-count itself; compounds). §8's ordering constraint (corrections before re-arm) left unchanged, still governs §9's findings too.

**Signal dropped:** `docs/signals/cadence-rationalization-20260804T181613Z.json` (updated, same file) → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only

---

## 2026-08-06T06:55:08Z

**Brief:** `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md`

Dispatched to investigate system-auditor's recurring notebook-commit self-report unreliability (crossed 2+ threshold) after it escalated to real data loss: commit `0fcc6a5d2` deleted the `## c44` header (replaced by 2 blank lines) and never wrote the claimed `c45` section. Root-caused to the compose step being 100% LLM-narrated (no actuator, unlike the already-hardened commit-mutex script) combined with the AC-2a immutability pre-commit gate being warn-only (≥6 unactioned WARN hits on this exact file since 2026-07-30) AND structurally blind to this shape even in reject mode (a vanished heading is treated as an authorized whole-section drop with no file-size-shrinkage corroboration). Corroborating: the commit step itself bypassed `auditor-notebook-commit.sh` this cycle (bare-commit sweep-guard escalated-reject 3s pre-landing, `prior_warns=7`). User-flagged hypothesis (shared cause with notebook-auto-prune.sh's pm.md-class ordering bug) mechanically RULED OUT — file was 80/81 lines, far under the 200L cap, so that hook's drop-oldest logic never ran; the ordering bug itself is independently confirmed already-fixed generically in the live script.

**Signal dropped:** `docs/signals/2026-08-06-fix-system-auditor-notebook-compose-actuator.json` → agent-father

---

## 2026-08-06T18:04:27Z

**Brief:** `docs/architecture-briefs/2026-08-06-cadence-reanalysis-v2.md`

Second, deeper pass per user follow-up (economy + DST math). Re-verified live that ALL of CADRAT-1..7 already shipped on `main` — nothing re-proposed. New: (1) confirmed `CronCreate`'s `cron:` field evaluates Europe/Paris-local, not UTC; raw-code-verified `cowork-schedule.json`'s whole 22-slot family is DST-IMMUNE (`getUTCHours()`/`getUTCDay()` in `cowork-match-slots.js`) — so the DST hypothesis is REJECTED for CADRAT-1's open `chef-evening`/`market-watcher-eod` questions, both of which have real unrelated already-tracked root causes instead (chef-evening: `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE`, live in QA cycle-525 today). Found 5 concrete DST fixes among the DST-vulnerable standalone-`CronCreate` family: `cron-db-data-integrity` Job A is HIGH severity — shipped 2 days ago, currently fires 2h early in CEST and misses the settlement window it was built to cover; plus Job B, system-auditor Tier-3 (self-flagged in-repo, unfixed), orch-sentinel FULL+LITE (not armed). (2) Found 6 standalone cron docs superseded by `cowork-schedule.json`, unreachable via any of the 3 re-arm skills: 4 safe to mark DEPRECATED (tran-ngoc-bau, digest-predict, refine-bctc, unified-agent — the last provably dead-by-construction, its `:29` minute never matches its own dispatcher's window table); 2 held OPEN pending a PO/architect product decision (market-watcher/news-scout — live coded market-hours modes designed+shipped+QA'd in May, pruned as dead stubs 2026-05-30, never restored — explicitly NOT recommended for deletion).

**Signal dropped:** `docs/signals/cadence-reanalysis-v2-20260806T180427Z.json` → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only
