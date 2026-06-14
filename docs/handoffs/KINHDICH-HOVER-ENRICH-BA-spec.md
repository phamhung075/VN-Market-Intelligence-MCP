# BA Spec — KINHDICH-HOVER-ENRICH

**Sprint:** KINHDICH-HOVER-ENRICH
**BA task:** BA-KINHDICH-HOVER-ENRICH
**Spec authored:** 2026-06-14T18:00:00Z
**Author:** ba
**Status:** SPEC-DONE → awaiting architect
**NEXT:** architect

---

## Context

The qref panel in `apps/kinh-dich-service/dashboard/index.html` renders a collapsed row per hexagram. The `.qref-row-summary` shows `loc(q.coreMeaning)` — a terse 1-clause string (avg 36 chars). E.g. quẻ 47 = "Kiệt sức và giam cầm". Richer fields (`stateInterpretation.vi`, `favorable.vi`, `warning.vi`) exist but are hidden behind a click-to-expand toggle. This is the Go-served standalone dashboard, NOT the React frontend (separate concern from QUE-TOOLTIP-DRY).

**SSOT data:** `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go` (builds all 64 queReference structs).
**Regeneration:** `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` → `apps/kinh-dich-service/dashboard/que-reference.js` (AUTO-GENERATED — never hand-edit).
**Render site:** `apps/kinh-dich-service/dashboard/index.html` L2501, CSS class `.qref-meaning`.

---

## Architectural Decision: Option C — New dedicated `hoverSummary.vi` field

**Rationale against A and B:**

- **Option A (widen `coreMeaning.vi`):** `coreMeaning` is consumed elsewhere as a short identifier (MCP tool responses, React frontend tooltip via QUE-TOOLTIP-DRY pipeline). Widening it breaks the terse-identifier semantics already locked by PO-Q3 ruling (QUE-TOOLTIP-DRY). Cross-zone drift risk.
- **Option B (surface `stateInterpretation.vi` + `favorable.vi` + `warning.vi` in hover):** PO-Q3 ruling in QUE-TOOLTIP-DRY explicitly ruled `stateInterpretation.vi` "too verbose for a hover affordance." The `.qref-meaning` span is already visible inline in the collapsed row — it is not a popup; showing 3 fields would overflow the layout. `warning.vi` is already rendered as a separate `.qref-warning` span in the same row summary (L2504), so surfacing it again in `.qref-meaning` creates duplication.
- **Option C (new `hoverSummary.vi` field):** Keeps `coreMeaning` semantically clean (terse 1-clause). The new field is authored once in the .go SSOT, regenerated into que-reference.js, and rendered in the `.qref-meaning` span replacing `coreMeaning.vi`. Content is explicitly crafted for a non-technical Vietnamese reader in plain Vietnamese — exactly the user need. Zero cross-zone impact. Architect ratifies.

**Schema extension (Go):**

Add `HoverSummary localized` to `queReference` struct between `CoreMeaning` and `MarketTrend`. Add `hoverSummary` parameter to `build()` call signature.

```go
// queReference holds the full trading-reference record for one hexagram.
type queReference struct {
    // ... existing fields ...
    CoreMeaning         localized        `json:"coreMeaning"`
    HoverSummary        localized        `json:"hoverSummary"`   // NEW: 1-3 plain-VN sentences for glanceable description
    MarketTrend         string           `json:"marketTrend"`
    // ... rest unchanged ...
}
```

**Render change (index.html):** Replace `loc(q.coreMeaning)` with `loc(q.hoverSummary)` at L2501:
```diff
-          <span class="qref-meaning">${escapeHtml(loc(q.coreMeaning))}</span>
+          <span class="qref-meaning">${escapeHtml(loc(q.hoverSummary))}</span>
```

**que-reference.js:** Regenerated automatically — includes `hoverSummary` field. No manual edit.

---

## Content Contract: 64 `hoverSummary.vi` Strings

### Quality Rubric

- **Length:** 1–3 sentences, 80–220 characters (inclusive). Target ~150 chars.
- **Language:** Plain Vietnamese (tiếng Việt phổ thông). No I-Ching jargon, no Hán-Việt terms left unexplained.
- **Audience:** Non-technical VN reader, no market expertise required. Explain what the quẻ means for a real person watching the market today.
- **Content:** Name the practical situation + the recommended action/attitude. Avoid abstract philosophy. Use natural daily-life framing.
- **Tone:** Direct, informative, not mystical.
- **Prohibited:** "thiên địa", "âm dương", "hào", "quẻ", "bói", unexplained Hán-Việt compound nouns. OK to say "Kinh Dịch khuyên" once per string if needed for grounding.
- **Self-check:** If a 16-year-old Vietnamese student cannot understand it, rewrite.

### Zero-terse-residue rule

Every one of the 64 hoverSummary.vi must be ≥ 80 chars. Developer verifies with: `awk 'length < 80' <(jq -r '.[].hoverSummary.vi' que-reference.js 2>/dev/null || echo "parse error")` — must return 0 lines.

---

## Pre-authored 64 hoverSummary.vi Strings (SSOT for dev-kinh-dich)

Developer copies each Vi string verbatim into the corresponding `build()` call in hexagram_reference.go. En strings (also pre-authored below) are secondary — VI is the user-facing target.

### Quẻ 1 — Kiền (Càn)
```
Vi: "Giai đoạn năng lượng mạnh nhất, mọi hành động đều được ủng hộ. Đây là thời điểm khởi nghiệp, mở rộng hoặc đẩy mạnh — nhưng cần giữ thái độ đúng mực, không kiêu căng tự mãn khi đang ở đỉnh cao."
En: "Peak creative energy supports bold action. Best time to launch or expand, but stay grounded — arrogance at the peak invites the fall."
```

