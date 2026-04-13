import { describe, test, expect, beforeEach } from "bun:test";
import { createTestApp, createTestUser, authRequest, cleanupDb } from "../helpers";

const { app, db, snippetService } = createTestApp();

beforeEach(async () => {
  await cleanupDb(db);
});

describe("GET /snippets", () => {
  test("redirects to login when not authenticated", async () => {
    const res = await app.request("/snippets", {
      headers: { Origin: "http://localhost:3000" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/login");
  });

  test("returns 200 for authenticated user", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/snippets");
    expect(res.status).toBe(200);
  });

  test("shows snippets for the current period", async () => {
    const user = await createTestUser(db);
    await snippetService.createSnippet({
      content: "Daily report content <@U123|alice>",
      postedAt: new Date(),
      slackMessageTs: "1234567890.000001",
      slackChannelId: "C123",
      postedById: user.id,
      mentionedUserIds: [user.id],
      mentionedUsergroupIds: [],
    });

    const res = await authRequest(app, user.id, "/snippets?period=month");
    const html = await res.text();
    expect(html).toContain("Daily report content");
  });

  test("filters by postedBy query param", async () => {
    const user1 = await createTestUser(db, { slackUserId: "U001", email: "u1@test.com" });
    const user2 = await createTestUser(db, { slackUserId: "U002", email: "u2@test.com" });

    await snippetService.createSnippet({
      content: "Report from user1",
      postedAt: new Date(),
      postedById: user1.id,
      mentionedUserIds: [user2.id],
      mentionedUsergroupIds: [],
    });
    await snippetService.createSnippet({
      content: "Report from user2",
      postedAt: new Date(),
      postedById: user2.id,
      mentionedUserIds: [user1.id],
      mentionedUsergroupIds: [],
    });

    const res = await authRequest(
      app,
      user1.id,
      `/snippets?period=month&postedBy=${user1.id}`,
    );
    const html = await res.text();
    expect(html).toContain("Report from user1");
    expect(html).not.toContain("Report from user2");
  });

  test("filters by mentioned user query param", async () => {
    const user1 = await createTestUser(db, { slackUserId: "U001", email: "u1@test.com" });
    const user2 = await createTestUser(db, { slackUserId: "U002", email: "u2@test.com" });

    await snippetService.createSnippet({
      content: "Report mentioning user1",
      postedAt: new Date(),
      postedById: user2.id,
      mentionedUserIds: [user1.id],
      mentionedUsergroupIds: [],
    });
    await snippetService.createSnippet({
      content: "Report mentioning user2",
      postedAt: new Date(),
      postedById: user1.id,
      mentionedUserIds: [user2.id],
      mentionedUsergroupIds: [],
    });

    const res = await authRequest(
      app,
      user1.id,
      `/snippets?period=month&user=${user1.id}`,
    );
    const html = await res.text();
    expect(html).toContain("Report mentioning user1");
    expect(html).not.toContain("Report mentioning user2");
  });

  test("returns empty state when no snippets match", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/snippets?period=day&date=2020-01-01");
    const html = await res.text();
    expect(html).toContain("0 snippets");
  });

  test("filters by period", async () => {
    const user = await createTestUser(db);
    // Create a snippet far in the past
    await snippetService.createSnippet({
      content: "Old report",
      postedAt: new Date("2020-01-15T10:00:00Z"),
      postedById: user.id,
      mentionedUserIds: [user.id],
      mentionedUsergroupIds: [],
    });

    // Query current day — should not include old report
    const res = await authRequest(app, user.id, "/snippets?period=day");
    const html = await res.text();
    expect(html).not.toContain("Old report");
  });
});
