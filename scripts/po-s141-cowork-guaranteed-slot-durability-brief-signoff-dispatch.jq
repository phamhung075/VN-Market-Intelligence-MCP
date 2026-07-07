# po-s141 — SIGN-OFF an architecture-brief remediation (idempotent, single atomic pass).
# Origin 2026-07-07: PO sign-off of agents-architect brief
#   docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md (Option A generalized).
# Pattern (reusable): "PO signs off an architecture brief that maps owners → implementation tasks:
#   DEDUP-PROMOTE any pre-existing board rows the brief supersedes (re-spec in place, keep id/lineage,
#   stamp scope_corrected+prior_spec), MINT only the genuinely-new owner tasks (dependent ones HELD in
#   backlog with depends[]+hold_reason), GATE the source signal_queue row on the QA DoD task (do NOT
#   resolve), and record the ruling in sprint_goal.entries. Head untouched. PO does NOT spawn."
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s141-cowork-guaranteed-slot-durability-brief-signoff-dispatch.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# orch-apply.sh does Zod + dup-key + CAS + atomic rename. PUSH HELD — fleet-push timer pushes.

def has_backlog(id): ((.task_board.backlog // []) | map(type=="object" and .id==id) | any);
def in_any_lane(id):
  ( ((.task_board.backlog // []) + (.task_board.ready // []) + (.task_board.in_progress // [])
     + (.task_board.review // []) + (.task_board.done // []) + (.task_board.done_verified // []))
    | map(select(type=="object") | .id) | index(id) ) != null;

# ---- new / re-specced task objects ----
($now) as $n
| ({
    id: "F1-LAUNCHD-COWORK-BACKSTOP",
    status: "READY", priority: "high", type: "SPRINT-S",
    owner: "developer", next_agent: "developer", zone: "cross-service",
    title: "Generalized launchd guaranteed-slot firer (supersedes F1.4 per-slot design)",
    desc: ("Per architecture brief docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md section 3 + 5.1-2. "
      + "Build NEW scripts/agents-flow/cowork-guaranteed-slot-firer.sh: calls 'node scripts/agents-flow/cowork-match-slots.js', "
      + "filters returned slots[] to guaranteed===true, and for each match invokes 'timeout 1800 claude --dangerously-skip-permissions -p <slot.trigger_prompt>' "
      + "(trigger_prompt read VERBATIM off the matched slot object — NEVER hardcoded per-agent). Reuses the SAME matcher the live */15 dispatcher uses "
      + "→ one SSOT (docs/data/cowork-schedule.json), zero drift on what counts as due. Test-first: sibling cowork-guaranteed-slot-firer.test.sh mirroring "
      + "auditor-tier1-probe.test.sh (mock claude/node, ZERO real invocations). Generalize the plist too: ONE launchd/com.vn-market.cowork-guaranteed-slot-firer.plist "
      + "(StartInterval=900, RunAtLoad=false, KeepAlive=false). RETIRE scripts/cowork-fb-daily-firer.sh + launchd/com.vn-market.fb-daily-firer.plist into it "
      + "(fb-daily/fb-weekend are already guaranteed:true rows → subsumed, no overlapping 900s poller). Scope: guaranteed===true ONLY — deliberately EXCLUDES "
      + "sub-hourly market/offhours slots (stay Layer-B-only by design; bounds F-GATHERER-OFFHOURS-STALL-0704). Dedup: NO new mechanism — every guaranteed flow "
      + "already carries the published-marker task_claim gate. Verify EMPIRICALLY whether launchd serializes same-Label runs; do not assume."),
    files: ["scripts/agents-flow/cowork-guaranteed-slot-firer.sh (new)","scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh (new)","launchd/com.vn-market.cowork-guaranteed-slot-firer.plist (new)","scripts/cowork-fb-daily-firer.sh (retire)","launchd/com.vn-market.fb-daily-firer.plist (retire)","scripts/agents-flow/cowork-match-slots.js (reuse, no edit)"],
    acceptance: "matcher-driven; guaranteed===true filter; trigger_prompt read off slot object not hardcoded; timeout 1800 bound; test-first with zero real claude/node invocations; fb-only script+plist retired; a new guaranteed:true slot in cowork-schedule.json needs ZERO script edits.",
    architect_brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md",
    epic: "F1 (RemoteTrigger→local launchd migration)",
    prior_title: "F1.4 Write scripts/cowork-launchers/*.sh (session-alive→no-op else spawn, task_claim dedup) + launchd plists for the 5 active slots",
    scope_corrected: $n, updated_at: $n, updated_by: "po (po-s141 brief-signoff)"
  }) as $m1
| ({
    id: "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED",
    status: "READY", priority: "high", type: "FIX",
    owner: "developer", next_agent: "developer", zone: "cross-service",
    title: "Tier-1 auditor self-check: assert vn-market LaunchAgents are loaded (catches silent unload)",
    desc: ("Per architecture brief section 2 + 3.8. Root gap the brief FOUND: fb-daily-firer.plist WAS loaded+firing 07-01→07-04 then silently unloaded with "
      + "NOTHING detecting it (fb-daily-firer.log = 4 good fires then dark after 07-04T17:44:35Z, no unload event) → the 73h outage class recurs even after the "
      + "firer ships. FIX: extend scripts/agents-flow/auditor-tier1-probe.sh (shipped, READ-ONLY, TOKEN-ECONOMY-TICK-PREFLIGHT WU-3) with ONE more check in the "
      + "same style as its existing 5: 'launchctl list | grep -q com.vn-market.cowork-guaranteed-slot-firer' (+ the other required vn-market LaunchAgents) → FAILURE "
      + "verdict + bug-channel alert if a required label silently disappears. Extend auditor-tier1-probe.test.sh with the injected-fault case (unload/hide the plist "
      + "→ expect FAILURE+bug alert; restore → ALL_GREEN, feedback_fence_false_green discipline). Motivating incident (prior_spec): T1 peer-firer degraded 2026-07-03 "
      + "(03:00Z partial, 03:30Z absent) — this self-check is the durable fix for that SPOF class."),
    files: ["scripts/agents-flow/auditor-tier1-probe.sh","scripts/agents-flow/auditor-tier1-probe.test.sh"],
    acceptance: "auditor-tier1-probe.sh returns FAILURE + bug alert when a required vn-market LaunchAgent (incl com.vn-market.cowork-guaranteed-slot-firer) is absent from 'launchctl list'; injected-fault test proves FAILURE-on-missing then ALL_GREEN-on-restore.",
    architect_brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md",
    prior_spec: "T1 auditor peer FIRER degraded 2026-07-03 (owner po, next_agent ops, priority med) — investigate peer firer health. Re-specced to the concrete durable probe-extension per brief 3.8; priority med→high (recurrence-preventer).",
    scope_corrected: $n, updated_at: $n, updated_by: "po (po-s141 brief-signoff)"
  }) as $m2
| ({
    id: "OPS-COWORK-GUARANTEED-SLOT-INSTALL",
    status: "BACKLOG", priority: "high", type: "FIX",
    owner: "ops", next_agent: "ops", zone: "cross-service",
    title: "Install generalized cowork guaranteed-slot firer LaunchAgent; unload retired fb-only one",
    desc: ("Per architecture brief section 5.4. Gated on F1-LAUNCHD-COWORK-BACKSTOP landing (firer script+plist). Steps: symlink "
      + "launchd/com.vn-market.cowork-guaranteed-slot-firer.plist into ~/Library/LaunchAgents/; 'launchctl unload' the old com.vn-market.fb-daily-firer entry; "
      + "'launchctl load' the new one; verify 'launchctl list | grep com.vn-market.cowork-guaranteed-slot-firer' shows an entry. Per feedback_user_gates_delegate_to_ops "
      + "(2026-07-03 OVERRIDE) this is a gated local swap ops may execute without a further user gate. No repo files — local machine state only."),
    depends: ["F1-LAUNCHD-COWORK-BACKSTOP"],
    hold_reason: "Blocked until F1-LAUNCHD-COWORK-BACKSTOP (firer script+plist) reaches done_verified.",
    acceptance: "New LaunchAgent loaded (visible in launchctl list); old fb-daily-firer unloaded; no two overlapping 900s pollers.",
    architect_brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md",
    created_at: $n, created_by: "po (po-s141 brief-signoff)"
  }) as $m3
| ({
    id: "DOC-COWORK-CRON-RUNBOOK-FRESHEN",
    status: "READY", priority: "med", type: "FIX",
    owner: "agent-father", next_agent: "agent-father", zone: "agents",
    title: "Freshen stale cowork-master-cron-runbook: RemoteTrigger Layer A retired → generalized launchd firer",
    desc: ("Per architecture brief section 2 + 5.5. docs/protocols/cowork-master-cron-runbook.md (owner agent-father, last 2026-06-13) still documents "
      + "'Layer A — RemoteTriggers ... permanently active and MUST COEXIST' + a layer_a_deletion_locked:true gate — now STALE and actively misleading (Layer A "
      + "functionally retired by STANDING feedback_no_remote_trigger_all_local without the runbook being updated). Fix section 1: RemoteTrigger Layer A is retired; "
      + "the session-independent layer is now the generalized launchd firer (com.vn-market.cowork-guaranteed-slot-firer). Formally clear/rewrite "
      + "docs/data/cowork-schedule.json ._notes.layer_a_deletion_locked. Independent — does not block the code/install/qa chain."),
    files: ["docs/protocols/cowork-master-cron-runbook.md","docs/data/cowork-schedule.json (._notes.layer_a_deletion_locked)"],
    acceptance: "Runbook section 1 no longer describes RemoteTrigger Layer A as active/deletion-locked; names the generalized launchd firer as the session-independent layer; cowork-schedule.json._notes.layer_a_deletion_locked cleared/rewritten.",
    architect_brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md",
    created_at: $n, created_by: "po (po-s141 brief-signoff)"
  }) as $m4
| ({
    id: "QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL",
    status: "BACKLOG", priority: "high", type: "FIX",
    owner: "qa", next_agent: "qa", zone: "cross-service",
    title: "QA: 7-point session-down survival test — DoD gate before signal atb-cowork-...203223Z resolves",
    desc: ("Per architecture brief section 6 (mandatory DoD, PO decision gate). Gated on OPS-COWORK-GUARANTEED-SLOT-INSTALL + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED "
      + "landing. Run all 7 assertions: (1) plist loaded in launchctl list; (2) force Layer B dead (end CLI session / CronDelete master */15, confirm CronList shows no "
      + "cowork-team); (3) trigger a guaranteed slot due-window (real occurrence OR the ctx-injection seam in cowork-match-slots.js/cowork-tick-preflight.test.sh), invoke "
      + "firer once; (4) assert firer log shows claude -p invocation + target flow produced its REAL deliverable (dish/notebook/Telegram) with NO live CLI session + no "
      + "fabricated/duplicate content (published-marker gate behaved); (5) regression: fb-daily/fb-weekend still fire post-consolidation; (6) scope check: a non-guaranteed "
      + "slot (news-scout-market) is NOT fired by the backstop while Layer B down (by design 3.5); (7) injected-fault test for the Tier-1 extension: unload/hide plist → "
      + "auditor-tier1-probe.sh returns FAILURE+bug alert, restore → ALL_GREEN. ONLY after all 7 pass may PO mark signal_queue row "
      + "atb-cowork-guaranteed-slot-durability-20260707T203223Z resolved."),
    depends: ["OPS-COWORK-GUARANTEED-SLOT-INSTALL","FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED"],
    hold_reason: "Blocked until ops install + auditor self-check land. This is the DoD gate for the source signal.",
    resolves_signal: "atb-cowork-guaranteed-slot-durability-20260707T203223Z",
    acceptance: "All 7 brief section 6 assertions pass. On pass → PO resolves the signal row.",
    architect_brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md",
    created_at: $n, created_by: "po (po-s141 brief-signoff)"
  }) as $m5

# ---- M1: re-spec + promote F1-LAUNCHD-COWORK-BACKSTOP backlog→ready (only if still in backlog) ----
| (if has_backlog("F1-LAUNCHD-COWORK-BACKSTOP")
   then .task_board.backlog = (.task_board.backlog | map(select((type=="object" and .id=="F1-LAUNCHD-COWORK-BACKSTOP") | not)))
        | .task_board.ready = ((.task_board.ready // []) + [$m1])
   else . end)
# ---- M2: re-spec + promote FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED backlog→ready ----
| (if has_backlog("FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED")
   then .task_board.backlog = (.task_board.backlog | map(select((type=="object" and .id=="FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED") | not)))
        | .task_board.ready = ((.task_board.ready // []) + [$m2])
   else . end)
# ---- M3: mint ops-install → backlog (HELD) if not present anywhere ----
| (if in_any_lane("OPS-COWORK-GUARANTEED-SLOT-INSTALL") then . else .task_board.backlog = ((.task_board.backlog // []) + [$m3]) end)
# ---- M4: mint agent-father doc-fix → ready if not present anywhere ----
| (if in_any_lane("DOC-COWORK-CRON-RUNBOOK-FRESHEN") then . else .task_board.ready = ((.task_board.ready // []) + [$m4]) end)
# ---- M5: mint qa DoD-gate → backlog (HELD) if not present anywhere ----
| (if in_any_lane("QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL") then . else .task_board.backlog = ((.task_board.backlog // []) + [$m5]) end)
# ---- signal row: gate on QA, keep status READ (idempotent via resolution_gated_on marker) ----
| .signal_queue.rows = (.signal_queue.rows | map(
    if (.id=="atb-cowork-guaranteed-slot-durability-20260707T203223Z" and (has("resolution_gated_on")|not))
    then . + {
      resolution_gated_on: "QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL",
      po_signoff: "brief 2026-07-07 Option A (generalized) signed off; re-spec F1.4+auditor + mint ops/doc/qa; resolve ONLY after brief section 6 7-point test passes",
      triaged_at: $n
    }
    else . end))
# ---- sprint_goal ruling entry (idempotent via id) ----
| .sprint_goal.entries = ((.sprint_goal.entries // []) as $e
    | if ($e | map(.id=="COWORK-GUARANTEED-SLOT-DURABILITY") | any) then $e
      else $e + [{
        id: "COWORK-GUARANTEED-SLOT-DURABILITY", ts: $n, by: "po",
        vision: "Guaranteed cowork slots (chef/digest/fb-daily) survive CLI-session absence via a generalized, self-verifying OS-level launchd backstop — one matcher SSOT, zero per-slot hardcode, Tier-1 auditor watches the watcher.",
        ruling: "Signed off agents-architect brief 2026-07-07 Option A (generalized); rejected Option B (VPS: no LLM runtime/creds, larger security surface). Re-spec F1.4 + auditor self-check (developer), ops install, agent-father runbook freshen; QA 7-point session-down survival is the DoD gate before signal resolve.",
        brief: "docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md"
      }] end)
| .task_board._updated_at = $n
| .task_board._updated_by = "po (po-s141 brief-signoff)"
