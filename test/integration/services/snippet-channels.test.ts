import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb } from "../../../src/infrastructure/db/client";
import { createSnippetService } from "../../../src/application/snippets/service";
import { snippetChannels } from "../../../src/infrastructure/db/schema";
import { TEST_DATABASE_URL } from "../helpers/setup";
import { cleanupDb } from "../helpers/db";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
const snippetService = createSnippetService(db);

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

describe("addSnippetChannel", () => {
  test("returns created: true for a new channel", async () => {
    const result = await snippetService.addSnippetChannel("C_NEW");

    expect(result.created).toBe(true);
    expect(result.channel.slackChannelId).toBe("C_NEW");
    expect(result.channel.id).toBeTruthy();
    expect(result.channel.createdAt).toBeInstanceOf(Date);
  });

  test("returns created: false for an existing channel", async () => {
    await db.insert(snippetChannels).values({ slackChannelId: "C_EXISTING" });

    const result = await snippetService.addSnippetChannel("C_EXISTING");

    expect(result.created).toBe(false);
    expect(result.channel.slackChannelId).toBe("C_EXISTING");
    expect(result.channel.id).toBeTruthy();
  });

  test("returns the same record on repeated calls", async () => {
    const first = await snippetService.addSnippetChannel("C_REPEAT");
    const second = await snippetService.addSnippetChannel("C_REPEAT");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.channel.id).toBe(second.channel.id);
    expect(first.channel.slackChannelId).toBe(second.channel.slackChannelId);
  });
});

describe("removeSnippetChannel", () => {
  test("returns found: true when channel exists", async () => {
    const [channel] = await db
      .insert(snippetChannels)
      .values({ slackChannelId: "C_DELETE" })
      .returning();

    const result = await snippetService.removeSnippetChannel(channel.id);

    expect(result.found).toBe(true);

    // Verify actually deleted
    const remaining = await snippetService.listSnippetChannels();
    expect(remaining).toHaveLength(0);
  });

  test("returns found: false when channel does not exist", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const result = await snippetService.removeSnippetChannel(fakeId);

    expect(result.found).toBe(false);
  });
});
