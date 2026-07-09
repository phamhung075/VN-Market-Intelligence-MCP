/**
 * InfoSourceRow — one row of the InfoSourcePanel "Nguồn dữ liệu" table.
 * Split out to a standalone type module so buildInfoSourceRows.tsx and
 * buildInfoSourcePriceTaRows.tsx can both depend on it without a
 * file-to-file circular import.
 */
export interface InfoSourceRow {
  source: string;
  indicator: React.ReactNode;
  value: React.ReactNode;
}
