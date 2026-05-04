import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb } from "../../../src/infrastructure/db/client";
import { createSnippetService } from "../../../src/application/snippets/service";
import {
  snippets,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  usergroups,
} from "../../../src/infrastructure/db/schema";
import { TEST_DATABASE_URL } from "../helpers/setup";
import { createTestUser, cleanupDb } from "../helpers/db";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
const snippetService = createSnippetService(db);

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

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// listSnippetsKeyset — basic listing
// ---------------------------------------------------------------------------

describe("listSnippetsKeyset", () => {
  test("returns all snippets when no filters applied", async () => {
    const user = await createTestUser(db);
    await createSnippet(user.id, { content: "First" });
    await createSnippet(user.id, { content: "Second" });

    const result = await snippetService.listSnippetsKeyset({}, { pageSize: 50 });

    expect(result.snippets).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns snippets ordered by postedAt desc", async () => {
    const user = await createTestUser(db);
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

    const result = await snippetService.listSnippetsKeyset({}, { pageSize: 50 });

    expect(result.snippets[0].content).toBe("Newest");
    expect(result.snippets[1].content).toBe("Middle");
    expect(result.snippets[2].content).toBe("Oldest");
  });

  test("includes poster info", async () => {
    const user = await createTestUser(db, {
      displayName: "Alice",
    });
    await createSnippet(user.id);

    const result = await snippetService.listSnippetsKeyset({}, { pageSize: 50 });

    expect(result.snippets[0].poster.displayName).toBe("Alice");
    expect(result.snippets[0].poster.id).toBe(user.id);
  });

  test("includes mentioned users and usergroups", async () => {
    const poster = await createTestUser(db, { displayName: "Poster" });
    const mentioned = await createTestUser(db, {
      slackUserId: "U_MENTIONED",
      displayName: "Bob",
    });
    const group = await createUsergroup({ name: "Backend", handle: "backend" });

    const snippet = await createSnippet(poster.id);
    await addMentionedUser(snippet.id, mentioned.id);
    await addMentionedUsergroup(snippet.id, group.id);

    const result = await snippetService.listSnippetsKeyset({}, { pageSize: 50 });

    expect(result.snippets[0].mentionedUsers).toHaveLength(1);
    expect(result.snippets[0].mentionedUsers[0].displayName).toBe("Bob");
    expect(result.snippets[0].mentionedUsergroups).toHaveLength(1);
    expect(result.snippets[0].mentionedUsergroups[0].name).toBe("Backend");
    expect(result.snippets[0].mentionedUsergroups[0].handle).toBe("backend");
  });
});

// ---------------------------------------------------------------------------
// listSnippetsKeyset — filters
// ---------------------------------------------------------------------------