### Quẻ 2 — Khôn
```
Vi: "Thời kỳ nên hỗ trợ thay vì dẫn đầu. Thị trường cần người kiên nhẫn xây dựng nền tảng, làm việc nhóm, không phải người đứng mũi chịu sào — hãy theo dòng chảy, đừng cố tạo xu hướng mới."
En: "Time to support rather than lead. Build foundations and work with existing momentum. Do not force a new direction — follow the prevailing flow."
```

### Quẻ 3 — Truân (Khó Khăn Ban Đầu)
```
Vi: "Giai đoạn khởi đầu gian nan — mọi thứ đang hình thành nhưng chưa ổn định. Đừng làm một mình, hãy tìm người đồng hành tin cậy và chịu khó xây từng bước nhỏ thay vì vội vàng."
En: "Difficult startup phase — things are forming but not yet stable. Find reliable allies and build step by step rather than rushing."
```

### Quẻ 4 — Mông (Còn Non Dại)
```
Vi: "Tình hình chưa rõ ràng, bản thân còn thiếu thông tin. Đây là lúc học hỏi chứ không phải ra quyết định lớn — hãy khiêm tốn tìm người có kinh nghiệm hướng dẫn trước khi hành động."
En: "Situation is unclear and information is insufficient. Time to learn, not to make big moves. Seek experienced guidance before acting."
```

### Quẻ 5 — Nhu (Chờ Đợi)
```
Vi: "Cơ hội đang đến nhưng chưa chín muồi — thời điểm chưa đúng để vào lệnh. Hãy kiên nhẫn chờ đợi với tâm thế bình tĩnh, chuẩn bị kỹ, không để lo lắng thúc đẩy hành động sai lúc."
En: "Opportunity is forming but not yet ripe. Wait calmly and prepare — anxiety-driven early entry wastes resources."
```

### Quẻ 6 — Tụng (Tranh Chấp)
```
Vi: "Đang có xung đột hoặc bất đồng — leo thang thêm sẽ tốn kém hơn thắng lợi mang lại. Tìm người hòa giải, chấp nhận thỏa hiệp một phần, rút lui đúng lúc thường là nước đi khôn ngoan nhất."
En: "Conflict is active — escalating further costs more than winning gains. Seek mediation and accept partial compromise; timely retreat is the wisest move."
```

### Quẻ 7 — Sư (Quân Đội)
```
Vi: "Cần hành động quy mô lớn, có tổ chức và người lãnh đạo rõ ràng. Thành công đến từ kỷ luật và phối hợp — hành động lộn xộn hoặc sai người dẫn đầu sẽ dẫn đến thất bại và lãng phí nguồn lực."
En: "Large-scale action requires clear leadership and discipline. Success comes from coordination — disorganized action or wrong leadership leads to failure."
```

### Quẻ 8 — Tỷ (Liên Kết)
```
Vi: "Đây là thời điểm tốt để liên minh và hợp tác. Hãy xem xét kỹ đối tác trước khi cam kết — liên kết với người đúng mang lại lợi ích lâu dài, tham gia quá muộn sẽ bỏ lỡ cơ hội tốt nhất."
En: "Good time to form alliances and cooperate. Choose partners carefully — the right alliance brings lasting benefit, but late joiners miss the best opportunities."
```

### Quẻ 9 — Tiểu Súc (Tích Lũy Nhỏ)
```
Vi: "Tiến bộ lớn đang bị cản trở tạm thời — tập trung tích lũy từng bước nhỏ thay vì cố đạt mục tiêu lớn ngay. Như mây đang tụ nhưng chưa mưa, kiên nhẫn chờ điều kiện chín muồi hơn."
En: "Large advance is temporarily blocked. Focus on small steady gains — clouds are gathering but rain has not come yet. Wait for better conditions."
```

### Quẻ 10 — Lý (Dẫm Lên Đuôi Hổ)
```
Vi: "Đang đi trên địa hình nguy hiểm — mọi bước đi cần hết sức thận trọng và đúng chuẩn mực. Hành xử đúng đắn và tôn trọng ranh giới quyền lực giữ bạn an toàn trong tình huống rủi ro cao."
En: "Walking on dangerous ground — every step requires caution and proper conduct. Respect power boundaries to stay safe in this high-risk situation."
```

### Quẻ 11 — Thái (Thịnh Vượng)
```
Vi: "Giai đoạn thuận lợi nhất — trời đất đồng thuận, mọi điều kiện hỗ trợ hành động. Hãy mạnh dạn mở rộng và tận dụng đà tăng trưởng này, nhưng nhớ rằng cực thịnh sẽ có lúc chuyển sang suy."
En: "Most favorable period — all conditions support action. Expand boldly and ride the growth momentum, but remember that peak prosperity eventually turns."
```

### Quẻ 12 — Bĩ (Trì Trệ)
```
Vi: "Giai đoạn bế tắc — nỗ lực gặp kháng cự từ mọi phía và giao tiếp bị cản. Đây không phải lúc để mở rộng hay ra quyết định lớn — hãy rút lui, bảo tồn nguồn lực và chờ chu kỳ chuyển hướng."
En: "Period of blockage — efforts meet resistance and communication is obstructed. This is not the time to expand; preserve resources and wait for the cycle to turn."
```

### Quẻ 13 — Đồng Nhân (Đoàn Kết)
```
Vi: "Thành công đến từ việc hợp tác vì mục tiêu chung, minh bạch và công khai. Lập nhóm bí mật hoặc thiên vị cục bộ sẽ thất bại — hãy xây dựng liên minh rộng rãi dựa trên lợi ích chia sẻ."
En: "Success comes from open cooperation toward shared goals. Secret factions or narrow favoritism fail — build broad alliances around common interests."
```

### Quẻ 14 — Đại Hữu (Tài Sản Lớn)
```
Vi: "Thời kỳ thịnh vượng đỉnh cao — nguồn lực dồi dào, vận may ủng hộ hành động táo bạo. Hãy triển khai toàn lực nhưng giữ thái độ khiêm tốn và trách nhiệm để duy trì thành quả lâu dài."
En: "Peak abundance — resources are plentiful and fortune favors bold action. Deploy fully but maintain humility and responsibility to sustain the achievement."
```

