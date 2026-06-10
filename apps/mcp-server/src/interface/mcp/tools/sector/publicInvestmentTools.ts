/**
 * Public Investment MCP Tools — Task 251
 *
 * MCP tool: get_public_contracts
 *   Fetches and returns recent public procurement contracts from muasamcong.mpi.gov.vn,
 *   with related stock impact mapping.
 *
 * Layer: interface/mcp/tools — orchestrates infrastructure fetchers
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchPublicContracts,
  type HttpClient,
  type PublicContract,
} from "../../../../infrastructure/fetchers/muasamcong.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";

// DS-DEGRADE-01: SLA for muasamcong upstream — 7 days (weekly update cadence).
const MUASAMCONG_SLA_HOURS = 7 * 24;

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for direct testing)
// ─────────────────────────────────────────────────────────────────────────────

interface GetPublicContractsInput {
  /** Category filter, e.g. "highway" or "technology" (optional) */
  category?: string | undefined;
  /** Test-only: inject raw HTML directly to bypass HTTP */
  _testHtml?: string | undefined;
}

/**
 * Core handler logic — separated from MCP registration for testability.
 */
export async function getPublicContractsHandler(
  input: GetPublicContractsInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let contracts: PublicContract[] = [];

  if (input._testHtml !== undefined) {
    // Test mode: parse the injected HTML via a fake client
    const fakeClient: HttpClient = {
      get: async () => input._testHtml!,
    };
    contracts = await fetchPublicContracts(fakeClient);
  } else {
    contracts = await fetchPublicContracts();
  }

  // Apply optional category filter
  if (input.category) {
    contracts = contracts.filter((c) => c.category === input.category);
  }

  if (contracts.length === 0) {
    // DS-DEGRADE-01 FIX: distinguish stale upstream from genuinely no data.
    // Check the public_contracts table for the most recent fetched_at row.
    // If the latest record is older than MUASAMCONG_SLA_HOURS, signal stale=true.
    try {
      await initDatabase();
      const db = getDb();
      const latestRow = db
        .prepare<{ fetched_at: string }, []>(
          "SELECT fetched_at FROM public_contracts ORDER BY fetched_at DESC LIMIT 1",
        )
        .get();

      if (latestRow) {
        const fetchedAt = new Date(latestRow.fetched_at);
        const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000;

        if (ageHours > MUASAMCONG_SLA_HOURS) {
          // Upstream stale — last known data exceeds SLA window
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  stale: true,
                  stale_since: fetchedAt.toISOString(),
                  source: "muasamcong",
                  message: `Dữ liệu muasamcong stale — lần cập nhật cuối: ${fetchedAt.toISOString()} (${ageHours.toFixed(1)}h trước, SLA=${MUASAMCONG_SLA_HOURS}h)`,
                }),
              },
            ],
          };
        }
      }
    } catch {
      // DB unavailable — fall through to generic unavailable response
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            unavailable: true,
            reason: "Không tìm thấy gói thầu nào. Dữ liệu có thể chưa được cập nhật.",
          }),
        },
      ],
    };
  }

  const lines: string[] = [
    `KẾT QUẢ CHỌN NHÀ THẦU — muasamcong.mpi.gov.vn`,
    `Tổng số gói thầu: ${contracts.length}`,
    "",
  ];

  for (const c of contracts) {
    const valueStr =
      c.value > 0
        ? `${(c.value / 1_000_000_000).toFixed(1)} tỷ VND`
        : "N/A";
    lines.push(`GÓI THẦU: ${c.title}`);
    lines.push(`  Giá trị: ${valueStr}`);
    lines.push(`  Bên mời thầu: ${c.agency}`);
    lines.push(`  Nhà thầu trúng: ${c.winner}`);
    lines.push(`  Ngày kết quả: ${c.awardDate}`);
    lines.push(`  Loại: ${c.category}`);
    if (c.relatedStocks.length > 0) {
      lines.push(`  Cổ phiếu liên quan: ${c.relatedStocks.join(", ")}`);
    }
    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_public_contracts MCP tool on the server.
 */
export function registerPublicInvestmentTools(server: McpServer): void {
  server.tool(
    "get_public_contracts",
    "Fetch recent public procurement contract results from muasamcong.mpi.gov.vn and map them to related VN stocks. " +
      "Returns contract title, value (VND billions), awarding agency, winner, award date, category, and related tickers. " +
      "Package: tran-ngoc-bau (public investment signals — Layer 4 agent package claim). " +
      "Integration status: already listed in docs/agents/tools/package/tran-ngoc-bau.md. " +
      "Lấy danh sách kết quả chọn nhà thầu mới nhất từ muasamcong.mpi.gov.vn và ánh xạ sang cổ phiếu liên quan.",
    {
      category: z
        .enum([
          "highway",
          "construction",
          "technology",
          "energy",
          "healthcare",
          "education",
          "other",
        ])
        .optional()
        .describe("Lọc theo loại gói thầu"),
    },
    async (input) => getPublicContractsHandler(input),
  );
}
