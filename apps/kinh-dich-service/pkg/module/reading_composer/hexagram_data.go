package reading_composer

// trigrams contains metadata for each trigram: element + symbol.
var trigrams = map[string]struct {
	element string
	symbol  string
}{
	"Qian": {element: "Kim", symbol: "☰"},
	"Dui":  {element: "Kim", symbol: "☱"},
	"Li":   {element: "Hoa", symbol: "☲"},
	"Zhen": {element: "Moc", symbol: "☳"},
	"Xun":  {element: "Moc", symbol: "☴"},
	"Kan":  {element: "Thuy", symbol: "☵"},
	"Gen":  {element: "Tho", symbol: "☶"},
	"Kun":  {element: "Tho", symbol: "☷"},
}

// queMeta contains hexagram metadata.
type queMeta struct {
	id      int
	name    string
	chinese string
	upper   string
	lower   string
}

// queMetaList is the master list of all 64 hexagrams.
var queMetaList = []queMeta{
	{1, "Kien", "乾", "Qian", "Qian"},
	{2, "Khon", "坤", "Kun", "Kun"},
	{3, "Truan", "屯", "Kan", "Zhen"},
	{4, "Mong", "蒙", "Gen", "Kan"},
	{5, "Nhu", "需", "Kan", "Qian"},
	{6, "Tung", "訟", "Qian", "Kan"},
	{7, "Su", "師", "Kun", "Kan"},
	{8, "Ty", "比", "Kan", "Kun"},
	{9, "Tieu Suc", "小畜", "Xun", "Qian"},
	{10, "Ly", "履", "Qian", "Dui"},
	{11, "Thai", "泰", "Kun", "Qian"},
	{12, "Bi", "否", "Qian", "Kun"},
	{13, "Dong Nhan", "同人", "Qian", "Li"},
	{14, "Dai Huu", "大有", "Li", "Qian"},
	{15, "Khiem", "謙", "Kun", "Gen"},
	{16, "Du", "豫", "Zhen", "Kun"},
	{17, "Tuy", "隨", "Dui", "Zhen"},
	{18, "Co", "蠱", "Gen", "Xun"},
	{19, "Lam", "臨", "Kun", "Dui"},
	{20, "Quan", "觀", "Xun", "Kun"},
	{21, "Phe Hap", "嚙嗑", "Li", "Zhen"},
	{22, "Bi", "賌", "Gen", "Li"},
	{23, "Bac", "剥", "Gen", "Kun"},
	{24, "Phuc", "復", "Kun", "Zhen"},
	{25, "Vo Vong", "無妄", "Qian", "Zhen"},
	{26, "Dai Suc", "大畜", "Gen", "Qian"},
	{27, "Di", "頤", "Gen", "Zhen"},
	{28, "Dai Qua", "大過", "Dui", "Xun"},
	{29, "Tap Kham", "坎", "Kan", "Kan"},
	{30, "Ly", "離", "Li", "Li"},
	{31, "Ham", "咸", "Dui", "Gen"},
	{32, "Hang", "恆", "Zhen", "Xun"},
	{33, "Don", "遁", "Qian", "Gen"},
	{34, "Dai Trang", "大壯", "Zhen", "Qian"},
	{35, "Tan", "晉", "Li", "Kun"},
	{36, "Minh Di", "明夷", "Kun", "Li"},
	{37, "Gia Nhan", "家人", "Xun", "Li"},
	{38, "Khue", "睡", "Li", "Dui"},
	{39, "Kien", "蹇", "Kan", "Gen"},
	{40, "Giai", "解", "Zhen", "Kan"},
	{41, "Ton", "損", "Gen", "Dui"},
	{42, "Ich", "益", "Xun", "Zhen"},
	{43, "Quai", "夬", "Dui", "Qian"},
	{44, "Cau", "姤", "Qian", "Xun"},
	{45, "Tuy", "萃", "Dui", "Kun"},
	{46, "Thang", "升", "Kun", "Xun"},
	{47, "Khon", "困", "Dui", "Kan"},
	{48, "Tinh", "井", "Kan", "Xun"},
	{49, "Cach", "革", "Dui", "Li"},
	{50, "Dinh", "鼎", "Li", "Xun"},
	{51, "Chan", "震", "Zhen", "Zhen"},
	{52, "Can", "艮", "Gen", "Gen"},
	{53, "Tiem", "漸", "Xun", "Gen"},
	{54, "Qui Muoi", "歸妹", "Zhen", "Dui"},
	{55, "Phong", "豐", "Zhen", "Li"},
	{56, "Lu", "旅", "Li", "Gen"},
	{57, "Ton", "巽", "Xun", "Xun"},
	{58, "Doai", "兌", "Dui", "Dui"},
	{59, "Hoan", "渙", "Xun", "Kan"},
	{60, "Tiet", "節", "Kan", "Dui"},
	{61, "Trung Phu", "中孚", "Xun", "Dui"},
	{62, "Tieu Qua", "小過", "Zhen", "Gen"},
	{63, "Ky Te", "既濟", "Kan", "Li"},
	{64, "Vi Te", "未濟", "Li", "Kan"},
}