### Quẻ 15 — Khiêm (Khiêm Tốn)
```
Vi: "Cách tiếp cận khiêm tốn thắng ở nơi kiêu ngạo thất bại. Giảm bớt chỗ dư thừa và bổ sung chỗ thiếu hụt — thái độ nhún nhường và tự điều chỉnh đúng lúc giúp hoàn thành mục tiêu bền vững."
En: "Modest approach wins where arrogance fails. Reduce excess and fill deficiency — self-adjustment and humility lead to lasting completion."
```

### Quẻ 16 — Dự (Nhiệt Huyết)
```
Vi: "Năng lượng và sự hào hứng đang tích tụ cho hành động lớn. Đây là lúc huy động đội nhóm, đặt kế hoạch và điều phối — nhưng cần đặt đúng người vào đúng vị trí để nhiệt huyết không biến thành lãng phí."
En: "Enthusiasm and energy are building for major movement. Mobilize the team and coordinate action — but assign roles correctly so energy does not become waste."
```

### Quẻ 17 — Tùy (Theo Dõi)
```
Vi: "Thích ứng linh hoạt với xu hướng hiện tại thay vì cố tạo xu hướng mới. Theo sát diễn biến, đi theo người dẫn đầu xứng đáng — sự linh hoạt và đáp ứng nhanh mang lại thành công tốt hơn cứng nhắc."
En: "Adapt flexibly to prevailing trends rather than forcing new ones. Follow worthy leaders — responsiveness and flexibility outperform rigidity here."
```

### Quẻ 18 — Cổ (Sửa Chữa Cũ)
```
Vi: "Đây là thời điểm nhận diện và sửa chữa những vấn đề tồn đọng từ trước. Cần chuẩn bị cẩn thận trước điểm xoay chiều, theo dõi sát sau đó — điều chỉnh kịp thời sẽ phục hồi lại vị thế đã mất."
En: "Time to identify and fix inherited or neglected problems. Careful preparation before the turning point and close follow-through after will restore lost position."
```

### Quẻ 19 — Lâm (Tiếp Cận)
```
Vi: "Điều kiện thuận lợi đang mở ra — hãy tiến tới tự tin trong khi đà hỗ trợ. Lưu ý: cửa sổ thời gian này có giới hạn, khoảng tháng thứ tám điều kiện sẽ thay đổi, cần hành động trước khi quá muộn."
En: "Favorable conditions are opening — advance confidently while the momentum supports you. Note the time window is limited; act before conditions shift around the eighth month."
```

### Quẻ 20 — Quán (Quan Sát)
```
Vi: "Thời điểm tốt nhất để quan sát toàn cảnh trước khi hành động. Nhìn từ vị trí cao hơn, đánh giá kỹ lưỡng — hành động vội vã bây giờ sẽ lãng phí, nhưng quan sát cẩn thận sẽ cho thấy cơ hội thực sự."
En: "Best time to observe the full picture before acting. View from a higher vantage — careful observation now reveals real opportunities that hasty action would miss."
```

### Quẻ 21 — Phệ Hạp (Cắn Xuyên)
```
Vi: "Có chướng ngại cần được loại bỏ dứt khoát — giải quyết vấn đề thẳng thắn, không né tránh. Như cắn xuyên qua vật cứng để hàm khép lại, cần dùng sức mạnh quyết đoán để thông đường tiến."
En: "An obstacle must be removed decisively — address the problem head-on, do not avoid it. Forceful and righteous action clears the path forward."
```

### Quẻ 22 — Bí (Trang Trí)
```
Vi: "Chú ý đến hình thức, cách trình bày và vẻ bề ngoài có thể hỗ trợ kết quả. Nhưng hình thức chỉ bổ sung cho nội dung — những quyết định lớn, thực chất vẫn cần dựa vào bản chất chứ không chỉ vẻ đẹp bề mặt."
En: "Attention to form and presentation can support outcomes. But substance must drive major decisions — appearance enhances but cannot replace substance."
```

### Quẻ 23 — Bác (Sụp Đổ)
```
Vi: "Nền tảng đang xói mòn, không phải lúc để hành động mạnh hay mở rộng. Hãy rút lui và bảo tồn những gì đang có — cố tiến lên lúc này sẽ đẩy nhanh tổn thất. Chờ chu kỳ chạm đáy rồi đảo chiều."
En: "Foundation is eroding — this is not the time for bold moves or expansion. Retreat and preserve what remains; pushing forward now accelerates losses."
```

### Quẻ 24 — Phục (Quay Trở Lại)
```
Vi: "Đã chạm đáy và bắt đầu đảo chiều — ánh sáng quay trở lại sau giai đoạn tối. Hãy bắt đầu lại với nguyên tắc đúng đắn và tận dụng đà mới, không cần vội vàng nhưng đừng bỏ lỡ điểm khởi đầu này."
En: "Bottom has been reached and the cycle is reversing — light returns after darkness. Restart with sound principles and ride the new momentum without rushing."
```

### Quẻ 25 — Vô Vọng (Không Toan Tính)
```
Vi: "Hành động tốt nhất là hành động chân thành, không tính toán. Những sự kiện bất ngờ đang diễn ra — hãy giữ thái độ ngay thẳng, phản ứng tự nhiên thay vì mưu tính. Mánh khóe sẽ phản tác dụng."
En: "Best action is sincere and uncalculated. Unexpected events are at play — respond naturally with integrity rather than scheming. Manipulation will backfire."
```

### Quẻ 26 — Đại Súc (Tích Lũy Lớn)
```
Vi: "Nguồn lực lớn đã được tích lũy — đây là lúc triển khai khôn ngoan cho mục tiêu có ý nghĩa. Đừng giữ khư khư, hãy mang sức mạnh này ra phục vụ mục đích lớn hơn để tiếp tục bồi đắp năng lực."
En: "Substantial resources have been gathered — deploy them wisely toward a worthy purpose. Hoarding brings stagnation; channel this strength outward to sustain and grow it."
```

