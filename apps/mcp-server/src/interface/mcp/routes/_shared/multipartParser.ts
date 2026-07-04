/**
 * Shared multipart/form-data parser.
 *
 * Extracted from server.ts (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md
 * §4 Stage 4). Originally added as "Task 1112 — Minimal multipart/form-data parser for
 * push-bctc-pdf" directly in server.ts; its only caller is push-bctc-pdf
 * (routes/bctcVpsIngestHandler.ts), so it moves there as a shared helper.
 *
 * Byte-identical lift of the original parseMultipartFields body — no behavior change,
 * signature preserved exactly (body: Buffer, boundary: string) => Map<string, string | Buffer>.
 */

/**
 * Parse multipart/form-data body into a Map of field name → value.
 * Text fields return string values; file fields return Buffer values.
 */
export function parseMultipartFields(body: Buffer, boundary: string): Map<string, string | Buffer> {
  const fields = new Map<string, string | Buffer>();
  const sep = Buffer.from(`--${boundary}`);

  // Split body by boundary
  let start = 0;
  const parts: Buffer[] = [];
  while (true) {
    const idx = body.indexOf(sep, start);
    if (idx === -1) break;
    if (start > 0) {
      // Remove trailing \r\n before boundary
      const end = idx - 2 >= start ? idx - 2 : idx;
      parts.push(body.subarray(start, end));
    }
    start = idx + sep.length;
    // Skip \r\n after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
    // Check for closing --
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
  }

  for (const part of parts) {
    // Find double CRLF separating headers from body
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerStr = part.subarray(0, headerEnd).toString("utf-8");
    const bodyContent = part.subarray(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch?.[1]) continue;
    const name = nameMatch[1];

    const isFile = headerStr.includes("filename=");
    fields.set(name, isFile ? Buffer.from(bodyContent) : bodyContent.toString("utf-8"));
  }

  return fields;
}
