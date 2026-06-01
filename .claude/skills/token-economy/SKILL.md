# Skill: Token Economy

Optimize text output for minimal token cost. Quality first — never drop essential info.
Also supports compressing natural language memory files into caveman format via `/compress`.

## Sections

| Section | Location |
|---|---|
| Writing optimization (15 techniques, MCP templates, quick workflow) | `→ see ./policies.md` |
| File compression (`/compress` command, CLI usage, compression rules) | `→ see ./compress.md` |
| Agent pipeline compression (ULTRA/FULL/LITE tiers) | inline below — Part 3 |

---

## Part 3 — Agent Pipeline Compression Policy (ULTRA / FULL / LITE)

Governs how agents compress outputs when passing context to downstream agents. Reduces token consumption ~75% on long pipeline chains.

### Three Tiers

| Tier | Alias | Reduction | When to use | Format rules |
|------|-------|-----------|-------------|--------------|
| ULTRA | caveman | ~75% | Inter-agent pings, blocker escalations, WIP state changes | `KEY: value` pairs or 1-line imperative only. No prose, no headers, no bullets. |
| FULL | handoff | ~40% | Task handoff files, RETURN blocks, architect design docs, knowledge files | Structured Markdown, bullets/tables, no narrative padding. Max 400 words per handoff body. |
| LITE | summary | ~20% | Session logs, sprint retros, PM status updates to user | Flowing prose OK. Max 3 sentences per point. No filler. |

### Decision Matrix

| Signal type | Tier |
|---|---|
| Agent ping / status check | ULTRA |
| Blocker escalation | ULTRA |
| WIP state change | ULTRA |
| Agent RETURN block | FULL |
| Task handoff file | FULL |
| Architect design doc | FULL |
| Knowledge file (permanent SSOT) | FULL |
| `orch-state.json .task_board` Done task entry | LITE |
| Sprint session log append | LITE |
| Completed Sprints summary line | LITE |
| User-facing status report | LITE |
| Sprint retrospective | LITE |

### Explicit Tier Signal

For non-standard cases, prefix the message:

```
[ULTRA] STATUS: done.
[FULL] ## Handoff ...
[LITE] Sprint 1409 closed. All tasks merged.
```

### RETURN Block Format (FULL tier)

```
## RETURN
DONE: [one sentence — what was completed]
NEXT: [agent name] | [one sentence — what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

Rules: DONE ≤20 words, past tense. NEXT = agent name + task. PIPELINE: `complete` only when full sprint goal achieved.

### Enforcement

Agents violating compression (e.g. pasting full file contents into RETURN block) flagged by PO at sign-off. Repeat violations → architect review of agent prompt.
