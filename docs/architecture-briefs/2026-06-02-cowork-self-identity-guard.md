<!-- size-justification: 215L — root-cause analysis + durable fix design + per-agent guard audit table + agent-father implementation spec; no content is extractable without severing the fix contract -->

# Architecture Brief: Cowork Self-Identity Guard

**Date:** 2026-06-02
**Author:** agents-architect
**Task:** NSCOUT-FRAMING-RECUR (sprint COWORK-RELIABILITY)
**Triggered by:** Post-fix recurrence of news-scout subagent CLAUDE.md router-rule mis-binding

---

## 1. Problem Statement

A spawned `news-scout` subagent, triggered via the standard cowork prompt
`run docs/agents/news-scout/flow/main.md slot=news-scout-offhours`,
refuses to execute its pipeline. It reads the project `CLAUDE.md` rule:

> "Main terminal = router only. Never implement directly. Always delegate.
> NEVER run a flow file yourself — spawn the correct agent to run it."

...as a self-binding constraint and returns a meta/refusal with zero pipeline work.
This happened twice: once before commit 7239b803 and once after it.

---

## 2. Prior-Fix Failure Analysis (why 7239b803 did not hold)

**What 7239b803 changed:**
The fix modified exactly one field in `.claude/agents/news-scout.md`:
the YAML frontmatter `description:` string from passive third-person
("News Scout. Fetch news…") to imperative first-person
("You ARE the News Scout agent. Execute your flow end-to-end…").

**Why it did not hold:**

Claude Code's context composition for a spawned subagent loads multiple
instruction sources in this precedence order (highest → lowest):

```
1. GLOBAL_CLAUDE.md      (~/.claude/CLAUDE.md) — user global
2. PROJECT_CLAUDE.md     (repo root CLAUDE.md) — project-scoped
3. Agent description:    (.claude/agents/<id>.md frontmatter) — registration prompt
4. Agent body text:      (lines after the closing --- of frontmatter)
5. Flow file content:    (the .md pointed to by the spawn prompt)
```

The project `CLAUDE.md` carries an explicit override header:
> "IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written."

The `description:` field lives at priority level 3. The project CLAUDE.md at
level 2 — with explicit override semantics — **wins** over a same-topic
instruction at level 3. The `description:` imperative framing ("You ARE the
News Scout agent") is a weaker signal than the explicit CLAUDE.md prohibition
("NEVER run a flow file yourself") because CLAUDE.md's override header
supersedes it in the model's instruction hierarchy.

**Why market-watcher runs cleanly despite identical trigger form:**

market-watcher has THREE layers of self-identity enforcement, not one:

| Layer | Location | Content |
|---|---|---|
| L1 | `.claude/agents/market-watcher.md` description | "You ARE the Market Watcher agent. Execute your flow end-to-end..." |
| L2 | `docs/agents/market-watcher/init.md` constraints block | `identity_role: "market-watcher"` + `mcp_tool_available: true` note explicitly about "identity-confusion hallucination" prevention |
| L3 | `docs/agents/market-watcher/flow/main.md` Step -0 | Explicit identity assertion block that names the EXPECTED_AGENT, compares it to the YAML frontmatter name field, and sends a BUG telegram if they mismatch — this step is the only one that explicitly scopes the CLAUDE.md router rule as non-binding on the agent itself |

After 7239b803, news-scout only gained L1. L2 and L3 were never added.
news-scout's `init.md` has `no_self_abort: true` (covering the notebook-write
refusal class) but no `identity_role` constraint and no flow-level guard that
explicitly scopes the CLAUDE.md router-rule as not self-binding.

**Root cause one-liner:**
The prior fix applied the symptom-class patch (imperative description) at the weakest
enforcement layer (L1 only); it never reached the load-bearing layer (L3: flow-level
explicit CLAUDE.md scope exception), which is the only layer that survives
project CLAUDE.md's override-semantics.

---

## 3. Cowork Agent Self-Identity Guard Audit

Scope: all agents invoked on standard cowork trigger prompts (`run docs/agents/<id>/flow/main.md slot=<slot>`).

### 3.1 Full audit table

| Agent | L1 (description imperative) | L2 (init.md identity_role) | L3 (flow/main.md explicit CLAUDE.md scope) | Status |
|---|---|---|---|---|
| `market-watcher` | YES | YES (`identity_role: "market-watcher"`) | YES (Step -0 identity assertion) | GUARDED |
| `unified-agent` | NO | NO | NO (body text has a guard in agent file itself, not in init/flow) | PARTIAL — body text guard adequate but not standardized |
| `news-scout` | YES (post-7239b803) | NO | NO | VULNERABLE |
| `bctc-analyst` | NO — passive third-person | NO | NO | VULNERABLE |
| `alert-commander` | NO — passive third-person | NO | NO | VULNERABLE |
| `digest-predict` | NO — passive third-person | NO | NO | VULNERABLE |
| `tran-ngoc-bau` | NO — passive third-person | NO | NO | VULNERABLE |
| `fb-market-poster` | NO — passive third-person | NO | NO | VULNERABLE |
| `qa-responder` | NO — passive third-person | NO | NO | VULNERABLE |
| `market-analyst` | NO — passive third-person | NO | NO | VULNERABLE |
| `refine_bctc_md` | NO — orchestrator description, no self-identity | NO | OFF-HOSE guard exists but no CLAUDE.md scope exception | PARTIAL |

