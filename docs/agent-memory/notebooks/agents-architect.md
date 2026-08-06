# agents-architect — Notebook

## 2026-08-06T06:55:08Z

**Brief:** `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md`

Dispatched to investigate system-auditor's recurring notebook-commit self-report unreliability (crossed 2+ threshold) after it escalated to real data loss: commit `0fcc6a5d2` deleted the `## c44` header (replaced by 2 blank lines) and never wrote the claimed `c45` section. Root-caused to the compose step being 100% LLM-narrated (no actuator, unlike the already-hardened commit-mutex script) combined with the AC-2a immutability pre-commit gate being warn-only (≥6 unactioned WARN hits on this exact file since 2026-07-30) AND structurally blind to this shape even in reject mode (a vanished heading is treated as an authorized whole-section drop with no file-size-shrinkage corroboration). Corroborating: the commit step itself bypassed `auditor-notebook-commit.sh` this cycle (bare-commit sweep-guard escalated-reject 3s pre-landing, `prior_warns=7`). User-flagged hypothesis (shared cause with notebook-auto-prune.sh's pm.md-class ordering bug) mechanically RULED OUT — file was 80/81 lines, far under the 200L cap, so that hook's drop-oldest logic never ran; the ordering bug itself is independently confirmed already-fixed generically in the live script.

**Signal dropped:** `docs/signals/2026-08-06-fix-system-auditor-notebook-compose-actuator.json` → agent-father

---

## 2026-08-06T18:04:27Z

**Brief:** `docs/architecture-briefs/2026-08-06-cadence-reanalysis-v2.md`

Second, deeper pass per user follow-up (economy + DST math). Re-verified live that ALL of CADRAT-1..7 already shipped on `main` — nothing re-proposed. New: (1) confirmed `CronCreate`'s `cron:` field evaluates Europe/Paris-local, not UTC; raw-code-verified `cowork-schedule.json`'s whole 22-slot family is DST-IMMUNE (`getUTCHours()`/`getUTCDay()` in `cowork-match-slots.js`) — so the DST hypothesis is REJECTED for CADRAT-1's open `chef-evening`/`market-watcher-eod` questions, both of which have real unrelated already-tracked root causes instead (chef-evening: `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE`, live in QA cycle-525 today). Found 5 concrete DST fixes among the DST-vulnerable standalone-`CronCreate` family: `cron-db-data-integrity` Job A is HIGH severity — shipped 2 days ago, currently fires 2h early in CEST and misses the settlement window it was built to cover; plus Job B, system-auditor Tier-3 (self-flagged in-repo, unfixed), orch-sentinel FULL+LITE (not armed). (2) Found 6 standalone cron docs superseded by `cowork-schedule.json`, unreachable via any of the 3 re-arm skills: 4 safe to mark DEPRECATED (tran-ngoc-bau, digest-predict, refine-bctc, unified-agent — the last provably dead-by-construction, its `:29` minute never matches its own dispatcher's window table); 2 held OPEN pending a PO/architect product decision (market-watcher/news-scout — live coded market-hours modes designed+shipped+QA'd in May, pruned as dead stubs 2026-05-30, never restored — explicitly NOT recommended for deletion).

**Signal dropped:** `docs/signals/cadence-reanalysis-v2-20260806T180427Z.json` → po (cc agent-father) — AWAITING_USER_CONFIRMATION, informational only

---

## 2026-08-06T22:12:10Z

**Brief:** `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md`

User observed live cross-session cron duplication (4 confirmed duplicate pairs + 3 stale-valued live entries) across 3 concurrent CLI sessions. Root cause: `Cron*` tools are strictly per-session, so each of the 3 re-arm skills' Step-1 guard is blind to peer sessions. Designed a marker (`task_kind` reused as `sprint-task`, `task_id=cron-registration:<family>`, same precedent already used for `cron:<flow>:<TICK>` fire-election markers) gated primarily by `session-presence` liveness cross-check (fast, ≤30min) + `task_force_release_orphan` as the mechanical steal gate — explicitly does not reintroduce the guaranteed-slot-missed regression, since staleness is detected via presence-expiry, not by waiting out the marker's own long TTL. Also fixed the guard's identity+value binary match into an explicit 2-phase classify so a live-but-wrong-valued entry gets replaced in place, not duplicated (closes an already self-flagged-but-unfixed gap in `cron-cowork-team/SKILL.md`'s own rollout note). Split implementation into 2 gated lanes (agent-father direct-implement vs PM→dev-team for a 1-line shared-infra `coordinationStore.ts` change) + a 3rd lane (user-run one-time remediation, zero agent involvement by design).

**Signal dropped:** `docs/signals/2026-08-06-cron-rearm-cross-session-dedup.json` → po (cc agent-father)