### Quẻ 27 — Di (Nuôi Dưỡng)
```
Vi: "Xem xét những gì bạn đang nuôi dưỡng và chất lượng của những gì nuôi dưỡng bạn. Chất lượng đầu vào quyết định chất lượng đầu ra — chọn lọc cẩn thận thông tin, nguồn lực và con người xung quanh."
En: "Examine what you are nourishing and what nourishes you. Quality of inputs determines outputs — carefully select your information sources, resources, and people."
```

### Quẻ 28 — Đại Quá (Vượt Ngưỡng)
```
Vi: "Tình huống đang vượt quá sức chịu đựng bình thường — đòn nóc sắp gãy dưới sức nặng. Cần biện pháp phi thường: hoặc hành động dứt khoát và táo bạo, hoặc rút lui hoàn toàn — không có chỗ cho nửa vời."
En: "Situation exceeds normal capacity — the ridgepole is about to buckle. Extraordinary measures are needed: act boldly and decisively, or retreat completely. Half-measures fail."
```

### Quẻ 29 — Khảm (Hố Sâu Nguy Hiểm)
```
Vi: "Nguy hiểm chồng nguy hiểm — mỗi bước đều có hố. Hãy giữ vững tâm thế, không hoảng loạn, chảy qua từng thách thức như nước chảy qua đá. Thành thật và bình tĩnh là lá chắn tốt nhất lúc này."
En: "Danger upon danger — pitfalls at every step. Stay calm and do not panic; flow through each challenge like water through rock. Sincerity and steadiness are your best shields."
```

### Quẻ 30 — Ly (Ánh Sáng)
```
Vi: "Rõ ràng và minh bạch là sức mạnh — nhưng ánh sáng cần bám vào nơi hỗ trợ đúng đắn để tỏa sáng lâu dài. Tìm đúng vị thế và đối tác phù hợp, sự rõ ràng kết hợp đúng nơi mang lại thành công bền vững."
En: "Clarity is strength — but light must cling to proper support to shine lastingly. Find the right position and fitting partners; clarity in the right place brings lasting success."
```

### Quẻ 31 — Hàm (Cảm Ứng)
```
Vi: "Sự thu hút và ảnh hưởng lẫn nhau đang hoạt động — nhạy cảm với phản hồi của đối phương là chìa khóa. Tiếp cận đúng cách, lắng nghe tín hiệu từ thị trường hoặc đối tác, không áp đặt một chiều."
En: "Mutual attraction and influence are at work — sensitivity to the counterpart's response is key. Approach properly, listen to market or partner signals, do not impose one-sidedly."
```

### Quẻ 32 — Hằng (Bền Vững)
```
Vi: "Thành công đến từ cam kết kiên định, không thay đổi liên tục theo cảm xúc. Hãy duy trì hướng đi đã chọn và xây dựng thói quen bền vững — sự dao động và thiếu nhất quán sẽ phá vỡ thành quả đã có."
En: "Success comes from steadfast commitment, not emotional zigzagging. Maintain your chosen direction and build durable habits — inconsistency destroys what has been achieved."
```

### Quẻ 33 — Độn (Rút Lui)
```
Vi: "Đây là thời điểm rút lui có chiến lược, không phải thất bại. Xa cách những yếu tố tiêu cực và bảo tồn sức mạnh để tiến bước sau này — việc nhỏ vẫn tiếp tục được, nhưng hành động lớn không phù hợp lúc này."
En: "This is the time for strategic withdrawal, not defeat. Distance from negative forces and preserve strength for future advance — small matters continue, major actions are unsuitable now."
```

### Quẻ 34 — Đại Tráng (Sức Mạnh Lớn)
```
Vi: "Sức mạnh và năng lượng đang ở đỉnh — nhưng sức mạnh không có trí tuệ dẫn đường sẽ tự bẫy mình. Hành động quyết đoán nhưng phải đúng nguyên tắc, tránh dùng lực để ép buộc chỗ không hợp lý."
En: "Power and energy are at their peak — but strength without wisdom becomes a trap. Act decisively but with principle; avoid forcing where it is not appropriate."
```

### Quẻ 35 — Tấn (Tiến Bộ)
```
Vi: "Bước vào ánh sáng và được công nhận — điều kiện ủng hộ tiến bộ trên nhiều mặt. Hãy chủ động tiến lên, thể hiện năng lực và nắm bắt sự công nhận đang đến, đừng ẩn mình trong giai đoạn thuận lợi này."
En: "Stepping into light and recognition — conditions favor progress on multiple fronts. Advance actively, demonstrate capability, and seize the recognition that is coming. Do not hide during this favorable period."
```

### Quẻ 36 — Minh Di (Ánh Sáng Bị Che)
```
Vi: "Tài năng đang bị môi trường xung quanh đè nén — hãy ẩn mình chiến lược và duy trì sức mạnh bên trong. Vẫn kiên trì bên trong nhưng bề ngoài bình thường để tránh bị nhắm vào, chờ thời điểm thuận lợi hơn."
En: "Talent is being suppressed by the surrounding environment. Conceal strategically and maintain inner strength. Persevere internally while appearing ordinary to avoid being targeted; wait for better conditions."
```

### Quẻ 37 — Gia Nhân (Gia Đình)
```
Vi: "Trật tự và tổ chức bên trong là nền tảng cho hiệu quả bên ngoài. Ổn định nội bộ trước — đội nhóm, quy trình, vai trò rõ ràng. Rối loạn trong nhà sẽ phá hỏng mọi kết quả dù thị trường có thuận."
En: "Internal order and organization are the foundation for external effectiveness. Stabilize internal structure first — team roles, processes, and clarity. Internal disorder undermines results regardless of market conditions."
```

