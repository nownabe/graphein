/**
 * Seed the dev database with realistic demo data for demonstrations.
 *
 * Usage:
 *   bun run tools/seed-demo.ts          # Seed the dev database
 *   bun run tools/seed-demo.ts --clean   # Remove demo data only
 *
 * Idempotent: removes previous demo data before inserting.
 * Demo data is identified by slack_user_id prefix "UDEMO".
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { like, inArray } from "drizzle-orm";
import * as schema from "../src/infrastructure/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://graphein:graphein@localhost:15432/graphein";

const args = process.argv.slice(2);
const cleanOnly = args.includes("--clean");

const queryClient = postgres(DATABASE_URL);
const db = drizzle(queryClient, { schema });

const DEMO_SLACK_PREFIX = "UDEMO";

// --- Demo users ---

const demoUsers = [
  {
    slackUserId: "UDEMO001",
    email: "alice@example.com",
    displayName: "Alice Johnson",
    avatarUrl: "https://i.pravatar.cc/150?u=alice",
    role: "admin" as const,
    locale: "en" as const,
  },
  {
    slackUserId: "UDEMO002",
    email: "bob@example.com",
    displayName: "Bob Smith",
    avatarUrl: "https://i.pravatar.cc/150?u=bob",
    role: "user" as const,
    locale: "en" as const,
  },
  {
    slackUserId: "UDEMO003",
    email: "carol@example.com",
    displayName: "Carol Williams",
    avatarUrl: "https://i.pravatar.cc/150?u=carol",
    role: "user" as const,
    locale: "ja" as const,
  },
  {
    slackUserId: "UDEMO004",
    email: "dave@example.com",
    displayName: "Dave Chen",
    avatarUrl: "https://i.pravatar.cc/150?u=dave",
    role: "user" as const,
    locale: "en" as const,
  },
  {
    slackUserId: "UDEMO005",
    email: "erin@example.com",
    displayName: "Erin Tanaka",
    avatarUrl: "https://i.pravatar.cc/150?u=erin",
    role: "user" as const,
    locale: "ja" as const,
  },
];

// --- Demo tasks ---

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

const demoTasks = [
  {
    title: "Update onboarding documentation",
    description:
      "<@UDEMO001|Alice Johnson> could you update the onboarding docs? The current version is missing the new SSO setup steps. cc <@UDEMO002|Bob Smith>",
    archived: false,
    deadline: daysFromNow(7),
    slackMessageTs: "1700000001.000100",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000001000100",
    createdByIndex: 0, // Alice
    assigneeIndices: [1, 2], // Bob, Carol
    assigneeDone: [false, false],
    ownerIndices: [0], // Alice
  },
  {
    title: "Fix login redirect loop on mobile",
    description:
      "Users on iOS Safari are hitting an infinite redirect after OAuth callback. <@UDEMO003|Carol Williams> can you take a look? Seems related to the SameSite cookie changes.",
    archived: false,
    deadline: daysFromNow(2),
    slackMessageTs: "1700000002.000200",
    slackChannelId: "CDEMO02",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO02/p1700000002000200",
    createdByIndex: 1, // Bob
    assigneeIndices: [2], // Carol
    assigneeDone: [false],
    ownerIndices: [1], // Bob
  },
  {
    title: "Prepare Q3 metrics dashboard",
    description:
      "<@UDEMO004|Dave Chen> <@UDEMO005|Erin Tanaka> let's get the Q3 dashboard ready before the all-hands next week. I've shared the Figma mockup in <#CDEMO03>.",
    archived: false,
    deadline: daysFromNow(5),
    slackMessageTs: "1700000003.000300",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000003000300",
    createdByIndex: 0, // Alice
    assigneeIndices: [3, 4], // Dave, Erin
    assigneeDone: [true, false],
    ownerIndices: [0, 3], // Alice, Dave
  },
  {
    title: "Migrate staging DB to new cluster",
    description:
      "The staging Postgres cluster is being decommissioned end of month. <@UDEMO002|Bob Smith> please coordinate the migration with infra.",
    archived: false,
    deadline: daysFromNow(14),
    slackMessageTs: "1700000004.000400",
    slackChannelId: "CDEMO02",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO02/p1700000004000400",
    createdByIndex: 3, // Dave
    assigneeIndices: [1], // Bob
    assigneeDone: [false],
    ownerIndices: [3], // Dave
  },
  {
    title: "Add Japanese translations for settings page",
    description:
      "<@UDEMO005|Erin Tanaka> the settings page still shows English-only labels. Could you add the Japanese translations? The keys are in `src/i18n/messages.ts`.",
    archived: false,
    deadline: null,
    slackMessageTs: "1700000005.000500",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000005000500",
    createdByIndex: 2, // Carol
    assigneeIndices: [4], // Erin
    assigneeDone: [false],
    ownerIndices: [2], // Carol
  },
  {
    title: "Review and merge API rate limiting PR",
    description:
      "PR #42 adds rate limiting to the public API. <@UDEMO001|Alice Johnson> <@UDEMO003|Carol Williams> please review when you get a chance.",
    archived: false,
    deadline: daysFromNow(1),
    slackMessageTs: "1700000006.000600",
    slackChannelId: "CDEMO02",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO02/p1700000006000600",
    createdByIndex: 1, // Bob
    assigneeIndices: [0, 2], // Alice, Carol
    assigneeDone: [true, false],
    ownerIndices: [1], // Bob
  },
  {
    title: "Set up monitoring alerts for new endpoints",
    description:
      "We shipped three new API endpoints last week but forgot to add Datadog monitors. <@UDEMO004|Dave Chen> can you set those up?",
    archived: false,
    deadline: daysAgo(1), // overdue
    slackMessageTs: "1700000007.000700",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000007000700",
    createdByIndex: 0, // Alice
    assigneeIndices: [3], // Dave
    assigneeDone: [false],
    ownerIndices: [0], // Alice
  },
  // Completed tasks (all assignees done)
  {
    title: "Upgrade Node.js to v22 LTS",
    description:
      "Time to upgrade our runtime. <@UDEMO002|Bob Smith> has volunteered to handle the upgrade and fix any breaking changes.",
    archived: false,
    deadline: daysAgo(3),
    slackMessageTs: "1700000008.000800",
    slackChannelId: "CDEMO02",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO02/p1700000008000800",
    createdByIndex: 0, // Alice
    assigneeIndices: [1], // Bob
    assigneeDone: [true],
    ownerIndices: [0], // Alice
  },
  {
    title: "Write integration tests for Slack webhook handler",
    description:
      "<@UDEMO003|Carol Williams> <@UDEMO005|Erin Tanaka> the webhook handler has zero test coverage. Let's fix that before we ship the next release.",
    archived: false,
    deadline: daysAgo(5),
    slackMessageTs: "1700000009.000900",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000009000900",
    createdByIndex: 1, // Bob
    assigneeIndices: [2, 4], // Carol, Erin
    assigneeDone: [true, true],
    ownerIndices: [1], // Bob
  },
  // Archived tasks
  {
    title: "Remove deprecated v1 API endpoints",
    description:
      "The v1 endpoints have been deprecated for 6 months. Let's finally remove them. <@UDEMO001|Alice Johnson> <@UDEMO002|Bob Smith>",
    archived: true,
    deadline: daysAgo(30),
    slackMessageTs: "1700000010.001000",
    slackChannelId: "CDEMO02",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO02/p1700000010001000",
    createdByIndex: 3, // Dave
    assigneeIndices: [0, 1], // Alice, Bob
    assigneeDone: [true, true],
    ownerIndices: [3], // Dave
  },
  {
    title: "Investigate memory leak in background worker",
    description:
      "The worker process RSS grows ~50MB/day. <@UDEMO004|Dave Chen> tracked it down to an event listener leak in the message queue consumer.",
    archived: true,
    deadline: daysAgo(20),
    slackMessageTs: "1700000011.001100",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000011001100",
    createdByIndex: 0, // Alice
    assigneeIndices: [3], // Dave
    assigneeDone: [true],
    ownerIndices: [0, 3], // Alice, Dave
  },
  {
    title: "Design system color token audit",
    description:
      "We have 47 one-off hex colors in the codebase. <@UDEMO005|Erin Tanaka> consolidated them into the design token system.",
    archived: true,
    deadline: daysAgo(15),
    slackMessageTs: "1700000012.001200",
    slackChannelId: "CDEMO01",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO01/p1700000012001200",
    createdByIndex: 2, // Carol
    assigneeIndices: [4], // Erin
    assigneeDone: [true],
    ownerIndices: [2], // Carol
  },
];

// --- Demo snippets ---

const demoSnippets = [
  {
    content:
      "Today I finished the API rate limiting implementation and opened PR #42 for review. Also started looking into the mobile redirect issue — might be related to SameSite cookie defaults in iOS 17.",
    postedAt: daysAgo(1),
    slackMessageTs: "1700100001.000100",
    slackChannelId: "CDEMO03",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO03/p1700100001000100",
    postedByIndex: 1, // Bob
    mentionedUserIndices: [0, 2], // Alice, Carol
  },
  {
    content:
      "Wrapped up the Japanese translations for the main navigation and task list pages. Settings page translations are next — will finish by end of week.",
    postedAt: daysAgo(1),
    slackMessageTs: "1700100002.000200",
    slackChannelId: "CDEMO03",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO03/p1700100002000200",
    postedByIndex: 4, // Erin
    mentionedUserIndices: [2], // Carol
  },
  {
    content:
      "Q3 dashboard — got the revenue and user growth charts wired up. Still need to add the retention cohort view. <@UDEMO005|Erin Tanaka> and I will pair on it tomorrow.",
    postedAt: daysAgo(2),
    slackMessageTs: "1700100003.000300",
    slackChannelId: "CDEMO03",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO03/p1700100003000300",
    postedByIndex: 3, // Dave
    mentionedUserIndices: [4], // Erin
  },
];

// --- Demo kudos ---

const demoKudos = [
  {
    slackMessageTs: "1700200001.000100",
    slackChannelId: "CDEMO04",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO04/p1700200001000100",
    postedAt: daysAgo(2),
    postedByIndex: 0, // Alice
    entries: [
      {
        message:
          "Huge shoutout to <@UDEMO002|Bob Smith> for the thorough rate limiting implementation — clean code, great test coverage, and solid documentation :tada:",
        mentionedUserIndices: [1], // Bob
      },
    ],
  },
  {
    slackMessageTs: "1700200002.000200",
    slackChannelId: "CDEMO04",
    slackPermalink: "https://demo-workspace.slack.com/archives/CDEMO04/p1700200002000200",
    postedAt: daysAgo(1),
    postedByIndex: 1, // Bob
    entries: [
      {
        message:
          "Thanks <@UDEMO003|Carol Williams> for jumping on the mobile redirect bug so quickly — users were really feeling that one :pray:",
        mentionedUserIndices: [2], // Carol
      },
      {
        message:
          "Also kudos to <@UDEMO005|Erin Tanaka> for the i18n work — the Japanese translations look great :sparkles:",
        mentionedUserIndices: [4], // Erin
      },
    ],
  },
];

// --- Seed logic ---

async function cleanDemoData() {
  console.log("Cleaning previous demo data...");

  // Find demo user IDs
  const demoUserRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(like(schema.users.slackUserId, `${DEMO_SLACK_PREFIX}%`));

  if (demoUserRows.length === 0) {
    console.log("  No demo data found.");
    return;
  }

  const userIds = demoUserRows.map((u) => u.id);

  // Delete tasks created by demo users (cascade handles assignees/owners)
  const deletedTasks = await db
    .delete(schema.tasks)
    .where(inArray(schema.tasks.createdById, userIds));
  console.log(`  Deleted ${deletedTasks.count} tasks`);

  // Delete snippets posted by demo users (cascade handles mentions)
  const deletedSnippets = await db
    .delete(schema.snippets)
    .where(inArray(schema.snippets.postedById, userIds));
  console.log(`  Deleted ${deletedSnippets.count} snippets`);

  // Delete kudos posted by demo users (cascade handles entries and mentions)
  const deletedKudos = await db
    .delete(schema.kudos)
    .where(inArray(schema.kudos.postedById, userIds));
  console.log(`  Deleted ${deletedKudos.count} kudos`);

  // Delete demo users
  const deletedUsers = await db
    .delete(schema.users)
    .where(like(schema.users.slackUserId, `${DEMO_SLACK_PREFIX}%`));
  console.log(`  Deleted ${deletedUsers.count} users`);
}

async function seedDemoData() {
  // Insert users
  console.log("Inserting demo users...");
  const insertedUsers = await db
    .insert(schema.users)
    .values(demoUsers)
    .returning({ id: schema.users.id });
  const userIds = insertedUsers.map((u) => u.id);
  console.log(`  Inserted ${userIds.length} users`);

  // Insert tasks
  console.log("Inserting demo tasks...");
  for (const task of demoTasks) {
    const [insertedTask] = await db
      .insert(schema.tasks)
      .values({
        title: task.title,
        description: task.description,
        archived: task.archived,
        deadline: task.deadline,
        slackMessageTs: task.slackMessageTs,
        slackChannelId: task.slackChannelId,
        slackPermalink: task.slackPermalink,
        createdById: userIds[task.createdByIndex],
      })
      .returning({ id: schema.tasks.id });

    // Insert assignees
    if (task.assigneeIndices.length > 0) {
      await db.insert(schema.taskAssignees).values(
        task.assigneeIndices.map((idx, i) => ({
          taskId: insertedTask.id,
          userId: userIds[idx],
          done: task.assigneeDone[i],
        })),
      );
    }

    // Insert owners
    if (task.ownerIndices.length > 0) {
      await db.insert(schema.taskOwners).values(
        task.ownerIndices.map((idx) => ({
          taskId: insertedTask.id,
          userId: userIds[idx],
        })),
      );
    }
  }
  console.log(`  Inserted ${demoTasks.length} tasks with assignees and owners`);

  // Insert snippets
  console.log("Inserting demo snippets...");
  for (const snip of demoSnippets) {
    const [insertedSnippet] = await db
      .insert(schema.snippets)
      .values({
        content: snip.content,
        postedAt: snip.postedAt,
        slackMessageTs: snip.slackMessageTs,
        slackChannelId: snip.slackChannelId,
        slackPermalink: snip.slackPermalink,
        postedById: userIds[snip.postedByIndex],
      })
      .returning({ id: schema.snippets.id });

    if (snip.mentionedUserIndices.length > 0) {
      await db.insert(schema.snippetMentionedUsers).values(
        snip.mentionedUserIndices.map((idx) => ({
          snippetId: insertedSnippet.id,
          userId: userIds[idx],
        })),
      );
    }
  }
  console.log(`  Inserted ${demoSnippets.length} snippets`);

  // Insert kudos
  console.log("Inserting demo kudos...");
  for (const k of demoKudos) {
    const [insertedKudos] = await db
      .insert(schema.kudos)
      .values({
        slackMessageTs: k.slackMessageTs,
        slackChannelId: k.slackChannelId,
        slackPermalink: k.slackPermalink,
        postedAt: k.postedAt,
        postedById: userIds[k.postedByIndex],
      })
      .returning({ id: schema.kudos.id });

    for (const entry of k.entries) {
      const [insertedEntry] = await db
        .insert(schema.kudosEntries)
        .values({
          kudosId: insertedKudos.id,
          message: entry.message,
        })
        .returning({ id: schema.kudosEntries.id });

      if (entry.mentionedUserIndices.length > 0) {
        await db.insert(schema.kudosEntryMentionedUsers).values(
          entry.mentionedUserIndices.map((idx) => ({
            kudosEntryId: insertedEntry.id,
            userId: userIds[idx],
          })),
        );
      }
    }
  }
  console.log(`  Inserted ${demoKudos.length} kudos`);
}

// --- Main ---

try {
  await cleanDemoData();

  if (!cleanOnly) {
    await seedDemoData();
    console.log("\nDemo data seeded successfully!");
  } else {
    console.log("\nDemo data cleaned.");
  }
} catch (err) {
  console.error("Seed failed:", (err as Error).message);
  process.exit(1);
} finally {
  await queryClient.end();
}
