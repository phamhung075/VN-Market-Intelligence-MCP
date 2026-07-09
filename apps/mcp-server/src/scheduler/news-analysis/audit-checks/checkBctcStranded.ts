/**
 * D-7c: Detect stranded BCTC PDFs (task 309 / report #690).
 *
 * Walks data/pdfs/, infers stock code from filename via watchlist regex,
 * and flags any PDF that has no matching financial_reports row. Surfaces
 * as agent_feedback so a future cron loop or human can re-parse.
 *
 * Sprint 053 / task 1019 slice 1: emit ONE finding per stranded file with a
 * structured JSON body. The dedicated bctcReparseJob (slice 2) reads
 * agent_feedback rows tagged with check="stranded_bctc_pdf", parses the
 * filePath/ticker out of the detail and feeds the local file into the
 * re-parse pipeline. Per-file findings also mean the feedback dedup guard
 * tracks each file individually, so removing one stranded PDF actually
 * clears its feedback row.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL,
 * finding shape, and the per-file insertFeedbackIfNew loop ordering all
 * verbatim.
 */

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkBctcStranded(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];
  try {
    const pdfDir = join(process.cwd(), "data", "pdfs");
    if (existsSync(pdfDir)) {
      const files = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
      const watchlistCodes = db
        .query<{ code: string }, []>("SELECT code FROM watchlist")
        .all()
        .map((r) => r.code);

      let strandedCount = 0;
      for (const filename of files) {
        const upper = filename.toUpperCase();
        let matched = watchlistCodes.find((c) => {
          const re = new RegExp(`(^|[^A-Z])${c}([^A-Z]|$)`);
          return re.test(upper);
        });
        // Task 1002: fallback to pdf_extracted_text.action_code for anonymous filenames
        if (!matched) {
          const row = db
            .query<{ action_code: string }, [string]>(
              `SELECT action_code FROM pdf_extracted_text WHERE filename = ? AND action_code != '' LIMIT 1`,
            )
            .get(filename);
          matched = row?.action_code ?? undefined;
        }
        if (!matched) continue;

        const filed = db
          .query<{ cnt: number }, [string, string, string]>(
            `SELECT COUNT(*) AS cnt FROM financial_reports
             WHERE action_code = ? AND
                   (pdf_path LIKE ? OR ssc_url LIKE ?)`,
          )
          .get(matched, `%${filename}%`, `%${filename}%`);
        if ((filed?.cnt ?? 0) > 0) continue;

        strandedCount++;
        const filePath = join(pdfDir, filename);
        const payload = {
          ticker: matched,
          filename,
          filePath,
        };

        const perFileFinding: AuditFinding = {
          table: "financial_reports",
          check: "stranded_bctc_pdf",
          severity: "warning",
          rowsAffected: 1,
          action: "flagged",
          // Prefix the JSON with the classic "ticker:filename" header so the
          // old dedup key (agent_feedback.title) still hashes uniquely per
          // file, and slice 2 can JSON.parse the tail.
          detail: `${matched}:${filename.slice(0, 50)} ${JSON.stringify(payload)}`.slice(0, 480),
        };
        findings.push(perFileFinding);
        insertFeedbackIfNew(db, perFileFinding);
      }

      if (strandedCount === 0) {
        findings.push({
          table: "financial_reports",
          check: "stranded_bctc_pdf",
          severity: "info",
          rowsAffected: 0,
          action: "none",
          detail: "No stranded BCTC PDFs",
        });
      }
    }
  } catch (err) {
    findings.push({
      table: "financial_reports",
      check: "stranded_bctc_pdf",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }
  return findings;
}
