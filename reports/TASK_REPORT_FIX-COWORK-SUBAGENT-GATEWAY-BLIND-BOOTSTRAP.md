# Task Report: FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP

Locally-spawned cowork subagents (bctc-analyst-slot-2 ×3, unified-agent chef-evening ×1, all
2026-07-07) landed with `mcp__gateway__call_tool` categorically absent from their tool binding —
a session-transport gap, not a config defect. Prior fallback (`send_telegram(channel="bug")`) is
itself a gateway call and fails identically when blind, forcing 4 ad-hoc raw-Write escalations,
2 with divergent bespoke schemas (one broke `drain-signals.js` routing).

Commit: `caba878b7` (4 files: `cycle-bootstrap/SKILL.md`, `step-0-cowork/SKILL.md`, decision
journal, agent-father notebook). Already on `main` (no branch — direct-to-main FIX pattern).

## 1. AC option verification — did NOT trust the "Option A already satisfied" claim

Ran my own fleet grep (`.claude/agents/*.md`, 41 files) rather than trusting the notebook's
count. 28/41 lack the grant, but those are the dev-team pipeline roles (architect, ba, developer,
fixer, pm, qa, dev-*, ops-*, semble-search, etc.) — not cowork agents, correctly out of scope.
Every agent that actually routes bootstrap through `step-0-cowork`/`cycle-bootstrap`
(bctc-analyst, alert-commander, digest-predict, market-watcher, news-scout, unified-agent,
qa-responder, po, ops) already declares `mcp__gateway__call_tool` in its `.claude/agents/*.md`.
Also confirmed `.mcp.json` registers the `gateway` server (`{"mcpServers":{"gateway":{"type":
"http","url":"https://zenmidi.com/gateway/mcp"}}}`). **Option A confirmed already-satisfied —
nothing to add at the config layer.** Root-cause commit `b3612720` (2026-06-23, "register gateway
HTTP MCP server in .mcp.json") independently re-read via `git show` — its own commit message
states "Requires full CLI process restart... mid-session edits are not re-read", which explains
why long-lived/freshly-spawned sessions can still land blind post-fix. Matches
`feedback_local_cowork_subagents_gateway_blind.md`.

## 2. Routing claim — traced live flow files myself, not the notebook's grep summary

- `docs/agents/bctc-analyst/flow/stage-bootstrap.md:5` → `.claude/skills/cycle-bootstrap/SKILL.md`
- `docs/agents/unified-agent/flow/chef.md:22` and `market-bootstrap.md:5` → same skill
- These are the exact 2 agents observed gateway-blind in the incident. Both route Step 0 through
  `cycle-bootstrap/SKILL.md` directly — confirms it is the correct primary-fix target.
- `step-0-cowork/SKILL.md` is referenced ONLY from each of 6 agents' `init.md` `always_load`
  knowledge list (alert-commander, bctc-analyst, news-scout, digest-predict, market-watcher,
  qa-responder) — never as an operative "Step 0. Bootstrap →" pointer in any live flow file.
  Confirms `step-0-cowork/SKILL.md` is documentation-adjacent, not the execution path — matches
  agent-father's claim.
- Read the full diff of both changed files: both carry equivalent guard logic (CONFIRMED-BLIND vs
  TRANSIENT classification, Write-fallback + no-send_telegram, graceful DEFER) —
  `cycle-bootstrap/SKILL.md` gets the full write-up, `step-0-cowork/SKILL.md` a condensed
  cross-reference. Consistent with the stated intent (fix both: primary live-path + literally-named
  file).

## 3. Core safety property — no `send_telegram` on CONFIRMED-BLIND

Read the GATEWAY-BLIND fallback block in both files line-by-line. On CONFIRMED-BLIND (error text
contains "no such tool"/"tool not found"/"unknown tool"): skips the 5s retry, goes straight to
fallback, which is:
1. `Write` a bug-escalation signal with the exact canonical schema (`from`, `to`, `type`,
   `payload`, `priority`, `createdAt`) — matches `fail-loud-protocol.md` § Output Boundary item 5
   verbatim (cross-checked line 47 and the full schema at lines 81-89).
2. Append a notebook DEFERRED line (direct `Write`/`Edit`, no MCP needed).
3. EXIT cleanly — explicit "no lock was held (blocked before any `task_claim`)" reasoning, so no
   STOP-RELEASE/orphan-lock risk.
No `send_telegram` call anywhere in the fallback path — confirmed by reading, not grep-absence
alone (grep also confirms 0 hits for `send_telegram` inside the fallback block in both files).

**CONFIRMED-BLIND text-pattern soundness:** cross-checked "no such tool"/"tool not found" against
real historical error strings recorded elsewhere in this repo for the identical failure mode:
`docs/incidents/2026-05-06-news-scout-bootstrap-failure.md` ("Error: No such tool available:
mcp__claude_ai_gateway__call_tool"), `docs/agent-memory/notebooks/po.md` (same session, same day:
"No such tool available"), `docs/spikes/SPIKE_C86_MCP_REG.md`. The pattern genuinely matches the
harness's real error shape for an unbound tool — not a guessed string.

**Filename convention check:** the fix writes
`docs/signals/<agent-id>-<ISO-timestamp>-gateway-blind.json` — protocol item 5 literally specifies
`{agent-id}-{ISO-timestamp}.json`. Read `scripts/agents-flow/drain-signals.js`: it globs
`fs.readdirSync(SIG).filter(f => f.endsWith('.json'))` and reads only content fields
(`from`/`to`/`type`/`payload`/`createdAt`) — filename suffix is cosmetic and does not affect
drain routing. Non-blocking; matches an existing repo-wide convention (e.g.
`auditor-commit-hygiene-20260608T2140Z.json`, `architect-fix-refine-lock-ttl-reclaim-...json`
already in `docs/signals/processed/`).

## 4. Build surface

```
file .claude/skills/cycle-bootstrap/SKILL.md .claude/skills/step-0-cowork/SKILL.md
→ both: "Unicode text, UTF-8 text" (plain markdown)
```
Grepped `apps/mcp-server/src` and all `*.test.ts` for references to either changed path — 0 hits.
**Pure instruction/markdown files — no compiled code, no build/lint/tsc/test surface exists for
this change.** `bun test`/`bun tsc --noEmit`/DDD/security scans are N/A (no production source
touched).

## 5. DJ-GATE-1

`docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` STEP `agent-father-S2`
contains `task-id:** FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP` with substantive
what-done/what-considered (2 real alternatives with rejection reasons, including a specific
false-start — "fix only step-0-cowork as literally named — rejected")/why-decision/why-change —
not a stub. Gate satisfied.

## 6. Commit hygiene

`caba878b7`: 4 files, all in scope (2 skill files + decision journal + agent-father notebook). No
`git add -A` evidence — file set matches stated scope exactly.

## Verdict: APPROVED

Both root-cause claims (Option A already-satisfied at config layer; `cycle-bootstrap/SKILL.md` is
the true live-execution path, `step-0-cowork/SKILL.md` is doc-adjacent) independently re-derived
from source, not trusted from the notebook. Guard logic correctly implements the required safety
property (no `send_telegram` on CONFIRMED-BLIND) with a canonical-schema Write-fallback that
matches `fail-loud-protocol.md` exactly, and the CONFIRMED-BLIND text pattern matches the real
historical error shape observed in this repo's own incident logs. Pure-markdown change — no
build/test regression surface. DJ-GATE-1 satisfied.

Live-fire verification (next bctc off-market cycle producing either a real `get_cycle_bootstrap`
call or a clean canonical-schema Write-fallback) has not yet occurred as of this review (no
bctc-analyst cycle has fired since commit `caba878b7` at 21:26 UTC) — acceptable per the AC, which
does not gate DONE_VERIFIED on a live post-fix fire; the guard is a markdown instruction whose
correctness is verifiable by inspection.

`docs/data/orch/orch-state.json` `task_board` flipped `FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP`
IN_PROGRESS → DONE_VERIFIED via `scripts/orch-apply.sh` (direct-to-main FIX pattern — no branch to
merge).
