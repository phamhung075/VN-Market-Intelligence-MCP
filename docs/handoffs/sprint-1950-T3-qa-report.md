# QA Report — Sprint 1950-T3: Chef Pipeline Runbook

**date:** 2026-05-18
**outcome:** CHANGES_REQUESTED
**commit reviewed:** 0e3c96c9
**type:** DOCS (XS) — operator runbook for chef pipeline
**zone:** docs/protocols/chef-pipeline-runbook.md + docs/standards/cron-jobs.md + docs/TASKS.md
**round:** 1

---

## Pipeline

- bun test / tsc: N/A — docs-only commit (Markdown), no TypeScript source changed (Smart-Skip)
- DDD scan: N/A — Markdown only, no import boundaries
- Security scan: N/A — no source code, no process.env, no secrets
- Scope: 4 files — all in-scope (runbook + cron-jobs.md pointer + TASKS.md Done stamp + agent-father notebook)
- Commit convention: PASS — `docs(protocols):` type, `protocols` scope (no digit → no Task: trailer required)

---

## AC Matrix

Source: TASKS.md T3 row (REQ_1950.md §T3 was not authored — no formal section exists; TASKS.md row is de-facto spec).

| AC | Check | Result |
|----|-------|--------|
| AC-T3-1 | `docs/protocols/chef-pipeline-runbook.md` exists | PASS |
| AC-T3-2 | Section 1: cron schedule reference (4 dish types + UTC slots) | PASS |
| AC-T3-3 | Section 2: WORK telemetry line meanings (START/SENT/SILENT/FAILED) | PASS |
| AC-T3-4 | Section 3: recovery procedure for missed slot | PASS |
| AC-T3-5 | Reference pointer added to `docs/standards/cron-jobs.md` Chef Cook Schedule section | PASS |
| AC-T3-6 | TASKS.md T3 row stamped Done by agent-father | PASS |

---

## T1 Telemetry Cross-Check (REQ_1950.md §3-4)

| Field | REQ_1950 §3b format | Runbook §2b format | Match |
|-------|--------------------|--------------------|-------|
| START format | `[chef] START {dish_type} \| slot={slot_utc} \| cycle={cycle_id}` | L35-36: identical | PASS |
| SENT format | `[chef] SENT {dish_type} \| slot=... \| cycle=... \| clusters={N} \| convergence={true\|false}` | L49-50: identical | PASS |
| SILENT format | `[chef] SILENT intraday \| slot=... \| cycle=... \| clusters=0` | L63: identical | PASS |
| FAILED format | `[chef] FAILED {dish_type} \| slot=... \| cycle=... \| reason={failure_reason}` | L69: identical | PASS |
| convergence field name | §3b uses `convergence`, §4 schema uses `convergence_detected` | Runbook uses `convergence` — matches §3b and chef.md L207 (pre-existing spec discrepancy; not introduced by T3) | PASS |

---

## T4 Cross-Check (TNB cron `13 20 * * *`)

`docs/protocols/chef-pipeline-runbook.md:22` states: `TNB audit fires at \`13 20 * * *\` (20:13 UTC = 03:13 VN+1)` — matches `docs/standards/cron-jobs.md` L130 SSOT. PASS.

---

## T5 Cross-Check (digest-predict `47 13 * * 0`)

Not in runbook — expected. Runbook scope is chef pipeline (unified-agent). Digest-predict is a separate agent/flow. Out of scope. PASS (no violation).

---

## Blocking Issues

### BLOCK-1: `docs/protocols/chef-pipeline-runbook.md:13-18` — Cron table presents dispatch windows as cron expressions

Section 1 cron table:
```
| `23 5 * * 1-5` | 12:23 | `morning`   | unified-agent |
| `13 2-8 * * 1-5` | XX:13 | `intraday` | unified-agent |
| `37 8 * * 1-5`  | 15:37 | `eod`       | unified-agent |
| `37 19 * * *`   | 02:37+1 | `evening` | unified-agent |
```

Actual registered cron: `29 * * * *` (hourly at :29, via `.claude/commands/crons/cron-unified-agent.md`). The values shown are dispatch time-window filters inside `.claude/flows/unified-agent/main.md`, not cron expressions. Backtick formatting implies cron expressions. On-call running `CronList` will find `29 * * * *` only — none of the listed expressions exist as cron objects.

The recovery row at L108 says "Verify CronList shows correct schedule" without stating what that schedule is (`29 * * * *`). This creates a diagnosis gap for the primary on-call scenario (slot fire verification).

**Required fix:** Add one line to runbook §1 (after table) stating: "The registered cron expression is `29 * * * *` (hourly at :29 UTC). The schedule values above are dispatch time-windows handled inside `main.md` — the cron fires each hour and exits immediately outside these windows." Update L108 recovery row to read: "Verify CronList shows `29 * * * *` for unified-agent."

---

## Non-Blocking Observations

- NB-1: `docs/protocols/chef-pipeline-runbook.md:3` — size-justification comment says `95L`; actual file is 127L. Stale. Update to `127L` when applying BLOCK-1 fix.
- NB-2: `docs/handoffs/REQ_1950.md` — §T3 section was never written. TASKS.md row served as de-facto spec. Not blocking T3 but leaves a requirements gap. Recommend: either add §T3 to REQ_1950.md or accept TASKS.md row as SSOT (no action needed if accepted).

---

## [QA] Review Record

**round:** 1
**verdict:** CHANGES_REQUESTED
**reviewer:** qa
**date:** 2026-05-18
**blocking:** 1
**non-blocking:** 2

Fix required before APPROVED:
- BLOCK-1: `chef-pipeline-runbook.md:13-18` — clarify registered cron = `29 * * * *` (hourly); dispatch windows are internal routing. Update L108 recovery row. Update size-justification to 127L+.
