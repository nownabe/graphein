import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb } from "../../../src/db/client";
import { createKudosService } from "../../../src/kudos/service";
import { kudosChannels } from "../../../src/db/schema";
import { TEST_DATABASE_URL } from "../helpers/setup";
import { cleanupDb } from "../helpers/db";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
const kudosService = createKudosService(db);

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

describe("addKudosChannel", () => {
  test("returns created: true for a new channel", async () => {
    const result = await kudosService.addKudosChannel("C_NEW_KUDOS");

    expect(result.created).toBe(true);
    expect(result.channel.slackChannelId).toBe("C_NEW_KUDOS");
    expect(result.channel.id).toBeTruthy();
    expect(result.channel.createdAt).toBeInstanceOf(Date);
  });

  test("returns created: false for an existing channel", async () => {
    await db.insert(kudosChannels).values({ slackChannelId: "C_EXISTING_KUDOS" });

    const result = await kudosService.addKudosChannel("C_EXISTING_KUDOS");

    expect(result.created).toBe(false);
    expect(result.channel.slackChannelId).toBe("C_EXISTING_KUDOS");
    expect(result.channel.id).toBeTruthy();
  });

  test("returns the same record on repeated calls", async () => {
    const first = await kudosService.addKudosChannel("C_REPEAT_KUDOS");
    const second = await kudosService.addKudosChannel("C_REPEAT_KUDOS");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.channel.id).toBe(second.channel.id);
    expect(first.channel.slackChannelId).toBe(second.channel.slackChannelId);
  });
});

describe("removeKudosChannel", () => {
  test("returns found: true when channel exists", async () => {
    const [channel] = await db
      .insert(kudosChannels)
      .values({ slackChannelId: "C_DELETE_KUDOS" })
      .returning();

    const result = await kudosService.removeKudosChannel(channel.id);

    expect(result.found).toBe(true);

    // Verify actually deleted
    const remaining = await kudosService.listKudosChannels();
    expect(remaining).toHaveLength(0);
  });

  test("returns found: false when channel does not exist", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const result = await kudosService.removeKudosChannel(fakeId);

    expect(result.found).toBe(false);
  });
});
