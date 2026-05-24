/**
 * Kinh Dich Service — Hexagram Library Data
 *
 * Thin domain data module: exports QUE_META (all 64 hexagram entries).
 * Extracted from domain/services.ts (deprecated) so callers can reference
 * hexagram metadata without importing the superseded service layer.
 *
 * No I/O, no infrastructure imports. Pure data.
 */

import type { NguHanh } from './models.js';

/** Hexagram metadata entries (id, name, chinese, upper trigram, lower trigram) */
export interface QueMeta {
  id: number;
  name: string;
  chinese: string;
  upper: string;
  lower: string;
}

/** All 64 hexagram metadata entries. */
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
