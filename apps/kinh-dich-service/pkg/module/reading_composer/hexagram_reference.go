package reading_composer

// AUTO-GENERATED reference data for 64 hexagrams.
// Source: /Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/
// This file backs the dashboard que-reference panel and future /hexagram/{number}/explain route.
// KD-QREF-LANG: localized EN/VI fields for language switch feature.

import (
	"strings"
)

// localized carries one text field in two languages.
type localized struct {
	En string `json:"en"`
	Vi string `json:"vi"`
}

// phaseReference describes a single hào in trading terms.
type phaseReference struct {
	Phase   int       `json:"phase"`   // 1-6
	Action  string    `json:"action"`  // reuse from queDataMap: TIEN/GIU/CHO/THAN/LUI
	Outcome string    `json:"outcome"` // reuse from queDataMap: CAT/HUNG/VO CUU/HOI/LE
	Gloss   localized `json:"gloss"`   // one-line trading meaning in EN and VI
}

// queReference holds the full trading-reference record for one hexagram.
type queReference struct {
	ID                  int              `json:"id"`
	Name                string           `json:"name"`                // Vietnamese name, verbatim
	Chinese             string           `json:"chinese"`             // Han zi glyph, verbatim
	Upper               string           `json:"upper"`               // trigram name (Qian/Kan/…)
	Lower               string           `json:"lower"`               // trigram name
	UpperElement        string           `json:"upperElement"`        // Kim/Moc/Hoa/Thuy/Tho
	LowerElement        string           `json:"lowerElement"`        // Kim/Moc/Hoa/Thuy/Tho
	CoreMeaning         localized        `json:"coreMeaning"`         // one-clause core meaning
	HoverSummary        localized        `json:"hoverSummary"`        // 1-3 plain-VN sentences for glanceable dashboard row
	MarketTrend         string           `json:"marketTrend"`         // "favorable"|"neutral"|"unfavorable"
	MarketTrendLabel    localized        `json:"marketTrendLabel"`    // EN: "Favorable (THUẬN LỢI)", VI: "Thuận lợi (THUẬN LỢI)"
	StateInterpretation localized        `json:"stateInterpretation"` // 1-3 sentence trading-state prose
	Favorable           localized        `json:"favorable"`           // one-line condition for entry/hold
	Warning             localized        `json:"warning"`             // one-line risk/warning
	Phases              []phaseReference `json:"phases"`              // len==6, index 0=phase1…index5=phase6
}

// mapTrendToEnum converts the ASCII trend string from queDataMap to the enum value.
// Uses prefix matching per architect spec (handles "THUAN LOI — manh" variants).
func mapTrendToEnum(trend string) (marketTrend string, marketTrendLabel localized) {
	t := strings.ToUpper(trend)
	if strings.HasPrefix(t, "THUAN LOI") {
		return "favorable", localized{En: "Favorable (THUẬN LỢI)", Vi: "Thuận lợi (THUẬN LỢI)"}
	}
	if strings.HasPrefix(t, "BAT LOI") {
		return "unfavorable", localized{En: "Unfavorable (BẤT LỢI)", Vi: "Bất lợi (BẤT LỢI)"}
	}
	// TRUNG TINH or unknown
	return "neutral", localized{En: "Neutral (TRUNG TÍNH)", Vi: "Trung tính (TRUNG TÍNH)"}
}

// buildPhases constructs phase references from queDataMap lines + localized glosses.
func buildPhases(id int, glosses []localized) []phaseReference {
	qd := getQueData(id)
	if qd == nil || len(qd.lines) != 6 {
		return nil
	}
	phases := make([]phaseReference, 6)
	for i := 0; i < 6; i++ {
		phases[i] = phaseReference{
			Phase:   i + 1,
			Action:  qd.lines[i].action,
			Outcome: qd.lines[i].outcome,
			Gloss:   glosses[i],
		}
	}
	return phases
}

// queReferenceList is the ordered slice of all 64 queReference entries.
var queReferenceList []queReference

// queReferenceMap provides O(1) lookup by hexagram ID.
var queReferenceMap map[int]*queReference

func init() {
	queReferenceList = buildAllQueReferences()
	queReferenceMap = make(map[int]*queReference, 64)
	for i := range queReferenceList {
		queReferenceMap[queReferenceList[i].ID] = &queReferenceList[i]
	}
}

// GetQueReference returns the reference record for a hexagram by ID.
func GetQueReference(id int) *queReference {
	return queReferenceMap[id]
}

// GetAllQueReferences returns all 64 records in canonical order (id 1..64).
func GetAllQueReferences() []queReference {
	return queReferenceList
}

