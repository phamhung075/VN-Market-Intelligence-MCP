---
title: "Fleet Factory Rollout — PO ratification, framing decision, prework authorization, TS-fence call"
date: "2026-05-23"
author: "po"
status: "DECIDED"
program: "fleet-factory-rollout"
ratifies_brief: "docs/architecture-briefs/2026-05-23-fleet-factory-rollout/ (00..03, committed d898401a)"
parent_decision: "docs/po-decisions/2026-05-23-macro-pilot-terminal-and-program-completion.md (verdict (b))"
proven_template: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md (v2.0)"
program_goal_verbatim: "complete all microservice factory and make a working dashboard for each service that reveals the functions of its microservice server"
---

# Fleet Factory Rollout — PO Ratification

Both factory pilots are CLOSED 12/12 with verdict=`scale` (technical-analysis 2026-05-23T09:19:10Z; macro-indicators 2026-05-23T21:42:47Z). The architect delivered a fleet-rollout roadmap (brief `d898401a`). This decision ratifies it, makes the framing call, authorizes the shared prework, and resolves the TS-fence gate. **No user approval required** (full autonomy; user is non-technical and set this as a program-level goal).

Brief facts verified against `docs/data/system-map.json` (jq, never hardcoded): 12 zones; 5 dedicated dev agents present for the RED services (`dev-kinh-dich`, `dev-stock-price`, `dev-alert-engine`, `dev-pdf-extractor`, `dev-rag-service`); news-fetch zone specialist = `developer` (generic — no `dev-news-fetch` agent on disk, confirming SI-5). No `pilot-status-schema.json` exists yet (SI-1 genuinely open). No `2026-05-23-kinh-dich-factory/` dir (pilot-3 charter not yet authored — correctly gated below).

---

## Decision 1 — Pilot order: RATIFIED (with one promotion) + WIP=2 confirmed

The architect's value/risk criteria (Go-first → business value → domain richness → dependency → stack novelty) are sound. I **ratify the sequence with one adjustment**: promote the lowest-risk Go service to run first so the FIRST fleet pilot carries zero new-tooling risk while the TS-fence spike (SI-3) runs in parallel.

**Ratified order (pilot numbering 3→8):**

| Pilot | Service | Lang | Why this slot | Tooling risk |
|---|---|---|---|---|
| 3 | **stock-price** | Go | PROMOTED from architect's #4. First fleet pilot must de-risk the *program*, not the *tooling*. Go = depguard proven twice. Lets SI-3 (TS fence, HIGH RISK) run in parallel without gating the first pilot. | none |
| 4 | **kinh-dich-service** | TS | First TS pilot. Richest domain (hexagram logic) = highest dashboard-trust value. Runs once SI-3 lands; charter authored only after SI-3 (gate below). | SI-3 |
| 5 | **alert-engine** | Go | User-trust-critical (stop-loss). Go. G7 zero-creds is the hard gate (no Telegram creds in sandbox). | none |
| 6 | **news-fetch** | TS | TS pattern proven by pilot 4. Needs SI-5 (`dev-news-fetch` agent) first. | SI-3 (proven) + SI-5 |
| 7 | **pdf-extractor** | Python | Python track; gated on SI-4 (Python fence). | SI-4 |
| 8 | **rag-service** | Python | Same SI-4 tooling + pytest sandbox as pilot 7; back-to-back. | SI-4 (proven) |

**Rationale for the kinh-dich↔stock-price swap (the only change):** The architect put kinh-dich first on domain-richness grounds, but kinh-dich is TS and its G4 is *blocked* by SI-3 (the single HIGHEST-risk prework item). Leading the entire fleet program with a pilot whose G4 depends on an undesigned, HIGH-risk ESLint fence is fragile — if SI-3 slips, the fleet has zero forward motion. Leading with stock-price (Go, zero new tooling) guarantees the program shows progress immediately and lets SI-3 cook in parallel on the critical path it actually belongs on. kinh-dich loses nothing — it becomes pilot 4 and still gets the full charter; the TS-fence is simply proven on it once SI-3 is ready. Net: same total scope, strictly lower program-start risk.

**WIP=2 cap: CONFIRMED.** Max 2 ACTIVE pilot charters simultaneously (one per dev-zone agent), carried over from the two-pilot discipline. No pilot N+2 charter opens until pilot N has cleared Phase 1. First WIP pair will be {stock-price} then {stock-price, kinh-dich} once SI-3 lands and stock-price has cleared Phase 0.

**Brief typo noted (non-blocking):** `02-phasing.md` sequencing diagram labels kinh-dich "Go→TS" and stock-price "Go". The inventory (`01`) and all task tables correctly state kinh-dich is TypeScript/Bun. Cosmetic diagram-label error; does not affect any decision. Architect to fix on next brief touch — not a blocker.

---

## Decision 2 — Framing: per-microservice in-app model is CANONICAL. Original `packages/*` framing is **(a) SUBSUMED/SUPERSEDED**.

