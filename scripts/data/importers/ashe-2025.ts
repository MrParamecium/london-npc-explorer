import ExcelJS from "exceljs";

import { normalizeCounts } from "./normalized-statistics";

const LONDON_REGION_CODE = "E12000007";
const PERCENTILES = [10, 20, 30, 40, 60, 70, 80, 90] as const;

export function annualPayBands(values: Array<number | string>) {
  if (values.length !== PERCENTILES.length) {
    throw new Error("ASHE requires the 10th through 90th percentile cut points.");
  }
  const cutPoints = values.map((value) => Number(value));
  if (
    cutPoints.some((value) => !Number.isFinite(value) || value < 0) ||
    cutPoints.some((value, index) => index > 0 && value <= cutPoints[index - 1]!)
  ) {
    throw new Error("ASHE percentile cells are suppressed or invalid.");
  }
  const labels = [
    `Below GBP ${Math.round(cutPoints[0]!).toLocaleString("en-GB")}`,
    ...cutPoints.slice(0, -1).map(
      (lower, index) =>
        `GBP ${Math.round(lower).toLocaleString("en-GB")} to ${Math.round(cutPoints[index + 1]! - 1).toLocaleString("en-GB")}`,
    ),
    `GBP ${Math.round(cutPoints.at(-1)!).toLocaleString("en-GB")} or more`,
  ];
  return labels.map((label, index) => ({
    key:
      index === 0
        ? "percentile_0_10"
        : index === labels.length - 1
          ? "percentile_90_100"
          : `percentile_${PERCENTILES[index - 1]}_${PERCENTILES[index]}`,
    label,
    count: index === 4 ? 20 : 10,
  }));
}

export async function readLondonAsheAnnualPay(path: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const statistics = [];
  for (const sheetName of ["All"] as const) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`ASHE is missing ${sheetName}.`);
    const row = worksheet
      .getRows(1, worksheet.rowCount)
      ?.find(
        (candidate) =>
          String(candidate.getCell(2).value).trim() === LONDON_REGION_CODE,
      );
    if (!row) throw new Error(`ASHE has no London row in ${sheetName}.`);
    const bands = annualPayBands([8, 9, 11, 12, 13, 14, 16, 17].map((column) =>
      String(row.getCell(column).value ?? ""),
    ));
    statistics.push({
      geographyLevel: "london" as const,
      geographyCode: LONDON_REGION_CODE,
      metricId: "employee_earnings",
      distribution: normalizeCounts(
        "employee_earnings",
        "employees",
        bands,
      ),
    });
  }
  return statistics;
}
