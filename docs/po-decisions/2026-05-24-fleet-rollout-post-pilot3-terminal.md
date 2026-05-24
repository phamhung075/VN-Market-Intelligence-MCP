---
title: "Fleet-Rollout Decision — post stock-price terminal: WIP=2 reallocation, kinh-dich Phase-2, alert-engine charter, index-race fix"
date: "2026-05-24"
author: "po"
status: "DECIDED"
decided_at: "2026-05-24T02:35:38Z"
program: "fleet-factory-rollout"
program_goal_verbatim: "complete all microservice factory and make dashboard of each service working revealing functions of his microservice server"
trigger: "stock-price (pilot-3) reached terminal 12/12 DONE verdict=scale this session — FIRST fleet pilot at terminal — freeing one WIP slot"
trigger_decision_doc: "docs/po-decisions/2026-05-24-stock-price-phase3-terminal-12of12-close.md"
trigger_signal: "docs/signals/po-sp-phase3-terminal-close-20260524T022836Z.json"
head_at_decision: "40bd3134"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — ancestor of HEAD, verified)"
authority: "PO full autonomy (feedback_po_autonomy). RATIFY + AUTHORIZE + SEQUENCE only — does NOT implement, does NOT mutate any PM-owned pilot SSOT (Charter §4.5). Emits signals; cannot spawn agents — main-router fans out."
serialization_context: "INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION active (router escalation main-router-P2-F-fragmented-move-finding-20260524T004620Z.json)"
---

# Fleet-Rollout Decision — Post stock-price (pilot-3) Terminal 12/12

stock-price reached **terminal 12/12 DONE, verdict=`scale`** this session (decision doc `2026-05-24-stock-price-phase3-terminal-12of12-close.md`, signal `po-sp-phase3-terminal-close-20260524T022836Z.json`, atomic SSOT commit `39260588`). It is the FIRST fleet-rollout pilot to reach terminal — the third consecutive 12/12 verdict=`scale` after technical-analysis and macro-indicators. This **frees one WIP slot** and **satisfies the prior PO HOLD condition on pilot-5 (alert-engine)**.

This doc records four rulings. I RATIFY / AUTHORIZE / SEQUENCE; I do not implement, and I author **nothing** in any PM-owned pilot SSOT (Charter §4.5 — goal flips and decisionMatrix are PO-only AND terminal-only, which is not this step).

All facts verified against `docs/data/system-map.json` (jq, never hardcoded) and the per-pilot SSOTs `docs/data/pilot-status-*.json`.

---

## Fleet State (verified this cycle)

| Pilot | Service | Lang | SSOT status | Phase posture | In WIP? |
|---|---|---|---|---|---|
| 3 | stock-price | Go | **DONE** (verdict=scale, 12/12, sprintCount=1) | TERMINAL — dormant | **freed slot** |
| — | technical-analysis | TS | CLOSED (verdict=scale) | dormant, dashboard in SI-2 | no |
| — | macro-indicators | TS | CLOSED (verdict=scale) | dormant, dashboard in SI-2 | no |
| 4 | kinh-dich-service | TS | ACTIVE | **Phase-1 APPROVED** (clean full GO, QA `34205c87`); Phase-2 = NOT-STARTED | **yes (active)** |
| 5 | alert-engine | Go | not chartered | prior HOLD now SATISFIED | candidate |
| 6 | news-fetch | TS | not chartered | gated on SI-3 (done) + SI-5 | not now |
| 7 | pdf-extractor | Python | not chartered | gated on SI-4 (Python fence) | not now |
| 8 | rag-service | Python | not chartered | gated on SI-4 | not now |

**Infra rows in SI-2 (mcp-server / api-gateway / frontend): NOT factory pilots.** Judged out of factory scope: api-gateway (`tools:[]`, `crons:[]` — pure HTTP routing/health aggregation, no domain primitives to decompose), frontend (UI host, port 3001 — it is the *consumer* of dashboards, not a function-revealing microservice), mcp-server (the MCP interface/orchestrator itself — its decomposition is the separate `2026-05-22-refactor` megabarrel track, not the per-service factory). The program goal — "dashboard of each service revealing functions of his microservice server" — targets the **function-bearing domain services** (the 6 RED/in-scope: kinh-dich, alert-engine, news-fetch, pdf-extractor, rag-service, plus the 3 already-closed). These three infra rows carry no domain functions to reveal and are excluded from the pilot count.

