# Architecture Brief — HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING

**Date:** 2026-06-29  
**Task:** HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING  
**Design owner:** architect  
**Implementation owner:** agent-father  
**Policy owner:** architect (docs/data/file-size-caps.json)  

---

## Problem Statement

Two confirmed root causes — BOTH must be closed:

- **MEMBERSHIP gap:** 12 active notebook-writing agents are not registered in the SKILL.md AC-6 table or the file-size-caps.json `_note` field, so the settled-write self-cap contract does not formally apply to them.
- **ENFORCEMENT gap:** AC-5 in notebook-write SKILL.md is advisory prose ("verify as a sanity check"), not blocking. dev-pdf-extractor is fully registered in AC-6 yet shipped 203L; qa and claude-manager-helper were both registered yet each needed a separate flow-level point-patch. Registering agents in AC-6 alone does not prevent over-cap writes.

Both gaps must close together. Registering the missing 12 agents with only advisory AC-5 would still allow breaches; hardening AC-5 without registering the 12 still leaves them outside the contract.

---

## Part 1 — AUDIT TABLE

### Derivation

Scan: `grep -rl "cowork-end-cycle\|notebook-write" docs/agents/*/flow/` identifies all flows that call the end-of-cycle notebook-write step. Agent ID extracted from the path prefix `docs/agents/<agent-id>/`.

### OVERWRITE class (full-file replace each cycle; cap = template IS the cap)

| Agent | Notebook | Lines now | Status |
|---|---|---|---|
| po | po.md | 25L | IN AC-6 |
| market-watcher | market-watcher.md | 22L | IN AC-6 |

### APPEND class — already registered in AC-6

| Agent | Notebook | Lines now |
|---|---|---|
| unified-agent/CHEF | unified-agent.md | 71L |
| news-scout | news-scout.md | 29L |
| bctc-analyst | bctc-analyst.md | 56L |
| agents-architect | agents-architect.md | 29L |
| digest-predict | digest-predict.md | 137L |
| fb-market-poster | fb-market-poster.md | 119L |
| system-auditor | system-auditor.md | 81L |
| ops | ops.md | 559L (**BREACH — hook will auto-prune on next write**) |
| ops-vps-fetch | ops-vps-fetch.md | 99L |
| ops-mainserver-fetch | ops-mainserver-fetch.md | 116L |
| developer | developer.md | 176L |
| dev-technical-analysis | dev-technical-analysis.md | 150L |
| dev-macro-indicators | dev-macro-indicators.md | 65L |
| dev-mcp-server | dev-mcp-server.md | 43L |
| dev-stock-price | dev-stock-price.md | 183L |
| dev-kinh-dich | dev-kinh-dich.md | 156L |
| dev-frontend | dev-frontend.md | 118L |
| dev-pdf-extractor | dev-pdf-extractor.md | 203L (**BREACH**) |
| dev-rag-service | dev-rag-service.md | 159L |
| dev-alert-engine | dev-alert-engine.md | 75L |
| dev-api-gateway | dev-api-gateway.md | 108L |
| dev-vps-crawls | dev-vps-crawls.md | 191L |
| dev-mainserver-crawls | dev-mainserver-crawls.md | 144L |
| qa | qa.md | 85L |
| claude-manager-helper | claude-manager-helper.md | 164L |

### APPEND class — MISSING from AC-6 (to add in this task)

| Agent | Notebook | Lines now | Gap severity |
|---|---|---|---|
| pm | pm.md | 283L | ACTIVE BREACH (P0 on first hook write) |
| fixer | fixer.md | 185L | Near-cap |
| tran-ngoc-bau | tran-ngoc-bau.md | 185L | Near-cap |
| code-janitor | code-janitor.md | 165L | Near-cap |
| ba | ba.md | 164L | Near-cap |
| agent-father | agent-father.md | 147L | Approaching |
| alert-commander | alert-commander.md | 142L | Approaching |
| architect | architect.md | 93L | Fine |
| qa-responder | qa-responder.md | 88L | Fine |
| cowork-refactory-expert | cowork-refactory-expert.md | 15L | Fine |
| market-analyst | market-analyst.md | 15L | Fine |
| idea-forge | idea-forge.md | 15L | Fine |

### Notebooks with no formal notebook-write flow (outside fence scope)

