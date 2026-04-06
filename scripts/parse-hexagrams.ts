#!/usr/bin/env bun
// scripts/parse-hexagrams.ts
// Parse all 64 Kinh Dịch markdown files and generate QUE_DATA TypeScript code.
// Usage: bun run scripts/parse-hexagrams.ts

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const SOURCE_DIR = "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert";
const TARGET_FILE = join(import.meta.dir, "../src/domain/services/kinhDich/hexagramLibrary.ts");

// ── Outcome normalisation ────────────────────────────────────────────────────
// Map non-standard outcomes from source markdown to one of:
// CÁT | HUNG | VÔ CỬU | HỐI | LẬN | LỆ
function normaliseOutcome(raw: string): string {
  const u = raw.toUpperCase();

  // Standard values — if found verbatim, keep
  if (u.includes("VÔ CỬU")) return raw; // keep full text for display
  if (u.includes("HUNG")) return raw;
  if (u.includes("HỐI VONG") || u.includes("HOI VONG")) return raw; // contains HỐI
  if (u.includes("HỐI")) return raw;
  if (u.includes("LẬN")) return raw;
  if (u.includes("LỆ")) return raw;
  if (u.includes("CÁT")) return raw; // NGUYÊN CÁT, ĐẠI CÁT still contain CÁT

  // Non-standard mappings based on meaning:
  // DỰ = khen ngợi (praise) → CÁT (good)
  if (u.includes("DỰ")) return `CÁT (${raw.trim()})`;
  // VÔ ƯU = no worries → VÔ CỬU
  if (u.includes("VÔ ƯU")) return `VÔ CỬU — ${raw.trim()}`;
  // VÔ BẤT LỢI = nothing unfavorable → CÁT
  if (u.includes("VÔ BẤT LỢI")) return `CÁT — ${raw.trim()}`;
  // TRUNG TÍNH = neutral → VÔ CỬU
  if (u.includes("TRUNG TÍNH") || u.includes("TRUNG TINH")) return `VÔ CỬU — ${raw.trim()}`;
  // LỢI TRINH = beneficial constancy → CÁT
  if (u.includes("LỢI TRINH")) return `CÁT — ${raw.trim()}`;
  // CỬU = fault/regret → VÔ CỬU (with qualifier)
  if (u.includes("CỬU")) return `VÔ CỬU — ${raw.trim()}`;
  // HỈ = joy → CÁT
  if (u.includes("HỈ")) return `CÁT — ${raw.trim()}`;
  // VÔ SƠ HỮU CHUNG → VÔ CỬU
  if (u.includes("VÔ SƠ")) return `VÔ CỬU — ${raw.trim()}`;
  // HỮU CHUNG = has completion → CÁT
  if (u.includes("HỮU CHUNG")) return `CÁT — ${raw.trim()}`;
  // VÔ HỐI = no regret → VÔ CỬU
  if (u.includes("VÔ HỐI")) return `VÔ CỬU — ${raw.trim()}`;
  // VÔ LỢI = no benefit → HUNG
  if (u.includes("VÔ LỢI")) return `HUNG — ${raw.trim()}`;

  // Default fallback: keep as-is (will be flagged in tests if unrecognised)
  return raw;
}

// ── Action normalisation ────────────────────────────────────────────────────
// Ensure action starts with one of: TIẾN | LUI | GIỮ | CHỜ | THẬN
function normaliseAction(raw: string): string {
  const u = raw.toUpperCase();
  // Check if already starts with a keyword
  if (u.startsWith("TIẾN") || u.startsWith("TIEN")) return raw;
  if (u.startsWith("LUI")) return raw;
  if (u.startsWith("GIỮ") || u.startsWith("GIU")) return raw;
  if (u.startsWith("CHỜ") || u.startsWith("CHO ")) return raw;
  if (u.startsWith("THẬN") || u.startsWith("THAN")) return raw;
  return raw; // already valid
}

