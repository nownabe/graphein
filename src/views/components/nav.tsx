import { t } from "../../i18n/index";

export function Nav({
  displayName,
  locale,
  theme,
  isAdmin,
}: {
  displayName: string;
  locale: string;
  theme?: string;
  isAdmin?: boolean;
}) {
  const switchLabel = t(locale, "lang.switch");
  const switchHref = locale === "en" ? "/locale/ja" : "/locale/en";
  const initial = displayName.charAt(0).toUpperCase();
  const isDark = theme !== "light";

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
              href="/admin/users"
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
          <button
            type="button"
            id="theme-toggle"
            title={t(locale, "nav.theme")}
            onclick="(function(){var h=document.documentElement;var c=h.getAttribute('data-theme')==='light'?'dark':'light';h.setAttribute('data-theme',c);document.cookie='theme='+c+';path=/;max-age=31536000;samesite=lax';fetch('/theme/'+c);var b=document.getElementById('theme-toggle');b.querySelector('.theme-icon-sun').style.display=c==='dark'?'block':'none';b.querySelector('.theme-icon-moon').style.display=c==='light'?'block':'none'})()"
            class="text-muted hover:text-secondary transition-colors p-1 rounded-[var(--radius-sm)]"
          >
            {/* Sun icon — shown when dark (click to switch to light) */}
            <svg
              class="theme-icon-sun w-4 h-4"
              style={isDark ? "" : "display:none"}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            {/* Moon icon — shown when light (click to switch to dark) */}
            <svg
              class="theme-icon-moon w-4 h-4"
              style={isDark ? "display:none" : ""}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          </button>
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
