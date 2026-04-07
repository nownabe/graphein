import type { Child } from "hono/jsx";

export function Layout({
  title,
  children,
}: {
  title?: string;
  children: Child;
}) {
  const pageTitle = title ? `${title} | Graphein` : "Graphein";
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <link rel="stylesheet" href="/public/styles.css" />
        <script
          src="https://unpkg.com/htmx.org@2.0.4"
          crossorigin="anonymous"
        />
      </head>
      <body class="bg-gray-50 text-gray-900 min-h-screen" hx-boost="true">
        {children}
      </body>
    </html>
  );
}
