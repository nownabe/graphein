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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="text-page">
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
        <div class="relative">
          <button
            type="button"
            id="user-menu-trigger"
            class="flex items-center gap-2 cursor-pointer rounded-full px-1 py-1 hover:bg-surface-hover transition-colors"
            onclick="(function(){var m=document.getElementById('user-menu');if(m.classList.contains('user-menu-open')){m.classList.remove('user-menu-open')}else{m.classList.add('user-menu-open');var close=function(e){if(!m.contains(e.target)&&e.target.id!=='user-menu-trigger'&&!document.getElementById('user-menu-trigger').contains(e.target)){m.classList.remove('user-menu-open');document.removeEventListener('click',close)}};setTimeout(function(){document.addEventListener('click',close)},0)}})()"
          >
            <div class="w-7 h-7 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-xs font-semibold shrink-0 border border-edge">
              {initial}
            </div>
            <span class="text-sm text-secondary hidden sm:inline">{displayName}</span>
            <svg
              class="w-3.5 h-3.5 text-muted hidden sm:block"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <div
            id="user-menu"
            class="user-menu absolute right-0 top-full mt-2 w-56 bg-surface border border-edge rounded-[var(--radius-sm)] shadow-lg overflow-hidden"
          >
            {/* User info */}
            <div class="px-4 py-3 border-b border-edge">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-sm font-semibold shrink-0 border border-edge">
                  {initial}
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-ink truncate">{displayName}</div>
                </div>
              </div>
            </div>
            {/* Menu items */}
            <div class="py-1">
              {isAdmin && (
                <a
                  href="/admin/users"
                  class="user-menu-item flex items-center gap-3 px-4 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-ink transition-colors"
                >
                  <svg
                    class="w-4 h-4 text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {t(locale, "nav.admin")}
                </a>
              )}
              <a
                href={switchHref}
                class="user-menu-item flex items-center gap-3 px-4 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-ink transition-colors"
              >
                <svg
                  class="w-4 h-4 text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                {switchLabel}
              </a>
              <button
                type="button"
                id="theme-toggle"
                onclick="(function(){var h=document.documentElement;var c=h.getAttribute('data-theme')==='light'?'dark':'light';h.setAttribute('data-theme',c);document.cookie='theme='+c+';path=/;max-age=31536000;samesite=lax';fetch('/theme/'+c);var b=document.getElementById('theme-toggle');b.querySelector('.theme-icon-sun').style.display=c==='dark'?'flex':'none';b.querySelector('.theme-icon-moon').style.display=c==='light'?'flex':'none';b.querySelector('.theme-label-light').style.display=c==='dark'?'inline':'none';b.querySelector('.theme-label-dark').style.display=c==='light'?'inline':'none'})()"
                class="user-menu-item w-full flex items-center gap-3 px-4 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer"
              >
                {/* Sun icon — shown when dark (destination: light) */}
                <span
                  class="theme-icon-sun w-4 h-4 items-center justify-center"
                  style={isDark ? "display:flex" : "display:none"}
                >
                  <svg
                    class="w-4 h-4 text-muted"
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
                </span>
                {/* Moon icon — shown when light (destination: dark) */}
                <span
                  class="theme-icon-moon w-4 h-4 items-center justify-center"
                  style={isDark ? "display:none" : "display:flex"}
                >
                  <svg class="w-4 h-4 text-muted" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                </span>
                <span class="theme-label-light" style={isDark ? "" : "display:none"}>
                  {t(locale, "nav.theme.light")}
                </span>
                <span class="theme-label-dark" style={isDark ? "display:none" : ""}>
                  {t(locale, "nav.theme.dark")}
                </span>
              </button>
            </div>
            {/* Logout */}
            <div class="border-t border-edge py-1">
              <a
                href="/auth/logout"
                class="user-menu-item flex items-center gap-3 px-4 py-2 text-sm text-danger hover:bg-glow-danger transition-colors"
              >
                <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                    clip-rule="evenodd"
                  />
                  <path
                    fill-rule="evenodd"
                    d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z"
                    clip-rule="evenodd"
                  />
                </svg>
                {t(locale, "nav.logout")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
