import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { createKudosApiRoutes } from "../../src/api/kudos";
import { createApiAuthMiddleware } from "../../src/api/middleware";
import { createDb } from "../../src/db/client";
import { createKudosService } from "../../src/kudos/service";
import { users, kudos, kudosEntries, kudosEntryMentionedUsers } from "../../src/db/schema";
import type { ApiKeyService } from "../../src/api-keys/service";
import { TEST_DATABASE_URL } from "./setup";
import { cleanupDb } from "./helpers";

const db = createDb(TEST_DATABASE_URL, { max: 1 });
const kudosService = createKudosService(db);

function createMockApiKeyService(mockUser: typeof users.$inferSelect): ApiKeyService {
  return {
    createApiKey: async () => ({ ok: false as const, error: "key_limit_exceeded" as const }),
    listApiKeys: async () => [],
    revokeApiKey: async () => null,
    verifyApiKey: async () => ({ user: mockUser as never, role: "user" as const }),
  };
}

function buildApp(mockUser: typeof users.$inferSelect) {
  const apiKeyService = createMockApiKeyService(mockUser);
  const authMiddleware = createApiAuthMiddleware(apiKeyService);
  const kudosRoutes = createKudosApiRoutes({ kudosService });

  const app = new Hono();
  app.use("/*", authMiddleware);
  app.route("/", kudosRoutes);
  return app;
}

async function req(app: Hono, path: string) {
  return app.request(path, {
    headers: { Authorization: "Bearer gph_testkey" },
  });
}

