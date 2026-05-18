/**
 * Kinh Dich Service — Domain Services
 *
 * Pure domain logic: hao encoding, hexagram resolution, nuclear/transformed
 * hexagram computation, Ngu Hanh classification, full reading orchestration.
 *
 * No I/O, no infrastructure imports.
 */

import type {
  HaoReading,
  HaoState,
  KinhDichReading,
  MarkovData,
  NguHanh,
  NguHanhDynamic,
  NguHanhResult,
} from './models.js';

// ── Hexagram library (embedded, no file I/O) ─────────────────────────────────

/** Trigram binary line patterns: name → [b0, b1, b2] */
export const TRIGRAM_LINES: Record<string, [number, number, number]> = {
  Qian:  [1, 1, 1],
  Dui:   [1, 1, 0],
  Li:    [1, 0, 1],
  Zhen:  [1, 0, 0],
  Xun:   [0, 1, 1],
  Kan:   [0, 1, 0],
  Gen:   [0, 0, 1],
  Kun:   [0, 0, 0],
};

/** Trigram metadata: element + symbol */
export const TRIGRAMS: Record<string, { element: NguHanh; symbol: string }> = {
  Qian: { element: 'Kim', symbol: '☰' },
  Dui:  { element: 'Kim', symbol: '☱' },
  Li:   { element: 'Hoa', symbol: '☲' },
  Zhen: { element: 'Moc', symbol: '☳' },
  Xun:  { element: 'Moc', symbol: '☴' },
  Kan:  { element: 'Thuy', symbol: '☵' },
  Gen:  { element: 'Tho', symbol: '☶' },
  Kun:  { element: 'Tho', symbol: '☷' },
};

/** Hexagram metadata entries (id, name, chinese, upper trigram, lower trigram) */
interface QueMeta { id: number; name: string; chinese: string; upper: string; lower: string }

