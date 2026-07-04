# Systemic Review — "Writes a lot, fixes little": churn without convergence

**Date:** 2026-07-04
**Trigger:** Owner report — *"agents working but they write soo much, they no working on right job for make quality, they work very lazy for fix but root cause always keeping, they jump on loop for fix but no fix anything… problem of rule or workflow for hallucination or misunderstanding."* Plus: *"i see many backlog too."*
**Method:** 64-agent forensic workflow (7 investigators × git / memory / orch-state / cron-rules / flow-rules / notebooks / metrics, each finding adversarially verified by independent skeptics, then synthesized). 56 findings raised → **54 survived verification (40 CONFIRMED, 14 PLAUSIBLE), 2 refuted.**
**Status:** Diagnosis complete. Remedy design handed to `agents-architect` (see §7).

---

## 1. Verdict (one paragraph)

The system is **not hallucinating from confusion** — it is a coordination substrate that has **largely stopped shipping product and now mostly does bookkeeping about itself.** Two wall-clock schedulers (the system-auditor tiers and the dev-team tick) and an unconstrained LLM detector fire *regardless of whether there is work*, and because every fire ends in a mandatory notebook/state **write + commit** into the git tree, ~80% of commits are pure chatter while real product-source commits collapsed to ~2%. What looks like *"looping without fixing"* is mostly the detector **re-emitting the same known false positives every tick** (no source-side suppression, no signal closure), layered on a **separate, genuine failure to ever converge real bugs**. The *"hallucination"* the owner feels is real but **structurally induced**: mandatory-completion contracts with **no sanctioned honest-failure exit**, ratified by verification theater (completion = a self-reported badge or a green-tests/silence proxy, never proof the served artifact is correct), make a confident fabrication the path of least resistance — and status files that stamp *today* over month-old content feed agents false facts on top.

**The owner's hypothesis (rules induce hallucination) is CORRECT but incomplete:** the rules induce hallucination *specifically where they mandate completion without a sanctioned honest failure*, and most of the visible *"looping"* is scheduler-driven bookkeeping and re-detected false positives — **not the model losing the plot.**

## 2. Correction to my earlier read (honesty note)

In my interim message I called the pipeline **"frozen since mid-May."** The verification pass **refuted that** (`F7-FROZEN-PIPELINE-REFUTED-BUT-RATE-COLLAPSED`):

- It is **not** an absolute weeks-long freeze. Product work still happens; several structural fixes **did** ship (orch-apply.sh write-gate, `owner_client_session` scoping 06-28, auditor deterministic-append, real BCTC fixes).
- What actually happened is a **rate collapse**: product-source commits fell from ~15–19%/day to **~2%/day** — bookkeeping *crowds out and outpaces* product work.
- The revert count I leaned on was also **inflated**: only ~7 real reverts, and the marquee CTG case **escalated to a genuine fix**, not a loop.

The frozen-lane snapshot (ready=0 / in_progress=0 / qa=0 with backlog=406) is real, but it reflects **intake starvation + status drift**, not a dead fleet. Carry the corrected framing forward.

## 3. The five mechanisms (causal map)

```
                 ┌─ auditor tiers (T1 */30, T2 4h, T3 daily) ──┐
  wall-clock ────┤                                              ├─► fire on EMPTY board
  schedulers     └─ dev-team tick (7,37 * * * *) ───────────────┘        │
     (neither has the no-work skip gate cowork already proves works)     │
                                                                          ▼
   every flow ends in mandatory notebook/state WRITE+COMMIT, and all      CHURN
   that state lives IN THE GIT TREE  ───────────────────────────────►  82% chore,
   (monolithic 2.4MB hot SSOT rewritten ~57×/day amplifies each touch)   ~137 commits/day

   unconstrained LLM detector (ad-hoc SQL, drift-prone predicates)
     • manufactures false criticals (A-30 memory %, B-05 bctc two-layer freshness)
     • batches distinct findings onto ONE timestamp-keyed id  ──────►  "LOOP WITHOUT
     • NO source-side FP suppression, NO READ→RESOLVED closure          FIXING" (re-
     → re-detects same FP every tick; tick re-commits; PO re-annotates   processing
                                                                         PHANTOM work)

   recurring-bug escalation = ONE-SHOT reset, no post-fix verification,
   freeze flag decorative (46d stale, read by zero code), fixer barred
   from multi-file/refactor, reasoning severed from the handoff  ─────►  REAL bugs
     → a "structural fix" that misses the cause just resets the counter   NEVER
                                                                          CONVERGE (BCTC)

   mandatory-completion contracts + NO sanctioned honest-gap exit +
   verification theater (DONE = green tests / silence, not served proof) ► FABRICATION
     → tool unreachable / thin data / fallback default → confident fake     (reaches users)

   status/metrics files stamp lastUpdated=today over month-old content ─►  MISUNDERSTANDING
     (currentSprint dead scheme, lastSuccessfulCycle 47d stale,             (agents act on
      cronJobCount=2 vs real ~81, toolCount carries 4 values)              false facts)
```

