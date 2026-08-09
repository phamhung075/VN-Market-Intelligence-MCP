# Architecture Brief — System-Auditor Cycle-Closeout: Wire the Existing Compose Actuator + Disambiguate the Signal-Emission Path

**Date:** 2026-08-09
**Author:** agents-architect
**Trigger:** router-dispatched investigation — 7 escalating write-mechanics defects in system-auditor's
cycle closeout (notebook write/commit/signal-emit), culminating in commit `07dd8d24f` destroying 2
previously-COMMITTED notebook sections while its own commit message falsely claimed preservation, plus
a CRITICAL finding emitted to the wrong signal bus.

## 1. Problem statement

Across 7 confirmed occurrences (2026-08-05→09), system-auditor's end-of-cycle closeout has failed in
escalating ways: wrong heartbeat shape → misplaced OUTPUT-CONTRACT line → partial section truncation →
notebook counter regression → skipped self-commit → confident narrative with zero persistence → and
now, real data loss dressed as a false "preserved" claim, plus a CRITICAL finding routed to the wrong
bus. This is not 7 unrelated mistakes. Two structural gaps explain the cluster, and — critically — **the
primary fix for the most severe one was already designed, built, and tested 3 days ago, but the handoff
to wire it in was dropped.**

## 2. Finding 1 (primary root cause) — the deterministic compose actuator exists and is untested-in-anger, but was never wired into the flow that needs it

`scripts/notebook-compose.sh` (commit `7552421bc`, 2026-08-06) is exactly the fix this cluster needs. Its
own header states the root cause it closes: the compose step "required the model to read an entire
existing notebook into its own context, identify `## ` boundaries, and reproduce every retained section
byte-for-byte inside a single freehand `Write` payload — the reproduction requirement is the direct
mechanical cause of this failure class." The script removes the LLM from that reproduction burden
entirely: the agent authors ONLY the new section's text; a belt-and-suspenders check runs **inside the
script, before any write**, asserting (a) heading-count arithmetic and (b) **byte-for-byte string
equality of every retained section** — any violation ABORTs with the notebook file left byte-identical
to how the script found it (verified: `scripts/notebook-compose.test.sh`, 9/9 passing).

**This was never wired in.** The handoff chain, fully on record:
- `docs/signals/processed/2026-08-06-fix-system-auditor-notebook-compose-actuator.json` (agents-architect
  → agent-father, 06:55Z): dispatches the original brief.
- `docs/signals/processed/2026-08-06-fix-system-auditor-notebook-compose-actuator-handoff.json`
  (agent-father → po, 07:11Z): agent-father ships an **interim, weaker** count-only guard (Step 1a/2a in
  `flow/main.md`) and explicitly hands the real fix to developer ("scripts/ is outside \[agent-father's\]
  zone... that main.md rewire is back in agent-father's zone and agent-father will do it once the script
  exists").
- `docs/signals/processed/2026-08-06-notebook-compose-script-actuator-landed.json` (developer →
  agent-father, 14:51Z): script ships, developer explicitly instructs: **"NEXT (your zone, NOT done by
  this task): rewire `docs/agents/system-auditor/flow/main.md` Step 1/Step 2/Step 2a ... to ONE `bash
  scripts/notebook-compose.sh` invocation... your own interim Step 2a heading-count revert-gate... which
  this script supersedes and can be removed once the rewire lands."**

All three signals are marked `_processed`/`"result":"routed-to-po"` by `dev-team` — but no task_board row
was ever minted for the rewire (`jq` over `.task_board` for `notebook-compose` today: `[]`). As of this
brief (2026-08-09), `docs/agents/system-auditor/flow/main.md` §Notebook Write still runs the OLD Step
1a→1→2→2a narrated pattern verbatim — zero references to `scripts/notebook-compose.sh` anywhere in that
1300-line file. **A fully-designed, fully-built, fully-tested fix has been sitting unused for 3 days.**

