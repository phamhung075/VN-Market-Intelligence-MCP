**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 7. Notebook — The Agent's Brain

The notebook = **fast-loading personal memory**. Replaces expensive re-analysis with pre-digested 1-line lessons. Like a senior employee's cheat sheet.

### 7.1 Design Principles

| Principle | Why |
|-----------|-----|
| **Index, not dump** | Each lesson links to where full detail lives |
| **1 line = 1 lesson** | Loading 10 lines costs less than re-analyzing 200 lines of logs |
| **Overwrite, never append** | Fresh notebook every cycle — stale lessons waste tokens |
| **Read others, edit yours** | Cross-team awareness without zone violations |
| **Max 50 lines** | If over -> prune oldest unused lessons |

### 7.2 Enhanced Notebook Format (Recommended)

> This is the recommended format. Real notebooks may use simpler variants — the key rule is: **1 line = 1 lesson, max 50 lines, overwrite every cycle**. The `-> detail:` links are ideal but not mandatory.

```markdown
# <Agent Name> — Notebook

**Last updated:** YYYY-MM-DD HH:MM UTC | **Sprint:** NNNN

## Current state
<1-2 lines: operational status, blockers>

## Last session summary
- <What was done — 1 line>
- <Key finding — 1 line>
- <Outcome — 1 line>

## Lessons learned
One line per lesson. Format: `LESSON: <context> — <fact> -> <action>`
Each lesson links to where the detail lives.

- LESSON: get_technical_indicators — returns empty for IPO < 30 days -> skip, don't retry
  -> detail: docs/agent-memory/notebooks/market-watcher.md @ Cycle 2026-05-07
- LESSON: VPS proxy timeout at 08:30 UTC = market close surge -> retry after 60s
  -> detail: docs/agent-memory/notebooks/news-scout.md @ Cycle 2026-05-06
- LESSON: alert-commander needs finding_data.source -> always include in urgent_news
  -> related: docs/agent-memory/notebooks/alert-commander.md @ Lessons
- LESSON: DDD repository.findByTicker() returns null not undefined -> null-check
  -> detail: docs/handoffs/TASK_1847-A.md @ Developer Implementation Record

## Cross-team notes
Facts from other agents' notebooks. Refresh when stale (>3 days).

- [alert-commander] max 10 alerts/day — batch low-priority signals (read 2026-05-07)
- [financial-analyst] BCTC Q1 deadline 04-30 — expect report surge (read 2026-05-05)

## Carry-over for next session
- <Unfinished item -> link to where it's tracked>

## Known patterns
- <Recurring pattern in this domain>
```

### 7.3 Lesson Categories

| Category | Trigger | Example |
|----------|---------|---------|
| **Tool behavior** | Unexpected result | `get_prices null on weekend -> check is_trading_day` |
| **Data location** | Found data somewhere unexpected | `FX rates in macro_snapshot, not separate tool` |
| **Token waste** | Dead-end analysis | `skip penny stocks < 1000 VND — no coverage` |
| **Cross-agent** | Signal useful/missing | `market-watcher price_anomaly includes volume` |
| **Workaround** | Known issue bypass | `pdf-extractor timeout -> batch 5 pages` |
| **Domain insight** | Business knowledge | `VN lunch break 11:30-13:00 -> no price updates` |
| **Error pattern** | Recurring failure | `BCTC HDBank non-standard format -> flag, don't retry` |

**Do NOT save:** raw tool outputs, temporary debug info, one-time fixes already in code, things already in `docs/{policies,protocols,standards,references}/*.md`.

### 7.4 Token Economy of Knowledge

```
Raw data (expensive)     -> Tool calls, full API responses       200+ tok/call
         | extract lessons
Notebook (cheap)         -> 1-line lessons, < 50 lines           ~300 tok total
         | share via read
Cross-team (near-free)   -> Read 2-10 lines from other notebook  ~150 tok each
```

---

## 8. Cross-Team Awareness

Agents read teammates' notebooks to make better decisions. Like colleagues checking the team board before standup.

### 8.1 When to Read Other Notebooks

| Situation | Read whose | Why |
|-----------|-----------|-----|
| Before posting signal | Target agent's | Know their state and capacity |
| Decision in another domain | Domain expert's | Avoid contradicting findings |
| After receiving signal | Sender's | Understand signal context |
| Start of cycle (optional) | `memory.reads_notebooks` list | Refresh cross-team awareness |

### 8.2 Rules

- **Read only** — NEVER edit another agent's files
- **Scan, don't study** — `Current state` + `Lessons learned` only (2-10 lines)
- **Max 2 notebooks per cycle** — more = diminishing returns
- **Cache in your notebook** — write to `## Cross-team notes` so you don't re-read next cycle
- **Stale = re-read** — if a cross-team note is >3 days old, re-read source

---

## 9. Actionable Reports

Every WORK/BUG message must help another agent or user make a decision.

### WORK Channel

```
[<Agent Name>] HH:MM UTC — <headline: what happened>
  Found: <key finding other agents can use>
  For: <who should care> (<why>)
  Regime: <context> | Next: <when/what>
```

### BUG Channel

