# Mint FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE -> backlog[]
#
# D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (commit ed01c5c1b) flipped
# scripts/orch-validate.mjs Stage-1b (lane coherence) from warn-only to
# hard-fail. Side effect discovered and reported (not fixed, correctly out of
# D5's own scope): orch-cold-evict.sh's --exclude-ids safety valve (added by
# D4 this same sprint) intentionally leaves an excluded terminal-status row
# sitting in a non-terminal lane — which is now lane-incoherent by definition,
# so the eviction script's own pre-rename orch-state-validate.sh check aborts
# the ENTIRE eviction run when --exclude-ids is used, not just skips that row.
#
# Router independently reproduced this: scripts/test/orch-cold-evict-tests.sh
# 19/27 PASS (8 FAIL), exact match to D5's self-report. All "REAL live
# orch-state.json UNCHANGED" assertions still pass — the regression is
# confined to the test's own fixtures; no cron/launchd invokes
# orch-cold-evict.sh (grep-confirmed by D5, not independently re-grepped by
# router but corroborated by the 4 live-excluded IDs all being coherent
# BLOCKED today, i.e. --exclude-ids is not the live mechanism in use). Risk:
# LOW today, but latent — will break the moment anyone actually exercises
# --exclude-ids live.
#
# Needs a real design decision (per D5's own scope note), not a scope-creep
# patch: e.g. should --exclude-ids force-relabel the excluded row to a
# lane-coherent status (BLOCKED) instead of leaving it in its original
# terminal status, or should Stage-1b carry a bounded exception list for
# rows explicitly under active --exclude-ids eviction? orch-cold-evict.sh
# carries its own pre-existing R-HIGH-1 sole-SSOT-eviction-script flag —
# whoever picks this up should read that flag's context first.
#
# GUARD: refuse if a row with this ID already exists anywhere on the board.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-mint-fix-cold-evict-exclude-ids-vs-hard-coherence.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| ([.task_board[] | arrays[]? | select(type=="object" and .id=="FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE")] | length) as $exists
| if $exists > 0 then error("FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE already exists on board — refuse duplicate mint")
  else . end
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: "FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE",
    size: "S",
    status: "BACKLOG",
    title: "Reconcile orch-cold-evict.sh --exclude-ids safety valve with Stage-1b hard-fail lane coherence",
    type: "FIX",
    zone: "scripts/",
    owner: "developer",
    priority: "normal",
    depends: [],
    note: "D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (commit ed01c5c1b) flipped orch-validate.mjs Stage-1b from warn-only to hard-fail process.exit(2). Discovered side-effect: orch-cold-evict.sh --exclude-ids leaves an excluded terminal-status row in a non-terminal lane (by design, to skip it during eviction) — now lane-incoherent, aborting the whole eviction run via the script's own pre-rename validate check. Reproduced independently: scripts/test/orch-cold-evict-tests.sh 19/27 PASS (8 FAIL), git-stash-confirmed causal by D5. Risk LOW today (no cron invokes orch-cold-evict.sh; current 4 live exclusions all use direct BLOCKED relabel instead of --exclude-ids, so the flag is not live-exercised) but latent — breaks the moment --exclude-ids is actually used. Needs a design decision: force-relabel excluded rows to a coherent status (e.g. BLOCKED) at eviction time, or give Stage-1b a bounded exception list for rows under active --exclude-ids. orch-cold-evict.sh carries a pre-existing R-HIGH-1 sole-SSOT-eviction-script flag — read that context first.",
    created_at: $now,
    created_by: "router",
    source: "D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING self-report recommendation, independently reproduced by router before minting"
  }])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