---

## Decision 1 — WIP=2 allocation: **kinh-dich (advance to Phase-2) + alert-engine (charter pilot-5)** — CONFIRMED

stock-price DONE → dormant → frees one of the two WIP slots.

- **Slot 1 = kinh-dich (pilot-4):** already ACTIVE, Phase-1 APPROVED. It KEEPS its slot and advances to Phase-2 (Decision 2). No new slot consumed — it was already counted.
- **Slot 2 = alert-engine (pilot-5):** charter into the slot stock-price vacated (Decision 3).

**Active set after this decision = {kinh-dich (Phase-2), alert-engine (Phase-0)} = 2 ACTIVE = AT cap, not over.** Confirmed against the WIP=2 rule (ratification Decision 1: "Max 2 ACTIVE pilot charters simultaneously, one per dev-zone agent") and the pilot-5 HOLD unblock condition (`2026-05-24-stock-price-phase1-gate-ratify…` Decision 3: "pilot-5 opens ONLY when stock-price OR kinh-dich reaches terminal 12/12 close" — stock-price DONE satisfies this exactly).

**Why these two and not another pairing:** kinh-dich is mid-pilot and the only ACTIVE TS pilot — pausing it to start something else would strand sunk Phase-1 work and waste the proven dev-kinh-dich context. alert-engine is the canonical next pilot (ratification order 3→8: pilot-5 = alert-engine) and carries the lowest start-risk of the remaining services (Go, depguard proven three times, zero new tooling — its only novel gate is G7 zero-creds, i.e. no Telegram creds in the sandbox). news-fetch (pilot-6) additionally needs SI-5 (`dev-news-fetch` agent — none on disk); pdf-extractor/rag-service (7/8) need SI-4 (Python fence, undesigned). So alert-engine is both the ordered and the lowest-risk choice for the freed slot. Confirmed, no adjustment.

---

## Decision 2 — kinh-dich Phase-2 entry: **AUTHORIZED.** The "SI-3 gate" is RESOLVED — it was a stale Phase-0/charter-time prerequisite, already satisfied; it does NOT gate Phase-2.

### Resolving the SI-3 gate (my prior note said Phase-2 was "gated on SI-3")

**SI-3 is the TS ESLint-boundaries fence spec, and it is COMPLETE.** Signal `architect-si3-ts-fence-done-20260523T220332Z.json` (commit `388703b7`): status FINAL, `chosen_option=A` (eslint-plugin-boundaries v6.0.2), `within_one_sprint=true`, `g4_ac_text_ready=true`, brief `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md §5`.

SI-3 was always a **charter-time** prerequisite, not a Phase-2 one: it gates whether kinh-dich's **G4 AC text could be LOCKED at charter v1**. The done-signal states it plainly: "SI-3 landed -> G4 section may be LOCKED at charter v1, no architect Amendment (SI-3 §5 'spec is final at charter v1')." And the kinh-dich SSOT G4 calibration already carries the transcribed ESLint fence AC verbatim (eslint.config.mjs template, `bunx eslint src/ --max-warnings 0`, R-FENCE deliberate-violation recipe). SI-3 landed (`2026-05-23T22:03Z`) **before** pilot-4 even opened (`2026-05-23T22:37Z`). The "gated on SI-3" note in my prior carry-over was stale — that gate fired and cleared at charter time.

**Phase-2 entry is gated only on the Phase-1 close-gate, which has PASSED:** kinh-dich SSOT `phase1.status = APPROVED`, gateVerdict "clean full GO", QA-verified commit `34205c87` (AC-2 re-verify PASS: 6/6 = 100% dashboard render + honest NOT-RUN + file self-contained), gateDecisionDoc `2026-05-24-kinh-dich-phase1-close-gate-fix-then-clean-go.md`. G12 streak 6/6 complete. There is no remaining SI-3 prerequisite.

