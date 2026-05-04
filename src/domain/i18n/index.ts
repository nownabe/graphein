import messages, { type Locale } from "./messages";

export type { Locale } from "./messages";

export function t(locale: string, key: string): string {
  const loc = (locale === "ja" ? "ja" : "en") as Locale;
  return messages[loc][key] ?? key;
}
