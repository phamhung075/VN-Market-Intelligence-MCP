# One-shot: file the 2026-08-26 chef off-canonical-synthesis recurrence as a
# signal row for po triage. Router-authored (producer path; router never mints
# task rows). Invoke ONLY through the orch-apply gate, from the project root:
#
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); STAMP=$(date -u +%Y%m%dT%H%M)
#   jq --arg now "$NOW" --arg stamp "$STAMP" \
#     -f scripts/router-signal-20260826T0845Z-chefpath-recurrence.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer per docs/policies/dev-standards.md § Script Persistence.

.signal_queue.rows += [
  {
    id: ("rtr-" + $stamp + "-chefpath-recurred-today-full-quality-third-path"),
    ts: $now,
    from: "router",
    to: "po",
    type: "data_stale",
    summary: "chef off-canonical synthesis write RECURRED 2026-08-26 on a FULL-quality cycle to a THIRD path, UNTRACKED — refutes the degraded-floor root-cause hypothesis recorded on the owning row",
    severity: "HIGH",
    status: "new",
    payload_ref: null,
    provenance: "router",
    audit_cycle_tag: null,
    dedup_key: "chef-offcanonical-synthesis:recurrence-20260826-full-quality-third-path",
    detail: "LIVE RECURRENCE one day after the 08-25 incident, while the owning row FIX-CHEF-DEGRADED-FLOOR-RECOVERY-WRITES-OFF-CANONICAL-PATHS still sits UNDISPATCHED in backlog[]. Artifact: docs/agents/unified-agent/output/unified-agent-synthesis-2026-08-26-chef-intraday.json — a THIRD distinct non-canonical location (08-25 used docs/agent-memory/notebooks/; canonical is docs/data/). ROOT-CAUSE HYPOTHESIS ON THE OWNING ROW IS REFUTED, do not implement against it: 455e3299c reasoned the defect was specific to the degraded-floor branch, and its stated discriminator was that the same-day FULL-quality 02:13Z cycle wrote to the CORRECT path. Today refutes that — this artifact self-reports quality_verdict FULL with convergence 4 clusters and STILL went off-path. Branch quality does not discriminate; whatever selects the output directory varies for some other reason. THE DISH PUBLISHED: metadata.published_at 2026-08-26T07:22:45Z, marker_key published:chef-intraday:2026-08-26:14, cycle_id chef-intraday-20260826T0713Z. DATA-LOSS EXPOSURE worse than 08-25: that artifact was at least committed as evidence, this one was UNTRACKED and a git clean would have destroyed the only machine-queryable record of a published full-quality dish. Router preserved it in place in the commit accompanying this signal, following the 455e3299c precedent — the relocation remains owned by the implementing dev, do NOT resolve this by moving the file. PARTIAL GOOD NEWS that narrows the defect: the notebook half WAS canonical this cycle (docs/agent-memory/notebooks/unified-agent.md carries the 07:13Z entry), unlike 08-25 when both halves went astray — so the notebook path and the synthesis-JSON path fail independently. Canonical docs/data/ holds for 2026-08-26 only chef-morning and a 02:22Z -intraday file; nothing for the 07:13Z cycle. Secondary inconsistency worth noting for whoever picks this up: the two docs/data/ files for today use different filename slot conventions (-intraday vs -chef-morning) while the off-path file uses -chef-intraday.",
    related: ["FIX-CHEF-DEGRADED-FLOOR-RECOVERY-WRITES-OFF-CANONICAL-PATHS"]
  }
]
