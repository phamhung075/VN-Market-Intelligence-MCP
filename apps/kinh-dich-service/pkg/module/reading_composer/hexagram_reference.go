package reading_composer

// AUTO-GENERATED reference data for 64 hexagrams.
// Source: /Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/
// This file backs the dashboard que-reference panel and future /hexagram/{number}/explain route.

import (
	"strings"
)

// phaseReference describes a single hào in trading terms.
type phaseReference struct {
	Phase   int    `json:"phase"`   // 1-6
	Action  string `json:"action"`  // reuse from queDataMap: TIEN/GIU/CHO/THAN/LUI
	Outcome string `json:"outcome"` // reuse from queDataMap: CAT/HUNG/VO CUU/HOI/LE
	GlossEn string `json:"glossEn"` // one-line English translation of this hào's trading meaning
}

// queReference holds the full trading-reference record for one hexagram.
type queReference struct {
	ID                    int              `json:"id"`
	Name                  string           `json:"name"`                  // Vietnamese name, verbatim
	Chinese               string           `json:"chinese"`               // Han zi glyph, verbatim
	Upper                 string           `json:"upper"`                 // trigram name (Qian/Kan/…)
	Lower                 string           `json:"lower"`                 // trigram name
	UpperElement          string           `json:"upperElement"`          // Kim/Moc/Hoa/Thuy/Tho
	LowerElement          string           `json:"lowerElement"`          // Kim/Moc/Hoa/Thuy/Tho
	CoreMeaningEn         string           `json:"coreMeaningEn"`         // English one-clause core meaning
	MarketTrend           string           `json:"marketTrend"`           // "favorable"|"neutral"|"unfavorable"
	MarketTrendLabel      string           `json:"marketTrendLabel"`      // bilingual e.g. "Favorable (THUẬN LỢI)"
	StateInterpretationEn string           `json:"stateInterpretationEn"` // 1-3 sentence trading-state prose (EN)
	FavorableEn           string           `json:"favorableEn"`           // one-line condition for entry/hold
	WarningEn             string           `json:"warningEn"`             // one-line risk/warning
	Phases                []phaseReference `json:"phases"`                // len==6, index 0=phase1…index5=phase6
}

// mapTrendToEnum converts the ASCII trend string from queDataMap to the enum value.
// Uses prefix matching per architect spec (handles "THUAN LOI — manh" variants).
func mapTrendToEnum(trend string) (marketTrend string, marketTrendLabel string) {
	t := strings.ToUpper(trend)
	if strings.HasPrefix(t, "THUAN LOI") {
		return "favorable", "Favorable (THUẬN LỢI)"
	}
	if strings.HasPrefix(t, "BAT LOI") {
		return "unfavorable", "Unfavorable (BẤT LỢI)"
	}
	// TRUNG TINH or unknown
	return "neutral", "Neutral (TRUNG TÍNH)"
}