The user's literal goal — *"complete all microservice factory and make a working dashboard for each service"* — is **per-microservice**. The canonical, proven pattern is the **in-app per-service model** exactly as both closed pilots built it:

```
apps/<svc>/pkg/primitive/<name>/   (or src/ equivalent for TS/Python)
apps/<svc>/pkg/module/<name>/
apps/<svc>/cmd/sandbox/            (Go) | src/sandbox/ (TS) | __tests__/sandbox/ (Python)
apps/<svc>/dashboard/index.html
```

This is what TA and macro shipped (verified: macro primitives live in `apps/macro-indicators/pkg/primitive/`, NOT in `packages/primitives/`). It satisfies the user's goal directly and is twice-proven with verdict=scale.

**The original `2026-05-22-refactor` shared-`packages/*` monolith-decomposition framing is SUBSUMED, not a separate deferred track.** Justification:

1. **Q-9 is overturned by evidence.** The original `11-open-questions.md` Q-9 explicitly scoped Go services (stock-price, alert-engine) OUT and confined the three-tier model to TS + the mcp-server megabarrel via shared `packages/*`. Two Go pilots (TA, macro) have now scored verdict=`scale`. The premise of Q-9 ("Go services are already correctly scoped, don't need it") is empirically false — the factory delivered real primitive decomposition + dashboard trust value on two Go services. **Q-9 default (Option A, Go out of scope) is REVERSED.** The factory applies to Go services in-app.

2. **The user's goal is the SSOT for scope.** The user did not ask to decompose the mcp-server megabarrel into a shared workspace. The user asked for a factory + dashboard *per microservice*. The in-app per-service model is the literal implementation of that ask. Shared `packages/primitives/*` workspace scopes (`11-open-questions.md` Q-1) are a DIFFERENT goal (de-duplicating mcp-server's domain logic) that the user has not set as the program goal.

3. **mcp-server cleanup is absorbed, not abandoned.** The original program's real pain (mcp-server megabarrel, ~132 tools, 11 RED/YELLOW modules) is addressed **incrementally via the G5 gate of each per-service pilot** — every pilot removes mcp-server's direct domain imports for that service and replaces them with HTTP calls (per `00-roadmap.md` §Scope Boundaries: mcp-server "is factored indirectly through every service's G5 gate"). When all 8 service pilots close G5, the mcp-server interface layer is HTTP-only — which is the *outcome* Phase 4 of the original program wanted, reached by a different (per-service, lower-risk) route. The shared-`packages/*` workspace restructure (Q-1, original Phase 2/3) is therefore **not needed to satisfy the user's goal** and is retired as a program track.

**Explicit ruling:** The per-service in-app pattern (macro template) is the **single canonical path**. The `2026-05-22-refactor` shared-`packages/*` decomposition framing is **subsumed/superseded** — its valuable end-state (mcp-server domain-import-free) is delivered via per-pilot G5; its workspace-restructure mechanism (`packages/primitives/*`, `packages/modules/*`, the 12-barrel mcp-server rewire as a standalone effort) is **NOT a separate deferred track and will NOT be revived** unless the user sets a new, distinct goal. The original `11-open-questions.md` Q-1/Q-2/Q-6 (shared-workspace + module-split decisions) are **MOOT under this framing** and need no further adjudication. Q-3 (dashboard location) and Q-5 (rerun server) are resolved per-service by the dashboard standard (`03-dashboard-standard.md`); Q-10 (frontend) is resolved by the brief (OUT OF SCOPE).

---

## Decision 3 — Shared prework SI-1..SI-5: go/no-go + sequencing

| ID | Item | Owner | Decision | Sequencing |
|---|---|---|---|---|
| **SI-1** | Fleet pilot-status SSOT schema (`docs/data/pilot-status-schema.json`) | agent-father | **GO** | **NOW, in parallel with SI-3.** Gates pilot-3 Phase 0 (charter references it). Pure SSOT template work, no dev. ~1-2h. |
| **SI-2** | Fleet dashboard index (`docs/dashboards/index.html`) | dev agent of first pilot to hit G6 | **GO — DEFERRED** | Triggered at the FIRST fleet pilot's G6 (now stock-price pilot 3, not kinh-dich). NOT now. Architect to update `02-phasing.md` SI-2 owner from "dev pilot-3 (kinh-dich)" to "dev pilot-3 (stock-price)" given the swap. |
| **SI-3** | TS ESLint fence rule design | architect (design) → dev (impl) | **GO — NOW** | **NOW, in parallel with SI-1.** HIGH RISK. Architect spike. Gates G4 of pilots 4 (kinh-dich) + 6 (news-fetch). Does NOT gate pilot 3 (stock-price, Go). See Decision 4. |
| **SI-4** | Python fence tool decision | architect (spike) | **GO — DEFERRED** | Before pilot 7 (pdf-extractor). NOT now — pilots 3-6 (Go+TS) buffer the time. Separate architect brief when Python track approaches. |
| **SI-5** | `dev-news-fetch` agent file + flow | agent-father | **GO — DEFERRED** | Before pilot 6 (news-fetch) charter. NOT now. Clone `dev-macro-indicators` pattern with G12 DoD gate. Confirmed needed: only `news-scout.md` (analysis agent) exists; no dev-zone news agent. |

