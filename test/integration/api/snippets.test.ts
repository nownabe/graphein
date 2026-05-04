import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createSnippetApiRoutes } from "../../../src/api/snippets";
import { createSnippetService } from "../../../src/snippets/service";
import {
  snippets,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  usergroups,
} from "../../../src/db/schema";
import { db, createUser, buildApiApp, apiRequest, cleanupDb } from "../helpers/api";

const snippetService = createSnippetService(db);

function buildApp(mockUser: Awaited<ReturnType<typeof createUser>>) {
  const snippetRoutes = createSnippetApiRoutes({ snippetService });
  return buildApiApp(mockUser, "user", snippetRoutes);
}

async function createUsergroup(overrides?: Partial<typeof usergroups.$inferInsert>) {
  const [group] = await db
    .insert(usergroups)
    .values({
      slackUsergroupId: `S${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Test Group",
      ...overrides,
    })
    .returning();
  return group;
}

async function createSnippet(
  postedById: string,
  overrides?: Partial<typeof snippets.$inferInsert>,
) {
  const [snippet] = await db
    .insert(snippets)
    .values({
      content: "Test snippet",
      postedAt: new Date(),
      postedById,
      ...overrides,
    })
    .returning();
  return snippet;
}

async function addMentionedUser(snippetId: string, userId: string) {
  await db.insert(snippetMentionedUsers).values({ snippetId, userId });
}

async function addMentionedUsergroup(snippetId: string, usergroupId: string) {
  await db.insert(snippetMentionedUsergroups).values({ snippetId, usergroupId });
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
// GET /snippets — basic listing
// ---------------------------------------------------------------------------

describe("GET /snippets", () => {
  test("returns snippets for authenticated user", async () => {
    const user = await createUser();
    await createSnippet(user.id, { content: "Hello world" });

    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("Hello world");
    expect(body.totalSize).toBe(1);
    expect(body.nextPageToken).toBe("");
  });

  test("includes postedBy info", async () => {
    const user = await createUser({ displayName: "Alice", avatarUrl: "https://example.com/a.png" });
    await createSnippet(user.id);

    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets");
    const body = await res.json();
    expect(body.snippets[0].postedBy.displayName).toBe("Alice");
    expect(body.snippets[0].postedBy.avatarUrl).toBe("https://example.com/a.png");
  });

  test("includes mentioned users and usergroups", async () => {
    const poster = await createUser({ displayName: "Poster" });
    const mentioned = await createUser({ slackUserId: "U_MENTIONED", displayName: "Bob" });
    const group = await createUsergroup({ name: "Backend", handle: "backend" });

    const snippet = await createSnippet(poster.id);
    await addMentionedUser(snippet.id, mentioned.id);
    await addMentionedUsergroup(snippet.id, group.id);

    const app = buildApp(poster);
    const res = await apiRequest(app, "/snippets");
    const body = await res.json();
    expect(body.snippets[0].mentionedUsers).toHaveLength(1);
    expect(body.snippets[0].mentionedUsers[0].displayName).toBe("Bob");
    expect(body.snippets[0].mentionedUsergroups).toHaveLength(1);
    expect(body.snippets[0].mentionedUsergroups[0].name).toBe("Backend");
    expect(body.snippets[0].mentionedUsergroups[0].handle).toBe("backend");
  });

  test("returns null handle for usergroups without handle", async () => {
    const poster = await createUser();
    const group = await createUsergroup({ name: "No Handle Group", handle: null });

    const snippet = await createSnippet(poster.id);
    await addMentionedUsergroup(snippet.id, group.id);

    const app = buildApp(poster);
    const res = await apiRequest(app, "/snippets");
    const body = await res.json();
    expect(body.snippets[0].mentionedUsergroups[0].handle).toBeNull();
  });

  test("all users can see all snippets", async () => {
    const user1 = await createUser({ displayName: "User 1" });
    const user2 = await createUser({ slackUserId: "U_OTHER", displayName: "User 2" });
    await createSnippet(user1.id, { content: "From user 1" });
    await createSnippet(user2.id, { content: "From user 2" });

    const app = buildApp(user1);
    const res = await apiRequest(app, "/snippets");
    const body = await res.json();
    expect(body.snippets).toHaveLength(2);
    expect(body.totalSize).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — postedBy filter
// ---------------------------------------------------------------------------

describe("GET /snippets?postedBy", () => {
  test("filters by poster", async () => {
    const user1 = await createUser({ displayName: "Alice" });
    const user2 = await createUser({ slackUserId: "U_BOB", displayName: "Bob" });
    await createSnippet(user1.id, { content: "Alice snippet" });
    await createSnippet(user2.id, { content: "Bob snippet" });

    const app = buildApp(user1);
    const res = await apiRequest(app, `/snippets?postedBy=${user1.id}`);
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("Alice snippet");
    expect(body.totalSize).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — mentionedUser filter
// ---------------------------------------------------------------------------

describe("GET /snippets?mentionedUser", () => {
  test("filters by mentioned user", async () => {
    const poster = await createUser({ displayName: "Poster" });
    const mentioned = await createUser({ slackUserId: "U_M", displayName: "Mentioned" });

    const s1 = await createSnippet(poster.id, { content: "Mentions user" });
    await addMentionedUser(s1.id, mentioned.id);
    await createSnippet(poster.id, { content: "No mentions" });

    const app = buildApp(poster);
    const res = await apiRequest(app, `/snippets?mentionedUser=${mentioned.id}`);
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("Mentions user");
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — mentionedUsergroup filter
// ---------------------------------------------------------------------------

describe("GET /snippets?mentionedUsergroup", () => {
  test("filters by mentioned usergroup", async () => {
    const poster = await createUser();
    const group = await createUsergroup({ name: "Team A" });

    const s1 = await createSnippet(poster.id, { content: "Mentions group" });
    await addMentionedUsergroup(s1.id, group.id);
    await createSnippet(poster.id, { content: "No group mention" });

    const app = buildApp(poster);
    const res = await apiRequest(app, `/snippets?mentionedUsergroup=${group.id}`);
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("Mentions group");
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — OR semantics for mention filters
// ---------------------------------------------------------------------------

describe("GET /snippets?mentionedUser&mentionedUsergroup (OR)", () => {
  test("returns snippets matching either user or usergroup mention", async () => {
    const poster = await createUser();
    const mentioned = await createUser({ slackUserId: "U_M", displayName: "Mentioned" });
    const group = await createUsergroup({ name: "Team B" });

    // Snippet mentions only the user
    const s1 = await createSnippet(poster.id, { content: "User mention only" });
    await addMentionedUser(s1.id, mentioned.id);

    // Snippet mentions only the group
    const s2 = await createSnippet(poster.id, { content: "Group mention only" });
    await addMentionedUsergroup(s2.id, group.id);

    // Snippet mentions neither
    await createSnippet(poster.id, { content: "No mentions" });

    const app = buildApp(poster);
    const res = await apiRequest(
      app,
      `/snippets?mentionedUser=${mentioned.id}&mentionedUsergroup=${group.id}`,
    );
    const body = await res.json();
    expect(body.snippets).toHaveLength(2);
    expect(body.totalSize).toBe(2);
    const contents = body.snippets.map((s: { content: string }) => s.content).sort();
    expect(contents).toEqual(["Group mention only", "User mention only"]);
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — period filters
// ---------------------------------------------------------------------------

describe("GET /snippets?periodStart&periodEnd", () => {
  test("filters by periodStart (inclusive)", async () => {
    const user = await createUser();
    await createSnippet(user.id, {
      content: "Old",
      postedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "New",
      postedAt: new Date("2026-04-15T00:00:00Z"),
    });

    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets?periodStart=2026-04-01T00:00:00Z");
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("New");
  });

  test("filters by periodEnd (exclusive)", async () => {
    const user = await createUser();
    await createSnippet(user.id, {
      content: "Before",
      postedAt: new Date("2026-03-31T23:59:59Z"),
    });
    await createSnippet(user.id, {
      content: "After",
      postedAt: new Date("2026-04-01T00:00:00Z"),
    });

    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets?periodEnd=2026-04-01T00:00:00Z");
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("Before");
  });

  test("filters with both periodStart and periodEnd", async () => {
    const user = await createUser();
    await createSnippet(user.id, {
      content: "Before",
      postedAt: new Date("2026-03-15T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "In range",
      postedAt: new Date("2026-04-10T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "After",
      postedAt: new Date("2026-05-01T00:00:00Z"),
    });

    const app = buildApp(user);
    const res = await apiRequest(
      app,
      "/snippets?periodStart=2026-04-01T00:00:00Z&periodEnd=2026-04-30T00:00:00Z",
    );
    const body = await res.json();
    expect(body.snippets).toHaveLength(1);
    expect(body.snippets[0].content).toBe("In range");
  });
});

// ---------------------------------------------------------------------------
// GET /snippets — pagination
// ---------------------------------------------------------------------------

describe("GET /snippets — pagination", () => {
  test("paginates with pageSize and pageToken", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await createSnippet(user.id, {
        content: `Snippet ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }

    const app = buildApp(user);

    // Page 1
    const res1 = await apiRequest(app, "/snippets?pageSize=2");
    const body1 = await res1.json();
    expect(body1.snippets).toHaveLength(2);
    expect(body1.totalSize).toBe(5);
    expect(body1.nextPageToken).not.toBe("");

    // Page 2
    const res2 = await apiRequest(app, `/snippets?pageSize=2&pageToken=${body1.nextPageToken}`);
    const body2 = await res2.json();
    expect(body2.snippets).toHaveLength(2);
    expect(body2.nextPageToken).not.toBe("");

    // Page 3
    const res3 = await apiRequest(app, `/snippets?pageSize=2&pageToken=${body2.nextPageToken}`);
    const body3 = await res3.json();
    expect(body3.snippets).toHaveLength(1);
    expect(body3.nextPageToken).toBe("");
  });

  test("returns results ordered by postedAt desc", async () => {
    const user = await createUser();
    await createSnippet(user.id, {
      content: "Oldest",
      postedAt: new Date("2026-04-01T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "Newest",
      postedAt: new Date("2026-04-20T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "Middle",
      postedAt: new Date("2026-04-10T00:00:00Z"),
    });

    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets");
    const body = await res.json();
    expect(body.snippets[0].content).toBe("Newest");
    expect(body.snippets[1].content).toBe("Middle");
    expect(body.snippets[2].content).toBe("Oldest");
  });

  test("returns 422 for mismatched pageToken", async () => {
    const user = await createUser();
    for (let i = 0; i < 3; i++) {
      await createSnippet(user.id, {
        content: `S${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }

    const app = buildApp(user);

    // Get a valid token without any filters
    const res1 = await apiRequest(app, "/snippets?pageSize=1");
    const body1 = await res1.json();
    expect(body1.nextPageToken).not.toBe("");

    // Use it with a different filter — should 422
    const res2 = await apiRequest(
      app,
      `/snippets?postedBy=${user.id}&pageToken=${body1.nextPageToken}`,
    );
    expect(res2.status).toBe(422);
    const body2 = await res2.json();
    expect(body2.error.code).toBe("validation_error");
  });

  test("returns 422 for invalid pageToken", async () => {
    const user = await createUser();
    const app = buildApp(user);
    const res = await apiRequest(app, "/snippets?pageToken=not-valid-base64-token");
    expect(res.status).toBe(422);
  });
});