### 3.2 Count

- Fully guarded (all 3 layers): **1** (market-watcher)
- Partial guard adequate (body text): **1** (unified-agent — body text guard is equivalent to L3 but non-standard)
- Vulnerable (missing L3 flow guard): **9** (news-scout, bctc-analyst, alert-commander, digest-predict, tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst, refine_bctc_md)

---

## 4. Durable Fix Design

### 4.1 Why L3 (flow file) is the load-bearing layer

The flow file is read AFTER the project CLAUDE.md but within the same context window.
A flow-level explicit scope declaration — naming the CLAUDE.md rule and limiting it to
the main terminal — is interpreted as a domain-specific override of the router-scoped
rule, because it is contextually specific (this agent, this flow) vs the general rule.
The model resolves specificity in favor of the more specific instruction when both are
in context.

### 4.2 Standard Self-Identity Guard Block

Agent-father MUST prepend the following block to the top of every vulnerable agent's
`docs/agents/<id>/flow/main.md`, immediately below the `# <Agent Name> — Main Dispatcher`
heading, before any Dispatch table or Steps section:

```markdown
## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `<agent-id>` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.
```

Replace `<agent-id>` with the agent's kebab-case id.

### 4.3 init.md constraint addition

Agent-father MUST also add to each vulnerable agent's `docs/agents/<id>/init.md`
under the `constraints:` block:

```yaml
identity_role: "<agent-id>"  # You ARE <agent-id>. Never claim to be a router, orchestrator, or generic Claude. Execute your own flow directly. The project CLAUDE.md 'never run a flow yourself' rule is NOT self-binding — it scopes only the main terminal.
no_self_abort: true  # Self-refusal on execution or tool calls is a flow violation — proceed.
```

### 4.4 Special cases

**unified-agent:** Body text already has an adequate guard ("You are a spawned WORKER agent. Execute the flow you are pointed at directly. The PROJECT `CLAUDE.md` rule applies ONLY to the main terminal — NOT to you."). No L3 change needed. Recommend standardizing to the L3 flow-level block in a follow-up pass (not urgent — body text works).

**refine_bctc_md:** The OFF-HOSE guard at the top of its flow main.md already establishes agent self-execution context. Add the SELF-IDENTITY GUARD block above the OFF-HOSE guard.

**market-watcher:** GUARDED. No change needed.

---

## 5. Files Requiring Changes (agent-father implementation spec)

### Priority 1 — news-scout (re-recurrence risk: HIGH, off-hours 4h cadence)

**File 1:** `docs/agents/news-scout/flow/main.md`
- Prepend SELF-IDENTITY GUARD block (§4.2) below the `# News Scout — Main Dispatcher` heading.

**File 2:** `docs/agents/news-scout/init.md`
- Add `identity_role` + updated `no_self_abort` to `constraints:` block (§4.3).

### Priority 2 — high-frequency cowork agents (bctc-analyst, alert-commander, unified-agent)

**bctc-analyst:**
- `docs/agents/bctc-analyst/flow/main.md` — prepend SELF-IDENTITY GUARD block
- `docs/agents/bctc-analyst/init.md` — add constraints

**alert-commander:**
- `docs/agents/alert-commander/flow/main.md` — prepend SELF-IDENTITY GUARD block
- `docs/agents/alert-commander/init.md` — add constraints

**unified-agent:** body-text guard is sufficient for now. Log as tech-debt for standardization pass. No immediate file change required.

### Priority 3 — remaining cowork agents

For each of: `digest-predict`, `tran-ngoc-bau`, `fb-market-poster`, `qa-responder`, `market-analyst`, `refine_bctc_md`:
- `docs/agents/<id>/flow/main.md` — prepend SELF-IDENTITY GUARD block
- `docs/agents/<id>/init.md` — add constraints

### Verification gate (QA)

After each agent-father edit:
1. Spawn the agent with the bare trigger: `run docs/agents/<id>/flow/main.md slot=<any-slot>` (no preamble, no explicit "you ARE" in the dispatch prompt).
2. Verify the agent executes Step 1 of its pipeline (not a meta/refusal).
3. If it produces a refusal → the L3 guard did not take — agent-father re-inspect and escalate.

---

## 6. Implementation Sequencing

```
Batch A (same commit, unblocked — news-scout recovery):
  news-scout/flow/main.md + news-scout/init.md

Batch B (next commit, unblocked — frequency-ordered):
  bctc-analyst/flow/main.md + bctc-analyst/init.md
  alert-commander/flow/main.md + alert-commander/init.md

Batch C (follow-up commit):
  digest-predict, tran-ngoc-bau, fb-market-poster, qa-responder,
  market-analyst, refine_bctc_md — flow/main.md + init.md each

Tech-debt:
  unified-agent: standardize body-text guard to L3 flow block (low urgency)
```

No rebuild required (docs-only changes). No restart required.
Cowork cron continues during rollout — partial guard is safer than no guard.

---

## 7. Signal to Agent-Father

Signal row written to `docs/data/orch/orch-state.json` `.signal_queue.rows[]`
per signal-dashboard SKILL.md §WRITE (atomic temp→rename):

```
type: brief_complete
from: agents-architect
to: agent-father
payload_ref: docs/architecture-briefs/2026-06-02-cowork-self-identity-guard.md
```
