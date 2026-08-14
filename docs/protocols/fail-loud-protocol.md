# Fail-Loud Lazy-Load Protocol

**Load when:** analysis agent needs the full knowledge-load failure procedure.

## Rule

Read `docs/<bucket>/<file>.md` when knowledge is needed. If Read fails (ENOENT, empty, <50 chars, permission denied) → follow these 5 steps immediately. Do NOT proceed with partial knowledge.

## The 5 Steps

```
1. send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")
2. submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

User must manually fix the config before the next cycle.

## Anti-Hallucination Rule — MCP Tool Calls

**NEVER assume MCP is down based on session logs, memory, or prior cycle failures.**

```
ALWAYS attempt the actual call_tool() call via the MCP gateway.
If it fails → report the REAL error.
If it succeeds → proceed normally.
```

Session logs record PAST state. They do NOT predict current state. An agent that reads "MCP down" in a prior entry and skips the call without trying is **hallucinating a failure**. This produces:
- Fake incident reports that pollute docs/
- Cascading false failures across all agents reading the same session log
- Corrupted `docs/data/orch/orch-state.json`

**Violation of this rule is worse than a real outage** — it creates phantom incidents that waste human attention.

## Output Boundary — What Agents Can and Cannot Write

Each agent has EXACTLY these allowed outputs:
```
ALLOWED:
  1. Notebook       → docs/agent-memory/notebooks/{agent-id}.md (append at cycle end)
  2. Channel output → send_telegram(channel="work|bug|market") via MCP
  3. Signal bus     → post_agent_signal() via MCP
  4. Analysis briefs → docs/analysis-briefs/{TICKER}.md (if in flow)
  5. Dev-team signal → docs/signals/{agent-id}-{ISO-timestamp}.json (bug escalation)

