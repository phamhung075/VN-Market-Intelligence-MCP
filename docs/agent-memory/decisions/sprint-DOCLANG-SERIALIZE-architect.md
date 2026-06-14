# Decision Journal — Sprint DOCLANG-SERIALIZE · architect

**Sprint goal:** DocLang serializer for pdf-extractor (Phase 1 DONE) + authored-docs feasibility spike
**Agent:** architect
**Started:** 2026-06-14T10:00:00Z

---

### STEP architect-S1 · architect · 2026-06-14T10:30:00Z
**task-id:** SPIKE-DOCLANG-AUTHORED-DOCS
**what-done:** Feasibility spike — inventoried all consumers of authored docs/.md files; issued NO-GO recommendation for converting authored project docs to DocLang .dclg.xml format.
**what-considered:**
- GO: convert all authored docs/ to .dclg.xml — REJECTED: P0 breaks in notebook-write (grep ^## breaks), agent spawn (.claude/agents/*.md YAML frontmatter incompatible with XML), skill loading (SKILL.md YAML frontmatter), doc-heal-system monitoring blind spots. Zero consumer benefit (no tool reads doc geometry).
- PARTIAL: convert only architecture-briefs/ or handoffs/ — REJECTED: no machine consumer exists today that needs DocLang structure from these files; LLM reads them as raw text equally well from .md; doc-heal-system glob still misses them.
- NO-GO: keep authored docs as markdown, scope DocLang strictly to extracted content — CHOSEN.
**why-decision:** Every consumer of authored docs is either (a) Claude Code YAML frontmatter parser (breaks on XML), (b) LLM via raw Read tool (no benefit from XML tags), or (c) shell grep/glob targeting *.md (goes blind on .dclg.xml). Zero concrete benefit; multiple P0 breakages. DocLang spec explicitly targets extracted document content, not authored prose.
**why-change:** No change from PO pre-spike framing (caveat in project_doclang_priority_format.md and orch-state task context both anticipated this verdict).

### STEP architect-S2 · architect · 2026-06-14T16:00:00Z
**task-id:** FIX-REFINE-LOCK-TTL-RECLAIM
**what-done:** Root-cause analysis of recurring [Lock orphaned by rebuild] class; designed generic TTL-reclaim fix for ALL refine slots.
**what-considered:**
- Fencing tokens (increment counter, reject stale-worker writes): REJECTED — sequential worker model means concurrent double-write is not the pattern; blast radius too high (schema + push tool + all callers).
- Session-liveness probe (check if owner PID alive): REJECTED — container environment, all processes are pid-1; unreliable.
- Heartbeat + owner_agent (stable across restarts): CHOSEN — heartbeat already exists in coordinationStore.ts with owner_agent path; flow doc simply omits owner_agent on heartbeat/release calls; adding it closes Vector 1 at zero schema cost.
**why-decision:** Primary defect is flow/main.md calling task_heartbeat and task_release WITHOUT owner_agent, causing zombie locks after server rebuild. Fix is surgical: 3 line changes in the flow doc + ttl_seconds 1000→1800 for headroom. claimTask Step 2 (TTL-steal) is already correct and works once Vector 1 is fixed. Idempotency confirmed (INSERT OR REPLACE on UNIQUE(report_id, unit_id)).
**why-change:** No change from design direction indicated in task dispatch_note. TTL increase (Fix C) added as bonus (tight 16-min window for 7-window chunk).

### STEP architect-S3 · architect · 2026-06-14T18:30Z
**task-id:** KINHDICH-HOVER-ENRICH-FE
**what-done:** Ratified ARCH-RATIFY-FE-1 (codegen extension mechanism), completed brownfield risk review of 3-file change surface, produced implementation blueprint for dev-frontend, advanced board to in_progress next_agent=dev-frontend.
**what-considered:**
- only path: extend existing `QueRefEntry` interface + BLOCK 1 loop in `gen-que-descriptions.ts` to extract `entry.hoverSummary.vi` and emit into `QueDescription`; Options A/B (hardcode in generated file / import que-reference.js directly in component) both introduce second data path — ruled out by BA spec § Decision Journal and QUE-TOOLTIP-DRY invariant.
**why-decision:** Single-codegen extension is additive-only (optional field, same escape pattern, same BLOCK 1 loop); TypeScript non-breaking (optional field, `?? coreMeaning` fallback); BLOCK 2 and detail pipeline untouched; hoverSummary.vi x64 RAW-confirmed in que-reference.js. Mechanism preserves QUE-TOOLTIP-DRY exactly. BLOCKER-3 restriction was on mechanism (single codegen), not on which field — PO's field-choice override is product prerogative.
**why-change:** No change from BA spec Option C. Implementation blueprint is a direct transcription of FR-1 through FR-4 into explicit code steps.
