import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb } from "../../../src/infrastructure/db/client";
import { createKudosService } from "../../../src/application/kudos/service";
import {
  kudos,
  kudosEntries,
  kudosEntryMentionedUsers,
} from "../../../src/infrastructure/db/schema";
import { TEST_DATABASE_URL } from "../helpers/setup";
import { createTestUser, cleanupDb } from "../helpers/db";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
const kudosService = createKudosService(db);

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

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// listKudosEntries — basic listing
// ---------------------------------------------------------------------------

describe("listKudosEntries", () => {
  test("returns all kudos entries when no filters applied", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Great work!",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
    });

    const result = await kudosService.listKudosEntries({ limit: 50 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("Great work!");
    expect(result.entries[0].poster.displayName).toBe("Alice");
    expect(result.total).toBe(1);
  });

  test("returns entries ordered by postedAt desc", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

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

    const result = await kudosService.listKudosEntries({ limit: 50 });

    expect(result.entries[0].message).toBe("Newer");
    expect(result.entries[1].message).toBe("Older");
  });

  test("includes poster info and slack permalink", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    await createKudosEntry({
      posterId: poster.id,
      message: "Nice!",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [recipient.id],
      slackPermalink: "https://slack.com/archives/C1234/p1234567890",
    });

    const result = await kudosService.listKudosEntries({ limit: 50 });

    expect(result.entries[0].poster.id).toBe(poster.id);
    expect(result.entries[0].poster.displayName).toBe("Alice");
    expect(result.entries[0].slackPermalink).toBe("https://slack.com/archives/C1234/p1234567890");
  });
});

// ---------------------------------------------------------------------------
// listKudosEntries — filters
// ---------------------------------------------------------------------------

