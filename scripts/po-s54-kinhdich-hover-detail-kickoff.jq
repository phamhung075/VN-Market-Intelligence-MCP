# po-s54-kinhdich-hover-detail-kickoff.jq
# Single-purpose, idempotent sprint kickoff for KINHDICH-HOVER-DETAIL.
# Mutates ONLY .sprint_goal.entries[] and .task_board.backlog[].
# NEVER touches .head, .task_board.head, or any VN-MACRO-TOOLING / active task.
# Guards: skips sprint entry if sprint_id already present; skips BA task if id present in ANY board array.
# Usage: jq --arg now "$NOW" -f scripts/po-s54-kinhdich-hover-detail-kickoff.jq docs/data/orch/orch-state.json
#   atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH.

def has_sprint($id): (.sprint_goal.entries // []) | any(.sprint_id == $id);
def board_ids:
  [ (.task_board.backlog // [])[], (.task_board.ready // [])[],
    (.task_board.in_progress // [])[], (.task_board.review // [])[],
    (.task_board.qa // [])[], (.task_board.done // [])[],
    (.task_board.done_verified // [])[], (.task_board.archive // [])[] ]
  | map(.id);
def has_task($id): board_ids | any(. == $id);

.
| (if has_sprint("KINHDICH-HOVER-DETAIL") then .
   else .sprint_goal.entries += [{
     "sprint_id": "KINHDICH-HOVER-DETAIL",
     "status": "active",
     "vision": "Khi người dùng rê chuột (hover) lên tên một quẻ Kinh Dịch bất kỳ trên frontend, tooltip hiển thị nội dung tham chiếu 'Tra cứu Kinh Dịch' của đúng quẻ đó — không chỉ một câu tóm tắt như hiện tại.",
     "scope_in": "Mở rộng tooltip trong QueName.tsx (SSOT duy nhất) để hiển thị: ý nghĩa cốt lõi (coreMeaning) + Trạng thái (stateInterpretation) + Thuận (favorable) + Cảnh báo (warning) + nhãn xu hướng thị trường, lấy từ QUE_DETAIL (apps/frontend/app/lib/que-descriptions-detail.generated.ts) đã có sẵn trong bundle frontend. Giữ deep-link 'Xem chi tiết →' tới trang reference cho bảng 6 hào đầy đủ.",
     "scope_out": "KHÔNG nhồi bảng 6 hào (phases[]) vào tooltip (thuộc về trang reference, deep-link đã có). KHÔNG sửa layout 1-cột (đã xong + live ở commit 1aa9dc31). KHÔNG đụng kinh-dich-service (chỉ phục vụ JSON, dashboard/index.html là sandbox file:// người dùng không mở). KHÔNG mở rộng codegen — QUE_DETAIL đã đủ field. Click-to-expand / popover lớn bị loại — UX là hover thuần.",
     "success_metric": "tsc/pnpm check xanh + qa pass + frontend container rebuild đúng cách (build frontend && up -d --no-deps frontend && builder prune; docker ps -a peer-survival; image ID đổi) + RAW-verify chunk phục vụ trên :3001 thực sự chứa chuỗi tiếng Việt mới (vd stateInterpretation/favorable/warning của một quẻ). Người dùng hard-refresh thấy tooltip phong phú khi hover. (Part 1 1-cột: chỉ cần hard-refresh — đã live.)",
     "product_decision": "Option (a) richer-tooltip chosen by PO: coreMeaning + Trạng thái + Thuận + Cảnh báo + trend label, omit 6-hào table, keep Xem chi tiết deep-link. Tooltip holds ~4 short VN clauses comfortably; 6-hào table is tabular → reference page. SSOT = QueName.tsx (QUE-TOOLTIP-DRY preserved).",
     "created_at": $now
   }] end)
| (if has_task("BA-KINHDICH-HOVER-DETAIL") then .
   else .task_board.backlog += [{
     "id": "BA-KINHDICH-HOVER-DETAIL",
     "title": "Requirement Spec — KINHDICH-HOVER-DETAIL (enrich quẻ hover tooltip with Tra cứu Kinh Dịch detail)",
     "owner": "ba",
     "status": "TODO",
     "zone": "apps/frontend/",
     "sprint_id": "KINHDICH-HOVER-DETAIL",
     "priority": "high",
     "note": "User feature request (actively waiting). SSOT component = apps/frontend/app/components/QueName.tsx. Rich data already in-bundle = apps/frontend/app/lib/que-descriptions-detail.generated.ts (QUE_DETAIL: stateInterpretation/favorable/warning/coreMeaning/marketTrendLabel/phases). PO decision = Option (a) richer tooltip, omit 6-hào table, keep deep-link. Lean chain: ba (thin spec) → dev-frontend → ops (frontend-only rebuild) → qa. DONE BAR = done_verified per sprint success_metric (served-chunk RAW-verify on :3001).",
     "created_at": $now
   }] end)