### Ruling: Phase-2 entry AUTHORIZED

**Finding:** No Phase-2 task plan exists. `docs/architecture-briefs/2026-05-23-kinh-dich-factory/` holds only `pilot-charter.md`, `p0-brownfield-inventory.md`, `phase-1-task-plan-ts.md` — there is **no `phase-2-task-plan-ts.md`**.

**Next step → architect** drafts `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md`, mirroring stock-price's `phase-2-task-plan-go.md` format (atomic tasks, per-task AC, WIP=1 sequential, explicit "no goal flips in Phase 2 — PO-only at 12/12 terminal" banner). I do NOT author the plan.

**Phase-2 scope the architect must decompose** (kinh-dich SSOT goals + charter §Phase Skeleton): G3 (clean composition root `src/index.ts` ≤80L + OpenAPI in `src/interface/`); **G4** (ESLint fence per the LOCKED charter AC — `eslint.config.mjs` + eslint-plugin-boundaries; AC-4b deliberate Fence-A violation → non-zero exit + 'Fence-A' in output → reverted → never committed; R-FENCE gate is the first chokepoint per charter; `kinh-dich-pre-ci` tag at the commit before CI work; 5-min in-Option-A `@typescript-eslint/parser` fallback if R-2 bites — NOT Option C); G5a/b/c (move superseded `domain/services.ts` to `src/_deprecated/` under `kinh-dich-pre-delete` tag; MCP handlers rewired HTTP to port **5005** with zero direct domain imports; zero `TODO.*migrat`); G8 (honest-red deliberate-corruption proof); G9 (PO Playwright Path B default per L6); G10 (single-literal primitive bug ≤2-cycle fix under `kinh-dich-pre-inject` tag); G11 (2-trial coupling proof). G1/G2/G6/G7/G12 are EARNED-PENDING from Phase 1 — finalize, do not re-earn.

