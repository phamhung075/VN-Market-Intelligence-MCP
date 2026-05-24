/**
 * reading-scorer — Unit Tests
 *
 * Tests for extractOutcomeScore(), extractTrendScore(), extractAction(), majorityVote().
 * Minimum 5 test cases per AC-3.
 */

import { describe, it, expect } from 'bun:test';
import {
  extractOutcomeScore,
  extractTrendScore,
  extractAction,
  majorityVote,
} from './index.js';

// ── extractOutcomeScore ───────────────────────────────────────────────────────

describe('extractOutcomeScore', () => {
  // Case 1: recognised positive keyword (CÁT)
  it('returns 0.3 for text containing CÁT', () => {
    expect(extractOutcomeScore('Đại CÁT — Hanh')).toBe(0.3);
  });

  // Case 2: recognised negative keyword (HUNG)
  it('returns -0.3 for text containing HUNG', () => {
    expect(extractOutcomeScore('HUNG — Hung hãn')).toBe(-0.3);
  });

  // Case 3: recognised neutral ASCII keyword (VO CUU)
  it('returns 0.0 for text containing VO CUU (ASCII form)', () => {
    expect(extractOutcomeScore('VO CUU — Không lỗi')).toBe(0.0);
  });

  // Case 4: recognised negative small keyword (LAN / LẬN)
  it('returns -0.2 for text containing LAN', () => {
    expect(extractOutcomeScore('Tiểu LAN')).toBe(-0.2);
  });

  // Case 5 (Edge): unknown/unrecognised text → defaults to 0.0 (Option A)
  it('returns 0.0 for completely unknown outcome text', () => {
    expect(extractOutcomeScore('UNKNOWN OUTCOME XYZ')).toBe(0.0);
  });

  // Case 6: empty string → defaults to 0.0
  it('returns 0.0 for empty string', () => {
    expect(extractOutcomeScore('')).toBe(0.0);
  });

  // Case 7: case-insensitive matching (lowercase input)
  it('matches keyword case-insensitively (cat → CÁT not matched; CAT matched)', () => {
    // 'cat' uppercased = 'CAT' which IS in OUTCOME_SCORES as 0.3
    expect(extractOutcomeScore('cat')).toBe(0.3);
  });
});

// ── extractTrendScore ─────────────────────────────────────────────────────────

describe('extractTrendScore', () => {
  // Case 1: favourable trend (Vietnamese with diacritics)
  it('returns 0.5 for THUẬN LỢI text', () => {
    expect(extractTrendScore('Xu hướng Thuận Lợi — Thị trường tăng')).toBe(0.5);
  });

  // Case 2: unfavourable trend (ASCII)
  it('returns -0.5 for BAT LOI text', () => {
    expect(extractTrendScore('BAT LOI — Thị trường giảm')).toBe(-0.5);
  });

  // Case 3: neutral trend (ASCII)
  it('returns 0.0 for TRUNG TINH text', () => {
    expect(extractTrendScore('TRUNG TINH — Không rõ xu hướng')).toBe(0.0);
  });

  // Case 4: BẤT LỢI with diacritics
  it('returns -0.5 for BẤT LỢI with diacritics', () => {
    expect(extractTrendScore('BẤT LỢI')).toBe(-0.5);
  });

  // Case 5 (Edge): unknown trend text → defaults to 0.0
  it('returns 0.0 for unknown trend text', () => {
    expect(extractTrendScore('Some random text without keywords')).toBe(0.0);
  });

  // Case 6: empty string → defaults to 0.0
  it('returns 0.0 for empty string', () => {
    expect(extractTrendScore('')).toBe(0.0);
  });
});

// ── extractAction ─────────────────────────────────────────────────────────────

describe('extractAction', () => {
  // Case 1: advance / buy signal (TIEN)
  it('returns MUA for text containing TIEN', () => {
    expect(extractAction('Tiến — Mua vào')).toBe('MUA');
  });

  // Case 2: retreat / sell signal (LUI)
  it('returns BAN for text containing LUI', () => {
    expect(extractAction('Lui — Bán ra')).toBe('BAN');
  });

  // Case 3: hold signal (GIU)
  it('returns GIU for text containing GIU', () => {
    expect(extractAction('Giữ vững vị thế')).toBe('GIU');
  });

  // Case 4: wait signal (CHO)
  it('returns CHO for text containing CHO', () => {
    expect(extractAction('Chờ đợi — không hành động')).toBe('CHO');
  });

  // Case 5: caution signal (THAN)
  it('returns THAN TRONG for text containing THAN', () => {
    expect(extractAction('Thận trọng — cẩn thận')).toBe('THAN TRONG');
  });

  // Case 6 (Edge): unknown action text → defaults to GIU (Option A)
  it('returns GIU for unknown action text', () => {
    expect(extractAction('Unrecognised action keyword')).toBe('GIU');
  });

  // Case 7: empty string → defaults to GIU
  it('returns GIU for empty string', () => {
    expect(extractAction('')).toBe('GIU');
  });
});

// ── majorityVote ──────────────────────────────────────────────────────────────

describe('majorityVote', () => {
  // Case 1: clear majority
  it('returns MUA when MUA appears most often', () => {
    expect(majorityVote(['MUA', 'GIU', 'MUA', 'BAN', 'MUA'])).toBe('MUA');
  });

  // Case 2: single action
  it('returns the only action when array has one element', () => {
    expect(majorityVote(['BAN'])).toBe('BAN');
  });

  // Case 3: two-way tie — first counted wins
  it('returns first encountered action on a tie', () => {
    // 'GIU' and 'CHO' each appear once; Object.entries order gives GIU first
    expect(majorityVote(['GIU', 'CHO'])).toBe('GIU');
  });

  // Case 4 (Edge): empty array → defaults to GIU
  it('returns GIU for empty actions array', () => {
    expect(majorityVote([])).toBe('GIU');
  });

  // Case 5: all same action
  it('returns BAN when all actions are BAN', () => {
    expect(majorityVote(['BAN', 'BAN', 'BAN'])).toBe('BAN');
  });

  // Case 6: mixed with THAN TRONG
  it('returns THAN TRONG when it has the highest count', () => {
    expect(majorityVote(['THAN TRONG', 'GIU', 'THAN TRONG'])).toBe('THAN TRONG');
  });
});
