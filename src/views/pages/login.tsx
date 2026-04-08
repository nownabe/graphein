import { t } from "../../i18n/index";
import { Layout } from "../layout";

export function LoginPage({ locale }: { locale?: string }) {
  const loc = locale ?? "ja";
  return (
    <Layout title={t(loc, "page.login")} locale={loc}>
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center">
          <h1 class="font-display text-6xl font-semibold text-ink tracking-wider mb-3">
            Graphein
          </h1>
          <p class="text-warm-500 mb-10 text-sm tracking-wide">
            {t(loc, "login.description")}
          </p>
          <a
            href="/auth/slack"
            hx-boost="false"
            class="inline-flex items-center gap-2 bg-[#4A154B] text-white px-8 py-3 rounded-md text-sm font-medium hover:bg-[#611f64] transition-all hover:shadow-lg"
          >
            {t(loc, "login.slack")}
          </a>
        </div>
      </div>
    </Layout>
  );
}
