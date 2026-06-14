# po-s54-kinhdich-hover-rescope.jq
# PO re-scope of KINHDICH-HOVER-ENRICH after router caught a WRONG-SURFACE root cause.
# Dual mutation, idempotent, atomic (caller does temp -> [ -s ] -> jq -e -> rename):
#   (1) CLOSE KINHDICH-HOVER-ENRICH as status=partial-ssot-done-wrong-surface, lane=done,
#       record the PO ruling; SSOT enrichment (hoverSummary x64 in que-reference.js +
#       hexagram_reference.go) is kept as reusable groundwork. No further work on this id.
#   (2) OPEN KINHDICH-HOVER-ENRICH-FE in ready[] (skipped if id already present in ANY
#       board array) with the RAW-verified real user-facing delivery path:
#       extend scripts/gen-que-descriptions.ts to emit hoverSummary -> QUE_DESCRIPTIONS,
#       update apps/frontend/app/components/QueName.tsx tooltip to render hoverSummary
#       (fallback coreMeaning), regen que-descriptions.generated.ts, rebuild frontend (:3001).
# Usage: jq --arg now "$NOW" -f scripts/po-s54-kinhdich-hover-rescope.jq docs/data/orch/orch-state.json
#
# Reusable pattern: "close a task whose entire spec is built on a FALSE surface premise as
# partial-keep-groundwork, then open a correctly-scoped follow-up on the RAW-verified surface,
# preserving the good SSOT work and routing the wrong-surface lesson to memory."

def all_ids:
  ([.task_board.done[]?, .task_board.in_progress[]?, .task_board.backlog[]?, .task_board.ready[]?] | map(.id));

# ---- (1) CLOSE the original on the wrong-surface finding -------------------------
( .task_board.in_progress |= map(
  if .id == "KINHDICH-HOVER-ENRICH" then
    . + {
      lane: "done",
      status: "partial-ssot-done-wrong-surface",
      next_agent: "none",
      updated_at: $now,
      updated_by: "po",
      po_ruling: ("CLOSE PARTIAL. Router RAW-re-verify (PO-re-probed + confirmed) caught a WRONG-SURFACE root cause: kinh-dich-service :5005 serves JSON only (GET / //dashboard//que-reference.js//index.html ALL 404; image has no /app/dashboard); architect premise 'Go binary serves the static dashboard -> rebuild ships que-reference.js' is FALSE -> the rebuild was a no-op for the user. index.html L2501 swap = dev-only file:// G9 sandbox, NOT user-facing. REAL user que hover = Remix :3001 QueName.tsx L75 -> QUE_DESCRIPTIONS from que-descriptions.generated.ts (coreMeaning x65, ZERO hoverSummary; codegen gen-que-descriptions.ts maps only coreMeaning.vi). "
        + "KEEP: SSOT enrichment is good reusable groundwork (commit 47fe36e8): HoverSummary localized field in hexagram_reference.go + hoverSummary x64 in apps/kinh-dich-service/dashboard/que-reference.js + 64 pre-authored plain-VN strings in docs/handoffs/KINHDICH-HOVER-ENRICH-BA-spec.md. "
        + "KEEP file:// index.html L2501 swap (Q3 ruling: harmless sandbox-only, keeps dev G9 sandbox consistent with enriched SSOT; revert = pure churn). "
        + "PRODUCT DIRECTION (Q2 ruling): user's 'too short' complaint targets the TOOLTIP surface itself -> ENRICH THE TOOLTIP with hoverSummary (80-220 chars). QUE-TOOLTIP-DRY's terse-tooltip-by-design (BLOCKER-3: coreMeaning.vi + marketTrendLabel only) PREDATES this user feedback and is overruled for the tooltip text ONLY; the DRY mechanism (single SSOT, single codegen mirror, single shared QueName component, no dual data source) is FULLY PRESERVED -- we change WHICH field the one shared tooltip renders, not the architecture. Reference page (dashboard.kinh-dich-reference.tsx, QUE_DETAIL) stays the full deep-dive. "
        + "Q1 ruling: this task's root_cause/source_of_truth are written entirely against the dead Go-dashboard surface (now FALSE) -> do NOT mutate; CLOSE here + OPEN clean follow-up KINHDICH-HOVER-ENRICH-FE on the RAW-verified frontend path. "
        + "Q4 ruling: route follow-up through BA/architect (lightweight) to vet plain-VN at tooltip width + ratify the DRY-preserving codegen extension against QUE-TOOLTIP-DRY BLOCKER-3 -- correcting their surface-ID, not bypassing.")
    }
  else . end
) )

# ---- (1b) PHYSICALLY relocate the closed task from in_progress[] -> done[] -------
# (lane=done in in_progress[] would inflate WIP + confuse readers). Idempotent:
# only moves rows whose lane=="done" out of in_progress[].
| ( [ .task_board.in_progress[] | select(.lane == "done") ] ) as $closed
| .task_board.done += $closed
| .task_board.in_progress |= map(select(.lane != "done"))