```
[<Agent Name>] SEVERITY
  What: <tool/step that failed>
  Impact: <what's degraded, which agents affected>
  For: <ops|developer> — <specific action needed>
```

---

## 10. Document Self-Maintenance

Each agent maintains their own zone. Like an employee who keeps their processes documented.

### What Agents Self-Maintain

| Document | Action | When |
|----------|--------|------|
| Own `.claude/agents/<id>.md` | Update version, fix capabilities | Doc self-heal |
| Own `.claude/flows/<id>/*.md` | Fix tool names, steps, add missing steps | Doc self-heal |
| Own notebook | Overwrite with fresh lessons | End of cycle |
| Own session logs | Append cycle entry | Every cycle |
| Own service docs | Update README | After code tasks |

### Scoped to Own Zone

Doc self-heal only edits files in `document_zone.owns_controlled` and `owns_autonomous`.

If a doc **outside** your zone needs fixing -> post to WORK:
```
[<Agent Name>] Doc fix needed: <file> — <what's wrong>. Owner: <owning-agent>
```

### Auto-Correction Triggers

| Trigger | Check |
|---------|-------|
| Tool call failed | Is tool name in flow file correct? |
| Knowledge had wrong info | Is knowledge file path still valid? |
| Signal rejected | Is signal schema in flow up to date? |
| Step skipped/reordered | Does flow reflect actual execution? |

---

## 11. Document Registry — No Ghosts

Every file an agent creates must be tracked. No phantom files. No hallucinated references.

### The Problem

Ghost files = files created during work but never registered. Next cycle, no one knows they exist. They accumulate, confuse audits, waste tokens when accidentally loaded.

### The Solution: `document_registry` in Agent Definition

Every agent's `.claude/agents/<id>.md` contains a registry of all files it owns or creates:

```yaml
document_registry:
  static:                                    # Always exist
    - path: .claude/agents/<agent-id>.md
      type: definition
    - path: .claude/flows/<agent-id>/cycle.md
      type: flow
    - path: docs/agent-memory/notebooks/<agent-id>.md
      type: notebook

  dynamic:                                   # Created during work
    - pattern: docs/agent-memory/notebooks/<agent-id>.md
      type: notebook
      lifecycle: persistent, append-per-cycle
    - pattern: docs/analysis-briefs/{TICKER}.md
      type: ledger
      lifecycle: persistent, append own section
```

### Anti-Ghost Rules

1. **Before creating any file:** Check if a `dynamic` pattern covers it. If not -> the agent MUST NOT create it.
2. **End-of-cycle registry check:** Verify all files created this cycle match a `static` or `dynamic` pattern.
3. **If an unregistered file is found:**
   - If it belongs to this agent -> add pattern to `document_registry.dynamic`
   - If it doesn't belong -> report to WORK channel for the owning agent
4. **Never reference a file you haven't verified exists.** Before writing `-> detail: <path>` in a lesson, confirm the file is real.

### Ghost Detection (system-auditor)

System auditor runs this check:
```
For each agent in agent-roster:
  1. List all files matching agent's document_registry patterns
  2. Find files in docs/agent-memory/ owned by no agent -> ORPHAN
  3. Find registry entries pointing to missing files -> PHANTOM
  4. Report orphans + phantoms to BUG channel
```

---

## 12. Agent Responsibility Model

Each agent = responsible enterprise employee.

### Professional Behaviors

| Behavior | How |
|----------|-----|
| **Prepares before working** | Load notebook (L1) + cross-team (L3) at cycle start |
| **Loads minimum context** | Lazy-load knowledge (L2) only when current step needs it |
| **Learns from experience** | Extract lessons -> notebook index -> link to detail |
| **Communicates usefully** | Reports: `Found:` + `For:` + `Next:` |
| **Maintains workspace** | Doc self-heal on own zone every cycle |
| **Respects boundaries** | Never edit outside zone; request through channels |
| **Shares knowledge** | Notebook readable by all; signals carry context |
| **Fails gracefully** | Report + EXIT; never investigate outside scope |
| **Doesn't repeat mistakes** | Read lessons before starting; apply workarounds |
| **Tracks all files** | Document registry; no ghosts, no phantoms |
| **Stays lean** | Notebook < 50 lines; prune stale; don't re-analyze |
| **Validates before sending** | Pre-send check: schema, ranges, duplicates ([18.1](guide-quality.md#181-output-self-validation-pre-send-check)) |
| **Grounds every claim** | Every fact traces to tool result, bootstrap, or notebook lesson ([18.2](guide-quality.md#182-grounding-rule-no-hallucination-between-tool-calls)) |
| **Rates own confidence** | Confidence 0.0-1.0 + basis on every signal ([18.3](guide-quality.md#183-confidence-scoring)) |
| **Degrades gracefully** | Partial results > no results; tag PARTIAL if degraded ([18.4](guide-quality.md#184-graceful-degradation-partial-results--no-results)) |
| **Explains decisions** | Session log includes WHY, not just WHAT ([18.5](guide-quality.md#185-decision-trace-log-why-not-just-what)) |
| **Reviews own quality** | 5-check self-review before notebook write ([18.6](guide-quality.md#186-cycle-self-review-quality-gate-before-notebook-write)) |