| Notebook | Lines | Note |
|---|---|---|
| main.md | 113L | Router/main terminal ad-hoc writes; no cowork-end-cycle flow |
| dev-team.md | 85L | Dev-team coordination; no cowork-end-cycle flow found |

These are not governed by any agent's notebook-write flow. The hook still protects them (it governs by path pattern). They are excluded from the fence scan since the fence gates on "agent with a flow that writes notebooks".

---

## Part 2 — BATCH-REGISTER: SSOT update spec

Both SSOTs must be updated in ONE commit. Agent-father implements.

### SKILL.md change (`.claude/skills/notebook-write/SKILL.md`)

AC-6 APPEND row: append these 12 agents to the existing comma-separated list:  
`pm, fixer, tran-ngoc-bau, code-janitor, ba, agent-father, alert-commander, architect, qa-responder, cowork-refactory-expert, market-analyst, idea-forge`

New APPEND list (full, for the Edit to be unambiguous):

```
| APPEND | unified-agent/CHEF, news-scout, bctc-analyst, agents-architect, digest-predict, fb-market-poster, system-auditor, ops, ops-vps-fetch, ops-mainserver-fetch, developer, dev-technical-analysis, dev-macro-indicators, dev-mcp-server, dev-stock-price, dev-kinh-dich, dev-frontend, dev-pdf-extractor, dev-rag-service, dev-alert-engine, dev-api-gateway, dev-vps-crawls, dev-mainserver-crawls, qa, claude-manager-helper, pm, fixer, tran-ngoc-bau, code-janitor, ba, agent-father, alert-commander, architect, qa-responder, cowork-refactory-expert, market-analyst, idea-forge | AC-2 retention + AC-3 settled-write + AC-2b intra-prune + AC-5 wc gate | ≤200L file; ≤60L/section |
```

Also: upgrade AC-5 advisory text to BLOCKING (see Part 3).

### file-size-caps.json change

Update `caps[1]._note` (the `agent-notebook` entry) to include the 12 new agents in the APPEND class list. This is a string-only edit to keep the note in parity with SKILL.md.

### Parity invariant

After the change, the APPEND agent list in SKILL.md AC-6 and the APPEND agent list named in file-size-caps.json `_note` MUST be identical sets (whitespace-normalised, order-independent). The fence (Part 4) verifies this.

---

## Part 3 — AC-5 ADVISORY → BLOCKING + HEADLESS HOOK

### 3a. AC-5 text upgrade in SKILL.md

Current AC-5:
> AC-5 is a verification gate, NOT a remediation loop. If it fires, fix Step 1 and re-write once.

New AC-5 (BLOCKING):
> AC-5 is a BLOCKING gate. If the composed body exceeds 200L after Step 1, the agent MUST recompose (return to Step 1c, drop the next-oldest section) and re-run Steps 1d–1g until ≤200L — do not land the write with an over-cap file. The PostToolUse hook `scripts/agents-flow/notebook-auto-prune.sh` backstops this gate at write time; if the hook prunes the file, it means AC-3 Step 1 failed — treat as a BUG in the composing agent's flow.

### 3b. Headless PostToolUse hook — `scripts/agents-flow/notebook-auto-prune.sh`

**Location:** `scripts/agents-flow/notebook-auto-prune.sh`

**Trigger (settings.local.json):** Add a NEW PostToolUse hook entry for matcher `Write|Edit`:
```json
{
  "type": "command",
  "command": "bash \"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/scripts/agents-flow/notebook-auto-prune.sh\" 2>/dev/null || true"
}
```
This is a SECOND PostToolUse hook in the `Write|Edit` matcher (the existing one runs `context-bloat-backstop.sh`). Both run; order is: notebook-auto-prune fires first (prunes if needed), then context-bloat-backstop (checks after prune).

**Implementation contract:**

