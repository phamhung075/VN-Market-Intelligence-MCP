#!/usr/bin/env jq -f
# =============================================================================
# po-triage-20260728T19c-peer-index-sweep-live-reproduction.jq
# =============================================================================
# PO triage tick 2026-07-28T20:0xZ — evidence-only appends. No lane moves, no new rows.
# Referenced from: docs/agents/po/flow/scripts-registry.md
#
# Invocation:
#   jq --arg NOW "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/po-triage-20260728T19c-peer-index-sweep-live-reproduction.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# WHY: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD fired FOR REAL against this PO tick's own
# commit, WHILE PO HELD commit-mutex:main. Captured verbatim while the evidence is fresh.
# =============================================================================

($NOW) as $now

| .task_board.backlog |= map(
    if .id == "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD" then
      .updated_at = $now
      | .po_disposition_20260728 = "LIVE REPRODUCTION — THIS ROW IS NO LONGER THEORETICAL. It fired against PO's own commit during triage tick 2026-07-28T19:5xZ and PO was the victim. VERBATIM SEQUENCE: (1) po acquired commit-mutex:main via task_claim -> {claimed:true}. (2) po ran `git add` on exactly 5 own paths. (3) po ran the 3b foreign-path verify — `git diff --cached --name-only` returned EXACTLY those 5 paths, zero foreign. Verify was CLEAN. (4) po ran the 3c pathspec-scoped `git commit ... -- <same 5 paths>`. It exited RC=1 with 'aucune modification n'a ete ajoutee a la validation' — nothing to commit, because in the gap between (3) and (4) a peer had already committed po's staged content. (5) Forensics: commit 09ae11440 'chore(memory/dev-mcp-server): notebook + journal 2026-07-28 (FACTORY-APP-split-assembleBriefing)' contains SEVEN files, FIVE of them PO-owned and foreign to its stated scope — docs/agent-memory/notebooks/po.md, docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md, docs/data/orch/orch-state.json, scripts/po-triage-20260728T19-signal-routing-catchall-silent-drop.jq, scripts/po-triage-20260728T19b-sla-signalqualityaudit-deadjob-evidence.jq. Only 2 of the 7 belong to dev-mcp-server. NO DATA WAS LOST (`git diff HEAD` for all 5 paths is empty — content is in HEAD), so this instance is attribution corruption, not destruction. THE NEW AND IMPORTANT FINDING — THE MUTEX DOES NOT AND STRUCTURALLY CANNOT PROTECT AGAINST THIS: po held commit-mutex:main for the entire window. The sweeper was a dev-* specialist, and .claude/skills/commit-mutex/SKILL.md line 4-8 (INV-GATEWAY-1) EXPLICITLY EXEMPTS that whole population — 'Dev-*/qa/ba/pm/architect specialist sub-agents MUST NOT invoke this skill ... Specialists commit directly'. So the mutex serializes only its participants while the population most likely to commit concurrently is exempted by design, and the exemption's compensating control ('Specialists commit directly (explicit paths)') was not honoured here. A mutex that excludes the contending party is not a mutex. PO DISPOSITION ON THE BLOCK: the dependency on FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK is LEGITIMATE and this row stays BLOCKED — a pre-commit hook is the only actuator that can bind a population which by design never calls the mutex skill. But the child has been READY/P0/developer and UNDISPATCHED since 2026-07-25 while the bug it prevents fired in production today. Escalating via BATCH this tick. Corollary for whoever implements it: the hook must also cover the INV-GATEWAY-1 exempt path, and the 3b-verify -> 3c-commit window is itself the race — a clean 3b verify proves nothing about 3c, so the guard cannot live in the skill's verify step."
    else . end)

| .task_board.ready |= map(
    if .id == "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK" then
      .updated_at = $now
      | .po_escalation_20260728 = "PRIORITY ESCALATION 2026-07-28T20:0xZ by po. This row has been READY/P0/developer and undispatched since 2026-07-25 (3 days). The defect it exists to prevent REPRODUCED IN PRODUCTION today against PO's own triage commit — see FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD .po_disposition_20260728 for the verbatim sequence and the forensic commit (09ae11440, 5 of 7 files foreign). Its parent is BLOCKED on this row, so every day this sits undispatched the parent's block is also load-bearing. TWO DESIGN CONSTRAINTS THAT THE LIVE REPRODUCTION ADDS AND THAT THE ORIGINAL SCOPE DOES NOT STATE. (1) The hook MUST bind the INV-GATEWAY-1 exempt population (dev-*/qa/ba/pm/architect specialists). They never call commit-mutex by design (SKILL.md:4-8), so any guard implemented inside the skill is unreachable for exactly the agents that caused this. A git pre-commit hook is the correct layer precisely because it is transport-agnostic and cannot be opted out of. (2) The detection predicate cannot be 'verify the index before commit'. PO's 3b verify returned CLEAN (exactly 5 own paths, zero foreign) and the sweep still happened, because the peer committed in the gap between 3b and 3c. The hook must evaluate at commit time, comparing the commit's actual file set against the committing agent's declared own-paths, and fail loud on foreign inclusion — a snapshot taken any earlier is a TOCTOU read."
    else . end)