### Quẻ 38 — Khuê (Đối Lập)
```
Vi: "Có sự bất đồng hoặc đối lập đang hiện diện, nhưng vẫn có thể làm được việc nhỏ. Đừng cố ép giải quyết xung đột sâu — hãy dùng cách tiếp cận gián tiếp, từng bước nhỏ để dần dần tìm điểm chung."
En: "Opposition or disagreement is present, but small matters are still possible. Do not force resolution of deep conflict — use indirect, step-by-step approaches to gradually find common ground."
```

### Quẻ 39 — Kiển (Chướng Ngại)
```
Vi: "Phía trước có trở ngại rõ ràng — tiếp tục đẩy thẳng sẽ làm khó khăn nặng hơn. Hãy nhận ra sớm, tái định vị chiến lược, tìm người cố vấn có kinh nghiệm và tập hợp sức mạnh trước khi thử lại."
En: "Clear obstruction lies ahead — pushing straight on will make difficulties worse. Recognize early, reposition strategically, seek experienced counsel, and gather strength before trying again."
```

### Quẻ 40 — Giải (Giải Phóng)
```
Vi: "Áp lực và khó khăn đang tan biến — đây là thời điểm giải phóng và chuyển động trở lại. Hành động sớm để xóa bỏ nguyên nhân gốc rễ, sau đó trở về trạng thái bình thường. Đừng kéo dài quá trình giải quyết."
En: "Pressure and difficulty are dissolving — time for release and renewed movement. Act quickly to remove root causes, then return to normal. Do not prolong the resolution process unnecessarily."
```

### Quẻ 41 — Tổn (Giảm Thiểu)
```
Vi: "Thời kỳ cần giảm bớt, đơn giản hóa và hy sinh phần dư thừa vì lợi ích lâu dài. Đây không phải thất bại — giảm đúng lúc và đúng chỗ có thể phục hồi sức mạnh và tạo nền tảng cho tăng trưởng sau."
En: "Period of reduction, simplification, and sacrifice of excess for long-term benefit. This is not failure — timely reduction in the right areas can restore strength and lay the foundation for future growth."
```

### Quẻ 42 — Ích (Gia Tăng)
```
Vi: "Thời kỳ gia tăng và mở rộng — điều kiện ủng hộ đầu tư thêm vào những gì đang hoạt động tốt. Hãy hành động táo bạo và nắm bắt cơ hội này, đây là giai đoạn hiếm gặp khi rủi ro được bù đắp xứng đáng."
En: "Period of increase and expansion — conditions favor investing more into what is working well. Act boldly and seize this opportunity; this is a rare phase when risk is well compensated."
```

### Quẻ 43 — Quải (Quyết Đoán)
```
Vi: "Đã đến lúc phải thông báo dứt khoát và loại bỏ yếu tố tiêu cực ra khỏi hệ thống. Trình bày vấn đề công khai, không dùng bạo lực nhưng phải kiên quyết — dùng sức mạnh mà không có tính chính đáng sẽ thất bại."
En: "Time to make a decisive announcement and remove negative elements from the system. Present the issue openly and firmly without force — strength without righteousness will fail."
```

### Quẻ 44 — Cấu (Gặp Gỡ)
```
Vi: "Có sự gặp gỡ hoặc nhân tố mới xuất hiện — cần cẩn thận đánh giá vì không phải mọi cơ hội đến đều có lợi. Một nhân tố nhỏ nhưng nguy hiểm có thể phát triển thành vấn đề lớn nếu không nhận ra kịp."
En: "A new encounter or element is appearing — evaluate carefully because not every opportunity that arrives is beneficial. A small but dangerous factor can grow into a major problem if not recognized in time."
```

### Quẻ 45 — Tuỵ (Tụ Họp)
```
Vi: "Thời điểm tốt để quy tụ người và nguồn lực dưới sự lãnh đạo đúng đắn. Đến gặp người có tầm nhìn, dâng lễ và bày tỏ cam kết thực sự — tụ họp hỗn loạn không có mục đích sẽ chỉ tạo ra rối loạn."
En: "Good time to gather people and resources under sound leadership. Seek visionary leadership and make a genuine commitment — disorganized gathering without purpose only creates chaos."
```

### Quẻ 46 — Thăng (Leo Lên)
```
Vi: "Tăng trưởng đi lên từng bước, ổn định như cây mọc từ đất. Đây là thời kỳ tiến bộ có nền tảng — hãy gặp người lớn hơn để xin hướng dẫn và đi về hướng thuận lợi, không cần vội nhưng không dừng lại."
En: "Steady upward growth, stable as a tree growing from earth. This is grounded progress — seek guidance from those with more experience, move in the favorable direction, and keep going without rushing."
```

### Quẻ 47 — Khốn (Kiệt Sức)
```
Vi: "Đang ở giai đoạn kiệt sức và bị bóp nghẹt — nguồn lực cạn, nỗ lực không được công nhận. Đây là thử thách nhân cách: giữ vững phẩm giá và chờ đợi, không nhượng bộ nguyên tắc để thoát khỏi áp lực tạm thời."
En: "In a period of exhaustion and confinement — resources depleted, efforts unrecognized. This tests character: maintain dignity and wait rather than compromising principles to escape temporary pressure."
```

### Quẻ 48 — Tỉnh (Cái Giếng)
```
Vi: "Nguồn lực cốt lõi và nền tảng vẫn không đổi dù hoàn cảnh xung quanh thay đổi. Hãy phát triển và duy trì nguồn lực thiết yếu thay vì chỉ đuổi theo bề mặt — gần hoàn thành nhưng thiếu một chút sẽ lãng phí tất cả."
En: "Core resources and foundations remain constant despite changing circumstances. Develop and maintain the essential source rather than chasing surface gains — nearly completing but falling short at the last moment wastes everything."
```

