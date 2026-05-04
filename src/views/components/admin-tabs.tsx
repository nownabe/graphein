import { t } from "../../domain/i18n/index";

export function AdminTabs({
  current,
  locale,
}: {
  current: "users" | "snippet-channels" | "kudos-channels" | "settings";
  locale: string;
}) {
  const tabs = [
    { key: "users" as const, href: "/admin/users", label: t(locale, "admin.tab.users") },
    {
      key: "snippet-channels" as const,
      href: "/admin/snippet-channels",
      label: t(locale, "admin.tab.snippetChannels"),
    },
    {
      key: "kudos-channels" as const,
      href: "/admin/kudos-channels",
      label: t(locale, "admin.tab.kudosChannels"),
    },
    {
      key: "settings" as const,
      href: "/admin/settings",
      label: t(locale, "admin.tab.settings"),
    },
  ];

  return (
    <nav class="flex gap-1 mb-8 border-b border-edge">
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          class={`px-4 py-2 text-sm font-medium transition-colors -mb-px ${
            tab.key === current
              ? "text-accent border-b-2 border-accent"
              : "text-secondary hover:text-ink"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
