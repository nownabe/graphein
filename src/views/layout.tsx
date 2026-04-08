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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/public/styles.css" />
        <script
          src="https://unpkg.com/htmx.org@2.0.4"
          crossorigin="anonymous"
        />
      </head>
      <body class="min-h-screen" hx-boost="true">
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