## 4. Root causes (ranked, adversarially verified)

| ID | Sev | Class | Root cause |
|---|---|---|---|
| **RC-VERIF** | P0 | structural-remake | **Verification theater.** Completion is a self-reported badge or a proxy (green tests / absence-of-alert). No producer-side gate forces proof the *serving artifact* exists/is correct before reporting DONE/PUBLISHED. Mandatory-completion contracts with **no sanctioned honest-gap exit** make fabrication the path of least resistance (29 corpus files, 18 sessions; live: NB-6, NB-7, fabricated FB posts). |
| **RC-CONVERGE** | P0 | structural-remake | **Fix machinery cannot converge.** Recurring-bug escalation is a *one-shot* reset with no post-fix root-cause verification and no re-trigger; the freeze flag is a hand-edited field 46 days stale, read by zero code; the fixer is hard-scoped to ≤2 files + no-refactor so cross-file root causes are out of scope *by construction*; reasoning is written to a decision journal the executing fixer never reads. BCTC fix-rate 51→67→50/30d straddling the "permanent structural fix" = **zero convergence.** |
| **RC-IDLE-LOOPS** | P1 | containment-now | **Churn engines fire on an empty board.** The dev-team tick and auditor T2/T3 run a full sweep + mandatory write+commit on *every* fire; the persist/commit runs **before** the idle fast-exit. The cowork */15 dispatcher is the **only** loop with a genuine "empty-work → SILENT, no write/commit" preflight — the proven in-house template the others lack. |
| **RC-DETECTOR** | P1 | containment-now | **Detector is an unconstrained LLM** writing run-to-run-varying SQL, no source-side suppression of known-FP classes, signal ids keyed on a batch timestamp (8 findings collide onto one id, can never close row-by-row), and READ is a terminal graveyard (~11–15% closure). Every tick re-detects the same FP → re-commit → re-annotate: closed loop with no terminal state. |
| **RC-DRIFT** | P1 | containment-now | **Status/metrics SSOT drift.** Freshness stamps decoupled from content (lastUpdated=today over a month-old snapshot); the same fact carries multiple values (toolCount 146/161/166/183; cronJobCount 2 vs ~81); dead hand-maintained liveness fields (lastSuccessfulCycle 47d stale, currentSprint on a dead numbering scheme) advertise a state that isn't real. |
| **RC-ORCHMONO** | P1 | structural-remake | **Monolithic hot SSOT.** One 2.4MB JSON file with cold history co-resident, no enforced hot ceiling, no TTL eviction; each live-byte change rewrites ~648KB of cold history. Hot/cold split was started (06-26 brief) but regressed. |
| **RC-GITSTATE** | P1 | structural-remake | **Agent/coordination state lives in the git tree** and is re-committed every cycle, so the commit ledger measures chatter, not product change (coverage-state pure-timestamp churn, tool-usage daily regen, notebooks full-overwrite). |
| **RC-CEREMONY** | P2 | structural-remake | **Coordination ceremony is heavy, paid inline per dispatch** by a work-forbidden role (router), and is itself a recurring self-perpetuating bug class (the lock/race/orphan/drift memory cluster). Prose-specified protocols keep needing per-incident patches. |

Full evidence per finding: workflow run `wf_8d14f65e-7a7`, journal at `subagents/workflows/wf_8d14f65e-7a7/journal.jsonl` (40 CONFIRMED finding ids enumerated there).

## 5. Fix order (from synthesis `top_3`)

