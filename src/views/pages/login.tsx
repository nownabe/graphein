import { t } from "../../i18n/index";
import { Layout } from "../layout";

export function LoginPage({ locale }: { locale?: string }) {
  const loc = locale ?? "ja";
  return (
    <Layout title={t(loc, "page.login")} locale={loc}>
      <div class="min-h-screen flex items-center justify-center relative overflow-hidden bg-page">
        {/* Ambient amber glow */}
        <div
          class="absolute inset-0 pointer-events-none"
          style="background: radial-gradient(ellipse 500px 350px at 40% 45%, rgba(229,160,13,0.08) 0%, transparent 100%), radial-gradient(ellipse 400px 300px at 65% 55%, rgba(229,160,13,0.05) 0%, transparent 100%);"
        />
        {/* Grid pattern */}
        <div
          class="absolute inset-0 pointer-events-none opacity-[0.03]"
          style="background-image: linear-gradient(var(--color-edge) 1px, transparent 1px), linear-gradient(90deg, var(--color-edge) 1px, transparent 1px); background-size: 60px 60px;"
        />
        <div class="relative text-center stagger-in">
          <div class="w-16 h-16 rounded-[var(--radius-lg)] bg-accent flex items-center justify-center mx-auto mb-8">
            <svg
              width="28"
              height="28"
              viewBox="0 0 14 14"
              fill="none"
              class="text-page"
            >
              <path
                d="M2 11.5V3.5C2 2.67 2.67 2 3.5 2h3L8 3.5h2.5c.83 0 1.5.67 1.5 1.5v6.5c0 .83-.67 1.5-1.5 1.5h-7C2.67 13 2 12.33 2 11.5z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5 8h4M5 10h2.5"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <h1 class="text-4xl font-extrabold text-ink tracking-tight mb-2">
            Graphein
          </h1>
          <p class="text-secondary text-sm mb-10 max-w-xs mx-auto">
            {t(loc, "login.description")}
          </p>
          <a
            href="/auth/slack"
            hx-boost="false"
            class="inline-flex items-center gap-2.5 bg-accent text-page px-8 py-3 rounded-[var(--radius-sm)] text-sm font-bold hover:bg-accent-hover transition-all shadow-[0_0_40px_-8px_rgba(229,160,13,0.4)]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M3.75 11.25a1.5 1.5 0 1 1 0-3h1.5v1.5a1.5 1.5 0 0 1-1.5 1.5zm3-3a1.5 1.5 0 1 1 3 0v3.75a1.5 1.5 0 1 1-3 0V8.25zm3-4.5a1.5 1.5 0 1 1 0 3h-1.5v-1.5a1.5 1.5 0 0 1 1.5-1.5zm-3 3a1.5 1.5 0 1 1-3 0V3a1.5 1.5 0 1 1 3 0v3.75zm3 3a1.5 1.5 0 1 1 0 3h-1.5v-1.5c0-.828.672-1.5 1.5-1.5zm1.5-1.5a1.5 1.5 0 0 1 0-3h1.5a1.5 1.5 0 0 1 0 3h-1.5zm-1.5-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4.5a1.5 1.5 0 0 1 0 3 1.5 1.5 0 0 1 0-3z"
                fill="currentColor"
              />
            </svg>
            {t(loc, "login.slack")}
          </a>
        </div>
      </div>
    </Layout>
  );
}
