# Token Economy — Agent-to-Agent Communication

Governs how agents compress their outputs when passing context to downstream agents. Reduces token consumption ~75% on long pipeline chains.

**Source of truth.** Referenced in MEMORY.md entry `project_token_economy_system.md`.

---

## Three-Tier Compression Policy

### ULTRA — Caveman Mode

- **Alias:** caveman
- **Reduction target:** ~75% vs. uncompressed prose
- **When to use:** inter-agent status pings, blocker escalations, WIP state changes, one-liner coordination signals
- **Format rules:** no prose, no paragraphs; `KEY: value` pairs or 1-line imperative only; no headers, no bullet lists; no filler words
- **Examples:**
  ```
  BLOCKER: 1409d missing dep. OWNER: developer. ACTION: unblock now.
  STATUS: 1409c DONE. TESTS: pass. NEXT: qa.
  ```

### FULL — Structured Compressed

- **Alias:** handoff
- **Reduction target:** ~40% vs. uncompressed prose
- **When to use:** task handoff files (`TASK_NNN.md`), RETURN blocks, architect design summaries, knowledge files (permanent SSOT)
- **Format rules:**
  - Structured Markdown with headers and bullets
  - Acceptance criteria as checklist items
  - No narrative padding ("In this section we will…")
  - No repetition of context the receiving agent can read from files (give the path, not the content)
  - No restating the sprint goal — the receiver reads SPRINT_GOAL.md
  - Tables and bullet lists preferred over paragraphs
  - Max 400 words per handoff file body
- **Example:** standard `TASK_NNN.md` format — see any file under `docs/handoffs/`

### LITE — Terse Prose

- **Alias:** summary
- **Reduction target:** ~20% vs. uncompressed prose
- **When to use:** session logs (append entries), sprint retrospectives, PM status updates surfaced to the user
- **Format rules:**
  - Flowing prose allowed
  - Max 3 sentences per point
  - No filler sentences ("It is worth noting that…", "As mentioned earlier…")
  - Cut any sentence that adds zero new information
- **Example:** `1360: Fix morning briefing formatStoryTitle + delta arrows — 7 tests pass`

---

## Decision Matrix

| Signal type | Tier |
|---|---|
| Agent ping / status check | ULTRA |
| Blocker escalation | ULTRA |
| WIP state change | ULTRA |
| Agent RETURN block | FULL |
| Task handoff file | FULL |
| Architect design doc | FULL |
| Knowledge file (permanent SSOT) | FULL |
| TASKS.md Done row | LITE |
| Sprint session log append | LITE |
| Completed Sprints summary line | LITE |
| User-facing status report | LITE |
| Sprint retrospective | LITE |

---

## How Agents Signal Tier

The signal type from the decision matrix determines the tier automatically. For non-standard cases where the sender chooses a tier explicitly, prefix the message:

```
[ULTRA] STATUS: done.
[FULL] ## Handoff ...
[LITE] Sprint 1409 closed. All 5 sub-tasks merged.
```

---

## RETURN Block Format (FULL tier)

Every agent response ends with a RETURN block in FULL tier:

```
## RETURN
DONE: [one sentence — what was completed]
NEXT: [agent name] | [one sentence — what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

Rules:
- DONE: one sentence, past tense, factual, max 20 words
- NEXT: agent name + one sentence task description, or `none` if pipeline complete
- Allowed values: task ID, file paths, test counts, error codes — no prose recaps
- PIPELINE: `complete` only when the full sprint goal is achieved, not just this sub-task

---

## Enforcement

Agents that violate compression (e.g., pasting full file contents into a RETURN block) will be flagged by PO at sign-off review. Repeat violations trigger an architect review of that agent's prompt.