// ── Escape template literal backticks ───────────────────────────────────────
function esc(s: string): string {
  return s.replace(/`/g, "'").replace(/\\/g, "\\\\").replace(/\$\{/g, "\\${");
}

// ── Markdown parser ──────────────────────────────────────────────────────────

interface ParsedLine {
  position: number;
  type: "yang" | "yin";
  name: string;
  chinese: string;
  vietnamese: string;
  outcome: string;
  action: string;
  interpretation: string;
}

interface ParsedHexagram {
  id: number;
  coreMeaning: string;
  judgmentChinese: string;
  judgmentVietnamese: string;
  judgmentInterpretation: string;
  imageDescription: string;
  imageAction: string;
  stateTrend: string;
  stateCareer: string;
  stateRelationship: string;
  stateHealth: string;
  stateWarning: string;
  lines: ParsedLine[];
}

function parseHexagram(filePath: string): ParsedHexagram | null {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Extract id from first heading: "# 15. Khiêm 謙"
  const headingMatch = lines[0]?.match(/^#\s+(\d+)\./);
  if (!headingMatch) {
    console.error(`No id found in ${filePath}`);
    return null;
  }
  const id = parseInt(headingMatch[1]!, 10);

  // coreMeaning: first blockquote line (line starting with ">")
  let coreMeaning = "";
  for (const line of lines) {
    const bqMatch = line.match(/^>\s+\*\*(.+?)\*\*/);
    if (bqMatch) {
      coreMeaning = bqMatch[1]!.trim();
      break;
    }
    // Also handle plain blockquote without bold markers
    const plainBq = line.match(/^>\s+(.+)/);
    if (plainBq && !coreMeaning) {
      coreMeaning = plainBq[1]!.trim();
      break;
    }
  }

  // ── Judgment section ────────────────────────────────────────────────────────
  let judgmentChinese = "";
  let judgmentVietnamese = "";
  let judgmentInterpretation = "";

  const judgeStart = lines.findIndex((l) => l.startsWith("## Phán Đoán"));
  if (judgeStart >= 0) {
    for (let i = judgeStart + 1; i < Math.min(judgeStart + 20, lines.length); i++) {
      const l = lines[i]!;
      if (l.startsWith("## ") && i > judgeStart + 1) break; // next section
      const kwMatch = l.match(/^\*\*Kinh văn:\*\*\s*(.+)/);
      if (kwMatch) judgmentChinese = kwMatch[1]!.trim();
      const dvMatch = l.match(/^\*\*Dịch nghĩa:\*\*\s*(.+)/);
      if (dvMatch) judgmentVietnamese = dvMatch[1]!.trim();
      const luanMatch = l.match(/^\*\*Luận giải:\*\*\s*(.+)/);
      if (luanMatch) {
        // Gather multi-line interpretation
        let interp = luanMatch[1]!.trim();
        for (let j = i + 1; j < lines.length; j++) {
          const nextL = lines[j]!;
          if (nextL.startsWith("## ") || nextL.startsWith("### ")) break;
          if (nextL.trim() === "") continue;
          if (nextL.startsWith("**")) break;
          interp += " " + nextL.trim();
        }
        judgmentInterpretation = interp.trim();
      }
    }
  }

  // ── Image (Đại Tượng) section ───────────────────────────────────────────────
  let imageDescription = "";
  let imageAction = "";

  const imgStart = lines.findIndex((l) => l.startsWith("## Đại Tượng"));
  if (imgStart >= 0) {
    for (let i = imgStart + 1; i < Math.min(imgStart + 15, lines.length); i++) {
      const l = lines[i]!;
      if (l.startsWith("## ") && i > imgStart + 1) break;
      const tMatch = l.match(/^\*\*Tượng:\*\*\s*(.+)/);
      if (tMatch) imageDescription = tMatch[1]!.trim();
      const aMatch = l.match(/^\*\*Hành động:\*\*\s*(.+)/);
      if (aMatch) imageAction = aMatch[1]!.trim();
    }
  }

  // ── State analysis table ─────────────────────────────────────────────────────
  let stateTrend = "";
  let stateCareer = "";
  let stateRelationship = "";
  let stateHealth = "";
  let stateWarning = "";

  const stateStart = lines.findIndex((l) => l.includes("Phân Tích Trạng Thái"));
  if (stateStart >= 0) {
    for (let i = stateStart + 1; i < Math.min(stateStart + 20, lines.length); i++) {
      const l = lines[i]!;
      if (l.startsWith("## ") && i > stateStart + 1) break;

      // Table rows: "| Xu hướng | value |"
      const rowMatch = l.match(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|?\s*$/);
      if (rowMatch) {
        const attr = rowMatch[1]!.trim();
        const val = rowMatch[2]!.trim();
        if (attr.includes("Xu hướng")) stateTrend = val;
        else if (attr.includes("Nghề nghiệp") || attr.includes("Nghe nghiep")) stateCareer = val;
        else if (attr.includes("Quan hệ") || attr.includes("Quan he")) stateRelationship = val;
        else if (attr.includes("Sức khỏe") || attr.includes("Suc khoe")) stateHealth = val;
        else if (attr.includes("Cảnh báo") || attr.includes("Canh bao")) stateWarning = val;
      }
    }
  }

  // ── Lines (Sáu Hào) ──────────────────────────────────────────────────────────
  const parsedLines: ParsedLine[] = [];

  // Find all "### Hào N" sections
  for (let i = 0; i < lines.length; i++) {
    const haoMatch = lines[i]!.match(/^###\s+Hào\s+(\d)/);
    if (!haoMatch) continue;

    const position = parseInt(haoMatch[1]!, 10);
    let type: "yang" | "yin" = "yang";
    let name = "";
    let chinese = "";
    let vietnamese = "";
    let outcome = "";
    let action = "";
    let interpretation = "";

    // Scan within this hao section until next "###" or "##"
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.startsWith("### ") || l.startsWith("## ")) break;

      // Type: "- **Loại:** Dương ⚊ (Cửu Tam)" or "- **Loại:** Âm ⚋ (Lục Tứ)"
      const loaiMatch = l.match(/\*\*Loại:\*\*\s*(Dương|Âm)/);
      if (loaiMatch) {
        type = loaiMatch[1] === "Dương" ? "yang" : "yin";
        // Extract name like "Sơ Cửu", "Lục Nhị" etc from parentheses
        const nameMatch = l.match(/\(([^)]+)\)/);
        if (nameMatch) name = nameMatch[1]!.trim();
      }

      const kwMatch = l.match(/\*\*Kinh văn:\*\*\s*(.+)/);
      if (kwMatch) chinese = kwMatch[1]!.trim();

      const dvMatch = l.match(/\*\*Dịch nghĩa:\*\*\s*(.+)/);
      if (dvMatch) vietnamese = dvMatch[1]!.trim();

      const kqMatch = l.match(/\*\*Kết quả:\*\*\s*(.+)/);
      if (kqMatch) outcome = normaliseOutcome(kqMatch[1]!.trim());

      const hdMatch = l.match(/\*\*Hành động:\*\*\s*(.+)/);
      if (hdMatch) action = normaliseAction(hdMatch[1]!.trim());

      // Interpretation: bold "**Luận giải:**" then content
      const lgMatch = l.match(/^\*\*Luận giải:\*\*\s*(.*)/);
      if (lgMatch) {
        let interp = lgMatch[1]!.trim();
        // Sometimes interpretation is on next lines (plain text paragraphs)
        for (let k = j + 1; k < lines.length; k++) {
          const nextL = lines[k]!;
          if (nextL.startsWith("### ") || nextL.startsWith("## ")) break;
          if (nextL.startsWith("**") || nextL.startsWith("-")) break;
          if (nextL.trim() === "") {
            // blank line - check if next non-blank is a new item
            break;
          }
          interp += " " + nextL.trim();
        }
        interpretation = interp.trim();
      }
    }

    // Fallback: sometimes interpretation is in a plain paragraph after the bullet list
    if (!interpretation) {
      // Look for a paragraph block after the bullet items
      let foundLastBullet = false;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.startsWith("### ") || l.startsWith("## ")) break;
        if (l.startsWith("-")) foundLastBullet = true;
        if (foundLastBullet && !l.startsWith("-") && l.trim().length > 20 && !l.startsWith("#")) {
          interpretation = l.trim();
          break;
        }
      }
    }

    parsedLines.push({ position, type, name, chinese, vietnamese, outcome, action, interpretation });
  }

  // Sort lines by position
  parsedLines.sort((a, b) => a.position - b.position);

  return {
    id,
    coreMeaning,
    judgmentChinese,
    judgmentVietnamese,
    judgmentInterpretation,
    imageDescription,
    imageAction,
    stateTrend,
    stateCareer,
    stateRelationship,
    stateHealth,
    stateWarning,
    lines: parsedLines,
  };
}

// ── Generate TypeScript code for a single hexagram entry ────────────────────
function generateQueDataEntry(h: ParsedHexagram): string {
  const linesCode = h.lines.map((l) => {
    return `      { position: ${l.position}, type: "${l.type}", name: \`${esc(l.name)}\`, chinese: \`${esc(l.chinese)}\`, vietnamese: \`${esc(l.vietnamese)}\`, outcome: \`${esc(l.outcome)}\`, action: \`${esc(l.action)}\`, interpretation: \`${esc(l.interpretation)}\` }`;
  }).join(",\n");

  return `  ${h.id}: {
    coreMeaning: \`${esc(h.coreMeaning)}\`,
    judgment: { chinese: \`${esc(h.judgmentChinese)}\`, vietnamese: \`${esc(h.judgmentVietnamese)}\`, interpretation: \`${esc(h.judgmentInterpretation)}\` },
    image: { description: \`${esc(h.imageDescription)}\`, action: \`${esc(h.imageAction)}\` },
    state: { trend: \`${esc(h.stateTrend)}\`, career: \`${esc(h.stateCareer)}\`, relationship: \`${esc(h.stateRelationship)}\`, health: \`${esc(h.stateHealth)}\`, warning: \`${esc(h.stateWarning)}\` },
    lines: [
${linesCode},
    ],
  }`;
}

