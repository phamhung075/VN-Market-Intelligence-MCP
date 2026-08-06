# Architecture Brief — Cowork Agent Write-Boundary Guard

**Task:** `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` (P1, supervised, plan_only)
**Author:** architect · **Date:** 2026-08-06
**Status:** DESIGN COMPLETE — routed to `agent-father` for implementation (no code shipped by this brief; PLAN-ONLY per task contract)
**Standard Detection:** BUG-FIX/REFACTOR (in-zone, no new primitives, no new service) → `BUILD-STANDARD: not-applicable`
**Zone:** `.claude/agents/` + `docs/agents/` + `.claude/skills/` + `scripts/agents-flow/` (agent-infrastructure, not `apps/`) — multi-file, no DDD layer applies (this is agent-definition/tooling, not application code)

---

## 1. Restated problem

7 cowork agents (`alert-commander`, `bctc-analyst`, `market-watcher`, `news-scout`, `digest-predict`, `unified-agent`, `qa-responder`) declare in frontmatter *"Writes only to `docs/agent-memory/notebooks/<agent>.md` … No other filesystem writes permitted"* while holding `Edit`+`Write`. 4 confirmed instances of the agent self-editing its own (or a sibling's) flow/tool-package doc:

| # | Date | Agent | File | Claim | Verdict |
|---|---|---|---|---|---|
| 1 | 07-15 | alert-commander | `flow/stage-bootstrap.md` | snapshot `.market_context` same-shape as `get_market_context()` | **FALSE** (bare string, no `source_tier`) — reverted |
| 2 | 07-15 | bctc-analyst | `flow/stage-analyze.md` + `tools/package/bctc-analyst.md` | 3 MCP param-name/schema facts | **TRUE** (3/3 RAW-probed) — kept, committed `ac1b13268` |
| 3 | 07-28 | bctc-analyst, market-watcher, news-scout | `flow/main.md`, `flow/stage-log-notify.md`, `flow/eod.md`, `flow/stage-sentiment.md` | gateway token-cap workaround, publish-dedup convention, transport-gap no-fabricate note, score-authority rule | All 4 **GOOD** per PO's own diff read — left uncommitted for 3 days (stranded), not reverted |

PO's `enrichment` field already corrected the original fix premise: the 7 agents' *actual* designed write surface is **notebook + `docs/signals/*.json`** (≈207 committed signal files across the 7, by design — verified below to be routed through the shared `cowork-boundary/SKILL.md` KLFL escalation path, not agent-specific code), so a strip-`Edit` fix would break signal routing fleet-wide. Three scope items were named: (1) make the boundary a mechanism, (2) re-spec the alert-commander idea underneath correctly (follow-up only), (3) give a legitimate channel for "agent found a real doc bug."

## 2. Root cause (brownfield finding — this is the key finding of this brief)

**This is not 4 independent agent misbehaviors. It is one shared skill with no boundary awareness, invoked from one composable entry point, applied uniformly across a fleet whose frontmatter declares (non-mechanically) that they may not do this.**

Verified call graph:
```
.claude/skills/cowork-end-cycle/SKILL.md   "Composable end-of-cycle skill for all cowork agents"
  Step 3: Doc self-heal → .claude/skills/doc-self-heal/SKILL.md
    "review the flow/knowledge/skill docs it followed... auto-fix... Commit doc fixes separately"
    — ZERO agent-identity / boundary check.
```
`cowork-end-cycle` is loaded from `docs/agents/{alert-commander,bctc-analyst,market-watcher,news-scout,digest-predict,unified-agent,qa-responder}/flow/*.md` (verified via grep — 15 call sites). Instance 1's own self-report literally read *"Self-reported as a 'Doc self-heal'"* — a verbatim match of this skill's protocol. All 4 confirmed instances are `doc-self-heal` firing as designed, on agents it was never gated against.

**Consequence for design:** the fix belongs at the ONE shared skill (`doc-self-heal/SKILL.md`), not patched into 15 individual flow-file call sites (`always_extend_not_duplicate`). Agents *without* a declared boundary (architect, developer, pm, agent-father, ops, po — none of which restrict their own writes) must keep `doc-self-heal`'s current direct-edit behavior unchanged; only the boundary-declared 7 branch differently.

## 3. Verified facts (RAW, not narrative)

- **Hook payload DOES carry agent identity.** Confirmed by reading the installed Claude Code CLI's own Zod schema (`/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js`): every hook event base object includes `agent_id` (subagent instance id, present only inside a subagent) and `agent_type` (*"Agent type name... present when the hook fires from within a subagent (alongside agent_id), or on the main thread of a session started with `--agent`"*) — i.e. `agent_type` equals the `name:` field a Task-tool subagent was spawned with (`alert-commander`, `bctc-analyst`, …). `PreToolUse` additionally carries `tool_name`, `tool_input` (unknown/any — `file_path` for Write/Edit), `tool_use_id`. This is the mechanism this brief is built on — not an assumption.
- **`.claude/settings.json` is git-tracked; `.claude/settings.local.json` is NOT** (globally gitignored via `~/.config/git/ignore`, confirmed `git check-ignore -v`). The existing SSOT-critical `orch-state-hook-prewrite.mjs` PreToolUse guard is registered ONLY in the untracked file — a **pre-existing, separate risk** (flagged §7, not fixed here). The new guard in this brief MUST register in `.claude/settings.json` to be a durable, fleet-wide mechanism.
- **All 7 agents load `docs/agents/<id>/init.md` → `cowork-boundary/SKILL.md`** (confirmed, all 7). That skill's KLFL protocol grants every cowork agent — including the 3 whose own flow docs never mention it (alert-commander, digest-predict, qa-responder) — a `docs/signals/{agent-id}-{ISO}.json` write path. This is why the allow-list below is uniform on `docs/signals/**` across all 7, not agent-specific guesswork.
- **`Bun.Glob` exists** (bun 1.3.13, confirmed `typeof Bun.Glob === "function"`) — usable for allow-list matching in the new hook without a dependency.
- `agent-father` holds no `mcp__gateway__call_tool` grant (`.claude/agents/agent-father.md` tools line); `po` does. This is why independent re-verification of a live-tool-schema claim (§5.3) must happen at PO, not agent-father.
- `tran-ngoc-bau` and `fb-market-poster` are explicitly **excluded** from this fix's scope: `tran-ngoc-bau.md` frontmatter never declares a notebook-only boundary (no false claim to correct); `fb-market-poster.md` holds `Write` but not `Edit` and has zero `cowork-end-cycle` call sites found — lower risk, no confirmed instance. Both noted so a future sweep doesn't assume they were overlooked.

## 4. Design — 4 parts

### 4.1 SSOT: declare the real boundary (`docs/data/system-map.json`)

Add a `write_boundary` field to the 7 agents' entries in `.project.agents[]` (existing array — extend, not duplicate; this is *structural agent data*, which the project CLAUDE.md already designates this file as the SSOT for). New field, distinct from the existing `boundary_rules` block in `.claude/agents/*.md` frontmatter (that one is behavioral/scope prose; this one is a literal, machine-checked path allow-list):

```jsonc
// docs/data/system-map.json — .project.agents[] additions (one write_boundary object per id)
{"id":"alert-commander", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/alert-commander.md","docs/signals/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"bctc-analyst", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/bctc-analyst.md","docs/signals/**",
           "docs/analysis-briefs/*.md","data/bctc-analysis-cache/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"market-watcher", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/market-watcher.md","docs/signals/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"news-scout", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/news-scout.md","docs/signals/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"digest-predict", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/digest-predict.md","docs/signals/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"unified-agent", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/unified-agent.md","docs/signals/**",
           "docs/data/unified-agent-synthesis-*.json"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
{"id":"qa-responder", "type":"cowork", "write_boundary":{
  "allow":["docs/agent-memory/notebooks/qa-responder.md","docs/signals/**"],
  "doc_fix_channel":"docs/signals/doc-fix-proposals/",
  "source":"GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"}}
```
Apply via a `jq` merge (`.project.agents |= map(if .id == "alert-commander" then . + {write_boundary: {...}} else . end)` chained per id) — direct `Edit`, no wrapper script exists for this file today (unlike `orch-state.json`; confirmed via `.claude/skills/system-map-query/SKILL.md` § Update Protocol, which documents direct edits as the norm).

### 4.2 Mechanism: PreToolUse hook (the actual enforcement)

**New file:** `scripts/agents-flow/agent-write-boundary-guard.mjs` (bun, same shape/conventions as the sibling `orch-state-hook-prewrite.mjs`). **Spec, not code** — architect does not write production code:

1. Read+parse stdin JSON (`PreToolUse` payload). Parse failure → exit 0 (fail-open — matches sibling hook's own documented policy: hook errors must never break work).
2. `tool_name` ∉ {`Write`,`Edit`} → exit 0.
3. `agent_type` from payload; empty/absent → exit 0. (Deliberate: this scopes the guard to Task-tool-spawned/named subagents only — the main-terminal router, which holds no notebook-only declaration, is untouched by construction, consistent with `CLAUDE.md`'s "router = never implement directly, always delegate" split.)
4. Read `docs/data/system-map.json`; missing/unparseable → stderr WARN + exit 0 (infra fail-open, identical policy to the sibling hook's `VALIDATOR_PATH`/`CONSERVATION_CHECK_PATH` missing-case).
5. `entry = .project.agents[] | select(.id == agent_type)`; no entry or no `.write_boundary` → exit 0. **This is the never-hardcode design point**: adding/removing a restricted agent later is a *data* change to `system-map.json`, never a code change to this script.
6. Resolve `tool_input.file_path` to a project-root-relative POSIX path (reuse `dirname(fileURLToPath(import.meta.url))` → `resolve(...,'../..')` pattern from the sibling hook). A path that resolves outside the project root is treated as **not matching** any allow pattern (conservative — a boundary-declared agent has no legitimate reason to write outside the repo).
7. `allowed = write_boundary.allow.some(p => new Bun.Glob(p).match(relPath))`.
8. Allowed → exit 0. Not allowed → **block**: `process.stdout.write(JSON.stringify({decision:"block", reason: <redirect message, §4.3>})) ; process.exit(2)`.
9. Wrap steps 4–8 in try/catch — any unexpected error → stderr WARN + exit 0 (never let a hook bug wedge a legitimate write; same fail-open discipline as the sibling script end-to-end).

**Block `reason` text (exact, so the model can act on it in the same turn):**
```
[agent-write-boundary-guard] BLOCKED: <agent_type> attempted <tool_name> on <file_path> — outside its
declared write_boundary (docs/data/system-map.json .project.agents[id=<agent_type>].write_boundary.allow).
Do NOT edit this file directly. Instead: (1) write docs/signals/doc-fix-proposals/<agent_type>-<ISO>.md
(sections: target_agent, target_files, Claim, Evidence [verbatim], Proposed Diff); (2) write
docs/signals/<agent_type>-doc-fix-proposal-<ISO>.json {from,to:"po",type:"doc-fix-proposal",payload:<path
from step 1>,priority,createdAt}. Full protocol: .claude/skills/doc-self-heal/SKILL.md § Step 0.
```

**`.claude/settings.json` registration** (new sibling `PreToolUse` block, additive — do not touch the existing `Glob|Grep` block):
```json
{
  "matcher": "Write|Edit",
  "hooks": [
    { "type": "command", "command": "bun \"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/scripts/agents-flow/agent-write-boundary-guard.mjs\"" }
  ]
}
```
**Verify before relying on it:** whether Claude Code fans out to *multiple* matcher blocks sharing the same `PreToolUse`/`Write|Edit` pattern (this one + the pre-existing `orch-state-hook-prewrite.mjs` block in `settings.local.json`) and aggregates block decisions. Existing settings already prove *different* matchers (`Write|Edit` vs `Bash`) both fire independently; same-pattern-multi-block fan-out is the one behavior this brief did not empirically verify — smoke-test with a synthetic blocking hook before trusting it in production. Do not silently assume.

**Test file:** `scripts/agents-flow/agent-write-boundary-guard.test.mjs` (per repo convention: every `scripts/agents-flow/*.mjs` ships a sibling `*.test.mjs`). Required cases:
- `agent_type` absent → allow, any path.
- `agent_type="architect"` (no `write_boundary` entry) → allow, any path (unrestricted class unaffected).
- Each of the 4 **regression fixtures** — the exact historical incident paths — now BLOCKED: `alert-commander` → `docs/agents/alert-commander/flow/stage-bootstrap.md`; `bctc-analyst` → `docs/agents/bctc-analyst/flow/stage-analyze.md`; `market-watcher` → `docs/agents/market-watcher/flow/eod.md`; `news-scout` → `docs/agents/news-scout/flow/stage-sentiment.md`.
- Each agent's own notebook path + `docs/signals/**` + declared extras (`docs/analysis-briefs/*.md` for bctc-analyst, `docs/data/unified-agent-synthesis-*.json` for unified-agent) → allowed.
- `docs/data/system-map.json` missing/corrupt → allow + stderr warning (infra fail-open).
- `tool_name="Bash"` → allow unconditionally (documents the known residual gap, §7).

### 4.3 Legitimate channel: doc-fix-proposal (extends existing signal machinery — does not invent a new pipeline)

Reuses, verbatim, the established **Pipeline A** `docs/signals/*.json` shape (`{from,to,type,payload,priority,createdAt}` — same as `cowork-boundary/SKILL.md`'s own KLFL example) and mirrors the existing `improvement_proposal`/`improvement_approved_md` pattern (`docs/agents/po/flow/triage-signals.md`, `docs/agents/agent-father/flow/edit.md`) — but deliberately **lighter weight**: a single-fact, verbatim-evidence-backed schema/path correction does not need the 5-field PO critique + LANE-A/B/C classification built for *behavioral* improvement proposals (that machinery stays reserved for behavioral change — do not route doc-fix-proposal through it, that would be over-engineering for a typo-class fix).

**New artifact:** `docs/signals/doc-fix-proposals/{agent}-{ISO}.md`:
```markdown
## target_agent
<kebab-case agent id — usually the proposing agent, not always>
## target_files
- docs/agents/<agent>/flow/<file>.md
## Claim
<one-line factual claim>
## Evidence
<RAW tool call + RAW tool response proving the claim — narrative paraphrase auto-rejects>
## Proposed Diff
old_string: |
  <verbatim>
new_string: |
  <verbatim>
## Discovered during
cycle: <cycle_id>, agent: <proposing agent>, ts: <ISO>
```
Companion signal `docs/signals/{agent}-doc-fix-proposal-{ISO}.json`: `{"from":"<agent>","to":"po","type":"doc-fix-proposal","payload":"<path above>","priority":"medium","createdAt":"<ISO>"}`. No new drain code — `drain-signals.js`'s `isDrainableShape()` already accepts anything carrying `from`+`type` (verified in source).

**`doc-self-heal/SKILL.md` — new Step 0 (boundary gate, inserted before "What to review"):**
```markdown
### Step 0 — Boundary gate (mandatory, before touching any file)
jq -r --arg id "<your-agent-id>" '.project.agents[]|select(.id==$id)|.write_boundary // "none"' docs/data/system-map.json
- No entry / "none" → unrestricted (architect, developer, agent-father, pm, ops, po, …). Proceed unchanged.
- Entry present → you are boundary-declared. Do NOT Edit the target doc — a PreToolUse hook blocks it.
  Instead: (1) write docs/signals/doc-fix-proposals/{agent}-{ISO}.md (§ artifact above);
  (2) write docs/signals/{agent}-doc-fix-proposal-{ISO}.json (companion signal); (3) log in notebook
  carry-over and STOP — do not attempt the Edit.
```
This is the ONLY change to `doc-self-heal/SKILL.md`. Unrestricted agents (including `architect` itself, which also loads `cowork-end-cycle` → `doc-self-heal`) are unaffected — verified: no `write_boundary` entry exists or will exist for architect/developer/pm/agent-father/ops/po, so Step 0 falls through to today's behavior unchanged.

**`docs/agents/po/flow/triage-signals.md` — new Pipeline A dispatch row:**
```markdown
| `doc-fix-proposal` | any boundary-declared cowork agent (alert-commander, bctc-analyst, market-watcher, news-scout, digest-predict, unified-agent, qa-responder) | Read payload doc. **MANDATORY independent re-verification** (never trust the agent's own narrative — `feedback_agent_selfreport_metalayer_confabulation`): if `## Evidence` cites a live MCP tool call, re-run the SAME call via `call_tool(server="vn-market",...)` and confirm; if it cites a file/schema fact, re-Read/Grep it yourself. CONFIRMED TRUE → dedup-check NON-TERMINAL LANES + git log for an existing fix on the same `target_files`+claim; if new, emit `type=doc-fix-verified` to agent-father, `payload`=same proposal path, mark signal `triaged`. CONFIRMED FALSE (cf. alert-commander stage-bootstrap.md precedent) → REJECT: proposal `Status: REJECTED` + reason, `send_telegram(channel="bug",...)`, mark signal `RETRACTED`, do NOT dispatch. NOT independently re-verifiable (behavioral/design claim, not a live-probable fact) → route to `architect` instead of agent-father. | `doc-fix-verified`→agent-father (confirmed) / REJECT+bug (false) / architect (non-verifiable) |
```
PO is the correct verification point (not agent-father): PO holds `mcp__gateway__call_tool`; agent-father does not (confirmed, §3).

**`docs/agents/agent-father/flow/main.md` — new dispatch row:**
```markdown
| `signal type=doc-fix-verified` (from PO) | `docs/agents/agent-father/flow/edit.md` | **C-3 contract:** read proposal doc at `payload`. Extract `## target_agent`/`## target_files`/`## Proposed Diff` (verbatim old_string/new_string). Unlike C-1 (`improvement_approved_md`), the diff is already fully specified — `edit-prepare.md` Step 4 ("Produce EDIT PLAN") is skipped; use `## Proposed Diff` as the plan directly. Apply via `edit-apply.md` Step 5 with the exact strings. Set proposal `Status: APPLIED` + `applied_commit`. |
```
`edit-prepare.md` Step 4 gets one appended sentence: *"C-3 branch (doc-fix-verified input): the EDIT PLAN is already fully specified by the proposal's `## Proposed Diff` — skip authoring a new plan table, use it verbatim."*

**`docs/policies/dev-standards.md` § Script Persistence:** add one `CANONICAL:` pointer entry for the new guard script, per the section's own established convention (see e.g. `FIX-CMH-OBSOLETE-FILE-CLEANUP` entries).

### 4.4 Frontmatter + skill corrections (describe reality, not the old false claim)

`.claude/agents/<id>.md` for the 7 — replace `"No other filesystem writes permitted[...]"` with (template, substitute `<id>`/extras):
> *Writes: `docs/agent-memory/notebooks/<id>.md` (cycle log, full overwrite), `docs/signals/*.json` (signal emission, incl. doc-fix proposals)[, `<agent-specific extra>`]. All other filesystem writes mechanically blocked — see `docs/data/system-map.json` `.project.agents[id=<id>].write_boundary` + PreToolUse guard.*

`.claude/skills/cowork-boundary/SKILL.md` § `forbidden_outputs` bullet — replace:
> `NEVER write files outside session log, notebook, analysis-briefs, and channel messages`
with:
> `NEVER write files outside session log, notebook, analysis-briefs, docs/signals/*.json (incl. docs/signals/doc-fix-proposals/ — the ONLY legitimate route for a mid-cycle doc-bug finding if your agent carries a write_boundary entry; never Edit the doc directly), and channel messages`

## 5. Files to create / modify

| Action | Path |
|---|---|
| CREATE | `scripts/agents-flow/agent-write-boundary-guard.mjs` |
| CREATE | `scripts/agents-flow/agent-write-boundary-guard.test.mjs` |
| MODIFY | `.claude/settings.json` (new `PreToolUse`/`Write\|Edit` block) |
| MODIFY | `docs/data/system-map.json` (7× `write_boundary` additions) |
| MODIFY | `.claude/skills/doc-self-heal/SKILL.md` (new Step 0) |
| MODIFY | `.claude/skills/cowork-boundary/SKILL.md` (forbidden_outputs bullet) |
| MODIFY | `.claude/agents/{alert-commander,bctc-analyst,market-watcher,news-scout,digest-predict,unified-agent,qa-responder}.md` (7 files, description clause) |
| MODIFY | `docs/agents/po/flow/triage-signals.md` (new Pipeline A row) |
| MODIFY | `docs/agents/agent-father/flow/main.md` (new dispatch row) |
| MODIFY | `docs/agents/agent-father/flow/edit-prepare.md` (Step 4, one sentence) |
| MODIFY | `docs/policies/dev-standards.md` (CANONICAL pointer) |

## 6. Item 2 — the idea underneath (re-specced, NOT implemented here — follow-up only)

alert-commander's original (reverted) proposal: skip a redundant `get_market_context(hours_back=6)` call when `CYCLE_SNAPSHOT` is set. **Corrected spec** (for whoever picks this up — do not re-derive):
- `CYCLE_SNAPSHOT.market_context` is a bare **string** (`.text` content only, `jq '.market_context|type'` → `"string"`) — NOT the wrapper object `get_market_context()` returns live (`{source_tier, text}`). Any reuse must read it as a string and must NOT expect `.source_tier`.
- Unresolved precondition: whether `get_cycle_bootstrap(agent_name="unified-agent")`-sourced snapshot is tailored per calling agent or shared verbatim across all cowork agents — never settled in the original incident. Must be settled before this is safe for alert-commander specifically (its threshold/priority logic may need agent-scoped context).
- **Route:** a normal PO-initiated `intent=edit` request to `agent-father` (`docs/agents/agent-father/flow/edit.md`), sequenced **after** §4 ships (so if alert-commander's cycle discovers anything else while this is being edited, the boundary+channel already exist — no re-creation of the original incident class).

## 7. Risk flags

- **Bash-vector gap (not fixed by this brief):** 3 of the 7 (`alert-commander`, `market-watcher`, `news-scout`) also hold `Bash`, which could write outside `Write`/`Edit` entirely (`sed -i`, `cp`, heredoc-redirect) — undetected by this guard. All 4 confirmed historical instances used `Edit` (doc-self-heal-driven), not `Bash`, so this is a residual, not the load-bearing gap. Follow-up candidate: a `PostToolUse`/`Bash` backstop analogous to `orch-state-hook-bash-backstop.sh`, scoped to `docs/agents/**`/`.claude/agents/**` paths + write-verbs, same fail-open policy. Not blocking.
- **`settings.local.json` untracked (pre-existing, separate):** the sibling `orch-state-hook-prewrite.mjs` SSOT guard is registered only in the gitignored local file today — a latent portability gap unrelated to this fix, flagged for a separate follow-up, not remediated here.
- **Multi-block hook fan-out unverified** (§4.2) — smoke-test before trusting in production.
- **Fail-open by design, everywhere in this hook:** any parse/read/lookup failure allows the write through. This intentionally favors "never wedge legitimate work" over "never miss a violation," matching the sibling `orch-state-hook-prewrite.mjs`'s own documented policy. Do not change this without a separate, explicit decision.
- **Scope discipline:** `write_boundary` additions are confined to the 7 named agents. `tran-ngoc-bau` (no notebook-only claim in frontmatter) and `fb-market-poster` (no `Edit` tool, no confirmed instance) are deliberately excluded — see §3.

## 8. Rollout sequencing

Ship §4.1 (system-map data), §4.2 (hook+settings), §4.3 (channel: doc-self-heal + triage-signals + agent-father), and §4.4 (frontmatter/skill text) in the **same commit/PR**. Rationale: if the mechanism (§4.2) ships before the channel (§4.3) exists, a cowork agent hits a dead-end block with no legitimate alternative mid-cycle — worse than today. Order within the commit doesn't matter; atomicity does.

## RETURN
```
DONE: Architecture brief complete — docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md
ZONE: multi (.claude/agents/, docs/agents/, .claude/skills/, scripts/agents-flow/)
NEXT: agent-father | implement §4.1-4.4 per spec, in one commit (§8)
PIPELINE: continue (routed via brief_complete signal → po → route_to: agent-father)
QUALITY: full
```