### Quẻ 49 — Cách (Cách Mạng)
```
Vi: "Đây là thời điểm thay đổi lớn và cải cách hệ thống — như thay da mới sau khi cũ đã xong vai trò. Hãy thực hiện thay đổi sau khi đã thuyết phục được nhiều người, không phải trước — đừng cách mạng quá sớm."
En: "Time for major change and systemic reform — like shedding old skin after it has served its purpose. Make changes after winning sufficient support, not before — revolutionary action too early loses legitimacy."
```

### Quẻ 50 — Đỉnh (Cái Đỉnh)
```
Vi: "Đây là thời kỳ nuôi dưỡng những điều có giá trị cao và phát triển nền văn minh, văn hóa tổ chức. Hãy sử dụng nguồn lực đúng cách và đúng người — sự phù hợp giữa người dùng và công cụ tạo ra kết quả vượt trội."
En: "Time for nurturing high-value matters and developing organizational culture and civilization. Use resources properly and with the right people — the right match between user and tool produces outstanding results."
```

### Quẻ 51 — Chấn (Sấm Sét)
```
Vi: "Cú sốc bất ngờ hoặc biến động mạnh đang xảy ra — phản ứng đầu tiên là kinh ngạc nhưng sau đó bình tĩnh trở lại. Đây là hồi chuông thức tỉnh: hành động nghiêm túc, giữ an toàn, không để sốc biến thành hoảng loạn."
En: "Sudden shock or strong turbulence is occurring — first reaction is alarm, then calm returns. This is a wake-up call: act seriously, stay safe, and do not let shock turn into panic."
```

### Quẻ 52 — Cấn (Yên Tĩnh)
```
Vi: "Thời điểm cần dừng lại và giữ yên lặng hoàn toàn — không phải do thụ động mà do lựa chọn có ý thức. Yên tĩnh đúng lúc tập trung sức mạnh và tâm trí; cố hoạt động lúc này sẽ tiêu hao năng lượng vô ích."
En: "Time to stop completely and be still — not from passivity but from conscious choice. Timely stillness concentrates strength and mind; forcing activity now wastes energy needlessly."
```

### Quẻ 53 — Tiệm (Phát Triển Dần Dần)
```
Vi: "Tiến bộ bền vững đến từng bước đúng trình tự, không thể nhảy cóc. Như ngỗng đi từng chặng lên cao, hãy tuân thủ từng giai đoạn cần thiết — vội vàng phá vỡ trình tự tự nhiên sẽ tạo bất ổn."
En: "Sustainable progress comes from each step in proper sequence, not skipping stages. Like a goose advancing step by step, follow each necessary phase — rushing breaks natural sequence and creates instability."
```

### Quẻ 54 — Quy Muội (Hôn Nhân Không Đúng)
```
Vi: "Đang ở vị thế không phù hợp hoặc hành động sai thời điểm — tiến tới lúc này mang lại xui xẻo. Kiên nhẫn chờ vị trí đúng và thời điểm đúng, tránh hành động xuất phát từ áp lực hoặc vị thế yếu kém."
En: "Currently in an improper position or acting at the wrong time — moving forward now brings misfortune. Wait patiently for the right position and right timing; avoid action driven by pressure or weakness."
```

### Quẻ 55 — Phong (Sung Túc)
```
Vi: "Đang ở đỉnh sung túc — như mặt trời ở giữa trưa, đây là thời điểm triển khai toàn lực và hưởng thành quả. Nhưng mặt trời giữa trưa sẽ bắt đầu đi xuống, hãy hưởng nhưng đồng thời chuẩn bị cho giai đoạn kế."
En: "At the peak of abundance — like the midday sun, this is the moment to deploy fully and enjoy results. But the midday sun begins to decline; enjoy while simultaneously preparing for the next phase."
```

### Quẻ 56 — Lữ (Người Lữ Hành)
```
Vi: "Đang ở trong tình thế tạm thời, như người lữ hành qua vùng đất lạ. Thành công nhỏ có thể đạt được nếu hành xử cẩn thận và khiêm tốn — kiêu ngạo hoặc bất cẩn khi ở vị thế dễ tổn thương rất nguy hiểm."
En: "In a temporary or transitional situation, like a traveler in unfamiliar territory. Small success is possible with careful and modest conduct — arrogance or carelessness while vulnerable is dangerous."
```

### Quẻ 57 — Tốn (Thâm Nhập Nhẹ Nhàng)
```
Vi: "Hành động hiệu quả nhất lúc này là thâm nhập từ từ, kiên trì, như gió len lỏi vào mọi khe hở. Không dùng lực tấn công trực diện mà dùng sự linh hoạt liên tục — có người chỉ dẫn sẽ tốt hơn làm một mình."
En: "The most effective action now is gentle persistent penetration, like wind finding every crack. Avoid direct frontal force; use continuous flexibility instead — having a guide is better than going alone."
```

### Quẻ 58 — Đoài (Niềm Vui)
```
Vi: "Niềm vui và sự trao đổi cởi mở tạo ra môi trường thuận lợi cho hợp tác. Hãy chia sẻ, giao lưu và giữ thái độ vui vẻ chân thành — nhưng phân biệt niềm vui thực sự với sự chiều chuộng rỗng tuếch có thể dẫn sai đường."
En: "Joy and open exchange create a favorable environment for cooperation. Share, connect, and maintain genuine good humor — but distinguish real joy from empty flattery that can lead you astray."
```

### Quẻ 59 — Hoán (Tan Chảy)
```
Vi: "Rào cản và sự cứng nhắc đang tan chảy, tạo điều kiện cho sự hợp nhất trở lại. Như gió thổi trên nước, hãy phân tán những ích kỷ nhỏ để phục vụ mục tiêu lớn hơn — đây là thời điểm hòa giải và kết nối lại."
En: "Barriers and rigidity are dissolving, enabling reunification. Like wind on water, disperse petty self-interest to serve the larger purpose — this is the time for reconciliation and reconnection."
```

