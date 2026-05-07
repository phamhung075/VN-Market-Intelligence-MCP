**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 2. Two-Zone Folder Design

All agent documentation lives in exactly two zones with different access rules.

### Zone A: `.claude/` — Controlled (user approves changes)

Agent **identity, rules, and workflow definitions**. Changes here affect how the agent behaves. User reviews via git diff.

```
.claude/
├── agents/<agent-id>.md              # WHO: identity, permissions, constraints
├── flows/<agent-id>/                 # HOW: step-by-step workflow
│   ├── cycle.md                      #   cowork main flow
│   ├── main.md                       #   dev team main flow
│   └── <variant>.md                  #   alternative flows (eod, weekly, etc.)
├── knowledge/                        # SHARED: team rules, domain logic (read-heavy)
│   └── bundles/bundle-<agent-id>.md  #   pre-bundled knowledge per agent
├── skills/                           # SHARED: reusable behaviors (read-only)
│   └── <skill-name>/SKILL.md
└── tools/
    ├── package/<agent-id>.md         # tool permission package
    └── list/<tool-name>.md           # individual tool docs
```

**Rules for `.claude/` zone:**
- Agent can READ everything
- Agent can EDIT only files listed in its `document_zone.owns_controlled` (via doc-self-heal)
- Changes are committed to git = visible to user
- New files here require agent to update its own registry (see [Section 11](guide-agent-ops.md#11-document-registry--no-ghosts))

### Zone B: `docs/agent-memory/` — Autonomous (agent changes freely)

Agent **working memory and outputs**. Changes here are the agent's personal workspace. No user approval needed.

```
docs/agent-memory/
├── notebooks/<agent-id>.md           # BRAIN: lessons, patterns, cross-team notes (overwrite)
├── sessions/YYYY-MM-DD-<agent-id>.md # LOG: cycle-by-cycle append-only history
└── (shared folders — read only for most agents)
    ├── issues/                       # known issues (system-auditor owns)
    ├── manifests/                    # service manifests (ops owns)
    ├── modules/                      # module state (developer owns)
    └── patterns/                     # detected patterns (code-janitor owns)
```

**Rules for `docs/agent-memory/` zone:**
- Agent OWNS its notebook + session log files
- Agent can READ any notebook (for cross-team awareness)
- Agent NEVER writes to another agent's notebook or session log
- Append-only for session logs. Overwrite for notebooks.

### Zone C: `docs/` — Shared outputs

```
docs/
├── analysis-briefs/{TICKER}.md       # Per-ticker analysis ledger (multiple agents append their sections)
├── handoffs/TASK_NNN.md              # Task context (each agent appends own section only)
├── microservices/<service>/README.md # Service documentation (zone-restricted dev agent owns)
├── data/*.json                       # Volatile counts (via MCP tools, not direct Write)
├── TASKS.md                          # Sprint kanban (PM owns)
├── SPRINT_GOAL.md                    # Sprint vision (PO owns)
└── WORK.md                           # Work log (all agents append via Telegram)
```

### Why Two Zones?

| Concern | `.claude/` (Zone A) | `docs/` (Zone B+C) |
|---------|---------------------|---------------------|
| **Who reviews** | User via git diff | Agent self-manages |
| **Change frequency** | Rare (rule/flow updates) | Every cycle |
| **Impact of error** | Agent behaves wrong | Data is wrong (fixable next cycle) |
| **Rollback** | `git checkout` | Overwrite at next cycle |
| **Token cost to load** | High (rules are complex) | Low (structured, scannable) |

---

## 3. Per-Agent File Map

Every agent has this exact set of files. No more, no less. If a file doesn't exist, the agent doesn't have that capability.

### Cowork agent file map

```
CONTROLLED (Zone A — .claude/)
├── agents/<agent-id>.md                    # Definition + document_registry
├── flows/<agent-id>/cycle.md               # Main cycle flow
├── flows/<agent-id>/<variant>.md           # Extra flows (if any)
└── tools/package/<agent-id>.md             # MCP tool permissions

AUTONOMOUS (Zone B — docs/agent-memory/)
├── notebooks/<agent-id>.md                 # Personal notebook (lessons index)
└── sessions/YYYY-MM-DD-<agent-id>.md       # Session logs (append-only)

SHARED (Zone C — docs/)
└── analysis-briefs/{TICKER}.md             # Ticker ledger (append own section)
```

### Dev team agent file map

```
CONTROLLED (Zone A — .claude/)
├── agents/<agent-id>.md                    # Definition + document_registry
├── flows/<agent-id>/main.md                # Main flow
├── flows/<agent-id>/<variant>.md           # Extra flows (if any)
└── tools/package/<agent-id>.md             # Tool permissions

AUTONOMOUS (Zone B — docs/agent-memory/)
├── notebooks/<agent-id>.md                 # Personal notebook (lessons index)
└── sessions/YYYY-MM-DD-<agent-id>.md       # Session logs (append-only)

SHARED (Zone C — docs/)
├── handoffs/TASK_NNN.md                    # Append own section only
└── microservices/<service>/README.md       # Service docs (microservice devs only)
```
