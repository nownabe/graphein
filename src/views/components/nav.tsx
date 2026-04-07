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
    <nav class="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-indigo-600">
        Graphein
      </a>
      <div class="flex items-center gap-4">
        <a
          href={switchHref}
          class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {switchLabel}
        </a>
        <span class="text-sm text-gray-600">{displayName}</span>
        <a
          href="/auth/logout"
          class="text-sm text-gray-500 hover:text-gray-700"
        >
          {t(locale, "nav.logout")}
        </a>
      </div>
    </nav>
  );
}