### Quẻ 60 — Tiết (Tiết Chế)
```
Vi: "Đặt ra giới hạn và kỷ luật rõ ràng là cần thiết để duy trì hệ thống hoạt động bền vững. Tiết chế không phải là hạn chế tiêu cực — giới hạn đúng đắn tạo ra cấu trúc giúp mọi người phát triển trong đó."
En: "Setting clear limits and discipline is necessary to maintain a sustainable system. Moderation is not negative restriction — proper limits create structure within which people can thrive."
```

### Quẻ 61 — Trung Phu (Trung Thực)
```
Vi: "Lòng trung thực và niềm tin từ bên trong lan tỏa ra ngoài và cảm hóa người khác. Hành động xuất phát từ sự thành thật thực sự sẽ được tin tưởng và ủng hộ — ngay cả kẻ cứng đầu cũng có thể được thuyết phục bằng sự chân thành."
En: "Inner sincerity radiates outward and influences others. Action from genuine honesty earns trust and support — even the most stubborn can be moved by true sincerity."
```

### Quẻ 62 — Tiểu Quá (Vượt Một Chút)
```
Vi: "Điều kiện chỉ cho phép bước nhỏ — cố gắng vươn tới mục tiêu lớn lúc này sẽ thất bại. Hãy làm những gì vừa tầm với: mục tiêu nhỏ, biện pháp thận trọng, gần trước, xa sau — đây không phải thời của chim đại bàng."
En: "Conditions only allow small steps — attempting large targets now will fail. Do what is within reach: small goals, cautious measures, nearby before distant. This is not the time for eagles to fly."
```

### Quẻ 63 — Ký Tế (Đã Hoàn Thành)
```
Vi: "Đã hoàn thành một chu kỳ thành công — nhưng chính vì hoàn thành rồi nên dễ buông lỏng. Hãy duy trì cẩn thận những gì đã đạt được vì sự trật bánh nhỏ ngay sau đỉnh thành công có thể phá hỏng tất cả."
En: "A cycle has been successfully completed — but completion itself invites complacency. Carefully maintain what has been achieved; a small misstep right after success can undo everything."
```

### Quẻ 64 — Vị Tế (Chưa Hoàn Thành)
```
Vi: "Chưa hoàn thành nhưng đang trong quá trình — ánh sáng cuối đường hầm đang nhìn thấy được. Hãy cẩn thận và kiên trì đến cùng, không để buông lơi gần về đích, vì bước chuyển qua hoàn thành đòi hỏi tập trung nhất."
En: "Not yet complete but in process — the light at the end of the tunnel is visible. Stay careful and persistent until the end; do not relax near the finish line, as the transition to completion requires the most focus."
```

---

## Requirements

### FR-1: Add `HoverSummary` field to `queReference` struct
**DDD layer:** Domain  
**Description:** Add `HoverSummary localized` field to `queReference` struct in `hexagram_reference.go`. Extend the `build()` function signature to accept a `hoverSummary localized` parameter. Populate all 64 `build()` calls with the VI/EN strings defined in the "Pre-authored 64 hoverSummary.vi Strings" section above.  
**Acceptance criteria:**
- `queReference` struct contains `HoverSummary localized` with JSON tag `"hoverSummary"`
- `buildAllQueReferences()` populates `HoverSummary` for all 64 hexagrams (count verified)
- All 64 `hoverSummary.vi` strings are ≥ 80 chars (zero-terse-residue gate)
- No Hán-Việt jargon left unexplained in any VI string
- `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` succeeds and `que-reference.js` contains `"hoverSummary"` field for all 64 entries

### FR-2: Regenerate `que-reference.js` from updated Go SSOT
**DDD layer:** Infrastructure  
**Description:** After FR-1 code change, run `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` to regenerate `apps/kinh-dich-service/dashboard/que-reference.js`. Never hand-edit the generated file.  
**Acceptance criteria:**
- `que-reference.js` contains `hoverSummary` field with `.vi` and `.en` sub-keys for all 64 hexagrams
- `grep -c '"hoverSummary"' apps/kinh-dich-service/dashboard/que-reference.js` returns 64
- File begins with `window.__QUE_REFERENCE__ =` (existing format preserved)

### FR-3: Render `hoverSummary.vi` in `.qref-meaning` span
**DDD layer:** Interface  
**Description:** In `apps/kinh-dich-service/dashboard/index.html` at L2501, replace `loc(q.coreMeaning)` with `loc(q.hoverSummary)` in the `.qref-meaning` span.  
**Acceptance criteria:**
- `.qref-meaning` span renders `q.hoverSummary` (VI or EN per lang toggle, same `loc()` function)
- `.qref-warning` span (L2504) continues rendering `q.warning` unchanged
- `coreMeaning` is NOT removed from data or HTML — it is still present in the `qref-detail` section and in the Go struct; only the glanceable-row span switches to `hoverSummary`
- Manual test: load dashboard, the collapsed quẻ 47 row shows "Đang ở giai đoạn kiệt sức và bị bóp nghẹt..." (not "Kiệt sức và giam cầm")

### NFR-1: `coreMeaning` untouched everywhere else
**DDD layer:** Domain / Interface  
**Description:** `coreMeaning.vi` remains in the struct, in que-reference.js, and in `qref-detail` expanded view. It continues to be the field used by the React frontend tooltip (QUE-TOOLTIP-DRY pipeline). No change to its content or any other consumer.  
**Acceptance criteria:**
- `grep -n "coreMeaning" apps/kinh-dich-service/dashboard/index.html` still returns at least one match (the expanded-detail section at L2508+ or elsewhere), confirming `coreMeaning` is not fully removed
- React frontend pipeline (`que-reference.js` → `gen-que-descriptions.ts`) continues to read `coreMeaning.vi` — not `hoverSummary.vi`
- MCP tool `explain_hexagram` return payload unchanged

