import type { KudosEntryWithContext } from "../../kudos/service";
import { Mrkdwn, type MrkdwnOptions } from "../../adapters/slack/mrkdwn";

export function KudosCard({
  entry,
  locale,
  mrkdwnLabels,
}: {
  entry: KudosEntryWithContext;
  locale: string;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  const postedAt = new Date(entry.postedAt);
  const dateStr = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(postedAt);

  const initial = entry.poster.displayName.charAt(0).toUpperCase();

  return (
    <div class="bg-surface border border-edge rounded-[var(--radius-lg)] p-5 transition-all hover:border-muted">
      <div class="flex items-center gap-3 mb-3">
        {entry.poster.avatarUrl ? (
          <img
            src={entry.poster.avatarUrl}
            alt={entry.poster.displayName}
            class="w-8 h-8 rounded-full shrink-0"
          />
        ) : (
          <div class="w-8 h-8 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-sm font-semibold shrink-0 border border-edge">
            {initial}
          </div>
        )}
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-ink truncate">{entry.poster.displayName}</div>
          <div class="text-xs text-muted">{dateStr}</div>
        </div>
        {entry.slackPermalink && (
          <a
            href={entry.slackPermalink}
            target="_blank"
            rel="noopener noreferrer"
            hx-boost="false"
            class="text-muted hover:text-accent transition-colors inline-flex items-center gap-1 text-xs shrink-0"
          >
            Slack
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" class="shrink-0">
              <path
                d="M4.5 2.5h5v5M9.5 2.5L4 8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>
        )}
      </div>
      <div class="text-[13px] leading-relaxed text-secondary">
        <Mrkdwn text={entry.message} options={mrkdwnLabels} />
      </div>
    </div>
  );
}