// ── Main ────────────────────────────────────────────────────────────────────
const files = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith(".md") && f !== "SCHEMA.md")
  .sort();

console.log(`Found ${files.length} markdown files`);

const hexagrams: ParsedHexagram[] = [];
for (const file of files) {
  const filePath = join(SOURCE_DIR, file);
  const parsed = parseHexagram(filePath);
  if (parsed) {
    hexagrams.push(parsed);
  } else {
    console.error(`Failed to parse: ${file}`);
  }
}

hexagrams.sort((a, b) => a.id - b.id);
console.log(`Parsed ${hexagrams.length} hexagrams`);

// Validate
let errors = 0;
for (const h of hexagrams) {
  if (h.lines.length !== 6) {
    console.error(`Hexagram ${h.id}: expected 6 lines, got ${h.lines.length}`);
    errors++;
  }
  if (!h.coreMeaning) {
    console.error(`Hexagram ${h.id}: missing coreMeaning`);
    errors++;
  }
  if (!h.stateTrend) {
    console.error(`Hexagram ${h.id}: missing stateTrend`);
    errors++;
  }
}

// Show all non-standard outcomes to help validate
console.log("\nNon-standard outcomes (post normalisation):");
const VALID_OUTCOMES = ["CÁT", "HUNG", "VÔ CỬU", "HỐI", "LẬN", "LỆ"];
for (const h of hexagrams) {
  for (const l of h.lines) {
    const u = l.outcome.toUpperCase();
    const valid = VALID_OUTCOMES.some((o) => u.includes(o));
    if (!valid) {
      console.error(`  [${h.id}] line ${l.position}: "${l.outcome}"`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} errors found. Fix before writing.`);
  process.exit(1);
}

// ── Read existing file (keep header + non-QUE_DATA sections) ────────────────
const existingContent = readFileSync(TARGET_FILE, "utf-8");

// Find the QUE_DATA declaration start
const queDataStart = existingContent.indexOf("export const QUE_DATA: Record<number, QueData> = {");
if (queDataStart === -1) {
  console.error("Could not find QUE_DATA in target file");
  process.exit(1);
}

const header = existingContent.substring(0, queDataStart);

// Generate new QUE_DATA
const entries = hexagrams.map(generateQueDataEntry).join(",\n");
const queDataContent = `export const QUE_DATA: Record<number, QueData> = {\n${entries},\n};\n`;

const newContent = header + queDataContent;

writeFileSync(TARGET_FILE, newContent, "utf-8");
console.log(`\nWrote ${TARGET_FILE}`);
console.log(`File size: ${(newContent.length / 1024).toFixed(1)} KB`);