describe("listKudosEntries — filters", () => {
  test("filters by postedById", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createTestUser(db, { slackUserId: "U_CHARLIE", displayName: "Charlie" });

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

    const result = await kudosService.listKudosEntries({
      postedById: alice.id,
      limit: 50,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("From Alice");
  });

  test("filters by mentionedUserId (recipient)", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createTestUser(db, { slackUserId: "U_CHARLIE", displayName: "Charlie" });

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

    const result = await kudosService.listKudosEntries({
      mentionedUserId: bob.id,
      limit: 50,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("For Bob");
  });

  test("excludes self-posted kudos when filtering by mentionedUserId", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

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

    const result = await kudosService.listKudosEntries({
      mentionedUserId: alice.id,
      limit: 50,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("From Bob to Alice");
  });

  test("filters by periodStart and periodEnd", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

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

    const result = await kudosService.listKudosEntries({
      periodStart: new Date("2026-04-10T00:00:00Z"),
      periodEnd: new Date("2026-04-20T00:00:00Z"),
      limit: 50,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("Mid");
  });

  test("total reflects filtered count", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createTestUser(db, { slackUserId: "U_CHARLIE", displayName: "Charlie" });

    await createKudosEntry({
      posterId: alice.id,
      message: "Alice 1",
      postedAt: new Date("2026-04-10T10:00:00Z"),
      mentionedUserIds: [charlie.id],
    });
    await createKudosEntry({
      posterId: alice.id,
      message: "Alice 2",
      postedAt: new Date("2026-04-11T10:00:00Z"),
      mentionedUserIds: [charlie.id],
    });
    await createKudosEntry({
      posterId: bob.id,
      message: "Bob 1",
      postedAt: new Date("2026-04-12T10:00:00Z"),
      mentionedUserIds: [charlie.id],
    });

    const result = await kudosService.listKudosEntries({
      postedById: alice.id,
      limit: 50,
    });

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// listKudosEntries — keyset pagination
// ---------------------------------------------------------------------------

describe("listKudosEntries — keyset pagination", () => {
  test("paginates with cursor", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    for (let i = 0; i < 5; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
        mentionedUserIds: [recipient.id],
      });
    }

    // Page 1
    const page1 = await kudosService.listKudosEntries({ limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasNext).toBe(true);

    // Page 2
    const lastEntry1 = page1.entries[page1.entries.length - 1];
    const page2 = await kudosService.listKudosEntries({
      limit: 2,
      cursorPostedAt: lastEntry1.postedAt,
      cursorEntryId: lastEntry1.entryId,
    });
    expect(page2.entries).toHaveLength(2);
    expect(page2.hasNext).toBe(true);

    // Page 3
    const lastEntry2 = page2.entries[page2.entries.length - 1];
    const page3 = await kudosService.listKudosEntries({
      limit: 2,
      cursorPostedAt: lastEntry2.postedAt,
      cursorEntryId: lastEntry2.entryId,
    });
    expect(page3.entries).toHaveLength(1);
    expect(page3.hasNext).toBe(false);
  });

  test("no duplicates across pages", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    for (let i = 0; i < 5; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
        mentionedUserIds: [recipient.id],
      });
    }

    const allIds: string[] = [];
    let cursorPostedAt: Date | undefined;
    let cursorEntryId: string | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await kudosService.listKudosEntries({
        limit: 2,
        cursorPostedAt,
        cursorEntryId,
      });
      for (const e of result.entries) {
        allIds.push(e.entryId);
      }
      if (!result.hasNext) break;
      const last = result.entries[result.entries.length - 1];
      cursorPostedAt = last.postedAt;
      cursorEntryId = last.entryId;
    }

    expect(allIds).toHaveLength(5);
    expect(new Set(allIds).size).toBe(5);
  });

  test("stable pagination with same-timestamp entries", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    const sameTime = new Date("2026-04-10T10:00:00Z");
    for (let i = 0; i < 3; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos same-time ${i}`,
        postedAt: sameTime,
        mentionedUserIds: [recipient.id],
      });
    }

    const allIds: string[] = [];
    let cursorPostedAt: Date | undefined;
    let cursorEntryId: string | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await kudosService.listKudosEntries({
        limit: 1,
        cursorPostedAt,
        cursorEntryId,
      });
      for (const e of result.entries) {
        allIds.push(e.entryId);
      }
      if (!result.hasNext) break;
      const last = result.entries[result.entries.length - 1];
      cursorPostedAt = last.postedAt;
      cursorEntryId = last.entryId;
    }

    expect(allIds).toHaveLength(3);
    expect(new Set(allIds).size).toBe(3);
  });

  test("pagination with filters applied returns correct subset", async () => {
    const alice = await createTestUser(db, { displayName: "Alice" });
    const bob = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });
    const charlie = await createTestUser(db, { slackUserId: "U_CHARLIE", displayName: "Charlie" });

    for (let i = 0; i < 4; i++) {
      await createKudosEntry({
        posterId: alice.id,
        message: `Alice ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
        mentionedUserIds: [charlie.id],
      });
    }
    await createKudosEntry({
      posterId: bob.id,
      message: "Bob entry",
      postedAt: new Date("2026-04-20T10:00:00Z"),
      mentionedUserIds: [charlie.id],
    });

    const allMessages: string[] = [];
    let cursorPostedAt: Date | undefined;
    let cursorEntryId: string | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await kudosService.listKudosEntries({
        postedById: alice.id,
        limit: 2,
        cursorPostedAt,
        cursorEntryId,
      });
      for (const e of result.entries) {
        allMessages.push(e.message);
      }
      if (!result.hasNext) break;
      const last = result.entries[result.entries.length - 1];
      cursorPostedAt = last.postedAt;
      cursorEntryId = last.entryId;
    }

    expect(allMessages).toHaveLength(4);
    expect(allMessages.every((m) => m.startsWith("Alice"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listKudosEntries — offset pagination (web UI)
// ---------------------------------------------------------------------------

describe("listKudosEntries — offset pagination", () => {
  test("paginates with offset", async () => {
    const poster = await createTestUser(db, { displayName: "Alice" });
    const recipient = await createTestUser(db, { slackUserId: "U_BOB", displayName: "Bob" });

    for (let i = 0; i < 5; i++) {
      await createKudosEntry({
        posterId: poster.id,
        message: `Kudos ${i}`,
        postedAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
        mentionedUserIds: [recipient.id],
      });
    }

    const page1 = await kudosService.listKudosEntries({ limit: 2, offset: 0 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await kudosService.listKudosEntries({ limit: 2, offset: 2 });
    expect(page2.entries).toHaveLength(2);

    const page3 = await kudosService.listKudosEntries({ limit: 2, offset: 4 });
    expect(page3.entries).toHaveLength(1);

    // No duplicates across offset pages
    const allIds = [...page1.entries, ...page2.entries, ...page3.entries].map((e) => e.entryId);
    expect(new Set(allIds).size).toBe(5);
  });
});
