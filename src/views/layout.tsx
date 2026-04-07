import type { Child } from "hono/jsx";

export function Layout({
  title,
  children,
  locale,
}: {
  title?: string;
  children: Child;
  locale?: string;
}) {
  const pageTitle = title ? `${title} | Graphein` : "Graphein";
  const lang = locale === "en" ? "en" : "ja";
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <html lang={lang}>
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
        {isDev && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var es=new EventSource("/dev/reload");es.onerror=function(){es.close();setTimeout(function(){location.reload();},500);};})();`,
            }}
          />
        )}
      </body>
    </html>
  );
}
