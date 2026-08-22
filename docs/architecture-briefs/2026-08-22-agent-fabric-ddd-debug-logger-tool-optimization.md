# Agent-Fabric DDD Review + Per-Agent Debug Logger Design + Tool-Usage Optimization

**Date:** 2026-08-22T16:47:41Z
**Trigger:** User-requested direct dispatch (router `session_id=88555d2e-8fbc-4591-9164-20f6b54d475f`), three-part scope.
**Type:** Observe-and-report + one concrete design proposal. No code/agent-file edits by this agent (agent-father implements).

---

## Part 1 — DDD Compliance Review of the Agent/Orchestration Fabric

**Rule under test** (`docs/policies/dev-standards.md` § DDD Layer Rules): *"Business rule / pure calculation → `domain/`"*, *"SQLite/LanceDB access → `infrastructure/`"*, golden rule *"`domain/` has ZERO imports from `infrastructure/`"*. `docs/ARCHITECTURE.md` states the same golden rule as one line inside its `## DDD Layer Order` section.

**Literal-import check (control):** `grep -rl "infrastructure/" apps/mcp-server/src/domain/` returns 52 hits — all interface/type-name references (`IJobRunRepository`, `bondMaturityTracker.ts`, etc.), not real cross-layer imports. **Zero domain→infrastructure import violations found.** The app-code golden rule holds and is CI-enforced (`eslint-plugin-boundaries` Fence-A/B/C, wired 2026-07-24; `composition-root-logic-gate` Go guardrail for the parallel Go-services drift class).

**Where the fabric itself drifts — business rules parked in infra, not code importing across layers:**

