# po-s54: id-guarded PROMOTE of KINHDICH-HOVER-ENRICH sprint into .task_board.ready[].
# Single-zone (apps/kinh-dich-service/) data-enrichment + dashboard hover-render sprint.
# Skips if id already present in ANY board array. Atomic temp->[ -s ]->rename by caller.
def already_present($id):
  [ .task_board | to_entries[] | .value | if type=="array" then .[]? else empty end | .id? ]
  | any(. == $id);

($task_id) as $id
| if already_present($id) then .
  else
    .task_board.ready += [{
      "id": $id,
      "type": "SPRINT-S",
      "zone": "apps/kinh-dich-service/",
      "owner": "ba",
      "next_agent": "ba",
      "lane": "ready",
      "status": "READY",
      "priority": "medium",
      "size": "S",
      "created_at": $now,
      "created_by": "po",
      "title": "KINHDICH-HOVER-ENRICH — Quẻ Kinh Dịch hover description hiện ngắn/khó hiểu; làm giàu + dễ hiểu (plain Vietnamese) cho TẤT CẢ 64 quẻ, render bản đầy đủ ngay khi hover",
      "user_request": "User: hover description của quẻ Kinh Dịch quá ngắn và khó hiểu — muốn chi tiết hơn, dễ hiểu hơn (giải thích phong phú, tiếng Việt phổ thông cho người không chuyên).",
      "root_cause": "Hover/glance text trong qref panel chỉ render coreMeaning.vi — một mệnh đề cụt (avg 36 ký tự, min 17, vd quẻ 47 = 'Kiệt sức và giam cầm'). Các field giàu hơn (stateInterpretation/favorable/warning/6 phases) ĐÃ tồn tại nhưng bị giấu sau nút click-to-expand, KHÔNG hiện khi hover.",
      "source_of_truth": "Data SSOT = apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go (build records) -> regen apps/kinh-dich-service/dashboard/que-reference.js via `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference`. Hover render = apps/kinh-dich-service/dashboard/index.html .qref-row-summary (L2497-2505), shows only loc(q.coreMeaning).",
      "scope": "BOTH within ONE zone (apps/kinh-dich-service/): (A) DATA — enrich plain-Vietnamese interpretation so the glanceable description is comprehensible (name meaning + judgment + image + market-context in phổ thông VN), not just a terse clause; (B) RENDER — dashboard hover surfaces the richer text immediately on hover (not gated behind click-to-expand). Decide in BA spec whether to widen coreMeaning.vi or surface stateInterpretation.vi (+favorable/warning) on hover; architect rules the data-shape vs render split.",
      "generic_mandate": "MUST cover ALL 64 hexagrams uniformly — no sampling 1-2. Done-bar: every one of the 64 has the richer, comprehensible plain-Vietnamese description visible on hover. Verify count==64 with no terse residue.",
      "language_rule": "User-facing hexagram text = plain Vietnamese, no jargon (market-report-plain-vietnamese + language-boundary). EN field may stay for the EN/VI switch but VI is the target audience.",
      "verification_gate": "QA-green LIVE: load dashboard, hover a quẻ -> richer comprehensible VI description shows live (sample across favorable/neutral/unfavorable trends + the previously-terse ones e.g. 29/47). que-reference.js regenerated from Go source (no manual edit — file is AUTO-GENERATED). Service rebuilt if Go layer changed.",
      "commit_rule": "Commit by EXPLICIT PATH only (hexagram_reference.go, que-reference.js, index.html). NEVER git add -A — concurrent dirty tree of other agents (tool-usage-stats.json, bctc-analyst/market-watcher/news-scout notebooks, coverage-state.json, cowork-schedule.json, digest-predict session) MUST stay preserved.",
      "pipeline": "po -> ba (spec: author the 64 enriched plain-VN descriptions + decide data-shape/render split) -> architect (data vs render ruling) -> dev-kinh-dich -> qa (LIVE hover verify) -> po signoff",
      "note": ("[po triage " + $now + "] User feature request, scoped via raw-read. Single zone (dashboard lives inside kinh-dich-service). WIP ok (1 in_progress, diff zone). Ref: reference_kinhdich_logic.md.")
    }]
  end