1. **RC-IDLE-LOOPS first** — cheapest, highest-volume win, **no architect needed.** Port the cowork dispatcher's no-work preflight (LOOP-07) to the auditor tiers and dev-team tick; move write+commit to *after* the idle check. A clean git log restores the ability to *see* real work — a prerequisite for measuring every other fix.
2. **RC-VERIF second** — the P0 that reaches users and undermines every other remedy. Until a completion gate proves the serving artifact is correct (with a sanctioned honest-gap exit), *any* fix can be reported "done" while still broken.
3. **RC-DETECTOR third** — the upstream source of the false loops. Source-side FP suppression + frozen deterministic predicates + a READ→RESOLVED closure state machine drains several downstream loops at once instead of bailing each out downstream.

RC-CONVERGE (P0) rides alongside RC-VERIF — both are structural-remake and both concern "fixes that don't fix." RC-DRIFT / RC-ORCHMONO / RC-GITSTATE / RC-CEREMONY follow.

## 6. How this maps to what the owner observed

| Owner's words | Verified mechanism |
|---|---|
| *"they write soo much"* | RC-IDLE-LOOPS + RC-GITSTATE: idle-firing schedulers × mandatory git-committed state → 82% chore, ~137 commits/day, orch-state rewritten ~57×/day. |
| *"no working on right job for quality"* | RC-DETECTOR: fleet re-processes phantom work (re-detected false positives), not real bugs. |
| *"lazy fix, root cause always keeping"* | RC-CONVERGE: fixer barred from root-cause work by scope; one-shot escalation + decorative freeze flag → symptom patch, cause persists. |
| *"jump on loop for fix but no fix anything"* | RC-DETECTOR + RC-CONVERGE: detector re-emits FP every tick (phantom loop) **and** real recurring bugs never converge (BCTC loop). |
| *"hallucination / misunderstanding from rules"* | RC-VERIF (fabrication induced by mandatory-completion + no honest-gap exit) + RC-DRIFT (agents act on stale SSOT). **Correct hypothesis, structural cause.** |
| *"i see many backlog too"* | Intake starvation: backlog=406 (305 BACKLOG, 189 FIX incl. unfixed FDA-5/6/7/10 fake-data) while ready/in_progress/qa=0. Detection mints; pipeline consumes nothing. |

## 7. Handoff to remedy design

Diagnosis is confirmed and stable. Next: `agents-architect` designs the remake as an **architecture brief** in `docs/architecture-briefs/`, sequenced by §5, split by remedy class:

- **containment-now** (RC-IDLE-LOOPS, RC-DETECTOR, RC-DRIFT) — bounded fixes that can land without a redesign; stop the bleeding first.
- **structural-remake** (RC-VERIF, RC-CONVERGE, RC-ORCHMONO, RC-GITSTATE, RC-CEREMONY) — deeper redesign; the architect proposes, agent-father implements agent changes.

## 8. Blind spots the review did NOT close (for a follow-up round)

1. **Cost** — no one measured actual token/$ burn or latency of the churn; quantify to size the ROI of gating the loops.
2. **Causal direction of the product-rate collapse** — is churn crowding out product work, or is there simply less product work? Audit the 305 BACKLOG rows: real starved features or make-work?
3. **Post-remediation escape rate** — most fabrication evidence is historical; measure how many fabricated outputs reach *end users NOW* vs. are caught by router raw-verify, especially off-hours.
4. **Write-only channels** — the fixer never reads the decision journal it writes; audit the READ side of every write channel (notebooks, journals, orch lanes) for pure-waste artifacts.
5. **Effectiveness of already-shipped fixes** — did orch-apply.sh / owner_client_session / auditor deterministic-append reduce their target-class *rate*, or just relocate it?
6. **Consumer-migration lag** — enumerate ALL shell preflights/flow wrappers still carrying pre-06-28 lock-read patterns.
7. **Latent engines** — the anomaly→backlog bridge (LOOP-04) has *never fired*; confirm dead/mis-wired vs. dormant-armed before it becomes a make-work source.
8. **Cross-session overlap** — presence roster is advisory-only; quantify how often two live sessions double-drive the same tick.

---
*Forensic run: `wf_8d14f65e-7a7` — 64 agents, 3.88M subagent tokens, 534 tool calls, 21m. Per-agent evidence in the run journal.*