# ---- (2) OPEN the correctly-scoped frontend follow-up (id-guarded) ---------------
| if (all_ids | index("KINHDICH-HOVER-ENRICH-FE")) then .
else
  .task_board.ready += [{
    id: "KINHDICH-HOVER-ENRICH-FE",
    type: "SPRINT-S",
    zone: "apps/frontend/",
    owner: "dev-frontend",
    next_agent: "ba",
    lane: "ready",
    status: "ready",
    priority: "medium",
    size: "S",
    created_at: $now,
    created_by: "po",
    parent: "KINHDICH-HOVER-ENRICH",
    title: "KINHDICH-HOVER-ENRICH-FE — Hiện mô tả quẻ Kinh Dịch giàu/dễ hiểu (hoverSummary, plain Vietnamese) trên tooltip THẬT mà người dùng thấy (Remix :3001 QueName.tsx), không phải dashboard sandbox của kinh-dich-service.",
    user_request: "User: hover description của quẻ Kinh Dịch quá ngắn và khó hiểu — muốn chi tiết hơn, dễ hiểu hơn (tiếng Việt phổ thông cho người không chuyên).",
    root_cause: "RAW-verified real surface (router + PO re-probe): tooltip người dùng thật = apps/frontend/app/components/QueName.tsx L75 render desc.coreMeaning từ QUE_DESCRIPTIONS (apps/frontend/app/lib/que-descriptions.generated.ts) — coreMeaning là 1 mệnh đề cụt. Field giàu hơn hoverSummary (80-220 ký tự, plain VN) ĐÃ tồn tại trong SSOT que-reference.js x64 (commit 47fe36e8) NHƯNG codegen scripts/gen-que-descriptions.ts chỉ map coreMeaning.vi -> không bao giờ tới tooltip frontend.",
    source_of_truth: "Data SSOT = apps/kinh-dich-service/dashboard/que-reference.js .hoverSummary (x64, ĐÃ có). Codegen = scripts/gen-que-descriptions.ts (hiện chỉ emit coreMeaning + marketTrendLabel vào QueDescription). Render = apps/frontend/app/components/QueName.tsx L69-78 TooltipContent.",
    scope: "ONE zone apps/frontend/ (+ codegen script). (A) CODEGEN: extend scripts/gen-que-descriptions.ts — thêm hoverSummary vào QueDescription interface + emit entry.hoverSummary.vi (escape backtick như coreMeaning); KHÔNG đụng QUE_DETAIL/QUE_DESCRIPTIONS-DETAIL hay reference-page mapping. (B) RENDER: QueName.tsx — render desc.hoverSummary với FALLBACK desc.coreMeaning (quẻ thiếu hoverSummary không vỡ); coreMeaning vẫn dùng làm fallback + reference page giữ nguyên. (C) REGEN: bun run gen:que (từ apps/frontend/) -> que-descriptions.generated.ts; AUTO-GENERATED, không sửa tay. (D) REBUILD frontend container (:3001).",
    dry_constraint: "PRESERVE QUE-TOOLTIP-DRY: vẫn 1 SSOT (que-reference.js), 1 codegen mirror, 1 shared component QueName — chỉ ĐỔI FIELD tooltip render (coreMeaning -> hoverSummary fallback coreMeaning). KHÔNG tạo nguồn dữ liệu thứ 2. Reference page (dashboard.kinh-dich-reference.tsx, QUE_DETAIL) giữ nguyên là deep-dive. Architect phải ratify việc nới BLOCKER-3 (PO-Q3 cũ chỉ cho coreMeaning) — PO đã overrule cho TEXT tooltip vì user feedback 'too short', cơ chế DRY giữ nguyên.",
    generic_mandate: "MUST phủ ALL 64 quẻ — không sampling. Done-bar: mọi quẻ có hoverSummary hiện trên tooltip thật (:3001). Verify grep -c hoverSummary apps/frontend/app/lib/que-descriptions.generated.ts == 64 (+ marketTrendLabel/coreMeaning giữ nguyên).",
    language_rule: "Tooltip text = tiếng Việt phổ thông, không jargon (market-report-plain-vietnamese + language-boundary). EN field giữ cho switch EN/VI nhưng VI là target. Width tooltip max-w-xs text-xs — BA/architect vet hoverSummary đọc ổn ở khổ này.",
    verification_gate: "QA-green LIVE trên frontend :3001 (KHÔNG phải file:// sandbox, KHÔNG phải :5005): mở dashboard, hover một quẻ -> hoverSummary giàu/dễ hiểu hiện ngay. Sample favorable/neutral/unfavorable + các quẻ từng cụt (29/47). que-descriptions.generated.ts regen từ codegen (no manual edit). Frontend container rebuilt + Up+healthy + peers intact (rebuild-recreate-destroys-peers guard).",
    commit_rule: "Commit by EXPLICIT PATH only: scripts/gen-que-descriptions.ts, apps/frontend/app/components/QueName.tsx, apps/frontend/app/lib/que-descriptions.generated.ts + dev notebook. NEVER git add -A/-u — concurrent dirty tree của agent khác (tool-usage-stats.json, *-notebooks, sessions, signals) phải giữ nguyên; git status --short sau để xác nhận.",
    pipeline: "po -> ba (vet plain-VN hoverSummary fits tooltip width; confirm fallback contract) -> architect (ratify DRY-preserving codegen extension vs QUE-TOOLTIP-DRY BLOCKER-3) -> dev-frontend -> ops (rebuild frontend :3001) -> qa (LIVE hover verify on :3001) -> po signoff",
    note: ("[po re-scope " + $now + "] Opened after router RAW caught WRONG-SURFACE on parent KINHDICH-HOVER-ENRICH (kinh-dich-service :5005 serves JSON only; real hover = Remix :3001 QueName.tsx). SSOT groundwork (hoverSummary x64) KEPT from commit 47fe36e8 — this task only plumbs it to the real tooltip. Wrong-surface lesson -> memory.")
  }]
end
