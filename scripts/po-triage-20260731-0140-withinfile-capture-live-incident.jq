# po triage 2026-07-31T01:40Z — addendum to po-triage-20260731-0132-*.jq
#
# FIX-COLDEVICT-WITHIN-FILE-PEER-CONTENT-CAPTURE got a LIVE positive control 5 minutes
# after this tick's earlier batch landed: the architect's pathspec-scoped commit 95a1083e5
# ("chore(memory/architect): design ...") legitimately named docs/data/orch/orch-state.json
# in its pathspec and thereby absorbed PO's 4 freshly-minted triage rows (174 lines).
# Zero sweep-guard warns fired — correctly, the commit WAS pathspec-scoped. The guard's
# unit is the FILE; this defect lives strictly INSIDE one legitimately-staged file.
#
# Also clears the row's plan_only:null (null strands a row from both backlog sweeps).
#
# Usage: jq -f scripts/po-triage-20260731-0140-withinfile-capture-live-incident.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready[] | select(.id == "FIX-COLDEVICT-WITHIN-FILE-PEER-CONTENT-CAPTURE")) |= (. + {
  "plan_only": false,
  "po_disposition_20260731T0140": "plan_only cleared null -> false by po. A null disposition is not a neutral value: it strands the row from both backlog sweeps (MEMORY feedback_po_notebook_mint_never_reaches_orchstate_board). supervised was already false, so this row is now genuinely dispatchable. No scope change.",
  "po_live_incident_20260731T0140": "LIVE POSITIVE CONTROL, observed end-to-end this tick, not inferred. At 01:35Z po wrote 4 new triage rows to docs/data/orch/orch-state.json via scripts/orch-apply.sh and had NOT yet committed. At 01:37:44Z the architect committed 95a1083e5 'chore(memory/architect): design FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE, notebook + journal' with a pathspec that legitimately included docs/data/orch/orch-state.json (it had its own board write to land). git show --stat 95a1083e5 => orch-state.json +174 lines; git log -S'FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A' -- docs/data/orch/orch-state.json returns 95a1083e5 as the landing commit. So all four po rows shipped inside a commit titled chore(memory/architect) — mis-attributed board write, exactly this row's thesis. WHY THE SWEEP GUARD IS STRUCTURALLY BLIND HERE (checked, not assumed): .git/sweep-guard.log has ZERO entries after 01:17:02Z, i.e. the hook never fired on 95a1083e5 — correctly, because the commit WAS pathspec-scoped. scripts/git-hooks/pre-commit:445-454 discriminates on GIT_INDEX_FILE shape (BARE vs SCOPED) and its detection unit is the FILE PATH. This defect lives strictly INSIDE one file that every writer legitimately stages, so no pathspec discipline can ever detect it and the sweep-guard family (6 rows) can never cover it. That is the whole reason this row must exist separately -- do not merge it into FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD or into FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION (minted this same tick, actuator-scoped to the BARE case only). BLAST RADIUS IS BENIGN-BY-LUCK HERE, NOT BY DESIGN: content was conserved because both writers went through orch-apply.sh (CAS-mtime guard + conservation check, live=734 candidate=738 on the po write), so nothing was lost -- only ATTRIBUTION was. The dangerous variant is a writer that stages orch-state.json from a stale read; the same commit would then land a rollback under an innocent title. AC should assert on attribution/ownership, not only on content conservation.",
  "updated_at": "2026-07-31T01:40:00Z",
  "updated_by": "po (triage-20260731T0140)"
})
