import { describe, test, expect } from "bun:test";
import { sign } from "hono/jwt";
import { createSessionHelpers } from "./session";

const JWT_SECRET = "test-secret";

describe("createSessionHelpers", () => {
  const session = createSessionHelpers(JWT_SECRET);

  test("createToken produces a token that verifyToken accepts", async () => {
    const token = await session.createToken("user-1", "Alice");
    const payload = await session.verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
    expect(payload!.name).toBe("Alice");
    expect(payload!.typ).toBe("session");
  });

  test("rejects MCP access token signed with same secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const mcpToken = await sign(
      {
        sub: "user-1",
        aud: "https://example.com/mcp",
        scope: "graphein",
        typ: "mcp+jwt",
        exp: now + 3600,
        iat: now,
      },
      JWT_SECRET,
      "HS256",
    );

    const payload = await session.verifyToken(mcpToken);
    expect(payload).toBeNull();
  });

  test("rejects token without typ claim", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: "user-1", name: "Alice", exp: now + 3600 },
      JWT_SECRET,
      "HS256",
    );

    const payload = await session.verifyToken(token);
    expect(payload).toBeNull();
  });

  test("rejects token signed with wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: "user-1", name: "Alice", typ: "session", exp: now + 3600 },
      "wrong-secret",
      "HS256",
    );

    const payload = await session.verifyToken(token);
    expect(payload).toBeNull();
  });
});
