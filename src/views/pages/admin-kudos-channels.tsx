import type { InferSelectModel } from "drizzle-orm";
import type { kudosChannels } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { AdminTabs } from "../components/admin-tabs";

type KudosChannel = InferSelectModel<typeof kudosChannels>;

export function AdminKudosChannelsList({
  channels,
  channelNames,
  locale,
}: {
  channels: KudosChannel[];
  channelNames?: Record<string, string>;
  locale: string;
}) {
  return (
    <div id="kudos-channels-list">
      {channels.length === 0 ? (
        <p class="text-sm text-muted py-8 text-center">{t(locale, "admin.kudosChannels.empty")}</p>
      ) : (
        <ul class="bg-surface border border-edge rounded-[var(--radius-lg)] divide-y divide-edge">
          {channels.map((ch) => (
            <li key={ch.id} class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-2">
                {channelNames?.[ch.slackChannelId] && (
                  <span class="text-sm font-medium text-ink">
                    #{channelNames[ch.slackChannelId]}
                  </span>
                )}
                <code class="text-xs font-mono text-muted">{ch.slackChannelId}</code>
              </div>
              <button
                hx-delete={`/admin/kudos-channels/${ch.id}`}
                hx-target="#kudos-channels-list"
                hx-swap="outerHTML"
                hx-confirm={t(locale, "admin.kudosChannels.confirmRemove")}
                class="text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-danger hover:bg-[var(--color-glow-danger)] transition-colors cursor-pointer"
              >
                {t(locale, "admin.kudosChannels.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        hx-post="/admin/kudos-channels"
        hx-target="#kudos-channels-list"
        hx-swap="outerHTML"
        class="mt-4 flex gap-2"
      >
        <input
          type="text"
          name="slack_channel_id"
          placeholder={t(locale, "admin.kudosChannels.placeholder")}
          required
          class="flex-1 bg-surface border border-edge rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          class="px-4 py-2 bg-accent text-page text-sm font-semibold rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer"
        >
          {t(locale, "admin.kudosChannels.add")}
        </button>
      </form>
    </div>
  );
}

export function AdminKudosChannelsPage({
  channels,
  channelNames,
  displayName,
  avatarUrl,
  locale,
  theme,
  devMode,
}: {
  channels: KudosChannel[];
  channelNames?: Record<string, string>;
  displayName: string;
  avatarUrl?: string | null;
  locale: string;
  theme?: string;
  devMode?: boolean;
}) {
  return (
    <Layout
      title={t(locale, "admin.kudosChannels.title")}
      locale={locale}
      theme={theme}
      devMode={devMode}
    >
      <Nav displayName={displayName} avatarUrl={avatarUrl} locale={locale} theme={theme} isAdmin />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <AdminTabs current="kudos-channels" locale={locale} />
        <div class="mb-8">
          <h1 class="text-xl font-bold text-ink tracking-tight mb-1">
            {t(locale, "admin.kudosChannels.title")}
          </h1>
          <p class="text-sm text-secondary">{t(locale, "admin.kudosChannels.description")}</p>
        </div>
        <AdminKudosChannelsList channels={channels} channelNames={channelNames} locale={locale} />
      </main>
    </Layout>
  );
}