1. **`apps/mcp-server/src/infrastructure/orchStateSchema.ts` (1308L)** is filed under `infrastructure/` yet its content is textbook "Business rule / pure calculation" per the dev-standards.md table itself: `StatusEnum`/`TERMINAL_SET` (13-value task-lifecycle state machine), `checkLaneCoherence()`, `checkDependsDivergence()`, `checkVerificationGate()`, `checkDecorativeSequencingFields()` — all pure functions (its only import is `zod`), all encoding genuine domain invariants of "what is a valid Task/Sprint state." There is **no `domain/models`/`domain/services` counterpart** for Task/Sprint/orch-coordination entities at all (`domain/models/index.ts` lists `FinancialReport, Alert, AnalysisEntry, Signal, WatchlistAction` — no `Task`). It is accidentally *pure* (no infra imports), so it does not break the golden rule mechanically, but it is misclassified against the project's own table, and nothing signals future maintainers "keep this pure" the way `domain/` placement would.
2. **`apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (1192L)** goes further: it embeds real business decisions inside the infra layer — `ORPHAN_EMIT_ALLOW_LIST` (which `task_kind`s are "adoptable work units" vs. silent-GC-only), the orphan-signal anti-theft invariant (NFR-1), and per-kind resume-contract eligibility (§6.5.5-referenced table). This is the **exact violation class** `composition-root-logic-gate` was purpose-built to catch on the Go side (`docs/policies/dev-standards.md` CANONICAL: FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL — "a composition-root adapter... embeds a business decision... that belongs in `pkg/application`, not `cmd/server/`") — but that guardrail only scans Go `cmd/server/**`; there is no TS-side equivalent, and none was ever pointed at the coordination/task-lock fabric. `eslint-plugin-boundaries` cannot catch this class either — it is import-graph-based and this file imports nothing from `domain/`, so the violation is invisible to every currently-wired guardrail.
3. **Doc-plane instance of the same pattern:** the dispatch table / cowork signal-bus "business rule" (who receives which signal — `docs/data/system-map.json .project.agents[] | select(.cowork_signal_recipient==true)`) is a documented SSOT, but `.claude/skills/dispatch/SKILL.md` itself carries a scar tissue warning — *"never derive from `type==\"cowork\"` — that drops po + tran-ngoc-bau"* — proving this exact rule was once reimplemented ad hoc at a call site instead of read from its one canonical source. Same shape as Findings 1–2, one layer up (docs instead of code).
4. **Positive control — the fabric's strongest compliance point:** `docs/data/orch/orch-state.json` writes ARE centralized correctly: every writer routes through `scripts/orch-apply.sh` (Zod validate → dup-key scan → lane coherence → conservation/prose-ceiling guards → CAS-guarded atomic rename), a genuine repository-pattern gateway. This is the template Findings 1–2 should be measured against, not an exception to flag.

**Verdict:** No hard golden-rule violation (no domain code imports infra). Real drift: two files (orchStateSchema.ts, coordinationStore.ts) hold non-trivial business/domain rules with zero `domain/` counterpart and zero guardrail coverage for that specific placement class, plus one confirmed historical doc-plane recurrence of the same "rule reimplemented outside its SSOT" pattern.

**Recommended action (agent-father):**
- (a) Fix `docs/ARCHITECTURE.md`'s `## DDD Layer Order` — it omits `infrastructure/` from the layer chain (`domain ← application ← interface ← scheduler`) while asserting "domain/ never imports infrastructure/" one line later; add a one-line cross-reference to `docs/policies/dev-standards.md § DDD Layer Rules` (the fuller table) rather than duplicating it — closes a mini-SSOT gap on the very doc about SSOT discipline.
- (b) PO/architect-ratify one of two paths for Findings 1–2, given `orchStateSchema.ts` is already flagged "physical split blocked" (own header, FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS) and `coordinationStore.ts` is a live, load-bearing hot path — do **not** treat this as an urgent refactor:
  - **Relocate:** extract the pure business-rule functions into a new `domain/services/orchestrationRules.ts` (schema stays a thin passthrough import), and split `ORPHAN_EMIT_ALLOW_LIST`/resume-contract logic out of `coordinationStore.ts` into a sibling `domain/services/taskLockPolicy.ts` — infra keeps pure CRUD.
  - **Or document-as-deviation:** annotate both files with an explicit, reviewed exemption (mirrors the existing `size-justification:`/`composition-root-logic-allow:` convention already used elsewhere) so the drift is a recorded decision, not silent — cheaper, lower migration risk on a hot path with 1192–1308L of existing test coverage.
  Not architect's call which path — flagging both, ratification belongs to PO/agent-father.

---

## Part 2 — Per-Agent Debug Logger Design

**Survey of the three existing log-shaped things (why none of them is the answer):**

| Mechanism | Shape | Why it's the wrong tool for a debug logger |
|---|---|---|
| Notebook (`docs/agent-memory/notebooks/<agent>.md`) | Prose `## <timestamp>` sections, git-committed every cycle, hard-capped ≤200L via drop-oldest-`##`-block pruning (`docs/agents/agents-architect/handlers.md` Step 2) | Coarse-grained (one section per cycle/brief, not per internal step); no `level`/`cycle-id` fields; 200L cap would evict debug-volume entries within hours on an active agent; git-committed per write → exactly the overhead pattern `2026-08-11-chore-commit-overhead-audit.md` already flags |
| Decision journal (`docs/agent-memory/decisions/*.md`) | Heavyweight reasoning trail, scoped per **sprint/task**, human-facing ("Terminal = status-only. All reasoning → decision journal" — `.claude/skills/dispatch/SKILL.md`) | Wrong grain (sprint, not agent-cycle) and wrong audience (deliberation record, not a grep target for "what did agent X do on cycle Y") |
| `.signal_queue` (`docs/data/orch/orch-state.json`) | Schema-strict (`.strict()` Zod), `summary` field hard-capped **120 chars**, every write is a full-file CAS-guarded read-modify-write through `orch-apply.sh` with conservation + prose-ceiling circuit breakers | Built for terse inter-agent routing envelopes, not free-text per-line debug traces; would either get truncated to uselessness or trip the prose-ceiling/conservation guards under debug-volume writes |

**A 4th, closer-but-still-not-it candidate found (not in the user's list):** `log_agent_work` / `get_agent_work_log` MCP tools + `agent_work_log` SQLite table (`apps/mcp-server/src/infrastructure/db/schema-system.ts`, Task 1108/1109) already carry `agent_name`, `session_id`, `started_at`/`finished_at`, `summary`, `findings`, `status ∈ {running,completed,error}`. Two disqualifying gaps:
1. **Adoption is near-zero:** `log_agent_work` appears **7 times total** in `docs/agent-memory/modules/tool-usage-stats.json` (fleet-wide, all history) — effectively unused.
2. **Structural exclusion of dev-\* agents:** `docs/protocols/fail-loud-protocol.md` (F-8/INV-GATEWAY-1) states dev-\* agents "lack direct MCP gateway binding in the sub-agent context." Any MCP-tool-based design (this one, or a brand-new `log_agent_debug` tool) is **unreachable by the exact agent class (`dev-*`) the user explicitly named** as a target user of this logger. Building a new MCP tool would silently recreate the same trap already logged in memory as *"agent-reported limitation may be structural — check the tool grant."*
3. Shape mismatch: two-phase start/end model, not a multi-line append stream within one cycle; no `level` field.

**Recommendation: new, dead-simple, file-based, append-only debug log — deliberately NOT an MCP tool/DB table.**

- **Path:** `docs/agent-memory/debug/<agent-id>.log` (new directory, mirrors the existing notebook-per-agent convention — grep scope stays `--agent-id`-bounded).
- **Line format (plain text, one line per entry — human-grep-first, no JSON parsing required):**
  ```
  2026-08-22T16:47:41Z agent=agents-architect cycle=2026-08-22-ddd-brief level=info msg=survey step complete, 4 findings
  ```
  Fields: UTC ISO-8601 timestamp, `agent=<agent-id>`, `cycle=<caller's own cycle/task/tick id — freeform, no enforced format: c104 | TASK-SLUG | ISO-tick>`, `level=info|warn|error`, then the raw message (no further escaping — keep it grep-first, not machine-parse-first).
- **Write path:** a one-line Bash `printf` append for the overwhelming majority of agents that hold a Bash grant — universally reachable regardless of MCP-gateway binding, unlike any tool-based design. For the rare Bash-less class (`bctc-analyst`/`refine_bctc_md` — `project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`), same Read-then-Write append pattern those agents already use for their other outputs.
- **Explicitly NOT git-committed per line.** Per-write commits would (a) recreate the `2026-08-11-chore-commit-overhead-audit.md` problem at debug-log volume, and (b) require every agent to thread commit-boundary zone rules through a high-frequency write path. Instead: batch-swept on the SAME cadence as the existing `scripts/agents-flow/memory-prune-sweep.sh`/`notebook-linecap-sweep.sh` janitor jobs (extend one, or add a tiny sibling) — simple age/line-count truncation (not the notebook's semantic drop-oldest-`##`-section logic, since debug lines aren't headed sections).
- **Explicitly not a replacement** for the notebook (durable narrative "what I concluded and why"), decision journal (sprint-scoped reasoning), or `.signal_queue` (machine-actionable routing) — this is the missing 4th tier: a raw, disposable-by-design mechanical trace for live debugging, nothing more.
- **Follow-up flagged, not resolved here:** `log_agent_work`'s near-zero adoption (7 calls) should be explicitly reconciled against this new convention by agent-father — either fold its `running/completed/error` status semantics into the new logger's `level` field for parity (so a 5th log-shaped thing doesn't quietly emerge for gateway-bound agents), or document the boundary explicitly (file-log for the mechanical per-line trace; `log_agent_work` reserved for its narrower session-lifecycle-with-DB-query use case, for agents that do have gateway binding and want queryable history).

---

## Part 3 — Tool-Usage Workflow Optimization

Source: `docs/agent-memory/modules/tool-usage-stats.json` (generated 2026-08-22T16:00:01Z) — 30 unique tools, 4549 total calls, against `docs/data/tool-registry.json` `totalCount: 183` (in sync with `docs/data/project-stats.json#toolCount`, no ARCHITECTURE.md staleness there).

**F3-1 — Extreme concentration, and it's getting worse, not better.** 5 read tools (`get_portfolio_conviction` 1037, `get_market_snapshot` 951, `get_macro_snapshot` 740, `get_agent_signals` 684, `get_alerts` 672) = **4084/4549 calls = 89.8%** of all fleet tool usage. Only **30/183 registered tools (16.4%) have ever been called at all.** This is not a fresh observation — a 2026-07-21 orchestration audit (`orch-4loop-wiring-audit` memory) measured the identical metric one month ago at **43/183 tools ever called (23.5%), top-5 concentration 86.5%**. **The trend moved the wrong direction over the last month: fewer tools touched (43→30), higher concentration (86.5%→89.8%).**

**F3-2 — Root cause of F3-1 not going undetected by accident: the mechanism built to own this metric has never actually run it.** The 2026-07-21 audit's own remediation commissioned `orch-sentinel` specifically with an **OH-4 "Capability Utilization"** dimension for this exact metric. Checked live:
- `docs/data/orch-sentinel-scorecard.md` is frozen at its **2026-07-22T00:17:57Z first-run LITE** state — OH-4 (and OH-2, OH-3) all read `(pending first FULL run)`, unchanged since day one.
- `docs/agents/orch-sentinel/flow/main.md`'s own MODE=LITE only runs OH-1; **OH-4 only runs under MODE=FULL**, cadence `18 5 * * 0` (weekly Sunday).
- `.claude/commands/crons/cron-orch-sentinel.md` states explicitly: *"agent-father does NOT arm/register any `CronCreate` itself... Neither cron is armed yet."* (as of its own 2026-08-06 note).
- **Confirmed today:** orch-sentinel is absent from all three router re-arm skills (`/cron-cowork-team`, `/cron-detect-loop`, `/cron-standalone-team` — zero mentions in any of the three `SKILL.md` files), so even a session-restart re-arm routine would not catch it.
- No open backlog/signal row tracks "arm orch-sentinel's crons" (`CLEAN-REGISTER-ORCH-SENTINEL-TREEMAP-SYSMAP` is a tree-map/system-map registration task, a different concern).

**This is the "built, tested, never wired" pattern already named in this repo's own vocabulary** (cf. the 2026-08-14 notebook entry on `scripts/notebook-compose.sh`) — a standing observability mechanism shipped and PO-approved over a month ago, its own scorecard file exists and looks live, but it has never fired past its first manual/router-triggered LITE run. Recommend agent-father/PO treat "arm orch-sentinel FULL (weekly) + LITE (daily), and add both to a re-arm skill" as a fast-follow — this closes both the OH-4 dead-mechanism gap and gives F3-1's trend a standing owner instead of a one-off architect snapshot.

**F3-3 — Coordination-tool asymmetry worth a closer look, not a verdict here.** `task_heartbeat` (35 calls) is only ~24% of `task_claim` (149 calls) — most held locks rely on their TTL default rather than active renewal. Cross-references cleanly with already-logged incidents (`peer cowork dispatcher collision`, `dead worker uncommitted revert`, `Step2.4 TTL>cadence FP`) — worth an OH-4-style pass once armed: which `task_kind=sprint-task` claims exceed typical task duration without a heartbeat.

**F3-4 — Methodology caution, not a finding to over-index on:** low call count alone does not mean "dead tool." Verified example: `post_agent_signal` (6 calls) looks alarming next to `get_agent_signals` (684 calls) until you check `agent_signals` is a scheduler-populated, rolling 2h-TTL **market-signal** table (`freshnessSlaMonitorJob.ts` writes it in-process, never through the MCP transport, so scheduler-side population is invisible to this telemetry by construction) — agents mostly *read* it (684) and rarely *write* it (6) by design, not by neglect. Recommend whoever runs OH-4 apply this same per-tool sanity check (server-internal writer vs. agent-invoked) before flagging any specific low-count tool as dead — a blanket "N=1 or 2 ⇒ prune" rule would misfire the same way it almost did here.

---

## ARCHITECTURE.md Staleness Check

- Tool/cron counts (`docs/data/project-stats.json#toolCount`=183, `#cronJobCount`=88) are already indirected, not hardcoded — **no drift found**, `docs/data/tool-registry.json` totalCount matches.
- One real gap found and already covered above: `## DDD Layer Order`'s layer chain omits `infrastructure/` — flagged to agent-father in Part 1 recommendation (a). This agent does not edit `docs/ARCHITECTURE.md` directly (outside this agent's allowed-output zone; agent-father implements per this agent's own `not_my_job` boundary).

---

## Signal

`docs/signals/2026-08-22-agent-fabric-ddd-debug-logger-tool-optimization.json` → agent-father, three actionable buckets: (1) ARCHITECTURE.md DDD-chain cross-ref fix + PO-ratify relocate-vs-document-deviation for orchStateSchema.ts/coordinationStore.ts; (2) implement the `docs/agent-memory/debug/<agent-id>.log` debug logger + reconcile `log_agent_work` adoption; (3) flag orch-sentinel's unarmed FULL/LITE crons (OH-4 dead-mechanism gap) to PO as a fast-follow, separate from this brief's own scope.