export const QUE_META: QueMeta[] = [
  { id:  1, name: 'Kiền',       chinese: '乾', upper: 'Qian', lower: 'Qian' },
  { id:  2, name: 'Khôn',       chinese: '坤', upper: 'Kun',  lower: 'Kun'  },
  { id:  3, name: 'Truân',      chinese: '屯', upper: 'Kan',  lower: 'Zhen' },
  { id:  4, name: 'Mông',       chinese: '蒙', upper: 'Gen',  lower: 'Kan'  },
  { id:  5, name: 'Nhu',        chinese: '需', upper: 'Kan',  lower: 'Qian' },
  { id:  6, name: 'Tụng',       chinese: '訟', upper: 'Qian', lower: 'Kan'  },
  { id:  7, name: 'Sư',         chinese: '師', upper: 'Kun',  lower: 'Kan'  },
  { id:  8, name: 'Tỷ',         chinese: '比', upper: 'Kan',  lower: 'Kun'  },
  { id:  9, name: 'Tiểu Súc',   chinese: '小畜',upper: 'Xun',  lower: 'Qian' },
  { id: 10, name: 'Lý',         chinese: '履', upper: 'Qian', lower: 'Dui'  },
  { id: 11, name: 'Thái',       chinese: '泰', upper: 'Kun',  lower: 'Qian' },
  { id: 12, name: 'Bĩ',         chinese: '否', upper: 'Qian', lower: 'Kun'  },
  { id: 13, name: 'Đồng Nhân',  chinese: '同人',upper: 'Qian', lower: 'Li'   },
  { id: 14, name: 'Đại Hữu',    chinese: '大有',upper: 'Li',   lower: 'Qian' },
  { id: 15, name: 'Khiêm',      chinese: '謙', upper: 'Kun',  lower: 'Gen'  },
  { id: 16, name: 'Dự',         chinese: '豫', upper: 'Zhen', lower: 'Kun'  },
  { id: 17, name: 'Tùy',        chinese: '隨', upper: 'Dui',  lower: 'Zhen' },
  { id: 18, name: 'Cổ',         chinese: '蠱', upper: 'Gen',  lower: 'Xun'  },
  { id: 19, name: 'Lâm',        chinese: '臨', upper: 'Kun',  lower: 'Dui'  },
  { id: 20, name: 'Quán',       chinese: '觀', upper: 'Xun',  lower: 'Kun'  },
  { id: 21, name: 'Phệ Hạp',    chinese: '噬嗑',upper: 'Li',   lower: 'Zhen' },
  { id: 22, name: 'Bí',         chinese: '賁', upper: 'Gen',  lower: 'Li'   },
  { id: 23, name: 'Bác',        chinese: '剝', upper: 'Gen',  lower: 'Kun'  },
  { id: 24, name: 'Phục',       chinese: '復', upper: 'Kun',  lower: 'Zhen' },
  { id: 25, name: 'Vô Vọng',    chinese: '無妄',upper: 'Qian', lower: 'Zhen' },
  { id: 26, name: 'Đại Súc',    chinese: '大畜',upper: 'Gen',  lower: 'Qian' },
  { id: 27, name: 'Di',         chinese: '頤', upper: 'Gen',  lower: 'Zhen' },
  { id: 28, name: 'Đại Quá',    chinese: '大過',upper: 'Dui',  lower: 'Xun'  },
  { id: 29, name: 'Tập Khảm',   chinese: '坎', upper: 'Kan',  lower: 'Kan'  },
  { id: 30, name: 'Ly',         chinese: '離', upper: 'Li',   lower: 'Li'   },
  { id: 31, name: 'Hàm',        chinese: '咸', upper: 'Dui',  lower: 'Gen'  },
  { id: 32, name: 'Hằng',       chinese: '恆', upper: 'Zhen', lower: 'Xun'  },
  { id: 33, name: 'Độn',        chinese: '遯', upper: 'Qian', lower: 'Gen'  },
  { id: 34, name: 'Đại Tráng',  chinese: '大壯',upper: 'Zhen', lower: 'Qian' },
  { id: 35, name: 'Tấn',        chinese: '晉', upper: 'Li',   lower: 'Kun'  },
  { id: 36, name: 'Minh Di',    chinese: '明夷',upper: 'Kun',  lower: 'Li'   },
  { id: 37, name: 'Gia Nhân',   chinese: '家人',upper: 'Xun',  lower: 'Li'   },
  { id: 38, name: 'Khuê',       chinese: '睽', upper: 'Li',   lower: 'Dui'  },
  { id: 39, name: 'Kiển',       chinese: '蹇', upper: 'Kan',  lower: 'Gen'  },
  { id: 40, name: 'Giải',       chinese: '解', upper: 'Zhen', lower: 'Kan'  },
  { id: 41, name: 'Tổn',        chinese: '損', upper: 'Gen',  lower: 'Dui'  },
  { id: 42, name: 'Ích',        chinese: '益', upper: 'Xun',  lower: 'Zhen' },
  { id: 43, name: 'Quải',       chinese: '夬', upper: 'Dui',  lower: 'Qian' },
  { id: 44, name: 'Cấu',        chinese: '姤', upper: 'Qian', lower: 'Xun'  },
  { id: 45, name: 'Tụy',        chinese: '萃', upper: 'Dui',  lower: 'Kun'  },
  { id: 46, name: 'Thăng',      chinese: '升', upper: 'Kun',  lower: 'Xun'  },
  { id: 47, name: 'Khốn',       chinese: '困', upper: 'Dui',  lower: 'Kan'  },
  { id: 48, name: 'Tỉnh',       chinese: '井', upper: 'Kan',  lower: 'Xun'  },
  { id: 49, name: 'Cách',       chinese: '革', upper: 'Dui',  lower: 'Li'   },
  { id: 50, name: 'Đỉnh',       chinese: '鼎', upper: 'Li',   lower: 'Xun'  },
  { id: 51, name: 'Chấn',       chinese: '震', upper: 'Zhen', lower: 'Zhen' },
  { id: 52, name: 'Cấn',        chinese: '艮', upper: 'Gen',  lower: 'Gen'  },
  { id: 53, name: 'Tiệm',       chinese: '漸', upper: 'Xun',  lower: 'Gen'  },
  { id: 54, name: 'Qui Muội',   chinese: '歸妹',upper: 'Zhen', lower: 'Dui'  },
  { id: 55, name: 'Phong',      chinese: '豐', upper: 'Zhen', lower: 'Li'   },
  { id: 56, name: 'Lữ',         chinese: '旅', upper: 'Li',   lower: 'Gen'  },
  { id: 57, name: 'Tốn',        chinese: '巽', upper: 'Xun',  lower: 'Xun'  },
  { id: 58, name: 'Đoái',       chinese: '兌', upper: 'Dui',  lower: 'Dui'  },
  { id: 59, name: 'Hoán',       chinese: '渙', upper: 'Xun',  lower: 'Kan'  },
  { id: 60, name: 'Tiết',       chinese: '節', upper: 'Kan',  lower: 'Dui'  },
  { id: 61, name: 'Trung Phu',  chinese: '中孚',upper: 'Xun',  lower: 'Dui'  },
  { id: 62, name: 'Tiểu Quá',   chinese: '小過',upper: 'Zhen', lower: 'Gen'  },
  { id: 63, name: 'Ký Tế',      chinese: '既濟',upper: 'Kan',  lower: 'Li'   },
  { id: 64, name: 'Vị Tế',      chinese: '未濟',upper: 'Li',   lower: 'Kan'  },
];

