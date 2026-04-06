// src/domain/services/kinhDich/kinhDichFormatter.ts
// Vietnamese plain-text formatter for KinhDichReading.
// Pure domain — NO I/O imports.

import type { KinhDichReading } from "./kinhDichReading.js";
import type { HaoState } from "./haoEncoder.js";

// ── Hào state Vietnamese labels ────────────────────────────────────────────────

const HAO_STATE_LABELS: Record<HaoState, string> = {
  LAO_DUONG: "Lao Duong ⚡ (qua mua, sap dao chieu)",
  THIEU_DUONG: "Thieu Duong (tang on dinh)",
  THIEU_AM: "Thieu Am (giam on dinh)",
  LAO_AM: "Lao Am ⚡ (qua ban, sap hoi phuc)",
};

// ── Hào position labels (short, for the 6-line section) ───────────────────────

const HAO_POSITION_LABELS: Record<number, string> = {
  1: "So hao   (Tam ly)",
  2: "Nhi hao  (Co ban)",
  3: "Tam hao  (Gia)   ",
  4: "Tu hao   (Ngoai) ",
  5: "Ngu hao  (Nganh) ",
  6: "Thuong hao (Vi mo)",
};

// ── Main formatter ─────────────────────────────────────────────────────────────

/**
 * Format a KinhDichReading into a Vietnamese plain-text report.
 *
 * All output is ASCII-compatible plain text (no Markdown, no rich formatting)
 * suitable for Telegram or CLI display.
 */
export function formatReading(reading: KinhDichReading): string {
  const { queChiNh, hoQue, bienQue, nguHanh, haos, changingLines, markov } =
    reading;

  const lines: string[] = [];

  // ── Header ──
  lines.push(
    `=== KINH DICH: ${reading.stockCode} — Que ${queChiNh.name} (${queChiNh.number}) ${queChiNh.chinese} ===`,
  );
  lines.push("");

  // ── Que chinh ──
  lines.push(`Que chinh: ${queChiNh.name} — ${queChiNh.coreMeaning.slice(0, 120)}`);
  lines.push(`  Xu huong: ${queChiNh.trend}`);
  lines.push(`  Tin hieu: ${queChiNh.tradingSignal} | Do tin cay: ${Math.round(queChiNh.confidence * 100)}%`);
  lines.push("");

  // ── 6 Hao ──
  lines.push("6 Hao:");
  for (const hao of haos) {
    const posLabel = HAO_POSITION_LABELS[hao.position] ?? `Hao ${hao.position}`;
    const stateLabel = HAO_STATE_LABELS[hao.state];
    lines.push(`  ${posLabel}: ${stateLabel}`);
  }
  lines.push("");

  // ── Hao dong (changing lines) ──
  if (changingLines.length > 0) {
    const posStr = changingLines.join(", ");
    lines.push(
      `Hao dong: ${posStr} — bien chuyen, su thay doi dang den (→ ${bienQue.name})`,
    );
  } else {
    lines.push("Hao dong: Khong co hao dong — que on dinh, xu huong hien tai ben vung");
  }
  lines.push("");

  // ── Ho que ──
  const hoCoreMeaning = hoQue.coreMeaning.slice(0, 100);
  lines.push(
    `Ho que (an sau): ${hoQue.name} (${hoQue.number}) ${hoQue.chinese} — ${hoCoreMeaning}`,
  );

  // ── Bien que ──
  const bienCoreMeaning = bienQue.coreMeaning.slice(0, 100);
  lines.push(
    `Bien que (tuong lai): ${bienQue.name} (${bienQue.number}) ${bienQue.chinese} — ${bienCoreMeaning}`,
  );
  lines.push("");

  // ── Ngu Hanh ──
  const lower = reading.lowerTrigram;
  const upper = reading.upperTrigram;
  lines.push(
    `Ngu Hanh: ${lower.element} ${lower.symbol} (${lower.name}) vs ${upper.element} ${upper.symbol} (${upper.name}) — ${nguHanh.dynamic}`,
  );
  lines.push(`  ${nguHanh.interpretation}`);
  lines.push(`  Diem ngu hanh: ${nguHanh.score >= 0 ? "+" : ""}${nguHanh.score.toFixed(2)}`);
  lines.push("");

  // ── Markov (optional) ──
  if (markov) {
    const pct = Math.round(markov.probability * 100);
    lines.push(
      `Markov: Xac suat chuyen sang ${markov.nextName} (${markov.nextMostLikely}): ${pct}%`,
    );
    lines.push("");
  }

  // ── Action note ──
  lines.push(reading.actionNote);

  return lines.join("\n");
}
