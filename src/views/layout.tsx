import type { Child } from "hono/jsx";

export function Layout({
  title,
  children,
  locale,
  theme,
  devMode,
}: {
  title?: string;
  children: Child;
  locale?: string;
  theme?: string;
  devMode?: boolean;
}) {
  const pageTitle = title ? `${title} | Graphein` : "Graphein";
  const lang = locale === "ja" ? "ja" : "en";
  const dataTheme = theme === "light" ? "light" : "dark";
  const isDev = devMode ?? false;
  return (
    <html lang={lang} data-theme={dataTheme}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <link rel="icon" href="/public/favicon.svg" type="image/svg+xml" />
        {/* Prevent FOUC: apply theme from cookie before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=document.cookie.match(/(?:^|; )theme=(\\w+)/);if(m)document.documentElement.setAttribute("data-theme",m[1])})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/public/styles.css" />
        <script
          src="https://unpkg.com/htmx.org@2.0.4"
          integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+"
          crossorigin="anonymous"
        />
      </head>
      <body class="min-h-screen" hx-boost="true">
        {children}
        <div id="toast-container" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function showToast(msg,cls){var c=document.getElementById("toast-container");if(!c)return;var t=document.createElement("div");t.className="toast "+(cls||"");t.textContent=msg;c.appendChild(t);setTimeout(function(){t.classList.add("toast-out");setTimeout(function(){t.remove()},200)},3500)}document.body.addEventListener("htmx:responseError",function(){showToast("Error: request failed. Please try again.","toast-error")});document.body.addEventListener("htmx:afterSwap",function(e){var el=e.detail.elt;if(el&&el.getAttribute&&el.getAttribute("hx-patch")&&el.getAttribute("hx-patch").indexOf("/archive")!==-1){showToast("Task archived","toast-success")}})})();`,
          }}
        />
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