async function createUser(overrides?: Partial<typeof users.$inferInsert>) {
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

async function createKudosEntry(opts: {
  posterId: string;
  message: string;
  postedAt: Date;
  mentionedUserIds?: string[];
  slackPermalink?: string;
}) {
  const [kudosRecord] = await db
    .insert(kudos)
    .values({
      postedAt: opts.postedAt,
      postedById: opts.posterId,
      slackPermalink: opts.slackPermalink ?? null,
    })
    .returning();

  const [entry] = await db
    .insert(kudosEntries)
    .values({ kudosId: kudosRecord.id, message: opts.message })
    .returning();

  if (opts.mentionedUserIds?.length) {
    await db.insert(kudosEntryMentionedUsers).values(
      opts.mentionedUserIds.map((userId) => ({
        kudosEntryId: entry.id,
        userId,
      })),
    );
  }

  return { kudosRecord, entry };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// GET /kudos — list kudos
// ---------------------------------------------------------------------------

describe("GET /kudos", () => {
  test("returns all kudos entries", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Great work!",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });

    const app = buildApp(poster);
    const res = await req(app, "/kudos");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kudos).toHaveLength(1);
    expect(body.kudos[0].message).toBe("Great work!");
    expect(body.kudos[0].postedBy.displayName).toBe("Alice");
    expect(body.totalSize).toBe(1);
  });

  test("filters by postedBy", async () => {
    const alice = await createUser({ displayName: "Alice" });
    const bob = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createUser({ slackUserId: "U_CHARLIE", displayName: "Charlie" });

    await createKudosEntry({
      posterId: alice.id,
      message: "From Alice",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [charlie.id],
    });
    await createKudosEntry({
      posterId: bob.id,
      message: "From Bob",
      postedAt: new Date("2026-04-10T11:00:00Z"),
      mentionedUserIds: [charlie.id],
    });

    const app = buildApp(alice);
    const res = await req(app, `/kudos?postedBy=${alice.id}`);
    const body = await res.json();
    expect(body.kudos).toHaveLength(1);
    expect(body.kudos[0].message).toBe("From Alice");
  });

  test("filters by user (mentioned recipient)", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const bob = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createUser({ slackUserId: "U_CHARLIE", displayName: "Charlie" });

    await createKudosEntry({
      posterId: poster.id,
      message: "For Bob",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [bob.id],
    });
    await createKudosEntry({
      posterId: poster.id,
      message: "For Charlie",
      postedAt: new Date("2026-04-10T11:00:00Z"),
      mentionedUserIds: [charlie.id],
    });

    const app = buildApp(poster);
    const res = await req(app, `/kudos?user=${bob.id}`);
    const body = await res.json();
    expect(body.kudos).toHaveLength(1);
    expect(body.kudos[0].message).toBe("For Bob");
  });

  test("excludes self-posted kudos when filtering by user", async () => {
    const alice = await createUser({ displayName: "Alice" });
    const bob = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    // Alice mentions herself — should be excluded
    await createKudosEntry({
      posterId: alice.id,
      message: "Self mention",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [alice.id],
    });
    // Bob mentions Alice — should be included
    await createKudosEntry({
      posterId: bob.id,
      message: "From Bob to Alice",
      postedAt: new Date("2026-04-10T11:00:00Z"),
      mentionedUserIds: [alice.id],
    });

    const app = buildApp(alice);
    const res = await req(app, `/kudos?user=${alice.id}`);
    const body = await res.json();
    expect(body.kudos).toHaveLength(1);
    expect(body.kudos[0].message).toBe("From Bob to Alice");
  });

  test("filters by periodStart and periodEnd", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Early",
      postedAt: new Date("2026-04-05T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });
    await createKudosEntry({
      posterId: poster.id,
      message: "Mid",
      postedAt: new Date("2026-04-15T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });
    await createKudosEntry({
      posterId: poster.id,
      message: "Late",
      postedAt: new Date("2026-04-25T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });

    const app = buildApp(poster);
    const res = await req(
      app,
      "/kudos?periodStart=2026-04-10T00:00:00Z&periodEnd=2026-04-20T00:00:00Z",
    );
    const body = await res.json();
    expect(body.kudos).toHaveLength(1);
    expect(body.kudos[0].message).toBe("Mid");
  });

  test("paginates with pageSize and pageToken", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    // Create 3 kudos entries with distinct timestamps
    for (let i = 0; i < 3; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos ${i}`,
        postedAt: new Date(`2026-04-1${i}T10:00:00Z`),
        mentionedUserIds: [recipient.id],
      });
    }

    const app = buildApp(poster);

    // Page 1
    const res1 = await req(app, "/kudos?pageSize=2");
    const body1 = await res1.json();
    expect(body1.kudos).toHaveLength(2);
    expect(body1.nextPageToken).not.toBe("");
    expect(body1.totalSize).toBe(3);

    // Page 2
    const res2 = await req(app, `/kudos?pageSize=2&pageToken=${body1.nextPageToken}`);
    const body2 = await res2.json();
    expect(body2.kudos).toHaveLength(1);
    expect(body2.nextPageToken).toBe("");
  });

  test("keyset pagination returns no duplicates across pages", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    // Create 5 entries
    for (let i = 0; i < 5; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
        mentionedUserIds: [recipient.id],
      });
    }

    const app = buildApp(poster);
    const allIds: string[] = [];

    // Paginate through all entries one at a time
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const url = pageToken ? `/kudos?pageSize=2&pageToken=${pageToken}` : "/kudos?pageSize=2";
      const res = await req(app, url);
      const body = await res.json();
      for (const k of body.kudos) {
        allIds.push(k.id);
      }
      pageToken = body.nextPageToken;
      if (pageToken === "") break;
    }

    expect(allIds).toHaveLength(5);
    // No duplicates
    expect(new Set(allIds).size).toBe(5);
  });

  test("keyset pagination is stable with same-timestamp entries", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    // Create 3 entries with the SAME timestamp to test tie-breaking
    const sameTime = new Date("2026-04-10T10:00:00Z");
    for (let i = 0; i < 3; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos same-time ${i}`,
        postedAt: sameTime,
        mentionedUserIds: [recipient.id],
      });
    }

    const app = buildApp(poster);
    const allIds: string[] = [];

    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const url = pageToken ? `/kudos?pageSize=1&pageToken=${pageToken}` : "/kudos?pageSize=1";
      const res = await req(app, url);
      const body = await res.json();
      for (const k of body.kudos) {
        allIds.push(k.id);
      }
      pageToken = body.nextPageToken;
      if (pageToken === "") break;
    }

    expect(allIds).toHaveLength(3);
    // No duplicates even with same timestamps
    expect(new Set(allIds).size).toBe(3);
  });

  test("returns 422 when pageToken filters mismatch", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    // Need at least 2 entries to get a nextPageToken with pageSize=1
    await createKudosEntry({
      posterId: poster.id,
      message: "Kudos 1",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });
    await createKudosEntry({
      posterId: poster.id,
      message: "Kudos 2",
      postedAt: new Date("2026-04-11T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });

    const app = buildApp(poster);

    // Get a valid token without filters
    const res1 = await req(app, "/kudos?pageSize=1");
    const body1 = await res1.json();
    expect(body1.nextPageToken).not.toBe("");

    // Use the token with different filters — should fail
    const res2 = await req(app, `/kudos?postedBy=${poster.id}&pageToken=${body1.nextPageToken}`);
    expect(res2.status).toBe(422);
  });

  test("returns ordered by postedAt descending", async () => {
    const poster = await createUser({ displayName: "Alice" });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Older",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });
    await createKudosEntry({
      posterId: poster.id,
      message: "Newer",
      postedAt: new Date("2026-04-15T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });

    const app = buildApp(poster);
    const res = await req(app, "/kudos");
    const body = await res.json();
    expect(body.kudos[0].message).toBe("Newer");
    expect(body.kudos[1].message).toBe("Older");
  });

  test("response includes expected fields", async () => {
    const poster = await createUser({
      displayName: "Alice",
      avatarUrl: "https://example.com/a.png",
    });
    const recipient = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Great job!",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
      slackPermalink: "https://slack.com/archives/C1234/p1234567890",
    });

    const app = buildApp(poster);
    const res = await req(app, "/kudos");
    const body = await res.json();
    const entry = body.kudos[0];

    expect(entry.id).toBeDefined();
    expect(entry.message).toBe("Great job!");
    expect(entry.postedBy.id).toBe(poster.id);
    expect(entry.postedBy.displayName).toBe("Alice");
    expect(entry.postedBy.avatarUrl).toBe("https://example.com/a.png");
    expect(entry.postedAt).toBe("2026-04-10T10:00:00.000Z");
    expect(entry.slackPermalink).toBe("https://slack.com/archives/C1234/p1234567890");
  });
});