/** Minimal hexagram data (core meaning, trend, lines) */
interface QueData {
  coreMeaning: string;
  state: { trend: string };
  lines: Array<{ outcome: string; action: string }>;
}

/** Minimal data for all 64 hexagrams (trend + action only — sufficient for reading). */
const QUE_DATA: Record<number, QueData> = {
  1:  { coreMeaning: 'Sức mạnh thuần dương, tiến lên', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'TIẾN'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'HUNG',action:'LUI'}] },
  2:  { coreMeaning: 'Âm nhu thuần khiết, nương theo', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  3:  { coreMeaning: 'Khó khăn ban đầu, cần kiên nhẫn', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'LỆ',action:'CHỜ'},{outcome:'LỆ',action:'CHỜ'},{outcome:'LỆ',action:'LUI'},{outcome:'LỆ',action:'CHỜ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  4:  { coreMeaning: 'Mông muội, cần học hỏi', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'CHỜ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  5:  { coreMeaning: 'Chờ đợi thời cơ', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  6:  { coreMeaning: 'Tranh tụng, cần hòa giải', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'VÔ CỬU',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  7:  { coreMeaning: 'Quân đội, lãnh đạo và kỷ luật', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  8:  { coreMeaning: 'Đoàn kết, tìm kiếm liên minh', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  9:  { coreMeaning: 'Tích lũy nhỏ, từng bước', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  10: { coreMeaning: 'Thận trọng tiến lên', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'}] },
  11: { coreMeaning: 'Thái: thịnh vượng, hanh thông', state: { trend: 'THUẬN LỢI — mạnh' }, lines: [{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  12: { coreMeaning: 'Bế tắc, chia cắt', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  13: { coreMeaning: 'Hòa đồng, mục tiêu chung', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  14: { coreMeaning: 'Đại hữu, sở hữu lớn', state: { trend: 'THUẬN LỢI — rất mạnh' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'TIẾN'}] },
  15: { coreMeaning: 'Khiêm tốn, hoàn thiện', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  16: { coreMeaning: 'Hân hoan, chuẩn bị hành động', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HỐI',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'}] },
  17: { coreMeaning: 'Đi theo, thích nghi', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  18: { coreMeaning: 'Sửa chữa sai lầm', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  19: { coreMeaning: 'Tiếp cận, cơ hội tăng trưởng', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  20: { coreMeaning: 'Quan sát, suy ngẫm', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  21: { coreMeaning: 'Phán quyết, xử lý vấn đề', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'}] },
  22: { coreMeaning: 'Vẻ đẹp bề ngoài, hình thức', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  23: { coreMeaning: 'Xói mòn, suy yếu', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  24: { coreMeaning: 'Phục hồi, trở lại', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  25: { coreMeaning: 'Vô vọng, thành thật', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  26: { coreMeaning: 'Tích lũy lớn, giữ lại', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'TIẾN'}] },
  27: { coreMeaning: 'Nuôi dưỡng, chăm sóc', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  28: { coreMeaning: 'Thái quá, gánh nặng', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  29: { coreMeaning: 'Hiểm nguy liên tiếp', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'}] },
  30: { coreMeaning: 'Sáng tỏ, bám víu', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  31: { coreMeaning: 'Cảm ứng, thu hút', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  32: { coreMeaning: 'Hằng cửu, bền lâu', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  33: { coreMeaning: 'Rút lui chiến lược', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  34: { coreMeaning: 'Sức mạnh to lớn, tiến bước', state: { trend: 'THUẬN LỢI — rất mạnh' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  35: { coreMeaning: 'Tiến bộ, thăng tiến', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  36: { coreMeaning: 'Ánh sáng bị che phủ', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  37: { coreMeaning: 'Gia đình, trật tự', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  38: { coreMeaning: 'Đối lập, bất đồng', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'}] },
  39: { coreMeaning: 'Trở ngại, bước tiến khó', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  40: { coreMeaning: 'Giải thoát, tháo gỡ', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  41: { coreMeaning: 'Giảm bớt, hy sinh', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'TIẾN'}] },
  42: { coreMeaning: 'Ích lợi, tăng trưởng', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  43: { coreMeaning: 'Quyết đoán, bứt phá', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  44: { coreMeaning: 'Gặp gỡ cám dỗ', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  45: { coreMeaning: 'Tập hợp, đoàn tụ', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'}] },
  46: { coreMeaning: 'Thăng tiến, vươn lên', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'TIẾN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'}] },
  47: { coreMeaning: 'Khốn khổ, kiệt sức', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  48: { coreMeaning: 'Giếng nước, nguồn cội', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  49: { coreMeaning: 'Cách mạng, đổi mới', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'TIẾN'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  50: { coreMeaning: 'Đỉnh cao, thành tựu', state: { trend: 'THUẬN LỢI — mạnh' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  51: { coreMeaning: 'Chấn động, sự kiện bất ngờ', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'}] },
  52: { coreMeaning: 'Bất động, suy ngẫm', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  53: { coreMeaning: 'Tiệm tiến, từng bước', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'}] },
  54: { coreMeaning: 'Về nhà, không đúng chỗ', state: { trend: 'BẤT LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  55: { coreMeaning: 'Phong phú, đỉnh cao', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  56: { coreMeaning: 'Lang thang, viễn khách', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  57: { coreMeaning: 'Thuận theo, nhẹ nhàng', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HỐI',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  58: { coreMeaning: 'Vui vẻ, hài hòa', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'HUNG',action:'LUI'}] },
  59: { coreMeaning: 'Phân tán, giải quyết', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  60: { coreMeaning: 'Điều tiết, tiết chế', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  61: { coreMeaning: 'Trung thực, chân thành', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  62: { coreMeaning: 'Quá mức nhỏ, chú ý chi tiết', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'VÔ CỬU',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  63: { coreMeaning: 'Đã hoàn thành, cẩn thận duy trì', state: { trend: 'THUẬN LỢI' }, lines: [{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'LỆ',action:'THẬN'},{outcome:'LỆ',action:'THẬN'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'}] },
  64: { coreMeaning: 'Chưa hoàn thành, cơ hội phía trước', state: { trend: 'TRUNG TÍNH' }, lines: [{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'HUNG',action:'LUI'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'GIỮ'},{outcome:'CÁT',action:'TIẾN'}] },
};

// ── Lookup maps (built once) ─────────────────────────────────────────────────

const LINES_TO_TRIGRAM = new Map<string, string>();
for (const [name, bits] of Object.entries(TRIGRAM_LINES)) {
  LINES_TO_TRIGRAM.set(bits.join(','), name);
}

const TRIGRAMS_TO_QUE = new Map<string, number>();
for (const meta of QUE_META) {
  TRIGRAMS_TO_QUE.set(`${meta.upper}|${meta.lower}`, meta.id);
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const LAO_DUONG_THRESHOLD = 0.75;
const THIEU_DUONG_THRESHOLD = 0.10;
const LAO_AM_THRESHOLD = -0.75;

const STATE_TO_BINARY: Record<HaoState, 0 | 1> = {
  LAO_DUONG: 1, THIEU_DUONG: 1, THIEU_AM: 0, LAO_AM: 0,
};
const STATE_TO_CHANGING: Record<HaoState, boolean> = {
  LAO_DUONG: true, THIEU_DUONG: false, THIEU_AM: false, LAO_AM: true,
};

const HAO_LABELS: Record<number, string> = {
  1: 'So hao — Tam ly / Tin tuc',
  2: 'Nhi hao — Co ban / BCTC',
  3: 'Tam hao — Gia / Ky thuat',
  4: 'Tu hao — Dong tien ngoai',
  5: 'Ngu hao — Nganh / Sector',
  6: 'Thuong hao — Vi mo / Macro',
};

const OUTCOME_SCORES: Record<string, number> = {
  'CÁT': 0.3, 'HUNG': -0.3, 'VÔ CỬU': 0.0, 'HỐI': -0.15, 'LẬN': -0.2, 'LỆ': -0.1,
  'CAT': 0.3, 'VO CUU': 0.0, 'HOI': -0.15, 'LAN': -0.2, 'LE': -0.1,
};

const TREND_SCORE_MAP: Array<[string, number]> = [
  ['THUẬN LỢI', 0.5], ['THUAN LOI', 0.5],
  ['BẤT LỢI', -0.5], ['BAT LOI', -0.5],
  ['TRUNG TÍNH', 0.0], ['TRUNG TINH', 0.0],
];

const GENERATION: Record<NguHanh, NguHanh> = {
  Moc: 'Hoa', Hoa: 'Tho', Tho: 'Kim', Kim: 'Thuy', Thuy: 'Moc',
};
const DESTRUCTION: Record<NguHanh, NguHanh> = {
  Moc: 'Tho', Tho: 'Thuy', Thuy: 'Hoa', Hoa: 'Kim', Kim: 'Moc',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function classifyHao(score: number): HaoState {
  if (score > LAO_DUONG_THRESHOLD) return 'LAO_DUONG';
  if (score >= THIEU_DUONG_THRESHOLD) return 'THIEU_DUONG';
  if (score < LAO_AM_THRESHOLD) return 'LAO_AM';
  return 'THIEU_AM';
}

function encodeHaos(scores: number[]): HaoReading[] {
  return scores.map((raw, i): HaoReading => {
    const clamped = Math.max(-1, Math.min(1, raw));
    const state = classifyHao(clamped);
    const position = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return {
      position,
      label: HAO_LABELS[position] ?? `Hao ${position}`,
      rawScore: clamped,
      state,
      binary: STATE_TO_BINARY[state],
      isChanging: STATE_TO_CHANGING[state],
    };
  });
}

function haosToSignals(haos: HaoReading[]): number[] {
  return haos.map((h) => h.binary);
}

function resolveHexagram(signals: number[]): number {
  const lowerKey = signals.slice(0, 3).join(',');
  const upperKey = signals.slice(3, 6).join(',');
  const lowerName = LINES_TO_TRIGRAM.get(lowerKey);
  const upperName = LINES_TO_TRIGRAM.get(upperKey);
  if (!lowerName || !upperName) throw new Error(`Invalid trigram pattern lower=${lowerKey} upper=${upperKey}`);
  const queId = TRIGRAMS_TO_QUE.get(`${upperName}|${lowerName}`);
  if (queId === undefined) throw new Error(`No que for upper=${upperName} lower=${lowerName}`);
  return queId;
}

function computeHoQue(signals: number[]): number {
  const hoSignals = [signals[1]!, signals[2]!, signals[3]!, signals[2]!, signals[3]!, signals[4]!];
  return resolveHexagram(hoSignals);
}

function computeBienQue(haos: HaoReading[]): number {
  const transformed = haos.map((h): 0 | 1 => {
    if (h.state === 'LAO_DUONG') return 0;
    if (h.state === 'LAO_AM') return 1;
    return h.binary;
  });
  return resolveHexagram(transformed);
}

function getChangingLines(haos: HaoReading[]): number[] {
  return haos.filter((h) => h.isChanging).map((h) => h.position);
}

function extractOutcomeScore(text: string): number {
  const upper = text.toUpperCase();
  for (const [kw, score] of Object.entries(OUTCOME_SCORES)) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

function extractTrendScore(trend: string): number {
  const upper = trend.toUpperCase();
  for (const [kw, score] of TREND_SCORE_MAP) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

function extractAction(actionText: string): string {
  const upper = actionText.toUpperCase();
  if (['TIẾN', 'TIEN'].some((k) => upper.includes(k))) return 'MUA';
  if (['LUI'].some((k) => upper.includes(k))) return 'BAN';
  if (['GIỮ', 'GIU'].some((k) => upper.includes(k))) return 'GIU';
  if (['CHỜ', 'CHO'].some((k) => upper.includes(k))) return 'CHO';
  if (['THẬN', 'THAN'].some((k) => upper.includes(k))) return 'THAN TRONG';
  return 'GIU';
}

function majorityVote(actions: string[]): string {
  if (actions.length === 0) return 'GIU';
  const counts: Record<string, number> = {};
  for (const a of actions) counts[a] = (counts[a] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'GIU';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify the Ngu Hanh interaction between lower/upper trigram elements.
 * Pure function, no I/O.
 */
export function classifyNguHanh(
  lowerElement: NguHanh,
  upperElement: NguHanh,
): NguHanhResult {
  let dynamic: NguHanhDynamic;
  let score: number;
  let interpretation: string;

  if (lowerElement === upperElement) {
    dynamic = 'SAME'; score = 0.1;
    interpretation = 'Cùng hành — tăng cường xu hướng hiện tại';
  } else if (GENERATION[lowerElement] === upperElement) {
    dynamic = 'TUONG_SINH'; score = 0.3;
    interpretation = 'Nội lực sinh ngoại lực — xu hướng bền vững';
  } else if (GENERATION[upperElement] === lowerElement) {
    dynamic = 'TUONG_SINH'; score = 0.2;
    interpretation = 'Ngoại lực hỗ trợ nội lực — môi trường thuận lợi';
  } else if (DESTRUCTION[lowerElement] === upperElement) {
    dynamic = 'TUONG_KHAC'; score = -0.3;
    interpretation = 'Nội lực khắc ngoại lực — mâu thuẫn nội tại';
  } else if (DESTRUCTION[upperElement] === lowerElement) {
    dynamic = 'TUONG_KHAC'; score = -0.3;
    interpretation = 'Ngoại lực triệt tiêu nội lực — áp lực bên ngoài';
  } else {
    dynamic = 'NEUTRAL'; score = 0.0;
    interpretation = 'Trung tính — không tương tác đặc biệt';
  }

  return { lower: lowerElement, upper: upperElement, dynamic, score, interpretation };
}

/**
 * Compute a full Kinh Dich reading from 6 raw scores [-1, +1].
 * Pure function — no I/O.
 */
export function computeReading(
  stockCode: string,
  scores: number[],
  markovData?: MarkovData | null,
): KinhDichReading {
  if (scores.length !== 6) {
    throw new Error(`computeReading: expected exactly 6 scores, got ${scores.length}`);
  }

  const haos = encodeHaos(scores);
  const signals = haosToSignals(haos);
  const queChinhNumber = resolveHexagram(signals);
  const queMeta = QUE_META.find((q) => q.id === queChinhNumber);
  if (!queMeta) throw new Error(`No meta for hexagram ${queChinhNumber}`);
  const queData = QUE_DATA[queChinhNumber];
  if (!queData) throw new Error(`No data for hexagram ${queChinhNumber}`);

  const lowerTrigramMeta = TRIGRAMS[queMeta.lower];
  const upperTrigramMeta = TRIGRAMS[queMeta.upper];
  const lowerTrigram = {
    name: queMeta.lower,
    element: (lowerTrigramMeta?.element ?? 'Tho') as NguHanh,
    symbol: lowerTrigramMeta?.symbol ?? '',
  };
  const upperTrigram = {
    name: queMeta.upper,
    element: (upperTrigramMeta?.element ?? 'Tho') as NguHanh,
    symbol: upperTrigramMeta?.symbol ?? '',
  };

  const hoQueNumber = computeHoQue(signals);
  const hoQueMeta = QUE_META.find((q) => q.id === hoQueNumber);
  const hoQueData = QUE_DATA[hoQueNumber];
  const hoQue = {
    number: hoQueNumber,
    name: hoQueMeta?.name ?? `Que ${hoQueNumber}`,
    chinese: hoQueMeta?.chinese ?? '',
    coreMeaning: hoQueData?.coreMeaning ?? '',
  };

  const bienQueNumber = computeBienQue(haos);
  const bienQueMeta = QUE_META.find((q) => q.id === bienQueNumber);
  const bienQueData = QUE_DATA[bienQueNumber];
  const bienQue = {
    number: bienQueNumber,
    name: bienQueMeta?.name ?? `Que ${bienQueNumber}`,
    chinese: bienQueMeta?.chinese ?? '',
    coreMeaning: bienQueData?.coreMeaning ?? '',
  };

  const nguHanh = classifyNguHanh(lowerTrigram.element, upperTrigram.element);
  const changingLines = getChangingLines(haos);
  const trendRaw = queData.state.trend;
  const baseScore = extractTrendScore(trendRaw);

  const activeIndices: number[] =
    changingLines.length > 0
      ? changingLines.map((pos) => pos - 1)
      : [4];

  const haoLines = queData.lines;
  const outcomeScores: number[] = [];
  const actions: string[] = [];

  for (const idx of activeIndices) {
    const haoLine = haoLines[idx];
    if (haoLine) {
      outcomeScores.push(extractOutcomeScore(haoLine.outcome));
      actions.push(extractAction(haoLine.action));
    }
  }

  const avgOutcome =
    outcomeScores.length > 0
      ? outcomeScores.reduce((s, v) => s + v, 0) / outcomeScores.length
      : 0.0;
  const combinedScore = baseScore + avgOutcome;

  let confidence = Math.min(Math.abs(combinedScore) / 0.8, 1.0);
  if (markovData && markovData.probability > 0) {
    confidence = confidence * 0.7 + markovData.probability * 0.3;
  }
  confidence = Math.round(confidence * 1000) / 1000;

  const tradingSignal = majorityVote(actions);
  const tradingSignalDisplay =
    combinedScore >= 0 ? `${tradingSignal} (tích cực)` : `${tradingSignal} (tiêu cực)`;

  const queChiNh = {
    number: queChinhNumber,
    name: queMeta.name,
    chinese: queMeta.chinese,
    coreMeaning: queData.coreMeaning,
    trend: trendRaw,
    tradingSignal: tradingSignalDisplay,
    confidence,
  };

  const markov = markovData
    ? { nextMostLikely: markovData.nextMostLikely, nextName: markovData.nextName, probability: markovData.probability }
    : null;

  const scoreSign = combinedScore >= 0 ? 'tích cực' : 'tiêu cực';
  const actionNote =
    `KHUYẾN NGHỊ: ${tradingSignal} — Quẻ ${queChiNh.name} (${queChiNh.number}) ${scoreSign}` +
    `, xu hướng: ${trendRaw.split('—')[0]?.trim() ?? trendRaw}` +
    `. Độ tin cậy: ${Math.round(confidence * 100)}%.`;

  const changingDesc =
    changingLines.length > 0
      ? `Hào động: ${changingLines.join(', ')} — biến chuyển sang ${bienQue.name}.`
      : `Không có hào động — quẻ ổn định.`;

  const overallReading =
    `[${stockCode}] Quẻ ${queMeta.name} (${queChinhNumber}) ${queMeta.chinese}. ` +
    `${queData.coreMeaning} ` +
    `Xu hướng: ${trendRaw}. ` +
    `Hộ quẻ (ẩn sâu): ${hoQue.name} — ${hoQue.coreMeaning.slice(0, 80)}. ` +
    `${changingDesc} ` +
    `Ngũ Hành: ${nguHanh.interpretation}. ` +
    actionNote;

  return {
    stockCode,
    timestamp: new Date().toISOString(),
    haos,
    lowerTrigram,
    upperTrigram,
    queChiNh,
    hoQue,
    bienQue,
    nguHanh,
    changingLines,
    markov,
    actionNote,
    overallReading,
  };
}