FORBIDDEN — NEVER create or modify:
  - Incident docs (docs/INCIDENT-*.md, docs/OPS-ESCALATION-*.md)
  - Recovery procedures (docs/agent-memory/ops-*.md)
  - Alert files (docs/ops-alerts/*.md)
  - Session files of OTHER agents
  - `docs/data/orch/orch-state.json` (cowork agents) — dev-team pipeline agents write `.head` only
  - Files in project root (*.md outside docs/)
  - Any file not listed in your flow's output steps
```

Violation = token waste + contamination of other agents' context.

## Analysis-Only Exit Guard — Persistence-Plane Self-Verification (mandatory)

**ROOT CAUSE, not one agent (FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING):**
a leaf agent completes real analysis, then emits prose describing the
write/emit/commit steps it "would" perform next — instead of calling the
tools — and exits having written nothing. Confirmed on 5+ distinct agent
types over ~7 weeks (unified-agent, market-watcher-offhours ×3,
tran-ngoc-bau, refine_bctc_md, system-auditor Tier-1 ×4), at least 10
defective occurrences total, and it cost a real, corroborated A-21 finding
that was orphaned with zero persistence anywhere until a human/router
caught it by hand. Because every agent's RETURN reads as success on the
one plane a reader normally checks (the RETURN text itself), this is a
**dead-detector class**, not a single agent's prose bug — patching one
flow doc leaves every other leaf agent exposed to the same shape.

**The rule (adopted VERBATIM from `docs/agents/po/flow/main.md` AC-3 —
this protocol is that rule's second adopter, generalized from "PO's own
board write" to any leaf agent's mandated write loop):**

> Any step that writes an artifact AND asserts its own persistence must
> re-read the persistence layer before claiming it — never trust the
> write call's own exit code, and never trust the agent's own RETURN text.
> A self-report cannot be the evidence that the self-report is true.

**What this means in practice, before your RETURN:**
- If your flow's contract mandates a write/emit/commit step this cycle
  (notebook append, `send_telegram`/`post_agent_signal`, a `.signal_queue`
  row, a DASHBOARD row, a DB push, a git commit), you MUST either (a) have
  actually called the tool/script and can cite its real result (a marker
  line, a row id, a commit SHA), or (b) have a genuine reason nothing was
  due this cycle. **Never** describe those steps as something that
  "would normally follow," "should be run next," or "the LLM executing
  the full cycle" will do — a plan for someone else to execute is not a
  completed cycle, however correct the analysis embedded in it is.
- A first-person-styled completion claim ("I posted...", "Appended...")
  is **not more trustworthy** than an honest "next actions" plan — both
  read as success to a caller who only checks the RETURN text. The only
  reliable signal is the artifact itself.

**The detector (AC-3 — keys on the PERSISTENCE PLANE, never on the
agent's own claim):** `scripts/audits/detect-analysis-only-exit.sh` is
the generic, agent-agnostic mechanization of the rule above. It takes no
"did you write it" flag from the caller — it independently re-reads the
notebook file's git history, the repo's commit log, `.signal_queue.rows[]`,
the dedup-ledger, and any caller-named extra artifact, and DETECTs on a
zero-diff verdict when every checked plane shows nothing changed. It ALSO
DETECTs on a genuine PARTIAL write (some planes non-zero) whose notebook
commit carries the agent's own published `[OUTPUT-CONTRACT] ...` claim and
that claim is either arithmetically unsound or asserts a `.signal_queue`
write the independent re-read shows never landed
(`FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE`,
2026-08-08 — confirmed live on system-auditor c80, which wrote its notebook
and committed but never invoked the E-3 emit actuator while its own
contract line claimed it had). It ALSO DETECTs on the INVERSE partial write
— some OTHER plane genuinely non-zero (a real `.signal_queue` row, a real
dedup-ledger entry) while the plane that agent's OWN contract mandates
every cycle (normally the notebook) reads 0
(`FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-
PASSES`, 2026-08-14 — confirmed live 12x across system-auditor/unified-
agent/ops/news-scout: the zero-diff-only OR verdict is defeated by ANY
non-zero plane, even when the one plane the agent's contract actually
requires is the one silently missing). The mandatory-plane set is never
read from the artifact under test — either the caller passes it explicitly
(`--mandatory-plane <notebook|commit|signal_queue|ledger|extra>`, repeatable)
or the script auto-derives it from the agent's own
`docs/agents/<agent-id>/init.md` (`memory.notebook: none` → not mandated,
e.g. `refine_bctc_md`, a real stateless leaf subagent with no notebook at
all; anything else, including a missing init.md → mandatory, the
conservative default). Any agent, wrapper, or peer reviewer can run
it against a spawn's own `--agent-id` and `--since-ts` (the spawn/cron tick
time) to verify a cycle actually landed something, independent of what that
cycle's RETURN says:
```bash
bash scripts/audits/detect-analysis-only-exit.sh \
  --agent-id <agent-id> --since-ts <cycle-start-ISO8601>
# exit 0 = PASS. exit 1 = DETECTED — a zero-diff (nothing changed on any
# checked plane), a partial-write contract violation (see `contract=` in
# the stdout line), or a mandatory-plane violation (see `mandatory=` /
# `mandatory_status=` in the stdout line — fires when the agent's own
# mandated plane, normally the notebook, reads 0 even though some other
# plane is genuinely non-zero) — treat the cycle's RETURN as unverified
# narration, not completion, either way.
```
Applies identically under `--cycle-tag` mode (confirmed, not assumed —
`--cycle-tag` only changes how the `.signal_queue` plane is matched; the
notebook/mandatory-plane check is unaffected either way).

Regression fixture (positive + negative controls, never against the live
repo): `scripts/audits/detect-analysis-only-exit.test.sh`.

**Not in scope here:** wiring this detector to run automatically, exogenously,
on every spawn (i.e. from the SPAWNER's side, immune to the spawned agent
dying before it ever reaches this protocol) is a separate, larger design
task — `FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION`
(architect-owned). This protocol's job is the rule + the reusable mechanism
every leaf agent and reviewer can invoke; it does not itself guarantee
invocation on a cycle that skips reading this file entirely.

## Error Boundary — Blocked Flow = EXIT

If ANY tool call or flow step fails after 1 retry:
```
0. STOP-RELEASE (WF-1, AC-WF1-6) — run BEFORE steps 1-4:
   If holding a sprint-task lock:
     call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })   // REQUIRED — P1-FINAL (TASK_1980)
     // ok=false acceptable (already expired) — best-effort cleanup
     // dev-* agents lack direct MCP gateway binding in the sub-agent context (F-8).
     // WF-3 resolved 2026-06-07: Option III codified (see docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md).
     // INV-GATEWAY-1: task_release is dispatcher session's sole responsibility; dev-* rely on TTL expiry (3600s max) or dispatcher finally-block.
     // The .head idle-reset below IS executable by all agents (jq + atomic rename, no MCP needed).
   Write .head idle atomically (applies to ALL agents regardless of MCP binding):
     now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
     jq --arg s "idle" --arg t "$now" --arg u "{agent-id}" \
       '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
       docs/data/orch/orch-state.json \
       | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
   Edge case: if fixer exits early, task stays REVIEW (QA verdict stands) — PM detects stuck-REVIEW and escalates.
1. send_telegram(channel="bug", message="[{agent-id}] Step N failed: {one-line error}")
2. Drop signal file → docs/signals/{agent-id}-{ISO-timestamp}.json:
   {
     "from": "{agent-id}",
     "to": "po",
     "type": "bug-escalation",
     "payload": "[{agent-id}] Step N failed: {one-line error}",
     "priority": "high",
     "createdAt": "{ISO timestamp}"
   }
3. Write cycle result to YOUR session log: "Cycle HH:MM — BLOCKED at step N: {error}"
4. EXIT immediately — return early, end cycle
```

Step 1 = user visibility (Telegram BUG). Step 2 = automated fix pipeline (PO picks up → sprint task).

Do NOT:
- Investigate root causes (that's ops/developer's job)
- Write incident reports or escalation docs
- Diagnose infrastructure problems
- Create files outside your allowed outputs
- Spend tokens analyzing why something failed

**Your job = YOUR flow steps. Blocked = report + EXIT. Dev team picks up the signal and fixes.**

## Why

Agents on stale/missing knowledge produce hallucinated analyses, wrong sector classifications, misfired alerts. Silent fallback is worse than no output — a missing file is a deployment/config problem, not a transient network error.

## Agent Reference

Cowork agents reference this protocol via → skill: `.claude/skills/cowork-boundary/SKILL.md` (which contains the Knowledge Load Failure Protocol). No inline copies in agent .md files.
