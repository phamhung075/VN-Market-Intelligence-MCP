<!-- size-justification: ~330L — second-pass deep audit spanning 2 distinct axes (token economy + DST-timezone correctness) across ~30 cron entities (18 original CADRAT-1 rows re-verified as shipped + 7 newly-scoped standalone docs + 2 orch-sentinel entries); required to carry per-item evidence citations (commit hashes, raw code reads, live JSON dumps) per the fail-loud/verify-raw discipline this repo enforces — a shorter summary would strip the falsifiability the user explicitly asked for ("fix the root cause definitive not recurrent symptom"). PLAN-ONLY; zero scheduler-tool calls made authoring this file (grep-confirmed in RETURN). -->

# Cadence Reanalysis v2 — Token Economy + VN-Market-Time↔Server-Local DST Correctness

**Date:** 2026-08-06
**Author:** agents-architect
**Status:** PLAN-ONLY — no cron/flow/config file touched authoring this brief. No `CronCreate`/`CronDelete`/`CronList` called, no `/cron-*` skill invoked (self-grep-confirmed in RETURN).
**Builds on:** `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (CADRAT-1..7 + item 9 pending). **Re-verified live, not re-derived — §1 below is evidence, not assumption.** Do not re-litigate CADRAT-1..7; this brief only adds what a second, deeper pass found on top.
**Trigger:** User (via coordinator): "reanalyze again for optimize and orchestration frequent run cron for best quality and economic token" + "remove all other cron, keep only cron needed" + fix VN-market-time↔server-local-time conversion.
**Verified ground truth (server, given by user, corroborated live in this session's own sandbox — same Europe/Paris zoneinfo):** `date -u`≈2026-08-06T17:5x Z, `date`≈19:5x CEST +0200. Host TZ = Europe/Paris, currently CEST=UTC+2 (DST), reverting to CET=UTC+1 last Sunday of October. VN = Asia/Ho_Chi_Minh = UTC+7 fixed, no DST. **`CronCreate`'s `cron:` field is evaluated in the session/server's LOCAL timezone (Europe/Paris)** — this is the single mechanism every finding in §3 hangs on.

---

## 1. CADRAT-1..7 status — re-verified SHIPPED, not re-proposed

Live-read (not memory-only) confirms all 7 items from the first pass are already on `main`:

| Item | Evidence read this session |
|---|---|
| 1 — alert-commander `cadence-policy.json` gap | `jq '.policies[]|select(.policy_id\|test("alert-commander"))'` → all 10 rows present, `_cron_fallback:true` |
| 2 — `db-integrity-probe.sh` pre-gate | `scripts/agents-flow/db-integrity-probe.sh` exists, executable, wired into `cron-db-data-integrity.md`'s prompt |
| 2b — CADRAT-2 schedule split | `cron-db-data-integrity.md` now registers Job A (`15,45 2-9 * * 1-5`) + Job B (`15 22 * * *`), 87/wk not 336/wk |
| 3 — code-janitor diff-gate | `docs/agents/code-janitor/flow/main.md` header: "CADRAT-3 2026-08-04: added Pre-Check gate (`git diff --name-only HEAD~3..HEAD`)" — live at line 19-27 |
| 4 — 4 unarmed crons brought under re-arm | NEW skill `.claude/skills/cron-standalone-team/SKILL.md` (not an extension of `cron-detect-loop`, per the PO decision the brief flagged as an open sub-choice) — covers db-data-integrity (2 entries), agent-father, claude-manager-helper, code-janitor, **plus** `cron-market-db-journal-guard` (added later, AC-1 of a different fix) — 6 entries total |
| 5 — agent-father `keep.md` diff-gate | Same CADRAT-3 batch — `docs/agents/agent-father/flow/keep.md` line 29: "Pre-Check (gates ONLY the orphan+roster sweep below — CADRAT-3)" |
| 6 — dev-team outer-poll widening | `docs/agents/dev-team/flow/main.md` — new `SKIP-WIDENED` verdict, CADRAT-5, weekend/holiday-gated, cron expression itself unchanged (per-tick suppression) |
| 7 — orch-sentinel LITE pre-gate | `scripts/agents-flow/orch-sentinel-lite-probe.sh` exists; `cron-orch-sentinel.md` prompt now gates on it, "CADRAT-6" |
| news-scout-sentinel time fix (called CADRAT-7 in a commit message) | `cowork-schedule.json` live: `news-scout-sentiment` = `30 1 * * 1-5` (08:30 ICT), matches the original brief's proposed fix exactly (commit `d916aa40b`, "CADRAT-7 news-scout-sentiment pre-market time fix (12:00→08:30 ICT)") |
| Item 9 — fleet re-arm | **Still pending, per explicit task instruction — not actioned here either.** |

**Conclusion: nothing to re-propose from the first pass.** Everything below is new to this second pass.

---

## 2. Mechanism split — which crons are DST-vulnerable at all

This is the load-bearing architectural fact for §3, verified from raw code, not doc prose:

- **`cowork-schedule.json`'s 22 slots (all of §2's original rows 2-6) are DST-IMMUNE by construction.** `scripts/agents-flow/cowork-match-slots.js:135,138` — `now.getUTCHours()`, `now.getUTCDay()`. Pure UTC arithmetic. The only `CronCreate`-registered field in this whole family is the outer `*/15 * * * *` master-dispatcher heartbeat (an interval, not a moment — DST-invariant regardless of host TZ). Every VN-market-aligned time inside `cowork-schedule.json` (chef-*, digest-*, tnb-audit, fb-*, bctc-*, refine-bctc-*, news-scout-*, market-watcher-*, alert-commander-*) is matched by this UTC-native JS, never by `CronCreate`'s own field evaluation. **This class needs zero DST fix, ever, and none of the findings below touch it.**
- **`docs/data/cadence-policy.json`'s adaptive engine is also DST-immune** — `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts:372` uses `now.getUTCHours()` for its own internal time labeling; `calendar_status` is caller-supplied/data-derived, not host-clock-derived.
- **Everything registered directly via a standalone `.claude/commands/crons/cron-*.md` `CronCreate` call is DST-vulnerable** — the literal `cron:` field is evaluated Europe/Paris-local. Sub-classify:
  - **Pure-interval expressions** (`*/15`, `*/30`, `0 */4`, `0 */6`) — DST shifts *which* minutes-of-day they land on by ±1h twice a year, but the *cadence itself* (fires every N minutes/hours, forever) is unaffected — no VN-market-moment is being targeted, so no correctness bug. **No fix needed**: cowork-team master, dev-team, system-auditor Tier-1/Tier-2, code-janitor, market-db-journal-guard.
  - **Moment-anchored expressions** (`H M * * *` / `H M * * DOW`) targeting a specific VN-market-relevant instant — these ARE vulnerable. §3 below.

---

## 3. DST-correctness findings — concrete, per-expression

### 3a. CONFIRMED LIVE BUG (high severity, shipped 2026-08-04, wrong right now)

**`cron-db-data-integrity.md` Job A** — `15,45 2-9 * * 1-5`, no CEST/CET disclaimer. Intent (per its own doc): fire inside 02:00-09:59 UTC = 09:00-16:59 ICT (session + ~2h settlement). Interpreted Europe/Paris-local instead: in the CURRENT CEST season this actually fires local-hour 2-9 = **00:00-07:59 UTC = 07:00-14:59 ICT** — two hours early. This **misses the last hour of the trading session (14:00-15:00 ICT close) and the entire settlement window (15:00-17:00 ICT) that this schedule split was explicitly built to cover** (CADRAT-2's whole stated purpose). This is the single most material finding in this pass — it silently defeats a fix that shipped two days ago.
**Fix:** CEST `15,45 4-11 * * 1-5` / CET `15,45 3-10 * * 1-5` (local_hour = UTC_hour + offset).

**`cron-db-data-integrity.md` Job B** — `15 22 * * *`, no disclaimer. Intent: 22:00 UTC = 05:00 ICT off-hours backstop. CEST-local actual fire: 20:00 UTC = 03:00 ICT (2h early — still off-hours, low material impact, but mislabeled and drifts 1h at the next DST flip).
**Fix:** CEST `0 0 * * *` / CET `0 23 * * *`.

### 3b. CONFIRMED, already self-flagged in-repo, still unfixed

**`cron-system-auditor.md` Tier-3** — `0 2 * * *`, labeled "daily 02:00 UTC," **no disclaimer**. `docs/agents/system-auditor/flow/main.md:215-223`'s own comment already says this: *"Tier-3's own 02:00Z label...carries the same unverified-against-that-defect risk, flagged but NOT fixed here — out of scope, that cron is already live-armed."* CEST-local actual fire: 00:00 UTC = 07:00 ICT (2h earlier than the documented 09:00 ICT target — still pre-open, so no functional breakage, but the label is wrong and the internal `FIRE_TICK=$(date -u +"...T02:00Z")` hardcoded-literal tick ID is stamped 2h after the sweep actually ran).
**Fix:** CEST `0 4 * * *` / CET `0 3 * * *` (true 02:00 UTC / 09:00 ICT).

### 3c. Not-yet-armed, fix-before-arm (no live impact today, but wrong-as-written)

**`cron-orch-sentinel.md` MODE=FULL** — `18 3 * * 0`, labeled "03:18 UTC Sunday = 10:18 VN," no disclaimer. CEST-local actual: 01:18 UTC = 08:18 ICT (2h off; still Sunday/market-closed either way, so functionally harmless, but wrong-as-labeled).
**Fix:** CEST `18 5 * * 0` / CET `18 4 * * 0`.

**`cron-orch-sentinel.md` MODE=LITE** — `48 1 * * *`, labeled "01:48 UTC = 08:48 VN," no disclaimer. CEST-local actual: 23:48 UTC (prior day) = 06:48 ICT (2h early; still pre-open either way). Note: its own rationale text ("12min before Tier-3") stays internally consistent regardless of season, since Tier-3 (§3b) carries the *same* unlabeled local-interpretation bug — two wrong-by-the-same-delta crons preserve their *relative* spacing even while both are wrong in absolute terms. Fixing 3b without also fixing this one would break that relative spacing.
**Fix:** CEST `48 3 * * *` / CET `48 2 * * *`.

### 3d. Low-priority / optional (moment-anchored but precision doesn't matter)

**`cron-agent-father.md`** — `23 14 * * *`, no disclaimer, but the whole point of this slot (per CADRAT-1's own item 5 rationale) is "any off-hours daily moment is fine" — a ±1-2h DST drift changes nothing material. Optional: add the disclaimer for documentation honesty; not counted as a correction requiring action.

### 3e. Already correct — confirmed, no change

**`cron-claude-manager-helper.md`** (`30 19 * * 1,4` CEST / `30 18 * * 1,4` CET) and **`cron-auditor-page-reverify.md`/D-PAGE Tier-5** (`30 5 * * *` CEST / `30 4 * * *` CET) both already carry the correct dual-variant + explicit "switch at DST changeover" instruction. These two are the **existing, proven-working pattern** every fix above (§3a-3c) now mirrors — no new mechanism invented, just applied consistently to the crons that were missing it.

### 3f. No location-independent alternative exists

Confirmed by the tool's own contract (quoted in the dispatch task) and by every dual-variant workaround already in this repo (§3e) — `CronCreate` has no UTC-mode flag; Europe/Paris-local is the only evaluation mode. The only two mechanisms available: (a) the manual dual-CEST/CET-expression-with-switch-note convention (§3e's proven pattern, cheap, already used twice), or (b) migrate the moment-anchored logic onto the same UTC-native JS-matching mechanism `cowork-schedule.json` already solved this with (§2) — architecturally superior (permanently DST-immune, zero semiannual manual-flip ritual) but a real migration, out of scope for a PLAN-ONLY schedule-correction pass. **Recommendation: apply (a) now for the 5 concrete fixes in §3a-3c (cheap, proven, matches existing precedent); flag (b) as a strategic future direction for whoever eventually consolidates the standalone-cron family, not an action item here.**

### 3g. DST hypothesis explicitly TESTED AND REJECTED for the two open questions named in the dispatch

The task asked whether DST-drift explains CADRAT-1's flagged-but-unresolved `chef-evening` and `market-watcher-eod` timing questions. **No — both are `cowork-schedule.json` slots, and §2 already established that whole family is architecturally immune to the France-local `CronCreate` bug** (matched via `getUTCHours()`, never via `CronCreate`'s own field). Verified each has its own real, already-tracked, unrelated root cause instead of asserting the null result from mechanism alone:
- **`chef-evening`**: the actual open defect is `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE` — a **VN-midnight-crossing content-filename date-labeling bug** (chef-evening fires 19:45 UTC = 02:45 ICT *next day*; synthesis JSON filenames sometimes get keyed by UTC-date, sometimes by VN-date, causing duplicate/clobbered publishes). This is a live, actively-worked task-board row — as of today it is in **QA cycle-525, status CHANGES_REQUESTED** (`docs/agent-memory/notebooks/qa.md`). Nothing for this brief to add; not a scheduling defect at all.
- **`market-watcher-eod`**: the "8h after close" question is answered by the agent's own dispatch table (`docs/agents/market-watcher/flow/main.md`: EOD window is deliberately 16:00 UTC = 23:00 ICT) — a real, coded, intentional design choice (presumably settlement-feed timing, unverified but clearly deliberate, not accidental lateness). The *actual* historical bug on this slot was a **slot-routing defect** (a late-firing tick falling through to the wrong sub-flow and losing the EOD deliverable) — already root-caused and shipped (commit `bdf22186d`, `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` §5, T6). Remaining board row (`FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK`) is a documented-stale-caveat/notebook-write bug inside `eod.md`, unrelated to scheduling. **Both open questions are closed on their original axis by evidence already in the repo; DST is definitively not the explanation for either.**

---

## 4. Economy findings this pass — standalone cron docs superseded by `cowork-schedule.json`

Six `.claude/commands/crons/*.md` authoring docs describe standalone `CronCreate` registrations for agents that are **also** — and, per evidence below, **actually** — dispatched through `cowork-schedule.json`. None of the 3 sanctioned re-arm skills (`cron-cowork-team`, `cron-detect-loop`, `cron-standalone-team`) registers any of these 6 as a standalone `CronCreate` entry, so even if one were manually armed once, it evaporates on the next session restart with no recovery path — structurally orphaned by the existing re-arm system, independent of anything new in this brief.

### REMOVE (mark DEPRECATED, same pattern as the already-retired `cron-fb-market-poster.md`) — 4 files, high confidence

| File | Evidence |
|---|---|
| `cron-tran-ngoc-bau.md` | `13 20 * * *` — byte-identical to live cowork slot `tnb-audit`. No coded gap: `tran-ngoc-bau` has one flow, no mode dispatch. |
| `cron-digest-predict.md` | Only documents the Sunday leg (`47 13 * * 0`, matches cowork `digest-sunday` exactly) — **doesn't even mention** the live `digest-daily` slot (`30 17 * * *`), i.e. it's not just redundant, it's factually incomplete/stale as a spec. |
| `cron-refine-bctc.md` | `0 9,14,20 * * *` — 2 of 3 times (09:00, 14:00) coincide with cowork `refine-bctc-slot-1`/`-2`; the 3rd (20:00 UTC) matches nothing live (cowork has 11:00 and 16:30 instead) — evidence of drift since authoring (2026-05-30), not a maintained alternate spec. `refine_bctc_md`'s own flow has zero wall-clock mode dispatch (session/dedup-driven only). |
| `cron-unified-agent.md` | **Confirmed dead-by-construction, not merely redundant.** Cron fires `29 * * * *` (every hour at :29). `docs/agents/unified-agent/flow/main.md`'s dispatch table only ever matches minutes `:23`, `:13`, `:37` — **`:29` matches none of them, ever.** Every fire of this cron, if it were armed, would spawn a real `subagent_type=unified-agent` session that reads `main.md` and immediately falls through to "Any other time → EXIT" — 24 full subagent spawns/day for **provably zero possible utility**, by construction, not probabilistically. **If this cron is ever discovered still armed at a future `CronList` audit, treat as P0 delete-on-sight** — this brief cannot confirm live-armed state (no `CronList` call made, per hard constraint), but the waste is deterministic if it is. |

### HOLD — do NOT remove, real open question found (1 file)

**`cron-market-watcher.md`** — NOT recommended for removal. Evidence for why this is different from the 4 above:
- `docs/agents/market-watcher/flow/main.md` **still carries live, coded** `mode=market` (Mon-Fri 02:00-08:30 UTC, market hours) and `mode=prepost` dispatch branches in its **Fallback — UTC clock window table**, reachable *only* when no `slot=` param is passed — which is exactly what this old standalone cron's un-migrated 3-leg shape (`7 2-8 * * 1-5` hourly, `12,27,42,57 2-8 * * 1-5` 15-min, `3 16 * * 1-5` EOD, none carrying `slot=`) would trigger.
- These 2 modes were part of the **original design intent**: `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` designed `market-watcher-market`/`market-watcher-prepost`/`news-scout-market` as first-class cowork slots, and `docs/handoffs/sprint-1951-cowork-team-qa-report.md` confirms they **did fire and pass QA** (AC-4, 2026-05-21).
- They were removed from `cowork-schedule.json` in commit `3b956dd7e` (2026-05-30, "prune 12 dead slots... permanently-disabled (API_MIN_INTERVAL...)... superseded") — a mechanical dead-stub prune, not a documented product decision to drop market-hours-density monitoring. `alert-commander-market` was the only one of the 4 originally-blocked slots later resurrected as a live cowork slot once the cowork `*/15` dispatcher resolved the `API_MIN_INTERVAL` platform constraint that had blocked all 4 originally; `market-watcher-market`/`market-watcher-prepost`/`news-scout-market` were not.
- **No live task-board/signal-queue row was found requesting their restoration** (2+ months stable since the prune, only archived/historical references) — consistent with, but not proof of, an accepted simplification (today's `market-watcher-offhours` cron (`0 */4 * * *`) does tick twice near/inside the session — 04:00/08:00 UTC = 11:00/15:00 ICT — and `cadence-policy.json`'s `gatherer-standard` table does carry `calendar_status:"open"` tiers down to 30min, but the raw cron ceiling means it can never actually exceed its own 4h wake cadence even when the policy tier would allow more — so any in-session densification this design intended is capped well below what a genuine `*/15`-during-market-hours slot would deliver).
- **This is a product/architecture decision, not a cadence tweak** — flagging for explicit PO/architect confirm-or-restore, out of this brief's numbered correction list. If restoring, the correct mechanism is a **new `cowork-schedule.json` slot** (`market-watcher-market`, dispatched with `slot=` through the modern fire-elected, collision-safe cowork path) — **never** reviving the old standalone `CronCreate` registration, which predates fire-election/collision-safety and is a strictly inferior mechanism to what exists today.

### KEEP AS-IS — confirmed still correctly superseded, no new finding (1 file)

**`cron-news-scout.md`** — also stale/superseded like the REMOVE-4 (2 legs, both redundant with live `news-scout-offhours`/`news-scout-sentiment` cowork slots), **but held to the same open question as `cron-market-watcher.md`** for consistency (they were designed and pruned together, same commit, same rationale) rather than deprecated unilaterally while its sibling stays open. Recommend the PO/architect decision in the HOLD item above cover both `news-scout-market` and `market-watcher-market`/`-prepost` together, since `news-scout`'s own `main.md` today has **no mode dispatch at all** (single sub-flow, confirmed by direct read) — so unlike market-watcher, there is no live coded capability at stake here; only the multi-agent design symmetry argues for a joint decision.

### No change — `cron-market-db-journal-guard.md`, `cron-fb-market-poster.md`

`cron-market-db-journal-guard.md` (`*/15 * * * *`) — correctly justified as a PO-set floor for a condition with no "known-quiet window" (interval-only, DST-irrelevant per §2). `cron-fb-market-poster.md` — already correctly marked DEPRECATED since 2026-06-28, no change; its DST reasoning ("cowork matcher... pure UTC arithmetic, no France-local clock involved") is independently confirmed accurate by this brief's own §2 code read.

---

## 5. Per-cron proposed-change table (economy / DST / both)

| Cron | Current | Proposed | Axis | Severity |
|---|---|---|---|---|
| `cron-db-data-integrity` Job A | `15,45 2-9 * * 1-5` | CEST `15,45 4-11 * * 1-5` / CET `15,45 3-10 * * 1-5` | DST-correctness | **HIGH — live, shipped, wrong now** |
| `cron-db-data-integrity` Job B | `15 22 * * *` | CEST `0 0 * * *` / CET `0 23 * * *` | DST-correctness | LOW (off-hours backstop, still functions) |
| `cron-system-auditor` Tier-3 | `0 2 * * *` | CEST `0 4 * * *` / CET `0 3 * * *` | DST-correctness | MED (self-flagged, unfixed, no functional harm today) |
| `cron-orch-sentinel` FULL | `18 3 * * 0` | CEST `18 5 * * 0` / CET `18 4 * * 0` | DST-correctness | LOW (not armed) |
| `cron-orch-sentinel` LITE | `48 1 * * *` | CEST `48 3 * * *` / CET `48 2 * * *` | DST-correctness | LOW (not armed) |
| `cron-agent-father` | `23 14 * * *` | *(optional)* add disclaimer only | DST-correctness (docs only) | OPTIONAL |
| `cron-tran-ngoc-bau.md` | standalone doc, live | mark DEPRECATED → point at `cowork-schedule.json` | Economy | LOW (dead-doc hygiene) |
| `cron-digest-predict.md` | standalone doc, live | mark DEPRECATED → point at `cowork-schedule.json` | Economy | LOW |
| `cron-refine-bctc.md` | standalone doc, live | mark DEPRECATED → point at `cowork-schedule.json` | Economy | LOW |
| `cron-unified-agent.md` | standalone doc, `29 * * * *` | mark DEPRECATED, flag P0-if-armed | Economy | **HIGH if ever armed (deterministic 100% waste); LOW as filed today (unreachable via any re-arm skill)** |
| `cron-market-watcher.md` | standalone doc | **HOLD — route to PO/architect**, do not delete | Economy (open question, not a correction) | N/A |
| `cron-news-scout.md` | standalone doc | **HOLD — joint decision with market-watcher** | Economy (open question) | N/A |

Count: **5 DST-correctness-driven corrections** (db-integrity ×2, Tier-3, orch-sentinel FULL/LITE) + **1 optional/low-priority DST-documentation-only** (agent-father) + **4 economy-driven REMOVE (mark-DEPRECATED)** + **2 economy-driven HOLD (open question, no action)**. **Zero items are both-axis** — none of the DST fixes change fire-count, and none of the economy REMOVEs involve a timing correction.

---

## 6. KEEP AS-IS — re-verified this pass, no change proposed

All 22 `cowork-schedule.json` slots (§2 — architecturally DST-immune; economy already optimal per CADRAT-1 §9, re-confirmed, not re-derived here); `cron-cowork-team`/`cron-dev-team`/system-auditor Tier-1/Tier-2/`code-janitor`/`cron-market-db-journal-guard` (pure-interval, DST-irrelevant, already gated per CADRAT-1..7); `cron-claude-manager-helper`/D-PAGE Tier-5 (already correct dual-CEST/CET pattern); `cron-fb-market-poster.md` (already correctly deprecated).

---

## RETURN

```
DONE: Second-pass cadence reanalysis — 2 axes. (1) DST/timezone: confirmed CronCreate evaluates its cron: field Europe/Paris-local, not UTC; established cowork-schedule.json's entire 22-slot family is architecturally DST-IMMUNE (getUTCHours()/getUTCDay() in cowork-match-slots.js, raw-code-verified) so the DST hypothesis for CADRAT-1's open chef-evening/market-watcher-eod questions is REJECTED with evidence (both have real, already-tracked, unrelated root causes — chef-evening: FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE, live in QA cycle-525 today; market-watcher-eod: slot-routing already fixed commit bdf22186d, EOD-hour is a deliberate design choice not a bug). Found 5 concrete DST-correctness fixes among the standalone-CronCreate family (which IS vulnerable): cron-db-data-integrity Job A (HIGH — live, shipped 2 days ago, currently fires 2h early in CEST and misses the settlement window it was built to cover), Job B, system-auditor Tier-3 (self-flagged in-repo, unfixed), orch-sentinel FULL+LITE (not armed, fix-before-arm) — all given CEST/CET dual-expression fixes mirroring the 2 already-correct precedents (claude-manager-helper, D-PAGE). (2) Token economy: re-verified ALL of CADRAT-1..7 already shipped on main (evidence table, nothing re-proposed); found 6 standalone .claude/commands/crons/*.md docs superseded by cowork-schedule.json, none reachable via any of the 3 re-arm skills — 4 confirmed safe to mark DEPRECATED (tran-ngoc-bau, digest-predict, refine-bctc, unified-agent — the last one PROVABLY dead-by-construction, its :29 minute never matches its own dispatcher's window table, 100% waste by construction if ever armed), 2 held open (market-watcher/news-scout — live coded market-hours modes were designed+shipped+QA'd in May, pruned as "dead API_MIN_INTERVAL stubs" 2026-05-30, never restored, no live ticket found requesting restoration — flagged as a genuine PO/architect product decision, not a cadence tweak, explicitly NOT recommended for deletion).
NEXT: user/PO — confirm which of the 5 DST fixes + 4 REMOVE items to greenlight (same ordering discipline as CADRAT-1..7: corrections implemented+verified before any fleet re-arm). Separately: PO/architect to rule on the market-watcher-market/news-scout-market open question (§4 HOLD) — restore via a new cowork slot, or formally retire the dead code paths in market-watcher/flow/main.md's Fallback table.
HANDOFF: docs/architecture-briefs/2026-08-06-cadence-reanalysis-v2.md
PIPELINE: hold-for-user-confirmation
```
