import type { Database } from "../../../src/db/client";
import {
  users,
  tasks,
  taskAssignees,
  taskOwners,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  snippets,
  snippetChannels,
  usergroups,
  appSettings,
  apiKeys,
  kudosEntryMentionedUsergroups,
  kudosEntryMentionedUsers,
  kudosEntries,
  kudos,
  kudosChannels,
  oauthClients,
  oauthAuthorizationCodes,
  oauthRefreshTokens,
} from "../../../src/db/schema";

export async function createTestUser(
  db: Database,
  overrides?: Partial<{
    slackUserId: string;
    email: string;
    displayName: string;
    role: string;
    locale: string;
  }>,
) {
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

export async function cleanupDb(db: Database) {
  await db.delete(oauthAuthorizationCodes);
  await db.delete(oauthRefreshTokens);
  await db.delete(oauthClients);
  await db.delete(apiKeys);
  await db.delete(kudosEntryMentionedUsergroups);
  await db.delete(kudosEntryMentionedUsers);
  await db.delete(kudosEntries);
  await db.delete(kudos);
  await db.delete(kudosChannels);
  await db.delete(snippetMentionedUsers);
  await db.delete(snippetMentionedUsergroups);
  await db.delete(snippets);
  await db.delete(snippetChannels);
  await db.delete(usergroups);
  await db.delete(taskAssignees);
  await db.delete(taskOwners);
  await db.delete(tasks);
  await db.delete(users);
  await db.delete(appSettings);
}
