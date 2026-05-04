import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { ApiKeyService, ApiKeyRole } from "../../../application/api-keys/service";
import { ApiKeysPage, ApiKeysList, ApiKeyCreatedBanner } from "../../../views/pages/api-keys.tsx";

export interface ApiKeyRoutesDeps {
  authMiddleware: MiddlewareHandler;
  apiKeyService: ApiKeyService;
  devMode: boolean;
}

export function createApiKeyRoutes(deps: ApiKeyRoutesDeps) {
  const { authMiddleware, apiKeyService, devMode } = deps;
  const routes = new Hono();

  routes.use("/settings/*", authMiddleware);

  function getLocale(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "locale");
    return cookie === "ja" ? "ja" : "en";
  }

  function getTheme(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "theme");
    return cookie === "light" ? "light" : "dark";
  }

  // List API keys
  routes.get("/settings/api-keys", async (c) => {
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const avatarUrl = c.get("avatarUrl");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);
    const theme = getTheme(c);

    const keys = await apiKeyService.listApiKeys(userId);

    const isHtmx = c.req.header("HX-Request") && !c.req.header("HX-Boosted");
    if (isHtmx) {
      return c.html(<ApiKeysList keys={keys} locale={locale} />);
    }

    return c.html(
      <ApiKeysPage
        keys={keys}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  // Create API key
  routes.post("/settings/api-keys", async (c) => {
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);

    const body = await c.req.parseBody();
    const name = (body.name as string)?.trim();
    if (!name) return c.text("Bad Request", 400);

    const expiration = body.expiration as string;
    let expiresAt: Date | undefined;
    if (expiration && expiration !== "never") {
      const days = Number(expiration);
      if (!Number.isNaN(days) && days > 0) {
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }

    let role: ApiKeyRole = "user";
    if (isAdmin && body.role === "admin") {
      role = "admin";
    }

    const result = await apiKeyService.createApiKey(userId, name, role, expiresAt);

    if (!result.ok) {
      const keys = await apiKeyService.listApiKeys(userId);
      const errorKey =
        result.error === "key_limit_exceeded"
          ? "apiKeys.error.limitExceeded"
          : "apiKeys.error.adminRequired";
      return c.html(<ApiKeysList keys={keys} locale={locale} error={errorKey} />);
    }

    const keys = await apiKeyService.listApiKeys(userId);
    return c.html(
      <>
        <ApiKeyCreatedBanner rawKey={result.rawKey} locale={locale} />
        <ApiKeysList keys={keys} locale={locale} />
      </>,
    );
  });

  // Revoke API key
  routes.post("/settings/api-keys/:id/revoke", async (c) => {
    const keyId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);

    await apiKeyService.revokeApiKey(keyId, userId, isAdmin);

    const keys = await apiKeyService.listApiKeys(userId);
    return c.html(<ApiKeysList keys={keys} locale={locale} />);
  });

  return routes;
}
