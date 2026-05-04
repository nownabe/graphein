import { eq } from "drizzle-orm";
import type { Database } from "../../infrastructure/db/client";
import { appSettings } from "../../infrastructure/db/schema";

const FISCAL_QUARTER_START_MONTH_KEY = "fiscal_quarter_start_month";
const DEFAULT_FISCAL_QUARTER_START_MONTH = 1; // January (calendar quarters)

const FISCAL_YEAR_LABEL_KEY = "fiscal_year_label";
const DEFAULT_FISCAL_YEAR_LABEL: FiscalYearLabel = "start";

export type FiscalYearLabel = "start" | "end";

export function createSettingsService(db: Database) {
  async function getFiscalQuarterStartMonth(): Promise<number> {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, FISCAL_QUARTER_START_MONTH_KEY),
    });
    if (!row) return DEFAULT_FISCAL_QUARTER_START_MONTH;
    const month = Number(row.value);
    return month >= 1 && month <= 12 ? month : DEFAULT_FISCAL_QUARTER_START_MONTH;
  }

  async function setFiscalQuarterStartMonth(month: number): Promise<void> {
    if (month < 1 || month > 12) return;
    await db
      .insert(appSettings)
      .values({ key: FISCAL_QUARTER_START_MONTH_KEY, value: String(month), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(month), updatedAt: new Date() },
      });
  }

  async function getFiscalYearLabel(): Promise<FiscalYearLabel> {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, FISCAL_YEAR_LABEL_KEY),
    });
    if (!row) return DEFAULT_FISCAL_YEAR_LABEL;
    return row.value === "end" ? "end" : "start";
  }

  async function setFiscalYearLabel(label: FiscalYearLabel): Promise<void> {
    if (label !== "start" && label !== "end") return;
    await db
      .insert(appSettings)
      .values({ key: FISCAL_YEAR_LABEL_KEY, value: label, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: label, updatedAt: new Date() },
      });
  }

  return {
    getFiscalQuarterStartMonth,
    setFiscalQuarterStartMonth,
    getFiscalYearLabel,
    setFiscalYearLabel,
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
