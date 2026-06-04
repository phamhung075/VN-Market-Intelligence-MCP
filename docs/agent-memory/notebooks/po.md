# PO Notebook

## c · 2026-06-04T07:45Z — triage architect HIGH signal → sequence RAPID-DATA-LAYER sprint (10 fixes)

**Signal:** `docs/signals/architect-20260604T060000Z.json` (design_complete, HIGH). Brief SSOT `docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md` (READY-FOR-PM-SEQUENCING). 6 rapid-analysis cowork skills (SKILL-1..6, the pre-TNB gate) ALL BLOCKED: their data inputs aren't on the 156-tool surface. 37 fields assessed (COVERED 3 / PARTIAL 12 / GAP 22), 4 root-cause clusters, 10 remediations.

**Pre-flight:** TNB c86 handoff = all findings pre-existing methodology/pipeline persisting-blockers (F8 COWORK-LEADER-SELFLOCK, F2/F3/F4/F5 structural data-gaps) — none new-HIGH for THIS sprint; ACK'd, no new tasks. Channels not re-audited (clear signal-driven kickoff). FU-RAPID-SKILLS-RESIDUAL in backlog is only size-justification tidy (out-of-dev-scope) — NOT these data-layer gaps; no dedup collision. RECON-AGM-1/FIX-* confirmed ABSENT (grep count 0) before insert.

**Disposition → SPRINT-M RAPID-DATA-LAYER** (signal-routing table: brief targeting apps/ code → SPRINT). Architect already pre-atomized tasks w/ file:line + RC mapping → I sequenced, did not re-decompose. 10 tasks into `.task_board.backlog` + `.sprint_goal.entries` (atomic jq -f, hardened: non-empty + sentinel-key guard per [[feedback_jq_empty_guard_clobbers_ssot]]). WIP_max=2.

**Dependency edges (architect order):** RECON-AGM-1(P0,ops-vps-fetch,IN-PROGRESS router-launched NOW, blocks FIX-G) | FIX-B(P1,gate-first,no-dep — SKILL-1 mandatory size gate, NO skill lives without it) → then FIX-A/FIX-D/FIX-H(P1,no-dep,parallel) | FIX-C(P2,dep FIX-B,BLOCKED)/FIX-E(P2,no-dep) | FIX-F(P3,VAS-audit prereq,bank-form guard) | FIX-G(P4,dep RECON-AGM-1,BLOCKED) | FIX-I(P5,dep FIX-A,BLOCKED). Zones: all apps/mcp-server EXCEPT RECON-AGM-1=ops-vps-fetch, FIX-G=dev-vps-crawls+mcp-server.

**In flight (WIP=1, room for 1 more P1):** head.active_task_id=FIX-B, next_agent=pm. Emitted po→pm `sprint_sequenced` signal. FIX-G HARD-GATED on RECON-AGM-1 (status BLOCKED, deps:[RECON-AGM-1] — no dev work until recon DONE w/ positive fetch recipe; Risk-4 PDF-vs-HTML format decides effort).

**LESSON:** when architect ships a READY-FOR-PM brief with per-zone atomic tasks already specified (file:line, classification, RC), PO sequences-by-dependency + sets WIP/blocks — does NOT re-decompose (that's done). The leverage rule = ship the mandatory entry gate (FIX-B) FIRST since every downstream skill inherits it; a parallel no-dep P1 fills the 2nd WIP slot. Gate a new-data-source fix (FIX-G) behind its recon spike so dev never starts on an unfetchable source. Verify a "residual" backlog entry isn't the same work before creating a dup.

## c · 2026-06-04T11:12Z — dev-team triage tick: batch FIX-F alone (P3)

**State:** HEAD 43d9213f (Phase 2b FIX-C+FIX-E DONE-LIVE-VERIFIED, 159 tools). head.status=idle, wip=0, next P3=FIX-F. Channels CLEAN (read_telegram_reports new=0, list_unresolved_reports=[]); 4 cowork heartbeats already drained non-actionable; pendingSignals empty. No new bug → no FIX added beyond backlog.

**Disposition → BATCH([FIX-F]) only.** WIP≤2 permits 2 but FIX-F (size M, single zone apps/mcp-server, FIX-DE-1 ScalarAggregate precedent) and FIX-G (size L, 2 zones vps-scripts fetcher + mcp-server table+tool, new systemd unit + DB table + MCP tool, dev-vps-crawls→dev-mcp-server chain) are very different blast radii. Ship FIX-F clean this tick; FIX-G as its own next-tick unit per brief P3→P4 order. FIX-I/FU-* stay BLOCKED-UPSTREAM.

**Path correction:** backlog FIX-F files[] named `infrastructure/bctc/bctcScalarAggregator` — STALE. Raw-verified actual `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` (+ finalizeBctcRefineTool.ts/backfillBctcScalarsTool.ts carry ScalarAggregate; tools dir financial-reports/ + isBankFormFromDb guard precedent in bctcFullTools.ts confirmed). Emitted corrected paths in batch. LESSON: verify backlog files[] against the tree before emitting — architect paths drift from refactors (domain/services vs infrastructure).