// buildAllQueReferences constructs all 64 reference entries.
func buildAllQueReferences() []queReference {
	refs := make([]queReference, 64)

	// Helper to build one entry with localized fields
	build := func(id int, coreMeaning, hoverSummary, stateInterpretation, favorable, warning localized, glosses []localized) queReference {
		meta := getQueMeta(id)
		data := getQueData(id)
		if meta == nil || data == nil {
			return queReference{ID: id}
		}

		trend, trendLabel := mapTrendToEnum(data.trend)
		upperEl := ""
		lowerEl := ""
		if t, ok := trigrams[meta.upper]; ok {
			upperEl = t.element
		}
		if t, ok := trigrams[meta.lower]; ok {
			lowerEl = t.element
		}

		return queReference{
			ID:                  id,
			Name:                meta.name,
			Chinese:             meta.chinese,
			Upper:               meta.upper,
			Lower:               meta.lower,
			UpperElement:        upperEl,
			LowerElement:        lowerEl,
			CoreMeaning:         coreMeaning,
			HoverSummary:        hoverSummary,
			MarketTrend:         trend,
			MarketTrendLabel:    trendLabel,
			StateInterpretation: stateInterpretation,
			Favorable:           favorable,
			Warning:             warning,
			Phases:              buildPhases(id, glosses),
		}
	}

	// 1. Kiền - The Creative
	refs[0] = build(1,
		localized{En: "Pure creative force, strong yang energy advancing without rest", Vi: "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành"},
		localized{En: "Peak creative energy supports bold action. Best time to launch or expand, but stay grounded — arrogance at the peak invites the fall.", Vi: "Giai đoạn năng lượng mạnh nhất, mọi hành động đều được ủng hộ. Đây là thời điểm khởi nghiệp, mở rộng hoặc đẩy mạnh — nhưng cần giữ thái độ đúng mực, không kiêu căng tự mãn khi đang ở đỉnh cao."},
		localized{En: "Period of powerful growth suitable for launching or expanding positions. Maintain integrity; avoid arrogance. The market favors bold but disciplined moves.", Vi: "Thời kỳ phát triển mạnh mẽ, thích hợp khởi nghiệp hoặc mở rộng. Cần giữ liêm chính, đừng kiêu ngạo."},
		localized{En: "All endeavors prosper when you maintain righteous conduct and persistent effort.", Vi: "Năng lượng dương cực mạnh, vạn sự hanh thông nếu giữ chính đạo."},
		localized{En: "At the peak, decline begins. Excessive pride leads to downfall.", Vi: "Dương cực sinh âm — ở đỉnh cao nhất thì suy thoái đã bắt đầu. Đừng kiêu căng tự mãn."},
		[]localized{
			{En: "Hidden potential phase — accumulate resources, do not act yet", Vi: "Tích lũy năng lực, chưa nên xuất đầu lộ diện"},
			{En: "Talent recognized — advance and connect with influential players", Vi: "Xuất hiện, kết nối với người có ảnh hưởng"},
			{En: "Critical transition — work diligently and stay vigilant day and night", Vi: "Làm việc chăm chỉ và luôn tự kiểm điểm"},
			{En: "Flexible choice — either advance or retreat as timing dictates", Vi: "Linh hoạt lựa chọn, không bắt buộc phải tiến"},
			{En: "Peak power — deploy full capacity and lead decisively", Vi: "Phát huy hết năng lực, dẫn dắt người khác"},
			{En: "Overreach brings regret — know when to step back", Vi: "Biết dừng lại, tránh cực đoan"},
		})

	// 2. Khôn - The Receptive
	refs[1] = build(2,
		localized{En: "Pure receptive force, yielding yin energy following the flow", Vi: "Sức tiếp nhận vĩ đại, đức nhu thuận nuôi dưỡng vạn vật"},
		localized{En: "Time to support rather than lead. Build foundations and work with existing momentum. Do not force a new direction — follow the prevailing flow.", Vi: "Thời kỳ nên hỗ trợ thay vì dẫn đầu. Thị trường cần người kiên nhẫn xây dựng nền tảng, làm việc nhóm, không phải người đứng mũi chịu sào — hãy theo dòng chảy, đừng cố tạo xu hướng mới."},
		localized{En: "Time to follow rather than lead. Support existing trends rather than initiate. Patience and adaptability yield better results than forcing action.", Vi: "Phù hợp vai trò hỗ trợ, phó, cố vấn hơn là người dẫn đầu. Xây dựng nền tảng vững chắc, làm việc nhóm."},
		localized{En: "Success comes through receptivity and alignment with prevailing forces.", Vi: "Thuận theo tự nhiên, đừng cố gắng đi đầu mà hãy hỗ trợ."},
		localized{En: "Pure yin lacks initiative — eventual stagnation without balancing yang energy.", Vi: "Quá mềm mỏng thành nhu nhược. Cần có lập trường chính đạo, không phải chiều theo tất cả."},
		[]localized{
			{En: "Early frost — maintain position, consolidate quietly", Vi: "Nhận diện dấu hiệu sớm, phòng ngừa từ đầu"},
			{En: "Natural growth — hold steady, let momentum develop", Vi: "Hành động theo bản tính ngay thẳng tự nhiên"},
			{En: "Hidden merit — keep low profile, preserve gains", Vi: "Ẩn tài năng, hoàn thành nhiệm vụ không cầu danh"},
			{En: "Tied sack — remain cautious, neither advance nor retreat", Vi: "Kín đáo, thận trọng, không phô trương"},
			{En: "Yellow garment — auspicious through modesty and central position", Vi: "Phát huy đức trung dung, khiêm tốn mà vẫn rực rỡ"},
			{En: "Dragons fighting — extreme yin, danger of conflict", Vi: "Tránh xung đột, biết giới hạn của mình"},
		})

	// 3. Truân - Difficulty at Beginning
	refs[2] = build(3,
		localized{En: "Initial hardship requiring patience and perseverance", Vi: "Khó khăn ban đầu khi vạn vật mới sinh, như hạt mầm nảy từ đất"},
		localized{En: "Difficult startup phase — things are forming but not yet stable. Find reliable allies and build step by step rather than rushing.", Vi: "Giai đoạn khởi đầu gian nan — mọi thứ đang hình thành nhưng chưa ổn định. Đừng làm một mình, hãy tìm người đồng hành tin cậy và chịu khó xây từng bước nhỏ thay vì vội vàng."},
		localized{En: "Challenging startup phase with obstacles at every turn. Do not rush; build foundations methodically. Seek allies and wait for clarity before major moves.", Vi: "Khởi nghiệp gian nan, cần người hỗ trợ. Đừng làm một mình, hãy xây dựng đội ngũ."},
		localized{En: "Persistence through initial chaos eventually leads to order and growth.", Vi: "Kiên nhẫn vượt qua giai đoạn khởi đầu sẽ hanh thông."},
		localized{En: "Premature action in confusion leads to deeper entanglement.", Vi: "Đừng vội vàng, đừng cố một mình. Giai đoạn này cần sự giúp đỡ và kiên nhẫn."},
		[]localized{
			{En: "Hesitation at start — wait, do not force entry", Vi: "Đừng vội tiến, hãy xây nền móng và tìm đồng minh"},
			{En: "Stuck but opportunity emerges — patience, not action", Vi: "Giữ lập trường, đợi đúng người đúng thời"},
			{En: "Chasing without guide — retreat, you lack direction", Vi: "Bỏ cuộc, đừng đuổi theo cơ hội không chắc chắn"},
			{En: "Seeking alliance — wait for the right partner", Vi: "Chủ động tìm kiếm hợp tác, kết nối"},
			{En: "Small gains possible — hold position cautiously", Vi: "Chỉ làm việc nhỏ, chưa đủ sức cho việc lớn"},
			{En: "Tears of blood — forcing ahead brings disaster", Vi: "Chấp nhận thất bại, nghỉ ngơi, chờ thời cơ mới"},
		})

	// 4. Mông - Youthful Folly
	refs[3] = build(4,
		localized{En: "Inexperience requiring education and guidance", Vi: "U mê non dại cần được khai sáng, như suối nước từ chân núi chảy ra"},
		localized{En: "Situation is unclear and information is insufficient. Time to learn, not to make big moves. Seek experienced guidance before acting.", Vi: "Tình hình chưa rõ ràng, bản thân còn thiếu thông tin. Đây là lúc học hỏi chứ không phải ra quyết định lớn — hãy khiêm tốn tìm người có kinh nghiệm hướng dẫn trước khi hành động."},
		localized{En: "Market conditions are unclear; you lack sufficient knowledge. Seek mentorship and study before acting. Humility in learning prevents costly errors.", Vi: "Cần học hỏi và rèn luyện. Tìm thầy giỏi, kiên nhẫn tiếp thu."},
		localized{En: "Success through accepting guidance and learning from experience.", Vi: "Khiêm tốn học hỏi, tìm người hướng dẫn."},
		localized{En: "Stubbornly ignoring advice or repeating the same questions leads to failure.", Vi: "Đừng cố chấp trong u mê. Biết mình chưa biết là bước đầu của trí tuệ."},
		[]localized{
			{En: "Discipline needed — hold, establish basic rules", Vi: "Kỷ luật là nền tảng, thiết lập nguyên tắc cơ bản"},
			{En: "Patience with the ignorant — hold steady, guide gently", Vi: "Bao dung với người chưa hiểu, kiên nhẫn hướng dẫn"},
			{En: "Chasing superficially — retreat, you miss the substance", Vi: "Đừng chạy theo bề ngoài, sẽ bỏ lỡ bản chất"},
			{En: "Trapped in delusion — wait, reality will clarify", Vi: "Bị mắc kẹt trong ảo tưởng, chờ thực tế sáng tỏ"},
			{En: "Childlike openness — hold, innocent approach succeeds", Vi: "Cởi mở như trẻ thơ, cách tiếp cận hồn nhiên thành công"},
			{En: "Punishment for folly — hold, accept consequences and learn", Vi: "Chấp nhận hậu quả và học hỏi từ sai lầm"},
		})

	// 5. Nhu - Waiting
	refs[4] = build(5,
		localized{En: "Waiting for the right moment with confidence", Vi: "Chờ đợi đúng thời cơ với niềm tin vững chắc"},
		localized{En: "Opportunity is forming but not yet ripe. Wait calmly and prepare — anxiety-driven early entry wastes resources.", Vi: "Cơ hội đang đến nhưng chưa chín muồi — thời điểm chưa đúng để vào lệnh. Hãy kiên nhẫn chờ đợi với tâm thế bình tĩnh, chuẩn bị kỹ, không để lo lắng thúc đẩy hành động sai lúc."},
		localized{En: "Conditions are developing but not yet ripe. Wait with inner certainty; nourish yourself while opportunities mature. Premature entry wastes resources.", Vi: "Điều kiện đang hình thành nhưng chưa chín muồi. Chờ đợi với sự tự tin, nuôi dưỡng bản thân trong khi cơ hội trưởng thành."},
		localized{En: "Patient waiting with confidence brings success when timing aligns.", Vi: "Kiên nhẫn chờ đợi với niềm tin mang lại thành công khi thời cơ đến."},
		localized{En: "Anxiety and impatience during waiting lead to poor decisions.", Vi: "Lo lắng và thiếu kiên nhẫn khi chờ đợi dẫn đến quyết định sai lầm."},
		[]localized{
			{En: "Waiting in meadow — hold, stay in familiar territory", Vi: "Chờ ở vùng quen thuộc, giữ vị trí an toàn"},
			{En: "Waiting on sand — hold, minor friction but safe", Vi: "Chờ trên cát, có ma sát nhỏ nhưng an toàn"},
			{En: "Waiting in mud — caution, vulnerable to attack", Vi: "Chờ trong bùn, dễ bị tấn công, cần thận trọng"},
			{En: "Waiting in blood — hold, danger very close", Vi: "Chờ trong máu, nguy hiểm rất gần"},
			{En: "Waiting at feast — hold, enjoy while staying alert", Vi: "Chờ tại bữa tiệc, tận hưởng nhưng vẫn cảnh giác"},
			{En: "Falling into pit — hold, unexpected guests bring resolution", Vi: "Rơi vào hố, khách không mời đến mang lại giải pháp"},
		})

	// 6. Tụng - Conflict
	refs[5] = build(6,
		localized{En: "Conflict and litigation requiring resolution", Vi: "Tranh chấp và kiện tụng cần được giải quyết"},
		localized{En: "Conflict is active — escalating further costs more than winning gains. Seek mediation and accept partial compromise; timely retreat is the wisest move.", Vi: "Đang có xung đột hoặc bất đồng — leo thang thêm sẽ tốn kém hơn thắng lợi mang lại. Tìm người hòa giải, chấp nhận thỏa hiệp một phần, rút lui đúng lúc thường là nước đi khôn ngoan nhất."},
		localized{En: "Disputes or competition create tension. Avoid prolonged battles; seek mediation. Partial retreat often yields better outcomes than pyrrhic victory.", Vi: "Tranh chấp tạo ra căng thẳng. Tránh kéo dài xung đột, tìm người hòa giải. Lui một phần thường tốt hơn thắng lợi cay đắng."},
		localized{En: "Early compromise prevents costly escalation.", Vi: "Thỏa hiệp sớm ngăn ngừa leo thang tốn kém."},
		localized{En: "Stubborn persistence in conflict ultimately harms everyone involved.", Vi: "Cố chấp trong xung đột cuối cùng gây hại cho tất cả."},
		[]localized{
			{En: "Abandon the dispute — hold, do not prolong conflict", Vi: "Từ bỏ tranh chấp, không kéo dài xung đột"},
			{En: "Unable to win — retreat, preserve what you have", Vi: "Không thể thắng, lui về bảo toàn những gì đang có"},
			{En: "Living on past merit — hold, ancestral fortune protects", Vi: "Sống nhờ công đức xưa, phước tổ tiên bảo vệ"},
			{En: "Accept the judgment — hold, return to righteous path", Vi: "Chấp nhận phán quyết, trở về con đường chính đạo"},
			{En: "Winning the case — hold, vindication through proper channels", Vi: "Thắng kiện qua kênh chính đáng"},
			{En: "Winning belt but losing three times daily — retreat, hollow victory", Vi: "Thắng nhưng mất ba lần mỗi ngày, chiến thắng rỗng tuếch"},
		})

	// 7. Sư - The Army
	refs[6] = build(7,
		localized{En: "Organized force requiring discipline and leadership", Vi: "Lực lượng có tổ chức cần kỷ luật và lãnh đạo"},
		localized{En: "Large-scale action requires clear leadership and discipline. Success comes from coordination — disorganized action or wrong leadership leads to failure.", Vi: "Cần hành động quy mô lớn, có tổ chức và người lãnh đạo rõ ràng. Thành công đến từ kỷ luật và phối hợp — hành động lộn xộn hoặc sai người dẫn đầu sẽ dẫn đến thất bại và lãng phí nguồn lực."},
		localized{En: "Large-scale coordinated action needed. Success depends on proper leadership and clear chain of command. Undisciplined moves scatter resources.", Vi: "Cần hành động phối hợp quy mô lớn. Thành công phụ thuộc vào lãnh đạo đúng đắn và chuỗi chỉ huy rõ ràng."},
		localized{En: "Victory through organization, discipline, and experienced leadership.", Vi: "Chiến thắng qua tổ chức, kỷ luật và lãnh đạo có kinh nghiệm."},
		localized{En: "Poor leadership or broken discipline leads to defeat and scattered forces.", Vi: "Lãnh đạo kém hoặc kỷ luật lỏng lẻo dẫn đến thất bại và lực lượng tan rã."},
		[]localized{
			{En: "Army must have discipline — retreat, disorganized force fails", Vi: "Quân đội cần kỷ luật, lực lượng hỗn loạn sẽ thất bại"},
			{En: "In the midst of army — hold, central position is fortunate", Vi: "Ở giữa quân đội, vị trí trung tâm là may mắn"},
			{En: "Army carries corpses — retreat, casualties from poor command", Vi: "Quân đội mang xác, tổn thất từ chỉ huy kém"},
			{En: "Army retreats orderly — hold, strategic withdrawal succeeds", Vi: "Quân đội rút lui có trật tự, rút lui chiến lược thành công"},
			{En: "Game in field, capture it — hold, justified action succeeds", Vi: "Thú trong đồng, bắt lấy, hành động chính đáng thành công"},
			{En: "Feudal rewards — retreat, wrong people in wrong positions", Vi: "Phong thưởng sai người, sai vị trí"},
		})

	// 8. Tỷ - Holding Together
	refs[7] = build(8,
		localized{En: "Union and alliance seeking mutual benefit", Vi: "Liên kết và liên minh tìm kiếm lợi ích chung"},
		localized{En: "Good time to form alliances and cooperate. Choose partners carefully — the right alliance brings lasting benefit, but late joiners miss the best opportunities.", Vi: "Đây là thời điểm tốt để liên minh và hợp tác. Hãy xem xét kỹ đối tác trước khi cam kết — liên kết với người đúng mang lại lợi ích lâu dài, tham gia quá muộn sẽ bỏ lỡ cơ hội tốt nhất."},
		localized{En: "Time to seek alliances and join forces. Examine potential partners carefully before committing. Late joiners miss the best opportunities.", Vi: "Thời điểm tìm kiếm liên minh và hợp lực. Xem xét kỹ đối tác tiềm năng trước khi cam kết."},
		localized{En: "Forming strong alliances with trustworthy partners brings lasting benefit.", Vi: "Hình thành liên minh mạnh với đối tác đáng tin cậy mang lại lợi ích lâu dài."},
		localized{En: "Aligning with wrong partners or joining too late leads to disappointment.", Vi: "Liên kết với đối tác sai hoặc tham gia quá muộn dẫn đến thất vọng."},
		[]localized{
			{En: "Sincere alliance — hold, truthfulness brings fortune", Vi: "Liên minh chân thành, sự trung thực mang lại may mắn"},
			{En: "Inner connection — hold, self-correction brings luck", Vi: "Kết nối từ bên trong, tự sửa mình mang lại vận may"},
			{En: "Wrong companions — retreat, aligning with unworthy fails", Vi: "Đồng hành sai, liên kết với kẻ bất xứng sẽ thất bại"},
			{En: "Outer connection — hold, supporting worthy leader succeeds", Vi: "Kết nối bên ngoài, ủng hộ lãnh đạo xứng đáng thành công"},
			{En: "Manifest union — hold, open alliance is fortunate", Vi: "Liên minh công khai, liên kết rõ ràng là may mắn"},
			{En: "No head for union — retreat, lacking proper leadership", Vi: "Không có đầu cho liên minh, thiếu lãnh đạo đúng đắn"},
		})

	// 9. Tiểu Súc - Small Accumulation
	refs[8] = build(9,
		localized{En: "Small gains through gentle restraint", Vi: "Thu hoạch nhỏ qua sự kiềm chế nhẹ nhàng"},
		localized{En: "Large advance is temporarily blocked. Focus on small steady gains — clouds are gathering but rain has not come yet. Wait for better conditions.", Vi: "Tiến bộ lớn đang bị cản trở tạm thời — tập trung tích lũy từng bước nhỏ thay vì cố đạt mục tiêu lớn ngay. Như mây đang tụ nhưng chưa mưa, kiên nhẫn chờ điều kiện chín muồi hơn."},
		localized{En: "Major advances blocked; focus on incremental gains. Dense clouds without rain — conditions gathering but not yet releasing. Build position patiently.", Vi: "Tiến bộ lớn bị chặn, tập trung vào lợi ích nhỏ. Mây đen chưa mưa — điều kiện đang tích tụ nhưng chưa giải phóng."},
		localized{En: "Small steady accumulation eventually enables breakthrough.", Vi: "Tích lũy nhỏ đều đặn cuối cùng sẽ cho phép đột phá."},
		localized{En: "Overreaching when only small steps are possible leads to setback.", Vi: "Vượt quá khả năng khi chỉ có thể bước nhỏ dẫn đến thất bại."},
		[]localized{
			{En: "Return to the way — hold, stay on familiar path", Vi: "Trở về con đường, giữ nguyên lối đi quen thuộc"},
			{En: "Drawn back together — hold, mutual return is fortunate", Vi: "Kéo nhau trở lại, cùng quay về là may mắn"},
			{En: "Spokes burst — caution, tension between partners", Vi: "Căm xe bung ra, căng thẳng giữa các đối tác"},
			{En: "Sincerity — retreat, blood gone, fear gone", Vi: "Thành thật, máu đã hết, sợ hãi cũng tan"},
			{En: "Sincere bond — hold, shared fortune with neighbors", Vi: "Liên kết chân thành, chia sẻ vận may với láng giềng"},
			{En: "Rain comes — retreat, moon nearly full, danger in pushing", Vi: "Mưa đến, trăng gần tròn, nguy hiểm nếu thúc ép"},
		})

	// 10. Lý - Treading
	refs[9] = build(10,
		localized{En: "Careful conduct walking on tiger's tail", Vi: "Hành xử cẩn thận như dẫm lên đuôi hổ"},
		localized{En: "Walking on dangerous ground — every step requires caution and proper conduct. Respect power boundaries to stay safe in this high-risk situation.", Vi: "Đang đi trên địa hình nguy hiểm — mọi bước đi cần hết sức thận trọng và đúng chuẩn mực. Hành xử đúng đắn và tôn trọng ranh giới quyền lực giữ bạn an toàn trong tình huống rủi ro cao."},
		localized{En: "Navigating dangerous terrain requires extreme care. Proper behavior and respect for power keep you safe. One wrong step invites disaster.", Vi: "Điều hướng địa hình nguy hiểm đòi hỏi cực kỳ cẩn thận. Hành vi đúng đắn và tôn trọng quyền lực giữ bạn an toàn."},
		localized{En: "Careful respectful conduct allows safe passage through danger.", Vi: "Hành xử cẩn thận tôn trọng cho phép đi qua nguy hiểm an toàn."},
		localized{En: "Careless or disrespectful behavior triggers powerful retaliation.", Vi: "Hành vi bất cẩn hoặc thiếu tôn trọng kích hoạt sự trả đũa mạnh mẽ."},
		[]localized{
			{En: "Simple conduct — advance carefully, no error in humble approach", Vi: "Hành xử đơn giản, tiến cẩn thận, không sai trong cách tiếp cận khiêm tốn"},
			{En: "Smooth level path — hold, solitary walker succeeds", Vi: "Con đường bằng phẳng, người đi một mình thành công"},
			{En: "One-eyed sees, lame walks — caution, tiger bites despite bravado", Vi: "Mắt một nhìn, chân khập khiễng đi, hổ cắn dù bạo dạn"},
			{En: "Treading tiger's tail — caution, utmost care required", Vi: "Dẫm lên đuôi hổ, cần cẩn thận tối đa"},
			{En: "Resolute treading — retreat, persistence brings danger", Vi: "Bước đi kiên quyết, kiên trì mang lại nguy hiểm"},
			{En: "Look at your treading — hold, examine conduct for good omen", Vi: "Nhìn lại bước đi của mình, xem xét hành vi để có điềm tốt"},
		})

	// 11. Thái - Peace
	refs[10] = build(11,
		localized{En: "Prosperity and harmony in all things", Vi: "Thịnh vượng và hài hòa trong mọi thứ"},
		localized{En: "Most favorable period — all conditions support action. Expand boldly and ride the growth momentum, but remember that peak prosperity eventually turns.", Vi: "Giai đoạn thuận lợi nhất — trời đất đồng thuận, mọi điều kiện hỗ trợ hành động. Hãy mạnh dạn mở rộng và tận dụng đà tăng trưởng này, nhưng nhớ rằng cực thịnh sẽ có lúc chuyển sang suy."},
		localized{En: "Heaven and earth in harmony; excellent conditions for expansion. Strong growth momentum. Act decisively while conditions favor advancement.", Vi: "Trời đất hài hòa, điều kiện tuyệt vời để mở rộng. Đà tăng trưởng mạnh. Hành động quyết đoán khi điều kiện thuận lợi."},
		localized{En: "All endeavors prosper; this is the time for confident action.", Vi: "Mọi nỗ lực đều thịnh vượng, đây là thời điểm hành động tự tin."},
		localized{En: "Prosperity at peak begins declining — prepare for eventual reversal.", Vi: "Thịnh vượng ở đỉnh cao bắt đầu suy giảm — chuẩn bị cho sự đảo ngược."},
		[]localized{
			{En: "Pull out root grass — advance, expansion with allies", Vi: "Nhổ cỏ tận gốc, mở rộng cùng đồng minh"},
			{En: "Embrace the uncultivated — hold, broad tolerance succeeds", Vi: "Ôm lấy vùng hoang, bao dung rộng rãi thành công"},
			{En: "No plain without slope — hold, constancy in change", Vi: "Không có đồng bằng nào không dốc, kiên định trong thay đổi"},
			{En: "Fluttering down — hold, neighbors join sincerely", Vi: "Bay xuống, láng giềng tham gia chân thành"},
			{En: "Marriage brings blessing — hold, supreme fortune", Vi: "Hôn nhân mang lại phúc lành, vận may tột đỉnh"},
			{En: "Wall falls into moat — retreat, peace ends, brace for change", Vi: "Tường đổ vào hào, hòa bình kết thúc, chuẩn bị cho thay đổi"},
		})

	// 12. Bĩ - Standstill
	refs[11] = build(12,
		localized{En: "Stagnation and obstruction blocking progress", Vi: "Trì trệ và cản trở chặn đứng tiến bộ"},
		localized{En: "Period of blockage — efforts meet resistance and communication is obstructed. This is not the time to expand; preserve resources and wait for the cycle to turn.", Vi: "Giai đoạn bế tắc — nỗ lực gặp kháng cự từ mọi phía và giao tiếp bị cản. Đây không phải lúc để mở rộng hay ra quyết định lớn — hãy rút lui, bảo tồn nguồn lực và chờ chu kỳ chuyển hướng."},
		localized{En: "Communication blocked; efforts meet resistance. Retreat and preserve resources. This is not the time for expansion or new ventures.", Vi: "Giao tiếp bị chặn, nỗ lực gặp kháng cự. Rút lui và bảo tồn nguồn lực. Không phải lúc để mở rộng."},
		localized{En: "Withdrawing and cultivating inner strength during stagnation.", Vi: "Rút lui và tu dưỡng sức mạnh nội tâm trong thời kỳ trì trệ."},
		localized{En: "Forcing action during blockage wastes resources and invites harm.", Vi: "Ép buộc hành động khi bị chặn lãng phí nguồn lực và mời gọi tổn hại."},
		[]localized{
			{En: "Pull grass, roots entangled — hold, withdraw with allies", Vi: "Nhổ cỏ, rễ vướng, rút lui cùng đồng minh"},
			{En: "Embrace and endure — hold, small people flourish briefly", Vi: "Ôm lấy và chịu đựng, kẻ tiểu nhân thịnh vượng ngắn ngủi"},
			{En: "Bearing shame — caution, wrongful actions bring regret", Vi: "Chịu đựng sỉ nhục, hành động sai mang lại hối tiếc"},
			{En: "When called, act — hold, blameless service to higher purpose", Vi: "Khi được gọi, hành động, phục vụ mục đích cao hơn không lỗi"},
			{En: "Standstill ceases — hold, great person succeeds now", Vi: "Trì trệ chấm dứt, người lớn thành công ngay bây giờ"},
			{En: "Overthrow standstill — retreat, first obstruction then joy", Vi: "Lật đổ trì trệ, trước cản trở sau niềm vui"},
		})

	// 13. Đồng Nhân - Fellowship
	refs[12] = build(13,
		localized{En: "Fellowship and common purpose uniting people", Vi: "Tình bằng hữu và mục đích chung đoàn kết mọi người"},
		localized{En: "Success comes from open cooperation toward shared goals. Secret factions or narrow favoritism fail — build broad alliances around common interests.", Vi: "Thành công đến từ việc hợp tác vì mục tiêu chung, minh bạch và công khai. Lập nhóm bí mật hoặc thiên vị cục bộ sẽ thất bại — hãy xây dựng liên minh rộng rãi dựa trên lợi ích chia sẻ."},
		localized{En: "Success through alignment with shared goals. Open gathering in public space succeeds; secretive factions fail. Build coalitions around common interest.", Vi: "Thành công qua việc hợp nhất với mục tiêu chung. Tụ họp công khai thành công, phe phái bí mật thất bại."},
		localized{En: "Transparent fellowship around shared purpose brings collective success.", Vi: "Tình bằng hữu minh bạch quanh mục đích chung mang lại thành công tập thể."},
		localized{En: "Private scheming and exclusive cliques undermine unity.", Vi: "Âm mưu riêng và bè phái độc quyền phá hoại sự đoàn kết."},
		[]localized{
			{En: "Fellowship at gate — hold, no blame in open beginning", Vi: "Tình bạn ở cổng, không lỗi trong khởi đầu công khai"},
			{En: "Fellowship within clan — retreat, faction leads nowhere good", Vi: "Tình bạn trong gia tộc, phe phái không dẫn đến đâu tốt"},
			{En: "Hiding weapons — caution, suspicion prevents harmony", Vi: "Giấu vũ khí, nghi ngờ ngăn cản hài hòa"},
			{En: "Mounting wall, cannot attack — hold, return to peace", Vi: "Leo lên tường, không thể tấn công, trở về hòa bình"},
			{En: "Fellowship first weeps then laughs — hold, eventual meeting", Vi: "Tình bạn trước khóc sau cười, cuối cùng gặp gỡ"},
			{En: "Fellowship in meadow — hold, no regret in open alliance", Vi: "Tình bạn ở đồng cỏ, không hối tiếc trong liên minh công khai"},
		})

	// 14. Đại Hữu - Great Possession
	refs[13] = build(14,
		localized{En: "Great abundance and supreme success", Vi: "Dồi dào lớn lao và thành công tột đỉnh"},
		localized{En: "Peak abundance — resources are plentiful and fortune favors bold action. Deploy fully but maintain humility and responsibility to sustain the achievement.", Vi: "Thời kỳ thịnh vượng đỉnh cao — nguồn lực dồi dào, vận may ủng hộ hành động táo bạo. Hãy triển khai toàn lực nhưng giữ thái độ khiêm tốn và trách nhiệm để duy trì thành quả lâu dài."},
		localized{En: "Peak prosperity with abundant resources. Supreme good fortune favors bold expansion. Maintain humility despite great success to sustain the blessing.", Vi: "Thịnh vượng đỉnh cao với nguồn lực dồi dào. Vận may tột đỉnh ủng hộ mở rộng táo bạo. Giữ khiêm tốn dù thành công lớn."},
		localized{En: "Heaven favors all endeavors; act boldly while fortune shines.", Vi: "Trời ủng hộ mọi nỗ lực, hành động táo bạo khi vận may chiếu sáng."},
		localized{En: "Arrogance during prosperity accelerates inevitable decline.", Vi: "Kiêu ngạo trong thịnh vượng đẩy nhanh suy thoái không thể tránh."},
		[]localized{
			{En: "No interaction with harm — hold, avoid harmful entanglements", Vi: "Không tương tác với hại, tránh vướng víu có hại"},
			{En: "Big wagon for loading — hold, capacity for great undertaking", Vi: "Xe lớn để chất hàng, năng lực cho việc lớn"},
			{En: "Prince offers to Son of Heaven — hold, small people cannot", Vi: "Hoàng tử dâng lên Thiên tử, kẻ tiểu nhân không thể"},
			{En: "No arrogance — caution, distinguish yourself from excess", Vi: "Không kiêu ngạo, phân biệt bản thân với sự dư thừa"},
			{En: "Mutual sincerity — advance, dignified and awe-inspiring", Vi: "Thành thật lẫn nhau, trang nghiêm và đáng kính"},
			{En: "Heaven blesses — advance, supreme good fortune", Vi: "Trời ban phúc, vận may tột đỉnh"},
		})

	// 15. Khiêm - Modesty
	refs[14] = build(15,
		localized{En: "Modesty and humility bringing completion", Vi: "Khiêm tốn và nhún nhường mang lại hoàn thành"},
		localized{En: "Modest approach wins where arrogance fails. Reduce excess and fill deficiency — self-adjustment and humility lead to lasting completion.", Vi: "Cách tiếp cận khiêm tốn thắng ở nơi kiêu ngạo thất bại. Giảm bớt chỗ dư thừa và bổ sung chỗ thiếu hụt — thái độ nhún nhường và tự điều chỉnh đúng lúc giúp hoàn thành mục tiêu bền vững."},
		localized{En: "Humble approach succeeds where arrogance fails. Mountains lowered into earth — reduce excess, fill deficiency. Modest conduct wins respect.", Vi: "Cách tiếp cận khiêm tốn thành công nơi kiêu ngạo thất bại. Núi hạ xuống đất — giảm dư thừa, bổ sung thiếu hụt."},
		localized{En: "Modesty brings success in all endeavors and earns lasting respect.", Vi: "Khiêm tốn mang lại thành công trong mọi nỗ lực và giành được sự tôn trọng lâu dài."},
		localized{En: "Even hidden excessive pride eventually surfaces and causes downfall.", Vi: "Ngay cả kiêu ngạo quá mức ẩn giấu cuối cùng cũng lộ ra và gây sụp đổ."},
		[]localized{
			{En: "Humble in humility — hold, cross great waters with modesty", Vi: "Khiêm tốn trong khiêm nhường, vượt sông lớn với sự khiêm tốn"},
			{En: "Resonant modesty — hold, righteous heart brings luck", Vi: "Khiêm tốn vang vọng, trái tim chính đạo mang lại may mắn"},
			{En: "Meritorious modesty — hold, carry through to completion", Vi: "Khiêm tốn có công, hoàn thành đến cùng"},
			{En: "Nothing unfavorable — hold, displaying modesty appropriately", Vi: "Không gì bất lợi, thể hiện khiêm tốn đúng mức"},
			{En: "No wealth from neighbors — hold, attack justified and successful", Vi: "Không giàu từ láng giềng, tấn công chính đáng và thành công"},
			{En: "Resonant modesty — hold, set armies in motion properly", Vi: "Khiêm tốn vang vọng, điều động quân đội đúng cách"},
		})

	// 16. Dự - Enthusiasm
	refs[15] = build(16,
		localized{En: "Enthusiasm and joyful readiness for action", Vi: "Nhiệt huyết và sẵn sàng vui vẻ cho hành động"},
		localized{En: "Enthusiasm and energy are building for major movement. Mobilize the team and coordinate action — but assign roles correctly so energy does not become waste.", Vi: "Năng lượng và sự hào hứng đang tích tụ cho hành động lớn. Đây là lúc huy động đội nhóm, đặt kế hoạch và điều phối — nhưng cần đặt đúng người vào đúng vị trí để nhiệt huyết không biến thành lãng phí."},
		localized{En: "Energy builds for major movement. Establish helpers and set armies in motion. The time favors coordinated enthusiastic action.", Vi: "Năng lượng tích tụ cho chuyển động lớn. Thiết lập người giúp đỡ và điều động quân đội. Thời điểm thuận lợi cho hành động nhiệt huyết."},
		localized{En: "Channeling enthusiasm into organized action brings powerful results.", Vi: "Hướng nhiệt huyết vào hành động có tổ chức mang lại kết quả mạnh mẽ."},
		localized{En: "Empty enthusiasm without proper preparation leads to disappointment.", Vi: "Nhiệt huyết rỗng tuếch không chuẩn bị đúng cách dẫn đến thất vọng."},
		[]localized{
			{En: "Proclaiming enthusiasm — retreat, boastful display invites failure", Vi: "Tuyên bố nhiệt huyết, khoe khoang mời gọi thất bại"},
			{En: "Firm as rock — hold, recognize reality, act within day", Vi: "Vững như đá, nhận ra thực tế, hành động trong ngày"},
			{En: "Looking up for enthusiasm — caution, regret if belated", Vi: "Ngước lên tìm nhiệt huyết, hối tiếc nếu chậm trễ"},
			{En: "Source of enthusiasm — hold, gather allies, great achievement", Vi: "Nguồn nhiệt huyết, tập hợp đồng minh, thành tựu lớn"},
			{En: "Persistently ill — caution, but never dying, hold on", Vi: "Bệnh dai dẳng, nhưng không chết, kiên trì"},
			{En: "Deluded enthusiasm — retreat, change direction if awakened", Vi: "Nhiệt huyết lầm lạc, đổi hướng nếu tỉnh ngộ"},
		})

	// 17. Tuỳ - Following
	refs[16] = build(17,
		localized{En: "Following and adapting to circumstances", Vi: "Theo dõi và thích ứng với hoàn cảnh"},
		localized{En: "Adapt flexibly to prevailing trends rather than forcing new ones. Follow worthy leaders — responsiveness and flexibility outperform rigidity here.", Vi: "Thích ứng linh hoạt với xu hướng hiện tại thay vì cố tạo xu hướng mới. Theo sát diễn biến, đi theo người dẫn đầu xứng đáng — sự linh hoạt và đáp ứng nhanh mang lại thành công tốt hơn cứng nhắc."},
		localized{En: "Adapt to prevailing trends rather than fighting them. Success through flexibility and responsiveness. Follow worthy leaders; lead when appropriate.", Vi: "Thích ứng với xu hướng thịnh hành thay vì chống lại. Thành công qua sự linh hoạt và đáp ứng."},
		localized{En: "Adaptive following of worthy trends brings benefit without blame.", Vi: "Theo dõi thích ứng các xu hướng xứng đáng mang lại lợi ích không lỗi."},
		localized{En: "Blind following without discernment leads to poor outcomes.", Vi: "Theo dõi mù quáng không phân biệt dẫn đến kết quả kém."},
		[]localized{
			{En: "Change in leadership — hold, go out, meet success", Vi: "Thay đổi lãnh đạo, ra ngoài, gặp thành công"},
			{En: "Cling to small boy — caution, lose the mature man", Vi: "Bám vào trẻ nhỏ, mất người trưởng thành"},
			{En: "Cling to mature man — hold, lose small boy, find what sought", Vi: "Bám vào người trưởng thành, mất trẻ nhỏ, tìm được điều tìm kiếm"},
			{En: "Following has capture — retreat, sincerity keeps path clear", Vi: "Theo dõi có bắt được, thành thật giữ đường rõ ràng"},
			{En: "Sincere in excellence — hold, fortunate alignment", Vi: "Thành thật trong xuất sắc, sắp xếp may mắn"},
			{En: "Bound and tied — retreat, western mountain sacrifice needed", Vi: "Bị trói buộc, cần hiến tế núi phía tây"},
		})

	// 18. Cổ - Work on the Decayed
	refs[17] = build(18,
		localized{En: "Correcting decay and past mistakes", Vi: "Sửa chữa sự mục nát và lỗi lầm quá khứ"},
		localized{En: "Time to identify and fix inherited or neglected problems. Careful preparation before the turning point and close follow-through after will restore lost position.", Vi: "Đây là thời điểm nhận diện và sửa chữa những vấn đề tồn đọng từ trước. Cần chuẩn bị cẩn thận trước điểm xoay chiều, theo dõi sát sau đó — điều chỉnh kịp thời sẽ phục hồi lại vị thế đã mất."},
		localized{En: "Time to fix inherited problems or neglected positions. Three days before and after the turning point — careful preparation and follow-through needed.", Vi: "Thời điểm sửa chữa vấn đề kế thừa hoặc vị trí bị bỏ quên. Ba ngày trước và sau điểm chuyển đổi — cần chuẩn bị cẩn thận."},
		localized{En: "Determined correction of past errors creates fresh opportunity.", Vi: "Sửa chữa quyết tâm các lỗi lầm quá khứ tạo ra cơ hội mới."},
		localized{En: "Leaving corruption unaddressed spreads the damage further.", Vi: "Để tham nhũng không được giải quyết lan rộng thiệt hại hơn nữa."},
		[]localized{
			{En: "Father's decay — caution, son repairs, danger then success", Vi: "Sự mục nát của cha, con sửa chữa, nguy hiểm rồi thành công"},
			{En: "Mother's decay — hold, gentle persistence required", Vi: "Sự mục nát của mẹ, cần kiên trì nhẹ nhàng"},
			{En: "Father's decay, small regret — caution, no great blame", Vi: "Sự mục nát của cha, hối tiếc nhỏ, không lỗi lớn"},
			{En: "Tolerating father's decay — caution, going brings humiliation", Vi: "Chịu đựng sự mục nát của cha, đi sẽ mang lại nhục nhã"},
			{En: "Father's decay, praised — hold, recognition for correction", Vi: "Sự mục nát của cha, được khen, công nhận cho sự sửa chữa"},
			{En: "Not serving kings — hold, set sights higher than politics", Vi: "Không phục vụ vua, đặt tầm nhìn cao hơn chính trị"},
		})

	// 19. Lâm - Approach
	refs[18] = build(19,
		localized{En: "Approaching growth with favorable momentum", Vi: "Tiếp cận tăng trưởng với đà thuận lợi"},
		localized{En: "Favorable conditions are opening — advance confidently while the momentum supports you. Note the time window is limited; act before conditions shift around the eighth month.", Vi: "Điều kiện thuận lợi đang mở ra — hãy tiến tới tự tin trong khi đà hỗ trợ. Lưu ý: cửa sổ thời gian này có giới hạn, khoảng tháng thứ tám điều kiện sẽ thay đổi, cần hành động trước khi quá muộn."},
		localized{En: "Conditions favor advance and expansion. Move forward confidently while momentum supports you. By eighth month, conditions change — time is limited.", Vi: "Điều kiện thuận lợi cho tiến bộ và mở rộng. Tiến lên tự tin trong khi đà hỗ trợ. Đến tháng tám, điều kiện thay đổi."},
		localized{En: "Decisive advance during favorable approach brings great success.", Vi: "Tiến lên quyết đoán trong thời kỳ tiếp cận thuận lợi mang lại thành công lớn."},
		localized{En: "Delaying too long misses the window of opportunity.", Vi: "Chậm trễ quá lâu bỏ lỡ cửa sổ cơ hội."},
		[]localized{
			{En: "Joint approach — advance, righteous persistence brings fortune", Vi: "Tiếp cận chung, kiên trì chính đạo mang lại may mắn"},
			{En: "Joint approach — advance, everything favorable", Vi: "Tiếp cận chung, mọi thứ thuận lợi"},
			{En: "Comfortable approach — hold, nothing unfavorable if worried", Vi: "Tiếp cận thoải mái, không gì bất lợi nếu lo lắng"},
			{En: "Complete approach — hold, no blame in total commitment", Vi: "Tiếp cận hoàn toàn, không lỗi trong cam kết toàn bộ"},
			{En: "Wise approach — hold, great prince's conduct succeeds", Vi: "Tiếp cận khôn ngoan, hành vi của hoàng tử lớn thành công"},
			{En: "Generous approach — hold, good fortune, no blame", Vi: "Tiếp cận hào phóng, vận may tốt, không lỗi"},
		})

	// 20. Quán - Contemplation
	refs[19] = build(20,
		localized{En: "Observation and contemplation from high vantage", Vi: "Quan sát và chiêm nghiệm từ vị trí cao"},
		localized{En: "Best time to observe the full picture before acting. View from a higher vantage — careful observation now reveals real opportunities that hasty action would miss.", Vi: "Thời điểm tốt nhất để quan sát toàn cảnh trước khi hành động. Nhìn từ vị trí cao hơn, đánh giá kỹ lưỡng — hành động vội vã bây giờ sẽ lãng phí, nhưng quan sát cẩn thận sẽ cho thấy cơ hội thực sự."},
		localized{En: "Time for careful observation before acting. View the situation from elevated perspective. Washing hands before offering — prepare properly for engagement.", Vi: "Thời điểm quan sát cẩn thận trước khi hành động. Nhìn tình hình từ góc nhìn cao. Rửa tay trước khi dâng lễ — chuẩn bị đúng cách."},
		localized{En: "Clear observation enables wise decisions when action time comes.", Vi: "Quan sát rõ ràng cho phép quyết định khôn ngoan khi đến lúc hành động."},
		localized{En: "Acting without proper understanding of the situation leads to error.", Vi: "Hành động không hiểu đúng tình hình dẫn đến sai lầm."},
		[]localized{
			{En: "Childlike viewing — caution, forgivable for small people", Vi: "Nhìn như trẻ con, có thể tha thứ cho kẻ tiểu nhân"},
			{En: "Peeping through door — caution, only women's persistence proper", Vi: "Nhìn trộm qua cửa, chỉ phù hợp với sự kiên trì của phụ nữ"},
			{En: "Viewing own life — hold, choose advance or retreat", Vi: "Nhìn cuộc sống của mình, chọn tiến hoặc lùi"},
			{En: "Viewing kingdom's glory — hold, worth being kingdom's guest", Vi: "Nhìn vinh quang vương quốc, xứng đáng làm khách của vương quốc"},
			{En: "Viewing own life — hold, noble person without blame", Vi: "Nhìn cuộc sống của mình, người quân tử không lỗi"},
			{En: "Viewing their life — hold, noble person without blame", Vi: "Nhìn cuộc sống của họ, người quân tử không lỗi"},
		})

	// 21. Phệ Hạp - Biting Through
	refs[20] = build(21,
		localized{En: "Decisive action biting through obstruction", Vi: "Hành động quyết đoán cắn xuyên qua chướng ngại"},
		localized{En: "An obstacle must be removed decisively — address the problem head-on, do not avoid it. Forceful and righteous action clears the path forward.", Vi: "Có chướng ngại cần được loại bỏ dứt khoát — giải quyết vấn đề thẳng thắn, không né tránh. Như cắn xuyên qua vật cứng để hàm khép lại, cần dùng sức mạnh quyết đoán để thông đường tiến."},
		localized{En: "Obstacle must be removed decisively. Like biting through meat to unite jaws — forceful correction needed. Legal or disciplinary matters favor resolution.", Vi: "Chướng ngại phải được loại bỏ quyết đoán. Như cắn xuyên thịt để hàm hợp lại — cần sửa chữa mạnh mẽ."},
		localized{En: "Determined decisive action clears obstacles and restores order.", Vi: "Hành động quyết đoán quyết tâm dọn sạch chướng ngại và khôi phục trật tự."},
		localized{En: "Half-measures leave obstruction in place, prolonging problems.", Vi: "Biện pháp nửa vời để chướng ngại tại chỗ, kéo dài vấn đề."},
		[]localized{
			{En: "Feet in stocks — caution, minor restraint prevents error", Vi: "Chân trong gông, hạn chế nhỏ ngăn ngừa sai lầm"},
			{En: "Biting skin — hold, destroying nose in process, no blame", Vi: "Cắn da, phá mũi trong quá trình, không lỗi"},
			{En: "Biting dried meat — caution, encounters poison, small regret", Vi: "Cắn thịt khô, gặp độc, hối tiếc nhỏ"},
			{En: "Biting dried bony meat — hold, arrows of metal, persistence pays", Vi: "Cắn thịt khô có xương, mũi tên kim loại, kiên trì được đền đáp"},
			{En: "Biting dried meat — caution, finds gold, danger but no error", Vi: "Cắn thịt khô, tìm thấy vàng, nguy hiểm nhưng không lỗi"},
			{En: "Neck in stocks — retreat, ears disappear, deaf to warnings", Vi: "Cổ trong gông, tai biến mất, điếc với cảnh báo"},
		})

	// 22. Bí - Grace
	refs[21] = build(22,
		localized{En: "Grace and adornment enhancing substance", Vi: "Vẻ đẹp và trang trí tăng cường bản chất"},
		localized{En: "Attention to form and presentation can support outcomes. But substance must drive major decisions — appearance enhances but cannot replace substance.", Vi: "Chú ý đến hình thức, cách trình bày và vẻ bề ngoài có thể hỗ trợ kết quả. Nhưng hình thức chỉ bổ sung cho nội dung — những quyết định lớn, thực chất vẫn cần dựa vào bản chất chứ không chỉ vẻ đẹp bề mặt."},
		localized{En: "Attention to form and presentation. Appearance matters but must complement substance. Small endeavors favored; major undertakings need more than polish.", Vi: "Chú ý đến hình thức và trình bày. Vẻ bề ngoài quan trọng nhưng phải bổ sung cho bản chất."},
		localized{En: "Tasteful refinement of strong fundamentals creates appeal.", Vi: "Tinh chế có gu từ nền tảng vững chắc tạo ra sức hấp dẫn."},
		localized{En: "Superficial decoration hiding weak substance eventually fails.", Vi: "Trang trí bề ngoài che giấu bản chất yếu cuối cùng thất bại."},
		[]localized{
			{En: "Adorning feet — hold, leave carriage and walk humbly", Vi: "Trang trí chân, rời xe và đi bộ khiêm tốn"},
			{En: "Adorning beard — hold, style follows substance", Vi: "Trang trí râu, phong cách theo bản chất"},
			{En: "Graceful and moist — hold, perpetual persistence fortunate", Vi: "Duyên dáng và ẩm ướt, kiên trì mãi mãi may mắn"},
			{En: "Graceful and white — hold, white horse arrives, not robber", Vi: "Duyên dáng và trắng, ngựa trắng đến, không phải kẻ cướp"},
			{En: "Grace in gardens — hold, silk roll small, eventual fortune", Vi: "Duyên dáng trong vườn, cuộn lụa nhỏ, cuối cùng may mắn"},
			{En: "Simple grace — hold, no blame in unadorned sincerity", Vi: "Duyên dáng đơn giản, không lỗi trong sự chân thành không trang trí"},
		})

	// 23. Bác - Splitting Apart
	refs[22] = build(23,
		localized{En: "Splitting apart and erosion of position", Vi: "Tách rời và xói mòn vị thế"},
		localized{En: "Foundation is eroding — this is not the time for bold moves or expansion. Retreat and preserve what remains; pushing forward now accelerates losses.", Vi: "Nền tảng đang xói mòn, không phải lúc để hành động mạnh hay mở rộng. Hãy rút lui và bảo tồn những gì đang có — cố tiến lên lúc này sẽ đẩy nhanh tổn thất. Chờ chu kỳ chạm đáy rồi đảo chiều."},
		localized{En: "Foundation crumbling; retreat and preserve what remains. Acting now accelerates losses. Wait for the cycle to turn before rebuilding.", Vi: "Nền tảng đang sụp đổ, rút lui và bảo tồn những gì còn lại. Hành động bây giờ đẩy nhanh tổn thất."},
		localized{En: "Retreat and preservation during dissolution protects core assets.", Vi: "Rút lui và bảo tồn trong thời kỳ tan rã bảo vệ tài sản cốt lõi."},
		localized{En: "Attempting to advance while splitting apart magnifies losses.", Vi: "Cố gắng tiến lên khi đang tan rã phóng đại tổn thất."},
		[]localized{
			{En: "Legs of bed split — retreat, destroying persistence, misfortune", Vi: "Chân giường tách ra, phá hủy sự kiên trì, xui xẻo"},
			{En: "Bed frame splits — retreat, destroying persistence, misfortune", Vi: "Khung giường tách ra, phá hủy sự kiên trì, xui xẻo"},
			{En: "Splitting from them — hold, no blame in separation", Vi: "Tách ra khỏi họ, không lỗi trong sự chia ly"},
			{En: "Bed split to skin — retreat, close to disaster", Vi: "Giường tách đến da, gần với thảm họa"},
			{En: "String of fish — hold, palace women's favor, everything benefits", Vi: "Chuỗi cá, được phụ nữ cung điện ưu ái, mọi thứ có lợi"},
			{En: "Large fruit uneaten — hold, noble rides, small hut destroyed", Vi: "Quả lớn không ăn, người quý tộc cưỡi, lều nhỏ bị phá"},
		})

	// 24. Phục - Return
	refs[23] = build(24,
		localized{En: "Return and renewal after reaching bottom", Vi: "Trở về và đổi mới sau khi chạm đáy"},
		localized{En: "Bottom has been reached and the cycle is reversing — light returns after darkness. Restart with sound principles and ride the new momentum without rushing.", Vi: "Đã chạm đáy và bắt đầu đảo chiều — ánh sáng quay trở lại sau giai đoạn tối. Hãy bắt đầu lại với nguyên tắc đúng đắn và tận dụng đà mới, không cần vội vàng nhưng đừng bỏ lỡ điểm khởi đầu này."},
		localized{En: "Turning point reached; light returns after darkness. Seven days cycle completes. Fresh beginning possible — act on new momentum with original principles.", Vi: "Điểm chuyển đổi đã đạt, ánh sáng trở lại sau bóng tối. Chu kỳ bảy ngày hoàn thành. Khởi đầu mới có thể."},
		localized{En: "Return to fundamental principles enables fresh productive cycle.", Vi: "Trở về nguyên tắc cơ bản cho phép chu kỳ sản xuất mới."},
		localized{En: "Missing the return opportunity extends the dark period unnecessarily.", Vi: "Bỏ lỡ cơ hội trở về kéo dài thời kỳ tối tăm không cần thiết."},
		[]localized{
			{En: "Return from short distance — advance, no deep regret", Vi: "Trở về từ khoảng cách ngắn, không hối tiếc sâu"},
			{En: "Restful return — hold, fortunate through benevolence", Vi: "Trở về yên nghỉ, may mắn qua lòng nhân từ"},
			{En: "Repeated returns — caution, dangerous but no blame", Vi: "Trở về lặp lại, nguy hiểm nhưng không lỗi"},
			{En: "Walking among others — hold, return alone on the path", Vi: "Đi giữa người khác, trở về một mình trên đường"},
			{En: "Generous return — hold, no regret in self-examination", Vi: "Trở về hào phóng, không hối tiếc trong tự xét mình"},
			{En: "Straying return — retreat, disaster for armies and country", Vi: "Trở về lạc lối, thảm họa cho quân đội và đất nước"},
		})

	// 25. Vô Vọng - Innocence
	refs[24] = build(25,
		localized{En: "Innocence and unexpected happenings", Vi: "Ngây thơ và những sự việc bất ngờ"},
		localized{En: "Best action is sincere and uncalculated. Unexpected events are at play — respond naturally with integrity rather than scheming. Manipulation will backfire.", Vi: "Hành động tốt nhất là hành động chân thành, không tính toán. Những sự kiện bất ngờ đang diễn ra — hãy giữ thái độ ngay thẳng, phản ứng tự nhiên thay vì mưu tính. Mánh khóe sẽ phản tác dụng."},
		localized{En: "Act with sincerity without ulterior motives. Unexpected events test your integrity. Natural spontaneous response succeeds; calculated manipulation fails.", Vi: "Hành động với sự chân thành không có động cơ ẩn. Sự kiện bất ngờ thử thách sự chính trực của bạn."},
		localized{En: "Sincere innocent action in harmony with nature brings good fortune.", Vi: "Hành động ngây thơ chân thành hài hòa với tự nhiên mang lại may mắn."},
		localized{En: "Hidden agendas and forced expectations invite unforeseen disasters.", Vi: "Chương trình nghị sự ẩn và kỳ vọng ép buộc mời gọi thảm họa không lường trước."},
		[]localized{
			{En: "Innocent going — hold, fortunate through sincerity", Vi: "Đi ngây thơ, may mắn qua sự chân thành"},
			{En: "Not counting harvest — hold, then plowing brings gain", Vi: "Không đếm thu hoạch, rồi cày mang lại lợi ích"},
			{En: "Innocent disaster — retreat, tethered ox, passerby's gain", Vi: "Thảm họa ngây thơ, bò buộc, người qua đường được lợi"},
			{En: "Can be persisted — hold, no blame in steadfastness", Vi: "Có thể kiên trì, không lỗi trong sự kiên định"},
			{En: "Innocent sickness — hold, no medicine, natural recovery", Vi: "Bệnh ngây thơ, không thuốc, hồi phục tự nhiên"},
			{En: "Innocent going — retreat, has disaster, nothing favorable", Vi: "Đi ngây thơ, có thảm họa, không gì thuận lợi"},
		})

	// 26. Đại Súc - Great Accumulation
	refs[25] = build(26,
		localized{En: "Great accumulation of power and resources", Vi: "Tích lũy lớn quyền lực và nguồn lực"},
		localized{En: "Substantial resources have been gathered — deploy them wisely toward a worthy purpose. Hoarding brings stagnation; channel this strength outward to sustain and grow it.", Vi: "Nguồn lực lớn đã được tích lũy — đây là lúc triển khai khôn ngoan cho mục tiêu có ý nghĩa. Đừng giữ khư khư, hãy mang sức mạnh này ra phục vụ mục đích lớn hơn để tiếp tục bồi đắp năng lực."},
		localized{En: "Substantial resources gathered; now deploy wisely. Not eating at home — go out and serve larger purpose. Daily renewal of virtue sustains strength.", Vi: "Nguồn lực đáng kể đã được thu thập, bây giờ triển khai khôn ngoan. Không ăn ở nhà — ra ngoài phục vụ mục đích lớn hơn."},
		localized{En: "Accumulated power deployed for worthy purpose brings great achievement.", Vi: "Quyền lực tích lũy được triển khai cho mục đích xứng đáng mang lại thành tựu lớn."},
		localized{En: "Hoarding resources without productive use leads to stagnation.", Vi: "Tích trữ nguồn lực không sử dụng hiệu quả dẫn đến trì trệ."},
		[]localized{
			{En: "Danger present — caution, stop and avoid harm", Vi: "Nguy hiểm hiện diện, dừng lại và tránh tổn hại"},
			{En: "Axle straps removed — caution, vehicle cannot proceed", Vi: "Dây trục bị tháo, xe không thể tiến"},
			{En: "Good horse pursuit — advance, daily practice, persistence pays", Vi: "Theo đuổi ngựa tốt, luyện tập hàng ngày, kiên trì được đền đáp"},
			{En: "Young bull's headboard — hold, supreme good fortune", Vi: "Ván đầu bò non, vận may tột đỉnh"},
			{En: "Gelded boar's tusk — advance, fortunate through restraint", Vi: "Ngà heo thiến, may mắn qua kiềm chế"},
			{En: "Carrying heaven's way — advance, success and penetration", Vi: "Mang theo đạo trời, thành công và thâm nhập"},
		})

	// 27. Di - Nourishment
	refs[26] = build(27,
		localized{En: "Nourishment and proper sustenance", Vi: "Nuôi dưỡng và sinh kế đúng đắn"},
		localized{En: "Examine what you are nourishing and what nourishes you. Quality of inputs determines outputs — carefully select your information sources, resources, and people.", Vi: "Xem xét những gì bạn đang nuôi dưỡng và chất lượng của những gì nuôi dưỡng bạn. Chất lượng đầu vào quyết định chất lượng đầu ra — chọn lọc cẩn thận thông tin, nguồn lực và con người xung quanh."},
		localized{En: "Examine what you nourish and how you are nourished. Quality of inputs determines quality of outputs. Careful cultivation of resources required.", Vi: "Xem xét bạn nuôi dưỡng gì và bạn được nuôi dưỡng như thế nào. Chất lượng đầu vào quyết định chất lượng đầu ra."},
		localized{En: "Proper nourishment of body, mind, and position sustains strength.", Vi: "Nuôi dưỡng đúng đắn cơ thể, tâm trí và vị thế duy trì sức mạnh."},
		localized{En: "Poor nourishment choices weaken position and invite trouble.", Vi: "Lựa chọn nuôi dưỡng kém làm yếu vị thế và mời gọi rắc rối."},
		[]localized{
			{En: "Setting aside divine turtle — retreat, watching others eat, misfortune", Vi: "Bỏ qua rùa thần, xem người khác ăn, xui xẻo"},
			{En: "Nourished from above — retreat, deviation leads to expedition disaster", Vi: "Được nuôi dưỡng từ trên, lệch lạc dẫn đến thảm họa viễn chinh"},
			{En: "Turning away from nourishment — retreat, ten years fruitless", Vi: "Quay lưng với nuôi dưỡng, mười năm không kết quả"},
			{En: "Looking down for nourishment — retreat, tiger staring, no blame", Vi: "Nhìn xuống tìm nuôi dưỡng, hổ nhìn chằm chằm, không lỗi"},
			{En: "Deviating from principle — hold, staying home fortunate", Vi: "Lệch khỏi nguyên tắc, ở nhà may mắn"},
			{En: "Source of nourishment — caution, danger, crossing water fortunate", Vi: "Nguồn nuôi dưỡng, nguy hiểm, vượt sông may mắn"},
		})

	// 28. Đại Quá - Great Exceeding
	refs[27] = build(28,
		localized{En: "Extraordinary burden exceeding normal capacity", Vi: "Gánh nặng phi thường vượt quá năng lực bình thường"},
		localized{En: "Situation exceeds normal capacity — the ridgepole is about to buckle. Extraordinary measures are needed: act boldly and decisively, or retreat completely. Half-measures fail.", Vi: "Tình huống đang vượt quá sức chịu đựng bình thường — đòn nóc sắp gãy dưới sức nặng. Cần biện pháp phi thường: hoặc hành động dứt khoát và táo bạo, hoặc rút lui hoàn toàn — không có chỗ cho nửa vời."},
		localized{En: "Ridgepole sagging from excessive weight. Extraordinary measures needed for extraordinary situation. Act boldly or retreat completely — half-measures fail.", Vi: "Đòn nóc võng xuống từ trọng lượng quá mức. Cần biện pháp phi thường cho tình huống phi thường."},
		localized{En: "Decisive extraordinary action in exceptional circumstances succeeds.", Vi: "Hành động phi thường quyết đoán trong hoàn cảnh đặc biệt thành công."},
		localized{En: "Ignoring critical overload leads to structural collapse.", Vi: "Bỏ qua quá tải nghiêm trọng dẫn đến sụp đổ cấu trúc."},
		[]localized{
			{En: "White thatch beneath — hold, no blame in careful foundation", Vi: "Tranh trắng bên dưới, không lỗi trong nền tảng cẩn thận"},
			{En: "Dry willow sprouts — hold, old man gets young wife", Vi: "Liễu khô nảy mầm, ông già lấy vợ trẻ"},
			{En: "Ridgepole sags — retreat, misfortune from excess", Vi: "Đòn nóc võng, xui xẻo từ dư thừa"},
			{En: "Ridgepole raised — hold, other intentions bring regret", Vi: "Đòn nóc được nâng, ý định khác mang lại hối tiếc"},
			{En: "Dry willow flowers — hold, old woman gets young husband", Vi: "Liễu khô nở hoa, bà già lấy chồng trẻ"},
			{En: "Wading drowns head — retreat, misfortune but no blame", Vi: "Lội nước chìm đầu, xui xẻo nhưng không lỗi"},
		})

	// 29. Tập Khảm - The Abysmal
	refs[28] = build(29,
		localized{En: "Repeated danger and abysmal depths", Vi: "Hiểm trở chồng hiểm trở, hố sâu nối hố sâu"},
		localized{En: "Danger upon danger — pitfalls at every step. Stay calm and do not panic; flow through each challenge like water through rock. Sincerity and steadiness are your best shields.", Vi: "Nguy hiểm chồng nguy hiểm — mỗi bước đều có hố. Hãy giữ vững tâm thế, không hoảng loạn, chảy qua từng thách thức như nước chảy qua đá. Thành thật và bình tĩnh là lá chắn tốt nhất lúc này."},
		localized{En: "Danger upon danger, pit within pit. Maintain inner sincerity while navigating hazards. Flow like water — fill each pit then move on without stopping.", Vi: "Nguy hiểm chồng nguy hiểm, hố trong hố. Giữ lòng thành tín bên trong khi điều hướng nguy hiểm. Chảy như nước — đổ đầy từng hố rồi đi tiếp."},
		localized{En: "Persistence through danger with inner truth eventually finds passage.", Vi: "Kiên trì qua nguy hiểm với sự thật bên trong cuối cùng tìm thấy lối đi."},
		localized{En: "Panic or recklessness in danger worsens the situation dramatically.", Vi: "Hoảng loạn hoặc liều lĩnh trong nguy hiểm làm xấu đi tình hình nghiêm trọng."},
		[]localized{
			{En: "Repeated pit, falling into hole — retreat, lost in depths", Vi: "Hố lặp lại, rơi vào lỗ, lạc trong vực sâu"},
			{En: "Pit has danger — wait, small gains only possible", Vi: "Hố có nguy hiểm, chỉ có thể đạt được thành quả nhỏ"},
			{En: "Coming and going, pit upon pit — wait, rest before drowning", Vi: "Đến đi, hố chồng hố, nghỉ trước khi chìm"},
			{En: "Jug of wine, two bowls — hold, simple sincerity connects", Vi: "Bình rượu, hai bát, sự chân thành đơn giản kết nối"},
			{En: "Pit not overflowing — hold, almost level, no fault", Vi: "Hố chưa tràn, gần bằng, không lỗi"},
			{En: "Bound with cords — retreat, three years trapped, misfortune", Vi: "Bị trói bằng dây, ba năm bị giam, xui xẻo"},
		})

	// 30. Ly - The Clinging
	refs[29] = build(30,
		localized{En: "Clinging to brightness and clarity", Vi: "Bám víu vào ánh sáng và sự rõ ràng"},
		localized{En: "Clarity is strength — but light must cling to proper support to shine lastingly. Find the right position and fitting partners; clarity in the right place brings lasting success.", Vi: "Rõ ràng và minh bạch là sức mạnh — nhưng ánh sáng cần bám vào nơi hỗ trợ đúng đắn để tỏa sáng lâu dài. Tìm đúng vị thế và đối tác phù hợp, sự rõ ràng kết hợp đúng nơi mang lại thành công bền vững."},
		localized{En: "Fire clings to fuel — depend on proper support. Clarity illuminates but also exposes. Position in harmonious center brings lasting success.", Vi: "Lửa bám vào nhiên liệu — phụ thuộc vào hỗ trợ đúng đắn. Sự rõ ràng chiếu sáng nhưng cũng phơi bày."},
		localized{En: "Clinging to proper support and maintaining clarity brings fortune.", Vi: "Bám víu vào hỗ trợ đúng đắn và duy trì sự rõ ràng mang lại may mắn."},
		localized{En: "Clinging to wrong support or harsh illumination creates burnout.", Vi: "Bám víu vào hỗ trợ sai hoặc ánh sáng chói tạo ra kiệt sức."},
		[]localized{
			{En: "Treading confused — hold, respect avoids blame", Vi: "Bước đi bối rối, tôn trọng tránh bị đổ lỗi"},
			{En: "Yellow light — hold, supreme good fortune in center", Vi: "Ánh sáng vàng, vận may tột đỉnh ở trung tâm"},
			{En: "Light of setting sun — caution, without drum song, old age sighs", Vi: "Ánh sáng mặt trời lặn, không có bài hát trống, tuổi già thở dài"},
			{En: "Sudden arrival — retreat, burning, dying, discarded", Vi: "Đến đột ngột, cháy, chết, bị bỏ"},
			{En: "Tears flow — hold, sighing and lamenting, fortunate", Vi: "Nước mắt chảy, thở dài và than khóc, may mắn"},
			{En: "King's punitive expedition — hold, praise for breaking heads", Vi: "Cuộc viễn chinh trừng phạt của vua, khen ngợi vì đập đầu"},
		})

	// 31. Hàm - Influence
	refs[30] = build(31,
		localized{En: "Mutual influence and attraction", Vi: "Ảnh hưởng và thu hút lẫn nhau"},
		localized{En: "Mutual attraction and influence are at work — sensitivity to the counterpart's response is key. Approach properly, listen to market or partner signals, do not impose one-sidedly.", Vi: "Sự thu hút và ảnh hưởng lẫn nhau đang hoạt động — nhạy cảm với phản hồi của đối phương là chìa khóa. Tiếp cận đúng cách, lắng nghe tín hiệu từ thị trường hoặc đối tác, không áp đặt một chiều."},
		localized{En: "Lake on mountain — receptive below, firm above creates attraction. Success through proper courtship and sensitivity to mutual response.", Vi: "Hồ trên núi — tiếp nhận bên dưới, vững chắc bên trên tạo ra sức hút. Thành công qua cầu hôn đúng cách."},
		localized{En: "Genuine mutual attraction and responsiveness creates lasting bonds.", Vi: "Thu hút và đáp ứng lẫn nhau chân chính tạo ra mối quan hệ lâu dài."},
		localized{En: "One-sided pursuit without reciprocity leads to disappointment.", Vi: "Theo đuổi một chiều không có sự đáp lại dẫn đến thất vọng."},
		[]localized{
			{En: "Influence in big toe — retreat, just beginning to stir", Vi: "Ảnh hưởng ở ngón chân cái, mới bắt đầu khuấy động"},
			{En: "Influence in calves — retreat, staying is fortunate", Vi: "Ảnh hưởng ở bắp chân, ở lại là may mắn"},
			{En: "Influence in thighs — caution, following others, regret", Vi: "Ảnh hưởng ở đùi, theo người khác, hối tiếc"},
			{En: "Persistence fortunate — hold, wavering thoughts scatter", Vi: "Kiên trì may mắn, suy nghĩ dao động tan tác"},
			{En: "Influence in back — hold, no regret in firm resolve", Vi: "Ảnh hưởng ở lưng, không hối tiếc trong quyết tâm vững chắc"},
			{En: "Influence in jaws — caution, empty words accomplish nothing", Vi: "Ảnh hưởng ở hàm, lời nói rỗng không đạt được gì"},
		})

	// 32. Hằng - Duration
	refs[31] = build(32,
		localized{En: "Enduring constancy and perseverance", Vi: "Sự bền bỉ và kiên trì lâu dài"},
		localized{En: "Success comes from steadfast commitment, not emotional zigzagging. Maintain your chosen direction and build durable habits — inconsistency destroys what has been achieved.", Vi: "Thành công đến từ cam kết kiên định, không thay đổi liên tục theo cảm xúc. Hãy duy trì hướng đi đã chọn và xây dựng thói quen bền vững — sự dao động và thiếu nhất quán sẽ phá vỡ thành quả đã có."},
		localized{En: "Thunder and wind reinforce each other in lasting pattern. Success through steadfast commitment. Marriage of firm and yielding creates stability.", Vi: "Sấm và gió củng cố lẫn nhau trong mô hình lâu dài. Thành công qua cam kết vững chắc."},
		localized{En: "Persistent commitment to worthy path brings lasting success.", Vi: "Cam kết kiên trì với con đường xứng đáng mang lại thành công lâu dài."},
		localized{En: "Restlessness and constant change prevent meaningful achievement.", Vi: "Bồn chồn và thay đổi liên tục ngăn cản thành tựu có ý nghĩa."},
		[]localized{
			{En: "Deep duration seeking — retreat, persistent misfortune", Vi: "Tìm kiếm độ bền sâu, xui xẻo dai dẳng"},
			{En: "Regret disappears — caution, pull back from overreach", Vi: "Hối tiếc biến mất, rút lui khỏi vượt quá"},
			{En: "Not making virtue durable — caution, shame possible", Vi: "Không làm đức hạnh bền, có thể xấu hổ"},
			{En: "No game in field — hold, nothing to hunt for", Vi: "Không có thú trong đồng, không có gì để săn"},
			{En: "Making virtue durable — hold, wife fortune, husband misfortune", Vi: "Làm đức hạnh bền, vợ may mắn, chồng xui xẻo"},
			{En: "Restless duration — retreat, nothing favorable in flux", Vi: "Độ bền bồn chồn, không gì thuận lợi trong biến đổi"},
		})

	// 33. Độn - Retreat
	refs[32] = build(33,
		localized{En: "Strategic retreat and withdrawal", Vi: "Rút lui chiến lược và rút lui"},
		localized{En: "This is the time for strategic withdrawal, not defeat. Distance from negative forces and preserve strength for future advance — small matters continue, major actions are unsuitable now.", Vi: "Đây là thời điểm rút lui có chiến lược, không phải thất bại. Xa cách những yếu tố tiêu cực và bảo tồn sức mạnh để tiến bước sau này — việc nhỏ vẫn tiếp tục được, nhưng hành động lớn không phù hợp lúc này."},
		localized{En: "Mountain under heaven — superior person distances from inferior. Orderly retreat preserves strength. Small things may continue; major actions unsuitable.", Vi: "Núi dưới trời — người quân tử xa cách kẻ tiểu nhân. Rút lui có trật tự bảo tồn sức mạnh."},
		localized{En: "Timely strategic retreat preserves resources for future advance.", Vi: "Rút lui chiến lược kịp thời bảo tồn nguồn lực cho tiến bước tương lai."},
		localized{En: "Failing to retreat when indicated leads to entanglement and loss.", Vi: "Không rút lui khi được chỉ định dẫn đến vướng víu và mất mát."},
		[]localized{
			{En: "Retreating tail — retreat, danger, do not pursue", Vi: "Đuôi rút lui, nguy hiểm, không đuổi theo"},
			{En: "Bound with yellow ox hide — hold, cannot be loosened", Vi: "Bị trói bằng da bò vàng, không thể nới lỏng"},
			{En: "Entangled retreat — caution, exhausting and dangerous", Vi: "Rút lui vướng víu, kiệt sức và nguy hiểm"},
			{En: "Good retreat — hold, superior person fortunate", Vi: "Rút lui tốt, người quân tử may mắn"},
			{En: "Excellent retreat — hold, persistence fortunate", Vi: "Rút lui xuất sắc, kiên trì may mắn"},
			{En: "Rich retreat — hold, nothing unfavorable", Vi: "Rút lui giàu có, không gì bất lợi"},
		})

	// 34. Đại Tráng - Great Power
	refs[33] = build(34,
		localized{En: "Great power and overwhelming strength", Vi: "Quyền lực lớn và sức mạnh áp đảo"},
		localized{En: "Power and energy are at their peak — but strength without wisdom becomes a trap. Act decisively but with principle; avoid forcing where it is not appropriate.", Vi: "Sức mạnh và năng lượng đang ở đỉnh — nhưng sức mạnh không có trí tuệ dẫn đường sẽ tự bẫy mình. Hành động quyết đoán nhưng phải đúng nguyên tắc, tránh dùng lực để ép buộc chỗ không hợp lý."},
		localized{En: "Thunder in heaven — power expressed dramatically. Righteousness must guide power. Ram butting fence — power without wisdom entraps itself.", Vi: "Sấm trên trời — quyền lực thể hiện mạnh mẽ. Chính đạo phải hướng dẫn quyền lực."},
		localized{En: "Great power applied righteously achieves great accomplishments.", Vi: "Quyền lực lớn áp dụng chính đạo đạt được thành tựu lớn."},
		localized{En: "Power applied arrogantly or carelessly becomes self-destructive.", Vi: "Quyền lực áp dụng kiêu ngạo hoặc bất cẩn trở nên tự hủy."},
		[]localized{
			{En: "Power in toes — retreat, going forward invites disaster", Vi: "Quyền lực ở ngón chân, tiến về phía trước mời gọi thảm họa"},
			{En: "Persistence fortunate — hold, righteous power succeeds", Vi: "Kiên trì may mắn, quyền lực chính đạo thành công"},
			{En: "Small people use power — caution, noble person abstains", Vi: "Kẻ tiểu nhân sử dụng quyền lực, người quân tử kiêng cữ"},
			{En: "Persistence fortunate — advance, fence opens, ram freed", Vi: "Kiên trì may mắn, hàng rào mở, dê cừu được tự do"},
			{En: "Loses ram easily — hold, no regret in detachment", Vi: "Mất dê dễ dàng, không hối tiếc trong sự tách rời"},
			{En: "Ram butts fence — caution, cannot retreat or advance", Vi: "Dê húc hàng rào, không thể rút lui hay tiến"},
		})

	// 35. Tấn - Progress
	refs[34] = build(35,
		localized{En: "Progress and advancement into light", Vi: "Tiến bộ và tiến vào ánh sáng"},
		localized{En: "Stepping into light and recognition — conditions favor progress on multiple fronts. Advance actively, demonstrate capability, and seize the recognition that is coming. Do not hide during this favorable period.", Vi: "Bước vào ánh sáng và được công nhận — điều kiện ủng hộ tiến bộ trên nhiều mặt. Hãy chủ động tiến lên, thể hiện năng lực và nắm bắt sự công nhận đang đến, đừng ẩn mình trong giai đoạn thuận lợi này."},
		localized{En: "Sun rising over earth — rapid illumination and recognition. Marquis receives gifts and audiences multiply. Progress favored on multiple fronts.", Vi: "Mặt trời mọc trên đất — chiếu sáng nhanh chóng và được công nhận. Tiến bộ được ưa chuộng trên nhiều mặt trận."},
		localized{En: "Advancing into clarity brings recognition and rewards.", Vi: "Tiến vào sự rõ ràng mang lại sự công nhận và phần thưởng."},
		localized{En: "Resisting natural progress or hiding in darkness wastes opportunity.", Vi: "Chống lại tiến bộ tự nhiên hoặc ẩn trong bóng tối lãng phí cơ hội."},
		[]localized{
			{En: "Advancing, pushed back — caution, persistence fortunate", Vi: "Tiến lên, bị đẩy lùi, kiên trì may mắn"},
			{En: "Advancing, sorrowful — hold, persistence fortunate through patience", Vi: "Tiến lên, đau buồn, kiên trì may mắn qua kiên nhẫn"},
			{En: "All regret disappears — hold, trust of masses gained", Vi: "Mọi hối tiếc biến mất, được đám đông tin tưởng"},
			{En: "Advancing like a hamster — caution, dangerous persistence", Vi: "Tiến như chuột hamster, kiên trì nguy hiểm"},
			{En: "Regret disappears — hold, gain and loss irrelevant", Vi: "Hối tiếc biến mất, được mất không liên quan"},
			{En: "Advancing with horns — caution, only for subduing city", Vi: "Tiến với sừng, chỉ để khuất phục thành phố"},
		})

	// 36. Minh Di - Darkening of Light
	refs[35] = build(36,
		localized{En: "Brightness wounded and concealed", Vi: "Ánh sáng bị thương và che giấu"},
		localized{En: "Talent is being suppressed by the surrounding environment. Conceal strategically and maintain inner strength. Persevere internally while appearing ordinary to avoid being targeted; wait for better conditions.", Vi: "Tài năng đang bị môi trường xung quanh đè nén — hãy ẩn mình chiến lược và duy trì sức mạnh bên trong. Vẫn kiên trì bên trong nhưng bề ngoài bình thường để tránh bị nhắm vào, chờ thời điểm thuận lợi hơn."},
		localized{En: "Light driven underground — wisdom must hide during dark times. King Wen imprisoned by tyrant. Persevere inwardly while appearing ordinary outwardly.", Vi: "Ánh sáng bị đẩy xuống ngầm — trí tuệ phải ẩn trong thời kỳ tối tăm. Kiên trì bên trong trong khi bề ngoài bình thường."},
		localized{En: "Concealing brilliance during dark periods preserves ability to act later.", Vi: "Che giấu sự rực rỡ trong thời kỳ tối tăm bảo tồn khả năng hành động sau."},
		localized{En: "Displaying brightness in hostile environment invites suppression.", Vi: "Thể hiện sự rực rỡ trong môi trường thù địch mời gọi sự đàn áp."},
		[]localized{
			{En: "Darkening light in flight — retreat, wings droop, fasting", Vi: "Ánh sáng tối trong chuyến bay, cánh rũ xuống, nhịn ăn"},
			{En: "Darkening light, left thigh — hold, horse rescue succeeds", Vi: "Ánh sáng tối, đùi trái, cứu ngựa thành công"},
			{En: "Darkening light hunting south — hold, capture great leader", Vi: "Ánh sáng tối săn phía nam, bắt được lãnh đạo lớn"},
			{En: "Entering left belly — hold, get heart of darkening light", Vi: "Vào bụng trái, lấy trái tim của ánh sáng tối"},
			{En: "Ji Zi's darkening light — hold, beneficial persistence", Vi: "Ánh sáng tối của Cơ Tử, kiên trì có lợi"},
			{En: "Not light but dark — retreat, first ascends then falls", Vi: "Không sáng mà tối, trước lên sau rơi"},
		})

	// 37. Gia Nhân - The Family
	refs[36] = build(37,
		localized{En: "Family order and proper relationships", Vi: "Trật tự gia đình và mối quan hệ đúng đắn"},
		localized{En: "Internal order and organization are the foundation for external effectiveness. Stabilize internal structure first — team roles, processes, and clarity. Internal disorder undermines results regardless of market conditions.", Vi: "Trật tự và tổ chức bên trong là nền tảng cho hiệu quả bên ngoài. Ổn định nội bộ trước — đội nhóm, quy trình, vai trò rõ ràng. Rối loạn trong nhà sẽ phá hỏng mọi kết quả dù thị trường có thuận."},
		localized{En: "Wind from fire — words must have substance. Woman's persistence favorable when in proper role. Order within enables effectiveness without.", Vi: "Gió từ lửa — lời nói phải có thực chất. Trật tự bên trong cho phép hiệu quả bên ngoài."},
		localized{En: "Proper internal organization creates foundation for external success.", Vi: "Tổ chức nội bộ đúng đắn tạo nền tảng cho thành công bên ngoài."},
		localized{En: "Disorder at home undermines all external endeavors.", Vi: "Rối loạn ở nhà phá hoại mọi nỗ lực bên ngoài."},
		[]localized{
			{En: "Enclosed within home — hold, regret disappears through order", Vi: "Bao quanh trong nhà, hối tiếc biến mất qua trật tự"},
			{En: "Nothing to pursue — hold, attend to provisions within", Vi: "Không có gì để theo đuổi, chăm sóc tiếp tế bên trong"},
			{En: "Family members grumbling — caution, regret but danger passes", Vi: "Thành viên gia đình càu nhàu, hối tiếc nhưng nguy hiểm qua"},
			{En: "Enriching family — hold, great good fortune", Vi: "Làm giàu gia đình, vận may lớn"},
			{En: "King approaches family — hold, no worry, mutual love", Vi: "Vua tiếp cận gia đình, không lo lắng, yêu thương lẫn nhau"},
			{En: "Sincere and authoritative — hold, fortunate conclusion", Vi: "Chân thành và có uy quyền, kết luận may mắn"},
		})

	// 38. Khuê - Opposition
	refs[37] = build(38,
		localized{En: "Opposition and estrangement", Vi: "Đối lập và xa cách"},
		localized{En: "Opposition or disagreement is present, but small matters are still possible. Do not force resolution of deep conflict — use indirect, step-by-step approaches to gradually find common ground.", Vi: "Có sự bất đồng hoặc đối lập đang hiện diện, nhưng vẫn có thể làm được việc nhỏ. Đừng cố ép giải quyết xung đột sâu — hãy dùng cách tiếp cận gián tiếp, từng bước nhỏ để dần dần tìm điểm chung."},
		localized{En: "Fire above lake — elements diverge. Small matters possible despite opposition. Strange circumstances require unconventional response.", Vi: "Lửa trên hồ — các yếu tố phân kỳ. Việc nhỏ có thể dù đối lập. Hoàn cảnh lạ đòi hỏi phản ứng không thông thường."},
		localized{En: "Managing opposition through small steps and indirect methods.", Vi: "Quản lý đối lập qua các bước nhỏ và phương pháp gián tiếp."},
		localized{En: "Forcing resolution of deep opposition creates greater conflict.", Vi: "Ép buộc giải quyết đối lập sâu tạo ra xung đột lớn hơn."},
		[]localized{
			{En: "Regret disappears — hold, lost horse returns naturally", Vi: "Hối tiếc biến mất, ngựa lạc trở về tự nhiên"},
			{En: "Meeting master in lane — hold, no blame in informal encounter", Vi: "Gặp thầy trong ngõ, không lỗi trong cuộc gặp không chính thức"},
			{En: "Wagon dragged, oxen halted — caution, man tattooed, bad start good end", Vi: "Xe bị kéo, bò dừng, đàn ông xăm, khởi đầu xấu kết thúc tốt"},
			{En: "Isolated in opposition — hold, meeting great man, sincere exchange", Vi: "Cô lập trong đối lập, gặp người lớn, trao đổi chân thành"},
			{En: "Regret disappears — hold, ancestor bites skin, no blame in going", Vi: "Hối tiếc biến mất, tổ tiên cắn da, không lỗi khi đi"},
			{En: "Isolated in opposition — retreat, pigs with mud, ghosts in wagon", Vi: "Cô lập trong đối lập, lợn với bùn, ma trong xe"},
		})

	// 39. Kiển - Obstruction
	refs[38] = build(39,
		localized{En: "Obstruction and difficulty ahead", Vi: "Chướng ngại và khó khăn phía trước"},
		localized{En: "Clear obstruction lies ahead — pushing straight on will make difficulties worse. Recognize early, reposition strategically, seek experienced counsel, and gather strength before trying again.", Vi: "Phía trước có trở ngại rõ ràng — tiếp tục đẩy thẳng sẽ làm khó khăn nặng hơn. Hãy nhận ra sớm, tái định vị chiến lược, tìm người cố vấn có kinh nghiệm và tập hợp sức mạnh trước khi thử lại."},
		localized{En: "Water on mountain — dangerous path. Southwest favorable, northeast unfavorable. See great person for guidance. Turn back and gather strength.", Vi: "Nước trên núi — con đường nguy hiểm. Tây nam thuận lợi, đông bắc bất lợi. Gặp người lớn để được hướng dẫn."},
		localized{En: "Recognizing obstruction early allows strategic repositioning.", Vi: "Nhận ra chướng ngại sớm cho phép tái định vị chiến lược."},
		localized{En: "Pushing forward into clear obstruction magnifies difficulties.", Vi: "Đẩy về phía trước vào chướng ngại rõ ràng phóng đại khó khăn."},
		[]localized{
			{En: "Going obstruction, coming praise — retreat, wait for better path", Vi: "Đi chướng ngại, đến khen ngợi, chờ con đường tốt hơn"},
			{En: "King's servant: obstruction upon obstruction — retreat, not own doing", Vi: "Người hầu của vua: chướng ngại chồng chướng ngại, không phải việc của mình"},
			{En: "Going obstruction, coming return — hold, internal joy in turning back", Vi: "Đi chướng ngại, đến trở về, niềm vui nội tâm khi quay lại"},
			{En: "Going obstruction, coming connection — retreat, join forces", Vi: "Đi chướng ngại, đến kết nối, hợp lực"},
			{En: "Great obstruction, friends come — hold, allies arrive", Vi: "Chướng ngại lớn, bạn bè đến, đồng minh đến"},
			{En: "Going obstruction, coming greatness — hold, fortunate to see great person", Vi: "Đi chướng ngại, đến sự vĩ đại, may mắn gặp người lớn"},
		})

	// 40. Giải - Deliverance
	refs[39] = build(40,
		localized{En: "Release and liberation from tension", Vi: "Giải phóng và giải thoát khỏi căng thẳng"},
		localized{En: "Pressure and difficulty are dissolving — time for release and renewed movement. Act quickly to remove root causes, then return to normal. Do not prolong the resolution process unnecessarily.", Vi: "Áp lực và khó khăn đang tan biến — đây là thời điểm giải phóng và chuyển động trở lại. Hành động sớm để xóa bỏ nguyên nhân gốc rễ, sau đó trở về trạng thái bình thường. Đừng kéo dài quá trình giải quyết."},
		localized{En: "Thunder and rain — delivery comes. Southwest favorable; return quickly if nothing to pursue. Act decisively when release opportunity appears.", Vi: "Sấm và mưa — sự giải thoát đến. Tây nam thuận lợi; trở về nhanh nếu không có gì để theo đuổi."},
		localized{En: "Swift decisive action when opening appears completes liberation.", Vi: "Hành động quyết đoán nhanh chóng khi cơ hội xuất hiện hoàn thành giải phóng."},
		localized{En: "Delaying action when release possible allows re-entanglement.", Vi: "Trì hoãn hành động khi có thể giải phóng cho phép vướng víu lại."},
		[]localized{
			{En: "No blame — hold, simple release without complication", Vi: "Không lỗi, giải phóng đơn giản không phức tạp"},
			{En: "Catching three foxes — hold, yellow arrows, righteous fortune", Vi: "Bắt ba con cáo, mũi tên vàng, vận may chính đạo"},
			{En: "Carrying and riding — caution, attracts robbers, regret", Vi: "Mang và cưỡi, thu hút cướp, hối tiếc"},
			{En: "Release your thumb — hold, friend arrives with trust", Vi: "Giải phóng ngón cái, bạn đến với sự tin tưởng"},
			{En: "Noble's release — hold, small people withdraw, fortune", Vi: "Giải phóng của người quý tộc, kẻ tiểu nhân rút lui, may mắn"},
			{En: "Prince shoots hawk on wall — hold, catches it, everything favorable", Vi: "Hoàng tử bắn diều hâu trên tường, bắt được, mọi thứ thuận lợi"},
		})

	// 41. Tổn - Decrease
	refs[40] = build(41,
		localized{En: "Decrease and strategic reduction", Vi: "Giảm bớt và cắt giảm chiến lược"},
		localized{En: "Period of reduction, simplification, and sacrifice of excess for long-term benefit. This is not failure — timely reduction in the right areas can restore strength and lay the foundation for future growth.", Vi: "Thời kỳ cần giảm bớt, đơn giản hóa và hy sinh phần dư thừa vì lợi ích lâu dài. Đây không phải thất bại — giảm đúng lúc và đúng chỗ có thể phục hồi sức mạnh và tạo nền tảng cho tăng trưởng sau."},
		localized{En: "Lake at mountain foot — decrease above enriches below. Genuine offering with simple vessels succeeds. Reduce excess to strengthen foundation.", Vi: "Hồ ở chân núi — giảm trên làm giàu dưới. Dâng lễ chân thành với đồ đơn giản thành công."},
		localized{En: "Strategic reduction in right areas strengthens core position.", Vi: "Cắt giảm chiến lược ở các khu vực đúng củng cố vị thế cốt lõi."},
		localized{En: "Clinging to excess depletes resources needed for essentials.", Vi: "Bám víu vào dư thừa cạn kiệt nguồn lực cần thiết cho những thứ thiết yếu."},
		[]localized{
			{En: "Finishing task quickly, going — hold, no blame, consider decrease", Vi: "Hoàn thành nhiệm vụ nhanh, đi, không lỗi, xem xét giảm"},
			{En: "Beneficial persistence — hold, going is misfortune", Vi: "Kiên trì có lợi, đi là xui xẻo"},
			{En: "Three walking, one lost — hold, one walking gains friend", Vi: "Ba người đi, một người lạc, một người đi được bạn"},
			{En: "Decreasing one's illness — hold, bringing joy quickly, no blame", Vi: "Giảm bệnh tật của mình, mang lại niềm vui nhanh, không lỗi"},
			{En: "Someone adds ten pairs — hold, cannot be opposed, supreme fortune", Vi: "Ai đó thêm mười cặp, không thể chống lại, vận may tột đỉnh"},
			{En: "Not decreased, increased — advance, no blame, persistence fortunate", Vi: "Không giảm, tăng, không lỗi, kiên trì may mắn"},
		})

	// 42. Ích - Increase
	refs[41] = build(42,
		localized{En: "Increase and beneficial growth", Vi: "Tăng trưởng và phát triển có lợi"},
		localized{En: "Period of increase and expansion — conditions favor investing more into what is working well. Act boldly and seize this opportunity; this is a rare phase when risk is well compensated.", Vi: "Thời kỳ gia tăng và mở rộng — điều kiện ủng hộ đầu tư thêm vào những gì đang hoạt động tốt. Hãy hành động táo bạo và nắm bắt cơ hội này, đây là giai đoạn hiếm gặp khi rủi ro được bù đắp xứng đáng."},
		localized{En: "Wind and thunder — increase through movement. Favorable to cross great water. Benefits flow down from above; seize opportunity for major undertaking.", Vi: "Gió và sấm — tăng trưởng qua chuyển động. Thuận lợi để vượt sông lớn. Lợi ích chảy xuống từ trên."},
		localized{En: "Capitalizing on favorable increase enables great achievement.", Vi: "Tận dụng sự tăng trưởng thuận lợi cho phép đạt được thành tựu lớn."},
		localized{En: "Failing to use increase productively wastes the opportunity.", Vi: "Không sử dụng sự tăng trưởng hiệu quả lãng phí cơ hội."},
		[]localized{
			{En: "Beneficial for great works — advance, supreme fortune, no blame", Vi: "Có lợi cho công trình lớn, vận may tột đỉnh, không lỗi"},
			{En: "Someone adds ten pairs — hold, eternal persistence fortunate", Vi: "Ai đó thêm mười cặp, kiên trì vĩnh cửu may mắn"},
			{En: "Increased by bad events — hold, no blame, sincerity in middle", Vi: "Được tăng bởi sự kiện xấu, không lỗi, chân thành ở giữa"},
			{En: "Middle way, announce to prince — hold, beneficial for moving capital", Vi: "Con đường giữa, thông báo cho hoàng tử, có lợi cho việc di chuyển thủ đô"},
			{En: "Sincere kindness — hold, no need to ask, supreme fortune", Vi: "Lòng tốt chân thành, không cần hỏi, vận may tột đỉnh"},
			{En: "No one increases — retreat, some strike at it, inconstant heart", Vi: "Không ai tăng, một số tấn công nó, trái tim không kiên định"},
		})

	// 43. Quải - Breakthrough
	refs[42] = build(43,
		localized{En: "Decisive breakthrough and resolution", Vi: "Đột phá quyết định và giải quyết"},
		localized{En: "Time to make a decisive announcement and remove negative elements from the system. Present the issue openly and firmly without force — strength without righteousness will fail.", Vi: "Đã đến lúc phải thông báo dứt khoát và loại bỏ yếu tố tiêu cực ra khỏi hệ thống. Trình bày vấn đề công khai, không dùng bạo lực nhưng phải kiên quyết — dùng sức mạnh mà không có tính chính đáng sẽ thất bại."},
		localized{En: "Lake rises to heaven — breakthrough must come. Announce at court; danger must be clearly stated. Armed force not recommended; have a destination.", Vi: "Hồ dâng lên trời — đột phá phải đến. Thông báo tại triều đình; nguy hiểm phải được nêu rõ."},
		localized{En: "Decisive breakthrough displaces what must be removed.", Vi: "Đột phá quyết định thay thế những gì phải được loại bỏ."},
		localized{En: "Incomplete breakthrough allows opposition to recover.", Vi: "Đột phá không hoàn chỉnh cho phép đối lập phục hồi."},
		[]localized{
			{En: "Power in advancing toes — retreat, going without mastery fails", Vi: "Quyền lực ở ngón chân tiến lên, đi mà không thành thạo thất bại"},
			{En: "Alarmed cry — hold, weapons ready, no fear despite evening", Vi: "Tiếng kêu báo động, vũ khí sẵn sàng, không sợ dù buổi tối"},
			{En: "Power in cheekbones — caution, misfortune, noble determined", Vi: "Quyền lực ở gò má, xui xẻo, người quý tộc quyết tâm"},
			{En: "Buttocks skinned — retreat, walking difficult, led sheep, regret gone", Vi: "Mông bị lột da, đi khó khăn, dẫn cừu, hối tiếc biến mất"},
			{En: "Weeds broken — hold, middle way, no blame", Vi: "Cỏ dại bị gãy, con đường giữa, không lỗi"},
			{En: "No crying — retreat, finally misfortune comes", Vi: "Không khóc, cuối cùng xui xẻo đến"},
		})

	// 44. Cấu - Coming to Meet
	refs[43] = build(44,
		localized{En: "Unexpected encounter and temptation", Vi: "Cuộc gặp gỡ bất ngờ và cám dỗ"},
		localized{En: "A new encounter or element is appearing — evaluate carefully because not every opportunity that arrives is beneficial. A small but dangerous factor can grow into a major problem if not recognized in time.", Vi: "Có sự gặp gỡ hoặc nhân tố mới xuất hiện — cần cẩn thận đánh giá vì không phải mọi cơ hội đến đều có lợi. Một nhân tố nhỏ nhưng nguy hiểm có thể phát triển thành vấn đề lớn nếu không nhận ra kịp."},
		localized{En: "Wind under heaven — meeting rises unexpectedly. Woman powerful — do not marry such a woman. Yin unexpectedly intrudes upon yang.", Vi: "Gió dưới trời — cuộc gặp gỡ dâng lên bất ngờ. Âm đột ngột xâm nhập vào dương."},
		localized{En: "Cautious response to unexpected encounter avoids entrapment.", Vi: "Phản ứng thận trọng với cuộc gặp gỡ bất ngờ tránh bị bẫy."},
		localized{En: "Yielding to seductive appearance leads to adverse entanglement.", Vi: "Nhượng bộ trước vẻ ngoài quyến rũ dẫn đến vướng víu bất lợi."},
		[]localized{
			{En: "Tied with metal brake — retreat, persistence fortunate", Vi: "Bị trói bằng phanh kim loại, kiên trì may mắn"},
			{En: "Fish in bag — hold, no blame, not for guests", Vi: "Cá trong túi, không lỗi, không dành cho khách"},
			{En: "Buttocks skinned — caution, going difficult, aware of danger", Vi: "Mông bị lột da, đi khó khăn, nhận thức nguy hiểm"},
			{En: "No fish in bag — hold, rising misfortune from absence", Vi: "Không có cá trong túi, xui xẻo dâng lên từ sự vắng mặt"},
			{En: "Willow wrapping melon — hold, contained, falls from heaven", Vi: "Liễu bọc dưa, được chứa, rơi từ trời"},
			{En: "Coming to meet with horns — retreat, regret but no blame", Vi: "Đến gặp với sừng, hối tiếc nhưng không lỗi"},
		})

	// 45. Tuỵ - Gathering Together
	refs[44] = build(45,
		localized{En: "Gathering and assembly", Vi: "Tụ họp và hội họp"},
		localized{En: "Good time to gather people and resources under sound leadership. Seek visionary leadership and make a genuine commitment — disorganized gathering without purpose only creates chaos.", Vi: "Thời điểm tốt để quy tụ người và nguồn lực dưới sự lãnh đạo đúng đắn. Đến gặp người có tầm nhìn, dâng lễ và bày tỏ cam kết thực sự — tụ họp hỗn loạn không có mục đích sẽ chỉ tạo ra rối loạn."},
		localized{En: "Lake over earth — waters gather. King approaches temple; see great person. Great offering brings success; destination favorable.", Vi: "Hồ trên đất — nước tụ họp. Vua tiếp cận đền; gặp người lớn. Dâng lễ lớn mang lại thành công."},
		localized{En: "Proper gathering under right leadership accomplishes great things.", Vi: "Tụ họp đúng đắn dưới lãnh đạo đúng hoàn thành những việc lớn."},
		localized{En: "Disorganized gathering without purpose leads to chaos.", Vi: "Tụ họp không có tổ chức không có mục đích dẫn đến hỗn loạn."},
		[]localized{
			{En: "Sincere but not complete — caution, disorder then gathering", Vi: "Chân thành nhưng không hoàn chỉnh, rối loạn rồi tụ họp"},
			{En: "Drawn, fortunate — hold, no blame, sincerity in offering", Vi: "Bị kéo, may mắn, không lỗi, chân thành trong dâng lễ"},
			{En: "Gathering sighs — caution, nothing favorable, going no blame", Vi: "Tụ họp thở dài, không gì thuận lợi, đi không lỗi"},
			{En: "Great fortune — hold, no blame in central position", Vi: "Vận may lớn, không lỗi ở vị trí trung tâm"},
			{En: "Gathering has position — hold, no blame, not yet believed", Vi: "Tụ họp có vị trí, không lỗi, chưa được tin"},
			{En: "Sighing and crying — caution, no blame in final tears", Vi: "Thở dài và khóc, không lỗi trong nước mắt cuối cùng"},
		})

	// 46. Thăng - Pushing Upward
	refs[45] = build(46,
		localized{En: "Gradual ascent and advancement", Vi: "Leo lên dần dần và tiến bộ"},
		localized{En: "Steady upward growth, stable as a tree growing from earth. This is grounded progress — seek guidance from those with more experience, move in the favorable direction, and keep going without rushing.", Vi: "Tăng trưởng đi lên từng bước, ổn định như cây mọc từ đất. Đây là thời kỳ tiến bộ có nền tảng — hãy gặp người lớn hơn để xin hướng dẫn và đi về hướng thuận lợi, không cần vội nhưng không dừng lại."},
		localized{En: "Tree growing from earth — steady upward growth. See great person without fear. Expedition to south brings fortune.", Vi: "Cây mọc từ đất — tăng trưởng đi lên ổn định. Gặp người lớn không sợ. Viễn chinh về phía nam mang lại may mắn."},
		localized{En: "Steady persistent effort achieves lasting advancement.", Vi: "Nỗ lực kiên trì ổn định đạt được tiến bộ lâu dài."},
		localized{En: "Impatient rushing upward before ready leads to setback.", Vi: "Vội vàng leo lên trước khi sẵn sàng dẫn đến thất bại."},
		[]localized{
			{En: "Welcomed upward — advance, great fortune", Vi: "Được chào đón đi lên, vận may lớn"},
			{En: "Sincerity makes offerings worthwhile — hold, no blame", Vi: "Chân thành làm cho dâng lễ có giá trị, không lỗi"},
			{En: "Ascending empty city — advance, no resistance", Vi: "Leo lên thành phố trống, không có kháng cự"},
			{En: "King offers at Mount Qi — hold, fortunate, no blame", Vi: "Vua dâng lễ tại Núi Kỳ, may mắn, không lỗi"},
			{En: "Persistence fortunate — hold, ascending stairs step by step", Vi: "Kiên trì may mắn, leo cầu thang từng bước"},
			{En: "Ascending in dark — hold, beneficial unceasing persistence", Vi: "Leo lên trong bóng tối, kiên trì không ngừng có lợi"},
		})

	// 47. Khốn - Oppression
	refs[46] = build(47,
		localized{En: "Exhaustion and confinement", Vi: "Kiệt sức và giam cầm"},
		localized{En: "In a period of exhaustion and confinement — resources depleted, efforts unrecognized. This tests character: maintain dignity and wait rather than compromising principles to escape temporary pressure.", Vi: "Đang ở giai đoạn kiệt sức và bị bóp nghẹt — nguồn lực cạn, nỗ lực không được công nhận. Đây là thử thách nhân cách: giữ vững phẩm giá và chờ đợi, không nhượng bộ nguyên tắc để thoát khỏi áp lực tạm thời."},
		localized{En: "Lake with no water — depleted and confined. Words not believed. Noble person stakes life on will. Exhaustion tests character.", Vi: "Hồ không có nước — cạn kiệt và bị giam cầm. Lời nói không được tin. Kiệt sức thử thách nhân cách."},
		localized{En: "Maintaining integrity during oppression preserves future opportunity.", Vi: "Duy trì sự chính trực trong thời kỳ áp bức bảo tồn cơ hội tương lai."},
		localized{En: "Despair or compromising integrity during oppression destroys prospects.", Vi: "Tuyệt vọng hoặc thỏa hiệp sự chính trực trong thời kỳ áp bức phá hủy triển vọng."},
		[]localized{
			{En: "Buttocks oppressed by stump — retreat, three years not seeing", Vi: "Mông bị đè bởi gốc cây, ba năm không thấy"},
			{En: "Oppressed by wine and food — hold, scarlet knee bands come", Vi: "Bị đè bởi rượu và thức ăn, băng đầu gối đỏ tươi đến"},
			{En: "Oppressed by stone — caution, resting on thorns, not seeing wife", Vi: "Bị đè bởi đá, nghỉ trên gai, không thấy vợ"},
			{En: "Coming slowly — retreat, oppressed in gold carriage, regret, ends", Vi: "Đến chậm, bị đè trong xe vàng, hối tiếc, kết thúc"},
			{En: "Nose and feet cut — hold, oppressed by red knee bands, slowly joy", Vi: "Mũi và chân bị cắt, bị đè bởi băng đầu gối đỏ, từ từ vui"},
			{En: "Oppressed by vines — retreat, saying movement brings regret", Vi: "Bị đè bởi dây leo, nói di chuyển mang lại hối tiếc"},
		})

	// 48. Tỉnh - The Well
	refs[47] = build(48,
		localized{En: "The inexhaustible source and foundation", Vi: "Nguồn vô tận và nền tảng"},
		localized{En: "Core resources and foundations remain constant despite changing circumstances. Develop and maintain the essential source rather than chasing surface gains — nearly completing but falling short at the last moment wastes everything.", Vi: "Nguồn lực cốt lõi và nền tảng vẫn không đổi dù hoàn cảnh xung quanh thay đổi. Hãy phát triển và duy trì nguồn lực thiết yếu thay vì chỉ đuổi theo bề mặt — gần hoàn thành nhưng thiếu một chút sẽ lãng phí tất cả."},
		localized{En: "Wood over water — well draws from deep. Town may change, well remains constant. Near completion but rope short — misfortune in almost reaching.", Vi: "Gỗ trên nước — giếng kéo từ sâu. Thị trấn có thể thay đổi, giếng vẫn không đổi."},
		localized{En: "Developing fundamental resources sustains ongoing activity.", Vi: "Phát triển nguồn lực cơ bản duy trì hoạt động liên tục."},
		localized{En: "Neglecting the essential source while chasing surface depletes capability.", Vi: "Bỏ quên nguồn thiết yếu trong khi đuổi theo bề mặt cạn kiệt năng lực."},
		[]localized{
			{En: "Well mud, not eaten — retreat, old well, no creatures", Vi: "Giếng bùn, không ăn, giếng cũ, không có sinh vật"},
			{En: "Well valley, fish caught — hold, jug broken, leaking", Vi: "Thung lũng giếng, cá bị bắt, bình vỡ, rò rỉ"},
			{En: "Well cleared, not drunk — caution, heart pained, could be used", Vi: "Giếng được dọn sạch, không uống, trái tim đau, có thể được sử dụng"},
			{En: "Well lining — hold, no blame in maintenance", Vi: "Lót giếng, không lỗi trong bảo trì"},
			{En: "Well clear, cold spring — hold, drinking possible", Vi: "Giếng trong, suối lạnh, có thể uống"},
			{En: "Well collected, not covered — hold, sincerity, supreme fortune", Vi: "Giếng thu thập, không che, chân thành, vận may tột đỉnh"},
		})

	// 49. Cách - Revolution
	refs[48] = build(49,
		localized{En: "Fundamental change and transformation", Vi: "Thay đổi căn bản và biến đổi"},
		localized{En: "Time for major change and systemic reform — like shedding old skin after it has served its purpose. Make changes after winning sufficient support, not before — revolutionary action too early loses legitimacy.", Vi: "Đây là thời điểm thay đổi lớn và cải cách hệ thống — như thay da mới sau khi cũ đã xong vai trò. Hãy thực hiện thay đổi sau khi đã thuyết phục được nhiều người, không phải trước — đừng cách mạng quá sớm."},
		localized{En: "Fire in lake — elements transform each other. Believed on completion day. Supreme success through righteousness; regret disappears.", Vi: "Lửa trong hồ — các yếu tố biến đổi lẫn nhau. Được tin vào ngày hoàn thành. Thành công tột đỉnh qua chính đạo."},
		localized{En: "Decisive transformation when time is right achieves renewal.", Vi: "Biến đổi quyết đoán khi thời điểm đúng đạt được đổi mới."},
		localized{En: "Premature revolution fails; delayed revolution misses opportunity.", Vi: "Cách mạng sớm thất bại; cách mạng trì hoãn bỏ lỡ cơ hội."},
		[]localized{
			{En: "Bound with yellow ox hide — caution, stabilize before change", Vi: "Bị trói bằng da bò vàng, ổn định trước khi thay đổi"},
			{En: "Completion day revolution — advance, going fortunate", Vi: "Cách mạng ngày hoàn thành, đi may mắn"},
			{En: "Going misfortune, persistence danger — retreat, revolution talk thrice, then trust", Vi: "Đi xui xẻo, kiên trì nguy hiểm, nói cách mạng ba lần, rồi tin"},
			{En: "Regret disappears — hold, belief enables change, fortune", Vi: "Hối tiếc biến mất, niềm tin cho phép thay đổi, may mắn"},
			{En: "Great person tiger change — hold, not yet divined, already believed", Vi: "Người lớn thay đổi như hổ, chưa bói, đã được tin"},
			{En: "Noble person leopard change — hold, small people change face", Vi: "Người quý tộc thay đổi như báo, kẻ tiểu nhân đổi mặt"},
		})

	// 50. Đỉnh - The Cauldron
	refs[49] = build(50,
		localized{En: "Sacred vessel and supreme achievement", Vi: "Bình thiêng và thành tựu tột đỉnh"},
		localized{En: "Time for nurturing high-value matters and developing organizational culture and civilization. Use resources properly and with the right people — the right match between user and tool produces outstanding results.", Vi: "Đây là thời kỳ nuôi dưỡng những điều có giá trị cao và phát triển nền văn minh, văn hóa tổ chức. Hãy sử dụng nguồn lực đúng cách và đúng người — sự phù hợp giữa người dùng và công cụ tạo ra kết quả vượt trội."},
		localized{En: "Fire over wood — transformation vessel. Supreme success. Cauldron turns out the old, takes in the new. Cultural renewal through proper form.", Vi: "Lửa trên gỗ — bình biến đổi. Thành công tột đỉnh. Đỉnh đổ ra cái cũ, nhận vào cái mới."},
		localized{En: "Transforming resources through proper method creates supreme value.", Vi: "Biến đổi nguồn lực qua phương pháp đúng tạo ra giá trị tột đỉnh."},
		localized{En: "Using sacred vessels improperly degrades their power.", Vi: "Sử dụng bình thiêng không đúng cách làm giảm sức mạnh của chúng."},
		[]localized{
			{En: "Cauldron upturned — hold, favorable for expelling bad", Vi: "Đỉnh lật úp, thuận lợi để đuổi xấu"},
			{En: "Cauldron has contents — hold, my companion ill, cannot approach", Vi: "Đỉnh có nội dung, bạn tôi bệnh, không thể tiếp cận"},
			{En: "Cauldron ears changed — caution, fat pheasant uneaten, rain ends regret", Vi: "Tai đỉnh thay đổi, gà lôi béo không ăn, mưa kết thúc hối tiếc"},
			{En: "Cauldron leg broken — hold, prince's meal overturned, severe", Vi: "Chân đỉnh gãy, bữa ăn của hoàng tử bị lật, nghiêm trọng"},
			{En: "Cauldron yellow ears gold rings — hold, beneficial persistence", Vi: "Đỉnh tai vàng vòng vàng, kiên trì có lợi"},
			{En: "Cauldron jade rings — hold, great fortune, everything favorable", Vi: "Đỉnh vòng ngọc, vận may lớn, mọi thứ thuận lợi"},
		})

	// 51. Chấn - The Arousing
	refs[50] = build(51,
		localized{En: "Shock and thunder bringing movement", Vi: "Sốc và sấm mang lại chuyển động"},
		localized{En: "Sudden shock or strong turbulence is occurring — first reaction is alarm, then calm returns. This is a wake-up call: act seriously, stay safe, and do not let shock turn into panic.", Vi: "Cú sốc bất ngờ hoặc biến động mạnh đang xảy ra — phản ứng đầu tiên là kinh ngạc nhưng sau đó bình tĩnh trở lại. Đây là hồi chuông thức tỉnh: hành động nghiêm túc, giữ an toàn, không để sốc biến thành hoảng loạn."},
		localized{En: "Repeated thunder — shock upon shock. Shock brings success; laughing talk after fright. Hundred miles startled; sacrificial spoon unmoved.", Vi: "Sấm lặp đi lặp lại — sốc chồng sốc. Sốc mang lại thành công; nói cười sau khi sợ hãi."},
		localized{En: "Maintaining composure through shock enables proper response.", Vi: "Duy trì bình tĩnh qua sốc cho phép phản ứng đúng đắn."},
		localized{En: "Panic during shock leads to losing what matters most.", Vi: "Hoảng loạn trong sốc dẫn đến mất những gì quan trọng nhất."},
		[]localized{
			{En: "Shock comes — hold, then laughing talk, fortune", Vi: "Sốc đến, rồi nói cười, may mắn"},
			{En: "Shock comes dangerously — caution, losing treasure, climb high", Vi: "Sốc đến nguy hiểm, mất kho báu, leo cao"},
			{En: "Shock revives — caution, shocking action without blame", Vi: "Sốc hồi sinh, hành động gây sốc không lỗi"},
			{En: "Shock stuck in mud — retreat, movement mired", Vi: "Sốc mắc kẹt trong bùn, chuyển động bị sa lầy"},
			{En: "Shock going and coming — caution, dangerous, nothing lost", Vi: "Sốc đi và đến, nguy hiểm, không mất gì"},
			{En: "Shock brings confusion — retreat, neighbors warning, no blame if careful", Vi: "Sốc mang lại nhầm lẫn, láng giềng cảnh báo, không lỗi nếu cẩn thận"},
		})

	// 52. Cấn - Keeping Still
	refs[51] = build(52,
		localized{En: "Stillness and meditation stopping movement", Vi: "Yên tĩnh và thiền định dừng chuyển động"},
		localized{En: "Time to stop completely and be still — not from passivity but from conscious choice. Timely stillness concentrates strength and mind; forcing activity now wastes energy needlessly.", Vi: "Thời điểm cần dừng lại và giữ yên lặng hoàn toàn — không phải do thụ động mà do lựa chọn có ý thức. Yên tĩnh đúng lúc tập trung sức mạnh và tâm trí; cố hoạt động lúc này sẽ tiêu hao năng lượng vô ích."},
		localized{En: "Mountain upon mountain — complete stillness. Keep back still, not feeling body. Walking in courtyard, not seeing people. No blame.", Vi: "Núi chồng núi — yên tĩnh hoàn toàn. Giữ lưng yên, không cảm thấy cơ thể. Đi trong sân, không thấy người."},
		localized{En: "Proper stillness at right time centers and strengthens.", Vi: "Yên tĩnh đúng lúc tập trung và củng cố."},
		localized{En: "Restless inability to stop dissipates energy uselessly.", Vi: "Bồn chồn không thể dừng tiêu tán năng lượng vô ích."},
		[]localized{
			{En: "Keeping feet still — hold, no blame, beneficial continued persistence", Vi: "Giữ chân yên, không lỗi, kiên trì tiếp tục có lợi"},
			{En: "Keeping calves still — hold, not saving what follows, heart unhappy", Vi: "Giữ bắp chân yên, không cứu những gì theo sau, trái tim không vui"},
			{En: "Keeping waist still — caution, splitting ribs, danger smothers heart", Vi: "Giữ eo yên, tách sườn, nguy hiểm nghẹt trái tim"},
			{En: "Keeping body still — hold, no blame in trunk stillness", Vi: "Giữ thân yên, không lỗi trong sự yên tĩnh của thân"},
			{En: "Keeping jaws still — hold, words ordered, regret disappears", Vi: "Giữ hàm yên, lời nói có trật tự, hối tiếc biến mất"},
			{En: "Keeping still richly — hold, fortunate completion", Vi: "Giữ yên giàu có, hoàn thành may mắn"},
		})

	// 53. Tiệm - Development
	refs[52] = build(53,
		localized{En: "Gradual progress and steady development", Vi: "Tiến bộ dần dần và phát triển ổn định"},
		localized{En: "Sustainable progress comes from each step in proper sequence, not skipping stages. Like a goose advancing step by step, follow each necessary phase — rushing breaks natural sequence and creates instability.", Vi: "Tiến bộ bền vững đến từng bước đúng trình tự, không thể nhảy cóc. Như ngỗng đi từng chặng lên cao, hãy tuân thủ từng giai đoạn cần thiết — vội vàng phá vỡ trình tự tự nhiên sẽ tạo bất ổn."},
		localized{En: "Tree on mountain — grows gradually. Maiden marries; fortune through proper stages. Goose approaches shore step by step.", Vi: "Cây trên núi — mọc dần dần. Thiếu nữ kết hôn; may mắn qua các giai đoạn đúng đắn."},
		localized{En: "Patient step-by-step development achieves lasting results.", Vi: "Phát triển từng bước kiên nhẫn đạt được kết quả lâu dài."},
		localized{En: "Rushing ahead of natural development creates instability.", Vi: "Vội vã trước sự phát triển tự nhiên tạo ra bất ổn."},
		[]localized{
			{En: "Goose approaches shore — retreat, small person danger, no blame", Vi: "Ngỗng tiếp cận bờ, kẻ tiểu nhân nguy hiểm, không lỗi"},
			{En: "Goose approaches cliff — hold, eating and drinking happily, fortune", Vi: "Ngỗng tiếp cận vách đá, ăn uống vui vẻ, may mắn"},
			{En: "Goose approaches plateau — caution, husband goes not returning", Vi: "Ngỗng tiếp cận cao nguyên, chồng đi không trở về"},
			{En: "Goose approaches tree — hold, perhaps gets beam, no blame", Vi: "Ngỗng tiếp cận cây, có lẽ được xà, không lỗi"},
			{En: "Goose approaches mound — hold, wife three years not conceiving", Vi: "Ngỗng tiếp cận gò, vợ ba năm không thụ thai"},
			{En: "Goose approaches heights — hold, feathers for ceremony, fortune", Vi: "Ngỗng tiếp cận độ cao, lông cho nghi lễ, may mắn"},
		})

	// 54. Quy Muội - The Marrying Maiden
	refs[53] = build(54,
		localized{En: "Improper position bringing misfortune", Vi: "Vị trí không đúng mang lại xui xẻo"},
		localized{En: "Currently in an improper position or acting at the wrong time — moving forward now brings misfortune. Wait patiently for the right position and right timing; avoid action driven by pressure or weakness.", Vi: "Đang ở vị thế không phù hợp hoặc hành động sai thời điểm — tiến tới lúc này mang lại xui xẻo. Kiên nhẫn chờ vị trí đúng và thời điểm đúng, tránh hành động xuất phát từ áp lực hoặc vị thế yếu kém."},
		localized{En: "Thunder over lake — movement without proper sequence. Going brings misfortune. Nothing favorable in any direction.", Vi: "Sấm trên hồ — chuyển động không theo trình tự đúng. Đi mang lại xui xẻo. Không gì thuận lợi theo hướng nào."},
		localized{En: "Acting from improper position or premature timing brings problems.", Vi: "Hành động từ vị trí không đúng hoặc thời gian sớm mang lại vấn đề."},
		localized{En: "Patience until proper position available avoids wasted effort.", Vi: "Kiên nhẫn cho đến khi vị trí đúng có sẵn tránh lãng phí nỗ lực."},
		[]localized{
			{En: "Maiden marries as concubine — caution, lame can walk, fortunate going", Vi: "Thiếu nữ kết hôn làm thiếp, què có thể đi, đi may mắn"},
			{En: "Squinting can see — hold, solitary person's persistence beneficial", Vi: "Nheo mắt có thể thấy, sự kiên trì của người cô đơn có lợi"},
			{En: "Maiden marries as slave — retreat, returns as concubine", Vi: "Thiếu nữ kết hôn làm nô lệ, trở về làm thiếp"},
			{En: "Maiden delays marriage — hold, late marriage has time", Vi: "Thiếu nữ trì hoãn hôn nhân, hôn nhân muộn có thời gian"},
			{En: "Emperor Yi marries sister — hold, princess sleeves less fine", Vi: "Hoàng đế Ất kết hôn em gái, tay áo công chúa kém đẹp"},
			{En: "Woman holds empty basket — retreat, man stabs sheep, no blood", Vi: "Phụ nữ cầm giỏ trống, đàn ông đâm cừu, không có máu"},
		})

	// 55. Phong - Abundance
	refs[54] = build(55,
		localized{En: "Fullness and peak abundance", Vi: "Đầy đủ và dồi dào đỉnh cao"},
		localized{En: "At the peak of abundance — like the midday sun, this is the moment to deploy fully and enjoy results. But the midday sun begins to decline; enjoy while simultaneously preparing for the next phase.", Vi: "Đang ở đỉnh sung túc — như mặt trời ở giữa trưa, đây là thời điểm triển khai toàn lực và hưởng thành quả. Nhưng mặt trời giữa trưa sẽ bắt đầu đi xuống, hãy hưởng nhưng đồng thời chuẩn bị cho giai đoạn kế."},
		localized{En: "Thunder and lightning — abundance at peak. King reaches greatest extent. Midday sun must decline. Enjoy peak but prepare for change.", Vi: "Sấm và sét — dồi dào ở đỉnh cao. Vua đạt mức độ lớn nhất. Mặt trời giữa trưa phải suy giảm."},
		localized{En: "Maximum deployment during peak conditions achieves great results.", Vi: "Triển khai tối đa trong điều kiện đỉnh cao đạt được kết quả lớn."},
		localized{En: "Clinging to peak position accelerates inevitable decline.", Vi: "Bám víu vào vị trí đỉnh cao đẩy nhanh suy giảm không thể tránh."},
		[]localized{
			{En: "Meeting matched lord — hold, ten days no blame, going honored", Vi: "Gặp chúa phù hợp, mười ngày không lỗi, đi được tôn vinh"},
			{En: "Screening abundance — hold, midday seeing Dipper, going gets doubt", Vi: "Che chắn sự dồi dào, giữa trưa thấy Sao Bắc Đẩu, đi được nghi ngờ"},
			{En: "Screening canopy — caution, midday seeing froth, breaking arm", Vi: "Che chắn tán, giữa trưa thấy bọt, gãy tay"},
			{En: "Screening abundance — hold, midday seeing Dipper, meeting hidden lord", Vi: "Che chắn sự dồi dào, giữa trưa thấy Sao Bắc Đẩu, gặp chúa ẩn"},
			{En: "Bringing brilliance — hold, praise and fortune come", Vi: "Mang lại sự rực rỡ, khen ngợi và may mắn đến"},
			{En: "Abundance in house — retreat, screening family, peeping gate, three years solitary", Vi: "Dồi dào trong nhà, che chắn gia đình, nhìn trộm cổng, ba năm cô đơn"},
		})

	// 56. Lữ - The Wanderer
	refs[55] = build(56,
		localized{En: "Travel and sojourning in foreign territory", Vi: "Du hành và tạm trú ở vùng đất xa lạ"},
		localized{En: "In a temporary or transitional situation, like a traveler in unfamiliar territory. Small success is possible with careful and modest conduct — arrogance or carelessness while vulnerable is dangerous.", Vi: "Đang ở trong tình thế tạm thời, như người lữ hành qua vùng đất lạ. Thành công nhỏ có thể đạt được nếu hành xử cẩn thận và khiêm tốn — kiêu ngạo hoặc bất cẩn khi ở vị thế dễ tổn thương rất nguy hiểm."},
		localized{En: "Fire on mountain — wanderer passes through. Small success through proper behavior while traveling. Stranger must be doubly careful.", Vi: "Lửa trên núi — người lữ hành đi qua. Thành công nhỏ qua hành vi đúng đắn khi du hành."},
		localized{En: "Careful modest conduct during transition maintains safety.", Vi: "Hành xử khiêm tốn cẩn thận trong thời kỳ chuyển đổi duy trì an toàn."},
		localized{En: "Arrogance or carelessness while vulnerable invites disaster.", Vi: "Kiêu ngạo hoặc bất cẩn khi dễ bị tổn thương mời gọi thảm họa."},
		[]localized{
			{En: "Wanderer on trifles — retreat, brings disaster on self", Vi: "Người lữ hành về những điều nhỏ nhặt, mang thảm họa cho bản thân"},
			{En: "Wanderer reaches inn — hold, has resources, gets young servant", Vi: "Người lữ hành đến quán trọ, có nguồn lực, được người hầu trẻ"},
			{En: "Wanderer burns inn — retreat, loses young servant, danger", Vi: "Người lữ hành đốt quán trọ, mất người hầu trẻ, nguy hiểm"},
			{En: "Wanderer at place — hold, has goods and axe, heart not pleased", Vi: "Người lữ hành tại nơi, có hàng hóa và rìu, trái tim không vui"},
			{En: "Shooting pheasant — hold, one arrow, finally praise and mandate", Vi: "Bắn gà lôi, một mũi tên, cuối cùng khen ngợi và ủy quyền"},
			{En: "Bird burns nest — retreat, wanderer first laughs then cries", Vi: "Chim đốt tổ, người lữ hành trước cười sau khóc"},
		})

	// 57. Tốn - The Gentle
	refs[56] = build(57,
		localized{En: "Gentle penetration and gradual influence", Vi: "Thấm nhập nhẹ nhàng và ảnh hưởng dần dần"},
		localized{En: "The most effective action now is gentle persistent penetration, like wind finding every crack. Avoid direct frontal force; use continuous flexibility instead — having a guide is better than going alone.", Vi: "Hành động hiệu quả nhất lúc này là thâm nhập từ từ, kiên trì, như gió len lỏi vào mọi khe hở. Không dùng lực tấn công trực diện mà dùng sự linh hoạt liên tục — có người chỉ dẫn sẽ tốt hơn làm một mình."},
		localized{En: "Wind following wind — gentle persistence. Small success through subtle influence. Favorable to see great person and cross great water.", Vi: "Gió theo gió — kiên trì nhẹ nhàng. Thành công nhỏ qua ảnh hưởng tinh tế."},
		localized{En: "Persistent gentle influence achieves what force cannot.", Vi: "Ảnh hưởng nhẹ nhàng kiên trì đạt được những gì sức mạnh không thể."},
		localized{En: "Excessive gentleness without direction becomes weakness.", Vi: "Quá nhẹ nhàng không có hướng trở thành yếu đuối."},
		[]localized{
			{En: "Advancing and retreating — caution, soldier's persistence beneficial", Vi: "Tiến và lùi, sự kiên trì của người lính có lợi"},
			{En: "Penetrating under bed — hold, using diviners many, fortune", Vi: "Thấm nhập dưới giường, sử dụng nhiều thầy bói, may mắn"},
			{En: "Repeated penetration — caution, regret from indecision", Vi: "Thấm nhập lặp lại, hối tiếc từ do dự"},
			{En: "Regret disappears — caution, catching three kinds in hunt", Vi: "Hối tiếc biến mất, bắt ba loại trong săn bắn"},
			{En: "Persistence fortunate — hold, regret disappears, nothing unfavorable", Vi: "Kiên trì may mắn, hối tiếc biến mất, không gì bất lợi"},
			{En: "Penetrating under bed — retreat, loses goods and axe, persistence misfortune", Vi: "Thấm nhập dưới giường, mất hàng hóa và rìu, kiên trì xui xẻo"},
		})

	// 58. Đoài - The Joyous
	refs[57] = build(58,
		localized{En: "Joy and harmonious communication", Vi: "Niềm vui và giao tiếp hài hòa"},
		localized{En: "Joy and open exchange create a favorable environment for cooperation. Share, connect, and maintain genuine good humor — but distinguish real joy from empty flattery that can lead you astray.", Vi: "Niềm vui và sự trao đổi cởi mở tạo ra môi trường thuận lợi cho hợp tác. Hãy chia sẻ, giao lưu và giữ thái độ vui vẻ chân thành — nhưng phân biệt niềm vui thực sự với sự chiều chuộng rỗng tuếch có thể dẫn sai đường."},
		localized{En: "Lakes together — joy through exchange. Success through persistence. Friends discuss and practice together.", Vi: "Hồ cùng nhau — niềm vui qua trao đổi. Thành công qua kiên trì. Bạn bè thảo luận và thực hành cùng nhau."},
		localized{En: "Genuine mutual enjoyment and exchange creates lasting benefit.", Vi: "Niềm vui và trao đổi lẫn nhau chân chính tạo ra lợi ích lâu dài."},
		localized{En: "Excessive pleasure-seeking or flattery corrupts and weakens.", Vi: "Tìm kiếm khoái lạc quá mức hoặc nịnh hót làm hư hỏng và yếu đi."},
		[]localized{
			{En: "Harmonious joy — hold, fortunate sincerity", Vi: "Niềm vui hài hòa, chân thành may mắn"},
			{En: "Sincere joy — hold, fortunate, regret disappears", Vi: "Niềm vui chân thành, may mắn, hối tiếc biến mất"},
			{En: "Coming joy — retreat, misfortune from seeking pleasure", Vi: "Niềm vui đến, xui xẻo từ tìm kiếm khoái lạc"},
			{En: "Deliberated joy — hold, not yet at rest, warding off illness happiness", Vi: "Niềm vui suy nghĩ, chưa nghỉ ngơi, xua đuổi bệnh hạnh phúc"},
			{En: "Sincerity toward stripper — hold, danger exists", Vi: "Chân thành với kẻ lột, nguy hiểm tồn tại"},
			{En: "Leading joy — retreat, seductive and unfulfilling", Vi: "Dẫn dắt niềm vui, quyến rũ và không thỏa mãn"},
		})

	// 59. Hoán - Dispersion
	refs[58] = build(59,
		localized{En: "Dissolution and dispersal of obstacles", Vi: "Tan rã và phân tán chướng ngại"},
		localized{En: "Barriers and rigidity are dissolving, enabling reunification. Like wind on water, disperse petty self-interest to serve the larger purpose — this is the time for reconciliation and reconnection.", Vi: "Rào cản và sự cứng nhắc đang tan chảy, tạo điều kiện cho sự hợp nhất trở lại. Như gió thổi trên nước, hãy phân tán những ích kỷ nhỏ để phục vụ mục tiêu lớn hơn — đây là thời điểm hòa giải và kết nối lại."},
		localized{En: "Wind over water — disperses stagnation. King approaches temple. Favorable to cross great water and persist.", Vi: "Gió trên nước — phân tán sự trì trệ. Vua tiếp cận đền. Thuận lợi để vượt sông lớn và kiên trì."},
		localized{En: "Dissolving rigidity and obstacles enables fresh flow.", Vi: "Hòa tan sự cứng nhắc và chướng ngại cho phép dòng chảy mới."},
		localized{En: "Excessive dispersion without regathering leads to scatter.", Vi: "Phân tán quá mức không tập hợp lại dẫn đến tan tác."},
		[]localized{
			{En: "Rescue with horse strength — hold, fortunate assistance", Vi: "Cứu với sức ngựa, hỗ trợ may mắn"},
			{En: "Dispersion runs to support — hold, regret disappears", Vi: "Phân tán chạy để hỗ trợ, hối tiếc biến mất"},
			{En: "Dispersing the self — hold, no regret in letting go", Vi: "Phân tán bản thân, không hối tiếc khi buông bỏ"},
			{En: "Dispersing one's group — hold, supreme fortune, gathering on hill", Vi: "Phân tán nhóm của mình, vận may tột đỉnh, tụ họp trên đồi"},
			{En: "Dispersing sweat, great cries — hold, dispersing king's residence", Vi: "Phân tán mồ hôi, tiếng kêu lớn, phân tán nơi ở của vua"},
			{En: "Dispersing blood, departing — hold, no blame in distancing from harm", Vi: "Phân tán máu, ra đi, không lỗi khi xa lánh tổn hại"},
		})

	// 60. Tiết - Limitation
	refs[59] = build(60,
		localized{En: "Proper limits and self-regulation", Vi: "Tiết chế và giới hạn đúng mức"},
		localized{En: "Setting clear limits and discipline is necessary to maintain a sustainable system. Moderation is not negative restriction — proper limits create structure within which people can thrive.", Vi: "Đặt ra giới hạn và kỷ luật rõ ràng là cần thiết để duy trì hệ thống hoạt động bền vững. Tiết chế không phải là hạn chế tiêu cực — giới hạn đúng đắn tạo ra cấu trúc giúp mọi người phát triển trong đó."},
		localized{En: "Water over lake — proper measure. Success but bitter limitation not to be persisted. Joints give structure to bamboo.", Vi: "Nước trên đầm — đo lường đúng mức. Thành công nhưng tiết chế đắng khổ không thể giữ bền. Đốt tre tạo cấu trúc."},
		localized{En: "Appropriate limitation creates structure and sustainability.", Vi: "Tiết chế thích hợp tạo ra cấu trúc và bền vững."},
		localized{En: "Excessive limitation becomes oppression and fails.", Vi: "Tiết chế quá mức trở thành áp bức và thất bại."},
		[]localized{
			{En: "Not going out of gate — hold, no blame in staying within", Vi: "Không ra khỏi sân nhà, không lỗi khi ở trong"},
			{En: "Not going out of courtyard — retreat, misfortune from missing timing", Vi: "Không ra khỏi cổng sân, xui xẻo vì lỡ thời cơ"},
			{En: "No limitation — retreat, then lamentation, no blame", Vi: "Không tiết chế thì than thở, không lỗi"},
			{En: "Peaceful limitation — hold, success through contentment", Vi: "Tiết chế an nhiên, thành công qua an phận"},
			{En: "Sweet limitation — hold, fortune in going, esteem", Vi: "Tiết chế ngọt ngào, đi tới được tôn trọng"},
			{En: "Bitter limitation — retreat, persistence misfortune, regret disappears", Vi: "Tiết chế đắng khổ, kiên trì xui xẻo, hối tiếc biến mất"},
		})

	// 61. Trung Phu - Inner Truth
	refs[60] = build(61,
		localized{En: "Inner sincerity reaching outward", Vi: "Lòng thành tín từ bên trong lan tỏa ra ngoài"},
		localized{En: "Inner sincerity radiates outward and influences others. Action from genuine honesty earns trust and support — even the most stubborn can be moved by true sincerity.", Vi: "Lòng trung thực và niềm tin từ bên trong lan tỏa ra ngoài và cảm hóa người khác. Hành động xuất phát từ sự thành thật thực sự sẽ được tin tưởng và ủng hộ — ngay cả kẻ cứng đầu cũng có thể được thuyết phục bằng sự chân thành."},
		localized{En: "Wind over lake — inner truth affects all. Dolphins fortunate. Favorable to cross great water and persist.", Vi: "Gió trên đầm — sự thật bên trong ảnh hưởng tất cả. Cá heo may mắn. Thuận lợi vượt sông lớn và kiên trì."},
		localized{En: "Deep sincerity communicated outward creates trust and influence.", Vi: "Lòng chân thành sâu sắc truyền đạt ra ngoài tạo niềm tin và ảnh hưởng."},
		localized{En: "Surface sincerity without inner truth is eventually exposed.", Vi: "Chân thành bề ngoài không có sự thật bên trong cuối cùng sẽ bị phát hiện."},
		[]localized{
			{En: "Being prepared — hold, fortune, having others, no peace", Vi: "Chuẩn bị thì tốt, có ý khác thì không yên"},
			{En: "Crane calls in shade — hold, young one responds, I have cup", Vi: "Hạc kêu trong bóng râm, con nó hưởng ứng, ta có chén rượu ngon"},
			{En: "Getting counterpart — caution, now beating, now resting", Vi: "Gặp đối thủ, lúc đánh trống lúc ngừng"},
			{En: "Moon almost full — hold, horses paired lost, no blame", Vi: "Trăng gần tròn, ngựa đôi mất một con, không lỗi"},
			{En: "Possessing sincerity bond — hold, no blame in connection", Vi: "Có lòng thành tín ràng buộc, không lỗi"},
			{En: "Cockcrow reaching heaven — retreat, persistence misfortune", Vi: "Tiếng gà bay lên tận trời, kiên trì xui xẻo"},
		})

	// 62. Tiểu Quá - Small Exceeding
	refs[61] = build(62,
		localized{En: "Small matters exceed; great matters wait", Vi: "Việc nhỏ vượt quá; việc lớn chờ đợi"},
		localized{En: "Conditions only allow small steps — attempting large targets now will fail. Do what is within reach: small goals, cautious measures, nearby before distant. This is not the time for eagles to fly.", Vi: "Điều kiện chỉ cho phép bước nhỏ — cố gắng vươn tới mục tiêu lớn lúc này sẽ thất bại. Hãy làm những gì vừa tầm với: mục tiêu nhỏ, biện pháp thận trọng, gần trước, xa sau — đây không phải thời của chim đại bàng."},
		localized{En: "Thunder over mountain — small excess. Small success through persistence. Great things should not be attempted now.", Vi: "Sấm trên núi — vượt quá nhỏ. Thành công nhỏ qua kiên trì. Việc lớn không nên thử bây giờ."},
		localized{En: "Success in small matters; restraint in large undertakings.", Vi: "Thành công trong việc nhỏ; kiềm chế trong công việc lớn."},
		localized{En: "Attempting great things during small excess invites failure.", Vi: "Cố gắng việc lớn trong thời vượt quá nhỏ mời gọi thất bại."},
		[]localized{
			{En: "Flying bird brings misfortune — retreat, nothing to do about it", Vi: "Chim bay mang xui xẻo, không làm gì được"},
			{En: "Passing ancestor, meeting grandmother — hold, not reaching prince", Vi: "Đi quá ông gặp bà, không đến được vua"},
			{En: "Not excessive guarding — caution, following harms, misfortune", Vi: "Không quá cẩn thận phòng bị, theo đó mà bị hại, xui xẻo"},
			{En: "No blame, meeting without passing — hold, danger in going, caution", Vi: "Không lỗi, gặp mà không quá, đi tới nguy hiểm, thận trọng"},
			{En: "Dense clouds from west — hold, prince shoots, takes in cave", Vi: "Mây dày từ phía tây, công hầu bắn tên bắt trong hang"},
			{En: "Not meeting, passing — retreat, flying bird nets, misfortune", Vi: "Không gặp mà đi quá, chim bay xa, xui xẻo"},
		})

	// 63. Ký Tế - After Completion
	refs[62] = build(63,
		localized{En: "Order achieved but requiring maintenance", Vi: "Trật tự đạt được nhưng cần duy trì"},
		localized{En: "A cycle has been successfully completed — but completion itself invites complacency. Carefully maintain what has been achieved; a small misstep right after success can undo everything.", Vi: "Đã hoàn thành một chu kỳ thành công — nhưng chính vì hoàn thành rồi nên dễ buông lỏng. Hãy duy trì cẩn thận những gì đã đạt được vì sự trật bánh nhỏ ngay sau đỉnh thành công có thể phá hỏng tất cả."},
		localized{En: "Water over fire — complete but precarious. Initial small success. Persistence beneficial but disorder threatens.", Vi: "Nước trên lửa — hoàn thành nhưng bấp bênh. Ban đầu thành công nhỏ. Kiên trì có lợi nhưng hỗn loạn đe dọa."},
		localized{En: "Vigilant maintenance preserves achieved order.", Vi: "Duy trì cảnh giác bảo toàn trật tự đã đạt được."},
		localized{En: "Relaxing after completion invites disorder to return.", Vi: "Thư giãn sau khi hoàn thành mời gọi hỗn loạn quay lại."},
		[]localized{
			{En: "Dragging wheels, wetting tail — hold, no blame in slowness", Vi: "Kéo lại bánh xe, ướt đuôi, không lỗi khi chậm"},
			{En: "Woman loses curtain — hold, do not pursue, seven days regained", Vi: "Phụ nữ mất tấm che, đừng đuổi theo, bảy ngày lại được"},
			{En: "High ancestor attacks ghost land — caution, three years conquers", Vi: "Vua Cao Tông đánh nước Quỷ Phương, ba năm thắng"},
			{En: "Jacket has padding — caution, all day guarding against leaks", Vi: "Áo lụa có giẻ rách, suốt ngày cảnh giác"},
			{En: "Eastern neighbor kills ox — hold, less than western neighbor's sincerity", Vi: "Láng giềng phía đông mổ trâu, không bằng lễ đạm bạc phía tây"},
			{En: "Wetting the head — retreat, dangerous despite completion", Vi: "Ướt đầu, nguy hiểm dù đã hoàn thành"},
		})

	// 64. Vị Tế - Before Completion
	refs[63] = build(64,
		localized{En: "Not yet complete with potential ahead", Vi: "Chưa hoàn thành với tiềm năng phía trước"},
		localized{En: "Not yet complete but in process — the light at the end of the tunnel is visible. Stay careful and persistent until the end; do not relax near the finish line, as the transition to completion requires the most focus.", Vi: "Chưa hoàn thành nhưng đang trong quá trình — ánh sáng cuối đường hầm đang nhìn thấy được. Hãy cẩn thận và kiên trì đến cùng, không để buông lơi gần về đích, vì bước chuyển qua hoàn thành đòi hỏi tập trung nhất."},
		localized{En: "Fire over water — not yet mingled. Little fox almost across wets tail. Nothing favorable yet. Persistence needed for eventual success.", Vi: "Lửa trên nước — chưa hòa lẫn. Cáo nhỏ sắp qua sông ướt đuôi. Chưa gì thuận lợi. Cần kiên trì để cuối cùng thành công."},
		localized{En: "Continued effort toward completion despite obstacles.", Vi: "Nỗ lực tiếp tục hướng tới hoàn thành bất chấp chướng ngại."},
		localized{En: "Abandoning the effort at the threshold wastes all prior work.", Vi: "Bỏ cuộc ở ngưỡng cửa lãng phí mọi công sức trước đó."},
		[]localized{
			{En: "Wetting tail — retreat, regretful rushing", Vi: "Ướt đuôi, hối tiếc vội vàng"},
			{En: "Dragging wheels — hold, persistence fortunate", Vi: "Kéo lại bánh xe, kiên trì may mắn"},
			{En: "Before completion, going misfortune — caution, favorable crossing water", Vi: "Chưa hoàn thành, tiến tới xui xẻo, thuận lợi vượt sông"},
			{En: "Persistence fortunate, regret disappears — advance, attacking ghost land", Vi: "Kiên trì may mắn, hối tiếc biến mất, đánh nước Quỷ Phương"},
			{En: "Persistence fortunate, no regret — advance, noble's light, sincere fortune", Vi: "Kiên trì may mắn, không hối tiếc, ánh sáng quân tử, chân thành may mắn"},
			{En: "Sincere drinking wine — caution, wetting head loses propriety", Vi: "Chân thành uống rượu, ướt đầu mất đi sự đúng đắn"},
		})

	return refs
}