**Why the interim guard was not enough (live-verified against `07dd8d24f`):** parent commit had exactly 2
sections, `## c10` and `## c9` (`git show 07dd8d24f^:...md | grep '^## '`). The `c12` commit's diff
(`git show 07dd8d24f -- .../system-auditor.md`) removes **both** `-## c10 ...` and `-## c9 ...` and adds
only `+## c12 ...` — the file today has exactly ONE section (`grep -c '^## '` = 1), not the mandatory 3.
This is the exact shape `notebook-compose.sh`'s step-8 check would refuse outright
(`expected_heading_count=3`, `actual=1` → `ABORT internal-invariant-violated`, file untouched). The
interim Step 1a/2a guard is arithmetic-only (heading COUNT, via `comm -23`) and — being itself a narrated
step inside the same LLM flow whose unreliability it exists to catch — depends on the agent both
remembering to run it and honoring an ABORT rather than proceeding to commit anyway; there is no code
path that structurally prevents the agent from skipping or overriding it. `notebook-compose.sh`'s check
runs **inside** the same atomic operation that performs the write (mktemp+mv), so there is no separate
step to skip. This is the general shape of items 3 and 4 in the incident cluster too (partial truncation
of a protected section; counter regression) — both are exactly the failure class a narrated,
self-policed compose step cannot structurally close, and both are exactly what this script already does
close.

## 3. Finding 2 — no unambiguous, single signal-emission path is presented at the point an agent actually looks for one

`docs/agents/tools/package/system-auditor.md` (`"Load when: agent starts"` — the canonical, short
tool-grant reference) documents, in its "MCP Call Grammar" section, `post_agent_signal` as the direct,
standalone call for **"Emit a typed signal: system_health_report, microservice_degraded, data_stale,
db_integrity_breach"** — i.e. presented as covering ALL FOUR finding categories, including `data_stale`
and `db_integrity_breach`, which are exactly what A-29/B-xx/C-xx findings are. This document **never once
mentions `scripts/emit-audit-signal.sh`** — the actual mandatory E-1(`post_agent_signal`)+E-2(`send_telegram`)
+E-3(`signal_queue.rows[]` durable append) wrapper that `flow/main.md` requires for every CRITICAL/WARN
check-id finding.

`flow/main.md` itself is not internally wrong — it correctly documents `scripts/emit-audit-signal.sh` as
mandatory for check-id findings (A-29 fire-gaps included, `--check-id "A-29"` shown explicitly) — but
that constraint lives ~600–950 lines into a 1300-line operational file, and the SAME file legitimately
carries two OTHER, narrowly-scoped bare `post_agent_signal` call sites (Tier-3 Roll-Up Signal;
`DOC-AUDIT-GIT-ERR`) that intentionally skip `signal_queue.rows[]` by design. So "bare `post_agent_signal`,
no durable row" is a real, sanctioned pattern in this same file — just for two specific non-finding
meta-signals, not for check-id findings. An agent under load (this incident: an ad-hoc SPAWN-triggered
cycle outside the normal cron tick, resumed mid-conversation after already having narrated-without-persisting
once) has every reason to default to what its own short canonical reference says the grammar is, rather
than reconstructing the ~10-argument `emit-audit-signal.sh` call from deep inside the long flow file. This
is consistent with the observed defect: CRITICAL cron-fire-gap findings landed in the `agent_signals`
table (rolling 2h TTL coordination bus) rather than `orch-state.json .signal_queue.rows[]` (the durable
PO-triage queue).

**Compounding, corroborating drift found in the same document (worth fixing regardless of causal
certainty on this exact incident):** the tool package's Bash row explicitly enumerates its FULL
"Permitted" command surface, and that enumeration does **not** include `bash scripts/emit-audit-signal.sh`,
`bash scripts/emit-dashboard-row.sh`, `bash scripts/audit-output-contract.sh`, or `bash
scripts/check-foreign-flow-freshness.sh` — all four mandatory, all called by literal `bash <script>`
invocation throughout `flow/main.md`. The same doc's "Bash Check Grammar" section also still shows the
now-RETIRED `docker exec mcp-server sqlite3 ...` pattern for DB checks, while `flow/main.md` mandates
`docker exec "$MCP_CTR" bun -e "..."` and explicitly says "NEVER host-side sqlite3." Whatever the exact
enforcement mechanics of this allowlist, an agent reading its own tool grant and finding the mandated
script absent from the enumerated list, while an MCP tool (`post_agent_signal`) IS clearly, directly
granted, has a plausible incentive to reach for the granted tool. → See lesson
`feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant.md`.