**Two-item NOW set: SI-1 + SI-3 run in parallel immediately.** SI-1 (schema) gates pilot-3 Phase 0. SI-3 (TS fence) is on the critical path for the TS pilots and must not block the Go-first program start. They have no dependency on each other → parallel.

---

## Decision 4 — TS fence (SI-3): DELEGATE to architect spike. Pilot-4 (kinh-dich) G4 gated; pilot-3 (stock-price) NOT gated.

**Decision: delegate SI-3 design to an architect spike.** NOT the Option C fallback (yet). Rationale: G4 is a load-bearing trust gate (it's what makes "the lego pieces can't reach into each other" enforceable, the user's literal stated pain). A weak/manual TS fence (Option C) accepted upfront would make every TS pilot's G4 second-class versus the Go pilots' depguard. The factory bar must be uniform across the fleet. The spike must deliver:

- A concrete ESLint enforcement design (Option A `eslint-plugin-boundaries`/custom rule, or Option B tsconfig path-alias + CI check — architect picks and justifies).
- Fence-A/B/C import-isolation rules equivalent to Go depguard (primitive must not import application; module must not import infrastructure; composition-root must not import domain logic).
- A **deliberate-violation proof** matching the Go G4 AC-4b pattern: an intentional Fence-A violation reproduces a non-zero lint exit with the fence name in output, then is reverted and NEVER committed.

**Fallback (Option C) is PRE-SELECTED but conditional, mirroring the brief's Risk Register:** if the architect spike exceeds **1 sprint**, accept the documented weaker TS G4 (Option C) so the TS pilots are never indefinitely blocked. The architect states which path at spike end; PO grades.

**Gate ruling:**
- **Pilot 3 (stock-price, Go): NOT gated by SI-3.** Go G4 = depguard, already proven. stock-price charter may be authored as soon as SI-1 lands. (PO authors it next cycle, after SI-1 — see Decision 5.)
- **Pilot 4 (kinh-dich, TS): charter may be DRAFTED in parallel with SI-3, but the G4 section cannot be LOCKED until SI-3 resolves.** Per the task constraint, I do NOT author the kinh-dich charter this cycle — I sequence it behind SI-3. The kinh-dich G4 acceptance criteria will be transcribed from SI-3's output verbatim (same discipline as the macro charter G4 carried TA's AC-4a/b/c).

---

## Decision 5 — Dispatch sequence (signals emitted)

The main router should spawn agents in this order. Two independent NOW dispatches run in parallel; everything else is gated.

**NOW (parallel — no inter-dependency):**
1. **architect** → SI-3 TS ESLint fence-rule design spike. Output: `docs/architecture-briefs/2026-05-23-ts-fence-spike/` (design + deliberate-violation proof recipe). Time-box 1 sprint; if exceeded → recommend Option C. Signal: `po-si3-dispatch-architect-ts-fence-20260523T215642Z.json`.
2. **agent-father** → SI-1 fleet pilot-status SSOT schema. Output: `docs/data/pilot-status-schema.json` (template covering pilot/charterRef/charterVersion/status/language/languageLockSource/openedAt/closedAt/closedBy/closureSignal/closureDecisionDoc/phase0/goals[G1-G12 w/ status,verifiedAt,verifiedBy]/decisionMatrix). Signal: `po-si1-dispatch-agentfather-schema-20260523T215642Z.json`.

**AFTER SI-1 lands (PO self-dispatch):**
3. **po** → author **pilot-3 stock-price charter** (clone macro v2.0 template; Go G4=depguard, no SI-3 dependency). Output: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` + `docs/data/pilot-status-stock-price.json` (Phase 0, all G=TBD) conforming to the SI-1 schema. Then dispatch stock-price Phase 0 (architect/system-auditor brownfield + dev-stock-price scaffold).

**AFTER SI-3 lands (PO self-dispatch, parallel-safe with stock-price if WIP≤2):**
4. **po** → author **pilot-4 kinh-dich charter**, transcribing SI-3's G4 AC verbatim. Output: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` + `docs/data/pilot-status-kinh-dich.json`.

**DEFERRED (triggered later, not dispatched now):**
- agent-father → SI-5 `dev-news-fetch` agent — before pilot 6 charter.
- architect → SI-4 Python fence spike — before pilot 7 charter.
- pilot-3 dev → SI-2 fleet dashboard index — at stock-price G6.

---

## Constraints held

L84 explicit-file staging (per-path `git add`, no `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; no `git push`; all on `main`. No `apps/**` source touched. Frozen `pilot-status.json` (TA) and CLOSED `pilot-status-macro-indicators.json` untouched. System facts via jq on `system-map.json`, never hardcoded. WIP=2 cap carried over (no pilot-3 charter authored this cycle — gated behind SI-1; kinh-dich gated behind SI-3).

**Decision owner:** PO. **No user approval required.** **Recorded:** 2026-05-23T21:56:42Z.
