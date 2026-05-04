import { Hono } from "hono";
import { createApiAuthMiddleware } from "../../../src/adapters/api/middleware";
import { createDb } from "../../../src/infrastructure/db/client";
import { users } from "../../../src/infrastructure/db/schema";
import type { ApiKeyService } from "../../../src/application/api-keys/service";
import { TEST_DATABASE_URL } from "./setup";
import { cleanupDb } from "./db";

export { cleanupDb };

export const db = createDb(TEST_DATABASE_URL, { max: 1 });

export function createMockApiKeyService(
  mockUser: typeof users.$inferSelect,
  role: "user" | "admin" = "user",
): ApiKeyService {
  return {
    createApiKey: async () => ({ ok: false as const, error: "key_limit_exceeded" as const }),
    listApiKeys: async () => [],
    revokeApiKey: async () => null,
    verifyApiKey: async () => ({ user: mockUser as never, role }),
  };
}

export function buildApiApp(
  mockUser: typeof users.$inferSelect,
  role: "user" | "admin",
  routes: Hono,
) {
  const apiKeyService = createMockApiKeyService(mockUser, role);
  const authMiddleware = createApiAuthMiddleware(apiKeyService);

  const app = new Hono();
  app.use("/*", authMiddleware);
  app.route("/", routes);
  return app;
}

export async function apiRequest(app: Hono, path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      Authorization: "Bearer gph_testkey",
      ...init?.headers,
    },
  });
}

export async function createUser(overrides?: Partial<typeof users.$inferInsert>) {
  const [user] = await db
    .insert(users)
    .values({
      slackUserId: `U${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      email: "test@example.com",
      displayName: "Test User",
      ...overrides,
    })
    .returning();
  return user;
}