```
INPUT:  PostToolUse JSON on STDIN: { "tool_name": "Write"|"Edit", "tool_input": { "file_path": "..." }, ... }
OUTPUT: file at path is ≤200L (or unchanged if safe-fail triggered)
EXIT:   always 0 (non-blocking)

Algorithm:
  1. Parse FILE_PATH from STDIN JSON (same as context-bloat-backstop.sh)
  2. Guard: REL_PATH must match docs/agent-memory/notebooks/*.md
     AND must NOT match docs/agent-memory/notebooks/archive/*.md
     (archive is exempt — cap=9999)
     Non-match → exit 0
  3. Count lines: LINE_COUNT=$(wc -l < "$FILE_PATH")
     If LINE_COUNT ≤ 200 → exit 0 (clean; AC-3 worked)
  4. Parse sections:
     Extract preamble (everything before first "^## " line).
     Extract all ## sections: split at "^## " boundaries.
     SECTION_COUNT = number of ## blocks found.
     If SECTION_COUNT == 0:
       → Cannot parse structure. Emit breach-signal (type: notebook_unparseable_breach,
         to: claude-manager-helper) to docs/signals/. Do NOT modify file. exit 0.
  5. Drop-oldest loop:
     While LINE_COUNT > 200 AND SECTION_COUNT > 1:
       Drop the OLDEST (first) ## section (heading line + all lines until next ## or EOF).
       Decrement SECTION_COUNT.
       Recount LINE_COUNT.
     End while.
     If LINE_COUNT still > 200 AND SECTION_COUNT == 1:
       → Only preamble + 1 section remain. Cannot prune further safely.
         Emit breach-signal (type: notebook_single_section_overage_breach). Do NOT truncate. exit 0.
  6. Write the pruned content back:
     Atomic write: compose pruned body as string, write to TEMP file, then mv TEMP → FILE_PATH.
     (Pure bash shell write, NOT a Claude Edit/Write tool — does not trigger further PostToolUse events.)
  7. exit 0
```

**Key design properties:**

| Property | How achieved |
|---|---|
| Never blind-truncate | Section parse check; emit signal if unparseable or only 1 section remains |
| Idempotent | If file ≤200L on entry, exit 0 immediately |
| No double-fire loop | Hook uses bash mv — not a Claude tool call — does not trigger PostToolUse |
| Reconciles with AC-3 | Implements same drop-oldest algorithm as AC-3 Step 1c/1f; hook = backstop |
| Non-blocking | always exits 0 |
| Does not touch non-notebook files | REL_PATH guard at Step 2 |

**Reconciliation with existing AC-3:**

AC-3 (in SKILL.md) is the PRIMARY path: compose in memory BEFORE write, land in ONE write ≤200L.  
This hook is the BACKSTOP: catches any write that escaped AC-3 (missing flow wiring, bug in step 1).

Decision: hook BACKSTOPS, does not replace AC-3. Rationale:
- AC-3 compose-in-memory is structurally safer (one write, never a race)
- Replacing AC-3 would mean every notebook write triggers TWO file operations (agent write + hook rewrite)
- SKILL.md AC-3 cross-references the hook as the canonical algorithm; flow authors implement the same logic
- If both work correctly, hook sees ≤200L every time and exits 0 (zero overhead beyond one wc -l call)

**No double-prune conflict:** If AC-3 is wired correctly, hook exits at Step 3 (line count ≤200). If hook prunes, AC-3 was defective — the hook's prune is the only prune. They cannot both run on the same write because AC-3 runs BEFORE the write (in-memory), and the hook runs AFTER.

---

## Part 4 — GUARD/FENCE

**Script:** `scripts/audits/notebook-class-fence.sh`

**Purpose:** Fails loud if any agent with a notebook-writing flow is registered in neither the APPEND nor OVERWRITE class in either SSOT. Also checks SSOT parity between SKILL.md and file-size-caps.json.

**Algorithm:**