### NFR-2: No regression on lang toggle
**DDD layer:** Interface  
**Description:** The dashboard has a VI/EN language toggle. The `loc()` function returns `.vi` or `.en` from a `localized` struct. The `hoverSummary` field carries both `.vi` and `.en` strings (pre-authored above). The toggle must work correctly for `hoverSummary` the same as for all other localized fields.  
**Acceptance criteria:**
- Switch to EN → `.qref-meaning` shows the English `hoverSummary.en` string
- Switch back to VI → `.qref-meaning` shows the Vietnamese `hoverSummary.vi` string

---

## Edge Cases

- **quẻ 47 terse residue test:** Before this fix, `loc(q.coreMeaning)` = "Kiệt sức và giam cầm" (17 chars). After fix, `loc(q.hoverSummary)` = 175+ chars. QA samples quẻ 47 explicitly.
- **quẻ 29 (double-danger):** coreMeaning.vi = "Hiểm trở chồng hiểm trở, hố sâu nối hố sâu" — also terse. hoverSummary.vi authored above at 176 chars. QA samples quẻ 29.
- **Lang toggle during load:** If user toggles language before que-reference.js has loaded, `loc()` gracefully returns empty string (existing behavior, unchanged).
- **Commit scope:** Explicit paths only: `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go`, `apps/kinh-dich-service/dashboard/que-reference.js`, `apps/kinh-dich-service/dashboard/index.html`. NEVER `git add -A`. Dirty tree files (tool-usage-stats.json, bctc-analyst/market-watcher/news-scout notebooks, coverage-state.json, cowork-schedule.json) must stay uncommitted.
- **Service rebuild:** If the Go kinh-dich-service binary is what serves the dashboard, ops must rebuild the service container after changes so the new `que-reference.js` is served. Dev-kinh-dich flags this to ops in commit message.

---

## DDD Layer Map

| Requirement | Layer | File(s) |
|---|---|---|
| FR-1: HoverSummary struct + 64 strings | Domain | `hexagram_reference.go` |
| FR-2: Regenerate que-reference.js | Infrastructure | `que-reference.js` (generated) |
| FR-3: Render hoverSummary in row | Interface | `dashboard/index.html` L2501 |
| NFR-1: coreMeaning preserved elsewhere | Domain / Interface | all consumers untouched |
| NFR-2: Lang toggle regression | Interface | `dashboard/index.html` |

---

## LIVE Verification Gate (QA)

QA must confirm in the RUNNING dashboard (not just file inspection):

1. Load `apps/kinh-dich-service` dashboard in browser (service running locally or on docker).
2. Navigate to qref panel.
3. For quẻ 47 (Khốn): collapsed row `.qref-meaning` must show "Đang ở giai đoạn kiệt sức và bị bóp nghẹt..." (≥ 80 chars). Fail = still shows "Kiệt sức và giam cầm".
4. For quẻ 1 (Kiền): collapsed row must show the enriched string starting "Giai đoạn năng lượng mạnh nhất...".
5. For quẻ 29 (Khảm): collapsed row must show enriched string ≥ 80 chars.
6. Click-expand quẻ 47 → expanded detail panel still shows coreMeaning ("Kiệt sức và giam cầm") and stateInterpretation unchanged.
7. Toggle language to EN → `.qref-meaning` shows English hoverSummary.en string.
8. Toggle back to VI → shows Vietnamese.
9. Verify `grep -c '"hoverSummary"' apps/kinh-dich-service/dashboard/que-reference.js` = 64 (not less).
10. Verify 0 strings < 80 chars in hoverSummary.vi: `python3 -c "import json,re; js=open('apps/kinh-dich-service/dashboard/que-reference.js').read(); data=json.loads(re.sub(r'^window\.__QUE_REFERENCE__\s*=\s*','',js).rstrip(';')); short=[d['hoverSummary']['vi'] for d in data if len(d['hoverSummary']['vi'])<80]; print(len(short),'short strings:', short)"` → must print `0 short strings: []`.

---

## Blockers

None for PO. No architect blockers — this is a single-zone change (dev-kinh-dich owns both .go and dashboard).

**One architect ratification needed:**
- **RATIFY-1:** Confirm Option C (new `hoverSummary` field) vs any alternative. BA recommends C with rationale above. If architect disagrees, spec must be revised before dev dispatch.

---

## Out of Scope

- NOT changing `coreMeaning.vi` content (terse clause preserved as-is for React frontend tooltip per QUE-TOOLTIP-DRY PO-Q3 ruling)
- NOT changing `stateInterpretation.vi`, `favorable.vi`, `warning.vi` content or their render sites
- NOT touching the React frontend (`apps/frontend/`) — that is QUE-TOOLTIP-DRY territory
- NOT touching MCP tool `explain_hexagram` return payload
- NOT touching `apps/mcp-server/` in any way

---

## Commit Rule (explicit paths, enforce on dev-kinh-dich)

```bash
git add apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go
git add apps/kinh-dich-service/dashboard/que-reference.js
git add apps/kinh-dich-service/dashboard/index.html
git commit -m "feat(kinh-dich/hover): add hoverSummary field + 64 plain-VN descriptions"
```

NEVER: `git add -A`, `git add .`, or any glob that captures notebooks, tool-usage-stats.json, orch-state.json.

---

## Decision Journal

**Task:** BA-KINHDICH-HOVER-ENRICH  
**Date:** 2026-06-14  
**What considered:** Options A (widen coreMeaning), B (surface existing richer fields), C (new hoverSummary field).  
**Why C chosen:** A corrupts coreMeaning semantics already locked by QUE-TOOLTIP-DRY PO-Q3; B dumps 3–6 sentences in an inline span already crowded (warning already shown there), violating the same PO verbosity ruling. C keeps all fields semantically clean, authored once in Go SSOT, zero cross-zone impact.  
**Content approach:** Pre-authored all 64 VI+EN strings in spec (not just exemplars) to guarantee quality and remove language-authoring burden from developer. Done-bar = 64 uniform, zero terse residue.  
**Why change:** User-reported UX defect — the 36-char terse clause is not comprehensible to a non-technical Vietnamese reader monitoring stocks.