// queMetaMap provides O(1) lookup by hexagram ID.
var queMetaMap map[int]*queMeta

func init() {
	queMetaMap = make(map[int]*queMeta)
	for i := range queMetaList {
		queMetaMap[queMetaList[i].id] = &queMetaList[i]
	}
}

// getQueMeta returns metadata for a hexagram by ID.
func getQueMeta(id int) *queMeta {
	return queMetaMap[id]
}

// queData contains hexagram line data for scoring.
type queData struct {
	coreMeaning string
	trend       string
	lines       []lineData
}

// lineData contains outcome and action for a single line.
type lineData struct {
	outcome string
	action  string
}

// queDataMap contains line data for all 64 hexagrams.
var queDataMap = map[int]*queData{
	1:  {coreMeaning: "Suc manh thuan duong, tien len", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "TIEN"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "HUNG", action: "LUI"}}},
	2:  {coreMeaning: "Am nhu thuan khiet, nuong theo", trend: "TRUNG TINH", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	3:  {coreMeaning: "Kho khan ban dau, can kien nhan", trend: "BAT LOI", lines: []lineData{{outcome: "LE", action: "CHO"}, {outcome: "LE", action: "CHO"}, {outcome: "LE", action: "LUI"}, {outcome: "LE", action: "CHO"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	4:  {coreMeaning: "Mong muoi, can hoc hoi", trend: "TRUNG TINH", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "CHO"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}}},
	5:  {coreMeaning: "Cho doi thoi co", trend: "TRUNG TINH", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}}},
	6:  {coreMeaning: "Tranh tung, can hoa giai", trend: "BAT LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "VO CUU", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	7:  {coreMeaning: "Quan doi, lanh dao va ky luat", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	8:  {coreMeaning: "Doan ket, tim kiem lien minh", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	9:  {coreMeaning: "Tich luy nho, tung buoc", trend: "TRUNG TINH", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	10: {coreMeaning: "Than trong tien len", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}}},
	11: {coreMeaning: "Thai: thinh vuong, hanh thong", trend: "THUAN LOI — manh", lines: []lineData{{outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	12: {coreMeaning: "Be tac, chia cat", trend: "BAT LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	13: {coreMeaning: "Hoa dong, muc tieu chung", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}}},
	14: {coreMeaning: "Dai huu, so huu lon", trend: "THUAN LOI — rat manh", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "TIEN"}}},
	15: {coreMeaning: "Khiem ton, hoan thien", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	16: {coreMeaning: "Han hoan, chuan bi hanh dong", trend: "THUAN LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HOI", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}}},
	17: {coreMeaning: "Di theo, thich nghi", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	18: {coreMeaning: "Sua chua sai lam", trend: "TRUNG TINH", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}}},
	19: {coreMeaning: "Tiep can, co hoi tang truong", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	20: {coreMeaning: "Quan sat, suy ngam", trend: "TRUNG TINH", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	21: {coreMeaning: "Phan quyet, xu ly van de", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}}},
	22: {coreMeaning: "Ve dep be ngoai, hinh thuc", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}}},
	23: {coreMeaning: "Xoi mon, suy yeu", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	24: {coreMeaning: "Phuc hoi, tro lai", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	25: {coreMeaning: "Vo vong, thanh that", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	26: {coreMeaning: "Tich luy lon, giu lai", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "TIEN"}}},
	27: {coreMeaning: "Nuoi duong, cham soc", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	28: {coreMeaning: "Thai qua, ganh nang", trend: "BAT LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	29: {coreMeaning: "Hiem nguy lien tiep", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}}},
	30: {coreMeaning: "Sang to, bam viu", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	31: {coreMeaning: "Cam ung, thu hut", trend: "THUAN LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	32: {coreMeaning: "Hang cuu, ben lau", trend: "THUAN LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	33: {coreMeaning: "Rut lui chien luoc", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	34: {coreMeaning: "Suc manh to lon, tien buoc", trend: "THUAN LOI — rat manh", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	35: {coreMeaning: "Tien bo, thang tien", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	36: {coreMeaning: "Anh sang bi che phu", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	37: {coreMeaning: "Gia dinh, trat tu", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	38: {coreMeaning: "Doi lap, bat dong", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}}},
	39: {coreMeaning: "Tro ngai, buoc tien kho", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	40: {coreMeaning: "Giai thoat, thao go", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	41: {coreMeaning: "Giam bot, hy sinh", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "TIEN"}}},
	42: {coreMeaning: "Ich loi, tang truong", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	43: {coreMeaning: "Quyet doan, but pha", trend: "THUAN LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	44: {coreMeaning: "Gap go cam do", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	45: {coreMeaning: "Tap hop, doan tu", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "LE", action: "THAN"}}},
	46: {coreMeaning: "Thang tien, vuon len", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "TIEN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}}},
	47: {coreMeaning: "Khon kho, kiet suc", trend: "BAT LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	48: {coreMeaning: "Gieng nuoc, nguon coi", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	49: {coreMeaning: "Cach mang, doi moi", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "TIEN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	50: {coreMeaning: "Dinh cao, thanh tuu", trend: "THUAN LOI — manh", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	51: {coreMeaning: "Chan dong, su kien bat ngo", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}}},
	52: {coreMeaning: "Bat dong, suy ngam", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	53: {coreMeaning: "Tiem tien, tung buoc", trend: "THUAN LOI", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}}},
	54: {coreMeaning: "Ve nha, khong dung cho", trend: "BAT LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	55: {coreMeaning: "Phong phu, dinh cao", trend: "THUAN LOI", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	56: {coreMeaning: "Lang thang, vien khach", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	57: {coreMeaning: "Thuan theo, nhe nhang", trend: "THUAN LOI", lines: []lineData{{outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HOI", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	58: {coreMeaning: "Vui ve, hai hoa", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "HUNG", action: "LUI"}}},
	59: {coreMeaning: "Phan tan, giai quyet", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	60: {coreMeaning: "Dieu tiet, tiet che", trend: "TRUNG TINH", lines: []lineData{{outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	61: {coreMeaning: "Trung thuc, chan thanh", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	62: {coreMeaning: "Qua muc nho, chu y chi tiet", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "VO CUU", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	63: {coreMeaning: "Da hoan thanh, can than duy tri", trend: "THUAN LOI", lines: []lineData{{outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "LE", action: "THAN"}, {outcome: "LE", action: "THAN"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}}},
	64: {coreMeaning: "Chua hoan thanh, co hoi phia truoc", trend: "TRUNG TINH", lines: []lineData{{outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "HUNG", action: "LUI"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "GIU"}, {outcome: "CAT", action: "TIEN"}}},
}

// getQueData returns line data for a hexagram by ID.
func getQueData(id int) *queData {
	return queDataMap[id]
}
