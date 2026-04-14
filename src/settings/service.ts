import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { appSettings } from "../db/schema";

const FISCAL_QUARTER_START_MONTH_KEY = "fiscal_quarter_start_month";
const DEFAULT_FISCAL_QUARTER_START_MONTH = 1; // January (calendar quarters)

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

  return {
    getFiscalQuarterStartMonth,
    setFiscalQuarterStartMonth,
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
