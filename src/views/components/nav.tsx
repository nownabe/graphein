import { t } from "../../i18n/index";

export function Nav({
  displayName,
  locale,
  isAdmin,
}: {
  displayName: string;
  locale: string;
  isAdmin?: boolean;
}) {
  const switchLabel = t(locale, "lang.switch");
  const switchHref = locale === "en" ? "/locale/ja" : "/locale/en";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <nav class="sticky top-0 z-10 bg-page/70 backdrop-blur-xl border-b border-edge">
      <div class="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/tasks" class="flex items-center gap-2.5 group">
          <div class="w-7 h-7 rounded-[var(--radius-sm)] bg-accent flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              class="text-page"
            >
              <path
                d="M2 11.5V3.5C2 2.67 2.67 2 3.5 2h3L8 3.5h2.5c.83 0 1.5.67 1.5 1.5v6.5c0 .83-.67 1.5-1.5 1.5h-7C2.67 13 2 12.33 2 11.5z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5 8h4M5 10h2.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <span class="text-base font-bold text-ink tracking-tight group-hover:text-accent transition-colors">
            Graphein
          </span>
        </a>
        <div class="flex items-center gap-3">
          {isAdmin && (
            <a
              href="/admin/members"
              class="text-xs text-muted hover:text-accent transition-colors px-2 py-1 rounded-[var(--radius-sm)]"
            >
              {t(locale, "nav.admin")}
            </a>
          )}
          <a
            href={switchHref}
            class="text-xs text-muted hover:text-secondary transition-colors px-2 py-1 rounded-[var(--radius-sm)]"
          >
            {switchLabel}
          </a>
          <div class="w-px h-4 bg-edge" />
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-xs font-semibold shrink-0 border border-edge">
              {initial}
            </div>
            <span class="text-sm text-secondary hidden sm:inline">
              {displayName}
            </span>
          </div>
          <a
            href="/auth/logout"
            class="text-xs text-muted hover:text-danger transition-colors px-2 py-1 rounded-[var(--radius-sm)]"
          >
            {t(locale, "nav.logout")}
          </a>
        </div>
      </div>
    </nav>
  );
}
