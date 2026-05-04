/**
 * Seed script: Insert dummy data for snippets UI testing.
 * - 200 users
 * - 100 usergroups
 * - Each user posts one snippet per week from 2025-03-03 to 2026-04-13 (every Monday)
 * - Each snippet mentions 1-3 random users and 0-2 random usergroups
 *
 * Usage: bun run scripts/seed-snippets.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/infrastructure/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://graphein:graphein@localhost:15432/graphein";

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

// --- Helpers ---

const firstNames = [
  "Yuki",
  "Hana",
  "Ren",
  "Sora",
  "Aoi",
  "Haruto",
  "Mei",
  "Riku",
  "Sakura",
  "Kaito",
  "Hinata",
  "Yuto",
  "Akari",
  "Sota",
  "Mio",
  "Takumi",
  "Rina",
  "Hayato",
  "Yui",
  "Daiki",
  "Emma",
  "Liam",
  "Olivia",
  "Noah",
  "Ava",
  "Ethan",
  "Sophia",
  "Mason",
  "Isabella",
  "Logan",
  "Mia",
  "Lucas",
  "Amelia",
  "Jack",
  "Harper",
  "Aiden",
  "Ella",
  "James",
  "Aria",
  "Benjamin",
  "Chen",
  "Wei",
  "Jing",
  "Min",
  "Hao",
  "Lin",
  "Yan",
  "Xiao",
  "Fei",
  "Zhi",
];

const lastNames = [
  "Tanaka",
  "Suzuki",
  "Takahashi",
  "Watanabe",
  "Ito",
  "Yamamoto",
  "Nakamura",
  "Kobayashi",
  "Saito",
  "Kato",
  "Yoshida",
  "Yamada",
  "Sasaki",
  "Matsumoto",
  "Inoue",
  "Kimura",
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Wang",
  "Li",
  "Zhang",
  "Liu",
  "Chen",
  "Yang",
  "Huang",
  "Zhou",
];

const groupNames = [
  "platform",
  "backend",
  "frontend",
  "mobile",
  "infra",
  "devops",
  "sre",
  "security",
  "data",
  "ml",
  "design",
  "product",
  "qa",
  "release",
  "docs",
  "support",
  "payments",
  "search",
  "auth",
  "notifications",
  "analytics",
  "billing",
  "onboarding",
  "growth",
  "core",
  "api",
  "sdk",
  "tools",
  "dx",
  "perf",
  "i18n",
  "a11y",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "omicron",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "chi",
  "psi",
  "omega",
  "north",
  "south",
  "east",
  "west",
  "central",
  "pacific",
  "atlantic",
  "arctic",
  "spring",
  "summer",
  "autumn",
  "winter",
  "dawn",
  "dusk",
  "noon",
  "midnight",
  "red",
  "blue",
  "green",
  "gold",
  "silver",
  "bronze",
  "purple",
  "cyan",
  "oak",
  "pine",
  "maple",
  "cedar",
  "birch",
  "elm",
  "ash",
  "willow",
  "hawk",
  "wolf",
  "bear",
  "fox",
  "eagle",
  "lion",
  "tiger",
  "falcon",
  "spark",
  "blaze",
  "storm",
  "frost",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// --- Monday dates from March 3 2025 to April 13 2026 ---
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

const snippetTemplates = [
  "今週の進捗:\n- feature Aの実装完了\n- コードレビュー3件\n- ドキュメント更新",
  "Weekly update:\n- Fixed critical bug in payment flow\n- Reviewed 5 PRs\n- Started work on new API endpoint",
  "今週やったこと:\n- テストカバレッジ80%達成\n- CI/CDパイプライン改善\n- チームMTGでアーキテクチャ議論",
  "Progress this week:\n- Deployed v2.3.0 to production\n- Migrated 3 services to new infra\n- Onboarded 2 new team members",
  "今週の報告:\n- パフォーマンス改善: レスポンスタイム30%短縮\n- セキュリティ監査対応\n- 次スプリントの計画",
  "This week:\n- Completed database migration\n- Added monitoring dashboards\n- Bug fixes for edge cases",
  "今週の活動:\n- 新機能の設計レビュー\n- ユーザーインタビュー3件\n- 競合分析レポート作成",
  "Weekly summary:\n- Refactored auth module\n- Added rate limiting\n- Updated dependencies",
];

async function main() {
  console.log("Seeding dummy data...");

  // 1. Create 200 users
  console.log("Creating 200 users...");
  const userRows: (typeof schema.users.$inferInsert)[] = [];
  for (let i = 0; i < 200; i++) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    userRows.push({
      slackUserId: `U_DUMMY_${String(i).padStart(4, "0")}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${i}@example.com`,
      displayName: `${first} ${last}`,
      avatarUrl: null,
      role: "user",
      locale: i % 3 === 0 ? "ja" : "en",
    });
  }

  const insertedUsers = await db
    .insert(schema.users)
    .values(userRows)
    .returning({ id: schema.users.id });
  const userIds = insertedUsers.map((u) => u.id);
  console.log(`  Inserted ${userIds.length} users`);

  // 2. Create 100 usergroups
  console.log("Creating 100 usergroups...");
  const groupRows: (typeof schema.usergroups.$inferInsert)[] = [];
  for (let i = 0; i < 100; i++) {
    const name = groupNames[i] ?? `team-${i}`;
    groupRows.push({
      slackUsergroupId: `S_DUMMY_${String(i).padStart(4, "0")}`,
      name: `${name}-team`,
      handle: name,
    });
  }

  const insertedGroups = await db
    .insert(schema.usergroups)
    .values(groupRows)
    .returning({ id: schema.usergroups.id });
  const groupIds = insertedGroups.map((g) => g.id);
  console.log(`  Inserted ${groupIds.length} usergroups`);

  // 3. Create snippets — each user posts every Monday
  const mondays = getMondayDates();
  console.log(`Creating snippets for ${userIds.length} users × ${mondays.length} weeks...`);

  let snippetCount = 0;
  let globalSnippetIdx = 0;
  const BATCH_SIZE = 500;

  // Process in batches to avoid overwhelming the DB
  for (let userStart = 0; userStart < userIds.length; userStart += 10) {
    const userBatch = userIds.slice(userStart, userStart + 10);

    const snippetRows: (typeof schema.snippets.$inferInsert)[] = [];
    const mentionUserRows: { snippetIdx: number; userId: string }[] = [];
    const mentionGroupRows: { snippetIdx: number; usergroupId: string }[] = [];

    for (const userId of userBatch) {
      for (const monday of mondays) {
        // Add some time jitter (0-8 hours)
        const postedAt = new Date(monday.getTime() + Math.random() * 8 * 60 * 60 * 1000);
        const idx = snippetRows.length;

        snippetRows.push({
          content: pick(snippetTemplates),
          postedAt,
          slackMessageTs: `${Math.floor(postedAt.getTime() / 1000)}.${String(globalSnippetIdx++).padStart(6, "0")}`,
          slackChannelId: "C_DUMMY_SNIPPETS",
          slackPermalink: null,
          postedById: userId,
        });

        // 1-3 random user mentions
        const mentionCount = 1 + Math.floor(Math.random() * 3);
        const mentionedUserIds = pickN(
          userIds.filter((id) => id !== userId),
          mentionCount,
        );
        for (const mentionedUserId of mentionedUserIds) {
          mentionUserRows.push({ snippetIdx: idx, userId: mentionedUserId });
        }

        // 0-2 random group mentions
        const groupMentionCount = Math.floor(Math.random() * 3);
        if (groupMentionCount > 0) {
          const mentionedGroupIds = pickN(groupIds, groupMentionCount);
          for (const mentionedGroupId of mentionedGroupIds) {
            mentionGroupRows.push({ snippetIdx: idx, usergroupId: mentionedGroupId });
          }
        }
      }
    }

    // Insert snippets in batches
    for (let i = 0; i < snippetRows.length; i += BATCH_SIZE) {
      const batch = snippetRows.slice(i, i + BATCH_SIZE);
      const inserted = await db
        .insert(schema.snippets)
        .values(batch)
        .returning({ id: schema.snippets.id });

      // Map snippet IDs to mention rows
      const mentionUserBatch: (typeof schema.snippetMentionedUsers.$inferInsert)[] = [];
      const mentionGroupBatch: (typeof schema.snippetMentionedUsergroups.$inferInsert)[] = [];

      for (let j = 0; j < inserted.length; j++) {
        const globalIdx = i + j;
        const snippetId = inserted[j].id;

        for (const m of mentionUserRows) {
          if (m.snippetIdx === globalIdx) {
            mentionUserBatch.push({ snippetId, userId: m.userId });
          }
        }
        for (const m of mentionGroupRows) {
          if (m.snippetIdx === globalIdx) {
            mentionGroupBatch.push({ snippetId, usergroupId: m.usergroupId });
          }
        }
      }

      if (mentionUserBatch.length > 0) {
        for (let k = 0; k < mentionUserBatch.length; k += BATCH_SIZE) {
          await db
            .insert(schema.snippetMentionedUsers)
            .values(mentionUserBatch.slice(k, k + BATCH_SIZE));
        }
      }
      if (mentionGroupBatch.length > 0) {
        for (let k = 0; k < mentionGroupBatch.length; k += BATCH_SIZE) {
          await db
            .insert(schema.snippetMentionedUsergroups)
            .values(mentionGroupBatch.slice(k, k + BATCH_SIZE));
        }
      }

      snippetCount += inserted.length;
    }

    process.stdout.write(`\r  Inserted ${snippetCount} snippets...`);
  }

  console.log(`\n  Total: ${snippetCount} snippets`);
  console.log("Done!");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
