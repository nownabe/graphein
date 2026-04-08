import { t } from "../../i18n/index";

export function Nav({
  displayName,
  locale,
}: {
  displayName: string;
  locale: string;
}) {
  const switchLabel = t(locale, "lang.switch");
  const switchHref = locale === "en" ? "/locale/ja" : "/locale/en";

  return (
    <nav class="sticky top-0 z-10 bg-cream/90 backdrop-blur-sm border-b border-warm-200 px-6 py-3 flex items-center justify-between">
      <a href="/" class="font-display text-2xl font-semibold text-vermillion-500 tracking-wide">
        Graphein
      </a>
      <div class="flex items-center gap-4">
        <a
          href={switchHref}
          class="text-xs px-2 py-1 rounded border border-warm-300 text-warm-500 hover:text-warm-700 hover:border-warm-400 hover:bg-warm-50 transition-colors"
        >
          {switchLabel}
        </a>
        <span class="text-sm text-warm-600">{displayName}</span>
        <a
          href="/auth/logout"
          class="text-sm text-warm-400 hover:text-vermillion-500 transition-colors"
        >
          {t(locale, "nav.logout")}
        </a>
      </div>
    </nav>
  );
}
