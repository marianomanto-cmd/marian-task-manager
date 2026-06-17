import { BRIEF_COLUMNS, type Brief } from "@/lib/briefs/types";

function cell(brief: Brief, key: (typeof BRIEF_COLUMNS)[number]["key"]): string {
  const value = brief[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Tab-separated table that pastes straight into Google Sheets / Excel. */
export function briefsToTsv(briefs: Brief[]): string {
  const header = BRIEF_COLUMNS.map((c) => c.label).join("\t");
  const rows = briefs.map((b) =>
    BRIEF_COLUMNS.map((c) =>
      cell(b, c.key)
        .replace(/\t/g, " ")
        .replace(/\r?\n/g, " · "),
    ).join("\t"),
  );
  return [header, ...rows].join("\n");
}

export async function copyBriefsToClipboard(briefs: Brief[]): Promise<void> {
  await navigator.clipboard.writeText(briefsToTsv(briefs));
}

/** Download the table as a formatted .xlsx (wrapped cells, frozen header). */
export async function downloadBriefsXlsx(briefs: Brief[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agency Board · Briefs";
  wb.created = new Date();

  const ws = wb.addWorksheet("Briefs");
  ws.columns = BRIEF_COLUMNS.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.long ? 52 : 22,
  }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };

  for (const b of briefs) {
    const row = ws.addRow(
      Object.fromEntries(BRIEF_COLUMNS.map((c) => [c.key, cell(b, c.key)])),
    );
    row.alignment = { vertical: "top", wrapText: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `briefs-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
