**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 15. Skills Catalog

| Skill | Path | Used by | When |
|-------|------|---------|------|
| cycle-bootstrap | `.claude/skills/cycle-bootstrap/SKILL.md` | Cowork | Step 0 |
| anti-hallucination | `.claude/skills/anti-hallucination/SKILL.md` | MCP users | Always |
| project-root | `.claude/skills/project-root/SKILL.md` | Dev team | Step 0a |
| notebook-read | `.claude/skills/notebook-read/SKILL.md` | Dev team | Step 0b |
| notebook-write | `.claude/skills/notebook-write/SKILL.md` | All | End cycle |
| session-log-cowork | `.claude/skills/session-log-cowork/SKILL.md` | Cowork | Before exit |
| doc-self-heal | `.claude/skills/doc-self-heal/SKILL.md` | All | Final step |
| append-session-record | `.claude/skills/append-session-record/SKILL.md` | Dev team | Before handoff |
| dispatch | `.claude/skills/dispatch/SKILL.md` | Main terminal | Routing |
| caveman | `.claude/skills/caveman/SKILL.md` | All | Always |
| token-economy | `.claude/skills/token-economy/SKILL.md` | All | Always |
| semble-search | `.claude/skills/semble-search/SKILL.md` | Dev team | Code search |

### Code Search Routing (Dev Agents)

Dev agents search code frequently. Use the right tool to minimize token waste:

| Task | Tool | Token cost |
|------|------|-----------|
| Find how something works / where it's implemented | `mcp__semble__search` | ~200 tok (1 call) |
| Discover related code after finding a result | `mcp__semble__find_related` | ~150 tok (1 call) |
| Exact string / regex match (e.g., all usages of `registerTool`) | `Grep` | ~100-500 tok |
| Read a specific known file path | `Read` | ~50-800 tok |
| Find files by name pattern | `Glob` | ~50 tok |

**Rule: never Grep blindly for semantic questions.** Semble answers in 1 call vs 3-5 blind greps.

```
WRONG (5 greps):  grep "authenticate" -> grep "login" -> grep "session" -> grep "auth middleware" -> Read 3 files
                  ~2,500 tok total

RIGHT (1 semble): mcp__semble__search(query="authentication flow", repo=".")
                   ~200 tok total (92% savings)
```

Semble indexes the repo on first call (cached for session). Accepts local path or GitHub URL.

---

## 16. Registration Checklist

After creating agent files, register in:

| File | What to add |
|------|-------------|
| `docs/references/agent-routing.md` | Routing intent table row (if user-invocable) |
| `docs/references/agent-roster.md` | Team section entry (SSOT for team design) |
| `.claude/skills/dispatch/SKILL.md` | Dispatch table entry |

For cron-scheduled: `.claude/commands/crons/cron-<agent-id>.md`