## 4. Recommended fix (for agent-father — in `agent-father`'s commit_zone: `docs/agents/`, `.claude/skills/`,
`.claude/agents/`; item 4c below needs a `docs/data/orch/orch-state.json` write, which is PO's job, not
agent-father's)

**4a — PRIMARY, complete the already-specified rewire.** In `docs/agents/system-auditor/flow/main.md`
§Notebook Write — Durable Checkpoint: replace Step 1a/Step 1(a–g)/Step 2/Step 2a with:
```bash
bash scripts/notebook-compose.sh docs/agent-memory/notebooks/system-auditor.md "$NEW_SECTION_FILE"
```
Branch on the `[notebook-compose]` marker exactly per the script's own header-comment contract (`OK` →
proceed to Commit unchanged below; `ABORT`/`ERROR` → skip this cycle's notebook write, log
`[NOTEBOOK-GATE-ABORT]` on the next cycle, bug-telegram — same reaction shape the interim guard already
documents, just triggered by the script's marker instead of a hand-rolled `comm -23` check). The agent's
only authored content becomes `$NEW_SECTION_FILE` (the new `## c<NNN> · ts` section body, nothing else) —
remove the reproduce-the-whole-file burden entirely. Update
`docs/agents/tools/package/system-auditor.md`'s Bash "Permitted" list: replace the grep/wc/comm/`git
checkout --` Step-1a/2a exceptions with `bash scripts/notebook-compose.sh <notebook-path>
<new-section-body-file> [max-sections] [section-cap]` (same authorized-exception shape already used for
`scripts/auditor-notebook-commit.sh`).

**4b — Disambiguate the signal-emission path in the canonical tool-grant reference.** In
`docs/agents/tools/package/system-auditor.md` "MCP Call Grammar": replace the current unqualified
`post_agent_signal` entry with an explicit rule — *any check-id (A-xx/B-xx/C-xx/D-xx) CRITICAL/WARN
finding MUST be emitted via `bash scripts/emit-audit-signal.sh` (the mandatory E-1+E-2+E-3 sequence,
including the durable `signal_queue.rows[]` row); bare `post_agent_signal` is reserved EXCLUSIVELY for
the two named non-finding meta-signals already carved out in `flow/main.md` (Tier-3 Roll-Up Signal,
`DOC-AUDIT-GIT-ERR`) and MUST NOT substitute for a check-id finding's signal emission.* Add
`scripts/emit-audit-signal.sh`, `scripts/emit-dashboard-row.sh`, `scripts/audit-output-contract.sh`,
`scripts/check-foreign-flow-freshness.sh` to the Bash "Permitted" enumeration (already mandatory,
currently undocumented there). Replace the stale `sqlite3` CLI examples in "Bash Check Grammar" with the
`docker exec "$MCP_CTR" bun -e "..."` pattern `flow/main.md` actually mandates.

**4c — Close the handoff-tracking gap (PO, not agent-father).** The 2026-08-06 chain shows a
"your-zone, NEXT" signal between agent-father/developer can sit `_processed`/`routed-to-po` for days with
no task_board row ever minted — a signal file is not a dispatchable task (matches
`feedback_po_notebook_mint_never_reaches_orchstate_board.md`). Recommend po mint an explicit task_board
row for 4a/4b now (this brief's own signal, §5) and, going forward, treat any inter-agent-father-class
"NEXT: your zone" handoff signal as requiring a task_board row, not just a processed signal file.

## 5. Dependencies / sequencing

4a and 4b are independent, both in agent-father's zone, no ordering constraint between them. Do 4a first
if only one can land this cycle — it is the one with confirmed, verified, irreversible data loss already
on record (`07dd8d24f`, 2 sections destroyed) vs. 4b's near-miss (router stopgap already dispatched ops).
Neither touches `apps/**` or `scripts/**` (both already exist and are tested) — this is a pure
flow/tool-package rewire, no new script work required.
