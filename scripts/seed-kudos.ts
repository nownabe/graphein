/**
 * Seed script: Insert dummy data for kudos UI testing.
 * Reuses users and usergroups created by seed-snippets.ts.
 * - Creates kudos entries from 2025-03-03 to 2026-04-13
 * - Each kudos message has 1-3 entries, each targeting 1-2 users/groups
 *
 * Usage: bun run scripts/seed-kudos.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://graphein:graphein@localhost:15432/graphein";

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const kudosMessages = [
  "thanks for the great code review!",
  "awesome work on the deployment!",
  "thanks for helping with the bug fix",
  "great presentation today!",
  "thanks for the quick turnaround on the PR",
  "amazing work on the new feature",
  "thanks for staying late to fix the production issue",
  "great job mentoring the new hire",
  "thanks for the detailed documentation",
  "excellent work on improving test coverage",
  "素晴らしいコードレビューありがとう！",
  "デプロイ作業お疲れ様でした！",
  "バグ修正のサポートありがとうございます",
  "今日のプレゼン最高でした！",
  "PRの迅速な対応ありがとうございます",
  "thanks for the pair programming session",
  "great job on the architecture design",
  "thanks for organizing the team event",
  "awesome work on the performance optimization",
  "thanks for the thoughtful feedback",
];

function getMondayDates(): Date[] {
  const dates: Date[] = [];
  const start = new Date("2025-03-03T09:00:00+09:00");
  const end = new Date("2026-04-13T23:59:59+09:00");
  const d = new Date(start);
  while (d <= end) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

async function main() {
  console.log("Seeding kudos data...");

  // Get existing users and usergroups
  const allUsers = await db.select({ id: schema.users.id }).from(schema.users);
  const allGroups = await db.select({ id: schema.usergroups.id }).from(schema.usergroups);
  const userIds = allUsers.map((u) => u.id);
  const groupIds = allGroups.map((g) => g.id);

  if (userIds.length === 0) {
    console.error("No users found. Run seed-snippets.ts first.");
    process.exit(1);
  }

  console.log(`Found ${userIds.length} users and ${groupIds.length} usergroups`);

  const mondays = getMondayDates();
  let kudosCount = 0;
  let entryCount = 0;
  let globalIdx = 0;

  // Each week, ~20 users post kudos
  for (const monday of mondays) {
    const posters = pickN(userIds, 20);

    for (const posterId of posters) {
      const postedAt = new Date(monday.getTime() + Math.random() * 8 * 60 * 60 * 1000);

      // Insert kudos record
      const [kudosRecord] = await db
        .insert(schema.kudos)
        .values({
          slackMessageTs: `${Math.floor(postedAt.getTime() / 1000)}.${String(globalIdx++).padStart(6, "0")}`,
          slackChannelId: "C_DUMMY_KUDOS",
          slackPermalink: null,
          postedAt,
          postedById: posterId,
        })
        .returning({ id: schema.kudos.id });

      // 1-3 entries per kudos message
      const numEntries = 1 + Math.floor(Math.random() * 3);
      for (let e = 0; e < numEntries; e++) {
        const message = pick(kudosMessages);

        const [entryRecord] = await db
          .insert(schema.kudosEntries)
          .values({
            kudosId: kudosRecord.id,
            message,
          })
          .returning({ id: schema.kudosEntries.id });

        // Each entry mentions 1-2 users and/or 0-1 groups
        const numUserMentions = 1 + Math.floor(Math.random() * 2);
        const mentionedUserIds = pickN(
          userIds.filter((id) => id !== posterId),
          numUserMentions,
        );

        if (mentionedUserIds.length > 0) {
          await db.insert(schema.kudosEntryMentionedUsers).values(
            mentionedUserIds.map((userId) => ({
              kudosEntryId: entryRecord.id,
              userId,
            })),
          );
        }

        // 30% chance of also mentioning a group
        if (groupIds.length > 0 && Math.random() < 0.3) {
          const mentionedGroupId = pick(groupIds);
          await db.insert(schema.kudosEntryMentionedUsergroups).values({
            kudosEntryId: entryRecord.id,
            usergroupId: mentionedGroupId,
          });
        }

        entryCount++;
      }

      kudosCount++;
    }

    process.stdout.write(`\r  Inserted ${kudosCount} kudos messages (${entryCount} entries)...`);
  }

  console.log(`\n  Total: ${kudosCount} kudos messages, ${entryCount} entries`);
  console.log("Done!");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