// buildPhases constructs phase references from queDataMap lines + English glosses.
func buildPhases(id int, glosses []string) []phaseReference {
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
			GlossEn: glosses[i],
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

	// Helper to build one entry
	build := func(id int, coreMeaningEn, stateInterpretationEn, favorableEn, warningEn string, glosses []string) queReference {
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
			ID:                    id,
			Name:                  meta.name,
			Chinese:               meta.chinese,
			Upper:                 meta.upper,
			Lower:                 meta.lower,
			UpperElement:          upperEl,
			LowerElement:          lowerEl,
			CoreMeaningEn:         coreMeaningEn,
			MarketTrend:           trend,
			MarketTrendLabel:      trendLabel,
			StateInterpretationEn: stateInterpretationEn,
			FavorableEn:           favorableEn,
			WarningEn:             warningEn,
			Phases:                buildPhases(id, glosses),
		}
	}

	// 1. Kiền - The Creative
	refs[0] = build(1,
		"Pure creative force, strong yang energy advancing without rest",
		"Period of powerful growth suitable for launching or expanding positions. Maintain integrity; avoid arrogance. The market favors bold but disciplined moves.",
		"All endeavors prosper when you maintain righteous conduct and persistent effort.",
		"At the peak, decline begins. Excessive pride leads to downfall.",
		[]string{
			"Hidden potential phase — accumulate resources, do not act yet",
			"Talent recognized — advance and connect with influential players",
			"Critical transition — work diligently and stay vigilant day and night",
			"Flexible choice — either advance or retreat as timing dictates",
			"Peak power — deploy full capacity and lead decisively",
			"Overreach brings regret — know when to step back",
		})

	// 2. Khôn - The Receptive
	refs[1] = build(2,
		"Pure receptive force, yielding yin energy following the flow",
		"Time to follow rather than lead. Support existing trends rather than initiate. Patience and adaptability yield better results than forcing action.",
		"Success comes through receptivity and alignment with prevailing forces.",
		"Pure yin lacks initiative — eventual stagnation without balancing yang energy.",
		[]string{
			"Early frost — maintain position, consolidate quietly",
			"Natural growth — hold steady, let momentum develop",
			"Hidden merit — keep low profile, preserve gains",
			"Tied sack — remain cautious, neither advance nor retreat",
			"Yellow garment — auspicious through modesty and central position",
			"Dragons fighting — extreme yin, danger of conflict",
		})

	// 3. Truân - Difficulty at Beginning
	refs[2] = build(3,
		"Initial hardship requiring patience and perseverance",
		"Challenging startup phase with obstacles at every turn. Do not rush; build foundations methodically. Seek allies and wait for clarity before major moves.",
		"Persistence through initial chaos eventually leads to order and growth.",
		"Premature action in confusion leads to deeper entanglement.",
		[]string{
			"Hesitation at start — wait, do not force entry",
			"Stuck but opportunity emerges — patience, not action",
			"Chasing without guide — retreat, you lack direction",
			"Seeking alliance — wait for the right partner",
			"Small gains possible — hold position cautiously",
			"Tears of blood — forcing ahead brings disaster",
		})

	// 4. Mông - Youthful Folly
	refs[3] = build(4,
		"Inexperience requiring education and guidance",
		"Market conditions are unclear; you lack sufficient knowledge. Seek mentorship and study before acting. Humility in learning prevents costly errors.",
		"Success through accepting guidance and learning from experience.",
		"Stubbornly ignoring advice or repeating the same questions leads to failure.",
		[]string{
			"Discipline needed — hold, establish basic rules",
			"Patience with the ignorant — hold steady, guide gently",
			"Chasing superficially — retreat, you miss the substance",
			"Trapped in delusion — wait, reality will clarify",
			"Childlike openness — hold, innocent approach succeeds",
			"Punishment for folly — hold, accept consequences and learn",
		})

	// 5. Nhu - Waiting
	refs[4] = build(5,
		"Waiting for the right moment with confidence",
		"Conditions are developing but not yet ripe. Wait with inner certainty; nourish yourself while opportunities mature. Premature entry wastes resources.",
		"Patient waiting with confidence brings success when timing aligns.",
		"Anxiety and impatience during waiting lead to poor decisions.",
		[]string{
			"Waiting in meadow — hold, stay in familiar territory",
			"Waiting on sand — hold, minor friction but safe",
			"Waiting in mud — caution, vulnerable to attack",
			"Waiting in blood — hold, danger very close",
			"Waiting at feast — hold, enjoy while staying alert",
			"Falling into pit — hold, unexpected guests bring resolution",
		})

	// 6. Tụng - Conflict
	refs[5] = build(6,
		"Conflict and litigation requiring resolution",
		"Disputes or competition create tension. Avoid prolonged battles; seek mediation. Partial retreat often yields better outcomes than pyrrhic victory.",
		"Early compromise prevents costly escalation.",
		"Stubborn persistence in conflict ultimately harms everyone involved.",
		[]string{
			"Abandon the dispute — hold, do not prolong conflict",
			"Unable to win — retreat, preserve what you have",
			"Living on past merit — hold, ancestral fortune protects",
			"Accept the judgment — hold, return to righteous path",
			"Winning the case — hold, vindication through proper channels",
			"Winning belt but losing three times daily — retreat, hollow victory",
		})

	// 7. Sư - The Army
	refs[6] = build(7,
		"Organized force requiring discipline and leadership",
		"Large-scale coordinated action needed. Success depends on proper leadership and clear chain of command. Undisciplined moves scatter resources.",
		"Victory through organization, discipline, and experienced leadership.",
		"Poor leadership or broken discipline leads to defeat and scattered forces.",
		[]string{
			"Army must have discipline — retreat, disorganized force fails",
			"In the midst of army — hold, central position is fortunate",
			"Army carries corpses — retreat, casualties from poor command",
			"Army retreats orderly — hold, strategic withdrawal succeeds",
			"Game in field, capture it — hold, justified action succeeds",
			"Feudal rewards — retreat, wrong people in wrong positions",
		})

	// 8. Tỷ - Holding Together
	refs[7] = build(8,
		"Union and alliance seeking mutual benefit",
		"Time to seek alliances and join forces. Examine potential partners carefully before committing. Late joiners miss the best opportunities.",
		"Forming strong alliances with trustworthy partners brings lasting benefit.",
		"Aligning with wrong partners or joining too late leads to disappointment.",
		[]string{
			"Sincere alliance — hold, truthfulness brings fortune",
			"Inner connection — hold, self-correction brings luck",
			"Wrong companions — retreat, aligning with unworthy fails",
			"Outer connection — hold, supporting worthy leader succeeds",
			"Manifest union — hold, open alliance is fortunate",
			"No head for union — retreat, lacking proper leadership",
		})

	// 9. Tiểu Súc - Small Accumulation
	refs[8] = build(9,
		"Small gains through gentle restraint",
		"Major advances blocked; focus on incremental gains. Dense clouds without rain — conditions gathering but not yet releasing. Build position patiently.",
		"Small steady accumulation eventually enables breakthrough.",
		"Overreaching when only small steps are possible leads to setback.",
		[]string{
			"Return to the way — hold, stay on familiar path",
			"Drawn back together — hold, mutual return is fortunate",
			"Spokes burst — caution, tension between partners",
			"Sincerity — retreat, blood gone, fear gone",
			"Sincere bond — hold, shared fortune with neighbors",
			"Rain comes — retreat, moon nearly full, danger in pushing",
		})

	// 10. Lý - Treading
	refs[9] = build(10,
		"Careful conduct walking on tiger's tail",
		"Navigating dangerous terrain requires extreme care. Proper behavior and respect for power keep you safe. One wrong step invites disaster.",
		"Careful respectful conduct allows safe passage through danger.",
		"Careless or disrespectful behavior triggers powerful retaliation.",
		[]string{
			"Simple conduct — advance carefully, no error in humble approach",
			"Smooth level path — hold, solitary walker succeeds",
			"One-eyed sees, lame walks — caution, tiger bites despite bravado",
			"Treading tiger's tail — caution, utmost care required",
			"Resolute treading — retreat, persistence brings danger",
			"Look at your treading — hold, examine conduct for good omen",
		})

	// 11. Thái - Peace
	refs[10] = build(11,
		"Prosperity and harmony in all things",
		"Heaven and earth in harmony; excellent conditions for expansion. Strong growth momentum. Act decisively while conditions favor advancement.",
		"All endeavors prosper; this is the time for confident action.",
		"Prosperity at peak begins declining — prepare for eventual reversal.",
		[]string{
			"Pull out root grass — advance, expansion with allies",
			"Embrace the uncultivated — hold, broad tolerance succeeds",
			"No plain without slope — hold, constancy in change",
			"Fluttering down — hold, neighbors join sincerely",
			"Marriage brings blessing — hold, supreme fortune",
			"Wall falls into moat — retreat, peace ends, brace for change",
		})

	// 12. Bĩ - Standstill
	refs[11] = build(12,
		"Stagnation and obstruction blocking progress",
		"Communication blocked; efforts meet resistance. Retreat and preserve resources. This is not the time for expansion or new ventures.",
		"Withdrawing and cultivating inner strength during stagnation.",
		"Forcing action during blockage wastes resources and invites harm.",
		[]string{
			"Pull grass, roots entangled — hold, withdraw with allies",
			"Embrace and endure — hold, small people flourish briefly",
			"Bearing shame — caution, wrongful actions bring regret",
			"When called, act — hold, blameless service to higher purpose",
			"Standstill ceases — hold, great person succeeds now",
			"Overthrow standstill — retreat, first obstruction then joy",
		})

	// 13. Đồng Nhân - Fellowship
	refs[12] = build(13,
		"Fellowship and common purpose uniting people",
		"Success through alignment with shared goals. Open gathering in public space succeeds; secretive factions fail. Build coalitions around common interest.",
		"Transparent fellowship around shared purpose brings collective success.",
		"Private scheming and exclusive cliques undermine unity.",
		[]string{
			"Fellowship at gate — hold, no blame in open beginning",
			"Fellowship within clan — retreat, faction leads nowhere good",
			"Hiding weapons — caution, suspicion prevents harmony",
			"Mounting wall, cannot attack — hold, return to peace",
			"Fellowship first weeps then laughs — hold, eventual meeting",
			"Fellowship in meadow — hold, no regret in open alliance",
		})

	// 14. Đại Hữu - Great Possession
	refs[13] = build(14,
		"Great abundance and supreme success",
		"Peak prosperity with abundant resources. Supreme good fortune favors bold expansion. Maintain humility despite great success to sustain the blessing.",
		"Heaven favors all endeavors; act boldly while fortune shines.",
		"Arrogance during prosperity accelerates inevitable decline.",
		[]string{
			"No interaction with harm — hold, avoid harmful entanglements",
			"Big wagon for loading — hold, capacity for great undertaking",
			"Prince offers to Son of Heaven — hold, small people cannot",
			"No arrogance — caution, distinguish yourself from excess",
			"Mutual sincerity — advance, dignified and awe-inspiring",
			"Heaven blesses — advance, supreme good fortune",
		})

	// 15. Khiêm - Modesty
	refs[14] = build(15,
		"Modesty and humility bringing completion",
		"Humble approach succeeds where arrogance fails. Mountains lowered into earth — reduce excess, fill deficiency. Modest conduct wins respect.",
		"Modesty brings success in all endeavors and earns lasting respect.",
		"Even hidden excessive pride eventually surfaces and causes downfall.",
		[]string{
			"Humble in humility — hold, cross great waters with modesty",
			"Resonant modesty — hold, righteous heart brings luck",
			"Meritorious modesty — hold, carry through to completion",
			"Nothing unfavorable — hold, displaying modesty appropriately",
			"No wealth from neighbors — hold, attack justified and successful",
			"Resonant modesty — hold, set armies in motion properly",
		})

	// 16. Dự - Enthusiasm
	refs[15] = build(16,
		"Enthusiasm and joyful readiness for action",
		"Energy builds for major movement. Establish helpers and set armies in motion. The time favors coordinated enthusiastic action.",
		"Channeling enthusiasm into organized action brings powerful results.",
		"Empty enthusiasm without proper preparation leads to disappointment.",
		[]string{
			"Proclaiming enthusiasm — retreat, boastful display invites failure",
			"Firm as rock — hold, recognize reality, act within day",
			"Looking up for enthusiasm — caution, regret if belated",
			"Source of enthusiasm — hold, gather allies, great achievement",
			"Persistently ill — caution, but never dying, hold on",
			"Deluded enthusiasm — retreat, change direction if awakened",
		})

	// 17. Tuỳ - Following
	refs[16] = build(17,
		"Following and adapting to circumstances",
		"Adapt to prevailing trends rather than fighting them. Success through flexibility and responsiveness. Follow worthy leaders; lead when appropriate.",
		"Adaptive following of worthy trends brings benefit without blame.",
		"Blind following without discernment leads to poor outcomes.",
		[]string{
			"Change in leadership — hold, go out, meet success",
			"Cling to small boy — caution, lose the mature man",
			"Cling to mature man — hold, lose small boy, find what sought",
			"Following has capture — retreat, sincerity keeps path clear",
			"Sincere in excellence — hold, fortunate alignment",
			"Bound and tied — retreat, western mountain sacrifice needed",
		})

	// 18. Cổ - Work on the Decayed
	refs[17] = build(18,
		"Correcting decay and past mistakes",
		"Time to fix inherited problems or neglected positions. Three days before and after the turning point — careful preparation and follow-through needed.",
		"Determined correction of past errors creates fresh opportunity.",
		"Leaving corruption unaddressed spreads the damage further.",
		[]string{
			"Father's decay — caution, son repairs, danger then success",
			"Mother's decay — hold, gentle persistence required",
			"Father's decay, small regret — caution, no great blame",
			"Tolerating father's decay — caution, going brings humiliation",
			"Father's decay, praised — hold, recognition for correction",
			"Not serving kings — hold, set sights higher than politics",
		})

	// 19. Lâm - Approach
	refs[18] = build(19,
		"Approaching growth with favorable momentum",
		"Conditions favor advance and expansion. Move forward confidently while momentum supports you. By eighth month, conditions change — time is limited.",
		"Decisive advance during favorable approach brings great success.",
		"Delaying too long misses the window of opportunity.",
		[]string{
			"Joint approach — advance, righteous persistence brings fortune",
			"Joint approach — advance, everything favorable",
			"Comfortable approach — hold, nothing unfavorable if worried",
			"Complete approach — hold, no blame in total commitment",
			"Wise approach — hold, great prince's conduct succeeds",
			"Generous approach — hold, good fortune, no blame",
		})

	// 20. Quán - Contemplation
	refs[19] = build(20,
		"Observation and contemplation from high vantage",
		"Time for careful observation before acting. View the situation from elevated perspective. Washing hands before offering — prepare properly for engagement.",
		"Clear observation enables wise decisions when action time comes.",
		"Acting without proper understanding of the situation leads to error.",
		[]string{
			"Childlike viewing — caution, forgivable for small people",
			"Peeping through door — caution, only women's persistence proper",
			"Viewing own life — hold, choose advance or retreat",
			"Viewing kingdom's glory — hold, worth being kingdom's guest",
			"Viewing own life — hold, noble person without blame",
			"Viewing their life — hold, noble person without blame",
		})

	// 21. Phệ Hạp - Biting Through
	refs[20] = build(21,
		"Decisive action biting through obstruction",
		"Obstacle must be removed decisively. Like biting through meat to unite jaws — forceful correction needed. Legal or disciplinary matters favor resolution.",
		"Determined decisive action clears obstacles and restores order.",
		"Half-measures leave obstruction in place, prolonging problems.",
		[]string{
			"Feet in stocks — caution, minor restraint prevents error",
			"Biting skin — hold, destroying nose in process, no blame",
			"Biting dried meat — caution, encounters poison, small regret",
			"Biting dried bony meat — hold, arrows of metal, persistence pays",
			"Biting dried meat — caution, finds gold, danger but no error",
			"Neck in stocks — retreat, ears disappear, deaf to warnings",
		})

	// 22. Bí - Grace
	refs[21] = build(22,
		"Grace and adornment enhancing substance",
		"Attention to form and presentation. Appearance matters but must complement substance. Small endeavors favored; major undertakings need more than polish.",
		"Tasteful refinement of strong fundamentals creates appeal.",
		"Superficial decoration hiding weak substance eventually fails.",
		[]string{
			"Adorning feet — hold, leave carriage and walk humbly",
			"Adorning beard — hold, style follows substance",
			"Graceful and moist — hold, perpetual persistence fortunate",
			"Graceful and white — hold, white horse arrives, not robber",
			"Grace in gardens — hold, silk roll small, eventual fortune",
			"Simple grace — hold, no blame in unadorned sincerity",
		})

	// 23. Bác - Splitting Apart
	refs[22] = build(23,
		"Splitting apart and erosion of position",
		"Foundation crumbling; retreat and preserve what remains. Acting now accelerates losses. Wait for the cycle to turn before rebuilding.",
		"Retreat and preservation during dissolution protects core assets.",
		"Attempting to advance while splitting apart magnifies losses.",
		[]string{
			"Legs of bed split — retreat, destroying persistence, misfortune",
			"Bed frame splits — retreat, destroying persistence, misfortune",
			"Splitting from them — hold, no blame in separation",
			"Bed split to skin — retreat, close to disaster",
			"String of fish — hold, palace women's favor, everything benefits",
			"Large fruit uneaten — hold, noble rides, small hut destroyed",
		})

	// 24. Phục - Return
	refs[23] = build(24,
		"Return and renewal after reaching bottom",
		"Turning point reached; light returns after darkness. Seven days cycle completes. Fresh beginning possible — act on new momentum with original principles.",
		"Return to fundamental principles enables fresh productive cycle.",
		"Missing the return opportunity extends the dark period unnecessarily.",
		[]string{
			"Return from short distance — advance, no deep regret",
			"Restful return — hold, fortunate through benevolence",
			"Repeated returns — caution, dangerous but no blame",
			"Walking among others — hold, return alone on the path",
			"Generous return — hold, no regret in self-examination",
			"Straying return — retreat, disaster for armies and country",
		})

	// 25. Vô Vọng - Innocence
	refs[24] = build(25,
		"Innocence and unexpected happenings",
		"Act with sincerity without ulterior motives. Unexpected events test your integrity. Natural spontaneous response succeeds; calculated manipulation fails.",
		"Sincere innocent action in harmony with nature brings good fortune.",
		"Hidden agendas and forced expectations invite unforeseen disasters.",
		[]string{
			"Innocent going — hold, fortunate through sincerity",
			"Not counting harvest — hold, then plowing brings gain",
			"Innocent disaster — retreat, tethered ox, passerby's gain",
			"Can be persisted — hold, no blame in steadfastness",
			"Innocent sickness — hold, no medicine, natural recovery",
			"Innocent going — retreat, has disaster, nothing favorable",
		})

	// 26. Đại Súc - Great Accumulation
	refs[25] = build(26,
		"Great accumulation of power and resources",
		"Substantial resources gathered; now deploy wisely. Not eating at home — go out and serve larger purpose. Daily renewal of virtue sustains strength.",
		"Accumulated power deployed for worthy purpose brings great achievement.",
		"Hoarding resources without productive use leads to stagnation.",
		[]string{
			"Danger present — caution, stop and avoid harm",
			"Axle straps removed — caution, vehicle cannot proceed",
			"Good horse pursuit — advance, daily practice, persistence pays",
			"Young bull's headboard — hold, supreme good fortune",
			"Gelded boar's tusk — advance, fortunate through restraint",
			"Carrying heaven's way — advance, success and penetration",
		})

	// 27. Di - Nourishment
	refs[26] = build(27,
		"Nourishment and proper sustenance",
		"Examine what you nourish and how you are nourished. Quality of inputs determines quality of outputs. Careful cultivation of resources required.",
		"Proper nourishment of body, mind, and position sustains strength.",
		"Poor nourishment choices weaken position and invite trouble.",
		[]string{
			"Setting aside divine turtle — retreat, watching others eat, misfortune",
			"Nourished from above — retreat, deviation leads to expedition disaster",
			"Turning away from nourishment — retreat, ten years fruitless",
			"Looking down for nourishment — retreat, tiger staring, no blame",
			"Deviating from principle — hold, staying home fortunate",
			"Source of nourishment — caution, danger, crossing water fortunate",
		})

	// 28. Đại Quá - Great Exceeding
	refs[27] = build(28,
		"Extraordinary burden exceeding normal capacity",
		"Ridgepole sagging from excessive weight. Extraordinary measures needed for extraordinary situation. Act boldly or retreat completely — half-measures fail.",
		"Decisive extraordinary action in exceptional circumstances succeeds.",
		"Ignoring critical overload leads to structural collapse.",
		[]string{
			"White thatch beneath — hold, no blame in careful foundation",
			"Dry willow sprouts — hold, old man gets young wife",
			"Ridgepole sags — retreat, misfortune from excess",
			"Ridgepole raised — hold, other intentions bring regret",
			"Dry willow flowers — hold, old woman gets young husband",
			"Wading drowns head — retreat, misfortune but no blame",
		})

	// 29. Tập Khảm - The Abysmal
	refs[28] = build(29,
		"Repeated danger and abysmal depths",
		"Danger upon danger, pit within pit. Maintain inner sincerity while navigating hazards. Flow like water — fill each pit then move on without stopping.",
		"Persistence through danger with inner truth eventually finds passage.",
		"Panic or recklessness in danger worsens the situation dramatically.",
		[]string{
			"Repeated pit, falling into hole — retreat, lost in depths",
			"Pit has danger — wait, small gains only possible",
			"Coming and going, pit upon pit — wait, rest before drowning",
			"Jug of wine, two bowls — hold, simple sincerity connects",
			"Pit not overflowing — hold, almost level, no fault",
			"Bound with cords — retreat, three years trapped, misfortune",
		})

	// 30. Ly - The Clinging
	refs[29] = build(30,
		"Clinging to brightness and clarity",
		"Fire clings to fuel — depend on proper support. Clarity illuminates but also exposes. Position in harmonious center brings lasting success.",
		"Clinging to proper support and maintaining clarity brings fortune.",
		"Clinging to wrong support or harsh illumination creates burnout.",
		[]string{
			"Treading confused — hold, respect avoids blame",
			"Yellow light — hold, supreme good fortune in center",
			"Light of setting sun — caution, without drum song, old age sighs",
			"Sudden arrival — retreat, burning, dying, discarded",
			"Tears flow — hold, sighing and lamenting, fortunate",
			"King's punitive expedition — hold, praise for breaking heads",
		})

	// 31. Hàm - Influence
	refs[30] = build(31,
		"Mutual influence and attraction",
		"Lake on mountain — receptive below, firm above creates attraction. Success through proper courtship and sensitivity to mutual response.",
		"Genuine mutual attraction and responsiveness creates lasting bonds.",
		"One-sided pursuit without reciprocity leads to disappointment.",
		[]string{
			"Influence in big toe — retreat, just beginning to stir",
			"Influence in calves — retreat, staying is fortunate",
			"Influence in thighs — caution, following others, regret",
			"Persistence fortunate — hold, wavering thoughts scatter",
			"Influence in back — hold, no regret in firm resolve",
			"Influence in jaws — caution, empty words accomplish nothing",
		})

	// 32. Hằng - Duration
	refs[31] = build(32,
		"Enduring constancy and perseverance",
		"Thunder and wind reinforce each other in lasting pattern. Success through steadfast commitment. Marriage of firm and yielding creates stability.",
		"Persistent commitment to worthy path brings lasting success.",
		"Restlessness and constant change prevent meaningful achievement.",
		[]string{
			"Deep duration seeking — retreat, persistent misfortune",
			"Regret disappears — caution, pull back from overreach",
			"Not making virtue durable — caution, shame possible",
			"No game in field — hold, nothing to hunt for",
			"Making virtue durable — hold, wife fortune, husband misfortune",
			"Restless duration — retreat, nothing favorable in flux",
		})

	// 33. Độn - Retreat
	refs[32] = build(33,
		"Strategic retreat and withdrawal",
		"Mountain under heaven — superior person distances from inferior. Orderly retreat preserves strength. Small things may continue; major actions unsuitable.",
		"Timely strategic retreat preserves resources for future advance.",
		"Failing to retreat when indicated leads to entanglement and loss.",
		[]string{
			"Retreating tail — retreat, danger, do not pursue",
			"Bound with yellow ox hide — hold, cannot be loosened",
			"Entangled retreat — caution, exhausting and dangerous",
			"Good retreat — hold, superior person fortunate",
			"Excellent retreat — hold, persistence fortunate",
			"Rich retreat — hold, nothing unfavorable",
		})

	// 34. Đại Tráng - Great Power
	refs[33] = build(34,
		"Great power and overwhelming strength",
		"Thunder in heaven — power expressed dramatically. Righteousness must guide power. Ram butting fence — power without wisdom entraps itself.",
		"Great power applied righteously achieves great accomplishments.",
		"Power applied arrogantly or carelessly becomes self-destructive.",
		[]string{
			"Power in toes — retreat, going forward invites disaster",
			"Persistence fortunate — hold, righteous power succeeds",
			"Small people use power — caution, noble person abstains",
			"Persistence fortunate — advance, fence opens, ram freed",
			"Loses ram easily — hold, no regret in detachment",
			"Ram butts fence — caution, cannot retreat or advance",
		})

	// 35. Tấn - Progress
	refs[34] = build(35,
		"Progress and advancement into light",
		"Sun rising over earth — rapid illumination and recognition. Marquis receives gifts and audiences multiply. Progress favored on multiple fronts.",
		"Advancing into clarity brings recognition and rewards.",
		"Resisting natural progress or hiding in darkness wastes opportunity.",
		[]string{
			"Advancing, pushed back — caution, persistence fortunate",
			"Advancing, sorrowful — hold, persistence fortunate through patience",
			"All regret disappears — hold, trust of masses gained",
			"Advancing like a hamster — caution, dangerous persistence",
			"Regret disappears — hold, gain and loss irrelevant",
			"Advancing with horns — caution, only for subduing city",
		})

	// 36. Minh Di - Darkening of Light
	refs[35] = build(36,
		"Brightness wounded and concealed",
		"Light driven underground — wisdom must hide during dark times. King Wen imprisoned by tyrant. Persevere inwardly while appearing ordinary outwardly.",
		"Concealing brilliance during dark periods preserves ability to act later.",
		"Displaying brightness in hostile environment invites suppression.",
		[]string{
			"Darkening light in flight — retreat, wings droop, fasting",
			"Darkening light, left thigh — hold, horse rescue succeeds",
			"Darkening light hunting south — hold, capture great leader",
			"Entering left belly — hold, get heart of darkening light",
			"Ji Zi's darkening light — hold, beneficial persistence",
			"Not light but dark — retreat, first ascends then falls",
		})

	// 37. Gia Nhân - The Family
	refs[36] = build(37,
		"Family order and proper relationships",
		"Wind from fire — words must have substance. Woman's persistence favorable when in proper role. Order within enables effectiveness without.",
		"Proper internal organization creates foundation for external success.",
		"Disorder at home undermines all external endeavors.",
		[]string{
			"Enclosed within home — hold, regret disappears through order",
			"Nothing to pursue — hold, attend to provisions within",
			"Family members grumbling — caution, regret but danger passes",
			"Enriching family — hold, great good fortune",
			"King approaches family — hold, no worry, mutual love",
			"Sincere and authoritative — hold, fortunate conclusion",
		})

	// 38. Khuê - Opposition
	refs[37] = build(38,
		"Opposition and estrangement",
		"Fire above lake — elements diverge. Small matters possible despite opposition. Strange circumstances require unconventional response.",
		"Managing opposition through small steps and indirect methods.",
		"Forcing resolution of deep opposition creates greater conflict.",
		[]string{
			"Regret disappears — hold, lost horse returns naturally",
			"Meeting master in lane — hold, no blame in informal encounter",
			"Wagon dragged, oxen halted — caution, man tattooed, bad start good end",
			"Isolated in opposition — hold, meeting great man, sincere exchange",
			"Regret disappears — hold, ancestor bites skin, no blame in going",
			"Isolated in opposition — retreat, pigs with mud, ghosts in wagon",
		})

	// 39. Kiển - Obstruction
	refs[38] = build(39,
		"Obstruction and difficulty ahead",
		"Water on mountain — dangerous path. Southwest favorable, northeast unfavorable. See great person for guidance. Turn back and gather strength.",
		"Recognizing obstruction early allows strategic repositioning.",
		"Pushing forward into clear obstruction magnifies difficulties.",
		[]string{
			"Going obstruction, coming praise — retreat, wait for better path",
			"King's servant: obstruction upon obstruction — retreat, not own doing",
			"Going obstruction, coming return — hold, internal joy in turning back",
			"Going obstruction, coming connection — retreat, join forces",
			"Great obstruction, friends come — hold, allies arrive",
			"Going obstruction, coming greatness — hold, fortunate to see great person",
		})

	// 40. Giải - Deliverance
	refs[39] = build(40,
		"Release and liberation from tension",
		"Thunder and rain — delivery comes. Southwest favorable; return quickly if nothing to pursue. Act decisively when release opportunity appears.",
		"Swift decisive action when opening appears completes liberation.",
		"Delaying action when release possible allows re-entanglement.",
		[]string{
			"No blame — hold, simple release without complication",
			"Catching three foxes — hold, yellow arrows, righteous fortune",
			"Carrying and riding — caution, attracts robbers, regret",
			"Release your thumb — hold, friend arrives with trust",
			"Noble's release — hold, small people withdraw, fortune",
			"Prince shoots hawk on wall — hold, catches it, everything favorable",
		})

	// 41. Tổn - Decrease
	refs[40] = build(41,
		"Decrease and strategic reduction",
		"Lake at mountain foot — decrease above enriches below. Genuine offering with simple vessels succeeds. Reduce excess to strengthen foundation.",
		"Strategic reduction in right areas strengthens core position.",
		"Clinging to excess depletes resources needed for essentials.",
		[]string{
			"Finishing task quickly, going — hold, no blame, consider decrease",
			"Beneficial persistence — hold, going is misfortune",
			"Three walking, one lost — hold, one walking gains friend",
			"Decreasing one's illness — hold, bringing joy quickly, no blame",
			"Someone adds ten pairs — hold, cannot be opposed, supreme fortune",
			"Not decreased, increased — advance, no blame, persistence fortunate",
		})

	// 42. Ích - Increase
	refs[41] = build(42,
		"Increase and beneficial growth",
		"Wind and thunder — increase through movement. Favorable to cross great water. Benefits flow down from above; seize opportunity for major undertaking.",
		"Capitalizing on favorable increase enables great achievement.",
		"Failing to use increase productively wastes the opportunity.",
		[]string{
			"Beneficial for great works — advance, supreme fortune, no blame",
			"Someone adds ten pairs — hold, eternal persistence fortunate",
			"Increased by bad events — hold, no blame, sincerity in middle",
			"Middle way, announce to prince — hold, beneficial for moving capital",
			"Sincere kindness — hold, no need to ask, supreme fortune",
			"No one increases — retreat, some strike at it, inconstant heart",
		})

	// 43. Quải - Breakthrough
	refs[42] = build(43,
		"Decisive breakthrough and resolution",
		"Lake rises to heaven — breakthrough must come. Announce at court; danger must be clearly stated. Armed force not recommended; have a destination.",
		"Decisive breakthrough displaces what must be removed.",
		"Incomplete breakthrough allows opposition to recover.",
		[]string{
			"Power in advancing toes — retreat, going without mastery fails",
			"Alarmed cry — hold, weapons ready, no fear despite evening",
			"Power in cheekbones — caution, misfortune, noble determined",
			"Buttocks skinned — retreat, walking difficult, led sheep, regret gone",
			"Weeds broken — hold, middle way, no blame",
			"No crying — retreat, finally misfortune comes",
		})

	// 44. Cấu - Coming to Meet
	refs[43] = build(44,
		"Unexpected encounter and temptation",
		"Wind under heaven — meeting rises unexpectedly. Woman powerful — do not marry such a woman. Yin unexpectedly intrudes upon yang.",
		"Cautious response to unexpected encounter avoids entrapment.",
		"Yielding to seductive appearance leads to adverse entanglement.",
		[]string{
			"Tied with metal brake — retreat, persistence fortunate",
			"Fish in bag — hold, no blame, not for guests",
			"Buttocks skinned — caution, going difficult, aware of danger",
			"No fish in bag — hold, rising misfortune from absence",
			"Willow wrapping melon — hold, contained, falls from heaven",
			"Coming to meet with horns — retreat, regret but no blame",
		})

	// 45. Tuỵ - Gathering Together
	refs[44] = build(45,
		"Gathering and assembly",
		"Lake over earth — waters gather. King approaches temple; see great person. Great offering brings success; destination favorable.",
		"Proper gathering under right leadership accomplishes great things.",
		"Disorganized gathering without purpose leads to chaos.",
		[]string{
			"Sincere but not complete — caution, disorder then gathering",
			"Drawn, fortunate — hold, no blame, sincerity in offering",
			"Gathering sighs — caution, nothing favorable, going no blame",
			"Great fortune — hold, no blame in central position",
			"Gathering has position — hold, no blame, not yet believed",
			"Sighing and crying — caution, no blame in final tears",
		})

	// 46. Thăng - Pushing Upward
	refs[45] = build(46,
		"Gradual ascent and advancement",
		"Tree growing from earth — steady upward growth. See great person without fear. Expedition to south brings fortune.",
		"Steady persistent effort achieves lasting advancement.",
		"Impatient rushing upward before ready leads to setback.",
		[]string{
			"Welcomed upward — advance, great fortune",
			"Sincerity makes offerings worthwhile — hold, no blame",
			"Ascending empty city — advance, no resistance",
			"King offers at Mount Qi — hold, fortunate, no blame",
			"Persistence fortunate — hold, ascending stairs step by step",
			"Ascending in dark — hold, beneficial unceasing persistence",
		})

	// 47. Khốn - Oppression
	refs[46] = build(47,
		"Exhaustion and confinement",
		"Lake with no water — depleted and confined. Words not believed. Noble person stakes life on will. Exhaustion tests character.",
		"Maintaining integrity during oppression preserves future opportunity.",
		"Despair or compromising integrity during oppression destroys prospects.",
		[]string{
			"Buttocks oppressed by stump — retreat, three years not seeing",
			"Oppressed by wine and food — hold, scarlet knee bands come",
			"Oppressed by stone — caution, resting on thorns, not seeing wife",
			"Coming slowly — retreat, oppressed in gold carriage, regret, ends",
			"Nose and feet cut — hold, oppressed by red knee bands, slowly joy",
			"Oppressed by vines — retreat, saying movement brings regret",
		})

	// 48. Tỉnh - The Well
	refs[47] = build(48,
		"The inexhaustible source and foundation",
		"Wood over water — well draws from deep. Town may change, well remains constant. Near completion but rope short — misfortune in almost reaching.",
		"Developing fundamental resources sustains ongoing activity.",
		"Neglecting the essential source while chasing surface depletes capability.",
		[]string{
			"Well mud, not eaten — retreat, old well, no creatures",
			"Well valley, fish caught — hold, jug broken, leaking",
			"Well cleared, not drunk — caution, heart pained, could be used",
			"Well lining — hold, no blame in maintenance",
			"Well clear, cold spring — hold, drinking possible",
			"Well collected, not covered — hold, sincerity, supreme fortune",
		})

	// 49. Cách - Revolution
	refs[48] = build(49,
		"Fundamental change and transformation",
		"Fire in lake — elements transform each other. Believed on completion day. Supreme success through righteousness; regret disappears.",
		"Decisive transformation when time is right achieves renewal.",
		"Premature revolution fails; delayed revolution misses opportunity.",
		[]string{
			"Bound with yellow ox hide — caution, stabilize before change",
			"Completion day revolution — advance, going fortunate",
			"Going misfortune, persistence danger — retreat, revolution talk thrice, then trust",
			"Regret disappears — hold, belief enables change, fortune",
			"Great person tiger change — hold, not yet divined, already believed",
			"Noble person leopard change — hold, small people change face",
		})

	// 50. Đỉnh - The Cauldron
	refs[49] = build(50,
		"Sacred vessel and supreme achievement",
		"Fire over wood — transformation vessel. Supreme success. Cauldron turns out the old, takes in the new. Cultural renewal through proper form.",
		"Transforming resources through proper method creates supreme value.",
		"Using sacred vessels improperly degrades their power.",
		[]string{
			"Cauldron upturned — hold, favorable for expelling bad",
			"Cauldron has contents — hold, my companion ill, cannot approach",
			"Cauldron ears changed — caution, fat pheasant uneaten, rain ends regret",
			"Cauldron leg broken — hold, prince's meal overturned, severe",
			"Cauldron yellow ears gold rings — hold, beneficial persistence",
			"Cauldron jade rings — hold, great fortune, everything favorable",
		})

	// 51. Chấn - The Arousing
	refs[50] = build(51,
		"Shock and thunder bringing movement",
		"Repeated thunder — shock upon shock. Shock brings success; laughing talk after fright. Hundred miles startled; sacrificial spoon unmoved.",
		"Maintaining composure through shock enables proper response.",
		"Panic during shock leads to losing what matters most.",
		[]string{
			"Shock comes — hold, then laughing talk, fortune",
			"Shock comes dangerously — caution, losing treasure, climb high",
			"Shock revives — caution, shocking action without blame",
			"Shock stuck in mud — retreat, movement mired",
			"Shock going and coming — caution, dangerous, nothing lost",
			"Shock brings confusion — retreat, neighbors warning, no blame if careful",
		})

	// 52. Cấn - Keeping Still
	refs[51] = build(52,
		"Stillness and meditation stopping movement",
		"Mountain upon mountain — complete stillness. Keep back still, not feeling body. Walking in courtyard, not seeing people. No blame.",
		"Proper stillness at right time centers and strengthens.",
		"Restless inability to stop dissipates energy uselessly.",
		[]string{
			"Keeping feet still — hold, no blame, beneficial continued persistence",
			"Keeping calves still — hold, not saving what follows, heart unhappy",
			"Keeping waist still — caution, splitting ribs, danger smothers heart",
			"Keeping body still — hold, no blame in trunk stillness",
			"Keeping jaws still — hold, words ordered, regret disappears",
			"Keeping still richly — hold, fortunate completion",
		})

	// 53. Tiệm - Development
	refs[52] = build(53,
		"Gradual progress and steady development",
		"Tree on mountain — grows gradually. Maiden marries; fortune through proper stages. Goose approaches shore step by step.",
		"Patient step-by-step development achieves lasting results.",
		"Rushing ahead of natural development creates instability.",
		[]string{
			"Goose approaches shore — retreat, small person danger, no blame",
			"Goose approaches cliff — hold, eating and drinking happily, fortune",
			"Goose approaches plateau — caution, husband goes not returning",
			"Goose approaches tree — hold, perhaps gets beam, no blame",
			"Goose approaches mound — hold, wife three years not conceiving",
			"Goose approaches heights — hold, feathers for ceremony, fortune",
		})

	// 54. Quy Muội - The Marrying Maiden
	refs[53] = build(54,
		"Improper position bringing misfortune",
		"Thunder over lake — movement without proper sequence. Going brings misfortune. Nothing favorable in any direction.",
		"Acting from improper position or premature timing brings problems.",
		"Patience until proper position available avoids wasted effort.",
		[]string{
			"Maiden marries as concubine — caution, lame can walk, fortunate going",
			"Squinting can see — hold, solitary person's persistence beneficial",
			"Maiden marries as slave — retreat, returns as concubine",
			"Maiden delays marriage — hold, late marriage has time",
			"Emperor Yi marries sister — hold, princess sleeves less fine",
			"Woman holds empty basket — retreat, man stabs sheep, no blood",
		})

	// 55. Phong - Abundance
	refs[54] = build(55,
		"Fullness and peak abundance",
		"Thunder and lightning — abundance at peak. King reaches greatest extent. Midday sun must decline. Enjoy peak but prepare for change.",
		"Maximum deployment during peak conditions achieves great results.",
		"Clinging to peak position accelerates inevitable decline.",
		[]string{
			"Meeting matched lord — hold, ten days no blame, going honored",
			"Screening abundance — hold, midday seeing Dipper, going gets doubt",
			"Screening canopy — caution, midday seeing froth, breaking arm",
			"Screening abundance — hold, midday seeing Dipper, meeting hidden lord",
			"Bringing brilliance — hold, praise and fortune come",
			"Abundance in house — retreat, screening family, peeping gate, three years solitary",
		})

	// 56. Lữ - The Wanderer
	refs[55] = build(56,
		"Travel and sojourning in foreign territory",
		"Fire on mountain — wanderer passes through. Small success through proper behavior while traveling. Stranger must be doubly careful.",
		"Careful modest conduct during transition maintains safety.",
		"Arrogance or carelessness while vulnerable invites disaster.",
		[]string{
			"Wanderer on trifles — retreat, brings disaster on self",
			"Wanderer reaches inn — hold, has resources, gets young servant",
			"Wanderer burns inn — retreat, loses young servant, danger",
			"Wanderer at place — hold, has goods and axe, heart not pleased",
			"Shooting pheasant — hold, one arrow, finally praise and mandate",
			"Bird burns nest — retreat, wanderer first laughs then cries",
		})

	// 57. Tốn - The Gentle
	refs[56] = build(57,
		"Gentle penetration and gradual influence",
		"Wind following wind — gentle persistence. Small success through subtle influence. Favorable to see great person and cross great water.",
		"Persistent gentle influence achieves what force cannot.",
		"Excessive gentleness without direction becomes weakness.",
		[]string{
			"Advancing and retreating — caution, soldier's persistence beneficial",
			"Penetrating under bed — hold, using diviners many, fortune",
			"Repeated penetration — caution, regret from indecision",
			"Regret disappears — caution, catching three kinds in hunt",
			"Persistence fortunate — hold, regret disappears, nothing unfavorable",
			"Penetrating under bed — retreat, loses goods and axe, persistence misfortune",
		})

	// 58. Đoài - The Joyous
	refs[57] = build(58,
		"Joy and harmonious communication",
		"Lakes together — joy through exchange. Success through persistence. Friends discuss and practice together.",
		"Genuine mutual enjoyment and exchange creates lasting benefit.",
		"Excessive pleasure-seeking or flattery corrupts and weakens.",
		[]string{
			"Harmonious joy — hold, fortunate sincerity",
			"Sincere joy — hold, fortunate, regret disappears",
			"Coming joy — retreat, misfortune from seeking pleasure",
			"Deliberated joy — hold, not yet at rest, warding off illness happiness",
			"Sincerity toward stripper — hold, danger exists",
			"Leading joy — retreat, seductive and unfulfilling",
		})

	// 59. Hoán - Dispersion
	refs[58] = build(59,
		"Dissolution and dispersal of obstacles",
		"Wind over water — disperses stagnation. King approaches temple. Favorable to cross great water and persist.",
		"Dissolving rigidity and obstacles enables fresh flow.",
		"Excessive dispersion without regathering leads to scatter.",
		[]string{
			"Rescue with horse strength — hold, fortunate assistance",
			"Dispersion runs to support — hold, regret disappears",
			"Dispersing the self — hold, no regret in letting go",
			"Dispersing one's group — hold, supreme fortune, gathering on hill",
			"Dispersing sweat, great cries — hold, dispersing king's residence",
			"Dispersing blood, departing — hold, no blame in distancing from harm",
		})

	// 60. Tiết - Limitation
	refs[59] = build(60,
		"Proper limits and self-regulation",
		"Water over lake — proper measure. Success but bitter limitation not to be persisted. Joints give structure to bamboo.",
		"Appropriate limitation creates structure and sustainability.",
		"Excessive limitation becomes oppression and fails.",
		[]string{
			"Not going out of gate — hold, no blame in staying within",
			"Not going out of courtyard — retreat, misfortune from missing timing",
			"No limitation — retreat, then lamentation, no blame",
			"Peaceful limitation — hold, success through contentment",
			"Sweet limitation — hold, fortune in going, esteem",
			"Bitter limitation — retreat, persistence misfortune, regret disappears",
		})

	// 61. Trung Phu - Inner Truth
	refs[60] = build(61,
		"Inner sincerity reaching outward",
		"Wind over lake — inner truth affects all. Dolphins fortunate. Favorable to cross great water and persist.",
		"Deep sincerity communicated outward creates trust and influence.",
		"Surface sincerity without inner truth is eventually exposed.",
		[]string{
			"Being prepared — hold, fortune, having others, no peace",
			"Crane calls in shade — hold, young one responds, I have cup",
			"Getting counterpart — caution, now beating, now resting",
			"Moon almost full — hold, horses paired lost, no blame",
			"Possessing sincerity bond — hold, no blame in connection",
			"Cockcrow reaching heaven — retreat, persistence misfortune",
		})

	// 62. Tiểu Quá - Small Exceeding
	refs[61] = build(62,
		"Small matters exceed; great matters wait",
		"Thunder over mountain — small excess. Small success through persistence. Great things should not be attempted now.",
		"Success in small matters; restraint in large undertakings.",
		"Attempting great things during small excess invites failure.",
		[]string{
			"Flying bird brings misfortune — retreat, nothing to do about it",
			"Passing ancestor, meeting grandmother — hold, not reaching prince",
			"Not excessive guarding — caution, following harms, misfortune",
			"No blame, meeting without passing — hold, danger in going, caution",
			"Dense clouds from west — hold, prince shoots, takes in cave",
			"Not meeting, passing — retreat, flying bird nets, misfortune",
		})

	// 63. Ký Tế - After Completion
	refs[62] = build(63,
		"Order achieved but requiring maintenance",
		"Water over fire — complete but precarious. Initial small success. Persistence beneficial but disorder threatens.",
		"Vigilant maintenance preserves achieved order.",
		"Relaxing after completion invites disorder to return.",
		[]string{
			"Dragging wheels, wetting tail — hold, no blame in slowness",
			"Woman loses curtain — hold, do not pursue, seven days regained",
			"High ancestor attacks ghost land — caution, three years conquers",
			"Jacket has padding — caution, all day guarding against leaks",
			"Eastern neighbor kills ox — hold, less than western neighbor's sincerity",
			"Wetting the head — retreat, dangerous despite completion",
		})

	// 64. Vị Tế - Before Completion
	refs[63] = build(64,
		"Not yet complete with potential ahead",
		"Fire over water — not yet mingled. Little fox almost across wets tail. Nothing favorable yet. Persistence needed for eventual success.",
		"Continued effort toward completion despite obstacles.",
		"Abandoning the effort at the threshold wastes all prior work.",
		[]string{
			"Wetting tail — retreat, regretful rushing",
			"Dragging wheels — hold, persistence fortunate",
			"Before completion, going misfortune — caution, favorable crossing water",
			"Persistence fortunate, regret disappears — advance, attacking ghost land",
			"Persistence fortunate, no regret — advance, noble's light, sincere fortune",
			"Sincere drinking wine — caution, wetting head loses propriety",
		})

	return refs
}