describe("listSnippetsKeyset — filters", () => {
  test("filters by postedById", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });
    await createSnippet(alice.id, { content: "Alice snippet" });
    await createSnippet(bob.id, { content: "Bob snippet" });

    const result = await snippetService.listSnippetsKeyset(
      { postedById: alice.id },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("Alice snippet");
    expect(result.total).toBe(1);
  });

  test("filters by mentionedUserIds", async () => {
    const poster = await createTestUser(db, { displayName: "Poster" });
    const mentioned = await createTestUser(db, { slackUserId: "U_M", displayName: "Mentioned" });

    const s1 = await createSnippet(poster.id, { content: "Mentions user" });
    await addMentionedUser(s1.id, mentioned.id);
    await createSnippet(poster.id, { content: "No mentions" });

    const result = await snippetService.listSnippetsKeyset(
      { mentionedUserIds: [mentioned.id] },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("Mentions user");
  });

  test("filters by mentionedUsergroupIds", async () => {
    const poster = await createTestUser(db);
    const group = await createUsergroup({ name: "Team A" });

    const s1 = await createSnippet(poster.id, { content: "Mentions group" });
    await addMentionedUsergroup(s1.id, group.id);
    await createSnippet(poster.id, { content: "No group mention" });

    const result = await snippetService.listSnippetsKeyset(
      { mentionedUsergroupIds: [group.id] },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("Mentions group");
  });

  test("mentionedUserIds and mentionedUsergroupIds use OR semantics", async () => {
    const poster = await createTestUser(db);
    const mentioned = await createTestUser(db, { slackUserId: "U_M", displayName: "Mentioned" });
    const group = await createUsergroup({ name: "Team B" });

    const s1 = await createSnippet(poster.id, { content: "User mention only" });
    await addMentionedUser(s1.id, mentioned.id);

    const s2 = await createSnippet(poster.id, { content: "Group mention only" });
    await addMentionedUsergroup(s2.id, group.id);

    await createSnippet(poster.id, { content: "No mentions" });

    const result = await snippetService.listSnippetsKeyset(
      { mentionedUserIds: [mentioned.id], mentionedUsergroupIds: [group.id] },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(2);
    expect(result.total).toBe(2);
    const contents = result.snippets.map((s) => s.content).sort();
    expect(contents).toEqual(["Group mention only", "User mention only"]);
  });

  test("filters by periodStart (inclusive)", async () => {
    const user = await createTestUser(db);
    await createSnippet(user.id, {
      content: "Old",
      postedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await createSnippet(user.id, {
      content: "New",
      postedAt: new Date("2026-04-15T00:00:00Z"),
    });

    const result = await snippetService.listSnippetsKeyset(
      { periodStart: new Date("2026-04-01T00:00:00Z") },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("New");
  });

  test("filters by periodEnd (exclusive)", async () => {
    const user = await createTestUser(db);
    await createSnippet(user.id, {
      content: "Before",
      postedAt: new Date("2026-03-31T23:59:59Z"),
    });
    await createSnippet(user.id, {
      content: "After",
      postedAt: new Date("2026-04-01T00:00:00Z"),
    });

    const result = await snippetService.listSnippetsKeyset(
      { periodEnd: new Date("2026-04-01T00:00:00Z") },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("Before");
  });

  test("filters with both periodStart and periodEnd", async () => {
    const user = await createTestUser(db);
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

    const result = await snippetService.listSnippetsKeyset(
      {
        periodStart: new Date("2026-04-01T00:00:00Z"),
        periodEnd: new Date("2026-04-30T00:00:00Z"),
      },
      { pageSize: 50 },
    );

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toBe("In range");
  });
});

// ---------------------------------------------------------------------------
// listSnippetsKeyset — keyset pagination
// ---------------------------------------------------------------------------

describe("listSnippetsKeyset — keyset pagination", () => {
  test("paginates with cursor", async () => {
    const user = await createTestUser(db);
    for (let i = 0; i < 5; i++) {
      await createSnippet(user.id, {
        content: `Snippet ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }

    // Page 1
    const page1 = await snippetService.listSnippetsKeyset({}, { pageSize: 2 });
    expect(page1.snippets).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasNextPage).toBe(true);

    // Page 2
    const lastSnippet1 = page1.snippets[page1.snippets.length - 1];
    const page2 = await snippetService.listSnippetsKeyset(
      {},
      { pageSize: 2, cursor: { postedAt: lastSnippet1.postedAt, id: lastSnippet1.id } },
    );
    expect(page2.snippets).toHaveLength(2);
    expect(page2.hasNextPage).toBe(true);

    // Page 3
    const lastSnippet2 = page2.snippets[page2.snippets.length - 1];
    const page3 = await snippetService.listSnippetsKeyset(
      {},
      { pageSize: 2, cursor: { postedAt: lastSnippet2.postedAt, id: lastSnippet2.id } },
    );
    expect(page3.snippets).toHaveLength(1);
    expect(page3.hasNextPage).toBe(false);
  });

  test("no duplicates across pages", async () => {
    const user = await createTestUser(db);
    for (let i = 0; i < 5; i++) {
      await createSnippet(user.id, {
        content: `Snippet ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }

    const allIds: string[] = [];
    let cursor: { postedAt: Date; id: string } | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await snippetService.listSnippetsKeyset({}, { pageSize: 2, cursor });
      for (const s of result.snippets) {
        allIds.push(s.id);
      }
      if (!result.hasNextPage) break;
      const last = result.snippets[result.snippets.length - 1];
      cursor = { postedAt: last.postedAt, id: last.id };
    }

    expect(allIds).toHaveLength(5);
    expect(new Set(allIds).size).toBe(5);
  });

  test("stable pagination with same-timestamp entries", async () => {
    const user = await createTestUser(db);
    const sameTime = new Date("2026-04-10T10:00:00Z");
    for (let i = 0; i < 3; i++) {
      await createSnippet(user.id, {
        content: `Snippet same-time ${i}`,
        postedAt: sameTime,
      });
    }

    const allIds: string[] = [];
    let cursor: { postedAt: Date; id: string } | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await snippetService.listSnippetsKeyset({}, { pageSize: 1, cursor });
      for (const s of result.snippets) {
        allIds.push(s.id);
      }
      if (!result.hasNextPage) break;
      const last = result.snippets[result.snippets.length - 1];
      cursor = { postedAt: last.postedAt, id: last.id };
    }

    expect(allIds).toHaveLength(3);
    expect(new Set(allIds).size).toBe(3);
  });

  test("pagination with filters applied returns correct subset", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    for (let i = 0; i < 4; i++) {
      await createSnippet(alice.id, {
        content: `Alice ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }
    await createSnippet(bob.id, { content: "Bob snippet" });

    const allContents: string[] = [];
    let cursor: { postedAt: Date; id: string } | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await snippetService.listSnippetsKeyset(
        { postedById: alice.id },
        { pageSize: 2, cursor },
      );
      for (const s of result.snippets) {
        allContents.push(s.content);
      }
      if (!result.hasNextPage) break;
      const last = result.snippets[result.snippets.length - 1];
      cursor = { postedAt: last.postedAt, id: last.id };
    }

    expect(allContents).toHaveLength(4);
    expect(allContents.every((c) => c.startsWith("Alice"))).toBe(true);
  });

  test("total reflects filtered count, not all snippets", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    await createSnippet(alice.id, { content: "Alice 1" });
    await createSnippet(alice.id, { content: "Alice 2" });
    await createSnippet(bob.id, { content: "Bob 1" });

    const result = await snippetService.listSnippetsKeyset(
      { postedById: alice.id },
      { pageSize: 50 },
    );

    expect(result.total).toBe(2);
    expect(result.snippets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// listSnippets — offset pagination
// ---------------------------------------------------------------------------

describe("listSnippets — offset pagination", () => {
  test("paginates with limit and offset", async () => {
    const user = await createTestUser(db);
    for (let i = 0; i < 5; i++) {
      await createSnippet(user.id, {
        content: `Snippet ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      });
    }

    const page1 = await snippetService.listSnippets({ limit: 2, offset: 0 });
    expect(page1.snippets).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await snippetService.listSnippets({ limit: 2, offset: 2 });
    expect(page2.snippets).toHaveLength(2);

    const page3 = await snippetService.listSnippets({ limit: 2, offset: 4 });
    expect(page3.snippets).toHaveLength(1);

    // No duplicates across offset pages
    const allIds = [...page1.snippets, ...page2.snippets, ...page3.snippets].map((s) => s.id);
    expect(new Set(allIds).size).toBe(5);
  });
});