**SI-2 boundary:** kinh-dich must NOT touch `docs/dashboards/index.html` (stock-price's G6 deliverable). kinh-dich G6 builds only `apps/kinh-dich-service/dashboard/index.html` and links INTO SI-2 only via the index stock-price owns.

---

## Decision 3 — alert-engine (pilot-5): **CHARTER NOW.** HOLD condition satisfied.

The prior HOLD (`2026-05-24-stock-price-phase1-gate-ratify…` Decision 3) had a single, unambiguous unblock: "pilot-5 opens ONLY when stock-price OR kinh-dich reaches terminal 12/12 close (status=DONE, decisionMatrix populated, charter CLOSED — truly DORMANT)." **stock-price is DONE (12/12, decisionMatrix populated, verdict=scale).** Condition MET. With kinh-dich keeping one slot and stock-price vacating the other, chartering alert-engine lands the active set at exactly 2 = at cap (Decision 1).

**Service facts (verified via jq on `docs/data/system-map.json` — never hardcoded):** id `alert-engine`, language `go`, runtime `go1.22+cgo`, port 5006 (internal == external), zone `apps/alert-engine`, specialist `dev-alert-engine`, keywords [dedup, cooldown, Telegram dispatch, alert, signal], dedicated DB `alert_engine.db`.

**Ruling: charter AUTHORIZED.** Next step → **architect** authors `docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md` (fleet pilot 5, v2.0), cloning the stock-price/macro v2.0 charter structure: 12 G-goals Tracks A/B/C, Phase-0 exit gate, §4.5 decisionMatrix PO-only/terminal-only authorship, status-enum L3 hard-deadline, lessons L1–L7 baked Day 0, and the PM-owned SSOT `docs/data/pilot-status-alert-engine.json` instantiated from `docs/data/pilot-status-schema.json` (all 12 goals=TBD, decisionMatrix present-but-empty, status=ACTIVE, phase=0). I do NOT author the charter or the SSOT — architect's step.

**alert-engine-specific gates the architect must bake Day 0:**
- **Language = Go** (locked Day 0; native Go, no rewrite step). Go depguard `.golangci.yml` Fence-A/B/C is the SAME mechanism proven three times (TA-style not applicable — Go like stock-price) — **zero new tooling risk** (no R-CGO chokepoint UNLESS alert_engine.db is accessed via cgo SQLite; architect confirms at brownfield inventory — if cgo SQLite is present, reuse stock-price's R-CGO `CGO_ENABLED=0` sandbox pattern verbatim).
- **G7 zero-creds is the HARD per-service gate** (the alert-engine analog of FRED/CGO gates): the sandbox process must have **zero Telegram credentials / chat-ids / bot tokens / API keys** — alert dispatch logic must be exercisable as pure compute over scenario JSON with NO live Telegram send. Architect finalizes the exact env-audit grep (`TELEGRAM_|BOT_TOKEN|CHAT_ID|API_KEY|SECRET|PASSWORD` returns empty) in the charter §G7.
- Pre-revert tags Day 0: `alert-engine-pre-ci`, `alert-engine-pre-delete`, `alert-engine-pre-inject`.
- Port 5006 from system-map (never hardcoded). SI-2 boundary: alert-engine G6 builds only `apps/alert-engine/dashboard/index.html`, links INTO SI-2; must NOT re-claim or touch `docs/dashboards/index.html`.
- `docs/data/*.json` is gitignored → instantiating the SSOT requires `git add -f docs/data/pilot-status-alert-engine.json` (architect/charter step, not this PO ruling).

---

## Decision 4 — Index-race: **interim single-committer serialization RATIFIED + structural fix COMMISSIONED (commit-mutex, NOT worktrees)**

### 4a — Ratify the interim policy

I **RATIFY** the router's FLEET-WIDE SINGLE-COMMITTER SERIALIZATION (escalation `main-router-P2-F-fragmented-move-finding-20260524T004620Z.json`): at most ONE file-committing worker in flight fleet-wide until the structural fix lands; long read/build/test phases may still overlap; tag-only ops (git tag — a ref op, not an index op) remain safe-concurrent; the WAIT-before-stage guard stays as defense-in-depth; **agents MUST NOT `git reset HEAD` foreign paths — they WAIT.** This is proven SAFE this session (it carried stock-price's entire Phase-2 → terminal 12/12 close with zero further incidents after adoption). The `git reset HEAD <foreign>` root cause (incident 2, commit `6225f926` fragmented `git mv`, predicted by `feedback_concurrent_commit_race.md`) is correctly neutralized by the "never reset foreign paths" clause.

**P2-F record correction:** No G-goal is flipped either way (Charter §4.5) — stock-price already closed 12/12 with G5 graded YES against HEAD truth (`_deprecated/services_v1.go` present, services.go deletion completed by the dispatched remediation `dev-sp-P2-F-remediation-done-20260524T004852Z.json`). An **evidence addendum suffices**; no formal re-grade is required. (This is a record-hygiene note for PM; it does not reopen the closed pilot.)

### 4b — Commission the structural fix: **YES — commit-mutex/advisory-lock, NOT worktrees**

The interim policy is proven-safe but **throttles throughput**: it serializes the ENTIRE worker (read+build+test+commit), so two pilots running concurrently (which Decisions 1–3 now make the steady state) cannot overlap even their long, index-free build/test phases without risking a wait on the single committer token. As the fleet scales to 2 concurrent pilots, this is a real bottleneck. So a structural fix is worth designing.

**Two options weighed:**

| Option | Keeps "NO branches / all on main"? | Concurrency win | Design+rollout risk |
|---|---|---|---|
| **Per-pilot git worktrees** | **NO** — worktrees are per-branch; each worktree checks out a distinct branch, then integrates to main. This **violates the hard user constraint** "NO branches, all work on main" (CLAUDE.md, every pilot's `constraints_binding_day_0`). | high (full parallelism incl. commits) | HIGH — new branch/integration model, merge-to-main step, rejected by hard constraint |
| **Commit-mutex / advisory-lock on main** | **YES** — everything stays on the single `main` working tree + index; the lock serializes ONLY the commit window (stage→commit→verify), letting the long read/build/test phases of all pilots overlap freely. | high where it matters (only the seconds-long commit window is serial; the minutes-long build/test phases parallelize) | LOW — additive lock protocol around the existing stage/commit step; no history rewrite; no branches; coexists with the WAIT guard |

**Ruling: commission the architect to design a commit-mutex / advisory-lock structural fix that keeps everything on `main`.** Per-pilot worktrees are **REJECTED** — they require branches, which is a hard user constraint violation (no justification clears it; the user's "NO branches" rule is absolute). The commit-mutex is the lower-risk option AND the only one that preserves the no-branches rule: it narrows serialization from the whole worker down to just the commit window, recovering the overlapped-build/test throughput the interim policy throttles, while a `git reset HEAD <foreign>` remains forbidden inside the lock (the proven incident-2 fix is preserved).

**Next step → architect** authors a structural-fix architecture brief, e.g. `docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md`: an advisory lock (candidate: a lockfile / `coordination.db` advisory row — note `coordination.db` already exists per system-map for "cross-session agent task lock coordination", so the mechanism may extend it) acquired immediately before `git add`+`git commit`+post-commit verify and released after; long phases (read/build/test) run lock-free; the lock holder NEVER `git reset HEAD` foreign paths; defines acquire/timeout/release semantics, crash-recovery (stale-lock reclaim), and the migration path from the interim "whole-worker" serialization to "commit-window-only" serialization with zero history rewrite and zero branches. Until that brief lands AND is ratified, the interim whole-worker single-committer serialization stays in force.

**Priority/ordering note:** the commit-mutex brief is a **design** task (read/think/write a brief — no source commits), so it can run concurrently with the two pilots without consuming a commit token most of the time, and without consuming a WIP pilot slot (it is infra/throughput work, not a factory pilot). It is important-not-urgent: dispatch it but do not let it block the two pilots' forward motion.

---

## Sequencing for main-router (respects WIP=2 + single-committer serialization)

Three workstreams authorized; all three next-actors are **architect** (design/plan/charter — NOT source commits). Ordering:

1. **kinh-dich Phase-2 task plan** (architect) — unblocks the in-flight TS pilot's next phase; highest priority (keeps the already-ACTIVE pilot moving).
2. **alert-engine pilot-5 charter + SSOT** (architect) — fills the freed slot; second.
3. **commit-mutex-on-main structural-fix brief** (architect) — throughput; concurrent/important-not-urgent; third, must not block 1 or 2.

**Single-committer note for the router:** these three architect outputs are all doc/brief/plan writes. Each must respect the interim single-committer serialization at its own commit moment (one file-committing worker fleet-wide at a time; WAIT, never `git reset HEAD` foreign paths). They can be *worked* concurrently; their *commits* serialize. WIP=2 pilot cap is not breached — the structural-fix brief is infra, not a pilot.

---

## Constraints Honored (this planning step)

- Authored **NO** pilot SSOT: `pilot-status-stock-price.json` (DONE, untouched), `pilot-status-kinh-dich.json` (PM-owned, untouched — no goal flip, no phase flip; PM transitions phase2 on dispatch), `pilot-status-macro-indicators.json` (CLOSED, untouched). No `decisionMatrix` populated anywhere (terminal-only, §4.5 — not this step).
- Touched **NO** closed/done app source: `apps/technical-analysis/**`, `apps/macro-indicators/**`, `apps/stock-price/**`, `apps/kinh-dich-service/**`, `apps/alert-engine/**` — all untouched (planning only).
- Did NOT author the kinh-dich Phase-2 plan, the alert-engine charter, or the commit-mutex brief — all are the architect's steps; I authorize and point.
- Did NOT spawn agents (PO cannot) — emitted signals naming `next_actor`; main-router fans out.
- L84 explicit-path staging (this doc + 3 signals + notebook only). `git diff --cached --name-only` checked immediately before staging; clean (zero foreign). NO `git reset HEAD` of any path. Single-committer serialization respected.
- No `--force` / `--no-verify` / `--no-gpg-sign` / `git push`. No destructive git. All on `main`.
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD (re-verified, exit 0). Frozen tags untouched.

**Decided by:** po · **at:** 2026-05-24T02:35:38Z
