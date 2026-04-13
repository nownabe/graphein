import type { SnippetWithAuthor } from "../../snippets/service";
import { Mrkdwn, type MrkdwnOptions } from "../../slack/mrkdwn";

export function SnippetCard({
  snippet,
  locale,
  mrkdwnLabels,
}: {
  snippet: SnippetWithAuthor;
  locale: string;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  const postedAt = new Date(snippet.postedAt);
  const dateStr = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(postedAt);

  const initial = snippet.poster.displayName.charAt(0).toUpperCase();

  return (
    <div class="bg-surface border border-edge rounded-[var(--radius-lg)] p-5 transition-all hover:border-muted">
      <div class="flex items-center gap-3 mb-3">
        {snippet.poster.avatarUrl ? (
          <img
            src={snippet.poster.avatarUrl}
            alt={snippet.poster.displayName}
            class="w-8 h-8 rounded-full shrink-0"
          />
        ) : (
          <div class="w-8 h-8 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-sm font-semibold shrink-0 border border-edge">
            {initial}
          </div>
        )}
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-ink truncate">{snippet.poster.displayName}</div>
          <div class="text-xs text-muted">{dateStr}</div>
        </div>
        {snippet.slackPermalink && (
          <a
            href={snippet.slackPermalink}
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
        <Mrkdwn text={snippet.content} options={mrkdwnLabels} />
      </div>
      {(snippet.mentionedUsers.length > 0 || snippet.mentionedUsergroups.length > 0) && (
        <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-edge">
          {snippet.mentionedUsers.map((u) => (
            <span
              key={u.id}
              class="text-xs px-2 py-0.5 rounded-full bg-[var(--color-glow-accent)] text-accent font-medium"
            >
              @{u.displayName}
            </span>
          ))}
          {snippet.mentionedUsergroups.map((g) => (
            <span
              key={g.id}
              class="text-xs px-2 py-0.5 rounded-full bg-[var(--color-glow-accent)] text-accent font-medium"
            >
              @{g.handle ?? g.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