```
1. SCAN: find all flow files that reference cowork-end-cycle or notebook-write:
   grep -rl "cowork-end-cycle\|notebook-write" docs/agents/*/flow/
   For each matching path, extract AGENT_ID from path prefix docs/agents/<agent-id>/

2. READ SKILL.md lists:
   Parse APPEND row from .claude/skills/notebook-write/SKILL.md AC-6 table
   Parse OVERWRITE row from same table
   SKILL_REGISTERED = APPEND ∪ OVERWRITE

3. READ file-size-caps.json list:
   Extract the _note field for class="agent-notebook"
   Parse agent names from the parenthetical APPEND list
   CAPS_REGISTERED = that set

4. FENCE-A: unregistered writers
   For each agent_id in SCAN_SET:
     if agent_id NOT in SKILL_REGISTERED → FAIL "agent-id '$agent_id' writes notebooks but is not in SKILL.md AC-6"
   Exit 1 if any failure.

5. FENCE-B: SSOT parity
   Symmetric difference of SKILL_REGISTERED and CAPS_REGISTERED → FAIL if non-empty
   "SSOT parity violation: SKILL.md has <X> not in file-size-caps.json note"
   "SSOT parity violation: file-size-caps.json note has <X> not in SKILL.md"
   Exit 1 if any violation.

6. FENCE-C: hook wired
   Check .claude/settings.local.json PostToolUse hooks for "notebook-auto-prune.sh"
   Exit 1 if absent: "notebook-auto-prune.sh hook is not wired in settings.local.json"

7. --self-test mode:
   Inject "test-ghost-agent" into SCAN_SET (as if it had a flow).
   Run FENCE-A with injected set.
   Expect exit 1 / expect "test-ghost-agent" in error output.
   If FENCE-A catches it → print "self-test PASS" and exit 0.
   If FENCE-A does NOT catch it → print "SELF-TEST FAILED: fence is broken" and exit 1.
```

**Fence-false-green verification (per feedback_fence_false_green lesson):**  
The `--self-test` mode injects a known violation and verifies the fence catches it. If `--self-test` passes, the fence algorithm is sound. Wire into CI as a `--self-test` invocation only if full CI scan is not desired (avoids SCAN_SET drift in CI env).

**CI wiring:** Add to pre-push or to a `scripts/ci/` step as:
```bash
bash scripts/audits/notebook-class-fence.sh --self-test
bash scripts/audits/notebook-class-fence.sh        # full scan
```
Both must exit 0 for CI green.

---

## Files to create / modify

| File | Action | Owner |
|---|---|---|
| `.claude/skills/notebook-write/SKILL.md` | Edit: expand AC-6 APPEND list + upgrade AC-5 to BLOCKING | agent-father |
| `docs/data/file-size-caps.json` | Edit: update `caps[1]._note` APPEND list to parity | agent-father |
| `scripts/agents-flow/notebook-auto-prune.sh` | Create: headless prune hook | agent-father |
| `.claude/settings.local.json` | Edit: add new PostToolUse hook entry for notebook-auto-prune.sh | agent-father |
| `scripts/audits/notebook-class-fence.sh` | Create: fence + self-test | agent-father |

No production code changes. No flow-file changes required (the hook backstops missing flow wiring automatically; BATCH-REGISTER closes the membership gap).

---

## DDD Layer / Zone

Cross-service tooling (`cross-service/`). All changes are in:
- `.claude/` — settings and skills (agent-tooling layer)
- `scripts/agents-flow/` and `scripts/audits/` — agent infrastructure
- `docs/data/` — policy data

No microservice code is touched. No DDD layer assignment needed.

**BUILD-STANDARD: not-applicable** (maintenance/tooling, no new service primitives)

---

## Risk Flags

| Risk | Mitigation |
|---|---|
| Hook fails to parse sections (malformed notebook) | FENCE-A catches structurally; hook emits signal, does not corrupt |
| Hook infinite-loop | Impossible: bash mv does not trigger Claude PostToolUse |
| pm.md 283L not pruned until next write | Expected: hook fires on NEXT write; no separate one-time prune needed per orch-state spec |
| ops.md 559L (very large) | Hook will prune on next ops write; signal already emitted by context-bloat-backstop |
| SSOT parity drift after future agent additions | FENCE-B detects and fails CI |
| settings.local.json hook ordering | notebook-auto-prune runs first (prunes), then context-bloat-backstop (verifies); add as FIRST entry in the PostToolUse Write|Edit hooks array |

---

## Acceptance Criteria (DoD)

1. `bash scripts/audits/notebook-class-fence.sh --self-test` exits 0
2. `bash scripts/audits/notebook-class-fence.sh` exits 0 (zero unregistered agents, SSOT parity clean, hook wired)
3. SKILL.md AC-6 APPEND list contains all 37 agents (25 existing + 12 new)
4. AC-5 text says BLOCKING (not "sanity check")
5. PostToolUse hook `notebook-auto-prune.sh` is wired in settings.local.json
6. Next write to pm.md by pm agent results in ≤200L file (hook prunes from 283L automatically)
7. wc -l of every docs/agent-memory/notebooks/*.md ≤200 after one write-cycle (except archive/ which is exempt)
